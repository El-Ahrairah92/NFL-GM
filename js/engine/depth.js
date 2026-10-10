'use strict';
// =====================================================================
//  ENGINE · personnel, packages, depth charts, fatigue & rotation
//  docs/PLAYBOOK_SPEC.md §2, §5a/b · docs/DESIGN.md §3
// =====================================================================

// Engine calibration constants (Phase 4 tunes these against the target sheet)
const TUNE = {
  spread: 0.5,         // how much talent gaps matter: attributes are compressed toward the league mean on every snap
  spreadQBlow: 0.65,   // ...but the worst starters are still professionals: the bottom is not stretched
  spreadQB: 1.03,      // quarterbacking is not compressed: it is the most leveraged job on the field
  rust: 1.2,           // attribute points a man gives up in his first game if he did not play in August (half of it in his second)
  hfa: 0.3,            // home-field bonus, attribute points on every snap
  teamForm: 0.4,       // sd of team game-day form
  fatFree: 3.0,        // fatigue tolerated before it costs anything
  // trenches
  passProMedian: 4.41,  // seconds for an average rusher to beat an average blocker 1v1
  rushScale: 0.029,
  insideRush: 1.1,     // interior rushers take longer to get home than edges (crowded path, more double teams)    // how strongly the rush/block gap moves win time
  preKnow: 0,          // 1: the pre-snap read knows which receiver will come open, luck included; 0: it knows the matchup only
  preNoise: 0.3,       // how fuzzy that matchup read is
  quickScale: 1.3,       // the same for the quick game
  tbScale: 0.72,          // how long routes take to break and the quarterback takes to set up (1 = as designed)
  holdMax: 0.3,        // the longest he will stand in a clean pocket waiting for a downfield route
  procRead: 0.02,    // how much faster a sharp quarterback gets from one read to the next (per point of processing)
  lockOn: 0.02,       // chance per point below average that he stares down a covered first read and loses a beat
  placeYac: 0.028,     // ball placement: an accurate throw hits the receiver in stride, an off-target one makes him stop for it
  slipCap: 0.3,          // the most a carrier's elusiveness, burst, agility and vision can add up to on one tackle attempt (logit)
  lbRest: 0.22,           // how often the second linebacker sits out a series for the next man
  assistRate: 0.21,    // how often a second man is credited on a tackle that had no assist yet
  spill: 0.5,         // how often a run stopped by a lineman past the line is really finished by the second level
  dimeLong: 0.8, dimeMid: 0.45, // how often a defense goes to six defensive backs on third and long, and third and medium
  sackBase: 0.22,     // chance a pressured quarterback goes down, before the matchup
  sackShare: 0.4,      // how often two rushers who arrive together split the sack
  slideAt: 12,         // how badly a tackle has to be overmatched before the protection slides a guard out to help him
  doubleBonus: 17,     // pass-block points added by a second blocker
  chipBonus: 7,
  pickupMiss: 0.13,    // blitz/sim pickup failure for an average protection
  stuntMiss: 0.22,
  runWin: -0.28,        // logit: front defender beats his run block (average vs average)
  runScale: 0.12,
  comboBonus: 16,
  levRun: 5,            // run-block points for a blocker who starts a full step between his man and the play (and against one who has to cross his face)
  kickOut: 4,           // what a puller or lead back gives up kicking out a man set in the hole
  twoGapPen: 0.7,       // a man head-up on his blocker holds two gaps: he gets into the backfield this much as often
  slantPen: 1.35,       // a man slanting toward the play, or shooting a gap from depth, gets into the backfield this much more often
  reachRush: 2,         // pass-rush points per step a blocker has to travel beyond his first one to reach his man
  widePath: 0.12,       // seconds added per step a rusher lines up outside the tight end's spot
  deepPath: 0.02,       // seconds added per yard a blocked rusher starts off the ball
  offBall: 4,           // run-block points against a man who meets his blocker coming from off the line
  headUp: 3,            // pass-rush points an interior man gives up playing head-up on a blocker
  slantHit: 0.4,        // chance a slant crosses an average blocker's face cleanly
  slantWin: 9, slantLose: 4, // pass-rush points when it does, and when he runs himself into the block
  // coverage / passing
  openBase: -0.54,
  accScale: 0.042,      // how much ball placement decides whether a throw is catchable
  wrBlock: 12,         // receivers give up this many points to the corner they are blocking (they are not linemen)
  size: 1,             // master dial for every height and weight effect (0 switches them off)
  sizeFat: 0.02,       // extra fatigue per standard deviation of weight
  batBase: 0.017,      // chance a throw is batted at the line
  helpShort: 0.8, helpDeep: 0.12, // how often a second defender is close enough to clean up a missed tackle after the catch
  carrierW: 0.68,      // how much the runner's own skill moves a tackle attempt
  recWeight: 0.66,     // how much the receiver's own skill moves the window
  lbCover: 0.18,       // linebackers own zones that are open by design: their coverage skill moves the window less than a defensive back's
  openScale: 0.034,
  covWeight: 1.5,      // a defender's coverage skill counts this much more than the receiver's route skill
  holeBonus: 0.9,
  readTime: 0.34,
  catchBase: 2.05,
  shade: 0.4, // how hard defenses roll coverage toward the best receiver
  dropBase: 0.041,
  intBase: 0.0086,
  // tackling
  tackleBase: 2.3,
  tackleScale: 0.03,
  eluMiss: 0.012, eluMid: 70, burMiss: 0.016, visMiss: 0.014,
  burHole: 0.004, burGet: 0.035, burScreen: 0.1, // burst: the hole stays open for a quick back, he is on the linebackers sooner, and a screen is upfield before the defense turns // how much a carrier's elusiveness (and burst at the line) makes a tackler miss
  runAfter: 0.75,        // yards a back typically adds after first contact
  carryLoad: 3.8,      // how much more a carry tires a back than an ordinary snap
  pocketOpen: 1.2,
  shortOpen: 0.48,     // defenses give up the underneath
  deepStride: 1.5,       // a deep ball caught in stride: how much harder the trailing defender's tackle is
  routeMix: 0.75,       // how often the wide receivers trade routes on a call, so the deep route is not always the same man's
  deepSpeed: 0.27,     // how much of getting open deep is pure speed (the rest is route craft)
  intHelp: 0.45,        // share of interceptions made by a help defender (the safety over the top, the man sitting underneath)
  primPow: 2.2,        // how strongly the call is designed for the better receivers
  starLook: 0.16,      // how much the quarterback favours his best receiver, covered or not
  redZone: 1.25,        // how much tighter the windows get inside the 20
  goalStand: 1,        // how much harder a run is to finish with no field behind the defense
  safetyRun: -1.6,     // a safety coming down on a back who has cleared the second level: negative makes the tackle harder
  deepCatch: 2.3,     // how much harder a ball thrown 20+ yards is to put on a receiver
  deepCov: -0.3,      // deep routes start covered: they need time (or a beaten defender) to come open
  midCov: -0.8,     // separation a receiver gains per second the QB can hold the ball in a clean pocket
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
// Fronts are data. A man on the line is [name, job, side, technique]; a man off the ball is [name, job, x, depth].
// Side: 'S' is the offense's strong side (its right), 'W' the weak side. Technique is where he lines up:
// 0 head-up on the center, 1 a shade of him; 2i, 2, 3 inside, head-up and outside the guard; 4i, 4, 5 the same on the tackle;
// 7, 6, 9 the same on the tight end's spot; W9 wide of everyone. Names are unique within a front.
const TECH_X = { '0': 0, '1': 0.45, '2i': 0.75, '2': 1, '3': 1.35, '4i': 1.65, '4': 2, '5': 2.3, '7': 2.6, '6': 2.9, '9': 3.3, 'W9': 3.8 };
function techX(side, tech) { return (side === 'W' ? -1 : 1) * TECH_X[tech]; }
function techOf(x) { let best = '0'; for (const k in TECH_X) if (Math.abs(TECH_X[k] - Math.abs(x)) < Math.abs(TECH_X[best] - Math.abs(x))) best = k; return best; }
function frontRows(rows) { return rows.map(r => typeof r[2] === 'string' ? [r[0], r[1], techX(r[2], String(r[3])), r[4] || 0] : [r[0], r[1], r[2], r[3] || 0]); }
const lineEnds = t => [['LE', 'EDGE', 'W', t], ['RE', 'EDGE', 'S', t]];
const LINES = {
  '4-3': [lineEnds('7')[0], ['NT', 'NT', 'W', '1'], ['DT', 'DT', 'S', '3'], lineEnds('7')[1]],
  'Wide-9': [lineEnds('W9')[0], ['NT', 'NT', 'W', '1'], ['DT', 'DT', 'S', '3'], lineEnds('W9')[1]],
  '3-4': [['LOLB', 'EDGE', 'W', '9'], ['LDE', 'DE', 'W', '5'], ['NT', 'NT', 'S', '0'], ['RDE', 'DE', 'S', '5'], ['ROLB', 'EDGE', 'S', '9']],
  'Tite': [['LOLB', 'EDGE', 'W', '9'], ['LDE', 'DE', 'W', '4i'], ['NT', 'NT', 'S', '0'], ['RDE', 'DE', 'S', '4i'], ['ROLB', 'EDGE', 'S', '9']],
  // Bear: all three interior linemen covered, edges tight outside them
  'Bear': [['LE', 'EDGE', 'W', '9'], ['LT', 'DT', 'W', '3'], ['NT', 'NT', 'S', '0'], ['RT', 'DT', 'S', '3'], ['RE', 'EDGE', 'S', '9']],
  // Under: the line shifts to the weak side and the nose shades the center
  'Under': [['LE', 'EDGE', 'W', '5'], ['DT', 'DT', 'W', '3'], ['NT', 'NT', 'S', '1'], ['RE', 'EDGE', 'S', '5']],
  'GL': [['LE', 'EDGE', 'W', '6'], ['LT', 'DT', 'W', '3'], ['NT', 'NT', 'S', '0'], ['RT', 'DT', 'S', '3'], ['RE', 'EDGE', 'S', '6']],
  // sub packages are a four-man line whatever the base front: two edges and two interior rushers playing tackle technique.
  // (A 3-4 team's ends slide inside here as tackles; the job is DT, not base end.)
  'SUB': t => [lineEnds(t)[0], ['DT1', 'DT', 'W', '3'], ['DT2', 'DT', 'S', '3'], lineEnds(t)[1]],
};
// The eleven for a front and package, as [name, job, x, depth]. A front can also be handed in whole as { rows: [...] }:
// any number of men on the line in any technique, anyone else anywhere behind them.
function packageLayout(front, pkg) {
  if (front && front.rows) return frontRows(front.rows);
  const DB2 = [['CB1', 'CB', -4, 7], ['CB2', 'CB', 4, 7], ['FS', 'FS', -0.5, 13], ['SS', 'SS', 1.5, 9]];
  const odd = front === '3-4' || front === 'Tite';
  if (pkg === 'GL') return frontRows([...LINES.GL, ['WLB', 'WLB', -1.6, 3], ['MLB', 'MLB', 0, 3], ['SAM', 'SAM', 2.4, 3], ['CB1', 'CB', -4, 5], ['CB2', 'CB', 4, 5], ['SS', 'SS', 1, 6]]);
  // Bear: two linebackers stacked behind the covered interior
  if (pkg === 'BASE' && front === 'Bear') return frontRows([...LINES.Bear, ['WLB', 'WLB', -0.8, 4.5], ['MLB', 'MLB', 0.8, 4.5], ...DB2]);
  // Under: the strong-side linebacker walks up over the tight end
  if (pkg === 'BASE' && front === 'Under') return frontRows([...LINES.Under, ['WLB', 'WLB', -1.6, 5], ['MLB', 'MLB', 0.2, 5], ['SAM', 'SAM', 3.4, 1.5], ...DB2]);
  if (front === 'Bear' || front === 'Under') front = '4-3';
  if (pkg === 'BASE' && odd) return frontRows([...LINES[front], ['WLB', 'WLB', -0.9, 5], ['MLB', 'MLB', 0.9, 5], ...DB2]);
  if (pkg === 'BASE') return frontRows([...(LINES[front] || LINES['4-3']), ['WLB', 'WLB', -1.5, 5], ['MLB', 'MLB', 0, 5], ['SAM', 'SAM', 2.6, 4], ...DB2]);
  const dl = LINES.SUB(odd ? '6' : front === 'Wide-9' ? 'W9' : '7');
  if (pkg === 'NICKEL') return frontRows([...dl, ['WLB', 'WLB', -1.2, 5], ['MLB', 'MLB', 0.8, 5], ...DB2, ['NCB', 'NCB', 2.4, 6]]);
  return frontRows([...dl, ['WLB', 'WLB', 0, 5], ...DB2, ['NCB', 'NCB', 2.4, 6], ['DIME', 'DIME', -2.4, 6]]); // DIME
}

// fatigue: [per-snap load, threshold before rotation pressure]
const FAT = { QB: [0.25, 99], OL: [0.45, 14], RB: [0.9, 5.5], WR: [0.7, 4.3], TE: [0.7, 4.0], DL: [1.3, 2.0], LB: [0.6, 16], DB: [0.5, 18] };
// how hard fatigue pushes a player to the sideline (DL rotate by design)
const FAT_SLOPE = { QB: 1, OL: 1, RB: 1.6, WR: 1.8, TE: 2.6, DL: 4.0, LB: 1, DB: 1 };
// defensive lines play in waves: the gap between a starter and his backup counts for less than fresh legs
// planned rest: chance a starter at this spot sits out a given drive (coaches spell receivers and tight ends by series)
const REST_P = { X: 0.075, Z: 0.075, SLOT: 0.04, Y: 0.14 };
const ROT_GAP = { DL: 0.5, WR: 0.55, TE: 0.5 }; // receivers and tight ends get series off too

const GROUP_GUARD = { OL: 40, QB: 60 };
// The deep ball. How often it is called and how readily it is thrown follow the quarterback's arm: a coordinator with a big,
// accurate deep thrower calls more shots, and that quarterback lets it go to a man who is only a step open.
const DEEP = { base: 0.12, perPt: 0.03, lo: -0.5, hi: 0.6, mid: 0.3, shot: 0.45, shotArm: 0.8, call: 0.02, callLo: 0.45, callHi: 1.5, ref: 70 };
function deepArm(p, g) { if (!p || !p.a) return DEEP.ref; return g ? (ea(g, { p }, 'arm') + ea(g, { p }, 'dacc')) / 2 : ((p.a.arm || 60) + (p.a.dacc || 60)) / 2; }
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
  // the emergency quarterback: a third passer who did not dress may come in once the men ahead of him are hurt
  if (!g.pre && !T_.roster.some(p => p.pos === 'QB')) { const em = rosterOf(tid).filter(p => p.pos === 'QB' && !p.injury && !T_.active.has(p.id)).sort((a, b) => b.ovr - a.ovr)[0]; if (em) { T_.active.add(em.id); T_.roster.push(em); if (g.pbp) g.pbp.push({ q: g.q || 1, c: Math.max(0, Math.round(g.clock || 0)), t: tid, dd: '', x: `${T(tid).abbr} are down to the emergency quarterback: ${em.first} ${em.last} comes in` }); } }
  if (T_.roster.length < 22) { // emergency fillers so a decimated team can still line up
    let i = 0;
    while (T_.roster.length < 30) T_.roster.push({ id: -100 - s * 50 - (i++), first: 'Emergency', last: 'Sub' + i, spot: 'WRZ', pos: 'WR', lbl: '—', ovr: 40, tid, a: null, h: null });
  }
  T_.depth = {};
  for (const spot of SPOT_KEYS) {
    // only men from that side of the ball: when a club runs out of tight ends the next body is a lineman, not a defensive tackle
    const sd = SPOTS[spot].side;
    const guard = GROUP_GUARD[SPOTS[spot].g] || 0; // a tight end is not a tackle and only a quarterback is a quarterback, whatever the ratings say, while a real one is available
    T_.depth[spot] = T_.roster.filter(p => !p.a || (SPOTS[p.spot] && SPOTS[p.spot].side === sd)).map(p => ({ p, r: slotRating(p, spot) - (guard && p.a && p.pos !== SPOTS[spot].g ? guard : 0) })).filter(x => x.r > 25 - guard).sort((a, b) => b.r - a.r);
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
  const sameSide = spot => { const sd = SPOTS[spot] && SPOTS[spot].side, l = T_.roster.filter(p => !p.a || (SPOTS[p.spot] && SPOTS[p.spot].side === sd)); return l.length ? l : T_.roster; };
  const listFor = key => { if (!key) return null; for (const pk of opts.pkgKeys || []) { const l = chart.lists[pk + ':' + key]; if (l) return l; } return chart.lists[key] && chart.lists[key].length ? chart.lists[key] : null; };
  // everybody who starts somewhere in this grouping: the man who rotates in is the first one listed who is not already on the field
  const firsts = new Set();
  if (chart) for (const [name, slot] of slots) { const l = listFor(opts.keyOf(name, slot)); if (l) { const id = l.find(i => !firsts.has(i) && T_.roster.some(p => p.id === i)); if (id !== undefined) firsts.add(id); } }
  // exhibitions off your chart: each spot's man for the string on the field is spoken for first, so a player listed second at one spot
  // and third at another plays the first of those in the first half and the other after it
  const preOn = !!(g.pre && chart && !g.preview), prePos = (slot, grp) => grp === 'DB' ? (['FS', 'SS', 'BIGN'].includes(slot) ? 'S' : 'CB') : slot === 'FB' ? 'RB' : grp, preFeat = preOn ? prePlanFor(g.tids[s]).feat : {}, resv = new Map();
  if (preOn) for (const [name, slot] of slots) { const l = listFor(opts.keyOf(name, slot)); if (!l) continue; const str = preString(g.tids[s], g, prePos(slot, table[slot][1])), id = l[str]; if (id !== undefined && !resv.has(id) && (str === 0 || !firsts.has(id)) && T_.roster.some(p => p.id === id)) resv.set(id, name); }
  for (const [name, slot, x, depth] of slots) {
    const [spot, grp] = table[slot];
    let best = null, bs = -1e9;
    let cands = T_.depth[spot].length ? T_.depth[spot] : sameSide(spot).map(p => ({ p, r: 30 }));
    if (slot === 'QB' && !g.pre && !cands.some(c => c.p.pos === 'QB' && !used.has(c.p.id))) { const em = rosterOf(g.tids[s]).filter(p => p.pos === 'QB' && !p.injury && !onIR(p) && !T_.roster.includes(p)).sort((a, b) => b.ovr - a.ovr)[0];
      if (em) { T_.active.add(em.id); T_.roster.push(em); if (!g.ps[em.id]) g.ps[em.id] = { fat: 0, snp: 0, last: null }; const c = { p: em, r: slotRating(em, 'QB') }; T_.depth.QB = [c, ...T_.depth.QB]; cands = T_.depth.QB; if (g.pbp) g.pbp.push({ q: g.q || 1, c: Math.max(0, g.clock || 0), t: `${pshort(em)} comes in as the emergency quarterback`, s: g.score ? g.score.slice() : [0, 0] }); } }
    // your depth chart: listed players come first (in order); fatigue can still force a sub, and #2 gets his rotation share
    const key = chart ? opts.keyOf(name, slot) : null;
    // a package can have its own order at a spot (your nickel linebacker need not be your base one); otherwise the base order
    const list = listFor(key);
    let rotHit = false, rotId = null;
    const preStr = preOn && list ? preString(g.tids[s], g, prePos(slot, grp)) : null;
    if (list) {
      const listed = list.map(id => T_.roster.find(p => p.id === id)).filter(Boolean).filter(p => !cands.some(c => c.p === p)).map(p => ({ p, r: slotRating(p, spot) }));
      if (listed.length) cands = [...listed, ...cands];
      rotHit = g.preview || g.pre ? false : opts.rot ? opts.rot(key) : rand() < rotOf(chart, ROT_BAND[key] || !opts.rotKeyOf ? key : opts.rotKeyOf(name)); // a preview shows the order as set, never a random rotation snap
      if (rotHit) rotId = list.find((id, i) => i >= 1 && !firsts.has(id) && !used.has(id) && T_.roster.some(p => p.id === id));
    }
    for (const c of cands) {
      if (used.has(c.p.id)) continue;
      let sc = c.r * (ROT_GAP[grp] || 1) - fatPenalty(g, c.p, grp);
      if (list) { const i = list.indexOf(c.p.id);
        if (i >= 0 && preStr !== null) { const j = preFeat[c.p.id] ? Math.max(i, preStr) : i, sits = j < preStr || (preStr > 0 && firsts.has(c.p.id) && !preFeat[c.p.id]); sc = (sits ? 15 - j : 300 - (j - preStr) * 20) - fatPenalty(g, c.p, grp); } // exhibitions: the man listed for this string, then deeper; men above it only if nobody else can line up
        else if (i >= 0) sc = 300 - i * 14 * (ROT_GAP[grp] || 1) - fatPenalty(g, c.p, grp) + (c.p.id === rotId ? 30 + i * 14 * (ROT_GAP[grp] || 1) : 0);
        else if (preStr !== null && preStr > 0 && firsts.has(c.p.id)) sc -= 200;
        if (preStr !== null && resv.has(c.p.id) && resv.get(c.p.id) !== name) sc -= 400; } // a starter does not fill in somewhere else while he is supposed to be sitting
      if (T_.rest && T_.rest.has(c.p.id)) sc -= 40; // a planned series off
      if (g.pbNeed && slot !== 'QB' && c.p.a) { const k = pbOf(c.p), need = g.pbNeed[s]; if (k < need) sc -= (need - k) * 0.3; } // he does not know this call
      if (g.ps[c.p.id] && g.ps[c.p.id].last === name) sc += 1.5; // continuity: no needless shuffling
      if (opts.score && !list) sc += opts.score(c.p, slot);
      if (sc > bs) { bs = sc; best = c; }
    }
    if (!best) { const pool = sameSide(spot).filter(p => !used.has(p.id) && p.pos !== 'K' && p.pos !== 'P' && (slot === 'QB' || p.pos !== 'QB')).sort((a, b) => (b.a ? slotRating(b, spot) : 20) - (a.a ? slotRating(a, spot) : 20)); best = { p: pool[0] || T_.roster.find(p => !used.has(p.id)) || T_.roster[0], r: 30 }; }
    used.add(best.p.id);
    const pen = best.p.a ? comfortPen(best.p, spot) : 0; // how well he knows this spot; his own attributes do the rest
    out.push({ p: best.p, slot, name, spot, grp, x, depth: depth || 0, pen, s });
  }
  return out;
}
// how much a playbook spreads the backfield work: 0 = one workhorse, 1 = a full committee
function rbLean(g, s) { const ot = g.cx && g.cx[s] && g.cx[s].ot; return clamp((0.8 - (ot && ot.rb1 !== undefined ? ot.rb1 : 0.65)) / 0.3, 0, 1); }
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
    if (p.spot !== 'RB') return p.spot === 'FB' ? -14 : -8; // a receiver in the backfield is a gadget, not a feature back
    // the right back for the down: hands and protection on passing downs, strength and balance on short yardage
    // How readily he is swapped out follows the playbook: a system built around one back keeps him in unless the other man is far better at it; a committee system swaps freely.
    const lean = rbLean(g, s);
    const sit = call && call.passDown ? ((ea0(p, 'hnd') + ea0(p, 'pbk') + ea0(p, 'rte')) / 3 - 60) * (0.45 + lean * 0.9) : g.togo <= 2 && (g.down >= 3 || g.ydl >= 98) ? ((ea0(p, 'str') + ea0(p, 'bal')) / 2 - 70) * (0.5 + lean * 2.0) : 0;
    if (!T_.rb2Turn) return sit;
    // committee series: the No. 2 back gets his drive unless he's hopelessly outclassed
    const backs = T_.depth.RB.filter(x => x.p.spot === 'RB');
    const rb2 = backs[T_.rb3Turn && backs[2] && backs[1].r - backs[2].r <= 14 ? 2 : 1]; // the third back gets the odd series
    // even a star gets spelled, and the series that belongs to the next man stays his on passing downs too: a workhorse does not come back in for every third and long
    return sit + (rb2 && p.id === rb2.p.id && backs[0].r - rb2.r <= 45 ? backs[0].r - rb2.r + 2 : 0);
  };
  const chart = userChart(g, s, 'off');
  if (!chart) return fillSlots(g, s, slots, OFF_SLOT, { score: rbScore });
  const shortYd = g.togo <= 2 && (g.down >= 3 || g.ydl >= 98);
  const rbKey = call && call.passDown && hasList(chart, 'RB3D') ? 'RB3D' : shortYd && hasList(chart, 'RBSY') ? 'RBSY' : 'RB';
  return fillSlots(g, s, slots, OFF_SLOT, {
    score: rbScore, chart, pkgKeys: [pers], keyOf: name => name === 'RB' ? rbKey : name,
    rot: key => key === 'RB' ? !!T_.rb2Turn : rand() < rotOf(chart, key),
  });
}
// ---------- user depth charts (t.dch): lists by chart key, #2 rotation share, auto per unit ----------
const DEF_CHART_KEY = { LE: 'EDGE1', LOLB: 'EDGE1', RE: 'EDGE2', ROLB: 'EDGE2', DT1: 'IDL1', LDE: 'IDL1', LT: 'IDL1', DT2: 'IDL2', RDE: 'IDL2', DT: 'IDL2', RT: 'IDL2',
  NT: 'NT', WLB: 'WLB', MLB: 'MLB', SAM: 'SAM', CB1: 'CB1', CB2: 'CB2', NCB: 'NCB', DIME: 'DIME', FS: 'FS', SS: 'SS' };
