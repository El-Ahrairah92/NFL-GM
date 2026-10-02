'use strict';
// =====================================================================
//  Season end, awards, offseason phases, AI roster management
// =====================================================================
function isAI(tid) { return tid !== state.userTid || state.settings.autoUser; }

// ---------- season end ----------
function offScore(s, pos) {
  return (s.passY || 0) / 25 + (s.passTD || 0) * 4 - (s.passInt || 0) * 3 + (s.rushY || 0) / 10 + (s.rushTD || 0) * 6 + (s.recY || 0) / 10 + (s.recTD || 0) * 6 - (s.fum || 0) * 2;
}
function defScore(s) {
  return (s.tkl || 0) * 0.5 + (s.sck || 0) * 5 + (s.dint || 0) * 6 + (s.pd || 0) * 1.2 + (s.ff || 0) * 3 + (s.fr || 0) * 2 + (s.dtd || 0) * 6;
}
function computeAwards() {
  const recs = standings();
  const all = Object.values(state.players).filter(p => p.tid >= 0 && p.stats.gp >= 8);
  const winsOf = p => recs[p.tid] ? recs[p.tid].w : 0;
  const best = (arr, f) => arr.reduce((b, p) => (!b || f(p) > f(b) ? p : b), null);
  const mvp = best(all, p => offScore(p.stats) * (p.pos === 'QB' ? 1 : 0.8) + winsOf(p) * 9 + defScore(p.stats) * 0.6);
  const opoy = best(all.filter(p => p.pos !== 'QB' && p !== mvp), p => offScore(p.stats));
  const dpoy = best(all.filter(p => DEF_POS.includes(p.pos)), p => defScore(p.stats));
  const rookies = all.filter(p => p.exp === 0);
  const oroy = best(rookies.filter(p => OFF_POS.includes(p.pos)), p => offScore(p.stats));
  const droy = best(rookies.filter(p => DEF_POS.includes(p.pos)), p => defScore(p.stats));
  const out = {};
  for (const [k, p] of Object.entries({ mvp, opoy, dpoy, oroy, droy })) {
    if (!p) continue;
    out[k] = { pid: p.id, name: pname(p), pos: p.lbl, tid: p.tid, line: statSummary(p.stats, p.pos) };
    p.awards = p.awards || [];
    p.awards.push(state.season + ' ' + AWARD_NAMES[k]);
  }
  return out;
}
const AWARD_NAMES = { mvp: 'MVP', opoy: 'Offensive Player of the Year', dpoy: 'Defensive Player of the Year', oroy: 'Offensive Rookie of the Year', droy: 'Defensive Rookie of the Year' };

function statSummary(s, pos) {
  if (!s) return '';
  if (pos === 'QB') return `${s.passC || 0}/${s.passA || 0}, ${s.passY || 0} yds, ${s.passTD || 0} TD, ${s.passInt || 0} INT` + ((s.rushY || 0) > 200 ? `; ${s.rushY} rush yds, ${s.rushTD || 0} TD` : '');
  if (pos === 'RB') return `${s.rushA || 0} car, ${s.rushY || 0} yds, ${s.rushTD || 0} TD; ${s.rec || 0} rec, ${s.recY || 0} yds`;
  if (pos === 'WR' || pos === 'TE') return `${s.rec || 0} rec, ${s.recY || 0} yds, ${s.recTD || 0} TD`;
  if (pos === 'K') return `${s.fgm || 0}/${s.fga || 0} FG, ${s.xpm || 0}/${s.xpa || 0} XP`;
  if (pos === 'P') return `${s.pnt || 0} punts, ${s.pnt ? (s.pntY / s.pnt).toFixed(1) : 0} avg`;
  return `${s.tkl || 0} tkl, ${s.sck || 0} sck, ${s.dint || 0} INT, ${s.pd || 0} PD`;
}

