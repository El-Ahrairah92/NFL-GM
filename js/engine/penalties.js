'use strict';
// =====================================================================
//  ENGINE · penalties
//  Every foul comes from a real moment on the snap (a beaten blocker grabs, a trailing corner
//  grabs, a lineman jumps on a hard count) and how likely it is depends on the player's hidden
//  Discipline. Guardrails keep a game sane: each flag makes the team a bit more careful,
//  repeat offenders settle down, one foul per side per play, and a hard cap per team.
//  Calibrated to ~6 accepted penalties per team per game (NFL ≈ 5.5–6.5).
// =====================================================================
const PEN = {
  FS: { n: 'False start', y: 5, o: 1, pre: 1, f: 'pb' },
  OFFS: { n: 'Offside', y: 5, pre: 1, f: 'pr' },
  NZI: { n: 'Neutral zone infraction', y: 5, pre: 1, f: 'pr' },
  ENC: { n: 'Encroachment', y: 5, pre: 1, f: 'pr' },
  DOG: { n: 'Delay of game', y: 5, o: 1, pre: 1, f: 'q' },
  FORM: { n: 'Illegal formation', y: 5, o: 1, pre: 1, f: 'rec' },
  HOLD: { n: 'Offensive holding', y: 10, o: 1, f: 'pb' },
  OPI: { n: 'Offensive pass interference', y: 10, o: 1, f: 'rec' },
  DPI: { n: 'Defensive pass interference', spot: 1, af: 1, f: 'cov' },
  DH: { n: 'Defensive holding', y: 5, af: 1, f: 'cov' },
  IC: { n: 'Illegal contact', y: 5, af: 1, f: 'cov' },
  RTP: { n: 'Roughing the passer', y: 15, af: 1, f: 'pr' },
  UR: { n: 'Unnecessary roughness', y: 15, af: 1, f: 'tk' },
  FM: { n: 'Face mask', y: 15, af: 1, f: 'tk' },
  STH: { n: 'Holding (return)', y: 10, st: 1 },
  IBB: { n: 'Illegal block in the back', y: 10, st: 1 },
};
// per-opportunity base rates (tuned with the penalty harness; average discipline ≈ 1.2× these)
const PEN_RATE = {
  FS: 0.00185, OFFS: 0.00284, DOG: 0.00276, FORM: 0.0046,
  HOLD_PASS: 0.0156, HOLD_RUN: 0.0119, DPI: 0.043, DH: 0.0223, OPI: 0.0082, RTP: 0.0168, UR: 0.0146, ST: 0.15,
};
const PEN_CAP = 16;
const PEN_SCALE = 1.15; // global dial

// discipline 5 ≈ 2×, 55 = 1×, 95 ≈ 0.45×
function discMult(p) { const d = p && p.h && p.h.disc !== undefined ? p.h.disc : 55; return clamp(Math.exp((55 - d) / 28), 0.45, 2.1); }
function penState(g) { return g.pen || (g.pen = [{ n: 0, by: {} }, { n: 0, by: {} }]); }
// the full chance one player commits one kind of foul on this snap
function foulP(g, s, p, base) {
  if (!p || !p.a || globalThis.__noPen) return 0;
  const ps = penState(g)[s];
  if (ps.n >= PEN_CAP) return 0;
  const cul = knob(C(T(g.tids[s]).hc), 'cul'); // disciplined staffs, ±10%
  const mine = ps.by[p.id] || 0;
  return base * PEN_SCALE * discMult(p) * (1.1 - cul / 495) * Math.max(0.4, Math.pow(0.9, ps.n)) * (mine >= 3 ? 0.25 : mine >= 2 ? 0.6 : 1);
}
function tryFoul(g, s, p, base) { return rand() < foulP(g, s, p, base); }

