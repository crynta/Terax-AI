// Bootstrap is Android-only: it extracts the proot binary + Alpine rootfs from
// app resources on first run. It also pulls in `std::os::unix::fs::PermissionsExt`,
// which would fail to compile on Windows.
#[cfg(target_os = "android")]
mod bootstrap;
mod modules;

use modules::{fs, net, pty, secrets, shell, workspace};

// ── Settings window (desktop only — Android has no multi-window) ─────────────
// `Emitter` / `Manager` / `WebviewUrl` / `WebviewWindowBuilder` are only used
// by this function, so we import them inside the cfg block to avoid
// unused-import warnings when compiling for Android.
#[cfg(not(target_os = "android"))]
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

#[cfg(not(target_os = "android"))]
#[tauri::command]
async fn open_settings_window(app: tauri::AppHandle, tab: Option<String>) -> Result<(), String> {
    let url_path = match tab.as_deref() {
        Some(t) if !t.is_empty() => format!("settings.html?tab={}", t),
        _ => "settings.html".to_string(),
    };

    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.set_focus();
        if let Some(t) = tab.as_deref().filter(|s| !s.is_empty()) {
            let _ = window.emit("terax:settings-tab", t);
        }
        return Ok(());
    }

    let mut builder =
        WebviewWindowBuilder::new(&app, "settings", WebviewUrl::App(url_path.into()))
            .title("Settings")
            .inner_size(720.0, 520.0)
            .min_inner_size(720.0, 520.0)
            .max_inner_size(720.0, 520.0)
            .resizable(false)
            .visible(false)
            .always_on_top(true);

    if let Some(main) = app.get_webview_window("main") {
        builder = builder.parent(&main).map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true);

    #[cfg(any(target_os = "linux", target_os = "windows"))]
    let builder = builder.decorations(false).transparent(true);

    let window = builder.build().map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    {
        let _ = window.set_decorations(false);
    }
    let _ = window;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .manage(pty::PtyState::default())
        .manage(shell::ShellState::default())
        .manage(secrets::SecretsState::default());

    // ── Desktop-only plugins ──────────────────────────────────────────────────
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(
                tauri_plugin_window_state::Builder::new()
                    .with_state_flags(
                        tauri_plugin_window_state::StateFlags::all()
                            & !tauri_plugin_window_state::StateFlags::VISIBLE,
                    )
                    .build(),
            )
            .plugin(tauri_plugin_autostart::Builder::new().build());
    }

    builder
        .invoke_handler(tauri::generate_handler![
            // ── PTY ────────────────────────────────────────────────────────────
            pty::pty_open,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_close,
            // ── Filesystem ────────────────────────────────────────────────────
            fs::tree::list_subdirs,
            fs::tree::fs_read_dir,
            fs::file::fs_read_file,
            fs::file::fs_write_file,
            fs::file::fs_stat,
            fs::file::fs_canonicalize,
            fs::mutate::fs_create_file,
            fs::mutate::fs_create_dir,
            fs::mutate::fs_rename,
            fs::mutate::fs_delete,
            fs::search::fs_search,
            fs::search::fs_list_files,
            fs::grep::fs_grep,
            fs::grep::fs_glob,
            // ── Shell ─────────────────────────────────────────────────────────
            shell::shell_run_command,
            shell::shell_session_open,
            shell::shell_session_run,
            shell::shell_session_close,
            shell::shell_bg_spawn,
            shell::shell_bg_logs,
            shell::shell_bg_kill,
            shell::shell_bg_list,
            // ── WSL (compiles cross-platform; returns empty on non-Windows) ───
            workspace::wsl_list_distros,
            workspace::wsl_default_distro,
            workspace::wsl_home,
            // ── Secrets ───────────────────────────────────────────────────────
            secrets::secrets_get,
            secrets::secrets_set,
            secrets::secrets_delete,
            secrets::secrets_get_all,
            // ── Network ───────────────────────────────────────────────────────
            net::lm_ping,
            net::ai_http_request,
            net::ai_http_stream,
            // ── Settings window (desktop only) ────────────────────────────────
            #[cfg(not(target_os = "android"))]
            open_settings_window,
            // ── Android bootstrap ─────────────────────────────────────────────
            #[cfg(target_os = "android")]
            bootstrap::bootstrap_android,
            #[cfg(target_os = "android")]
            bootstrap::bootstrap_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
