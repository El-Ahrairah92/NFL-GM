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
  { unit: 'def', title: 'Defensive packages', pkg: true, rows: [['RUSHE', 'Rush specialists · edge (passing downs)'], ['RUSHI', 'Rush specialists · interior (passing downs)'], ['BIGN', 'Big nickel safety (third safety in the slot)']] },
  { unit: 'st', title: 'Special teams', rows: [['K', 'Kicker'], ['P', 'Punter'], ['KR', 'Kick returner'], ['PRET', 'Punt returner']] },
  { unit: 'st', title: 'Special teams units', pkg: true, rows: [['KO', 'Kickoff coverage'], ['KRU', 'Kick return blockers'], ['PU', 'Punt team (first two are the gunners)'], ['PRU', 'Punt return (first two hold up the gunners)']] },
];
const CHART_DEPTH = { RUSHE: 3, RUSHI: 3, RB3D: 2, RBSY: 2, K: 1, P: 1, KR: 2, PRET: 2, KO: 10, KRU: 10, PU: 10, PRU: 10 };
const ROT_KEYS = new Set(['RB', 'X', 'Z', 'SLOT', 'Y', 'H', 'EDGE1', 'EDGE2', 'IDL1', 'IDL2', 'NT', 'MLB', 'WLB', 'CB1', 'CB2', 'NCB', 'FS', 'SS']);
// How much of a spot's work goes to the next man up: [least, usual, most]. Your setting moves inside the band and no further:
// nobody plays every snap on a defensive line, no back carries a whole offense, and a starting corner does not sit a third of the game.
const ROT_BAND = {
  RB: [0.2, 0.35, 0.5], X: [0, 0.03, 0.15], Z: [0, 0.03, 0.15], SLOT: [0, 0.06, 0.25], Y: [0, 0.08, 0.3], H: [0, 0.08, 0.3],
  EDGE1: [0.1, 0.2, 0.4], EDGE2: [0.1, 0.2, 0.4], IDL1: [0.15, 0.25, 0.45], IDL2: [0.15, 0.25, 0.45], NT: [0.15, 0.25, 0.5],
  MLB: [0, 0, 0.1], WLB: [0, 0, 0.2], CB1: [0, 0, 0.08], CB2: [0, 0, 0.1], NCB: [0, 0, 0.2], FS: [0, 0, 0.08], SS: [0, 0, 0.1],
};
function rotOf(c, key) { const b = ROT_BAND[key]; if (!b) return 0; const v = c && c.rot && c.rot[key] !== undefined ? c.rot[key] : b[1]; return clamp(v, b[0], b[2]); }
// the choices offered at a spot: the ends of its band, the usual share, and a step in between
function rotOpts(key) {
  const b = ROT_BAND[key]; if (!b) return [];
  const r = v => Math.round(v * 100) / 100, vals = [...new Set([b[0], b[1], r((b[1] + b[2]) / 2), b[2]].map(r))].sort((x, y) => x - y);
  const name = v => v === 0 ? 'Starter plays' : v === r(b[1]) ? 'Usual' : v < b[1] ? 'Lean on the starter' : v === r(b[2]) ? 'Heavy rotation' : 'Rotate more';
  return vals.map(v => [v, v === 0 ? name(v) : `${name(v)} (${Math.round(v * 100)}%)`]);
}

