use std::path::PathBuf;

use portable_pty::CommandBuilder;

use crate::modules::workspace::WorkspaceEnv;

#[cfg(windows)]
const BASHRC_SCRIPT: &str = include_str!("scripts/bashrc.bash");

#[cfg(windows)]
const ZSHENV_SCRIPT: &str = include_str!("scripts/zshenv.zsh");

#[cfg(windows)]
const ZPROFILE_SCRIPT: &str = include_str!("scripts/zprofile.zsh");

#[cfg(windows)]
const ZLOGIN_SCRIPT: &str = include_str!("scripts/zlogin.zsh");

#[cfg(windows)]
const ZSHRC_SCRIPT: &str = include_str!("scripts/zshrc.zsh");

#[cfg(windows)]
const FISH_INIT_SCRIPT: &str = include_str!("scripts/init.fish");

#[cfg(windows)]
fn bashrc_script() -> &'static str {
    BASHRC_SCRIPT
}

#[cfg(windows)]
fn zshenv_script() -> &'static str {
    ZSHENV_SCRIPT
}

#[cfg(windows)]
fn zprofile_script() -> &'static str {
    ZPROFILE_SCRIPT
}

#[cfg(windows)]
fn zlogin_script() -> &'static str {
    ZLOGIN_SCRIPT
}

#[cfg(windows)]
fn zshrc_script() -> &'static str {
    ZSHRC_SCRIPT
}

#[cfg(windows)]
fn fish_init_script() -> &'static str {
    FISH_INIT_SCRIPT
}

pub fn build_command(
    cwd: Option<String>,
    workspace: WorkspaceEnv,
) -> Result<CommandBuilder, String> {
    #[cfg(unix)]
    {
        let _ = workspace;
        unix::build(cwd)
    }
    #[cfg(windows)]
    {
        windows::build(cwd, workspace)
    }
}

fn ensure_utf8_locale(cmd: &mut CommandBuilder) {
    let is_utf8 = |v: &str| {
        let up = v.to_ascii_uppercase();
        up.contains("UTF-8") || up.contains("UTF8")
    };
    let already_utf8 = ["LC_ALL", "LC_CTYPE", "LANG"]
        .iter()
        .any(|k| std::env::var(k).ok().as_deref().is_some_and(is_utf8));
    if already_utf8 {
        return;
    }
    #[cfg(target_os = "macos")]
    let fallback = "en_US.UTF-8";
    #[cfg(all(unix, not(target_os = "macos")))]
    let fallback = "C.UTF-8";
    #[cfg(windows)]
    let fallback = "en_US.UTF-8";
    cmd.env("LANG", fallback);
}

fn apply_common(cmd: &mut CommandBuilder, cwd: Option<String>) {
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERAX_TERMINAL", "1");
    ensure_utf8_locale(cmd);

    let resolved_cwd = cwd
        .map(PathBuf::from)
        .filter(|p| p.is_dir())
        // In `tauri dev`, inherit the repo cwd so explorer/source-control
        // point at the project the user launched from instead of `$HOME`.
        .or_else(|| std::env::current_dir().ok().filter(|p| p.is_dir()))
        .or_else(|| dirs::home_dir().filter(|p| p.is_dir()));
    if let Some(cwd) = resolved_cwd {
        #[cfg(windows)]
        let cwd = PathBuf::from(cwd.to_string_lossy().replace('/', "\\"));
        log::info!("pty cwd: {}", cwd.display());
        cmd.cwd(cwd);
    } else {
        log::warn!("pty cwd: no usable directory, inheriting from process");
    }
}

#[cfg(unix)]
mod unix {
    use std::ffi::OsString;
    use std::fs;
    use std::path::{Path, PathBuf};

    use portable_pty::CommandBuilder;

    const ZSHENV: &str = include_str!("scripts/zshenv.zsh");
    const ZPROFILE: &str = include_str!("scripts/zprofile.zsh");
    const ZLOGIN: &str = include_str!("scripts/zlogin.zsh");
    const ZSHRC: &str = include_str!("scripts/zshrc.zsh");
    const BASHRC: &str = include_str!("scripts/bashrc.bash");
    const FISH_INIT: &str = include_str!("scripts/init.fish");

