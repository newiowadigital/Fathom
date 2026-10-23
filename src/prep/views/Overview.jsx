import React, { useMemo } from "react";
import { useP, Icon, Btn, Pill } from "../ui";
import { LOC_READY, stripKind } from "../model";
import { computeDay, metrics, castCalls } from "../plan";
import { fmtDate, fmtT, fmtDur, fmtPages, todayISO, diffDays, sum, hasGeo } from "../util";
import { Stat } from "./shared";

export default function Overview() {
  const { prod, ix, issues, nav, go } = useP();
  const plans = useMemo(() => ix.days.map(d => computeDay(prod, d, ix)), [prod, ix]);
  const met = useMemo(() => metrics(prod, ix), [prod, ix]);

  const pages = sum(prod.scenes.map(s => s.eighths));
  const today = todayISO();
  const nextIdx = Math.max(0, ix.days.findIndex(d => d.date >= today));
  const next = ix.days.length ? plans[ix.days.findIndex(d => d.date >= today) >= 0 ? nextIdx : ix.days.length - 1] : null;
  const nextN = next ? ix.days.indexOf(next.day) + 1 : 0;

  const used = new Set(prod.scenes.map(s => s.locationId).filter(Boolean));
  const usedLocs = prod.locations.filter(l => used.has(l.id));
  const cast = prod.people.filter(p => p.kind === "cast" && p.name);
  const crew = prod.people.filter(p => p.kind === "crew");
  const meters = [
    { l: "Scheduled", a: prod.scenes.filter(s => ix.dayOfScene.has(s.id)).length, b: prod.scenes.length, to: "schedule", unit: "scenes" },
    { l: "Coverage planned", a: prod.scenes.filter(s => (ix.shotsByScene.get(s.id) || []).length).length, b: prod.scenes.length, to: "shots", unit: "scenes" },
    { l: "Locations secured", a: usedLocs.filter(l => LOC_READY.has(l.status)).length, b: usedLocs.length, to: "locations", unit: "locs" },
    { l: "Cast confirmed", a: cast.filter(p => p.status === "confirmed").length, b: cast.length || prod.people.filter(p => p.kind === "cast").length, to: "people", unit: "cast" },
    { l: "Crew confirmed", a: crew.filter(p => p.status === "confirmed").length, b: crew.length, to: "people", unit: "crew" },
    { l: "Elements ready", a: prod.elements.filter(e => e.status === "acquired" || e.status === "ready").length, b: prod.elements.length, to: "elements", unit: "items" },
  ];
  const maxMin = Math.max(600, ...plans.map(p => p.wrap - p.call));

  const checklist = next ? (() => {
    const day = next.day, locs = next.locs;
    const els = new Set(); next.scenes.forEach(it => (ix.elsByScene.get(it.scene.id) || []).forEach(e => els.add(e)));
    const needEls = [...els].filter(e => e.status === "needed" || e.status === "sourcing");
    const castOn = castCalls(prod, next, ix);
    return [
      { ok: !!prod.settings.hospital.name, t: "Nearest hospital is listed", to: ["view", "settings"] },
      { ok: locs.length > 0 && locs.every(l => l.address), t: "Every location has an address", to: locs.find(l => !l.address) ? ["location", locs.find(l => !l.address).id] : null },
      { ok: locs.length > 0 && locs.every(l => hasGeo(l)), t: "Locations have map coordinates (for sunrise, sunset and drive times)", to: locs.find(l => !hasGeo(l)) ? ["location", locs.find(l => !hasGeo(l)).id] : null },
      { ok: locs.every(l => LOC_READY.has(l.status)), t: "Locations are approved or permitted", to: locs.find(l => !LOC_READY.has(l.status)) ? ["location", locs.find(l => !LOC_READY.has(l.status)).id] : null },
      { ok: castOn.every(c => c.person.name), t: "Every cast member on this day has an actor assigned", to: ["view", "people"] },
      { ok: castOn.every(c => c.person.phone), t: "Cast phone numbers on file", to: ["view", "people"] },
      { ok: needEls.length === 0, t: needEls.length ? `${needEls.length} element${needEls.length > 1 ? "s" : ""} still not acquired (${needEls.slice(0, 2).map(e => e.name).join(", ")}${needEls.length > 2 ? "…" : ""})` : "All elements for this day are acquired", to: needEls[0] ? ["element", needEls[0].id] : null },
      { ok: next.scenes.every(it => (ix.shotsByScene.get(it.scene.id) || []).length), t: "Every scene has a shot list", to: ["view", "shots"] },
      { ok: !!day.weather, t: "Weather forecast noted", to: ["day", day.id] },
    ];
  })() : [];

  return (
    <div className="view-main scroll pad">
      <div className="grid-ov">
        <div className="card hero c12">
          <div>
            <div className="kicker muted" style={{ fontSize: 10.5, letterSpacing: ".12em", fontWeight: 700, textTransform: "uppercase" }}>{[prod.company, prod.director && `Directed by ${prod.director}`].filter(Boolean).join(" · ") || "Production"}</div>
            <h2>{prod.title}</h2>
            <div className="logline">{prod.logline || <span className="muted">Add a logline in Settings → Production.</span>}</div>
          </div>
          <div className="stat-row">
            <Stat v={prod.scenes.length} l="Scenes" /><Stat v={fmtPages(pages)} l="Pages" /><Stat v={prod.locations.length} l="Locations" />
            <Stat v={prod.people.filter(p => p.kind === "cast").length} l="Cast" /><Stat v={prod.shots.length} l="Shots" /><Stat v={ix.days.length} l="Shoot days" />
          </div>
        </div>

        {prod.scenes.length === 0 && (
          <div className="card pad c12" style={{ display: "flex", alignItems: "center", gap: 18, borderColor: "var(--acc-line)", background: "var(--acc-soft)" }}>
            <Icon n="script" s={30} style={{ color: "var(--acc)" }} />
            <div style={{ flex: 1 }}><b>Start with the script.</b><div className="tx2">Paste or import a screenplay. Fathom finds every scene, location, time of day and speaking role, and builds the breakdown, locations list and cast list for you.</div></div>
            <Btn variant="pri" icon="script" onClick={() => go("script")}>Open script</Btn>
          </div>
        )}

        <div className="card c5">
          <div className="card-h">Readiness<span className="sp" /><span className="muted" style={{ fontWeight: 500 }}>click a row to jump there</span></div>
          <div className="card-b">
            {meters.map(m => {
              const pct = m.b ? Math.round((m.a / m.b) * 100) : 0;
              return (
                <div key={m.l} className="meter-row" onClick={() => go(m.to)}>
                  <span className="meter-l">{m.l}</span>
                  <div className={"meter" + (m.b && m.a === m.b ? " full" : "")}><i style={{ width: pct + "%" }} /></div>
                  <span className="meter-v mono">{m.b ? `${m.a}/${m.b}` : "—"}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card c7">
          <div className="card-h">{next ? `Next shoot day · Day ${nextN}` : "Shoot days"}<span className="sp" />
            {next && <Btn size="sm" icon="docs" onClick={() => nav("day", next.day.id, { doc: "callsheet", docDay: next.day.id, view: "docs" })}>Call sheet</Btn>}
            <Btn size="sm" icon="schedule" onClick={() => go("schedule")}>Schedule</Btn></div>
          <div className="card-b">
            {!next && <div className="muted" style={{ padding: "10px 0" }}>No shoot days yet. Open the Schedule and use <b>Auto-schedule</b> to group scenes by location, light and cast availability.</div>}
            {next && (
              <>
                <div style={{ display: "flex", gap: 22, flexWrap: "wrap", alignItems: "baseline", marginBottom: 10 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-.01em" }}>{fmtDate(next.day.date, true)}</div>
                  {(() => { const n = diffDays(today, next.day.date); return <Pill tone={n < 0 ? "mute" : n <= 3 ? "warn" : "info"}>{n < 0 ? `${-n} days ago` : n === 0 ? "Today" : `in ${n} day${n > 1 ? "s" : ""}`}</Pill>; })()}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                  {[["Crew call", fmtT(next.call)], ["Est. wrap", fmtT(next.wrap)], ["Sunrise", next.sun?.rise != null ? fmtT(next.sun.rise) : "—"], ["Sunset", next.sun?.set != null ? fmtT(next.sun.set) : "—"]].map(([k, v]) => (
                    <div key={k}><div className="muted" style={{ fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 700 }}>{k}</div><div className="mono" style={{ fontSize: 16, fontWeight: 700 }}>{v}</div></div>
                  ))}
                </div>
                <div className="hr" />
                {next.scenes.map(it => (
                  <div key={it.scene.id} style={{ display: "flex", gap: 10, padding: "3px 0", cursor: "pointer", alignItems: "center" }} onClick={() => nav("scene", it.scene.id)}>
                    <span className="mono muted" style={{ width: 66 }}>{fmtT(it.start)}</span><i className={"kdot " + stripKind(it.scene)} /><b className="mono" style={{ width: 28 }}>{it.scene.num}</b>
                    <span className="ell" style={{ flex: 1 }}>{it.scene.ie}. {it.scene.locName} – {it.scene.tod}</span><span className="muted mono">{fmtPages(it.scene.eighths)} pg</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        <div className="card c7">
          <div className="card-h">Shoot arc<span className="sp" /><span className="muted" style={{ fontWeight: 500 }}>{met.days} days · {met.moves} company moves · {met.castDays} cast days</span></div>
          <div className="card-b">
            {plans.length === 0 ? <div className="muted">Schedule scenes to see how the shoot is balanced.</div> :
              <div className="arc">
                {plans.map((pl, i) => {
                  const total = pl.wrap - pl.call, h = Math.max(8, (total / maxMin) * 100);
                  return (
                    <div key={pl.day.id} className={"arc-col" + (pl.over > 0 ? " over" : "")} onClick={() => nav("day", pl.day.id)} title={`Day ${i + 1}: ${fmtDur(total)}${pl.over ? `, ${fmtDur(pl.over)} over` : ""}`}>
                      <div className="arc-bar" style={{ height: h + "%" }}>
                        {pl.scenes.map(it => <i key={it.scene.id} className={stripKind(it.scene)} style={{ height: ((it.end - it.start) / Math.max(1, total)) * 100 + "%" }} />)}
                      </div>
                      <div className="arc-l"><b>D{i + 1}</b> {fmtDate(pl.day.date).slice(4)}</div>
                    </div>
                  );
                })}
              </div>}
          </div>
        </div>

        <div className="card c5">
          <div className="card-h">Needs attention<span className="sp" />{issues.length > 0 && <Pill tone="mute">{issues.length}</Pill>}</div>
          <div className="card-b" style={{ maxHeight: 300, overflowY: "auto" }}>
            {issues.length === 0 && <div className="muted" style={{ display: "flex", gap: 8, alignItems: "center" }}><Icon n="check" s={16} style={{ color: "var(--ok)" }} />No conflicts found.</div>}
            {issues.map((it, i) => (
              <div key={i} className={"issue " + it.level} onClick={() => it.ref && nav(it.ref.t, it.ref.id)}>
                <Icon n={it.level === "error" ? "warn" : it.level === "warn" ? "warn" : "info"} s={16} /><span>{it.msg}</span>
              </div>
            ))}
          </div>
        </div>

        {next && (
          <div className="card c7">
            <div className="card-h">Call sheet readiness · Day {nextN}</div>
            <div className="card-b">
              <ul className="checklist">
                {checklist.map((c, i) => (
                  <li key={i} style={{ cursor: c.to && !c.ok ? "pointer" : "default" }} onClick={() => !c.ok && c.to && nav(c.to[0], c.to[1])}>
                    <Icon n={c.ok ? "check" : "warn"} s={15} className={c.ok ? "ok" : "no"} /><span className={c.ok ? "tx2" : ""}>{c.t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
