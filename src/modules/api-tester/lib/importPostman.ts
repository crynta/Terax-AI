import type { ApiCollection, ApiRequest, HttpMethod, KeyValuePair } from "../types";

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

export function importPostmanCollection(jsonString: string): ApiCollection | null {
  try {
    const data = JSON.parse(jsonString);

    // Very basic Postman v2/v2.1 validation
    if (!data.info || !data.item) {
      return null;
    }

    const collectionName = data.info.name || "Imported Collection";
    const requests: ApiRequest[] = [];

    // Helper to recursively extract items
    function extractItems(items: any[]) {
      for (const item of items) {
        if (item.item) {
          // It's a folder, extract its items
          extractItems(item.item);
        } else if (item.request) {
          // It's a request
          const req = item.request;

          let url = "";
          if (typeof req.url === "string") {
            url = req.url;
          } else if (req.url && req.url.raw) {
            url = req.url.raw;
          }

          const headers: KeyValuePair[] = (req.header || []).map((h: any) => ({
            id: generateId(),
            key: h.key || "",
            value: h.value || "",
            enabled: h.disabled !== true,
          }));

          const queryParams: KeyValuePair[] = [];
          if (req.url && Array.isArray(req.url.query)) {
            for (const q of req.url.query) {
              queryParams.push({
                id: generateId(),
                key: q.key || "",
                value: q.value || "",
                enabled: q.disabled !== true,
              });
            }
          }

          let bodyType: "none" | "raw" = "none";
          let rawType: "json" | "text" = "text";
          let content = "";

          if (req.body) {
            if (req.body.mode === "raw") {
              bodyType = "raw";
              content = req.body.raw || "";
              if (req.body.options && req.body.options.raw && req.body.options.raw.language === "json") {
                rawType = "json";
              }
            }
          }

          requests.push({
            id: generateId(),
            name: item.name || "Untitled Request",
            method: (req.method || "GET").toUpperCase() as HttpMethod,
            url,
            headers,
            queryParams,
            body: {
              type: bodyType,
              rawType,
              content,
            },
          });
        }
      }
    }

    extractItems(data.item);

    return {
      id: generateId(),
      name: collectionName,
      requests,
    };
  } catch (e) {
    console.error("Failed to parse Postman collection", e);
    return null;
  }
}
