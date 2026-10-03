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
    ['MLB', 'Middle LB'], ['WLB', 'Weak-side LB'], ['SAM', 'Strong-side LB (base)'], ['CB1', 'Corner'], ['CB2', 'Corner'], ['NCB', 'Slot corner (nickel)'], ['DIME', 'Second slot corner (dime)'], ['FS', 'Free safety'], ['SS', 'Strong safety'],
  ] },
  { unit: 'off', title: 'Offensive packages', pkg: true, rows: [['RB3D', 'Passing-down back (3rd & long, 2-minute)'], ['RBSY', 'Short-yardage / goal-line back']] },
  { unit: 'def', title: 'Defensive packages', pkg: true, rows: [['RUSHE', 'Rush specialists · edge (passing downs)'], ['RUSHI', 'Rush specialists · interior (passing downs)']] },
  { unit: 'st', title: 'Special teams', rows: [['K', 'Kicker'], ['P', 'Punter'], ['KR', 'Returner']] },
];
const CHART_DEPTH = { RUSHE: 3, RUSHI: 3, RB3D: 2, RBSY: 2, K: 1, P: 1, KR: 2 };
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
// display names (chart keys stay stable for saves)
const CHART_NAME = { NCB: 'SLOT CB', DIME: 'SLOT CB2', RUSHE: 'EDGE RUSH', RUSHI: 'INT RUSH', IDL1: 'DT', IDL2: 'DT', EDGE1: 'EDGE', EDGE2: 'EDGE', CB1: 'CB', CB2: 'CB', RB3D: '3RD-DOWN RB', RBSY: 'SHORT-YD RB', OL6: '6TH OL', SLOT2: 'WR4', Y2: 'TE3' };
const chartName = k => CHART_NAME[k] || k;
function ensureChart(tid) {
  const t = T(tid);
  if (!t.dch) t.dch = { auto: { off: true, def: true, st: true }, lists: defaultChart(tid), rot: { RB: 0.2 } };
  if (!t.dch.prio) t.dch.prio = {}; // pid -> chart key he favors when he starts at two spots on the field together
  // older saves had one 4-man rush list: split it into edge and interior specialists
  if (t.dch.lists.RUSH) {
    const old = t.dch.lists.RUSH.map(id => P(id)).filter(Boolean);
    t.dch.lists.RUSHE = old.filter(p => p.spot === 'EDGE' || p.spot === 'DE').map(p => p.id).slice(0, 3);
    t.dch.lists.RUSHI = old.filter(p => p.spot !== 'EDGE' && p.spot !== 'DE').map(p => p.id).slice(0, 3);
    delete t.dch.lists.RUSH;
  }
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

// players who head the list at 2+ keys in a unit, and which key they favor (explicit, else the package spot)
function multiStarters(tid, unit) {
  const c = ensureChart(tid), heads = {};
  for (const sec of CHART_SECTIONS) if (sec.unit === unit && !sec.pkg) for (const [key] of sec.rows) { // rush/back packages replace players, they don't line up beside them
    const id = (c.lists[key] || []).find(pid => P(pid) && P(pid).tid === tid);
    if (id != null) (heads[id] = heads[id] || []).push(key);
  }
  return Object.entries(heads).filter(([, ks]) => ks.length >= 2).map(([id, ks]) => ({ pid: +id, keys: ks, prio: ks.includes(c.prio[id]) ? c.prio[id] : defaultPrio(ks) }));
}
function setPrio(tid, pid, key) { const c = ensureChart(tid); if (key) c.prio[pid] = key; else delete c.prio[pid]; }
