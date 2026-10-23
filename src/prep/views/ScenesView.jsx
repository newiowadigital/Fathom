import React, { useMemo, useState } from "react";
import { useP, Icon, Btn, IconBtn, Chip, Pill, Seg, SearchBox, Txt, Area, Sel, Num, Section, PickChips, InspHead, Empty } from "../ui";
import { mkScene, mkLocation, mkElement, mkShot, reassignSet, CATS, SCENE_STATUS, TODS, IES, stripKind, STRIP_LABEL } from "../model";
import { sceneTexts } from "../script";
import { sceneMinutes } from "../plan";
import { norm, fmtPages, fmtDur, fmtDate, fmtShortDate, sum } from "../util";
import { KDot, NoSelection, personFull, shortHeading, TodBadge } from "./shared";

export default function ScenesView() {
  const { prod, ix, add, nav, sel, select } = useP();
  const [mode, setMode] = useState("table");
  const [q, setQ] = useState("");
  const [fLoc, setFLoc] = useState("");
  const [fCast, setFCast] = useState("");
  const [fSt, setFSt] = useState("");
  const selId = sel.scene;
  const scene = ix.sceneById.get(selId);

  const rows = useMemo(() => prod.scenes.filter(s => {
    if (q && !(`${s.num} ${s.heading} ${s.synopsis} ${s.locName}`.toLowerCase().includes(q.toLowerCase()))) return false;
    if (fLoc && s.locationId !== fLoc) return false;
    if (fCast && !ix.sceneCast(s).includes(fCast)) return false;
    if (fSt === "unsched" && ix.dayOfScene.has(s.id)) return false;
    if (fSt === "sched" && !ix.dayOfScene.has(s.id)) return false;
    if (fSt && !["unsched", "sched"].includes(fSt) && s.status !== fSt) return false;
    return true;
  }), [prod.scenes, q, fLoc, fCast, fSt, ix]);

  const addScene = () => {
    const n = mkScene({ num: String(prod.scenes.length + 1), heading: "INT. NEW LOCATION - DAY", locName: "NEW LOCATION" });
    add("scenes", n); select("scene", n.id);
  };

  const totalE = sum(prod.scenes.map(s => s.eighths));

  return (
    <>
      <div className="view-main">
        <div className="toolbar">
          <Seg value={mode} onChange={setMode} options={[{ k: "table", l: "Breakdown", i: "list" }, { k: "story", l: "Story days", i: "grid" }]} />
          <SearchBox value={q} onChange={setQ} placeholder="Search scenes…" />
          <select className="select select-sm" style={{ width: 150 }} value={fLoc} onChange={e => setFLoc(e.target.value)}><option value="">All locations</option>{prod.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          <select className="select select-sm" style={{ width: 140 }} value={fCast} onChange={e => setFCast(e.target.value)}><option value="">All cast</option>{prod.people.filter(p => p.kind === "cast").map(p => <option key={p.id} value={p.id}>{personFull(p)}</option>)}</select>
          <select className="select select-sm" style={{ width: 130 }} value={fSt} onChange={e => setFSt(e.target.value)}>
            <option value="">Any status</option><option value="unsched">Unscheduled</option><option value="sched">Scheduled</option>{SCENE_STATUS.map(s => <option key={s.k} value={s.k}>{s.l}</option>)}
          </select>
          <span className="sp" />
          <span className="muted mono">{rows.length}/{prod.scenes.length} scenes · {fmtPages(totalE)} pp</span>
          <Btn variant="pri" icon="plus" onClick={addScene}>Add scene</Btn>
        </div>

        {prod.scenes.length > 0 && (
          <>
            <div className="ribbon" title="Script ribbon: every scene, sized by page length">
              {prod.scenes.map(s => (
                <div key={s.id} className={"seg-s " + stripKind(s) + (selId === s.id ? " sel" : "")} style={{ flex: s.eighths + " 1 0", opacity: rows.includes(s) ? 1 : .25 }} onClick={() => select("scene", s.id)}
                  title={`${s.num}. ${shortHeading(s)} · ${fmtPages(s.eighths)} pg`}>
                  <i className={"st " + (s.status === "shot" ? "" : ix.dayOfScene.has(s.id) ? "s" : "u")} />{s.num}
                </div>
              ))}
            </div>
            <div className="legend">
              {Object.entries(STRIP_LABEL).map(([k, l]) => <span key={k}><i className={"kdot " + k} />{l}</span>)}
              <span style={{ marginLeft: "auto" }}>Top edge: <b style={{ color: "var(--info)" }}>blue</b> scheduled · <b style={{ color: "var(--ok)" }}>green</b> shot</span>
            </div>
          </>
        )}

        {prod.scenes.length === 0 ? (
          <Empty icon="scenes" title="No scenes yet" action={<div className="row auto"><Btn variant="pri" icon="script" onClick={() => nav("view", "script")}>Write or import a script</Btn><Btn icon="plus" onClick={addScene}>Add a scene manually</Btn></div>}>
            Scenes are created automatically from your script’s headings, or you can add them by hand.
          </Empty>
        ) : mode === "table" ? (
          <div className="scroll tbl-wrap" style={{ flex: 1 }}>
            <table className="tbl">
              <thead><tr><th>Sc</th><th>Heading</th>{!selId && <th>Synopsis</th>}<th>Pg</th><th>Cast</th><th>Shoots at</th><th title="Elements / shots">El · Sh</th><th>Day</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map(s => {
                  const cast = ix.sceneCast(s).map(id => ix.personById.get(id)), loc = ix.locById.get(s.locationId), d = ix.dayOfScene.get(s.id);
                  return (
                    <tr key={s.id} className={"row-click" + (selId === s.id ? " sel" : "")} onClick={() => select("scene", s.id)}>
                      <td className="num">{s.num}</td>
                      <td style={{ minWidth: 190 }}><div style={{ display: "flex", gap: 8, alignItems: "center" }}><KDot scene={s} /><b className="ell">{s.locName || "—"}</b></div><div className="muted" style={{ marginLeft: 18 }}><span className="mono">{s.ie}</span> · <TodBadge tod={s.tod} /></div></td>
                      {!selId && <td className="tx2"><div className="ell" style={{ maxWidth: 300 }}>{s.synopsis || "—"}</div></td>}
                      <td className="mono">{fmtPages(s.eighths)}</td>
                      <td><div className="ell tx2" style={{ maxWidth: 170 }} title={cast.map(p => p.role || p.name).join(", ")}>{cast.map(p => p.role || p.name).join(", ") || <span className="muted">—</span>}</div></td>
                      <td>{loc ? <span className="ell" style={{ maxWidth: 140, display: "inline-block", verticalAlign: "bottom" }}>{loc.name}</span> : <span className="muted">—</span>}</td>
                      <td className="mono">{(ix.elsByScene.get(s.id) || []).length} · {(ix.shotsByScene.get(s.id) || []).length}</td>
                      <td>{d ? <Pill tone="acc">D{d.n} · {fmtShortDate(d.day.date)}</Pill> : <span className="muted">—</span>}</td>
                      <td><Pill tone={s.status === "shot" ? "ok" : s.status === "pickup" ? "warn" : "mute"}>{SCENE_STATUS.find(x => x.k === s.status)?.l}</Pill></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <StoryDays rows={rows} />
        )}
      </div>
      {scene ? <SceneInspector scene={scene} key={scene.id} /> : <NoSelection icon="scenes" title="Select a scene">Everything about a scene lives here: where it shoots, who’s in it, what it needs, its shots and when it’s scheduled.</NoSelection>}
    </>
  );
}

/* ---- story days: swimlanes, one per in-story day ---- */
function StoryDays({ rows }) {
  const { prod, ix, patch, select, sel } = useP();
  const [over, setOver] = useState(null);
  const maxDay = Math.max(1, ...prod.scenes.map(s => s.storyDay || 1));
  const lanes = Array.from({ length: maxDay + 1 }, (_, i) => i + 1);
  return (
    <div className="lanes">
      {lanes.map(n => {
        const list = rows.filter(s => (s.storyDay || 1) === n);
        return (
          <div key={n} className={"lane" + (over === n ? " drop" : "")}
            onDragOver={e => { e.preventDefault(); setOver(n); }} onDragLeave={() => setOver(null)}
            onDrop={e => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/scene"); if (id) patch("scenes", id, { storyDay: n }); }}>
            <div className="lane-h"><Icon n="sun" s={15} />Story day {n}<span className="sp" style={{ flex: 1 }} /><span className="muted mono">{fmtPages(sum(list.map(s => s.eighths)))} pg</span></div>
            <div className="lane-b">
              {list.length === 0 && <div className="muted" style={{ textAlign: "center", padding: 14 }}>{n > maxDay ? "Drop a scene here to start a new day" : "Empty"}</div>}
              {list.map(s => (
                <div key={s.id} className={"scard " + stripKind(s) + (sel.scene === s.id ? " sel" : "")} draggable onDragStart={e => e.dataTransfer.setData("text/scene", s.id)} onClick={() => select("scene", s.id)}>
                  <div className="h"><span className="mono">{s.num}</span><span className="ell" style={{ flex: 1 }}>{s.locName}</span><TodBadge tod={s.tod} /></div>
                  <div className="syn">{s.synopsis}</div>
                  <div className="chips" style={{ marginTop: 6 }}>{ix.sceneCast(s).slice(0, 4).map(id => <Chip key={id}>{ix.personById.get(id).role || ix.personById.get(id).name}</Chip>)}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---- inspector ---- */
function SceneInspector({ scene }) {
  const { prod, ix, patch, add, remove, setProd, nav, select } = useP();
  const [newEl, setNewEl] = useState(""); const [newCat, setNewCat] = useState("prop");
  const up = ch => patch("scenes", scene.id, ch);
  const shots = ix.shotsByScene.get(scene.id) || [];
  const els = ix.elsByScene.get(scene.id) || [];
  const day = ix.dayOfScene.get(scene.id);
  const text = scene.fromScript && scene.scriptIdx >= 0 ? sceneTexts(prod.script)[scene.scriptIdx] : "";
  const est = sceneMinutes(prod, scene, ix);
  const auto = new Set(scene.cast || []);

  const assignLoc = locId => setProd(p => reassignSet(p, scene.locName, locId, scene.id));
  const newLoc = () => {
    const l = mkLocation({ name: scene.locName ? scene.locName.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()) : "New location", plays: scene.locName ? [scene.locName] : [] });
    setProd(p => ({ ...p, locations: [...p.locations, l], scenes: p.scenes.map(s => (norm(s.locName) === norm(scene.locName) && scene.locName ? { ...s, locationId: l.id } : s.id === scene.id ? { ...s, locationId: l.id } : s)) }));
    nav("location", l.id);
  };
  const toDay = dayId => setProd(p => ({ ...p, days: p.days.map(d => ({ ...d, sceneIds: d.id === dayId ? (d.sceneIds.includes(scene.id) ? d.sceneIds : [...d.sceneIds, scene.id]) : d.sceneIds.filter(i => i !== scene.id) })) }));
  const addEl = () => {
    if (!newEl.trim()) return;
    const ex = prod.elements.find(e => e.cat === newCat && norm(e.name) === norm(newEl));
    if (ex) patch("elements", ex.id, { sceneIds: [...new Set([...ex.sceneIds, scene.id])] });
    else add("elements", mkElement({ cat: newCat, name: newEl.trim(), sceneIds: [scene.id] }));
    setNewEl("");
  };
  const addShot = () => { const s = mkShot(scene.id, { num: `${scene.num}${String.fromCharCode(65 + shots.length)}` }); add("shots", s); nav("shot", s.id); };

  return (
    <aside className="insp">
      <InspHead title={`Scene ${scene.num || "?"}`} sub={shortHeading(scene)} onClose={() => select("scene", null)}
        actions={<IconBtn icon="trash" title="Delete scene" onClick={() => { if (window.confirm(scene.fromScript ? "This scene comes from your script and will return on the next sync unless you remove it from the script. Delete it anyway?" : "Delete this scene?")) { remove("scenes", scene.id); select("scene", null); } }} />} />
      <div className="insp-body">
        <div className="row">
          <Txt label="Scene #" value={scene.num} onChange={v => up({ num: v, numLocked: true })} mono />
          <Sel label="Status" value={scene.status} onChange={v => up({ status: v })} options={SCENE_STATUS} />
        </div>
        {scene.fromScript ? (
          <div className="help" style={{ marginTop: 10 }}><Icon n="script" s={13} /> Heading, time of day and cast come from the script. <button className="linkbtn" onClick={() => nav("view", "script")}>Edit in Script</button></div>
        ) : (
          <>
            <Txt label="Set / location name" value={scene.locName} onChange={v => up({ locName: v.toUpperCase(), heading: `${scene.ie}. ${v.toUpperCase()} - ${scene.tod}` })} />
            <div className="row">
              <Sel label="INT / EXT" value={scene.ie} onChange={v => up({ ie: v, heading: `${v}. ${scene.locName} - ${scene.tod}` })} options={IES} />
              <Sel label="Time of day" value={scene.tod} onChange={v => up({ tod: v, heading: `${scene.ie}. ${scene.locName} - ${v}` })} options={TODS} />
            </div>
          </>
        )}

        <Section title="Shoots at" action={<Btn size="sm" variant="ghost" icon="plus" onClick={newLoc}>New</Btn>}>
          <select className="select" value={scene.locationId || ""} onChange={e => assignLoc(e.target.value)}>
            <option value="">— Not assigned —</option>
            {prod.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <div className="help">Script set “{scene.locName || "—"}”. Reassigning maps every scene on this set to the chosen real location.</div>
          {scene.locationId && <div style={{ marginTop: 6 }}><Chip onClick={() => nav("location", scene.locationId)}><Icon n="location" s={12} />{ix.locById.get(scene.locationId)?.address || "Open location"}</Chip></div>}
        </Section>

        <div className="row">
          <Num label={`Length (eighths) · ${fmtPages(scene.eighths)} pg`} value={scene.eighths} min={1} onChange={v => up({ eighths: v || 1, eighthsLocked: true })} />
          <Num label="Story day" value={scene.storyDay || 1} min={1} onChange={v => up({ storyDay: v || 1 })} />
        </div>
        <Num label={`Time to shoot (min) · estimate ${fmtDur(est)}`} value={scene.estMin || ""} min={0} step={5} onChange={v => up({ estMin: v || 0 })} hint="Leave blank to use the sum of shot setup times, or page length if there are no shots." />
        <Area label="Synopsis" value={scene.synopsis} onChange={v => up({ synopsis: v, synopsisAuto: false })} rows={3} />
        <Area label="Notes" value={scene.notes} onChange={v => up({ notes: v })} rows={2} placeholder="Continuity, safety, special requirements…" />

        <Section title="Cast in scene">
          <PickChips lockedIds={auto}
            items={ix.sceneCast(scene).map(id => ({ id, label: personFull(ix.personById.get(id)), onClick: () => nav("person", id) }))}
            options={prod.people.filter(p => p.kind === "cast").map(p => ({ id: p.id, label: personFull(p) }))}
            onAdd={id => up({ extraCast: [...(scene.extraCast || []), id] })} onRemove={id => up({ extraCast: (scene.extraCast || []).filter(x => x !== id) })} addLabel="Add cast" />
        </Section>

        <Section title={`Elements (${els.length})`}>
          {CATS.filter(c => els.some(e => e.cat === c.k)).map(c => (
            <div key={c.k} style={{ marginBottom: 8 }}>
              <div className="muted" style={{ fontSize: 11, fontWeight: 600, marginBottom: 3 }}>{c.l}</div>
              <div className="chips">{els.filter(e => e.cat === c.k).map(e => <Chip key={e.id} color={c.c} onClick={() => nav("element", e.id)} onRemove={() => patch("elements", e.id, { sceneIds: e.sceneIds.filter(i => i !== scene.id) })}>{e.name}</Chip>)}</div>
            </div>
          ))}
          <div className="row auto" style={{ gap: 6, marginTop: 6 }}>
            <select className="select select-sm" style={{ width: 118 }} value={newCat} onChange={e => setNewCat(e.target.value)}>{CATS.map(c => <option key={c.k} value={c.k}>{c.l}</option>)}</select>
            <input className="input input-sm" style={{ flex: 1, width: "auto" }} placeholder="Add element…" value={newEl} onChange={e => setNewEl(e.target.value)} onKeyDown={e => e.key === "Enter" && addEl()} list={"el-" + scene.id} />
            <datalist id={"el-" + scene.id}>{prod.elements.filter(e => !e.sceneIds.includes(scene.id)).map(e => <option key={e.id} value={e.name} />)}</datalist>
            <Btn size="sm" icon="plus" onClick={addEl} />
          </div>
        </Section>

        <Section title={`Shots (${shots.length})`} action={<Btn size="sm" variant="ghost" icon="plus" onClick={addShot}>Add shot</Btn>}>
          {shots.length === 0 && <div className="muted">No coverage planned yet.</div>}
          {shots.map(s => <div key={s.id} style={{ display: "flex", gap: 8, padding: "3px 0", cursor: "pointer" }} onClick={() => nav("shot", s.id)}><b className="mono" style={{ width: 34 }}>{s.num}</b><Pill tone="mute">{s.size}</Pill><span className="ell tx2" style={{ flex: 1 }}>{s.desc || s.move}</span></div>)}
        </Section>

        <Section title="Schedule">
          <select className="select" value={day?.day.id || ""} onChange={e => toDay(e.target.value)}>
            <option value="">Unscheduled</option>
            {ix.days.map((d, i) => <option key={d.id} value={d.id}>Day {i + 1} · {fmtDate(d.date)}</option>)}
          </select>
        </Section>

        {text && <Section title="Script"><div className="script-font" style={{ whiteSpace: "pre-wrap", fontSize: 12, background: "var(--panel2)", padding: 12, borderRadius: 8, maxHeight: 260, overflowY: "auto", border: "1px solid var(--line)" }}>{text}</div></Section>}
      </div>
    </aside>
  );
}
