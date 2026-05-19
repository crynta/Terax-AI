// Discord Rich Presence integration.
//
// Connects to the locally running Discord client over IPC (no network, no
// token). All calls are best-effort: if Discord isn't running or the IPC
// socket is missing the commands return `Ok(())` and tracing logs the cause.
// Reconnect is lazy — the next `discord_update_activity` call retries from
// a disconnected state.

use std::sync::Mutex;

use discord_rich_presence::{
    activity::{Activity, Assets, Button, Timestamps},
    DiscordIpc, DiscordIpcClient,
};
use serde::Deserialize;
use tauri::State;

/// Discord Application Client ID for Terax. Replace with the official ID
/// registered at https://discord.com/developers/applications. Discord rejects
/// the placeholder so presence stays silent until this is filled in.
const CLIENT_ID: &str = "REPLACE_WITH_DISCORD_APPLICATION_ID";

/// Optional `discord.gg` / `discord.com/invite/...` invite link rendered as a
/// "Join Discord" button. `None` hides the button.
const INVITE_URL: Option<&str> = None;

#[tauri::command]
pub fn discord_invite_url() -> Option<String> {
    INVITE_URL
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}


const LARGE_IMAGE_KEY: &str = "terax_logo";
const LARGE_IMAGE_TEXT_FALLBACK: &str = "Terax";

#[derive(Default)]
pub struct DiscordState {
    inner: Mutex<Option<DiscordIpcClient>>,
}

#[derive(Debug, Deserialize)]
pub struct ActivityButton {
    pub label: String,
    pub url: String,
}

#[derive(Debug, Deserialize)]
pub struct ActivityPayload {
    /// Top line under the app name. Workspace context per Neovim convention.
    pub details: Option<String>,
    /// Second line. Active file / action per Neovim convention.
    pub state: Option<String>,
    /// Hover tooltip on the large logo. Falls back to "Terax".
    pub large_text: Option<String>,
    /// Optional Discord asset key for the small overlay icon (e.g. language
    /// extension like `rust`, `ts`). Skipped if absent or asset missing.
    pub small_image: Option<String>,
    /// Hover tooltip on the small overlay icon.
    pub small_text: Option<String>,
    /// Unix milliseconds; when present Discord renders an elapsed timer.
    pub started_at_ms: Option<i64>,
    /// Up to 2 buttons rendered under the activity card.
    pub buttons: Option<Vec<ActivityButton>>,
}

fn connect() -> Option<DiscordIpcClient> {
    let mut client = DiscordIpcClient::new(CLIENT_ID);
    if let Err(err) = client.connect() {
        log::info!("discord: connect failed (is Discord running?): {err}");
        return None;
    }
    log::info!("discord: connected");
    Some(client)
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    s.chars().take(max.saturating_sub(1)).collect::<String>() + "…"
}

#[tauri::command]
pub fn discord_update_activity(
    state: State<'_, DiscordState>,
    payload: ActivityPayload,
) -> Result<(), String> {
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    if guard.is_none() {
        *guard = connect();
    }
    let Some(client) = guard.as_mut() else {
        return Ok(());
    };

    let details = payload.details.as_deref().map(|d| truncate(d, 128));
    let state_line = payload.state.as_deref().map(|s| truncate(s, 128));
    let large_text = payload
        .large_text
        .as_deref()
        .map(|t| truncate(t, 128))
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| LARGE_IMAGE_TEXT_FALLBACK.to_string());

    let mut activity = Activity::new();
    if let Some(d) = details.as_deref() {
        if !d.is_empty() {
            activity = activity.details(d);
        }
    }
    if let Some(s) = state_line.as_deref() {
        if !s.is_empty() {
            activity = activity.state(s);
        }
    }
    if let Some(ms) = payload.started_at_ms {
        activity = activity.timestamps(Timestamps::new().start(ms));
    }
    let small_image = payload
        .small_image
        .as_deref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let small_text = payload
        .small_text
        .as_deref()
        .map(|t| truncate(t, 128))
        .filter(|t| !t.is_empty());

    let mut assets = Assets::new()
        .large_image(LARGE_IMAGE_KEY)
        .large_text(&large_text);
    if let Some(key) = small_image.as_deref() {
        assets = assets.small_image(key);
        if let Some(t) = small_text.as_deref() {
            assets = assets.small_text(t);
        }
    }
    activity = activity.assets(assets);

    if let Some(buttons) = payload.buttons.as_ref() {
        let built: Vec<Button> = buttons
            .iter()
            .take(2)
            .filter(|b| !b.label.is_empty() && !b.url.is_empty())
            .map(|b| Button::new(truncate(&b.label, 32), truncate(&b.url, 512)))
            .collect();
        if !built.is_empty() {
            activity = activity.buttons(built);
        }
    }

    if let Err(err) = client.set_activity(activity) {
        log::debug!("discord: set_activity failed, dropping client: {err}");
        let _ = client.close();
        *guard = None;
    }
    Ok(())
}

#[tauri::command]
pub fn discord_clear_activity(state: State<'_, DiscordState>) -> Result<(), String> {
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    if let Some(client) = guard.as_mut() {
        let _ = client.clear_activity();
        let _ = client.close();
    }
    *guard = None;
    Ok(())
}
