'use strict';
// =====================================================================
//  ENGINE · game flow: clock, rulebook, special teams, scoring, stats, play-by-play
//  docs/PLAYBOOK_SPEC.md §0, §3.12-3.14, §6 · docs/DESIGN.md §6d
// =====================================================================

// ---------- coaching context (DESIGN §6c) ----------
function coachCtx(tid, oppTid) {
  const t = T(tid), opp = T(oppTid);
  const oc = C(t.oc), dc = C(t.dc), hc = C(t.hc), stc = C(t.stc);
  const ooc = C(opp.oc), odc = C(opp.dc), ostc = C(opp.stc);
  const net = (a, b) => clamp(a - b, -35, 35) * 0.025;
  return {
    pb: net(designKnob(t, 'passD'), designKnob(opp, 'presD')) * 0.3,
    rb: net(designKnob(t, 'runD'), designKnob(opp, 'frontD')) * 2.2,
    ot: offTend(t), dt: defTend(t),
    pc: knob(offCaller(t), 'pc'), adp: knob(offCaller(t), 'adp'), dpc: knob(defCaller(t), 'pc'),
    gm: knob(hc, 'gm'), aggr: hc ? hc.t.aggr : 0.5, clock: hc ? hc.t.clock : 0.5,
    st: clamp(knob(stc, 'units') - knob(ostc, 'units'), -40, 40),
    famO: familiarityPenalty(t, 'O'), famD: familiarityPenalty(t, 'D'),
  };
}
function newTS() {
  return { pen: 0, penY: 0, fd: 0, plays: 0, passA: 0, passC: 0, passY: 0, sacks: 0, sackY: 0, rushA: 0, rushY: 0, to: 0, d3a: 0, d3c: 0, d4a: 0, d4c: 0, top: 0, punts: 0, prs: 0, tos: 0 };
}
function durMult(p) {
  if (!p || !p.h) return 1;
  const sc = p.tid >= 0 ? C(T(p.tid).sc) : null;
  return (1.6 - p.h.dur / 83) * (1.2 - knob(sc, 'prev') / 250) * (1 + (p.wear || 0) * 0.02);
}

// ---------- game ----------
function simGame(hTid, aTid, opts = {}) {
  const g = {
    tids: [hTid, aTid], score: [0, 0], qs: [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]], q: 1, clock: 900,
    poss: 0, ydl: 25, down: 1, togo: 10, stats: {}, ts: [newTS(), newTS()], scoring: [], drives: [], injuries: [],
    playoff: !!opts.playoff, neutral: !!opts.neutral, pre: opts.pre || 0, over: false, ot: false, otStarted: [0, 0], drive: null,
    side: [null, null], ps: {}, to: [3, 3], running: false, warned: {}, key: 0, liveFilm: [{}, {}], famStats: [{}, {}],
    runY: [[0, 0], [0, 0]], runCred: [4.2, 4.2], pbp: opts.pbp ? [] : null, adv: {}, tadv: [{}, {}], first: [{}, {}], basePass: [0.57, 0.57], tilt: [0, 0], advEst: [{}, {}],
  };
  g.cx = [coachCtx(hTid, aTid), coachCtx(aTid, hTid)];
  g.famPen = [0, 0]; // system familiarity now lives in each player's playbook knowledge
  const bonus = [g.neutral ? 0 : TUNE.hfa, 0].map((h, s) => h + gauss(0, TUNE.teamForm));
  // game-day form: Consistency (steadied by Culture), minus accumulated wear, plus home field & team form
  g.dressed = [...rosterOf(hTid), ...rosterOf(aTid)];
  for (const p of g.dressed) {
    const s = p.tid === hTid ? 0 : 1, cul = knob(C(T(p.tid).hc), 'cul');
    // form: the week of practice (known beforehand) plus what nobody could see coming
    p._gs = (p.h ? gauss(0, (0.5 + (100 - p.h.cons) / 25) * (1.15 - cul / 330) * 0.78) + pracBump(p) - repPenalty(p) - wearPenalty(p) : 0) + bonus[s];
  }
  for (let s = 0; s < 2; s++) initSide(g, s);
  for (let s = 0; s < 2; s++) {
    g.advEst[s] = gamePlanAdvantage(g, s);
    g.basePass[s] = basePassRate(g, s);
    for (const p of g.side[s].roster) if (p.id >= 0) ln(g, p).gp = 1;
  }
  g.recvFirst = rand() < 0.5 ? 0 : 1;
  kickoff(g, 1 - g.recvFirst);
  let guard = 0;
  while (!g.over && guard++ < 2500) {
    if (g.clock <= 0) { endPeriod(g); continue; }
    snap(g);
  }
  endDrive(g, 'End of Game');
  for (const id in g.ps) if (+id >= 0 && g.ps[id].snp && g.stats[id]) { g.stats[id].snp = g.ps[id].snp; if (g.ps[id].sp) g.stats[id].sp = g.ps[id].sp; if (g.ps[id].sq) g.stats[id].sq = g.ps[id].sq; }
  for (const p of g.dressed) delete p._gs;
  const box = {
    id: state.nextGid++, season: state.season, week: opts.week || 0, playoff: opts.playoff || null,
    tids: g.tids, score: g.score, qs: g.qs, ot: g.ot, stats: g.stats, ts: g.ts,
    scoring: g.scoring, drives: g.drives, injuries: g.injuries,
  };
  if (g.pbp) box.pbp = g.pbp;
  box.adv = g.adv; box.tadv = g.tadv;
  return box;
}
// adaptability bends the coordinator's run/pass lean toward this roster
function basePassRate(g, s) {
  const cx = g.cx[s], ot = cx.ot, d = g.side[s].depth;
  const r = sp => d[sp][0] ? d[sp][0].r : 50;
  const olPB = avg(OL_SLOTS.map(sp => d[sp][0] && d[sp][0].p.a ? d[sp][0].p.a.pbk : 50)), olRB = avg(OL_SLOTS.map(sp => d[sp][0] && d[sp][0].p.a ? d[sp][0].p.a.rbk : 50));
  const pref = 0.55 + (r('QB') - 75) * 0.004 - (r('RB') - 75) * 0.002 + (olPB - olRB) * 0.003;
  const lean = ot.pass - 0.01 + cx.adp / 99 * 0.8 * (pref - ot.pass);
  return clamp(0.532 + (lean - 0.565) * TUNE.passLean, 0.47, 0.64);
}
function ln(g, p) {
  if (!p) return {};
  // emergency fill-ins (no roster record) still get a line so the box score adds up
  return g.stats[p.id] || (g.stats[p.id] = p.id < 0 ? { tid: p.tid, nm: p.last } : { tid: p.tid });
}
function inc(g, p, k, v = 1) { if (!p) return; const l = ln(g, p); l[k] = (l[k] || 0) + v; }
function mx(g, p, k, v) { if (!p) return; const l = ln(g, p); l[k] = Math.max(l[k] || 0, v); }
function isHurry(g) {
  const diff = g.score[g.poss] - g.score[1 - g.poss];
  const gm = g.cx ? g.cx[g.poss].gm : 60;
  const late = 0.65 + gm / 280; // poorer game managers start the hurry-up late
  return g.q >= 5 || (g.q === 2 && g.clock <= 120) || (g.q >= 4 && diff < 0 && g.clock <= 300 * late) || (g.q >= 4 && diff <= -9 && g.clock <= 600 * late);
}
function spotTxt(g) { return g.ydl === 50 ? 'MID 50' : g.ydl < 50 ? T(g.tids[g.poss]).abbr + ' ' + g.ydl : T(g.tids[1 - g.poss]).abbr + ' ' + (100 - g.ydl); }
function pbpLog(g, text, extra) {
  if (!g.pbp) return;
  g.pbp.push({ q: g.q, c: Math.max(0, Math.round(g.clock)), t: g.tids[g.poss], dd: extra === false ? '' : `${ordinal(g.down)} & ${g.ydl + g.togo >= 100 ? 'Goal' : g.togo} at ${spotTxt(g)}`, x: text });
}

