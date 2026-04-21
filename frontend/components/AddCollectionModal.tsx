"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { CollectionItem, CollectionItemCreate } from "@/lib/types";

const GRADES = [
  "Raw",
  "PSA 1", "PSA 2", "PSA 3", "PSA 4", "PSA 5",
  "PSA 6", "PSA 7", "PSA 8", "PSA 9", "PSA 10",
  "BGS 9.5", "BGS 10", "SGC 10",
];

const SPORTS = ["NBA", "MLB", "NFL", "Tennis", "Other"];

interface Props {
  /** When provided the modal operates in edit mode */
  editItem?: CollectionItem | null;
  defaultSearchQuery?: string;
  defaultImageUrl?: string;
  availableImages?: string[];
  onClose: () => void;
  onSaved: () => void;
}

/** Upgrade eBay image URL to highest available resolution */
function hiRes(url: string): string {
  return url.replace(/s-l\d+(\.\w+)$/, "s-l1600$1");
}

function itemToForm(item: CollectionItem): CollectionItemCreate {
  return {
    card_name: item.card_name,
    search_query: item.search_query ?? "",
    purchase_price: item.purchase_price,
    purchase_date: item.purchase_date.split("T")[0],
    quantity: item.quantity,
    grade: item.grade ?? "Raw",
    sport: item.sport ?? "",
    notes: item.notes ?? "",
    image_url: item.image_url ?? "",
  };
}

export function AddCollectionModal({
  editItem = null,
  defaultSearchQuery = "",
  defaultImageUrl = "",
  availableImages = [],
  onClose,
  onSaved,
}: Props) {
  const isEdit = editItem !== null;

  const [form, setForm] = useState<CollectionItemCreate>(
    isEdit
      ? itemToForm(editItem!)
      : {
          card_name: "",
          search_query: defaultSearchQuery,
          purchase_price: 0,
          purchase_date: new Date().toISOString().split("T")[0],
          quantity: 1,
          grade: "Raw",
          sport: "",
          notes: "",
          image_url: defaultImageUrl,
        }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [imgError, setImgError] = useState(false);

  function set(field: keyof CollectionItemCreate, value: string | number) {
    if (field === "image_url") setImgError(false);
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        purchase_date: new Date(form.purchase_date).toISOString(),
        sport: form.sport || undefined,
      };
      if (isEdit) {
        await api.collection.update(editItem!.id, payload);
      } else {
        await api.collection.create(payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-zinc-950 border border-indigo-900/40 rounded-xl w-full max-w-3xl shadow-2xl shadow-black/60 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="relative flex items-center justify-between px-6 py-4 border-b border-slate-800/60 shrink-0">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent rounded-t-xl" />
          <h2 className="text-lg font-semibold bg-gradient-to-r from-indigo-300 to-blue-300 bg-clip-text text-transparent">
            {isEdit ? "Edit Card" : "Add to Collection"}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-100 text-xl leading-none transition-colors"
          >
            ×
          </button>
        </div>

        {/* Body — two-column layout */}
        <form onSubmit={handleSubmit} className="flex flex-1 min-h-0">

          {/* ── Left: image panel ── */}
          <div className="w-56 shrink-0 border-r border-slate-800/60 flex flex-col gap-3 p-4 bg-zinc-900/40">
            {/* Large preview */}
            <div className="flex-1 min-h-0 rounded-lg overflow-hidden bg-slate-800/60 border border-slate-700/50 flex items-center justify-center">
              {form.image_url && !imgError ? (
                <img
                  key={form.image_url}
                  src={hiRes(form.image_url)}
                  alt="Card preview"
                  className="w-full h-full object-contain"
                  onError={() => setImgError(true)}
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-600 p-4 text-center">
                  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-xs">No image selected</span>
                </div>
              )}
            </div>

            {/* Thumbnail strip */}
            {availableImages.length > 0 && (
              <div>
                <p className="text-xs text-slate-500 mb-1.5">Pick from results</p>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {availableImages.map((url) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => set("image_url", form.image_url === url ? "" : url)}
                      className={`shrink-0 w-10 h-14 rounded border-2 overflow-hidden bg-slate-900 transition-all ${
                        form.image_url === url
                          ? "border-indigo-500 ring-2 ring-indigo-500/40"
                          : "border-slate-700 hover:border-slate-500"
                      }`}
                    >
                      <img
                        src={url}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* URL input */}
            <div>
              <p className="text-xs text-slate-500 mb-1">Custom URL</p>
              <input
                className="input text-xs py-1.5"
                placeholder="https://i.ebayimg.com/..."
                value={form.image_url ?? ""}
                onChange={(e) => set("image_url", e.target.value)}
              />
            </div>
          </div>

          {/* ── Right: form fields ── */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <Field label="Card Name *">
                <input
                  required
                  className="input"
                  placeholder="e.g. 2023 Topps Shohei Ohtani PSA 10"
                  value={form.card_name}
                  onChange={(e) => set("card_name", e.target.value)}
                />
              </Field>

              <Field label="Market Search Query" hint="Used to pull price comps">
                <input
                  className="input"
                  placeholder="e.g. 2023 topps ohtani psa 10"
                  value={form.search_query ?? ""}
                  onChange={(e) => set("search_query", e.target.value)}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Buy Price ($) *">
                  <input
                    required
                    type="number"
                    min={0}
                    step={0.01}
                    className="input"
                    value={form.purchase_price || ""}
                    onChange={(e) => set("purchase_price", parseFloat(e.target.value))}
                  />
                </Field>
                <Field label="Buy Date *">
                  <input
                    required
                    type="date"
                    className="input"
                    value={typeof form.purchase_date === "string"
                      ? form.purchase_date.split("T")[0]
                      : form.purchase_date}
                    onChange={(e) => set("purchase_date", e.target.value)}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Field label="Sport">
                  <select
                    className="input"
                    value={form.sport ?? ""}
                    onChange={(e) => set("sport", e.target.value)}
                  >
                    <option value="">— None —</option>
                    {SPORTS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Grade">
                  <select
                    className="input"
                    value={form.grade ?? "Raw"}
                    onChange={(e) => set("grade", e.target.value)}
                  >
                    {GRADES.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Quantity">
                  <input
                    type="number"
                    min={1}
                    className="input"
                    value={form.quantity}
                    onChange={(e) => set("quantity", parseInt(e.target.value))}
                  />
                </Field>
              </div>

              <Field label="Notes">
                <textarea
                  rows={2}
                  className="input resize-none"
                  placeholder="Optional notes..."
                  value={form.notes ?? ""}
                  onChange={(e) => set("notes", e.target.value)}
                />
              </Field>

              {error && (
                <p className="text-red-400 text-sm">{error}</p>
              )}
            </div>

            {/* Footer buttons */}
            <div className="flex gap-3 px-5 py-4 border-t border-slate-800/60 shrink-0">
              <button type="button" onClick={onClose} className="flex-1 btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="flex-1 btn-primary">
                {saving ? "Saving..." : isEdit ? "Save Changes" : "Add to Collection"}
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-slate-300">
        {label}
        {hint && <span className="ml-1 text-xs text-slate-500">({hint})</span>}
      </label>
      {children}
    </div>
  );
}
