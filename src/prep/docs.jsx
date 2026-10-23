import React from "react";
import { CATS, CAT, stripKind, STRIP_LABEL, DEPTS, LOC_STATUS, ELEMENT_STATUS } from "./model";
import { computeDay, crewCalls, castCalls, dood, sceneMinutes, distanceKm } from "./plan";
import { sceneTexts } from "./script";
import { fmtDate, fmtT, fmtDur, fmtPages, toCSV, hasGeo, sum, todayISO, diffDays } from "./util";

const k = s => "k-" + stripKind(s);
const castNos = (prod) => new Map(prod.people.filter(p => p.kind === "cast").map((p, i) => [p.id, i + 1]));
const who = p => p?.name || "—";
const dayN = (ix, id) => ix.days.findIndex(d => d.id === id) + 1;
const heading = s => `${s.ie}. ${s.locName || "—"} – ${s.tod}`;
const dash = v => (v ? v : "—");

/* ---------- shared pieces ---------- */
export function Head({ prod, kicker, title, right }) {
  return (
    <div className="ph-head">
      <div>
        <div className="kicker">{kicker || prod.company || "Production document"}</div>
        <h1>{title}</h1>
        <div style={{ marginTop: 3, color: "#4a4f5b" }}><b>{prod.title}</b>{prod.director ? ` · Directed by ${prod.director}` : ""}{prod.producer ? ` · Produced by ${prod.producer}` : ""}</div>
      </div>
      <div className="ph-meta">{right}<div>Printed {fmtDate(todayISO())}</div></div>
    </div>
  );
}
const Foot = ({ prod, label }) => <div className="foot"><span>{prod.title}{label ? " · " + label : ""}</span><span>Prepared with Fathom</span></div>;
const Box = ({ k: key, v, sub }) => <div className="box"><div className="k">{key}</div>{v !== "" && <div className="v">{v || "—"}</div>}{sub && <div style={{ color: "#4a4f5b" }}>{sub}</div>}</div>;