// ---------- clock ----------
function runClock(g, secs) {
  const before = g.clock;
  g.clock -= secs;
  // two-minute warning
  if ((g.q === 2 || g.q === 4) && before > 120 && g.clock <= 120 && !g.warned[g.q]) { g.clock = 120; g.warned[g.q] = true; g.running = false; pbpLog(g, 'Two-minute warning', false); }
  const used = before - Math.max(0, g.clock);
  g.ts[g.poss].top += used;
  if (g.drive) g.drive.time += used;
}
function betweenPlays(g) {
  const o = g.poss, diff = g.score[o] - g.score[1 - o];
  if (isHurry(g)) return randInt(14, 20);
  if (g.nohud) return randInt(22, 30);
  if (g.q >= 4 && diff > 0 && g.clock < 480) return randInt(37, 40) - (g.cx[o].clock < 0.4 ? 8 : 0);
  return randInt(33, 40);
}
function callTimeout(g, s, why) {
  if (g.to[s] <= 0) return false;
  g.to[s]--; g.running = false;
  pbpLog(g, `Timeout ${T(g.tids[s]).abbr}${why ? ' (' + why + ')' : ''} — ${g.to[s]} left`, false);
  return true;
}
// rulebook timeouts after a play that leaves the clock running
function timeoutCheck(g) {
  if (!g.running || g.over) return;
  const o = g.poss, d = 1 - o, diff = g.score[o] - g.score[d];
  const halfEnd = g.q === 2 || g.q === 4;
  // offense: trailing/tied late, or driving before the half
  if (halfEnd && g.clock <= 120 && g.clock > 3 && ((g.q === 4 && diff <= 0) || (g.q === 2 && (g.ydl >= 45 || g.clock <= 60)))) {
    if (g.to[o] > (g.q === 4 && g.ydl < 60 ? 0 : 0) && callTimeout(g, o)) return;
  }
  // defense: needs the ball back
  if (g.q === 4 && g.score[d] <= g.score[o] && g.score[o] - g.score[d] <= 16 && g.clock <= 170 && g.clock > 3) { callTimeout(g, d, 'stopping the clock'); return; }
  if (g.q === 2 && g.clock <= 70 && g.ydl < 40 && g.down <= 3 && g.cx[d].gm > 45 && rand() < 0.6) { callTimeout(g, d, 'trying to get the ball back'); return; }
  // poor game managers occasionally burn one (delay, confusion)
  if (g.clock > 300 && rand() < (100 - g.cx[o].gm) / 9000) callTimeout(g, o, 'avoiding a delay of game');
}

// ---------- the snap ----------
function snap(g) {
  const o = g.poss, d = 1 - o, diff = g.score[o] - g.score[d];
  // play clock runs between snaps when the game clock is live
  if (g.running) { runClock(g, betweenPlays(g)); if (g.clock <= 0) return; }
  g.running = false;
  const K = kickUnitPlayer(g, o, 'K');
  const fgDist = 117 - g.ydl, range = fgRange(g, K);
  // victory formation
  const k = 4 - g.down; // kneels available before 4th down
  if (g.q >= 4 && diff > 0 && k >= 1 && g.clock <= 2 * k + 40 * Math.max(0, k - g.to[d])) { kneel(g); return; }
  // last play of a half/game
  const endHalf = (g.q === 2 || g.q >= 4) && g.clock <= 7;
  if (endHalf && fgDist <= range + 2 && (g.q === 2 || (diff >= -3 && diff <= 0) || g.q >= 5)) { fieldGoal(g); return; }
  if (endHalf && fgDist > range + 2 && (g.q === 2 ? g.ydl >= 45 : diff < 0 && diff >= -8)) { hailPlay(g); return; }
  // spike to stop the clock in the 2-minute drill
  if (g.spikeNext) { g.spikeNext = false; spike(g); return; }
  if (g.down === 4 && fourthDown(g, range)) return;
  const oc = offenseCall(g);
  const dc = defenseCall(g, oc);
  runPlay(g, oc, dc);
}
function fgRange(g, K) {
  // longest kick a coach will try: where the make rate falls to ~45%
  for (let dist = 62; dist >= 30; dist--) if (fgProb(g, K, dist) >= 0.56) return dist;
  return 30;
}
function fgProb(g, K, dist) {
  const comfort = 32 + (ea(g, K, 'krng') - 50) * 0.45 + (ea(g, K, 'ktrj') - 70) * 0.05;
  let p = clamp(0.935 + (ea(g, K, 'kcon') - 70) * 0.004, 0.8, 0.975); // consistency: the kicks he is supposed to make
  if (dist > comfort) { const x = dist - comfort; p -= x * (0.022 - (ea(g, K, 'kfal') - 60) * 0.00035) + x * x * 0.0003; }
  return clamp(p, 0.02, 0.975);
}

// Who gets the tackle on the stat sheet. Linemen who hold the point rarely finish the play themselves: the back
// spills to a linebacker or a defensive back coming downhill. And most tackles draw a second man.
const TKL_W = { MLB: 2.3, WLB: 2.3, SAM: 2.3, SS: 2, FS: 2, CB: 1.45, NCB: 1.7, DIME: 1.7, EDGE: 0.8, DE: 0.7, DT: 0.6, NT: 0.5 };
const TKL_A = { MLB: 1, WLB: 1, SAM: 1, SS: 1.3, FS: 1.2, CB: 0.9, NCB: 1.0, DIME: 1.0, EDGE: 0.8, DE: 0.8, DT: 0.7, NT: 0.6 }; // who is second to the ball: the secondary rallies, the linebacker usually got there first
const TKL_SPILL = 0.36, TKL_ASSIST = 0.07, TKL_SCRUM = 0.6, TKL_SAFETY = 0.48;
function shareTackle(res, def) {
  if (!res.tackler || (res.kind !== 'run' && res.kind !== 'comp' && res.kind !== 'scramble')) return;
  res.noTkl = rand() < (res.kind === 'scramble' ? 0.45 : res.kind === 'comp' ? 0.11 : 0.06); // out of bounds, a slide, or he just goes down: nobody is credited
  const others = () => def.filter(e => e !== res.tackler && e !== res.assist && e.p && !e.blitz);
  const pickW = l => l.length ? weightedPick(l, l.map(e => TKL_W[e.slot] || 1)) : null;
  if (res.tackler.depth === 0 && res.kind === 'run' && res.yds >= 1 && rand() < TUNE.spill) {
    const t = pickW(others().filter(e => e.depth > 0));
    if (t) { if (!res.assist && rand() < 0.5) res.assist = res.tackler; res.tackler = t; }
  }
  // the free-flowing linebacker and the box safety are in on everything, but the pile gets sorted out more evenly than that
  else if (res.tackler.depth > 0 && ['MLB', 'WLB', 'SAM', 'SS'].includes(res.tackler.slot) && rand() < TKL_SCRUM) {
    const lbs = res.tackler.slot === 'SS' ? [] : others().filter(e => e.depth > 0 && TKL_W[e.slot] === TKL_W.MLB);
    const t = lbs.length && rand() < 0.35 ? pick(lbs) : rand() < 0.3 ? pickW(others().filter(e => e.depth === 0)) : pickW(others().filter(e => e.depth > 0 && !lbs.includes(e)));
    if (t) { if (!res.assist && rand() < 0.4) res.assist = res.tackler; res.tackler = t; }
  }
  else if (res.tackler.depth > 0 && (res.tackler.slot === 'FS' || res.tackler.slot === 'SS') && rand() < TKL_SAFETY) {
    const pool = others().filter(e => !['FS', 'SS'].includes(e.slot)), t = pool.length ? weightedPick(pool, pool.map(e => (TKL_W[e.slot] || 1) * (TKL_W[e.slot] === TKL_W.MLB ? 0.9 : e.depth === 0 ? 1.2 : 0.8))) : null;
    if (t) { if (!res.assist && rand() < 0.3) res.assist = res.tackler; res.tackler = t; }
  }
  else if (res.tackler.depth > 0 && ['CB', 'NCB', 'DIME'].includes(res.tackler.slot) && rand() < 0.07) {
    const t = pickW(others().filter(e => e.depth > 0 && TKL_W[e.slot] === TKL_W.MLB));
    if (t) res.tackler = t;
  }
  if (!res.assist && rand() < TUNE.assistRate) { const o = others(); res.assist = o.length ? weightedPick(o, o.map(e => TKL_A[e.slot] || 1)) : null; } // the second man in is whoever was nearest: spread more evenly than the first
  if (res.assist === res.tackler) res.assist = null;
  if (res.missed && res.missed.length && res.tackler) res.missed = res.missed.filter(m => m !== res.tackler && m !== res.assist); // the man who made the tackle did not also miss it
}

