import React from "react";
import { stripKind, STRIP_LABEL, CAT } from "../model";
import { Chip } from "../ui";
import { fmtPages } from "../util";

export const KDot = ({ scene }) => <i className={"kdot " + stripKind(scene)} title={STRIP_LABEL[stripKind(scene)]} />;
export const personLabel = p => (p.kind === "cast" ? (p.role || p.name || "Unnamed") : (p.role || p.name || "Unnamed"));
export const personFull = p => (p.name && p.role ? `${p.role} (${p.name})` : p.name || p.role || "Unnamed");
export const shortHeading = s => `${s.ie}. ${s.locName || "—"} – ${s.tod}`;

export function SceneChip({ scene, onClick }) {
  return <Chip onClick={onClick} title={shortHeading(scene)}><KDot scene={scene} /><b className="mono">{scene.num}</b>&nbsp;{(scene.locName || "").toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase())}</Chip>;
}

export function Split({ main, insp }) {
  return <>{main}{insp}</>;
}

export function Inspector({ children }) {
  return <aside className="insp">{children}</aside>;
}

/* With nothing selected the workspace takes the full width; the inspector slides in on selection. */
export function NoSelection() { return null; }

export const catColor = k => CAT[k]?.c;
export { fmtPages };

export function Stat({ v, l }) {
  return <div className="stat"><div className="v">{v}</div><div className="l">{l}</div></div>;
}

export const todIcon = t => (t === "NIGHT" ? "moon" : t === "DAY" ? "sun" : "sun");
export function TodBadge({ tod }) {
  const tone = tod === "NIGHT" ? "info" : tod === "DAY" ? "warn" : "acc";
  return <span className={"pill " + tone} style={{ fontSize: 10 }}>{tod}</span>;
}
