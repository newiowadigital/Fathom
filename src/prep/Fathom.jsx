import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./fathom.css";
import { Ctx, Icon, Btn, IconBtn, Modal, Txt, Menu, Pill } from "./ui";
import { mkProd, indexProd, legacyAvailable, importLegacy, syncFromScript, sceneLabel } from "./model";
import { buildSample, validate } from "./plan";
import { todayISO, nextWeekday, addDays, fmtDate, download, slug } from "./util";
import Overview from "./views/Overview";
import ScriptView from "./views/ScriptView";
import ScenesView from "./views/ScenesView";
import LocationsView from "./views/LocationsView";
import PeopleView from "./views/PeopleView";
import ElementsView from "./views/ElementsView";
import ShotsView from "./views/ShotsView";
import ScheduleView from "./views/ScheduleView";
import DocsView from "./views/DocsView";
import SettingsView from "./views/SettingsView";

const LS_KEY = "fathom-prep-v1";
const LS_LEGACY = "fathom-data";
const LS_THEME = "fathom-theme";
const CLOUD_LIMIT = 960 * 1024;

const VIEWS = [
  { k: "overview", l: "Overview", i: "overview", g: "" },
  { k: "script", l: "Script", i: "script", g: "Story" },
  { k: "scenes", l: "Breakdown", i: "scenes", g: "Story" },
  { k: "locations", l: "Locations", i: "location", g: "World" },
  { k: "people", l: "Cast & Crew", i: "people", g: "World" },
  { k: "elements", l: "Elements", i: "elements", g: "World" },
  { k: "shots", l: "Shot List", i: "shots", g: "Coverage" },
  { k: "schedule", l: "Schedule", i: "schedule", g: "Plan" },
  { k: "docs", l: "Documents", i: "docs", g: "Output" },
];
const SEL_VIEW = { scene: "scenes", location: "locations", person: "people", element: "elements", shot: "shots", day: "schedule" };
const COMP = { overview: Overview, script: ScriptView, scenes: ScenesView, locations: LocationsView, people: PeopleView, elements: ElementsView, shots: ShotsView, schedule: ScheduleView, docs: DocsView, settings: SettingsView };

const readLocal = () => { try { const d = JSON.parse(localStorage.getItem(LS_KEY) || "null"); if (d && Array.isArray(d.productions)) return d; } catch (e) { /* ignore */ } return null; };
const readLegacy = () => { try { const d = JSON.parse(localStorage.getItem(LS_LEGACY) || "null"); if (d && legacyAvailable(d)) return d; } catch (e) { /* ignore */ } return null; };

