/* Small shared helpers: ids, dates, times, CSV, files. */

let _n = 0;
export const uid = () => `${Date.now().toString(36)}${(++_n).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const norm = s => (s || "").toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
export const titleCase = s => (s || "").toLowerCase().replace(/(^|[\s\-/'(])([a-z])/g, (m, a, b) => a + b.toUpperCase());
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const sum = arr => arr.reduce((a, b) => a + b, 0);
export const uniq = arr => [...new Set(arr)];

/* ---------- dates (ISO strings, local time) ---------- */
export const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WDL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const p2 = n => String(n).padStart(2, "0");
export const toISO = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const parseISO = s => { const [y, m, d] = (s || "").split("-").map(Number); return new Date(y || 1970, (m || 1) - 1, d || 1); };
export const todayISO = () => toISO(new Date());
export const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
export const diffDays = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
export const dow = iso => parseISO(iso).getDay();
export const fmtDate = (iso, long) => {
  if (!iso) return "—";
  const d = parseISO(iso);
  return long ? `${WDL[d.getDay()]}, ${MONL[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` : `${WD[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}`;
};
export const fmtShortDate = iso => { if (!iso) return "—"; const d = parseISO(iso); return `${MON[d.getMonth()]} ${d.getDate()}`; };
export const nextWeekday = (iso, want = 1) => { let d = iso; for (let i = 0; i < 8; i++) { if (dow(d) === want) return d; d = addDays(d, 1); } return iso; };

/* ---------- times ("HH:MM" <-> minutes) ---------- */
export const toMin = t => { if (!t) return 0; const [h, m] = t.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
export const fromMin = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return `${p2(Math.floor(m / 60))}:${p2(m % 60)}`; };
export const fmtT = m => {
  if (m == null || isNaN(m)) return "—";
  const mm = ((Math.round(m) % 1440) + 1440) % 1440, h = Math.floor(mm / 60), x = mm % 60;
  return `${((h + 11) % 12) + 1}:${p2(x)} ${h < 12 ? "AM" : "PM"}`;
};
export const fmtTs = t => fmtT(toMin(t));
export const fmtDur = m => { m = Math.round(m); if (m < 60) return `${m}m`; const h = Math.floor(m / 60), r = m % 60; return r ? `${h}h ${r}m` : `${h}h`; };

/* page counts are written in eighths: 8 = one page */
export const fmtPages = e => {
  if (!e) return "0";
  const w = Math.floor(e / 8), r = e % 8;
  return `${w ? w : ""}${w && r ? " " : ""}${r ? `${r}/8` : ""}` || "0";
};

/* ---------- geo ---------- */
export const haversineKm = (a, b) => {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};
export const hasGeo = l => l && l.lat !== "" && l.lat != null && l.lng !== "" && l.lng != null && !isNaN(+l.lat) && !isNaN(+l.lng);

/* ---------- files / csv ---------- */
export const csvCell = v => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCSV = (headers, rows) => [headers, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n");
export const download = (name, text, type = "text/plain") => {
  const b = new Blob([text], { type });
  const u = URL.createObjectURL(b);
  const a = document.createElement("a");
  a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
};
export const slug = s => (s || "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled";
export const stripHtml = h => { try { const d = document.createElement("div"); d.innerHTML = h || ""; return (d.textContent || "").trim(); } catch (e) { return (h || "").replace(/<[^>]+>/g, ""); } };

/* Downscale an uploaded image so it fits comfortably in the 1 MB cloud document. */
export const shrinkImage = (file, max = 520, q = 0.62) => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onerror = () => rej(new Error("Could not read image"));
  fr.onload = () => {
    const img = new Image();
    img.onerror = () => rej(new Error("Not an image"));
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL("image/jpeg", q));
    };
    img.src = fr.result;
  };
  fr.readAsDataURL(file);
});
