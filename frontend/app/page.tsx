"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { api } from "@/lib/api";
import type { Listing, PriceHistory, SearchResult } from "@/lib/types";
import { PriceChart } from "@/components/PriceChart";
import { AddCollectionModal } from "@/components/AddCollectionModal";
import { CardRoomLogo } from "@/components/CardRoomLogo";
import { HoverImage } from "@/components/HoverImage";

type ConditionFilter = "all" | "raw" | "graded";
type SortField = "date" | "price";
type SortDir = "asc" | "desc";

/** Open an eBay sold-listings search for this title — reliable even after listing expires */
function ebaySearchUrl(title: string): string {
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(title)}&LH_Sold=1&LH_Complete=1&_sacat=261328`;
}

/** Detect serial-numbered / print-run cards like "/50", "/199", "/25" in title */
function isNumbered(title: string): boolean {
  return /\/\d{1,5}(?!\d)/.test(title);
}

/** Extract the print run number from title, e.g. "/99" → 99 */
function printRun(title: string): number | null {
  const m = title.match(/\/(\d{1,5})(?!\d)/);
  return m ? parseInt(m[1], 10) : null;
}

const HISTORY_KEY = "card_search_history";      // list of recent query strings
const CACHE_KEY   = "card_search_result_cache"; // last full search result

// ── localStorage helpers ──────────────────────────────────────────────────────

function readHistory(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); }
  catch { return []; }
}

function pushHistory(q: string) {
  const prev = readHistory().filter((x) => x.toLowerCase() !== q.toLowerCase());
  localStorage.setItem(HISTORY_KEY, JSON.stringify([q, ...prev].slice(0, 30)));
}

interface CacheEntry {
  query: string;
  result: SearchResult;
  history: PriceHistory;
  condition: ConditionFilter;
  savedAt: number;
}

function readCache(): CacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    // Only restore if saved within the last 2 hours
    if (Date.now() - entry.savedAt > 2 * 60 * 60 * 1000) return null;
    return entry;
  } catch { return null; }
}

function writeCache(entry: Omit<CacheEntry, "savedAt">) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...entry, savedAt: Date.now() }));
  } catch { /* quota exceeded — ignore */ }
}

// ── Utility ───────────────────────────────────────────────────────────────────

function medianOf(prices: number[]): number {
  const s = [...prices].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ── Badges ────────────────────────────────────────────────────────────────────

function SaleTypeBadge({ saleType }: { saleType?: string }) {
  if (saleType === "auction")
    return (
      <span className="inline-block text-xs px-1.5 py-0.5 rounded bg-purple-900/60 text-purple-300 border border-purple-700/60 whitespace-nowrap">
        Auction
      </span>
    );
  if (saleType === "buy_it_now")
    return (
      <span className="inline-block text-xs px-1.5 py-0.5 rounded bg-sky-900/60 text-sky-300 border border-sky-700/60 whitespace-nowrap">
        BIN
      </span>
    );
  return null;
}

function ConditionBadge({ condition }: { condition?: string }) {
  if (condition === "graded")
    return (
      <span className="inline-block text-xs px-1.5 py-0.5 rounded bg-amber-900/50 text-amber-300 border border-amber-700/60 whitespace-nowrap">
        Graded
      </span>
    );
  if (condition === "raw")
    return (
      <span className="inline-block text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 border border-slate-600 whitespace-nowrap">
        Raw
      </span>
    );
  return null;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SearchPage() {
  const [query, setQuery]         = useState("");
  const [condition, setCondition]         = useState<ConditionFilter>("all");
  const [excludeNumbered, setExcludeNumbered] = useState(false);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir]     = useState<SortDir>("desc");
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState<SearchResult | null>(null);
  const [history, setHistory]     = useState<PriceHistory | null>(null);
  const [error, setError]         = useState("");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);

  // Autocomplete dropdown
  const [suggestions, setSuggestions]   = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIdx, setActiveIdx]       = useState(-1);
  const inputRef    = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const latestQueryRef = useRef("");

  // ── Restore last search on mount ──────────────────────────────────────────
  useEffect(() => {
    const cached = readCache();
    if (cached) {
      latestQueryRef.current = cached.query;
      setQuery(cached.query);
      setResult(cached.result);
      setHistory(cached.history);
      setCondition(cached.condition);
    }
  }, []);

  // ── Persist to localStorage whenever results change ───────────────────────
  useEffect(() => {
    if (result && history) {
      writeCache({
        query: latestQueryRef.current,
        result,
        history,
        condition,
      });
    }
  }, [result, history, condition]);

  // ── Close dropdown on outside click ──────────────────────────────────────
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  // ── Autocomplete helpers ──────────────────────────────────────────────────

  /** Merge eBay suggestions with local history, deduplicated, max 10 items. */
  function mergeSuggestions(ebaySuggs: string[], val: string): string[] {
    const hist = readHistory().filter((h) =>
      h.toLowerCase().includes(val.toLowerCase())
    );
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const s of [...ebaySuggs, ...hist]) {
      const key = s.toLowerCase();
      if (!seen.has(key)) { seen.add(key); merged.push(s); }
      if (merged.length >= 10) break;
    }
    return merged;
  }

  function fetchSuggestions(val: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) {
      // Show only local history when input is empty
      const hist = readHistory().slice(0, 8);
      setSuggestions(hist);
      setShowDropdown(hist.length > 0);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const ebaySuggs = await api.suggestions(val);
        const merged = mergeSuggestions(ebaySuggs, val);
        setSuggestions(merged);
        setShowDropdown(merged.length > 0);
      } catch {
        // fallback to local history on error
        const hist = readHistory()
          .filter((h) => h.toLowerCase().includes(val.toLowerCase()))
          .slice(0, 8);
        setSuggestions(hist);
        setShowDropdown(hist.length > 0);
      }
    }, 300);
  }

  function handleInputChange(val: string) {
    setQuery(val);
    setActiveIdx(-1);
    fetchSuggestions(val);
  }

  function handleInputFocus() {
    fetchSuggestions(query);
  }

  function selectSuggestion(s: string) {
    setQuery(s);
    setShowDropdown(false);
    doSearch(s);
  }

  // ── Full search (hits eBay) ───────────────────────────────────────────────
  const doSearch = useCallback(async (q: string, refresh = false) => {
    if (!q.trim()) return;
    latestQueryRef.current = q;
    setLoading(true);
    setError("");
    setResult(null);
    setHistory(null);
    setCondition("all");
    setExcludeNumbered(false);
    setShowDropdown(false);
    try {
      const [res, hist] = await Promise.all([
        api.search(q, refresh),
        api.priceHistory(q),
      ]);
      setResult(res);
      setHistory(hist);
      pushHistory(q); // save to history after successful search
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (showDropdown && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, -1));
        return;
      }
      if (e.key === "Escape") {
        setShowDropdown(false);
        return;
      }
      if (e.key === "Enter" && activeIdx >= 0) {
        selectSuggestion(suggestions[activeIdx]);
        return;
      }
    }
    if (e.key === "Enter") doSearch(query);
  }

  // ── Client-side filtered data ─────────────────────────────────────────────
  const filteredListings = useMemo<Listing[]>(() => {
    if (!result) return [];
    let list = result.listings;
    if (condition !== "all") list = list.filter((l) => l.card_condition === condition);
    if (excludeNumbered) list = list.filter((l) => !isNumbered(l.listing_title));
    list = [...list].sort((a, b) => {
      const aVal = sortField === "date" ? new Date(a.sold_date).getTime() : a.sold_price;
      const bVal = sortField === "date" ? new Date(b.sold_date).getTime() : b.sold_price;
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    });
    return list;
  }, [result, condition, excludeNumbered, sortField, sortDir]);

  const filteredDataPoints = useMemo(() => {
    if (!history) return [];
    let pts = history.data_points;
    if (condition !== "all") pts = pts.filter((p) => p.card_condition === condition);
    if (excludeNumbered) pts = pts.filter((p) => !isNumbered(p.title));
    return pts;
  }, [history, condition, excludeNumbered]);

  const stats = useMemo(() => {
    if (!filteredListings.length) return null;
    const prices = filteredListings.map((l) => l.sold_price);
    return {
      total:  filteredListings.length,
      avg:    prices.reduce((a, b) => a + b, 0) / prices.length,
      median: medianOf(prices),
      min:    Math.min(...prices),
      max:    Math.max(...prices),
    };
  }, [filteredListings]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="bg-zinc-950/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <CardRoomLogo />
          <div className="flex gap-1">
            <span className="px-3 py-1.5 rounded-md bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-sm font-medium">
              Search
            </span>
            <Link
              href="/collection"
              className="px-3 py-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800/60 text-sm font-medium transition-colors"
            >
              Collection
            </Link>
          </div>
        </div>
        <div className="h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Search bar */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">Card Search</h1>
          <p className="text-slate-400 text-sm">
            Search eBay sold listings — e.g.{" "}
            <button
              className="text-blue-400 hover:underline"
              onClick={() => {
                const q = "2023 topps ohtani psa 10";
                setQuery(q);
                doSearch(q);
              }}
            >
              2023 topps ohtani psa 10
            </button>
          </p>

          {/* Input + dropdown wrapper */}
          <div className="relative flex gap-2">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                className="w-full input text-base"
                placeholder="Search cards..."
                value={query}
                onChange={(e) => handleInputChange(e.target.value)}
                onFocus={handleInputFocus}
                onKeyDown={handleKeyDown}
                autoComplete="off"
              />

              {/* Suggestions dropdown */}
              {showDropdown && suggestions.length > 0 && (
                <div
                  ref={dropdownRef}
                  className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700/80 rounded-lg shadow-xl shadow-black/40 z-50 overflow-hidden"
                >
                  {suggestions.map((s, i) => {
                    const isHistory = readHistory().some(
                      (h) => h.toLowerCase() === s.toLowerCase()
                    );
                    return (
                      <button
                        key={s}
                        className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2.5 transition-colors ${
                          i === activeIdx
                            ? "bg-gradient-to-r from-indigo-600 to-blue-600 text-white"
                            : "text-slate-200 hover:bg-slate-800/80"
                        }`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectSuggestion(s);
                        }}
                        onMouseEnter={() => setActiveIdx(i)}
                      >
                        {isHistory ? (
                          /* Clock — past search */
                          <svg className="w-3.5 h-3.5 opacity-40 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        ) : (
                          /* Magnifier — eBay suggestion */
                          <svg className="w-3.5 h-3.5 opacity-40 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                          </svg>
                        )}
                        {s}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              className="btn-primary px-5"
              onClick={() => doSearch(query)}
              disabled={loading}
            >
              {loading ? "Searching..." : "Search"}
            </button>
            {result && (
              <button
                className="btn-secondary px-4 text-sm"
                onClick={() => doSearch(query, true)}
                disabled={loading}
                title="Re-fetch from eBay"
              >
                Refresh
              </button>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-lg p-4 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-16 text-slate-400">
            <div className="text-4xl mb-3 animate-pulse">🔍</div>
            <p>Fetching eBay sold listings...</p>
            <p className="text-xs mt-1 text-slate-500">First search may take 15–20 seconds</p>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <>
            {/* Filter pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {(["all", "raw", "graded"] as ConditionFilter[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setCondition(c)}
                  className={`text-xs px-3 py-1 rounded-full border transition-all ${
                    condition === c
                      ? "bg-gradient-to-r from-indigo-600 to-blue-600 border-indigo-500/60 text-white shadow-sm shadow-indigo-500/20"
                      : "border-slate-700 text-slate-400 hover:text-white hover:border-slate-500"
                  }`}
                >
                  {c === "all" ? "All" : c === "raw" ? "Raw" : "Graded"}
                </button>
              ))}

              {/* Divider */}
              <span className="text-slate-700 select-none">|</span>

              {/* Numbered parallel toggle */}
              <button
                onClick={() => setExcludeNumbered((v) => !v)}
                className={`text-xs px-3 py-1 rounded-full border transition-all ${
                  excludeNumbered
                    ? "bg-gradient-to-r from-violet-600 to-purple-600 border-violet-500/60 text-white shadow-sm shadow-violet-500/20"
                    : "border-slate-700 text-slate-400 hover:text-white hover:border-slate-500"
                }`}
                title="Hide serial-numbered parallels (e.g. /50, /99) to reduce outliers"
              >
                {excludeNumbered ? "Excluding /XX" : "Incl. /XX Numbered"}
              </button>

              <span className="text-xs text-slate-600 ml-1">
                {filteredListings.length} of {result.listings.length} sales
              </span>
            </div>

            {/* Stats row */}
            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Sales Found" value={stats.total.toString()} />
                <StatCard label="Avg Price"   value={`$${stats.avg.toFixed(2)}`} />
                <StatCard label="Median"      value={`$${stats.median.toFixed(2)}`} />
                <StatCard label="Range"       value={`$${stats.min.toFixed(2)} – $${stats.max.toFixed(2)}`} />
              </div>
            )}

            {/* Chart */}
            {filteredDataPoints.length > 0 && (
              <div className="card">
                <div className="mb-2">
                  <h2 className="font-semibold text-white">Price History</h2>
                </div>
                <PriceChart data={filteredDataPoints} />
              </div>
            )}

            {/* Table header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="font-semibold text-white">Recent Sales</h2>
              <button
                className="btn-primary text-sm"
                onClick={() => { setSelectedListing(null); setAddModalOpen(true); }}
              >
                + Add to Collection
              </button>
            </div>

            {/* Sales table */}
            {filteredListings.length === 0 ? (
              <div className="card text-center py-10 text-slate-500">
                No {condition !== "all" ? condition : ""} sales found.
              </div>
            ) : (
              <div className="card overflow-hidden p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800/60 text-slate-500 text-xs uppercase tracking-wide bg-zinc-950/60">
                        <th className="text-left px-4 py-3 w-8">#</th>
                        <th className="text-left px-4 py-3">Title</th>
                        <th className="text-center px-3 py-3">Type</th>
                        <th className="text-center px-3 py-3">Condition</th>
                        <th
                          className="text-right px-4 py-3 cursor-pointer select-none hover:text-white transition-colors"
                          onClick={() => {
                            if (sortField === "price") setSortDir((d) => d === "asc" ? "desc" : "asc");
                            else { setSortField("price"); setSortDir("desc"); }
                          }}
                        >
                          Sale Price {sortField === "price" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                        </th>
                        <th
                          className="text-right px-4 py-3 cursor-pointer select-none hover:text-white transition-colors"
                          onClick={() => {
                            if (sortField === "date") setSortDir((d) => d === "asc" ? "desc" : "asc");
                            else { setSortField("date"); setSortDir("desc"); }
                          }}
                        >
                          Date {sortField === "date" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                        </th>
                        <th className="px-4 py-3 w-28"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredListings.map((listing, idx) => (
                        <tr
                          key={listing.id}
                          className="border-b border-slate-800/40 hover:bg-indigo-950/20 transition-colors"
                        >
                          <td className="px-4 py-3 text-slate-600 text-xs">{idx + 1}</td>
                          <td className="px-4 py-3 text-slate-100">
                            <div className="flex items-center gap-3">
                              {/* Card thumbnail */}
                              <HoverImage src={listing.image_url}>
                                <div className="shrink-0 w-8 h-11 rounded overflow-hidden bg-slate-800 border border-slate-700/60 flex items-center justify-center">
                                  {listing.image_url ? (
                                    <img
                                      src={listing.image_url}
                                      alt=""
                                      className="w-full h-full object-cover"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                  )}
                                </div>
                              </HoverImage>
                              <span className="leading-snug">
                                {listing.listing_title}
                                {isNumbered(listing.listing_title) && (
                                  <span className="ml-1.5 inline-block text-xs px-1.5 py-0.5 rounded bg-orange-900/50 text-orange-300 border border-orange-700/50 whitespace-nowrap align-middle">
                                    /{printRun(listing.listing_title)}
                                  </span>
                                )}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <SaleTypeBadge saleType={listing.sale_type} />
                          </td>
                          <td className="px-3 py-3 text-center">
                            <ConditionBadge condition={listing.card_condition} />
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-emerald-400 whitespace-nowrap">
                            ${listing.sold_price.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-400 whitespace-nowrap">
                            {format(new Date(listing.sold_date), "MMM d, yyyy")}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="flex items-center gap-2 justify-end">
                              <a
                                href={ebaySearchUrl(listing.listing_title)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-400 hover:underline"
                              >
                                eBay ↗
                              </a>
                              <button
                                className="text-xs btn-secondary py-1 px-2"
                                onClick={() => { setSelectedListing(listing); setAddModalOpen(true); }}
                              >
                                + Collect
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {result.from_cache && (
              <p className="text-xs text-slate-600 text-center">
                Showing cached results · Click Refresh to re-fetch from eBay
              </p>
            )}
          </>
        )}
      </div>

      {addModalOpen && (
        <AddCollectionModal
          defaultSearchQuery={result?.query ?? query}
          defaultImageUrl={selectedListing?.image_url ?? ""}
          availableImages={
            // Unique non-empty image URLs from current filtered results
            [...new Set(
              filteredListings
                .map((l) => l.image_url)
                .filter((u): u is string => !!u)
            )]
          }
          onClose={() => { setAddModalOpen(false); setSelectedListing(null); }}
          onSaved={() => { setAddModalOpen(false); setSelectedListing(null); }}
        />
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card py-3 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />
      <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold text-white mt-1">{value}</p>
    </div>
  );
}
