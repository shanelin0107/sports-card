import type {
  CollectionItem,
  CollectionItemCreate,
  PriceHistory,
  SearchResult,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}

export const api = {
  search: (q: string, refresh = false, condition?: string): Promise<SearchResult> => {
    const params = new URLSearchParams({ q, refresh: String(refresh) });
    if (condition) params.set("condition", condition);
    return get(`/api/search?${params}`);
  },

  suggestions: (q: string): Promise<string[]> => {
    const params = new URLSearchParams({ q });
    return get(`/api/search/suggestions?${params}`);
  },

  priceHistory: (q: string, condition?: string): Promise<PriceHistory> => {
    const params = new URLSearchParams({ q });
    if (condition) params.set("condition", condition);
    return get(`/api/search/history?${params}`);
  },

  collection: {
    list: (): Promise<CollectionItem[]> => get("/api/collection/"),
    get: (id: number): Promise<CollectionItem> => get(`/api/collection/${id}`),
    create: (data: CollectionItemCreate): Promise<CollectionItem> =>
      post("/api/collection/", data),
    update: (id: number, data: Partial<CollectionItemCreate>): Promise<CollectionItem> =>
      put(`/api/collection/${id}`, data),
    delete: (id: number): Promise<void> => del(`/api/collection/${id}`),
    refreshPrices: (force = false): Promise<{ refreshed: number; skipped: number; total: number }> =>
      post(`/api/collection/refresh-prices?force=${force}`, {}),
  },
};
