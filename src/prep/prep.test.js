import { parseScript, parseHeading } from "./script";
import { sampleProduction, indexProd, syncFromScript, mkProd } from "./model";
import { buildSample, autoSchedule, computeDay, sunTimes, validate, dood, metrics } from "./plan";
import { fmtPages, toMin, fmtT, nextWeekday } from "./util";

const TODAY = "2026-11-02"; /* a Monday */

test("heading parser", () => {
  expect(parseHeading("INT. JOE'S DINER - KITCHEN - NIGHT")).toMatchObject({ ie: "INT", locName: "JOE'S DINER - KITCHEN", tod: "NIGHT" });
  expect(parseHeading("EXT. BRIDGE - CONTINUOUS", "DUSK").tod).toBe("DUSK");
  expect(parseHeading("I/E. CAR - DAWN").ie).toBe("INT/EXT");
  expect(parseHeading(".FLASHBACK - THE FARM #12A#").num).toBe("12A");
});

test("script parse finds scenes, characters and pages", () => {
  const { scenes } = parseScript(sampleProduction(TODAY).script);
  expect(scenes).toHaveLength(10);
  expect(scenes[1].chars).toEqual(["RADIO", "MARA"]);
  expect(scenes[3].chars).toContain("WREN");
  expect(scenes[0].tod).toBe("DAWN");
  expect(scenes.every(s => s.eighths >= 1)).toBe(true);
});

test("sync is stable and keeps manual edits", () => {
  const p = sampleProduction(TODAY);
  const n = p.scenes.length;
  p.scenes[2].notes = "keep me";
  const loc = p.locations.length, ppl = p.people.length;
  const r = syncFromScript(p);
  expect(r.added).toBe(0);
  expect(p.scenes).toHaveLength(n);
  expect(p.scenes[2].notes).toBe("keep me");
  expect(p.locations).toHaveLength(loc);
  expect(p.people).toHaveLength(ppl);
  /* Wren resolves through alias, not a duplicate */
  expect(p.people.filter(x => x.role.includes("WREN"))).toHaveLength(1);
  /* removing a scene from the script removes it and its references */
  p.script = p.script.replace(/EXT\. BRIDGE - NIGHT[\s\S]*?CUT TO BLACK\./, "CUT TO BLACK.");
  const r2 = syncFromScript(p);
  expect(r2.removed).toBe(1);
  expect(p.scenes).toHaveLength(n - 1);
  expect(p.shots.every(s => p.scenes.some(x => x.id === s.sceneId))).toBe(true);
});

test("alias mapping puts diner kitchen and parking lot on the diner location", () => {
  const p = sampleProduction(TODAY);
  const diner = p.locations.find(l => l.name === "Meridian Diner");
  const at = p.scenes.filter(s => s.locationId === diner.id).map(s => s.num);
  expect(at).toEqual(["3", "4", "5", "6", "9"]);
});

test("auto-schedule places every scene once, respects cast + night/day split", () => {
  const p = buildSample(TODAY);
  const ix = indexProd(p);
  const all = p.days.flatMap(d => d.sceneIds);
  expect(new Set(all).size).toBe(p.scenes.length);
  expect(all).toHaveLength(p.scenes.length);
  /* Lou blocked on the first day */
  const lou = p.people.find(x => x.role === "LOU");
  const first = ix.days[0];
  expect(first.date >= TODAY).toBe(true);
  p.days.forEach(d => {
    const night = d.sceneIds.map(id => ["NIGHT", "DUSK"].includes(ix.sceneById.get(id).tod));
    expect(night.every(Boolean) || night.every(x => !x)).toBe(true);
  });
  expect(validate(p).filter(i => i.level === "error")).toEqual([]);
  void lou;
});

test("auto-schedule respects blocked dates and groups by location", () => {
  const p = sampleProduction(TODAY);
  p.people.find(x => x.role === "LOU").blocked = [TODAY];
  const out = autoSchedule(p);
  p.days = out.days;
  const ix = indexProd(p);
  const lou = p.people.find(x => x.role === "LOU");
  const d0 = ix.days.find(d => d.date === TODAY);
  const onD0 = d0 ? d0.sceneIds.flatMap(id => ix.sceneCast(ix.sceneById.get(id))) : [];
  expect(onD0).not.toContain(lou.id);
  /* diner scenes shouldn't be scattered over more than 2 days */
  const diner = p.locations.find(l => l.name === "Meridian Diner").id;
  const dinerDays = new Set(p.days.filter(d => d.sceneIds.some(id => ix.sceneById.get(id).locationId === diner)).map(d => d.id));
  expect(dinerDays.size).toBeLessThanOrEqual(2);
});

test("day timeline: meal break inserted, moves costed", () => {
  const p = buildSample(TODAY);
  const ix = indexProd(p);
  const pl = ix.days.map(d => computeDay(p, d, ix));
  pl.forEach(x => { expect(x.wrap).toBeGreaterThan(x.call); x.items.forEach(i => expect(i.end).toBeGreaterThanOrEqual(i.start)); });
  const longDays = pl.filter(x => x.wrap - x.call > 480);
  expect(longDays.every(x => x.items.some(i => i.type === "meal"))).toBe(true);
  expect(metrics(p).scheduled).toBe(p.scenes.length);
});

test("sun times (Des Moines, summer solstice, CDT)", () => {
  const s = sunTimes("2026-06-21", 41.59, -93.62, -5);
  expect(fmtT(s.rise)).toMatch(/^5:[2-4]\d AM$/);
  expect(fmtT(s.set)).toMatch(/^8:[3-5]\d PM$/);
  const w = sunTimes("2026-12-21", 41.59, -93.62, -6);
  expect(fmtT(w.rise)).toMatch(/^7:[3-5]\d AM$/);
});

test("day-out-of-days status codes", () => {
  const p = buildSample(TODAY);
  const d = dood(p);
  d.rows.forEach(r => {
    const worked = r.cells.filter(c => c && c !== "H");
    const ok = worked.length === 0 || (worked.length === 1 ? worked[0] === "SWF" : worked[0] === "SW" && worked[worked.length - 1] === "WF");
    expect(ok).toBe(true);
  });
});

test("utils", () => {
  expect(fmtPages(11)).toBe("1 3/8");
  expect(fmtPages(3)).toBe("3/8");
  expect(toMin("07:30")).toBe(450);
  expect(nextWeekday("2026-10-23", 1)).toBe("2026-10-26");
  expect(mkProd().settings.workWeek).toContain(1);
});

test("reassigning a script set remaps every scene on it and moves the alias", () => {
  const { reassignSet, mergeLocations } = require("./model");
  const p = sampleProduction(TODAY);
  const river = p.locations.find(l => l.name === "River Road");
  const apt = p.locations.find(l => l.name === "Mara's Apartment");
  const n = reassignSet(p, "RIVER ROAD", apt.id);
  expect(n.scenes.filter(s => s.locName === "RIVER ROAD").every(s => s.locationId === apt.id)).toBe(true);
  expect(n.locations.find(l => l.id === river.id).plays).toEqual([]);
  expect(n.locations.find(l => l.id === apt.id).plays).toContain("RIVER ROAD");
  /* a later script sync keeps the mapping */
  syncFromScript(n);
  expect(n.scenes.find(s => s.locName === "RIVER ROAD").locationId).toBe(apt.id);
  /* merging folds scenes, aliases and removes the source */
  const m = mergeLocations(p, river.id, apt.id);
  expect(m.locations.some(l => l.id === river.id)).toBe(false);
  expect(m.scenes.filter(s => s.locName === "RIVER ROAD").every(s => s.locationId === apt.id)).toBe(true);
});