    pub enum Shell {
        Zsh,
        Bash,
        Fish,
        Other,
    }

    impl Shell {
        pub fn detect() -> (Shell, String) {
            let path = login_shell()
                .or_else(|| std::env::var("SHELL").ok())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "/bin/zsh".into());
            let name = path.rsplit('/').next().unwrap_or("").to_string();
            let shell = match name.as_str() {
                "zsh" => Shell::Zsh,
                "bash" => Shell::Bash,
                "fish" => Shell::Fish,
                _ => Shell::Other,
            };
            (shell, path)
        }
    }

    fn login_shell() -> Option<String> {
        use std::ffi::CStr;
        unsafe {
            let uid = libc::getuid();
            let pw = libc::getpwuid(uid);
            if pw.is_null() {
                return None;
            }
            let shell_ptr = (*pw).pw_shell;
            if shell_ptr.is_null() {
                return None;
            }
            CStr::from_ptr(shell_ptr).to_str().ok().map(String::from)
        }
    }

    pub fn build(cwd: Option<String>) -> Result<CommandBuilder, String> {
        let (shell, shell_path) = Shell::detect();
        let mut cmd = CommandBuilder::new(&shell_path);
        super::apply_common(&mut cmd, cwd);

        match shell {
            Shell::Zsh => {
                match prepare_zdotdir() {
                    Ok(zdotdir) => {
                        // Guard against Terax-in-Terax :)
                        if let Ok(user_zd) = std::env::var("ZDOTDIR") {
                            if Path::new(&user_zd) != zdotdir.as_path() {
                                cmd.env("TERAX_USER_ZDOTDIR", user_zd);
                            }
                        }
                        cmd.env("ZDOTDIR", &zdotdir);
                    }
                    Err(e) => {
                        log::warn!("zsh shell integration disabled: {e}");
                    }
                }
                // Login shell so /etc/zprofile runs path_helper on macOS — without
                // this, GUI-launched apps get a minimal PATH missing Homebrew.
                cmd.arg("-l");
            }
            Shell::Bash => {
                match prepare_bash_rcfile() {
                    Ok(rc) => {
                        cmd.arg("--rcfile");
                        cmd.arg(rc);
                    }
                    Err(e) => {
                        log::warn!("bash shell integration disabled: {e}");
                    }
                }
                // bash ignores --rcfile under -l, so we use -i and source
                // /etc/profile from inside our rcfile to emulate login init.
                cmd.arg("-i");
            }
            Shell::Fish => {
                match prepare_fish_init() {
                    Ok(init) => {
                        cmd.arg("--init-command");
                        cmd.arg(format!("source {}", shell_quote(&init)));
                    }
                    Err(e) => {
                        log::warn!("fish shell integration disabled: {e}");
                    }
                }
                cmd.arg("-i");
            }
            Shell::Other => {
                log::info!(
                    "unsupported shell '{}', spawning without integration",
                    shell_path
                );
            }
        }
        Ok(cmd)
    }

    fn shell_quote(p: &Path) -> String {
        let s = p.to_string_lossy();
        format!("'{}'", s.replace('\'', "'\\''"))
    }

    fn integration_root() -> Result<PathBuf, String> {
        let home = dirs::home_dir().ok_or_else(|| "could not resolve home dir".to_string())?;
        let root = home.join(".cache").join("terax").join("shell-integration");
        fs::create_dir_all(&root).map_err(|e| format!("create {}: {e}", root.display()))?;
        Ok(root)
    }

    fn prepare_zdotdir() -> Result<PathBuf, String> {
        let dir = integration_root()?.join("zsh");
        fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
        write_if_changed(&dir.join(".zshenv"), ZSHENV)?;
        write_if_changed(&dir.join(".zprofile"), ZPROFILE)?;
        write_if_changed(&dir.join(".zshrc"), ZSHRC)?;
        write_if_changed(&dir.join(".zlogin"), ZLOGIN)?;
        Ok(dir)
    }

    fn prepare_bash_rcfile() -> Result<PathBuf, String> {
        let dir = integration_root()?.join("bash");
        fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
        let rc = dir.join("bashrc");
        write_if_changed(&rc, BASHRC)?;
        Ok(rc)
    }

    fn prepare_fish_init() -> Result<PathBuf, String> {
        let dir = integration_root()?.join("fish");
        fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
        let init = dir.join("init.fish");
        write_if_changed(&init, FISH_INIT)?;
        Ok(init)
    }

    fn write_if_changed(path: &Path, content: &str) -> Result<(), String> {
        if let Ok(existing) = fs::read_to_string(path) {
            if existing == content {
                return Ok(());
            }
        }
        // Atomic replace: a parallel shell startup must never source a half-written file.
        let mut tmp: OsString = path.as_os_str().to_owned();
        tmp.push(".__terax_tmp__");
        let tmp = PathBuf::from(tmp);
        fs::write(&tmp, content).map_err(|e| format!("write {}: {e}", tmp.display()))?;
        fs::rename(&tmp, path).map_err(|e| {
            let _ = fs::remove_file(&tmp);
            format!("rename {} -> {}: {e}", tmp.display(), path.display())
        })
    }
}

