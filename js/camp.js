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
const CAMP_BLOCKS = 4; // practice blocks: two weeks of camp before the first exhibition, then a lighter week after each of the first two games
const CAMP_ROOMS = [['QB', ['QB']], ['RB', ['RB']], ['WR', ['WR']], ['TE', ['TE']], ['OL', ['OL']], ['DL', ['DL']], ['LB', ['LB']], ['DB', ['CB', 'S']]];
const CAMP_JOBS = [['QB', 'Quarterback'], ['RB', 'Running back'], ['X', 'X receiver'], ['Z', 'Z receiver'], ['SLOT', 'Slot receiver'], ['Y', 'Tight end'], ['LT', 'Left tackle'], ['LG', 'Left guard'], ['C', 'Center'], ['RG', 'Right guard'], ['RT', 'Right tackle'],
  ['EDGE1', 'Edge'], ['EDGE2', 'Edge'], ['IDL1', 'Interior line'], ['IDL2', 'Interior line'], ['MLB', 'Middle linebacker'], ['WLB', 'Weak-side linebacker'], ['CB1', 'Corner'], ['CB2', 'Corner'], ['NCB', 'Slot corner'], ['FS', 'Free safety'], ['SS', 'Strong safety'], ['K', 'Kicker'], ['P', 'Punter']];
