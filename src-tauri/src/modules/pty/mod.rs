// ── Android PTY (nix + proot) ─────────────────────────────────────────────────
#[cfg(target_os = "android")]
mod android;
#[cfg(target_os = "android")]
pub use android::{pty_close, pty_open, pty_resize, pty_write, PtyState};

// ── Desktop PTY (portable-pty) ────────────────────────────────────────────────
#[cfg(not(target_os = "android"))]
mod da_filter;
#[cfg(all(not(target_os = "android"), windows))]
mod job;
#[cfg(not(target_os = "android"))]
mod session;
#[cfg(not(target_os = "android"))]
pub(crate) mod shell_init;

#[cfg(not(target_os = "android"))]
mod desktop {
    use std::collections::HashMap;
    use std::io::Write;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::{Arc, RwLock};
    use std::thread;

    use portable_pty::PtySize;
    use tauri::ipc::{Channel, Response};

    use crate::modules::workspace::WorkspaceEnv;
    use super::session::Session;

    pub struct PtyState {
        sessions: RwLock<HashMap<u32, Arc<Session>>>,
        next_id: AtomicU32,
    }

    impl Default for PtyState {
        fn default() -> Self {
            Self {
                sessions: RwLock::new(HashMap::new()),
                next_id: AtomicU32::new(1),
            }
        }
    }

    #[tauri::command]
    pub fn pty_open(
        state: tauri::State<PtyState>,
        cols: u16,
        rows: u16,
        cwd: Option<String>,
        workspace: Option<WorkspaceEnv>,
        on_data: Channel<Response>,
        on_exit: Channel<i32>,
    ) -> Result<u32, String> {
        let workspace = WorkspaceEnv::from_option(workspace);
        let (session, _) =
            super::session::spawn(cols, rows, cwd, workspace, on_data, on_exit).map_err(|e| {
                log::error!("pty_open failed: {e}");
                e
            })?;
        let id = state.next_id.fetch_add(1, Ordering::Relaxed);
        state.sessions.write().unwrap().insert(id, session);
        log::info!("pty opened id={id} cols={cols} rows={rows}");
        Ok(id)
    }

    #[tauri::command]
    pub fn pty_write(
        state: tauri::State<PtyState>,
        id: u32,
        data: String,
    ) -> Result<(), String> {
        let session = state
            .sessions
            .read()
            .unwrap()
            .get(&id)
            .cloned()
            .ok_or_else(|| {
                log::warn!("pty_write: unknown id={id}");
                "no session".to_string()
            })?;
        let result = session
            .writer
            .lock()
            .unwrap()
            .write_all(data.as_bytes())
            .map_err(|e| {
                log::debug!("pty_write id={id} failed: {e}");
                e.to_string()
            });
        result
    }

    #[tauri::command]
    pub fn pty_resize(
        state: tauri::State<PtyState>,
        id: u32,
        cols: u16,
        rows: u16,
    ) -> Result<(), String> {
        let session = state
            .sessions
            .read()
            .unwrap()
            .get(&id)
            .cloned()
            .ok_or_else(|| {
                log::warn!("pty_resize: unknown id={id}");
                "no session".to_string()
            })?;
        let result = session
            .master
            .lock()
            .unwrap()
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| {
                log::warn!("pty_resize id={id} failed: {e}");
                e.to_string()
            });
        result
    }

    #[tauri::command]
    pub fn pty_close(state: tauri::State<PtyState>, id: u32) -> Result<(), String> {
        let session = state.sessions.write().unwrap().remove(&id);
        if let Some(s) = session {
            if let Err(e) = s.killer.lock().unwrap().kill() {
                log::debug!("pty_close: kill id={id} returned {e}");
            }
            log::info!("pty closed id={id}");
            thread::Builder::new()
                .name(format!("terax-pty-drop-{id}"))
                .spawn(move || {
                    let t0 = std::time::Instant::now();
                    drop(s);
                    log::info!(
                        "pty session id={id} dropped in {}ms",
                        t0.elapsed().as_millis()
                    );
                })
                .expect("spawn pty drop thread");
        } else {
            log::debug!("pty_close: unknown id={id}");
        }
        Ok(())
    }
}

#[cfg(not(target_os = "android"))]
pub use desktop::{pty_close, pty_open, pty_resize, pty_write, PtyState};
