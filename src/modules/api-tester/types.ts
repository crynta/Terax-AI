export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD";

export type KeyValuePair = {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
};

export type ApiRequest = {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  headers: KeyValuePair[];
  queryParams: KeyValuePair[];
  body: {
    type: "none" | "raw";
    rawType: "json" | "text" | "html" | "xml";
    content: string;
  };
};

export type ApiCollection = {
  id: string;
  name: string;
  requests: ApiRequest[];
};

export type ApiResponse = {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  timeMs: number;
  sizeBytes: number;
  isError: boolean;
  errorMsg?: string;
};
