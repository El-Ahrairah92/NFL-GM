'use strict';
// =====================================================================
//  ENGINE · play calling (offense & defense)
//  Calls are simultaneous: each side only knows situation, film and what it has seen this game.
//  docs/PLAYBOOK_SPEC.md §2-§5, §7 · docs/DESIGN.md §6d-§6e
// =====================================================================
const RUN_TYPES = new Set(['RUN', 'DRAW', 'OPTION', 'SNEAK', 'JET']);
const PASS_TYPES = new Set(['QUICK', 'DROP', 'DEEP', 'RBSCR', 'WRSCR', 'GADGET']);
// tags allowed per play type (spec §7a)
const TAG_OK = {
  RUN_RB_IN: ['MOTION', 'RPO'], RUN_RB_OUT: ['MOTION', 'TRICK', 'RPO'], RUN_QB: ['MOTION'], RUN_FB: [],
  DRAW: ['MOTION'], OPTION: ['MOTION'], SNEAK: [], JET: ['MOTION', 'TRICK'],
  QUICK: ['MOTION', 'BOOT', 'RUB', 'SIDE'], DROP: ['MOTION', 'PA', 'BOOT', 'RUB', 'SIDE'], DEEP: ['MOTION', 'TRICK', 'PA', 'BOOT', 'SIDE'],
  RBSCR: ['MOTION'], WRSCR: ['MOTION'], GADGET: ['MOTION'],
};
function downBucket(g) {
  if (g.ydl >= 97 && g.togo >= 100 - g.ydl) return 'GL';
  if (g.down === 1) return 'D1';
  if (g.down === 2) return g.togo <= 3 ? 'D2S' : g.togo <= 7 ? 'D2M' : 'D2L';
  return g.togo <= 2 ? 'D3S' : g.togo <= 6 ? 'D3M' : 'D3L';
}
function situation(g) {
  const o = g.poss, diff = g.score[o] - g.score[1 - o];
  const b = downBucket(g);
  return {
    b, diff, hurry: isHurry(g), milk: g.q >= 4 && diff > 0 && g.clock < 420,
    short: g.togo <= 2 && g.down >= 2, passDown: (g.down === 3 && g.togo >= 5) || (g.down === 2 && g.togo >= 10) || isHurry(g),
    red: g.ydl >= 80, gl: g.ydl >= 95, backed: g.ydl <= 5, needClock: (g.q === 2 || g.q === 4) && g.clock <= 150 && (g.q === 2 || diff <= 0),
  };
}
// ---------- film (scouting tendencies, season-to-date) ----------
function filmKey(b, pers) { return b + '|' + pers; }
function filmRunRate(tid, b, pers, g, s) {
  const f = (T(tid).film || {})[filmKey(b, pers)] || [0, 0];
  const live = g.liveFilm[s][filmKey(b, pers)] || [0, 0];
  const runs = f[0] + live[0] * 2, passes = f[1] + live[1] * 2;
  return (runs + 2) / (runs + passes + 4);
}
function recordFilm(g, s, b, pers, isRun) {
  const k = filmKey(b, pers);
  const live = g.liveFilm[s][k] || (g.liveFilm[s][k] = [0, 0]);
  live[isRun ? 0 : 1]++;
}
function defFilm(tid) { return T(tid).dfilm || { n: 0, man: 0, blitz: 0, high: 0 }; }
// What this defense has shown so far today. The offense starts from what an ordinary defense does and believes its own eyes
// more with every snap, so a defense that does one thing all afternoon stops surprising anyone.
function newSeen() { return { n: 0, blitz: 0, man: 0, sl0: 0, sl1: 0, twist: 0 }; }
function recordSeen(g, s, dc) {
  const f = g.dSeen && g.dSeen[s]; if (!f) return;
  const pl = dc.plan || {};
  f.n++; if (pl.rush ? pl.rush.length >= 5 : dc.pres === 'BLITZ' || dc.pres === 'FZ') f.blitz++;
  if (MAN_SHELLS.includes(dc.cov)) f.man++;
  if (pl.slant) { const v = Object.values(pl.slant); if (v.some(x => x < 0)) f.sl0++; if (v.some(x => x > 0)) f.sl1++; }
  if (pl.twist ? pl.twist.length : dc.stunt) f.twist++;
}
function seenShare(g, s, k, prior) { const f = g.dSeen && g.dSeen[s]; return f ? (f[k] + prior * 8) / (f.n + 8) : prior; }