// ---------- pre-snap: the play never happens ----------
function preSnapFoul(g, off, def, oc) {
  const o = g.poss, d = 1 - o, road = g.neutral ? 1 : o === 1 ? 1.3 : 0.85, hurry = isHurry(g) ? 1.5 : 1;
  const hardCount = g.down >= 3 && g.togo <= 3 ? 1.7 : 1;
  const cands = [];
  for (const e of off) if (OL_SLOTS.includes(e.slot) || ['Y', 'H', 'Y2', 'OL6', 'X', 'Z', 'SLOT', 'SLOT2'].includes(e.slot)) {
    const wr = ['X', 'Z', 'SLOT', 'SLOT2'].includes(e.slot);
    if (tryFoul(g, o, e.p, PEN_RATE.FS * road * hurry * (wr ? 0.45 : 1))) cands.push({ k: 'FS', e, s: o });
  }
  for (const e of def) if (e.depth === 0 && tryFoul(g, d, e.p, PEN_RATE.OFFS * hardCount)) cands.push({ k: pick(['OFFS', 'OFFS', 'NZI', 'ENC']), e, s: d });
  const qb = off.find(e => e.slot === 'QB');
  const clockPressure = g.clock <= 120 && (g.q === 2 || g.q === 4) ? 1.6 : 1;
  // delay of game is as much the play clock and the sideline as the QB: discipline matters less here
  if (qb && tryFoul(g, o, qb.p, PEN_RATE.DOG * clockPressure * (road > 1 ? 1.25 : 1) / Math.sqrt(discMult(qb.p)))) cands.push({ k: 'DOG', e: qb, s: o });
  const skill = off.filter(e => ['X', 'Z', 'SLOT', 'SLOT2', 'Y', 'H', 'Y2', 'FB'].includes(e.slot));
  if (skill.length) { const e = pick(skill); if (tryFoul(g, o, e.p, PEN_RATE.FORM * (oc.tags.has('MOTION') ? 1.5 : 1))) cands.push({ k: 'FORM', e, s: o }); }
  if (!cands.length) return null;
  return cands[0]; // the first whistle kills the play
}

// ---------- live ball: fouls that come out of what actually happened ----------
function liveFoul(g, res, oc, off, def) {
  const o = g.poss, d = 1 - o;
  let offF = null, defF = null;
  const pass = res.kind !== 'run' && !(res.kind === 'scramble' && !res.prot) && res.prot;
  // offensive holding: a beaten blocker grabs
  if (pass) {
    for (const a of res.prot.rushers) {
      if (offF || !a.blockers.length || a.free) continue;
      const b = a.blockers[0], beaten = a.t < 2.5 ? 1 : a.t < 3.2 ? 0.35 : 0.1;
      if (tryFoul(g, o, b.p, PEN_RATE.HOLD_PASS * beaten)) offF = { k: 'HOLD', e: b, s: o };
    }
  } else if (res.blk) {
    for (const r of res.blk) {
      if (offF || r.state !== 'blocked' || !r.blockers.length) continue;
      const b = r.blockers[0];
      if (tryFoul(g, o, b.p, PEN_RATE.HOLD_RUN * clamp(r.win * 1.6, 0.1, 1.5))) offF = { k: 'HOLD', e: b, s: o };
    }
  }
  if (pass && res.target && !res.hail) {
    const air = res.air || 0, cov = res.def;
    // pass interference: a beaten or trailing defender on a downfield ball
    if (cov && air >= 6) {
      const beaten = res.route && res.route.w > 0.3 ? 1.5 : 1, deep = air >= 20 ? 1.7 : 1;
      const w = (res.kind === 'inc' ? 1.6 : res.contested ? 1.2 : 0.35) * beaten * deep;
      if (tryFoul(g, d, cov.p, PEN_RATE.DPI * w)) defF = { k: 'DPI', e: cov, s: d, air };
    }
    // offensive pass interference: push-offs on contested balls, picks on rub routes
    if (!offF && tryFoul(g, o, res.target.p, PEN_RATE.OPI * (res.contested ? 2.2 : 1) * (oc.tags.has('RUB') ? 2 : 1))) offF = { k: 'OPI', e: res.target, s: o };
  }
  // defensive holding / illegal contact on a receiver away from the ball
  if (pass && !defF) {
    const dbs = def.filter(e => e.depth > 0 && ['CB1', 'CB2', 'NCB', 'DIME', 'FS', 'SS', 'WLB', 'MLB'].includes(e.name));
    if (dbs.length) { const e = pick(dbs); if (tryFoul(g, d, e.p, PEN_RATE.DH * (['CB1', 'CB2', 'NCB', 'DIME'].includes(e.name) ? 1.4 : 0.6))) defF = { k: rand() < 0.2 ? 'IC' : 'DH', e, s: d }; }
  }
  // roughing the passer: a late or low hit from a rusher who got home
  if (pass && !defF && res.rushers && res.rushers.length) {
    const hit = res.rushers[0];
    const w = res.kind === 'sack' ? 1.4 : res.pressure ? 1.2 : 0.4;
    if (hit.e && tryFoul(g, d, hit.e.p, PEN_RATE.RTP * w)) defF = { k: 'RTP', e: hit.e, s: d };
  }
  // late hits and face masks from the tackler
  if (!defF && res.tackler && res.tackler.p) {
    if (tryFoul(g, d, res.tackler.p, PEN_RATE.UR)) defF = { k: rand() < 0.3 ? 'FM' : 'UR', e: res.tackler, s: d };
  }
  if (offF && defF) return { offset: true, fouls: [offF, defF] };
  return offF || defF || null;
}

