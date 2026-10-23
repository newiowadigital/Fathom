import React, { useRef } from "react";
import { useP, Icon, Btn, Txt, Area, Sel, Num, Field } from "../ui";
import { WD } from "../util";

export default function SettingsView() {
  const { prod, setProd, store, save, userId, userEmail, onSignOut, legacy, importLegacyData, exportBackup, restoreBackup, deleteProduction, theme, setTheme } = useP();
  const fileIn = useRef(null);
  const st = prod.settings;
  const set = ch => setProd(p => ({ ...p, ...ch }));
  const sset = ch => setProd(p => ({ ...p, settings: { ...p.settings, ...ch } }));
  const kb = Math.round((save.bytes || JSON.stringify(store).length) / 1024);
  const pct = Math.min(100, Math.round((kb / 960) * 100));

  return (
    <div className="view-main scroll pad">
      <div style={{ maxWidth: 900, display: "grid", gap: 16 }}>
        <div className="card pad">
          <h3 style={{ margin: 0 }}>Production</h3>
          <div className="row"><Txt label="Title" value={prod.title} onChange={v => set({ title: v })} /><Txt label="Company" value={prod.company} onChange={v => set({ company: v })} /></div>
          <div className="row"><Txt label="Director" value={prod.director} onChange={v => set({ director: v })} /><Txt label="Producer" value={prod.producer} onChange={v => set({ producer: v })} /></div>
          <div className="row"><Txt label="Production contact (printed on call sheets)" value={prod.contact} onChange={v => set({ contact: v })} placeholder="Phone or email" /><Txt label="Planned first shoot day" type="date" value={prod.shootStart} onChange={v => set({ shootStart: v })} /></div>
          <Area label="Logline" value={prod.logline} onChange={v => set({ logline: v })} rows={2} />
        </div>

        <div className="card pad">
          <h3 style={{ margin: 0 }}>Scheduling rules</h3>
          <div className="help">These drive timelines, auto-scheduling, conflict checks and call sheets.</div>
          <div className="row"><Num label="Shoot day length (hours)" value={st.dayLenMin / 60} min={4} max={16} step={0.5} onChange={v => sset({ dayLenMin: Math.round((v || 10) * 60) })} /><Num label="Rig before first shot (min)" value={st.firstSetupMin} step={5} onChange={v => sset({ firstSetupMin: v || 0 })} /><Num label="Meal break after (hours)" value={st.mealAfterMin / 60} step={0.5} onChange={v => sset({ mealAfterMin: Math.round((v || 6) * 60) })} /><Num label="Meal length (min)" value={st.mealLenMin} step={5} onChange={v => sset({ mealLenMin: v || 0 })} /></div>
          <div className="row"><Txt label="Day call time" type="time" value={st.dayCall} onChange={v => sset({ dayCall: v })} /><Txt label="Night call time" type="time" value={st.nightCall} onChange={v => sset({ nightCall: v })} /><Num label="Minimum turnaround (hours)" value={st.turnaroundMin / 60} step={0.5} onChange={v => sset({ turnaroundMin: Math.round((v || 10) * 60) })} /><Num label="Cast pickup before set (min)" value={st.makeupLeadMin} step={5} onChange={v => sset({ makeupLeadMin: v || 0 })} /></div>
          <div className="row"><Num label="Minutes per 1/8 page (no shots)" value={st.minPerEighth} min={1} onChange={v => sset({ minPerEighth: v || 15 })} /><Num label="Default minutes per shot" value={st.defaultSetupMin} min={1} onChange={v => sset({ defaultSetupMin: v || 20 })} /><Num label="Company move base (min)" value={st.moveBaseMin} step={5} onChange={v => sset({ moveBaseMin: v || 0 })} /><Num label="Travel speed (km/h)" value={st.moveSpeedKmh} min={5} onChange={v => sset({ moveSpeedKmh: v || 45 })} /></div>
          <Field label="Work week"><div className="chips">{WD.map((w, i) => <button key={w} className="chip click" style={st.workWeek.includes(i) ? { background: "var(--acc)", color: "var(--acc-ink)" } : undefined} onClick={() => sset({ workWeek: st.workWeek.includes(i) ? st.workWeek.filter(x => x !== i) : [...st.workWeek, i].sort() })}>{w}</button>)}</div></Field>
          <div className="row"><Sel label="Distance units" value={st.units} onChange={v => sset({ units: v })} options={[{ k: "km", l: "Kilometres" }, { k: "mi", l: "Miles" }]} />
            <Sel label="Storyboard frame" value={st.aspect || "16:9"} onChange={v => sset({ aspect: v })} options={["16:9", "2.39:1", "1.85:1", "4:3", "1:1", "9:16"]} />
            <Txt label="UTC offset for sunrise/sunset" value={st.utcOffset} onChange={v => sset({ utcOffset: v })} placeholder="Blank = this computer’s zone" hint="Set if you plan the shoot from a different time zone, e.g. -6" /></div>
        </div>

        <div className="card pad">
          <h3 style={{ margin: 0 }}>Safety</h3>
          <div className="help">Printed on every call sheet.</div>
          <div className="row"><Txt label="Nearest hospital" value={st.hospital.name} onChange={v => sset({ hospital: { ...st.hospital, name: v } })} /><Txt label="Address" value={st.hospital.address} onChange={v => sset({ hospital: { ...st.hospital, address: v } })} /><Txt label="Phone" value={st.hospital.phone} onChange={v => sset({ hospital: { ...st.hospital, phone: v } })} /></div>
        </div>

        <div className="card pad">
          <h3 style={{ margin: 0 }}>Data & account</h3>
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Storage used</span><span className="mono">{kb} KB / ~960 KB cloud limit</span></div>
            <div className={"meter" + (pct < 75 ? "" : "")} style={{ marginTop: 6 }}><i style={{ width: pct + "%", background: pct > 85 ? "var(--bad)" : pct > 65 ? "var(--warn)" : "var(--acc)" }} /></div>
            <div className="help">Everything for all your productions is saved as one Firestore document, so photos and sketches are compressed. If you approach the limit, export a backup and remove images you no longer need.</div>
          </div>
          <div className="chips" style={{ marginTop: 14 }}>
            <Btn icon="download" onClick={exportBackup}>Export backup (JSON)</Btn>
            <Btn icon="upload" onClick={() => fileIn.current.click()}>Restore from backup</Btn>
            <input ref={fileIn} type="file" accept=".json,application/json" hidden onChange={e => { const f = e.target.files[0]; if (f) restoreBackup(f); e.target.value = ""; }} />
            {legacy && <Btn icon="upload" onClick={importLegacyData}>Import Fathom 7 data</Btn>}
            <Btn icon={theme === "dark" ? "sun" : "moon"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? "Light" : "Dark"} theme</Btn>
          </div>
          <div className="hr" />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon n="cloud" /><span>{userId ? `Signed in${userEmail ? " as " + userEmail : ""}. Changes sync to the cloud automatically.` : "Local mode: data is stored in this browser only. Configure Firebase (src/firebase.js) to enable accounts and cloud sync."}</span>
            <span style={{ flex: 1 }} />{onSignOut && <Btn icon="logout" onClick={onSignOut}>Sign out</Btn>}
          </div>
          <div className="hr" />
          <Btn variant="ghost" className="btn-danger" icon="trash" onClick={() => { if (window.confirm(`Delete “${prod.title}” permanently? Export a backup first if you might need it.`)) deleteProduction(prod.id); }}>Delete this production</Btn>
        </div>
        <div className="muted" style={{ textAlign: "center", paddingBottom: 20 }}>Fathom 8 · New Iowa Digital · newiowafilms.com</div>
      </div>
    </div>
  );
}
