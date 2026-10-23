import { toMin, fromMin, parseISO, addDays, dow, diffDays, haversineKm, hasGeo, fmtDate, fmtT, uniq, sum } from "./util";
import { indexProd, mkDay, LOC_READY, DEPTS, sampleProduction } from "./model";

/* ===================== sun position (NOAA approximation) ===================== */
export function sunTimes(iso, lat, lng, utcOffsetHours) {
  lat = +lat; lng = +lng;
  if (isNaN(lat) || isNaN(lng)) return null;
  const d = parseISO(iso);
  const off = utcOffsetHours === "" || utcOffsetHours == null || isNaN(+utcOffsetHours) ? -d.getTimezoneOffset() / 60 : +utcOffsetHours;
  const rad = Math.PI / 180;
  const jd = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12) / 86400000 + 2440587.5;
  const n = Math.ceil(jd - 2451545.0 + 0.0008);
  const Js = n - lng / 360;
  const M = (357.5291 + 0.98560028 * Js) % 360;
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const Lam = (M + C + 180 + 102.9372) % 360;
  const Jt = 2451545.0 + Js + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * Lam * rad);
  const sinD = Math.sin(Lam * rad) * Math.sin(23.44 * rad);
  const cosD = Math.cos(Math.asin(sinD));
  const cosW = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * sinD) / (Math.cos(lat * rad) * cosD);
  if (cosW > 1) return { polar: "night" };
  if (cosW < -1) return { polar: "day" };
  const w = Math.acos(cosW) / rad;
  const toLocal = J => { const ms = (J - 2440587.5) * 86400000; const m = Math.floor(ms / 60000) + off * 60; return ((m % 1440) + 1440) % 1440; };
  const rise = toLocal(Jt - w / 360), set = toLocal(Jt + w / 360);
  return { rise, set, goldenAM: rise + 60, goldenPM: set - 60, light: set - rise };
}

/* ===================== durations ===================== */
export function sceneMinutes(prod, scene, ix) {
  if (scene.estMin > 0) return scene.estMin;
  const shots = (ix || indexProd(prod)).shotsByScene.get(scene.id) || [];
  if (shots.length) return Math.max(20, sum(shots.map(s => +s.setupMin || prod.settings.defaultSetupMin)));
  return Math.max(30, scene.eighths * prod.settings.minPerEighth);
}
export function moveMinutes(prod, a, b) {
  if (!a || !b || a.id === b.id) return 0;
  const st = prod.settings;
  if (hasGeo(a) && hasGeo(b)) {
    const km = haversineKm({ lat: +a.lat, lng: +a.lng }, { lat: +b.lat, lng: +b.lng });
    return Math.round((st.moveBaseMin + (km / st.moveSpeedKmh) * 60) / 5) * 5;
  }
  return st.moveBaseMin;
}
export function distanceKm(a, b) {
  return hasGeo(a) && hasGeo(b) ? haversineKm({ lat: +a.lat, lng: +a.lng }, { lat: +b.lat, lng: +b.lng }) : null;
}

/* ===================== a day, minute by minute ===================== */
export function computeDay(prod, day, ix) {
  ix = ix || indexProd(prod);
  const st = prod.settings;
  const call = toMin(day.call);
  let t = call + st.firstSetupMin;
  const items = [];
  let lastLoc = null, meal = false, eighths = 0;
  const locs = [];
  const cast = new Map(); /* personId -> {first,last,scenes:[]} */
  day.sceneIds.forEach(id => {
    const s = ix.sceneById.get(id); if (!s) return;
    const loc = s.locationId ? ix.locById.get(s.locationId) : null;
    if (lastLoc && loc && lastLoc.id !== loc.id) {
      const mm = moveMinutes(prod, lastLoc, loc);
      items.push({ type: "move", from: lastLoc, to: loc, start: t, end: t + mm });
      t += mm;
    }
    if (!meal && t - call >= st.mealAfterMin) { items.push({ type: "meal", start: t, end: t + st.mealLenMin }); t += st.mealLenMin; meal = true; }
    const dur = sceneMinutes(prod, s, ix);
    items.push({ type: "scene", scene: s, loc, start: t, end: t + dur, dur });
    ix.sceneCast(s).forEach(pid => {
      const c = cast.get(pid) || { first: t, last: t + dur, scenes: [] };
      c.first = Math.min(c.first, t); c.last = Math.max(c.last, t + dur); c.scenes.push(s);
      cast.set(pid, c);
    });
    t += dur; eighths += s.eighths;
    if (loc && !locs.includes(loc)) locs.push(loc);
    if (loc) lastLoc = loc;
  });
  const target = call + st.dayLenMin;
  return {
    day, items, wrap: t, call, locs, cast, eighths,
    scenes: items.filter(i => i.type === "scene"),
    over: Math.max(0, t - target), moves: items.filter(i => i.type === "move").length,
    sun: locs[0] && hasGeo(locs[0]) ? sunTimes(day.date, locs[0].lat, locs[0].lng, st.utcOffset) : null,
  };
}