const CAMP_TIER_NAME = ['the ones', 'the twos', 'the threes'];
// ---- where a man is working ----
// One setting drives his camp: the room he sits in, the drills he takes, who he faces, where his comfort grows and what the reports say.
// A second spot takes a share of his reps (a tenth to a half). With nothing set he works at his own position.
function workOf(p) { const w = p.work; if (w && w.a && SPOTS[w.a]) return { a: w.a, b: w.b && SPOTS[w.b] && w.b !== w.a ? w.b : null, sb: w.b && w.b !== w.a ? clamp(w.sb || 0.3, 0.1, 0.5) : 0 }; return p.xt && SPOTS[p.xt] ? { a: p.spot, b: p.xt, sb: 0.3 } : { a: p.spot, b: null, sb: 0 }; }
function cpos(p) { return p.pos === 'K' || p.pos === 'P' || !SPOTS[p.spot] ? p.pos : SPOTS[workOf(p).a].g; }
function campOvr(p) { const w = workOf(p); return w.a === p.spot || !p.a ? p.ovr : slotRating(p, w.a); }
function wsh(p, grp) { const w = workOf(p); return (grp.includes(SPOTS[w.a].g) ? 1 - w.sb : 0) + (w.b && grp.includes(SPOTS[w.b].g) ? w.sb : 0); }
function wspot(p, grp) { const w = workOf(p), ina = grp.includes(SPOTS[w.a].g), inb = w.b && grp.includes(SPOTS[w.b].g); return ina && inb ? (rand() < w.sb ? w.b : w.a) : ina ? w.a : w.b; }
function workSpots(p) { return SPOTS[p.spot] && p.pos !== 'K' && p.pos !== 'P' ? [p.spot, ...crossTrainSpots(p)] : [p.spot]; }
function workLabel(p) { const w = workOf(p); return w.a === p.spot && !w.b ? null : w.b ? `${SPOTS[w.a].l} ${Math.round((1 - w.sb) * 100)}% / ${SPOTS[w.b].l} ${Math.round(w.sb * 100)}%` : SPOTS[w.a].l; }
function setWork(pid, part, v) {
  const p = P(pid); if (!p) return; const ok = workSpots(p), w = Object.assign({ a: p.spot, b: null, sb: 0.3 }, workOf(p));
  if (part === 'a') w.a = ok.includes(v) ? v : p.spot; else if (part === 'b') w.b = v && ok.includes(v) ? v : null; else if (part === 'sb') w.sb = clamp(+v || 0.3, 0.1, 0.5);
  if (w.b === w.a) w.b = null; if (!w.sb) w.sb = 0.3;
  delete p.xt; delete p.xts;
  if (w.a === p.spot && !w.b) { delete p.work; return; }
  p.work = { a: w.a, b: w.b, sb: w.b ? w.sb : 0 };
  // the spot that is new to him is where his comfort grows, at the pace of the reps he gets there
  const away = w.a !== p.spot ? [w.a, w.b ? 1 - w.sb : 1] : [w.b, w.sb];
  if (away[0] && away[0] !== p.spot && comfortOf(p, away[0]) < 100) { p.xt = away[0]; p.xts = away[1]; }
}
function campOn() { return !!(state.camp && state.camp.season === state.season); }
function campOf(p) { return p.camp && p.camp.s === state.season ? p.camp : (p.camp = { s: state.season, r: [0, 0, 0], oo: [[0, 0], [0, 0], [0, 0]], sc: [], notes: [], form: round1(hashGauss(p.id, 811, state.season) * 2.2) }); }
// ---- the coach who runs his room, and how sharp his eye is ----
function campCoach(tid, pos) { return pos === 'K' || pos === 'P' ? C(T(tid).stc) : posCoach(tid, pos); }
function campCoachQ(c) { return !c ? 38 : typeof c.dev === 'number' && typeof c.disc === 'number' ? (c.dev + c.disc) / 2 : c.k && c.k.units !== undefined ? c.k.units : c.ovr || 50; }
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
  const c = campCoach(tid === undefined ? p.tid : tid, cpos(p)), q = campCoachQ(c), ov = campOvr(p), sd = clamp(5 - (q - 40) / 14, 1.5, 5);
  const prior = ov + campBias(c, p) + clamp(hashGauss(p.id, 700 + (c ? c.id % 89 : 0), state.season), -1.8, 1.8) * sd;
  const cg = campGrade(p), pg = typeof preGrade === 'function' ? preGrade(p) : null;
  const blocks = p.camp && p.camp.s === state.season ? p.camp.sc.length : 0, games = p.preS ? p.preS.gp || 0 : 0;
  const w = Math.min(0.62, blocks * 0.16 + games * 0.07);
  const num = v => typeof v === 'number' && isFinite(v), evid = ov + (num(cg) ? (cg - 60) * 0.22 : 0) + (num(pg) ? (pg - 60) * 0.14 : 0);
  return prior * (1 - w) + evid * w + campBias(c, p) * w;
}
function jobRead(p, spot, tid) { return slotRating(p, spot) + (coachRead(p, tid) - campOvr(p)); }
// ---- what camp shows that the ratings do not ----
function stValue(p) { return p.a && ST_OK.has(p.spot) ? stCover(p) : 0; }
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
function campPractice(tid, load) {
  load = load || 1;
  const cm = state.camp, ro = rosterOf(tid).filter(p => p.a && !p.injury), blk = cm.blocks;
  // coaches set the reps: each room in the order its coach sees it; men in a battle get a look with the group above them
  const tier = {}, inBattle = new Set((cm.battles || []).filter(b => !b.closed).flatMap(b => b.cands));
  for (const pos of POSITIONS) { const n = REPS_FIRST[pos] || 1; ro.filter(p => cpos(p) === pos).sort((a, b) => coachRead(b, tid) - coachRead(a, tid)).forEach((p, i) => { tier[p.id] = i < n ? 0 : i < n * 2 ? 1 : 2; }); }
  const MIX = [[0.7, 0.25, 0.05], [0.25, 0.55, 0.2], [0.05, 0.3, 0.65]], week = {};
  const W = id => week[id] || (week[id] = { oo: [[0, 0], [0, 0], [0, 0]], plus: 0, minus: 0, vs: {}, sp: {}, line: null });
  const edge = {}; for (const p of ro) edge[p.id] = campEdge(p);
  const pickTier = (p) => { let m = MIX[tier[p.id]]; if (inBattle.has(p.id) && tier[p.id] > 0) m = MIX[tier[p.id] - 1].map((v, i) => (v + m[i]) / 2); const r = rand(); return r < m[0] ? 0 : r < m[0] + m[1] ? 1 : 2; };
  for (const [og, osk, dg, dsk] of CAMP_DRILLS) {
    const O = ro.filter(p => wsh(p, og) > 0), D = ro.filter(p => wsh(p, dg) > 0); if (!O.length || !D.length) continue;
    for (const a of O) { const reps = Math.round(((tier[a.id] === 1 ? 7 : 5) + (inBattle.has(a.id) ? 2 : 0)) * load * wsh(a, og));
      for (let i = 0; i < reps; i++) { const tt = pickTier(a), pool = D.filter(d => tier[d.id] === tt), b = pick(pool.length ? pool : D);
        const sa = wspot(a, og), sd = wspot(b, dg);
        const win = rand() < lgt((CAMP_SK[osk](a) + edge[a.id] - comfortPen(a, sa) - CAMP_SK[dsk](b) - edge[b.id] + comfortPen(b, sd)) / 7.5 + (osk === 'pro' ? 0.25 : osk === 'rec' ? -0.1 : 0)); // blockers win a few more pass-rush reps than they lose
        W(a.id).oo[tier[b.id]][win ? 0 : 1]++; W(b.id).oo[tier[a.id]][win ? 1 : 0]++; (W(a.id).vs[b.id] = W(a.id).vs[b.id] || [0, 0])[win ? 0 : 1]++; (W(b.id).vs[a.id] = W(b.id).vs[a.id] || [0, 0])[win ? 1 : 0]++; (W(a.id).sp[sa] = W(a.id).sp[sa] || [0, 0])[win ? 0 : 1]++; (W(b.id).sp[sd] = W(b.id).sp[sd] || [0, 0])[win ? 1 : 0]++; campOf(a).r[tier[b.id]]++; campOf(b).r[tier[a.id]]++; } }
  }
  // team periods: plays that stood out, for better and worse
  const roomAvg = pos => { const l = ro.filter(p => cpos(p) === pos); return l.length ? avg(l.map(p => p.ovr)) : 60; };
  for (const p of ro) {
    const w = W(p.id), h = p.h || {}, pb = typeof pbOf === 'function' ? pbOf(p) : 96, rel = (campOvr(p) + edge[p.id] - roomAvg(cpos(p))) / 9 + (tier[p.id] === 0 ? -0.25 : tier[p.id] === 2 ? 0.2 : 0); // the threes face the threes
    const up = clamp(0.55 * Math.exp(rel * 0.5), 0.1, 2.2), dn = clamp(0.5 * Math.exp(-rel * 0.5) + (pb < 60 ? 0.25 : 0) + ((h.disc || 55) < 40 ? 0.15 : 0), 0.08, 2.2);
    for (let i = 0; i < 3; i++) { if (rand() < up / 3) w.plus++; if (rand() < dn / 3) w.minus++; }
    if (p.pos === 'QB') { const att = tier[p.id] === 0 ? 22 : tier[p.id] === 1 ? 16 : 10, pc = clamp(0.67 + (p.a.sacc - 70) * 0.004 + (p.a.dec - 70) * 0.002 + edge[p.id] * 0.006, 0.48, 0.84); let c = 0, ints = 0; for (let i = 0; i < att; i++) { if (rand() < pc) c++; else if (rand() < clamp(0.07 + (70 - p.a.dec) * 0.003, 0.02, 0.2)) ints++; } w.line = `${c} of ${att} in seven-on-seven${ints ? `, ${ints} intercepted` : ''}, mostly with ${CAMP_TIER_NAME[tier[p.id]]}`; w.qb = [c, att, ints]; }
    if (p.pos === 'K') { const att = 8; let m = 0; for (let i = 0; i < att; i++) if (rand() < clamp(0.74 + (p.a.kcon - 70) * 0.008 + (p.a.krng - 70) * 0.004, 0.4, 0.97)) m++; w.line = `${m} of ${att} on field goals in team periods`; w.k = [m, att]; }
    if (p.pos === 'P') { const hang = (4.2 + (p.a.phng - 70) * 0.012 + gauss(0, 0.08)).toFixed(1); w.line = `averaged ${hang} seconds of hang time`; w.pn = +hang; }
  }
  // grade the week and write it down
  const usedNotes = new Set();
  const WT = [1.3, 1, 0.7], LT = [0.7, 1, 1.3], adj = p => { const w = W(p.id); let aw = 0, al = 0; for (let t = 0; t < 3; t++) { aw += w.oo[t][0] * WT[t]; al += w.oo[t][1] * LT[t]; } return [aw, al]; };
  const roomRate = {}; for (const pos of POSITIONS) { let aw = 0, al = 0; for (const p of ro.filter(x => cpos(x) === pos)) { const r = adj(p); aw += r[0]; al += r[1]; } roomRate[pos] = aw + al ? aw / (aw + al) : 0.5; }
  for (const p of ro) {
    const w = W(p.id), c = campOf(p); let aw = 0, al = 0, n = 0;
    for (let t = 0; t < 3; t++) { aw += w.oo[t][0] * WT[t]; al += w.oo[t][1] * LT[t]; n += w.oo[t][0] + w.oo[t][1]; c.oo[t][0] += w.oo[t][0]; c.oo[t][1] += w.oo[t][1]; }
    let sc = 60 + (n ? ((aw + (roomRate[cpos(p)] || 0.5) * 2) / (aw + al + 2) - (roomRate[cpos(p)] || 0.5)) * 75 : 0) + (w.plus - w.minus) * 4.5;
    if (w.qb) sc = 60 + (w.qb[0] / w.qb[1] - 0.66) * 110 - w.qb[2] * 5 + (w.plus - w.minus) * 3;
    if (w.k) sc = 60 + (w.k[0] / w.k[1] - 0.75) * 90;
    if (w.pn) sc = 60 + (w.pn - 4.3) * 45;
    c.sc[blk] = Math.round(clamp(sc, 22, 96));
    c.t = tier[p.id];
    for (const k in w.sp) { const t = (c.sp = c.sp || {})[k] || (c.sp[k] = [0, 0]); t[0] += w.sp[k][0]; t[1] += w.sp[k][1]; }
    const note = campNote(p, w, tier[p.id], usedNotes); if (note) c.notes.push([blk, note[0], note[1]]);
    if (c.notes.length > 6) c.notes.shift();
  }
}
// ---- camp notes: what a coach writes down about a man's week ----
// Built from what happened: his drill record, who he won and lost against, and plays from the team periods.
// No two men in the same room get the same line in the same week if there is another one to give.
const CAMP_PLUS = {
  QB: ['threw a strike down the seam in seven-on-seven', 'ran the two-minute period without a wasted snap', 'got the protection right against a look we had not shown him', 'hit three straight in the red zone period', 'threw a receiver open against tight coverage', 'kept a play alive and found his checkdown', 'led the offense on a long scoring drive in the team period'],
  RB: ['broke a long run in the team period', 'picked up a blitz the staff showed on film', 'ran through an arm tackle for a score on the goal line', 'caught everything out of the backfield', 'set up his blocks on outside zone and hit it at full speed', 'finished every run past the whistle', 'made the first man miss in the open-field drill', 'converted a third and short behind his pads'],
  WR: ['beat his man deep in a team period', 'made a contested catch in the red zone period', 'won at the top of his route all week', 'took a slant the distance in seven-on-seven', 'made a one-handed catch on the sideline', 'beat press at the line and was open by three steps', 'found the soft spot in zone on third down', 'blocked his corner out of the play on a long run', 'came back to the ball and saved a throw'],
  TE: ['won up the seam in team periods', 'sealed the edge on a long run', 'caught a touchdown in traffic in the red zone period', 'handled an edge rusher by himself in pass protection', 'ran away from a linebacker on a crossing route', 'moved his man off the ball on the goal line', 'made a tough catch over the middle with a safety on him'],
  OL: ['stoned a bull rush in the two-minute period', 'moved his man on a goal-line rep', 'picked up a stunt cleanly in team periods', 'got to the second level and erased a linebacker', 'did not give up a pressure in the pass-rush period', 'pulled and kicked out the end on a long run', 'anchored against power three snaps running', 'passed off a twist without anyone coming free', 'finished a block ten yards downfield', 'mirrored a speed rush all the way around the pocket'],
  DL: ['got home in the two-minute period', 'blew up a run in the backfield', 'beat a double team to make the stop', 'won with a counter move after his first rush was stopped', 'batted a pass at the line', 'chased a run down from the back side', 'collapsed the pocket from the inside', 'set the edge and turned the run back inside', 'drew a holding call with his first step', 'ran a stunt that left the quarterback nowhere to go'],
  LB: ['read a screen and blew it up', 'made a stop on third and short', 'ran with a back down the sideline and broke it up', 'shot a gap for a loss on the goal line', 'got his hands on a pass in the middle of the field', 'took on a lead block and still made the tackle', 'made every call and had the defense lined up right', 'timed a blitz and came free'],
  CB: ['broke up a pass in the red zone period', 'intercepted a pass in team periods', 'stayed in the hip pocket of his man all week', 'jammed his receiver and took him out of the play', 'made a tackle in space on a screen', 'undercut an out route and nearly had it', 'recovered and knocked away a deep ball', 'did not give up a catch in the seven-on-seven period'],
  S: ['came down to stop a run for no gain', 'took away a deep shot', 'intercepted a pass over the middle', 'matched a tight end down the seam', 'made the right check and saved a big play', 'filled the alley on outside zone', 'broke on a throw from the far hash'],
};
const CAMP_MINUS = {
  QB: ['held the ball too long in team periods', 'threw late over the middle and paid for it', 'missed an open man on third down', 'put the ball on the ground on a snap exchange', 'stared down his first read all period', 'sailed two throws to the sideline', 'took a sack that knocked the offense out of range'],
  RB: ['put the ball on the ground', 'missed a blitz pickup', 'ran into his own blockers on inside zone', 'dropped a screen with room to run', 'went down on first contact too often', 'bounced a run outside that was there inside', 'went the wrong way on a protection call'],
  WR: ['dropped one in the team period', 'ran the wrong route on third down', 'could not get off press', 'let a ball get into his body and lost it', 'quit on a route when he was not the first read', 'was pushed out of bounds on a fade', 'lined up wrong twice', 'lost a contested ball he should have had'],
  TE: ['missed a block that got a back hit', 'dropped a pass over the middle', 'was beaten inside on a pass-rush rep', 'could not hold the edge on outside zone', 'ran the wrong route out of a bunch set', 'was late off the ball on the goal line', 'got pushed into the backfield on a run'],
  OL: ['was beaten clean for a sack in team periods', 'jumped offside twice', 'lost a twist and let a rusher free', 'was walked back into the quarterback by a bull rush', 'whiffed on a linebacker at the second level', 'got beat across his face on an inside move', 'was late out of his stance on the silent count', 'was called for holding in the two-minute period', 'lost his feet on a speed rush', 'could not move his man on short yardage'],
  DL: ['was washed out on a long run', 'jumped offside in the two-minute period', 'got stuck on blocks all period', 'lost contain and let the quarterback out', 'ran himself out of the play on a draw', 'was driven off the ball by a double team', 'had no answer when his first move was stopped', 'was a step late off the snap'],
  LB: ['bit on play-action and gave up a big one', 'was a step late to his gap', 'got lost in coverage on a crossing route', 'missed a tackle in the hole', 'was caught in the wash on outside zone', 'blew a blitz assignment', 'let a back run by him on a wheel route', 'had the front lined up wrong'],
  CB: ['was beaten deep in the team period', 'grabbed a receiver and drew a flag', 'gave up the inside on a slant every time', 'missed a tackle on a screen', 'lost his man on a double move', 'was late out of his break all week', 'gave too much cushion on third and short', 'turned the wrong way on a back-shoulder throw'],
  S: ['took a bad angle on a long run', 'was late over the top on a deep ball', 'bit on a pump fake', 'missed a tackle in the alley', 'blew a coverage check', 'was out of position on a play-action shot', 'let a tight end get behind him'],
};
function campNote(p, w, tier, used) {
  used = used || new Set();
  const cap = x => x.charAt(0).toUpperCase() + x.slice(1) + '.', fresh = l => { const f = l.filter(x => !used.has(p.pos + x)); const c = pick(f.length ? f : l); used.add(p.pos + c); return c; };
  const tot = w.oo.reduce((s, x) => s + x[0] + x[1], 0), wins = w.oo.reduce((s, x) => s + x[0], 0), v1 = w.oo[0], with1 = v1[0] + v1[1];
  const good = w.plus > w.minus || (tot >= 5 && wins / tot >= 0.62), bad = w.minus > w.plus || (tot >= 5 && wins / tot <= 0.36), sign = good && !bad ? 1 : bad && !good ? -1 : 0;
  const ev = good && w.plus && CAMP_PLUS[cpos(p)] ? fresh(CAMP_PLUS[cpos(p)]) : bad && w.minus && CAMP_MINUS[cpos(p)] ? fresh(CAMP_MINUS[cpos(p)]) : null;
  if (w.line) return [w.plus > w.minus ? 1 : w.minus > w.plus ? -1 : 0, [w.line, ev].filter(Boolean).map(cap).join(' ')];
  // who he won and lost against
  const vs = Object.entries(w.vs || {}).map(([id, r]) => ({ o: P(+id), w: r[0], l: r[1] })).filter(x => x.o && x.w + x.l >= 2);
  const beat = vs.filter(x => x.w > x.l).sort((a, b) => (b.w - b.l) - (a.w - a.l) || b.o.ovr - a.o.ovr)[0], lost = vs.filter(x => x.l > x.w).sort((a, b) => (b.l - b.w) - (a.l - a.w) || a.o.ovr - b.o.ovr)[0];
  const rec = !tot ? null : pick([`went ${wins}–${tot - wins} in the drills`, `won ${wins} of ${tot} drill reps`, `${wins}–${tot - wins} in one-on-ones`]) + (with1 >= 3 ? ` (${v1[0]}–${v1[1]} against ${CAMP_TIER_NAME[0]})` : tier === 2 ? ', mostly against the threes' : tier === 1 && with1 === 0 ? ', none of it against the ones' : '');
  const opp = good && beat ? pick([`got the better of ${beat.o.last} (${beat.w}–${beat.l})`, `had ${beat.o.last}'s number, ${beat.w} to ${beat.l}`, `won his reps against ${beat.o.last}`]) : bad && lost ? pick([`${lost.o.last} had his number (${lost.l}–${lost.w})`, `could not handle ${lost.o.last}, who won ${lost.l} of ${lost.l + lost.w}`, `lost his reps to ${lost.o.last}`]) : null;
  const here = Object.keys(w.sp || {}).filter(k => SPOTS[k]);
  const where = here.length > 1 ? 'split his reps: ' + here.map(k => `${w.sp[k][0]}–${w.sp[k][1]} at ${SPOTS[k].l}`).join(', ') : here.length === 1 && here[0] !== p.spot && rec ? `${rec}, working at ${SPOTS[here[0]].l}` : null;
  const parts = [where || rec, ev && opp ? (rand() < 0.5 ? ev : opp) : ev || opp].filter(Boolean);
  if (!parts.length) return null;
  return [sign, parts.map(cap).join(' ')];
}
// ---- battles: recomputed from the coaches' boards every week, with history carried by name ----
function campBattles(tid) {
  const cm = state.camp, old = {}; for (const b of cm.battles || []) old[b.id] = b;
  const ro = rosterOf(tid).filter(p => p.a && countsOn53(p)), lists = defaultChart(tid), out = [];
  const starters = new Set(CAMP_JOBS.map(([k]) => (lists[k] || [])[0]).filter(x => x !== undefined)), taken = new Set();
  for (const [key, label] of CAMP_JOBS) {
    const a = P((lists[key] || [])[0]); if (!a) continue;
    const spot = chartSpotFor(tid, key), top = jobRead(a, spot, tid);
    const ch = ro.filter(p => cpos(p) === cpos(a) && p.id !== a.id && !starters.has(p.id) && !taken.has(p.id) && jobRead(p, spot, tid) >= top - 4.5).sort((x, y) => jobRead(y, spot, tid) - jobRead(x, spot, tid)).slice(0, 2);
    if (!ch.length) continue;
    ch.forEach(p => taken.add(p.id));
    out.push({ id: 'J' + key, kind: 'start', key, spot, pos: a.pos, label, n: 1, cands: [a.id, ...ch.map(p => p.id)], gap: top - jobRead(ch[0], spot, tid) });
  }
  out.sort((x, y) => x.gap - y.gap); out.length = Math.min(out.length, 6);
  const fighting = new Set(out.flatMap(b => b.cands)); // a man competing to start is not on the roster bubble
  for (const pos of POSITIONS) {
    const l = ro.filter(p => cpos(p) === pos).sort((x, y) => coachRead(y, tid) - coachRead(x, tid)), line = ROSTER_TEMPLATE[pos];
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
    const l = ro.filter(p => cpos(p) === pos && countsOn53(p)).sort((x, y) => coachRead(y, tid) - coachRead(x, tid)), line = ROSTER_TEMPLATE[pos];
    const mark = l.length > line ? (coachRead(l[line - 1], tid) + coachRead(l[line], tid)) / 2 : -99;
    l.forEach((p, i) => { const d = coachRead(p, tid) - mark; out[p.id] = { i, cat: l.length <= line ? (i < line - 1 ? 'lock' : 'likely') : i < line ? (d >= 5 ? 'lock' : d >= 2 ? 'likely' : 'bubble') : d >= -3 ? 'bubble' : psRoomOK(tid, p) ? 'ps' : 'long' }; });
    for (const p of ro.filter(p => cpos(p) === pos && !countsOn53(p))) out[p.id] = { i: 99, cat: 'ir' };
  }
  return out;
}
function psRoomOK(tid, p) { return p.exp <= 2 || (p.exp <= 6 && p.age <= 27); }
// ---- the meeting: each coach presents his room ----
function campMeeting(tid) {
  const bub = campBubble(tid), ro = rosterOf(tid).filter(p => p.a), blk = state.camp.blocks - 1, out = [];
  for (const [role, poss] of [...CAMP_ROOMS, ['ST', ['K', 'P']]]) {
    const c = role === 'ST' ? C(T(tid).stc) : asst(T(tid), role), l = ro.filter(p => poss.includes(cpos(p))); if (!l.length) continue;
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
    const c = campCoach(tid, cpos(p)), keepOver = rosterOf(tid).filter(x => cpos(x) === cpos(p) && x.id !== p.id && plan[x.id] !== 'cut' && plan[x.id] !== 'ps' && bub[x.id] && coachRead(x, tid) < coachRead(p, tid)).sort((a, b) => coachRead(a, tid) - coachRead(b, tid))[0];
    out.push({ p, c, over: keepOver || null, note: campLastNote(p) }); }
  // the special teams coordinator speaks up for the men who cover his kicks
  const stc = C(T(tid).stc), core = rosterOf(tid).filter(p => p.a && ST_OK.has(p.spot)).sort((a, b) => stCover(b) - stCover(a)).slice(0, 6);
  for (const p of core) if ((plan[p.id] === 'cut' || plan[p.id] === 'ps') && stCover(p) >= 68 && !out.some(o => o.p === p)) out.push({ p, c: stc, over: null, note: [0, 0, 'One of the best men on the kick-coverage units.'] });
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
  // where every man stood in his room before the first practice, so the reports can say who moved
  state.camp.pre = {}; for (const pos of POSITIONS) rosterOf(u).filter(p => p.a && cpos(p) === pos).sort((a, b) => coachRead(b, u) - coachRead(a, u)).forEach((p, i) => state.camp.pre[p.id] = i + 1);
  campWeek('Camp, week 1', 1.2); campWeek('Camp, week 2', 1.2); // the main block of camp comes before any game
}
function campWeek(label, load) {
  const cm = state.camp; if (!cm || cm.blocks >= CAMP_BLOCKS) return;
  campPractice(cm.tid, load); cm.blocks++; campBattles(cm.tid);
  cm.label = label;
  if (!isAI(cm.tid)) addNews(`${label}: the staff has updated its boards. ${cm.battles.filter(b => !b.closed).length} battles are open.`, [cm.tid]);
}
// ---- the squad planner: your own unofficial depth chart ----
// Groups are yours: name them, fill them with anyone, order them however you like. Nothing here touches the real depth chart or the roster.
const PLAN_ROOMS = [['QB', 'Quarterbacks', ['QB']], ['RB', 'Running backs', ['RB']], ['WR', 'Receivers', ['WR']], ['TE', 'Tight ends', ['TE']], ['OL', 'Offensive line', ['OL']], ['DL', 'Defensive line', ['DL']], ['LB', 'Linebackers', ['LB']], ['CB', 'Corners', ['CB']], ['S', 'Safeties', ['S']], ['ST', 'Specialists', ['K', 'P']]];
const PLAN_SEED = { QB: [['Starter', ['QB']]], RB: [['Lead back', ['RB']]], WR: [['X receiver', ['X']], ['Z receiver', ['Z']], ['Slot', ['SLOT']]], TE: [['Tight end (Y)', ['Y']], ['Move tight end (H)', ['H']]],
  OL: [['Left tackle', ['LT']], ['Left guard', ['LG']], ['Center', ['C']], ['Right guard', ['RG']], ['Right tackle', ['RT']]], DL: [['Edge', ['EDGE1', 'EDGE2']], ['Interior', ['IDL1', 'IDL2', 'NT']]], LB: [['Middle linebacker', ['MLB']], ['Weak side', ['WLB']]],
  CB: [['Outside corner', ['CB1', 'CB2']], ['Slot corner', ['NCB']]], S: [['Free safety', ['FS']], ['Strong safety', ['SS']]], ST: [['Kicker', ['K']], ['Punter', ['P']], ['Kickoff coverage', ['KO']], ['Punt team', ['PU']]] };