#[cfg(windows)]
mod windows {
    use std::ffi::OsString;
    use std::fs;
    use std::path::{Path, PathBuf};

    use crate::modules::workspace::WorkspaceEnv;
    use crate::modules::workspace::{WslShellResolution, WslShellSource};
    use portable_pty::CommandBuilder;

    const PROFILE_PS1: &str = include_str!("scripts/profile.ps1");
    const DEFAULT_WSL_CWD: &str = "~";

    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    enum ShellKind {
        Zsh,
        Bash,
        Fish,
        Other,
    }

    #[derive(Clone, Debug, PartialEq, Eq)]
    enum WslIntegration {
        Zsh { zdotdir: String },
        Bash { rcfile: String },
        Fish { init: String },
        None,
    }

    pub fn build(cwd: Option<String>, workspace: WorkspaceEnv) -> Result<CommandBuilder, String> {
        if let WorkspaceEnv::Wsl { distro } = workspace {
            return build_wsl(cwd, distro);
        }
        let shell_path = super::windows_shell_path();
        let shell_name = shell_path
            .file_name()
            .and_then(|s| s.to_str())
            .map(|s| s.to_ascii_lowercase())
            .unwrap_or_default();
        let is_powershell = shell_name == "pwsh.exe" || shell_name == "powershell.exe";

        let mut cmd = CommandBuilder::new(&shell_path);
        super::apply_common(&mut cmd, cwd);

        if is_powershell {
            match prepare_ps_profile() {
                Ok(profile) => {
                    cmd.arg("-NoLogo");
                    cmd.arg("-NoExit");
                    cmd.arg("-ExecutionPolicy");
                    cmd.arg("Bypass");
                    cmd.arg("-File");
                    cmd.arg(profile);
                }
                Err(e) => {
                    log::warn!("powershell shell integration disabled: {e}");
                }
            }
        } else {
            log::info!("spawning {} without shell integration", shell_name);
        }

        log::info!("spawning Windows shell: {}", shell_path.display());
        Ok(cmd)
    }

    fn build_wsl(cwd: Option<String>, distro: String) -> Result<CommandBuilder, String> {
        let resolved_shell = crate::modules::workspace::resolve_wsl_shell(distro.clone())?;
        if resolved_shell.source == WslShellSource::Fallback {
            log::warn!("WSL shell resolution fell back to /bin/bash for {distro}");
        }
        let shell_kind = classify_shell(&resolved_shell.path);
        let mut cmd = CommandBuilder::new("wsl.exe");
        super::apply_common(&mut cmd, None);
        cmd.clear_cwd();
        apply_wsl_base_args(
            &mut cmd,
            &distro,
            cwd.as_deref()
                .filter(|s| !s.is_empty())
                .unwrap_or(DEFAULT_WSL_CWD),
            &resolved_shell.path,
        );

        let integration = match shell_kind {
            ShellKind::Zsh => match prepare_wsl_zdotdir(&distro) {
                Ok(zdotdir) => WslIntegration::Zsh { zdotdir },
                Err(e) => {
                    log::warn!("WSL zsh shell integration disabled for {distro}: {e}");
                    WslIntegration::None
                }
            },
            ShellKind::Bash => match prepare_wsl_bash_rcfile(&distro) {
                Ok(rcfile) => WslIntegration::Bash { rcfile },
                Err(e) => {
                    log::warn!("WSL bash shell integration disabled for {distro}: {e}");
                    WslIntegration::None
                }
            },
            ShellKind::Fish => match prepare_wsl_fish_init(&distro) {
                Ok(init) => WslIntegration::Fish { init },
                Err(e) => {
                    log::warn!("WSL fish shell integration disabled for {distro}: {e}");
                    WslIntegration::None
                }
            },
            ShellKind::Other => {
                log::info!(
                    "unsupported WSL shell '{}', spawning without integration",
                    resolved_shell.path
                );
                WslIntegration::None
            }
        };
        apply_wsl_shell_behavior(&mut cmd, &resolved_shell, integration);
        log::info!("spawning WSL shell: {distro}");
        Ok(cmd)
    }