function wpick(obj) {
  const ks = Object.keys(obj).filter(k => obj[k] > 0);
  if (!ks.length) return null;
  return weightedPick(ks, ks.map(k => obj[k]));
}
// ---------- offense ----------
function offenseCall(g) {
  const o = g.poss, d = 1 - o, cx = g.cx[o], ot = cx.ot, T_ = g.side[o], sit = situation(g);
  const pcF = cx.pc / 99, adpF = cx.adp / 99;
  const call = { b: sit.b, tags: new Set(), passDown: sit.passDown };
  // --- run or pass intent
  let pr = g.basePass[o];
  if (g.down === 1) pr -= 0.07;
  else if (g.down === 2) pr += g.togo >= 8 ? 0.1 : g.togo <= 3 ? -0.12 : 0;
  else pr = g.togo >= 7 ? 0.9 : g.togo >= 4 ? 0.74 : g.togo <= 1 ? 0.3 : 0.52;
  if (sit.gl) pr -= 0.05;
  if (sit.milk) pr -= 0.1 + 0.25 * cx.clock;
  else if (g.q >= 3 && sit.diff <= -14) pr += 0.12;
  else if (g.q >= 3 && sit.diff >= (g.q >= 4 ? 9 : 17)) pr -= 0.12; // sitting on a lead: shorten the game
  if (sit.hurry) pr = Math.max(pr, 0.84);
  // play caller's plan + in-game adjustment toward what works
  pr += g.tilt[o] * pcF * TUNE.passLean;
  const fr = g.famStats[o];
  const sr = f => fr[f] && fr[f][0] >= 4 ? fr[f][1] / fr[f][0] : 0.45;
  pr += clamp((sr('PASS') - sr('RUN')) * 0.35, -0.07, 0.07) * pcF;
  const isRun = rand() >= clamp(pr, 0.05, 0.97);
  // --- personnel (intent shapes it; adaptability favors groupings that use the roster's best players)
  const pw = {};
  const runM = { 10: 0.35, 11: 0.85, 12: 1.35, 13: 1.7, 21: 1.55, 22: 1.9, JUMBO: 0 }, passM = { 10: 1.7, 11: 1.15, 12: 0.75, 13: 0.45, 21: 0.65, 22: 0.35, JUMBO: 0 };
  for (const k in ot.pers) pw[k] = ot.pers[k] * (isRun ? runM[k] : passM[k]);
  const te2 = T_.depth.TEH[1] || T_.depth.TEY[1], wr3 = T_.depth.SLOT[0];
  if (te2 && te2.r >= 70) pw[12] = (pw[12] || 0) * (1 + adpF * 0.5);
  if (wr3 && wr3.r < 64) { pw[10] = (pw[10] || 0) * (1 - adpF * 0.6); pw[11] = (pw[11] || 0) * (1 - adpF * 0.25); }
  if (!T_.depth.FB.length || T_.depth.FB[0].r < 55) { pw[21] = (pw[21] || 0) * 0.3; pw[22] = (pw[22] || 0) * 0.3; }
  if (sit.short || sit.gl) { pw[13] = (pw[13] || 0) + 8; pw[22] = (pw[22] || 0) + 6; if (isRun && g.togo <= 1) pw.JUMBO = 7; }
  if (sit.hurry || sit.b === 'D3L') { for (const k of ['12', '13', '21', '22', 'JUMBO']) pw[k] = (pw[k] || 0) * 0.15; pw[10] = (pw[10] || 0) + 6; pw[11] = (pw[11] || 0) + 12; }
  call.pers = wpick(pw) || '11';
  // --- formation
  let uc = ot.uc + (isRun ? 0.15 : -0.12);
  if (sit.short || sit.gl) uc += 0.35;
  if (sit.passDown) uc -= 0.3;
  if (sit.hurry) uc = 0;
  uc = clamp(uc, 0, 0.92);
  call.form = rand() < uc ? 'UC' : ((ot.rpo + ot.qbRun > 0.25 && rand() < 0.35) || rand() < (ot.pistol || 0) * 0.5 ? 'PI' : 'SG');
  if (!isRun && call.form === 'SG' && ['10', '11'].includes(call.pers) && ((sit.b === 'D3L' || sit.b === 'D3M') && rand() < 0.12 || rand() < (ot.empty || 0) * 0.5)) call.form = 'EMP';
  // --- play type
  const qb = starterQB(g, g.poss);
  const qbMob = qb && qb.a ? (qb.a.spd + qb.a.agi + qb.a.elu) / 3 : 40;
  const adv = g.advEst[o];
  const tilt = f => Math.exp(clamp(adv[f] || 0, -1, 1) * 0.25 * pcF) * Math.exp(clamp((sr(f) - 0.45) * 1.6, -0.4, 0.4) * pcF * 0.6);
  if (isRun) {
    const w = { RUN: 1 * tilt('RUN') };
    if (call.form !== 'EMP') w.RUN_QB = ot.qbRun * 2.6 * clamp((qbMob - 55) / 18, 0.1, 2.4) * tilt('RUN');
    else { w.RUN = 0; w.RUN_QB = 1; }
    if (call.form !== 'UC' && qbMob >= 66) w.OPTION = (ot.rpo + ot.qbRun) * 0.55 * tilt('OPTION');
    if (call.form !== 'UC') w.DRAW = (sit.passDown || g.down === 2 ? 0.32 : 0.06) * tilt('DRAW');
    if (g.togo <= 1 && call.form === 'UC') w.SNEAK = g.ydl >= 99 ? 0.6 : 0.5;
    const fastWR = Math.max(...['WRZ', 'SLOT', 'WRX'].map(sp => T_.depth[sp][0] && T_.depth[sp][0].p.a ? T_.depth[sp][0].p.a.spd : 0));
    if (!sit.gl && fastWR >= 86) w.JET = ot.motion * 0.12;
    if (PERSONNEL[call.pers].includes('FB') && g.togo <= 2) w.RUN_FB = 0.18;
    let t = wpick(w) || 'RUN';
    call.type = t === 'RUN_QB' || t === 'RUN_FB' ? 'RUN' : t;
    call.carrier = t === 'RUN_QB' ? 'QB' : t === 'RUN_FB' ? 'FB' : 'RB';
    call.scheme = rand() < ot.zone ? 'ZONE' : 'GAP';
    // which zone, which gap play: wide zone stretches the edge; counter and duo are the gap team's changeups
    const plain = call.type === 'RUN' && call.carrier === 'RB';
    const wide = call.scheme === 'ZONE' && rand() < (ot.wz !== undefined ? ot.wz : 0.4);
    if (plain && call.scheme === 'GAP') { if (rand() < (ot.counter || 0)) call.counter = true; else if (rand() < (ot.duo || 0)) call.duo = true; }
    if (plain && call.scheme === 'ZONE') call.wide = wide;
    call.dir = call.type === 'JET' ? 'OUT' : call.carrier === 'FB' || call.type === 'SNEAK' || call.duo ? 'IN' : rand() < (call.scheme === 'ZONE' ? (wide ? 0.72 : 0.32) : call.counter ? 0.5 : 0.36) ? 'OUT' : 'IN';
    call.side = rand() < 0.6 ? 1 : -1;
  } else {
    const blitzy = seenShare(g, d, 'blitz', 0.25);
    const quick = ot.quick, deep = ot.deep;
    const armF = clamp(1 + (deepArm(qb) - DEEP.ref) * DEEP.call, DEEP.callLo, DEEP.callHi); // shots are called for the man who can make them
    const w = { QUICK: quick * tilt('QUICK'), DROP: Math.max(0.1, 1 - quick - deep) * tilt('DROP'), DEEP: deep * tilt('DEEP') * armF,
      RBSCR: ot.screen * 0.5 * tilt('RBSCR'), WRSCR: ot.screen * 0.5 * tilt('WRSCR'), GADGET: ot.trick * 0.06 };
    if (sit.b === 'D3L') { w.DEEP *= 1.2; w.DROP *= 1.35; w.QUICK *= 0.55; }
    if (sit.b === 'D3S' || sit.b === 'D2S') { w.QUICK *= 1.8; w.DEEP *= 0.7; }
    if (sit.red) { w.DEEP *= 0.45; w.QUICK *= 1.35; w.GADGET *= 0.5; }
    if (sit.hurry) { w.QUICK *= 1.3; w.DROP *= 1.25; w.RBSCR *= 0.3; w.WRSCR *= 0.5; w.GADGET = 0; }
    if (sit.backed) { w.DEEP *= 0.3; w.RBSCR *= 0.4; }
    if (call.form === 'EMP') { w.RBSCR = 0; w.DEEP *= 0.8; }
    if (g.togo >= 15) w.RBSCR *= 1.6;
    // a defense that has been coming all day gets the ball out quick and the screen; one that never comes gets tested deep
    { const b = clamp(blitzy - 0.25, -0.2, 0.6) * pcF; w.QUICK *= 1 + b * 1.6; w.RBSCR *= 1 + b * 2.4; w.WRSCR *= 1 + b * 1.2; w.DEEP *= Math.max(0.3, 1 - b * 0.9); }
    call.type = wpick(w) || 'DROP';
  }
  // --- tags (spec §7a compatibility; Motion + one other, PA+Boot, Rub+Sideline)
  const key = call.type === 'RUN' ? (call.carrier === 'QB' ? 'RUN_QB' : call.carrier === 'FB' ? 'RUN_FB' : call.dir === 'IN' ? 'RUN_RB_IN' : 'RUN_RB_OUT') : call.type;
  const ok = new Set(TAG_OK[key] || []);
  const manRate = seenShare(g, d, 'man', 0.35);
  if (ok.has('MOTION') && rand() < ot.motion * (sit.hurry ? 0.2 : 0.75)) call.tags.add('MOTION');
  if (call.type === 'JET') call.tags.add('MOTION');
  if (ok.has('PA') && !sit.hurry && (g.down <= 2 || g.togo <= 3) && call.form !== 'EMP' && rand() < ot.pa * (call.form === 'SG' ? 3.8 : 6.0) * Math.exp(clamp(adv.PA || 0, -1, 1) * 0.3 * pcF)) call.tags.add('PA');
  if (ok.has('BOOT') && !sit.hurry && call.form !== 'EMP' && rand() < ot.boot * (call.tags.has('PA') ? 1.8 : 0.4)) call.tags.add('BOOT');
  if (ok.has('RPO') && call.form !== 'UC' && rand() < ot.rpo * 1.3) call.tags.add('RPO');
  if (ok.has('RUB') && rand() < 0.06 + (manRate - 0.3) * 0.5 * pcF + (sit.red ? 0.12 : 0)) call.tags.add('RUB');
  if (ok.has('SIDE') && sit.needClock && rand() < 0.65) call.tags.add('SIDE');
  if (ok.has('TRICK') && rand() < ot.trick * (call.type === 'JET' ? 2.5 : 0.35)) call.tags.add('TRICK');
  // enforce allowed stacks
  const t = [...call.tags].filter(x => x !== 'MOTION');
  if (t.length > 1 && !(t.length === 2 && ((t.includes('PA') && t.includes('BOOT')) || (t.includes('RUB') && t.includes('SIDE'))))) {
    call.tags = new Set(call.tags.has('MOTION') ? ['MOTION', t[0]] : [t[0]]);
  }
  // formation and concept packages (only if they are on the sheet)
  const spreadSet = ['10', '11'].includes(call.pers) && call.form !== 'UC';
  if (!isRun) {
    if (spreadSet && rand() < (ot.trips || 0)) call.trips = true; else if (spreadSet && rand() < (ot.bunch || 0)) call.bunch = true;
    if ((call.type === 'DROP' || call.type === 'QUICK') && rand() < (ot.optrt || 0)) call.optrt = true;
    if ((call.type === 'DEEP' || (call.type === 'DROP' && call.tags.has('PA'))) && call.form !== 'EMP' && rand() < (ot.maxp || 0)) call.maxp = true;
  }
  if (!call.trips && !call.bunch && call.form !== 'EMP' && rand() < (ot.tight || 0)) call.tight = true;
  if (!sit.milk && !(g.q >= 3 && sit.diff >= 9) && rand() < (ot.nohud || 0)) call.nohud = true;
  // a quarterback who is still learning the playbook gets a simpler menu
  { const qbP = starterQB(g, o); if (qbP && qbP.a) { const k = pbOf(qbP), need = offNeed(call); if (k < need && rand() < clamp((need - k) / 35, 0, 1)) { call.tags = new Set(); if (call.type === 'DEEP' || call.type === 'GADGET') call.type = 'DROP'; else if (call.type === 'OPTION' || call.type === 'JET') call.type = 'RUN'; call.simple = true; for (const f of ['trips', 'bunch', 'tight', 'optrt', 'maxp', 'nohud', 'counter', 'duo']) delete call[f]; } } }
  call.isRun = RUN_TYPES.has(call.type);
  return call;
}