export default function Fathom({ userId, userEmail, onSignOut }) {
  const [store, setStore] = useState(() => readLocal() || { v: 8, productions: [], activeId: null, updatedAt: "" });
  const [legacy, setLegacy] = useState(() => readLegacy());
  const [view, setView] = useState("overview");
  const [sel, setSel] = useState({});
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem(LS_THEME) || (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"); } catch (e) { return "light"; } });
  const [mini, setMini] = useState(false);
  const [palette, setPalette] = useState(false);
  const [prodMenu, setProdMenu] = useState(false);
  const [newProd, setNewProd] = useState(false);
  const [toastMsg, setToast] = useState("");
  const [save, setSave] = useState({ s: "idle", bytes: 0 });
  const [cloudReady, setCloudReady] = useState(!userId);
  const hist = useRef({ past: [], future: [], last: 0, id: null });

  const prod = store.productions.find(p => p.id === store.activeId) || null;

  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem(LS_THEME, theme); } catch (e) { /* ignore */ } }, [theme]);
  useEffect(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&family=Courier+Prime:ital,wght@0,400;0,700;1,400&display=swap";
    document.head.appendChild(l);
    return () => { try { document.head.removeChild(l); } catch (e) { /* ignore */ } };
  }, []);

  const toast = useCallback(m => { setToast(m); setTimeout(() => setToast(t => (t === m ? "" : t)), 2400); }, []);

  /* ---------- cloud load ---------- */
  useEffect(() => {
    if (!userId) return;
    let dead = false;
    (async () => {
      try {
        const { db } = await import("../firebase");
        const { doc, getDoc } = await import("firebase/firestore");
        const snap = await getDoc(doc(db, "users", userId));
        if (dead) return;
        if (snap.exists()) {
          const d = snap.data();
          if (legacyAvailable(d)) setLegacy(l => l || d);
          if (d.prep?.productions) {
            setStore(cur => (!cur.updatedAt || (d.prep.updatedAt || "") > cur.updatedAt ? d.prep : cur));
          }
        }
      } catch (e) { /* offline or not configured: keep local data */ }
      if (!dead) setCloudReady(true);
    })();
    return () => { dead = true; };
  }, [userId]);

  /* ---------- autosave ---------- */
  const storeRef = useRef(store); storeRef.current = store;
  useEffect(() => {
    if (!store.updatedAt) return; /* nothing has been edited yet */
    setSave(s => ({ ...s, s: "saving" }));
    const t1 = setTimeout(() => {
      try {
        const txt = JSON.stringify(store);
        localStorage.setItem(LS_KEY, txt);
        setSave(s => ({ ...s, bytes: txt.length, s: userId ? s.s : "saved" }));
      } catch (e) { setSave(s => ({ ...s, s: "error", msg: "Browser storage is full. Remove photos or export a backup." })); }
    }, 600);
    let t2;
    if (userId && cloudReady) {
      t2 = setTimeout(async () => {
        const size = JSON.stringify(store).length;
        if (size > CLOUD_LIMIT) { setSave(s => ({ ...s, s: "toobig", bytes: size })); return; }
        try {
          const { db } = await import("../firebase");
          const { doc, setDoc } = await import("firebase/firestore");
          await setDoc(doc(db, "users", userId), { prep: store }, { merge: true });
          setSave(s => ({ ...s, s: "saved", bytes: size }));
        } catch (e) { setSave(s => ({ ...s, s: "error", msg: "Cloud save failed. Changes are kept in this browser." })); }
      }, 1800);
    }
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [store, userId, cloudReady]);
  useEffect(() => { if (save.s === "saved") { const t = setTimeout(() => setSave(s => (s.s === "saved" ? { ...s, s: "idle" } : s)), 2500); return () => clearTimeout(t); } }, [save.s]);

  /* ---------- production mutations (with undo history) ---------- */
  /* `tag` lets rapid repeated edits of the same thing (typing) share one undo step; everything else is its own step */
  const setProd = useCallback((fn, tag) => {
    setStore(st => {
      const cur = st.productions.find(p => p.id === st.activeId);
      if (!cur) return st;
      const next = typeof fn === "function" ? fn(cur) : fn;
      if (next === cur) return st;
      const h = hist.current, now = Date.now();
      if (h.id !== cur.id) { h.past = []; h.future = []; h.id = cur.id; }
      if (!(tag && h.tag === tag && now - h.last <= 1200)) { h.past.push(cur); if (h.past.length > 80) h.past.shift(); }
      h.last = now; h.tag = tag || null; h.future = [];
      return { ...st, updatedAt: new Date().toISOString(), productions: st.productions.map(p => (p.id === cur.id ? next : p)) };
    });
  }, []);
  const undo = useCallback(() => {
    const h = hist.current; if (!h.past.length) return toast("Nothing to undo");
    setStore(st => {
      const cur = st.productions.find(p => p.id === st.activeId); const prev = h.past.pop();
      if (!cur || !prev) return st;
      h.future.push(cur); h.last = 0;
      return { ...st, updatedAt: new Date().toISOString(), productions: st.productions.map(p => (p.id === cur.id ? prev : p)) };
    });
  }, [toast]);
  const redo = useCallback(() => {
    const h = hist.current; if (!h.future.length) return;
    setStore(st => {
      const cur = st.productions.find(p => p.id === st.activeId); const nx = h.future.pop();
      if (!cur || !nx) return st;
      h.past.push(cur); h.last = 0;
      return { ...st, updatedAt: new Date().toISOString(), productions: st.productions.map(p => (p.id === cur.id ? nx : p)) };
    });
  }, []);

  const patch = useCallback((key, id, ch) => setProd(p => ({ ...p, [key]: p[key].map(x => (x.id === id ? { ...x, ...(typeof ch === "function" ? ch(x) : ch) } : x)) }), `${key}:${id}`), [setProd]);
  const add = useCallback((key, obj) => setProd(p => ({ ...p, [key]: [...p[key], obj] })), [setProd]);
  const remove = useCallback((key, id) => setProd(p => {
    const n = { ...p, [key]: p[key].filter(x => x.id !== id) };
    if (key === "scenes") {
      n.shots = p.shots.filter(s => s.sceneId !== id);
      n.elements = p.elements.map(e => ({ ...e, sceneIds: e.sceneIds.filter(s => s !== id) }));
      n.days = p.days.map(d => ({ ...d, sceneIds: d.sceneIds.filter(s => s !== id) }));
    }
    if (key === "locations") n.scenes = p.scenes.map(s => (s.locationId === id ? { ...s, locationId: null } : s));
    if (key === "people") n.scenes = p.scenes.map(s => ({ ...s, cast: (s.cast || []).filter(x => x !== id), extraCast: (s.extraCast || []).filter(x => x !== id) }));
    return n;
  }), [setProd]);

  /* ---------- store-level actions ---------- */
  const activate = id => { setStore(st => ({ ...st, activeId: id })); setSel({}); setView("overview"); hist.current = { past: [], future: [], last: 0, id }; };
  const addProduction = (p, jump = true) => { setStore(st => ({ ...st, v: 8, updatedAt: new Date().toISOString(), productions: [...st.productions, p], activeId: jump ? p.id : st.activeId })); setSel({}); setView("overview"); hist.current = { past: [], future: [], last: 0, id: p.id }; };
  const createProduction = (title, opts = {}) => {
    const p = mkProd(title || "Untitled Production");
    p.shootStart = nextWeekday(addDays(todayISO(), 7), 1);
    if (opts.template === "starter") p.script = "FADE IN:\n\nINT. LOCATION - DAY\n\nDescribe what we see.\n\nCHARACTER\nFirst line of dialogue.\n";
    addProduction(p); if (opts.template === "starter") setProd(q => { const d = JSON.parse(JSON.stringify(q)); syncFromScript(d); return d; });
  };
  const createSample = () => addProduction(buildSample(nextWeekday(addDays(todayISO(), 7), 1)));
  const importLegacyData = () => { if (!legacy) return; const p = importLegacy(legacy); p.shootStart = nextWeekday(addDays(todayISO(), 7), 1); addProduction(p); setTimeout(() => setProd(q => { const d = JSON.parse(JSON.stringify(q)); syncFromScript(d); return d; }), 0); toast("Imported your Fathom 7 script, places, people and objects"); };
  const deleteProduction = id => setStore(st => { const left = st.productions.filter(p => p.id !== id); return { ...st, updatedAt: new Date().toISOString(), productions: left, activeId: st.activeId === id ? left[0]?.id || null : st.activeId }; });
  const duplicateProduction = id => setStore(st => { const src = st.productions.find(p => p.id === id); if (!src) return st; const c = JSON.parse(JSON.stringify(src)); c.id = "p" + Date.now().toString(36); c.title += " (copy)"; return { ...st, updatedAt: new Date().toISOString(), productions: [...st.productions, c], activeId: c.id }; });

  const exportBackup = () => { download(`fathom-${slug(prod?.title)}-${todayISO()}.json`, JSON.stringify({ app: "fathom", v: 8, production: prod }, null, 1), "application/json"); };
  const restoreBackup = async file => {
    try {
      const d = JSON.parse(await file.text());
      const p = d.production || (d.productions && d.productions[0]);
      if (!p || !Array.isArray(p.scenes)) throw new Error("not a Fathom backup");
      p.id = "p" + Date.now().toString(36);
      addProduction(p); toast("Backup restored as a new production");
    } catch (e) { toast("That file is not a Fathom backup"); }
  };

  /* ---------- derived ---------- */
  const ix = useMemo(() => (prod ? indexProd(prod) : null), [prod]);
  const issues = useMemo(() => (prod && ix ? validate(prod, ix) : []), [prod, ix]);

  /* ---------- navigation ---------- */
  const go = useCallback(v => { setView(v); }, []);
  const nav = useCallback((type, id, extra) => {
    if (type === "view") { setView(id); return; }
    const v = (extra && extra.view) || SEL_VIEW[type]; if (!v) return;
    setSel(s => ({ ...s, [type]: id, ...(extra || {}) })); setView(v);
  }, []);
  const select = useCallback((type, id) => setSel(s => ({ ...s, [type]: id })), []);

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const h = e => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(p => !p); return; }
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable) return;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [undo, redo]);

  const ctx = { prod, ix, issues, setProd, patch, add, remove, nav, select, sel, go, view, toast, undo, redo, userId, userEmail, onSignOut, save, theme, setTheme, legacy, createSample, importLegacyData, exportBackup, restoreBackup, deleteProduction, duplicateProduction, store };

  /* ---------- no production yet ---------- */
  if (!prod) {
    return (
      <Ctx.Provider value={ctx}>
        <div className="app"><div className="main" style={{ overflow: "auto" }}>
          <Hub onNew={() => setNewProd(true)} onSample={createSample} onLegacy={legacy ? importLegacyData : null} productions={store.productions} onOpen={activate} waiting={userId && !cloudReady} onSignOut={onSignOut} />
        </div>
          {newProd && <NewProd onClose={() => setNewProd(false)} onCreate={(t, o) => { setNewProd(false); createProduction(t, o); }} />}
        </div>
      </Ctx.Provider>
    );
  }

  const View = COMP[view] || Overview;
  const counts = { scenes: prod.scenes.length, locations: prod.locations.length, people: prod.people.length, elements: prod.elements.length, shots: prod.shots.length, schedule: prod.days.length };
  const title = view === "settings" ? "Settings" : VIEWS.find(v => v.k === view)?.l;
  const errs = issues.filter(i => i.level !== "info").length;

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        <aside className={"rail" + (mini ? " mini" : "")}>
          <div className="brand">
            <div className="brand-mark"><Icon n="film" s={17} /></div><span className="brand-txt">FATHOM</span>
            <span style={{ flex: 1 }} />
            <IconBtn icon="menu" title="Collapse sidebar" variant="ghost" size="sm" onClick={() => setMini(!mini)} style={{ color: "var(--rail-tx)" }} />
          </div>
          <div style={{ position: "relative" }}>
            <button className="prod-sw" onClick={() => setProdMenu(!prodMenu)}>
              <Icon n="film" s={16} /><div className="ps-txt"><div className="ps-title">{prod.title}</div><div className="ps-sub">{prod.days.length ? `${prod.days.length} shoot days` : "Pre-production"}</div></div><span className="ps-txt"><Icon n="down" s={14} /></span>
            </button>
            {prodMenu && <Menu onClose={() => setProdMenu(false)} style={{ top: 50, left: 10, right: mini ? undefined : 10, minWidth: 230 }}>
              <div className="cap">Productions</div>
              {store.productions.map(p => <button key={p.id} onClick={() => { setProdMenu(false); activate(p.id); }}><Icon n={p.id === prod.id ? "check" : "film"} s={15} /><span className="ell">{p.title}</span></button>)}
              <div className="sep" />
              <button onClick={() => { setProdMenu(false); setNewProd(true); }}><Icon n="plus" s={15} />New production…</button>
              <button onClick={() => { setProdMenu(false); createSample(); }}><Icon n="wand" s={15} />Load sample production</button>
              {legacy && <button onClick={() => { setProdMenu(false); importLegacyData(); }}><Icon n="upload" s={15} />Import Fathom 7 data</button>}
              <button onClick={() => { setProdMenu(false); duplicateProduction(prod.id); }}><Icon n="dupe" s={15} />Duplicate this production</button>
            </Menu>}
          </div>
          <nav className="nav">
            {VIEWS.map((v, i) => (
              <React.Fragment key={v.k}>
                {v.g && VIEWS[i - 1]?.g !== v.g && <div className="nav-group">{v.g}</div>}
                <button className={"nav-item" + (view === v.k ? " on" : "")} onClick={() => setView(v.k)} title={v.l}>
                  <Icon n={v.i} /><span className="nav-txt">{v.l}</span>
                  {counts[v.k] > 0 && <span className="nav-badge">{counts[v.k]}</span>}
                </button>
              </React.Fragment>
            ))}
            <div className="nav-group">System</div>
            <button className={"nav-item" + (view === "settings" ? " on" : "")} onClick={() => setView("settings")} title="Settings"><Icon n="settings" /><span className="nav-txt">Settings</span></button>
          </nav>
          <div className="rail-foot">
            <span className="savestate rail-foot-txt" title={save.msg || ""}>
              <i className={"dot " + (save.s === "saving" ? "busy" : save.s === "error" || save.s === "toobig" ? "err" : save.s === "saved" ? "ok" : "")} />
              {save.s === "saving" ? "Saving…" : save.s === "saved" ? (userId ? "Synced" : "Saved locally") : save.s === "error" ? "Save problem" : save.s === "toobig" ? "Too big for cloud" : userId ? "Cloud sync on" : "Local mode"}
            </span>
            <IconBtn icon={theme === "dark" ? "sun" : "moon"} title="Toggle theme" size="sm" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} />
            {onSignOut && <IconBtn icon="logout" title="Sign out" size="sm" onClick={onSignOut} />}
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <h1>{title}</h1>
            <span className="sub">{prod.title}{prod.shootStart ? ` · shoots from ${fmtDate(prod.shootStart)}` : ""}</span>
            <span className="sp" />
            {errs > 0 && <Pill tone={issues.some(i => i.level === "error") ? "bad" : "warn"} onClick={() => setView("overview")} title="See what needs attention">{errs} to review</Pill>}
            <IconBtn icon="undo" title="Undo (Ctrl+Z)" onClick={undo} />
            <IconBtn icon="redo" title="Redo" onClick={redo} />
            <button className="cmdk-btn" onClick={() => setPalette(true)}><Icon n="search" s={15} /><span className="t" style={{ flex: 1, textAlign: "left" }}>Jump to anything</span><span className="kbd">Ctrl K</span></button>
          </header>
          <div className="view"><ErrorBoundary key={view + prod.id}><View /></ErrorBoundary></div>
        </div>

        {palette && <Palette onClose={() => setPalette(false)} />}
        {newProd && <NewProd onClose={() => setNewProd(false)} onCreate={(t, o) => { setNewProd(false); createProduction(t, o); }} />}
        {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
      </div>
    </Ctx.Provider>
  );
}