    fn classify_shell(shell_path: &str) -> ShellKind {
        match shell_path.rsplit('/').next().unwrap_or(shell_path) {
            "zsh" => ShellKind::Zsh,
            "bash" => ShellKind::Bash,
            "fish" => ShellKind::Fish,
            _ => ShellKind::Other,
        }
    }

    fn apply_wsl_base_args(cmd: &mut CommandBuilder, distro: &str, cwd: &str, shell_path: &str) {
        cmd.arg("-d");
        cmd.arg(distro);
        cmd.arg("--cd");
        cmd.arg(cwd);
        cmd.arg("--exec");
        cmd.arg(shell_path);
    }

    fn apply_wsl_shell_behavior(
        cmd: &mut CommandBuilder,
        shell: &WslShellResolution,
        integration: WslIntegration,
    ) {
        match integration {
            WslIntegration::Zsh { zdotdir } => {
                cmd.env("ZDOTDIR", zdotdir);
                cmd.arg("-l");
            }
            WslIntegration::Bash { rcfile } => {
                cmd.arg("--rcfile");
                cmd.arg(rcfile);
                cmd.arg("-i");
            }
            WslIntegration::Fish { init } => {
                cmd.arg("--init-command");
                cmd.arg(format!("source {}", shell_quote_str(&init)));
                cmd.arg("-i");
            }
            WslIntegration::None => match classify_shell(&shell.path) {
                ShellKind::Zsh => cmd.arg("-l"),
                ShellKind::Bash | ShellKind::Fish => cmd.arg("-i"),
                ShellKind::Other => {
                    if shell.source == WslShellSource::Fallback {
                        cmd.arg("-i");
                    }
                }
            },
        }
    }

    fn prepare_wsl_bash_rcfile(distro: &str) -> Result<String, String> {
        let linux_dir = wsl_integration_dir(distro, "bash")?;
        let linux_rc = format!("{linux_dir}/bashrc");
        let content = super::bashrc_script().replace("\r\n", "\n");
        write_wsl_integration_file(distro, &linux_rc, &content)?;
        Ok(linux_rc)
    }

    fn prepare_wsl_zdotdir(distro: &str) -> Result<String, String> {
        let linux_dir = wsl_integration_dir(distro, "zsh")?;
        write_wsl_integration_file(
            distro,
            &format!("{linux_dir}/.zshenv"),
            &normalize_script(super::zshenv_script()),
        )?;
        write_wsl_integration_file(
            distro,
            &format!("{linux_dir}/.zprofile"),
            &normalize_script(super::zprofile_script()),
        )?;
        write_wsl_integration_file(
            distro,
            &format!("{linux_dir}/.zshrc"),
            &normalize_script(super::zshrc_script()),
        )?;
        write_wsl_integration_file(
            distro,
            &format!("{linux_dir}/.zlogin"),
            &normalize_script(super::zlogin_script()),
        )?;
        Ok(linux_dir)
    }

    fn prepare_wsl_fish_init(distro: &str) -> Result<String, String> {
        let linux_dir = wsl_integration_dir(distro, "fish")?;
        let linux_init = format!("{linux_dir}/init.fish");
        write_wsl_integration_file(
            distro,
            &linux_init,
            &normalize_script(super::fish_init_script()),
        )?;
        Ok(linux_init)
    }

