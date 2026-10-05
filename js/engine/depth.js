'use strict';
// =====================================================================
//  ENGINE · personnel, packages, depth charts, fatigue & rotation
//  docs/PLAYBOOK_SPEC.md §2, §5a/b · docs/DESIGN.md §3
// =====================================================================

// Engine calibration constants (Phase 4 tunes these against the target sheet)
const TUNE = {
  spread: 0.5,         // how much talent gaps matter: attributes are compressed toward the league mean on every snap
  spreadQB: 0.66,      // quarterbacking stays more leveraged
  hfa: 0.3,            // home-field bonus, attribute points on every snap
  teamForm: 0.4,       // sd of team game-day form
  fatFree: 3.0,        // fatigue tolerated before it costs anything
  // trenches
  passProMedian: 5.85, // seconds for an average rusher to beat an average blocker 1v1
  rushScale: 0.036,
  insideRush: 1.18,    // interior rushers take longer to get home than edges (crowded path, more double teams)    // how strongly the rush/block gap moves win time
  doubleBonus: 17,     // pass-block points added by a second blocker
  chipBonus: 7,
  pickupMiss: 0.13,    // blitz/sim pickup failure for an average protection
  stuntMiss: 0.22,
  runWin: 0.03,       // logit: front defender beats his run block (average vs average)
  runScale: 0.12,
  comboBonus: 16,
  // coverage / passing
  openBase: -0.6,
  openScale: 0.034,
  covWeight: 1.7,      // a defender's coverage skill counts this much more than the receiver's route skill
  holeBonus: 0.9,
  readTime: 0.52,
  catchBase: 2.8,
  shade: 0.35, // how hard defenses roll coverage toward the best receiver
  dropBase: 0.07,
  intBase: 0.0067,
  // tackling
  tackleBase: 2.0,
  tackleScale: 0.03,
  runAfter: 1.08,       // yards a back typically adds after first contact
  carryLoad: 3.8,      // how much more a carry tires a back than an ordinary snap
  pocketOpen: 1.2,
  shortOpen: 0.44,     // defenses give up the underneath
  deepCov: -1.08,      // deep routes start covered: they need time (or a beaten defender) to come open
  midCov: -0.75,     // separation a receiver gains per second the QB can hold the ball in a clean pocket
  paBite: -0.8,        // logit: how readily second-level defenders bite on play-action
  paOpen: 0.22,        // separation gained downfield when they do
  screenLead: 4,       // yards the screen's convoy buys before the first tackler arrives
  passLean: 0.55,         // how far play-callers stray from the league-average run/pass mix (1 = full scheme identity)
};

// ---------- offense ----------
// slot -> [rating spot, fatigue group]
const OFF_SLOT = {
  QB: ['QB', 'QB'], RB: ['RB', 'RB'], FB: ['FB', 'TE'], X: ['WRX', 'WR'], Z: ['WRZ', 'WR'], SLOT: ['SLOT', 'WR'], SLOT2: ['SLOT', 'WR'],
  Y: ['TEY', 'TE'], H: ['TEH', 'TE'], Y2: ['TEY', 'TE'], OL6: ['RT', 'OL'],
  LT: ['LT', 'OL'], LG: ['LG', 'OL'], C: ['C', 'OL'], RG: ['RG', 'OL'], RT: ['RT', 'OL'],
};
const OL_SLOTS = ['LT', 'LG', 'C', 'RG', 'RT'];
const OL_X = { LT: -2, LG: -1, C: 0, RG: 1, RT: 2 };
const PERSONNEL = {
  '10': ['RB', 'X', 'Z', 'SLOT', 'SLOT2'],
  '11': ['RB', 'X', 'Z', 'SLOT', 'Y'],
  '12': ['RB', 'X', 'Z', 'Y', 'H'],
  '13': ['RB', 'X', 'Y', 'H', 'Y2'],
  '21': ['RB', 'FB', 'X', 'Z', 'Y'],
  '22': ['RB', 'FB', 'X', 'Y', 'H'],
  JUMBO: ['RB', 'FB', 'Y', 'H', 'OL6'],
};
// where each skill slot lines up (offense's view, + = right / strong side). Inline TEs are blockers.
const OFF_ALIGN = { X: -4, Z: 4, SLOT: 2.4, SLOT2: -2.4, Y: 2.9, H: -2.9, Y2: 3.6, OL6: 3, RB: 0, FB: 0 };
const INLINE = new Set(['Y', 'H', 'Y2', 'OL6']);

