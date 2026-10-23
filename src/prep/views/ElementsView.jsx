import React, { useMemo, useState } from "react";
import { useP, Btn, IconBtn, Chip, Pill, Seg, SearchBox, Txt, Area, Sel, Num, Section, InspHead, PickChips, Empty } from "../ui";
import { mkElement, CATS, CAT, ELEMENT_STATUS } from "../model";
import { NoSelection } from "./shared";

const TONE = { needed: "bad", sourcing: "warn", acquired: "info", ready: "ok" };

export default function ElementsView() {
  const { prod, ix, add, patch, sel, select } = useP();
  const [cat, setCat] = useState("");
  const [mode, setMode] = useState("table");
  const [q, setQ] = useState("");
  const [over, setOver] = useState(null);
  const el = ix.elById.get(sel.element);
  const rows = useMemo(() => prod.elements.filter(e => (!cat || e.cat === cat) && (!q || `${e.name} ${e.notes} ${e.source}`.toLowerCase().includes(q.toLowerCase()))), [prod.elements, cat, q]);
  const addEl = () => { const e = mkElement({ cat: cat || "prop" }); add("elements", e); select("element", e.id); };
  const cycle = e => { const i = ELEMENT_STATUS.findIndex(s => s.k === e.status); patch("elements", e.id, { status: ELEMENT_STATUS[(i + 1) % ELEMENT_STATUS.length].k }); };
  const scn = e => e.sceneIds.map(id => ix.sceneById.get(id)).filter(Boolean).sort((a, b) => prod.scenes.indexOf(a) - prod.scenes.indexOf(b));

  return (
    <>
      <div className="view-main">
        <div className="toolbar">
          <Seg value={mode} onChange={setMode} options={[{ k: "table", l: "List", i: "list" }, { k: "board", l: "Board", i: "grid" }]} />
          <SearchBox value={q} onChange={setQ} placeholder="Search elements…" />
          <span className="sp" />
          <span className="muted mono">{prod.elements.filter(e => e.status === "acquired" || e.status === "ready").length}/{prod.elements.length} acquired</span>
          <Btn variant="pri" icon="plus" onClick={addEl}>Add element</Btn>
        </div>
        <div className="toolbar" style={{ paddingTop: 8, paddingBottom: 8, background: "var(--panel2)" }}>
          <div className="chips">
            <button className={"chip click" + (cat === "" ? " on" : "")} style={cat === "" ? { background: "var(--tx)", color: "var(--bg)" } : undefined} onClick={() => setCat("")}>All · {prod.elements.length}</button>
            {CATS.map(c => {
              const n = prod.elements.filter(e => e.cat === c.k).length; if (!n && cat !== c.k) return null;
              return <button key={c.k} className="chip click" style={cat === c.k ? { background: c.c, color: "#111" } : undefined} onClick={() => setCat(cat === c.k ? "" : c.k)}><i className="catdot" style={{ background: c.c }} />{c.l} · {n}</button>;
            })}
          </div>
        </div>

        {prod.elements.length === 0 ? (
          <Empty icon="elements" title="No elements yet" action={<Btn variant="pri" icon="plus" onClick={addEl}>Add an element</Btn>}>Props, wardrobe, vehicles, effects and more. Select text in the Script to tag them, or add them here and link them to scenes.</Empty>
        ) : mode === "table" ? (
          <div className="scroll tbl-wrap" style={{ flex: 1 }}>
            <table className="tbl">
              <thead><tr><th>Element</th><th>Category</th><th>Qty</th><th>Status</th><th>Scenes</th><th>Source</th></tr></thead>
              <tbody>{rows.map(e => (
                <tr key={e.id} className={"row-click" + (sel.element === e.id ? " sel" : "")} onClick={() => select("element", e.id)}>
                  <td><b>{e.name}</b>{e.notes && <div className="muted ell" style={{ maxWidth: 320 }}>{e.notes}</div>}</td>
                  <td><span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><i className="catdot" style={{ background: CAT[e.cat]?.c }} />{CAT[e.cat]?.l}</span></td>
                  <td className="mono">{e.qty}</td>
                  <td onClick={ev => ev.stopPropagation()}><Pill tone={TONE[e.status]} onClick={() => cycle(e)} title="Click to advance status">{ELEMENT_STATUS.find(s => s.k === e.status)?.l}</Pill></td>
                  <td className="mono">{scn(e).map(s => s.num).join(", ") || <span className="muted">—</span>}</td>
                  <td className="tx2">{e.source || "—"}</td>
                </tr>))}</tbody>
            </table>
          </div>
        ) : (
          <div className="kanban">
            {ELEMENT_STATUS.map(st => (
              <div key={st.k} className={"kcol" + (over === st.k ? " drop" : "")}
                onDragOver={e => { e.preventDefault(); setOver(st.k); }} onDragLeave={() => setOver(null)}
                onDrop={e => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/el"); if (id) patch("elements", id, { status: st.k }); }}>
                <div className="lane-h"><Pill tone={TONE[st.k]}>{st.l}</Pill><span className="sp" style={{ flex: 1 }} /><span className="muted mono">{rows.filter(e => e.status === st.k).length}</span></div>
                <div className="lane-b">
                  {rows.filter(e => e.status === st.k).map(e => (
                    <div key={e.id} className={"kcard" + (sel.element === e.id ? " sel" : "")} style={{ borderLeftColor: CAT[e.cat]?.c }} draggable onDragStart={ev => ev.dataTransfer.setData("text/el", e.id)} onClick={() => select("element", e.id)}>
                      <div style={{ fontWeight: 600 }}>{e.name}{e.qty > 1 && <span className="muted mono"> ×{e.qty}</span>}</div>
                      <div className="muted" style={{ fontSize: 11.5 }}>{CAT[e.cat]?.l} · sc {scn(e).map(s => s.num).join(", ") || "—"}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {el ? <ElInspector el={el} key={el.id} /> : <NoSelection icon="elements" title="Select an element">Track where each prop, costume or effect comes from, what state it’s in, and which scenes need it.</NoSelection>}
    </>
  );
}

function ElInspector({ el }) {
  const { prod, ix, patch, remove, select, nav } = useP();
  const up = ch => patch("elements", el.id, ch);
  const scenes = el.sceneIds.map(id => ix.sceneById.get(id)).filter(Boolean);
  return (
    <aside className="insp">
      <InspHead title={el.name || "Element"} sub={CAT[el.cat]?.l} onClose={() => select("element", null)}
        actions={<IconBtn icon="trash" title="Delete element" onClick={() => { remove("elements", el.id); select("element", null); }} />} />
      <div className="insp-body">
        <Txt label="Name" value={el.name} onChange={v => up({ name: v })} />
        <div className="row"><Sel label="Category" value={el.cat} onChange={v => up({ cat: v })} options={CATS.map(c => ({ k: c.k, l: c.l }))} /><Sel label="Status" value={el.status} onChange={v => up({ status: v })} options={ELEMENT_STATUS} /></div>
        <div className="row"><Num label="Quantity" value={el.qty} min={1} onChange={v => up({ qty: v || 1 })} hint="Spares, doubles, hero + stunt versions." /><Txt label="Source / owner" value={el.source} onChange={v => up({ source: v })} placeholder="Rental, borrowed, buy…" /></div>
        <Area label="Notes" value={el.notes} onChange={v => up({ notes: v })} rows={3} />
        <Section title="Used in scenes">
          <PickChips items={scenes.map(s => ({ id: s.id, label: `${s.num}. ${s.locName}`, onClick: () => nav("scene", s.id) }))}
            options={prod.scenes.map(s => ({ id: s.id, label: `${s.num}. ${s.ie} ${s.locName} – ${s.tod}` }))}
            onAdd={id => up({ sceneIds: [...el.sceneIds, id] })} onRemove={id => up({ sceneIds: el.sceneIds.filter(x => x !== id) })} addLabel="Add scene" />
        </Section>
        {scenes.some(s => ix.dayOfScene.has(s.id)) && (
          <Section title="Needed on set"><div className="chips">{[...new Set(scenes.map(s => ix.dayOfScene.get(s.id)).filter(Boolean).map(x => x.n))].sort((a, b) => a - b).map(n => <Chip key={n} onClick={() => nav("day", ix.days[n - 1].id)}>Day {n}</Chip>)}</div></Section>
        )}
      </div>
    </aside>
  );
}