function endSeason() {
  const po = state.playoffs, recs = standings();
  const awards = computeAwards();
  seasonMovers();
  seasonPerception(awards);
  const ru = po.rounds[3][0].win === po.rounds[3][0].h ? po.rounds[3][0].a : po.rounds[3][0].h;
  state.history.push({ season: state.season, champ: po.champ, runnerUp: ru, awards, userRec: recStr(recs[state.userTid]) });
  for (const k in awards) addNews(`${state.season} ${AWARD_NAMES[k]}: ${awards[k].name} (${T(awards[k].tid).abbr} ${awards[k].pos})`, [awards[k].tid], 'award');
  for (const t of state.teams) {
    const r = recs[t.id], e = po.elim[t.id];
    const result = e === undefined ? 'Missed playoffs' : e === 4 ? 'Won Championship' : 'Lost ' + ROUND_NAMES[e];
    const ta = t.advS || {};
    state.teamHist[t.id].push({ season: state.season, w: r.w, l: r.l, t: r.t, pf: r.pf, pa: r.pa, seed: e === undefined ? null : seedOf(t.id), result,
      offEpa: ta.plays ? round2(ta.epa / ta.plays) : null, defEpa: ta.dPlays ? round2(ta.dEpa / ta.dPlays) : null });
    t.advS = {};
    const hc = C(t.hc);
    if (hc) { hc.rec.w += r.w; hc.rec.l += r.l; hc.rec.t += r.t; if (e === 4) hc.rec.titles++; }
  }
  // archive season stats
  for (const id in state.players) {
    const p = state.players[id];
    if (p.stats.gp) p.career.push(Object.assign({ season: state.season, tid: p.tid }, p.stats, p.advS ? { adv: careerAdv(p.advS, p.spot) } : {}));
    if (p.pstats && p.pstats.gp) { p.pcareer = p.pcareer || []; p.pcareer.push(Object.assign({ season: state.season, tid: p.tid }, p.pstats)); }
    p.stats = {}; p.pstats = null; p.advS = null;
  }
  state.phase = 'RECAP';
}

// ---------- offseason start (leaving recap) ----------
function draftOrder(year) {
  const recs = standings(), po = state.playoffs;
  const order = state.teams.map(t => t.id).sort((a, b) => {
    const ea = po.elim[a] === undefined ? -1 : po.elim[a], eb = po.elim[b] === undefined ? -1 : po.elim[b];
    return ea - eb || pct(recs[a]) - pct(recs[b]) || (recs[a].pf - recs[a].pa) - (recs[b].pf - recs[b].pa) || rand() - 0.5;
  });
  const out = [];
  for (let r = 1; r <= DRAFT_ROUNDS; r++) order.forEach((tid, i) => {
    const pk = state.picks.find(x => x.season === year && x.round === r && x.orig === tid);
    out.push({ round: r, pick: (r - 1) * 32 + i + 1, inRound: i + 1, orig: tid, owner: pk ? pk.owner : tid, pickId: pk ? pk.id : null, pid: null });
  });
  return out;
}

function startOffseason() {
  const year = state.season + 1;
  growCap(); // new league year: cap, minimum salary and dead money roll over
  state.draft = { year, order: draftOrder(year), idx: 0 };
  // progression, retirement, healing, contracts
  const retired = [];
  for (const id in state.players) {
    const p = state.players[id];
    if (p.tid === -2) continue;
    offseasonExpectation(p);
    progressPlayer(p, teamDev(p.tid >= 0 ? p.tid : p.psTid != null ? p.psTid : -1)); // the real change stays hidden; camp reports and film reveal it
    offseasonApply(p);
    p.wear = 0;
    if (p.injury) { p.injury.weeks -= 20; if (p.injury.weeks <= 0) p.injury = null; else p.injury.fresh = false; }
    if (!p.injury) delete p.ir;
    if (shouldRetire(p)) { retired.push(p); continue; }
    if (p.tid >= 0) rolloverContract(p);
  }
  for (const p of retired) {
    if (perOvr(p) >= 80 || p.tid === state.userTid || (p.awards && p.awards.length))
      addNews(`${p.lbl} ${pname(p)}${p.tid >= 0 ? ' (' + T(p.tid).abbr + ')' : ''} retired after ${p.exp} seasons.`, p.tid >= 0 ? [p.tid] : [], 'retire');
    delete state.players[p.id]; rostersDirty();
  }
  psOffseason();
  for (let i = 0; i < 256; i++) genProspect(year);
  coachOffseason();
  state.phase = 'COACHES';
}
function resignAsk(p) { return round2(marketValue(p) * (0.95 + rand() * 0.2)); }

