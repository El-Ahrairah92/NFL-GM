'use strict';
// =====================================================================
//  ENGINE · trenches
//  The line of scrimmage is geometry. Every man has a spot (x across the formation, depth off the ball) and, on the
//  snap, a place he is going. Blocking is worked out from that alone, so any front can line up against any offense:
//    count the threats → pair blockers with them left to right (linemen cannot run through each other) →
//    spare blockers double, backs pick up or chip, whoever is left over comes free →
//    each pairing is decided by the two players and by who has the angle.
//  docs/DESIGN.md §41
// =====================================================================
function lgt(x) { return 1 / (1 + Math.exp(-x)); }
function lgtP(p) { return Math.log(p / (1 - p)); }

// ---------- geometry ----------
// A pressure plan says who is coming and how. Any of its parts may be left out:
//   rush:  names of the men who rush the passer (everyone else drops)
//   slant: { name: -1 | +1 }   one gap toward the offense's left or right on the snap
//   twist: [[penetrator, looper]]   two rushers trading lanes
//   gap:   { name: x }   where a blitzer from depth hits the line
const ON_LINE = 1.2; // closer to the ball than this and he is a man on the line, whatever his job is called
// the men on the line; a front with nobody up there still has someone nearest the ball
function lineMen(def) { const l = def.filter(e => e.depth < ON_LINE); return l.length ? l : def.slice().sort((a, b) => a.depth - b.depth).slice(0, 4); }
function applyPlan(def, dc) {
  const pl = dc && dc.plan; if (!pl) return;
  for (const e of def) {
    if (pl.slant && pl.slant[e.name]) e.mv = pl.slant[e.name];
    if (pl.gap && pl.gap[e.name] !== undefined) e.gapX = pl.gap[e.name];
    if (pl.rush && e.depth >= ON_LINE && pl.rush.includes(e.name)) e.blitz = true;
  }
}
// where he crosses the line of scrimmage
function rushPoint(e) { return e.gapX !== undefined ? e.gapX : e.x + (e.mv || 0) * 0.9; }
// Pair blockers with threats, both sorted left to right, keeping that order. cost(b, t) is how far the blocker has to go
// (Infinity if he cannot get there); leave(t) is what it costs to let that threat go unblocked.
function lineMatch(bs, ts, cost, leave) {
  const n = bs.length, m = ts.length, D = [], C = [];
  for (let i = 0; i <= n; i++) D.push(new Array(m + 1).fill(0));
  for (let j = 1; j <= m; j++) D[0][j] = D[0][j - 1] + leave(ts[j - 1]);
  for (let i = 1; i <= n; i++) { C.push([]); for (let j = 1; j <= m; j++) {
    const c = cost(bs[i - 1], ts[j - 1]); C[i - 1][j - 1] = c;
    D[i][j] = Math.min(D[i - 1][j - 1] + c, D[i - 1][j], D[i][j - 1] + leave(ts[j - 1]));
  } }
  const pairs = []; let i = n, j = m;
  while (i > 0 && j > 0) {
    if (D[i][j] === D[i - 1][j - 1] + C[i - 1][j - 1]) { pairs.push([bs[i - 1], ts[j - 1]]); i--; j--; }
    else if (D[i][j] === D[i - 1][j]) i--; else j--;
  }
  return pairs;
}

