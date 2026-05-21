import { atomone } from "@uiw/codemirror-theme-atomone";
import { aura } from "@uiw/codemirror-theme-aura";
import { copilot } from "@uiw/codemirror-theme-copilot";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import { nord } from "@uiw/codemirror-theme-nord";
import { tokyoNight } from "@uiw/codemirror-theme-tokyo-night";
import { xcodeDark, xcodeLight } from "@uiw/codemirror-theme-xcode";
import { createTheme } from "@uiw/codemirror-themes";
import type { Extension } from "@codemirror/state";
import { tags as t } from "@lezer/highlight";
import type { EditorThemeId } from "@/modules/settings/store";

const vesper = createTheme({
  theme: "dark",
  settings: {
    background: "#101010",
    foreground: "#FFFFFF",
    caret: "#FFFFFF",
    selection: "#FFFFFF25",
    selectionMatch: "#FFFFFF25",
    gutterBackground: "#101010",
    gutterForeground: "#505050",
    gutterActiveForeground: "#FFFFFF",
    gutterBorder: "transparent",
    lineHighlight: "#28282880",
  },
  styles: [
    { tag: [t.comment, t.lineComment, t.blockComment], color: "#8b8b8b94" },
    { tag: [t.keyword, t.operatorKeyword, t.modifier, t.atom], color: "#A0A0A0" },
    { tag: [t.operator, t.punctuation, t.separator, t.bracket], color: "#A0A0A0" },
    { tag: [t.string, t.special(t.string), t.regexp], color: "#99FFE4" },
    { tag: [t.number, t.bool, t.null, t.character, t.constant(t.name)], color: "#FFC799" },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName))], color: "#FFC799" },
    { tag: [t.className, t.typeName, t.namespace, t.labelName], color: "#FFC799" },
    { tag: [t.tagName, t.heading], color: "#FFC799" },
    { tag: [t.attributeName, t.propertyName], color: "#A0A0A0" },
    { tag: [t.variableName, t.self, t.definition(t.variableName)], color: "#FFFFFF" },
    { tag: t.invalid, color: "#FF8080" },
    { tag: t.link, color: "#FFC799", textDecoration: "underline" },
    { tag: t.emphasis, color: "#FFFFFF", fontStyle: "italic" },
    { tag: t.strong, color: "#FFFFFF", fontWeight: "700" },
  ],
});

const sobrio = createTheme({
  theme: "dark",
  settings: {
    background: "#121212",
    foreground: "#FFFFFF",
    caret: "#FFFFFF",
    selection: "#4E4E4E",
    selectionMatch: "#4E4E4E80",
    gutterBackground: "#121212",
    gutterForeground: "#333333",
    gutterActiveForeground: "#AFAFAF",
    gutterBorder: "transparent",
    lineHighlight: "#181818",
  },
  styles: [
    { tag: [t.comment, t.lineComment, t.blockComment], color: "#3A3B3F", fontStyle: "italic" },
    { tag: [t.keyword, t.operatorKeyword, t.modifier, t.atom], color: "#FD6389", fontStyle: "italic" },
    { tag: [t.operator, t.punctuation, t.separator, t.bracket], color: "#FD6389" },
    { tag: [t.string, t.special(t.string), t.regexp], color: "#87AFD7" },
    { tag: [t.number, t.bool, t.null, t.character, t.constant(t.name)], color: "#D7D7FF" },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName))], color: "#FFFFFF", fontWeight: "700" },
    { tag: [t.className, t.typeName, t.namespace, t.labelName], color: "#AFAFAF", fontStyle: "italic" },
    { tag: [t.tagName, t.heading], color: "#FD6389", fontWeight: "700" },
    { tag: [t.attributeName, t.propertyName], color: "#AFAFAF" },
    { tag: [t.variableName, t.self, t.definition(t.variableName)], color: "#CCCCCC" },
    { tag: t.invalid, color: "#FD6389" },
    { tag: t.link, color: "#7CDCE7", textDecoration: "underline" },
    { tag: t.emphasis, color: "#AFAFAF", fontStyle: "italic" },
    { tag: t.strong, color: "#EEEEEE", fontWeight: "700" },
  ],
});

export const EDITOR_THEME_EXT: Record<EditorThemeId, Extension> = {
  atomone,
  aura,
  copilot,
  "github-dark": githubDark,
  "github-light": githubLight,
  nord,
  sobrio,
  "tokyo-night": tokyoNight,
  vesper,
  "xcode-dark": xcodeDark,
  "xcode-light": xcodeLight,
};