/* ======================== CALL SHEET ======================== */
export function CallSheet({ prod, ix, dayId }) {
  const day = ix.days.find(d => d.id === dayId) || ix.days[0];
  if (!day) return <div className="paper"><Head prod={prod} title="Call Sheet" /><p>Add a shoot day in the Schedule to generate a call sheet.</p></div>;
  const pl = computeDay(prod, day, ix), n = dayN(ix, day.id), total = ix.days.length;
  const nos = castNos(prod);
  const cc = castCalls(prod, pl, ix), crew = crewCalls(prod, pl);
  const find = re => prod.people.find(p => p.kind === "crew" && re.test(p.role || ""));
  const ad = find(/1st\s*AD|first assistant dir/i), pm = find(/production manager|UPM|line producer/i);
  const els = new Map();
  pl.scenes.forEach(it => (ix.elsByScene.get(it.scene.id) || []).forEach(e => { if (!els.has(e.id)) els.set(e.id, { e, sc: [] }); els.get(e.id).sc.push(it.scene.num); }));
  const elGroups = CATS.map(c => ({ c, list: [...els.values()].filter(x => x.e.cat === c.k) })).filter(g => g.list.length);
  const nextDay = ix.days[ix.days.indexOf(day) + 1];
  const nextPl = nextDay && computeDay(prod, nextDay, ix);
  const hosp = prod.settings.hospital;
  const crewByDept = DEPTS.map(d => ({ d: d.k, list: crew.filter(c => (c.person.dept || "Other") === d.k) })).filter(g => g.list.length);
  return (
    <div className="paper">
      <Head prod={prod} kicker={`Call sheet · Day ${n} of ${total}`} title={fmtDate(day.date, true)}
        right={<><div className="kicker">General crew call</div><div className="big mono">{fmtT(pl.call)}</div></>} />
      <div className="grid3">
        <Box k="Sunrise / Sunset" v={pl.sun?.rise != null ? `${fmtT(pl.sun.rise)} / ${fmtT(pl.sun.set)}` : "—"} sub={pl.sun?.rise != null ? `${fmtDur(pl.sun.light)} of daylight` : "Add location coordinates"} />
        <Box k="Weather" v={day.weather || "Not forecast yet"} />
        <Box k="Estimated wrap" v={fmtT(pl.wrap)} sub={`${fmtPages(pl.eighths)} pages · ${pl.scenes.length} scenes`} />
      </div>
      <div className="grid3" style={{ marginTop: 10 }}>
        <Box k="Director" v={prod.director} sub={prod.contact} />
        <Box k="1st AD" v={ad?.name} sub={ad?.phone} />
        <Box k="Production manager" v={pm?.name || prod.producer} sub={pm?.phone} />
      </div>
      <div className="grid2" style={{ marginTop: 10 }}>
        <Box k="Nearest hospital" v={hosp.name} sub={[hosp.address, hosp.phone].filter(Boolean).join(" · ") || "Add in Settings"} />
        <Box k="Notes & safety" v={day.notes ? "" : "—"} sub={day.notes} />
      </div>

      <h2>Locations</h2>
      <table><thead><tr><th style={{ width: 24 }}>#</th><th>Location</th><th>Address</th><th>Parking / power</th><th>Contact</th></tr></thead>
        <tbody>{pl.locs.map((l, i) => (
          <tr key={l.id}><td className="mono"><b>{i + 1}</b></td><td><b>{l.name}</b></td>
            <td>{dash(l.address)}{hasGeo(l) && <div className="mono" style={{ color: "#7a7f8c" }}>{(+l.lat).toFixed(5)}, {(+l.lng).toFixed(5)}</div>}</td>
            <td>{[l.parking && "Parking: " + l.parking, l.power && "Power: " + l.power, l.restrooms && "Restrooms: " + l.restrooms].filter(Boolean).map((t, j) => <div key={j}>{t}</div>)}{!l.parking && !l.power && !l.restrooms && "—"}</td>
            <td>{dash(l.contact)}<div>{l.phone}</div></td></tr>))}</tbody></table>

      <h2>Schedule</h2>
      <table><thead><tr><th>Time</th><th>Sc</th><th>Set / description</th><th>D/N</th><th>Cast</th><th className="r">Pg</th><th>Loc</th></tr></thead>
        <tbody>
          <tr><td className="mono">{fmtT(pl.call)}</td><td colSpan={6}><b>Crew call</b> · rig and prepare first setup</td></tr>
          {pl.items.map((it, i) => it.type === "scene" ? (
            <tr key={i} className={k(it.scene)}><td className="mono">{fmtT(it.start)}</td><td className="mono"><b>{it.scene.num}</b></td>
              <td><b>{heading(it.scene).replace(/ – \w+$/, "")}</b><div style={{ color: "#4a4f5b" }}>{it.scene.synopsis}</div></td>
              <td>{it.scene.tod}</td><td className="mono">{ix.sceneCast(it.scene).map(id => nos.get(id)).filter(Boolean).join(", ")}</td><td className="r mono">{fmtPages(it.scene.eighths)}</td>
              <td className="mono">{pl.locs.indexOf(it.loc) + 1 || "—"}</td></tr>
          ) : (
            <tr key={i}><td className="mono">{fmtT(it.start)}</td><td colSpan={6} style={{ color: "#4a4f5b" }}>{it.type === "move" ? `Company move: ${it.from.name} → ${it.to.name} (${fmtDur(it.end - it.start)})` : `Meal break (${fmtDur(it.end - it.start)})`}</td></tr>
          ))}
          <tr className="dayrow"><td className="mono">{fmtT(pl.wrap)}</td><td colSpan={6}>Estimated wrap · {fmtPages(pl.eighths)} pages</td></tr>
        </tbody></table>

      <h2>Cast</h2>
      <table><thead><tr><th>#</th><th>Character</th><th>Actor</th><th>Hair / makeup</th><th>On set</th><th>Wrap</th><th>Scenes</th><th>Phone</th></tr></thead>
        <tbody>{cc.length === 0 && <tr><td colSpan={8}>No cast today.</td></tr>}
          {cc.map(c => (
            <tr key={c.person.id}><td className="mono">{nos.get(c.person.id)}</td><td><b>{c.person.role}</b></td><td>{who(c.person)}</td>
              <td className="mono">{fmtT(c.makeup)}</td><td className="mono"><b>{fmtT(c.set)}</b></td><td className="mono">{fmtT(c.wrap)}</td>
              <td className="mono">{[...new Set(c.scenes.map(s => s.num))].join(", ")}</td><td>{dash(c.person.phone)}</td></tr>))}</tbody></table>

      <h2>Crew</h2>
      {crewByDept.length === 0 ? <p>No crew entered yet.</p> : (
        <table><thead><tr><th>Department</th><th>Position</th><th>Name</th><th>Call</th><th>Phone</th></tr></thead>
          <tbody>{crewByDept.map(g => g.list.map((c, i) => (
            <tr key={c.person.id}><td><b>{i === 0 ? g.d : ""}</b></td><td>{c.person.role}</td><td>{who(c.person)}</td><td className="mono">{fmtT(c.call)}</td><td>{dash(c.person.phone)}</td></tr>)))}</tbody></table>
      )}

      {elGroups.length > 0 && (<>
        <h2>Props, wardrobe & special requirements</h2>
        <div className="grid2">{elGroups.map(g => (
          <div key={g.c.k} className="box"><div className="k" style={{ color: g.c.c }}>{g.c.l}</div>
            {g.list.map(x => <div key={x.e.id}><span className="cb" /> {x.e.name}{x.e.qty > 1 ? ` ×${x.e.qty}` : ""} <span className="mono" style={{ color: "#7a7f8c" }}>sc {x.sc.join(",")}</span>{x.e.status === "needed" || x.e.status === "sourcing" ? <b style={{ color: "#c0532a" }}> · not yet acquired</b> : ""}</div>)}
          </div>))}</div></>)}

      {nextPl && (<>
        <h2>Advance · Day {n + 1}, {fmtDate(nextDay.date, true)}</h2>
        <table><tbody><tr><td style={{ width: 110 }}><b>Crew call</b></td><td className="mono">{fmtT(nextPl.call)}</td><td style={{ width: 90 }}><b>Scenes</b></td><td className="mono">{nextPl.scenes.map(i => i.scene.num).join(", ")}</td><td style={{ width: 90 }}><b>Locations</b></td><td>{nextPl.locs.map(l => l.name).join("; ")}</td></tr></tbody></table>
      </>)}
      <Foot prod={prod} label={`Call sheet · Day ${n}`} />
    </div>
  );
}

