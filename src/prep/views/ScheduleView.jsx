import React, { useMemo, useState } from "react";
import { useP, Icon, Btn, IconBtn, Chip, Pill, Seg, Txt, Area, Num, Section, InspHead, Modal, DropBtn, Empty, Field } from "../ui";
import { mkDay, stripKind, STRIP_LABEL, LOC_READY } from "../model";
import { computeDay, autoSchedule, metrics, sceneMinutes, castCalls } from "../plan";
import { indexProd } from "../model";
import { addDays, dow, fmtDate, fmtShortDate, fmtT, fmtDur, fmtPages, parseISO, toISO, MONL, WD, WDL, todayISO, nextWeekday } from "../util";
import { KDot, NoSelection, personFull, shortHeading } from "./shared";

function moveScene(p, sceneId, dayId, beforeId) {
  const days = p.days.map(d => ({ ...d, sceneIds: d.sceneIds.filter(i => i !== sceneId) }));
  if (dayId) {
    const d = days.find(x => x.id === dayId);
    if (d) { const idx = beforeId ? d.sceneIds.indexOf(beforeId) : -1; if (idx >= 0) d.sceneIds.splice(idx, 0, sceneId); else d.sceneIds.push(sceneId); }
  }
  return { ...p, days };
}
const nextFreeDate = (p) => {
  const st = p.settings; let d = p.days.length ? addDays([...p.days].map(x => x.date).sort().pop(), 1) : (p.shootStart || todayISO());
  for (let i = 0; i < 14 && !st.workWeek.includes(dow(d)); i++) d = addDays(d, 1);
  return d;
};

export default function ScheduleView() {
  const { prod, ix, setProd, sel, select } = useP();
  const [mode, setMode] = useState("board");
  const [auto, setAuto] = useState(false);
  const [focus, setFocus] = useState("day");
  const day = ix.days.find(d => d.id === sel.day) || null;
  const plans = useMemo(() => new Map(ix.days.map(d => [d.id, computeDay(prod, d, ix)])), [prod, ix]);
  const unscheduled = prod.scenes.filter(s => !ix.dayOfScene.has(s.id));
  const scheduledN = prod.scenes.length - unscheduled.length;

  const addDay = (date) => { const d = mkDay(date || nextFreeDate(prod), { call: prod.settings.dayCall }); setProd(p => ({ ...p, days: [...p.days, d] })); select("day", d.id); setFocus("day"); return d; };
  const clearAll = () => { if (window.confirm("Remove every scene from the schedule? Shoot days stay, and locked days are untouched.")) setProd(p => ({ ...p, days: p.days.map(d => (d.locked ? d : { ...d, sceneIds: [] })) })); };
  const delEmpty = () => setProd(p => ({ ...p, days: p.days.filter(d => d.sceneIds.length || d.locked) }));

  return (
    <>
      <div className="view-main">
        <div className="toolbar">
          <Seg value={mode} onChange={setMode} options={[{ k: "board", l: "Stripboard", i: "list" }, { k: "calendar", l: "Calendar", i: "schedule" }, { k: "day", l: "Day", i: "clock" }]} />
          <span className="muted mono">{scheduledN}/{prod.scenes.length} scenes · {ix.days.length} days</span>
          <span className="sp" />
          <DropBtn icon="menu" label="More" align="right" items={[{ icon: "trash", label: "Clear all scenes from days", onClick: clearAll }, { icon: "trash", label: "Remove empty days", onClick: delEmpty }]} />
          <Btn icon="plus" onClick={() => addDay()}>Add day</Btn>
          <Btn variant="pri" icon="wand" onClick={() => setAuto(true)} disabled={!prod.scenes.length}>Auto-schedule…</Btn>
        </div>
        {mode === "board" && <Board plans={plans} unscheduled={unscheduled} focus={focus} setFocus={setFocus} addDay={addDay} />}
        {mode === "calendar" && <Calendar plans={plans} addDay={addDay} setMode={setMode} setFocus={setFocus} />}
        {mode === "day" && <DayTimeline plans={plans} addDay={addDay} />}
      </div>
      {sel.scene && focus === "scene" && ix.sceneById.get(sel.scene)
        ? <ScenePeek scene={ix.sceneById.get(sel.scene)} onClose={() => { select("scene", null); setFocus("day"); }} />
        : day ? <DayInspector day={day} key={day.id} plan={plans.get(day.id)} /> : <NoSelection icon="schedule" title="Select a shoot day">Set the call time, notes and weather, check the daylight, and fine-tune the order of scenes.</NoSelection>}
      {auto && <AutoModal onClose={() => setAuto(false)} />}
    </>
  );
}