/* ===================== auto-schedule ===================== */
const TOD_ORDER = { DAWN: 0, DAY: 1, DUSK: 2, NIGHT: 3 };
const isNight = s => s.tod === "NIGHT" || s.tod === "DUSK";

export function metrics(prod, ix) {
  ix = ix || indexProd(prod);
  const plans = ix.days.map(d => computeDay(prod, d, ix));
  const actorDays = new Map();
  plans.forEach(p => p.cast.forEach((_, pid) => actorDays.set(pid, (actorDays.get(pid) || 0) + 1)));
  const locDays = new Set(); let locVisits = 0;
  plans.forEach(p => { p.locs.forEach(l => locDays.add(l.id + p.day.id)); locVisits += p.locs.length; });
  return {
    days: ix.days.length, moves: sum(plans.map(p => p.moves)), locVisits,
    castDays: sum([...actorDays.entries()].filter(([id]) => ix.personById.get(id)?.kind === "cast").map(e => e[1])),
    overtimeDays: plans.filter(p => p.over > 0).length,
    scheduled: sum(plans.map(p => p.scenes.length)),
  };
}

/* Returns a new `days` array. Locked days and shot scenes are left alone. */
export function autoSchedule(prod, opts = {}) {
  const ix = indexProd(prod);
  const st = prod.settings;
  const keepScheduled = !!opts.onlyUnscheduled;
  const lockedDays = ix.days.filter(d => d.locked || (keepScheduled && d.sceneIds.length));
  const lockedScene = new Set(lockedDays.flatMap(d => d.sceneIds));
  const pool = prod.scenes.filter(s => !lockedScene.has(s.id) && s.status !== "shot");
  if (!pool.length) return { days: prod.days, created: 0, placed: 0 };

  /* groups: one per (location, day/night) — scenes at one place are shot together */
  const order = new Map(prod.scenes.map((s, i) => [s.id, i]));
  const gMap = new Map();
  pool.forEach(s => {
    const k = (s.locationId || "none:" + s.locName) + "|" + (isNight(s) ? "N" : "D");
    if (!gMap.has(k)) gMap.set(k, { key: k, night: isNight(s), scenes: [] });
    gMap.get(k).scenes.push(s);
  });
  const groups = [...gMap.values()];
  groups.forEach(g => {
    g.scenes.sort((a, b) => TOD_ORDER[a.tod] - TOD_ORDER[b.tod] || order.get(a.id) - order.get(b.id));
    g.first = Math.min(...g.scenes.map(s => order.get(s.id)));
    g.minutes = sum(g.scenes.map(s => sceneMinutes(prod, s, ix)));
    g.tight = sum(g.scenes.map(s => ix.sceneCast(s).reduce((n, pid) => n + ((ix.personById.get(pid)?.blocked || []).length ? 1 : 0), 0) + ((ix.locById.get(s.locationId)?.blocked || []).length ? 2 : 0)));
  });
  /* several candidate orderings; the best resulting plan wins */
  const strategies = [
    (a, b) => (a.night - b.night) || a.first - b.first,                       /* story order */
    (a, b) => (a.night - b.night) || b.minutes - a.minutes || a.first - b.first, /* biggest locations first */
    (a, b) => (a.night - b.night) || b.tight - a.tight || a.first - b.first,     /* most constrained first */
    (a, b) => (a.night - b.night) || a.minutes - b.minutes || a.first - b.first, /* small pickups first */
  ];

  const capacity = st.dayLenMin - st.firstSetupMin - st.mealLenMin - 40; /* keep a buffer for revisits and wrap */
  const castBlocked = (s, date) => ix.sceneCast(s).some(pid => (ix.personById.get(pid)?.blocked || []).includes(date));
  const locBlocked = (s, date) => !!(s.locationId && (ix.locById.get(s.locationId)?.blocked || []).includes(date));

  const attempt = cmp => {
    const gs = [...groups].sort(cmp);
    const work = ix.days.map(d => lockedDays.includes(d) ? { ...d, sceneIds: [...d.sceneIds], fixed: true } : { ...d, sceneIds: [], fixed: false });
    const used = new Map(work.map(d => [d.id, d.fixed ? sum(d.sceneIds.map(id => sceneMinutes(prod, ix.sceneById.get(id), ix))) : 0]));
    const kind = new Map();
    work.forEach(d => {
      const ss = d.sceneIds.map(id => ix.sceneById.get(id)).filter(Boolean);
      if (ss.length) kind.set(d.id, ss.some(isNight) ? "N" : "D");
    });
    let created = 0, placed = 0;
    const makeDay = night => {
      const last = work.length ? work.map(d => d.date).sort().pop() : addDays(prod.shootStart || new Date().toISOString().slice(0, 10), -1);
      let date = addDays(last, 1);
      while (!st.workWeek.includes(dow(date))) date = addDays(date, 1);
      const d = { ...mkDay(date, { call: night ? st.nightCall : st.dayCall }), fixed: false, auto: true };
      work.push(d); used.set(d.id, 0); created++;
      return d;
    };
    /* cost of adding a new location to a day: the longest hop from any location already there
       (scenes are re-sorted at the end, so the actual hop order isn't known yet) */
    const moveCost = (d, s) => {
      if (!d.sceneIds.length) return 0;
      const here = ix.locById.get(s.locationId);
      let worst = 0, present = false;
      d.sceneIds.forEach(id => {
        const o = ix.sceneById.get(id);
        if (o.locationId === s.locationId) present = true;
        else worst = Math.max(worst, moveMinutes(prod, ix.locById.get(o.locationId), here) || st.moveBaseMin);
      });
      return present ? 0 : worst;
    };
    const dayOk = (d, want) => !d.fixed && (!kind.get(d.id) || kind.get(d.id) === want) && d.date >= (prod.shootStart || "0000");
    gs.forEach(g => {
      /* keep a whole location together if some day can take all of it */
      const want = g.night ? "N" : "D", total = g.minutes;
      const groupOk = d => g.scenes.every(s => !castBlocked(s, d.date) && !locBlocked(s, d.date));
      let whole = [...work].sort((a, b) => a.date.localeCompare(b.date)).find(d =>
        dayOk(d, want) && groupOk(d) && used.get(d.id) + total + moveCost(d, g.scenes[0]) <= capacity);
      if (!whole && total <= capacity) {
        for (let guard = 0; guard < 60 && !whole; guard++) { const d = makeDay(g.night); if (groupOk(d)) whole = d; else kind.set(d.id, "X"); }
      }
      if (whole) {
        g.scenes.forEach(s => { used.set(whole.id, used.get(whole.id) + sceneMinutes(prod, s, ix) + moveCost(whole, s)); whole.sceneIds.push(s.id); placed++; });
        kind.set(whole.id, want);
        return;
      }
      g.scenes.forEach(s => place(s, g));
    });
    function place(s, g) {
      const dur = sceneMinutes(prod, s, ix), want = g.night ? "N" : "D";
      let target = null;
      for (const d of [...work].sort((a, b) => a.date.localeCompare(b.date))) {
        if (d.fixed) continue;
        const k = kind.get(d.id);
        if (k && k !== want) continue;
        if (castBlocked(s, d.date) || locBlocked(s, d.date)) continue;
        if (d.date < (prod.shootStart || "0000")) continue;
        if (used.get(d.id) + dur + moveCost(d, s) <= capacity || (!d.sceneIds.length && dur > capacity)) { target = d; break; }
      }
      for (let guard = 0; guard < 60 && !target; guard++) {
        const d = makeDay(g.night);
        if (castBlocked(s, d.date) || locBlocked(s, d.date)) { kind.set(d.id, "X"); continue; }
        target = d;
      }
      if (!target) return;
      used.set(target.id, used.get(target.id) + dur + moveCost(target, s));
      target.sceneIds.push(s.id); kind.set(target.id, want); placed++;
    }
    return { work, created, placed };
  };
  const score = r => {
    const trial = { ...prod, days: r.work.filter(d => d.sceneIds.length).map(stripAuto) };
    const m = metrics(trial);
    return m.days * 1000 + m.overtimeDays * 600 + m.locVisits * 60 + m.moves * 25 + m.castDays;
  };
  let best = null, bestScore = Infinity;
  strategies.forEach(cmp => { const r = attempt(cmp); const sc = score(r); if (sc < bestScore) { best = r; bestScore = sc; } });
  const { work, created, placed } = best;

  /* tidy: sort scenes in each auto day by light, then location, then story order; fix call times */
  const round15 = m => Math.round(m / 15) * 15;
  const out = work.filter(d => d.fixed || d.sceneIds.length || !d.auto).map(d => {
    if (d.fixed) return stripAuto(d);
    const ss = d.sceneIds.map(id => ix.sceneById.get(id));
    const locFirst = new Map(); ss.forEach((s, i) => { if (!locFirst.has(s.locationId)) locFirst.set(s.locationId, i); });
    ss.sort((a, b) => (TOD_ORDER[a.tod] - TOD_ORDER[b.tod]) || (locFirst.get(a.locationId) - locFirst.get(b.locationId)) || (order.get(a.id) - order.get(b.id)));
    const next = { ...d, sceneIds: ss.map(s => s.id) };
    const isDefault = d.auto || !d.call || d.call === st.dayCall || d.call === st.nightCall;
    if (ss.length && isDefault) {
      const night = ss.some(isNight), first = ss[0];
      const loc = ix.locById.get(first.locationId) || ix.locById.get(ss.find(s => s.locationId)?.locationId);
      const sun = loc && hasGeo(loc) ? sunTimes(d.date, loc.lat, loc.lng, st.utcOffset) : null;
      let call = night ? toMin(st.nightCall) : toMin(st.dayCall);
      if (sun && sun.rise != null) {
        if (first.tod === "DAWN") call = round15(sun.rise - 20 - st.firstSetupMin);
        else if (first.tod === "DUSK") call = round15(sun.set - 30 - st.firstSetupMin);
        else if (night) call = round15(sun.set - st.firstSetupMin + 30);
      } else if (first.tod === "DAWN") call = toMin("05:00");
      next.call = fromMin(call);
    }
    return stripAuto(next);
  });
  out.sort((a, b) => a.date.localeCompare(b.date));
  return { days: out, created, placed };
}
const stripAuto = d => { const { fixed, auto, ...rest } = d; return rest; };

