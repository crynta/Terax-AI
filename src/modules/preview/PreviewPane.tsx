import React from "react";
import { Alert02Icon, Globe02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  useCallback,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  PreviewAddressBar,
  type PreviewAddressBarHandle,
} from "./PreviewAddressBar";
import { Streamdown, defaultRehypePlugins } from "streamdown";
import { MarkdownCode } from "@/components/ai-elements/markdown-code";
import { convertFileSrc } from "@tauri-apps/api/core";

export type PreviewPaneHandle = {
  reload: () => void;
  focusAddressBar: () => void;
  getUrl: () => string;
};

type Props = {
  url: string;
  visible: boolean;
  onUrlChange: (url: string) => void;
};

// Tear the iframe down after this much invisibility — a background dev
// server page can hold hundreds of MB inside the WebView.
const SUSPEND_AFTER_MS = 30_000;

/**
 * Build an asset-protocol URL for use as an **iframe src**, preserving real `/`
 * separators so the browser can resolve relative sub-resources (CSS, JS, etc.).
 * Not suitable for direct file fetches — see `convertFileSrc` for that.
 *
 * How the two URL styles differ:
 *   convertFileSrc("/Users/.../f.html") → asset://localhost/%2FUsers%2F...%2Ff.html
 *     Tauri decodes %2F → /, finds the file ✓   Relative URLs break ✗
 *   assetUrlForFile("/Users/.../f.html") → asset://localhost/Users/.../f.html
 *     Browser resolves relative URLs correctly ✓   Tauri sees 'Users/...' (no /) ✗
 * For iframes we accept the latter trade-off; for fetch() we use convertFileSrc.
 */
function assetUrlForFile(absPath: string): string {
  const isWindows = navigator.userAgent.includes("Windows");
  // Strip the leading slash and encode each segment individually so the browser
  // keeps real "/" separators and can resolve relative sub-resources in iframes.
  const stripped = absPath.startsWith("/") ? absPath.slice(1) : absPath;
  const encoded = stripped
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
  return isWindows
    ? `http://asset.localhost/${encoded}`
    : `asset://localhost/${encoded}`;
}

/**
 * Rewrite relative image paths (both Markdown and HTML formats) to fetchable
 * asset:// URLs. Uses convertFileSrc() which encodes the entire absolute path
 * as a single URI component (%2FUsers%2F...). Tauri decodes %2F back to /
 * giving the correct filesystem path — unlike per-segment encoding where the
 * browser strips the leading slash and Tauri looks up "Users/..." (not found).
 */