// ---------- coaches (see coaches.js) ----------
function leaveCoaches() {
  fillCoachVacancies();
  state.phase = 'RESIGN';
  for (const t of state.teams) if (isAI(t.id)) aiContractDecisions(t.id); // options, extensions, tags
}

// ---------- re-signing ----------
function needAt(tid, pos, excludeId) {
  const arr = rosterOf(tid).filter(p => p.pos === pos && p.id !== excludeId && !p.expiring).sort((a, b) => viewOvr(b, tid) - viewOvr(a, tid));
  const floor = arr[STARTERS[pos] - 1] ? viewOvr(arr[STARTERS[pos] - 1], tid) : 0;
  return { count: arr.length, floor, arr };
}
function aiWantsResign(p) {
  const v = viewOvr(p, p.tid);
  if (p.age >= 34 && v < 80) return false;
  const n = needAt(p.tid, p.pos, p.id);
  if (v >= 76) return true;
  if (v >= n.floor - 2 && v >= 62) return true;
  if (n.count < ROSTER_MIN[p.pos] && p.ask <= 3) return true;
  return rand() < 0.25 && p.ask <= 1.5;
}
function resignPlayer(pid, yrs) {
  const p = P(pid);
  if (!p || !p.expiring) return 'Not expiring';
  if (p.ask > capRoom(p.tid)) return 'Not enough cap room';
  p.contract = makeContract(p, p.ask, yrs || contractYears(p));
  p.expiring = false; delete p.ask;
  return null;
}
function leaveResign() {
  autoOptions(state.userTid); // undecided options get the staff's recommendation
  for (const t of state.teams) {
    const exp = rosterOf(t.id).filter(p => p.expiring).sort((a, b) => viewOvr(b, t.id) - viewOvr(a, t.id));
    for (const p of exp) {
      if (isAI(t.id) && aiWantsResign(p) && p.ask <= capRoom(t.id) - 4) {
        resignPlayer(p.id);
      } else {
        toFreeAgency(p);
        if (perOvr(p) >= 78 || t.id === state.userTid) addNews(`${p.lbl} ${pname(p)} (${tierOf(p, perOvr(p))}) hits free agency from ${t.abbr}.`, [t.id], 'fa');
      }
    }
  }
  state.phase = 'FA'; state.faWave = 0;
}
function toFreeAgency(p) {
  setTid(p, -1); p.expiring = false;
  p.ask = round2(marketValue(p) * (1 + rand() * 0.15));
  p.contract = { amt: p.ask, yrs: 0 };
}

// ---------- free agency ----------
function rosterLimit() { return state.phase === 'REG' || state.phase === 'PLAYOFFS' ? ROSTER_MAX : OFFSEASON_MAX; }
function rosterCount(tid) { return state.phase === 'REG' || state.phase === 'PLAYOFFS' ? activeCount(tid) : rosterOf(tid).length; }

