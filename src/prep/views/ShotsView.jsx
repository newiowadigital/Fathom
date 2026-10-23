import React, { useEffect, useMemo, useRef, useState } from "react";
import { useP, Icon, Btn, IconBtn, Pill, Seg, SearchBox, Txt, Area, Sel, Num, InspHead, DropBtn, Empty } from "../ui";
import { mkShot, SHOT_SIZES, SHOT_ANGLES, SHOT_MOVES, SHOT_STATUS } from "../model";
import { sceneMinutes } from "../plan";
import { fmtDur, fmtDate, shrinkImage, sum } from "../util";
import { KDot, NoSelection, shortHeading } from "./shared";

const COVERAGE = [
  { l: "Standard coverage (master, 2-shot, OTS ×2, CU ×2)", s: [["WS", "Master"], ["2-SHOT", "Two-shot"], ["OTS", "OTS on A"], ["OTS", "OTS on B"], ["CU", "Close-up A"], ["CU", "Close-up B"]] },
  { l: "Master + insert", s: [["WS", "Master"], ["INSERT", "Insert detail"]] },
  { l: "Walk and talk (Steadicam + close-ups)", s: [["MS", "Steadicam follow", "Steadicam"], ["CU", "Close-up A"], ["CU", "Close-up B"]] },
  { l: "Establishing + master + close-up", s: [["ESTAB", "Establishing"], ["WS", "Master"], ["CU", "Close-up"]] },
];

const renumber = (shots, scene) => {
  let n = 0;
  return shots.map(s => (s.sceneId === scene.id ? { ...s, num: `${scene.num}${String.fromCharCode(65 + (n++ % 26))}${n > 26 ? Math.floor((n - 1) / 26) : ""}` } : s));
};

