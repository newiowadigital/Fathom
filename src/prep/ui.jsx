import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { fmtDate, addDays, parseISO, toISO, MONL, WD } from "./util";

export const Ctx = createContext(null);
export const useP = () => useContext(Ctx);

/* ---------------- icons (24px stroke set) ---------------- */
const IC = {
  overview: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
  script: "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7",
  scenes: "M3 9h18v11H3zM3 9l2.5-5H9L6.5 9M10 9l2.5-5H16l-2.5 5M17 9l2.5-5",
  location: "M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11zM12 12.2a2.4 2.4 0 100-4.8 2.4 2.4 0 000 4.8z",
  people: "M9 11a4 4 0 100-8 4 4 0 000 8zM2 21v-1a6 6 0 0112 0v1M16 3.5a4 4 0 010 7M18 14a6 6 0 013 5.5V21",
  elements: "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10",
  shots: "M3 7h12v10H3zM15 11l6-3v8l-6-3",
  schedule: "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4M7 14h4M7 17h7",
  docs: "M9 3h6v3H9zM6 5h12v16H6zM9 11h6M9 15h6",
  settings: "M12 15a3 3 0 100-6 3 3 0 000 6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2",
  plus: "M12 5v14M5 12h14", x: "M6 6l12 12M18 6L6 18", search: "M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5",
  down: "M6 9l6 6 6-6", right: "M9 6l6 6-6 6", left: "M15 6l-6 6 6 6", up: "M6 15l6-6 6 6", check: "M5 12l5 5L20 7",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14", edit: "M4 20l4-1 11-11-3-3L5 16z",
  print: "M7 8V3h10v5M5 8h14v9H5zM7 14h10v7H7z", download: "M12 3v12M7 11l5 5 5-5M4 20h16", upload: "M12 16V4M7 8l5-4 5 4M4 20h16",
  sun: "M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5",
  moon: "M20 14A8 8 0 019 3a8 8 0 1011 11z",
  warn: "M12 3l10 18H2zM12 10v5M12 18v.5", info: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v6M12 7.5v.5",
  wand: "M5 19L16 8M15 3l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1zM19 13l.7 1.6 1.6.7-1.6.7L19 17.6l-.7-1.6-1.6-.7 1.6-.7z",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 018 0v4", copy: "M8 8h12v12H8zM4 16V4h12", link: "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2", map: "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14",
  undo: "M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3", redo: "M15 14l5-5-5-5M20 9H9a5 5 0 000 10h3",
  menu: "M4 7h16M4 12h16M4 17h16", grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z", list: "M8 6h13M8 12h13M8 18h13M3 6h.5M3 12h.5M3 18h.5",
  pen: "M4 20l1-4L17 4l3 3L8 19z", eraser: "M7 21h13M5 14l8-8 6 6-8 8H8z", film: "M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4",
  logout: "M10 4H5v16h5M15 8l4 4-4 4M19 12H9", target: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 16a4 4 0 100-8 4 4 0 000 8z",
  tag: "M3 12V3h9l9 9-9 9zM8 8h.5", play: "M7 4l13 8-13 8z", route: "M6 19a2 2 0 100-4 2 2 0 000 4zM18 9a2 2 0 100-4 2 2 0 000 4zM8 17h6a4 4 0 000-8h-4a3 3 0 010-6h5",
  image: "M3 4h18v16H3zM3 16l5-5 4 4 3-3 6 6M9 9a1.5 1.5 0 100-3 1.5 1.5 0 000 3z", dupe: "M9 9h11v11H9zM4 15V4h11",
  grip: "M9 5h.5M9 12h.5M9 19h.5M15 5h.5M15 12h.5M15 19h.5", cloud: "M7 18a4 4 0 010-8 5 5 0 019.6-1A4.5 4.5 0 0117 18z",
  book: "M4 4h12a3 3 0 013 3v13H7a3 3 0 01-3-3zM4 17a3 3 0 013-3h12",
};
export function Icon({ n, s = 18, className = "", style }) {
  return (
    <svg className={"ico " + className} width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
      <path d={IC[n] || IC.info} />
    </svg>
  );
}

