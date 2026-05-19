import type { ApiRequest, HttpMethod } from "../types";
import { createDefaultRequest } from "../store/apiTesterStore";

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

export function parseCurl(curlString: string): Partial<ApiRequest> | null {
  const cmd = curlString.trim();
  if (!cmd.startsWith("curl ")) return null;

  const req = createDefaultRequest();

  // A very basic parser. Split by spaces, respecting quotes.
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  const tokens: string[] = [];
  let match;
  while ((match = regex.exec(cmd)) !== null) {
    tokens.push(match[1] || match[2] || match[0]);
  }

  let methodSet = false;

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];

    if (token === "-X" || token === "--request") {
      if (i + 1 < tokens.length) {
        req.method = tokens[++i].toUpperCase() as HttpMethod;
        methodSet = true;
      }
    } else if (token === "-H" || token === "--header") {
      if (i + 1 < tokens.length) {
        const headerStr = tokens[++i];
        const colonIndex = headerStr.indexOf(":");
        if (colonIndex !== -1) {
          req.headers.push({
            id: generateId(),
            key: headerStr.substring(0, colonIndex).trim(),
            value: headerStr.substring(colonIndex + 1).trim(),
            enabled: true,
          });
        }
      }
    } else if (token === "-d" || token === "--data" || token === "--data-raw") {
      if (i + 1 < tokens.length) {
        req.body.type = "raw";
        let content = tokens[++i];

        // Try to prettify if it's JSON
        try {
          const parsedJson = JSON.parse(content);
          content = JSON.stringify(parsedJson, null, 2);
          req.body.rawType = "json";
        } catch (e) {
          // not json, leave as is
        }

        req.body.content = content;
        if (!methodSet) {
          req.method = "POST";
          methodSet = true;
        }
      }
    } else if (!token.startsWith("-") && req.url === "") {
      // Treat the first non-flag argument as the URL
      // Strip outer quotes if present
      let url = token;
      if ((url.startsWith("'") && url.endsWith("'")) || (url.startsWith('"') && url.endsWith('"'))) {
        url = url.substring(1, url.length - 1);
      }
      req.url = url;
    }
  }

  // Try to parse query params from URL
  try {
    const parsedUrl = new URL(req.url);
    parsedUrl.searchParams.forEach((value, key) => {
      req.queryParams.push({
        id: generateId(),
        key,
        value,
        enabled: true,
      });
    });
    // Optional: strip query string from url so it can be managed by the UI entirely
    // req.url = req.url.split('?')[0];
  } catch (e) {
    // Ignore invalid URL
  }

  return req;
}
