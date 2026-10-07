'use strict';
// =====================================================================
//  TRAINING CAMP
//  Camp opens with a week of practice before the first exhibition, then a week of practice after each of the
//  first two games. Coaches hand out the reps. Practices produce evidence, not ratings: one-on-one records
//  (and who they came against), plays that stood out in team periods, and what a man shows that the tape
//  measure does not. Each position coach keeps his own board, and how well he reads his room depends on how
//  good he is. Battles for jobs and for the last roster spots are tracked week to week, and the staff meets
//  after every practice week. You make every call; nobody is cut for you.
// =====================================================================
const CAMP_BLOCKS = 3; // practice weeks: camp opening, after game 1, after game 2
const CAMP_ROOMS = [['QB', ['QB']], ['RB', ['RB']], ['WR', ['WR']], ['TE', ['TE']], ['OL', ['OL']], ['DL', ['DL']], ['LB', ['LB']], ['DB', ['CB', 'S']]];
const CAMP_JOBS = [['QB', 'Quarterback'], ['RB', 'Running back'], ['X', 'X receiver'], ['Z', 'Z receiver'], ['SLOT', 'Slot receiver'], ['Y', 'Tight end'], ['LT', 'Left tackle'], ['LG', 'Left guard'], ['C', 'Center'], ['RG', 'Right guard'], ['RT', 'Right tackle'],
  ['EDGE1', 'Edge'], ['EDGE2', 'Edge'], ['IDL1', 'Interior line'], ['IDL2', 'Interior line'], ['MLB', 'Middle linebacker'], ['WLB', 'Weak-side linebacker'], ['CB1', 'Corner'], ['CB2', 'Corner'], ['NCB', 'Slot corner'], ['FS', 'Free safety'], ['SS', 'Strong safety'], ['K', 'Kicker'], ['P', 'Punter']];