// ---------- defense ----------
function defenseCall(g, oc) {
  const o = g.poss, d = 1 - o, cx = g.cx[d], dt = cx.dt, sit = situation(g);
  const pcF = cx.pc / 99;
  // what does the film say this offense does from this down & personnel?
  const runEst = filmRunRate(g.tids[o], sit.b, oc.pers, g, o);
  const call = { front: dt.front, runEst };
  // package answers personnel
  const p = oc.pers;
  let pkg;
  if (p === '10') pkg = rand() < 0.7 ? 'DIME' : 'NICKEL';
  else if (p === '11') pkg = rand() < dt.base * 0.35 * (1 + (runEst - 0.45) * pcF) ? 'BASE' : ((sit.b === 'D3L' || sit.hurry) && rand() < TUNE.dimeLong ? 'DIME' : sit.b === 'D3M' && rand() < TUNE.dimeMid ? 'DIME' : 'NICKEL');
  else if (p === '12') pkg = rand() < 0.25 + dt.base * 0.8 ? 'BASE' : 'NICKEL';
  else if (p === 'JUMBO' || ((p === '22' || p === '13') && (sit.gl || sit.short))) pkg = sit.gl || g.togo <= 1 ? 'GL' : 'BASE';
  else pkg = 'BASE';
  call.pkg = pkg;
  if (dt.pk && dt.pk.fr) { const fr = dt.pk.fr, heavy = ['12', '13', '21', '22', 'JUMBO'].includes(p);
    if (pkg === 'BASE') { if (rand() < fr.BEAR * (sit.short || sit.gl ? 2.5 : heavy ? 1.6 : runEst > 0.55 ? 1.2 : 0.5)) call.front = 'Bear'; else if (rand() < fr.UNDER) call.front = 'Under'; }
    if (pkg === 'NICKEL' && rand() < fr.BIGN * (p === '12' ? 1.7 : runEst > 0.5 ? 1.2 : 0.8)) call.bign = true; }
  // coverage
  let man = dt.man, high = dt.high + 0.08, blitz = dt.blitz;
  if (sit.b === 'D3L') { high += 0.2; man -= 0.08; }
  if (sit.gl || sit.red) { man += 0.18; high -= 0.2; blitz += 0.06; }
  if (sit.hurry && sit.diff < 0) { high += 0.15; blitz -= 0.08; } // offense trailing late: keep it in front
  // protecting a big lead in the second half: soft shells, rush four, trade yards for clock (sit.diff is the offense's margin)
  if (g.q >= 3 && sit.diff <= (g.q >= 4 ? -11 : -21)) { call.soft = true; high += 0.3; man -= 0.15; blitz -= 0.12; }
  // play caller: expecting run -> load the box (single-high) and run-blitz; expecting pass -> rush/cover
  high += (0.5 - runEst) * 0.25 * pcF;
  blitz += (runEst - 0.5) * 0.12 * pcF;
  let twoHigh;
  if (dt.pk) {
    // weight every installed shell by its share of the sheet, bent by the situation
    const base = dt.pk.sh, w = {}, m0 = pkShare(base, MAN_SHELLS) || 0.01, h0 = pkShare(base, HIGH_SHELLS) || 0.01;
    const manK = clamp(man, 0.05, 0.9) / clamp(dt.man, 0.05, 0.9), highK = clamp(high, 0.05, 0.95) / clamp(dt.high + 0.08, 0.05, 0.95);
    for (const k in base) { let v = base[k]; if (MAN_SHELLS.includes(k)) v *= manK; else v *= (1 - m0 * manK) / Math.max(0.05, 1 - m0); v *= HIGH_SHELLS.includes(k) ? highK * 1.12 : (1 - h0 * highK) / Math.max(0.05, 1 - h0);
      if (k === 'T2' && (sit.gl || sit.red)) v *= 0.4; if (k === 'C0' && !(sit.red || g.down >= 3)) v *= 0.3; w[k] = Math.max(0.001, v); }
    call.cov = wpick(w) || 'C3';
    twoHigh = HIGH_SHELLS.includes(call.cov);
    call.disg = rand() < (dt.pk.disg || 0);
  } else {
    const isMan = rand() < clamp(man, 0.05, 0.9); twoHigh = rand() < clamp(high, 0.05, 0.95);
    if (isMan) call.cov = twoHigh ? 'C2M' : 'C1';
    else call.cov = twoHigh ? (rand() < 0.5 ? 'C2' : 'C4') : 'C3';
  }
  // pressure
  const r = rand();
  if (r < clamp(blitz, 0.03, 0.6)) call.pres = dt.pk && rand() < (dt.pk.pr.FZ || 0) / Math.max(0.01, (dt.pk.pr.FZ || 0) + (dt.pk.pr.BLITZ || 0)) ? 'FZ' : 'BLITZ';
  else if (r < clamp(blitz, 0.03, 0.6) + dt.sim) call.pres = 'SIM';
  else if (sit.b === 'D3L' && twoHigh && rand() < Math.max(0, high - 0.35) * 0.35) call.pres = 'THREE';
  else call.pres = 'FOUR';
  if (call.cov === 'C1' && call.pres === 'BLITZ' && (sit.red || g.down >= 3) && rand() < 0.3) call.cov = 'C0';
  if (call.cov === 'C0') call.pres = 'BLITZ';
  // a fire zone is five rushers with three under and three deep behind them, whatever the sheet said
  if (call.pres === 'FZ') call.cov = 'C3';
  call.stunt = call.pres !== 'BLITZ' && rand() < dt.stunt;
  // obvious passing downs in nickel or dime: the pass-rush line. If you named rush specialists, they come in every time.
  const uc = userChart(g, d, 'def'), named = uc && (hasList(uc, 'RUSHE') || hasList(uc, 'RUSHI'));
  call.subRush = (pkg === 'NICKEL' || pkg === 'DIME') && sit.passDown && (named || rand() < 0.6);
  call.runBlitz = (call.pres === 'BLITZ' || call.pres === 'FZ') && runEst > 0.55;
  return call;
}

