import React, { useMemo, useRef } from "react";
import { useP, Icon, Btn, Seg } from "../ui";
import { CallSheet, ShotList, Stripboard, OneLiner, Dood, Breakdown, CastList, CrewList, LocationSheet, ElementList, Storyboard, Book, csvFor } from "../docs";
import { CATS } from "../model";
import { download, slug, fmtDate, todayISO } from "../util";

const DOCS = [
  { g: "Daily", id: "callsheet", t: "Call Sheet", d: "One shoot day: times, locations, cast, crew, elements, advance", i: "docs", day: true },
  { g: "Planning", id: "shotlist", t: "Shot List", d: "Every shot by script order, shooting order or day", i: "shots", day: "opt" },
  { g: "Planning", id: "stripboard", t: "Shooting Schedule", d: "Stripboard report, colour-coded by INT/EXT and day/night", i: "schedule" },
  { g: "Planning", id: "oneliner", t: "One-Liner", d: "One line per scene, in shooting or script order", i: "list" },
  { g: "Planning", id: "dood", t: "Day Out of Days", d: "Cast start, work, hold and finish by shoot day", i: "people" },
  { g: "Planning", id: "storyboard", t: "Storyboard", d: "Sketched frames with shot details", i: "image" },
  { g: "Breakdown", id: "breakdown", t: "Breakdown Sheets", d: "One sheet per scene with all its elements", i: "scenes" },
  { g: "Breakdown", id: "elements", t: "Props & Elements", d: "Checklists by category with scenes and days", i: "elements" },
  { g: "Contacts", id: "cast", t: "Cast List", d: "Characters, actors, contact info and scenes", i: "people" },
  { g: "Contacts", id: "crew", t: "Crew List", d: "By department with phone and email", i: "people" },
  { g: "Contacts", id: "locations", t: "Location Sheet", d: "Addresses, contacts, parking, power and permits", i: "location" },
  { g: "Everything", id: "book", t: "Production Book", d: "Every document above in one printable book", i: "book" },
];

function buildHTML(node, title) {
  /* inline every readable stylesheet so the file is self-contained; web fonts stay as links and fall back to system fonts offline */
  const css = [...document.styleSheets].map(ss => { try { return [...ss.cssRules].map(r => r.cssText).join("\n"); } catch (e) { return ""; } }).join("\n");
  const fonts = [...document.querySelectorAll('link[rel="stylesheet"]')].filter(l => /fonts\.googleapis/.test(l.href)).map(l => `<link rel="stylesheet" href="${l.href}">`).join("\n");
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  return `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><title>${esc(title)}</title>${fonts}
<style>${css}</style>
<style>html,body{background:#fff!important;height:auto!important;overflow:visible!important}.paper{box-shadow:none!important;width:100%!important;max-width:none!important;padding:0!important;margin:0 0 24px!important}.print-root{display:block!important;width:100%!important}@page{margin:12mm}</style></head>
<body>${node.outerHTML}</body></html>`;
}
function printNode(node, title, toast) {
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  f.srcdoc = buildHTML(node, title);
  f.onload = () => {
    const w = f.contentWindow;
    const go = () => { try { w.focus(); w.print(); } catch (e) { toast("Printing isn’t available in this browser"); } setTimeout(() => f.remove(), 4000); };
    (w.document.fonts?.ready || Promise.resolve()).then(() => setTimeout(go, 150));
  };
  document.body.appendChild(f);
}

