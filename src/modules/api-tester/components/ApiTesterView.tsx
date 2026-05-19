import { useEffect, useMemo, useRef, useState } from "react";

import { useApiTesterStore } from "../store/apiTesterStore";
import { Sidebar } from "./Sidebar";
import { RequestEditor } from "./RequestEditor";
import { ResponsePane } from "./ResponsePane";
import type { ApiResponse } from "../types";
import { parseCurl } from "../lib/parseCurl";
import { HugeiconsIcon } from "@hugeicons/react";
import { ComputerTerminal02Icon } from "@hugeicons/core-free-icons";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { createProxyFetch } from "@/modules/ai/lib/proxyFetch";

export function ApiTesterView() {
  const { collections, activeRequestId, updateRequest, createRequest } = useApiTesterStore();
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [curlInput, setCurlInput] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const proxyFetch = useMemo(
    () => createProxyFetch({ allowPrivateNetwork: true }),
    [],
  );

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const setResponseSafe = (
    value: ApiResponse | null | ((prev: ApiResponse | null) => ApiResponse | null)
  ) => {
    if (!isMountedRef.current) return;
    setResponse(value);
  };

  const setLoadingSafe = (value: boolean) => {
    if (!isMountedRef.current) return;
    setLoading(value);
  };

  const activeRequest = collections
    .flatMap((c) => c.requests)
    .find((r) => r.id === activeRequestId);

  const handleSend = async () => {
    if (!activeRequest || loading) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoadingSafe(true);
    setResponseSafe(null);
    const start = performance.now();

    try {
      const headersMap: Record<string, string> = {};
      activeRequest.headers
        .filter((h) => h.enabled && h.key)
        .forEach((h) => {
          headersMap[h.key] = h.value;
        });

      let finalUrl = activeRequest.url;
      try {
        const urlObj = new URL(activeRequest.url);
        activeRequest.queryParams
          .filter((q) => q.enabled && q.key)
          .forEach((q) => {
            urlObj.searchParams.set(q.key, q.value);
          });
        finalUrl = urlObj.toString();
      } catch (e) {
        // Fallback for invalid URLs or relative paths during test
      }

      let bodyData: string | undefined = undefined;
      if (activeRequest.body.type === "raw" && activeRequest.body.content) {
        if (!headersMap["Content-Type"] && !headersMap["content-type"]) {
          headersMap["Content-Type"] =
            activeRequest.body.rawType === "json" ? "application/json" : "text/plain";
        }
        bodyData = activeRequest.body.content;
      }

      const res = await proxyFetch(finalUrl, {
        method: activeRequest.method,
        headers: headersMap,
        body: bodyData,
        signal: controller.signal,
      });
      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      let accumulatedBody = "";
      let sizeBytes = 0;
      setResponseSafe({
        status: res.status,
        statusText: res.statusText,
        headers: responseHeaders,
        body: accumulatedBody,
        timeMs: 0,
        sizeBytes,
        isError: false,
      });

      if (res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done || controller.signal.aborted) break;
          sizeBytes += value.length;
          accumulatedBody += decoder.decode(value, { stream: true });
          setResponseSafe((prev) => prev ? {
            ...prev,
            body: accumulatedBody,
            sizeBytes,
          } : prev);
        }
        accumulatedBody += decoder.decode();
        setResponseSafe((prev) => prev ? {
          ...prev,
          body: accumulatedBody,
          sizeBytes,
        } : prev);
      } else {
        const text = await res.text();
        accumulatedBody = text;
        sizeBytes = new TextEncoder().encode(text).length;
        setResponseSafe((prev) => prev ? {
          ...prev,
          body: accumulatedBody,
          sizeBytes,
        } : prev);
      }

      const end = performance.now();
      setResponseSafe((prev) => prev ? {
        ...prev,
        timeMs: Math.round(end - start),
        sizeBytes,
      } : prev);

    } catch (e: any) {
      if (e?.name === "AbortError") {
        return;
      }
      const end = performance.now();
      setResponseSafe({
        status: 0,
        statusText: "Error",
        headers: {},
        body: "",
        timeMs: Math.round(end - start),
        sizeBytes: 0,
        isError: true,
        errorMsg: e.toString(),
      });
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setLoadingSafe(false);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;
      e.preventDefault();
      e.stopPropagation();
      if (loading) {
        handleStop();
      } else {
        void handleSend();
      }
    };

    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [loading, handleSend, handleStop]);

  const handleImportCurl = () => {
    if (!curlInput.trim()) return;
    const req = parseCurl(curlInput);
    if (req) {
      // Find default collection or uncategorized
      const defaultCol = collections.find((c) => c.name === "Uncategorized") || collections[0];
      const colId = defaultCol ? defaultCol.id : null;
      createRequest(colId, req);
      setCurlInput("");
    } else {
      alert("Failed to parse cURL command");
    }
  };

  return (
    <div className="flex h-full w-full bg-background text-foreground overflow-hidden">
      <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
        <ResizablePanel
          id="api-tester-collections"
          defaultSize="240px"
          minSize="180px"
          maxSize="420px"
        >
          <div className="h-full">
            <Sidebar />
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel id="api-tester-main" minSize="320px">
          <div className="flex h-full flex-col overflow-hidden">
            {activeRequest ? (
              <>
                <div className="flex items-center gap-2 border-b border-border p-4 bg-card shrink-0">
                  <select
                    value={activeRequest.method}
                    onChange={(e) => updateRequest(activeRequest.id, { method: e.target.value as any })}
                    className="bg-transparent text-sm font-bold outline-none text-muted-foreground w-24"
                  >
                    {[
                      "GET",
                      "POST",
                      "PUT",
                      "PATCH",
                      "DELETE",
                      "OPTIONS",
                      "HEAD",
                    ].map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={activeRequest.url}
                    onChange={(e) => updateRequest(activeRequest.id, { url: e.target.value })}
                    placeholder="Enter URL or paste cURL here"
                    onPaste={(e) => {
                      const text = e.clipboardData.getData("Text");
                      if (text.trim().startsWith("curl ")) {
                        e.preventDefault();
                        const req = parseCurl(text);
                        if (req) {
                          updateRequest(activeRequest.id, req);
                        }
                      }
                    }}
                    className="flex-1 bg-transparent px-2 py-1 outline-none font-mono text-sm border border-transparent focus:border-border rounded"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSend}
                      disabled={loading}
                      className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-1.5 rounded text-sm font-medium disabled:opacity-50"
                    >
                      Send
                    </button>
                    {loading && (
                      <button
                        onClick={handleStop}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90 px-4 py-1.5 rounded text-sm font-medium"
                      >
                        Stop
                      </button>
                    )}
                  </div>
                </div>

                <ResizablePanelGroup orientation="vertical" className="flex-1 min-h-0">
                  <ResizablePanel
                    id="api-tester-request"
                    defaultSize="55%"
                    minSize="20%"
                  >
                    <div className="h-full min-h-0 overflow-y-auto">
                      <RequestEditor
                        request={activeRequest}
                        onChange={(updates) => updateRequest(activeRequest.id, updates)}
                      />
                    </div>
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel
                    id="api-tester-response"
                    defaultSize="45%"
                    minSize="20%"
                  >
                    <div className="h-full">
                      <ResponsePane response={response} loading={loading} />
                    </div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center flex-col text-muted-foreground">
                <HugeiconsIcon icon={ComputerTerminal02Icon} size={48} className="mb-4 opacity-20" />
                <p className="mb-8">Select a request from the sidebar or create a new one.</p>

                <div className="w-full max-w-4xl bg-card border border-border rounded-lg shadow-lg p-8">
                  <div className="flex items-start gap-6">
                    <HugeiconsIcon icon={ComputerTerminal02Icon} size={24} className="mt-1 opacity-90" />

                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-lg font-semibold text-foreground">Quick Import cURL</div>
                          <div className="text-sm text-muted-foreground">Paste a cURL command to create a request</div>
                        </div>
                        <div className="text-sm text-muted-foreground hidden sm:block">Tip: Paste a curl command or the raw URL above</div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <textarea
                          value={curlInput}
                          onChange={(e) => setCurlInput(e.target.value)}
                          placeholder={`curl -X POST https://httpbin.org/post -H 'Content-Type: application/json' -d '{"name":"Jane"}'`}
                          className="col-span-2 w-full bg-background border border-border rounded-md p-4 text-sm font-mono h-44 outline-none resize-none placeholder:text-muted-foreground"
                        />

                        <div className="col-span-1 bg-background/50 border border-border rounded-md p-3 text-sm text-muted-foreground">
                          <div className="font-medium text-foreground mb-2">Preview</div>
                          <div className="text-xs font-mono break-words">Paste a curl command to see a quick parse preview here.</div>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center gap-3">
                        <button
                          onClick={handleImportCurl}
                          className="bg-primary text-primary-foreground hover:bg-primary/95 px-4 py-2 rounded-md text-sm font-medium transition-colors"
                        >
                          Import
                        </button>
                        <button
                          onClick={() => setCurlInput("")}
                          className="bg-transparent border border-border text-sm px-3 py-2 rounded-md text-muted-foreground"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