// ---------- before the snap ----------
// Each side has one move at the line. The quarterback counts the box, the two sides and the shell he is shown (which may be a
// disguise, and which he may simply miscount) and, as far as he is trusted to, gets out of a bad play. The defense's
// signal-caller hears the check and may answer it, but he has to guess what it was, and quarterbacks make dummy calls,
// so answering is always a gamble. Nobody gets a second move: the ball is snapped.
function boxLook(off, def, dc) {
  const single = dc.cov === 'C1' || dc.cov === 'C3' || dc.cov === 'C0';
  const hats = off.filter(e => OL_SLOTS.includes(e.slot) || INLINE.has(e.slot) || e.slot === 'FB');
  const box = def.filter(e => e.depth <= 5.5 && Math.abs(e.x) <= 3.6), down = box.some(e => e.slot === 'SS' || e.slot === 'FS');
  const over = s => box.filter(e => e.x * s > 0.25).length - hats.filter(e => e.x * s > 0.25).length; // defenders he cannot block on that side
  return { single, down, hats: hats.length, men: box.length, over: [over(-1), over(1)] };
}
// Bodies at the point of attack if this run went to that side: the men on the line near the hole and the linebackers behind it,
// less the blockers who can get there. It is what a quarterback can count from under center.
function runAim(oc, side) { const out = oc.dir === 'OUT', zone = oc.scheme === 'ZONE'; return side * (out ? (zone ? 2.9 : 2.3) : (zone ? 0.6 : 1.0)); }
function holeCount(off, def, oc, side) {
  const t = runAim(oc, side), near = (e, r) => Math.abs(e.x - t) <= r;
  return def.filter(e => e.depth < ON_LINE ? near(e, 1.4) : e.depth <= 5.5 && near(e, 2)).length - off.filter(e => (OL_SLOTS.includes(e.slot) || INLINE.has(e.slot)) && near(e, 1.5)).length;
}
function preSnap(g, oc, dc, off, def) {
  const o = g.poss, d = 1 - o, qb = off.find(e => e.slot === 'QB');
  if (!qb || !qb.p.a || oc.simple || oc.type === 'SNEAK' || oc.type === 'GADGET' || oc.tags.has('TRICK')) return;
  const sit = situation(g), proc = ea(g, qb, 'proc'), L = boxLook(off, def, dc);
  // what he sees: a disguised shell fools him unless he reads through it, and a poor processor miscounts now and then
  const fooled = dc.disg && rand() >= lgt((proc - 72) * 0.07 - 0.2);
  const single = fooled ? !L.single : L.single;
  const miss = rand() < clamp(0.22 - (proc - 50) * 0.005, 0.03, 0.3) ? (rand() < 0.5 ? -1 : 1) : 0;
  const extra = L.men + (single && !L.down ? 1 : 0) + miss - L.hats; // defenders in the box beyond the blockers: 1 is ordinary
  // how much he is allowed to change: his head, how well he knows the offense, and whether he can be heard
  const lic = clamp(0.18 + (proc - 60) * 0.014, 0.04, 0.7) * clamp(pbOf(qb.p) / 85, 0.4, 1.1) * (o === 1 ? 0.85 : 1) * TUNE.checkRate;
  const ot = g.cx[o].ot, keepTags = () => { oc.tags = new Set(oc.tags.has('MOTION') ? ['MOTION'] : []); };
  if (oc.isRun) {
    const plain = (oc.type === 'RUN' || oc.type === 'OPTION') && oc.carrier !== 'FB';
    const lean = holeCount(off, def, oc, oc.side) - holeCount(off, def, oc, -oc.side); // how many more bodies are waiting on the side he is running at
    if (plain && extra >= 2 && rand() < lic * (extra >= 3 ? 1.3 : 1) * (sit.short || sit.gl ? 0.3 : 1) * (sit.milk ? 0 : 1)) {
      // too many to block: throw it
      oc.type = rand() < 0.7 ? 'QUICK' : 'DROP'; oc.isRun = false; keepTags();
      for (const k of ['carrier', 'scheme', 'counter', 'duo', 'wide', 'dir']) delete oc[k];
      oc.checked = 'pass';
    } else if (plain && lean >= 1 && rand() < lic * (lean >= 2 ? 1 : 0.5)) { oc.side = -oc.side; oc.checked = 'flip'; }
  } else if (oc.type === 'QUICK' || oc.type === 'DROP' || oc.type === 'DEEP') {
    // pressure showing: keep the back in (as before), or get the ball out
    oc.sawBlitz = (dc.plan && dc.plan.rush ? dc.plan.rush.length >= 5 : dc.pres === 'BLITZ' || dc.pres === 'FZ') && !fooled && rand() < lgt((proc - 60) * 0.06 + (seenShare(g, d, 'blitz', 0.25) - 0.25) * 3); // easier to see coming from a defense that has been coming all day
    const long = g.down >= 3 && g.togo >= 7;
    if (oc.sawBlitz && oc.type !== 'QUICK' && rand() < lic * 0.5) { oc.type = 'QUICK'; delete oc.maxp; oc.checked = 'hot'; }
    else if (extra <= 0 && !single && oc.form !== 'EMP' && !sit.hurry && rand() < lic * (extra < 0 ? 0.9 : 0.35) * (long ? 0.15 : 1)) {
      // a light box with both safeties back: run it
      oc.type = oc.form !== 'UC' && sit.passDown ? 'DRAW' : 'RUN'; oc.isRun = true; oc.carrier = 'RB'; oc.scheme = rand() < ot.zone ? 'ZONE' : 'GAP'; oc.dir = 'IN';
      { const a = holeCount(off, def, oc, 1), b = holeCount(off, def, oc, -1); oc.side = a < b ? 1 : b < a ? -1 : rand() < 0.5 ? 1 : -1; } keepTags();
      for (const k of ['optrt', 'maxp', 'sawBlitz']) delete oc[k];
      oc.checked = 'run';
    }
  }
  // a dummy call: it sounds like a check and changes nothing
  if (!oc.checked && rand() < lic * 0.3) oc.dummy = true;
  if (!oc.checked && !oc.dummy) return;
  // the answer
  const cap = def.filter(e => ['MLB', 'WLB', 'SAM', 'SS', 'FS'].includes(e.slot)).sort((a, b) => ea(g, b, 'prec') - ea(g, a, 'prec'))[0];
  if (!cap || dc.pres === 'FZ') return;
  const prec = ea(g, cap, 'prec');
  if (rand() >= clamp(0.1 + (prec - 60) * 0.012 + (g.cx[d].dpc - 60) * 0.002, 0.03, 0.5) * (oc.nohud ? 0.6 : 1) * TUNE.answerRate) return;
  const truth = oc.isRun ? 'run' : 'pass', right = oc.dummy ? rand() < 0.5 : rand() < clamp(0.55 + (prec - 65) * 0.01, 0.4, 0.8);
  const think = right ? truth : truth === 'run' ? 'pass' : 'run';
  const BACK = { C3: 'C4', C1: 'C2M', C0: 'C1' }, DOWN = { C2: 'C3', C4: 'C3', C6: 'C3', T2: 'C3', C2M: 'C1' };
  if (think === 'pass') { if (BACK[dc.cov]) dc.cov = BACK[dc.cov]; dc.runBlitz = false; } // a safety backs out of the box
  else if (DOWN[dc.cov]) dc.cov = DOWN[dc.cov]; // a safety spins down into it
  dc.answer = think; dc.answerRight = right;
}

