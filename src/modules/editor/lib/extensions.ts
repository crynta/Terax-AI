import { autocompletion, closeBrackets } from "@codemirror/autocomplete";
import {
  bracketMatching,
  foldGutter,
  indentOnInput,
  indentUnit,
} from "@codemirror/language";
import { lintGutter } from "@codemirror/lint";
import { highlightSelectionMatches, search } from "@codemirror/search";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, highlightActiveLine } from "@codemirror/view";

/**
 * Compartments allow dynamic reconfiguration (language swap, wrap toggle,
 * readOnly flip) without rebuilding the editor state.
 */
export const languageCompartment = new Compartment();
export const readOnlyCompartment = new Compartment();
export const wrapCompartment = new Compartment();

/**
 * Extensions shared by every editor instance. Keep this list minimal and
 * non-language-specific; language packs are applied via `languageCompartment`.
 *
 * `basicSetup` from @uiw/react-codemirror covers line numbers, history,
 * default keymaps, etc., so we only add the things it doesn't.
 */
export function buildSharedExtensions(): Extension[] {
  return [
    indentUnit.of("  "),
    EditorState.tabSize.of(2),
    closeBrackets(),
    bracketMatching(),
    indentOnInput(),
    foldGutter(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search({ top: true }),
    autocompletion(),
    // lintGutter shows a dedicated column for diagnostics; stays empty
    // until an LSP or other diagnostic source pushes into it.
    lintGutter(),
    EditorView.theme({
      "&": { height: "100%" },
      ".cm-scroller": {
        fontFamily:
          '"JetBrains Mono", SFMono-Regular, Menlo, monospace',
        fontSize: "13px",
        lineHeight: "1.55",
      },
      ".cm-content": { padding: "8px 0" },
      ".cm-gutters": { borderRight: "none" },
    }),
  ];
}
