'use strict';
// =====================================================================
//  PRESEASON & CUTDOWN DAY
//  Three exhibition games after the draft: starters sit, the bubble plays. Those snaps are real film
//  (grades, sharper scouting reads, positional reps) and real injury risk, but nothing counts in the standings.
//  Then Cutdown Day: the staff makes its case on every player and you get the final say on the 53.
// =====================================================================
const PRESEASON_GAMES = 3;
function startPreseason() {
  state.pre = { wk: 0, sched: [] };
  for (let w = 0; w < PRESEASON_GAMES; w++) {
    const ids = shuffle(state.teams.map(t => t.id)), wk = [];
    for (let i = 0; i < ids.length; i += 2) wk.push({ h: ids[i], a: ids[i + 1] });
    state.pre.sched.push(wk);
  }
  for (const id in state.players) delete state.players[id].preS;
  for (const t of shuffle(state.teams.slice())) if (isAI(t.id)) campSignings(t.id); // your camp roster is yours to build
}
// every team brings extra bodies to camp: undrafted rookies and street free agents on minimum, non-guaranteed deals
const CAMP_TARGET = { QB: 4, RB: 5, WR: 9, TE: 5, OL: 12, DL: 13, LB: 7, CB: 8, S: 5, K: 1, P: 1 }; // 70
function campSignings(tid) {
  const counts = {}; rosterOf(tid).forEach(p => counts[p.pos] = (counts[p.pos] || 0) + 1);
  const pool = Object.values(state.players).filter(p => p.tid === -1 && !p.injury && p.age <= 27 && p.exp <= 4 && p.ask <= MIN_SALARY * 1.3)
    .sort((a, b) => viewCeil(b, tid) - viewCeil(a, tid));
  let n = 0;
  for (const pos of POSITIONS) {
    while ((counts[pos] || 0) < CAMP_TARGET[pos] && rosterOf(tid).length < OFFSEASON_MAX) {
      let p = pool.find(x => x.tid === -1 && x.pos === pos);
      if (!p) { p = genVeteran(pos, 'fringe'); p.age = randInt(22, 24); p.exp = 0; }
      setTid(p, tid); p.contract = makeContract(p, MIN_SALARY, 1, 0); delete p.ask;
      counts[pos] = (counts[pos] || 0) + 1; n++;
    }
  }
  if (n && tid === state.userTid) addNews(`${T(tid).abbr} signed ${n} undrafted and street free agents to fill out the camp roster.`, [tid], 'sign');
}
// =====================================================================
//  POST-DRAFT FREE AGENCY
//  Three rounds of bidding for undrafted rookies. Every team (yours included) makes offers: a guaranteed signing
//  bonus on a minimum deal. The player picks his spot on money, his path to a roster place, and personal preference.
//  Nobody is signed for you: what you do not go and get, you do not have in camp.
// =====================================================================
const UDFA_ROUNDS = 3, UDFA_KEEP = 240;
const UDFA_BONUS = [0, 0.02, 0.05, 0.1, 0.2]; // $M guaranteed
function fmtBonus(b) { return b ? '$' + Math.round(b * 1000) + 'K' : 'no bonus'; }
function isUdfa(p) { return p.tid === -1 && p.udfa === state.season + 1; }
// the players nobody drafted: mostly camp bodies, with the occasional one every team missed on
function genUdfaClass(year, n) {
  for (let i = 0; i < n; i++) {
    const spot = weightedPick(Object.keys(DRAFT_SPOT_W), Object.values(DRAFT_SPOT_W));
    const p = genPlayer(spot, gauss(-1.25 + (DRAFT_Q_ADJ[spot] || 0), 1.05), randInt(21, 24));
    p.exp = 0; initPerception(p, 'prospect'); p.draftYear = year; p.udfa = year;
    // 32 teams passed on him seven times: nobody sees a starter here, whatever he really is
    const t = th(p); p.per.b = Math.min(p.per.b, t.rotation - 1 - rand() * 5); p.per.h = Math.min(p.per.h || 0, 0);
    p.per.g = Math.min(p.per.g, Math.max(1, t.mid - p.per.b - rand() * 4));
    setTid(p, -1); p.ask = MIN_SALARY; p.contract = { amt: MIN_SALARY, yrs: 0 };
  }
}
function startUdfa() {
  const year = state.season + 1, have = Object.values(state.players).filter(isUdfa).length;
  genUdfaClass(year, Math.max(0, UDFA_KEEP - have));
  state.udfa = { round: 0, offers: {}, ai: {}, log: [] };
  udfaAiOffers();
}
// how he sees a team: is there a job to win there?
function udfaPath(p, tid) {
  const room = rosterOf(tid).filter(x => x.pos === p.pos);
  const ahead = room.filter(x => perOvr(x) >= perOvr(p) - 1).length;
  return clamp((ROSTER_TEMPLATE[p.pos] - ahead) * 1.3, -5, 5) + clamp((CAMP_TARGET[p.pos] || 3) - room.length, -3, 4) * 0.5;
}
function udfaPathLabel(x) { return x >= 3 ? 'Clear path to a job' : x >= 0 ? 'Fair shot' : x >= -3 ? 'Crowded room' : 'Long odds'; }
function udfaAppeal(p, tid, bonus) { return Math.sqrt(bonus / 0.05) * 3 + udfaPath(p, tid) + hashGauss(p.id, 500 + tid, state.season) * 1.5; }
// how hot his market is: the best undrafted players draw real money
function udfaHeat(p) {
  const pool = Object.values(state.players).filter(isUdfa).map(x => perOvr(x) + x.per.g * 0.5).sort((a, b) => b - a);
  const v = perOvr(p) + p.per.g * 0.5, rank = pool.findIndex(x => x <= v);
  return pool.length ? 1 - (rank < 0 ? pool.length : rank) / pool.length : 0;
}
// every other front office lines up its targets for this round
function udfaAiOffers() {
  const u = state.udfa, share = [0.5, 0.65, 1][u.round] || 1;
  u.ai = {};
  const pool = Object.values(state.players).filter(isUdfa);
  const heat = {}; for (const p of pool) heat[p.id] = udfaHeat(p);
  for (const t of shuffle(state.teams.slice())) {
    if (!isAI(t.id)) continue;
    const counts = {}; rosterOf(t.id).forEach(p => counts[p.pos] = (counts[p.pos] || 0) + 1);
    const mine = pool.slice().sort((a, b) => viewCeil(b, t.id) - viewCeil(a, t.id));
    let room = OFFSEASON_MAX - rosterOf(t.id).length;
    for (const pos of POSITIONS) {
      const need = Math.ceil(Math.max(0, CAMP_TARGET[pos] - (counts[pos] || 0)) * share);
      // every staff has its own board: targets come from its top handful at the position, not a league-wide ranking
      const board = mine.filter(x => x.pos === pos).slice(0, need * 5 + 3), targets = [];
      while (targets.length < need && board.length) { const i = board.indexOf(weightedPick(board, board.map((_, k) => 1 / (k + 2)))); targets.push(board.splice(i, 1)[0]); }
      for (const p of targets) {
        if (room-- <= 0) break;
        const h = heat[p.id], bonus = h > 0.92 ? pick([0.1, 0.2, 0.2]) : h > 0.75 ? pick([0.05, 0.1]) : h > 0.5 ? pick([0, 0.02, 0.05]) : pick([0, 0, 0.02]);
        (u.ai[p.id] = u.ai[p.id] || []).push([t.id, bonus]);
      }
    }
  }
}
function udfaInterest(p) { const n = ((state.udfa && state.udfa.ai[p.id]) || []).length; return n >= 5 ? 'Bidding war' : n >= 3 ? 'Several teams' : n >= 1 ? 'A team or two' : 'Quiet'; }
function udfaOffer(pid, bonus) {
  const p = P(pid), u = state.udfa;
  if (!u || !p || !isUdfa(p)) return 'He is not available';
  if (bonus == null) { delete u.offers[pid]; return null; }
  const open = OFFSEASON_MAX - rosterOf(state.userTid).length - Object.keys(u.offers).filter(id => +id !== pid).length;
  if (open <= 0) return 'You have an offer out for every open roster spot';
  const committed = Object.entries(u.offers).filter(([id]) => +id !== pid).reduce((s, [, b]) => s + MIN_SALARY + b, 0);
  if (committed + MIN_SALARY + bonus > capRoom(state.userTid)) return 'Not enough cap room for that offer';
  u.offers[pid] = bonus;
  return null;
}
function udfaSign(p, tid, bonus) {
  setTid(p, tid);
  p.contract = { amt: MIN_SALARY, yrs: 3, gtd: round2(bonus) };
  delete p.ask;
}
// players choose. Returns what happened to your offers.
function resolveUdfaRound() {
  const u = state.udfa, me = state.userTid, out = [];
  const ids = new Set([...Object.keys(u.ai), ...Object.keys(u.offers)].map(Number));
  const order = [...ids].map(id => P(id)).filter(p => p && isUdfa(p)).sort((a, b) => udfaHeat(b) - udfaHeat(a)); // the best ones sign first
  for (const p of order) {
    const bids = (u.ai[p.id] || []).slice();
    if (u.offers[p.id] !== undefined && !isAI(me)) bids.push([me, u.offers[p.id]]);
    const live = bids.filter(([tid]) => rosterOf(tid).length < OFFSEASON_MAX && capRoom(tid) >= MIN_SALARY)
      .map(([tid, b]) => ({ tid, b, a: udfaAppeal(p, tid, b), path: udfaPath(p, tid) })).sort((x, y) => y.a - x.a);
    if (!live.length) { if (u.offers[p.id] !== undefined) out.push({ p, won: false, why: 'you had no roster spot or cap room left' }); continue; }
    const win = live[0], mine = live.find(x => x.tid === me);
    udfaSign(p, win.tid, win.b);
    if (mine) {
      if (win.tid === me) out.push({ p, won: true, rivals: live.length - 1, b: win.b });
      else out.push({ p, won: false, to: win.tid, b: win.b, why: win.b > mine.b && win.path <= mine.path + 1 ? `more guaranteed money (${fmtBonus(win.b)})` : win.path > mine.path + 1 ? 'a clearer path to a roster spot' : 'he simply liked the fit better' });
    }
    if (win.b >= 0.1 || win.tid === me) addNews(`${T(win.tid).abbr} signed undrafted ${p.lbl} ${pname(p)} (${fmtBonus(win.b)} guaranteed${live.length > 2 ? ', beat out ' + (live.length - 1) + ' teams' : ''}).`, [win.tid], 'sign');
  }
  u.offers = {}; u.round++;
  u.log.push(out);
  if (u.round >= UDFA_ROUNDS) finishUdfa(); else udfaAiOffers();
  return out;
}
function finishUdfa() {
  state.udfa = null;
  state.phase = 'PRESEASON';
  startPreseason();
  addNews('Rookie free agency is over. Camp rosters are set; anyone still unsigned is a free agent.');
}
// positions where a roster is short of what it needs to line up
function rosterShortfalls(tid) {
  const counts = {}; rosterOf(tid).filter(p => !onIR(p)).forEach(p => counts[p.pos] = (counts[p.pos] || 0) + 1);
  return POSITIONS.filter(pos => (counts[pos] || 0) < ROSTER_MIN[pos]).map(pos => `${pos} ${counts[pos] || 0}/${ROSTER_MIN[pos]}`);
}

