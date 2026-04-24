use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use portable_pty::{native_pty_system, ChildKiller, MasterPty, PtySize};
use serde::Serialize;
use tauri::ipc::Channel;

use super::shell_init;

const FLUSH_INTERVAL: Duration = Duration::from_millis(8);
const READ_BUF: usize = 16 * 1024;
// Cap on buffered-but-not-yet-flushed bytes. On overflow we drop from the
// front (oldest output) to keep memory bounded under runaway producers
// (e.g. `yes`, fast `find /`). 4 MiB is ~1000 full 80x24 screens.
const MAX_PENDING: usize = 4 * 1024 * 1024;

#[derive(Serialize, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum PtyEvent {
    Data { data: String },
    Exit { code: i32 },
}

pub struct Session {
    pub master: Mutex<Box<dyn MasterPty + Send>>,
    pub writer: Mutex<Box<dyn Write + Send>>,
    pub killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
}

pub fn spawn(
    cols: u16,
    rows: u16,
    cwd: Option<String>,
    on_event: Channel<PtyEvent>,
) -> Result<(Arc<Session>, PtySize), String> {
    let pty_system = native_pty_system();
    let size = PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    };
    let pair = pty_system.openpty(size).map_err(|e| e.to_string())?;

    let cmd = shell_init::build_command(cwd)?;
    let mut child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);

    let killer = child.clone_killer();
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let session = Arc::new(Session {
        master: Mutex::new(pair.master),
        writer: Mutex::new(writer),
        killer: Mutex::new(killer),
    });

    let pending: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(Vec::with_capacity(READ_BUF)));
    let done = Arc::new(AtomicBool::new(false));

    let pending_r = pending.clone();
    let reader_thread = thread::Builder::new()
        .name("terax-pty-reader".into())
        .spawn(move || {
            let mut buf = [0u8; READ_BUF];
            let mut dropped_bytes: u64 = 0;
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let mut g = pending_r.lock().unwrap();
                        let overflow = (g.len() + n).saturating_sub(MAX_PENDING);
                        if overflow > 0 {
                            let drop_n = overflow.min(g.len());
                            g.drain(..drop_n);
                            dropped_bytes += drop_n as u64;
                        }
                        g.extend_from_slice(&buf[..n]);
                    }
                    Err(e) => {
                        // Normal on child exit: the slave fd is closed and
                        // read(2) returns EIO on some platforms. Kept at debug
                        // to avoid noise in the common case.
                        log::debug!("pty reader ended: {e}");
                        break;
                    }
                }
            }
            if dropped_bytes > 0 {
                log::warn!("pty backpressure: dropped {dropped_bytes} bytes (cap {MAX_PENDING})");
            }
        })
        .expect("spawn pty reader thread");

    let on_event_flush = on_event.clone();
    let pending_f = pending.clone();
    let done_f = done.clone();
    thread::Builder::new()
        .name("terax-pty-flusher".into())
        .spawn(move || loop {
            thread::sleep(FLUSH_INTERVAL);
            let chunk = {
                let mut g = pending_f.lock().unwrap();
                if g.is_empty() {
                    if done_f.load(Ordering::Acquire) {
                        break;
                    }
                    continue;
                }
                std::mem::take(&mut *g)
            };
            // NOTE on base64: Tauri v2 `Channel<T>` serializes via JSON;
            // `Vec<u8>` would become a JSON int array (~3× worse than base64).
            // A raw-bytes path via `InvokeResponseBody::Raw` exists but the
            // data+exit multiplex through one channel is awkward. Base64's 33%
            // overhead is trivial on local IPC — revisit if profiling says
            // otherwise.
            let event = PtyEvent::Data {
                data: B64.encode(&chunk),
            };
            if let Err(e) = on_event_flush.send(event) {
                log::debug!("pty flusher exiting, channel closed: {e}");
                break;
            }
        })
        .expect("spawn pty flusher thread");

    let on_event_exit = on_event;
    let pending_e = pending;
    let done_e = done;
    thread::Builder::new()
        .name("terax-pty-waiter".into())
        .spawn(move || {
            let code = match child.wait() {
                Ok(status) => status.exit_code() as i32,
                Err(e) => {
                    log::warn!("pty child wait failed: {e}");
                    -1
                }
            };
            // Wait for the reader to hit EOF before taking a final snapshot of
            // `pending`, so the last line of output never races the Exit event.
            if let Err(e) = reader_thread.join() {
                log::error!("pty reader thread panicked: {e:?}");
            }
            let tail = std::mem::take(&mut *pending_e.lock().unwrap());
            if !tail.is_empty() {
                if let Err(e) = on_event_exit.send(PtyEvent::Data {
                    data: B64.encode(&tail),
                }) {
                    log::debug!("pty final-data send failed (channel closed): {e}");
                }
            }
            done_e.store(true, Ordering::Release);
            if let Err(e) = on_event_exit.send(PtyEvent::Exit { code }) {
                log::debug!("pty exit send failed (channel closed): {e}");
            }
        })
        .expect("spawn pty waiter thread");

    Ok((session, size))
}