// ---------- who rushes ----------
// Returns { rushers: [entries], droppers: [entries] } for the defense's pressure call
function chooseRushers(g, def, dc) {
  applyPlan(def, dc);
  if (dc.plan && dc.plan.rush) { const rush = def.filter(e => dc.plan.rush.includes(e.name)); return { rushers: rush, droppers: def.filter(e => !rush.includes(e)) }; }
  const line = def.filter(e => e.depth < ON_LINE).sort((a, b) => a.x - b.x);
  const others = def.filter(e => e.depth >= ON_LINE);
  const prRate = e => ea(g, e, 'prsh') * 0.6 + ea(g, e, 'bur') * 0.4;
  let rush = line.slice(), drop = [];
  const dropWeakEdge = () => {
    const edges = rush.filter(e => e.slot === 'EDGE' || e.slot === 'DE'), pool = edges.length ? edges : rush; // no edge to drop: the weakest rusher on the line does
    if (!pool.length) return;
    const w = pool.slice().sort((a, b) => prRate(a) - prRate(b))[0];
    rush = rush.filter(e => e !== w); drop.push(w);
  };
  while (rush.length > 4) dropWeakEdge();
  if (dc.pres === 'THREE') dropWeakEdge();
  if (dc.pres === 'SIM' || dc.pres === 'FZ') dropWeakEdge(); // a lineman drops out: he is in coverage now
  const nBlitz = dc.pres === 'BLITZ' ? (dc.cov === 'C0' ? 2 : 1) : dc.pres === 'FZ' ? 2 : dc.pres === 'SIM' ? 1 : 0;
  const cands = others.filter(e => ['MLB', 'WLB', 'SAM', 'NCB', 'SS', 'DIME'].includes(e.slot));
  for (let i = 0; i < nBlitz && cands.length; i++) {
    const w = cands.map(e => Math.max(5, prRate(e) - 30) * (e.slot === 'MLB' || e.slot === 'WLB' || e.slot === 'SAM' ? (dc.runBlitz ? 2.5 : 1.6) : 1));
    const b = weightedPick(cands, w);
    cands.splice(cands.indexOf(b), 1);
    b.blitz = true; rush.push(b);
  }
  return { rushers: rush, droppers: [...drop, ...others.filter(e => !rush.includes(e))] };
}