function planRoomOf(p) { const r = PLAN_ROOMS.find(x => x[2].includes(cpos(p))); return r ? r[0] : null; }
const PLAN_PHASES = ['COACHES', 'RESIGN', 'FA', 'DRAFT', 'UDFA', 'PRESEASON', 'CUTDOWN'];
function planOn() { return !!state && PLAN_PHASES.includes(state.phase); }
function planSeedRoom(tid, room) {
  const cm = { plan: state.plan }, lists = defaultChart(tid), poss = PLAN_ROOMS.find(x => x[0] === room)[2], used = new Set(), out = [];
  for (const [name, keys] of PLAN_SEED[room] || []) {
    if (ST_UNIT[keys[0]]) { out.push({ id: cm.plan.nid++, name, pids: (lists[keys[0]] || []).slice(0, ST_SIZE) }); continue; }
    const ids = []; for (let i = 0; i < 2; i++) for (const k of keys) { const id = (lists[k] || [])[i], p = id !== undefined ? P(id) : null; if (p && poss.includes(cpos(p)) && !ids.includes(id) && (i > 0 || !used.has(id))) { ids.push(id); if (i === 0) used.add(id); } }
    out.push({ id: cm.plan.nid++, name, pids: ids.slice(0, keys.length > 1 ? 4 : 2) });
  }
  cm.plan.groups[room] = out;
}
function ensurePlan() {
  if (!state.plan && state.camp && state.camp.plan) { state.plan = state.camp.plan; delete state.camp.plan; } // a plan started under the old camp page carries over
  if (!state.plan) { state.plan = { groups: {}, nid: 1 }; for (const [room] of PLAN_ROOMS) planSeedRoom(state.userTid, room); }
  return state.plan;
}
function planGroup(gid) { const pl = ensurePlan(); for (const r in pl.groups) { const g = pl.groups[r].find(x => x.id === gid); if (g) return g; } return null; }
function planNew(room, name, pids) { const pl = ensurePlan(); name = String(name || '').trim().slice(0, 40); if (!name) return; (pl.groups[room] = pl.groups[room] || []).push({ id: pl.nid++, name, pids: (pids || []).slice() }); }
function planAdd(gid, pid) { const g = planGroup(gid); if (g && !g.pids.includes(pid)) g.pids.push(pid); }
function planRemove(gid, pid) { const g = planGroup(gid); if (g) g.pids = g.pids.filter(x => x !== pid); }
function planMove(gid, pid, dir) { const g = planGroup(gid); if (!g) return; const i = g.pids.indexOf(pid), j = i + dir; if (i < 0 || j < 0 || j >= g.pids.length) return; [g.pids[i], g.pids[j]] = [g.pids[j], g.pids[i]]; }
function planDelete(gid) { const pl = ensurePlan(); for (const r in pl.groups) pl.groups[r] = pl.groups[r].filter(x => x.id !== gid); }
function planGroupMove(gid, dir) { const pl = ensurePlan(); for (const r in pl.groups) { const l = pl.groups[r], i = l.findIndex(x => x.id === gid), j = i + dir; if (i >= 0 && j >= 0 && j < l.length) { [l[i], l[j]] = [l[j], l[i]]; return; } } }