function signFA(pid, tid, yrs) {
  const p = P(pid);
  if (!p || p.tid !== -1) return 'Player is not a free agent';
  if (rosterCount(tid) >= rosterLimit()) return 'Roster is full';
  if (p.ask > capRoom(tid)) return 'Not enough cap room';
  setTid(p, tid);
  p.contract = makeContract(p, p.ask, yrs || (state.phase === 'REG' ? 1 : contractYears(p)));
  delete p.ask;
  if (perOvr(p) >= 72 || tid === state.userTid) addNews(`${T(tid).abbr} signed ${p.lbl} ${pname(p)} (${tierOf(p, perOvr(p))}) — ${p.contract.yrs} yr, ${fmtMoney(p.contract.amt)}/yr.`, [tid], 'sign');
  return null;
}
function releasePlayer(pid) {
  const p = P(pid);
  if (!p || p.tid < 0) return;
  const t = T(p.tid);
  const d = deadIfCut(p);
  t.dead = round2((t.dead || 0) + d.now); t.deadNext = round2((t.deadNext || 0) + d.next);
  p.lastTid = t.id;
  addNews(`${t.abbr} released ${p.lbl} ${pname(p)}.`, [t.id], 'release');
  toFreeAgency(p);
  p.ask = round2(Math.max(MIN_SALARY, p.ask * 0.8));
}

function faGain(tid, p) {
  const n = needAt(tid, p.pos);
  const v = viewOvr(p, tid);
  let g = Math.max(0, v + schemeFit(p, tid) * 0.8 - n.floor) * 1.2;
  if (n.count < ROSTER_TEMPLATE[p.pos]) g += 3 + Math.max(0, v - 55) * 0.15;
  if (n.count < ROSTER_MIN[p.pos]) g += 6;
  if (n.count >= ROSTER_TEMPLATE[p.pos] + 1) g *= 0.3;
  if (p.age >= 32) g *= 0.75;
  return g * SPOTS[p.spot].val;
}
function aiFreeAgencyWave(maxSigns) {
  const fas = () => Object.values(state.players).filter(p => p.tid === -1).sort((a, b) => perOvr(b) - perOvr(a));
  const order = shuffle(state.teams.filter(t => isAI(t.id)).map(t => t.id));
  for (let k = 0; k < maxSigns; k++) {
    const pool = fas();
    for (const tid of order) {
      const reserve = state.phase === 'DRAFT' || state.phase === 'FA' ? 8 : 1;
      const room = capRoom(tid) - reserve;
      // teams sitting on a pile of cap space are motivated buyers
      let bestP = null, best = capRoom(tid) > state.cap * 0.2 ? 0.5 : 2;
      for (const p of pool) {
        if (p.tid !== -1 || p.ask > room) continue;
        const s = faGain(tid, p) - p.ask * 0.15;
        if (s > best) { best = s; bestP = p; }
      }
      if (bestP && rosterCount(tid) < rosterLimit()) signFA(bestP.id, tid);
    }
  }
  // unsigned players lower their demands
  for (const p of fas()) p.ask = round2(Math.max(MIN_SALARY, p.ask * 0.85));
}
function advanceFA() {
  aiFreeAgencyWave(state.faWave === 0 ? 4 : 3);
  state.faWave++;
  if (state.faWave >= FA_WAVES) { state.phase = 'DRAFT'; addNews(`The ${state.draft.year} draft is on the clock.`); }
}