export default function DocsView() {
  const { prod, ix, sel, select, toast } = useP();
  const doc = sel.doc || "callsheet";
  const meta = DOCS.find(d => d.id === doc) || DOCS[0];
  const today = todayISO();
  const defaultDay = (ix.days.find(d => d.date >= today) || ix.days[0])?.id;
  const dayId = sel.docDay && ix.days.some(d => d.id === sel.docDay) ? sel.docDay : defaultDay;
  const scope = sel.docScope || (meta.id === "shotlist" ? "all" : "");
  const order = sel.docOrder || (ix.days.length ? "shoot" : "script");
  const cat = sel.docCat || "";
  const withScript = !!sel.docScript;
  const root = useRef(null);
  const common = { prod, ix };

  const csv = useMemo(() => csvFor(doc, prod, ix, { dayId, scope, order, cat }), [doc, prod, ix, dayId, scope, order, cat]);
  const fname = slug(`${prod.title}-${meta.t}${meta.id === "callsheet" && dayId ? "-day" + (ix.days.findIndex(d => d.id === dayId) + 1) : ""}`);

  return (
    <div className="docs">
      <div className="docs-side">
        {["Daily", "Planning", "Breakdown", "Contacts", "Everything"].map(g => (
          <div key={g}>
            <div className="nav-group" style={{ color: "var(--tx3)" }}>{g}</div>
            {DOCS.filter(d => d.g === g).map(d => (
              <button key={d.id} className={"doc-item" + (doc === d.id ? " on" : "")} onClick={() => select("doc", d.id)}>
                <Icon n={d.i} s={17} /><div><div className="t">{d.t}</div><div className="d">{d.d}</div></div>
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="docs-stage">
        <div className="docs-bar">
          <h2 style={{ margin: 0, fontSize: 16 }}>{meta.t}</h2>
          {(meta.day === true || (meta.day === "opt" && scope === "day")) && (
            <select className="select select-sm" style={{ width: 250 }} value={dayId || ""} onChange={e => select("docDay", e.target.value)} aria-label="Shoot day">
              {ix.days.length === 0 && <option value="">No shoot days</option>}
              {ix.days.map((d, i) => <option key={d.id} value={d.id}>Day {i + 1} · {fmtDate(d.date, true)}</option>)}
            </select>
          )}
          {meta.id === "shotlist" && <Seg value={scope || "all"} onChange={v => select("docScope", v)} options={[{ k: "all", l: "Whole film" }, { k: "day", l: "One day" }]} />}
          {((meta.id === "shotlist" && scope !== "day") || meta.id === "oneliner") && <Seg value={order} onChange={v => select("docOrder", v)} options={[{ k: "shoot", l: "Shooting order" }, { k: "script", l: "Script order" }]} />}
          {meta.id === "elements" && <select className="select select-sm" style={{ width: 170 }} value={cat} onChange={e => select("docCat", e.target.value)}><option value="">All categories</option>{CATS.map(c => <option key={c.k} value={c.k}>{c.l}</option>)}</select>}
          {meta.id === "breakdown" && <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={withScript} onChange={e => select("docScript", e.target.checked)} />Include script text</label>}
          <span className="sp" />
          {csv && <Btn icon="download" onClick={() => download(fname + ".csv", csv, "text/csv")}>CSV</Btn>}
          <Btn icon="download" onClick={() => root.current && download(fname + ".html", buildHTML(root.current, `${prod.title} · ${meta.t}`), "text/html")}>HTML</Btn>
          <Btn variant="pri" icon="print" onClick={() => root.current && printNode(root.current, `${prod.title} · ${meta.t}`, toast)}>Print / Save PDF</Btn>
        </div>
        <div ref={root} className="print-root" style={{ width: "min(980px,100%)", display: "flex", flexDirection: "column", gap: 22 }}>
          {doc === "callsheet" && <CallSheet {...common} dayId={dayId} />}
          {doc === "shotlist" && <ShotList {...common} scope={scope || "all"} dayId={dayId} order={order} />}
          {doc === "stripboard" && <Stripboard {...common} />}
          {doc === "oneliner" && <OneLiner {...common} order={order} />}
          {doc === "dood" && <Dood {...common} />}
          {doc === "storyboard" && <Storyboard {...common} />}
          {doc === "breakdown" && <Breakdown {...common} withScript={withScript} />}
          {doc === "elements" && <ElementList {...common} cat={cat} />}
          {doc === "cast" && <CastList {...common} />}
          {doc === "crew" && <CrewList {...common} />}
          {doc === "locations" && <LocationSheet {...common} />}
          {doc === "book" && <Book {...common} />}
        </div>
        <div className="muted" style={{ maxWidth: 980, textAlign: "center" }}>Documents update live from your breakdown, schedule and shot list. Choose “Save as PDF” in the print dialog to export.</div>
      </div>
    </div>
  );
}
