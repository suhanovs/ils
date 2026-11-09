export function pointLabel(p) {
  const s = String(p.DTG);
  const date = new Date(Date.UTC(+s.slice(0,4), +s.slice(4,6)-1, +s.slice(6,8), +s.slice(8,10)));
  return `${new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(date)} · ${s.slice(8,10)}:00 UTC · ${p.INTENSITY} kt`;
}

export function clampIndex(index, length) { return Math.max(0, Math.min(length - 1, index)); }