/* ======================= stripboard ======================= */
function Strip({ s, pr, dragging, onDragStart, onDragEnd, onDragOver, onDrop, over, sel, onClick, time }) {
  const { ix, prod } = useP();
  const cast = ix.sceneCast(s).map(id => ix.personById.get(id)).filter(Boolean);
  return (
    <div className={`strip ${stripKind(s)}${sel ? " sel" : ""}${dragging ? " dragging" : ""}${over ? " over-" + over : ""}${s.status === "shot" ? " shot-done" : ""}`} draggable
      onDragStart={onDragStart} onDragEnd={onDragEnd} onDragOver={onDragOver} onDrop={onDrop} onClick={onClick}>
      <div className="s-num">{s.num}</div>
      <div className="s-main">
        <div className="s-h"><span className="mono" style={{ fontSize: 10.5, opacity: .7 }}>{s.ie}</span><span className="ell">{s.locName || "—"}</span><span className="mono" style={{ fontSize: 10.5, opacity: .7 }}>{s.tod}</span></div>
        <div className="s-sub">{cast.map(p => p.role || p.name).join(", ") || "No cast"} · {s.synopsis}</div>
      </div>
      <div className="s-meta"><span>{fmtPages(s.eighths)} pg</span><span>{time || fmtDur(sceneMinutes(prod, s, ix))}</span></div>
    </div>
  );
}