function runPlay(g, oc, dc) {
  const o = g.poss, d = 1 - o;
  g.pbNeed = [0, 0]; g.pbNeed[o] = offNeed(oc); g.pbNeed[d] = defNeed(dc);
  const off = offUnit(g, o, oc.pers, oc), def = defUnit(g, d, dc.front, dc.pkg, dc.subRush, dc.bign);
  g.pbNeed = null; // only real snaps are gated
  g.nohud = !!oc.nohud; if (oc.nohud) for (const e of def) e.extraLoad = 1.3; // no time to substitute or catch a breath
  { const need = [0, 0]; need[o] = offNeed(oc); need[d] = defNeed(dc); g.pbNeed = need; playbookBusts(g, [...off, ...def]); g.pbNeed = null; }
  if (oc.form === 'EMP') { const rb = off.find(e => e.slot === 'RB'); if (rb) rb.x = -1.8; }
  if (!g.first[o].off) { g.first[o].off = true; for (const e of off) ln(g, e.p).gs = 1; }
  if (!g.first[d].def) { g.first[d].def = true; for (const e of def) ln(g, e.p).gs = 1; }
  // predictability: did the defense's film read match the call?
  const keyed = oc.isRun ? (dc.runEst - 0.5) * 2 : (0.5 - dc.runEst) * 2;
  const dcp = knob(C(T(g.tids[o]).oc), 'dcp');
  // the play-calling chess match: a sharper caller hides his tendencies and reads the other side's
  g.key = clamp(keyed * (0.35 + g.cx[d].dpc / 99 * 0.45) * (1.25 - dcp / 200) * 0.6 + (g.cx[d].dpc - g.cx[o].pc) * 0.003, -0.55, 0.55);
  if (preSnapPenalty(g, off, def)) return; // the flag comes out before the snap: no play
  recordFilm(g, o, oc.b, oc.pers, oc.isRun);
  const downB = g.down, togoB = g.togo, ydlB = g.ydl, before = { down: g.down, togo: g.togo, ydl: g.ydl, poss: o, score: [g.score[0], g.score[1]], q: g.q, clock: g.clock };
  if (g.pbp) g.pendingDD = `${ordinal(g.down)} & ${g.ydl + g.togo >= 100 ? 'Goal' : g.togo} at ${spotTxt(g)}`;
  if (g.down === 3) g.ts[o].d3a++; else if (g.down === 4) g.ts[o].d4a++;
  g.ts[o].plays++;
  const res = oc.isRun ? resolveRun(g, off, def, oc, dc) : resolvePass(g, off, def, oc, dc);
  // no play gains more than the field that is left: everything downstream (box score, charting, grades) sees the same number
  if (typeof res.yds === 'number' && res.yds > 100 - g.ydl) { res.yds = 100 - g.ydl; if (res.ybc !== undefined && res.ybc > res.yds) res.ybc = res.yds; }
  if (globalThis.__calib) globalThis.__calib(g, oc, dc, res, off, def);
  // fatigue: a carry costs a back extra
  if (res.carrier && res.kind === 'run') res.carrier.extraLoad = TUNE.carryLoad;
  tickFatigue(g, [...off, ...def]);
  if (liveBallPenalty(g, res, oc, dc, off, def)) { g.ts[o].plays--; if (downB === 3) g.ts[o].d3a--; else if (downB === 4) g.ts[o].d4a--; return; } // the play comes back
  shareTackle(res, def);
  const scoreB = g.score[0] + g.score[1];
  applyResult(g, res, oc, dc, off, def, { downB, togoB, ydlB });
  if (g.poss === o && g.score[0] + g.score[1] === scoreB && !res.fumble) lateFoul(g, res, off, def);
  chartPlay(g, oc, dc, res, before, off, def);
  // injuries: whoever was in the collision, plus the trenches
  injuryCheck(g, (res.involved || []).filter(Boolean), res.kind === 'sack' ? 0.011 : 0.0042); // quarterbacks get hurt taking sacks
  // away from the ball: a hamstring on a route, a rolled ankle in coverage
  if (rand() < 0.0011) { const e = pick([...off, ...def].filter(e => e.slot !== 'QB' && e.depth !== 0 && !OL_SLOTS.includes(e.slot))); if (e && e.p.id >= 0 && !e.p.injury && rand() < durMult(e.p)) injure(g, e.p); }
  if (rand() < 0.008) { const pool = [...off.filter(e => OL_SLOTS.includes(e.slot)), ...def.filter(e => e.depth === 0)]; const e = pick(pool); if (e && e.p.id >= 0 && !e.p.injury && rand() < durMult(e.p)) injure(g, e.p); }
}