const CAMP_TIER_NAME = ['the ones', 'the twos', 'the threes'];
function campOn() { return !!(state.camp && state.camp.season === state.season); }
function campOf(p) { return p.camp && p.camp.s === state.season ? p.camp : (p.camp = { s: state.season, r: [0, 0, 0], oo: [[0, 0], [0, 0], [0, 0]], sc: [], notes: [], form: round1(hashGauss(p.id, 811, state.season) * 2.2) }); }
// ---- the coach who runs his room, and how sharp his eye is ----
function campCoach(tid, pos) { return pos === 'K' || pos === 'P' ? C(T(tid).stc) : posCoach(tid, pos); }
function campCoachQ(c) { return !c ? 38 : c.dev !== undefined ? (c.dev + c.disc) / 2 : c.k && c.k.units !== undefined ? c.k.units : c.ovr || 50; }
function campEyeWord(c) { const q = campCoachQ(c); return q >= 78 ? 'His reads are usually right' : q >= 62 ? 'A reliable evaluator' : q >= 48 ? 'Hit and miss as an evaluator' : 'His reads have missed before'; }
// what a coach's temperament makes him lean toward (advisory only)
function campBias(c, p) {
  if (!c || !p.h) return 0;
  const h = p.h, ath = p.a ? ((p.a.spd || 60) + (p.a.bur || 60) + (p.a.agi || 60)) / 3 : 60;
  switch (c.style) {
    case 'Teacher': return p.exp <= 2 ? 2 : -0.5;
    case 'Old school': return p.exp >= 6 ? 2.5 : p.exp === 0 && !p.draft ? -1.5 : 0;
    case 'Demanding': return ((h.disc || 55) - 55) / 12 + ((h.work || 55) - 55) / 15;
    case "Players' coach": return ((h.lead || 45) - 45) / 15;
    case 'Innovator': return (ath - 70) / 6;
    case 'Motivator': return ((h.work || 55) - 55) / 10;
  }
  return 0;
}
function campBiasWhy(c, p) {
  switch (c && c.style) {
    case 'Teacher': return p.exp <= 2 ? 'he sees a young player he can coach up' : 'he trusts what he has seen';
    case 'Old school': return p.exp >= 6 ? 'he trusts a veteran who knows the job' : 'he has earned it the hard way';
    case 'Demanding': return 'he does everything the right way';
    case "Players' coach": return 'the room follows him';
    case 'Innovator': return 'he can do things the others cannot';
    case 'Motivator': return 'nobody works harder';
  }
  return 'he keeps showing up on tape';
}
// camp grade so far: practice weeks, most recent counting a little more
function campGrade(p) { const c = p.camp && p.camp.s === state.season ? p.camp : null; if (!c || !c.sc.length) return null; let s = 0, w = 0; c.sc.forEach((v, i) => { const k = 1 + i * 0.25; s += v * k; w += k; }); return Math.round(s / w); }
// the coach's number for a player (never shown as a number): a noisy first impression that evidence pulls toward the truth
function coachRead(p, tid) {
  const c = campCoach(tid === undefined ? p.tid : tid, p.pos), q = campCoachQ(c), sd = clamp(5 - (q - 40) / 14, 1.5, 5);
  const prior = p.ovr + campBias(c, p) + clamp(hashGauss(p.id, 700 + (c ? c.id % 89 : 0), state.season), -1.8, 1.8) * sd;
  const cg = campGrade(p), pg = typeof preGrade === 'function' ? preGrade(p) : null;
  const blocks = p.camp && p.camp.s === state.season ? p.camp.sc.length : 0, games = p.preS ? p.preS.gp || 0 : 0;
  const w = Math.min(0.62, blocks * 0.16 + games * 0.07);
  const num = v => typeof v === 'number' && isFinite(v), evid = p.ovr + (num(cg) ? (cg - 60) * 0.22 : 0) + (num(pg) ? (pg - 60) * 0.14 : 0);
  return prior * (1 - w) + evid * w + campBias(c, p) * w;
}
function jobRead(p, spot, tid) { return slotRating(p, spot) + (coachRead(p, tid) - p.ovr); }
// ---- what camp shows that the ratings do not ----
function stValue(p) { return !p.a || !['WLB', 'MLB', 'SS', 'FS', 'NCB', 'CB', 'RB', 'TEH', 'TEY', 'SLOT', 'WRX', 'WRZ', 'FB', 'EDGE'].includes(p.spot) ? 0 : (p.a.spd + (p.a.tkl || 40) + (p.a.bur || 50)) / 3; }
function campTraits(p) {
  const out = [], h = p.h || {}, pb = typeof pbOf === 'function' ? pbOf(p) : 96, st = stValue(p);
  if (pb < 50) out.push(['Still learning the playbook', 'warn']); else if (pb < 68 && p.exp <= 1) out.push(['Has the core calls', '']);
  if (st >= 72) out.push(['Core special teamer', 'good']); else if (st >= 65) out.push(['Helps on special teams', '']);
  const alt = p.cf ? Object.keys(p.cf).filter(s => s !== p.spot && p.cf[s] >= 75 && SPOTS[s]) : [];
  if (alt.length) out.push(['Also plays ' + alt.slice(0, 2).map(s => SPOTS[s].l).join(', '), '']);
  if ((h.stam || 60) <= 40) out.push(['Tires in team periods', 'bad']);
  if ((h.work || 55) >= 82) out.push(['First in, last out', 'good']); else if ((h.work || 55) <= 30) out.push(['Coasts through drills', 'bad']);
  return out;
}
// ---- drills ----
const CAMP_SK = {
  rec: p => p.a.rte * 0.35 + (p.a.rel || 50) * 0.15 + p.a.spd * 0.2 + p.a.hnd * 0.15 + (p.a.cth || 50) * 0.15,
  cov: p => (p.a.man || 40) * 0.4 + (p.a.zone || 40) * 0.12 + p.a.spd * 0.2 + (p.a.prs || 40) * 0.08 + (p.a.bsk || 40) * 0.1 + p.a.agi * 0.1,
  pro: p => (p.a.pbk || 40) * 0.6 + p.a.str * 0.2 + p.a.agi * 0.2,
  rush: p => (p.a.prsh || 40) * 0.5 + p.a.bur * 0.25 + p.a.str * 0.25,
  rblk: p => (p.a.rbk || 40) * 0.6 + p.a.str * 0.25 + p.a.bur * 0.15,
  fit: p => (p.a.shed || 40) * 0.4 + (p.a.tkl || 40) * 0.3 + p.a.str * 0.2 + (p.a.prec || 50) * 0.1,
  run: p => (p.a.elu || 40) * 0.35 + (p.a.bal || 40) * 0.25 + (p.a.vis || 40) * 0.2 + p.a.bur * 0.2,
  tkl: p => (p.a.tkl || 40) * 0.5 + (p.a.prec || 50) * 0.2 + p.a.spd * 0.15 + p.a.agi * 0.15,
};
// offense group, its skill, defense groups, their skill, and what the drill is called
const CAMP_DRILLS = [[['WR'], 'rec', ['CB'], 'cov', 'one-on-ones'], [['TE'], 'rec', ['S', 'LB'], 'cov', 'one-on-ones'], [['RB'], 'rec', ['LB'], 'cov', 'one-on-ones'],
  [['OL'], 'pro', ['DL'], 'rush', 'pass-rush one-on-ones'], [['OL'], 'rblk', ['DL'], 'fit', 'run-fit drills'], [['RB'], 'run', ['LB', 'S'], 'tkl', 'open-field drills']];