/* ======================== SHOT LIST ======================== */
export function ShotList({ prod, ix, scope = "all", dayId, order = "script" }) {
  let groups;
  if (scope === "day") {
    const d = ix.days.find(x => x.id === dayId) || ix.days[0];
    groups = [{ title: d ? `Day ${dayN(ix, d.id)} · ${fmtDate(d.date, true)}` : "", scenes: (d?.sceneIds || []).map(id => ix.sceneById.get(id)).filter(Boolean) }];
  } else if (order === "shoot") {
    groups = ix.days.map((d, i) => ({ title: `Day ${i + 1} · ${fmtDate(d.date, true)}`, scenes: d.sceneIds.map(id => ix.sceneById.get(id)).filter(Boolean) }));
    const rest = prod.scenes.filter(s => !ix.dayOfScene.has(s.id)); if (rest.length) groups.push({ title: "Not yet scheduled", scenes: rest });
  } else groups = [{ title: "", scenes: prod.scenes }];
  const all = groups.flatMap(g => g.scenes).flatMap(s => ix.shotsByScene.get(s.id) || []);
  const mins = sum(all.map(s => +s.setupMin || 0));
  return (
    <div className="paper">
      <Head prod={prod} kicker="Shot list" title={scope === "day" ? groups[0].title || "Shot list" : "Shot List"} right={<><div className="kicker">Totals</div><div className="mono"><b>{all.length}</b> shots · {fmtDur(mins)}</div></>} />
      {all.length === 0 && <p>No shots planned yet.</p>}
      <table>
        <thead><tr><th style={{ width: 18 }} /><th>Shot</th><th>Size</th><th>Angle</th><th>Move</th><th>Lens</th><th>Description</th><th>Equipment</th><th className="r">Min</th></tr></thead>
        <tbody>{groups.map((g, gi) => (
          <React.Fragment key={gi}>
            {scope !== "day" && g.title && <tr className="dayrow"><td colSpan={9}>{g.title}</td></tr>}
            {g.scenes.map(s => {
              const shots = ix.shotsByScene.get(s.id) || []; if (!shots.length) return null;
              return (
                <React.Fragment key={s.id}>
                  <tr className={k(s)}><td colSpan={9}><b className="mono">{s.num}</b>&nbsp; <b>{heading(s)}</b> <span style={{ color: "#4a4f5b" }}>· {ix.locById.get(s.locationId)?.name || "no location"} · {fmtPages(s.eighths)} pg</span></td></tr>
                  {shots.map(x => (
                    <tr key={x.id}><td><span className="cb" /></td><td className="mono"><b>{x.num}</b></td><td>{x.size}</td><td>{x.angle}</td><td>{x.move}</td><td className="mono">{x.lens ? x.lens + "mm" : ""}</td>
                      <td>{x.desc}{x.notes && <div style={{ color: "#7a7f8c" }}>{x.notes}</div>}</td><td>{x.equip}</td><td className="r mono">{x.setupMin}</td></tr>))}
                </React.Fragment>
              );
            })}
          </React.Fragment>))}</tbody>
      </table>
      <Foot prod={prod} label="Shot list" />
    </div>
  );
}

