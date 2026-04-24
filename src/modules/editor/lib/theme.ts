import { readAppTokens } from "@/styles/tokens";
import { syntaxPalette } from "@/themes";
import { tags as t } from "@lezer/highlight";
import { createTheme } from "@uiw/codemirror-themes";

/**
 * Editor theme built at runtime from shadcn tokens + the syntax palette
 * shared with the terminal. Chrome (background, gutter, selection) matches
 * the app surface; token colors match the terminal's ANSI slots so code
 * and shell output feel unified.
 *
 * Must be called after DOM paint — see tokens.ts.
 */
export function buildEditorTheme() {
  const k = readAppTokens();

  return createTheme({
    theme: "dark",
    settings: {
      background: k.background,
      backgroundImage: "",
      foreground: k.foreground,
      caret: k.foreground,
      selection: k.accent,
      selectionMatch: k.muted,
      lineHighlight: "#ffffff08",
      gutterBackground: k.background,
      gutterForeground: k["muted-foreground"],
      gutterBorder: "transparent",
      gutterActiveForeground: k.foreground,
    },
    styles: [
      { tag: t.comment, color: syntaxPalette.comment, fontStyle: "italic" },
      {
        tag: [t.lineComment, t.blockComment],
        color: syntaxPalette.comment,
        fontStyle: "italic",
      },
      {
        tag: [t.keyword, t.controlKeyword, t.operatorKeyword],
        color: syntaxPalette.keyword,
      },
      { tag: t.definitionKeyword, color: syntaxPalette.keyword },
      { tag: t.modifier, color: syntaxPalette.keyword },
      {
        tag: [t.string, t.special(t.string)],
        color: syntaxPalette.string,
      },
      { tag: t.number, color: syntaxPalette.number },
      {
        tag: [t.bool, t.null, t.atom],
        color: syntaxPalette.constant,
      },
      {
        tag: [t.function(t.variableName), t.function(t.propertyName)],
        color: syntaxPalette.fn,
      },
      { tag: [t.typeName, t.className], color: syntaxPalette.type },
      { tag: [t.propertyName, t.attributeName], color: k.foreground },
      { tag: t.variableName, color: k.foreground },
      { tag: t.definition(t.variableName), color: k.foreground },
      {
        tag: [t.operator, t.punctuation, t.bracket],
        color: syntaxPalette.punctuation,
      },
      { tag: [t.tagName, t.angleBracket], color: syntaxPalette.tag },
      {
        tag: t.invalid,
        color: syntaxPalette.invalid,
        backgroundColor: "#ef444422",
      },
      {
        tag: t.heading,
        color: syntaxPalette.fn,
        fontWeight: "bold",
      },
      {
        tag: t.link,
        color: syntaxPalette.link,
        textDecoration: "underline",
      },
      { tag: t.emphasis, fontStyle: "italic" },
      { tag: t.strong, fontWeight: "bold" },
    ],
  });
}