// Pre-game estimate of where each offense has an edge vs this opponent (what a good play caller would see on film)
function gamePlanAdvantage(g, s) {
  const o = g.side[s], dside = g.side[1 - s];
  const best = (side, spot, k) => { const x = side.depth[spot][0]; return x && x.p.a ? (x.p.a[k] || 30) : 40; };
  const avgTop = (side, spot, n, k) => { const xs = side.depth[spot].slice(0, n); return xs.length ? avg(xs.map(x => x.p.a ? (x.p.a[k] || 30) : 40)) : 40; };
  const runBlk = avg(OL_SLOTS.map(sp => best(o, sp, 'rbk'))), passBlk = avg(OL_SLOTS.map(sp => best(o, sp, 'pbk')));
  const front = (avgTop(dside, 'DT', 2, 'shed') + best(dside, 'NT', 'shed') + avgTop(dside, 'MLB', 1, 'tkl')) / 3;
  const rush = (avgTop(dside, 'EDGE', 2, 'prsh') + best(dside, 'DT', 'prsh')) / 2;
  const wr = (best(o, 'WRX', 'rte') + best(o, 'WRZ', 'spd') + best(o, 'SLOT', 'rte')) / 3;
  const cb = (avgTop(dside, 'CB', 2, 'man') + best(dside, 'NCB', 'man') + best(dside, 'FS', 'zone')) / 3;
  const qbP = best(o, 'QB', 'proc'), lbCov = (best(dside, 'WLB', 'zone') + best(dside, 'MLB', 'zone')) / 2;
  const fd = defFilm(g.tids[1 - s]), blitzy = fd.n > 20 ? fd.blitz / fd.n : 0.25;
  const RUN = (runBlk - front) / 12 + (best(o, 'RB', 'vis') - 70) / 25;
  const PASS = (wr - cb) / 12 + (passBlk - rush) / 15 + (qbP - 70) / 25;
  g.tilt[s] = clamp((PASS - RUN) * 0.06, -0.08, 0.08);
  return {
    RUN, PASS, DRAW: RUN + (blitzy - 0.25) * 2, OPTION: RUN,
    QUICK: PASS + (blitzy - 0.25) * 2 - (passBlk - rush < -6 ? -0.4 : 0), DROP: PASS, DEEP: PASS + (passBlk - rush) / 12 + (best(o, 'WRZ', 'spd') - best(dside, 'CB', 'spd')) / 10,
    RBSCR: (blitzy - 0.25) * 3 + (best(o, 'RB', 'hnd') - lbCov) / 15, WRSCR: (best(o, 'SLOT', 'elu') - best(dside, 'NCB', 'tkl')) / 15,
    PA: RUN * 0.5 + (60 - (best(dside, 'MLB', 'prec') + best(dside, 'SS', 'prec')) / 2) / 15,
  };
}