// ---------- penalties ----------
// Flags follow discipline: the players on the field, the position coach who runs their room, and the head coach's culture.
// Per-play chances for a team of average discipline.
const PEN = { offPre: 0.026, defPre: 0.015, holdRun: 0.018, holdPass: 0.025, defHold: 0.02, dpi: 0.066, rough: 0.011, lateDef: 0.0095, lateOff: 0.0022 };
function discFactor(g, side, entries) {
  const ps = entries.map(e => e.p).filter(p => p && p.h);
  if (!ps.length) return 1;
  ps.forEach(p => { if (p.h.disc === undefined) ensureCharacter(p); });
  const tid = g.tids[side], own = ps.reduce((s, p) => s + p.h.disc, 0) / ps.length;
  const room = ps.reduce((s, p) => s + (ROOM_COACH[p.pos] ? roomDisc(tid, p.pos) : 52), 0) / ps.length;
  return clamp(1 + (56 - (0.65 * own + 0.35 * room)) / 28, 0.45, 2.2) * clamp(1.2 - knob(C(T(tid).hc), 'cul') / 250, 0.8, 1.2);
}
// who the flag is on: the least disciplined are the likeliest
function flagOn(entries) { const es = entries.filter(e => e.p && e.p.h); return es.length ? weightedPick(es, es.map(e => Math.max(30, 125 - (e.p.h.disc === undefined ? 55 : e.p.h.disc)))) : null; }
// walk it off. onOffense: against the team with the ball. Returns the yards actually marked.
function assessPenalty(g, onOffense, yards, name, who, opts = {}) {
  const o = g.poss, side = onOffense ? o : 1 - o, dd = g.pbp ? `${ordinal(g.down)} & ${g.ydl + g.togo >= 100 ? 'Goal' : g.togo} at ${spotTxt(g)}` : '';
  let y = yards;
  if (onOffense) { if (g.ydl - y < 1) y = g.ydl > 1 ? Math.max(1, Math.floor(g.ydl / 2)) : 0; g.ydl -= y; g.togo += y; }
  else {
    const toGoal = 100 - g.ydl;
    if (y >= toGoal) y = toGoal <= 1 ? 0 : opts.spot ? toGoal - 1 : Math.max(1, Math.floor(toGoal / 2)); // half the distance: from the one, the ball stays at the one
    g.ydl = Math.min(99, g.ydl + y); g.togo -= y;
    if (opts.autoFirst || g.togo <= 0) { g.down = 1; g.togo = Math.min(10, 100 - g.ydl); g.ts[o].fd++; }
  }
  g.ts[side].pen = (g.ts[side].pen || 0) + 1; g.ts[side].penY = (g.ts[side].penY || 0) + y;
  if (who && who.p) inc(g, who.p, 'pen');
  g.running = false;
  if (g.pbp) g.pbp.push({ q: g.q, c: Math.max(0, Math.round(g.clock)), t: g.tids[o], dd, x: `PENALTY on ${T(g.tids[side]).abbr}${who && who.p ? ' ' + pshort(who.p) : ''}: ${name}, ${y} yard${y === 1 ? '' : 's'}${opts.autoFirst && !onOffense ? ', automatic first down' : ''}${opts.noPlay === false ? '' : ' — no play'}` });
  return y;
}
// before the snap: false starts, delay, illegal formation; offside, encroachment, twelve men
function preSnapPenalty(g, off, def) {
  const o = g.poss, d = 1 - o;
  const line = off.filter(e => e.slot !== 'QB'), front = def.filter(e => e.depth === 0);
  const lost = line.length ? line.reduce((s, e) => s + (100 - (PRAC_SIDE[e.p.pos] ? pbOf(e.p) : 100)), 0) / line.length / 100 : 0; // players still learning the calls jump
  const r = rand(), pOff = PEN.offPre * discFactor(g, o, line) * (o === 1 ? 1.15 : 1) * (1 + lost * 1.5), pDef = PEN.defPre * discFactor(g, d, front);
  if (r < pOff) { const k = rand(); const who = k < 0.72 ? flagOn(line.filter(e => OL_SLOTS.includes(e.slot) || e.slot === 'Y' || e.slot === 'H')) || flagOn(line) : null;
    assessPenalty(g, true, 5, k < 0.72 ? 'False start' : k < 0.86 ? 'Delay of game' : 'Illegal formation', who); return true; }
  if (r < pOff + pDef) { const k = rand(); const who = k < 0.9 ? flagOn(front) : null;
    assessPenalty(g, false, 5, k < 0.55 ? 'Offside' : k < 0.75 ? 'Neutral zone infraction' : k < 0.9 ? 'Encroachment' : 'Too many men on the field', who); return true; }
  return false;
}
// after the whistle: the play stands and fifteen yards are tacked on
function lateFoul(g, res, off, def) {
  if (res.kind !== 'run' && res.kind !== 'comp' && res.kind !== 'scramble') return;
  const o = g.poss, d = 1 - o, r = rand();
  const near = [res.tackler, res.assist].filter(Boolean), pD = PEN.lateDef * discFactor(g, d, near.length ? near : def);
  if (r < pD) { const k = rand(); assessPenalty(g, false, 15, k < 0.4 ? 'Unnecessary roughness' : k < 0.75 ? 'Face mask' : k < 0.9 ? 'Horse-collar tackle' : 'Unsportsmanlike conduct', near.length && k < 0.9 ? pick(near) : flagOn(def), { autoFirst: true, noPlay: false }); return; }
  if (r < pD + PEN.lateOff * discFactor(g, o, off)) { const k = rand(); assessPenalty(g, true, 15, k < 0.55 ? 'Unnecessary roughness' : k < 0.8 ? 'Unsportsmanlike conduct' : 'Taunting', flagOn(off.filter(e => e.slot !== 'QB')), { noPlay: false }); }
}
// during the play. Returns true when the play is wiped out and the penalty has been marked off.
function liveBallPenalty(g, res, oc, dc, off, def) {
  const o = g.poss, d = 1 - o, pass = !oc.isRun && res.kind !== 'run';
  const gain = res.kind === 'comp' || res.kind === 'run' || res.kind === 'scramble' ? res.yds || 0 : res.kind === 'sack' ? res.yds || -6 : 0;
  const converted = gain >= g.togo, turnover = res.kind === 'int' || !!res.fumble;
  const waste = () => { runClock(g, randInt(4, 7)); g.running = false; };
  // offensive holding: likelier when a blocker has been beaten
  const blockers = off.filter(e => OL_SLOTS.includes(e.slot) || e.slot === 'Y' || e.slot === 'H' || e.slot === 'FB');
  if (rand() < (pass ? PEN.holdPass * (res.pressure ? 1.7 : 1) : PEN.holdRun) * discFactor(g, o, blockers)) {
    // the defense takes the result instead when the play already went its way
    const decline = turnover || res.kind === 'sack' || (g.down >= 3 && !converted);
    if (!decline) { waste(); assessPenalty(g, true, 10, 'Offensive holding', flagOn(blockers)); return true; }
  }
  if (pass) {
    // pass interference: a beaten defender grabs
    if (res.kind === 'inc' && res.target && res.def && !res.throwaway && !res.batted && !res.drop && (res.air || 0) >= 5 &&
        rand() < PEN.dpi * discFactor(g, d, [res.def]) * (res.route && res.route.w < 0.3 ? 1.5 : 0.7) * clamp(1 + (70 - ea(g, res.def, res.air >= 20 ? 'spd' : 'man')) * 0.02, 0.6, 1.6)) {
      waste(); assessPenalty(g, false, Math.max(5, res.air), 'Defensive pass interference', res.def, { autoFirst: true, spot: true }); return true;
    }
    // holding and illegal contact downfield: the offense takes the play instead if it was better
    const cover = def.filter(e => e.depth > 0 && !e.blitz);
    if (rand() < PEN.defHold * discFactor(g, d, cover) && !(res.kind === 'comp' && !res.fumble && gain >= Math.max(g.togo, 5))) {
      waste(); assessPenalty(g, false, 5, rand() < 0.65 ? 'Defensive holding' : 'Illegal contact', flagOn(cover), { autoFirst: true }); return true;
    }
    // roughing the passer wipes out an incompletion, a sack or an interception
    const home = (res.rushers || []).map(a => a.e).filter(Boolean);
    if (home.length && (res.kind === 'inc' || res.kind === 'int' || res.kind === 'sack') && rand() < PEN.rough * discFactor(g, d, home)) {
      waste(); assessPenalty(g, false, 15, 'Roughing the passer', flagOn(home), { autoFirst: true }); return true;
    }
  }
  return false;
}

function playText(oc, dc, res) {
  const form = { UC: 'Under center', SG: 'Shotgun', PI: 'Pistol', EMP: 'Empty' }[oc.form];
  const tags = [...oc.tags].map(t => ({ MOTION: 'motion', PA: 'play-action', BOOT: 'boot', RUB: 'rub', RPO: 'RPO', SIDE: 'sideline', TRICK: 'trick' }[t])).join(', ');
  const cov = { C0: 'Cover 0', C1: 'Cover 1', C2: 'Cover 2', C2M: '2-Man', C3: 'Cover 3', C4: 'Quarters', T2: 'Tampa 2', C6: 'Cover 6' }[dc.cov] + (dc.disg ? ' (disguised)' : '');
  const pres = { FOUR: '4-man rush', THREE: '3-man rush', BLITZ: 'blitz', SIM: 'sim pressure', FZ: 'fire zone' }[dc.pres] + (dc.stunt ? ' + stunt' : '');
  const looks = [oc.trips && 'trips', oc.bunch && 'bunch', oc.tight && 'tight splits', oc.counter && 'counter', oc.duo && 'duo', oc.wide && 'wide zone', oc.optrt && 'option routes', oc.maxp && 'max protect', oc.nohud && 'no-huddle'].filter(Boolean).join(', ');
  const fr = dc.front === 'Bear' ? 'Bear ' : dc.front === 'Under' ? 'under ' : '';
  return { pre: `(${form}, ${oc.pers}${tags ? ', ' + tags : ''}${looks ? ', ' + looks : ''})`, post: `[${fr}${dc.bign ? 'big nickel' : dc.pkg.toLowerCase()}, ${cov}, ${pres}]` };
}

