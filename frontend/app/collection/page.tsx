"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { api } from "@/lib/api";
import type { CollectionItem, PriceHistory } from "@/lib/types";
import { PriceChart } from "@/components/PriceChart";
import { AddCollectionModal } from "@/components/AddCollectionModal";
import { CardRoomLogo } from "@/components/CardRoomLogo";
import { HoverImage } from "@/components/HoverImage";

type SortKey =
  | "card_name"
  | "sport"
  | "grade"
  | "quantity"
  | "purchase_price"
  | "current_median_price"
  | "unrealized_pnl"
  | "unrealized_pnl_pct";

// ── Portfolio helpers ─────────────────────────────────────────────────────────

function Th({
  col,
  label,
  align = "right",
  sortKey,
  sortDir,
  onSort,
}: {
  col: SortKey;
  label: string;
  align?: "left" | "right";
  sortKey: SortKey | null;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <th
      onClick={() => onSort(col)}
      className={`px-4 py-3 text-${align} cursor-pointer select-none hover:text-slate-300 transition-colors whitespace-nowrap ${
        active ? "text-indigo-400" : ""
      }`}
    >
      {label}
      <span className="ml-1 inline-block w-3 text-center">
        {active ? (sortDir === "asc" ? "↑" : "↓") : (
          <span className="text-slate-700">↕</span>
        )}
      </span>
    </th>
  );
}

function holdDays(purchaseDateStr: string): number {
  return Math.max(0, Math.floor(
    (Date.now() - new Date(purchaseDateStr).getTime()) / (1000 * 60 * 60 * 24)
  ));
}

function annualizedReturn(
  purchasePrice: number,
  currentPrice: number,
  purchaseDateStr: string
): number | null {
  const days = holdDays(purchaseDateStr);
  if (days < 7 || purchasePrice <= 0) return null;
  return (Math.pow(currentPrice / purchasePrice, 365 / days) - 1) * 100;
}

