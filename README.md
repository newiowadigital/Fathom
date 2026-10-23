# Fathom: pre-production for filmmakers

Fathom turns a script into a production plan and the documents a crew actually reads. One source of truth feeds everything:

```
Script ─► Scenes ─► Locations · Cast · Elements ─► Shots ─► Schedule ─► Call sheets & reports
```

## What's inside

| Area | What it does |
| --- | --- |
| **Overview** | Readiness meters, next shoot day (with sunrise/sunset), shoot-arc chart, conflict list, and a call-sheet readiness checklist. |
| **Script** | Fountain-style editor. Scenes, locations, time of day, speaking roles and page lengths are detected as you write. Select text and tag it as a prop, wardrobe, vehicle, effect, etc. |
| **Breakdown** | Table, *story-day swimlanes*, and a proportional script ribbon colour-coded by INT/EXT and day/night. Everything about a scene lives in its inspector. |
| **Locations** | Map each script set to a real place. One location can play several sets. Scouting status, address/coordinates, contacts, permits, parking/power, photos, blocked dates, an offline pin map with route overlay and a travel-time matrix. |
| **Cast & Crew** | Characters are created from the script. Contact info, availability, department call offsets. |
| **Elements** | Props, wardrobe, vehicles, FX and more, as a list or a status kanban (Needed → Sourcing → Acquired → Prepped). |
| **Shot List** | Shots per scene with size/angle/movement/lens/setup time, coverage templates, drag-to-reorder, and a built-in sketch pad for storyboard frames. |
| **Schedule** | Drag-and-drop stripboard, calendar (shows unavailable people/locations), and a day timeline with daylight bands and every actor's hours. **Auto-schedule** groups by location, separates day and night, puts dusk with night, sets call times from sunrise/sunset, and respects availability. |
| **Documents** | Call sheet, shot list, shooting schedule (stripboard report), one-liner, day-out-of-days, breakdown sheets, props lists, storyboard, cast/crew lists, location sheet, and a full **Production Book**. Print / Save as PDF, HTML or CSV. |

Also: a command palette (`Ctrl/⌘ K`), undo/redo (`Ctrl/⌘ Z`), light/dark theme, backups, and an importer for Fathom 7 data.

## How the data flows

- The **script** is the source for scenes, speaking roles and set names. *Update breakdown* merges changes without losing anything you edited by hand (locations, notes, tags, shots, schedule).
- A **script set** (e.g. `MERIDIAN DINER PARKING LOT`) maps to a **real location**. Reassigning a scene remembers the mapping, so later script edits keep working.
- **Shots**, **elements** and **cast** feed scene duration. The scheduler and every document read the same numbers.
- **Sunrise/sunset** is computed offline from location coordinates (NOAA algorithm), using this computer's time zone unless a UTC offset is set in Settings.
- Estimates: a scene takes the sum of its shots' setup times, else its explicit override, else 15 min per 1/8 page. All rules are editable in Settings.

## Running it

```bash
npm install
npm start          # http://localhost:3000
npm test           # unit tests for the parser, sync, scheduler and planner
npm run build
```

**Local mode:** while `src/firebase.js` still contains the `YOUR_...` placeholders, Fathom runs without sign-in and stores data in the browser.

**Cloud mode:** fill in your Firebase config (see `Fathom-Deployment-Guide.docx`). Data is stored in the existing `users/{uid}` document under a new `prep` field. Your Firestore rules do not need to change, and legacy `projects`/`scripts`/`sbP` fields are left untouched. Firestore documents are limited to 1 MB, so photos and sketches are compressed and Settings shows a storage meter.

## Code map

```
src/prep/
  Fathom.jsx     app shell, state, undo, local + cloud persistence, command palette
  model.js       data model, factories, sample production, script→breakdown sync, legacy import
  script.js      Fountain parser (scenes, characters, pages)
  plan.js        timelines, sunrise/sunset, auto-scheduler, day-out-of-days, conflict checks
  docs.jsx       every printable document + CSV exports
  ui.jsx         icons and shared components
  fathom.css     design system
  views/         Overview, Script, Scenes, Locations, People, Elements, Shots, Schedule, Docs, Settings
```