/* ---------------- tiny components ---------------- */
export const Btn = ({ icon, children, variant, size, active, className = "", ...r }) => (
  <button className={["btn", variant && "btn-" + variant, size && "btn-" + size, active && "on", className].filter(Boolean).join(" ")} {...r}>
    {icon && <Icon n={icon} s={size === "sm" ? 14 : 16} />}{children}
  </button>
);
export const IconBtn = ({ icon, title, variant = "ghost", size, ...r }) => (
  <button className={`btn btn-${variant} btn-ico ${size ? "btn-" + size : ""}`} title={title} aria-label={title} {...r}><Icon n={icon} s={size === "sm" ? 14 : 17} /></button>
);

export function Field({ label, children, hint, className = "" }) {
  return <label className={"field " + className}>{label && <span className="lab">{label}</span>}{children}{hint && <div className="help">{hint}</div>}</label>;
}
export function Txt({ label, value, onChange, placeholder, type = "text", hint, mono, ...r }) {
  return (
    <Field label={label} hint={hint}>
      <input className={"input" + (mono ? " mono" : "")} type={type} value={value ?? ""} placeholder={placeholder} onChange={e => onChange(e.target.value)} {...r} />
    </Field>
  );
}
export function Area({ label, value, onChange, placeholder, rows = 3, hint }) {
  return <Field label={label} hint={hint}><textarea className="textarea" rows={rows} value={value ?? ""} placeholder={placeholder} onChange={e => onChange(e.target.value)} /></Field>;
}
export function Sel({ label, value, onChange, options, hint, small, ...r }) {
  const opts = options.map(o => (typeof o === "string" ? { k: o, l: o } : o));
  return (
    <Field label={label} hint={hint}>
      <select className={"select" + (small ? " select-sm" : "")} value={value ?? ""} onChange={e => onChange(e.target.value)} {...r}>
        {opts.map(o => <option key={o.k} value={o.k}>{o.l}</option>)}
      </select>
    </Field>
  );
}
export function Num({ label, value, onChange, min, max, step = 1, hint }) {
  return <Field label={label} hint={hint}><input className="input mono" type="number" min={min} max={max} step={step} value={value ?? ""} onChange={e => onChange(e.target.value === "" ? "" : +e.target.value)} /></Field>;
}
export const Seg = ({ value, onChange, options }) => (
  <div className="seg" role="tablist">
    {options.map(o => <button key={o.k} role="tab" aria-selected={value === o.k} className={value === o.k ? "on" : ""} onClick={() => onChange(o.k)}>{o.i && <Icon n={o.i} s={14} />}{o.l}</button>)}
  </div>
);
export const SearchBox = ({ value, onChange, placeholder = "Search…", width = 220 }) => (
  <div className="search" style={{ width }}><Icon n="search" s={15} /><input className="input input-sm" style={{ paddingLeft: 30 }} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} /></div>
);
export const Chip = ({ children, onClick, onRemove, color, title }) => (
  <span className={"chip" + (onClick ? " click" : "")} onClick={onClick} title={title} style={color ? { background: color + "26", color: "inherit", borderColor: color + "55" } : undefined}>
    {color && <i className="catdot" style={{ background: color }} />}<span className="ell">{children}</span>
    {onRemove && <span className="x" onClick={e => { e.stopPropagation(); onRemove(); }}><Icon n="x" s={12} /></span>}
  </span>
);
export const Pill = ({ tone = "mute", children, onClick, title }) => onClick
  ? <button className={"pill " + tone} onClick={onClick} title={title}>{children}</button>
  : <span className={"pill " + tone} title={title}>{children}</span>;
export const Section = ({ title, action, children }) => (
  <div className="sect"><div className="sect-h">{title}<span className="sp" />{action}</div>{children}</div>
);
export const Empty = ({ icon = "info", title, children, action }) => (
  <div className="empty"><Icon n={icon} s={34} /><h3>{title}</h3><div>{children}</div>{action && <div style={{ marginTop: 14 }}>{action}</div>}</div>
);

