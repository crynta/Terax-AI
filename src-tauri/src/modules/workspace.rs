use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

#[derive(Default)]
pub struct WorkspaceRegistry {
    roots: Mutex<HashSet<PathBuf>>,
}

impl WorkspaceRegistry {
    pub fn authorize<P: AsRef<Path>>(&self, path: P) -> std::io::Result<PathBuf> {
        let canonical = std::fs::canonicalize(path.as_ref())?;
        let mut set = self.roots.lock().expect("workspace registry poisoned");
        set.insert(canonical.clone());
        Ok(canonical)
    }

    pub fn is_authorized(&self, target: &Path) -> bool {
        let set = self.roots.lock().expect("workspace registry poisoned");
        set.iter().any(|root| target.starts_with(root))
    }
}

pub fn bootstrap_registry(registry: &WorkspaceRegistry) {
    if let Ok(cwd) = std::env::current_dir() {
        let _ = registry.authorize(cwd);
    }
    if let Some(home) = dirs::home_dir() {
        let _ = registry.authorize(home);
    }
}

#[tauri::command]
pub async fn workspace_authorize(
    path: String,
    registry: tauri::State<'_, WorkspaceRegistry>,
) -> Result<String, String> {
    let canonical = registry.authorize(&path).map_err(|e| e.to_string())?;
    Ok(canonical.to_string_lossy().replace('\\', "/"))
}

