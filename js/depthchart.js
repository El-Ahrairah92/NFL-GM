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
}
function pbLearn(p, reps, room, weeks) {
  if (!PB_RATE[p.pos] || pbOf(p) >= 100) return;
  ensureCharacter(p);
  const f = (0.72 + p.h.work / 200 + (learnRate(p) - 1) * 0.4) * reps * (1 + room * 0.08);
  let k = pbOf(p);
  for (let i = 0; i < (weeks || 1); i++) k += PB_RATE[p.pos] * Math.max(0.2, f) * (104 - k);
  p.pb = Math.min(100, Math.round(k * 10) / 10);
}
// a new coordinator with a new system: everyone on that side starts over (partly)
function systemChangeKnowledge() {
  for (const t of state.teams) {
    if (!t.sys) continue;
    for (const [side, fn] of [['O', offArch], ['D', defArch]]) {
      const a = fn(t);
      if (!a || !t.sys[side].arch || a === t.sys[side].arch) continue;
      for (const p of [...rosterOf(t.id), ...psOf(t.id)]) if (PRAC_SIDE[p.pos] === side) { p.pb = Math.round(pbOf(p) * 0.45 + 10); p.pbArch = a; }
      t.sys[side].arch = a; t.sys[side].yrs = -1; // counted as year 0 when the season starts
      if (t.id === state.userTid) addNews(`New ${side === 'O' ? 'offensive' : 'defensive'} system in ${t.region}: the playbook has to be installed from scratch.`, [t.id]);
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
function practiceTeam(tid) {
  const cul = knob(C(T(tid).hc), 'cul'), wk = state.season * 100 + (state.phase === 'REG' ? state.week : 0);
  for (const pos in PRAC_SIDE) {
    const rs = roomState(tid, pos), order = repsOrder(tid, pos);
    const squad = psOf(tid).filter(p => p.pos === pos);
    for (const p of [...rs.room, ...squad]) {
      ensureCharacter(p);
      const onPS = p.tid === -3, i = order.indexOf(p), tier = onPS || i < 0 ? 2 : repsTier(i, pos), eff = roomEffectOn(p, rs);
      if (p.injury) { p.prac = { g: null, t: tier, wk, dnp: 1 }; pbLearn(p, 0.35, eff); continue; } // meetings only
      let noise = gauss(0, 10);
      if (noise < 0) noise *= clamp(1.3 - p.h.cons / 90, 0.3, 1.25); // steady players rarely have a bad week
      const g = clamp(46 + (p.h.work - 55) * 0.42 + (p.h.disc - 55) * 0.28 + eff * 9 + (pbOf(p) - 75) * 0.14 + (cul - 50) * 0.08 + noise, 5, 99);
      p.prac = { g: Math.round(g), t: tier, wk };
      (p.pracH = p.pracH || []).push(Math.round(g)); if (p.pracH.length > 6) p.pracH.shift();
      pbLearn(p, REPS_MULT[tier], eff);
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
  if (oc.tags && oc.tags.has('TRICK')) n += 20;
  return Math.min(80, n);
}
function defNeed(dc) {
  let n = 35 + ({ BLITZ: 12, SIM: 25, THREE: 8 }[dc.pres] || 0) + (dc.stunt ? 10 : 0) + ({ C2M: 10, C4: 10, C0: 5 }[dc.cov] || 0) + (dc.subRush ? 5 : 0);
  return Math.min(80, n);
}
// after the huddle breaks: anyone on the field who does not know this call may blow his assignment
function playbookBusts(g, units) {
  for (const e of units) {
    if (!e.p.a || !PRAC_SIDE[e.p.pos]) continue;
    const need = g.pbNeed[e.s], k = pbOf(e.p);
    if (k >= need) continue;
    if (rand() < (need - k) / 100 * 0.55 * (1.35 - (e.p.h && e.p.h.disc !== undefined ? e.p.h.disc : 55) / 100)) { e.bust = true; if (typeof avInc === 'function') avInc(g, e.p, 'bust'); }
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