    fn wsl_integration_dir(distro: &str, shell: &str) -> Result<String, String> {
        let home = crate::modules::workspace::wsl_home(distro.to_string())?;
        let linux_dir = format!(
            "{}/.cache/terax/shell-integration/{shell}",
            home.trim_end_matches('/')
        );
        let unc_dir = crate::modules::workspace::wsl_path_to_unc(distro, &linux_dir);
        fs::create_dir_all(&unc_dir).map_err(|e| format!("create {}: {e}", unc_dir.display()))?;
        Ok(linux_dir)
    }

    fn write_wsl_integration_file(
        distro: &str,
        linux_path: &str,
        content: &str,
    ) -> Result<(), String> {
        let unc_file = crate::modules::workspace::wsl_path_to_unc(distro, linux_path);
        write_if_changed(&unc_file, content)
    }

    fn normalize_script(content: &str) -> String {
        content.replace("\r\n", "\n")
    }

    fn shell_quote_str(p: &str) -> String {
        format!("'{}'", p.replace('\'', "'\\''"))
    }

    fn integration_root() -> Result<PathBuf, String> {
        let home = dirs::home_dir().ok_or_else(|| "could not resolve home dir".to_string())?;
        let root = home.join(".cache").join("terax").join("shell-integration");
        fs::create_dir_all(&root).map_err(|e| format!("create {}: {e}", root.display()))?;
        Ok(root)
    }

    fn prepare_ps_profile() -> Result<PathBuf, String> {
        let dir = integration_root()?.join("powershell");
        fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
        let file = dir.join("profile.ps1");
        write_if_changed(&file, PROFILE_PS1)?;
        Ok(file)
    }

    fn write_if_changed(path: &Path, content: &str) -> Result<(), String> {
        if let Ok(existing) = fs::read_to_string(path) {
            if existing == content {
                return Ok(());
            }
        }
        let mut tmp: OsString = path.as_os_str().to_owned();
        tmp.push(".__terax_tmp__");
        let tmp = PathBuf::from(tmp);
        fs::write(&tmp, content).map_err(|e| format!("write {}: {e}", tmp.display()))?;
        fs::rename(&tmp, path).map_err(|e| {
            let _ = fs::remove_file(&tmp);
            format!("rename {} -> {}: {e}", tmp.display(), path.display())
        })
    }

    #[cfg(test)]
    mod tests {
        use super::{
            apply_wsl_base_args, apply_wsl_shell_behavior, classify_shell, ShellKind,
            WslIntegration, DEFAULT_WSL_CWD,
        };
        use crate::modules::workspace::{WslShellResolution, WslShellSource};
        use portable_pty::CommandBuilder;

        fn argv(cmd: &CommandBuilder) -> Vec<String> {
            cmd.get_argv()
                .iter()
                .map(|arg| arg.to_string_lossy().into_owned())
                .collect()
        }

        #[test]
        fn classify_shell_matches_supported_names() {
            assert_eq!(classify_shell("/usr/bin/zsh"), ShellKind::Zsh);
            assert_eq!(classify_shell("/bin/bash"), ShellKind::Bash);
            assert_eq!(classify_shell("/usr/bin/fish"), ShellKind::Fish);
            assert_eq!(classify_shell("/usr/bin/tcsh"), ShellKind::Other);
        }

        #[test]
        fn wsl_zsh_launch_uses_login_shell_and_zdotdir() {
            let shell = WslShellResolution {
                path: "/usr/bin/zsh".into(),
                source: WslShellSource::Passwd,
            };
            let mut cmd = CommandBuilder::new("wsl.exe");
            apply_wsl_base_args(&mut cmd, "Ubuntu", "/work", &shell.path);
            apply_wsl_shell_behavior(
                &mut cmd,
                &shell,
                WslIntegration::Zsh {
                    zdotdir: "/home/me/.cache/terax/shell-integration/zsh".into(),
                },
            );

            assert_eq!(
                argv(&cmd),
                vec![
                    "wsl.exe",
                    "-d",
                    "Ubuntu",
                    "--cd",
                    "/work",
                    "--exec",
                    "/usr/bin/zsh",
                    "-l",
                ]
            );
            assert_eq!(
                cmd.get_env("ZDOTDIR").and_then(|v| v.to_str()),
                Some("/home/me/.cache/terax/shell-integration/zsh")
            );
        }

