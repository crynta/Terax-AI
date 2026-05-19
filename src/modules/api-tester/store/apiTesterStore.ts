import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ApiCollection, ApiRequest } from "../types";

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

export function createDefaultRequest(): ApiRequest {
  return {
    id: generateId(),
    name: "New Request",
    method: "GET",
    url: "",
    headers: [],
    queryParams: [],
    body: { type: "none", rawType: "json", content: "" },
  };
}

const apiTesterStorage = createJSONStorage(() => {
  if (typeof window === "undefined") {
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
  }

  let pending: { name: string; value: string } | null = null;
  let timer: number | null = null;

  return {
    getItem: (name) => window.localStorage.getItem(name),
    setItem: (name, value) => {
      pending = { name, value };
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!pending) return;
        window.localStorage.setItem(pending.name, pending.value);
        pending = null;
        timer = null;
      }, 300);
    },
    removeItem: (name) => {
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
        pending = null;
      }
      window.localStorage.removeItem(name);
    },
  };
});

type ApiTesterState = {
  collections: ApiCollection[];
  activeRequestId: string | null;

  createCollection: (name: string) => string;
  updateCollection: (id: string, updates: Partial<ApiCollection>) => void;
  deleteCollection: (id: string) => void;
  importCollection: (collection: ApiCollection) => void;

  createRequest: (collectionId: string | null, overrides?: Partial<ApiRequest>) => string;
  updateRequest: (id: string, updates: Partial<ApiRequest>) => void;
  deleteRequest: (id: string) => void;

  setActiveRequest: (id: string | null) => void;
};

export const useApiTesterStore = create<ApiTesterState>()(
  persist(
    (set) => ({
      collections: [],
      activeRequestId: null,

      createCollection: (name) => {
        const id = generateId();
        set((state) => ({
          collections: [...state.collections, { id, name, requests: [] }],
        }));
        return id;
      },

      updateCollection: (id, updates) => {
        set((state) => ({
          collections: state.collections.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        }));
      },

      deleteCollection: (id) => {
        set((state) => {
          const newCollections = state.collections.filter((c) => c.id !== id);
          // if active request was in this collection, clear it
          const isActiveDeleted = state.collections
            .find((c) => c.id === id)
            ?.requests.some((r) => r.id === state.activeRequestId);
          return {
            collections: newCollections,
            activeRequestId: isActiveDeleted ? null : state.activeRequestId,
          };
        });
      },

      importCollection: (collection) => {
        set((state) => ({
          collections: [...state.collections, collection],
        }));
      },

      createRequest: (collectionId, overrides) => {
        const req = { ...createDefaultRequest(), ...overrides };
        set((state) => {
          if (!collectionId) {
            // Put it in an "Uncategorized" collection if none exists, or just the first one
            let defaultCol = state.collections.find((c) => c.name === "Uncategorized");
            let collections = state.collections;
            if (!defaultCol) {
              defaultCol = { id: generateId(), name: "Uncategorized", requests: [] };
              collections = [...collections, defaultCol];
            }
            return {
              collections: collections.map((c) =>
                c.id === defaultCol!.id ? { ...c, requests: [...c.requests, req] } : c
              ),
              activeRequestId: req.id,
            };
          }
          return {
            collections: state.collections.map((c) =>
              c.id === collectionId ? { ...c, requests: [...c.requests, req] } : c
            ),
            activeRequestId: req.id,
          };
        });
        return req.id;
      },

      updateRequest: (id, updates) => {
        set((state) => ({
          collections: state.collections.map((c) => ({
            ...c,
            requests: c.requests.map((r) => (r.id === id ? { ...r, ...updates } : r)),
          })),
        }));
      },

      deleteRequest: (id) => {
        set((state) => ({
          collections: state.collections.map((c) => ({
            ...c,
            requests: c.requests.filter((r) => r.id !== id),
          })),
          activeRequestId: state.activeRequestId === id ? null : state.activeRequestId,
        }));
      },

      setActiveRequest: (id) => {
        set({ activeRequestId: id });
      },
    }),
    {
      name: "terax-api-tester-storage",
      storage: apiTesterStorage,
    }
  )
);