// ---------- defense ----------
const DEF_SLOT = {
  EDGE: ['EDGE', 'DL'], DE: ['DE', 'DL'], DT: ['DT', 'DL'], NT: ['NT', 'DL'],
  MLB: ['MLB', 'LB'], WLB: ['WLB', 'LB'], SAM: ['WLB', 'LB'], BIGN: ['SS', 'DB'], // big nickel: a third safety plays the slot
  CB: ['CB', 'DB'], NCB: ['NCB', 'DB'], DIME: ['NCB', 'DB'], FS: ['FS', 'DB'], SS: ['SS', 'DB'],
};
// [name, slot type, x, depth]. Depth 0 = on the line. Names are unique within a package.
function packageLayout(front, pkg) {
  const e = front === 'Wide-9' ? 3.6 : 2.85;
  const DB2 = [['CB1', 'CB', -4, 7], ['CB2', 'CB', 4, 7], ['FS', 'FS', -0.5, 13], ['SS', 'SS', 1.5, 9]];
  let odd = front === '3-4' || front === 'Tite';
  if (pkg === 'GL') return [['LE', 'EDGE', -3, 0], ['LT', 'DT', -1.3, 0], ['NT', 'NT', 0, 0], ['RT', 'DT', 1.3, 0], ['RE', 'EDGE', 3, 0],
    ['WLB', 'WLB', -1.6, 3], ['MLB', 'MLB', 0, 3], ['SAM', 'SAM', 2.4, 3], ['CB1', 'CB', -4, 5], ['CB2', 'CB', 4, 5], ['SS', 'SS', 1, 6]];
  // Bear: all three interior linemen covered, edges tight outside them, two linebackers stacked behind
  if (pkg === 'BASE' && front === 'Bear') return [['LE', 'EDGE', -3.2, 0], ['LT', 'DT', -1.3, 0], ['NT', 'NT', 0, 0], ['RT', 'DT', 1.3, 0], ['RE', 'EDGE', 3.2, 0],
    ['WLB', 'WLB', -0.8, 4.5], ['MLB', 'MLB', 0.8, 4.5], ...DB2];
  // Under: the line shifts to the weak side, the nose shades the center, the strong-side linebacker walks up over the tight end
  if (pkg === 'BASE' && front === 'Under') return [['LE', 'EDGE', -2.4, 0], ['DT', 'DT', -1.3, 0], ['NT', 'NT', 0.5, 0], ['RE', 'EDGE', 2.3, 0],
    ['WLB', 'WLB', -1.6, 5], ['MLB', 'MLB', 0.2, 5], ['SAM', 'SAM', 3.4, 1.5], ...DB2];
  if (front === 'Bear' || front === 'Under') front = '4-3';
  if (pkg === 'BASE' && odd) {
    const de = front === 'Tite' ? 1.6 : 2.2;
    return [['LOLB', 'EDGE', -3.2, 0], ['LDE', 'DE', -de, 0], ['NT', 'NT', 0, 0], ['RDE', 'DE', de, 0], ['ROLB', 'EDGE', 3.2, 0],
      ['WLB', 'WLB', -0.9, 5], ['MLB', 'MLB', 0.9, 5], ...DB2];
  }
  if (pkg === 'BASE') return [['LE', 'EDGE', -e, 0], ['NT', 'NT', -0.5, 0], ['DT', 'DT', 1.4, 0], ['RE', 'EDGE', e, 0],
    ['WLB', 'WLB', -1.5, 5], ['MLB', 'MLB', 0, 5], ['SAM', 'SAM', 2.6, 4], ...DB2];
  // sub packages are a four-man line whatever the base front: two edges and two interior rushers playing tackle technique.
  // (A 3-4 team's ends slide inside here as tackles; the job is DT, not base end.)
  const dl = odd ? [['LE', 'EDGE', -3.1, 0], ['DT1', 'DT', -1.3, 0], ['DT2', 'DT', 1.3, 0], ['RE', 'EDGE', 3.1, 0]]
    : [['LE', 'EDGE', -e, 0], ['DT1', 'DT', -1.4, 0], ['DT2', 'DT', 1.4, 0], ['RE', 'EDGE', e, 0]];
  if (pkg === 'NICKEL') return [...dl, ['WLB', 'WLB', -1.2, 5], ['MLB', 'MLB', 0.8, 5], ...DB2, ['NCB', 'NCB', 2.4, 6]];
  return [...dl, ['WLB', 'WLB', 0, 5], ...DB2, ['NCB', 'NCB', 2.4, 6], ['DIME', 'DIME', -2.4, 6]]; // DIME
}

