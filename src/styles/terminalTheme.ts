import { readAppTokens } from "@/styles/tokens";
import type { AppTokens } from "@/styles/tokens";
import type { EditorThemeId } from "@/modules/settings/store";
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

const vesperAnsi = {
  black: "#101010",
  red: "#FF8080",
  green: "#99FFE4",
  yellow: "#FFC799",
  blue: "#A0A0A0",
  magenta: "#FF7300",
  cyan: "#99FFE4",
  white: "#FFFFFF",

  brightBlack: "#505050",
  brightRed: "#FF8080",
  brightGreen: "#99FFE4",
  brightYellow: "#FFCFA8",
  brightBlue: "#A0A0A0",
  brightMagenta: "#FF8080",
  brightCyan: "#99FFE4",
  brightWhite: "#FFFFFF",
} as const;

const sobrioAnsi = {
  black: "#121212",
  red: "#FD6389",
  green: "#2EC27E",
  yellow: "#D7AF87",
  blue: "#87AFD7",
  magenta: "#7CDCE7",
  cyan: "#7CDCE7",
  white: "#CCCCCC",

  brightBlack: "#5F5F5F",
  brightRed: "#FD6389",
  brightGreen: "#2EC27E",
  brightYellow: "#D7D7FF",
  brightBlue: "#87AFD7",
  brightMagenta: "#D7AF87",
  brightCyan: "#7CDCE7",
  brightWhite: "#FFFFFF",
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
export function buildTerminalTheme(
  tokens: AppTokens = readAppTokens(),
  editorTheme?: EditorThemeId,
): ITheme {
  if (editorTheme === "vesper") {
    return {
      background: "#101010",
      foreground: "#FFFFFF",
      cursor: "#FFFFFF",
      cursorAccent: "#101010",
      selectionBackground: "#FFFFFF25",
      ...vesperAnsi,
    };
  }

  if (editorTheme === "sobrio") {
    return {
      background: "#121212",
      foreground: "#FFFFFF",
      cursor: "#FFFFFF",
      cursorAccent: "#121212",
      selectionBackground: "#4E4E4E",
      ...sobrioAnsi,
    };
  }

  const t = tokens;
  return {
    background: t.background,
    foreground: t.foreground,
    cursor: t.foreground,
    cursorAccent: t.background,
    selectionBackground: t.accent,
    ...ansi,
  };
}
