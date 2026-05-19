// Maps file extensions / canonical filenames to a (label, assetKey) pair used
// by Discord Rich Presence:
//   - label  — human-readable language, shown as `large_text` hover tooltip.
//   - assetKey — Discord asset key for the small overlay icon. Optional;
//                Discord silently omits the icon if the key isn't uploaded
//                to the Application's Rich Presence art assets.
//
// Names mirror `andweeb/presence.nvim`'s convention so a maintainer can reuse
// an existing Neovim presence asset pack if desired.

type Entry = { label: string; key: string };

// Asset keys mirror andweeb/presence.nvim's Dropbox pack so the same icons
// uploaded to a Discord application work for both editors.
const EXTENSIONS: Record<string, Entry> = {
  ts: { label: "TypeScript", key: "typescript" },
  tsx: { label: "TypeScript React", key: "react" },
  js: { label: "JavaScript", key: "javascript" },
  jsx: { label: "JavaScript React", key: "react" },
  mjs: { label: "JavaScript", key: "javascript" },
  cjs: { label: "JavaScript", key: "javascript" },
  rs: { label: "Rust", key: "rust" },
  go: { label: "Go", key: "go" },
  py: { label: "Python", key: "python" },
  rb: { label: "Ruby", key: "ruby" },
  php: { label: "PHP", key: "php" },
  java: { label: "Java", key: "java" },
  kt: { label: "Kotlin", key: "kotlin" },
  swift: { label: "Swift", key: "swift" },
  c: { label: "C", key: "c" },
  h: { label: "C header", key: "c" },
  cpp: { label: "C++", key: "c_plus_plus" },
  cc: { label: "C++", key: "c_plus_plus" },
  cxx: { label: "C++", key: "c_plus_plus" },
  hpp: { label: "C++ header", key: "c_plus_plus" },
  cs: { label: "C#", key: "c_sharp" },
  fs: { label: "F#", key: "f_sharp" },
  lua: { label: "Lua", key: "lua" },
  sh: { label: "Shell", key: "shell" },
  bash: { label: "Bash", key: "shell" },
  zsh: { label: "Zsh", key: "shell" },
  fish: { label: "Fish shell", key: "fish" },
  ps1: { label: "PowerShell", key: "powershell" },
  sql: { label: "SQL", key: "database" },
  html: { label: "HTML", key: "html" },
  htm: { label: "HTML", key: "html" },
  css: { label: "CSS", key: "css" },
  scss: { label: "Sass", key: "sass" },
  sass: { label: "Sass", key: "sass" },
  less: { label: "Less", key: "less" },
  json: { label: "JSON", key: "json" },
  jsonc: { label: "JSON", key: "json" },
  yaml: { label: "YAML", key: "yaml" },
  yml: { label: "YAML", key: "yaml" },
  toml: { label: "TOML", key: "config" },
  xml: { label: "XML", key: "xml" },
  md: { label: "Markdown", key: "markdown" },
  mdx: { label: "Markdown", key: "markdown" },
  markdown: { label: "Markdown", key: "markdown" },
  txt: { label: "Text", key: "text" },
  vue: { label: "Vue", key: "vue" },
  svelte: { label: "Svelte", key: "svelte" },
  astro: { label: "Astro", key: "astro" },
  dart: { label: "Dart", key: "dart" },
  ex: { label: "Elixir", key: "elixir" },
  exs: { label: "Elixir", key: "elixir" },
  erl: { label: "Erlang", key: "erlang" },
  hs: { label: "Haskell", key: "haskell" },
  ml: { label: "OCaml", key: "ocaml" },
  zig: { label: "Zig", key: "zig" },
  nim: { label: "Nim", key: "nim" },
  scala: { label: "Scala", key: "scala" },
  groovy: { label: "Groovy", key: "groovy" },
  r: { label: "R", key: "r" },
  jl: { label: "Julia", key: "julia" },
  proto: { label: "Protocol Buffers", key: "protobuf" },
  graphql: { label: "GraphQL", key: "graphql" },
  gql: { label: "GraphQL", key: "graphql" },
};

const FILENAMES: Record<string, Entry> = {
  Dockerfile: { label: "Docker", key: "docker" },
  Makefile: { label: "Makefile", key: "code" },
  CMakeLists: { label: "CMake", key: "code" },
  "Cargo.toml": { label: "Rust", key: "cargo" },
  "Cargo.lock": { label: "Rust", key: "cargo" },
  "go.mod": { label: "Go", key: "go" },
  "go.sum": { label: "Go", key: "go" },
  "package.json": { label: "Node.js", key: "nodejs" },
  "pnpm-lock.yaml": { label: "Node.js", key: "nodejs" },
  "yarn.lock": { label: "Node.js", key: "yarn" },
  "tsconfig.json": { label: "TypeScript", key: "typescript" },
};

function lastSegment(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

export type LanguageInfo = { label: string; assetKey: string };

/** Returns label + Discord asset key for a path, or null if unknown. */
export function languageInfo(path: string): LanguageInfo | null {
  const name = lastSegment(path);
  const exact = FILENAMES[name];
  if (exact) return { label: exact.label, assetKey: exact.key };
  const dot = name.lastIndexOf(".");
  if (dot === -1) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  const hit = EXTENSIONS[ext];
  return hit ? { label: hit.label, assetKey: hit.key } : null;
}