// Apply a play result: stats, field position, downs, scoring, clock
function applyResult(g, res, oc, dc, off, def, b) {
  const o = g.poss, d = 1 - o, ts = g.ts[o];
  const txt = g.pbp ? playText(oc, dc, res) : null;
  let yds = 0, stop = false, desc = res.desc || '';
  const credit = (r, k) => { if (r) inc(g, r.p, k); };
  // pressures (QB hurried by a rusher who got home)
  if (res.rushers) for (const a of res.rushers) { if (a.e.p) inc(g, a.e.p, 'prs'); }
  if (res.kind === 'run' || res.kind === 'scramble') {
    const c = res.carrier;
    yds = Math.min(res.yds, 100 - g.ydl);
    if (g.ydl + yds <= 0) yds = -g.ydl + (rand() < 0.15 ? 0 : 1);
    inc(g, c.p, 'rushA'); inc(g, c.p, 'rushY', yds); mx(g, c.p, 'rushLng', yds);
    ts.rushA++; ts.rushY += yds;
    if (res.kind === 'run' && c.slot !== 'QB') { g.runY[o][0] += yds; g.runY[o][1]++; g.runCred[o] = (g.runY[o][0] + 4.2 * 8) / (g.runY[o][1] + 8); }
    if (res.tackler && !res.noTkl && g.ydl + yds < 100) { credit(res.tackler, 'tkl'); if (yds < 0) credit(res.tackler, 'tfl'); }
    if (res.assist && !res.noTkl && g.ydl + yds < 100) credit(res.assist, 'tkl');
    stop = res.slide ? false : (res.kind === 'scramble' && rand() < 0.3) || (oc.dir === 'OUT' && rand() < 0.2);
    desc += ` for ${yds === 0 ? 'no gain' : yds + ' yd' + (Math.abs(yds) === 1 ? '' : 's')}`;
    if (res.fumble && g.ydl + yds < 100) return fumbleLost(g, res, c, yds, txt, desc, b);
  } else if (res.kind === 'comp') {
    yds = Math.min(res.yds, 100 - g.ydl);
    const qb = res.qb.p, r = res.target.p;
    inc(g, qb, 'passA'); inc(g, qb, 'passC'); inc(g, qb, 'passY', yds); mx(g, qb, 'passLng', yds);
    inc(g, r, 'tgt'); inc(g, r, 'rec'); inc(g, r, 'recY', yds); mx(g, r, 'recLng', yds); inc(g, r, 'yac', Math.max(0, yds - Math.max(0, res.air)));
    ts.passA++; ts.passC++; ts.passY += yds;
    if (res.tackler && !res.noTkl && g.ydl + yds < 100) { credit(res.tackler, 'tkl'); if (yds < 0) credit(res.tackler, 'tfl'); }
    if (res.assist && !res.noTkl && g.ydl + yds < 100) credit(res.assist, 'tkl');
    stop = !!res.oob && (g.q === 2 && g.clock <= 120 || g.q >= 4 && g.clock <= 300);
    desc += ` for ${yds} yd${Math.abs(yds) === 1 ? '' : 's'}`;
    if (res.fumble && g.ydl + yds < 100) return fumbleLost(g, res, res.target, yds, txt, desc, b);
  } else if (res.kind === 'inc') {
    stop = true;
    inc(g, res.qb.p, 'passA'); ts.passA++;
    if (res.target) inc(g, res.target.p, 'tgt');
    if (res.drop) inc(g, res.target.p, 'drp');
    if (res.pbu) inc(g, res.pbu.p, 'pd');
  } else if (res.kind === 'sack') {
    yds = Math.max(res.yds, -g.ydl);
    inc(g, res.qb.p, 'sacked'); inc(g, res.sacker.p, 'sck', res.sacker2 ? 0.5 : 1); inc(g, res.sacker.p, 'tkl'); inc(g, res.sacker.p, 'tfl');
    if (res.sacker2) { inc(g, res.sacker2.p, 'sck', 0.5); inc(g, res.sacker2.p, 'tkl'); }
    ts.sacks++; ts.sackY -= yds;
    if (res.fumble) {
      inc(g, res.sacker.p, 'ff');
      if (rand() < 0.55) {
        const rec = pick(def.filter(e => e.depth === 0));
        inc(g, rec.p, 'fr'); inc(g, res.qb.p, 'fum'); ts.to++;
        logPlay(g, txt, res.desc + ' — FUMBLE, recovered by ' + pshort(rec.p));
        endDrive(g, 'Fumble');
        if (rand() < 0.13) { g.drive = null; g.poss = d; inc(g, rec.p, 'dtd'); touchdown(g, d, `${pshort(rec.p)} fumble return`); }
        else startPossession(g, d, clamp(100 - (g.ydl + yds), 1, 99));
        runClock(g, randInt(5, 7));
        return;
      }
    }
    desc += ` for -${-yds}`;
  } else if (res.kind === 'int') {
    inc(g, res.qb.p, 'passA'); inc(g, res.qb.p, 'passInt'); ts.passA++; ts.to++;
    if (res.target) inc(g, res.target.p, 'tgt');
    inc(g, res.intBy.p, 'dint'); inc(g, res.intBy.p, 'pd');
    runClock(g, randInt(6, 10));
    logPlay(g, txt, desc + (res.ret > 0 ? `, returned ${Math.min(res.ret, res.intSpot)} yds` : ''));
    g.famRec = null; trackFamily(g, oc, b, -10);
    endDrive(g, 'Interception');
    let newYdl = res.intSpot >= 100 && res.ret < 5 ? 20 : 100 - Math.min(res.intSpot, 99) + res.ret;
    if (newYdl >= 100) { g.drive = null; g.poss = d; inc(g, res.intBy.p, 'dtd'); touchdown(g, d, `${pshort(res.intBy.p)} ${Math.min(res.intSpot, 99)} yd interception return`); }
    else startPossession(g, d, clamp(newYdl, 1, 99));
    return;
  }
  // clock for the play itself
  runClock(g, (res.kind === 'inc' ? randInt(4, 6) : res.kind === 'sack' ? randInt(5, 7) : randInt(5, 8)) + (rand() < 0.65 ? 1 : 0));
  g.running = !stop;
  logPlay(g, txt, desc);
  trackFamily(g, oc, b, yds);
  resolveYards(g, yds, res, oc);
  timeoutCheck(g);
}
function logPlay(g, txt, desc) { if (g.pbp) { const last = { q: g.q, c: Math.max(0, Math.round(g.clock)), t: g.tids[g.poss], dd: g.pendingDD || '', x: txt ? `${txt.pre} ${desc}. ${txt.post}` : desc }; g.pbp.push(last); } }
function trackFamily(g, oc, b, yds) {
  const ok = b.downB === 1 ? yds >= b.togoB * 0.4 : b.downB === 2 ? yds >= b.togoB * 0.6 : yds >= b.togoB;
  const fs = g.famStats[g.poss];
  for (const f of [oc.isRun ? 'RUN' : 'PASS', oc.type]) { const x = fs[f] || (fs[f] = [0, 0]); x[0]++; if (ok) x[1]++; }
}
function fumbleLost(g, res, carrier, yds, txt, desc, b) {
  const o = g.poss, d = 1 - o;
  if (res.tackler) inc(g, res.tackler.p, 'ff');
  if (rand() < 0.5) {
    const sp = clamp(g.ydl + yds, 1, 99);
    const rec = res.tackler || pick(g.side[d].roster.map(p => ({ p })));
    inc(g, rec.p, 'fr'); inc(g, carrier.p, 'fum'); g.ts[o].to++;
    runClock(g, randInt(5, 8));
    logPlay(g, txt, desc + ' — FUMBLE, recovered by ' + pshort(rec.p));
    if (g.drive) { g.drive.plays++; g.drive.yds += yds; }
    endDrive(g, 'Fumble');
    if (rand() < 0.1) { g.drive = null; g.poss = d; inc(g, rec.p, 'dtd'); touchdown(g, d, `${pshort(rec.p)} fumble return`); }
    else startPossession(g, d, 100 - sp);
    return;
  }
  runClock(g, randInt(5, 8));
  logPlay(g, txt, desc + ' — fumble, recovered by the offense');
  resolveYards(g, yds, res, {});
}
// apply yardage to down & distance
function resolveYards(g, yds, res, oc) {
  const o = g.poss, ts = g.ts[o], wasDown = g.down;
  g.ydl += yds;
  if (g.drive) { g.drive.plays++; g.drive.yds += yds; }
  if (g.ydl >= 100) {
    ts.fd++;
    if (wasDown === 3) ts.d3c++; else if (wasDown === 4) ts.d4c++;
    const who = res.kind === 'comp' ? `${pshort(res.target.p)} ${yds} yd pass from ${pshort(res.qb.p)}` : res.carrier ? `${pshort(res.carrier.p)} ${yds} yd ${res.kind === 'scramble' ? 'scramble' : 'run'}` : 'Touchdown';
    if (res.kind === 'comp') { inc(g, res.qb.p, 'passTD'); inc(g, res.target.p, 'recTD'); }
    else if (res.carrier) inc(g, res.carrier.p, 'rushTD');
    endDrive(g, 'Touchdown');
    touchdown(g, o, who);
    return;
  }
  if (g.ydl <= 0) {
    endDrive(g, 'Safety');
    addScore(g, 1 - o, 2, `Safety — ${T(g.tids[o]).abbr} downed in the end zone`);
    kickoff(g, o, true);
    return;
  }
  if (yds >= g.togo) {
    ts.fd++;
    if (wasDown === 3) ts.d3c++; else if (wasDown === 4) ts.d4c++;
    g.down = 1; g.togo = Math.min(10, 100 - g.ydl);
  } else {
    g.down++; g.togo -= yds;
    if (g.down > 4) { changePoss(g, 100 - g.ydl, 'Downs'); return; }
  }
  // spike next snap? (hurry, clock running, no timeouts left)
  const diff = g.score[o] - g.score[1 - o];
  if (g.running && isHurry(g) && g.to[o] === 0 && g.clock > 3 && g.clock <= 40 && g.down <= 3 && (g.q === 2 || diff <= 0)) g.spikeNext = true;
}

