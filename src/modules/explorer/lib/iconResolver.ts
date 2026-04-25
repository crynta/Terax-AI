import manifest from "material-icon-theme/dist/material-icons.json";
import { EXT_TO_LANGUAGE_ID } from "./constants";

type Manifest = {
  iconDefinitions: Record<string, { iconPath: string }>;
  fileNames: Record<string, string>;
  fileExtensions: Record<string, string>;
  folderNames: Record<string, string>;
  folderNamesExpanded: Record<string, string>;
  languageIds: Record<string, string>;
  file: string;
  folder: string;
  folderExpanded: string;
};

const m = manifest as unknown as Manifest;

// Vite eagerly resolves every SVG in material-icon-theme to a hashed asset URL.
// The JS cost is the path→URL map only (~1500 entries); SVG bytes are fetched
// lazily by <img>.
const iconUrls = import.meta.glob<string>(
  "/node_modules/material-icon-theme/icons/*.svg",
  { query: "?url", import: "default", eager: true },
);

// Build a basename (without .svg) → URL map once.
const urlByName: Record<string, string> = {};
for (const [path, url] of Object.entries(iconUrls)) {
  const base = path.slice(path.lastIndexOf("/") + 1, -".svg".length);
  urlByName[base] = url;
}

function resolveUrl(iconName: string | undefined): string | null {
  if (!iconName) return null;
  const def = m.iconDefinitions[iconName];
  if (!def) return null;
  // iconPath looks like "./../icons/typescript.svg"
  const base = def.iconPath.slice(
    def.iconPath.lastIndexOf("/") + 1,
    -".svg".length,
  );
  return urlByName[base] ?? null;
}

function extOf(name: string): string {
  const lower = name.toLowerCase();
  // Handle compound extensions used by the manifest (e.g. ".test.ts" → "test.ts").
  const dot = lower.indexOf(".");
  if (dot === -1 || dot === lower.length - 1) return "";
  return lower.slice(dot + 1);
}

export function fileIconUrl(name: string): string {
  const lower = name.toLowerCase();

  const byName = m.fileNames[lower];
  if (byName) {
    const url = resolveUrl(byName);
    if (url) return url;
  }

  // Try progressively shorter extensions: "test.ts" → "ts".
  let ext = extOf(lower);
  while (ext) {
    const iconName = m.fileExtensions[ext];
    if (iconName) {
      const url = resolveUrl(iconName);
      if (url) return url;
    }
    // Fallback: ext → language id → icon (covers ts/js/html/etc.).
    const langId = EXT_TO_LANGUAGE_ID[ext];
    if (langId) {
      const iconByLang = m.languageIds[langId];
      if (iconByLang) {
        const url = resolveUrl(iconByLang);
        if (url) return url;
      }
    }
    const nextDot = ext.indexOf(".");
    if (nextDot === -1) break;
    ext = ext.slice(nextDot + 1);
  }

  return resolveUrl(m.file) ?? "";
}

export function folderIconUrl(name: string, expanded: boolean): string {
  const lower = name.toLowerCase();

  if (expanded) {
    const byName = m.folderNamesExpanded[lower];
    if (byName) {
      const url = resolveUrl(byName);
      if (url) return url;
    }
  } else {
    const byName = m.folderNames[lower];
    if (byName) {
      const url = resolveUrl(byName);
      if (url) return url;
    }
  }

  return resolveUrl(expanded ? m.folderExpanded : m.folder) ?? "";
}