function campEdge(p) { // what he is on a given day: his playbook, his wind, his week
  const pb = typeof pbOf === 'function' ? pbOf(p) : 96, h = p.h || {};
  return (pb < 80 ? -(80 - pb) * 0.07 : 0) + ((h.stam || 60) - 60) * 0.03 + campOf(p).form + gauss(0, 2.6);
}
function campPractice(tid) {
  const cm = state.camp, ro = rosterOf(tid).filter(p => p.a && !p.injury), blk = cm.blocks;
  // coaches set the reps: each room in the order its coach sees it; men in a battle get a look with the group above them
  const tier = {}, inBattle = new Set((cm.battles || []).filter(b => !b.closed).flatMap(b => b.cands));
  for (const pos of POSITIONS) { const n = REPS_FIRST[pos] || 1; ro.filter(p => p.pos === pos).sort((a, b) => coachRead(b, tid) - coachRead(a, tid)).forEach((p, i) => { tier[p.id] = i < n ? 0 : i < n * 2 ? 1 : 2; }); }
  const MIX = [[0.7, 0.25, 0.05], [0.25, 0.55, 0.2], [0.05, 0.3, 0.65]], week = {};
  const W = id => week[id] || (week[id] = { oo: [[0, 0], [0, 0], [0, 0]], plus: 0, minus: 0, best: null, worst: null, line: null });
  const edge = {}; for (const p of ro) edge[p.id] = campEdge(p);
  const pickTier = (p) => { let m = MIX[tier[p.id]]; if (inBattle.has(p.id) && tier[p.id] > 0) m = MIX[tier[p.id] - 1].map((v, i) => (v + m[i]) / 2); const r = rand(); return r < m[0] ? 0 : r < m[0] + m[1] ? 1 : 2; };
  for (const [og, osk, dg, dsk] of CAMP_DRILLS) {
    const O = ro.filter(p => og.includes(p.pos)), D = ro.filter(p => dg.includes(p.pos)); if (!O.length || !D.length) continue;
    for (const a of O) { const reps = (tier[a.id] === 1 ? 7 : 5) + (inBattle.has(a.id) ? 2 : 0);
      for (let i = 0; i < reps; i++) { const tt = pickTier(a), pool = D.filter(d => tier[d.id] === tt), b = pick(pool.length ? pool : D);
        const win = rand() < lgt((CAMP_SK[osk](a) + edge[a.id] - CAMP_SK[dsk](b) - edge[b.id]) / 7.5 + (osk === 'pro' ? 0.25 : osk === 'rec' ? -0.1 : 0)); // blockers win a few more pass-rush reps than they lose
        W(a.id).oo[tier[b.id]][win ? 0 : 1]++; W(b.id).oo[tier[a.id]][win ? 1 : 0]++; campOf(a).r[tier[b.id]]++; campOf(b).r[tier[a.id]]++; } }
  }
  // team periods: plays that stood out, for better and worse
  const roomAvg = pos => { const l = ro.filter(p => p.pos === pos); return l.length ? avg(l.map(p => p.ovr)) : 60; };
  for (const p of ro) {
    const w = W(p.id), h = p.h || {}, pb = typeof pbOf === 'function' ? pbOf(p) : 96, rel = (p.ovr + edge[p.id] - roomAvg(p.pos)) / 9 + (tier[p.id] === 0 ? -0.25 : tier[p.id] === 2 ? 0.2 : 0); // the threes face the threes
    const up = clamp(0.55 * Math.exp(rel * 0.5), 0.1, 2.2), dn = clamp(0.5 * Math.exp(-rel * 0.5) + (pb < 60 ? 0.25 : 0) + ((h.disc || 55) < 40 ? 0.15 : 0), 0.08, 2.2);
    for (let i = 0; i < 3; i++) { if (rand() < up / 3) w.plus++; if (rand() < dn / 3) w.minus++; }
    if (p.pos === 'QB') { const att = tier[p.id] === 0 ? 22 : tier[p.id] === 1 ? 16 : 10, pc = clamp(0.67 + (p.a.sacc - 70) * 0.004 + (p.a.dec - 70) * 0.002 + edge[p.id] * 0.006, 0.48, 0.84); let c = 0, ints = 0; for (let i = 0; i < att; i++) { if (rand() < pc) c++; else if (rand() < clamp(0.07 + (70 - p.a.dec) * 0.003, 0.02, 0.2)) ints++; } w.line = `${c} of ${att} in seven-on-seven${ints ? `, ${ints} intercepted` : ''}, mostly with ${CAMP_TIER_NAME[tier[p.id]]}`; w.qb = [c, att, ints]; }
    if (p.pos === 'K') { const att = 8; let m = 0; for (let i = 0; i < att; i++) if (rand() < clamp(0.74 + (p.a.kcon - 70) * 0.008 + (p.a.krng - 70) * 0.004, 0.4, 0.97)) m++; w.line = `${m} of ${att} on field goals in team periods`; w.k = [m, att]; }
    if (p.pos === 'P') { const hang = (4.2 + (p.a.phng - 70) * 0.012 + gauss(0, 0.08)).toFixed(1); w.line = `averaged ${hang} seconds of hang time`; w.pn = +hang; }
  }
  // grade the week and write it down
  const WT = [1.3, 1, 0.7], LT = [0.7, 1, 1.3], adj = p => { const w = W(p.id); let aw = 0, al = 0; for (let t = 0; t < 3; t++) { aw += w.oo[t][0] * WT[t]; al += w.oo[t][1] * LT[t]; } return [aw, al]; };
  const roomRate = {}; for (const pos of POSITIONS) { let aw = 0, al = 0; for (const p of ro.filter(x => x.pos === pos)) { const r = adj(p); aw += r[0]; al += r[1]; } roomRate[pos] = aw + al ? aw / (aw + al) : 0.5; }
  for (const p of ro) {
    const w = W(p.id), c = campOf(p); let aw = 0, al = 0, n = 0;
    for (let t = 0; t < 3; t++) { aw += w.oo[t][0] * WT[t]; al += w.oo[t][1] * LT[t]; n += w.oo[t][0] + w.oo[t][1]; c.oo[t][0] += w.oo[t][0]; c.oo[t][1] += w.oo[t][1]; }
    let sc = 60 + (n ? ((aw + roomRate[p.pos] * 2) / (aw + al + 2) - roomRate[p.pos]) * 75 : 0) + (w.plus - w.minus) * 4.5;
    if (w.qb) sc = 60 + (w.qb[0] / w.qb[1] - 0.66) * 110 - w.qb[2] * 5 + (w.plus - w.minus) * 3;
    if (w.k) sc = 60 + (w.k[0] / w.k[1] - 0.75) * 90;
    if (w.pn) sc = 60 + (w.pn - 4.3) * 45;
    c.sc[blk] = Math.round(clamp(sc, 22, 96));
    c.t = tier[p.id];
    const note = campNote(p, w, tier[p.id]); if (note) c.notes.push([blk, note[0], note[1]]);
    if (c.notes.length > 6) c.notes.shift();
  }
}
// one sentence about his week, from what actually happened
function campNote(p, w, tier) {
  const tot = w.oo.reduce((s, x) => s + x[0] + x[1], 0), wins = w.oo.reduce((s, x) => s + x[0], 0), v1 = w.oo[0], with1 = v1[0] + v1[1];
  if (w.line) return [w.plus > w.minus ? 1 : w.minus > w.plus ? -1 : 0, w.line.charAt(0).toUpperCase() + w.line.slice(1) + '.'];
  const PLUS = { WR: ['beat his man deep in a team period', 'made a contested catch in the red zone period'], TE: ['won up the seam in team periods', 'sealed the edge on a long run'], RB: ['broke a long run in the team period', 'picked up a blitz the staff showed on film'], OL: ['stoned a bull rush in the two-minute period', 'moved his man on a goal-line rep'],
    DL: ['got home in the two-minute period', 'blew up a run in the backfield'], LB: ['read a screen and blew it up', 'made a stop on third and short'], CB: ['broke up a pass in the red zone period', 'intercepted a pass in team periods'], S: ['came down to stop a run for no gain', 'took away a deep shot'] };
  const MINUS = { WR: ['dropped one in the team period', 'ran the wrong route on third down'], TE: ['missed a block that got a back hit', 'dropped a pass over the middle'], RB: ['put the ball on the ground', 'missed a blitz pickup'], OL: ['was beaten clean for a sack in team periods', 'jumped offside twice'],
    DL: ['was washed out on a long run', 'jumped offside in the two-minute period'], LB: ['bit on play-action and gave up a big one', 'was a step late to his gap'], CB: ['was beaten deep in the team period', 'grabbed a receiver and drew a flag'], S: ['took a bad angle on a long run', 'was late over the top on a deep ball'] };
  const oo = tot ? `went ${wins}–${tot - wins} in the drills${with1 >= 3 ? ` (${v1[0]}–${v1[1]} against ${CAMP_TIER_NAME[0]})` : tier === 2 ? ', mostly against the threes' : ''}` : null;
  const good = w.plus > w.minus || (tot >= 5 && wins / tot >= 0.62), bad = w.minus > w.plus || (tot >= 5 && wins / tot <= 0.36);
  const ev = good && w.plus && PLUS[p.pos] ? pick(PLUS[p.pos]) : bad && w.minus && MINUS[p.pos] ? pick(MINUS[p.pos]) : null;
  if (!oo && !ev) return null;
  const cap = x => x.charAt(0).toUpperCase() + x.slice(1) + '.';
  return [good && !bad ? 1 : bad && !good ? -1 : 0, [oo, ev].filter(Boolean).map(cap).join(' ')];
}
// ---- battles: recomputed from the coaches' boards every week, with history carried by name ----
function campBattles(tid) {
  const cm = state.camp, old = {}; for (const b of cm.battles || []) old[b.id] = b;
  const ro = rosterOf(tid).filter(p => p.a && countsOn53(p)), lists = defaultChart(tid), out = [];
  const starters = new Set(CAMP_JOBS.map(([k]) => (lists[k] || [])[0]).filter(x => x !== undefined)), taken = new Set();
  for (const [key, label] of CAMP_JOBS) {
    const a = P((lists[key] || [])[0]); if (!a) continue;
    const spot = chartSpotFor(tid, key), top = jobRead(a, spot, tid);
    const ch = ro.filter(p => p.pos === a.pos && p.id !== a.id && !starters.has(p.id) && !taken.has(p.id) && jobRead(p, spot, tid) >= top - 4.5).sort((x, y) => jobRead(y, spot, tid) - jobRead(x, spot, tid)).slice(0, 2);
    if (!ch.length) continue;
    ch.forEach(p => taken.add(p.id));
    out.push({ id: 'J' + key, kind: 'start', key, spot, pos: a.pos, label, n: 1, cands: [a.id, ...ch.map(p => p.id)], gap: top - jobRead(ch[0], spot, tid) });
  }
  out.sort((x, y) => x.gap - y.gap); out.length = Math.min(out.length, 6);
  const fighting = new Set(out.flatMap(b => b.cands)); // a man competing to start is not on the roster bubble
  for (const pos of POSITIONS) {
    const l = ro.filter(p => p.pos === pos).sort((x, y) => coachRead(y, tid) - coachRead(x, tid)), line = ROSTER_TEMPLATE[pos];
    if (l.length <= line) continue;
    const mark = (coachRead(l[line - 1], tid) + coachRead(l[line], tid)) / 2;
    const c = l.filter((p, i) => i >= line - 2 && i <= line + 2 && Math.abs(coachRead(p, tid) - mark) <= 4.5 && !fighting.has(p.id));
    const inN = c.filter(p => l.indexOf(p) < line).length;
    if (c.length < 2 || !inN || inN === c.length) continue;
    out.push({ id: 'S' + pos, kind: 'spot', key: pos, pos, label: `Last ${inN === 1 ? 'spot' : inN + ' spots'} at ${POS_NAME_CAMP[pos]}`, n: inN, cands: c.map(p => p.id) });
  }
  for (const b of out) {
    const o = old[b.id]; b.hist = (o && o.hist) || {}; b.closed = o && o.closed && b.cands.includes(o.closed) ? o.closed : null; b.since = o ? o.since : cm.blocks;
    for (const id of b.cands) { const p = P(id), v = b.kind === 'start' ? jobRead(p, b.spot, tid) : coachRead(p, tid); (b.hist[id] = b.hist[id] || [])[cm.blocks] = round1(v); }
  }
  // a battle that is no longer close has been settled on the field
  for (const id in old) if (!out.some(b => b.id === id)) { const o = old[id], alive = o.cands.map(i => P(i)).filter(p => p && p.tid === tid); if (alive.length) { const w = alive.sort((x, y) => (o.kind === 'start' ? jobRead(y, o.spot, tid) - jobRead(x, o.spot, tid) : coachRead(y, tid) - coachRead(x, tid)))[0]; (cm.settled = cm.settled || []).push({ label: o.label, pid: w.id, blk: cm.blocks }); if (cm.settled.length > 12) cm.settled.shift(); } }
  cm.battles = out;
}
const POS_NAME_CAMP = { QB: 'quarterback', RB: 'running back', WR: 'receiver', TE: 'tight end', OL: 'offensive line', DL: 'defensive line', LB: 'linebacker', CB: 'corner', S: 'safety', K: 'kicker', P: 'punter' };
// where each man stands in a battle right now, and which way he is moving
function battleBoard(b) {
  const blk = state.camp.blocks, rows = b.cands.map(id => { const p = P(id), h = b.hist[id] || [], cur = [...h].reverse().find(v => v !== undefined && v !== null), vals = h.filter(v => v !== undefined && v !== null), prev = vals.length >= 2 ? vals[vals.length - 2] : null; return { p, cur: cur === undefined ? 0 : cur, d: prev === null ? 0 : cur - prev }; }).filter(r => r.p && r.p.tid === state.camp.tid);
  rows.sort((x, y) => y.cur - x.cur);
  rows.forEach((r, i) => { const inSpot = i < b.n, edgeV = inSpot ? r.cur - (rows[b.n] ? rows[b.n].cur : r.cur - 9) : (rows[b.n - 1] ? rows[b.n - 1].cur : r.cur) - r.cur;
    r.in = inSpot;
    r.st = b.closed ? (r.p.id === b.closed ? ['Named the winner', 'good'] : ['Lost the job', 'muted']) : inSpot ? (edgeV >= 3 ? [b.kind === 'start' ? 'Leads' : 'Inside the line', 'good'] : r.d <= -1.2 ? ['Slipping', 'warn'] : [b.kind === 'start' ? 'Narrow lead' : 'Holding on', '']) : (edgeV <= 1.5 && r.d >= 0.8 ? ['Closing', 'good'] : edgeV <= 1.5 ? ['Right behind', ''] : r.d >= 1.2 ? ['Gaining', ''] : r.d <= -1.2 ? ['Fading', 'bad'] : ['Trails', 'muted']); });
  return rows;
}
// ---- the bubble: the staff's 53 as it stands, by the coaches' boards ----
function campBubble(tid) {
  const out = {}, ro = rosterOf(tid).filter(p => p.a);
  for (const pos of POSITIONS) {
    const l = ro.filter(p => p.pos === pos && countsOn53(p)).sort((x, y) => coachRead(y, tid) - coachRead(x, tid)), line = ROSTER_TEMPLATE[pos];
    const mark = l.length > line ? (coachRead(l[line - 1], tid) + coachRead(l[line], tid)) / 2 : -99;
    l.forEach((p, i) => { const d = coachRead(p, tid) - mark; out[p.id] = { i, cat: l.length <= line ? (i < line - 1 ? 'lock' : 'likely') : i < line ? (d >= 5 ? 'lock' : d >= 2 ? 'likely' : 'bubble') : d >= -3 ? 'bubble' : psRoomOK(tid, p) ? 'ps' : 'long' }; });
    for (const p of ro.filter(p => p.pos === pos && !countsOn53(p))) out[p.id] = { i: 99, cat: 'ir' };
  }
  return out;
}
function psRoomOK(tid, p) { return p.exp <= 2 || (p.exp <= 6 && p.age <= 27); }
// ---- the meeting: each coach presents his room ----
function campMeeting(tid) {
  const bub = campBubble(tid), ro = rosterOf(tid).filter(p => p.a), blk = state.camp.blocks - 1, out = [];
  for (const [role, poss] of [...CAMP_ROOMS, ['ST', ['K', 'P']]]) {
    const c = role === 'ST' ? C(T(tid).stc) : asst(T(tid), role), l = ro.filter(p => poss.includes(p.pos)); if (!l.length) continue;
    const view = l.map(p => ({ p, r: coachRead(p, tid), u: uOvr(p), cat: bub[p.id] ? bub[p.id].cat : 'long', wk: p.camp && p.camp.s === state.season ? p.camp.sc[blk] : null }));
    const push = view.filter(x => ['bubble', 'ps', 'long'].includes(x.cat)).map(x => ({ x, d: x.r - x.u })).filter(o => o.d >= 2.5).sort((a, b) => b.d - a.d)[0];
    const cool = view.filter(x => ['lock', 'likely'].includes(x.cat)).map(x => ({ x, d: x.r - x.u })).filter(o => o.d <= -3).sort((a, b) => a.d - b.d)[0];
    const wk = view.filter(x => x.wk !== null && x.wk !== undefined), star = wk.slice().sort((a, b) => b.wk - a.wk)[0], worry = wk.filter(x => x.cat !== 'long').sort((a, b) => a.wk - b.wk)[0];
    out.push({ role, c, n: l.length, eye: campEyeWord(c), push: push ? { p: push.x.p, why: campBiasWhy(c, push.x.p) } : null, cool: cool ? cool.x.p : null, star: star && star.wk >= 70 ? star.p : null, worry: worry && worry.wk <= 48 && (!star || worry.p !== star.p) ? worry.p : null,
      order: view.sort((a, b) => b.r - a.r).map(x => ({ p: x.p, cat: x.cat })) });
  }
  return out;
}
// when the cuts are on the table: where each coach would not make the call you are making
function campObjections(tid, plan) {
  const bub = campBubble(tid), out = [];
  for (const id in plan) { if (plan[id] !== 'cut' && plan[id] !== 'ps') continue; const p = P(+id); if (!p || p.tid !== tid || !bub[p.id]) continue;
    if (!['lock', 'likely'].includes(bub[p.id].cat)) continue;
    const c = campCoach(tid, p.pos), keepOver = rosterOf(tid).filter(x => x.pos === p.pos && x.id !== p.id && plan[x.id] !== 'cut' && plan[x.id] !== 'ps' && bub[x.id] && coachRead(x, tid) < coachRead(p, tid)).sort((a, b) => coachRead(a, tid) - coachRead(b, tid))[0];
    out.push({ p, c, over: keepOver || null, note: campLastNote(p) }); }
  return out;
}
function campLastNote(p) { const c = p.camp && p.camp.s === state.season ? p.camp : null; return c && c.notes.length ? c.notes[c.notes.length - 1] : null; }
function campRecord(p) { const c = p.camp && p.camp.s === state.season ? p.camp : null; if (!c) return null; const w = c.oo.reduce((s, x) => s + x[0], 0), l = c.oo.reduce((s, x) => s + x[1], 0); return w + l ? { w, l, v1: c.oo[0] } : null; }
// ---- running camp ----
function openCamp() {
  const u = state.userTid;
  for (const id in state.players) delete state.players[id].camp;
  state.camp = { season: state.season, tid: u, blocks: 0, battles: [], settled: [] };
  campBattles(u);      // the staff names the open jobs before anyone puts on pads
  campWeek('Camp opened');
}
function campWeek(label) {
  const cm = state.camp; if (!cm || cm.blocks >= CAMP_BLOCKS) return;
  campPractice(cm.tid); cm.blocks++; campBattles(cm.tid);
  cm.label = label;
  if (!isAI(cm.tid)) addNews(`${label}: the staff has updated its boards. ${cm.battles.filter(b => !b.closed).length} battles are open.`, [cm.tid]);
}
// ---- the squad planner: your own unofficial depth chart ----
// Groups are yours: name them, fill them with anyone, order them however you like. Nothing here touches the real depth chart or the roster.
const PLAN_ROOMS = [['QB', 'Quarterbacks', ['QB']], ['RB', 'Running backs', ['RB']], ['WR', 'Receivers', ['WR']], ['TE', 'Tight ends', ['TE']], ['OL', 'Offensive line', ['OL']], ['DL', 'Defensive line', ['DL']], ['LB', 'Linebackers', ['LB']], ['CB', 'Corners', ['CB']], ['S', 'Safeties', ['S']], ['ST', 'Specialists', ['K', 'P']]];
const PLAN_SEED = { QB: [['Starter', ['QB']]], RB: [['Lead back', ['RB']]], WR: [['X receiver', ['X']], ['Z receiver', ['Z']], ['Slot', ['SLOT']]], TE: [['Tight end (Y)', ['Y']], ['Move tight end (H)', ['H']]],
  OL: [['Left tackle', ['LT']], ['Left guard', ['LG']], ['Center', ['C']], ['Right guard', ['RG']], ['Right tackle', ['RT']]], DL: [['Edge', ['EDGE1', 'EDGE2']], ['Interior', ['IDL1', 'IDL2', 'NT']]], LB: [['Middle linebacker', ['MLB']], ['Weak side', ['WLB']]],
  CB: [['Outside corner', ['CB1', 'CB2']], ['Slot corner', ['NCB']]], S: [['Free safety', ['FS']], ['Strong safety', ['SS']]], ST: [['Kicker', ['K']], ['Punter', ['P']]] };
