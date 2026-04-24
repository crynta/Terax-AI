import { readAppTokens } from "@/styles/tokens";
import type { ITheme } from "@xterm/xterm";

/**
 * xterm.js ITheme is 18 colors: bg/fg/cursor/cursorAccent/selection + ANSI 16.
 *
 * Chrome colors (background, foreground, cursor, selection) come from shadcn's
 * globals.css tokens so the terminal visually fuses with the app. ANSI 16
 * stays curated — globals.css is grayscale, it has no semantic color palette.
 */

/** Curated ANSI 16 palette, tuned for shadcn's dark surface. */
const ansi = {
  black: "#18181b",
  red: "#ef4444",
  green: "#22c55e",
  yellow: "#eab308",
  blue: "#3b82f6",
  magenta: "#a855f7",
  cyan: "#06b6d4",
  white: "#e4e4e7",

  brightBlack: "#52525b",
  brightRed: "#f87171",
  brightGreen: "#4ade80",
  brightYellow: "#facc15",
  brightBlue: "#60a5fa",
  brightMagenta: "#c084fc",
  brightCyan: "#22d3ee",
  brightWhite: "#fafafa",
} as const;

/** Semantic palette reused by the code editor. Kept in one place so the
 *  terminal's ANSI colors and syntax highlighting stay visually coherent. */
export const syntaxPalette = {
  comment: ansi.brightBlack,
  keyword: ansi.blue,
  string: ansi.green,
  number: ansi.yellow,
  constant: ansi.magenta,
  fn: ansi.cyan,
  type: ansi.brightCyan,
  tag: ansi.red,
  punctuation: "#a1a1aa",
  invalid: ansi.red,
  link: ansi.blue,
} as const;

/**
 * Builds an xterm theme at runtime from the current app tokens. Must be
 * called after the DOM is ready (after first paint); globals.css variables
 * are resolved via getComputedStyle.
 */
export function buildTerminalTheme(): ITheme {
  const t = readAppTokens();
  return {
    background: t.background,
    foreground: t.foreground,
    cursor: t.foreground,
    cursorAccent: t.background,
    selectionBackground: t.accent,
    ...ansi,
  };
}