export default function CollectionPage() {
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<CollectionItem | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [chartData, setChartData] = useState<Record<number, PriceHistory>>({});
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<string | null>(null);
  const [sportFilter, setSportFilter] = useState<string>("All");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  async function handleRefreshPrices(force = false) {
    setRefreshing(true);
    setRefreshResult(null);
    try {
      const res = await api.collection.refreshPrices(force);
      await loadItems();
      if (res.skipped > 0 && res.refreshed === 0) {
        setRefreshResult(`All ${res.skipped} up-to-date (< 1 hr old)`);
      } else {
        const parts = [`${res.refreshed} refreshed`];
        if (res.skipped > 0) parts.push(`${res.skipped} skipped`);
        setRefreshResult(parts.join(", "));
      }
      setTimeout(() => setRefreshResult(null), 4000);
    } finally {
      setRefreshing(false);
    }
  }

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.collection.list();
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  async function toggleExpand(item: CollectionItem) {
    if (expandedId === item.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(item.id);
    // Fetch chart data if not already loaded
    if (!chartData[item.id] && item.search_query) {
      try {
        const hist = await api.priceHistory(item.search_query);
        setChartData((prev) => ({ ...prev, [item.id]: hist }));
      } catch {
        // ignore — chart just won't render
      }
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Remove this card from your collection?")) return;
    setDeletingId(id);
    try {
      await api.collection.delete(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  // Sport filter
  const SPORTS = ["All", "NBA", "MLB", "NFL", "Tennis", "Other"];
  const filteredItems = sportFilter === "All"
    ? items
    : items.filter((i) => i.sport === sportFilter);

  // Sorted items — null values always sort to the bottom
  const sortedItems = sortKey === null
    ? filteredItems
    : [...filteredItems].sort((a, b) => {
        const aVal = (a as Record<SortKey, string | number | undefined>)[sortKey] ?? null;
        const bVal = (b as Record<SortKey, string | number | undefined>)[sortKey] ?? null;
        if (aVal === null && bVal === null) return 0;
        if (aVal === null) return 1;
        if (bVal === null) return -1;
        if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
        if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
        return 0;
      });

  // Portfolio summary — follows the active sport filter
  const totalCost = filteredItems.reduce(
    (acc, i) => acc + i.purchase_price * i.quantity,
    0
  );
  const totalValue = filteredItems.reduce(
    (acc, i) =>
      acc + (i.current_median_price ?? i.purchase_price) * i.quantity,
    0
  );
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="bg-zinc-950/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <CardRoomLogo />
          <div className="flex gap-1">
            <Link
              href="/"
              className="px-3 py-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800/60 text-sm font-medium transition-colors"
            >
              Search
            </Link>
            <span className="px-3 py-1.5 rounded-md bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-sm font-medium">
              Collection
            </span>
          </div>
        </div>
        <div className="h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">My Collection</h1>
            <p className="text-slate-400 text-sm mt-1">
              {items.length} card{items.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {refreshResult && (
              <p className="text-xs text-slate-400">{refreshResult}</p>
            )}
            <div className="flex gap-2">
            <button
              className="btn-secondary flex items-center gap-1.5"
              onClick={() => handleRefreshPrices()}
              disabled={refreshing}
              title="Re-scrape eBay for latest sold prices"
            >
              <svg
                className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              >
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {refreshing ? "Refreshing…" : "Refresh Prices"}
            </button>
            <button
              className="btn-primary"
              onClick={() => { setEditItem(null); setAddModalOpen(true); }}
            >
              + Add Card
            </button>
          </div>
          </div>
        </div>

        {/* Portfolio summary bar */}
        {items.length > 0 && (
          <div className="card relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />

            {/* Three key numbers */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Cost Basis</p>
                <p className="text-xl font-bold text-white mt-1">${totalCost.toFixed(2)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Est. Value</p>
                <p className="text-2xl font-bold text-white mt-1">${totalValue.toFixed(2)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Total Return</p>
                <p className={`text-xl font-bold mt-1 ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
                </p>
                <p className={`text-sm font-semibold ${totalPnlPct >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                  {totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(1)}%
                </p>
              </div>
            </div>

            {/* Value bar */}
            <div className="h-2.5 bg-slate-800/80 rounded-full overflow-hidden">
              {totalPnl >= 0 ? (
                <div className="h-full flex">
                  <div
                    className="bg-indigo-600 transition-all duration-700"
                    style={{ width: `${(totalCost / totalValue) * 100}%` }}
                  />
                  <div
                    className="bg-emerald-500 transition-all duration-700"
                    style={{ width: `${(totalPnl / totalValue) * 100}%` }}
                  />
                </div>
              ) : (
                <div
                  className="h-full bg-red-500/70 rounded-full transition-all duration-700"
                  style={{ width: `${(totalValue / totalCost) * 100}%` }}
                />
              )}
            </div>

            {/* Bar legend */}
            <div className="flex items-center gap-4 mt-2.5 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-indigo-600 inline-block" />
                Cost
              </span>
              <span className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-sm inline-block ${totalPnl >= 0 ? "bg-emerald-500" : "bg-red-500/70"}`} />
                {totalPnl >= 0 ? "Gain" : "Loss"}
              </span>
              <span className="ml-auto">
                {items.length} card{items.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        )}

        {/* Sport filter tabs */}
        {items.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {SPORTS.map((s) => {
              const count = s === "All" ? items.length : items.filter((i) => i.sport === s).length;
              if (s !== "All" && count === 0) return null;
              return (
                <button
                  key={s}
                  onClick={() => setSportFilter(s)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    sportFilter === s
                      ? "bg-indigo-600/30 border-indigo-500/60 text-indigo-300"
                      : "bg-slate-800/40 border-slate-700/50 text-slate-400 hover:text-slate-200 hover:border-slate-600"
                  }`}
                >
                  {s}
                  <span className="ml-1 text-slate-500">{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-16 text-slate-400">
            Loading collection...
          </div>
        )}

        {/* Empty state */}
        {!loading && items.length === 0 && (
          <div className="text-center py-20 space-y-3">
            <p className="text-4xl">🃏</p>
            <p className="text-slate-300 font-medium">Your collection is empty</p>
            <p className="text-slate-500 text-sm">
              Search for a card and click + Add to Collection
            </p>
            <Link href="/" className="btn-primary inline-block mt-2 text-sm">
              Go to Search
            </Link>
          </div>
        )}

        {/* Collection table */}
        {!loading && items.length > 0 && (
          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800/60 text-slate-500 text-xs uppercase tracking-wide bg-zinc-950/60">
                    <Th col="card_name"              label="Card"       align="left"  sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <Th col="sport"                  label="Sport"                    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <Th col="grade"                  label="Grade"                    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <Th col="quantity"               label="Qty"                      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <Th col="purchase_price"         label="Buy Price"                sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <Th col="current_median_price"   label="Mkt Median"               sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <Th col="unrealized_pnl"         label="P&L"                      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <Th col="unrealized_pnl_pct"     label="P&L%"                     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map((item) => (
                    <>
                      <tr
                        key={item.id}
                        className="border-b border-slate-800/40 hover:bg-indigo-950/20 transition-colors cursor-pointer"
                        onClick={() => toggleExpand(item)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {/* Thumbnail */}
                            <HoverImage src={item.image_url}>
                              <div className="shrink-0 w-10 rounded overflow-hidden bg-slate-800 border border-slate-700/50 flex items-center justify-center" style={{ height: "3.25rem" }}>
                                {item.image_url ? (
                                  <img
                                    src={item.image_url}
                                    alt=""
                                    className="w-full h-full object-contain"
                                    onError={(e) => {
                                      const el = e.currentTarget;
                                      el.style.display = "none";
                                      el.parentElement!.innerHTML = '<span class="text-slate-600 text-lg">🃏</span>';
                                    }}
                                  />
                                ) : (
                                  <span className="text-slate-600 text-lg">🃏</span>
                                )}
                              </div>
                            </HoverImage>
                            <div className="min-w-0">
                              <div className="font-medium text-slate-100 truncate max-w-[14rem]">
                                {item.card_name}
                              </div>
                              <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                                <span>Bought {format(new Date(item.purchase_date), "MMM d, yyyy")}</span>
                                <span className="text-slate-700">·</span>
                                <span>{holdDays(item.purchase_date)}d held</span>
                                {item.current_median_price != null && (() => {
                                  const ann = annualizedReturn(item.purchase_price, item.current_median_price, item.purchase_date);
                                  if (ann === null) return null;
                                  return (
                                    <>
                                      <span className="text-slate-700">·</span>
                                      <span className={ann >= 0 ? "text-emerald-500" : "text-red-500"}>
                                        Ann. {ann >= 0 ? "+" : ""}{Math.min(Math.abs(ann), 9999).toFixed(0)}%
                                      </span>
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {item.sport ? (
                            <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-slate-700/60 text-slate-300 border border-slate-600/40">
                              {item.sport}
                            </span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-300">
                          {item.grade ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-300">
                          {item.quantity}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-300">
                          ${item.purchase_price.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-300">
                          {item.current_median_price != null
                            ? `$${item.current_median_price.toFixed(2)}`
                            : "—"}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-semibold ${
                            (item.unrealized_pnl ?? 0) >= 0
                              ? "text-emerald-400"
                              : "text-red-400"
                          }`}
                        >
                          {item.unrealized_pnl != null
                            ? `${item.unrealized_pnl >= 0 ? "+" : ""}$${item.unrealized_pnl.toFixed(2)}`
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {item.unrealized_pnl_pct != null ? (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${
                              item.unrealized_pnl_pct >= 0
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                : "bg-red-500/10 text-red-400 border-red-500/30"
                            }`}>
                              {item.unrealized_pnl_pct >= 0 ? "↑" : "↓"}
                              {item.unrealized_pnl_pct >= 0 ? "+" : ""}{item.unrealized_pnl_pct.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div
                            className="flex items-center gap-2 justify-end"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              className="text-xs text-slate-400 hover:text-white transition-colors"
                              onClick={() => toggleExpand(item)}
                            >
                              {expandedId === item.id ? "▲" : "▼"}
                            </button>
                            <button
                              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                              title="Edit card"
                              onClick={() => setEditItem(item)}
                            >
                              ✎
                            </button>
                            <button
                              className="text-xs text-red-500 hover:text-red-400 transition-colors"
                              disabled={deletingId === item.id}
                              onClick={() => handleDelete(item.id)}
                            >
                              {deletingId === item.id ? "..." : "✕"}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded chart row */}
                      {expandedId === item.id && (
                        <tr key={`chart-${item.id}`}>
                          <td
                            colSpan={9}
                            className="bg-slate-900 px-6 py-5 border-b border-slate-800"
                          >
                            <div className="space-y-3">
                              {item.notes && (
                                <p className="text-xs text-slate-400">
                                  📝 {item.notes}
                                </p>
                              )}
                              {item.search_query ? (
                                <>
                                  <div className="flex items-center justify-between">
                                    <p className="text-sm font-medium text-slate-300">
                                      Price History
                                    </p>
                                    <Link
                                      href={`/?q=${encodeURIComponent(item.search_query)}`}
                                      className="text-xs text-blue-400 hover:underline"
                                    >
                                      View search →
                                    </Link>
                                  </div>
                                  {chartData[item.id] ? (
                                    <PriceChart
                                      data={chartData[item.id].data_points}
                                      buyPoints={[
                                        {
                                          date: item.purchase_date,
                                          price: item.purchase_price,
                                          label: `Buy $${item.purchase_price}`,
                                        },
                                      ]}
                                      height={220}
                                    />
                                  ) : (
                                    <div className="h-24 flex items-center justify-center text-slate-500 text-sm">
                                      Loading chart...
                                    </div>
                                  )}
                                  {chartData[item.id] && (
                                    <div className="flex gap-6 text-xs text-slate-500">
                                      <span>
                                        Median:{" "}
                                        <span className="text-slate-300">
                                          ${chartData[item.id].median_price.toFixed(2)}
                                        </span>
                                      </span>
                                      <span title="Mean of all historical sales — may be skewed by outliers">
                                        Avg (all):{" "}
                                        <span className="text-slate-400">
                                          ${chartData[item.id].avg_price.toFixed(2)}
                                        </span>
                                      </span>
                                      <span>
                                        Sales:{" "}
                                        <span className="text-slate-300">
                                          {chartData[item.id].count}
                                        </span>
                                      </span>
                                    </div>
                                  )}
                                </>
                              ) : (
                                <p className="text-xs text-slate-500 italic">
                                  No search query linked — add one to enable price tracking.
                                </p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {addModalOpen && (
        <AddCollectionModal
          onClose={() => setAddModalOpen(false)}
          onSaved={() => {
            setAddModalOpen(false);
            loadItems();
          }}
        />
      )}

      {editItem && (
        <AddCollectionModal
          editItem={editItem}
          onClose={() => setEditItem(null)}
          onSaved={() => {
            setEditItem(null);
            loadItems();
          }}
        />
      )}
    </div>
  );
}