// who dresses for an exhibition: everyone healthy except the established starters (enough bodies are kept at every group)
// After halftime (g given) the players who carried the first half sit too, so the third string gets its tape.
function preseasonActives(tid, g) {
  const dv = depthView(tid), sit = new Set();
  for (const e of [...dv.off, ...dv.nickel, ...dv.base]) if (e.p.a) sit.add(e.p.id);
  const ro = rosterOf(tid).filter(p => !p.injury);
  const played = g ? new Set(ro.filter(p => !sit.has(p.id) && g.ps[p.id] && g.ps[p.id].snp >= 12 && p.pos !== 'K' && p.pos !== 'P').map(p => p.id)) : new Set();
  const play = ro.filter(p => !sit.has(p.id) && !played.has(p.id));
  for (const pos of POSITIONS) {
    let n = play.filter(p => p.pos === pos).length;
    const need = (LINEUP_NEED[pos] || 1) + (pos === 'OL' || pos === 'DL' ? 1 : 0);
    // short on bodies: first-half players go back in before any starter does
    const bench = [...ro.filter(p => p.pos === pos && played.has(p.id)).sort((a, b) => a.ovr - b.ovr), ...ro.filter(p => p.pos === pos && sit.has(p.id)).sort((a, b) => a.ovr - b.ovr)];
    while (n < need && bench.length) { play.push(bench.shift()); n++; }
  }
  return new Set(play.map(p => p.id));
}
function simPreseasonWeek() {
  if (!state.pre) startPreseason();
  const n = state.pre.wk + 1, u = state.userTid;
  for (const m of state.pre.sched[state.pre.wk]) {
    const mine = m.h === u || m.a === u;
    const box = simGame(m.h, m.a, { pre: n, pbp: mine });
    box.pre = n; box.playoff = `Preseason ${n}`; // label only: exhibitions can end in a tie
    applyPreBox(box, mine);
    if (mine) state.games[box.id] = box;
  }
  injuryTick();
  state.pre.wk++;
  refreshPerception();
  if (state.pre.wk >= PRESEASON_GAMES) { state.phase = 'CUTDOWN'; state.cut = { plan: {} }; addNews('Preseason is over. Rosters must be down to 53 before Week 1.'); }
}
// exhibition snaps: film for the scouts, reps toward positional comfort, and a preseason line for every player
function applyPreBox(box, keep) {
  filmUpdate(box);
  for (const pid in box.stats) {
    const p = P(pid), l = box.stats[pid];
    if (!p || !l.snp) continue;
    const s = p.preS || (p.preS = { snp: 0, gp: 0, adv: {}, st: {} });
    s.snp += l.snp; s.gp++;
    if (box.adv && box.adv[pid]) addAdv(s.adv, box.adv[pid]);
    const st = Object.assign({}, l); delete st.sp; delete st.nm;
    addStats(s.st, st);
  }
  repsLearning(box);
  if (!keep) { delete box.adv; }
}
function preGrade(p) { return p.preS && p.preS.snp >= 15 ? overallGrade(p.preS.adv, p.spot) : null; }