// ---------- pass protection ----------
function rushVsBlock(g, r, b, oNet) {
  const R = bod(r), B = bod(b), z = TUNE.size;
  // a rusher: length wins the edge, mass wins the bull rush; heavy is slow around the corner, tall plays high
  const speed = ea(g, r, 'prsh') * 0.55 + ea(g, r, 'bur') * 0.25 + ea(g, r, 'agi') * 0.2 + (R.len * 1.8 - R.w * 0.5) * z;
  const power = ea(g, r, 'prsh') * 0.55 + ea(g, r, 'str') * 0.45 + (R.w * 2.4 - R.h * 0.3) * z;
  // a blocker: long arms keep a speed rusher off him, mass anchors against power; heavy feet lose the edge, a tall man gets walked back
  const vsSpeed = ea(g, b, 'pbk') * 0.65 + ea(g, b, 'agi') * 0.2 + ea(g, b, 'bawr') * 0.15 + (B.len * 1.8 - B.w * 0.4) * z;
  const vsPower = ea(g, b, 'pbk') * 0.55 + ea(g, b, 'str') * 0.45 + (B.w * 2.6 - B.h * 0.3) * z;
  return Math.max(speed - vsSpeed, power - vsPower) - oNet;
}
// Returns { rushers: [{e, rx, t, blockers:[], free}], tPress, first }
function passProtection(g, off, def, oc, dc, extraProtect) {
  const o = g.poss, d = 1 - o, cx = g.cx[o];
  const { rushers, droppers } = chooseRushers(g, def, dc);
  const helpers = extraProtect.slice(); // RB / TE kept in
  const qbE = off.find(e => e.slot === 'QB');
  // the protection's front: the five linemen and any tight end or extra lineman kept in next to them
  const surf = off.filter(e => OL_SLOTS.includes(e.slot) || (INLINE.has(e.slot) && helpers.includes(e))).sort((a, b) => a.x - b.x);
  for (const e of surf) { const i = helpers.indexOf(e); if (i >= 0) helpers.splice(i, 1); }
  const assign = rushers.map(r => ({ e: r, rx: rushPoint(r), blockers: [], free: false, t: 9 }));
  // The protection call. The line counts who is showing rush on each side of the center and slides toward the bigger number:
  // going with the slide a lineman can cover two men's width, against it barely his own gap. With no slide he reaches a step and a half.
  // The man on each end can always kick out to anyone wide of him. So an overload the offense can see gets picked up, and one it
  // cannot see (men coming from depth, or from the side it slid away from) does not.
  const shown = def.filter(e => e.depth < 2.2), slide = Math.sign(shown.filter(e => e.x > 0.25).length - shown.filter(e => e.x < -0.25).length);
  const last = surf.length - 1;
  const cost = (b, a) => { const dx = a.rx - b.x, i = surf.indexOf(b), lim = (i === 0 && dx < 0) || (i === last && dx > 0) ? 4 : !slide ? 1.4 : Math.sign(dx) === slide ? 2 : 1.1; return Math.abs(dx) <= lim ? Math.abs(dx) : Infinity; };
  const leave = a => 10 - Math.abs(a.rx) * 0.5 - (a.e.blitz ? 1 : 0);
  const free = surf.slice();
  for (const [b, a] of lineMatch(surf, assign.slice().sort((x, y) => x.rx - y.rx), cost, leave)) { a.blockers.push(b); free.splice(free.indexOf(b), 1); }
  // a back picks up whoever the line could not get to, inside man first
  for (const a of assign.filter(a => !a.blockers.length).sort((x, y) => Math.abs(x.rx) - Math.abs(y.rx))) {
    const b = helpers.find(x => x.slot === 'RB' || x.slot === 'FB');
    if (b) { a.blockers.push(b); helpers.splice(helpers.indexOf(b), 1); }
  }
  // spare linemen double the most dangerous rusher near them; spare backs chip edges
  // a linebacker standing in a gap holds the lineman in front of him for a beat even if he drops out: that lineman is late to help anyone else
  const mugs = def.filter(e => e.depth >= ON_LINE && e.depth < 2.2 && !rushers.includes(e));
  for (const b of free) {
    if (mugs.some(e => Math.abs(e.x - b.x) <= 1.2) && rand() < TUNE.mugHold) continue;
    // his neighbours, and also an edge rusher further out whose tackle cannot handle him alone: the protection slides that way
    const near = assign.filter(a => a.blockers.length === 1 && (Math.abs(a.rx - b.x) <= 1.6 || (!a.e.blitz && Math.abs(a.e.x) >= 2 && rushVsBlock(g, a.e, a.blockers[0], 0) >= TUNE.slideAt)));
    if (!near.length) continue;
    near.sort((x, y) => rushVsBlock(g, y.e, y.blockers[0], 0) - rushVsBlock(g, x.e, x.blockers[0], 0));
    const a = near[0]; a.blockers.push(b); a.doubled = true;
    if (rushVsBlock(g, a.e, a.blockers[1], 0) < rushVsBlock(g, a.e, a.blockers[0], 0)) a.blockers.reverse(); // the better blocker has him, the other helps
  }
  for (const h of helpers) {
    const edge = assign.filter(a => Math.abs(a.e.x) >= 2 && a.blockers.length === 1).sort((x, y) => rushVsBlock(g, y.e, y.blockers[0], 0) - rushVsBlock(g, x.e, x.blockers[0], 0))[0];
    if (edge) edge.chip = h;
  }
  // pickup checks: blitzers, simulated pressure and stunts test the protection's awareness
  const design = clamp(designKnob(T(g.tids[d]), 'presD') - designKnob(T(g.tids[o]), 'passD'), -35, 35) * 0.0022;
  // how much of a surprise each thing still is: something this defense has done on a quarter of today's snaps is the ordinary amount
  const fresh = (k, usual) => clamp(1.45 - 1.8 * seenShare(g, d, k, usual), 0.15, 1.3) / clamp(1.45 - 1.8 * usual, 0.15, 1.3);
  // A man coming from depth is a surprise. A man standing up near the line is one only as far as the look lied: if everyone who showed came, the count was right.
  const standing = def.filter(e => e.depth >= ON_LINE && e.depth < 2.2), bluff = standing.length ? standing.filter(e => !rushers.includes(e)).length / standing.length : 0;
  for (const a of assign) {
    if (!a.blockers.length) { a.free = true; continue; }
    if (a.e.blitz) {
      const b = a.blockers[0];
      const p = (standing.includes(a.e) ? bluff : 1) * fresh('blitz', 0.25) * lgt(lgtP(TUNE.pickupMiss) + design + (dc.pres === 'SIM' ? 0.45 : dc.pres === 'FZ' ? 0.12 : 0) - (ea(g, b, 'bawr') - 65) * 0.03 - (ea(g, qbE, 'proc') - 70) * 0.015);
      if (rand() < p) { a.free = true; a.missed = true; }
    }
  }
  // twists: the looper comes free if the two blockers do not pass them off
  const blocked = a => a && !a.free && a.blockers.length;
  const twists = [];
  if (dc.plan && dc.plan.twist) { for (const [pn, ln] of dc.plan.twist) { const p = assign.find(a => a.e.name === pn), l = assign.find(a => a.e.name === ln); if (blocked(p) && blocked(l)) twists.push([p, l]); } }
  else if (dc.stunt) {
    const inside = assign.filter(a => !a.e.blitz && blocked(a) && Math.abs(a.rx) < 2.5).sort((a, b) => Math.abs(a.rx) - Math.abs(b.rx)).slice(0, 2);
    if (inside.length >= 2) { inside.sort((a, b) => ea(g, b.e, 'agi') - ea(g, a.e, 'agi')); twists.push([inside[1], inside[0]]); }
  }
  for (const [pen, loop] of twists) {
    const aw = avg([pen, loop].map(a => ea(g, a.blockers[0], 'bawr')));
    if (rand() < fresh('twist', 0.22) * lgt(lgtP(TUNE.stuntMiss) + design - (aw - 65) * 0.04)) { loop.free = true; loop.stuntWin = true; }
    else { pen.stuntDelay = 0.15; loop.stuntDelay = 0.15; }
  }
  // slants: a rusher who crosses a blocker's face wins quickly if that blocker is slow to see it, and runs himself into the block if not
  for (const a of assign) {
    if (!a.e.mv || !blocked(a)) continue;
    const b = a.blockers[0];
    a.slant = rand() < fresh(a.e.mv < 0 ? 'sl0' : 'sl1', 0.15) * lgt(lgtP(TUNE.slantHit) + design - (ea(g, b, 'bawr') - 65) * 0.04) ? TUNE.slantWin : -TUNE.slantLose;
  }
  // time for each rusher to get home
  const oNet = cx.pb;
  for (const a of assign) {
    const r = a.e;
    if (a.free) {
      a.t = (a.stuntWin ? 1.45 : 1.05 + r.depth * 0.07) + Math.abs(a.rx - (qbE ? qbE.x : 0)) * 0.06 + (75 - ea(g, r, 'bur')) * 0.01 + gauss(0, 0.12);
    } else {
      const b = a.blockers[0];
      let diff = rushVsBlock(g, r, b, oNet);
      if (a.blockers.length > 1) diff -= TUNE.doubleBonus + (ea(g, a.blockers[1], 'pbk') - 70) * 0.3;
      if (a.chip) diff -= TUNE.chipBonus * clamp(0.55 + (ea(g, a.chip, 'pbk') * 0.6 + ea(g, a.chip, 'str') * 0.4 - 50) / 45, 0.4, 1.5);
      // the angle: a blocker who has to go a long way to his man gives up the corner; a man head-up on a blocker is reading, not rushing
      diff += Math.max(0, Math.abs(b.x - a.rx) - 0.9) * TUNE.reachRush + (a.slant || 0);
      if (r.depth < ON_LINE && !r.mv && Math.abs(b.x - r.x) < 0.2 && Math.abs(r.x) < 2.2) diff -= TUNE.headUp;
      else if (r.depth < ON_LINE && !r.mv) diff -= Math.abs(r.x) < 0.95 ? TUNE.shadeRush : Math.abs(r.x) >= 2 && Math.abs(r.x) < 2.45 ? TUNE.tightRush : 0; // shaded inside the guard he is lined up to stop the run; tight on the tackle he has no room to turn the corner
      const med = TUNE.passProMedian * Math.exp(-soft(diff, 14) * TUNE.rushScale);
      a.t = med * Math.exp(gauss(0, 0.38)) * (Math.abs(r.x) < 2 ? TUNE.insideRush : 1) + (a.chip ? 0.25 : 0) + (a.stuntDelay || 0) // the inside path to the QB is the crowded one
        + Math.max(0, Math.abs(a.rx) - 2.9) * TUNE.widePath + r.depth * TUNE.deepPath; // the widest path is the longest, and a man coming from depth has ground to cover first
    }
    a.t = Math.max(0.75, a.t);
  }
  assign.sort((a, b) => a.t - b.t);
  return { rushers: assign, droppers, tPress: assign.length ? assign[0].t : 9, first: assign[0] };
}
function defCallerOrDC(g, s) { const t = T(g.tids[s]); return C(t.dc) || defCaller(t); }