/* chips with a "+ add" dropdown */
export function PickChips({ items, options, onAdd, onRemove, addLabel = "Add", render, lockedIds }) {
  const [open, setOpen] = useState(false);
  const avail = options.filter(o => !items.some(i => i.id === o.id));
  return (
    <div className="chips">
      {items.map(i => <Chip key={i.id} color={i.color} onClick={i.onClick} onRemove={lockedIds && lockedIds.has(i.id) ? undefined : () => onRemove(i.id)} title={lockedIds && lockedIds.has(i.id) ? "From the script" : undefined}>{render ? render(i) : i.label}</Chip>)}
      <div style={{ position: "relative" }}>
        <button className="chip click" onClick={() => setOpen(!open)} style={{ background: "transparent", border: "1px dashed var(--line2)" }}><Icon n="plus" s={12} />{addLabel}</button>
        {open && <Menu onClose={() => setOpen(false)} style={{ top: 28, left: 0, maxHeight: 260, overflowY: "auto" }}>
          {avail.length === 0 && <div className="muted" style={{ padding: 10 }}>Nothing else to add</div>}
          {avail.map(o => <button key={o.id} onClick={() => { onAdd(o.id); setOpen(false); }}>{o.color && <i className="catdot" style={{ background: o.color }} />}{o.label}</button>)}
        </Menu>}
      </div>
    </div>
  );
}

export function Menu({ onClose, children, style, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const k = e => { if (e.key === "Escape") onClose(); };
    setTimeout(() => document.addEventListener("mousedown", h), 0);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [onClose]);
  return <div ref={ref} className={"menu " + className} style={style}>{children}</div>;
}
export function DropBtn({ label, icon, items, align = "left", variant, size }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <Btn icon={icon} variant={variant} size={size} onClick={() => setOpen(!open)}>{label}<Icon n="down" s={13} /></Btn>
      {open && <Menu onClose={() => setOpen(false)} style={{ top: "calc(100% + 4px)", [align]: 0 }}>
        {items.map((it, i) => it.sep ? <div key={i} className="sep" /> : it.cap ? <div key={i} className="cap">{it.cap}</div> :
          <button key={i} disabled={it.disabled} onClick={() => { setOpen(false); it.onClick(); }}>{it.icon && <Icon n={it.icon} s={15} />}{it.label}</button>)}
      </Menu>}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => { const k = e => e.key === "Escape" && onClose(); document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="overlay center" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={"modal" + (wide ? " wide" : "")} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-h"><h3>{title}</h3><IconBtn icon="x" title="Close" onClick={onClose} /></div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------------- date list editor (availability / blackout dates) ---------------- */
export function DateList({ dates = [], onChange, label = "Add date" }) {
  const [v, setV] = useState("");
  const sorted = [...dates].sort();
  return (
    <div>
      <div className="chips" style={{ marginBottom: 6 }}>
        {sorted.length === 0 && <span className="muted">None</span>}
        {sorted.map(d => <Chip key={d} onRemove={() => onChange(dates.filter(x => x !== d))}>{fmtDate(d)}</Chip>)}
      </div>
      <div className="row auto" style={{ gap: 6 }}>
        <input className="input input-sm" type="date" value={v} onChange={e => setV(e.target.value)} style={{ width: 150 }} />
        <Btn size="sm" icon="plus" disabled={!v || dates.includes(v)} onClick={() => { onChange([...dates, v]); setV(""); }}>{label}</Btn>
      </div>
    </div>
  );
}

export const Avatar = ({ name, color }) => {
  const ini = (name || "?").split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
  let h = 0; for (const ch of name || "?") h = (h * 31 + ch.charCodeAt(0)) % 360;
  return <span className="avatar" style={{ background: color || `hsl(${h} 45% 45%)` }}>{ini}</span>;
};

export function InspHead({ title, sub, onClose, actions }) {
  return (
    <div className="insp-head">
      <div style={{ flex: 1, minWidth: 0 }}><h2 className="ell">{title}</h2>{sub && <div className="muted" style={{ marginTop: 2 }}>{sub}</div>}</div>
      {actions}
      <IconBtn icon="x" title="Close panel" onClick={onClose} />
    </div>
  );
}

/* a tiny debounce-to-parent text input for big, expensive state */
export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export { fmtDate, addDays, parseISO, toISO, MONL, WD };