// ---------- accept or decline: the non-offending side takes the better outcome ----------
// value of a down/distance/spot to the offense (expected points; failing on 4th = their ball)
function penVal(down, togo, ydl) {
  if (ydl >= 100) return 6.95;
  if (ydl <= 0) return -2.2;
  if (down > 4) return -epState(1, 10, 100 - ydl);
  return epState(down, Math.max(1, togo), ydl);
}
function playVal(g, res) {
  if (res.kind === 'int') return -epState(1, 10, clamp(100 - (res.intSpot || g.ydl + (res.air || 0)) + (res.ret || 0), 1, 99)) - 0.4;
  let yds = res.kind === 'inc' ? 0 : Math.min(res.yds || 0, 100 - g.ydl);
  if (res.kind === 'sack') yds = Math.max(res.yds || 0, -g.ydl);
  const ny = g.ydl + yds;
  if (ny >= 100) return 6.95;
  if (ny <= 0) return -2.2;
  const v = yds >= g.togo ? penVal(1, Math.min(10, 100 - ny), ny) : penVal(g.down + 1, g.togo - yds, ny);
  return res.fumble ? v - 1.2 : v;
}
// where the ball goes if the foul is enforced
function penOutcome(g, f) {
  const P_ = PEN[f.k];
  if (P_.o) {
    const yy = g.ydl - P_.y < 1 ? Math.floor(g.ydl / 2) : P_.y; // half the distance near our own goal
    return { yds: -yy, down: g.down, togo: g.togo + yy, half: yy !== P_.y };
  }
  let yy = P_.spot ? Math.max(1, f.air || 1) : P_.y;
  let spotLine = false;
  if (g.ydl + yy >= 100) {
    if (P_.spot) { yy = 99 - g.ydl; spotLine = true; } // interference in the end zone: ball at the 1
    else yy = Math.max(1, Math.floor((100 - g.ydl) / 2));
  }
  const ny = g.ydl + yy, first = P_.af || yy >= g.togo;
  return { yds: yy, down: first ? 1 : g.down, togo: first ? Math.min(10, 100 - ny) : g.togo - yy, half: yy !== P_.y && !P_.spot, first, spotLine };
}
function penAccept(g, f, res) {
  const out = penOutcome(g, f);
  const vPen = penVal(out.down, out.togo, g.ydl + out.yds);
  if (!res) return { out, ok: true }; // pre-snap: no choice
  const vPlay = playVal(g, res);
  return { out, ok: PEN[f.k].o ? vPen < vPlay : vPen > vPlay };
}

// ---------- enforce & record ----------
function penRecord(g, f, yds) {
  const ps = penState(g)[f.s];
  if (globalThis.__penTally) globalThis.__penTally[f.k] = (globalThis.__penTally[f.k] || 0) + 1;
  ps.n++; ps.by[f.e.p.id] = (ps.by[f.e.p.id] || 0) + 1;
  inc(g, f.e.p, 'pen'); inc(g, f.e.p, 'penY', Math.abs(yds));
  g.ts[f.s].pen = (g.ts[f.s].pen || 0) + 1; g.ts[f.s].penY = (g.ts[f.s].penY || 0) + Math.abs(yds);
  const fac = PEN[f.k].f;
  if (fac && typeof grade === 'function' && f.e.p.id >= 0) grade(g, f.e.p, fac, -GRADE_SCALE[fac] * 3);
  // a third flag gets a player pulled for a breather
  if (ps.by[f.e.p.id] >= 3 && g.ps[f.e.p.id] && f.e.slot !== 'QB') g.ps[f.e.p.id].fat = (g.ps[f.e.p.id].fat || 0) + 8;
  if (g.drive && f.s === g.poss) g.drive.pen = (g.drive.pen || 0) + 1;
}
function penText(g, f, out, extra) {
  const P_ = PEN[f.k];
  const yTxt = P_.spot ? (out.spotLine ? 'ball at the 1' : `${out.yds} yds (spot foul)`) : `${Math.abs(out.yds)} yds${out.half ? ' (half the distance)' : ''}`;
  return `PENALTY on ${T(g.tids[f.s]).abbr}, ${pshort(f.e.p)}: ${P_.n}, ${yTxt}${P_.af && !P_.o ? ', automatic first down' : ''}${extra || ''}`;
}
// apply an accepted foul: replay the down from the new spot
function enforceFoul(g, f, out, pre) {
  const o = g.poss;
  penRecord(g, f, out.yds);
  g.ydl = clamp(g.ydl + out.yds, 1, 99);
  g.down = out.down; g.togo = Math.max(1, Math.min(out.togo, 100 - g.ydl));
  if (out.first || (PEN[f.k].o ? false : out.down === 1)) g.ts[o].fdPen = (g.ts[o].fdPen || 0) + 1;
  if (g.drive) g.drive.yds += out.yds;
  logPlay(g, null, penText(g, f, out, pre ? '' : '. The play is wiped out') + `. ${ordinal(g.down)} & ${g.ydl + g.togo >= 100 ? 'Goal' : g.togo}.`);
}