/* ---------------- error boundary ---------------- */
class ErrorBoundary extends React.Component {
  state = { e: null };
  static getDerivedStateFromError(e) { return { e }; }
  render() {
    if (!this.state.e) return this.props.children;
    return <div className="empty" style={{ margin: "auto" }}><Icon n="warn" s={34} /><h3>This view hit a problem</h3><div className="muted">{String(this.state.e.message || this.state.e)}</div><div style={{ marginTop: 12 }}><Btn onClick={() => this.setState({ e: null })}>Try again</Btn></div></div>;
  }
}

/* ---------------- new production dialog ---------------- */
function NewProd({ onClose, onCreate }) {
  const [t, setT] = useState("");
  const [tpl, setTpl] = useState("blank");
  return (
    <Modal title="New production" onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="pri" onClick={() => onCreate(t.trim(), { template: tpl })}>Create</Btn></>}>
      <Txt label="Title" value={t} onChange={setT} placeholder="e.g. Last Call at Meridian" autoFocus onKeyDown={e => e.key === "Enter" && onCreate(t.trim(), { template: tpl })} />
      <div className="chips" style={{ marginTop: 14 }}>
        <button className={"btn " + (tpl === "blank" ? "on" : "")} onClick={() => setTpl("blank")}>Blank</button>
        <button className={"btn " + (tpl === "starter" ? "on" : "")} onClick={() => setTpl("starter")}>With a starter scene</button>
      </div>
      <div className="help">You can paste or import a screenplay afterwards. Fathom reads it and builds the breakdown for you.</div>
    </Modal>
  );
}