/* ======================== SHOOTING SCHEDULE (stripboard report) ======================== */
export function Stripboard({ prod, ix }) {
  const nos = castNos(prod);
  const rest = prod.scenes.filter(s => !ix.dayOfScene.has(s.id));
  const row = (s, t) => (
    <tr key={s.id} className={k(s)}><td className="mono"><b>{s.num}</b></td><td className="mono">{t ? fmtT(t) : ""}</td><td>{s.ie}</td>
      <td><b>{s.locName}</b><div style={{ color: "#4a4f5b" }}>{s.synopsis}</div></td><td>{s.tod}</td>
      <td className="mono">{ix.sceneCast(s).map(id => nos.get(id)).filter(Boolean).join(", ")}</td><td className="r mono">{fmtPages(s.eighths)}</td><td>{ix.locById.get(s.locationId)?.name || "—"}</td></tr>
  );
  return (
    <div className="paper">
      <Head prod={prod} kicker="Shooting schedule" title="Stripboard Schedule" right={<><div className="kicker">{ix.days.length} shoot days</div><div className="mono">{prod.scenes.length} scenes · {fmtPages(sum(prod.scenes.map(s => s.eighths)))} pp</div></>} />
      <div style={{ display: "flex", gap: 16, marginBottom: 6 }}>{Object.entries(STRIP_LABEL).map(([key, l]) => <span key={key}><i style={{ display: "inline-block", width: 12, height: 12, border: "1px solid #999", marginRight: 5, verticalAlign: -2, background: { id: "#fff", xd: "#fff6bd", in: "#d6e6fb", xn: "#d3efd9" }[key] }} />{l}</span>)}</div>
      <table>
        <thead><tr><th>Sc</th><th>Time</th><th>I/E</th><th>Set / synopsis</th><th>D/N</th><th>Cast</th><th className="r">Pg</th><th>Location</th></tr></thead>
        <tbody>{ix.days.map((d, i) => {
          const pl = computeDay(prod, d, ix);
          return (
            <React.Fragment key={d.id}>
              <tr className="dayrow"><td colSpan={8}>DAY {i + 1} · {fmtDate(d.date, true).toUpperCase()} · CALL {fmtT(pl.call)} · EST. WRAP {fmtT(pl.wrap)} · {fmtPages(pl.eighths)} PG</td></tr>
              {pl.scenes.map(it => row(it.scene, it.start))}
              {pl.scenes.length === 0 && <tr><td colSpan={8} style={{ color: "#7a7f8c" }}>No scenes scheduled</td></tr>}
            </React.Fragment>
          );
        })}
          {rest.length > 0 && <><tr className="dayrow"><td colSpan={8}>NOT YET SCHEDULED</td></tr>{rest.map(s => row(s))}</>}
        </tbody>
      </table>
      <div style={{ marginTop: 8, color: "#4a4f5b" }}><b>Cast key:</b> {prod.people.filter(p => p.kind === "cast").map(p => `${nos.get(p.id)}. ${p.role}`).join(" · ")}</div>
      <Foot prod={prod} label="Shooting schedule" />
    </div>
  );
}

/* ======================== ONE-LINER ======================== */
export function OneLiner({ prod, ix, order = "shoot" }) {
  const nos = castNos(prod);
  const sections = order === "shoot" && ix.days.length
    ? [...ix.days.map((d, i) => ({ t: `Day ${i + 1} · ${fmtDate(d.date, true)}`, scenes: d.sceneIds.map(id => ix.sceneById.get(id)).filter(Boolean) })), { t: "Not yet scheduled", scenes: prod.scenes.filter(s => !ix.dayOfScene.has(s.id)) }].filter(s => s.scenes.length)
    : [{ t: "", scenes: prod.scenes }];
  return (
    <div className="paper">
      <Head prod={prod} kicker="Schedule" title="One-Liner" right={<div className="mono">{order === "shoot" ? "Shooting order" : "Script order"}</div>} />
      <table><thead><tr><th>Sc</th><th>I/E · D/N</th><th>Set</th><th>Description</th><th>Cast</th><th className="r">Pg</th></tr></thead>
        <tbody>{sections.map((sec, i) => (
          <React.Fragment key={i}>
            {sec.t && <tr className="dayrow"><td colSpan={6}>{sec.t}</td></tr>}
            {sec.scenes.map(s => <tr key={s.id} className={k(s)}><td className="mono"><b>{s.num}</b></td><td className="mono">{s.ie} · {s.tod}</td><td><b>{s.locName}</b></td><td>{s.synopsis}</td><td className="mono">{ix.sceneCast(s).map(id => nos.get(id)).filter(Boolean).join(", ")}</td><td className="r mono">{fmtPages(s.eighths)}</td></tr>)}
          </React.Fragment>))}</tbody></table>
      <Foot prod={prod} label="One-liner" />
    </div>
  );
}

