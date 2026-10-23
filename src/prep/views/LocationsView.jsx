import React, { useEffect, useMemo, useRef, useState } from "react";
import { useP, Icon, Btn, IconBtn, Chip, Pill, Seg, SearchBox, Txt, Area, Sel, Section, InspHead, Modal, DateList, DropBtn, Empty } from "../ui";
import { mkLocation, mergeLocations, reassignSet, LOC_STATUS } from "../model";
import { distanceKm, moveMinutes, computeDay } from "../plan";
import { hasGeo, fmtShortDate, fmtDur, shrinkImage } from "../util";
import { NoSelection, SceneChip } from "./shared";

const STATUS_TONE = { unscouted: "mute", scouting: "warn", approved: "info", permitted: "ok", booked: "ok" };
const STATUS_COLOR = { unscouted: "#8b93a3", scouting: "#e8920c", approved: "#3b82c4", permitted: "#1d9a60", booked: "#13805a" };
const KIND = [{ k: "practical", l: "Practical (real location)" }, { k: "exterior", l: "Exterior / street" }, { k: "stage", l: "Stage / studio" }, { k: "build", l: "Set build" }];

export default function LocationsView() {
  const { prod, ix, add, sel, select } = useP();
  const [mode, setMode] = useState("map");
  const [q, setQ] = useState("");
  const [fSt, setFSt] = useState("");
  const [routeDay, setRouteDay] = useState("");
  const [matrix, setMatrix] = useState(false);
  const list = useMemo(() => prod.locations.filter(l => (!q || `${l.name} ${l.address} ${(l.plays || []).join(" ")}`.toLowerCase().includes(q.toLowerCase())) && (!fSt || l.status === fSt)), [prod.locations, q, fSt]);
  const loc = ix.locById.get(sel.location);
  const geoCount = prod.locations.filter(hasGeo).length;
  const unit = prod.settings.units === "mi" ? "mi" : "km";
  const conv = km => (unit === "mi" ? km * 0.621371 : km);

  const addLoc = () => { const l = mkLocation({}); add("locations", l); select("location", l.id); };
  const daysAt = l => ix.days.map((d, i) => ({ d, n: i + 1 })).filter(x => x.d.sceneIds.some(id => ix.sceneById.get(id)?.locationId === l.id));

  const Row = ({ l }) => {
    const sc = ix.scenesByLoc.get(l.id) || [];
    return (
      <div className={"loc-card" + (sel.location === l.id ? " sel" : "")} onClick={() => select("location", l.id)}>
        <div className="loc-thumb">{l.photos?.[0] ? <img src={l.photos[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon n="location" s={22} />}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}><b className="ell">{l.name}</b><Pill tone={STATUS_TONE[l.status]}>{LOC_STATUS.find(s => s.k === l.status)?.l}</Pill></div>
          <div className="muted ell">{l.address || "No address yet"}</div>
          <div className="muted" style={{ fontSize: 11.5 }}>{sc.length ? `${sc.length} scene${sc.length > 1 ? "s" : ""} · ${daysAt(l).map(x => "D" + x.n).join(" ") || "unscheduled"}` : "Not used by any scene"}</div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="view-main">
        <div className="toolbar">
          <Seg value={mode} onChange={setMode} options={[{ k: "map", l: "Map", i: "map" }, { k: "list", l: "List", i: "list" }]} />
          <SearchBox value={q} onChange={setQ} placeholder="Search locations…" />
          <select className="select select-sm" style={{ width: 130 }} value={fSt} onChange={e => setFSt(e.target.value)}><option value="">Any status</option>{LOC_STATUS.map(s => <option key={s.k} value={s.k}>{s.l}</option>)}</select>
          {mode === "map" && ix.days.length > 0 && (
            <select className="select select-sm" style={{ width: 170 }} value={routeDay} onChange={e => setRouteDay(e.target.value)}>
              <option value="">Show route for…</option>{ix.days.map((d, i) => <option key={d.id} value={d.id}>Day {i + 1} · {fmtShortDate(d.date)}</option>)}
            </select>
          )}
          <span className="sp" />
          <Btn icon="route" onClick={() => setMatrix(true)} disabled={geoCount < 2}>Travel times</Btn>
          <Btn variant="pri" icon="plus" onClick={addLoc}>Add location</Btn>
        </div>

        {prod.locations.length === 0 ? (
          <Empty icon="location" title="No locations yet" action={<Btn variant="pri" icon="plus" onClick={addLoc}>Add a location</Btn>}>Locations appear automatically from your script’s scene headings. Then map each script set to the real place you’ll shoot it.</Empty>
        ) : mode === "list" ? (
          <div className="scroll tbl-wrap" style={{ flex: 1 }}>
            <table className="tbl">
              <thead><tr><th>Location</th><th>Plays as (script sets)</th><th>Status</th><th>Address</th><th>Contact</th><th>Cost</th><th>Scenes</th><th>Days</th></tr></thead>
              <tbody>{list.map(l => (
                <tr key={l.id} className={"row-click" + (sel.location === l.id ? " sel" : "")} onClick={() => select("location", l.id)}>
                  <td><b>{l.name}</b><div className="muted">{KIND.find(k => k.k === l.kind)?.l.split(" (")[0]}</div></td>
                  <td><div className="chips">{(l.plays || []).map(p => <Chip key={p}>{p}</Chip>)}</div></td>
                  <td><Pill tone={STATUS_TONE[l.status]}>{LOC_STATUS.find(s => s.k === l.status)?.l}</Pill></td>
                  <td className="tx2">{l.address || "—"}</td><td className="tx2">{l.contact || "—"}<div className="muted mono">{l.phone}</div></td><td className="mono">{l.cost || "—"}</td>
                  <td className="mono">{(ix.scenesByLoc.get(l.id) || []).map(s => s.num).join(", ") || "—"}</td>
                  <td className="mono">{daysAt(l).map(x => "D" + x.n).join(" ") || "—"}</td>
                </tr>))}</tbody>
            </table>
          </div>
        ) : (
          <div className="loc-split" style={{ flex: 1, display: "flex", minHeight: 0 }}>
            <div className="scroll loc-list" style={{ width: 330, borderRight: "1px solid var(--line)", background: "var(--panel)", flexShrink: 0 }}>{list.map(l => <Row key={l.id} l={l} />)}</div>
            <div style={{ flex: 1, padding: 18, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="mapbox" style={{ flex: 1, minHeight: 300 }}>
                <PinMap locs={list} selId={sel.location} onSelect={id => select("location", id)} route={routeDay ? computeDay(prod, ix.days.find(d => d.id === routeDay), ix) : null} unit={unit} conv={conv} prod={prod} />
              </div>
              <div className="legend" style={{ padding: 0 }}>
                {LOC_STATUS.map(s => <span key={s.k}><i className="catdot" style={{ background: STATUS_COLOR[s.k] }} />{s.l}</span>)}
                <span style={{ marginLeft: "auto" }}>{geoCount} of {prod.locations.length} have coordinates. Add them in the location panel to see them here.</span>
              </div>
            </div>
          </div>
        )}
      </div>
      {loc ? <LocInspector loc={loc} key={loc.id} unit={unit} conv={conv} daysAt={daysAt} /> : <NoSelection icon="location" title="Select a location">Scouting details, logistics, permits, photos and which scenes and days use it.</NoSelection>}
      {matrix && <Matrix onClose={() => setMatrix(false)} unit={unit} conv={conv} />}
    </>
  );
}

/* ---------- offline pin map ---------- */
function niceStep(span) { const raw = span / 5, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; }

function useSize(ref) {
  const [sz, setSz] = useState({ w: 900, h: 520 });
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => { const r = e.contentRect; if (r.width > 50 && r.height > 50) setSz({ w: Math.round(r.width), h: Math.round(r.height) }); });
    ro.observe(el); return () => ro.disconnect();
  }, [ref]);
  return sz;
}

function PinMap({ locs, selId, onSelect, route, unit, conv, prod }) {
  const box = useRef(null);
  const { w: W, h: H } = useSize(box);
  const pad = 80;
  const pts = locs.filter(hasGeo);
  if (!pts.length) return <div ref={box} className="empty" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}><div><Icon n="map" s={38} /><h3>No coordinates yet</h3><div>Open a location and enter an address, then use “Find on map”<br />or paste latitude, longitude.</div></div></div>;
  const lats = pts.map(l => +l.lat), lngs = pts.map(l => +l.lng);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2, k = Math.cos(midLat * Math.PI / 180);
  let spanX = (Math.max(...lngs) - Math.min(...lngs)) * k, spanY = Math.max(...lats) - Math.min(...lats);
  const minSpan = 0.02; spanX = Math.max(spanX, minSpan); spanY = Math.max(spanY, minSpan);
  const scale = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanY);
  const cx = (Math.min(...lngs) + Math.max(...lngs)) / 2, cy = midLat;
  const X = lng => W / 2 + (lng - cx) * k * scale, Y = lat => H / 2 - (lat - cy) * scale;
  const stepLat = niceStep(H / scale), stepLng = niceStep(W / scale / k);
  const lat0 = Math.floor((cy - H / 2 / scale) / stepLat) * stepLat, lng0 = Math.floor((cx - W / 2 / scale / k) / stepLng) * stepLng;
  const gl = [], gv = [];
  for (let la = lat0; la < cy + H / 2 / scale + stepLat; la += stepLat) gl.push(la);
  for (let ln = lng0; ln < cx + W / 2 / scale / k + stepLng; ln += stepLng) gv.push(ln);
  /* scale bar ~ 120px */
  const kmPerPx = 111.32 / scale, barKm = niceStep(kmPerPx * 140), barPx = barKm / kmPerPx;
  const rp = route ? route.items.filter(i => i.type === "scene" && hasGeo(i.loc)).map(i => i.loc).filter((l, i, a) => i === 0 || a[i - 1].id !== l.id) : [];
  /* label placement: try below, above, right, left until one doesn't collide */
  const placed = [], labels = new Map();
  pts.forEach(l => {
    const x = X(+l.lng), y = Y(+l.lat), txt = l.name.length > 24 ? l.name.slice(0, 23) + "…" : l.name, w = txt.length * 6.6;
    const cands = [{ dx: 0, dy: 30, a: "middle" }, { dx: 0, dy: -20, a: "middle" }, { dx: 20, dy: 4, a: "start" }, { dx: -20, dy: 4, a: "end" }, { dx: 0, dy: 48, a: "middle" }, { dx: 0, dy: -38, a: "middle" }];
    let pick = cands[0];
    for (const c of cands) {
      const bx = c.a === "middle" ? x + c.dx - w / 2 : c.a === "start" ? x + c.dx : x + c.dx - w, by = y + c.dy - 11;
      const hit = bx < 6 || bx + w > W - 6 || by < 4 || by > H - 8 || placed.some(r => bx < r.x + r.w && bx + w > r.x && by < r.y + 14 && by + 14 > r.y) || pts.some(o => o !== l && Math.abs(X(+o.lng) - (bx + w / 2)) < w / 2 + 14 && Math.abs(Y(+o.lat) - (by + 7)) < 20);
      if (!hit) { pick = c; placed.push({ x: bx, y: by, w }); break; }
    }
    if (pick === cands[0]) placed.push({ x: x - w / 2, y: y + 19, w });
    labels.set(l.id, { ...pick, txt });
  });
  return (
    <svg ref={box} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Locations map" style={{ position: "absolute", inset: 0 }}>
      {gl.map(la => <g key={"a" + la}><line x1="0" x2={W} y1={Y(la)} y2={Y(la)} stroke="var(--line)" strokeWidth="1" /><text x="8" y={Y(la) - 4} fontSize="10" fill="var(--tx3)" fontFamily="JetBrains Mono, monospace">{la.toFixed(3)}°</text></g>)}
      {gv.map(ln => <g key={"o" + ln}><line y1="0" y2={H} x1={X(ln)} x2={X(ln)} stroke="var(--line)" strokeWidth="1" /><text y={H - 8} x={X(ln) + 4} fontSize="10" fill="var(--tx3)" fontFamily="JetBrains Mono, monospace">{ln.toFixed(3)}°</text></g>)}
      {rp.length > 1 && rp.slice(1).map((l, i) => {
        const a = rp[i], x1 = X(+a.lng), y1 = Y(+a.lat), x2 = X(+l.lng), y2 = Y(+l.lat), d = distanceKm(a, l);
        return <g key={i}><line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--acc)" strokeWidth="3" strokeDasharray="8 6" /><circle cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} r="3" fill="var(--acc)" />
          <text x={(x1 + x2) / 2 + 8} y={(y1 + y2) / 2 - 8} fontSize="12" fontWeight="700" fill="var(--tx)" fontFamily="JetBrains Mono, monospace" stroke="var(--panel2)" strokeWidth="4" paintOrder="stroke">{d != null ? `${conv(d).toFixed(1)} ${unit} · ${fmtDur(moveMinutes(prod, a, l))}` : ""}</text></g>;
      })}
      <g transform={`translate(${W - pad - barPx}, ${H - 34})`}><line x1="0" x2={barPx} y1="0" y2="0" stroke="var(--tx2)" strokeWidth="2" /><line x1="0" x2="0" y1="-4" y2="4" stroke="var(--tx2)" strokeWidth="2" /><line x1={barPx} x2={barPx} y1="-4" y2="4" stroke="var(--tx2)" strokeWidth="2" />
        <text x={barPx / 2} y="-8" textAnchor="middle" fontSize="11" fill="var(--tx2)" fontFamily="JetBrains Mono, monospace">{conv(barKm).toFixed(barKm < 1 ? 1 : 0)} {unit}</text></g>
      {pts.map((l, i) => {
        const x = X(+l.lng), y = Y(+l.lat), on = selId === l.id;
        const idx = rp.findIndex(r => r.id === l.id);
        return (
          <g key={l.id} className="pin" transform={`translate(${x},${y})`} onClick={() => onSelect(l.id)}>
            {on && <circle r="22" fill="var(--acc-soft)" stroke="var(--acc)" strokeWidth="1.5" />}
            <circle className="pin-c" r="12" fill={STATUS_COLOR[l.status]} stroke="var(--panel)" strokeWidth="2.5" />
            <text textAnchor="middle" y="4" fontSize="11" fontWeight="800" fill="#fff" fontFamily="JetBrains Mono, monospace">{idx >= 0 ? idx + 1 : i + 1}</text>
            {(() => { const lb = labels.get(l.id); return <text textAnchor={lb.a} x={lb.dx} y={lb.dy} fontSize="12" fontWeight="700" fill="var(--tx)" stroke="var(--panel2)" strokeWidth="4" paintOrder="stroke">{lb.txt}</text>; })()}
          </g>
        );
      })}
    </svg>
  );
}

