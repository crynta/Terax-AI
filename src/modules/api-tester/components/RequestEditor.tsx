import { useState } from "react";
import type { ApiRequest } from "../types";
import { KeyValueTable } from "./KeyValueTable";
import { cn } from "@/lib/utils";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { tokyoNight } from "@uiw/codemirror-theme-tokyo-night";

export function RequestEditor({
  request,
  onChange,
}: {
  request: ApiRequest;
  onChange: (updates: Partial<ApiRequest>) => void;
}) {
  const [tab, setTab] = useState<"params" | "headers" | "body">("params");

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b border-border px-4 py-2">
        <button
          onClick={() => setTab("params")}
          className={cn(
            "text-sm font-medium pb-1 border-b-2",
            tab === "params" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Params
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
        <button
          onClick={() => setTab("body")}
          className={cn(
            "text-sm font-medium pb-1 border-b-2",
            tab === "body" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Body
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === "params" && (
          <KeyValueTable
            items={request.queryParams}
            onChange={(items) => onChange({ queryParams: items })}
          />
        )}

        {tab === "headers" && (
          <KeyValueTable
            items={request.headers}
            onChange={(items) => onChange({ headers: items })}
          />
        )}

        {tab === "body" && (
          <div className="flex h-full flex-col gap-2">
            <div className="flex gap-2 mb-2">
              <select
                value={request.body.type}
                onChange={(e) =>
                  onChange({
                    body: { ...request.body, type: e.target.value as "none" | "raw" },
                  })
                }
                className="bg-transparent border border-border rounded px-2 py-1 text-sm outline-none"
              >
                <option value="none">None</option>
                <option value="raw">Raw</option>
              </select>

              {request.body.type === "raw" && (
                <select
                  value={request.body.rawType}
                  onChange={(e) =>
                    onChange({
                      body: { ...request.body, rawType: e.target.value as "json" | "text" },
                    })
                  }
                  className="bg-transparent border border-border rounded px-2 py-1 text-sm outline-none"
                >
                  <option value="json">JSON</option>
                  <option value="text">Text</option>
                </select>
              )}
            </div>

            {request.body.type === "raw" && (
              <div className="flex-1 border border-border rounded overflow-hidden">
                <CodeMirror
                  value={request.body.content}
                  height="100%"
                  extensions={request.body.rawType === "json" ? [json()] : []}
                  theme={tokyoNight}
                  onChange={(value) => onChange({ body: { ...request.body, content: value } })}
                  className="h-full text-sm"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