/* ======================== DAY OUT OF DAYS ======================== */
export function Dood({ prod, ix }) {
  const D = dood(prod, ix);
  return (
    <div className="paper">
      <Head prod={prod} kicker="Cast schedule" title="Day Out of Days" right={<div className="mono">{D.days.length} shoot days</div>} />
      {D.days.length === 0 ? <p>Schedule some shoot days to build the day-out-of-days.</p> : (
        <table className="dood"><thead><tr><th>#</th><th>Character</th><th>Actor</th>{D.days.map((d, i) => <th key={d.id} className="c">{i + 1}<div style={{ fontWeight: 400 }}>{fmtDate(d.date).slice(4)}</div></th>)}<th className="c">Work</th><th className="c">Hold</th></tr></thead>
          <tbody>{D.rows.map((r, i) => (
            <tr key={r.person.id}><td className="mono">{i + 1}</td><td><b>{r.person.role}</b></td><td>{who(r.person)}</td>{r.cells.map((c, j) => <td key={j} className={"dc " + c}>{c}</td>)}<td className="c mono"><b>{r.work}</b></td><td className="c mono">{r.hold}</td></tr>))}</tbody></table>
      )}
      <div style={{ marginTop: 8, color: "#4a4f5b" }}><b>SW</b> start work · <b>W</b> work · <b>WF</b> work finish · <b>SWF</b> start, work, finish · <b>H</b> hold (between first and last work day)</div>
      <Foot prod={prod} label="Day out of days" />
    </div>
  );
}

/* ======================== BREAKDOWN SHEETS ======================== */
export function Breakdown({ prod, ix, withScript }) {
  const texts = withScript ? sceneTexts(prod.script) : [];
  const nos = castNos(prod);
  return (
    <>
      {prod.scenes.length === 0 && <div className="paper"><Head prod={prod} title="Script Breakdown" /><p>No scenes yet.</p></div>}
      {prod.scenes.map((s, i) => {
        const els = ix.elsByScene.get(s.id) || [], shots = ix.shotsByScene.get(s.id) || [], d = ix.dayOfScene.get(s.id), loc = ix.locById.get(s.locationId);
        return (
          <div className={"paper" + (i ? " sheet-break" : "")} key={s.id}>
            <Head prod={prod} kicker="Breakdown sheet" title={`Scene ${s.num}`} right={<><div className="kicker">Sheet {i + 1} of {prod.scenes.length}</div><div className="mono">{fmtPages(s.eighths)} pg</div></>} />
            <table><tbody>
              <tr className={k(s)}><td colSpan={4}><b style={{ fontSize: 14 }}>{heading(s)}</b></td></tr>
              <tr><td style={{ width: 90 }}><b>Description</b></td><td colSpan={3}>{s.synopsis || "—"}</td></tr>
              <tr><td><b>Shoots at</b></td><td>{loc ? `${loc.name}${loc.address ? " · " + loc.address : ""}` : "—"}</td><td style={{ width: 90 }}><b>Scheduled</b></td><td>{d ? `Day ${d.n} · ${fmtDate(d.day.date)}` : "Not scheduled"}</td></tr>
              <tr><td><b>Story day</b></td><td>{s.storyDay || 1}</td><td><b>Est. time</b></td><td>{fmtDur(sceneMinutes(prod, s, ix))}</td></tr>
            </tbody></table>
            <div className="grid2">
              <div className="box"><div className="k">Cast</div>{ix.sceneCast(s).map(id => { const p = ix.personById.get(id); return <div key={id}><b className="mono">{nos.get(id)}.</b> {p.role}{p.name ? ` (${p.name})` : ""}</div>; })}{ix.sceneCast(s).length === 0 && "—"}</div>
              <div className="box"><div className="k">Shots ({shots.length})</div>{shots.map(x => <div key={x.id}><b className="mono">{x.num}</b> {x.size} · {x.move}{x.desc ? ` · ${x.desc}` : ""}</div>)}{shots.length === 0 && "—"}</div>
            </div>
            <div className="grid3" style={{ marginTop: 10 }}>
              {CATS.filter(c => els.some(e => e.cat === c.k)).map(c => (
                <div className="box" key={c.k}><div className="k" style={{ color: c.c }}>{c.l}</div>{els.filter(e => e.cat === c.k).map(e => <div key={e.id}>{e.name}{e.qty > 1 ? ` ×${e.qty}` : ""}</div>)}</div>))}
            </div>
            {s.notes && <div className="box" style={{ marginTop: 10 }}><div className="k">Notes</div>{s.notes}</div>}
            {withScript && texts[s.scriptIdx] && <><h2>Script</h2><div className="scene-text">{texts[s.scriptIdx]}</div></>}
            <Foot prod={prod} label={`Scene ${s.num}`} />
          </div>
        );
      })}
    </>
  );
}