/* ---------------- first-run hub ---------------- */
function Hub({ onNew, onSample, onLegacy, productions, onOpen, waiting, onSignOut }) {
  return (
    <div className="hub">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 26 }}>
        <div className="brand-mark" style={{ width: 38, height: 38 }}><Icon n="film" s={22} /></div><b style={{ letterSpacing: ".06em" }}>FATHOM</b>
        <span style={{ flex: 1 }} />{onSignOut && <Btn variant="ghost" icon="logout" onClick={onSignOut}>Sign out</Btn>}
      </div>
      <h1>{waiting ? "Loading your productions…" : "Plan the shoot before you shoot it."}</h1>
      <p className="tx2" style={{ maxWidth: 620, fontSize: 14.5 }}>Fathom turns a script into a production plan: scenes, real-world locations, cast and crew, props, shots, a shooting schedule, and the documents your crew actually reads, all from one source of truth.</p>
      {productions.length > 0 && <div className="card" style={{ marginTop: 18 }}>{productions.map(p => <button key={p.id} className="loc-card" style={{ width: "100%", border: 0, background: "transparent", textAlign: "left" }} onClick={() => onOpen(p.id)}><Icon n="film" /><b>{p.title}</b><span className="muted" style={{ marginLeft: "auto" }}>{p.scenes.length} scenes</span></button>)}</div>}
      <div className="hub-cards">
        <button className="hub-card" onClick={onNew}><Icon n="plus" s={26} style={{ color: "var(--acc)" }} /><h3>Start a production</h3><p>Begin with an empty project, then paste in your script.</p></button>
        <button className="hub-card" onClick={onSample}><Icon n="wand" s={26} style={{ color: "var(--acc)" }} /><h3>Explore a sample</h3><p>A ten-scene short with locations, cast, props, shots and a scheduled shoot, ready to print.</p></button>
        {onLegacy && <button className="hub-card" onClick={onLegacy}><Icon n="upload" s={26} style={{ color: "var(--acc)" }} /><h3>Import Fathom 7 data</h3><p>Bring over your screenplay, places, people and objects from the earlier version.</p></button>}
      </div>
    </div>
  );
}

