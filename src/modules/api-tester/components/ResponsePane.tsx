import { useState, useEffect, useRef } from "react";
import type { ApiResponse } from "../types";
import { cn } from "@/lib/utils";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { tokyoNight } from "@uiw/codemirror-theme-tokyo-night";
import type { EditorView } from "@codemirror/view";

export function ResponsePane({
  response,
  loading,
}: {
  response: ApiResponse | null;
  loading: boolean;
}) {
  const [tab, setTab] = useState<"body" | "headers">("body");
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  const contentType = response?.headers?.["content-type"] ?? response?.headers?.["Content-Type"] ?? "";
  const isEventStream = contentType.includes("text/event-stream");

  useEffect(() => {
    if (tab !== "body") return;
    if (isEventStream && bodyRef.current) {
      // scroll to bottom as new chunks arrive (event-stream view)
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
      return;
    }
    if (editorViewRef.current) {
      // scroll to bottom for CodeMirror view
      const scrollDom = editorViewRef.current.scrollDOM;
      scrollDom.scrollTop = scrollDom.scrollHeight;
    }
  }, [response?.body, tab, isEventStream]);

  if (!response) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <span className={cn("text-sm", loading && "animate-pulse")}>
          {loading ? "Sending request..." : "No response yet"}
        </span>
      </div>
    );
  }

  const isSuccess = response.status >= 200 && response.status < 300;

  let formattedBody = response.body;
  let isJson = false;

  if (contentType.includes("application/json")) {
    try {
      formattedBody = JSON.stringify(JSON.parse(response.body), null, 2);
      isJson = true;
    } catch {
      // ignore
    }
  }

  const handleCopy = async () => {
    const textToCopy = tab === "headers"
      ? Object.entries(response.headers)
          .map(([key, value]) => `${key}: ${value}`)
          .join("\n")
      : formattedBody;

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }

    window.setTimeout(() => setCopyState("idle"), 1500);
  };

  return (
    <div className="flex h-full flex-col border-t border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setTab("body")}
            className={cn(
              "text-sm font-medium pb-1 border-b-2",
              tab === "body" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Body
          </button>
          <button
            onClick={() => setTab("headers")}
            className={cn(
              "text-sm font-medium pb-1 border-b-2",
              tab === "headers" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Headers
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleCopy}
            className={cn(
              "rounded border border-border px-2 py-1 text-xs",
              copyState === "copied" && "border-green-500 text-green-500",
              copyState === "error" && "border-red-500 text-red-500"
            )}
          >
            {copyState === "copied"
              ? "Copied"
              : copyState === "error"
                ? "Copy failed"
                : tab === "headers"
                  ? "Copy headers"
                  : "Copy body"}
          </button>
          <div className="flex items-center gap-4 text-xs">
            <span className={cn("font-bold", isSuccess ? "text-green-500" : "text-red-500")}>
              {response.status} {response.statusText}
            </span>
            {loading && <span className="text-muted-foreground animate-pulse">Streaming...</span>}
            <span className="text-muted-foreground">{response.timeMs} ms</span>
            <span className="text-muted-foreground">{(response.sizeBytes / 1024).toFixed(2)} KB</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {response.isError && (
          <div className="mb-4 text-red-500 text-sm">
            Error: {response.errorMsg}
          </div>
        )}

        {tab === "body" && (
          <div
            ref={bodyRef}
            className={cn(
              "h-full border border-border rounded",
              isEventStream ? "overflow-y-auto" : "overflow-hidden"
            )}
          >
            {isEventStream ? (
              <pre className="p-3 text-sm font-mono whitespace-pre-wrap break-words">
                {formattedBody || ""}
              </pre>
            ) : (
              <CodeMirror
                value={formattedBody}
                height="100%"
                extensions={isJson ? [json()] : []}
                theme={tokyoNight}
                readOnly
                editable={false}
                className="h-full text-sm"
                onCreateEditor={(view) => {
                  editorViewRef.current = view;
                }}
              />
            )}
          </div>
        )}

        {tab === "headers" && (
          <div className="rounded border border-border overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                <tr>
                  <th className="p-2 border-r border-border">Key</th>
                  <th className="p-2">Value</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(response.headers).map(([key, value]) => (
                  <tr key={key} className="border-b border-border last:border-0">
                    <td className="p-2 border-r border-border font-medium">{key}</td>
                    <td className="p-2 break-all">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