// the staff's recommended chart (they know who's really better)
function defaultChart(tid) {
  const ro = rosterOf(tid).filter(p => p.a && !onIR(p));
  const lists = {}, starters = { off: new Set(), def: new Set(), st: new Set() };
  for (const sec of CHART_SECTIONS) for (const [key] of sec.rows) {
    const spot = chartSpotFor(tid, key), n = CHART_DEPTH[key] || 3;
    // the staff keeps players in their own rooms, the way it does when it runs the unit itself: a safety is not a linebacker because he grades out close
    const away = p => p.spot === 'FB' && spot !== 'FB' ? 14 : SPOTS[spot].g === p.pos ? 0 : (p.pos === 'CB' || p.pos === 'S') && (SPOTS[spot].g === 'CB' || SPOTS[spot].g === 'S') ? 2 : 8;
    if (ST_UNIT[key]) { lists[key] = stStaffUnit(ro.filter(p => !p.injury), key, stStarters(ro)).map(p => p.id); continue; } // the staff's ten: the job each man does, less the risk to a starter
    const isRet = key === 'KR' || key === 'PRET';
    const ranked = ro.filter(p => SPOTS[p.spot].side === SPOTS[spot].side || isRet).map(p => [p, isRet ? returnScore(p) : slotRating(p, spot) - away(p)])
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
const CHART_NAME = { NCB: 'SLOT CB', DIME: 'SLOT CB2', RUSHE: 'EDGE RUSH', RUSHI: 'INT RUSH', IDL1: 'DT', IDL2: 'DT', EDGE1: 'EDGE', EDGE2: 'EDGE', CB1: 'CB', CB2: 'CB', RB3D: '3RD-DOWN RB', RBSY: 'SHORT-YD RB', KR: 'KR', PRET: 'PR', KO: 'KO COVER', KRU: 'KO RETURN', PU: 'PUNT', PRU: 'PUNT RET', OL6: '6TH OL', SLOT2: 'WR4', Y2: 'TE3' };
const chartName = k => CHART_NAME[baseKey(k)] || baseKey(k);
// ---- the chart follows the scheme: which position a slot really is depends on the front you run ----
function teamFront(tid) { const t = T(tid); return t && typeof defTend === 'function' ? defTend(t).front : '4-3'; }
function chartSpotFor(tid, key0) {
  const key = baseKey(key0);
  if (CHART_UNIT(key) !== 'def' || ['RUSHE', 'RUSHI', 'BIGN'].includes(key)) return CHART_SPOT[key];
  const front = teamFront(tid);
  for (const pkg of ['BASE', 'NICKEL', 'DIME', 'GL']) { const row = packageLayout(front, pkg).find(l => (DEF_CHART_KEY[l[0]] || l[0]) === key); if (row) return DEF_SLOT[row[1]][0]; }
  return CHART_SPOT[key];
}
// the views of a depth chart: one per defensive package and per offensive personnel grouping your staff actually uses
function dcViews(t, tab) {
  if (tab === 'off') { const pers = offTend(t).pers, tot = Object.values(pers).reduce((a, b) => a + b, 0) || 1;
    const ks = Object.keys(PERSONNEL).sort((a, b) => (pers[b] || 0) - (pers[a] || 0));
    return ks.map(k => ({ id: k, label: k === 'JUMBO' ? 'Jumbo' : k + ' personnel', share: (pers[k] || 0) / tot })); }
  const dt = defTend(t), fr = (dt.pk && dt.pk.fr) || {}, v = [{ id: 'BASE', label: dt.front + ' base', share: dt.base }, { id: 'NICKEL', label: 'Nickel' }, { id: 'DIME', label: 'Dime' }, { id: 'GL', label: 'Goal line' }];
  if (fr.BIGN) v.splice(2, 0, { id: 'BIGN', label: 'Big nickel' });
  if (fr.UNDER) v.push({ id: 'UNDER', label: 'Under front' });
  if (fr.BEAR) v.push({ id: 'BEAR', label: 'Bear front' });
  return v;
}
const OFF_BOX = { X: [1, 1], OL6: [2, 1], LT: [3, 1], LG: [4, 1], C: [5, 1], RG: [6, 1], RT: [7, 1], Y: [8, 1], Z: [9, 1], SLOT: [2, 2], H: [2, 2], QB: [5, 2], SLOT2: [8, 2], Y2: [8, 2], FB: [5, 3], RB: [5, 4] };
const OFF_HOME = { H: '12', FB: '21', SLOT2: '10', Y2: '13', OL6: 'JUMBO' }, DEF_HOME = { NCB: 'NICKEL', DIME: 'DIME', BIGN: 'BIGN' };
function homeView(tab, key) { return tab === 'off' ? OFF_HOME[key] || '11' : DEF_HOME[key] || 'BASE'; }
function dcRawLayout(t, vid) { const front = defTend(t).front; return vid === 'BEAR' ? packageLayout('Bear', 'BASE') : vid === 'UNDER' ? packageLayout('Under', 'BASE') : vid === 'BIGN' ? packageLayout(front, 'NICKEL').map(l => l[0] === 'NCB' ? ['NCB', 'BIGN', l[2], l[3]] : l) : packageLayout(front, vid); }
// where everyone lines up in a view: [{ key, name, spot, col, row, label }]
function dcLayout(t, tab, vid) {
  if (tab === 'off') return ['QB', ...OL_SLOTS, ...PERSONNEL[vid]].map(s => ({ key: s, name: s, spot: OFF_SLOT[s][0], type: s, col: OFF_BOX[s][0], row: OFF_BOX[s][1], label: chartName(s) }));
  const front = defTend(t).front, odd = (front === '3-4' || front === 'Tite') && vid === 'BASE', sub = vid === 'NICKEL' || vid === 'DIME' || vid === 'BIGN';
  const NAME = { EDGE: odd ? 'OLB' : 'EDGE', DE: 'DE', DT: 'DT', NT: 'NT', MLB: odd ? 'ILB' : sub ? 'SUB LB' : 'MLB', WLB: odd ? 'ILB' : sub ? 'SUB LB' : 'WLB', SAM: 'SAM', CB: 'CB', NCB: 'SLOT CB', DIME: 'DIME CB', BIGN: 'BIG NICKEL', FS: 'FS', SS: 'SS' };
  const rows = dcRawLayout(t, vid).map(([name, type, x, depth]) => ({ name, type, x, key: type === 'BIGN' ? 'BIGN' : DEF_CHART_KEY[name] || name, spot: DEF_SLOT[type][0], label: NAME[type] || type,
    row: depth === 0 ? 4 : DEF_SLOT[type][1] === 'LB' ? 3 : type === 'FS' || type === 'SS' ? 1 : 2 }));
  for (const r of [1, 2, 3, 4]) { const used = new Set(); for (const b of rows.filter(x => x.row === r).sort((a, b) => a.x - b.x)) { let c = clamp(Math.round(5 + b.x * 1.05), 1, 9); while (used.has(c) && c < 9) c++; while (used.has(c) && c > 1) c--; used.add(c); b.col = c; } }
  return rows;
}
// who the engine would actually put out there in this view right now (your chart if you set one, the staff's read if not)
function dcLineup(tid, tab, vid) {
  const g = { tids: [tid, tid], side: [null, null], ps: {}, famPen: [0, 0], down: 1, togo: 10, ydl: 30, preview: true }; initSide(g, 0);
  const t = T(tid), front = defTend(t).front;
  const u = tab === 'off' ? offUnit(g, 0, vid, null) : vid === 'BEAR' ? defUnit(g, 0, 'Bear', 'BASE', false) : vid === 'UNDER' ? defUnit(g, 0, 'Under', 'BASE', false) : vid === 'BIGN' ? defUnit(g, 0, front, 'NICKEL', false, true) : defUnit(g, 0, front, vid, false);
  const m = {}; for (const e of u) m[e.name] = e.p; return m;
}
function ensureChart(tid) {
  const t = T(tid);
  if (!t.dch) t.dch = { auto: { off: true, def: true, st: true }, lists: defaultChart(tid), rot: {} }; // a spot with no setting plays its usual rotation
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
  for (const key in c.lists) if (key.includes(':')) c.lists[key] = c.lists[key].filter(id => mine.has(id));
  ensureViewLists(tid);
}
function setChart(tid, key, i, pid) {
  const c = ensureChart(tid), unit = CHART_UNIT(key);
  if (c.auto[unit]) setChartAuto(tid, unit, false); // taking control copies the staff's chart into every grouping first
  const list = (c.lists[key] || []).slice();
  if (pid) { const j = list.indexOf(pid); if (j >= 0) list.splice(j, 1); list.splice(Math.min(i, list.length), 0, pid); }
  else list.splice(i, 1);
  c.lists[key] = list.slice(0, Math.max(CHART_DEPTH[baseKey(key)] || 3, 3));
}
// a position only a specialist can play: nobody lands there by accident
function chartBlocked(tid, key, pid) {
  const k = baseKey(key), p = P(pid);
  if (!p || !['QB', 'K', 'P'].includes(k)) return null;
  return comfortOf(p, CHART_SPOT[k]) > 0 ? null : `${pname(p)} has never played ${SPOTS[CHART_SPOT[k]].l}. Tick "Show everyone" if you really want him there.`;
}
// ---- one chart per grouping ----
// When you run a unit, every personnel grouping and every defensive package has its own order at every spot.
// They start as a copy of the staff's chart at the moment you take control; after that nothing is filled in for you.
const CHART_TABS = { off: 'off', def: 'def' };
function viewSlots(t, tab) { const out = []; for (const v of dcViews(t, tab)) for (const b of dcLayout(t, tab, v.id)) out.push({ v, b, k: v.id + ':' + b.key }); return out; }
function ensureViewLists(tid) {
  const t = T(tid), c = t.dch; if (!c) return;
  for (const tab of ['off', 'def']) {
    if (c.auto[tab]) continue;
    const mine = new Set(rosterOf(tid).map(p => p.id)), firsts = {};
    c.vl = c.vl || {};
    const seed = !c.vl[tab]; c.vl[tab] = true; // only the moment you take control copies the staff's chart; a look added later starts empty
    for (const { v, b, k } of viewSlots(t, tab)) {
      if (c.lists[k] !== undefined) continue;
      if (!seed) { c.lists[k] = []; continue; }
      // first time: copy what is there now (an older package order if you had one, else the base order)
      c.lists[k] = (c.lists[b.key] || []).filter(id => mine.has(id)).slice(0, 3);
      (firsts[v.id] = firsts[v.id] || []).push({ k, spot: b.spot });
    }
    // the copy never starts one man at two spots in the same look: he keeps the job he is more at home in
    for (const vid in firsts) { const boxes = firsts[vid];
      for (let pass = 0; pass < 4; pass++) { const at = {}; let clash = false;
        for (const x of boxes) { const l = c.lists[x.k]; if (!l.length) continue; const o = at[l[0]];
          if (!o) { at[l[0]] = x; continue; }
          clash = true; const p = P(l[0]), lose = comfortOf(p, x.spot) > comfortOf(p, o.spot) ? o : x, ll = c.lists[lose.k];
          if (ll.length > 1) ll.push(ll.shift()); if (lose === o) at[l[0]] = x; }
        if (!clash) break; }
      // still doubled up (a thin room): rebuild that spot from the best men who are not starting elsewhere in this look
      const at = {}; for (const x of boxes) { const l = c.lists[x.k]; if (!l.length) continue; if (!at[l[0]]) { at[l[0]] = x; continue; }
        const taken = new Set(boxes.map(y => c.lists[y.k][0]).filter(Boolean));
        const alt = rosterOf(tid).filter(p => p.a && !onIR(p) && !taken.has(p.id) && SPOTS[p.spot].side === SPOTS[x.spot].side).sort((a, b2) => slotRating(b2, x.spot) - slotRating(a, x.spot)).slice(0, 2).map(p => p.id);
        c.lists[x.k] = [...alt, ...l.filter(id => !alt.includes(id))].slice(0, 3); if (c.lists[x.k].length) at[c.lists[x.k][0]] = x; } }
  }
}
function setChartAuto(tid, unit, on) {
  const c = ensureChart(tid);
  if (on) { for (const k in c.lists) if (k.includes(':') && CHART_UNIT(k) === unit) delete c.lists[k]; if (c.vl) delete c.vl[unit]; c.auto[unit] = true; refreshChart(tid); }
  else { c.auto[unit] = true; refreshChart(tid); if (c.vl) delete c.vl[unit]; c.auto[unit] = false; ensureViewLists(tid); } // start from the staff's chart as it stands
}
function copyView(tid, tab, from, to) {
  const t = T(tid), c = ensureChart(tid);
  if (c.auto[tab]) setChartAuto(tid, tab, false);
  const src = dcLayout(t, tab, from);
  for (const b of dcLayout(t, tab, to)) if (src.some(s => s.key === b.key)) c.lists[to + ':' + b.key] = (c.lists[from + ':' + b.key] || []).slice();
}
// what is wrong with the charts you run: empty spots, and one man listed first at two spots in the same look
function chartProblems(tid) {
  const t = T(tid), c = t.dch, out = [];
  if (!c || isAI(tid)) return out;
  for (const tab of ['off', 'def']) {
    if (c.auto[tab]) continue;
    const seen = {};
    for (const { v, b, k } of viewSlots(t, tab)) {
      const l = (c.lists[k] || []).map(id => P(id)).filter(p => p && p.tid === tid);
      if (!l.length) { out.push({ tab, view: v.id, key: b.key, text: `${v.label}: nobody at ${b.label}` }); continue; }
      const s = seen[v.id] || (seen[v.id] = {});
      if (s[l[0].id]) out.push({ tab, view: v.id, key: b.key, text: `${v.label}: ${l[0].last} is first at both ${s[l[0].id]} and ${b.label}` });
      else s[l[0].id] = b.label;
    }
  }
  return out;
}
// spots a player is listed at (other than his primary): where he cross-trains in camp
function userDepthSpots(p) {
  const c = T(p.tid).dch;
  if (!c) return [];
  // (listed anywhere in any grouping counts as practice time at that spot)
  const out = new Set();
  for (const key in c.lists) if (!c.auto[CHART_UNIT(key)] && c.lists[key].includes(p.id)) { const s = chartSpotFor(p.tid, key); if (s !== p.spot && comfortOf(p, s) < 100) out.add(s); }
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

// =====================================================================
//  PRACTICE · PLAYBOOK KNOWLEDGE · CHARACTER
//  Every week each position room practices. How a player practices comes from his Work Ethic and Discipline, the
//  tone the room's veterans set (Leadership, weighted by seniority within that room; a respected veteran with bad
//  habits drags it down), and how much of the playbook he knows. Consistency raises his floor.
//  A good week is a small edge on game day; a bad one a small drag.
//  Playbook knowledge (0-100) is learned through reps. Calls have a complexity; a player who does not know a call
//  loses the snap to someone who does when possible, and risks a bust when he has to play it anyway.
// =====================================================================
const PRAC_ROOMS = [['O', 'Offense', ['QB', 'RB', 'WR', 'TE', 'OL']], ['D', 'Defense', ['DL', 'LB', 'CB', 'S']]];
const PRAC_SIDE = { QB: 'O', RB: 'O', WR: 'O', TE: 'O', OL: 'O', DL: 'D', LB: 'D', CB: 'D', S: 'D' };
const ROOM_NAME = { QB: 'Quarterbacks', RB: 'Running backs', WR: 'Receivers', TE: 'Tight ends', OL: 'Offensive line', DL: 'Defensive line', LB: 'Linebackers', CB: 'Cornerbacks', S: 'Safeties' };
const PB_RATE = { QB: 0.10, OL: 0.11, LB: 0.11, S: 0.11, TE: 0.12, WR: 0.14, CB: 0.14, RB: 0.15, DL: 0.15 }; // share of what is left that he learns in a week
const REPS_FIRST = { QB: 1, RB: 2, WR: 4, TE: 2, OL: 5, DL: 6, LB: 3, CB: 4, S: 3 };
const REPS_MULT = [1, 0.8, 0.6], REPS_NAME = ['First team', 'Second team', 'Scout team'];
function ensureCharacter(p) { if (p.h && p.h.work === undefined) Object.assign(p.h, genCharacter()); }
function pbOf(p) { return p.pb === undefined ? 96 : p.pb; }
function pbLabel(k) { return k >= 85 ? 'Full playbook' : k >= 68 ? 'Most of it' : k >= 50 ? 'Core calls' : k >= 35 ? 'Base package' : 'Just arrived'; }
// a new arrival: how much of this system does he walk in knowing?
function pbArrive(p, tid) {
  const side = PRAC_SIDE[p.pos], t = T(tid);
  p.pbTid = tid;
  if (!side || !t) { p.pb = 100; return; }
  const arch = side === 'O' ? offArch(t) : defArch(t), inSeason = state.phase === 'REG' || state.phase === 'PLAYOFFS';
  let v = (inSeason ? 26 : 36) + rand() * 8 + (p.exp >= 3 ? 6 : 0);
  if (p.pbArch && arch && p.pbArch === arch) v += 28; // he ran this system somewhere else
  p.pb = Math.round(clamp(v, 10, 100)); p.pbArch = arch;
  delete p.xt; // a new club has its own plans for him
}
function pbLearn(p, reps, room, weeks) {
  if (!PB_RATE[p.pos] || pbOf(p) >= 100) return;
  ensureCharacter(p);
  const tid = p.tid >= 0 ? p.tid : p.psTid;
  const f = (0.72 + p.h.work / 200 + (learnRate(p) - 1) * 0.4) * reps * (1 + room * 0.08) * (tid >= 0 && tid !== undefined ? teachMult(tid, p.pos) : 1);
  let k = pbOf(p);
  for (let i = 0; i < (weeks || 1); i++) k += PB_RATE[p.pos] * Math.max(0.2, f) * (104 - k);
  p.pb = Math.min(100, Math.round(k * 10) / 10);
}
// a new coordinator with a new system: everyone on that side starts over (partly)
function systemChangeKnowledge() {
  for (const t of state.teams) {
    if (!t.sys) continue;
    for (const [side, fn] of [['O', offArch], ['D', defArch]]) {
      const a = fn(t), cur = pkVector(t, side), prev = t.pkSnap && t.pkSnap[side];
      (t.pkSnap = t.pkSnap || {})[side] = cur;
      if (!prev) continue;
      const ov = pkOverlap(prev, cur);
      if (ov >= 0.97) continue; // same book
      // players keep what carries over and relearn the rest
      for (const p of [...rosterOf(t.id), ...psOf(t.id)]) if (PRAC_SIDE[p.pos] === side) { p.pb = Math.round(clamp(pbOf(p) * (0.45 + 0.55 * ov) + 10 * (1 - ov), 10, 100)); p.pbArch = a; }
      const added = Object.keys(cur).filter(k => !prev[k] && PK_NAME[k]).map(k => PK_NAME[k]);
      if (ov < 0.6) { t.sys[side].arch = a; t.sys[side].yrs = -1; }
      if (t.id === state.userTid) addNews(ov < 0.6 ? `A new ${side === 'O' ? 'offense' : 'defense'} in ${t.region}: only about ${Math.round(ov * 100)}% of the old playbook carries over.` : `${t.region}'s ${side === 'O' ? 'offensive' : 'defensive'} playbook changed (${Math.round(ov * 100)}% carries over)${added.length ? ': new this year: ' + added.slice(0, 4).join(', ') : ''}.`, [t.id]);
    }
  }
}
// ---- reps order: yours to set, by position group ----
function repsOrder(tid, pos) {
  const t = T(tid), ro = rosterOf(tid).filter(p => p.pos === pos && !onIR(p));
  const saved = !isAI(tid) && t.reps && t.reps[pos] ? t.reps[pos] : [];
  const idx = id => { const i = saved.indexOf(id); return i < 0 ? 999 : i; };
  return ro.sort((a, b) => idx(a.id) - idx(b.id) || viewOvr(b, tid) - viewOvr(a, tid));
}
function moveReps(pid, dir) {
  const p = P(pid), t = T(state.userTid);
  if (!p || p.tid !== t.id) return;
  const order = repsOrder(t.id, p.pos).map(x => x.id), i = order.indexOf(pid), j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j], order[i]];
  (t.reps = t.reps || {})[p.pos] = order;
}
function repsTier(i, pos) { const n = REPS_FIRST[pos] || 1; return i < n ? 0 : i < n * 2 ? 1 : 2; }
// ---- the tone of a room ----
function roomInfluence(p, medExp) { return p.h.lead / 100 * clamp((p.exp - medExp + 3) / 5, 0, 1.3); } // respected AND senior for this room
function attitude(p) { return ((p.h.work + p.h.disc) / 2 - 55) / 45; } // -1 (bad habits) to +1
function roomState(tid, pos) {
  const room = rosterOf(tid).filter(p => p.pos === pos && p.h);
  room.forEach(ensureCharacter);
  const exps = room.map(p => p.exp).sort((a, b) => a - b), med = exps.length ? exps[exps.length >> 1] : 0;
  const voices = room.map(p => ({ p, w: roomInfluence(p, med), a: attitude(p) })).filter(v => v.w > 0.12).sort((a, b) => b.w - a.w);
  const tone = clamp(voices.reduce((s, v) => s + v.w * v.a, 0), -1.5, 1.5);
  return { room, med, voices, tone };
}
// what the veterans above him add or take away
function roomEffectOn(p, rs) { return clamp(rs.voices.filter(v => v.p !== p && v.p.exp > p.exp).reduce((s, v) => s + v.w * v.a, 0), -1.5, 1.5); }
function pracGradeLabel(g) { return g >= 72 ? 'Great week' : g >= 59 ? 'Good week' : g >= 42 ? 'Solid' : g >= 30 ? 'Poor week' : 'Bad week'; }
// ---- cross-training: practice time at a second position ----
// Any spot on his side of the ball. Neighbouring jobs come quickest; a real position change takes most of a season
// per comfort level. The time comes out of his own work: a slightly worse week and slower playbook learning.
const XT_GROUPS = [['RB', 'FB', 'WRX', 'WRZ', 'SLOT', 'TEY', 'TEH'], ['LT', 'LG', 'C', 'RG', 'RT'], ['NT', 'DT', 'DE', 'EDGE', 'MLB', 'WLB'], ['MLB', 'WLB', 'CB', 'NCB', 'FS', 'SS']]; // a back can learn receiver; nobody is turning him into a tackle
function crossTrainSpots(p) { const ok = new Set(); for (const g of XT_GROUPS) if (g.includes(p.spot)) g.forEach(s => ok.add(s)); ok.delete(p.spot); return SPOT_KEYS.filter(s => ok.has(s)); }
function setCrossTrain(pid, spot) { const p = P(pid); if (!p) return; if (spot && crossTrainSpots(p).includes(spot)) p.xt = spot; else delete p.xt; }
function crossTrainRate(p, spot) { return (SPOT_NEIGHBORS[p.spot] || []).includes(spot) ? 1 : 0.7; }
function crossTrainWeek(p, weeks) {
  if (!p.xt || !p.a || p.injury) return;
  if (comfortOf(p, p.xt) >= 100) { delete p.xt; return; }
  ensureCharacter(p);
  const pts = 2.4 * learnRate(p) * (0.75 + p.h.work / 200) * crossTrainRate(p, p.xt) * (weeks || 1) * (p.tid >= 0 ? teachMult(p.tid, p.pos) : 1);
  if (learnSpot(p, p.xt, pts)) {
    updateRatings(p);
    if (p.tid === state.userTid) addNews(`${pname(p)} is now ${comfortLabel(comfortOf(p, p.xt)).toLowerCase()} at ${SPOTS[p.xt].l} after cross-training.`, [p.tid], 'prog');
  }
  if (comfortOf(p, p.xt) >= 100) delete p.xt;
}
function practiceTeam(tid) {
  const cul = knob(C(T(tid).hc), 'cul'), wk = state.season * 100 + (state.phase === 'REG' ? state.week : 0);
  for (const pos in PRAC_SIDE) {
    const rs = roomState(tid, pos), order = repsOrder(tid, pos), cd = roomDisc(tid, pos); // the position coach runs this room
    const squad = psOf(tid).filter(p => p.pos === pos);
    for (const p of [...rs.room, ...squad]) {
      ensureCharacter(p);
      const onPS = p.tid === -3, i = order.indexOf(p), tier = onPS || i < 0 ? 2 : repsTier(i, pos), raw = roomEffectOn(p, rs), eff = raw < 0 ? raw * clamp(1.25 - cd / 110, 0.4, 1.1) : raw; // a firm coach keeps a bad example from spreading
      if (p.injury) { p.prac = { g: null, t: tier, wk, dnp: 1 }; pbLearn(p, 0.35, eff); continue; } // meetings only
      let noise = gauss(0, 10);
      if (noise < 0) noise *= clamp(1.3 - p.h.cons / 90, 0.3, 1.25); // steady players rarely have a bad week
      const xt = p.xt && p.tid === tid ? 1 : 0; // splitting his week between two jobs
      const g = clamp(46 + (cd - 52) * 0.12 - xt * 3 + (p.h.work - 55) * 0.42 + (p.h.disc - 55) * 0.28 + eff * 9 + (pbOf(p) - 75) * 0.14 + (cul - 50) * 0.08 + noise, 5, 99);
      p.prac = { g: Math.round(g), t: tier, wk };
      (p.pracH = p.pracH || []).push(Math.round(g)); if (p.pracH.length > 6) p.pracH.shift();
      p.pa = p.pa ? [p.pa[0] + g, p.pa[1] + 1] : [g, 1]; // what he has shown since the last checkpoint
      pbLearn(p, REPS_MULT[tier] * (xt ? 0.85 : 1), eff);
      if (xt) crossTrainWeek(p);
      if (p.tid === state.userTid || p.psTid === state.userTid) p.seenW = (p.seenW || 0) + 1; // your staff gets to know him
    }
  }
}
function practiceWeekAll() { for (const t of state.teams) practiceTeam(t.id); }
// game day: the week of practice shows up as a small edge or drag; taking snaps without the reps costs a little
function pracBump(p) { return p.prac && p.prac.g !== null && p.prac.g !== undefined ? clamp((p.prac.g - 50) * 0.09, -3, 3) : 0; }
function repPenalty(p) { const t = p.prac ? p.prac.t : 0; return !t ? 0 : (p.pos === 'QB' ? 1.2 : p.pos === 'OL' ? 0.8 : 0.4) * (t >= 2 ? 1 : 0.6); }
// ---- call complexity: how much of the playbook a snap asks for ----
function offNeed(oc) {
  let n = 35;
  for (const t of ['PA', 'BOOT', 'RPO', 'RUB', 'MOTION']) if (oc.tags && oc.tags.has(t)) n += 10;
  n = Math.min(n, 60);
  n += { DEEP: 8, OPTION: 15, GADGET: 30, JET: 10, RBSCR: 10, WRSCR: 10, DRAW: 5 }[oc.type] || 0;
  n += (oc.trips ? 4 : 0) + (oc.bunch ? 8 : 0) + (oc.tight ? 3 : 0) + (oc.counter ? 8 : 0) + (oc.duo ? 4 : 0) + (oc.optrt ? 15 : 0) + (oc.maxp ? 4 : 0) + (oc.nohud ? 6 : 0);
  if (oc.tags && oc.tags.has('TRICK')) n += 20;
  return Math.min(80, n);
}
function defNeed(dc) {
  let n = 35 + ({ BLITZ: 12, SIM: 25, THREE: 8, FZ: 22 }[dc.pres] || 0) + (dc.stunt ? 10 : 0) + ({ C2M: 10, C4: 10, C0: 5, T2: 12, C6: 18 }[dc.cov] || 0) + (dc.subRush ? 5 : 0) + (dc.disg ? 8 : 0) + (dc.front === 'Bear' ? 10 : dc.front === 'Under' ? 4 : 0) + (dc.bign ? 5 : 0);
  return Math.min(80, n);
}
// after the huddle breaks: anyone on the field who does not know this call may blow his assignment
function playbookBusts(g, units) {
  for (const e of units) {
    if (!e.p.a || !PRAC_SIDE[e.p.pos]) continue;
    const need = g.pbNeed[e.s], k = pbOf(e.p);
    if (k >= need) continue;
    if (rand() < (need - k) / 100 * 0.55 * (1.35 - (e.p.h && e.p.h.disc !== undefined ? e.p.h.disc : 55) / 100) * (e.p.tid >= 0 ? 1.2 - roomDisc(e.p.tid, e.p.pos) / 260 : 1)) { e.bust = true; if (typeof avInc === 'function') avInc(g, e.p, 'bust'); }
  }
}
// your staff's read on a player's character: vague at first, sharper the longer he is in the building
const CHAR_LABELS = {
  work: [[80, 'Tireless'], [64, 'Hard worker'], [45, 'Professional'], [30, 'Coasts'], [0, 'Poor habits']],
  disc: [[80, 'Assignment-sure'], [64, 'Disciplined'], [45, 'Sound'], [30, 'Freelances'], [0, 'Undisciplined']],
  lead: [[80, 'Captain'], [62, 'Leader'], [40, 'Lets his play talk'], [0, 'Keeps to himself']],
};
function charRead(p, k) {
  ensureCharacter(p);
  const w = p.seenW || 0;
  if (w < 2) return null; // not enough time around him yet
  const est = p.h[k] + hashGauss(p.id, 600 + k.charCodeAt(0), 3) * 20 * (1 - Math.min(1, w / 16));
  return (CHAR_LABELS[k].find(([min]) => est >= min) || CHAR_LABELS[k][CHAR_LABELS[k].length - 1])[1];
}
function charCls(l) { return ['Tireless', 'Hard worker', 'Assignment-sure', 'Disciplined', 'Captain', 'Leader'].includes(l) ? 'good' : ['Coasts', 'Poor habits', 'Freelances', 'Undisciplined'].includes(l) ? 'bad' : ''; }