function planRoomOf(p) { const r = PLAN_ROOMS.find(x => x[2].includes(p.pos)); return r ? r[0] : null; }
function planSeedRoom(tid, room) {
  const cm = state.camp, lists = defaultChart(tid), poss = PLAN_ROOMS.find(x => x[0] === room)[2], used = new Set(), out = [];
  for (const [name, keys] of PLAN_SEED[room] || []) {
    const ids = []; for (let i = 0; i < 2; i++) for (const k of keys) { const id = (lists[k] || [])[i], p = id !== undefined ? P(id) : null; if (p && poss.includes(p.pos) && !ids.includes(id) && (i > 0 || !used.has(id))) { ids.push(id); if (i === 0) used.add(id); } }
    out.push({ id: cm.plan.nid++, name, pids: ids.slice(0, keys.length > 1 ? 4 : 2) });
  }
  cm.plan.groups[room] = out;
}
function ensurePlan() { const cm = state.camp; if (!cm) return null; if (!cm.plan) { cm.plan = { groups: {}, nid: 1 }; for (const [room] of PLAN_ROOMS) planSeedRoom(cm.tid, room); } return cm.plan; }
function planGroup(gid) { const pl = ensurePlan(); for (const r in pl.groups) { const g = pl.groups[r].find(x => x.id === gid); if (g) return g; } return null; }
function planNew(room, name, pids) { const pl = ensurePlan(); name = String(name || '').trim().slice(0, 40); if (!name) return; (pl.groups[room] = pl.groups[room] || []).push({ id: pl.nid++, name, pids: (pids || []).slice() }); }
function planAdd(gid, pid) { const g = planGroup(gid); if (g && !g.pids.includes(pid)) g.pids.push(pid); }
function planRemove(gid, pid) { const g = planGroup(gid); if (g) g.pids = g.pids.filter(x => x !== pid); }
function planMove(gid, pid, dir) { const g = planGroup(gid); if (!g) return; const i = g.pids.indexOf(pid), j = i + dir; if (i < 0 || j < 0 || j >= g.pids.length) return; [g.pids[i], g.pids[j]] = [g.pids[j], g.pids[i]]; }
function planDelete(gid) { const pl = ensurePlan(); for (const r in pl.groups) pl.groups[r] = pl.groups[r].filter(x => x.id !== gid); }
function planGroupMove(gid, dir) { const pl = ensurePlan(); for (const r in pl.groups) { const l = pl.groups[r], i = l.findIndex(x => x.id === gid), j = i + dir; if (i >= 0 && j >= 0 && j < l.length) { [l[i], l[j]] = [l[j], l[i]]; return; } } }
