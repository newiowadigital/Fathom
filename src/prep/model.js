import { uid, norm, stripHtml, titleCase } from "./util";
import { parseScript } from "./script";

/* ======================= constants ======================= */
export const CATS = [
  { k: "prop", l: "Props", c: "#e0902b" },
  { k: "wardrobe", l: "Wardrobe", c: "#a78bfa" },
  { k: "makeup", l: "Hair & Makeup", c: "#f472b6" },
  { k: "dressing", l: "Set Dressing", c: "#34d399" },
  { k: "vehicle", l: "Vehicles", c: "#60a5fa" },
  { k: "sfx", l: "Special FX", c: "#f87171" },
  { k: "stunt", l: "Stunts", c: "#fb7185" },
  { k: "animal", l: "Animals", c: "#a3e635" },
  { k: "equipment", l: "Special Equipment", c: "#22d3ee" },
  { k: "sound", l: "Sound / Music", c: "#c084fc" },
  { k: "extras", l: "Background", c: "#fbbf24" },
];
export const CAT = Object.fromEntries(CATS.map(c => [c.k, c]));

export const ELEMENT_STATUS = [
  { k: "needed", l: "Needed" }, { k: "sourcing", l: "Sourcing" },
  { k: "acquired", l: "Acquired" }, { k: "ready", l: "Prepped" },
];
export const LOC_STATUS = [
  { k: "unscouted", l: "Unscouted" }, { k: "scouting", l: "Scouting" },
  { k: "approved", l: "Approved" }, { k: "permitted", l: "Permitted" }, { k: "booked", l: "Booked" },
];
export const LOC_READY = new Set(["approved", "permitted", "booked"]);
export const PERSON_STATUS = [
  { k: "tbd", l: "TBD" }, { k: "offered", l: "Offered" }, { k: "confirmed", l: "Confirmed" },
];
export const SCENE_STATUS = [
  { k: "todo", l: "To shoot" }, { k: "shot", l: "Shot" }, { k: "pickup", l: "Pickup needed" },
];
export const SHOT_STATUS = [
  { k: "planned", l: "Planned" }, { k: "shot", l: "Shot" }, { k: "pickup", l: "Pickup" },
];
export const SHOT_SIZES = ["EWS", "WS", "MWS", "MS", "MCU", "CU", "ECU", "OTS", "POV", "INSERT", "2-SHOT", "ESTAB"];
export const SHOT_ANGLES = ["Eye level", "Low", "High", "Dutch", "Overhead", "Ground"];
export const SHOT_MOVES = ["Static", "Pan", "Tilt", "Dolly", "Track", "Handheld", "Steadicam", "Crane", "Drone", "Zoom", "Slider"];
export const TODS = ["DAY", "DAWN", "DUSK", "NIGHT"];
export const IES = ["INT", "EXT", "INT/EXT"];

export const DEPTS = [
  { k: "Production", off: -30 }, { k: "Direction", off: 0 }, { k: "Camera", off: 0 },
  { k: "Grip & Electric", off: -15 }, { k: "Sound", off: 0 }, { k: "Art", off: -60 },
  { k: "Wardrobe", off: -60 }, { k: "Hair & Makeup", off: -60 }, { k: "Script", off: 0 }, { k: "Other", off: 0 },
];

/* Standard stripboard colours: white INT/day, yellow EXT/day, blue INT/night, green EXT/night */
export const stripKind = s => {
  const night = s.tod === "NIGHT" || s.tod === "DUSK";
  const ext = s.ie === "EXT" || s.ie === "INT/EXT";
  return night ? (ext ? "xn" : "in") : (ext ? "xd" : "id");
};
export const STRIP_LABEL = { id: "INT · Day", xd: "EXT · Day", in: "INT · Night", xn: "EXT · Night" };