// fatigue: [per-snap load, threshold before rotation pressure]
const FAT = { QB: [0.25, 99], OL: [0.45, 14], RB: [0.9, 5.5], WR: [0.7, 4.3], TE: [0.7, 4.0], DL: [1.3, 2.0], LB: [0.6, 16], DB: [0.5, 18] };
// how hard fatigue pushes a player to the sideline (DL rotate by design)
const FAT_SLOPE = { QB: 1, OL: 1, RB: 1.6, WR: 1.8, TE: 2.6, DL: 4.0, LB: 1, DB: 1 };
// defensive lines play in waves: the gap between a starter and his backup counts for less than fresh legs
// planned rest: chance a starter at this spot sits out a given drive (coaches spell receivers and tight ends by series)
const REST_P = { X: 0.075, Z: 0.075, SLOT: 0.04, Y: 0.14 };
const ROT_GAP = { DL: 0.5, WR: 0.55, TE: 0.5 }; // receivers and tight ends get series off too

// ---------- team game state ----------
function slotRating(p, spot) {
  if (!p.a) return p.ovr || 40;
  if (p.fit && p.fit[spot] !== undefined) return p.fit[spot];
  return spotRating(p, spot) - comfortPen(p, spot);
}
// Build a side's per-game state: healthy roster and per-spot depth (players listed at every spot they could fill)
function initSide(g, s) {
  const tid = g.tids[s];
  const T_ = g.side[s] || (g.side[s] = { tid, onField: new Set() });
  if (!T_.active) T_.active = g.pre ? preseasonActives(tid) : gameDayActives(tid); // 48 dress on game day; in preseason the starters sit
  T_.roster = rosterOf(tid).filter(p => !p.injury && T_.active.has(p.id));
  if (T_.roster.length < 22) { // emergency fillers so a decimated team can still line up
    let i = 0;
    while (T_.roster.length < 30) T_.roster.push({ id: -100 - s * 50 - (i++), first: 'Emergency', last: 'Sub' + i, spot: 'WRZ', pos: 'WR', lbl: '—', ovr: 40, tid, a: null, h: null });
  }
  T_.depth = {};
  for (const spot of SPOT_KEYS) {
    T_.depth[spot] = T_.roster.map(p => ({ p, r: slotRating(p, spot) })).filter(x => x.r > 25).sort((a, b) => b.r - a.r);
  }
  for (const p of T_.roster) if (!g.ps[p.id]) g.ps[p.id] = { fat: 0, snp: 0, last: null };
}
function fatPenalty(g, p, grp) {
  const st = g.ps[p.id];
  if (!st) return 0;
  const thr = FAT[grp][1];
  return st.fat > thr ? (st.fat - thr) * FAT_SLOPE[grp] : 0;
}
// Fill a list of slots with the best available players (rating at the slot's spot, minus fatigue, plus continuity)
function fillSlots(g, s, slots, table, opts = {}) {
  const T_ = g.side[s], used = new Set(opts.exclude || []), out = [];
  const chart = opts.chart;
  for (const [name, slot, x, depth] of slots) {
    const [spot, grp] = table[slot];
    let best = null, bs = -1e9;
    let cands = T_.depth[spot].length ? T_.depth[spot] : T_.roster.map(p => ({ p, r: 30 }));
    // your depth chart: listed players come first (in order); fatigue can still force a sub, and #2 gets his rotation share
    const key = chart ? opts.keyOf(name, slot) : null;
    // a package can have its own order at a spot (your nickel linebacker need not be your base one); otherwise the base order
    let list = null;
    if (key) { for (const pk of opts.pkgKeys || []) { const l = chart.lists[pk + ':' + key]; if (l) { list = l; break; } } if (!list && chart.lists[key] && chart.lists[key].length) list = chart.lists[key]; }
    let rotHit = false;
    if (list) {
      const listed = list.map(id => T_.roster.find(p => p.id === id)).filter(Boolean).filter(p => !cands.some(c => c.p === p)).map(p => ({ p, r: slotRating(p, spot) }));
      if (listed.length) cands = [...listed, ...cands];
      rotHit = g.preview ? false : opts.rot ? opts.rot(key) : rand() < (chart.rot[key] || 0); // a preview shows the order as set, never a random rotation snap
    }
    for (const c of cands) {
      if (used.has(c.p.id)) continue;
      let sc = c.r * (ROT_GAP[grp] || 1) - fatPenalty(g, c.p, grp);
      if (list) { const i = list.indexOf(c.p.id); if (i >= 0) sc = 300 - i * 14 * (ROT_GAP[grp] || 1) - fatPenalty(g, c.p, grp) + (i === 1 && rotHit ? 30 : 0); }
      if (T_.rest && T_.rest.has(c.p.id)) sc -= 40; // a planned series off
      if (g.pbNeed && slot !== 'QB' && c.p.a) { const k = pbOf(c.p), need = g.pbNeed[s]; if (k < need) sc -= (need - k) * 0.3; } // he does not know this call
      if (g.ps[c.p.id] && g.ps[c.p.id].last === name) sc += 1.5; // continuity: no needless shuffling
      if (opts.score && !list) sc += opts.score(c.p, slot);
      if (sc > bs) { bs = sc; best = c; }
    }
    if (!best) best = { p: T_.roster.find(p => !used.has(p.id)) || T_.roster[0], r: 30 };
    used.add(best.p.id);
    const pen = best.p.a ? comfortPen(best.p, spot) : 0; // how well he knows this spot; his own attributes do the rest
    out.push({ p: best.p, slot, name, spot, grp, x, depth: depth || 0, pen, s });
  }
  return out;
}
// Offensive eleven for a personnel grouping
function offUnit(g, s, pers, call) {
  const T_ = g.side[s];
  const skill = PERSONNEL[pers];
  const slots = [['QB', 'QB', 0, 5], ...OL_SLOTS.map(o => [o, o, OL_X[o], 0])];
  const order = ['RB', 'X', 'Z', 'SLOT', 'Y', 'H', 'FB', 'Y2', 'SLOT2', 'OL6'].filter(k => skill.includes(k));
  for (const k of order) slots.push([k, k, OFF_ALIGN[k], k === 'RB' ? 7 : k === 'FB' ? 4 : 1]);
  // running back usage: committee share, a third-down back on passing downs
  const rbScore = (p, slot) => {
    if ((slot === 'Y' || slot === 'H' || slot === 'Y2') && p.spot === 'FB') return -13; // a fullback is not your tight end
    if (slot !== 'RB' || !p.a) return 0;
    if (p.spot !== 'RB') return p.spot === 'FB' ? -6 : -8; // a receiver in the backfield is a gadget, not a feature back
    if (call && call.passDown) return (ea0(p, 'hnd') + ea0(p, 'pbk') + ea0(p, 'rte') - 180) * 0.12;
    if (!T_.rb2Turn) return 0;
    // committee series: the No. 2 back gets his drive unless he's hopelessly outclassed
    const backs = T_.depth.RB.filter(x => x.p.spot === 'RB');
    const rb2 = backs[T_.rb3Turn && backs[2] && backs[1].r - backs[2].r <= 14 ? 2 : 1]; // the third back gets the odd series
    return rb2 && p.id === rb2.p.id && backs[0].r - rb2.r <= 45 ? backs[0].r - rb2.r + 2 : 0; // even a star gets spelled
  };
  const chart = userChart(g, s, 'off');
  if (!chart) return fillSlots(g, s, slots, OFF_SLOT, { score: rbScore });
  const shortYd = g.togo <= 2 && (g.down >= 3 || g.ydl >= 98);
  const rbKey = call && call.passDown && hasList(chart, 'RB3D') ? 'RB3D' : shortYd && hasList(chart, 'RBSY') ? 'RBSY' : 'RB';
  return fillSlots(g, s, slots, OFF_SLOT, {
    score: rbScore, chart, pkgKeys: [pers], keyOf: name => name === 'RB' ? rbKey : name,
    rot: key => key === 'RB' ? !!T_.rb2Turn : rand() < (chart.rot[key] || 0),
  });
}
// ---------- user depth charts (t.dch): lists by chart key, #2 rotation share, auto per unit ----------
const DEF_CHART_KEY = { LE: 'EDGE1', LOLB: 'EDGE1', RE: 'EDGE2', ROLB: 'EDGE2', DT1: 'IDL1', LDE: 'IDL1', LT: 'IDL1', DT2: 'IDL2', RDE: 'IDL2', DT: 'IDL2', RT: 'IDL2',
  NT: 'NT', WLB: 'WLB', MLB: 'MLB', SAM: 'SAM', CB1: 'CB1', CB2: 'CB2', NCB: 'NCB', DIME: 'DIME', FS: 'FS', SS: 'SS' };