        #[test]
        fn wsl_bash_launch_uses_rcfile_and_interactive_mode() {
            let shell = WslShellResolution {
                path: "/bin/bash".into(),
                source: WslShellSource::Passwd,
            };
            let mut cmd = CommandBuilder::new("wsl.exe");
            apply_wsl_base_args(&mut cmd, "Ubuntu", DEFAULT_WSL_CWD, &shell.path);
            apply_wsl_shell_behavior(
                &mut cmd,
                &shell,
                WslIntegration::Bash {
                    rcfile: "/home/me/.cache/terax/shell-integration/bash/bashrc".into(),
                },
            );

            assert_eq!(
                argv(&cmd),
                vec![
                    "wsl.exe",
                    "-d",
                    "Ubuntu",
                    "--cd",
                    "~",
                    "--exec",
                    "/bin/bash",
                    "--rcfile",
                    "/home/me/.cache/terax/shell-integration/bash/bashrc",
                    "-i",
                ]
            );
        }

        #[test]
        fn wsl_fish_launch_uses_init_command() {
            let shell = WslShellResolution {
                path: "/usr/bin/fish".into(),
                source: WslShellSource::Passwd,
            };
            let mut cmd = CommandBuilder::new("wsl.exe");
            apply_wsl_base_args(&mut cmd, "Ubuntu", "/work", &shell.path);
            apply_wsl_shell_behavior(
                &mut cmd,
                &shell,
                WslIntegration::Fish {
                    init: "/home/me/.cache/terax/shell-integration/fish/init.fish".into(),
                },
            );

            assert_eq!(
                argv(&cmd),
                vec![
                    "wsl.exe",
                    "-d",
                    "Ubuntu",
                    "--cd",
                    "/work",
                    "--exec",
                    "/usr/bin/fish",
                    "--init-command",
                    "source '/home/me/.cache/terax/shell-integration/fish/init.fish'",
                    "-i",
                ]
            );
        }

        #[test]
        fn unsupported_wsl_shell_stays_usable_without_integration() {
            let shell = WslShellResolution {
                path: "/usr/bin/tcsh".into(),
                source: WslShellSource::Passwd,
            };
            let mut cmd = CommandBuilder::new("wsl.exe");
            apply_wsl_base_args(&mut cmd, "Ubuntu", "/work", &shell.path);
            apply_wsl_shell_behavior(&mut cmd, &shell, WslIntegration::None);

            assert_eq!(
                argv(&cmd),
                vec![
                    "wsl.exe",
                    "-d",
                    "Ubuntu",
                    "--cd",
                    "/work",
                    "--exec",
                    "/usr/bin/tcsh",
                ]
            );
        }

        #[test]
        fn fallback_shell_stays_interactive_without_rcfile() {
            let shell = WslShellResolution {
                path: "/bin/bash".into(),
                source: WslShellSource::Fallback,
            };
            let mut cmd = CommandBuilder::new("wsl.exe");
            apply_wsl_base_args(&mut cmd, "Ubuntu", "/work", &shell.path);
            apply_wsl_shell_behavior(&mut cmd, &shell, WslIntegration::None);

            assert_eq!(
                argv(&cmd),
                vec![
                    "wsl.exe",
                    "-d",
                    "Ubuntu",
                    "--cd",
                    "/work",
                    "--exec",
                    "/bin/bash",
                    "-i",
                ]
            );
        }
    }
}

#[cfg(windows)]
pub fn windows_shell_path() -> PathBuf {
    if let Some(p) = which_in_path("pwsh.exe") {
        return p;
    }

    if let Some(pf) = std::env::var_os("ProgramFiles").map(PathBuf::from) {
        let candidate = pf.join("PowerShell").join("7").join("pwsh.exe");
        if candidate.is_file() {
            return candidate;
        }
    }

    let system32 = std::env::var_os("SystemRoot")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"C:\Windows"))
        .join("System32");
    let ps5 = system32
        .join("WindowsPowerShell")
        .join("v1.0")
        .join("powershell.exe");
    if ps5.is_file() {
        return ps5;
    }

    system32.join("cmd.exe")
}

#[cfg(windows)]
fn which_in_path(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}