// ---------- special plays ----------
function kneel(g) {
  const o = g.poss, qb = starterQB(g, o);
  if (qb) { inc(g, qb, 'rushA'); inc(g, qb, 'rushY', -1); }
  g.ts[o].rushA++; g.ts[o].rushY--;
  runClock(g, 2);
  g.running = true;
  pbpLog(g, `${qb ? pshort(qb) : 'QB'} kneels`);
  if (g.ydl > 1) { g.ydl -= 1; g.togo++; if (g.drive) g.drive.yds--; } // he does not kneel himself into his own end zone
  if (g.drive) g.drive.plays++;
  g.down++;
  if (g.down > 4) changePoss(g, 100 - g.ydl, 'Downs');
  else if (g.q >= 4) { const d = 1 - o; if (g.to[d] > 0 && g.score[d] < g.score[o] && g.score[o] - g.score[d] <= 8) callTimeout(g, d); }
}
function spike(g) {
  const o = g.poss, qb = starterQB(g, o);
  if (qb) inc(g, qb, 'passA');
  g.ts[o].passA++;
  runClock(g, 1);
  g.running = false;
  pbpLog(g, `${qb ? pshort(qb) : 'QB'} spikes the ball`);
  if (g.drive) g.drive.plays++;
  g.down++;
  if (g.down > 4) changePoss(g, 100 - g.ydl, 'Downs');
}
function hailPlay(g) {
  const o = g.poss, d = 1 - o;
  const off = offUnit(g, o, '10', null), def = defUnit(g, d, g.cx[d].dt.front, 'DIME', false);
  if (g.pbp) g.pendingDD = `${ordinal(g.down)} & ${g.ydl + g.togo >= 100 ? 'Goal' : g.togo} at ${spotTxt(g)}`;
  g.ts[o].plays++; if (g.down === 3) g.ts[o].d3a++; else if (g.down === 4) g.ts[o].d4a++;
  applyResult(g, hailMary(g, off, def), { tags: new Set(), type: 'HAIL', isRun: false, pers: '10', form: 'SG' }, { pkg: 'DIME', cov: 'C3', pres: 'THREE' }, off, def, { downB: g.down, togoB: g.togo, ydlB: g.ydl });
}

// ---------- 4th down: rulebook, then gray-zone judgment ----------
function fourthDown(g, range) {
  const o = g.poss, d = 1 - o, diff = g.score[o] - g.score[d], cx = g.cx[o];
  const dist = 117 - g.ydl;
  const mins = g.q >= 4 ? g.clock / 60 : 99;
  if (g.q >= 4 && diff < 0) {
    if (mins < 2.5 && (diff < -3 || dist > range)) return false;
    if (mins < 5 && diff < -8 && g.togo <= 6 && g.ydl >= 35) return false;
    if (mins < 9 && diff <= -17) return false;
  }
  if (g.q >= 5 && diff < 0 && (diff < -3 || dist > range)) return false;
  const seenRange = Math.min(range + clamp(gauss(0, (100 - cx.gm) / 12), -6, 3), 64);
  let call;
  if (rand() < 0.04 + cx.gm / 170) call = recommend4th(g, dist, range);
  else if (g.togo <= 1 && g.ydl >= 40 && rand() < 0.15 + cx.aggr * 0.45) call = 'go';
  else if (g.togo <= 3 && g.ydl >= 55 && dist > seenRange && rand() < cx.aggr * 0.6) call = 'go';
  else call = dist <= seenRange ? 'fg' : 'punt';
  // nobody punts from the opponent's 35: out of his kicker's range there, he goes for it, or tries the long kick with a lot to gain
  if (call === 'punt' && g.ydl >= 65) call = g.togo > 5 && dist <= range + 4 ? 'fg' : 'go';
  if (call === 'go') return false;
  if (call === 'fg' && dist <= Math.max(range, seenRange) + (g.ydl >= 65 ? 4 : 0)) { fieldGoal(g); return true; }
  if (g.ydl >= 65) return false;
  punt(g);
  return true;
}
function ep(ydl) { return -0.6 + 0.066 * clamp(ydl, 1, 99); }
function recommend4th(g, dist, range) {
  const t = g.togo, y = g.ydl;
  const conv = 0.68 * Math.exp(-0.115 * (t - 1));
  const goVal = y + t >= 100 ? conv * 6.9 - (1 - conv) * ep(100 - y) : conv * ep(y + t) - (1 - conv) * ep(100 - y);
  const pFG = dist <= range + 2 ? fgProb(g, kickUnitPlayer(g, g.poss, 'K'), dist) : 0;
  const fgVal = pFG * (3 - ep(30)) - (1 - pFG) * ep(Math.max(20, 107 - y));
  const puntLand = y + 41, puntVal = -ep(puntLand >= 100 ? 20 : 100 - puntLand);
  // going for it has to be clearly better, and by more the deeper in his own end he is: a failure there hands over points
  const edge = y < 40 ? 0.6 : y < 55 ? 0.25 : 0;
  if (goVal >= fgVal + edge && goVal >= puntVal + edge) return 'go';
  return fgVal >= puntVal ? 'fg' : 'punt';
}

