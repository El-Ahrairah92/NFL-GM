'use strict';
// =====================================================================
//  ENGINE · play resolution: runs, passes, screens, gadgets, contact
//  docs/PLAYBOOK_SPEC.md §3, §4, §8
// =====================================================================

// ---------- contact & tackling ----------
// levels: [{e, at}] potential tacklers in the order they reach the ball carrier (at = yards from LOS)
// Returns { yds, tackler, assist, fumble, broke (missed tackles), breakaway }
function runToContact(g, carrier, levels, opts = {}) {
  const res = { yds: 0, tackler: null, assist: null, fumble: false, missed: [], breakaway: false };
  const elu = ea(g, carrier, 'elu'), bal = ea(g, carrier, 'bal'), cs = ea(g, carrier, 'str'), spd = ea(g, carrier, 'spd');
  let pos = opts.start !== undefined ? opts.start : 0;
  for (const lv of levels) {
    if (!lv.e) continue;
    pos = Math.max(pos, lv.at);
    const d = lv.e;
    const space = lv.at >= 5 ? 1 : 0; // open-field tackles are harder
    const DB_ = bod(d), CB_ = bod(carrier), zz = TUNE.size;
    const tk = (space ? DB_.w * 0.4 + DB_.len * 0.8 : DB_.w * 1.8 + DB_.len * 0.3) * zz + (space ? ea(g, d, 'tkl') * 0.5 + ea(g, d, 'spd') * 0.2 + ea(g, d, 'agi') * 0.2 + ea(g, d, 'str') * 0.1 : ea(g, d, 'tkl') * 0.6 + ea(g, d, 'spd') * 0.15 + ea(g, d, 'str') * 0.25); // in space he has to mirror the runner first; a bigger man wins at the line and is a step late in the open
    const ev = 70 + (elu * (0.4 + 0.12 * space) + bal * (0.32 - 0.15 * space) + ea(g, carrier, 'agi') * (0.08 + 0.03 * space) + cs * 0.1 + spd * 0.1 - 70) * TUNE.carrierW + (space ? CB_.w * 0.5 : CB_.w * 1.6 - CB_.h * 0.7) * zz; // a heavy back runs through arm tackles, a short one is hard to find; neither helps him in the open field
    if (res.contactAt === undefined) res.contactAt = pos;
    const make = lgt(TUNE.tackleBase - space * 0.55 + soft(tk - ev, 15) * TUNE.tackleScale + (lv.bonus || 0) + (opts.tackleBonus || 0));
    if (rand() < make) {
      res.tackler = d;
      // yards after contact: little when hit in the backfield, more when met downhill at the second level
      const ab = (opts.afterBase || 1.2) * (lv.at <= 0 ? 0.25 : lv.at <= 2 ? 0.7 : 1);
      const after = Math.max(0, gauss(ab + (bal - ea(g, d, 'tkl')) * 0.03 + (cs - ea(g, d, 'str')) * 0.015 + (CB_.w - DB_.w) * 0.12 * zz, 0.4 + ab * 0.45));
      res.yds = Math.round(pos + after);
      // gang tackle / assist
      const next = levels[levels.indexOf(lv) + 1];
      if (next && next.e && rand() < 0.1) res.assist = next.e;
      // ball security vs. punch-outs
      const pf = 0.0105 * (1 + (ea(g, d, 'strp') - 55) * 0.03) * (1 + (68 - ea(g, carrier, 'bsec')) * 0.035) * (opts.fumbleMult || 1);
      if (rand() < Math.max(0.0005, pf)) res.fumble = true;
      return res;
    }
    res.missed.push(d);
    pos += Math.max(1, gauss(opts.missGain || 2.5, opts.missGain ? 3 : 1.5)); // a broken tackle in the open field is worth a lot more than one in the hole
  }
  // nobody left in front: race the pursuit
  res.breakaway = true;
  const chase = (opts.pursuit || []).filter(Boolean).map(e => ea(g, e, 'spd'));
  const fastest = chase.length ? Math.max(...chase) : 70;
  res.yds = Math.round(pos + 6 + expRand(Math.max(3, 11 + (spd - fastest) * 1.1)) + (rand() < clamp(0.34 + (spd - fastest) * 0.02, 0.08, 0.65) ? expRand(30) : 0));
  res.tackler = (opts.pursuit || []).filter(Boolean).sort((a, b) => ea(g, b, 'spd') - ea(g, a, 'spd'))[0] || null;
  return res;
}
function defBySlot(def, ...slots) { for (const s of slots) { const e = def.find(x => x.slot === s && !x.used); if (e) return e; } return null; }
function nearestDef(list, x) { return list.filter(Boolean).sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0] || null; }
// deception check: does this defender bite? (Play Recognition vs the coordinator's Deception and the call's credibility)
function bites(g, e, strength) {
  const o = g.poss;
  const dcp = knob(C(T(g.tids[o]).oc), 'dcp');
  return rand() < lgt(strength + clamp(dcp - 55, -35, 35) * 0.008 - soft(ea(g, e, 'prec') - 70, 18) * 0.045 - g.key * 0.9);
}