function Board({ plans, unscheduled, focus, setFocus, addDay }) {
  const { ix, issues, setProd, sel, select } = useP();
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null); /* {day, before, pos} | {pool:true} | {dayHeader} */
  const dropTo = (dayId, beforeId) => { if (drag) setProd(p => moveScene(p, drag, dayId, beforeId)); setDrag(null); setOver(null); };
  const issuesOf = id => issues.filter(i => i.ref && i.ref.t === "day" && i.ref.id === id);

  return (
    <div className="board">
      <div className={"pool" + (over?.pool ? " drop" : "")} onDragOver={e => { e.preventDefault(); setOver({ pool: true }); }} onDragLeave={() => setOver(null)} onDrop={e => { e.preventDefault(); dropTo(null); }}>
        <div style={{ padding: "12px 14px 6px", fontWeight: 700 }}>Unscheduled <Pill tone={unscheduled.length ? "warn" : "ok"}>{unscheduled.length}</Pill></div>
        <div className="help" style={{ padding: "0 14px 8px", marginTop: 0 }}>Drag scenes onto a shoot day. Drop here to unschedule.</div>
        <div className="strips" style={{ paddingTop: 4 }}>
          {unscheduled.length === 0 && <div className="muted" style={{ textAlign: "center", padding: 20 }}>Every scene has a day</div>}
          {unscheduled.map(s => <Strip key={s.id} s={s} sel={sel.scene === s.id && focus === "scene"} dragging={drag === s.id} onDragStart={() => setDrag(s.id)} onDragEnd={() => { setDrag(null); setOver(null); }} onClick={() => { select("scene", s.id); setFocus("scene"); }} />)}
        </div>
      </div>
      <div className="strips">
        {ix.days.length === 0 && <Empty icon="schedule" title="No shoot days yet" action={<Btn variant="pri" icon="plus" onClick={() => addDay()}>Add the first shoot day</Btn>}>Add days by hand, or let Auto-schedule build them from your scenes, locations, light and cast availability.</Empty>}
        {ix.days.map((d, i) => {
          const pl = plans.get(d.id), is = issuesOf(d.id);
          return (
            <div key={d.id}>
              <div className={"daybar" + (sel.day === d.id && focus === "day" ? " sel" : "") + (over?.dayHeader === d.id ? " drop" : "")} onClick={() => { select("day", d.id); setFocus("day"); }}
                onDragOver={e => { e.preventDefault(); setOver({ dayHeader: d.id }); }} onDrop={e => { e.preventDefault(); dropTo(d.id, d.sceneIds[0]); }}>
                <span className="dn">DAY {i + 1}</span><b>{fmtDate(d.date)}</b>
                {d.locked && <Icon n="lock" s={14} />}
                {is.some(x => x.level === "error") ? <Icon n="warn" s={15} style={{ color: "var(--bad)" }} /> : is.length > 0 ? <Icon n="warn" s={15} style={{ color: "var(--warn)" }} /> : null}
                <span className="sp" />
                <span className="meta">CALL {fmtT(pl.call)} · WRAP {fmtT(pl.wrap)} · {fmtPages(pl.eighths)} pg · {pl.scenes.length} sc</span>
              </div>
              {pl.items.length === 0 && <div className={"drop-end" + (over?.dayEnd === d.id ? " over" : "")} style={{ height: 38, display: "grid", placeItems: "center", color: "var(--tx3)", border: "1px dashed var(--line2)", borderRadius: 6 }}
                onDragOver={e => { e.preventDefault(); setOver({ dayEnd: d.id }); }} onDrop={e => { e.preventDefault(); dropTo(d.id); }}>Drop scenes here</div>}
              {pl.items.map(it => it.type === "scene" ? (
                <Strip key={it.scene.id} s={it.scene} time={fmtT(it.start)} sel={sel.scene === it.scene.id && focus === "scene"} dragging={drag === it.scene.id}
                  over={over?.before === it.scene.id ? over.pos : null}
                  onDragStart={() => setDrag(it.scene.id)} onDragEnd={() => { setDrag(null); setOver(null); }}
                  onDragOver={e => { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setOver({ before: it.scene.id, pos: e.clientY < r.top + r.height / 2 ? "top" : "bot" }); }}
                  onDrop={e => {
                    e.preventDefault(); e.stopPropagation();
                    const r = e.currentTarget.getBoundingClientRect(), after = e.clientY >= r.top + r.height / 2;
                    const ids = d.sceneIds, idx = ids.indexOf(it.scene.id), nextId = after ? ids[idx + 1] : it.scene.id;
                    dropTo(d.id, nextId === drag ? ids[idx + 2] : nextId);
                  }}
                  onClick={() => { select("scene", it.scene.id); setFocus("scene"); }} />
              ) : it.type === "move" ? (
                <div key={"m" + it.start} className="move-row"><Icon n="route" s={13} />Company move to {it.to.name} · {fmtDur(it.end - it.start)}</div>
              ) : (
                <div key={"meal" + it.start} className="move-row" style={{ color: "var(--ok)" }}>Meal break · {fmtDur(it.end - it.start)} · {fmtT(it.start)}</div>
              ))}
              {pl.items.length > 0 && <div className={"drop-end" + (over?.dayEnd === d.id ? " over" : "")} onDragOver={e => { e.preventDefault(); setOver({ dayEnd: d.id }); }} onDrop={e => { e.preventDefault(); dropTo(d.id); }} />}
              {is.slice(0, 3).map((x, k) => <div key={k} className="help" style={{ color: x.level === "error" ? "var(--bad)" : "var(--warn)", marginTop: 0 }}>⚠ {x.msg}</div>)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ======================= calendar ======================= */
function Calendar({ plans, addDay, setMode, setFocus }) {
  const { prod, ix, sel, select } = useP();
  const first = ix.days[0]?.date || prod.shootStart || todayISO();
  const [month, setMonth] = useState(() => { const d = parseISO(first); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const y = month.getFullYear(), m = month.getMonth();
  const start = new Date(y, m, 1 - month.getDay() + 0);
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const byDate = new Map(ix.days.map((d, i) => [d.date, { d, n: i + 1 }]));
  const blockedBy = iso => prod.people.filter(p => (p.blocked || []).includes(iso));
  const closedBy = iso => prod.locations.filter(l => (l.blocked || []).includes(iso));
  const today = todayISO();
  return (
    <div className="scroll pad" style={{ flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <IconBtn icon="left" title="Previous month" variant="default" onClick={() => setMonth(new Date(y, m - 1, 1))} />
        <h2 style={{ margin: 0, minWidth: 190, textAlign: "center", fontSize: 18 }}>{MONL[m]} {y}</h2>
        <IconBtn icon="right" title="Next month" variant="default" onClick={() => setMonth(new Date(y, m + 1, 1))} />
        <Btn size="sm" variant="ghost" onClick={() => { const d = parseISO(first); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Go to first shoot day</Btn>
        <span className="sp" style={{ flex: 1 }} />
        <span className="muted"><span className="chip" style={{ background: "var(--bad-soft)", color: "var(--bad)" }}>Unavailable</span> people and locations are shown on their blocked dates</span>
      </div>
      <div className="cal">
        {WD.map(w => <div key={w} className="dh">{w}</div>)}
        {cells.map(c => {
          const iso = toISO(c), hit = byDate.get(iso), out = c.getMonth() !== m;
          const bl = blockedBy(iso), cl = closedBy(iso);
          return (
            <div key={iso} className={"cell" + (out ? " out" : "") + (hit ? " shoot" : "") + (iso === today ? " today" : "") + (hit && sel.day === hit.d.id ? " sel" : "")}
              onClick={() => { if (hit) { select("day", hit.d.id); setFocus("day"); } }}>
              <span className="dnum">{c.getDate()}</span>
              {!hit && !out && <IconBtn icon="plus" title={`Add shoot day on ${fmtShortDate(iso)}`} size="sm" className="add" onClick={e => { e.stopPropagation(); addDay(iso); }} />}
              {hit && (
                <>
                  <span className="tag" style={{ background: "var(--acc)", color: "var(--acc-ink)", fontWeight: 700 }}>Day {hit.n} · {fmtT(plans.get(hit.d.id).call)}</span>
                  {plans.get(hit.d.id).locs.slice(0, 2).map(l => <span key={l.id} className="tag">{l.name}</span>)}
                  <span className="tag mono">{plans.get(hit.d.id).scenes.map(i => i.scene.num).join(" ")}</span>
                </>
              )}
              {bl.slice(0, 2).map(p => <span key={p.id} className="tag blk">{p.name || p.role} out</span>)}
              {cl.slice(0, 1).map(l => <span key={l.id} className="tag blk">{l.name} closed</span>)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ======================= day timeline ======================= */
function DayTimeline({ plans, addDay }) {
  const { prod, ix, sel, select, nav } = useP();
  const day = ix.days.find(d => d.id === sel.day) || ix.days[0];
  if (!day) return <Empty icon="clock" title="No shoot days yet" action={<Btn variant="pri" icon="plus" onClick={() => addDay()}>Add a shoot day</Btn>}>Create a day to see its timeline with sunrise, sunset and every cast member’s hours.</Empty>;
  const idx = ix.days.indexOf(day), pl = plans.get(day.id);
  const lo = Math.floor((pl.call - 60) / 60) * 60, hi = Math.ceil((pl.wrap + 60) / 60) * 60, span = hi - lo;
  const pct = m => ((m - lo) / span) * 100;
  const cast = castCalls(prod, pl, ix);
  const sun = pl.sun && pl.sun.rise != null ? pl.sun : null;
  const dark = [];
  if (sun) for (let k = -1; k <= 1; k++) { const a = sun.set + 1440 * k, b = sun.rise + 1440 * (k + 1); if (b > lo && a < hi) dark.push([Math.max(a, lo), Math.min(b, hi)]); }
  const golden = [];
  if (sun) for (let k = 0; k <= 1; k++) { golden.push([sun.rise + 1440 * k, sun.rise + 60 + 1440 * k], [sun.set - 60 + 1440 * k, sun.set + 1440 * k]); }
  const ticks = []; for (let t = lo; t <= hi; t += span > 840 ? 120 : 60) ticks.push(t);
  const Sky = () => <>
    {dark.map(([a, b], i) => <div key={"d" + i} className="tl-sky" style={{ left: pct(a) + "%", width: pct(b) - pct(a) + "%", background: "rgba(30,40,80,.16)" }} />)}
    {golden.filter(([a, b]) => b > lo && a < hi).map(([a, b], i) => <div key={"g" + i} className="tl-sky" style={{ left: pct(Math.max(a, lo)) + "%", width: pct(Math.min(b, hi)) - pct(Math.max(a, lo)) + "%", background: "rgba(245,165,36,.16)" }} />)}
  </>;
  const labelOf = it => it.type === "scene" ? `${it.scene.num} · ${it.scene.locName}` : it.type === "move" ? `Move ${fmtDur(it.end - it.start)}` : "Meal";
  return (
    <div className="scroll pad" style={{ flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <IconBtn icon="left" title="Previous day" variant="default" disabled={idx === 0} onClick={() => select("day", ix.days[idx - 1].id)} />
        <select className="select" style={{ width: 280 }} value={day.id} onChange={e => select("day", e.target.value)}>{ix.days.map((d, i) => <option key={d.id} value={d.id}>Day {i + 1} · {fmtDate(d.date, true)}</option>)}</select>
        <IconBtn icon="right" title="Next day" variant="default" disabled={idx === ix.days.length - 1} onClick={() => select("day", ix.days[idx + 1].id)} />
        <span className="sp" style={{ flex: 1 }} />
        {sun ? <span className="muted mono"><Icon n="sun" s={14} /> {fmtT(sun.rise)} → {fmtT(sun.set)} · {fmtDur(sun.light)} of daylight</span> : <span className="muted">Add coordinates to the first location to see daylight.</span>}
      </div>
      <div className="tl">
        <div className="tl-axis">{ticks.map(t => <span key={t} className="tl-tick" style={{ left: pct(t) + "%" }}>{fmtT(t).replace(":00", "")}</span>)}</div>
        <div className="tl-lane" style={{ height: 46 }}>
          <div className="nm">Schedule<div className="muted" style={{ fontWeight: 500 }}>{fmtT(pl.call)} → {fmtT(pl.wrap)}</div></div>
          <div className="tl-track">
            <Sky />
            <div className="tl-block cast" style={{ left: pct(pl.call) + "%", width: pct(pl.call + prod.settings.firstSetupMin) - pct(pl.call) + "%", background: "var(--panel3)", borderColor: "var(--line2)", color: "var(--tx3)" }} title="Crew call and first setup">Rig</div>
            {pl.items.map((it, i) => (
              <div key={i} className={"tl-block " + (it.type === "scene" ? stripKind(it.scene) : it.type)} style={{ left: pct(it.start) + "%", width: Math.max(0.5, pct(it.end) - pct(it.start)) + "%" }}
                title={`${labelOf(it)} · ${fmtT(it.start)}–${fmtT(it.end)}`} onClick={() => it.type === "scene" && nav("scene", it.scene.id)}>{labelOf(it)}</div>
            ))}
            {pl.over > 0 && <div className="tl-mark" style={{ left: pct(pl.call + prod.settings.dayLenMin) + "%", borderColor: "var(--bad)" }} title="Target wrap" />}
          </div>
        </div>
        {cast.map(c => (
          <div key={c.person.id} className="tl-lane">
            <div className="nm ell">{c.person.role || c.person.name}<div className="muted ell" style={{ fontWeight: 500, fontSize: 11 }}>{c.person.name}</div></div>
            <div className="tl-track">
              <Sky />
              <div className="tl-block cast" style={{ left: pct(c.makeup) + "%", width: pct(c.set) - pct(c.makeup) + "%", opacity: .55 }} title="Hair & makeup">HMU</div>
              <div className="tl-block cast" style={{ left: pct(c.set) + "%", width: pct(c.wrap) - pct(c.set) + "%", fontFamily: "JetBrains Mono, monospace" }} title={`${fmtT(c.set)} – ${fmtT(c.wrap)}`}>{fmtT(c.set)} – {fmtT(c.wrap)}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <table className="tbl"><thead><tr><th>Time</th><th>Sc</th><th>Set</th><th>Location</th><th>Cast</th><th>Pg</th><th>Est.</th></tr></thead>
          <tbody>{pl.items.map((it, i) => it.type === "scene" ? (
            <tr key={i} className="row-click" onClick={() => nav("scene", it.scene.id)}>
              <td className="mono">{fmtT(it.start)} – {fmtT(it.end)}</td><td className="num">{it.scene.num}</td><td><KDot scene={it.scene} /> {shortHeading(it.scene)}</td><td>{it.loc?.name || "—"}</td>
              <td className="tx2">{ix.sceneCast(it.scene).map(id => ix.personById.get(id)?.role).join(", ")}</td><td className="mono">{fmtPages(it.scene.eighths)}</td><td className="mono">{fmtDur(it.dur)}</td>
            </tr>) : (
            <tr key={i}><td className="mono muted">{fmtT(it.start)} – {fmtT(it.end)}</td><td colSpan={6} className="muted">{it.type === "move" ? `Company move: ${it.from.name} → ${it.to.name}` : "Meal break"} · {fmtDur(it.end - it.start)}</td></tr>))}</tbody></table>
      </div>
    </div>
  );
}

/* ======================= inspectors ======================= */
function DayInspector({ day, plan }) {
  const { prod, ix, issues, patch, setProd, select, nav } = useP();
  const up = ch => patch("days", day.id, ch);
  const n = ix.days.indexOf(day) + 1;
  const mine = issues.filter(i => i.ref && i.ref.t === "day" && i.ref.id === day.id);
  const move = (id, dir) => up({ sceneIds: (() => { const a = [...day.sceneIds], i = a.indexOf(id), j = i + dir; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; })() });
  const dup = () => { const d = mkDay(addDays(day.date, 1), { call: day.call, notes: day.notes }); setProd(p => ({ ...p, days: [...p.days, d] })); select("day", d.id); };
  const del = () => { if (window.confirm(day.sceneIds.length ? `Delete Day ${n}? Its ${day.sceneIds.length} scene(s) go back to unscheduled.` : `Delete Day ${n}?`)) { setProd(p => ({ ...p, days: p.days.filter(d => d.id !== day.id) })); select("day", null); } };
  return (
    <aside className="insp">
      <InspHead title={`Day ${n}`} sub={fmtDate(day.date, true)} onClose={() => select("day", null)}
        actions={<><IconBtn icon={day.locked ? "lock" : "lock"} title={day.locked ? "Unlock day (auto-schedule may change it)" : "Lock day (auto-schedule will keep it)"} variant={day.locked ? "pri" : "ghost"} onClick={() => up({ locked: !day.locked })} /><IconBtn icon="dupe" title="Duplicate day" onClick={dup} /><IconBtn icon="trash" title="Delete day" onClick={del} /></>} />
      <div className="insp-body">
        <div className="row"><Txt label="Date" type="date" value={day.date} onChange={v => v && up({ date: v })} /><Txt label="Crew call" type="time" value={day.call} onChange={v => v && up({ call: v })} /></div>
        {!prod.settings.workWeek.includes(dow(day.date)) && <div className="help" style={{ color: "var(--warn)" }}>{WDL[dow(day.date)]} is outside your usual work week.</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginTop: 14 }}>
          {[["Wrap", fmtT(plan.wrap)], ["Length", fmtDur(plan.wrap - plan.call)], ["Pages", fmtPages(plan.eighths)], ["Sunrise", plan.sun?.rise != null ? fmtT(plan.sun.rise) : "—"], ["Sunset", plan.sun?.set != null ? fmtT(plan.sun.set) : "—"], ["Moves", plan.moves]].map(([k, v]) => (
            <div key={k} className="card" style={{ padding: "8px 10px" }}><div className="muted" style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 700 }}>{k}</div><div className="mono bold" style={{ fontSize: 14 }}>{v}</div></div>))}
        </div>
        {mine.map((x, i) => <div key={i} className="issue warn" style={{ cursor: "default" }}><Icon n="warn" s={15} /><span>{x.msg}</span></div>)}
        <Txt label="Weather" value={day.weather} onChange={v => up({ weather: v })} placeholder="e.g. Clear, high 54°F, wind NW 8 mph" />
        <Area label="Day notes (printed on the call sheet)" value={day.notes} onChange={v => up({ notes: v })} rows={3} placeholder="Safety briefing, parking instructions, special announcements…" />
        <Section title={`Scenes (${day.sceneIds.length})`}>
          {day.sceneIds.length === 0 && <div className="muted">Drag scenes here from the stripboard.</div>}
          {day.sceneIds.map((id, i) => { const s = ix.sceneById.get(id); if (!s) return null; return (
            <div key={id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: "1px solid var(--line)" }}>
              <KDot scene={s} /><b className="mono" style={{ width: 26 }}>{s.num}</b><span className="ell" style={{ flex: 1, cursor: "pointer" }} onClick={() => nav("scene", s.id)}>{s.locName}</span>
              <IconBtn icon="up" title="Move earlier" size="sm" disabled={i === 0} onClick={() => move(id, -1)} /><IconBtn icon="down" title="Move later" size="sm" disabled={i === day.sceneIds.length - 1} onClick={() => move(id, 1)} />
              <IconBtn icon="x" title="Unschedule" size="sm" onClick={() => up({ sceneIds: day.sceneIds.filter(x => x !== id) })} />
            </div>); })}
        </Section>
        <Section title="Locations today"><div className="chips">{plan.locs.map(l => <Chip key={l.id} onClick={() => nav("location", l.id)}>{l.name}</Chip>)}</div></Section>
        <div style={{ marginTop: 18, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn icon="docs" variant="pri" onClick={() => nav("day", day.id, { doc: "callsheet", docDay: day.id, view: "docs" })}>Call sheet</Btn>
          <Btn icon="shots" onClick={() => nav("day", day.id, { doc: "shotlist", docDay: day.id, view: "docs" })}>Shot list</Btn>
        </div>
      </div>
    </aside>
  );
}

function ScenePeek({ scene, onClose }) {
  const { prod, ix, setProd, nav } = useP();
  const d = ix.dayOfScene.get(scene.id);
  const move = id => setProd(p => moveScene(p, scene.id, id || null));
  const loc = ix.locById.get(scene.locationId);
  return (
    <aside className="insp">
      <InspHead title={`Scene ${scene.num}`} sub={shortHeading(scene)} onClose={onClose} />
      <div className="insp-body">
        <p className="tx2">{scene.synopsis || "No synopsis"}</p>
        <div className="chips"><Pill tone="mute">{STRIP_LABEL[stripKind(scene)]}</Pill><Pill tone="mute">{fmtPages(scene.eighths)} pg</Pill><Pill tone="mute">{fmtDur(sceneMinutes(prod, scene, ix))}</Pill></div>
        <Section title="Day"><select className="select" value={d?.day.id || ""} onChange={e => move(e.target.value)}><option value="">Unscheduled</option>{ix.days.map((x, i) => <option key={x.id} value={x.id}>Day {i + 1} · {fmtDate(x.date)}</option>)}</select></Section>
        <Section title="Location">{loc ? <><Chip onClick={() => nav("location", loc.id)}>{loc.name}</Chip>{!LOC_READY.has(loc.status) && <div className="help" style={{ color: "var(--warn)" }}>Location is “{loc.status}”.</div>}</> : <span className="muted">Not assigned</span>}</Section>
        <Section title="Cast"><div className="chips">{ix.sceneCast(scene).map(id => { const p = ix.personById.get(id); const out = d && (p.blocked || []).includes(d.day.date); return <Chip key={id} onClick={() => nav("person", id)} color={out ? "#d23f3f" : undefined}>{personFull(p)}{out ? " (unavailable)" : ""}</Chip>; })}</div></Section>
        <div style={{ marginTop: 16 }}><Btn icon="scenes" onClick={() => nav("scene", scene.id)}>Open in breakdown</Btn></div>
      </div>
    </aside>
  );
}

/* ======================= auto-schedule dialog ======================= */
function AutoModal({ onClose }) {
  const { prod, setProd, toast } = useP();
  const [only, setOnly] = useState(false);
  const [start, setStart] = useState(prod.shootStart || nextWeekday(todayISO(), 1));
  const [week, setWeek] = useState(prod.settings.workWeek);
  const [len, setLen] = useState(prod.settings.dayLenMin / 60);

  const trial = useMemo(() => ({ ...prod, shootStart: start, settings: { ...prod.settings, workWeek: week.length ? week : [1], dayLenMin: Math.round(len * 60) } }), [prod, start, week, len]);
  const res = useMemo(() => autoSchedule(trial, { onlyUnscheduled: only }), [trial, only]);
  const after = useMemo(() => { const p2 = { ...trial, days: res.days }; return { m: metrics(p2), ix: indexProd(p2), p: p2 }; }, [trial, res]);
  const before = useMemo(() => metrics(prod), [prod]);
  const apply = () => { setProd(p => ({ ...p, shootStart: start, settings: trial.settings, days: res.days })); toast(`Scheduled ${res.placed} scenes across ${res.days.filter(d => d.sceneIds.length).length} days`); onClose(); };
  const Row = ({ k, a, b, lower }) => <tr><td>{k}</td><td className="mono">{a}</td><td className="mono"><b>{b}</b> {b !== a && <span style={{ color: (lower ? b < a : b > a) ? "var(--ok)" : "var(--warn)" }}>{b < a ? "▼" : "▲"}</span>}</td></tr>;
  return (
    <Modal title="Auto-schedule" onClose={onClose} wide footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="pri" icon="check" onClick={apply}>Apply this schedule</Btn></>}>
      <p className="tx2" style={{ marginTop: 0 }}>Groups scenes by location so the company moves as little as possible, keeps day and night work apart, puts dusk with night, sets call times from sunrise and sunset when locations have coordinates, and avoids days when a cast member or location is unavailable. Locked days are never changed.</p>
      <div className="row">
        <Field label="Scope"><select className="select" value={only ? "u" : "a"} onChange={e => setOnly(e.target.value === "u")}><option value="a">Re-plan everything (except locked days)</option><option value="u">Only place unscheduled scenes</option></select></Field>
        <Txt label="First shoot day" type="date" value={start} onChange={setStart} />
        <Num label="Day length (hours)" value={len} min={4} max={16} step={0.5} onChange={v => setLen(v || 10)} />
      </div>
      <Field label="Work week"><div className="chips">{WD.map((w, i) => <button key={w} className="chip click" style={week.includes(i) ? { background: "var(--acc)", color: "var(--acc-ink)" } : undefined} onClick={() => setWeek(week.includes(i) ? week.filter(x => x !== i) : [...week, i])}>{w}</button>)}</div></Field>
      <div className="row" style={{ marginTop: 14, alignItems: "flex-start" }}>
        <div>
          <div className="sect-h" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--tx3)", marginBottom: 6 }}>Impact</div>
          <table className="tbl"><thead><tr><th /><th>Now</th><th>After</th></tr></thead><tbody>
            <Row k="Shoot days" a={before.days} b={after.m.days} lower /><Row k="Company moves" a={before.moves} b={after.m.moves} lower /><Row k="Location visits" a={before.locVisits} b={after.m.locVisits} lower />
            <Row k="Cast work days" a={before.castDays} b={after.m.castDays} lower /><Row k="Overtime days" a={before.overtimeDays} b={after.m.overtimeDays} lower /></tbody></table>
        </div>
        <div style={{ flex: 1.5 }}>
          <div className="sect-h" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--tx3)", marginBottom: 6 }}>Preview</div>
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            {after.ix.days.map((d, i) => {
              const pl = computeDay(after.p, d, after.ix);
              return <div key={d.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                <b>Day {i + 1}</b> <span className="muted">{fmtDate(d.date)} · call {fmtT(pl.call)} · wrap {fmtT(pl.wrap)}</span>{pl.over > 0 && <Pill tone="warn"> +{fmtDur(pl.over)}</Pill>}
                <div className="chips" style={{ marginTop: 4 }}>{pl.scenes.map(it => <span key={it.scene.id} className="chip"><KDot scene={it.scene} />{it.scene.num} · {it.loc?.name || it.scene.locName}</span>)}</div>
              </div>;
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