// ---------- kicking game ----------
function fieldGoal(g) {
  const o = g.poss, K = kickUnitPlayer(g, o, 'K'), dist = 117 - g.ydl;
  let p = fgProb(g, K, dist);
  const blockP = 0.011 * (1.5 - ea(g, K, 'ktrj') / 100);
  inc(g, K.p, 'fga');
  if (g.drive) g.drive.plays++;
  runClock(g, 5); g.running = false;
  if (rand() < blockP) { pbpLog(g, `${pshort(K.p)} ${dist} yd field goal BLOCKED`); changePoss(g, Math.max(1, 100 - g.ydl), 'Blocked FG'); return; }
  if (rand() < p) {
    inc(g, K.p, 'fgm'); mx(g, K.p, 'fgLng', dist);
    if (dist >= 50) inc(g, K.p, 'fg50');
    pbpLog(g, `${pshort(K.p)} ${dist} yd field goal is GOOD`);
    endDrive(g, 'Field Goal');
    addScore(g, o, 3, `${pshort(K.p)} ${dist} yd field goal`);
    kickoff(g, o);
  } else {
    pbpLog(g, `${pshort(K.p)} ${dist} yd field goal is no good`);
    changePoss(g, Math.max(20, 107 - g.ydl), 'Missed FG');
  }
}
function punt(g) {
  const o = g.poss, d = 1 - o, Pn = kickUnitPlayer(g, o, 'P');
  const pdis = ea(g, Pn, 'pdis'), phng = ea(g, Pn, 'phng'), pplc = ea(g, Pn, 'pplc'), pspn = ea(g, Pn, 'pspn');
  const ret = returner(g, d, true), PU = stUnits(g, o).PU, PRU = stUnits(g, d).PRU;
  // the men on the field: coverage against the return's blockers, gunners against the men holding them up, the rush against the protection
  const mCov = stAvg(PRU, stBlock) - stAvg(PU, stCover) - ST0.pu, mGun = stAvg(PU.slice(0, 2), stGun) - stAvg(PRU.slice(0, 2), stJam) - ST0.gun, mRush = stAvg(PRU.slice(2), stRush) - stAvg(PU.slice(2), stBlock) - ST0.rush;
  stSnap(g, [PU, PRU]);
  let gross = Math.round(gauss(46.8 + (pdis - 70) * 0.28, 5.5));
  const hang = 4.25 + (phng - 70) * 0.032 + gauss(0, 0.25);
  inc(g, Pn.p, 'pnt'); g.ts[o].punts++;
  if (g.drive) g.drive.plays++;
  runClock(g, 9); g.running = false;
  if (rand() < clamp(0.003 * Math.exp(mRush / ST_K.rush), 0.0005, 0.014)) { stShare(g, PRU.slice(2), 12); stShare(g, PU.slice(2), -12); pbpLog(g, `${pshort(Pn.p)} punt BLOCKED`); changePoss(g, clamp(100 - g.ydl + randInt(-5, 5), 1, 99), 'Blocked Punt'); return; }
  let land = g.ydl + gross, recv, text;
  // plus-territory punts: directional/coffin-corner aim inside the 10
  if (g.ydl >= 52 && rand() < lgt((pplc - 58) * 0.06)) {
    land = clamp(Math.round(gauss(92, 3)), 85, 99); gross = land - g.ydl;
  }
  if (land >= 100) {
    // backspin can save it at the goal line
    if (rand() < clamp((pspn - 55) * 0.012, 0, 0.45)) { land = randInt(95, 99); gross = land - g.ydl; recv = 100 - land; text = 'downed'; }
    else { gross = 100 - g.ydl; recv = 20; text = 'touchback'; inc(g, Pn.p, 'ptb'); }
  } else if (land >= 88) { recv = 100 - land; text = rand() < clamp(0.5 + mGun * 0.02, 0.2, 0.85) ? 'downed' : 'fair catch'; }
  else {
    const fair = clamp(0.42 + (hang - 4.25) * 0.5 + mGun * ST_K.gun + (pspn - 60) * 0.009, 0.15, 0.85); // a ball that turns over is hard to field cleanly
    if (rand() < 0.0075 * (1 + (pspn - 60) / 60) * (1 + (60 - ea(g, ret, 'hnd')) / 60)) {
      // muffed punt
      pbpLog(g, `${pshort(Pn.p)} punts ${gross} yds — MUFFED by ${pshort(ret.p)}`);
      if (rand() < 0.5) { inc(g, ret.p, 'fum'); g.ts[d].to++; { const cov = PU.filter(p => p.id >= 0); if (cov.length) inc(g, pick(cov), 'fr'); } endDrive(g, 'Punt'); g.poss = d; startPossession(g, o, clamp(land, 1, 99)); return; }
    }
    if (rand() < fair) { recv = 100 - land; text = 'fair catch'; }
    else {
      const rc = ea(g, ret, 'elu') * 0.35 + ea(g, ret, 'vis') * 0.25 + ea(g, ret, 'spd') * 0.25 + ea(g, ret, 'bur') * 0.15;
      const expR = 7.5 + (rc - 78) * 0.08 + g.cx[d].st * 0.025;
      let r = Math.round(expRand(Math.max(2, expR + mCov * ST_K.pu)) * clamp(1.2 - (hang - 4.25) * 0.75, 0.5, 1.8));
      if (rand() < 0.004 * Math.exp(clamp(mCov, -12, 12) / 6)) r = land; // to the house
      stShare(g, PU, clamp(expR - r, -15, 8)); stShare(g, PRU, clamp(r - expR, -8, 15)); if (r < land) stTackle(g, PU);
      inc(g, ret.p, 'prA'); inc(g, ret.p, 'prY', r);
      recv = 100 - land + r; text = `returned ${r} yds by ${pshort(ret.p)}`;
      if (recv >= 100) { pbpLog(g, `${pshort(Pn.p)} punts ${gross} yds — ${pshort(ret.p)} RETURNS IT FOR A TOUCHDOWN`); endDrive(g, 'Punt'); g.drive = null; g.poss = d; inc(g, ret.p, 'prTD'); touchdown(g, d, `${pshort(ret.p)} ${land} yd punt return`); return; }
    }
  }
  if (recv < 20 && text !== 'touchback') inc(g, Pn.p, 'pi20'); // the receiving club takes over inside its own 20
  inc(g, Pn.p, 'pntY', gross);
  pbpLog(g, `${pshort(Pn.p)} punts ${gross} yds, ${text}`);
  changePoss(g, clamp(recv, 1, 99), 'Punt');
}
function kickoff(g, kickSide, safetyKick) {
  if (g.over) return;
  const recv = 1 - kickSide, K = kickUnitPlayer(g, kickSide, 'K');
  const ret = returner(g, recv), KO = stUnits(g, kickSide).KO, KRU = stUnits(g, recv).KRU, mKo = stAvg(KRU, stBlock) - stAvg(KO, stCover) - ST0.ko;
  let start;
  const tbP = safetyKick ? 0 : clamp(0.18 + (ea(g, K, 'krng') - 70) * 0.008 + (ea(g, K, 'ktrj') - 70) * 0.003, 0.05, 0.6);
  if (rand() < tbP) { start = 35; pbpLog(g, `${pshort(K.p)} kicks off — touchback`, false); }
  else {
    const rc = ea(g, ret, 'elu') * 0.3 + ea(g, ret, 'vis') * 0.25 + ea(g, ret, 'spd') * 0.3 + ea(g, ret, 'bur') * 0.15;
    const expS = (safetyKick ? 38 : 27) + (rc - 62) * 0.12 + g.cx[recv].st * 0.025 - (ea(g, K, 'ktrj') - 70) * 0.04;
    stSnap(g, [KO, KRU]);
    start = Math.round(gauss(expS + mKo * ST_K.ko, 6.5));
    if (rand() < 0.012 * Math.exp(clamp(mKo, -12, 12) / 7)) start += randInt(20, 45);
    stShare(g, KO, clamp(expS - start, -15, 8)); stShare(g, KRU, clamp(start - expS, -8, 15)); if (start < 95) stTackle(g, KO);
    start = clamp(start, 5, 99);
    const r = start - (safetyKick ? 20 : 0);
    inc(g, ret.p, 'krA'); inc(g, ret.p, 'krY', Math.max(0, start));
    if (!safetyKick && rand() < 0.0035 * Math.exp(clamp(mKo, -12, 12) / 6)) {
      startPossession(g, recv, 100); if (g.over) return;
      endDrive(g, 'Kick Return TD');
      pbpLog(g, `${pshort(ret.p)} returns the kickoff for a TOUCHDOWN`, false);
      inc(g, ret.p, 'krTD'); touchdown(g, recv, `${pshort(ret.p)} kickoff return`);
      return;
    }
    pbpLog(g, `${pshort(K.p)} ${safetyKick ? 'free kick' : 'kicks off'}, ${pshort(ret.p)} returns to the ${start < 50 ? T(g.tids[recv]).abbr + ' ' + start : start === 50 ? '50' : T(g.tids[kickSide]).abbr + ' ' + (100 - start)}`, false);
  }
  startPossession(g, recv, clamp(start, 1, 99));
}

