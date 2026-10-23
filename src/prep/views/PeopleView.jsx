import React, { useMemo, useState } from "react";
import { useP, Icon, Btn, IconBtn, Chip, Pill, Seg, SearchBox, Txt, Area, Sel, Num, Section, InspHead, DateList, Avatar, Empty } from "../ui";
import { mkPerson, PERSON_STATUS, DEPTS } from "../model";
import { dood } from "../plan";
import { fmtShortDate } from "../util";
import { NoSelection, SceneChip } from "./shared";

const TONE = { tbd: "mute", offered: "warn", confirmed: "ok" };

export default function PeopleView() {
  const { prod, ix, add, sel, select } = useP();
  const [tab, setTab] = useState("cast");
  const [q, setQ] = useState("");
  const person = ix.personById.get(sel.person);
  const D = useMemo(() => dood(prod, ix), [prod, ix]);
  const workDays = id => D.rows.find(r => r.person.id === id)?.work || 0;

  const rows = prod.people.filter(p => (tab === "all" || p.kind === tab) && (!q || `${p.name} ${p.role} ${p.dept} ${p.email}`.toLowerCase().includes(q.toLowerCase())));
  const crewGroups = useMemo(() => {
    const g = new Map(); rows.forEach(p => { const k = p.dept || "Other"; if (!g.has(k)) g.set(k, []); g.get(k).push(p); });
    return [...g.entries()].sort((a, b) => DEPTS.findIndex(d => d.k === a[0]) - DEPTS.findIndex(d => d.k === b[0]));
  }, [rows]);

  const addP = kind => { const p = mkPerson({ kind, dept: kind === "crew" ? "Production" : "" }); add("people", p); select("person", p.id); if (tab !== "all") setTab(kind); };

  const castRow = p => {
    const sc = ix.scenesByPerson.get(p.id) || [];
    return (
      <tr key={p.id} className={"row-click" + (sel.person === p.id ? " sel" : "")} onClick={() => select("person", p.id)}>
        <td style={{ width: 40 }}><Avatar name={p.name || p.role} /></td>
        <td><b>{p.role || "—"}</b></td>
        <td>{p.name || <span className="muted">Not cast</span>}</td>
        <td><Pill tone={TONE[p.status]}>{PERSON_STATUS.find(s => s.k === p.status)?.l}</Pill></td>
        <td className="mono">{sc.length}</td>
        <td className="mono">{workDays(p.id) || <span className="muted">—</span>}</td>
        <td className="tx2">{p.phone || "—"}</td>
        <td>{(p.blocked || []).length > 0 && <Pill tone="warn">{p.blocked.length} blocked</Pill>}</td>
      </tr>
    );
  };
  const crewRow = p => (
    <tr key={p.id} className={"row-click" + (sel.person === p.id ? " sel" : "")} onClick={() => select("person", p.id)}>
      <td style={{ width: 40 }}><Avatar name={p.name || p.role} /></td>
      <td><b>{p.role || "—"}</b></td><td>{p.name || <span className="muted">Open position</span>}</td>
      <td><Pill tone={TONE[p.status]}>{PERSON_STATUS.find(s => s.k === p.status)?.l}</Pill></td>
      <td className="tx2">{p.phone || "—"}</td><td className="tx2">{p.email || "—"}</td>
    </tr>
  );

  return (
    <>
      <div className="view-main">
        <div className="toolbar">
          <Seg value={tab} onChange={setTab} options={[{ k: "cast", l: `Cast · ${prod.people.filter(p => p.kind === "cast").length}` }, { k: "crew", l: `Crew · ${prod.people.filter(p => p.kind === "crew").length}` }, { k: "all", l: "Everyone" }]} />
          <SearchBox value={q} onChange={setQ} placeholder="Search people…" />
          <span className="sp" />
          <Btn icon="plus" onClick={() => addP("crew")}>Add crew</Btn>
          <Btn variant="pri" icon="plus" onClick={() => addP("cast")}>Add cast</Btn>
        </div>
        {prod.people.length === 0 ? (
          <Empty icon="people" title="No one yet" action={<Btn variant="pri" icon="plus" onClick={() => addP("cast")}>Add a cast member</Btn>}>Speaking roles are created from your script automatically. Assign actors, then build out the crew.</Empty>
        ) : (
          <div className="scroll tbl-wrap" style={{ flex: 1 }}>
            {(tab === "cast" || tab === "all") && rows.some(p => p.kind === "cast") && (
              <>
                {tab === "all" && <div className="sect-h pad" style={{ paddingBottom: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--tx3)" }}>Cast</div>}
                <table className="tbl"><thead><tr><th /><th>Character</th><th>Actor</th><th>Status</th><th>Scenes</th><th>Work days</th><th>Phone</th><th /></tr></thead><tbody>{rows.filter(p => p.kind === "cast").map(castRow)}</tbody></table>
              </>
            )}
            {(tab === "crew" || tab === "all") && crewGroups.map(([dept, ps]) => {
              const cr = ps.filter(p => p.kind === "crew"); if (!cr.length) return null;
              return (
                <div key={dept}>
                  <div style={{ padding: "14px 16px 6px", fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--tx3)" }}>{dept}</div>
                  <table className="tbl"><tbody>{cr.map(crewRow)}</tbody></table>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {person ? <PersonInspector person={person} key={person.id} workDays={workDays(person.id)} /> : <NoSelection icon="people" title="Select a person">Contact details, availability, call-time rules and every scene they’re in.</NoSelection>}
    </>
  );
}

function PersonInspector({ person, workDays }) {
  const { ix, patch, remove, select, nav } = useP();
  const up = ch => patch("people", person.id, ch);
  const scenes = ix.scenesByPerson.get(person.id) || [];
  const days = ix.days.map((d, i) => ({ d, n: i + 1 })).filter(x => x.d.sceneIds.some(id => scenes.some(s => s.id === id)));
  const cast = person.kind === "cast";
  const deptOff = DEPTS.find(d => d.k === person.dept)?.off ?? 0;
  return (
    <aside className="insp">
      <InspHead title={person.name || person.role || "New person"} sub={cast ? `Cast${person.role ? " · " + person.role : ""}` : `Crew${person.dept ? " · " + person.dept : ""}`} onClose={() => select("person", null)}
        actions={<IconBtn icon="trash" title="Delete" onClick={() => { if (window.confirm(`Remove ${person.name || person.role || "this person"}? They’ll be removed from all scenes.`)) { remove("people", person.id); select("person", null); } }} />} />
      <div className="insp-body">
        <div className="row"><Txt label={cast ? "Character" : "Position"} value={person.role} onChange={v => up({ role: v })} /><Txt label={cast ? "Actor" : "Name"} value={person.name} onChange={v => up({ name: v })} /></div>
        <div className="row">
          <Sel label="Status" value={person.status} onChange={v => up({ status: v })} options={PERSON_STATUS} />
          {!cast && <Sel label="Department" value={person.dept || "Other"} onChange={v => up({ dept: v })} options={DEPTS.map(d => d.k)} />}
        </div>
        <div className="row"><Txt label="Phone" value={person.phone} onChange={v => up({ phone: v })} /><Txt label="Email" value={person.email} onChange={v => up({ email: v })} /></div>
        {cast && <Txt label="Also called in the script" value={(person.aliases || []).join(", ")} onChange={v => up({ aliases: v.split(",").map(x => x.trim()).filter(Boolean) })} hint="Other names that should map to this character (comma separated), e.g. WREN for DEPUTY WREN. Applies on the next script sync." />}
        {!cast && <Num label="Call offset from crew call (min)" value={person.callOffset ?? ""} onChange={v => up({ callOffset: v === "" ? null : v })} step={15} hint={`Blank uses the ${person.dept || "Other"} default (${deptOff > 0 ? "+" : ""}${deptOff} min). Negative = earlier.`} />}
        <Area label="Notes" value={person.notes} onChange={v => up({ notes: v })} rows={3} placeholder={cast ? "Dietary, wardrobe sizes, accommodations…" : "Equipment, rates, restrictions…"} />

        <Section title="Unavailable dates"><DateList dates={person.blocked} onChange={v => up({ blocked: v })} /><div className="help">The scheduler and conflict checker both respect these.</div></Section>

        {cast && (
          <Section title={`In ${scenes.length} scene${scenes.length === 1 ? "" : "s"} · ${workDays} work day${workDays === 1 ? "" : "s"}`}>
            <div className="chips">{scenes.map(s => <SceneChip key={s.id} scene={s} onClick={() => nav("scene", s.id)} />)}</div>
            {days.length > 0 && <div className="chips" style={{ marginTop: 8 }}>{days.map(x => <Chip key={x.d.id} onClick={() => nav("day", x.d.id)}><Icon n="schedule" s={12} />Day {x.n} · {fmtShortDate(x.d.date)}</Chip>)}</div>}
          </Section>
        )}
      </div>
    </aside>
  );
}
