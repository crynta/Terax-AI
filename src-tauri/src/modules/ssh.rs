use portable_pty::CommandBuilder;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SshTarget {
    pub user: Option<String>,
    pub host: String,
    pub port: Option<u16>,
    pub path: Option<String>,
}

pub fn parse_ssh_url(input: &str) -> Result<SshTarget, String> {
    let rest = input
        .strip_prefix("ssh://")
        .ok_or_else(|| "SSH URL must start with ssh://".to_string())?;

    let (authority, path) = match rest.find('/') {
        Some(idx) => (&rest[..idx], Some(&rest[idx..])),
        None => (rest, None),
    };

    if authority.trim().is_empty() {
        return Err("missing SSH host".into());
    }

    let (user, host_port) = match authority.rsplit_once('@') {
        Some((raw_user, raw_host)) => {
            if raw_user.is_empty() {
                return Err("empty SSH username".into());
            }
            validate_user(raw_user)?;
            (Some(raw_user.to_string()), raw_host)
        }
        None => (None, authority),
    };

    let (host, port) = parse_host_port(host_port)?;
    validate_host(&host)?;

    let path = match path {
        Some("") => None,
        Some(raw) => {
            validate_remote_path(raw)?;
            Some(raw.to_string())
        }
        None => None,
    };

    Ok(SshTarget {
        user,
        host,
        port,
        path,
    })
}

pub fn build_command_from_url(input: &str) -> Result<CommandBuilder, String> {
    let target = parse_ssh_url(input)?;

    let mut cmd = CommandBuilder::new("ssh");
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERAX_TERMINAL", "1");

    // Force a TTY so interactive shells, vim, htop, etc. behave normally.
    cmd.arg("-tt");

    if let Some(port) = target.port {
        cmd.arg("-p");
        cmd.arg(port.to_string());
    }

    cmd.arg(target.destination());

    let remote_command = match target.path.as_deref() {
        Some(path) => format!("cd -- {} && exec \"${{SHELL:-sh}}\" -l", shell_quote(path)),
        None => "exec \"${SHELL:-sh}\" -l".to_string(),
    };

    cmd.arg(remote_command);
    Ok(cmd)
}

impl SshTarget {
    fn destination(&self) -> String {
        match &self.user {
            Some(user) => format!("{user}@{}", self.host),
            None => self.host.clone(),
        }
    }
}

fn parse_host_port(input: &str) -> Result<(String, Option<u16>), String> {
    if input.is_empty() {
        return Err("missing SSH host".into());
    }

    // v1 intentionally supports DNS names and IPv4. Bracketed IPv6 can be added
    // later without weakening the validation rules.
    if input.starts_with('[') || input.contains(']') {
        return Err("bracketed IPv6 SSH URLs are not supported yet".into());
    }

    match input.rsplit_once(':') {
        Some((host, raw_port)) if raw_port.chars().all(|c| c.is_ascii_digit()) => {
            if host.is_empty() {
                return Err("missing SSH host".into());
            }
            let port = raw_port
                .parse::<u16>()
                .map_err(|_| format!("invalid SSH port: {raw_port}"))?;
            Ok((host.to_string(), Some(port)))
        }
        _ => Ok((input.to_string(), None)),
    }
}

fn validate_user(user: &str) -> Result<(), String> {
    if user.starts_with('-') {
        return Err("SSH username cannot start with '-'".into());
    }
    if user
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
    {
        Ok(())
    } else {
        Err(format!("unsafe SSH username: {user}"))
    }
}

fn validate_host(host: &str) -> Result<(), String> {
    if host.is_empty() {
        return Err("missing SSH host".into());
    }
    if host.starts_with('-') {
        return Err("SSH host cannot start with '-'".into());
    }
    if host
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-'))
    {
        Ok(())
    } else {
        Err(format!("unsafe SSH host: {host}"))
    }
}

fn validate_remote_path(path: &str) -> Result<(), String> {
    if !path.starts_with('/') && !path.starts_with('~') {
        return Err("SSH path must be absolute or start with ~".into());
    }
    if path.chars().any(|c| c == '\0' || c.is_control()) {
        return Err("SSH path contains control characters".into());
    }
    Ok(())
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_user_host_and_path() {
        let parsed = parse_ssh_url("ssh://moe@10.0.0.15/home/moe/project").unwrap();
        assert_eq!(parsed.user.as_deref(), Some("moe"));
        assert_eq!(parsed.host, "10.0.0.15");
        assert_eq!(parsed.port, None);
        assert_eq!(parsed.path.as_deref(), Some("/home/moe/project"));
    }

    #[test]
    fn parses_port() {
        let parsed = parse_ssh_url("ssh://moe@example.com:2222/home/moe").unwrap();
        assert_eq!(parsed.user.as_deref(), Some("moe"));
        assert_eq!(parsed.host, "example.com");
        assert_eq!(parsed.port, Some(2222));
        assert_eq!(parsed.path.as_deref(), Some("/home/moe"));
    }

    #[test]
    fn rejects_empty_host() {
        assert!(parse_ssh_url("ssh:///home/moe").is_err());
    }

    #[test]
    fn rejects_unsafe_user() {
        assert!(parse_ssh_url("ssh://bad;user@example.com/home/moe").is_err());
    }

    #[test]
    fn rejects_unsafe_host() {
        assert!(parse_ssh_url("ssh://moe@example.com;rm-rf/home/moe").is_err());
    }

    #[test]
    fn rejects_invalid_path() {
        assert!(parse_ssh_url("ssh://moe@example.com/has\nnewline").is_err());
    }

    #[test]
    fn shell_quote_handles_single_quotes() {
        assert_eq!(shell_quote("/home/moe/a'b"), "'/home/moe/a'\\''b'");
    }
}