// ---------- scoring & possession ----------
function addScore(g, side, pts, text) {
  g.score[side] += pts;
  g.qs[side][Math.min(g.q, 5) - 1] += pts;
  if (text) g.scoring.push({ q: g.q, clock: Math.max(0, g.clock), tid: g.tids[side], text, score: [g.score[0], g.score[1]] });
  checkOT(g);
}
function checkOT(g) { if (g.q >= 5 && g.otStarted[0] && g.otStarted[1] && g.score[0] !== g.score[1]) g.over = true; }
function touchdown(g, side, text) {
  g.score[side] += 6; g.qs[side][Math.min(g.q, 5) - 1] += 6;
  const entry = { q: g.q, clock: Math.max(0, g.clock), tid: g.tids[side], text, score: null };
  g.scoring.push(entry);
  pbpLog(g, `TOUCHDOWN — ${text}`, false);
  g.running = false;
  checkOT(g);
  if (!g.over) {
    const diff = g.score[side] - g.score[1 - side], cx = g.cx[side];
    const chart = (g.q >= 4 || (g.q === 3 && g.clock < 300)) && [-2, -5, -9, -10, 1, 5].includes(diff);
    const go2 = chart ? rand() < 0.65 + cx.gm / 300 : rand() < 0.025 + cx.aggr * 0.03;
    if (go2) {
      // a real play from the 2
      const save = { poss: g.poss, ydl: g.ydl, down: g.down, togo: g.togo, drive: g.drive };
      g.poss = side; g.ydl = 98; g.down = 4; g.togo = 2; g.drive = null;
      const oc = offenseCall(g), dc = defenseCall(g, oc);
      const off = offUnit(g, side, oc.pers, oc), def = defUnit(g, 1 - side, dc.front, dc.pkg, dc.subRush, dc.bign);
      const res = oc.isRun ? resolveRun(g, off, def, oc, dc) : resolvePass(g, off, def, oc, dc);
      const good = (res.kind === 'run' || res.kind === 'scramble' || res.kind === 'comp') && res.yds >= 2;
      if (good) { g.score[side] += 2; g.qs[side][Math.min(g.q, 5) - 1] += 2; entry.text += ' (2-pt good)'; } else entry.text += ' (2-pt failed)';
      pbpLog(g, `Two-point try ${good ? 'is GOOD' : 'fails'}: ${res.desc || ''}`, false);
      Object.assign(g, save);
    } else {
      const K = kickUnitPlayer(g, side, 'K');
      inc(g, K.p, 'xpa');
      if (rand() < fgProb(g, K, 33) * 0.995) { inc(g, K.p, 'xpm'); g.score[side] += 1; g.qs[side][Math.min(g.q, 5) - 1] += 1; entry.text += ` (${pshort(K.p)} kick)`; }
      else { entry.text += ' (kick failed)'; pbpLog(g, 'Extra point is no good', false); }
    }
    checkOT(g);
  }
  entry.score = [g.score[0], g.score[1]];
  kickoff(g, side);
}
function startPossession(g, side, ydl) {
  if (g.over) return;
  if (g.q >= 5) { checkOT(g); if (g.over) return; g.otStarted[side] = 1; }
  g.poss = side; g.ydl = ydl; g.down = 1; g.togo = Math.min(10, 100 - ydl); g.running = false; g.spikeNext = false;
  // exhibitions: who is in changes drive by drive (starters come out, featured players stay in)
  if (g.pre && g.side[0] && g.side[1]) for (let s = 0; s < 2; s++) { const a = preseasonActives(g.tids[s], g), cur = g.side[s].active; if (!cur || a.size !== cur.size || [...a].some(id => !cur.has(id))) { g.side[s].active = a; initSide(g, s); } }
  g.drive = { side, q: g.q, clock: g.clock, start: ydl, plays: 0, yds: 0, time: 0 };
  // committee backs: some series go to the No. 2
  const rb1 = g.cx[side].ot.rb1;
  const ch = userChart(g, side, 'off');
  g.side[side].rb2Turn = ch ? rand() < rotOf(ch, 'RB') : rand() < clamp(0.18 + rbLean(g, side) * 0.5, 0.18, 0.58); // the playbook's lean: a workhorse system gives away fewer series
  g.side[side].rb3Turn = g.side[side].rb2Turn && rand() < 0.24;
  // series off for receivers and tight ends (never in the two-minute drill or late in a game)
  const T_ = g.side[side]; T_.rest = null;
  if (!((g.q === 2 && g.clock <= 150) || (g.q >= 4 && g.clock <= 360))) {
    const rest = new Set();
    for (const e of offUnit(g, side, '11', null)) if (REST_P[e.slot] && e.p.id >= 0 && rand() < REST_P[e.slot]) rest.add(e.p.id);
    T_.rest = rest;
    // the defense spells its linebackers by series too: the second one most, the man in the middle rarely (your own chart sets this for your club)
    const dS = 1 - side, D_ = g.side[dS];
    if (D_ && !userChart(g, dS, 'def')) { const dr = new Set(); for (const e of defUnit(g, dS, g.cx[dS].dt.front, 'NICKEL', false)) { const pr = e.slot === 'WLB' ? TUNE.lbRest : e.slot === 'MLB' ? TUNE.lbRest * 0.3 : 0; if (pr && e.p.id >= 0 && rand() < pr) dr.add(e.p.id); } D_.rest = dr; }
  }
}
function changePoss(g, newYdl, result) { endDrive(g, result); startPossession(g, 1 - g.poss, newYdl); }
function endDrive(g, result) {
  const dr = g.drive;
  if (!dr) return;
  const startTxt = dr.start >= 100 ? 'KR' : dr.start === 50 ? 'MID 50' : dr.start < 50 ? 'OWN ' + dr.start : 'OPP ' + (100 - dr.start);
  g.drives.push({ tid: g.tids[dr.side], q: dr.q, clock: dr.clock, start: startTxt, plays: dr.plays, yds: dr.yds, time: dr.time, result });
  g.drive = null;
}
function endPeriod(g) {
  g.running = false;
  if (g.q === 1 || g.q === 3) { g.q++; g.clock = 900; pbpLog(g, `End of quarter ${g.q - 1}`, false); return; }
  if (g.q === 2) {
    endDrive(g, 'End of Half');
    g.q = 3; g.clock = 900; g.to = [3, 3];
    for (const id in g.ps) g.ps[id].fat = 0; // halftime
    if (g.pre) for (let s = 0; s < 2; s++) { g.side[s].active = preseasonActives(g.tids[s], g); initSide(g, s); } // exhibition: the threes take over
    pbpLog(g, 'Halftime', false);
    kickoff(g, g.recvFirst);
    return;
  }
  if (g.score[0] !== g.score[1] || (g.q >= 5 && !g.playoff)) { g.over = true; return; }
  endDrive(g, g.q === 4 ? 'End of Regulation' : 'End of OT');
  g.q++; g.ot = true; g.clock = g.playoff ? 900 : 600;
  if (g.q === 5) g.otStarted = [0, 0];
  g.to = g.playoff ? [3, 3] : [2, 2];
  pbpLog(g, 'Overtime', false);
  kickoff(g, rand() < 0.5 ? 0 : 1);
}

// ---------- injuries ----------
function injuryCheck(g, players, rate = 0.0042) {
  for (const p of players) if (p && p.id >= 0 && !p.injury && rand() < rate * durMult(p)) injure(g, p);
}
function injure(g, p) {
  const [name, mn, mx_] = weightedPick(INJURIES, INJURIES.map(x => x[3]));
  const sc = p.tid >= 0 ? C(T(p.tid).sc) : null;
  const weeks = Math.max(1, Math.round(randInt(mn, mx_) * (1.15 - knob(sc, 'recov') / 333)));
  p.injury = { name, weeks, fresh: true };
  g.injuries.push({ pid: p.id, tid: p.tid, name, weeks });
  pbpLog(g, `Injury: ${pshort(p)} (${name.toLowerCase()})`, false);
  const s = g.tids[0] === p.tid ? 0 : 1;
  initSide(g, s);
}
