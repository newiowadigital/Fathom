import React, { useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import { useP, Icon, Btn, DropBtn, Chip, Pill, Section } from "../ui";
import { parseScript, sceneIndexAtOffset } from "../script";
import { syncFromScript, mkElement, CATS, stripKind, STRIP_LABEL } from "../model";
import { norm, download, slug, fmtPages } from "../util";
import { personFull } from "./shared";

const clone = o => JSON.parse(JSON.stringify(o));

export default function ScriptView() {
  const { prod, ix, setProd, toast, nav } = useP();
  const [text, setText] = useState(prod.script || "");
  const [cur, setCur] = useState(0);
  const [sel, setSel] = useState(null);
  const ta = useRef(null), stage = useRef(null), fileIn = useRef(null);
  const deferred = useDeferredValue(text);
  const parsed = useMemo(() => parseScript(deferred), [deferred]);

  /* keep local text in step if the production changes underneath us (undo, restore) */
  const lastCommitted = useRef(prod.script);
  useEffect(() => { if (prod.script !== lastCommitted.current) { lastCommitted.current = prod.script; setText(prod.script || ""); } }, [prod.script]);
  useEffect(() => {
    if (text === prod.script) return;
    const t = setTimeout(() => { lastCommitted.current = text; setProd(p => ({ ...p, script: text }), "script"); }, 450);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const e = ta.current; if (!e) return; e.style.height = "auto"; e.style.height = Math.max(e.scrollHeight, 560) + "px"; }, [text]);

  /* what would a sync change? */
  const diff = useMemo(() => {
    const have = prod.scenes.filter(s => s.fromScript).map(s => norm(s.heading));
    const want = parsed.scenes.map(s => norm(s.heading));
    const hs = new Set(have), ws = new Set(want);
    const added = want.filter(h => !hs.has(h)).length, removed = have.filter(h => !ws.has(h)).length;
    const reorder = added === 0 && removed === 0 && have.join("|") !== want.join("|");
    return { added, removed, pending: added + removed > 0 || reorder || have.length !== want.length };
  }, [prod.scenes, parsed]);

  const sceneFor = idx => {
    const ps = parsed.scenes[idx]; if (!ps) return null;
    return prod.scenes.find(s => s.fromScript && norm(s.heading) === norm(ps.heading)) || prod.scenes.find(s => s.fromScript && s.scriptIdx === idx) || null;
  };
  const curScene = sceneFor(cur);

  const track = () => {
    const e = ta.current; if (!e) return;
    setCur(Math.max(0, sceneIndexAtOffset(e.value, e.selectionStart)));
    setSel(e.selectionEnd - e.selectionStart >= 2 && e.selectionEnd - e.selectionStart <= 60 && !/\n/.test(e.value.slice(e.selectionStart, e.selectionEnd)) ? { s: e.selectionStart, e: e.selectionEnd } : null);
  };

  const sync = () => {
    const d = clone(prod); d.script = text; lastCommitted.current = text;
    const r = syncFromScript(d);
    setProd(d);
    toast(`Breakdown updated: ${r.added} new, ${r.updated} kept, ${r.removed} removed`);
  };

  const tag = cat => {
    if (!sel) return;
    const name = text.slice(sel.s, sel.e).trim().replace(/\s+/g, " ");
    const idx = sceneIndexAtOffset(text, sel.s);
    const d = clone(prod); d.script = text; lastCommitted.current = text;
    if (!d.scenes.some(s => s.fromScript && s.scriptIdx === idx)) syncFromScript(d);
    const ps = parseScript(text).scenes[idx];
    const scene = ps && (d.scenes.find(s => s.fromScript && norm(s.heading) === norm(ps.heading)));
    if (!scene) return toast("Place the cursor inside a scene first");
    let el = d.elements.find(e => e.cat === cat && norm(e.name) === norm(name));
    if (el) { if (!el.sceneIds.includes(scene.id)) el.sceneIds.push(scene.id); }
    else d.elements.push(mkElement({ cat, name, sceneIds: [scene.id] }));
    setProd(d); setSel(null);
    toast(`Tagged "${name}" as ${CATS.find(c => c.k === cat).l.toLowerCase()} in scene ${scene.num}`);
  };

  const jump = i => {
    const lines = text.replace(/\r/g, "").split("\n");
    const ln = parsed.scenes[i]?.startLine ?? 0;
    let off = 0; for (let k = 0; k < ln; k++) off += lines[k].length + 1;
    const e = ta.current; e.focus(); e.setSelectionRange(off, off + lines[ln].length);
    stage.current.scrollTop = Math.max(0, e.offsetTop + ln * 21 - 120);
    setCur(i); setSel(null);
  };

  const insert = s => {
    const e = ta.current; const a = e.selectionStart, b = e.selectionEnd;
    const pre = text.slice(0, a), needNl = pre && !pre.endsWith("\n\n") ? (pre.endsWith("\n") ? "\n" : "\n\n") : "";
    const next = pre + needNl + s + text.slice(b);
    setText(next);
    requestAnimationFrame(() => { e.focus(); const p = (pre + needNl + s).length; e.setSelectionRange(p, p); track(); });
  };

  const onFile = async f => {
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) return toast("That file is larger than 2 MB");
    const t = (await f.text()).replace(/\r\n?/g, "\n");
    if (text.trim() && !window.confirm("Replace the current script with this file?")) return;
    setText(t); toast(`Imported ${f.name}`);
  };

  const pages = parsed.scenes.reduce((a, s) => a + s.eighths, 0);
  const tc = ix.sceneById;
  void tc;

  return (
    <>
      <div className="view-main">
        <div className="toolbar">
          <Btn icon="upload" onClick={() => fileIn.current.click()}>Import</Btn>
          <input ref={fileIn} type="file" accept=".fountain,.txt,.md,text/plain" hidden onChange={e => { onFile(e.target.files[0]); e.target.value = ""; }} />
          <Btn icon="download" onClick={() => download(`${slug(prod.title)}.fountain`, text)}>Export .fountain</Btn>
          <DropBtn icon="plus" label="Insert" items={[
            { cap: "Scene heading" },
            ...["INT. LOCATION - DAY", "EXT. LOCATION - DAY", "INT. LOCATION - NIGHT", "EXT. LOCATION - NIGHT", "EXT. LOCATION - DAWN", "EXT. LOCATION - DUSK"].map(h => ({ label: h, onClick: () => insert(h + "\n\n") })),
            { sep: true }, { cap: "Dialogue" }, { label: "Character + line", onClick: () => insert("CHARACTER\nDialogue goes here.\n") },
          ]} />
          <span className="sp" />
          <span className="muted mono">{parsed.scenes.length} scenes · {fmtPages(pages)} pp · ~{Math.round(pages / 8)} min</span>
          {diff.pending
            ? <Btn variant="pri" icon="wand" onClick={sync}>Update breakdown{diff.added || diff.removed ? ` (+${diff.added} / −${diff.removed})` : ""}</Btn>
            : <Pill tone="ok"><Icon n="check" s={13} />Breakdown in sync</Pill>}
        </div>
        <div className="script-wrap">
          <div className="script-index">
            {parsed.scenes.length === 0 && <div className="muted" style={{ padding: 18 }}>Scene headings (INT. / EXT.) will appear here as you write.</div>}
            {parsed.scenes.map((s, i) => {
              const sc = sceneFor(i), kind = stripKind({ ie: s.ie, tod: s.tod });
              return (
                <div key={i} className={"si-item" + (cur === i ? " on" : "")} onClick={() => jump(i)}>
                  <span className="si-num">{sc?.num || s.num || i + 1}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="ell" style={{ fontWeight: 600 }}><i className={"kdot " + kind} style={{ marginRight: 6 }} />{s.locName || "—"}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>{s.ie} · {s.tod} · {fmtPages(s.eighths)} pg{s.chars.length ? ` · ${s.chars.length} speaking` : ""}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="script-stage" ref={stage}>
            <div className="script-page">
              {sel && (
                <div className="tagbar">
                  <Icon n="tag" s={15} /><span>Tag</span><b>“{text.slice(sel.s, sel.e)}”</b><span>as</span>
                  {CATS.slice(0, 8).map(c => <button key={c.k} style={{ background: c.c }} onMouseDown={e => e.preventDefault()} onClick={() => tag(c.k)}>{c.l}</button>)}
                </div>
              )}
              <textarea ref={ta} className="script-ta" spellCheck="false" value={text} onChange={e => { setText(e.target.value); }} onSelect={track} onKeyUp={track} onClick={track}
                placeholder={"Paste or write your screenplay here.\n\nFathom understands Fountain-style formatting:\n\nINT. MERIDIAN DINER - DAY\n\nMara flips the OPEN sign.\n\nMARA\nYou're late.\n"} />
            </div>
          </div>
          <aside className="insp script-ctx" style={{ width: 300 }}>
            <div className="insp-head"><h2>Scene context</h2></div>
            <div className="insp-body">
              {!parsed.scenes[cur] && <div className="muted" style={{ paddingTop: 16 }}>Click into a scene to see how it connects to your locations, cast, elements and shots.</div>}
              {parsed.scenes[cur] && (() => {
                const ps = parsed.scenes[cur];
                const cast = curScene ? ix.sceneCast(curScene).map(id => ix.personById.get(id)) : [];
                const loc = curScene?.locationId ? ix.locById.get(curScene.locationId) : null;
                const els = curScene ? ix.elsByScene.get(curScene.id) || [] : [];
                const shots = curScene ? ix.shotsByScene.get(curScene.id) || [] : [];
                const day = curScene ? ix.dayOfScene.get(curScene.id) : null;
                return (
                  <>
                    <div style={{ marginTop: 14, fontWeight: 700, fontSize: 15 }}>{ps.heading}</div>
                    <div className="chips" style={{ marginTop: 8 }}><Pill tone="mute">{STRIP_LABEL[stripKind({ ie: ps.ie, tod: ps.tod })]}</Pill><Pill tone="mute">{fmtPages(ps.eighths)} pg</Pill>{day && <Pill tone="acc">Day {day.n}</Pill>}</div>
                    {!curScene && <div className="help" style={{ marginTop: 10 }}>This scene isn’t in the breakdown yet. Choose <b>Update breakdown</b>.</div>}
                    {curScene && <>
                      <Section title="Shoots at">{loc ? <Chip onClick={() => nav("location", loc.id)}>{loc.name}</Chip> : <span className="muted">No location</span>}</Section>
                      <Section title={`Cast (${cast.length})`}><div className="chips">{cast.length ? cast.map(p => <Chip key={p.id} onClick={() => nav("person", p.id)}>{personFull(p)}</Chip>) : <span className="muted">No speaking roles</span>}</div></Section>
                      <Section title={`Elements (${els.length})`}><div className="chips">{els.length ? els.map(e => <Chip key={e.id} color={CATS.find(c => c.k === e.cat)?.c} onClick={() => nav("element", e.id)}>{e.name}</Chip>) : <span className="muted">Select text in the script to tag props, wardrobe and more.</span>}</div></Section>
                      <Section title={`Shots (${shots.length})`}><span className="muted">{shots.length ? shots.map(s => s.size).join(" · ") : "No shots planned"}</span></Section>
                      <div style={{ marginTop: 18 }}><Btn icon="scenes" onClick={() => nav("scene", curScene.id)}>Open in breakdown</Btn></div>
                    </>}
                  </>
                );
              })()}
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
