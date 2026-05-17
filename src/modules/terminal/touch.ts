// src/modules/terminal/touch.ts
//
// Soft-keyboard support for xterm.js on touch devices (Android primarily).
//
// xterm.js doesn't trigger the IME on its own — its DOM target is a
// canvas/WebGL surface and Android won't pop the keyboard for canvas focus.
// We sidestep that by parking a hidden <input> off-screen, focusing it when
// the user taps the terminal, and translating its keydown / input events
// into bytes we send to the PTY.
//
// This module is decoupled from the xterm Terminal instance — TerminalPane
// hands us a `writeToPty(data)` callback so the helper survives the
// renderer-pool detach/re-attach dance.

type WriteToPty = (data: string) => void;

/**
 * Install touch input support on a terminal container.
 *
 * Returns a cleanup function — call it when the pane unmounts. No-op on
 * platforms that don't report touch points (i.e. desktop), so it's safe to
 * call unconditionally.
 */
export function installTouchInput(
  container: HTMLElement,
  writeToPty: WriteToPty,
): () => void {
  // Only activate on touch devices. `maxTouchPoints` is 0 on every desktop
  // browser; mobile Safari + Android Chrome both report ≥ 1.
  if (
    typeof navigator === "undefined" ||
    !navigator.maxTouchPoints ||
    navigator.maxTouchPoints === 0
  ) {
    return () => {};
  }

  // ── Hidden input that receives IME / keyboard events ──────────────────────
  const hidden = document.createElement("input");
  hidden.setAttribute("autocorrect", "off");
  hidden.setAttribute("autocapitalize", "none");
  hidden.setAttribute("autocomplete", "off");
  hidden.setAttribute("spellcheck", "false");
  hidden.setAttribute("inputmode", "text");
  hidden.setAttribute("tabindex", "-1");
  hidden.setAttribute("aria-hidden", "true");
  hidden.style.cssText = [
    "position:fixed",
    "left:-9999px",
    "top:0",
    "width:1px",
    "height:1px",
    "opacity:0",
    "border:none",
    "outline:none",
    "padding:0",
    "margin:0",
    "background:transparent",
    "color:transparent",
    "caret-color:transparent",
  ].join(";");

  document.body.appendChild(hidden);

  // ── Tap the terminal → focus the hidden input → keyboard pops up ─────────
  // Both click and touchend so we catch all gesture variants; .focus() must
  // run inside a user gesture handler or Android will silently ignore it.
  const onContainerClick = () => {
    hidden.focus({ preventScroll: true });
  };
  container.addEventListener("click", onContainerClick);
  container.addEventListener("touchend", onContainerClick, { passive: true });

  // ── Forward regular typed text ─────────────────────────────────────────────
  // IME composition lands here as a single `input` event with the final text;
  // we clear the field so the next keystroke fires another `input` cleanly.
  const onInput = (e: Event) => {
    const inputEl = e.target as HTMLInputElement;
    const text = inputEl.value;
    if (text) {
      writeToPty(text);
      inputEl.value = "";
    }
  };
  hidden.addEventListener("input", onInput);

  // ── Forward special keys ───────────────────────────────────────────────────
  const KEY_MAP: Record<string, string> = {
    Backspace:  "\x7f",
    Delete:     "\x1b[3~",
    Enter:      "\r",
    Tab:        "\t",
    Escape:     "\x1b",
    ArrowUp:    "\x1b[A",
    ArrowDown:  "\x1b[B",
    ArrowRight: "\x1b[C",
    ArrowLeft:  "\x1b[D",
    Home:       "\x1b[H",
    End:        "\x1b[F",
    PageUp:     "\x1b[5~",
    PageDown:   "\x1b[6~",
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const seq = KEY_MAP[e.key];
    if (seq) {
      e.preventDefault();
      writeToPty(seq);
      return;
    }
    // Ctrl-letter shortcuts: Ctrl-C, Ctrl-D, Ctrl-L, etc. Map A-Z to 1-26.
    if (e.ctrlKey && e.key.length === 1) {
      const code = e.key.toUpperCase().charCodeAt(0) - 64;
      if (code > 0 && code < 32) {
        e.preventDefault();
        writeToPty(String.fromCharCode(code));
      }
    }
  };
  hidden.addEventListener("keydown", onKeyDown);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  return () => {
    container.removeEventListener("click", onContainerClick);
    container.removeEventListener("touchend", onContainerClick);
    hidden.removeEventListener("input", onInput);
    hidden.removeEventListener("keydown", onKeyDown);
    if (hidden.parentNode) {
      hidden.parentNode.removeChild(hidden);
    }
  };
}