// =====================================================================
//  RUNS
// =====================================================================
function resolveRun(g, off, def, oc, dc) {
  const o = g.poss;
  const res = { kind: 'run', yds: 0, carrier: null, tackler: null, assist: null, fumble: false, tfl: false, desc: '' };
  const qb = off.find(e => e.slot === 'QB');
  let carrierSlot = oc.carrier || 'RB';
  if (oc.type === 'SNEAK') return sneak(g, off, def, oc, res, qb);
  if (oc.type === 'JET') carrierSlot = ['SLOT', 'Z', 'SLOT2', 'X'].find(s => off.some(e => e.slot === s)) || 'RB';
  // option: QB reads the unblocked edge defender and gives or keeps
  let readRemoved = null;
  if (oc.type === 'OPTION') {
    const readE = def.filter(e => e.depth === 0 && Math.sign(e.x) === oc.side).sort((a, b) => Math.abs(b.x) - Math.abs(a.x))[0];
    if (readE) {
      const right = lgt(0.8 + (ea(g, qb, 'proc') * 0.5 + ea(g, qb, 'dec') * 0.5 - ea(g, readE, 'prec')) * 0.05);
      readE.used = true;
      if (rand() < right) readRemoved = readE; // read made: that defender is wrong-footed
      carrierSlot = rand() < 0.5 ? 'QB' : 'RB';
      if (rand() < 0.012 * (1 + (65 - ea(g, qb, 'bsec')) * 0.03)) { res.fumble = true; }
    }
  }
  // RPO: a conflict defender decides the play; the QB reads him
  if (oc.tags.has('RPO')) {
    const conflict = def.filter(e => ['MLB', 'WLB', 'SAM', 'SS', 'NCB'].includes(e.slot)).sort((a, b) => Math.abs(a.x - oc.side * 2) - Math.abs(b.x - oc.side * 2))[0];
    if (conflict) {
      const playsRun = bites(g, conflict, 0.3);
      const reads = lgt(0.9 + (ea(g, qb, 'proc') - 70) * 0.05);
      const pull = rand() < reads ? playsRun : rand() < 0.5;
      if (pull) { conflict.used = true; return resolvePass(g, off, def, Object.assign({}, oc, { type: 'QUICK', rpoThrow: true, rpoVacated: conflict }), dc); }
      if (!playsRun) conflict.used = true; // he dropped: one fewer in the box
    }
  }
  const carrier = off.find(e => e.slot === carrierSlot) || off.find(e => e.slot === 'RB') || qb;
  res.carrier = carrier;
  const outside = oc.dir === 'OUT';
  const target = oc.side * (outside ? (oc.scheme === 'ZONE' ? 2.9 : 2.3) : (oc.scheme === 'ZONE' ? 0.6 : 1.0));
  const blk = runBlocking(g, off, def.filter(e => !e.used || e === readRemoved), oc, dc, target, carrierSlot);
  if (readRemoved) { const r = blk.find(r => r.e === readRemoved); if (r) { r.state = 'blocked'; r.win = 0; } }
  // draws: rushers who rush upfield take themselves out unless they read it
  const draw = oc.type === 'DRAW';
  // misdirection: a reverse/trick lives or dies on the defense reading it
  let trickHit = null;
  if (oc.tags.has('TRICK')) {
    const keyD = def.filter(e => e.depth === 0 && Math.sign(e.x) === -oc.side)[0] || def[0];
    trickHit = !bites(g, keyD, 0.1) ? 'read' : 'fooled';
  }
  // motion and zone flow: linebackers have to read it
  const motion = oc.tags.has('MOTION');
  // ---- build the contact sequence ----
  const levels = [];
  const fronts = blk.filter(r => r.lvl === 1), seconds = blk.filter(r => r.lvl === 2);
  const nearPOA = r => Math.abs(r.e.x - target) <= (outside ? 1.8 : 1.4);
  let lane = 'designed';
  // vision: zone runners bounce to the cutback if the playside is jammed
  const jammed = fronts.filter(nearPOA).some(r => r.win > 0.55);
  if (oc.scheme === 'ZONE' && jammed && rand() < lgt((ea(g, carrier, 'vis') * 0.7 + ea(g, carrier, 'agi') * 0.3 - 62) * 0.06)) lane = 'cutback'; // see it, then make the cut
  for (const r of fronts) {
    if (trickHit === 'fooled') break;
    const relevant = lane === 'cutback' ? Math.sign(r.e.x) === -Math.sign(target) && Math.abs(r.e.x) < 3 : nearPOA(r);
    if (!relevant) continue;
    let w = r.win;
    if (oc.duo && Math.abs(r.e.x) < 2) w *= 0.97;  // double teams at the point of attack
    if (oc.scheme === 'GAP' && !oc.counter) w *= 0.94; // a hat on a hat at the point of attack
    if (oc.wide) w *= 0.88;                          // the stretch gets the line moving and cuts off pursuit
    if (oc.tight && outside) w *= 0.92;              // receivers in close seal the edge
    if (draw && r.state !== 'free') w *= bites(g, r.e, 0.6) ? 0.35 : 1.1;
    if (r.state === 'free' && r.backside && lane === 'designed') continue;
    if (rand() < w) {
      const pen = r.state === 'free' || rand() < r.pen / Math.max(0.05, w);
      r.won = true; r.penetrated = pen;
      levels.push({ e: r.e, at: pen ? -randInt(0, 3) : randInt(0, 2), pen });
    } else r.won = false;
  }
  // outside runs: the edge must be set by someone
  if (outside && trickHit !== 'fooled') {
    const edgeR = fronts.filter(r => Math.sign(r.e.x) === Math.sign(target)).sort((a, b) => Math.abs(b.e.x) - Math.abs(a.e.x))[0];
    const lost = edgeR && rand() > edgeR.win * (oc.wide ? 0.82 : 1);
    if (edgeR) edgeR.won = !lost;
    if (!lost && edgeR && !levels.some(l => l.e === edgeR.e)) levels.push({ e: edgeR.e, at: randInt(0, 3) });
    // corner / force player
    const force = def.filter(e => e.slot.startsWith('CB') || e.slot === 'CB' || e.slot === 'NCB').sort((a, b) => Math.abs(a.x - target * 1.4) - Math.abs(b.x - target * 1.4))[0];
    // the receiver on that side has to block him: a willing, strong blocker springs the run; a poor one lets the corner make the play
    const wrB = off.filter(e => ['X', 'Z', 'SLOT', 'SLOT2', 'Y', 'H'].includes(e.slot) && Math.sign(e.x || 1) === Math.sign(target)).sort((a, b) => Math.abs(b.x) - Math.abs(a.x))[0];
    const edgeBlk = wrB && force ? clamp((ea(g, wrB, 'rbk') * 0.5 + ea(g, wrB, 'str') * 0.3 + ea(g, wrB, 'agi') * 0.2 + bod(wrB).w * 2 * TUNE.size) - (ea(g, force, 'shed') * 0.4 + ea(g, force, 'tkl') * 0.3 + ea(g, force, 'str') * 0.3 + bod(force).w * 1.5 * TUNE.size) + TUNE.wrBlock, -30, 30) * 0.02 : 0;
    if (force && rand() < clamp((oc.wide || oc.tight ? 0.5 : 0.62) - edgeBlk, 0.25, 0.85)) levels.push({ e: force, at: Math.max(1, (lost ? randInt(4, 8) : randInt(3, 6)) + Math.round(edgeBlk * 5)), bonus: (lost ? -0.3 : 0) - edgeBlk * 0.5 }); // the corner has a receiver's block to beat first
  }
  // linebackers: blocked, or free to fill (if they read it)
  for (const r of seconds) {
    if (r.state === 'blocked' && rand() > r.win) { r.won = false; continue; }
    r.won = true;
    let readOK = rand() < lgt(0.9 + (ea(g, r.e, 'prec') - 65) * 0.05 + g.key * 0.8 - (motion ? 0.3 : 0) - (draw ? 0.5 : 0) - (oc.counter ? 0.6 : 0) - (trickHit === 'fooled' ? 2 : 0));
    const depthAt = (r.rotated ? 4 : 3) + (readOK ? randInt(0, 2) : randInt(3, 6)) + (draw ? 1 : 0) + (dc.cov === 'T2' && r.e.slot === 'MLB' ? 1 : 0);
    levels.push({ e: r.e, at: depthAt, bonus: readOK ? (oc.duo ? 0.45 : 0) : -0.4 }); // duo leaves the linebackers for the back
  }
  // deep help: safeties
  const deepS = def.filter(e => (e.slot === 'FS' || e.slot === 'SS') && !blk.some(b => b.e === e));
  for (const s of deepS) levels.push({ e: s, at: randInt(7, 12), bonus: TUNE.safetyRun });
  levels.sort((a, b) => a.at - b.at);
  if (trickHit === 'read') levels.unshift({ e: def.filter(e => e.depth === 0)[0], at: -randInt(3, 7) });
  const pursuit = def.filter(e => e.slot === 'CB' || e.slot === 'FS' || e.slot === 'SS' || e.slot === 'NCB');
  const r = runToContact(g, carrier, levels, { pursuit, fumbleMult: carrierSlot === 'QB' ? 1.2 : 1, afterBase: carrierSlot === 'QB' ? 1.6 : TUNE.runAfter + (oc.type === 'JET' ? 2.4 : 0), tackleBonus: 0.14 + (g.down >= 3 && g.togo <= 2 ? 0.45 : 0) + (100 - g.ydl <= 3 ? 0.5 : 100 - g.ydl <= 8 ? 0.2 : 0) * TUNE.goalStand }); // no room behind the defense at the goal line
  res.yds = r.yds; res.tackler = r.tackler; res.assist = r.assist; res.fumble = res.fumble || r.fumble; res.breakaway = r.breakaway;
  res.tfl = res.yds < 0;
  res.blk = blk; res.ybc = r.contactAt !== undefined ? Math.min(r.contactAt, r.yds) : r.yds; res.missed = r.missed;
  res.desc = runDesc(oc, carrier, res, lane);
  res.involved = [carrier.p, r.tackler && r.tackler.p];
  return res;
}
function sneak(g, off, def, oc, res, qb) {
  const C_ = off.find(e => e.slot === 'C'), lg = off.find(e => e.slot === 'LG'), rg = off.find(e => e.slot === 'RG');
  const nt = def.filter(e => e.depth === 0).sort((a, b) => Math.abs(a.x) - Math.abs(b.x))[0];
  const push = (ea(g, C_, 'str') + ea(g, lg, 'str') + ea(g, rg, 'str')) / 3 * 0.55 + ea(g, qb, 'str') * 0.2 + ea(g, qb, 'siz') * 0.15 + ea(g, qb, 'bur') * 0.1 + bod(qb).w * 2 * TUNE.size;
  const stop = nt ? ea(g, nt, 'str') * 0.6 + ea(g, nt, 'shed') * 0.4 + (bod(nt).w * 2 - bod(nt).h * 1) * TUNE.size : 60;
  const ok = rand() < lgt(1.75 + (push - stop) * 0.05 + (g.cx[g.poss].rb - 0) * 0.05);
  res.carrier = qb; res.yds = ok ? (rand() < 0.3 ? 2 : 1) : (rand() < 0.75 ? 0 : -1);
  res.tackler = nt; res.ybc = 0; res.missed = []; res.desc = `${pshort(qb.p)} QB sneak`;
  res.involved = [qb.p];
  return res;
}
function runDesc(oc, carrier, res, lane) {
  const dir = oc.side > 0 ? 'right' : 'left';
  const kind = oc.type === 'DRAW' ? 'draw' : oc.type === 'OPTION' ? 'option' : oc.type === 'JET' ? (oc.tags.has('TRICK') ? 'reverse' : 'jet sweep') :
    oc.dir === 'OUT' ? (oc.scheme === 'ZONE' ? 'outside zone' : 'toss') : (oc.scheme === 'ZONE' ? 'inside zone' : 'power');
  return `${pshort(carrier.p)} ${kind} ${lane === 'cutback' ? 'cutback' : dir}`;
}