// =====================================================================
//  THE STAFF SPEAKS: the meeting before camp, and the camp report after each practice block
//  One voice per coach, at his level: the head coach on the whole roster, coordinators on their side, the run and
//  pass specialists on their area, position coaches on their room. Before camp it is what they expect and what
//  each man has to show; once camp is open it is what they saw. All of it is advice.
// =====================================================================
const BRIEF_ROOMS = { HC: ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S'], OC: ['QB', 'RB', 'WR', 'TE', 'OL'], DC: ['DL', 'LB', 'CB', 'S'], STC: ['K', 'P'], SC: ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S'],
  PGC: ['QB', 'WR', 'TE'], RGC: ['RB', 'OL'], DPC: ['CB', 'S'], DRC: ['DL', 'LB'], QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], OL: ['OL'], DL: ['DL'], LB: ['LB'], DB: ['CB', 'S'] };
const BRIEF_ASK = { sacc: 'be accurate underneath', dacc: 'hit the deep ball', arm: 'drive the ball outside the numbers', proc: 'get through his reads on time', dec: 'protect the football', pkt: 'stay calm with bodies around him', tor: 'make throws on the move',
  vis: 'find the right lane', elu: 'make the first man miss', bal: 'run through contact', bsec: 'hold onto the ball', rte: 'run the whole route tree', rel: 'get off the line against press', hnd: 'catch everything thrown his way', cth: 'win in traffic',
  pbk: 'hold up in pass protection', rbk: 'move people in the run game', bawr: 'clean up the assignment errors', prsh: 'win as a rusher', shed: 'get off blocks', tkl: 'tackle in space', prec: 'diagnose it faster', man: 'stay with his man',
  zone: 'keep his eyes right in zone', prs: 'win at the line of scrimmage', bsk: 'make a play on the ball', spd: 'show he can run with this league', bur: 'show some suddenness', agi: 'change direction cleanly', str: 'hold up physically',
  kcon: 'make the ones he should make', krng: 'show the leg from distance', pdis: 'flip the field', phng: 'give the coverage time to get there' };