/* ======================== CAST / CREW / LOCATIONS ======================== */
export function CastList({ prod, ix }) {
  const D = dood(prod, ix), nos = castNos(prod);
  return (
    <div className="paper">
      <Head prod={prod} kicker="Contacts" title="Cast List" right={<div className="mono">{prod.people.filter(p => p.kind === "cast").length} roles</div>} />
      <table><thead><tr><th>#</th><th>Character</th><th>Actor</th><th>Phone</th><th>Email</th><th>Status</th><th>Scenes</th><th className="c">Days</th></tr></thead>
        <tbody>{prod.people.filter(p => p.kind === "cast").map(p => (
          <tr key={p.id}><td className="mono">{nos.get(p.id)}</td><td><b>{p.role}</b></td><td>{who(p)}</td><td>{dash(p.phone)}</td><td>{dash(p.email)}</td><td>{p.status}</td>
            <td className="mono">{(ix.scenesByPerson.get(p.id) || []).map(s => s.num).join(", ")}</td><td className="c mono">{D.rows.find(r => r.person.id === p.id)?.work || 0}</td></tr>))}</tbody></table>
      <Foot prod={prod} label="Cast list" />
    </div>
  );
}
export function CrewList({ prod }) {
  const groups = DEPTS.map(d => ({ d: d.k, list: prod.people.filter(p => p.kind === "crew" && (p.dept || "Other") === d.k) })).filter(g => g.list.length);
  return (
    <div className="paper">
      <Head prod={prod} kicker="Contacts" title="Crew List" right={<div className="mono">{prod.people.filter(p => p.kind === "crew").length} crew</div>} />
      <table><thead><tr><th>Department</th><th>Position</th><th>Name</th><th>Phone</th><th>Email</th><th>Status</th></tr></thead>
        <tbody>{groups.map(g => g.list.map((p, i) => <tr key={p.id}><td><b>{i === 0 ? g.d : ""}</b></td><td>{p.role}</td><td>{who(p)}</td><td>{dash(p.phone)}</td><td>{dash(p.email)}</td><td>{p.status}</td></tr>))}</tbody></table>
      <Foot prod={prod} label="Crew list" />
    </div>
  );
}
export function LocationSheet({ prod, ix }) {
  return (
    <div className="paper">
      <Head prod={prod} kicker="Locations" title="Location Sheet" right={<div className="mono">{prod.locations.length} locations</div>} />
      {prod.locations.map((l, i) => {
        const sc = ix.scenesByLoc.get(l.id) || [], days = ix.days.map((d, n) => ({ d, n: n + 1 })).filter(x => x.d.sceneIds.some(id => ix.sceneById.get(id)?.locationId === l.id));
        return (
          <div key={l.id} className="box" style={{ marginBottom: 10, breakInside: "avoid" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}><b style={{ fontSize: 14 }}>{i + 1}. {l.name}</b><span className="tag">{LOC_STATUS.find(s => s.k === l.status)?.l}</span><span style={{ flex: 1 }} /><span className="mono" style={{ color: "#7a7f8c" }}>{days.map(x => "Day " + x.n).join(", ") || "Not scheduled"}</span></div>
            <div style={{ color: "#4a4f5b" }}>{(l.plays || []).length ? "Plays: " + l.plays.join(", ") : ""}</div>
            <div className="grid2" style={{ marginTop: 6 }}>
              <div><div><b>Address:</b> {dash(l.address)}</div>{hasGeo(l) && <div className="mono">{(+l.lat).toFixed(5)}, {(+l.lng).toFixed(5)}</div>}<div><b>Contact:</b> {dash(l.contact)} {l.phone}</div><div><b>Hours:</b> {dash(l.hours)}</div><div><b>Cost:</b> {dash(l.cost)}</div><div><b>Permit:</b> {dash(l.permit)}</div></div>
              <div><div><b>Parking:</b> {dash(l.parking)}</div><div><b>Power:</b> {dash(l.power)}</div><div><b>Restrooms:</b> {dash(l.restrooms)}</div><div><b>Scenes:</b> <span className="mono">{sc.map(s => s.num).join(", ") || "—"}</span></div></div>
            </div>
            {l.notes && <div style={{ marginTop: 4 }}><b>Notes:</b> {l.notes}</div>}
            {(l.photos || []).length > 0 && <div style={{ display: "flex", gap: 6, marginTop: 6 }}>{l.photos.slice(0, 4).map((p, j) => <img key={j} src={p} alt="" style={{ height: 70, borderRadius: 3 }} />)}</div>}
          </div>
        );
      })}
      <Foot prod={prod} label="Location sheet" />
    </div>
  );
}

/* ======================== ELEMENTS ======================== */
export function ElementList({ prod, ix, cat }) {
  const cats = CATS.filter(c => (!cat || c.k === cat) && prod.elements.some(e => e.cat === c.k));
  return (
    <div className="paper">
      <Head prod={prod} kicker="Art & production" title={cat ? CAT[cat].l : "Props & Elements"} right={<div className="mono">{prod.elements.filter(e => !cat || e.cat === cat).length} items</div>} />
      {cats.length === 0 && <p>No elements tagged yet.</p>}
      {cats.map(c => (
        <div key={c.k}><h2 style={{ borderColor: c.c }}>{c.l}</h2>
          <table><thead><tr><th style={{ width: 18 }} /><th>Item</th><th className="c">Qty</th><th>Scenes</th><th>Days</th><th>Status</th><th>Source</th><th>Notes</th></tr></thead>
            <tbody>{prod.elements.filter(e => e.cat === c.k).map(e => {
              const sc = e.sceneIds.map(id => ix.sceneById.get(id)).filter(Boolean);
              const days = [...new Set(sc.map(s => ix.dayOfScene.get(s.id)?.n).filter(Boolean))].sort((a, b) => a - b);
              return <tr key={e.id}><td><span className="cb" /></td><td><b>{e.name}</b></td><td className="c mono">{e.qty}</td><td className="mono">{sc.map(s => s.num).join(", ")}</td><td className="mono">{days.join(", ") || "—"}</td><td>{ELEMENT_STATUS.find(s => s.k === e.status)?.l}</td><td>{dash(e.source)}</td><td>{e.notes}</td></tr>;
            })}</tbody></table></div>))}
      <Foot prod={prod} label="Elements" />
    </div>
  );
}

/* ======================== STORYBOARD ======================== */
export function Storyboard({ prod, ix }) {
  return (
    <div className="paper">
      <Head prod={prod} kicker="Visual plan" title="Storyboard" right={<div className="mono">{prod.shots.length} frames · {prod.shots.filter(s => s.sketch).length} drawn</div>} />
      {prod.scenes.map(s => {
        const shots = ix.shotsByScene.get(s.id) || []; if (!shots.length) return null;
        return (
          <div key={s.id} style={{ marginBottom: 14 }}>
            <h3 style={{ borderBottom: "1px solid #c9c6bb" }}><span className="mono">{s.num}</span> · {heading(s)}</h3>
            <div className="sbgrid">{shots.map(x => (
              <div key={x.id} className="sbcell">
                {x.sketch ? <img src={x.sketch} alt={`Shot ${x.num}`} /> : <div className="blank">No sketch</div>}
                <div style={{ marginTop: 3 }}><b className="mono">{x.num}</b> · {x.size} · {x.move}{x.lens ? ` · ${x.lens}mm` : ""}</div>
                <div style={{ color: "#4a4f5b" }}>{x.desc}</div>
              </div>))}</div>
          </div>
        );
      })}
      <Foot prod={prod} label="Storyboard" />
    </div>
  );
}

/* ======================== PRODUCTION BOOK ======================== */
export function Book({ prod, ix }) {
  const Br = ({ children }) => <div className="sheet-break">{children}</div>;
  return (
    <>
      <div className="paper">
        <div style={{ minHeight: 420, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div className="kicker">{prod.company || "Production book"}</div>
          <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: "-.03em", lineHeight: 1.05, margin: "6px 0 10px" }}>{prod.title}</div>
          <div style={{ fontSize: 14, color: "#4a4f5b", maxWidth: 560 }}>{prod.logline}</div>
          <div style={{ marginTop: 20 }}>{prod.director && <div>Directed by <b>{prod.director}</b></div>}{prod.producer && <div>Produced by <b>{prod.producer}</b></div>}{prod.contact && <div>{prod.contact}</div>}</div>
          <div className="grid3" style={{ marginTop: 24, maxWidth: 560 }}>
            <Box k="Scenes" v={prod.scenes.length} /><Box k="Pages" v={fmtPages(sum(prod.scenes.map(s => s.eighths)))} /><Box k="Shoot days" v={ix.days.length} />
            <Box k="Locations" v={prod.locations.length} /><Box k="Cast" v={prod.people.filter(p => p.kind === "cast").length} /><Box k="Shots" v={prod.shots.length} />
          </div>
          <div style={{ marginTop: 24 }}><b>Contents</b><ol style={{ margin: "6px 0", paddingLeft: 18 }}>
            {["Shooting schedule", "One-liner", "Day out of days", "Call sheets", "Shot list", "Storyboard", "Cast and crew lists", "Location sheet", "Props and elements", "Breakdown sheets"].map(t => <li key={t}>{t}</li>)}</ol></div>
        </div>
      </div>
      <Br><Stripboard prod={prod} ix={ix} /></Br>
      <Br><OneLiner prod={prod} ix={ix} /></Br>
      <Br><Dood prod={prod} ix={ix} /></Br>
      {ix.days.map(d => <Br key={d.id}><CallSheet prod={prod} ix={ix} dayId={d.id} /></Br>)}
      <Br><ShotList prod={prod} ix={ix} scope="all" order="shoot" /></Br>
      <Br><Storyboard prod={prod} ix={ix} /></Br>
      <Br><CastList prod={prod} ix={ix} /></Br>
      <Br><CrewList prod={prod} /></Br>
      <Br><LocationSheet prod={prod} ix={ix} /></Br>
      <Br><ElementList prod={prod} ix={ix} /></Br>
      <Br><Breakdown prod={prod} ix={ix} /></Br>
    </>
  );
}

/* ======================== CSV exports ======================== */
export function csvFor(id, prod, ix, o = {}) {
  const nos = castNos(prod);
  if (id === "shotlist") {
    const shots = (o.scope === "day" ? (ix.days.find(d => d.id === o.dayId)?.sceneIds || []).map(i => ix.sceneById.get(i)).filter(Boolean) : o.order === "shoot" ? ix.days.flatMap(d => d.sceneIds.map(i => ix.sceneById.get(i))).filter(Boolean).concat(prod.scenes.filter(s => !ix.dayOfScene.has(s.id))) : prod.scenes);
    return toCSV(["Day", "Scene", "Shot", "Size", "Angle", "Movement", "Lens", "Description", "Equipment", "Minutes", "Status"],
      shots.flatMap(s => (ix.shotsByScene.get(s.id) || []).map(x => [ix.dayOfScene.get(s.id)?.n || "", s.num, x.num, x.size, x.angle, x.move, x.lens, x.desc, x.equip, x.setupMin, x.status])));
  }
  if (id === "stripboard" || id === "oneliner") {
    const rows = [];
    ix.days.forEach((d, i) => { const pl = computeDay(prod, d, ix); pl.scenes.forEach(it => rows.push([i + 1, d.date, fmtT(it.start), it.scene.num, it.scene.ie, it.scene.locName, it.scene.tod, ix.sceneCast(it.scene).map(x => ix.personById.get(x)?.role).join("; "), fmtPages(it.scene.eighths), it.loc?.name || "", it.scene.synopsis])); });
    prod.scenes.filter(s => !ix.dayOfScene.has(s.id)).forEach(s => rows.push(["", "", "", s.num, s.ie, s.locName, s.tod, ix.sceneCast(s).map(x => ix.personById.get(x)?.role).join("; "), fmtPages(s.eighths), ix.locById.get(s.locationId)?.name || "", s.synopsis]));
    return toCSV(["Day", "Date", "Start", "Scene", "I/E", "Set", "D/N", "Cast", "Pages", "Location", "Synopsis"], rows);
  }
  if (id === "dood") { const D = dood(prod, ix); return toCSV(["#", "Character", "Actor", ...D.days.map((d, i) => `D${i + 1} ${d.date}`), "Work", "Hold"], D.rows.map((r, i) => [i + 1, r.person.role, r.person.name, ...r.cells, r.work, r.hold])); }
  if (id === "cast") return toCSV(["#", "Character", "Actor", "Phone", "Email", "Status", "Scenes"], prod.people.filter(p => p.kind === "cast").map(p => [nos.get(p.id), p.role, p.name, p.phone, p.email, p.status, (ix.scenesByPerson.get(p.id) || []).map(s => s.num).join(" ")]));
  if (id === "crew") return toCSV(["Department", "Position", "Name", "Phone", "Email", "Status"], prod.people.filter(p => p.kind === "crew").map(p => [p.dept, p.role, p.name, p.phone, p.email, p.status]));
  if (id === "locations") return toCSV(["Location", "Status", "Address", "Lat", "Lng", "Contact", "Phone", "Cost", "Parking", "Power", "Scenes"], prod.locations.map(l => [l.name, l.status, l.address, l.lat, l.lng, l.contact, l.phone, l.cost, l.parking, l.power, (ix.scenesByLoc.get(l.id) || []).map(s => s.num).join(" ")]));
  if (id === "elements") return toCSV(["Category", "Item", "Qty", "Status", "Scenes", "Source", "Notes"], prod.elements.filter(e => !o.cat || e.cat === o.cat).map(e => [CAT[e.cat]?.l, e.name, e.qty, e.status, e.sceneIds.map(i => ix.sceneById.get(i)?.num).filter(Boolean).join(" "), e.source, e.notes]));
  if (id === "callsheet") {
    const d = ix.days.find(x => x.id === o.dayId) || ix.days[0]; if (!d) return null;
    const pl = computeDay(prod, d, ix);
    return toCSV(["Time", "Scene", "Set", "D/N", "Cast", "Pages", "Location"], pl.items.map(it => it.type === "scene" ? [fmtT(it.start), it.scene.num, heading(it.scene), it.scene.tod, ix.sceneCast(it.scene).map(x => ix.personById.get(x)?.role).join("; "), fmtPages(it.scene.eighths), it.loc?.name || ""] : [fmtT(it.start), "", it.type === "move" ? "Company move" : "Meal break", "", "", "", ""]));
  }
  return null;
}
void distanceKm; void diffDays;