/* ======================= factories ======================= */
export const mkSettings = () => ({
  dayLenMin: 600,         // target length of a shoot day
  firstSetupMin: 30,      // rigging before the first shot
  mealAfterMin: 360,      // meal break once this much time has elapsed
  mealLenMin: 45,
  moveBaseMin: 20,        // fixed cost of a company move
  moveSpeedKmh: 45,
  minPerEighth: 15,       // estimate when a scene has no shots: 15 min per 1/8 page
  defaultSetupMin: 20,    // estimate per shot with no explicit setup time
  makeupLeadMin: 60,
  turnaroundMin: 600,     // minimum rest between wrap and next call
  nightCall: "17:00",
  dayCall: "07:00",
  workWeek: [1, 2, 3, 4, 5],
  utcOffset: "",          // blank = this computer's time zone
  hospital: { name: "", address: "", phone: "" },
  units: "km",
});

export const mkProd = (title = "Untitled Production") => ({
  id: uid(), title, director: "", producer: "", company: "", logline: "", contact: "",
  shootStart: "", script: "", settings: mkSettings(),
  scenes: [], locations: [], people: [], elements: [], shots: [], days: [],
  createdAt: new Date().toISOString(),
});

export const mkScene = (o = {}) => ({
  id: uid(), num: "", heading: "", ie: "INT", locName: "", tod: "DAY", locationId: null,
  storyDay: 1, eighths: 8, synopsis: "", notes: "", estMin: 0, status: "todo",
  fromScript: false, scriptIdx: -1, cast: [], extraCast: [], ...o,
});
export const mkLocation = (o = {}) => ({
  id: uid(), name: "New location", plays: [], kind: "practical", status: "unscouted",
  address: "", lat: "", lng: "", contact: "", phone: "", email: "", permit: "", cost: "",
  parking: "", power: "", restrooms: "", notes: "", hours: "", blocked: [], photos: [], ...o,
});
export const mkPerson = (o = {}) => ({
  id: uid(), kind: "cast", name: "", role: "", dept: "", phone: "", email: "",
  status: "tbd", blocked: [], notes: "", callOffset: null, ...o,
});
export const mkElement = (o = {}) => ({
  id: uid(), cat: "prop", name: "New element", status: "needed", sceneIds: [], notes: "", qty: 1, source: "", ...o,
});
export const mkShot = (sceneId, o = {}) => ({
  id: uid(), sceneId, num: "", size: "MS", angle: "Eye level", move: "Static", lens: "35",
  desc: "", equip: "", setupMin: 20, status: "planned", sketch: "", notes: "", ...o,
});
export const mkDay = (date, o = {}) => ({
  id: uid(), date, call: "07:00", sceneIds: [], notes: "", weather: "", locked: false, ...o,
});

/* ======================= derived lookups ======================= */
export function indexProd(p) {
  const sceneById = new Map(p.scenes.map(s => [s.id, s]));
  const locById = new Map(p.locations.map(s => [s.id, s]));
  const personById = new Map(p.people.map(s => [s.id, s]));
  const elById = new Map(p.elements.map(s => [s.id, s]));
  const days = [...p.days].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const dayOfScene = new Map();
  days.forEach((d, i) => d.sceneIds.forEach(id => dayOfScene.set(id, { day: d, n: i + 1 })));
  const shotsByScene = new Map();
  p.shots.forEach(s => { if (!shotsByScene.has(s.sceneId)) shotsByScene.set(s.sceneId, []); shotsByScene.get(s.sceneId).push(s); });
  const elsByScene = new Map();
  p.elements.forEach(e => e.sceneIds.forEach(id => { if (!elsByScene.has(id)) elsByScene.set(id, []); elsByScene.get(id).push(e); }));
  const scenesByLoc = new Map();
  p.scenes.forEach(s => { if (s.locationId) { if (!scenesByLoc.has(s.locationId)) scenesByLoc.set(s.locationId, []); scenesByLoc.get(s.locationId).push(s); } });
  const sceneCast = s => [...new Set([...(s.cast || []), ...(s.extraCast || [])])].filter(id => personById.has(id));
  const scenesByPerson = new Map();
  p.scenes.forEach(s => sceneCast(s).forEach(id => { if (!scenesByPerson.has(id)) scenesByPerson.set(id, []); scenesByPerson.get(id).push(s); }));
  return { sceneById, locById, personById, elById, days, dayOfScene, shotsByScene, elsByScene, scenesByLoc, scenesByPerson, sceneCast };
}

export const sceneLabel = s => `${s.num || "?"}. ${s.heading || "Untitled scene"}`;