function briefPL(p) { return typeof playerLink === 'function' ? playerLink(p, true) : pname(p); }
function briefList(ps, n) { const l = ps.slice(0, n || 4).map(briefPL); return l.length <= 1 ? l.join('') : l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1]; }
// the one thing a coach most wants to see from a man: the weakest part of his game that the job actually asks for
function briefAsk(p) {
  const pb = typeof pbOf === 'function' ? pbOf(p) : 96;
  const r = scoutRead(p).rows.filter(x => BRIEF_ASK[x.k] && x.k !== 'st').sort((a, b) => (a.d - (a.core ? 4 : 0)) - (b.d - (b.core ? 4 : 0)))[0], ask = r ? BRIEF_ASK[r.k] : 'keep doing what he does';
  return pb < 55 ? 'learn the playbook, then ' + ask : ask;
}
function prepBattles(tid) { // the staff's open jobs, whether or not camp has started
  if (campOn()) return state.camp.battles;
  const keep = state.camp; state.camp = { season: state.season, tid, blocks: 0, battles: [], settled: [] };
  let out = []; try { campBattles(tid); out = state.camp.battles; } finally { state.camp = keep; }
  return out;
}
function briefLeagueBar(pos) { const n = LINEUP_NEED[pos] || 1, v = state.teams.map(t => { const l = rosterOf(t.id).filter(p => cpos(p) === pos && p.a).sort((a, b) => b.ovr - a.ovr).slice(0, n); return l.length ? avg(l.map(p => p.ovr)) : 55; }); return avg(v); }
function coachBrief(tid, role) {
  const t = T(tid), c = staffCoach(t, role); if (!c) return null;
  const on = campOn(), cm = state.camp, poss = BRIEF_ROOMS[role] || [], ro = rosterOf(tid).filter(p => p.a), bub = campBubble(tid), battles = prepBattles(tid);
  const inRooms = p => poss.includes(cpos(p)), mine = ro.filter(inRooms), blk = on ? cm.blocks - 1 : -1;
  const read = p => coachRead(p, tid), order = pos => ro.filter(p => cpos(p) === pos).sort((a, b) => read(b) - read(a));
  const wk = p => p.camp && p.camp.s === state.season ? p.camp.sc[blk] : undefined, note = p => { const n = campLastNote(p); return n ? ` <span class="muted">${esc(n[2])}</span>` : ''; };
  const S = [], sec = (h, lines) => { lines = lines.filter(Boolean); if (lines.length) S.push({ h, lines }); };
  const roomBattles = pos => battles.filter(b => b.pos === pos);
  const cat = (p, ...k) => bub[p.id] && k.includes(bub[p.id].cat);
  // one sentence on a room, at the level a coordinator talks
  const roomLine = pos => { const l = order(pos); if (!l.length) return null; const bs = roomBattles(pos), start = bs.filter(b => b.kind === 'start'), spot = bs.find(b => b.kind === 'spot');
    let s = `<b>${ROOM_NAME[pos] || pos}</b> (${l.length} in camp, about ${ROSTER_TEMPLATE[pos]} stay): `;
    s += start.length ? start.map(b => `${b.label.toLowerCase()} is open between ${briefList(battleBoard2(b), 3)}`).join('; ') + '.' : `settled at the top behind ${briefList(l, Math.min(2, LINEUP_NEED[pos] || 1))}.`;
    if (spot) s += ` ${spot.cands.length} men for the last ${spot.n === 1 ? 'spot' : spot.n + ' spots'}: ${briefList(battleBoard2(spot), 5)}.`;
    if (on) { const g = l.filter(p => wk(p) !== undefined), up = g.slice().sort((a, b) => wk(b) - wk(a))[0], dn = g.filter(p => cat(p, 'lock', 'likely', 'bubble')).sort((a, b) => wk(a) - wk(b))[0]; if (up && wk(up) >= 68) s += ` Best week: ${briefPL(up)}.`; if (dn && dn !== up && wk(dn) <= 48) s += ` ${briefPL(dn)} has to be better.`; }
    return s; };
  const battleBoard2 = b => on ? battleBoard(b).map(r => r.p) : b.cands.map(id => P(id)).filter(Boolean);
  const stMust = list => list.filter(p => cat(p, 'bubble', 'ps', 'long') && ST_OK.has(p.spot)).sort((a, b) => stCover(b) - stCover(a));
  const movers = list => { if (!on || !cm.pre) return [[], []]; const now = {}; for (const pos of POSITIONS) order(pos).forEach((p, i) => now[p.id] = i + 1); const d = list.filter(p => cm.pre[p.id]).map(p => [p, cm.pre[p.id] - now[p.id]]); return [d.filter(x => x[1] >= 2).sort((a, b) => b[1] - a[1]).map(x => x[0]), d.filter(x => x[1] <= -2).sort((a, b) => a[1] - b[1]).map(x => x[0])]; };
  const title = on ? `Camp report · ${esc(cm.label || 'camp')}` : 'Preparing for camp';
  // ---------- head coach ----------
  if (role === 'HC') {
    const gap = poss.map(pos => { const l = order(pos).slice(0, LINEUP_NEED[pos] || 1); return [pos, (l.length ? avg(l.map(p => p.ovr)) : 50) - briefLeagueBar(pos)]; }).sort((a, b) => b[1] - a[1]);
    const strong = gap.filter(x => x[1] >= 1.5).slice(0, 3).map(x => ROOM_NAME[x[0]].toLowerCase()), thin = gap.filter(x => x[1] <= -1.5).slice(-3).reverse().map(x => ROOM_NAME[x[0]].toLowerCase());
    const starts = battles.filter(b => b.kind === 'start'), spots = battles.filter(b => b.kind === 'spot'), rk = ro.filter(p => p.exp === 0), picks = rk.filter(p => p.draft).sort((a, b) => a.draft.pick - b.draft.pick);
    if (!on) {
      sec('The roster', [`We have ${ro.length} men and ${Math.max(0, ro.filter(countsOn53).length - ROSTER_MAX)} of them will not be here in September.`,
        strong.length ? `What I like: the ${strong.join(', the ')}. Those rooms can carry us.` : 'I do not see a room on this roster that scares anybody yet.',
        thin.length ? `Where I am worried: the ${thin.join(', the ')}. We are short of what the good teams have there.` : 'I do not see a room that will get us beat.']);
      sec('Jobs that are open', [starts.length ? `${starts.length} starting job${starts.length === 1 ? ' is' : 's are'} open as far as I am concerned: ${starts.map(b => `${b.label.toLowerCase()} (${briefList(battleBoard2(b), 3)})`).join('; ')}.` : 'Every starting job has a name on it going in. Somebody is welcome to change my mind.',
        spots.length ? `The back of the roster is tight at ${spots.map(b => POS_NAME_CAMP[b.pos]).join(', ')}. Those decisions get made on the practice field and on special teams.` : null]);
      sec('The rookies', [picks.length ? `${briefPL(picks[0])} was picked to play. ${picks.length > 1 ? `${briefList(picks.slice(1), 4)} have to earn it like everyone else.` : ''}` : null, rk.length - picks.length ? `${rk.length - picks.length} undrafted rookies are in camp. One or two of those always make somebody uncomfortable.` : null]);
      sec('What I want out of camp', [knob(c, 'cul') >= 65 ? 'Details. I will not carry a man who costs us flags and assignments, whatever he runs.' : 'Competition. Nobody has a job because of what he did last year.',
        thin.length ? `Find answers in the ${thin[0]}. If they are not in this building, tell me early.` : 'Come out of it healthy and knowing who our best 53 are.', 'And every man on the bubble plays special teams. If he cannot help there, he had better be clearly better than the man next to him.']);
    } else {
      const [up, dn] = movers(ro), settled = (cm.settled || []).filter(s => s.blk === cm.blocks);
      sec('Where we are', [`${cm.blocks} practice week${cm.blocks === 1 ? '' : 's'} in. ${starts.length} starting job${starts.length === 1 ? '' : 's'} still open, ${spots.length} fights for the last spots.`,
        settled.length ? `Settled this week: ${settled.map(s => `${s.label.toLowerCase()} (${P(s.pid) ? briefPL(P(s.pid)) : '—'})`).join('; ')}.` : null]);
      sec('Who moved', [up.length ? `Up on the boards: ${briefList(up, 4)}.` : 'Nobody has forced his way up the boards yet.', dn.length ? `Losing ground: ${briefList(dn, 4)}.` : null]);
      sec('Still to settle', starts.map(b => { const r = battleBoard(b); return r.length >= 2 ? `<b>${b.label}:</b> ${briefPL(r[0].p)} ${r[0].st[0].toLowerCase()}, ${briefPL(r[1].p)} ${r[1].st[0].toLowerCase()}.` : null; }));
      sec('What I want next', [state.pre && state.pre.wk < PRESEASON_GAMES ? `Game ${state.pre.wk + 1} is for the men in those fights. Give them the snaps and let the film decide it.` : 'The film is in. It is time to make the calls.']);
    }
  }
  // ---------- coordinators and the run / pass specialists ----------
  else if (['OC', 'DC', 'PGC', 'RGC', 'DPC', 'DRC'].includes(role)) {
    sec(on ? 'Room by room' : 'How I see my side', poss.map(roomLine));
    const fits = mine.filter(p => cat(p, 'lock', 'likely', 'bubble')).map(p => [p, schemeFit(p, tid)]), good = fits.filter(x => x[1] >= 2).sort((a, b) => b[1] - a[1]).map(x => x[0]), bad = fits.filter(x => x[1] <= -2).sort((a, b) => a[1] - b[1]).map(x => x[0]);
    if (!on) sec('What we ask of them', [good.length ? `${briefList(good, 3)} ${good.length === 1 ? 'is' : 'are'} made for what we do.` : null, bad.length ? `${briefList(bad, 3)} ${bad.length === 1 ? 'is' : 'are'} a projection in this system. I need to see it work.` : null]);
    const AREA = { PGC: [['rec', 'Our best at getting open'], ['pro', null]], RGC: [['rblk', 'Our best run blockers'], ['run', 'With the ball in his hands']], DPC: [['cov', 'Our best in coverage']], DRC: [['rush', 'Our best rushers'], ['fit', 'Our best against the run']], OC: [['rec', 'Who I want the ball going to']], DC: [['rush', 'Who gets home'], ['cov', 'Who I trust in coverage']] }[role] || [];
    sec('The players', AREA.filter(a => a[1]).map(([sk, label]) => { const l = mine.filter(p => { try { return isFinite(CAMP_SK[sk](p)) && (sk === 'rec' ? ['WR', 'TE'].includes(p.pos) : sk === 'rblk' ? p.pos === 'OL' : sk === 'run' ? p.pos === 'RB' : sk === 'cov' ? ['CB', 'S'].includes(p.pos) : sk === 'rush' ? ['DL', 'LB'].includes(p.pos) : sk === 'fit' ? ['DL', 'LB'].includes(p.pos) : true); } catch (e) { return false; } }).sort((a, b) => CAMP_SK[sk](b) - CAMP_SK[sk](a)); return l.length ? `${label}: ${briefList(l, 3)}.` : null; }));
    const sb = battles.filter(b => poss.includes(b.pos) && b.kind === 'start');
    sec(on ? 'The open jobs' : 'What I am looking for', sb.map(b => { const r = battleBoard2(b); return on ? (() => { const br = battleBoard(b); return br.length >= 2 ? `<b>${b.label}:</b> ${briefPL(br[0].p)} ${br[0].st[0].toLowerCase()}; ${briefPL(br[1].p)} ${br[1].st[0].toLowerCase()}.${note(br[1].p)}` : null; })() : `<b>${b.label}:</b> ${r.slice(0, 3).map(p => `${briefPL(p)} has to ${briefAsk(p)}`).join('; ')}.`; }));
    const st = stMust(mine); if (st.length && !on) sec('Special teams', [`From my side, ${briefList(st, 4)} ${st.length === 1 ? 'makes' : 'make'} this team on the kicking units or not at all.`]);
  }
  // ---------- special teams coordinator ----------
  else if (role === 'STC') {
    const elig = ro.filter(p => ST_OK.has(p.spot)), core = elig.slice().sort((a, b) => stCover(b) - stCover(a)), must = stMust(ro), ret = ro.filter(p => returnScore(p) > -1e8).sort((a, b) => returnScore(b) - returnScore(a));
    const ks = ro.filter(p => p.pos === 'K'), pn = ro.filter(p => p.pos === 'P'), coreBub = core.slice(0, 8).filter(p => cat(p, 'bubble', 'ps', 'long'));
    sec('The units', [`The men I build the coverage units around: ${briefList(core, 5)}.`, coreBub.length ? `${briefList(coreBub, 3)} ${coreBub.length === 1 ? 'is' : 'are'} on the bubble on offense or defense. If you cut one, I feel it on every kick.` : null]);
    sec(on ? 'Who is earning it' : 'Who has to earn it here', [must.length ? `These men make the team on special teams or they do not make it: ${briefList(must, 6)}.` : 'Nobody on the bubble is going to win a job on my units as it stands.',
      on && must.filter(p => wk(p) >= 62).length ? `Showing up in the kicking periods: ${briefList(must.filter(p => wk(p) >= 62), 3)}.` : null,
      must.filter(p => stCover(p) < 58).length ? `${briefList(must.filter(p => stCover(p) < 58).slice(-3), 3)} ${must.filter(p => stCover(p) < 58).length === 1 ? 'gives' : 'give'} me nothing. They need to win a job outright.` : null]);
    sec('Returners and specialists', [ret.length ? `Returning kicks: ${briefPL(ret[0])}${ret[1] ? `, with ${briefPL(ret[1])} behind him` : ''}.` : null,
      ks.length > 1 ? `Kicker is a competition: ${briefList(ks.sort((a, b) => read(b) - read(a)), 3)}.${on && ks[0] ? note(ks[0]) : ''}` : ks.length ? `${briefPL(ks[0])} is the kicker.${on ? note(ks[0]) : ''}` : 'We do not have a kicker in camp.',
      pn.length > 1 ? `Punter is a competition: ${briefList(pn.sort((a, b) => read(b) - read(a)), 3)}.` : pn.length ? `${briefPL(pn[0])} is the punter.${on ? note(pn[0]) : ''}` : 'We do not have a punter in camp.']);
  }
  // ---------- strength and conditioning ----------
  else if (role === 'SC') {
    const key = ro.filter(p => cat(p, 'lock', 'likely', 'bubble')), gas = key.filter(p => (p.h.stam || 60) <= 45).sort((a, b) => a.h.stam - b.h.stam), old = key.filter(p => p.age >= 31).sort((a, b) => b.age - a.age), ready = key.filter(p => (p.h.work || 55) >= 80), hurt = rosterOf(tid).filter(p => p.injury);
    sec(on ? 'How they are holding up' : 'Coming into camp', [ready.length ? `${briefList(ready, 4)} came back in the best shape on the team.` : null, gas.length ? `${briefList(gas, 4)} ${gas.length === 1 ? 'wears' : 'wear'} down. Watch the late periods and the second halves.` : 'Nobody worries me from a conditioning standpoint.',
      old.length ? `I want to manage the load on ${briefList(old, 3)}. They do not need every rep to be ready.` : null, hurt.length ? `Not practicing: ${briefList(hurt, 5)}.` : 'Everybody is on the field.']);
  }
  // ---------- position coaches ----------
  else {
    for (const pos of poss) { const l = order(pos); if (!l.length) continue; const n = LINEUP_NEED[pos] || 1, bs = roomBattles(pos);
      if (!on) {
        sec(poss.length > 1 ? ROOM_NAME[pos] : 'My room', [`${l.length} in the room and we keep about ${ROSTER_TEMPLATE[pos]}. My order today: ${briefList(l, Math.min(l.length, n + 2))}.`, `The men I am not worried about: ${briefList(l.filter(p => cat(p, 'lock')), 5) || 'nobody yet'}.`]);
        sec('The competitions', bs.map(b => `<b>${b.label}:</b> ` + battleBoard2(b).slice(0, 4).map(p => `${briefPL(p)} has to ${briefAsk(p)}`).join('; ') + '.'));
        const rk = l.filter(p => p.exp === 0); sec('The rookies', rk.slice(0, 4).map(p => `${briefPL(p)}${p.draft ? ` (round ${p.draft.round})` : ' (undrafted)'}: I want to see him ${briefAsk(p)}.`));
        const st = stMust(l); sec('Special teams', [st.length ? `${briefList(st, 4)} ${st.length === 1 ? 'needs' : 'need'} to show up on the kicking units to stay in this room.` : null]);
      } else {
        const g = l.filter(p => wk(p) !== undefined), best = g.slice().sort((a, b) => wk(b) - wk(a)).slice(0, 2).filter(p => wk(p) >= 64), worst = g.filter(p => cat(p, 'lock', 'likely', 'bubble')).sort((a, b) => wk(a) - wk(b)).slice(0, 2).filter(p => wk(p) <= 50 && !best.includes(p)), [up, dn] = movers(l);
        sec(poss.length > 1 ? ROOM_NAME[pos] : 'What I saw', [...best.map(p => `${briefPL(p)} stood out.${note(p)}`), ...worst.map(p => `${briefPL(p)} struggled.${note(p)}`), !best.length && !worst.length ? 'A steady week. Nobody separated.' : null]);
        sec('My board', [`Order now: ${briefList(l, Math.min(l.length, n + 2))}.`, up.length ? `Moving up: ${briefList(up, 3)}.` : null, dn.length ? `Moving down: ${briefList(dn, 3)}.` : null]);
        sec('The competitions', bs.map(b => { const r = battleBoard(b); return `<b>${b.label}:</b> ` + r.slice(0, 4).map(x => `${briefPL(x.p)} (${x.st[0].toLowerCase()})`).join(', ') + '.'; }));
        const slow = l.filter(p => (typeof pbOf === 'function' ? pbOf(p) : 96) < 55); sec('Still learning', [slow.length ? `${briefList(slow, 4)} ${slow.length === 1 ? 'is' : 'are'} still thinking instead of playing. That shows up on the practice tape.` : null]);
      }
    }
  }
  return { title, c, eye: POS_ROLES.includes(role) || role === 'STC' ? campEyeWord(c) : null, sections: S };
}
// how sharp a man is coming out of the summer: starters who did not play in August open the season a step slow
const SHARP_SNAPS = 16; // the usual build-up (a series, then a quarter) is enough
function setSharpness() { for (const p of Object.values(state.players)) { if (p.tid < 0 || !p.a || p.pos === 'K' || p.pos === 'P') { delete p.rust; continue; } const s = p.preS ? p.preS.snp || 0 : 0; if (s >= SHARP_SNAPS) delete p.rust; else p.rust = Math.round((1 - s / SHARP_SNAPS) * 100) / 100; } }
