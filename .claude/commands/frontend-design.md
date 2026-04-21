# Card Room — Frontend Design System

This skill captures the complete design language for the **Card Room** sports card tracking app.
When making any frontend changes, follow these rules exactly.

---

## Brand Identity

- **App name**: Card Room
- **Logo component**: `<CardRoomLogo />` from `frontend/components/CardRoomLogo.tsx`
  - Use `iconSize` and `textSize` props to adjust scale
  - Always use this component — never write the name as plain text in the nav

---

## Color Palette

| Role | Token | Hex |
|------|-------|-----|
| Page background | `bg-zinc-950` | #09090b |
| Card/surface | `bg-slate-900/90` | #0f172a |
| Subtle surface | `bg-slate-800/50` | #1e293b |
| Border default | `border-slate-800/60` | |
| Border hover | `border-slate-700/50` | |
| Text primary | `text-slate-100` / `text-white` | |
| Text secondary | `text-slate-300` | |
| Text muted | `text-slate-400` / `text-slate-500` | |
| Accent primary | `indigo-500` / `indigo-600` | #6366f1 / #4f46e5 |
| Accent secondary | `blue-500` / `blue-600` | #3b82f6 / #2563eb |
| Positive / gain | `text-emerald-400` | #34d399 |
| Negative / loss | `text-red-400` | #f87171 |

---

## Gradient Recipes

Always use these exact gradient definitions — do not invent new ones.

```css
/* Button / CTA fill */
bg-gradient-to-r from-indigo-600 to-blue-600

/* Logo / heading text */
bg-gradient-to-r from-indigo-400 to-blue-400 bg-clip-text text-transparent

/* Stat card / modal top accent line */
bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent

/* Nav bottom separator */
bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent

/* Active tab pill background */
bg-indigo-600/20  border border-indigo-500/30  text-indigo-300
```

---

## Component Classes (globals.css)

### `.btn-primary`
```css
bg-gradient-to-r from-indigo-600 to-blue-600
hover: brightness-110
text-white font-medium rounded-lg px-4 py-2
shadow-sm shadow-indigo-500/20
transition-all
```

### `.btn-secondary`
```css
bg-slate-800 hover:bg-slate-700
border border-slate-700
text-slate-300 hover:text-white
rounded-lg px-4 py-2 transition-colors
```

### `.input`
```css
bg-slate-800/60 border border-slate-700/50
focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50
text-slate-100 placeholder-slate-500
rounded-lg px-3 py-2 w-full
```

### `.card`
```css
bg-slate-900/90 border border-slate-800/60
rounded-xl p-4
shadow-lg shadow-black/30
```

---

## Navigation Bar Pattern

Both pages share the **exact same nav structure**:

```tsx
<nav className="bg-zinc-950/90 backdrop-blur-md sticky top-0 z-40">
  <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
    <CardRoomLogo />               {/* ← always the component, never plain text */}
    <div className="flex gap-1">
      {/* Active tab */}
      <span className="px-3 py-1.5 rounded-md bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-sm font-medium">
        PageName
      </span>
      {/* Inactive tab */}
      <Link href="..." className="px-3 py-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800/60 text-sm font-medium transition-colors">
        OtherPage
      </Link>
    </div>
  </div>
  <div className="h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />
</nav>
```

---

## StatCard Pattern

```tsx
<div className="card py-3 relative overflow-hidden">
  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />
  <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
  <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
</div>
```

---

## Table Pattern

```tsx
<table className="w-full text-sm">
  <thead>
    <tr className="border-b border-slate-800/60 text-slate-500 text-xs uppercase tracking-wide bg-zinc-950/60">
      <th className="text-left px-4 py-3">Column</th>
      {/* right-aligned columns: text-right px-4 py-3 */}
    </tr>
  </thead>
  <tbody>
    <tr className="border-b border-slate-800/40 hover:bg-indigo-950/20 transition-colors cursor-pointer">
      <td className="px-4 py-3">...</td>
    </tr>
  </tbody>
</table>
```

---

## Modal Pattern

```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
  <div className="bg-zinc-950 border border-indigo-900/40 rounded-xl w-full max-w-md mx-4 shadow-2xl shadow-black/60">
    {/* Header */}
    <div className="relative flex items-center justify-between p-5 border-b border-slate-800/60">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent rounded-t-xl" />
      <h2 className="text-lg font-semibold bg-gradient-to-r from-indigo-300 to-blue-300 bg-clip-text text-transparent">
        Title
      </h2>
      <button onClick={onClose} className="text-slate-500 hover:text-slate-100 text-xl leading-none transition-colors">×</button>
    </div>
    {/* Body */}
    <form className="p-5 space-y-4">...</form>
  </div>
</div>
```

---

## Chart Colors (Recharts)

- Weekly avg line stroke: `#818cf8` (indigo-400)
- Active dot fill: `#818cf8`
- Median reference line: `#475569` dashed
- Buy price reference line: `#ef4444` dashed
- CartesianGrid stroke: `#1e293b`
- Axis tick fill: `#64748b`
- Tooltip bg: `bg-zinc-900`, border: `border-indigo-800/50`
- Tooltip price text: `text-indigo-400 font-bold`

---

## Card Thumbnail Pattern (Collection Row)

```tsx
<div
  className="shrink-0 w-10 rounded overflow-hidden bg-slate-800 border border-slate-700/50 flex items-center justify-center"
  style={{ height: "3.25rem" }}
>
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
```

---

## Typography

- Font: `Inter` (via `next/font/google`)
- Page titles: `text-2xl font-bold text-white`
- Section headings: `text-sm font-medium text-slate-300`
- Labels / meta: `text-xs text-slate-500 uppercase tracking-wide`
- Body: `text-sm text-slate-300`

---

## Do's and Don'ts

**Do:**
- Use the gradient recipes above verbatim
- Use `CardRoomLogo` in every nav
- Keep `bg-zinc-950` as the outermost background
- Use `card` class for all surface containers

**Don't:**
- Invent new accent colors (no purples, greens, or oranges as primary accents)
- Use `bg-white` or light backgrounds anywhere
- Use `font-sans` or other fonts — Inter is already set globally
- Skip the gradient top accent line on stat cards and modals