// =====================================================================
//  PASSES
// =====================================================================
// route: [slot, depth band, dir, depth yds [min,max], break time, role]
const ROUTES = {
  QUICK: [['X', 'S', 'IN', [5, 9], 1.2, 2], ['Z', 'S', 'OUT', [5, 8], 1.35, 2], ['SLOT', 'S', 'IN', [4, 7], 1.15, 1], ['SLOT2', 'S', 'OUT', [3, 6], 1.2, 2],
    ['Y', 'S', 'OUT', [3, 5], 1.3, 2], ['H', 'S', 'IN', [3, 5], 1.3, 3], ['Y2', 'S', 'OUT', [2, 4], 1.35, 3], ['RB', 'S', 'OUT', [0, 3], 1.5, 3], ['FB', 'S', 'OUT', [0, 2], 1.6, 3]],
  DROP: [
    [['X', 'I', 'IN', [10, 14], 2.0, 1], ['Z', 'S', 'OUT', [6, 9], 1.7, 2], ['SLOT', 'S', 'OUT', [4, 7], 1.6, 2], ['SLOT2', 'I', 'VERT', [12, 20], 2.2, 2], ['Y', 'I', 'IN', [8, 12], 1.9, 2], ['H', 'S', 'OUT', [3, 6], 1.7, 3], ['RB', 'S', 'IN', [1, 4], 2.0, 3], ['FB', 'S', 'OUT', [1, 3], 2.0, 3]], // dig-out / curl-flat
    [['X', 'I', 'VERT', [14, 20], 2.4, 2], ['Z', 'I', 'IN', [10, 14], 2.0, 1], ['SLOT', 'S', 'IN', [5, 7], 1.6, 2], ['SLOT2', 'S', 'OUT', [5, 8], 1.7, 2], ['Y', 'I', 'OUT', [9, 12], 1.9, 2], ['H', 'S', 'IN', [3, 6], 1.8, 3], ['RB', 'S', 'OUT', [1, 4], 2.0, 3], ['FB', 'S', 'OUT', [1, 3], 2.0, 3]], // levels
    [['X', 'D', 'VERT', [20, 30], 2.6, 2], ['Z', 'D', 'VERT', [20, 30], 2.6, 2], ['SLOT', 'I', 'VERT', [14, 22], 2.3, 1], ['SLOT2', 'I', 'VERT', [14, 22], 2.3, 1], ['Y', 'I', 'VERT', [12, 20], 2.3, 2], ['H', 'S', 'OUT', [3, 6], 1.8, 3], ['RB', 'S', 'IN', [1, 4], 2.0, 3], ['FB', 'S', 'IN', [1, 3], 2.0, 3]], // four verts
    [['X', 'I', 'IN', [10, 14], 2.0, 2], ['Z', 'I', 'OUT', [12, 18], 2.3, 2], ['SLOT', 'S', 'IN', [4, 6], 1.5, 1], ['SLOT2', 'S', 'IN', [4, 6], 1.5, 1], ['Y', 'S', 'IN', [4, 6], 1.6, 1], ['H', 'S', 'OUT', [3, 5], 1.7, 3], ['RB', 'S', 'OUT', [1, 4], 2.0, 3], ['FB', 'S', 'OUT', [1, 3], 2.0, 3]], // mesh
  ],
  DEEP: [['X', 'D', 'VERT', [22, 36], 2.7, 1], ['Z', 'D', 'IN', [20, 30], 2.6, 1], ['SLOT', 'I', 'IN', [12, 16], 2.2, 2], ['SLOT2', 'D', 'VERT', [20, 30], 2.6, 2], ['Y', 'I', 'VERT', [14, 20], 2.4, 2], ['H', 'S', 'OUT', [3, 6], 1.9, 3], ['RB', 'S', 'OUT', [1, 4], 2.3, 3], ['FB', 'S', 'OUT', [1, 3], 2.3, 3]],
  PA: [['X', 'I', 'IN', [13, 20], 2.5, 1], ['Z', 'D', 'IN', [20, 30], 2.7, 1], ['SLOT', 'I', 'VERT', [12, 18], 2.4, 2], ['SLOT2', 'S', 'OUT', [4, 8], 1.9, 3], ['Y', 'S', 'OUT', [3, 7], 1.9, 2], ['H', 'S', 'IN', [3, 6], 2.0, 3], ['RB', 'S', 'OUT', [0, 3], 2.4, 3], ['FB', 'S', 'OUT', [1, 3], 2.3, 3]],
  BOOT: [['X', 'I', 'IN', [14, 20], 2.4, 2], ['Z', 'I', 'OUT', [12, 18], 2.2, 1], ['SLOT', 'S', 'OUT', [4, 8], 1.8, 2], ['SLOT2', 'I', 'IN', [12, 18], 2.3, 2], ['Y', 'S', 'OUT', [2, 5], 1.7, 1], ['H', 'S', 'OUT', [2, 5], 1.8, 2], ['RB', 'S', 'OUT', [1, 3], 2.1, 3], ['FB', 'S', 'OUT', [1, 3], 2.1, 3]],
};
// which defenders own each area of the field in each zone coverage (by role)
function zoneOwners(cov, droppers) {
  const deep = [], under = [];
  const cbs = droppers.filter(e => e.slot === 'CB').sort((a, b) => a.x - b.x);
  const fs = droppers.find(e => e.slot === 'FS'), ss = droppers.find(e => e.slot === 'SS');
  const own = {}; const add = (area, e, w = 1) => { if (e) (own[area] = own[area] || []).push([e, w]); };
  const rest = droppers.filter(e => !['CB', 'FS', 'SS'].includes(e.slot));
  if (cov === 'C3') {
    add('DL', cbs[0]); add('DM', fs); add('DR', cbs[1]);
    add('IL', cbs[0], 0.5); add('IR', cbs[1], 0.5);
    add('SR', ss); add('IR', ss, 0.8);
    under.push(...rest);
  } else if (cov === 'C2' || cov === 'T2') {
    add('DL', fs); add('DR', ss); add('DM', fs, 0.45); add('DM', ss, 0.45);
    add('SL', cbs[0]); add('SR', cbs[1]); add('IL', fs, 0.45); add('IR', ss, 0.45);
    // Tampa 2: the middle linebacker runs the deep middle and closes the hole between the safeties, leaving the short middle to others
    const mike = cov === 'T2' ? rest.find(e => e.slot === 'MLB') || rest.find(e => e.slot === 'WLB') : null;
    if (mike) { add('DM', mike, 0.9); add('IM', mike, 0.8); }
    under.push(...rest.filter(e => e !== mike));
  } else if (cov === 'C6') {
    // quarter-quarter-half: quarters to the passing strength, a squat corner and a deep-half safety away from it
    const q = droppers.filter(e => e.slot === 'NCB' || e.slot === 'DIME').reduce((s, e) => s + Math.sign(e.x), 0) >= 0 ? 'R' : 'L', h = q === 'R' ? 'L' : 'R';
    const cq = q === 'R' ? cbs[1] : cbs[0], ch = q === 'R' ? cbs[0] : cbs[1];
    add('D' + q, cq); add('I' + q, cq, 0.6); add('DM', fs, 0.8); add('IM', fs, 0.5); add('D' + q, fs, 0.4);
    add('D' + h, ss); add('I' + h, ss, 0.45); add('DM', ss, 0.3); add('S' + h, ch);
    under.push(...rest);
  } else { // C4 quarters
    add('DL', cbs[0]); add('DR', cbs[1]); add('DM', fs, 0.8); add('DM', ss, 0.8); add('IL', cbs[0], 0.6); add('IR', cbs[1], 0.6);
    add('IM', fs, 0.5); add('IM', ss, 0.5);
    under.push(...rest);
  }
  for (const e of under) {
    const lat = e.x < -1.2 ? 'L' : e.x > 1.2 ? 'R' : 'M';
    add('S' + lat, e); add('I' + lat, e, 0.85);
    if (lat !== 'M') add('SM', e, 0.35);
    else { add('SL', e, 0.3); add('SR', e, 0.3); }
  }
  return own;
}
// man-to-man matching: receivers to defenders
function manMatch(off, droppers, receivers) {
  const free = droppers.slice(), m = new Map();
  const take = (rec, prefs) => {
    for (const p of prefs) {
      const c = free.filter(e => p(e)).sort((a, b) => Math.abs(a.x - rec.x) - Math.abs(b.x - rec.x))[0];
      if (c) { free.splice(free.indexOf(c), 1); m.set(rec, c); return; }
    }
  };
  const isCB = e => e.slot === 'CB', isN = e => e.slot === 'NCB' || e.slot === 'DIME', isS = e => e.slot === 'SS' || e.slot === 'FS', isLB = e => ['MLB', 'WLB', 'SAM'].includes(e.slot);
  const order = receivers.slice().sort((a, b) => Math.abs(b.x) - Math.abs(a.x));
  for (const r of order) {
    if (r.slot === 'X' || r.slot === 'Z') take(r, [isCB, isN, isS]);
    else if (r.slot === 'SLOT' || r.slot === 'SLOT2') take(r, [isN, isCB, e => e.slot === 'SS', isS, isLB]);
    else if (r.slot === 'Y' || r.slot === 'Y2' || r.slot === 'H') take(r, [e => e.slot === 'SS', isLB, isN, isS]);
    else take(r, [isLB, e => e.slot === 'SS', isS, isN]);
  }
  return { m, free };
}
function areaOf(rt, x) {
  const lat = x < -2.2 ? 'L' : x > 2.2 ? 'R' : 'M';
  return rt.band + lat;
}