export default function ShotsView() {
  const { prod, ix, add, patch, setProd, sel, select, nav } = useP();
  const [order, setOrder] = useState("script");
  const [q, setQ] = useState("");
  const [dragId, setDragId] = useState(null);
  const shot = prod.shots.find(s => s.id === sel.shot);

  const groups = useMemo(() => {
    const scenes = order === "script" ? prod.scenes : [...ix.days.flatMap(d => d.sceneIds.map(id => ix.sceneById.get(id))).filter(Boolean), ...prod.scenes.filter(s => !ix.dayOfScene.has(s.id))];
    return scenes.map(s => ({ scene: s, shots: (ix.shotsByScene.get(s.id) || []).filter(x => !q || `${x.num} ${x.desc} ${x.size} ${x.equip}`.toLowerCase().includes(q.toLowerCase())) }))
      .filter(g => g.shots.length || (!q && true));
  }, [prod.scenes, ix, order, q]);

  const total = prod.shots.length, done = prod.shots.filter(s => s.status === "shot").length;
  const mins = sum(prod.shots.map(s => +s.setupMin || 0));
  const sketched = prod.shots.filter(s => s.sketch).length;

  const addShot = (scene, over = {}) => {
    const n = (ix.shotsByScene.get(scene.id) || []).length;
    const s = mkShot(scene.id, { num: `${scene.num}${String.fromCharCode(65 + (n % 26))}`, ...over });
    add("shots", s); return s;
  };
  const coverage = (scene, tpl) => {
    const have = (ix.shotsByScene.get(scene.id) || []).length;
    const made = tpl.s.map((t, i) => mkShot(scene.id, { num: `${scene.num}${String.fromCharCode(65 + ((have + i) % 26))}`, size: t[0], desc: t[1], move: t[2] || "Static" }));
    setProd(p => ({ ...p, shots: [...p.shots, ...made] }));
  };
  const drop = (target) => {
    if (!dragId || dragId === target.id) return;
    setProd(p => {
      const dragged = p.shots.find(s => s.id === dragId); if (!dragged || dragged.sceneId !== target.sceneId) return p;
      const rest = p.shots.filter(s => s.id !== dragId);
      const at = rest.findIndex(s => s.id === target.id);
      const next = [...rest.slice(0, at), dragged, ...rest.slice(at)];
      return { ...p, shots: renumber(next, p.scenes.find(s => s.id === target.sceneId)) };
    });
    setDragId(null);
  };

  let lastDay = null;
  return (
    <>
      <div className="view-main">
        <div className="toolbar">
          <Seg value={order} onChange={setOrder} options={[{ k: "script", l: "Script order" }, { k: "shoot", l: "Shooting order" }]} />
          <SearchBox value={q} onChange={setQ} placeholder="Search shots…" />
          <span className="sp" />
          <span className="muted mono">{total} shots · {done} shot · {sketched} sketched · {fmtDur(mins)} setup</span>
        </div>
        <div className="scroll" style={{ flex: 1, paddingTop: 14 }}>
          {prod.scenes.length === 0 && <Empty icon="shots" title="No scenes to cover" action={<Btn variant="pri" onClick={() => nav("view", "script")}>Open script</Btn>}>Shots are planned scene by scene. Import a script first.</Empty>}
          {groups.map(({ scene: s, shots }) => {
            const d = ix.dayOfScene.get(s.id);
            const hdr = order === "shoot" && (d?.day.id || "none") !== lastDay ? (lastDay = d?.day.id || "none", d ? `Day ${d.n} · ${fmtDate(d.day.date, true)}` : "Not scheduled") : null;
            return (
              <div key={s.id}>
                {hdr && <div style={{ margin: "6px 20px 12px", padding: "6px 12px", background: "#1a1d24", color: "#fff", borderRadius: 8, fontWeight: 700 }}>{hdr}</div>}
                <div className="scene-block">
                  <div className="scene-bar">
                    <b className="mono" style={{ fontSize: 15 }}>{s.num}</b><KDot scene={s} /><b className="ell">{s.ie}. {s.locName} – {s.tod}</b>
                    <span className="muted mono">{shots.length} shot{shots.length === 1 ? "" : "s"} · {fmtDur(sceneMinutes(prod, s, ix))}</span>
                    <span style={{ flex: 1 }} />
                    <DropBtn size="sm" label="Coverage" align="right" items={COVERAGE.map(t => ({ label: t.l, onClick: () => coverage(s, t) }))} />
                    <Btn size="sm" icon="plus" onClick={() => { const n = addShot(s); select("shot", n.id); }}>Shot</Btn>
                  </div>
                  {shots.length === 0 ? <div className="muted" style={{ padding: "0 0 8px" }}>No shots yet. Use <b>Coverage</b> for a quick starting set.</div> : (
                    <div className="shot-grid">
                      {shots.map(x => (
                        <div key={x.id} className={"shot" + (sel.shot === x.id ? " sel" : "") + (x.status === "shot" ? " done" : "")} draggable onDragStart={() => setDragId(x.id)} onDragOver={e => e.preventDefault()} onDrop={() => drop(x)} onClick={() => select("shot", x.id)}>
                          <div className="shot-img">{x.sketch ? <img src={x.sketch} alt={`Sketch for shot ${x.num}`} /> : <span className="mono bold" style={{ fontSize: 20, opacity: .5 }}>{x.size}</span>}<span className="no">{x.num}</span></div>
                          <div className="shot-b">
                            <div className="chips"><Pill tone="acc">{x.size}</Pill><Pill tone="mute">{x.move}</Pill>{x.lens && <Pill tone="mute">{x.lens}mm</Pill>}<span style={{ flex: 1 }} /><button className="pill" style={{ border: 0, cursor: "pointer", background: x.status === "shot" ? "var(--ok-soft)" : "var(--panel3)", color: x.status === "shot" ? "var(--ok)" : "var(--tx3)" }} onClick={e => { e.stopPropagation(); patch("shots", x.id, { status: x.status === "shot" ? "planned" : "shot" }); }} title="Mark shot">{x.status === "shot" ? "✓ Shot" : x.status === "pickup" ? "Pickup" : "○"}</button></div>
                            <div className="tx2" style={{ marginTop: 6, minHeight: 34 }}>{x.desc || <span className="muted">No description</span>}</div>
                            <div className="muted mono" style={{ fontSize: 11, marginTop: 4 }}>{x.setupMin}m{x.equip ? ` · ${x.equip}` : ""}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {shot ? <ShotInspector shot={shot} key={shot.id} /> : <NoSelection icon="shots" title="Select a shot">Describe it, sketch the frame, set the lens and setup time. Everything feeds the printed shot list and storyboard.</NoSelection>}
    </>
  );
}

function ShotInspector({ shot }) {
  const { prod, ix, patch, setProd, select, nav, toast } = useP();
  const up = ch => patch("shots", shot.id, ch);
  const scene = ix.sceneById.get(shot.sceneId);
  const dup = () => { const c = { ...shot, id: Math.random().toString(36).slice(2), num: shot.num + "'" }; setProd(p => { const i = p.shots.findIndex(s => s.id === shot.id); const arr = [...p.shots]; arr.splice(i + 1, 0, c); return { ...p, shots: renumber(arr, scene) }; }); select("shot", c.id); };
  const del = () => { setProd(p => ({ ...p, shots: renumber(p.shots.filter(s => s.id !== shot.id), scene) })); select("shot", null); };
  return (
    <aside className="insp" style={{ width: 420 }}>
      <InspHead title={`Shot ${shot.num || "?"}`} sub={scene ? <a href="#scene" onClick={e => { e.preventDefault(); nav("scene", scene.id); }}>{scene.num}. {shortHeading(scene)}</a> : ""} onClose={() => select("shot", null)}
        actions={<><IconBtn icon="dupe" title="Duplicate" onClick={dup} /><IconBtn icon="trash" title="Delete shot" onClick={del} /></>} />
      <div className="insp-body">
        <div style={{ marginTop: 14 }}><SketchPad key={shot.id} value={shot.sketch} onChange={v => up({ sketch: v })} aspect={prod.settings.aspect || "16:9"} toast={toast} /></div>
        <div className="row"><Txt label="Shot #" value={shot.num} onChange={v => up({ num: v })} mono /><Sel label="Status" value={shot.status} onChange={v => up({ status: v })} options={SHOT_STATUS} /></div>
        <Area label="Description" value={shot.desc} onChange={v => up({ desc: v })} rows={2} placeholder="What the camera sees and what happens" />
        <div className="row"><Sel label="Size" value={shot.size} onChange={v => up({ size: v })} options={SHOT_SIZES} /><Sel label="Angle" value={shot.angle} onChange={v => up({ angle: v })} options={SHOT_ANGLES} /></div>
        <div className="row"><Sel label="Movement" value={shot.move} onChange={v => up({ move: v })} options={SHOT_MOVES} /><Txt label="Lens (mm)" value={shot.lens} onChange={v => up({ lens: v })} mono /></div>
        <div className="row"><Num label="Setup + shoot (min)" value={shot.setupMin} min={0} step={5} onChange={v => up({ setupMin: v || 0 })} /><Txt label="Equipment" value={shot.equip} onChange={v => up({ equip: v })} placeholder="Dolly, jib, drone…" /></div>
        <Area label="Notes (sound, lighting, safety)" value={shot.notes} onChange={v => up({ notes: v })} rows={2} />
      </div>
    </aside>
  );
}

/* ---------------- sketch pad ---------------- */
const COLORS = ["#111111", "#d23f3f", "#2f7cc2", "#1d9a60"];
function SketchPad({ value, onChange, aspect, toast }) {
  const cv = useRef(null), undoStack = useRef([]);
  const [color, setColor] = useState(COLORS[0]), [size, setSize] = useState(3), [erase, setErase] = useState(false), [thirds, setThirds] = useState(false);
  const ratio = { "16:9": 16 / 9, "2.39:1": 2.39, "1.85:1": 1.85, "4:3": 4 / 3, "1:1": 1, "9:16": 9 / 16 }[aspect] || 16 / 9;
  const W = 640, H = Math.round(W / ratio);
  const drawing = useRef(false), last = useRef(null);

  useEffect(() => {
    const c = cv.current, g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
    if (value) { const i = new Image(); i.onload = () => { g.drawImage(i, 0, 0, W, H); }; i.src = value; }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pos = e => { const r = cv.current.getBoundingClientRect(); return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) }; };
  const snap = () => { const g = cv.current.getContext("2d"); undoStack.current.push(g.getImageData(0, 0, W, H)); if (undoStack.current.length > 15) undoStack.current.shift(); };
  const down = e => { e.preventDefault(); cv.current.setPointerCapture(e.pointerId); snap(); drawing.current = true; last.current = pos(e); stroke(last.current, last.current, e.pressure); };
  const stroke = (a, b, pr) => {
    const g = cv.current.getContext("2d"); g.lineCap = "round"; g.lineJoin = "round";
    g.strokeStyle = erase ? "#fff" : color; g.lineWidth = (erase ? size * 4 : size) * (pr && pr !== 0.5 ? 0.5 + pr : 1);
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x + 0.01, b.y); g.stroke();
  };
  const move = e => { if (!drawing.current) return; const p = pos(e); stroke(last.current, p, e.pressure); last.current = p; };
  const up = () => { if (!drawing.current) return; drawing.current = false; onChange(cv.current.toDataURL("image/png")); };
  const undo = () => { const s = undoStack.current.pop(); if (!s) return; cv.current.getContext("2d").putImageData(s, 0, 0); onChange(cv.current.toDataURL("image/png")); };
  const clear = () => { snap(); const g = cv.current.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, W, H); onChange(""); };
  const load = async f => {
    if (!f) return;
    try {
      const url = await shrinkImage(f, 900, .7), i = new Image();
      i.onload = () => { snap(); const g = cv.current.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, W, H); const k = Math.min(W / i.width, H / i.height); g.drawImage(i, (W - i.width * k) / 2, (H - i.height * k) / 2, i.width * k, i.height * k); onChange(cv.current.toDataURL("image/jpeg", .7)); };
      i.src = url;
    } catch (e) { toast("Couldn’t read that image"); }
  };
  return (
    <div>
      <div className="sketch-wrap">
        <canvas ref={cv} width={W} height={H} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Storyboard sketch canvas" />
        {thirds && <svg viewBox="0 0 3 3" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}><path d="M1 0V3M2 0V3M0 1H3M0 2H3" stroke="rgba(47,124,194,.6)" strokeWidth="0.012" /></svg>}
      </div>
      <div className="sketch-tools">
        {COLORS.map(c => <button key={c} className={"swatch" + (!erase && color === c ? " on" : "")} style={{ background: c }} aria-label={"Pen " + c} onClick={() => { setColor(c); setErase(false); }} />)}
        <IconBtn icon="eraser" title="Eraser" variant={erase ? "pri" : "ghost"} size="sm" onClick={() => setErase(!erase)} />
        <input type="range" min="1" max="14" value={size} onChange={e => setSize(+e.target.value)} style={{ width: 70 }} aria-label="Brush size" />
        <span style={{ flex: 1 }} />
        <IconBtn icon="grid" title="Rule of thirds" variant={thirds ? "pri" : "ghost"} size="sm" onClick={() => setThirds(!thirds)} />
        <IconBtn icon="undo" title="Undo stroke" size="sm" onClick={undo} />
        <label className="btn btn-ghost btn-ico btn-sm" title="Use a reference image" style={{ cursor: "pointer" }}><Icon n="image" s={14} /><input type="file" accept="image/*" hidden onChange={e => { load(e.target.files[0]); e.target.value = ""; }} /></label>
        <IconBtn icon="trash" title="Clear sketch" size="sm" onClick={clear} />
      </div>
    </div>
  );
}