// ---------- run blocking ----------
// Who is in the box, who blocks whom, and how each front defender fares.
function runBlocking(g, off, def, oc, dc, target, carrierSlot) {
  const o = g.poss, cx = g.cx[o];
  const zone = oc.scheme === 'ZONE', side = Math.sign(target) || 1;
  const singleHigh = dc.cov === 'C1' || dc.cov === 'C3' || dc.cov === 'C0';
  applyPlan(def, dc);
  // box defenders: everyone on the line, linebackers, and a safety rotated down in single-high
  const box = def.filter(e => e.depth <= 5.5 && !(e.slot === 'CB' && Math.abs(e.x) > 3.5)).map(e => ({ e, px: e.blitz ? rushPoint(e) : e.x + (e.mv || 0) * 0.8, lvl: e.depth < ON_LINE || e.blitz ? 1 : 2 }));
  if (singleHigh || dc.pkg === 'GL') { const ss = def.find(e => e.slot === 'SS'); if (ss && !box.some(b => b.e === ss)) box.push({ e: ss, px: ss.x, lvl: 2, rotated: true }); }
  // blockers
  const ol = off.filter(e => OL_SLOTS.includes(e.slot) || e.slot === 'OL6').map(e => ({ e, used: false }));
  const tes = off.filter(e => INLINE.has(e.slot) && e.slot !== 'OL6').map(e => ({ e, used: false }));
  const lead = off.filter(e => e.slot === 'FB' || (carrierSlot === 'QB' && e.slot === 'RB')).map(e => ({ e, used: false }));
  const blk = [...ol, ...tes, ...lead];
  const res = box.map(b => ({ ...b, blockers: [], state: 'free' }));
  const fronts = res.filter(r => r.lvl === 1), seconds = res.filter(r => r.lvl === 2).sort((a, b) => Math.abs(a.px - target) - Math.abs(b.px - target));
  // gap schemes pull the backside guard to the point of attack; the men next to him have to cover for it
  const puller = zone ? null : ol.find(b => (b.e.slot === 'LG' || b.e.slot === 'RG') && Math.sign(b.e.x) !== side);
  if (puller) { puller.used = true; puller.pulling = true; }
  // the line takes the front by alignment. If somebody has to be let go it is the man farthest from the play.
  const line = [...ol, ...tes].filter(b => !b.pulling).sort((a, b) => a.e.x - b.e.x);
  const cost = (b, r) => { const dx = Math.abs(r.px - b.e.x); return dx <= 1.6 ? dx : Infinity; };
  for (const [b, r] of lineMatch(line, fronts.slice().sort((a, b) => a.px - b.px), cost, r => 10 - Math.abs(r.px - target) * 0.5)) { b.used = true; r.blockers.push(b.e); r.state = 'blocked'; }
  // a man left unblocked at the point of attack is kicked out by the puller or the lead blocker; one left behind the play is the backside's problem
  const kickers = [puller, ...lead].filter(Boolean);
  for (const r of fronts.filter(r => r.state === 'free').sort((a, b) => Math.abs(a.px - target) - Math.abs(b.px - target))) {
    if (Math.sign(r.px) !== side && Math.abs(r.px - target) > 1.2) { r.backside = true; continue; }
    const k = Math.abs(r.px - target) <= 2 ? kickers.find(k => !k.kicked) : null;
    if (k) { k.kicked = true; k.used = true; r.blockers.push(k.e); r.state = 'blocked'; r.kick = true; }
  }
  // spare linemen: zone combos on the playside front, climbing to linebackers
  for (const b of ol.filter(b => !b.used)) {
    const r = fronts.filter(r => r.state === 'blocked' && !r.kick && r.blockers.length === 1 && Math.abs(r.px - b.e.x) <= 1.3)
      .sort((a, b2) => Math.abs(a.px - target) - Math.abs(b2.px - target))[0];
    if (r && zone) { r.blockers.push(b.e); r.combo = true; b.used = true; }
  }
  // second level: climbers from combos, pullers, the fullback, any unused blockers
  const climbers = [];
  for (const r of fronts) if (r.combo) climbers.push({ e: r.blockers[1], fromCombo: r });
  for (const b of blk) if (!b.used) climbers.push({ e: b.e, lead: b.e.slot === 'FB' || b.e.slot === 'RB' });
  if (puller && !puller.kicked) climbers.push({ e: puller.e, puller: true });
  // blockers climb to the linebackers they counted before the snap; a safety who rotated down late is more often the man nobody has
  if (rand() < TUNE.rotLast) seconds.sort((a, b) => (a.rotated ? 1 : 0) - (b.rotated ? 1 : 0));
  for (const r of seconds) {
    const c = climbers.filter(c => !c.used).sort((a, b) => Math.abs(a.e.x - r.px) - Math.abs(b.e.x - r.px))[0];
    if (!c) continue;
    c.used = true; r.blockers.push(c.e); r.state = 'blocked'; r.climb = c;
  }
  const dNet = cx.rb;
  for (const r of res) {
    const e = r.e;
    const E = bod(e), zs = TUNE.size;
    // against zone the defender has to move (weight hurts, length helps him play off the block); against gap runs he has to hold (mass and low pads)
    const shedScore = ea(g, e, 'shed') * 0.5 + (zone ? (ea(g, e, 'bur') * 0.25 + ea(g, e, 'agi') * 0.25) : ea(g, e, 'str') * 0.5) + (zone ? E.len * 1.2 - E.w * 0.4 : E.w * 2.4 - E.h * 0.3 + E.len * 0.4) * zs;
    if (r.state === 'free') { r.win = 1; continue; }
    const b = r.blockers[0];
    const wideRun = Math.abs(target) >= 2.2; // reaching a defender on a run to the edge is a foot race
    let block = ea(g, b, 'rbk') * 0.5 + (zone ? ea(g, b, 'agi') : ea(g, b, 'str')) * 0.27 + ea(g, b, 'bawr') * 0.13 + ea(g, b, 'bur') * (wideRun ? 0.04 : 0.1) + (wideRun ? ea(g, b, 'spd') * 0.06 : 0) + dNet + (zone ? bod(b).len * 0.6 - bod(b).w * 0.3 : bod(b).w * 2.4 - bod(b).h * 0.3) * zs; // get-off, then feet or power; mass moves people, tall men lose leverage
    if (r.lvl === 1) {
      if (r.blockers.length > 1) block += TUNE.comboBonus;
      if (!zone && r.px * side > 0) block += 3; // down blocks have the angle
      if (e.depth >= ON_LINE) block += TUNE.offBall;
      if (e.mv && Math.sign(e.mv) !== Math.sign(target - e.x)) block += TUNE.slantWash; // he slanted away from the play: the blocker just keeps him going // he is not set on the line: the blocker meets him with a running start
      // the angle: a blocker already between his man and the play only has to stay there; one who has to get across his man's face has to win a race first
      r.lev = r.kick ? 0.4 : clamp(Math.tanh((target - r.px) / 0.5) * (b.x - r.px), -1, 1);
      block += r.lev * TUNE.levRun - (r.kick ? TUNE.kickOut : 0); // a kick-out is a back or a guard on the move against a man set in the hole
      r.win = lgt(TUNE.runWin + soft(shedScore - block, 14) * TUNE.runScale);
      // getting into the backfield: a man slanting toward the play is already moving that way; a man head-up on his blocker is holding two gaps, not shooting one
      const toward = e.mv && Math.sign(e.mv) === Math.sign(target - e.x), twoGap = !e.mv && !e.blitz && Math.abs(b.x - e.x) < 0.2;
      r.pen = r.win * clamp((0.38 + (ea(g, e, 'bur') - 72) * 0.012) * (toward || e.blitz ? TUNE.slantPen : twoGap ? TUNE.twoGapPen : 1), 0.12, 0.8);
      // the combo still has to get a man up to the linebacker in time
      if (r.combo) {
        const c = climbers.find(x => x.fromCombo === r);
        const clim = lgt(1.1 + (ea(g, c.e, 'bawr') * 0.4 + ea(g, c.e, 'agi') * 0.35 + ea(g, c.e, 'spd') * 0.25 - 62) * 0.05);
        if (rand() > clim && c.used) { const lb = res.find(x => x.climb === c); if (lb) { lb.state = 'free'; lb.blockers = []; lb.lateClimb = true; } }
      }
    } else {
      // linebacker vs a climbing lineman / puller / lead blocker
      const lbScore = ea(g, e, 'shed') * 0.4 + ea(g, e, 'spd') * 0.3 + ea(g, e, 'prec') * 0.3 + E.w * 1.5 * zs; // a bigger linebacker can take on a lineman
      const climbScore = ea(g, b, 'rbk') * 0.45 + ea(g, b, 'agi') * 0.22 + ea(g, b, 'str') * 0.15 + ea(g, b, 'spd') * 0.18 + dNet + (r.climb && r.climb.lead ? 2 : 0) - bod(b).w * 0.3 * zs; // he has to get there first, and the heavy ones are a little late
      r.win = lgt(-1.0 + soft(lbScore - climbScore, 14) * 0.06);
    }
  }
  return res;
}