function Matrix({ onClose, unit, conv }) {
  const { prod } = useP();
  const ls = prod.locations.filter(hasGeo);
  return (
    <Modal title="Travel times between locations" onClose={onClose} wide>
      <div className="muted" style={{ marginBottom: 10 }}>Straight-line distance with an estimated drive time ({prod.settings.moveBaseMin} min load/unload + travel at {prod.settings.moveSpeedKmh} km/h). Adjust the rules in Settings.</div>
      <table className="tbl"><thead><tr><th />{ls.map(l => <th key={l.id}>{l.name.slice(0, 16)}</th>)}</tr></thead>
        <tbody>{ls.map(a => <tr key={a.id}><td><b>{a.name}</b></td>{ls.map(b => <td key={b.id} className="mono" style={{ background: a.id === b.id ? "var(--panel3)" : undefined }}>{a.id === b.id ? "" : <>{conv(distanceKm(a, b)).toFixed(1)} {unit}<div className="muted">{fmtDur(moveMinutes(prod, a, b))}</div></>}</td>)}</tr>)}</tbody></table>
    </Modal>
  );
}

function LocInspector({ loc, unit, conv, daysAt }) {
  const { prod, ix, patch, remove, select, nav, setProd, toast } = useP();
  const up = ch => patch("locations", loc.id, ch);
  const photoIn = useRef(null);
  const [busy, setBusy] = useState(false);
  const scenes = ix.scenesByLoc.get(loc.id) || [];
  const geo = hasGeo(loc);
  const days = daysAt(loc);
  const sets = [...new Set([...(loc.plays || [])])];
  const unmapped = [...new Set(prod.scenes.filter(s => s.locName && s.locationId !== loc.id).map(s => s.locName))];

  const geocode = async () => {
    if (!loc.address.trim()) return toast("Enter an address first");
    setBusy(true);
    try {
      const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(loc.address));
      const j = await r.json();
      if (j[0]) { up({ lat: +(+j[0].lat).toFixed(5), lng: +(+j[0].lon).toFixed(5) }); toast("Coordinates found"); } else toast("No match for that address. Try adding the city and state.");
    } catch (e) { toast("Couldn’t reach the map service. Enter coordinates manually."); }
    setBusy(false);
  };
  const pasteCoords = e => {
    const m = (e.clipboardData.getData("text") || "").match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
    if (m) { e.preventDefault(); up({ lat: +m[1], lng: +m[2] }); }
  };
  const addPhotos = async files => {
    const room = 8 - (loc.photos || []).length; const out = [];
    for (const f of [...files].slice(0, room)) { try { out.push(await shrinkImage(f)); } catch (e) { toast("Couldn’t read " + f.name); } }
    if (out.length) up({ photos: [...(loc.photos || []), ...out] });
  };
  const mapUrl = geo ? `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc.address)}`;
  const bbox = geo ? `${+loc.lng - 0.012},${+loc.lat - 0.007},${+loc.lng + 0.012},${+loc.lat + 0.007}` : "";

  return (
    <aside className="insp">
      <InspHead title={loc.name || "Location"} sub={`${scenes.length} scene${scenes.length === 1 ? "" : "s"} · ${days.length} day${days.length === 1 ? "" : "s"}`} onClose={() => select("location", null)}
        actions={<DropBtn icon="menu" label="" align="right" variant="ghost" items={[
          { cap: "Merge into…" }, ...prod.locations.filter(l => l.id !== loc.id).map(l => ({ label: l.name, onClick: () => { if (window.confirm(`Merge “${loc.name}” into “${l.name}”? Its scenes and script sets move to ${l.name}.`)) { setProd(p => mergeLocations(p, loc.id, l.id)); select("location", l.id); } } })),
          { sep: true }, { icon: "trash", label: "Delete location", onClick: () => { if (window.confirm(scenes.length ? `${scenes.length} scene(s) use this location and will become unassigned. Delete it?` : "Delete this location?")) { remove("locations", loc.id); select("location", null); } } },
        ]} />} />
      <div className="insp-body">
        <Txt label="Name" value={loc.name} onChange={v => up({ name: v })} />
        <div className="row">
          <Sel label="Status" value={loc.status} onChange={v => up({ status: v })} options={LOC_STATUS} />
          <Sel label="Type" value={loc.kind} onChange={v => up({ kind: v })} options={KIND} />
        </div>

        <Section title="Script sets filmed here" action={unmapped.length > 0 && (
          <DropBtn size="sm" variant="ghost" label="Add set" align="right" items={unmapped.map(s => ({ label: s, onClick: () => setProd(p => reassignSet(p, s, loc.id)) }))} />)}>
          <div className="chips">{sets.length ? sets.map(s => <Chip key={s} onRemove={() => up({ plays: loc.plays.filter(x => x !== s) })}>{s}</Chip>) : <span className="muted">None. Scenes are assigned from the Breakdown.</span>}</div>
          <div className="help">One real place often plays several script sets (a diner, its kitchen, its parking lot).</div>
        </Section>

        <Section title="Where">
          <Txt label="Address" value={loc.address} onChange={v => up({ address: v })} placeholder="Street, city, state" />
          <div className="row" style={{ alignItems: "flex-end" }}>
            <Txt label="Latitude" value={loc.lat} onChange={v => up({ lat: v })} mono onPaste={pasteCoords} placeholder="41.5868" />
            <Txt label="Longitude" value={loc.lng} onChange={v => up({ lng: v })} mono placeholder="-93.6249" />
            <div style={{ flex: "none" }}><Btn onClick={geocode} disabled={busy} icon="target" style={{ marginBottom: 0 }}>{busy ? "…" : "Find"}</Btn></div>
          </div>
          <div className="help">Coordinates drive the map, sunrise/sunset on call sheets, and company-move times.</div>
          {geo && <iframe title="Map preview" className="osm" style={{ marginTop: 10 }} loading="lazy" src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${loc.lat},${loc.lng}`} />}
          {(geo || loc.address) && <div style={{ marginTop: 8 }}><a className="btn btn-sm" href={mapUrl} target="_blank" rel="noreferrer"><Icon n="map" s={14} />Open in Google Maps</a></div>}
        </Section>

        <Section title="Contact & permits">
          <div className="row"><Txt label="Contact" value={loc.contact} onChange={v => up({ contact: v })} /><Txt label="Phone" value={loc.phone} onChange={v => up({ phone: v })} /></div>
          <Txt label="Email" value={loc.email} onChange={v => up({ email: v })} />
          <div className="row"><Txt label="Cost" value={loc.cost} onChange={v => up({ cost: v })} placeholder="$900/day" /><Txt label="Access hours" value={loc.hours} onChange={v => up({ hours: v })} /></div>
          <Area label="Permit / agreement" value={loc.permit} onChange={v => up({ permit: v })} rows={2} />
        </Section>

        <Section title="Logistics (printed on call sheets)">
          <Area label="Parking" value={loc.parking} onChange={v => up({ parking: v })} rows={2} />
          <div className="row"><Area label="Power" value={loc.power} onChange={v => up({ power: v })} rows={2} /><Area label="Restrooms" value={loc.restrooms} onChange={v => up({ restrooms: v })} rows={2} /></div>
          <Area label="Notes" value={loc.notes} onChange={v => up({ notes: v })} rows={3} placeholder="Noise, light, access, neighbours…" />
        </Section>

        <Section title="Unavailable dates"><DateList dates={loc.blocked} onChange={v => up({ blocked: v })} /></Section>

        <Section title={`Photos (${(loc.photos || []).length}/8)`}>
          <div className="photos">
            {(loc.photos || []).map((p, i) => <div className="ph" key={i}><img src={p} alt={`${loc.name} ${i + 1}`} /><IconBtn icon="x" variant="pri" size="sm" title="Remove photo" onClick={() => up({ photos: loc.photos.filter((_, j) => j !== i) })} /></div>)}
            {(loc.photos || []).length < 8 && <button className="add" onClick={() => photoIn.current.click()} aria-label="Add photos"><Icon n="plus" s={22} /></button>}
          </div>
          <input ref={photoIn} type="file" accept="image/*" multiple hidden onChange={e => { addPhotos(e.target.files); e.target.value = ""; }} />
          <div className="help">Photos are compressed to fit your cloud document.</div>
        </Section>

        <Section title="Scenes here">
          <div className="chips">{scenes.length ? scenes.map(s => <SceneChip key={s.id} scene={s} onClick={() => nav("scene", s.id)} />) : <span className="muted">No scenes yet</span>}</div>
          {days.length > 0 && <div className="chips" style={{ marginTop: 8 }}>{days.map(x => <Chip key={x.d.id} onClick={() => nav("day", x.d.id)}><Icon n="schedule" s={12} />Day {x.n} · {fmtShortDate(x.d.date)}</Chip>)}</div>}
        </Section>
      </div>
    </aside>
  );
}