/* ======================= legacy (Fathom v7) import ======================= */
export function legacyAvailable(d) {
  if (!d) return false;
  const hasScript = (d.scripts || []).some(s => (s.lines || []).some(l => (l.text || "").trim()));
  const hasNodes = (d.projects || []).some(p => (p.nodes || []).length);
  return hasScript || hasNodes;
}

function linesToFountain(lines) {
  const out = [];
  lines.forEach(l => {
    const t = (l.text || "").trim();
    if (!t) return;
    if (l.type === "sc") { out.push("", t.startsWith(".") || /^(INT|EXT|EST|I\/E)/i.test(t) ? t.toUpperCase() : "." + t.toUpperCase()); out.push(""); }
    else if (l.type === "ch") out.push("", t.toUpperCase());
    else if (l.type === "pa") out.push(/^\(.*\)$/.test(t) ? t : `(${t})`);
    else if (l.type === "di") out.push(t);
    else if (l.type === "tr") out.push("", /TO:$/i.test(t) ? t.toUpperCase() : "> " + t.toUpperCase(), "");
    else out.push("", t);
  });
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

export function importLegacy(d) {
  const p = mkProd("Imported from Fathom 7");
  const sc = (d.scripts || []).find(s => (s.lines || []).some(l => (l.text || "").trim()));
  if (sc) { p.script = linesToFountain(sc.lines); p.title = sc.title || p.title; p.producer = sc.writers ? "" : ""; }
  (d.projects || []).forEach(pr => (pr.nodes || []).forEach(n => {
    const name = (n.label || "").trim(); if (!name) return;
    const note = stripHtml(n.notes || "").slice(0, 500);
    if (n.type === "person") p.people.push(mkPerson({ kind: "cast", role: name, notes: note }));
    else if (n.type === "place") p.locations.push(mkLocation({ name: titleCase(name), notes: note }));
    else if (n.type === "object") p.elements.push(mkElement({ cat: "prop", name, notes: note }));
  }));
  return p;
}

/* ======================= sample production ======================= */
const SAMPLE_SCRIPT = `Title: LAST CALL AT MERIDIAN
Credit: Written by
Author: Sample Production

FADE IN:

EXT. RIVER ROAD - DAWN

Mist hangs low over the water. A rust-eaten PICKUP TRUCK rolls along the empty two-lane road, headlights still on.

INT. PICKUP TRUCK - DAWN

MARA (30s, tired, coffee-stained apron on the passenger seat) grips the wheel. The radio crackles between stations.

RADIO (V.O.)
...bridge closure continues through the weekend. Locals are advised to take Route 9.

MARA
(to herself)
Of course it does.

She switches the radio off. Silence. A faded PHOTOGRAPH of a young couple is tucked in the visor.

INT. MERIDIAN DINER - MORNING

Chairs still upside-down on tables. Mara flips the OPEN SIGN, switches on the neon. The kitchen door swings -- CARL (60s, flour on his forearms) is already inside, frying onions.

CARL
You're late.

MARA
The road's a river again.

CARL
It's always a river.

Mara ties her apron. Carl slides a mug of COFFEE across the pass without looking up.

INT. MERIDIAN DINER - DAY

The lunch rush is a rush of three people. DEPUTY WREN (40s, calm) sits at the counter, hat beside the napkin dispenser.

WREN
Heard Lou's back in town.

Mara's pen stops on the order pad.

MARA
Who told you that?

WREN
Nobody. Everybody.

Wren leaves cash under the plate and exits. Through the window, a dented SEDAN pulls into the lot.

EXT. MERIDIAN DINER PARKING LOT - DAY

LOU (50s, sunglasses, a suit two sizes too big) steps out of the sedan holding a MANILA ENVELOPE. Mara stands in the doorway, arms crossed.

LOU
Still pouring the same bad coffee?

MARA
You said you'd never come back.

LOU
I said a lot of things.

He holds out the envelope. She doesn't take it.

INT. DINER KITCHEN - DAY

Carl scrapes the flat-top, pretending not to listen. Mara storms in, drops the envelope on the steel counter. A pan of grease flares on the burner -- SMOKE rolls up. Carl smothers it with a lid, calm as church.

CARL
That envelope heavy?

MARA
It's paper.

CARL
Heaviest thing there is.

EXT. RIVER ROAD - DUSK

Mara walks the shoulder, envelope in hand, the closed bridge a black line against the orange sky. Headlights sweep past. She doesn't turn.

INT. MARA'S APARTMENT - NIGHT

A small kitchen table under a single lamp. Mara slits the envelope. Inside: a KEY on a loop of red string and a folded NOTE. She reads it twice.

MARA
(whispering)
Meridian Street.

She looks at the PHOTOGRAPH from the visor, now propped against the sugar bowl.

INT. MERIDIAN DINER - NIGHT

Closed. Chairs up. Only the neon hums. Lou sits in the last booth, hat in his lap. Mara unlocks the door, flips the sign to CLOSED but stays inside.

LOU
I didn't know where else.

MARA
Coffee's cold.

LOU
It's always cold.

She slides into the booth across from him and places the KEY between them.

EXT. BRIDGE - NIGHT

The barricaded bridge. Mara and Lou walk to the barrier. Beyond it, the road continues into fog. She hangs the red-string key on the barricade rail. Neither of them speaks.

CUT TO BLACK.
`;

export function sampleProduction(today) {
  const p = mkProd("Last Call at Meridian");
  p.director = "J. Alder"; p.producer = "R. Okafor"; p.company = "Sample Pictures";
  p.logline = "A diner waitress is handed an envelope by the man who left, and has one night to decide what it opens.";
  p.contact = "production@example.com";
  p.script = SAMPLE_SCRIPT;
  p.settings.hospital = { name: "Mercy General (sample)", address: "1111 Hospital Dr", phone: "(515) 555-0100" };
  p.shootStart = today;
  p.settings.utcOffset = -6; /* sample locations are in Iowa (CST) */

  const L = (name, o) => { const l = mkLocation({ name, ...o }); p.locations.push(l); return l; };
  L("Meridian Diner", { plays: ["MERIDIAN DINER", "DINER KITCHEN", "MERIDIAN DINER PARKING LOT"], kind: "practical", status: "permitted", address: "200 Example Ave, Des Moines, IA", lat: 41.5868, lng: -93.6249, contact: "Pat Holloway (owner)", phone: "(515) 555-0142", parking: "Rear lot, 12 spaces + street", power: "200A panel in kitchen; 2 x 20A circuits front", restrooms: "Customer restrooms (2)", hours: "Closed Mondays; available 5 AM to 8 PM", permit: "Location agreement signed", cost: "$900/day", notes: "Kitchen exhaust is loud: record dialogue away from the grill. Neon sign is on a dimmer." });
  L("River Road", { plays: ["RIVER ROAD"], kind: "exterior", status: "approved", address: "River Rd at mile 4, Saylorville, IA", lat: 41.7193, lng: -93.7104, contact: "County Roads Dept", phone: "(515) 555-0177", parking: "Shoulder pullouts, 3 vehicles", power: "None. Generator required.", permit: "County road permit pending", notes: "Fog is best 30 min before sunrise." });
  L("Pickup Truck (Process Rig)", { plays: ["PICKUP TRUCK"], kind: "stage", status: "approved", address: "Picture car garage, 18 Example Ln", lat: 41.6036, lng: -93.6091, contact: "Dale (picture cars)", phone: "(515) 555-0190", notes: "Truck on low-loader with camera tow rig. Shoots on River Road company move." });
  L("Mara's Apartment", { plays: ["MARA'S APARTMENT"], kind: "practical", status: "scouting", address: "850 Example St Apt 3B, Des Moines, IA", lat: 41.5911, lng: -93.6037, contact: "Sam (landlord)", phone: "(515) 555-0123", parking: "Street only. Permit required.", power: "Standard residential", notes: "Third-floor walk-up. Narrow stairs, limit crew to 12." });
  L("Saylorville Bridge", { plays: ["BRIDGE"], kind: "exterior", status: "unscouted", address: "Closed span, Hwy 9, IA", lat: 41.7306, lng: -93.6937, contact: "State DOT film liaison", phone: "(515) 555-0166", permit: "State DOT permit: not started", notes: "Needs lane closure + police detail. Fog machine OK per DOT in principle." });

  const P = (o) => { const x = mkPerson(o); p.people.push(x); return x; };
  const cast = {};
  cast.MARA = P({ kind: "cast", role: "MARA", name: "Dana Ruiz", status: "confirmed", phone: "(515) 555-0201", email: "dana@example.com" });
  cast.CARL = P({ kind: "cast", role: "CARL", name: "Theo Banks", status: "confirmed", phone: "(515) 555-0202", email: "theo@example.com" });
  cast.WREN = P({ kind: "cast", role: "DEPUTY WREN", aliases: ["WREN"], name: "Imani Cole", status: "offered", phone: "(515) 555-0203", email: "imani@example.com" });
  cast.LOU = P({ kind: "cast", role: "LOU", name: "Gus Ferreira", status: "confirmed", phone: "(515) 555-0204", email: "gus@example.com", blocked: [] });
  cast.RADIO = P({ kind: "cast", role: "RADIO", name: "", status: "tbd", notes: "Voice only. Record in post." });
  [
    ["Director", "Direction", "J. Alder"], ["1st AD", "Direction", "Priya Nair"], ["Producer", "Production", "R. Okafor"],
    ["Production Manager", "Production", "Lee Chen"], ["Director of Photography", "Camera", "Mateo Silva"],
    ["1st AC", "Camera", "Ola Brandt"], ["Gaffer", "Grip & Electric", "Jo Kemp"], ["Key Grip", "Grip & Electric", "Rafi Haddad"],
    ["Sound Mixer", "Sound", "Wen Zhao"], ["Production Designer", "Art", "Ines Duarte"], ["Props Master", "Art", "Cal Ortiz"],
    ["Costume Designer", "Wardrobe", "Noor Rahman"], ["Key Makeup", "Hair & Makeup", "Fay Lindqvist"], ["Script Supervisor", "Script", "Ben Ashby"],
  ].forEach(([role, dept, name], i) => P({ kind: "crew", role, dept, name, status: i % 5 === 4 ? "offered" : "confirmed", phone: `(515) 555-03${String(i).padStart(2, "0")}`, email: "" }));

  /* scenes, locations, characters come from the script */
  syncFromScript(p);

  /* elements */
  const sc = n => p.scenes.find(s => s.num === String(n))?.id;
  const E = (cat, name, scenes, status = "needed", extra = {}) => p.elements.push(mkElement({ cat, name, sceneIds: scenes.map(sc).filter(Boolean), status, ...extra }));
  E("prop", "Rusted pickup truck", [1, 2], "acquired", { source: "Picture cars (Dale)" });
  E("prop", "Photograph of young couple", [2, 8], "sourcing", { notes: "Two copies: hero + stand-in. Aged paper." });
  E("prop", "Neon OPEN / CLOSED sign", [3, 9], "acquired");
  E("prop", "Manila envelope", [5, 6, 7, 8], "ready", { qty: 3, notes: "Weighted to feel heavy." });
  E("prop", "Key on red string", [8, 9, 10], "needed", { qty: 2 });
  E("prop", "Mugs + coffee pot", [3, 4, 9], "acquired");
  E("prop", "Order pad + pen", [3, 4], "ready");
  E("wardrobe", "Mara: apron (clean + stained)", [2, 3, 4, 6], "sourcing", { qty: 3 });
  E("wardrobe", "Lou: oversized suit", [5, 9, 10], "needed");
  E("wardrobe", "Deputy uniform + hat", [4], "acquired");
  E("makeup", "Carl: flour on forearms", [3, 6], "ready");
  E("dressing", "Diner booth + counter dressing", [3, 4, 9], "acquired");
  E("sfx", "Grease flare-up + smoke (kitchen)", [6], "needed", { notes: "FX supervisor + fire safety on set. Controlled gas flare." });
  E("sfx", "Fog / mist machine", [1, 10], "sourcing");
  E("vehicle", "Dented sedan (Lou)", [5], "needed");
  E("sound", "Radio broadcast cue", [2], "needed");

  /* shots */
  const S = (n, list) => list.forEach((o, i) => { const id = sc(n); if (id) p.shots.push(mkShot(id, { num: `${n}${String.fromCharCode(65 + i)}`, ...o })); });
  S(1, [
    { size: "EWS", move: "Static", lens: "24", desc: "Truck emerges from the mist, small in frame.", setupMin: 30 },
    { size: "WS", move: "Track", lens: "35", desc: "Tracking alongside the truck, river at left.", equip: "Tow rig", setupMin: 45 },
  ]);
  S(2, [
    { size: "MCU", move: "Static", lens: "50", desc: "Mara at the wheel, hands tight.", setupMin: 25 },
    { size: "INSERT", move: "Static", lens: "85", desc: "Photograph in the visor.", setupMin: 15 },
    { size: "CU", move: "Handheld", lens: "35", desc: "Radio dial, her hand switching it off.", setupMin: 15 },
  ]);
  S(3, [
    { size: "WS", move: "Dolly", lens: "28", desc: "Diner interior, Mara flips OPEN sign. Neon hum.", equip: "Dolly + track", setupMin: 40 },
    { size: "MS", move: "Static", lens: "40", desc: "Carl through the pass window, frying onions.", setupMin: 20 },
    { size: "2-SHOT", move: "Static", lens: "35", desc: "Mara and Carl, 'You're late.'", setupMin: 25 },
  ]);
  S(4, [
    { size: "MS", move: "Static", lens: "40", desc: "Wren at counter.", setupMin: 25 },
    { size: "CU", move: "Static", lens: "75", desc: "Mara's pen stops.", setupMin: 15 },
    { size: "OTS", move: "Static", lens: "50", desc: "Mara over Wren: 'Nobody. Everybody.'", setupMin: 20 },
  ]);
  S(5, [
    { size: "WS", move: "Static", lens: "28", desc: "Lou steps out of the sedan.", setupMin: 30 },
    { size: "2-SHOT", move: "Steadicam", lens: "32", desc: "Face-off at the door.", equip: "Steadicam", setupMin: 35 },
  ]);
  S(6, [
    { size: "MS", move: "Static", lens: "35", desc: "Flat-top, grease flare, Carl's lid.", equip: "FX supervisor", setupMin: 50 },
    { size: "CU", move: "Static", lens: "85", desc: "Envelope on steel counter.", setupMin: 15 },
  ]);
  S(7, [{ size: "WS", move: "Track", lens: "35", desc: "Mara walking, headlights sweeping past.", setupMin: 40 }]);
  S(8, [
    { size: "CU", move: "Slider", lens: "50", desc: "Key and note spilling out.", setupMin: 20 },
    { size: "MCU", move: "Static", lens: "50", desc: "Mara reads it twice.", setupMin: 20 },
  ]);
  S(9, [
    { size: "WS", move: "Static", lens: "24", desc: "Closed diner, Lou alone in the last booth.", setupMin: 35 },
    { size: "INSERT", move: "Static", lens: "85", desc: "Key between them.", setupMin: 15 },
  ]);
  S(10, [{ size: "EWS", move: "Crane", lens: "24", desc: "Final image: key on the barricade rail, fog.", equip: "Jib arm, fog", setupMin: 60 }]);

  /* two cast constraints so the scheduler has something to respect */
  const start = today;
  cast.WREN.blocked = [];
  cast.LOU.notes = "Unavailable the first shoot day (other booking).";
  cast.LOU.blocked = [start];
  p.locations.find(l => l.name === "Meridian Diner").blocked = [];

  return p;
}

/* ===================================================================
 *  Script ⇄ breakdown sync (lives here to avoid a circular import)
 * =================================================================== */

export function syncFromScript(p) {
  const parsed = parseScript(p.script || "");
  const existing = p.scenes;
  const used = new Set();
  const next = [];
  let added = 0, updated = 0;

  /* people (cast) by character */
  const personFor = name => {
    const n = norm(name);
    let x = p.people.find(q => q.kind === "cast" && (norm(q.role) === n || (q.aliases || []).some(a => norm(a) === n)));
    if (!x) { x = mkPerson({ kind: "cast", role: name }); p.people.push(x); }
    return x;
  };
  /* locations by script set name, honouring "plays" aliases */
  const locFor = name => {
    const n = norm(name);
    /* an explicit "plays" mapping wins over a coincidental name match */
    let l = p.locations.find(q => (q.plays || []).some(a => norm(a) === n)) || p.locations.find(q => norm(q.name) === n);
    if (!l) { l = mkLocation({ name: titleCase(name), plays: [name], status: "unscouted" }); p.locations.push(l); }
    else if (!(l.plays || []).some(a => norm(a) === n) && norm(l.name) !== n) l.plays = [...(l.plays || []), name];
    return l;
  };

  parsed.scenes.forEach((ps, i) => {
    const key = norm(ps.heading);
    let m = existing.find(s => s.fromScript && !used.has(s.id) && norm(s.heading) === key);
    if (!m) m = existing.find(s => s.fromScript && !used.has(s.id) && s.scriptIdx === i && !parsed.scenes.some(q => norm(q.heading) === norm(s.heading)));
    const loc = ps.locName ? locFor(ps.locName) : null;
    const castIds = ps.chars.map(c => personFor(c).id);
    if (m) {
      used.add(m.id); updated++;
      const auto = m.synopsis === "" || m.synopsisAuto;
      next.push({
        ...m, heading: ps.heading, ie: ps.ie, locName: ps.locName, tod: ps.tod || m.tod, scriptIdx: i,
        num: m.numLocked ? m.num : (ps.num || String(i + 1)),
        eighths: m.eighthsLocked ? m.eighths : ps.eighths,
        synopsis: auto ? ps.synopsis : m.synopsis, synopsisAuto: auto,
        cast: castIds,
        locationId: m.locationId && p.locations.some(l => l.id === m.locationId) && (m.locationId === loc?.id || m.locationPinned) ? m.locationId : loc?.id || null,
      });
    } else {
      added++;
      next.push(mkScene({
        heading: ps.heading, ie: ps.ie, locName: ps.locName, tod: ps.tod || "DAY", num: ps.num || String(i + 1),
        eighths: ps.eighths, synopsis: ps.synopsis, synopsisAuto: true, cast: castIds, locationId: loc?.id || null,
        fromScript: true, scriptIdx: i,
      }));
    }
  });
  const removed = existing.filter(s => s.fromScript && !used.has(s.id));
  const manual = existing.filter(s => !s.fromScript);
  const all = [...next, ...manual];
  const ids = new Set(all.map(s => s.id));
  p.scenes = all;
  /* scrub references to removed scenes */
  p.shots = p.shots.filter(s => ids.has(s.sceneId));
  p.elements.forEach(e => { e.sceneIds = e.sceneIds.filter(id => ids.has(id)); });
  p.days.forEach(d => { d.sceneIds = d.sceneIds.filter(id => ids.has(id)); });
  return { added, updated, removed: removed.length };
}

/* ===================================================================
 *  Script set ⇄ real location mapping
 * =================================================================== */
export function reassignSet(p, setName, locId, sceneId) {
  const set = norm(setName);
  const locations = p.locations.map(l => {
    const had = l.plays || [];
    let plays = had.filter(a => l.id === locId || norm(a) !== set);
    if (l.id === locId && set && !plays.some(a => norm(a) === set) && norm(l.name) !== set) plays = [...plays, setName];
    return plays.length === had.length && plays.every((a, i) => a === had[i]) ? l : { ...l, plays };
  });
  const scenes = p.scenes.map(s => (s.id === sceneId || (set && norm(s.locName) === set) ? { ...s, locationId: locId || null } : s));
  return { ...p, locations, scenes };
}

export function mergeLocations(p, fromId, toId) {
  const from = p.locations.find(l => l.id === fromId), to = p.locations.find(l => l.id === toId);
  if (!from || !to || fromId === toId) return p;
  const sets = [...new Set([from.name, ...(from.plays || [])])];
  let n = p;
  sets.forEach(s => { n = reassignSet(n, s, toId); });
  n = { ...n, scenes: n.scenes.map(s => (s.locationId === fromId ? { ...s, locationId: toId } : s)) };
  n.locations = n.locations.filter(l => l.id !== fromId).map(l => (l.id === toId ? { ...l, blocked: [...new Set([...(l.blocked || []), ...(from.blocked || [])])], photos: [...(l.photos || []), ...(from.photos || [])].slice(0, 8) } : l));
  return n;
}