/* ---------------- command palette ---------------- */
function Palette({ onClose }) {
  const { prod, nav, go } = React.useContext(Ctx);
  const [q, setQ] = useState(""), [i, setI] = useState(0);
  const items = useMemo(() => {
    const out = [];
    VIEWS.forEach(v => out.push({ t: "Go to", l: v.l, f: () => go(v.k), icon: v.i }));
    out.push({ t: "Go to", l: "Settings", f: () => go("settings"), icon: "settings" });
    prod.scenes.forEach(s => out.push({ t: "Scene", l: sceneLabel(s) + " · " + (s.locName || ""), f: () => nav("scene", s.id), icon: "scenes" }));
    prod.locations.forEach(s => out.push({ t: "Location", l: s.name + (s.address ? " · " + s.address : ""), f: () => nav("location", s.id), icon: "location" }));
    prod.people.forEach(s => out.push({ t: s.kind === "cast" ? "Cast" : "Crew", l: [s.role, s.name].filter(Boolean).join(" · "), f: () => nav("person", s.id), icon: "people" }));
    prod.elements.forEach(s => out.push({ t: "Element", l: s.name, f: () => nav("element", s.id), icon: "elements" }));
    [...prod.days].sort((a, b) => a.date.localeCompare(b.date)).forEach((d, n) => out.push({ t: "Day " + (n + 1), l: fmtDate(d.date, true), f: () => nav("day", d.id), icon: "schedule" }));
    return out;
  }, [prod, nav, go]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase(); if (!t) return items.slice(0, 40);
    return items.filter(x => (x.t + " " + x.l).toLowerCase().includes(t)).slice(0, 60);
  }, [items, q]);
  useEffect(() => setI(0), [q]);
  const run = it => { if (!it) return; onClose(); it.f(); };
  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-label="Command palette">
        <input autoFocus placeholder="Jump to a scene, location, person, day or view…" value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === "ArrowDown") { e.preventDefault(); setI(x => Math.min(list.length - 1, x + 1)); } else if (e.key === "ArrowUp") { e.preventDefault(); setI(x => Math.max(0, x - 1)); } else if (e.key === "Enter") run(list[i]); else if (e.key === "Escape") onClose(); }} />
        <div className="palette-list">
          {list.length === 0 && <div className="muted" style={{ padding: 18 }}>No matches</div>}
          {list.map((it, n) => <div key={n} className={"pal-item" + (n === i ? " on" : "")} onMouseEnter={() => setI(n)} onClick={() => run(it)}><span className="t">{it.t}</span><Icon n={it.icon} s={15} /><span className="ell">{it.l}</span></div>)}
        </div>
      </div>
    </div>
  );
}
