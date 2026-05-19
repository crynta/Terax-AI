import { useState } from "react";
import { useApiTesterStore } from "../store/apiTesterStore";
import { HugeiconsIcon } from "@hugeicons/react";
import { FolderGitTwoIcon, PlusSignIcon, Delete01Icon, FileImportIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { importPostmanCollection } from "../lib/importPostman";

export function Sidebar() {
  const { collections, activeRequestId, setActiveRequest, createCollection, updateCollection, createRequest, updateRequest, deleteCollection, deleteRequest, importCollection } = useApiTesterStore();
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");

  const startEditCollection = (id: string, currentName: string) => {
    setEditingCollectionId(id);
    setEditingRequestId(null);
    setNameDraft(currentName);
  };

  const startEditRequest = (id: string, currentName: string) => {
    setEditingRequestId(id);
    setEditingCollectionId(null);
    setNameDraft(currentName);
  };

  const finishEdit = () => {
    if (editingCollectionId) {
      const trimmed = nameDraft.trim();
      if (trimmed) updateCollection(editingCollectionId, { name: trimmed });
    }
    if (editingRequestId) {
      const trimmed = nameDraft.trim();
      if (trimmed) updateRequest(editingRequestId, { name: trimmed });
    }
    setEditingCollectionId(null);
    setEditingRequestId(null);
    setNameDraft("");
  };

  const cancelEdit = () => {
    setEditingCollectionId(null);
    setEditingRequestId(null);
    setNameDraft("");
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const coll = importPostmanCollection(text);
      if (coll) {
        importCollection(coll);
      } else {
        alert("Failed to import Postman collection. Ensure it is a valid v2/v2.1 JSON format.");
      }
    };
    input.click();
  };

  return (
    <div className="flex h-full flex-col border-r border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-2">
        <span className="text-xs font-semibold uppercase text-muted-foreground">Collections</span>
        <div className="flex gap-1">
           <button
            onClick={handleImport}
            className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-accent"
            title="Import Postman Collection"
          >
            <HugeiconsIcon icon={FileImportIcon} size={14} />
          </button>
          <button
            onClick={() => createCollection("New Collection")}
            className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-accent"
            title="New Collection"
          >
            <HugeiconsIcon icon={PlusSignIcon} size={14} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {collections.map((col) => (
          <div key={col.id} className="mb-4">
            <div className="group flex items-center justify-between rounded px-2 py-1 hover:bg-accent">
              <div className="flex items-center gap-2 min-w-0">
                <HugeiconsIcon icon={FolderGitTwoIcon} size={14} className="text-muted-foreground" />
                {editingCollectionId === col.id ? (
                  <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onBlur={finishEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") finishEdit();
                      if (e.key === "Escape") cancelEdit();
                    }}
                    className="bg-transparent text-sm font-medium outline-none border-b border-border"
                    autoFocus
                  />
                ) : (
                  <span
                    className="text-sm font-medium truncate"
                    onDoubleClick={() => startEditCollection(col.id, col.name)}
                  >
                    {col.name}
                  </span>
                )}
              </div>
              <div className="flex opacity-0 group-hover:opacity-100">
                <button
                  onClick={() => createRequest(col.id)}
                  className="p-1 text-muted-foreground hover:text-foreground"
                  title="New Request"
                >
                  <HugeiconsIcon icon={PlusSignIcon} size={12} />
                </button>
                <button
                  onClick={() => deleteCollection(col.id)}
                  className="p-1 text-muted-foreground hover:text-red-500"
                  title="Delete Collection"
                >
                  <HugeiconsIcon icon={Delete01Icon} size={12} />
                </button>
              </div>
            </div>
            <div className="ml-4 mt-1 space-y-1">
              {col.requests.map((req) => (
                <div
                  key={req.id}
                  onClick={() => {
                    if (editingRequestId !== req.id) setActiveRequest(req.id);
                  }}
                  className={cn(
                    "group flex cursor-pointer items-center justify-between rounded px-2 py-1 text-sm",
                    activeRequestId === req.id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <div className="flex items-center gap-2 overflow-hidden min-w-0">
                    <span className={cn("text-[10px] font-bold",
                      req.method === "GET" && "text-green-500",
                      req.method === "POST" && "text-blue-500",
                      req.method === "PUT" && "text-orange-500",
                      req.method === "DELETE" && "text-red-500",
                    )}>
                      {req.method}
                    </span>
                    {editingRequestId === req.id ? (
                      <input
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onBlur={finishEdit}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") finishEdit();
                          if (e.key === "Escape") cancelEdit();
                        }}
                        className="bg-transparent text-sm outline-none border-b border-border flex-1 min-w-0"
                        autoFocus
                      />
                    ) : (
                      <span
                        className="truncate"
                        onDoubleClick={() => startEditRequest(req.id, req.name)}
                      >
                        {req.name}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteRequest(req.id);
                    }}
                    className="p-1 opacity-0 group-hover:opacity-100 hover:text-red-500"
                  >
                    <HugeiconsIcon icon={Delete01Icon} size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
        {collections.length === 0 && (
          <div className="text-center text-xs text-muted-foreground mt-4">
            No collections yet.
          </div>
        )}
      </div>
    </div>
  );
}