function resolvePass(g, off, def, oc, dc) {
  const o = g.poss, d = 1 - o, cx = g.cx[o], dcx = g.cx[d];
  const qb = off.find(e => e.slot === 'QB');
  const res = { kind: 'pass', qb, yds: 0 };
  if (oc.type === 'RBSCR' || oc.type === 'WRSCR') return screen(g, off, def, oc, dc, res, qb);
  const pa = oc.tags.has('PA') || oc.type === 'GADGET', boot = oc.tags.has('BOOT');
  const tpl = oc.rpoThrow ? 'QUICK' : oc.type === 'GADGET' ? 'DEEP' : boot ? 'BOOT' : pa ? 'PA' : oc.type;
  let routes = ROUTES[tpl];
  if (Array.isArray(routes[0][0])) routes = weightedPick(routes, [0.36, 0.3, 0.1, 0.24]);
  // the same concept is run from different alignments: the wide receivers trade routes, so the deep one is not always the same man's
  if (!oc.rpoThrow && rand() < TUNE.routeMix) { const wide = ['X', 'Z', 'SLOT'].filter(s => off.some(e => e.slot === s) && routes.some(r => r[0] === s));
    if (wide.length > 1) { const from = wide.map(s => routes.find(r => r[0] === s)), to = shuffle(wide.slice()), swap = new Map(wide.map((s, i) => [s, [to[i], ...from[i].slice(1)]])); routes = routes.map(r => swap.has(r[0]) ? null : r).filter(Boolean).concat([...swap.values()]); } }
  // heavier personnel: the extra TE (or a fullback, on short routes) runs the route of the receiver he replaced,
  // so 12/13/21/22 sets still attack every level — a play-action seam to the third tight end is a real play
  const onField = new Set(off.map(e => e.slot));
  const vacated = ['SLOT', 'Z', 'SLOT2'].filter(s => !onField.has(s)).map(s => routes.find(r => r[0] === s)).filter(Boolean);
  const heirs = new Set();
  for (const h of ['H', 'Y2', 'FB']) {
    if (!onField.has(h) || !vacated.length) continue;
    const i = h === 'FB' ? vacated.findIndex(r => r[1] === 'S') : 0;
    if (i < 0) continue;
    const v = vacated.splice(i, 1)[0];
    routes = routes.filter(r => r[0] !== h).concat([[h, ...v.slice(1)]]); heirs.add(h);
  }
  if (onField.has('Y2') && !routes.some(r => r[0] === 'Y2')) routes = routes.concat([['Y2', 'S', 'OUT', [2, 5], 1.6, 3]]);
  // who blocks, who runs routes
  const keep = [];
  const rb = off.find(e => e.slot === 'RB'), fb = off.find(e => e.slot === 'FB'), y = off.find(e => e.slot === 'Y');
  const blitzKnown = (dc.pres === 'BLITZ' || dc.pres === 'FZ') && rand() < lgt((ea(g, qb, 'proc') - 60) * 0.06);
  if (oc.form !== 'EMP') {
    if (rb && (oc.type === 'DEEP' || oc.type === 'GADGET' || (oc.type === 'DROP' && (blitzKnown || rand() < 0.35)))) keep.push(rb);
    if (fb && rand() < 0.6) keep.push(fb);
    if (y && (oc.type === 'DEEP' ? rand() < 0.55 : oc.type === 'DROP' ? rand() < 0.2 : false)) keep.push(y);
  }
  if (oc.maxp) { if (rb && !keep.includes(rb)) keep.push(rb); if (y && !keep.includes(y)) keep.push(y); } // seven stay in: time for the shot, fewer places to go with it
  for (const e of off) if (e.slot === 'OL6') keep.push(e);
  const receivers = off.filter(e => !OL_SLOTS.includes(e.slot) && e.slot !== 'QB' && !keep.includes(e));
  if (oc.form === 'EMP' && rb) { rb.x = -1.6; }
  // pass protection & the pressure clock
  const prot = passProtection(g, off, def, oc, dc, keep);
  // play-action / boot: rushers and second-level defenders may bite on the fake
  let tPress = prot.tPress;
  if (pa) for (const a of prot.rushers.slice(0, 2)) if (bites(g, a.e, -0.6)) a.t += 0.35;
  if (boot) {
    // the pocket moves away from interior pressure; the backside edge must stay home or chase
    for (const a of prot.rushers) a.t += Math.abs(a.e.x) < 2.4 ? 0.6 : 0.2;
    const back = prot.rushers.filter(a => Math.sign(a.e.x) === -oc.side && Math.abs(a.e.x) >= 2.4)[0];
    if (back && !bites(g, back.e, 0.2)) back.t = Math.min(back.t, 1.55 + gauss(0, 0.15));
  }
  if (oc.maxp) for (const a of prot.rushers) a.t += 0.4; // seven men in protection
  prot.rushers.sort((a, b) => a.t - b.t);
  tPress = prot.rushers.length ? prot.rushers[0].t : 9;
  const rusher = prot.rushers[0];
  // coverage
  const droppers = prot.droppers;
  const man = dc.cov === 'C1' || dc.cov === 'C0' || dc.cov === 'C2M';
  // the design: one receiver is the primary on this call (weighted toward the better/featured players, but it rotates)
  const featured = receivers.filter(e => e.slot !== 'FB');
  const prim = featured.length ? weightedPick(featured, featured.map(e => (heirs.has(e.slot) ? 0.6 : { X: 1.0, Z: 0.95, SLOT: 0.85, SLOT2: 0.4, Y: 0.6, H: 0.35, Y2: 0.2, RB: 0.35 }[e.slot] || 0.3) * Math.pow(Math.max(40, slotRating(e.p, e.spot)) / 75, TUNE.primPow))) : null;
  const rlist = routes.filter(rt => receivers.some(e => e.slot === rt[0])).map(rt => {
    const e = receivers.find(x => x.slot === rt[0]);
    const depth = randInt(rt[3][0], rt[3][1]);
    const dir = oc.tags.has('SIDE') && rt[2] === 'IN' && rand() < 0.6 ? 'OUT' : rt[2];
    const endX = dir === 'OUT' ? e.x + Math.sign(e.x || 1) * 2.2 : dir === 'IN' ? (Math.abs(e.x) > 1.5 ? Math.sign(e.x) * 0.9 : -Math.sign(e.x || 1) * 1.2) : (Math.abs(e.x) > 3 ? e.x : e.x * 1.1);
    const role = e === prim ? 1 : rt[5] === 1 ? 2 : rt[5];
    return { e, band: rt[1], dir, depth, tb: rt[4], role, endX };
  });
  if (!rlist.length) rlist.push({ e: rb || qb, band: 'S', dir: 'OUT', depth: 1, tb: 1.5, role: 3, endX: 2 });
  const mm = man ? manMatch(off, droppers, rlist.map(r => r.e)) : null;
  const zown = man ? null : zoneOwners(dc.cov, droppers);
  const pNet = cx.pb * 0; // protection already used the coach net; separation uses Pass Design vs Coverage Design:
  const sepNet = clamp(designKnob(T(g.tids[o]), 'passD') - designKnob(T(g.tids[d]), 'covD'), -35, 35) * 0.0012;
  // PA / RPO: underneath defenders who bite leave windows behind them
  const bit = new Set();
  if (pa) for (const e of droppers) if (['MLB', 'WLB', 'SAM', 'SS'].includes(e.slot) && bites(g, e, TUNE.paBite + (g.runCred[o] - 4.2) * 0.25)) bit.add(e);
  if (oc.rpoVacated) bit.add(oc.rpoVacated);
  const pressRate = man ? 0.35 + (dcx.dt.man - 0.35) * 0.6 : dc.cov === 'C2' || dc.cov === 'T2' ? 0.4 : dc.cov === 'C6' ? 0.25 : 0.12;
  // the coordinator shades coverage toward the opponent's best receiver (safety rolled over, bracket, robber)
  const pass = receivers.filter(e => e.slot !== 'RB' && e.slot !== 'FB').map(e => [e, slotRating(e.p, e.spot)]).sort((x, y) => y[1] - x[1]);
  const star = pass.length > 1 ? pass[0][0] : null;
  const shade = star ? TUNE.shade * (dc.cov === 'C0' ? 0 : ['C2', 'C4', 'C2M', 'T2', 'C6'].includes(dc.cov) ? 0.34 : 0.2) * clamp((pass[0][1] - 70) / 14, 0, 1.7) * clamp(0.5 + (pass[0][1] - pass[1][1]) / 12, 0.5, 1.2) : 0;
  for (const r of rlist) {
    const e = r.e, deep = r.band === 'D';
    let defE = null, help = e === star ? -shade : 0, hole = false, w;
    const rte = ea(g, e, 'rte'), agi = ea(g, e, 'agi'), spd = ea(g, e, 'spd'), bur = ea(g, e, 'bur');
    if (man) {
      defE = mm.m.get(e) || null;
      if (!defE || defE.blitz) { hole = true; defE = nearestDef(mm.free, r.endX); }
      const offC = deep ? rte * (0.9 - TUNE.deepSpeed) + agi * 0.1 + spd * TUNE.deepSpeed : rte * 0.5 + agi * 0.2 + bur * 0.3;
      const defC = defE ? (deep ? ea(g, defE, 'man') * 0.45 + ea(g, defE, 'agi') * 0.1 + ea(g, defE, 'spd') * 0.45 : ea(g, defE, 'man') * 0.6 + ea(g, defE, 'agi') * 0.15 + ea(g, defE, 'bur') * 0.25) : 30;
      const lbM = defE && ['MLB', 'WLB', 'SAM'].includes(defE.slot) ? 0.35 : 1;
      const RB_ = bod(e), DF_ = defE ? bod(defE) : NO_BODY, zc = TUNE.size;
      w = TUNE.openBase + (soft(offC - 70 + ((deep ? RB_.h * 0.6 : -RB_.w * 0.2) + RB_.w * 0.5) * zc, 14) * TUNE.recWeight - soft(defC - 70 + ((deep ? DF_.len * 0.6 : -DF_.w * 0.2) + DF_.w * 0.5 + DF_.len * 0.5) * zc, 14) * TUNE.covWeight * lbM) * TUNE.openScale;
      if (hole) w += TUNE.holeBonus + 0.6;
      // deep help over the top
      const fs = mm.free.find(x => x.slot === 'FS' || x.slot === 'SS');
      if (dc.cov === 'C1' && fs && (deep || r.band === 'I') && Math.abs(r.endX) < 3) help -= 0.45 * clamp((ea(g, fs, 'zone') * 0.55 + ea(g, fs, 'spd') * 0.45) / 75, 0.6, 1.3); // range is as much speed as it is eyes
      if (dc.cov === 'C2M' && deep) help -= 0.55;
      if (oc.tags.has('RUB') && r.dir === 'IN' && r.band !== 'D') w += 0.55;
      if (oc.tags.has('MOTION') && rand() < 0.4) w += 0.15;
      if (defE && r.band !== 'D') w += (ea(g, e, 'rel') - ea(g, defE, 'prs')) * 0.006; // hand fighting through the stem, press or not
      // press at the line
      if (defE && (e.slot === 'X' || e.slot === 'Z' || e.slot === 'SLOT') && !(oc.bunch && e.slot !== 'X') && rand() < pressRate) {
        const winRel = rand() < lgt((ea(g, e, 'rel') - ea(g, defE, 'prs')) * 0.06 + (RB_.w * 0.22 - DF_.w * 0.16 - DF_.len * 0.14) * zc); // a big receiver runs through the jam; a long, heavy corner lands it
        w += winRel ? 0.25 : -0.65; r.pressed = !winRel; r.pressAtt = true; if (!winRel) r.tb += 0.25;
      }
    } else {
      const area = areaOf(r, r.endX), owners = (zown[area] || []).filter(([x]) => !bit.has(x));
      if (!owners.length) { hole = true; defE = nearestDef(droppers, r.endX); }
      else { owners.sort((a, b) => b[1] - a[1]); defE = owners[0][0]; if (owners.length > 1) help -= 0.3 * owners[1][1]; }
      const offC = deep ? rte * (0.9 - TUNE.deepSpeed * 0.95) + agi * 0.1 + spd * TUNE.deepSpeed * 0.95 : rte * 0.55 + agi * 0.15 + bur * 0.3;
      const own = owners.length ? owners[0][1] : 0.6;
      const defC = defE ? (deep ? ea(g, defE, 'zone') * 0.4 + ea(g, defE, 'prec') * 0.2 + ea(g, defE, 'spd') * 0.4 : ea(g, defE, 'zone') * 0.45 + ea(g, defE, 'prec') * 0.25 + ea(g, defE, 'spd') * 0.15 + ea(g, defE, 'agi') * 0.15) : 30;
      const lbZ = defE && ['MLB', 'WLB', 'SAM'].includes(defE.slot) ? TUNE.lbCover : 1, ZD = defE ? bod(defE) : NO_BODY, ZR = bod(e), zc = TUNE.size;
      w = TUNE.openBase + (soft(offC - 70 + ((deep ? ZR.h * 0.6 : -ZR.w * 0.2) + ZR.w * 0.5) * zc, 14) * TUNE.recWeight - soft(defC - 70 + (ZD.len * 1.4 + ZD.w * 0.3) * zc, 14) * TUNE.covWeight * own * lbZ) * TUNE.openScale + (1 - own) * 0.5 + (hole ? TUNE.holeBonus * (dc.pres === 'FZ' ? 0.35 : 1) : 0); // fire-zone droppers pattern-read: the voids are smaller than they look
      if ((dc.cov === 'C2' || dc.cov === 'T2') && (e.slot === 'X' || e.slot === 'Z') && r.band === 'S' && defE && defE.slot === 'CB') w -= 0.35 + (ea(g, defE, 'prs') - ea(g, e, 'rel')) * 0.012; // squat corners jam the release
      else if (defE && r.band !== 'D' && defE.depth > 0 && defE.depth <= 2) w -= (ea(g, defE, 'prs') - ea(g, e, 'rel')) * 0.005; // underneath defenders reroute what comes through their zone
      if (dc.pres === 'FZ' && defE && defE.depth === 0) w -= 0.25; // the quarterback throws hot into a lineman he never expected to be there
    }
    if (bit.size && r.band !== 'S') w += TUNE.paOpen;
    // formation and concept packages
    if (oc.trips) w += e.slot === 'X' ? 0.2 : -0.1;                 // the back-side receiver is alone; the trips side draws a crowd
    if (oc.bunch && e.slot !== 'X' && e.slot !== 'RB' && e.slot !== 'FB') w += man ? 0.25 : 0.04; // traffic at the snap beats man coverage
    if (oc.tight) w += r.dir === 'IN' ? 0.12 : r.band === 'D' ? -0.1 : -0.04;      // crossers get a free run; the sideline is a long throw
    if (oc.optrt && r.band !== 'D') w += 0.25 * clamp((ea(g, qb, 'proc') + rte - 130) / 40, -0.6, 1); // right when both read it right, wrong when they do not
    // the field shrinks near the goal line: no room behind the defense, tighter windows
    const toGoal = 100 - g.ydl;
    if (toGoal <= 20) w -= (toGoal <= 10 ? 0.65 : 0.3) * TUNE.redZone;
    w += (r.band === 'S' ? TUNE.shortOpen : r.band === 'D' ? TUNE.deepCov : TUNE.midCov) + (r.role === 3 ? (e.slot === 'RB' || e.slot === 'FB' ? 0.05 : 0.3) : 0); // defenses give up the underneath (checkdowns most of all), protect deep
    if (e.slot === 'Y' || e.slot === 'H') w += 0.13; // tight ends work the seams and the soft middle
    if (dc.soft) w += r.band === 'S' ? 0.35 : r.band === 'D' ? -0.35 : 0.12; // prevent: everything underneath is there
    w += help + sepNet - g.key * 0.35 + gauss(0, 0.55);
    if (g.down >= 3 && r.depth >= g.togo && g.togo <= 15) w -= 0.22; // money down: the defense sits on the sticks
    r.w = w; r.def = defE; if (e === star) r.shade = shade; // film credits beating the extra attention
  }
  // ---- the QB's read ----
  const proc = ea(g, qb, 'proc'), dec = ea(g, qb, 'dec'), pkt = ea(g, qb, 'pkt');
  // pre-snap coverage read: the QB's processing vs. the coordinator's disguise
  const covID = rand() < lgt(0.6 + soft(proc - 70, 18) * 0.04 - clamp(designKnob(T(g.tids[d]), 'covD') - 55, -35, 35) * 0.0045 - (dc.disg ? 0.5 : 0) - (dc.cov === 'C6' ? 0.25 : 0) + (oc.tags.has('MOTION') ? 0.5 : 0));
  const drop = (oc.type === 'QUICK' || oc.rpoThrow ? 1.05 : oc.type === 'DEEP' ? 2.25 : 1.75) + (pa ? 0.45 : 0) + (oc.form === 'UC' ? 0.15 : 0) + (oc.type === 'GADGET' ? 0.7 : 0);
  let order = rlist.slice().sort((a, b) => a.role - b.role || a.tb - b.tb);
  if (oc.rpoThrow && oc.rpoVacated) order.sort((a, b) => b.w - a.w);
  else if (covID) { const best = order.slice(0, -1).sort((a, b) => b.w - a.w)[0]; if (best) order = [best, ...order.filter(x => x !== best)]; }
  if (boot) order = order.filter(r => Math.sign(r.endX) === oc.side || r.dir === 'IN' || r.role === 1).concat(order.filter(r => !(Math.sign(r.endX) === oc.side || r.dir === 'IN' || r.role === 1)));
  const readStep = TUNE.readTime * (1.55 - proc / 100);
  // Decision-making = how accurately he reads each window: poor deciders force throws into coverage and miss open men
  const readNoise = clamp(0.44 - (dec - 50) * 0.006, 0.12, 0.6);
  for (const r of rlist) r.pw = r.w + gauss(0, readNoise) + (r.e === star ? TUNE.starLook : 0); // he looks for his best receiver, covered or not
  const thr = 0.38;
  const trust = DEEP.base + clamp(((ea(g, qb, 'arm') + ea(g, qb, 'dacc')) / 2 - DEEP.ref) * DEEP.perPt, DEEP.lo, DEEP.hi); // how small a window he will throw the deep ball into
  // a shot play starts with the shot: on a deep call (and now and then off play-action) he looks downfield first, the more so the more he trusts his arm
  { const pShot = oc.type === 'DEEP' || oc.type === 'GADGET' ? clamp(DEEP.shot + trust * DEEP.shotArm, 0.15, 0.95) : oc.type === 'DROP' && pa ? clamp(DEEP.shot + trust * DEEP.shotArm, 0.15, 0.95) * 0.4 : 0;
    if (pShot && !oc.rpoThrow && rand() < pShot) { const shot = order.filter(r => r.band === 'D').sort((x, y) => y.pw - x.pw)[0]; if (shot && order[0] !== shot) order = [shot, ...order.filter(x => x !== shot)]; } }
  let t = drop, choice = null, pressured = false, escaped = false, hurry = false;
  const passDownSticks = g.down >= 3 ? g.togo : 0;
  for (let i = 0; i < order.length; i++) {
    const r = order[i];
    t = Math.max(t, r.tb) + (i ? readStep : 0);
    if (t > tPress && !escaped) {
      pressured = true;
      // feel it and escape?
      const rushE = rusher.e;
      const inside = Math.abs(rushE.x) < 2 && !rushE.blitz; // pressure up the middle: he cannot step up, and it comes with a hand in his face
      const esc = lgt(-0.15 + (pkt * 0.55 + ea(g, qb, 'agi') * 0.2 + ea(g, qb, 'spd') * 0.1 + ea(g, qb, 'bur') * 0.15 - (ea(g, rushE, 'prsh') * 0.5 + ea(g, rushE, 'bur') * 0.5)) * 0.045 - (rusher.free ? 0.7 : 0) - bod(qb).w * 0.04 * TUNE.size - (inside ? 0.45 + (ea(g, rushE, 'prsh') - 70) * 0.02 : 0));
      if (rand() < esc) { escaped = true; tPress = t + 0.8 + rand() * 0.6; }
      else break;
    }
    const need = r.role === 3 || i === order.length - 1 ? (r.e.slot === 'RB' || r.e.slot === 'FB' ? -0.2 : -0.45) : thr + (r.band === 'D' ? 0.2 - trust : r.band === 'I' ? 0.1 - trust * DEEP.mid : 0) - (r.depth < passDownSticks ? -0.35 : 0);
    // a clean pocket buys time for downfield routes to come open: he can hold on an intermediate or deep route
    // for as long as the protection lets him. This is what a good line is for.
    const margin = escaped ? 0 : tPress - t;
    const hold = r.band !== 'S' && margin > 0.3 ? Math.min(margin - 0.3, 0.9) : 0;
    if (r.pw + hold * TUNE.pocketOpen > need) { choice = r; if (hold) { r.w += hold * TUNE.pocketOpen; r.pw += hold * TUNE.pocketOpen; t += hold * 0.5; r.held = hold; } break; }
    // nobody open and it is down to the outlet: with time left he works back through the progression instead of dumping it
    if (i === order.length - 1 && !choice && margin > 0.6) {
      const extra = Math.min(margin - 0.3, 1.1) * TUNE.pocketOpen;
      const back = rlist.filter(x => x.band !== 'S').sort((a, b) => b.pw - a.pw)[0];
      if (back && back.pw + extra > thr) { choice = back; back.w += extra; back.pw += extra; t += Math.min(margin - 0.3, 0.8); back.held = 1; break; }
    }
  }
  const stats = { pressured: pressured || t > tPress - 0.2, rushers: prot.rushers };
  res.prot = prot; res.routes = rlist; res.ttt = Math.min(t, escaped ? t : tPress + 0.1);
  res.pressure = stats.pressured; res.rushers = prot.rushers.filter(a => a.t < t + 0.3);
  // ---- no throw yet: pressure decides between a sack, a hot/hurried throw, a throwaway or a scramble ----
  if (!choice) {
    const best = order.slice().sort((a, b) => b.pw - a.pw)[0];
    const rushQ = ea(g, rusher.e, 'prsh') * 0.5 + ea(g, rusher.e, 'bur') * 0.5;
    const evade = pkt * 0.5 + ea(g, qb, 'agi') * 0.2 + ea(g, qb, 'spd') * 0.15 + ea(g, qb, 'bur') * 0.15;
    const pSack = clamp(0.2 + soft(rushQ - evade, 14) * 0.006 + (rusher.free ? 0.15 : 0) - (escaped ? 0.08 : 0) - (bod(qb).w - bod(rusher.e).w * 0.5) * 0.014 * TUNE.size - (rusher.e.depth === 0 && Math.abs(rusher.e.x) < 2 ? 0.06 : -0.008), 0.06, 0.5); // a big quarterback shrugs off an arm; a big rusher finishes
    const scrambleP = clamp(0.03 + (ea(g, qb, 'spd') - 55) * 0.018 + (ea(g, qb, 'agi') - 55) * 0.005, 0.03, 0.6) * (escaped ? 1.15 : pressured ? 0.7 : 0.35);
    if (pressured && rand() < pSack) {
      const loss = randInt(3, 10);
      // who finishes it: the first man home, unless the QB slipped him (cleanup) or others arrived together
      const home = prot.rushers.filter(a => a.t <= t + 0.6);
      const cand = escaped && home.length > 1 ? home.filter(a => a !== rusher) : home.filter(a => a.t <= rusher.t + 1.3); // the pocket collapses as a group: the first man home does not always get the sack
      // edges and blitzers close from space and finish; interior push more often flushes the QB into someone else
      const sk = cand.length > 1 ? weightedPick(cand, cand.map(a => (a.e.blitz ? 1.1 : a.e.depth === 0 && Math.abs(a.e.x) < 2 ? 0.5 : 1))).e : rusher.e;
      // two men home together split it
      const skA = cand.find(a => a.e === sk), mates = cand.filter(a => a.e !== sk && skA && Math.abs(a.t - skA.t) <= 0.9);
      const sk2 = mates.length && rand() < 0.75 ? pick(mates).e : null;
      Object.assign(res, { kind: 'sack', yds: -loss, sacker: sk, sacker2: sk2, desc: `${pshort(qb.p)} sacked by ${pshort(sk.p)}${sk2 ? ' and ' + pshort(sk2.p) : ''}` });
      res.fumble = rand() < 0.11 * (1 + (ea(g, sk, 'strp') - 55) * 0.03) * (1 + (65 - ea(g, qb, 'bsec')) * 0.025);
      res.involved = [qb.p, sk.p];
      return res;
    }
    if (rand() < scrambleP) {
      const ql = def.filter(e => !e.blitz && ['MLB', 'WLB', 'SAM', 'NCB', 'SS'].includes(e.slot));
      const r = runToContact(g, qb, [{ e: rusher.e, at: randInt(-1, 2), bonus: escaped ? -2.8 : -1.7 }, { e: nearestDef(ql, 0), at: randInt(5, 11), bonus: -0.3 }, { e: def.find(e => e.slot === 'FS'), at: randInt(9, 14) }], { pursuit: def.filter(e => e.slot === 'CB' || e.slot === 'FS') });
      Object.assign(res, { kind: 'scramble', carrier: qb, yds: r.yds, tackler: r.tackler, fumble: r.fumble, missed: r.missed, ybc: r.contactAt !== undefined ? Math.min(r.contactAt, r.yds) : r.yds, slide: r.yds >= 4 && rand() < 0.6, desc: `${pshort(qb.p)} scrambles` });
      res.involved = [qb.p];
      return res;
    }
    const awayP = pressured ? clamp(0.14 + (pkt + dec - 140) * 0.004 - (best ? best.pw : -1) * 0.25, 0.1, 0.8) : clamp(0.05 - (best ? best.pw : -1) * 0.1, 0.01, 0.4);
    if (best && rand() > awayP) { choice = best; hurry = pressured; }
    // under pressure, more often than not the ball is thrown at somebody: it is charged to him as a target even though he had no chance at it
    else if (best && pressured && rand() < 0.55) { Object.assign(res, { kind: 'inc', target: best.e, air: Math.min(best.depth, 100 - g.ydl), route: best, hurry: true, uncatch: true, xc: 0.1, desc: `${pshort(qb.p)} pass incomplete under pressure, intended for ${pshort(best.e.p)}` }); return res; }
    else { Object.assign(res, { kind: 'inc', throwaway: true, target: null, desc: `${pshort(qb.p)} throws it away` }); return res; }
  }
  if (stats.pressured && !hurry && t > tPress - 0.15) hurry = true;
  return throwBall(g, off, def, oc, dc, res, qb, choice, hurry, boot || escaped, covID);
}