#[tauri::command]
pub async fn workspace_current_dir(
    registry: tauri::State<'_, WorkspaceRegistry>,
) -> Result<String, String> {
    let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
    let canonical = registry.authorize(&cwd).map_err(|e| e.to_string())?;
    Ok(canonical.to_string_lossy().replace('\\', "/"))
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum WorkspaceEnv {
    #[default]
    Local,
    Wsl {
        distro: String,
    },
}

impl WorkspaceEnv {
    pub fn from_option(workspace: Option<Self>) -> Self {
        workspace.unwrap_or_default()
    }

    pub fn is_wsl(&self) -> bool {
        matches!(self, Self::Wsl { .. })
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct WslDistro {
    pub name: String,
    pub default: bool,
    pub running: bool,
}

#[cfg(windows)]
pub fn resolve_path(path: &str, workspace: &WorkspaceEnv) -> PathBuf {
    match workspace {
        WorkspaceEnv::Local => PathBuf::from(path),
        WorkspaceEnv::Wsl { distro } => wsl_path_to_unc(distro, path),
    }
}

#[cfg(not(windows))]
pub fn resolve_path(path: &str, _workspace: &WorkspaceEnv) -> PathBuf {
    PathBuf::from(path)
}

#[cfg(windows)]
pub fn wsl_path_to_unc(distro: &str, path: &str) -> PathBuf {
    let normalized = path.replace('\\', "/");
    let trimmed = normalized.trim_start_matches('/');
    let primary = PathBuf::from(format!(
        r"\\wsl.localhost\{}\{}",
        distro,
        trimmed.replace('/', r"\")
    ));
    if primary.exists() {
        return primary;
    }
    PathBuf::from(format!(r"\\wsl$\{}\{}", distro, trimmed.replace('/', r"\")))
}

#[cfg(windows)]
pub fn decode_command_output(bytes: &[u8]) -> String {
    if bytes.starts_with(&[0xff, 0xfe]) || looks_utf16le(bytes) {
        let start = if bytes.starts_with(&[0xff, 0xfe]) {
            2
        } else {
            0
        };
        let units: Vec<u16> = bytes[start..]
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        String::from_utf16_lossy(&units)
    } else {
        String::from_utf8_lossy(bytes).into_owned()
    }
}

#[cfg(windows)]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum WslShellSource {
    Passwd,
    Env,
    Fallback,
}

#[cfg(windows)]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WslShellResolution {
    pub path: String,
    pub source: WslShellSource,
}

#[cfg(windows)]
fn looks_utf16le(bytes: &[u8]) -> bool {
    if bytes.len() < 4 || !bytes.len().is_multiple_of(2) {
        return false;
    }
    let nul_odd = bytes.iter().skip(1).step_by(2).filter(|b| **b == 0).count();
    nul_odd * 2 >= bytes.len() / 2
}

#[cfg(windows)]
fn run_wsl(args: &[&str]) -> Result<String, String> {
    let out = std::process::Command::new("wsl.exe")
        .args(args)
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        let stderr = decode_command_output(&out.stderr);
        return Err(stderr.trim().to_string());
    }
    Ok(decode_command_output(&out.stdout))
}

#[cfg(windows)]
fn parse_passwd_shell(raw: &str) -> Option<String> {
    let line = raw.trim();
    if line.is_empty() {
        return None;
    }
    let shell = if line.contains(':') {
        line.rsplit(':').next().unwrap_or("")
    } else {
        line
    };
    normalize_wsl_shell(shell)
}

#[cfg(windows)]
fn normalize_wsl_shell(raw: &str) -> Option<String> {
    let shell = raw.trim();
    if shell.is_empty() {
        None
    } else {
        Some(shell.to_string())
    }
}

#[cfg(windows)]
fn resolve_wsl_shell_from_outputs(passwd: &str, shell_env: &str) -> WslShellResolution {
    if let Some(path) = parse_passwd_shell(passwd) {
        return WslShellResolution {
            path,
            source: WslShellSource::Passwd,
        };
    }
    if let Some(path) = normalize_wsl_shell(shell_env) {
        return WslShellResolution {
            path,
            source: WslShellSource::Env,
        };
    }
    WslShellResolution {
        path: "/bin/bash".into(),
        source: WslShellSource::Fallback,
    }
}

#[cfg(windows)]
pub fn resolve_wsl_shell(distro: String) -> Result<WslShellResolution, String> {
    let passwd = run_wsl(&[
        "-d",
        &distro,
        "--exec",
        "sh",
        "-lc",
        "getent passwd \"$(id -un)\" 2>/dev/null || true",
    ])?;
    let shell_env = run_wsl(&[
        "-d",
        &distro,
        "--exec",
        "sh",
        "-lc",
        "printf %s \"${SHELL:-}\"",
    ])?;
    Ok(resolve_wsl_shell_from_outputs(&passwd, &shell_env))
}

#[cfg(windows)]
fn list_distros_blocking() -> Result<Vec<WslDistro>, String> {
    let out = run_wsl(&["--list", "--verbose"])?;
    let mut distros = Vec::new();
    for raw in out.lines().skip(1) {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        let default = line.starts_with('*');
        let line = line.trim_start_matches('*').trim();
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 3 {
            continue;
        }
        let state_idx = parts.len() - 2;
        let name = parts[..state_idx].join(" ");
        let state = parts[state_idx];
        distros.push(WslDistro {
            name,
            default,
            running: state.eq_ignore_ascii_case("Running"),
        });
    }
    Ok(distros)
}

#[tauri::command]
pub async fn wsl_list_distros() -> Result<Vec<WslDistro>, String> {
    #[cfg(not(windows))]
    {
        Ok(Vec::new())
    }
    #[cfg(windows)]
    {
        tauri::async_runtime::spawn_blocking(list_distros_blocking)
            .await
            .map_err(|e| e.to_string())?
    }
}

#[tauri::command]
pub async fn wsl_default_distro() -> Result<Option<String>, String> {
    #[cfg(not(windows))]
    {
        Ok(None)
    }
    #[cfg(windows)]
    {
        tauri::async_runtime::spawn_blocking(|| {
            let distros = list_distros_blocking()?;
            Ok(distros
                .iter()
                .find(|d| d.default)
                .map(|d| d.name.clone())
                .or_else(|| distros.first().map(|d| d.name.clone())))
        })
        .await
        .map_err(|e| e.to_string())?
    }
}

#[tauri::command]
pub fn wsl_home(distro: String) -> Result<String, String> {
    #[cfg(not(windows))]
    {
        let _ = distro;
        Err("WSL is only available on Windows".into())
    }
    #[cfg(windows)]
    {
        let out = run_wsl(&["-d", &distro, "--exec", "sh", "-lc", "printf %s \"$HOME\""])?;
        let home = out.trim().to_string();
        if home.is_empty() {
            Err(format!("could not resolve WSL home for {distro}"))
        } else {
            Ok(home)
        }
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::{
        decode_command_output, parse_passwd_shell, resolve_wsl_shell_from_outputs, WslShellSource,
    };

    #[test]
    fn decode_command_output_handles_utf16le_without_bom() {
        let bytes = b"h\0i\0";
        assert_eq!(decode_command_output(bytes), "hi");
    }

    #[test]
    fn parse_passwd_shell_extracts_last_field() {
        let line = "user:x:1000:1000::/home/user:/usr/bin/zsh";
        assert_eq!(parse_passwd_shell(line).as_deref(), Some("/usr/bin/zsh"));
    }

    #[test]
    fn resolve_wsl_shell_prefers_passwd() {
        let resolved = resolve_wsl_shell_from_outputs(
            "user:x:1000:1000::/home/user:/usr/bin/fish",
            "/bin/bash",
        );
        assert_eq!(resolved.path, "/usr/bin/fish");
        assert_eq!(resolved.source, WslShellSource::Passwd);
    }

    #[test]
    fn resolve_wsl_shell_falls_back_to_env() {
        let resolved = resolve_wsl_shell_from_outputs("", "/bin/zsh");
        assert_eq!(resolved.path, "/bin/zsh");
        assert_eq!(resolved.source, WslShellSource::Env);
    }

    #[test]
    fn resolve_wsl_shell_falls_back_to_bash() {
        let resolved = resolve_wsl_shell_from_outputs("", "");
        assert_eq!(resolved.path, "/bin/bash");
        assert_eq!(resolved.source, WslShellSource::Fallback);
    }
}