// ---------- cutdown day ----------
function countsOn53(p) { return !(p.injury && p.injury.weeks >= IR_WEEKS); } // long-term injuries open on IR
// the staff's recommendation: who they'd release to reach 53, and who is on the bubble
function cutPreview(tid) {
  const ro = rosterOf(tid).filter(countsOn53);
  const counts = {}; ro.forEach(p => counts[p.pos] = (counts[p.pos] || 0) + 1);
  const sorted = ro.slice().sort((a, b) => cutValue(a) - cutValue(b));
  const cuts = new Set(); let n = ro.length;
  for (const p of sorted) { if (n <= ROSTER_MAX) break; if (counts[p.pos] > ROSTER_MIN[p.pos]) { cuts.add(p.id); counts[p.pos]--; n--; } }
  const bubble = new Set(sorted.filter(p => !cuts.has(p.id) && counts[p.pos] > ROSTER_MIN[p.pos]).slice(0, 7).map(p => p.id)); // the last men in (never a lone specialist)
  const lastOut = sorted.filter(p => cuts.has(p.id)).slice(-5).map(p => p.id); lastOut.forEach(id => bubble.add(id));
  return { cuts, bubble };
}
// what the position coach says about a player in the meeting
function cutNote(p, prev) {
  const g = preGrade(p), d = deadIfCut(p), dead = d.now + d.next, notes = [];
  if (!countsOn53(p)) return 'Heading to injured reserve: he does not count against the 53.';
  if (g !== null && g >= 78) notes.push(`Flashed this preseason (${g} grade).`);
  else if (g !== null && g <= 48) notes.push(`Struggled this preseason (${g} grade).`);
  else if (g === null && p.preS === undefined && p.exp <= 2) notes.push('Barely played this preseason.');
  if (p.exp === 0 && p.draft) notes.push(p.draft.round <= 3 ? `Round ${p.draft.round} pick: he is making this team.` : `Rookie (Rd ${p.draft.round}): we would like more time with him.`);
  if (dead > MIN_SALARY * 2 && prev.cuts.has(p.id)) notes.push(`Cutting him costs ${fmtMoney(dead)} in dead money.`);
  else if (dead > p.contract.amt * 0.9 && p.contract.amt > 3) notes.push('His money is guaranteed either way.');
  if (p.age >= 31 && !['Elite', 'All-Pro', 'Starter'].includes(tierOf(p))) notes.push('Veteran savvy, but the legs are going.');
  if (prev.cuts.has(p.id) && p.exp <= 2 && p.age <= 25) notes.push('Practice-squad candidate if he clears.');
  const up = upsideOf(p);
  if (p.age <= 24 && ['Elite', 'High-End Starter', 'Solid Starter'].includes(up) && !['Elite', 'All-Pro', 'Starter'].includes(tierOf(p))) notes.push('Raw, but the upside is real.');
  if (!notes.length) notes.push(prev.cuts.has(p.id) ? 'Odd man out in this room.' : prev.bubble.has(p.id) ? 'On the bubble: could go either way.' : 'Safe.');
  return notes.slice(0, 2).join(' ');
}
function applyCutPlan() {
  const plan = (state.cut && state.cut.plan) || {};
  for (const id in plan) { const p = P(+id); if (plan[id] === 'cut' && p && p.tid === state.userTid) releasePlayer(p.id); }
  state.cut = null;
}