function resolveMarkdownRelativePaths(markdown: string, fileDir: string): string {
  if (!fileDir) return markdown;

  const isRelative = (path: string) =>
    !path.startsWith("http://") &&
    !path.startsWith("https://") &&
    !path.startsWith("data:") &&
    !path.startsWith("file://") &&
    !path.startsWith("asset://") &&
    !path.startsWith("http://asset.localhost/") &&
    !path.startsWith("/");

  const toFetchUrl = (relPath: string): string => {
    let clean = relPath.trim();
    if (clean.startsWith("./")) clean = clean.slice(2);
    // convertFileSrc encodes the whole path with encodeURIComponent so slashes
    // become %2F. Tauri decodes %2F → / giving the correct absolute file path.
    return convertFileSrc(`${fileDir}${clean}`);
  };

  // 1. Markdown images: ![alt](path)
  let resolved = markdown.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (match, alt, src) => {
      const parts = src.split(/\s+/);
      const pathOnly = parts[0];
      const title = parts.slice(1).join(" ");
      if (!isRelative(pathOnly)) return match;
      const fetchUrl = toFetchUrl(pathOnly);
      console.log("[PreviewPane] md-img:", pathOnly, "→", fetchUrl);
      return `![${alt}](${fetchUrl}${title ? " " + title : ""})`;
    },
  );

  // 2. HTML images: <img src="path" ...> or <img ... src="path" ...>
  resolved = resolved.replace(
    /<img\b([^>]*?)\bsrc=(["'])([^"'\s>]+)\2([^>]*?)(\/?)>/gi,
    (match, before, quote, src, after, selfClose) => {
      if (!isRelative(src)) return match;
      const fetchUrl = toFetchUrl(src);
      console.log("[PreviewPane] html-img:", src, "→", fetchUrl);
      return `<img${before || " "}src=${quote}${fetchUrl}${quote}${after}${selfClose}>`;
    },
  );

  return resolved;
}

function resolveHtmlRelativePaths(html: string, fileDir: string): string {
  if (!fileDir) return html;

  const isRelative = (path: string) =>
    !path.startsWith("http://") &&
    !path.startsWith("https://") &&
    !path.startsWith("//") &&
    !path.startsWith("data:") &&
    !path.startsWith("file://") &&
    !path.startsWith("asset://") &&
    !path.startsWith("http://asset.localhost/") &&
    !path.startsWith("/") &&
    !path.startsWith("#") &&
    !path.startsWith("?") &&
    !path.startsWith("mailto:") &&
    !path.startsWith("tel:");

  const toFetchUrl = (relPath: string): string => {
    let clean = relPath.trim();
    if (clean.startsWith("./")) clean = clean.slice(2);
    return convertFileSrc(`${fileDir}${clean}`);
  };

  let resolved = html.replace(
    /<link\b([^>]*?)\bhref=("|')([^"'\s>]+)\2([^>]*?)>/gi,
    (match, before, quote, href, after) => {
      if (!isRelative(href)) return match;
      return `<link${before || " "}href=${quote}${toFetchUrl(href)}${quote}${after}>`;
    },
  );

  resolved = resolved.replace(
    /<script\b([^>]*?)\bsrc=("|')([^"'\s>]+)\2([^>]*?)>([\s\S]*?)<\/script>/gi,
    (match, before, quote, src, after, body) => {
      if (!isRelative(src)) return match;
      return `<script${before || " "}src=${quote}${toFetchUrl(src)}${quote}${after}>${body}</script>`;
    },
  );

  resolved = resolved.replace(
    /<img\b([^>]*?)\bsrc=("|')([^"'\s>]+)\2([^>]*?)(\/?)>/gi,
    (match, before, quote, src, after, selfClose) => {
      if (!isRelative(src)) return match;
      return `<img${before || " "}src=${quote}${toFetchUrl(src)}${quote}${after}${selfClose}>`;
    },
  );

  return resolved;
}

function resolveHtmlLinkTarget(href: string, filePath: string, fileDir: string): string | null {
  const trimmed = href.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return null;
  if (trimmed.startsWith("//")) return null;
  if (trimmed.startsWith("data:")) return null;
  if (trimmed.startsWith("file://")) return trimmed;
  if (trimmed.startsWith("asset://")) return trimmed;
  if (trimmed.startsWith("http://asset.localhost/")) return trimmed;
  if (trimmed.startsWith("mailto:") || trimmed.startsWith("tel:")) return null;
  if (trimmed.startsWith("#") || trimmed.startsWith("?")) return null;

  const hashIndex = trimmed.indexOf("#");
  const queryIndex = trimmed.indexOf("?");
  const cutIndex =
    hashIndex === -1
      ? queryIndex
      : queryIndex === -1
        ? hashIndex
        : Math.min(hashIndex, queryIndex);
  const suffix = cutIndex === -1 ? "" : trimmed.slice(cutIndex);
  const hrefPath = cutIndex === -1 ? trimmed : trimmed.slice(0, cutIndex);

  const normalizePath = (path: string) => {
    if (path.endsWith("/")) return `${path}index.html`;
    if (!path.includes(".")) return `${path}.html`;
    return path;
  };

  if (hrefPath.startsWith("/")) {
    const relPath = hrefPath.replace(/^\/+/, "");
    const firstSegment = relPath.split("/")[0] || "";
    const marker = firstSegment ? `/${firstSegment}/` : "";
    let base = fileDir;
    if (marker) {
      const idx = filePath.indexOf(marker);
      if (idx !== -1) {
        base = filePath.slice(0, idx + 1);
      }
    }
    return `file://${normalizePath(`${base}${relPath}`)}${suffix}`;
  }

  return new URL(normalizePath(hrefPath), `file://${fileDir}`).toString() + suffix;
}

/**
 * Module-level blob cache: assetUrl → blobUrl.
 * Persists across poll cycles so images are only fetched once per session.
 */
const _blobCache = new Map<string, string>();

const streamdownRehypePlugins = (() => {
  const { raw, sanitize, harden } = defaultRehypePlugins;
  if (Array.isArray(sanitize) && sanitize.length === 2) {
    const [sanitizePlugin, sanitizeSchema] = sanitize as [
      (...args: unknown[]) => unknown,
      Record<string, unknown>
    ];
    const protocols =
      typeof sanitizeSchema?.protocols === "object" && sanitizeSchema?.protocols
        ? (sanitizeSchema.protocols as Record<string, string[]>)
        : {};
    const srcProtocols = new Set([...(protocols.src ?? []), "blob", "asset"]);
    return [
      raw,
      [
        sanitizePlugin,
        {
          ...sanitizeSchema,
          protocols: {
            ...protocols,
            src: Array.from(srcProtocols),
          },
        },
      ],
      harden,
    ];
  }

  return [raw, sanitize, harden].filter(Boolean) as unknown[];
})();

/**
 * Swap every asset:// (or http://asset.localhost/) URL in `markdown` for a
 * pre-fetched blob: URL. Streamdown's linkSafety="harden" allows blob: but
 * strips asset://, so this conversion must happen before the string is passed
 * to <Streamdown>.
 */
async function blobifyMarkdown(markdown: string): Promise<string> {
  // Match both convertFileSrc-style (%2F-encoded) and plain asset:// URLs.
  const assetUrlRegex =
    /(asset:\/\/localhost\/[^\s"')]+|http:\/\/asset\.localhost\/[^\s"')]+)/g;
  const hits = new Set<string>(markdown.match(assetUrlRegex) ?? []);
  if (hits.size === 0) return markdown;

  // Fetch any uncached URLs in parallel.
  await Promise.all(
    [...hits].map(async (url) => {
      if (_blobCache.has(url)) return;
      try {
        const blob = await fetch(url).then((r) => r.blob());
        _blobCache.set(url, URL.createObjectURL(blob));
        console.log("[PreviewPane] cached blob for:", url);
      } catch (e) {
        console.warn("[PreviewPane] asset fetch failed:", url, e);
      }
    }),
  );

  // Replace all asset:// occurrences with their blob: counterparts.
  return markdown.replace(assetUrlRegex, (url) => _blobCache.get(url) ?? url);
}

/**
 * Markdown preview container.
 * By the time `markdownContent` reaches here, every local image URL has already
 * been converted to a blob: URL by `blobifyMarkdown`, so Streamdown's
 * linkSafety="harden" filter never sees an asset:// URL and never blocks them.
 */
function MarkdownPreview({ markdownContent }: { markdownContent: string }) {
  const MarkdownTable: React.ComponentType<
    React.TableHTMLAttributes<HTMLTableElement> & { node?: unknown }
  > = (props) => (
    <div className="not-prose my-2 overflow-x-auto rounded-md border border-border/50">
      <table className="w-full text-sm" {...props} />
    </div>
  );

  return (
    <div className="h-full w-full overflow-y-auto bg-background p-6 text-foreground">
      <Streamdown
        linkSafety={{ enabled: true }}
        rehypePlugins={streamdownRehypePlugins as any}
        components={{ code: MarkdownCode as any, table: MarkdownTable }}
      >
        {markdownContent}
      </Streamdown>
    </div>
  );
}

export const PreviewPane = forwardRef<PreviewPaneHandle, Props>(
  function PreviewPane({ url, visible, onUrlChange }, ref) {
    // `nonce` is part of the iframe `key`. Bumping it remounts the iframe,
    // which is the only reliable cross-origin reload (calling
    // contentWindow.location.reload() throws on cross-origin frames).
    const [nonce, setNonce] = useState(0);
    const [loaded, setLoaded] = useState(visible);
    const addressRef = useRef<PreviewAddressBarHandle>(null);
    const htmlFrameRef = useRef<HTMLIFrameElement>(null);
    const htmlCleanupRef = useRef<(() => void) | null>(null);

    const [liveNonce, setLiveNonce] = useState(0);
    const [markdownContent, setMarkdownContent] = useState("");
    const [htmlContent, setHtmlContent] = useState("");

    const isFile = url.startsWith("file://");
    const filePath = isFile ? decodeURIComponent(url.slice(7)) : "";
    const isMarkdown =
      isFile && (filePath.endsWith(".md") || filePath.endsWith(".markdown"));
    const isHtml =
      isFile &&
      (filePath.endsWith(".html") ||
        filePath.endsWith(".htm") ||
        filePath.endsWith(".xhtml"));

    const fileDir = isFile
      ? filePath.slice(0, filePath.lastIndexOf("/") + 1)
      : "";

    // For iframes: URL with real slashes so relative sub-resources resolve.
    // For fetch: convertFileSrc is fine (single-file fetch doesn't need path resolution).
    const iframeSrc = isFile ? assetUrlForFile(filePath) : url;
    const fetchUrl = isFile ? convertFileSrc(filePath) : url;

    // Poll for file changes — drives live preview.
    useEffect(() => {
      if (!isFile) return;
      let canceled = false;
      let lastText = "";

      const check = async () => {
        try {
          const text = await fetch(fetchUrl).then((r) => r.text());
          if (canceled) return;
          if (lastText !== "" && lastText !== text) {
            setLiveNonce((n) => n + 1);
          }
          lastText = text;
          if (isMarkdown) {
            // Step 1: rewrite relative paths → asset:// URLs (sync)
            const withAssetUrls = resolveMarkdownRelativePaths(text, fileDir);
            // Step 2: pre-fetch every asset:// URL → blob: URL so Streamdown's
            //         linkSafety="harden" filter never sees a non-https URL.
            const withBlobUrls = await blobifyMarkdown(withAssetUrls);
            if (!canceled) setMarkdownContent(withBlobUrls);
          } else if (isHtml) {
            const withResolvedUrls = resolveHtmlRelativePaths(text, fileDir);
            if (!canceled) setHtmlContent(withResolvedUrls);
          }
        } catch {
          // ignore transient fetch errors
        }
      };
      check();
      const timer = setInterval(check, 1000);
      return () => {
        canceled = true;
        clearInterval(timer);
      };
    }, [isFile, fetchUrl, isMarkdown, isHtml, fileDir]);

    const attachHtmlLinkHandler = useCallback(() => {
      if (!isHtml) return;
      const frame = htmlFrameRef.current;
      const doc = frame?.contentDocument;
      if (!doc) return;

      const onClick = (event: MouseEvent) => {
        const target = event.target as Element | null;
        const anchor = target?.closest("a") as HTMLAnchorElement | null;
        if (!anchor) return;
        const href = anchor.getAttribute("href")?.trim();
        if (!href) return;
        const nextUrl = resolveHtmlLinkTarget(href, filePath, fileDir);
        if (!nextUrl) return;
        event.preventDefault();
        event.stopPropagation();
        onUrlChange(nextUrl);
      };

      doc.addEventListener("click", onClick);
      htmlCleanupRef.current?.();
      htmlCleanupRef.current = () => doc.removeEventListener("click", onClick);
    }, [isHtml, fileDir, filePath, onUrlChange]);

    useEffect(() => {
      return () => {
        htmlCleanupRef.current?.();
        htmlCleanupRef.current = null;
      };
    }, []);

    useEffect(() => {
      if (visible) {
        setLoaded(true);
        return;
      }
      const t = setTimeout(() => setLoaded(false), SUSPEND_AFTER_MS);
      return () => clearTimeout(t);
    }, [visible]);

    useImperativeHandle(
      ref,
      () => ({
        reload: () => {
          setLoaded(true);
          setNonce((n) => n + 1);
        },
        focusAddressBar: () => addressRef.current?.focus(),
        getUrl: () => url,
      }),
      [url],
    );

    const showXfoHint = url ? !isLocalUrl(url) && !isFile : false;

    return (
      <div
        className="flex h-full w-full flex-col overflow-hidden rounded-md border border-border/60 bg-background"
        style={{
          visibility: visible ? "visible" : "hidden",
          pointerEvents: visible ? "auto" : "none",
        }}
      >
        <PreviewAddressBar
          ref={addressRef}
          url={url}
          onSubmit={onUrlChange}
          onReload={() => setNonce((n) => n + 1)}
        />
        {showXfoHint ? (
          <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-border/60 bg-amber-500/8 px-3 text-[11px] text-amber-600 dark:text-amber-400">
            <HugeiconsIcon
              icon={Alert02Icon}
              size={12}
              strokeWidth={1.75}
              className="shrink-0"
            />
            <span className="truncate">
              Many public sites refuse to embed (X-Frame-Options). If the page
              is blank, open it externally.
            </span>
          </div>
        ) : null}
        <div
          className={
            url
              ? "relative min-h-0 flex-1 bg-white"
              : "relative min-h-0 flex-1 bg-background"
          }
        >
          {url ? (
            loaded ? (
              isMarkdown ? (
                <MarkdownPreview markdownContent={markdownContent} />
              ) : isHtml ? (
                <iframe
                  ref={htmlFrameRef}
                  key={`${filePath}#${nonce}-${liveNonce}`}
                  srcDoc={htmlContent}
                  title="Preview"
                  className="h-full w-full border-0"
                  onLoad={attachHtmlLinkHandler}
                  allow="clipboard-read; clipboard-write"
                />
              ) : (
                <iframe
                  key={`${iframeSrc}#${nonce}-${liveNonce}`}
                  src={iframeSrc}
                  title="Preview"
                  className="h-full w-full border-0"
                  allow="clipboard-read; clipboard-write; fullscreen"
                />
              )
            ) : (
              <SuspendedState
                onReload={() => {
                  setLoaded(true);
                  setNonce((n) => n + 1);
                }}
              />
            )
          ) : (
            <EmptyState />
          )}
        </div>
      </div>
    );
  },
);

function SuspendedState({ onReload }: { onReload: () => void }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex size-10 items-center justify-center rounded-2xl border border-border/60 bg-card text-muted-foreground">
        <HugeiconsIcon icon={Globe02Icon} size={18} strokeWidth={1.5} />
      </div>
      <div className="space-y-1">
        <p className="text-[12.5px] font-medium text-foreground">
          Preview suspended
        </p>
        <p className="max-w-xs text-[11px] leading-relaxed text-muted-foreground">
          Released to free memory after sitting in the background.
        </p>
      </div>
      <button
        type="button"
        onClick={onReload}
        className="rounded-md border border-border/60 bg-card px-3 py-1 text-[11px] hover:bg-accent/50"
      >
        Reload
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl border border-border/60 bg-card text-muted-foreground">
        <HugeiconsIcon icon={Globe02Icon} size={20} strokeWidth={1.5} />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">
          Nothing to preview yet
        </p>
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
          Type a URL above, or open the{" "}
          <span className="rounded bg-muted px-1 py-0.5 font-mono text-[10.5px]">
            Ports
          </span>{" "}
          dropdown to jump straight to your running dev server. Public sites
          often block embedding — open them in your browser via the link icon
          if you see a blank page.
        </p>
      </div>
    </div>
  );
}

function isLocalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const h = u.hostname;
    return (
      h === "localhost" ||
      h === "127.0.0.1" ||
      h === "0.0.0.0" ||
      h === "[::1]" ||
      h.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}