// ---------- draft ----------
function prospects() { return Object.values(state.players).filter(p => p.tid === -2); }
function currentPick() { return state.draft && state.draft.order[state.draft.idx]; }
function draftPlayer(pid) {
  const d = state.draft, pk = d.order[d.idx], p = P(pid);
  if (!pk || !p || p.tid !== -2) return;
  setTid(p, pk.owner);
  p.contract = rookieContract(pk.pick, pk.round);
  p.draft = { year: d.year, round: pk.round, pick: pk.pick, tid: pk.owner };
  pk.pid = p.id;
  if (pk.round === 1 || pk.owner === state.userTid)
    addNews(`Rd ${pk.round} Pick ${pk.inRound}: ${T(pk.owner).abbr} select ${p.lbl} ${pname(p)} (${p.college}).`, [pk.owner], 'draft');
  d.idx++;
  if (d.idx >= d.order.length) finishDraft();
}
function aiDraftChoice(tid) {
  let best = null, bs = -1e9;
  for (const p of prospects()) {
    const n = needAt(tid, p.pos);
    const v = viewOvr(p, tid);
    let s = v + 0.55 * viewGrowth(p, tid) + schemeFit(p, tid) * 0.5 + ({ QB: 3, K: -10, P: -12, RB: -2 }[p.pos] || 0);
    if (n.count < ROSTER_MIN[p.pos]) s += 4;
    if (v > n.floor) s += 2;
    if (n.count >= ROSTER_TEMPLATE[p.pos] + 1) s -= 5;
    s += gauss(0, 1.5);
    if (s > bs) { bs = s; best = p; }
  }
  return best;
}
function simDraftPick() {
  const pk = currentPick();
  if (!pk) return;
  const choice = aiDraftChoice(pk.owner);
  if (choice) draftPlayer(choice.id);
}
function simDraftToUser() {
  while (state.phase === 'DRAFT') {
    const pk = currentPick();
    if (!pk) break;
    if (pk.owner === state.userTid && !state.settings.autoUser) break;
    simDraftPick();
  }
}
function finishDraft() {
  const left = prospects().sort((a, b) => perOvr(b) + b.per.g * 0.5 - perOvr(a) - a.per.g * 0.5);
  left.forEach((p, i) => {
    if (i < 90) { setTid(p, -1); p.ask = MIN_SALARY; p.contract = { amt: MIN_SALARY, yrs: 0 }; }
    else delete state.players[p.id]; rostersDirty();
  });
  state.picks = state.picks.filter(pk => pk.season !== state.draft.year);
  state.phase = 'PRESEASON';
  addNews(`The ${state.draft.year} draft is complete. Undrafted rookies are now free agents.`);
  campReports(state.draft.year);
}

// ---------- roster maintenance ----------
// what cutting him saves this year (guaranteed money is sunk either way)
function cutSavings(p) { const d = deadIfCut(p); return p.contract.yrs > 0 ? p.contract.amt - d.now - d.next * 0.5 : 0; }
function cutValue(p) { return playerValue(p, p.tid) - (cutSavings(p) - MIN_SALARY) * 0.4 + (p.draft && p.exp <= 1 ? 3 : 0); }
function autoCut(tid, limit, activeOnly) {
  const cuts = [];
  while (true) {
    const ro = rosterOf(tid).filter(p => !activeOnly || !onIR(p));
    if (ro.length <= limit) break;
    // don't cut below minimum at a position
    const counts = {};
    ro.forEach(p => counts[p.pos] = (counts[p.pos] || 0) + 1);
    const cand = ro.filter(p => counts[p.pos] > ROSTER_MIN[p.pos]).sort((a, b) => cutValue(a) - cutValue(b))[0];
    if (!cand) break;
    releasePlayer(cand.id); cuts.push(cand);
  }
  return cuts;
}
function fillRoster(tid, template) {
  const target = template || ROSTER_MIN;
  for (const pos of POSITIONS) {
    let n = rosterOf(tid).filter(p => p.pos === pos && !onIR(p)).length;
    while (n < target[pos] && activeCount(tid) < ROSTER_MAX) {
      const fa = Object.values(state.players).filter(p => p.tid === -1 && p.pos === pos).sort((a, b) => viewOvr(b, tid) - viewOvr(a, tid));
      const p = fa.find(x => x.ask <= capRoom(tid)) || fa.find(x => x.ask <= 3);
      if (!p) { const np = genVeteran(pos, 'fringe'); setTid(np, -1); np.ask = MIN_SALARY; continue; }
      p.ask = Math.min(p.ask, Math.max(MIN_SALARY, capRoom(tid)));
      setTid(p, tid); p.contract = makeContract(p, p.ask, 1, 0.1); delete p.ask;
      if (tid === state.userTid) addNews(`${T(tid).abbr} signed ${p.lbl} ${pname(p)} to fill out the roster.`, [tid], 'sign');
      n++;
    }
  }
}
function fixCap(tid) {
  // first, restructure big deals (this year's salary becomes bonus that hits next year's cap)
  for (const p of rosterOf(tid).filter(p => p.contract.yrs >= 2 && p.contract.amt > MIN_SALARY * 6).sort((a, b) => b.contract.amt - a.contract.amt)) {
    if (capRoom(tid) >= 0) break;
    restructure(p, Math.min(-capRoom(tid) + 1, p.contract.amt * 0.4));
  }
  // then cut the worst value per dollar saved
  let guard = 0;
  while (capRoom(tid) < 0 && guard++ < 20) {
    const cand = rosterOf(tid).filter(p => cutSavings(p) > 1).sort((a, b) => (playerValue(a, tid) / cutSavings(a)) - (playerValue(b, tid) / cutSavings(b)))[0];
    if (!cand) break;
    releasePlayer(cand.id);
  }
}

