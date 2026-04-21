"use client";

import { useRef, useState } from "react";

const POPUP_W = 220; // px — width of the enlarged popup

/** Swap eBay thumbnail size token for the highest available resolution. */
function hiRes(url: string): string {
  return url.replace(/s-l\d+(\.\w+)$/, "s-l1600$1");
}

interface HoverImageProps {
  /** Full-size (or best available) image URL. If falsy the component is a no-op wrapper. */
  src?: string | null;
  /** Rendered as the trigger — the small thumbnail already in the page */
  children: React.ReactNode;
}

/**
 * Wraps a thumbnail and shows a fixed-position enlarged image on hover.
 * Works inside tables / overflow-hidden ancestors because the popup uses
 * `position: fixed` which is viewport-relative.
 */
export function HoverImage({ src, children }: HoverImageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [popup, setPopup] = useState<{ top: number; left: number } | null>(null);

  if (!src) return <>{children}</>;

  function handleMouseEnter() {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    // Prefer right side; fall back to left if near the right edge
    const left =
      r.right + 8 + POPUP_W < window.innerWidth - 16
        ? r.right + 8
        : r.left - POPUP_W - 8;
    // Clamp top so the popup doesn't run off the bottom of the viewport
    const top = Math.min(r.top, window.innerHeight - 320);
    setPopup({ top, left });
  }

  function handleMouseLeave() {
    setPopup(null);
  }

  return (
    <>
      <div
        ref={ref}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="cursor-zoom-in"
      >
        {children}
      </div>

      {popup && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{ top: popup.top, left: popup.left, width: POPUP_W }}
        >
          <div className="rounded-xl overflow-hidden shadow-2xl border border-slate-600/50 bg-zinc-900">
            <img
              src={hiRes(src)}
              alt=""
              className="w-full object-contain"
              style={{ maxHeight: "20rem" }}
            />
          </div>
        </div>
      )}
    </>
  );
}
