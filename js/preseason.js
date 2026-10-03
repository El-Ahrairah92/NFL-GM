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
  for (const t of shuffle(state.teams.slice())) campSignings(t.id);
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