function throwBall(g, off, def, oc, dc, res, qb, r, hurry, onRun, covID) {
  const e = r.e, defE = r.def;
  const air = r.depth;
  const arm = ea(g, qb, 'arm'), outside = Math.abs(r.endX) > 2.2 && air >= 6; // the out-breaker to the far hash is an arm throw
  let acc = air < 10 ? ea(g, qb, 'sacc') * (outside ? 0.8 : 1) + arm * (outside ? 0.2 : 0) : air < 20 ? ea(g, qb, 'sacc') * 0.4 + ea(g, qb, 'dacc') * 0.4 + arm * 0.2 : ea(g, qb, 'dacc') * 0.6 + arm * 0.4;
  const QH = bod(qb).h * TUNE.size, middle = Math.abs(r.endX) < 2.2 && air < 20 && !onRun;
  if (middle) acc += QH * 1.6; // he has to see it and throw it over the line
  if (onRun) acc = acc * 0.4 + ea(g, qb, 'tor') * 0.6;
  if (hurry) acc -= 13 - ea(g, qb, 'pkt') * 0.08 - (arm - 70) * 0.12 + (res.rushers && res.rushers[0] && Math.abs(res.rushers[0].e.x) < 2 && !res.rushers[0].e.blitz ? 3 + (ea(g, res.rushers[0].e, 'prsh') - 70) * 0.15 : 0); // a big arm can still drive it off his back foot
  const yardsToGoal = 100 - g.ydl;
  const airY = Math.min(air, yardsToGoal);
  const pCatchable = lgt(TUNE.catchBase + 0.2 + r.w * 0.95 + soft(acc - 72, 16) * TUNE.accScale - (air >= 20 ? TUNE.deepCatch : air >= 10 ? 1.32 : air <= 2 ? -0.95 : 0) + (air >= 15 ? (arm - 70) * 0.01 : 0) + (r.w < 0.4 && air >= 5 ? (arm - 70) * 0.008 : 0) + (ea(g, e, 'hnd') - 70) * 0.022 + (r.role === 3 && air <= 5 ? 0.55 : 0) + (e.slot === 'RB' ? 0.55 : 0) - (yardsToGoal <= 5 ? 0.3 : yardsToGoal <= 12 ? 0.2 : 0));
  res.target = e; res.air = airY; res.def = defE; res.hurry = hurry; res.route = r;
  // batted at the line: tall, long linemen with their hands up, and a short quarterback throwing through them
  if (!onRun && air < 20 && TUNE.size) {
    const front = (res.prot ? res.prot.rushers : []).filter(a => a.e.depth === 0 && !a.free);
    if (front.length) {
      const reach = front.reduce((s, a) => s + bod(a.e).len, 0) / front.length;
      if (rand() < TUNE.batBase * clamp(1 + reach * 0.35, 0.4, 2) * clamp(1 - QH * 0.3, 0.4, 1.9) * (middle ? 1.4 : 0.8)) {
        const who = weightedPick(front, front.map(a => Math.max(0.2, 1 + bod(a.e).len * 0.5 + (ea(g, a.e, 'bsk') - 40) * 0.01)));
        Object.assign(res, { kind: 'inc', batted: true, pbu: who.e, xc: pCatchable * 0.9, desc: `${pshort(qb.p)} pass batted down at the line by ${pshort(who.e.p)}` });
        return res;
      }
    }
  }
  let cWinP = 1;
  const rcC = ea(g, e, 'cth') * 0.5 + ea(g, e, 'hnd') * 0.15 + ea(g, e, 'siz') * 0.35 + (bod(e).w * 1.5 + bod(e).h * 1.5) * TUNE.size, dfC = defE ? (['MLB', 'WLB', 'SAM'].includes(defE.slot) ? 60 + (ea(g, defE, 'bsk') * 0.6 + ea(g, defE, 'siz') * 0.4 - 60) * 0.5 : ea(g, defE, 'bsk') * 0.6 + ea(g, defE, 'siz') * 0.4) + (bod(defE).w * 1.2 + bod(defE).len * 1.5) * TUNE.size : 50;
  const pDrop = clamp(TUNE.dropBase * Math.exp(-(ea(g, e, 'hnd') - 70) * 0.05) * (r.w < 0.25 ? 1.35 : 1) * (air <= 3 ? 0.6 : 1), 0.008, 0.3); // hands: every catch, and most of all in traffic
  const tight = e.slot === 'RB' && air <= 4 ? -0.15 : 0.25; // a checkdown is not a contested catch unless the linebacker is sitting on it
  if (r.w < tight && defE) cWinP = lgt(0.25 + (rcC - dfC) * 0.05 + r.w * 0.8);
  res.xc = pCatchable * (1 - pDrop) * cWinP;
  const tag = `${pshort(qb.p)} pass ${air >= 20 ? 'deep' : air >= 10 ? 'intermediate' : 'short'} ${r.endX < -1.5 ? 'left' : r.endX > 1.5 ? 'right' : 'middle'} to ${pshort(e.p)}`;
  if (rand() < pCatchable) {
    // drops
    if (rand() < pDrop) { Object.assign(res, { kind: 'inc', drop: true, desc: tag + ' — dropped' }); return res; }
    // contested window
    if (r.w < tight && defE) {
      res.contested = true;
      const win = lgt(0.25 + (rcC - dfC) * 0.05 + r.w * 0.8);
      if (rand() > win) {
        if (rand() < (0.075 + soft(ea(g, defE, 'bsk') - 65, 20) * 0.002) * (['MLB', 'WLB', 'SAM'].includes(defE.slot) ? 0.4 : 1)) return interception(g, def, res, qb, defE, airY, tag);
        Object.assign(res, { kind: 'inc', pbu: rand() < (['MLB', 'WLB', 'SAM'].includes(defE.slot) ? 0.75 : 0.3) ? null : defE, desc: tag + ` — broken up by ${pshort(defE.p)}` }); return res;
      }
    }
    // catch → yards after catch
    if (airY >= yardsToGoal) { Object.assign(res, { kind: 'comp', yds: yardsToGoal, yac: 0, desc: tag }); res.involved = [e.p]; return res; }
    const cushion = Math.max(0, r.w) * 2.0 + (r.band === 'S' ? 1.0 : 0.3);
    const rest = def.filter(x => x !== defE && !x.blitz && x.depth > 0);
    const levels = [];
    if (defE) levels.push({ e: defE, at: airY + Math.max(0, gauss(cushion + (e.slot === 'RB' ? 2.2 : 0), 1.2)), bonus: (r.w > 1 ? -0.3 : 0.2) - (airY >= 20 ? TUNE.deepStride : 0) });
    const n2 = nearestDef(rest.filter(x => x.slot === 'FS' || x.slot === 'SS' || x.slot.indexOf('LB') >= 0 || x.slot === 'MLB' || x.slot === 'WLB'), r.endX);
    if (n2 && rand() < (airY >= 15 ? TUNE.helpDeep : TUNE.helpShort)) levels.push({ e: n2, at: airY + randInt(3, 8) }); // sometimes it is one-on-one in space
    const rr = runToContact(g, e, levels, { start: airY, missGain: 6.5, pursuit: rest.filter(x => x.slot === 'CB' || x.slot === 'FS' || x.slot === 'SS') });
    let yds = Math.max(airY, rr.yds);
    if (oc.tags.has('SIDE') && r.dir === 'OUT') { yds = Math.min(yds, airY + randInt(0, 3)); res.oob = rand() < 0.75; }
    else res.oob = r.dir === 'OUT' && rand() < 0.38;
    Object.assign(res, { kind: 'comp', yds, yac: yds - airY, tackler: rr.tackler, assist: rr.assist, fumble: rr.fumble, missed: rr.missed, desc: tag });
    res.involved = [e.p, rr.tackler && rr.tackler.p];
    return res;
  }
  // off target or covered: incomplete or picked
  const decF = 1 + soft(Math.max(0, 70 - ea(g, qb, 'dec')), 18) * 0.015;
  const posF = defE ? (['MLB', 'WLB', 'SAM'].includes(defE.slot) ? 0.35 : defE.depth === 0 ? 0.25 : 1.12) : 0.6;
  const pInt = TUNE.intBase * clamp(1 - soft(72 - acc, 16) * 0.014, 0.75, 1.12) * Math.exp(-r.w * 0.7) * decF * (hurry ? 1.45 : 1) * (covID ? 1 : 1.5) * (airY >= 20 ? 1.35 : 1) * (airY >= 10 || outside ? clamp(1 + (70 - arm) * 0.004, 0.85, 1.2) : 1) * (defE ? 1 + soft(ea(g, defE, 'bsk') - 65, 20) * 0.025 : 1) * posF;
  if (defE && rand() < pInt / Math.max(0.05, 1 - lgt(TUNE.catchBase + r.w))) return interception(g, def, res, qb, defE, airY, tag);
  if (defE && r.w < 0.4 && rand() < (['MLB', 'WLB', 'SAM'].includes(defE.slot) ? 0.06 : defE.slot === 'FS' || defE.slot === 'SS' ? 0.1 : 0.155)) res.pbu = defE;
  Object.assign(res, { kind: 'inc', desc: tag + ' — incomplete' + (res.pbu ? `, defended by ${pshort(res.pbu.p)}` : '') });
  return res;
}
function interception(g, def, res, qb, defE, airY, tag) {
  // not every interception is the man in coverage: the safety over the top takes the overthrow, the man sitting underneath takes the ball thrown past him
  { const drops = ((res.prot && res.prot.droppers) || []).filter(x => x !== defE), deep = airY >= 15;
    const pool = deep ? drops.filter(x => x.slot === 'FS' || x.slot === 'SS') : drops.filter(x => ['MLB', 'WLB', 'SAM', 'NCB', 'DIME', 'SS'].includes(x.slot));
    if (pool.length && rand() < TUNE.intHelp * (deep ? 0.45 : 1)) defE = nearestDef(pool, res.route ? res.route.endX : 0) || defE; }
  const spot = clamp(g.ydl + airY, 1, 109);
  const rest = def.filter(x => x !== defE);
  let ret = 0, td = false;
  if (spot >= 100) ret = rand() < 0.15 ? randInt(5, 30) : 0; // end zone: mostly kneel
  else {
    ret = Math.round(Math.max(0, expRand(10) * (1 + (ea(g, defE, 'elu') - 50) / 100)));
    if (rand() < 0.1) ret = spot + randInt(0, 5); // takes it all the way back
  }
  Object.assign(res, { kind: 'int', intBy: defE, intSpot: spot, ret, desc: `${tag} — INTERCEPTED by ${pshort(defE.p)}` });
  res.involved = [defE.p];
  return res;
}