// called from runPlay before the snap resolves; returns true if a pre-snap foul ended the play
function checkPreSnap(g, off, def, oc) {
  const f = preSnapFoul(g, off, def, oc);
  if (!f) return false;
  const { out } = penAccept(g, f, null);
  // offensive fouls with the clock running late in a half: 10-second runoff (unless they burn a timeout)
  if (PEN[f.k].o && g.wasRunning && (g.q === 2 || g.q >= 4) && g.clock <= 60) {
    if (!(g.to[g.poss] > 0 && g.score[g.poss] <= g.score[1 - g.poss] && callTimeout(g, g.poss, 'avoiding the runoff'))) runClock(g, Math.min(10, g.clock));
  }
  enforceFoul(g, f, out, true);
  g.running = false;
  return true;
}
// called from runPlay after the snap resolves; returns true if the foul replaced the play's result
function checkLive(g, res, oc, off, def) {
  if (res.hail) return false;
  const f = liveFoul(g, res, oc, off, def);
  if (!f) return false;
  const wipe = () => { const ts = g.ts[g.poss]; ts.plays--; if (g.down === 3) ts.d3a--; else if (g.down === 4) ts.d4a--; }; // a play wiped out by a flag doesn't count
  if (f.offset) {
    wipe();
    for (const x of f.fouls) penRecord(g, x, 0);
    runClock(g, randInt(4, 7)); g.running = false;
    logPlay(g, null, `Offsetting penalties: ${f.fouls.map(x => `${PEN[x.k].n} (${T(g.tids[x.s]).abbr} ${pshort(x.e.p)})`).join(' and ')}. Replay ${ordinal(g.down)} down.`);
    untimedDown(g, true);
    return true;
  }
  const { out, ok } = penAccept(g, f, res);
  if (!ok) { g.penDeclined = f; if (globalThis.__penTally) globalThis.__penTally.declined = (globalThis.__penTally.declined || 0) + 1; return false; } // declined: the play stands
  wipe();
  runClock(g, randInt(4, 7));
  enforceFoul(g, f, out, false);
  g.running = false;
  untimedDown(g, !PEN[f.k].o);
  return true;
}
// a half can't end on an accepted defensive foul
function untimedDown(g, defensive) { if (defensive && g.clock <= 0 && (g.q === 2 || g.q >= 4)) g.clock = 0.5; }

// special teams: holds and blocks in the back on returns cost 10 yards from the spot (never past the 1)
function returnFoul(g, recvSide, start) {
  const ro = g.side[recvSide].roster.filter(p => p.a && !['QB', 'K', 'P'].includes(p.spot));
  if (!ro.length) return start;
  const p = pick(ro);
  if (!tryFoul(g, recvSide, p, PEN_RATE.ST)) return start;
  const k = rand() < 0.6 ? 'STH' : 'IBB';
  const yy = start - 10 < 1 ? Math.max(0, Math.floor(start / 2)) : 10; // half the distance inside the 10
  const f = { k, e: { p }, s: recvSide };
  penRecord(g, f, yy);
  pbpLog(g, `PENALTY on ${T(g.tids[recvSide]).abbr}, ${pshort(p)}: ${PEN[k].n}, ${yy} yds`, false);
  return Math.max(1, start - yy);
}
