/* Fountain-flavoured screenplay parser.
 * Produces scenes with the facts a breakdown needs: INT/EXT, location, time of day,
 * speaking characters, a page-length estimate (in eighths) and an auto synopsis. */

const HEADING = /^\s*(\.(?!\.)|(INT\.?\/EXT\.?|I\/E|INT|EXT|EST)(\.|\s))/i;
const TOD_MAP = {
  DAY: "DAY", MORNING: "DAY", AFTERNOON: "DAY", NOON: "DAY", MIDDAY: "DAY", EARLY: "DAY",
  NIGHT: "NIGHT", EVENING: "DUSK", DUSK: "DUSK", SUNSET: "DUSK", TWILIGHT: "DUSK",
  DAWN: "DAWN", SUNRISE: "DAWN", "GOLDEN HOUR": "DUSK",
};
const INHERIT = /^(CONTINUOUS|LATER|SAME|MOMENTS LATER|SAME TIME|CONT'D|CONT)$/i;
const TRANSITION = /^(>.*|[A-Z0-9 .'-]+ TO:)$/;

export const isHeading = l => HEADING.test(l);

export function parseHeading(raw, prevTod) {
  let h = raw.trim().replace(/^\./, "").trim();
  let num = "";
  const nm = h.match(/\s#([A-Za-z0-9.-]+)#\s*$/);
  if (nm) { num = nm[1]; h = h.slice(0, nm.index).trim(); }
  let ie = "INT";
  const m = h.match(/^(INT\.?\/EXT\.?|I\/E\.?|INT\.?|EXT\.?|EST\.?)\s*/i);
  if (m) {
    const t = m[1].toUpperCase().replace(/\./g, "");
    ie = t.includes("/") || t === "IE" ? "INT/EXT" : t === "INT" ? "INT" : "EXT";
    h = h.slice(m[0].length);
  }
  const parts = h.split(/\s+[-–—]\s+/);
  let tod = null;
  if (parts.length > 1) {
    const last = parts[parts.length - 1].trim().toUpperCase();
    if (TOD_MAP[last]) { tod = TOD_MAP[last]; parts.pop(); }
    else if (INHERIT.test(last)) { tod = prevTod || "DAY"; parts.pop(); }
  }
  const locName = parts.join(" - ").trim().toUpperCase().replace(/\s{2,}/g, " ");
  return { ie, locName, tod: tod || prevTod || "DAY", num };
}

const eighthsFor = lines => Math.max(1, Math.ceil(lines * 8 / 54));

export function parseScript(text) {
  const raw = (text || "").replace(/\r/g, "").split("\n");
  /* drop the title page (Key: value lines at the top) */
  let i = 0;
  while (i < raw.length && (/^[A-Za-z ]+:/.test(raw[i]) || (/^\s+\S/.test(raw[i]) && i > 0 && /^[A-Za-z ]+:/.test(raw[i - 1])) || raw[i].trim() === "")) i++;
  const scenes = [];
  let cur = null, prevTod = "DAY";
  const finish = () => {
    if (!cur) return;
    cur.chars = [...cur.charSet];
    cur.eighths = eighthsFor(cur.lineCount);
    const act = cur.actions.join(" ").replace(/\s+/g, " ").trim();
    cur.synopsis = act.length > 150 ? act.slice(0, 147).replace(/\s+\S*$/, "") + "…" : act;
    scenes.push(cur);
  };
  for (let k = i; k < raw.length; k++) {
    const line = raw[k], t = line.trim();
    if (HEADING.test(line) && t.length > 3 && (k === 0 || raw[k - 1].trim() === "" || k === i)) {
      finish();
      const ph = parseHeading(t, prevTod);
      prevTod = ph.tod;
      cur = { heading: t.replace(/^\./, "").replace(/\s#[A-Za-z0-9.-]+#\s*$/, "").toUpperCase(), ...ph, charSet: new Set(), actions: [], lineCount: 2, startLine: k, endLine: k };
      continue;
    }
    if (!cur) continue;
    cur.endLine = k;
    if (!t) { cur.lineCount += 0.5; continue; }
    const prevBlank = k === 0 || raw[k - 1].trim() === "";
    const nextHas = k + 1 < raw.length && raw[k + 1].trim() !== "";
    const isChar = (prevBlank && nextHas && t.length <= 40 && t === t.toUpperCase() && /[A-Z]/.test(t) && !TRANSITION.test(t) && !/^\(/.test(t)) || (t.startsWith("@") && prevBlank);
    if (isChar) {
      const name = t.replace(/^@/, "").replace(/\s*\(.*?\)\s*/g, " ").replace(/\^$/, "").trim().toUpperCase();
      if (name) cur.charSet.add(name);
      cur.lineCount += 1;
      /* consume the dialogue block */
      let j = k + 1;
      while (j < raw.length && raw[j].trim() !== "") {
        const d = raw[j].trim();
        cur.lineCount += /^\(/.test(d) ? 1 : Math.max(1, Math.ceil(d.length / 35));
        j++;
      }
      k = j - 1; cur.endLine = k;
      continue;
    }
    if (TRANSITION.test(t)) { cur.lineCount += 1; continue; }
    cur.actions.push(t);
    cur.lineCount += Math.max(1, Math.ceil(t.length / 60));
  }
  finish();
  return { scenes };
}

/* Return the scene index containing a given character offset (for "tag selection" in the editor). */
export function sceneIndexAtOffset(text, offset) {
  const before = text.slice(0, offset).replace(/\r/g, "").split("\n");
  const lineNo = before.length - 1;
  const { scenes } = parseScript(text);
  let idx = -1;
  scenes.forEach((s, n) => { if (s.startLine <= lineNo) idx = n; });
  return idx;
}

/* Text of every scene, keyed by index (used for scene previews & breakdown sheets). */
export function sceneTexts(text) {
  const raw = (text || "").replace(/\r/g, "").split("\n");
  const { scenes } = parseScript(text);
  return scenes.map((s, n) => {
    const end = n + 1 < scenes.length ? scenes[n + 1].startLine : raw.length;
    return raw.slice(s.startLine, end).join("\n").trim();
  });
}