// ---------- screens ----------
function screen(g, off, def, oc, dc, res, qb) {
  const o = g.poss, rbScreen = oc.type === 'RBSCR';
  const tgt = rbScreen ? off.find(e => e.slot === 'RB') || off.find(e => e.slot === 'FB') : off.find(e => ['SLOT', 'Z', 'X', 'SLOT2'].includes(e.slot));
  if (!tgt) return resolvePass(g, off, def, Object.assign({}, oc, { type: 'QUICK' }), dc);
  const { rushers, droppers } = chooseRushers(g, def, dc);
  // does someone smell it out?
  const readers = rbScreen ? droppers.filter(e => ['MLB', 'WLB', 'SAM'].includes(e.slot)).slice(0, 1).concat(rushers.slice(0, 1)) : droppers.filter(e => ['CB', 'NCB', 'DIME'].includes(e.slot) && Math.sign(e.x) === Math.sign(tgt.x || 1));
  const sniffed = readers.find(e => !bites(g, e, rbScreen ? 0.9 : 0.6));
  const res2 = Object.assign(res, { target: tgt, air: rbScreen ? -randInt(1, 3) : randInt(-2, 1), ttt: 0.9, xc: 0.94 });
  const tag = `${pshort(qb.p)} ${rbScreen ? 'screen' : 'bubble screen'} to ${pshort(tgt.p)}`;
  // pressing or squatting corners blow up the bubble; aggressive rushes feed the RB screen
  if (!rbScreen && (dc.cov === 'C2' || dc.cov === 'C1' || dc.cov === 'C0') && rand() < 0.3) { const c = nearestDef(droppers, tgt.x); if (c) { const rr = runToContact(g, tgt, [{ e: c, at: res2.air + randInt(0, 2), bonus: 0.4 }], { start: res2.air }); Object.assign(res2, { kind: 'comp', yds: rr.yds, yac: rr.yds - res2.air, tackler: rr.tackler, desc: tag }); res2.involved = [tgt.p]; return res2; } }
  if (sniffed && rand() < 0.45) {
    if (rand() < 0.35) { Object.assign(res2, { kind: 'inc', pbu: sniffed, desc: tag + ' — sniffed out, incomplete' }); return res2; }
    const rr = runToContact(g, tgt, [{ e: sniffed, at: res2.air + randInt(-1, 1), bonus: 0.6 }], { start: res2.air });
    Object.assign(res2, { kind: 'comp', yds: rr.yds, yac: rr.yds - res2.air, tackler: rr.tackler, desc: tag }); res2.involved = [tgt.p]; return res2;
  }
  // the convoy: blockers out in front vs. tacklers in space
  const blockers = rbScreen ? off.filter(e => ['LG', 'C', 'RG'].includes(e.slot)) : off.filter(e => ['X', 'Z', 'Y', 'SLOT2', 'H'].includes(e.slot) && Math.sign(e.x) === Math.sign(tgt.x || 1) && e !== tgt);
  let tacklers = (rbScreen ? droppers.filter(e => !['CB'].includes(e.slot)) : droppers).filter(e => e !== sniffed).sort((a, b) => Math.abs(a.x - (tgt.x || 0)) - Math.abs(b.x - (tgt.x || 0)));
  for (const b of blockers) {
    const t0 = tacklers[0];
    if (!t0) break;
    const win = lgt(0.4 + ((rbScreen ? ea(g, b, 'rbk') * 0.4 + ea(g, b, 'agi') * 0.3 + ea(g, b, 'spd') * 0.3 : ea(g, b, 'rbk') * 0.5 + ea(g, b, 'str') * 0.5) + bod(b).w * 1.5 * TUNE.size - (ea(g, t0, 'shed') * 0.5 + ea(g, t0, 'spd') * 0.5) - bod(t0).w * 1.0 * TUNE.size) * 0.05);
    if (rand() < win) tacklers.shift();
  }
  const lead = TUNE.screenLead + (rbScreen ? 3 : 0);
  const levels = tacklers.slice(0, 3).map((e, i) => ({ e, at: res2.air + lead + randInt(0, 3) + i * randInt(3, 6) }));
  if (sniffed) levels.unshift({ e: sniffed, at: res2.air + randInt(0, 3) });
  const rr = runToContact(g, tgt, levels, { start: res2.air, pursuit: droppers.filter(e => e.slot === 'FS' || e.slot === 'CB') });
  Object.assign(res2, { kind: 'comp', yds: Math.min(rr.yds, 100 - g.ydl), yac: rr.yds - res2.air, tackler: rr.tackler, assist: rr.assist, fumble: rr.fumble, desc: tag });
  res2.involved = [tgt.p, rr.tackler && rr.tackler.p];
  return res2;
}

