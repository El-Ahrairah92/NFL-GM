'use strict';
// =====================================================================
//  DEPTH CHART — your team's lineup by slot, package overrides, rotation shares
//  t.dch = { auto: {off, def, st}, lists: {KEY: [pid, ...]}, rot: {KEY: share} }
//  Units on auto follow the staff (best available by the engine's own read). Listed backups take
//  practice reps at that spot every week, which builds positional comfort.
// =====================================================================
const CHART_SECTIONS = [
  { unit: 'off', title: 'Offense', rows: [
    ['QB', 'Quarterback'], ['RB', 'Running back'], ['X', 'X receiver'], ['Z', 'Z receiver'], ['SLOT', 'Slot receiver'], ['Y', 'Tight end (Y)'], ['H', 'Tight end (H)'],
    ['LT', 'Left tackle'], ['LG', 'Left guard'], ['C', 'Center'], ['RG', 'Right guard'], ['RT', 'Right tackle'],
    ['FB', 'Fullback (21/22)'], ['SLOT2', '4th receiver (10 pers.)'], ['Y2', '3rd tight end (13)'], ['OL6', '6th lineman (jumbo)'],
  ] },
  { unit: 'def', title: 'Defense', rows: [
    ['EDGE1', 'Edge (left)'], ['EDGE2', 'Edge (right)'], ['IDL1', 'Interior DL'], ['IDL2', 'Interior DL'], ['NT', 'Nose / base interior'],
    ['MLB', 'Middle LB'], ['WLB', 'Weak-side LB'], ['SAM', 'Strong-side LB (base)'], ['CB1', 'Corner'], ['CB2', 'Corner'], ['NCB', 'Nickel corner'], ['DIME', 'Dime back'], ['FS', 'Free safety'], ['SS', 'Strong safety'],
  ] },
  { unit: 'off', title: 'Offensive packages', pkg: true, rows: [['RB3D', 'Passing-down back (3rd & long, 2-minute)'], ['RBSY', 'Short-yardage / goal-line back']] },
  { unit: 'def', title: 'Defensive packages', pkg: true, rows: [['RUSH', 'Pass-rush unit (passing downs: top 4 rush)']] },
  { unit: 'st', title: 'Special teams', rows: [['K', 'Kicker'], ['P', 'Punter'], ['KR', 'Returner']] },
];
const CHART_DEPTH = { RUSH: 4, RB3D: 2, RBSY: 2, K: 1, P: 1, KR: 2 };
const ROT_KEYS = new Set(['RB', 'X', 'Z', 'SLOT', 'Y', 'H', 'EDGE1', 'EDGE2', 'IDL1', 'IDL2', 'NT', 'MLB', 'WLB', 'CB1', 'CB2', 'NCB', 'FS', 'SS']);
const ROT_OPTS = [[0, 'Starter plays'], [0.1, 'Spell (10%)'], [0.2, 'Light (20%)'], [0.35, 'Split (35%)'], [0.5, 'Even (50%)']];

// the staff's recommended chart (they know who's really better)
function defaultChart(tid) {
  const ro = rosterOf(tid).filter(p => p.a && !onIR(p));
  const lists = {}, starters = { off: new Set(), def: new Set(), st: new Set() };
  for (const sec of CHART_SECTIONS) for (const [key] of sec.rows) {
    const spot = CHART_SPOT[key], n = CHART_DEPTH[key] || 3;
    const ranked = ro.filter(p => SPOTS[p.spot].side === SPOTS[spot].side || key === 'KR').map(p => [p, key === 'KR' ? returnScore(p) : slotRating(p, spot)])
      .sort((a, b) => b[1] - a[1]).map(x => x[0]);
    if (!ranked.length) { lists[key] = []; continue; }
    // starters are unique within a unit (packages may reuse anyone)
    const first = sec.pkg ? ranked[0] : ranked.find(p => !starters[sec.unit].has(p.id)) || ranked[0];
    if (!sec.pkg) starters[sec.unit].add(first.id);
    lists[key] = [first, ...ranked.filter(p => p !== first)].slice(0, n).map(p => p.id);
  }
  return lists;
}
function returnScore(p) { if (!['RB', 'WRX', 'WRZ', 'SLOT', 'CB', 'NCB', 'FS', 'SS'].includes(p.spot)) return -1e9; return p.a.spd * 0.3 + p.a.bur * 0.2 + (p.a.elu || 30) * 0.25 + (p.a.vis || 30) * 0.15 + (p.a.bsec || 50) * 0.1 - (p.ovr >= 80 ? 6 : 0); }
function ensureChart(tid) {
  const t = T(tid);
  if (!t.dch) t.dch = { auto: { off: true, def: true, st: true }, lists: defaultChart(tid), rot: { RB: 0.2 } };
  return t.dch;
}
// units on auto are refreshed from the staff; manual units drop players who left
function refreshChart(tid) {
  const c = ensureChart(tid), def = defaultChart(tid);
  const mine = new Set(rosterOf(tid).map(p => p.id));
  for (const sec of CHART_SECTIONS) for (const [key] of sec.rows) {
    if (c.auto[sec.unit]) c.lists[key] = def[key] || [];
    else c.lists[key] = (c.lists[key] || []).filter(id => mine.has(id));
  }
}
function setChart(tid, key, i, pid) {
  const c = ensureChart(tid), unit = CHART_UNIT(key);
  if (c.auto[unit]) { c.auto[unit] = false; }
  const list = (c.lists[key] || []).slice();
  if (pid) { const j = list.indexOf(pid); if (j >= 0) list.splice(j, 1); list.splice(Math.min(i, list.length), 0, pid); }
  else list.splice(i, 1);
  c.lists[key] = list.slice(0, Math.max(CHART_DEPTH[key] || 3, 3));
}
function setChartAuto(tid, unit, on) {
  const c = ensureChart(tid);
  c.auto[unit] = on;
  if (on) refreshChart(tid);
}
// spots a player is listed at (other than his primary): where he cross-trains in camp
function userDepthSpots(p) {
  const c = T(p.tid).dch;
  if (!c) return [];
  const out = new Set();
  for (const key in c.lists) if (!c.auto[CHART_UNIT(key)] && c.lists[key].includes(p.id)) { const s = CHART_SPOT[key]; if (s !== p.spot && comfortOf(p, s) < 100) out.add(s); }
  return [...out];
}
// weekly practice reps for players listed away from their natural spot
function practiceReps(tid) {
  const c = T(tid).dch;
  if (!c) return;
  for (const p of rosterOf(tid)) {
    if (!p.a || p.injury) continue;
    const spots = userDepthSpots(p);
    if (!spots.length) continue;
    const L = learnRate(p);
    let changed = false;
    for (const s of spots) if (learnSpot(p, s, 1.4 * L / spots.length)) { changed = true; addNews(`${pname(p)} is now ${comfortLabel(comfortOf(p, s)).toLowerCase()} at ${SPOTS[s].l} after practice reps.`, [tid], 'prog'); }
    if (changed) updateRatings(p);
  }
}
