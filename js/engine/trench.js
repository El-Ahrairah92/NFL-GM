'use strict';
// =====================================================================
//  ENGINE · trenches: assignment-based pass protection & run blocking
//  Count blockers vs threats → assign (1v1, double, combo→climb, chip, unblocked) → resolve.
//  docs/PLAYBOOK_SPEC.md §0a
// =====================================================================
function lgt(x) { return 1 / (1 + Math.exp(-x)); }
function lgtP(p) { return Math.log(p / (1 - p)); }

// ---------- who rushes ----------
// Returns { rushers: [entries], droppers: [entries] } for the defense's pressure call
function chooseRushers(g, def, dc) {
  const line = def.filter(e => e.depth === 0).sort((a, b) => a.x - b.x);
  const others = def.filter(e => e.depth > 0);
  const prRate = e => ea(g, e, 'prsh') * 0.6 + ea(g, e, 'bur') * 0.4;
  let rush = line.slice(), drop = [];
  const dropWeakEdge = () => {
    const edges = rush.filter(e => e.slot === 'EDGE' || e.slot === 'DE');
    if (!edges.length) return;
    const w = edges.sort((a, b) => prRate(a) - prRate(b))[0];
    rush = rush.filter(e => e !== w); drop.push(w);
  };
  while (rush.length > 4) dropWeakEdge();
  if (dc.pres === 'THREE') dropWeakEdge();
  if (dc.pres === 'SIM') dropWeakEdge();
  const nBlitz = dc.pres === 'BLITZ' ? (dc.cov === 'C0' ? 2 : 1) : dc.pres === 'SIM' ? 1 : 0;
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
  const speed = ea(g, r, 'prsh') * 0.55 + ea(g, r, 'bur') * 0.25 + ea(g, r, 'agi') * 0.2;
  const power = ea(g, r, 'prsh') * 0.55 + ea(g, r, 'str') * 0.45;
  const vsSpeed = ea(g, b, 'pbk') * 0.55 + ea(g, b, 'agi') * 0.3 + ea(g, b, 'bawr') * 0.15;
  const vsPower = ea(g, b, 'pbk') * 0.55 + ea(g, b, 'str') * 0.45;
  return Math.max(speed - vsSpeed, power - vsPower) - oNet;
}
// Returns { rushers: [{e, t, blockers:[], free}], tPress, first }
function passProtection(g, off, def, oc, dc, extraProtect) {
  const o = g.poss, d = 1 - o, cx = g.cx[o], dcx = g.cx[d];
  const { rushers, droppers } = chooseRushers(g, def, dc);
  const ol = off.filter(e => OL_SLOTS.includes(e.slot)).sort((a, b) => a.x - b.x);
  const helpers = extraProtect.slice(); // RB / TE kept in
  const qbE = off.find(e => e.slot === 'QB');
  const assign = rushers.map(r => ({ e: r, blockers: [], free: false, t: 9 }));
  // OL take down linemen by alignment; blitzers come after
  const free = ol.slice();
  const byDist = (r) => free.slice().sort((a, b) => Math.abs(a.x - r.e.x) - Math.abs(b.x - r.e.x));
  const lineRushers = assign.filter(a => !a.e.blitz).sort((a, b) => Math.abs(b.e.x) - Math.abs(a.e.x)); // tackles take the edges first
  for (const a of lineRushers) {
    const b = byDist(a)[0];
    if (!b || Math.abs(b.x - a.e.x) > 2.6) continue;
    a.blockers.push(b); free.splice(free.indexOf(b), 1);
  }
  // inline TE kept in takes the edge on his side, freeing a lineman to help
  for (const h of helpers.filter(x => INLINE.has(x.slot))) {
    const a = assign.filter(a => !a.e.blitz && Math.sign(a.e.x) === Math.sign(h.x || 1)).sort((x, y) => Math.abs(y.e.x) - Math.abs(x.e.x))[0];
    if (a) { a.blockers.unshift(h); helpers.splice(helpers.indexOf(h), 1); }
  }
  // blitzers: a spare lineman slides to them, otherwise the back must pick them up
  const blitzers = assign.filter(a => a.e.blitz);
  for (const a of blitzers) {
    let b = byDist(a)[0];
    if (b && Math.abs(b.x - a.e.x) <= 2.2) { a.blockers.push(b); free.splice(free.indexOf(b), 1); continue; }
    b = helpers.find(x => x.slot === 'RB' || x.slot === 'FB');
    if (b) { a.blockers.push(b); helpers.splice(helpers.indexOf(b), 1); }
  }
  // unassigned line rushers grab any remaining lineman
  for (const a of assign) if (!a.blockers.length && free.length) { const b = byDist(a)[0]; a.blockers.push(b); free.splice(free.indexOf(b), 1); }
  // spare linemen double the most dangerous rusher near them; spare backs chip edges
  for (const b of free) {
    const near = assign.filter(a => a.blockers.length === 1 && Math.abs(a.e.x - b.x) <= 1.6);
    if (!near.length) continue;
    near.sort((x, y) => rushVsBlock(g, y.e, y.blockers[0], 0) - rushVsBlock(g, x.e, x.blockers[0], 0));
    near[0].blockers.push(b); near[0].doubled = true;
  }
  for (const h of helpers) {
    const edge = assign.filter(a => Math.abs(a.e.x) >= 2.4 && a.blockers.length === 1).sort((x, y) => rushVsBlock(g, y.e, y.blockers[0], 0) - rushVsBlock(g, x.e, x.blockers[0], 0))[0];
    if (edge) edge.chip = h;
  }
  // pickup checks: blitzers, simulated pressure and stunts test the protection's awareness
  const design = clamp(knob(defCallerOrDC(g, d), 'presD') - knob(C(T(g.tids[o]).oc), 'passD'), -35, 35) * 0.0022;
  for (const a of assign) {
    if (!a.blockers.length) { a.free = true; continue; }
    if (a.e.blitz) {
      const b = a.blockers[0];
      const p = lgt(lgtP(TUNE.pickupMiss) + design + (dc.pres === 'SIM' ? 0.45 : 0) - (ea(g, b, 'bawr') - 65) * 0.03 - (ea(g, qbE, 'proc') - 70) * 0.015);
      if (rand() < p) { a.free = true; a.missed = true; }
    }
  }
  if (dc.stunt) {
    const inside = assign.filter(a => !a.e.blitz && a.blockers.length && Math.abs(a.e.x) < 2.5);
    if (inside.length >= 2) {
      const pair = inside.sort((a, b) => Math.abs(a.e.x) - Math.abs(b.e.x)).slice(0, 2);
      const aw = avg(pair.map(a => ea(g, a.blockers[0], 'bawr')));
      const p = lgt(lgtP(TUNE.stuntMiss) + design - (aw - 65) * 0.04);
      const looper = pair.sort((a, b) => ea(g, b.e, 'agi') - ea(g, a.e, 'agi'))[0];
      if (rand() < p) { looper.free = true; looper.stuntWin = true; }
      else pair.forEach(a => a.stuntDelay = 0.15);
    }
  }
  // time for each rusher to get home
  const oNet = cx.pb;
  for (const a of assign) {
    const r = a.e;
    if (a.free) {
      a.t = (a.stuntWin ? 1.45 : 1.05 + r.depth * 0.07) + Math.abs(r.x - (qbE ? qbE.x : 0)) * 0.06 + (75 - ea(g, r, 'bur')) * 0.01 + gauss(0, 0.12);
    } else {
      const b = a.blockers[0];
      let diff = rushVsBlock(g, r, b, oNet);
      if (a.blockers.length > 1) diff -= TUNE.doubleBonus + (ea(g, a.blockers[1], 'pbk') - 70) * 0.3;
      if (a.chip) diff -= TUNE.chipBonus;
      const med = TUNE.passProMedian * Math.exp(-soft(diff, 14) * TUNE.rushScale);
      a.t = med * Math.exp(gauss(0, 0.38)) + (a.chip ? 0.25 : 0) + (a.stuntDelay || 0);
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
  const o = g.poss, d = 1 - o, cx = g.cx[o];
  const zone = oc.scheme === 'ZONE';
  const singleHigh = dc.cov === 'C1' || dc.cov === 'C3' || dc.cov === 'C0';
  // box defenders: everyone on the line, linebackers, and a safety rotated down in single-high
  const box = def.filter(e => e.depth <= 5.5 && !(e.slot === 'CB' && Math.abs(e.x) > 3.5)).map(e => ({ e, lvl: e.depth === 0 || e.blitz ? 1 : 2 }));
  if (singleHigh || dc.pkg === 'GL') { const ss = def.find(e => e.slot === 'SS'); if (ss && !box.some(b => b.e === ss)) box.push({ e: ss, lvl: 2, rotated: true }); }
  if (dc.runBlitz) for (const b of box) if (b.e.blitz) b.lvl = 1;
  // blockers
  const ol = off.filter(e => OL_SLOTS.includes(e.slot) || e.slot === 'OL6').map(e => ({ e, used: false }));
  const tes = off.filter(e => INLINE.has(e.slot) && e.slot !== 'OL6').map(e => ({ e, used: false }));
  const lead = off.filter(e => e.slot === 'FB' || (carrierSlot === 'QB' && e.slot === 'RB')).map(e => ({ e, used: false }));
  const blk = [...ol, ...tes, ...lead];
  const res = box.map(b => ({ ...b, blockers: [], state: 'free' }));
  const fronts = res.filter(r => r.lvl === 1).sort((a, b) => Math.abs(a.e.x - target) - Math.abs(b.e.x - target));
  const seconds = res.filter(r => r.lvl === 2).sort((a, b) => Math.abs(a.e.x - target) - Math.abs(b.e.x - target));
  const nearest = (x, pool, maxD) => pool.filter(b => !b.used).sort((a, b) => Math.abs(a.e.x - x) - Math.abs(b.e.x - x)).find(b => Math.abs(b.e.x - x) <= maxD);
  // front defenders: linemen (and TEs on the edge) take them by alignment
  for (const r of fronts) {
    const b = nearest(r.e.x, [...ol, ...tes], 1.6);
    if (b) { b.used = true; r.blockers.push(b.e); r.state = 'blocked'; }
  }
  // gap schemes pull the backside guard to the point of attack
  if (!zone) {
    const backG = ol.filter(b => !b.used && (b.e.slot === 'LG' || b.e.slot === 'RG') && Math.sign(b.e.x) !== Math.sign(target)).concat(ol.filter(b => b.used && (b.e.slot === 'LG' || b.e.slot === 'RG') && Math.sign(b.e.x) !== Math.sign(target)))[0];
    if (backG) {
      // his man gets cut off by the center/tackle if one is free; otherwise left alone on the backside
      const lost = res.find(r => r.blockers.includes(backG.e));
      if (lost) { lost.blockers = []; lost.state = 'free'; lost.backside = true; const c = nearest(lost.e.x, ol, 1.6); if (c) { c.used = true; lost.blockers.push(c.e); lost.state = 'blocked'; } }
      backG.used = true; backG.pulling = true;
    }
  }
  // spare linemen: zone combos on the playside front, climbing to linebackers
  for (const b of ol.filter(b => !b.used)) {
    const r = fronts.filter(r => r.state === 'blocked' && r.blockers.length === 1 && Math.abs(r.e.x - b.e.x) <= 1.3)
      .sort((a, b2) => Math.abs(a.e.x - target) - Math.abs(b2.e.x - target))[0];
    if (r && zone) { r.blockers.push(b.e); r.combo = true; b.used = true; }
  }
  // second level: climbers from combos, pullers, the fullback, any unused blockers
  const climbers = [];
  for (const r of fronts) if (r.combo) climbers.push({ e: r.blockers[1], fromCombo: r });
  for (const b of blk) if (!b.used) climbers.push({ e: b.e, puller: !!b.pulling, lead: b.e.slot === 'FB' || b.e.slot === 'RB' });
  for (const b of ol) if (b.pulling) climbers.push({ e: b.e, puller: true });
  for (const r of seconds) {
    const c = climbers.filter(c => !c.used).sort((a, b) => Math.abs(a.e.x - r.e.x) - Math.abs(b.e.x - r.e.x))[0];
    if (!c) continue;
    c.used = true; r.blockers.push(c.e); r.state = 'blocked'; r.climb = c;
  }
  // unblocked front defenders far from the play are irrelevant (backside); near ones are free hitters
  const dNet = cx.rb;
  for (const r of res) {
    const e = r.e;
    const shedScore = ea(g, e, 'shed') * 0.5 + (zone ? (ea(g, e, 'bur') * 0.25 + ea(g, e, 'agi') * 0.25) : ea(g, e, 'str') * 0.5);
    if (r.state === 'free') { r.win = 1; continue; }
    const b = r.blockers[0];
    let block = ea(g, b, 'rbk') * 0.55 + (zone ? ea(g, b, 'agi') : ea(g, b, 'str')) * 0.3 + ea(g, b, 'bawr') * 0.15 + dNet;
    if (r.lvl === 1) {
      if (r.blockers.length > 1) block += TUNE.comboBonus;
      if (!zone && r.e.x * Math.sign(target) > 0) block += 3; // down blocks have the angle
      r.win = lgt(TUNE.runWin + soft(shedScore - block, 14) * TUNE.runScale);
      r.pen = r.win * clamp(0.38 + (ea(g, e, 'bur') - 72) * 0.012, 0.18, 0.65);
      // the combo still has to get a man up to the linebacker in time
      if (r.combo) {
        const c = climbers.find(x => x.fromCombo === r);
        const clim = lgt(1.1 + ((ea(g, c.e, 'bawr') + ea(g, c.e, 'agi')) / 2 - 62) * 0.05);
        if (rand() > clim && c.used) { const lb = res.find(x => x.climb === c); if (lb) { lb.state = 'free'; lb.blockers = []; lb.lateClimb = true; } }
      }
    } else {
      // linebacker vs a climbing lineman / puller / lead blocker
      const lbScore = ea(g, e, 'shed') * 0.4 + ea(g, e, 'spd') * 0.3 + ea(g, e, 'prec') * 0.3;
      const climbScore = ea(g, b, 'rbk') * 0.5 + ea(g, b, 'agi') * 0.3 + ea(g, b, 'str') * 0.2 + dNet + (r.climb && r.climb.lead ? 2 : 0);
      r.win = lgt(-1.0 + soft(lbScore - climbScore, 14) * 0.06);
    }
  }
  return res;
}