const CHART_SPOT = { QB: 'QB', RB: 'RB', RB3D: 'RB', RBSY: 'RB', FB: 'FB', X: 'WRX', Z: 'WRZ', SLOT: 'SLOT', SLOT2: 'SLOT', Y: 'TEY', H: 'TEH', Y2: 'TEY', OL6: 'RT',
  LT: 'LT', LG: 'LG', C: 'C', RG: 'RG', RT: 'RT', EDGE1: 'EDGE', EDGE2: 'EDGE', IDL1: 'DT', IDL2: 'DT', NT: 'NT', RUSH: 'EDGE', MLB: 'MLB', WLB: 'WLB', SAM: 'WLB',
  CB1: 'CB', CB2: 'CB', NCB: 'NCB', DIME: 'NCB', FS: 'FS', SS: 'SS', K: 'K', P: 'P', KR: 'RB', PRET: 'RB', KO: 'SS', KRU: 'TEH', PU: 'SS', PRU: 'CB', RUSHE: 'EDGE', RUSHI: 'DT', BIGN: 'SS' };
const baseKey = k => { const i = k.indexOf(':'); return i < 0 ? k : k.slice(i + 1); }; // 'NICKEL:MLB' -> 'MLB'
const CHART_UNIT = k0 => { const k = baseKey(k0); return ['K', 'P', 'KR', 'PRET', 'KO', 'KRU', 'PU', 'PRU'].includes(k) ? 'st' : ['EDGE1', 'EDGE2', 'IDL1', 'IDL2', 'NT', 'RUSH', 'RUSHE', 'RUSHI', 'MLB', 'WLB', 'SAM', 'CB1', 'CB2', 'NCB', 'DIME', 'FS', 'SS', 'BIGN'].includes(k) ? 'def' : 'off'; };
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
  // the rush specialists rotate at the rate set for the spot they are standing in
  return fix(fillSlots(g, s, layout, DEF_SLOT, { score, chart, pkgKeys, rotKeyOf: name => DEF_CHART_KEY[name] || name, keyOf: (name, slot) => {
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
function returner(g, s, punt) {
  const T_ = g.side[s];
  const chosen = (punt && chartFirst(g, s, 'PRET')) || chartFirst(g, s, 'KR');
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
// ---- body: how big he is for his position ----
// w: weight, h: height, len: reach (height and arm length), each in standard deviations from the norm at his own spot.
// Everything below is a trade: mass anchors and drives but is slower to move; length keeps blockers off and closes
// throwing lanes but plays high. Centred on each position's norm, so the league averages do not move.
const NO_BODY = { w: 0, h: 0, len: 0 }, BODY_CACHE = new WeakMap(); // kept off the player so it never reaches a save
function bod(e) {
  const p = e && e.p;
  if (!p || !p.m || !p.spot || !SPOTS[p.spot]) return NO_BODY;
  const c = BODY_CACHE.get(p);
  if (c && c.s === p.spot && c.wt === p.m.wt && c.ht === p.m.ht) return c;
  const b = SPOTS[p.spot].body, w = clamp((p.m.wt - b[2]) / b[3], -2.5, 2.5), h = clamp((p.m.ht - b[0]) / b[1], -2.5, 2.5);
  const arm = clamp(((p.m.arm || b[4]) - (b[4] + (p.m.ht - b[0]) * 0.35)) / 0.6, -2.5, 2.5); // arms long or short for his height
  const v = { s: p.spot, wt: p.m.wt, ht: p.m.ht, w, h, len: clamp(h * 0.65 + arm * 0.35, -2.5, 2.5) };
  BODY_CACHE.set(p, v); return v;
}
function ea(g, e, k) {
  const p = e.p;
  if (!p.a) return 45 + (p._gs || 0);
  let v = p.a[k] !== undefined ? p.a[k] : 25;
  const pool = ATTRS[k] ? ATTRS[k][3] : null;
  v = 70 + (v - 70) * (pool === 'pass' ? (v < 70 ? TUNE.spreadQBlow : TUNE.spreadQB) : TUNE.spread);
  v += p._gs || 0;
  if (p.rust) v -= p.rust * TUNE.rust;
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
    st.fat += load * (1.35 - stam / 100) * (1 + (e.p.wear || 0) * 0.02) * (e.extraLoad || 1) * (1 + bod(e).w * TUNE.sizeFat); // a heavier man tires sooner
    st.snp++;
    if (g.pre) { const sq = st.sq || (st.sq = [0, 0, 0]); sq[g.q <= 1 ? 0 : g.q === 2 ? 1 : 2]++; }
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
// Newer modules are pulled in from here rather than listed in index.html, so a browser holding an older copy of that page still loads a complete game.
if (typeof document !== 'undefined' && typeof ST_KEYS === 'undefined') document.write('<script src="js/engine/teams.js?v=' + Date.now() + '"></script>');
