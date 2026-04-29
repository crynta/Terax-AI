import {
  Prec,
  StateEffect,
  StateField,
  type Extension,
  type Transaction,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  keymap,
  ViewPlugin,
  WidgetType,
  type PluginValue,
  type ViewUpdate,
} from "@codemirror/view";
import { requestCompletion, type CompletionDeps } from "./provider";

export type AutocompletePrefs = CompletionDeps & {
  enabled: boolean;
};

export type AutocompleteContext = {
  getPrefs: () => AutocompletePrefs;
  /** Resolves the path of the file currently displayed by the editor. */
  getPath: () => string | null;
  /** Resolves a coarse language hint (e.g. `"typescript"`, `"python"`). */
  getLanguage: () => string | null;
};

type Suggestion = {
  /** Document position where ghost text starts. */
  from: number;
  /** Insertion text (only the part NOT yet typed). */
  text: string;
};

const setSuggestion = StateEffect.define<Suggestion | null>();

const suggestionField = StateField.define<Suggestion | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setSuggestion)) return e.value;
    }
    if (!value) return value;
    // Clear on doc change unless the change is exactly extending the prefix
    // toward the suggestion (typing the next chars of the ghost).
    if (tr.docChanged) {
      const next = consumeIfTypedAhead(value, tr);
      return next;
    }
    if (tr.selection) return null;
    return value;
  },
});

function consumeIfTypedAhead(
  current: Suggestion,
  tr: Transaction,
): Suggestion | null {
  // If the user typed exactly the next character(s) of the suggestion at the
  // ghost-text origin, shrink the suggestion instead of clearing it.
  let consumed: string | null = null;
  let originDelta = 0;
  let abort = false;
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    if (abort) return;
    const ins = inserted.toString();
    if (fromA !== toA || fromA !== current.from || !ins) {
      abort = true;
      return;
    }
    if (current.text.startsWith(ins)) {
      consumed = ins;
      originDelta = ins.length;
    } else {
      abort = true;
    }
  });
  if (abort || !consumed) return null;
  const remaining = current.text.slice((consumed as string).length);
  if (!remaining) return null;
  return { from: current.from + originDelta, text: remaining };
}

class GhostWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  override eq(other: GhostWidget): boolean {
    return other.text === this.text;
  }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-ai-ghost";
    // Preserve newlines: split into spans separated by <br>.
    const lines = this.text.split("\n");
    lines.forEach((line, i) => {
      if (i > 0) span.appendChild(document.createElement("br"));
      span.appendChild(document.createTextNode(line));
    });
    return span;
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

const ghostTheme = EditorView.theme({
  ".cm-ai-ghost": {
    opacity: "0.45",
    fontStyle: "italic",
    pointerEvents: "none",
  },
});

const ghostDecorations = EditorView.decorations.compute(
  [suggestionField],
  (state) => {
    const sug = state.field(suggestionField);
    if (!sug) return Decoration.none;
    return Decoration.set([
      Decoration.widget({
        widget: new GhostWidget(sug.text),
        side: 1,
      }).range(sug.from),
    ]);
  },
);

const DEBOUNCE_MS = 500;
const MIN_PREFIX_CHARS = 2;

class CompletionDriver implements PluginValue {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private controller: AbortController | null = null;
  private lastPos = -1;

  constructor(
    private readonly view: EditorView,
    private readonly ctx: AutocompleteContext,
  ) {}

  update(u: ViewUpdate) {
    if (u.docChanged || u.selectionSet) {
      this.scheduleOrClear();
    }
  }

  destroy() {
    this.cancelInFlight();
    if (this.timer) clearTimeout(this.timer);
  }

  private scheduleOrClear() {
    const prefs = this.ctx.getPrefs();
    if (!prefs.enabled) {
      console.debug("[autocomplete] disabled in prefs", prefs);
      this.clear();
      return;
    }
    const sel = this.view.state.selection.main;
    if (sel.from !== sel.to) {
      this.clear();
      return;
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.fire(), DEBOUNCE_MS);
  }

