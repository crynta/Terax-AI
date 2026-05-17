// Bootstrap is Android-only: it extracts the proot binary + Alpine rootfs from
// app resources on first run. It also pulls in `std::os::unix::fs::PermissionsExt`,
// which would fail to compile on Windows.
#[cfg(target_os = "android")]
mod bootstrap;
mod modules;

use modules::{fs, git, net, pty, secrets, shell, workspace};
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
        .manage(secrets::SecretsState::default())
        .manage({
            let registry = workspace::WorkspaceRegistry::default();
            workspace::bootstrap_registry(&registry);
            registry
        })
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
            git::commands::git_resolve_repo,
            git::commands::git_panel_snapshot,
            git::commands::git_status,
            git::commands::git_diff,
            git::commands::git_diff_content,
            git::commands::git_stage,
            git::commands::git_unstage,
            git::commands::git_discard,
            git::commands::git_commit,
            git::commands::git_fetch,
            git::commands::git_pull_ff_only,
            git::commands::git_push,
            git::commands::git_log,
            git::commands::git_show_commit,
            git::commands::git_commit_files,
            git::commands::git_commit_file_diff,
            git::commands::git_remote_url,
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
            workspace::workspace_authorize,
            workspace::workspace_current_dir,
            open_settings_window,
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