// ---------- hail mary ----------
function hailMary(g, off, def) {
  const qb = off.find(e => e.slot === 'QB');
  const range = 48 + (ea(g, qb, 'arm') - 70) * 0.6;
  const toGoal = 100 - g.ydl;
  const res = { kind: 'pass', qb, hail: true };
  const recs = off.filter(e => ['X', 'Z', 'SLOT', 'Y', 'SLOT2'].includes(e.slot));
  const tgt = recs.sort((a, b) => (ea(g, b, 'cth') + ea(g, b, 'siz')) - (ea(g, a, 'cth') + ea(g, a, 'siz')))[0];
  const dbs = def.filter(e => ['CB', 'FS', 'SS', 'NCB', 'DIME'].includes(e.slot));
  const db = dbs.sort((a, b) => (ea(g, b, 'bsk') + ea(g, b, 'siz')) - (ea(g, a, 'bsk') + ea(g, a, 'siz')))[0];
  res.target = tgt; res.air = toGoal;
  if (toGoal > range + 5 || !tgt) { Object.assign(res, { kind: 'inc', desc: `${pshort(qb.p)} heaves it — falls short` }); return res; }
  const jump = (ea(g, tgt, 'cth') * 0.6 + ea(g, tgt, 'siz') * 0.4) - (ea(g, db, 'bsk') * 0.6 + ea(g, db, 'siz') * 0.4);
  const r = rand();
  if (r < lgt(-2.6 + jump * 0.04)) { Object.assign(res, { kind: 'comp', yds: toGoal, yac: 0, desc: `${pshort(qb.p)} HAIL MARY to ${pshort(tgt.p)}` }); return res; }
  if (r < lgt(-2.6 + jump * 0.04) + 0.17) return interception(g, def, res, qb, db, toGoal, `${pshort(qb.p)} Hail Mary`);
  Object.assign(res, { kind: 'inc', pbu: db, desc: `${pshort(qb.p)} Hail Mary — knocked down` });
  return res;
}