const CHART_SPOT = { QB: 'QB', RB: 'RB', RB3D: 'RB', RBSY: 'RB', FB: 'FB', X: 'WRX', Z: 'WRZ', SLOT: 'SLOT', SLOT2: 'SLOT', Y: 'TEY', H: 'TEH', Y2: 'TEY', OL6: 'RT',
  LT: 'LT', LG: 'LG', C: 'C', RG: 'RG', RT: 'RT', EDGE1: 'EDGE', EDGE2: 'EDGE', IDL1: 'DT', IDL2: 'DT', NT: 'NT', RUSH: 'EDGE', MLB: 'MLB', WLB: 'WLB', SAM: 'WLB',
  CB1: 'CB', CB2: 'CB', NCB: 'NCB', DIME: 'NCB', FS: 'FS', SS: 'SS', K: 'K', P: 'P', KR: 'RB', RUSHE: 'EDGE', RUSHI: 'DT', BIGN: 'SS' };
const baseKey = k => { const i = k.indexOf(':'); return i < 0 ? k : k.slice(i + 1); }; // 'NICKEL:MLB' -> 'MLB'
const CHART_UNIT = k0 => { const k = baseKey(k0); return ['K', 'P', 'KR'].includes(k) ? 'st' : ['EDGE1', 'EDGE2', 'IDL1', 'IDL2', 'NT', 'RUSH', 'RUSHE', 'RUSHI', 'MLB', 'WLB', 'SAM', 'CB1', 'CB2', 'NCB', 'DIME', 'FS', 'SS', 'BIGN'].includes(k) ? 'def' : 'off'; };
// the QB the staff (or your chart) has under center
function starterQB(g, s) {
  const p = chartFirst(g, s, 'QB') || (g.side[s].depth.QB[0] ? g.side[s].depth.QB[0].p : null);
  if (p) return p;
  const e = offUnit(g, s, '11', null).find(x => x.slot === 'QB'); // nobody can play QB: whoever is taking the snaps
  return e ? e.p : null;
}
function hasList(chart, k) { return chart.lists[k] && chart.lists[k].length; }
function userChart(g, s, unit) { const t = T(g.tids[s]); if (state.settings.autoUser && t.id === state.userTid) return null; return t.dch && !t.dch.auto[unit] ? t.dch : null; }
function chartFirst(g, s, key) {
  const chart = userChart(g, s, CHART_UNIT(key));
  if (!chart || !hasList(chart, key)) return null;
  for (const id of chart.lists[key]) { const p = g.side[s].roster.find(x => x.id === id); if (p) return p; }
  return null;
}
function ea0(p, k) { return p.a && p.a[k] !== undefined ? p.a[k] : 25; }
// what a package asks of a spot: sub packages want a linebacker who can cover, base and goal line want one who can stop the run
function pkgRoleBias(p, slot, pkg) {
  if (!p.a || !DEF_SLOT[slot] || DEF_SLOT[slot][1] !== 'LB') return 0;
  const cov = (ea0(p, 'zone') + ea0(p, 'man') + ea0(p, 'spd')) / 3, run = (ea0(p, 'tkl') + ea0(p, 'shed') + ea0(p, 'str')) / 3;
  return pkg === 'NICKEL' || pkg === 'DIME' ? (cov - run) * 0.3 : (run - cov) * 0.18;
}
// Defensive eleven for a package; sub-rush puts the best four pass rushers on the line
function defUnit(g, s, front, pkg, subRush, bign) {
  let layout = packageLayout(front, pkg);
  if (bign) layout = layout.map(l => l[0] === 'NCB' ? ['NCB', 'BIGN', l[2], l[3]] : l);
  const fix = u => { for (const e of u) if (e.slot === 'BIGN') e.slot = 'NCB'; return u; }; // he plays the nickel's job
  // coaches keep players in their own rooms: a safety is not a linebacker just because he grades out close
  const DB_POS = { CB: 1, S: 1 };
  const score = (p, slot) => { const grp = DEF_SLOT[slot][1]; return pkgRoleBias(p, slot, pkg) + (subRush && grp === 'DL' && p.a ? (ea0(p, 'prsh') - 60) * 0.35 : 0) - (grp === 'LB' && p.pos !== 'LB' ? 7 : grp === 'DB' && !DB_POS[p.pos] ? 7 : 0); };
  const chart = userChart(g, s, 'def');
  const pkgKeys = [bign ? 'BIGN' : null, front === 'Bear' ? 'BEAR' : front === 'Under' ? 'UNDER' : null, pkg].filter(Boolean);
  if (!chart) return fix(fillSlots(g, s, layout, DEF_SLOT, { score }));
  // passing downs: your rush specialists take over the edge and interior spots
  const EDGE_NAMES = new Set(['LE', 'RE', 'LOLB', 'ROLB']);
  return fix(fillSlots(g, s, layout, DEF_SLOT, { score, chart, pkgKeys, keyOf: (name, slot) => {
    if (slot === 'BIGN') return 'BIGN';
    if (subRush && DEF_SLOT[slot][1] === 'DL') { const k = EDGE_NAMES.has(name) ? 'RUSHE' : 'RUSHI'; if (hasList(chart, k)) return k; }
    return DEF_CHART_KEY[name] || name;
  } }));
}
function kickUnitPlayer(g, s, spot) {
  const d = g.side[s].depth[spot], pick = chartFirst(g, s, spot);
  return { p: pick || (d.length ? d[0].p : g.side[s].roster[0]), slot: spot, name: spot, spot, grp: 'QB', x: 0, depth: 0, pen: 0, s };
}
// Return man: best open-field runner who isn't a key starter
function returner(g, s) {
  const T_ = g.side[s];
  const chosen = chartFirst(g, s, 'KR');
  if (chosen) return { p: chosen, slot: 'KR', name: 'KR', spot: 'RB', grp: 'RB', x: 0, depth: 0, pen: 0, s };
  let best = null, bs = -1e9;
  for (const p of T_.roster) {
    if (!p.a || !['RB', 'WRX', 'WRZ', 'SLOT', 'CB', 'NCB', 'FS', 'SS'].includes(p.spot)) continue;
    let sc = p.a.spd * 0.3 + p.a.bur * 0.2 + (p.a.elu || 30) * 0.25 + (p.a.vis || 30) * 0.15 + (p.a.bsec || 50) * 0.1;
    if (p.ovr >= 80) sc -= 6; // teams protect stars
    if (sc > bs) { bs = sc; best = p; }
  }
  return { p: best || T_.roster[0], slot: 'KR', name: 'KR', spot: 'RB', grp: 'RB', x: 0, depth: 0, pen: 0, s };
}
// Coverage-unit quality (backups who play special teams)
function coverUnitScore(g, s) {
  const T_ = g.side[s];
  const pool = T_.roster.filter(p => p.a && ['WLB', 'MLB', 'SS', 'FS', 'NCB', 'CB', 'RB', 'TEH'].includes(p.spot)).sort((a, b) => a.ovr - b.ovr).slice(0, 10);
  if (!pool.length) return 60;
  return avg(pool.map(p => (p.a.spd + (p.a.tkl || 40) + (p.a.bur || 50)) / 3));
}