function startNewSeason() {
  // anyone still hurt opens the season on IR (decided before cutdown so the 53 is real)
  for (const p of Object.values(state.players)) { if (p.tid >= 0 && p.injury && p.injury.weeks >= IR_WEEKS) p.ir = { wk: 1 }; else delete p.ir; }
  for (const t of state.teams) {
    if (isAI(t.id)) { fixCap(t.id); autoCut(t.id, ROSTER_MAX, true); }
    else {
      const cuts = autoCut(t.id, ROSTER_MAX, true);
      if (cuts.length) addNews(`Cutdown day: ${cuts.length} player(s) auto-released to reach ${ROSTER_MAX}.`, [t.id]);
    }
    fillRoster(t.id, ROSTER_TEMPLATE); // open spots get minimum-salary camp bodies (yours too)
  }
  // practice squads (yours too — edit it any time from the roster page)
  for (const t of shuffle(state.teams.slice())) fillPS(t.id);
  for (const t of state.teams) fixCap(t.id); // everyone opens the season cap-compliant
  if (psOf(state.userTid).length) addNews(`${T(state.userTid).abbr} practice squad set (${psOf(state.userTid).length}/${PS_MAX}).`, [state.userTid]);

  // trim free agent pool
  const fas = Object.values(state.players).filter(p => p.tid === -1).sort((a, b) => perOvr(b) - perOvr(a));
  fas.forEach((p, i) => { if (i >= 160 || perOvr(p) < 45 || p.age >= 36) delete state.players[p.id]; rostersDirty(); });
  state.season++;
  state.week = 1; state.phase = 'REG';
  updateSystems();
  state.games = {}; state.playoffs = null; state.draft = null;
  for (const p of Object.values(state.players)) { p.stats = {}; }
  ensurePicks();
  state.schedule = genSchedule();
  refreshPerception();
  seasonStartSnapshot();
  addNews(`The ${state.season} regular season is underway.`);
}

// ---------- in-season AI ----------
function inSeasonMoves() {
  psPoaching();
  psPromotions(state.userTid);
  for (const t of state.teams) {
    if (!isAI(t.id)) continue;
    psPromotions(t.id);
    if (psOf(t.id).length < PS_MAX - 3) fillPS(t.id);
    for (const pos of POSITIONS) {
      const healthy = rosterOf(t.id).filter(p => p.pos === pos && !p.injury).length;
      const need = LINEUP_NEED[pos] + (pos === 'QB' ? 1 : 0);
      if (healthy >= need) continue;
      if (activeCount(t.id) >= ROSTER_MAX) {
        const counts = {};
        rosterOf(t.id).forEach(p => { if (!p.injury) counts[p.pos] = (counts[p.pos] || 0) + 1; });
        const cut = rosterOf(t.id).filter(p => !onIR(p) && p.pos !== pos && (counts[p.pos] || 0) > LINEUP_NEED[p.pos] + 1).sort((a, b) => cutValue(a) - cutValue(b))[0];
        if (!cut) continue;
        releasePlayer(cut.id);
      }
      const fa = Object.values(state.players).filter(p => p.tid === -1 && p.pos === pos && !p.injury).sort((a, b) => viewOvr(b, t.id) - viewOvr(a, t.id));
      const p = fa.find(x => x.ask <= capRoom(t.id));
      if (p) signFA(p.id, t.id, 1);
    }
  }
  if (state.week <= TRADE_DEADLINE && rand() < 0.35) aiTrade();
}