/* ===================== day-out-of-days ===================== */
export function dood(prod, ix) {
  ix = ix || indexProd(prod);
  const days = ix.days;
  const rows = prod.people.filter(p => p.kind === "cast").map(p => {
    const works = days.map(d => d.sceneIds.some(id => { const s = ix.sceneById.get(id); return s && ix.sceneCast(s).includes(p.id); }));
    const first = works.indexOf(true), last = works.lastIndexOf(true);
    const cells = works.map((w, i) => {
      if (first < 0) return "";
      if (!w) return i > first && i < last ? "H" : "";
      if (first === last) return "SWF";
      return i === first ? "SW" : i === last ? "WF" : "W";
    });
    return { person: p, cells, work: works.filter(Boolean).length, hold: cells.filter(c => c === "H").length };
  });
  return { days, rows };
}

/* ===================== health checks ===================== */
export function validate(prod, ix) {
  ix = ix || indexProd(prod);
  const st = prod.settings;
  const out = [];
  const add = (level, msg, ref) => out.push({ level, msg, ref });
  const plans = ix.days.map(d => computeDay(prod, d, ix));
  plans.forEach((pl, i) => {
    const d = pl.day, lbl = `Day ${i + 1} (${fmtDate(d.date)})`;
    if (pl.over > 0) add("warn", `${lbl} runs ${Math.round(pl.over)} min over the ${Math.round(st.dayLenMin / 60 * 10) / 10}-hour day (wrap ${fmtT(pl.wrap)}).`, { t: "day", id: d.id });
    pl.cast.forEach((_, pid) => { const p = ix.personById.get(pid); if (p && (p.blocked || []).includes(d.date)) add("error", `${p.name || p.role} is unavailable on ${lbl}.`, { t: "day", id: d.id }); });
    pl.locs.forEach(l => {
      if ((l.blocked || []).includes(d.date)) add("error", `${l.name} is unavailable on ${lbl}.`, { t: "day", id: d.id });
      else if (!LOC_READY.has(l.status)) add("warn", `${l.name} is "${l.status}" but is scheduled on ${lbl}.`, { t: "location", id: l.id });
    });
    if (pl.sun && pl.sun.rise != null) {
      pl.scenes.forEach(it => {
        const s = it.scene;
        if (s.tod === "DAY" && (s.ie === "EXT" || s.ie === "INT/EXT") && it.end > pl.sun.set) add("warn", `Scene ${s.num} is an exterior day scene but runs until ${fmtT(it.end)}. Sunset is ${fmtT(pl.sun.set)}.`, { t: "scene", id: s.id });
        if (s.tod === "NIGHT" && (s.ie === "EXT" || s.ie === "INT/EXT") && it.start < pl.sun.set + 20) add("warn", `Scene ${s.num} is an exterior night scene but starts ${fmtT(it.start)} before dark (sunset ${fmtT(pl.sun.set)}).`, { t: "scene", id: s.id });
      });
    }
    const nx = plans[i + 1];
    if (nx) {
      const gap = diffDays(d.date, nx.day.date) * 1440 + nx.call - pl.wrap;
      if (gap < st.turnaroundMin && gap >= 0) add("warn", `Only ${Math.round(gap / 6) / 10} h turnaround between Day ${i + 1} wrap and Day ${i + 2} call (minimum ${st.turnaroundMin / 60} h).`, { t: "day", id: nx.day.id });
    }
  });
  const unsched = prod.scenes.filter(s => !ix.dayOfScene.has(s.id) && s.status !== "shot");
  if (ix.days.length && unsched.length) add("warn", `${unsched.length} scene${unsched.length > 1 ? "s are" : " is"} not scheduled yet (${unsched.slice(0, 6).map(s => s.num).join(", ")}${unsched.length > 6 ? "…" : ""}).`, { t: "view", id: "schedule" });
  const dup = new Map();
  ix.days.forEach(d => d.sceneIds.forEach(id => dup.set(id, (dup.get(id) || 0) + 1)));
  [...dup.entries()].filter(([, n]) => n > 1).forEach(([id]) => add("error", `Scene ${ix.sceneById.get(id)?.num} is scheduled on more than one day.`, { t: "scene", id }));
  const noActor = prod.people.filter(p => p.kind === "cast" && !p.name && (ix.scenesByPerson.get(p.id) || []).length);
  if (noActor.length) add("info", `${noActor.length} speaking role${noActor.length > 1 ? "s have" : " has"} no actor assigned: ${noActor.slice(0, 5).map(p => p.role).join(", ")}${noActor.length > 5 ? "…" : ""}.`, { t: "view", id: "people" });
  const noShots = prod.scenes.filter(s => !(ix.shotsByScene.get(s.id) || []).length);
  if (noShots.length) add("info", `${noShots.length} scene${noShots.length > 1 ? "s have" : " has"} no shot list yet.`, { t: "view", id: "shots" });
  return out;
}

/* ===================== call sheet pieces ===================== */
export function crewCalls(prod, pl) {
  const depOff = Object.fromEntries(DEPTS.map(d => [d.k, d.off]));
  return prod.people.filter(p => p.kind === "crew").map(p => {
    const off = p.callOffset != null && p.callOffset !== "" ? +p.callOffset : (depOff[p.dept] ?? 0);
    return { person: p, call: pl.call + off };
  }).sort((a, b) => a.call - b.call);
}

export function castCalls(prod, pl, ix) {
  return [...pl.cast.entries()].map(([pid, c]) => {
    const person = ix.personById.get(pid);
    const mk = prod.settings.makeupLeadMin;
    return { person, makeup: c.first - mk - 15, set: c.first - 15, first: c.first, wrap: c.last, scenes: c.scenes };
  }).filter(c => c.person).sort((a, b) => a.set - b.set);
}

export { uniq, fromMin };

/* Sample production with a first-pass schedule already applied. */
export function buildSample(today) {
  const p = sampleProduction(today);
  p.days = autoSchedule(p).days;
  return p;
}