// diminishing returns on rating gaps: big edges matter, but not linearly forever
function soft(x, cap) { return cap * Math.tanh(x / cap); }

// Effective attribute for an on-field player this snap
function ea(g, e, k) {
  const p = e.p;
  if (!p.a) return 45 + (p._gs || 0);
  let v = p.a[k] !== undefined ? p.a[k] : 25;
  const pool = ATTRS[k] ? ATTRS[k][3] : null;
  v = 70 + (v - 70) * (pool === 'pass' ? TUNE.spreadQB : TUNE.spread);
  v += p._gs || 0;
  const grp = ATTRS[k] ? ATTRS[k][2] : null;
  if (grp === 'T' || grp === 'M') v -= e.pen;
  if (grp === 'M') v -= (100 - pbOf(p)) * 0.05; // still thinking instead of playing
  if (e.bust) v -= 18; // blew the assignment
  const st = g.ps[p.id];
  if (st && st.fat > TUNE.fatFree) v -= (st.fat - TUNE.fatFree) * (grp === 'E' ? 0.8 : 0.35);
  return v;
}

// After each snap: on-field players tire, everyone else recovers
function tickFatigue(g, units) {
  const on = new Set();
  for (const e of units) {
    if (!e || !e.p || e.p.id < 0) continue;
    on.add(e.p.id);
    const st = g.ps[e.p.id];
    if (!st) continue;
    const load = FAT[e.grp] ? FAT[e.grp][0] : 0.5;
    const stam = e.p.h ? e.p.h.stam : 60;
    st.fat += load * (1.35 - stam / 100) * (1 + (e.p.wear || 0) * 0.02) * (e.extraLoad || 1);
    st.snp++;
    st.last = e.name;
    if (e.spot) { const sp = st.sp || (st.sp = {}); sp[e.spot] = (sp[e.spot] || 0) + 1; }
  }
  for (const id in g.ps) if (!on.has(+id)) { const st = g.ps[id]; st.fat = Math.max(0, st.fat - 1.25); }
}

// Depth chart as the engine sees it right now (for roster screens): 11 personnel, nickel + base defense, specialists
function depthView(tid) {
  const g = { tids: [tid, tid], side: [null, null], ps: {}, famPen: [0, 0], preview: true };
  initSide(g, 0);
  const front = defTend(T(tid)).front;
  return {
    off: offUnit(g, 0, '11', null), nickel: defUnit(g, 0, front, 'NICKEL', false), base: defUnit(g, 0, front, 'BASE', false),
    k: kickUnitPlayer(g, 0, 'K'), p: kickUnitPlayer(g, 0, 'P'),
  };
}