  private clear() {
    this.cancelInFlight();
    if (this.view.state.field(suggestionField)) {
      this.view.dispatch({ effects: setSuggestion.of(null) });
    }
  }

  private cancelInFlight() {
    if (this.controller) {
      this.controller.abort();
      this.controller = null;
    }
  }

  private async fire() {
    const prefs = this.ctx.getPrefs();
    if (!prefs.enabled) return;
    const state = this.view.state;
    const sel = state.selection.main;
    if (sel.from !== sel.to) return;

    const cursor = sel.from;
    if (cursor === this.lastPos && state.field(suggestionField)) {
      // already have a suggestion at this position
      return;
    }
    this.lastPos = cursor;

    const doc = state.doc;
    const prefix = doc.sliceString(Math.max(0, cursor - 4000), cursor);
    const suffix = doc.sliceString(cursor, Math.min(doc.length, cursor + 2000));

    if (prefix.trim().length < MIN_PREFIX_CHARS) return;

    this.cancelInFlight();
    this.controller = new AbortController();
    const signal = this.controller.signal;

    console.debug("[autocomplete] firing", {
      provider: prefs.provider,
      modelId: prefs.modelId,
      hasKey: !!prefs.keys[prefs.provider],
      prefixLen: prefix.length,
    });

    try {
      const text = await requestCompletion(
        {
          prefix,
          suffix,
          filename: this.ctx.getPath(),
          language: this.ctx.getLanguage(),
        },
        prefs,
        signal,
      );
      if (signal.aborted) return;
      console.debug("[autocomplete] response", { raw: text, len: text.length });
      const trimmed = trimSuggestion(text, suffix);
      console.debug("[autocomplete] trimmed", { trimmed, len: trimmed.length });
      if (!trimmed) {
        this.view.dispatch({ effects: setSuggestion.of(null) });
        return;
      }
      // Verify cursor hasn't moved away in the meantime.
      const stillThere =
        this.view.state.selection.main.from === cursor &&
        this.view.state.selection.main.to === cursor;
      if (!stillThere) {
        console.debug("[autocomplete] cursor moved, dropping suggestion");
        return;
      }
      this.view.dispatch({
        effects: setSuggestion.of({ from: cursor, text: trimmed }),
      });
    } catch (err) {
      if (signal.aborted) return;
      console.error("[autocomplete] request failed:", err);
    }
  }
}

/** Trim trailing text the user already has after the cursor. */
function trimSuggestion(suggestion: string, suffix: string): string {
  if (!suggestion) return "";
  // If the model regurgitated the suffix, drop the overlap.
  let cut = suggestion.length;
  const maxOverlap = Math.min(suggestion.length, suffix.length);
  for (let n = maxOverlap; n > 0; n--) {
    if (suggestion.slice(suggestion.length - n) === suffix.slice(0, n)) {
      cut = suggestion.length - n;
      break;
    }
  }
  return suggestion.slice(0, cut).replace(/\s+$/, "");
}

function acceptSuggestion(view: EditorView): boolean {
  const sug = view.state.field(suggestionField, false);
  if (!sug) return false;
  view.dispatch({
    changes: { from: sug.from, to: sug.from, insert: sug.text },
    selection: { anchor: sug.from + sug.text.length },
    effects: setSuggestion.of(null),
    userEvent: "input.complete.ai",
  });
  return true;
}

function dismissSuggestion(view: EditorView): boolean {
  const sug = view.state.field(suggestionField, false);
  if (!sug) return false;
  view.dispatch({ effects: setSuggestion.of(null) });
  return true;
}

export function inlineCompletion(ctx: AutocompleteContext): Extension {
  return [
    suggestionField,
    ghostDecorations,
    ghostTheme,
    ViewPlugin.define((view) => new CompletionDriver(view, ctx)),
    Prec.highest(
      keymap.of([
        { key: "Tab", run: acceptSuggestion },
        { key: "Escape", run: dismissSuggestion },
      ]),
    ),
  ];
}
