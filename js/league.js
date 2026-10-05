'use strict';
// =====================================================================
//  League creation, schedule, weekly sim, standings, playoffs
// =====================================================================
const PHASE_LABEL = {
  REG: 'Regular Season', PLAYOFFS: 'Playoffs', RECAP: 'Season Recap', COACHES: 'Coaching Carousel',
  RESIGN: 'Re-sign Players', FA: 'Free Agency', DRAFT: 'Draft', UDFA: 'Rookie Free Agency', PRESEASON: 'Preseason', CUTDOWN: 'Cutdown Day', WAIVERS: 'Waiver Claims',
};
const ROUND_NAMES = ['Wild Card', 'Divisional', 'Conference Final', 'Championship'];

function newLeague(userTid) {
  state = {
    version: SAVE_VERSION, devV: 1, cp: 0, retired: {}, season: START_SEASON, phase: 'REG', week: 1, userTid,
    teams: [], players: {}, coaches: {}, schedule: [], games: {}, playoffs: null,
    picks: [], draft: null, news: [], history: [], teamHist: {}, faWave: 0,
    nextPid: 1, nextCid: 1, nextGid: 1, nextPickId: 1, settings: { autoUser: false, showTrue: false },
  };
  state.cap = BASE_CAP; syncEconomy();
  TEAMS.forEach((t, i) => {
    state.teams.push({ id: i, region: t[0], name: t[1], abbr: t[2], conf: t[3], div: t[4], color: t[5], hc: null, oc: null, dc: null, stc: null, sc: null, dead: 0 });
    state.teamHist[i] = [];
  });
  for (const t of state.teams) {
    for (const [spot, n, st] of ROSTER_BUILD) {
      for (let i = 0; i < n; i++) {
        const p = genVeteran(spot, i < st ? 'starter' : i < st + 1 ? 'backup' : 'fringe');
        setTid(p, t.id);
      }
    }
    // fit under the cap
    let pay = payroll(t.id), target = CAP * (0.86 + rand() * 0.1);
    if (pay > target) for (const p of rosterOf(t.id)) p.contract.amt = round2(Math.max(MIN_SALARY, p.contract.amt * target / pay));
    genStaff(t);
  }
  fillCoachPool(9);
  updateSystems();
  for (const t of state.teams) { t.sys.O.yrs = 1; t.sys.D.yrs = 1; } // existing staffs: systems already installed
  for (let i = 0; i < 70; i++) {
    const pos = weightedPick(POSITIONS, POSITIONS.map(p => ROSTER_TEMPLATE[p]));
    const p = genVeteran(pos, rand() < 0.25 ? 'backup' : 'fringe');
    setTid(p, -1); p.ask = marketValue(p);
  }
  ensurePicks();
  state.schedule = genSchedule();
  state.ratingsVer = typeof DERIVED !== 'undefined' ? DERIVED.version : 0;
  ensureDraftClass(START_SEASON + 1);
  computeThresholds(); seasonStartSnapshot();
  for (const t of shuffle(state.teams.slice())) fillPS(t.id); // every club starts with a practice squad in place, yours included
  for (const p of Object.values(state.players)) if (p.tid >= 0 || p.tid === -3) { const tid = p.tid >= 0 ? p.tid : p.psTid; p.pbTid = tid; p.pb = p.exp === 0 ? 82 : 96 + Math.round(rand() * 4); if (tid === userTid) p.seenW = p.exp === 0 ? 4 : 16; }
  ensureCoachContracts(); seedWeb(); snapPlaybooks();
  practiceWeekAll();
  addNews(`Welcome to the ${START_SEASON} season. You are the GM of the ${teamName(userTid)}.`, [userTid]);
  return state;
}

const SAVE_VERSION = 3;
// bring older saves up to date
function migrateState(st) {
  state = st;
  if (!st.prePlan) st.prePlan = { starters: 'auto', feat: {}, hold: {} }; // saves from before the preseason plan
  if (!st.devV) { // saves from before earned growth: everyone gets his own decline, and the young have more on offer than they will keep
    st.devV = 1; st.cp = st.cp || 0; st.retired = st.retired || {};
    for (const id in st.players) { const p = st.players[id]; if (!p.a || !p.grow || !p.h) continue; if (!p.dc) genDecline(p); for (const g of AGE_GROUPS) if (p.grow[g] > 0) p.grow[g] = round1(p.grow[g] * (g === 'E' || g === 'P' ? DEV.roomP : DEV.room)); updateRatings(p); }
  }
  st._needWeb = st.teams.some(t => t.staffBud === undefined);
  if (st.teams.some(t => !t.asst) && st.coaches && Object.keys(st.coaches).length) { for (const t of st.teams) ensureAssistants(t, true); fillAsstPool(3); for (const c of Object.values(st.coaches)) updateCoachOvr(c); addNews('League updated: every staff now has specialists and position coaches. Player development has moved from the coordinators to the position coaches.'); }
  for (const id in st.players) { const p = st.players[id]; if (p.h && p.h.work === undefined) { ensureCharacter(p); if (p.tid >= 0) { p.pbTid = p.tid; p.pb = p.exp === 0 ? 80 : 96; p.seenW = p.tid === st.userTid ? 16 : 0; } } }
  if (st.version === 2) {
    // v3: five-coach staffs with knobs & tendencies — regenerate all coaches
    st.coaches = {}; st.nextCid = 1;
    for (const t of st.teams) { t.hc = t.oc = t.dc = null; t.stc = null; t.sc = null; genStaff(t); }
    fillCoachPool(9);
    updateSystems();
    for (const t of st.teams) { t.sys.O.yrs = 1; t.sys.D.yrs = 1; }
    addNews('League updated: every team now has a five-coach staff (HC, OC, DC, ST, S&C).');
    st.version = 3;
  }
  // calibrated position weights changed: recompute every player's ratings
  const rv = typeof DERIVED !== 'undefined' ? DERIVED.version : 0;
  if (st.version === SAVE_VERSION && st.ratingsVer !== rv) { for (const id in st.players) if (st.players[id].a) updateRatings(st.players[id]); st.ratingsVer = rv; }
  // Phase 6: cap growth, guarantees, practice squads, IR stays
  if (st.version === SAVE_VERSION && !st.cap) {
    st.cap = BASE_CAP; syncEconomy();
    for (const id in st.players) {
      const p = st.players[id];
      if (p.contract && p.contract.gtd === undefined) p.contract.gtd = p.tid >= 0 && p.contract.yrs > 0 ? round2(p.contract.amt * p.contract.yrs * 0.3 * rand()) : 0;
      if (p.tid >= 0 && p.injury && p.injury.weeks >= IR_WEEKS) p.ir = { wk: Math.max(1, (st.week || 1) - 1) };
    }
    ensurePerception();
    for (const t of st.teams) fillPS(t.id);
  }
  syncEconomy();
  if (st._needWeb) { ensureCoachContracts(); seedWeb(); } delete st._needWeb;
  if (st.phase === 'COACHES' && !st.car) startCarousel();
  if (st.teams.some(t => !t.pkSnap)) snapPlaybooks();
  if (st.version === SAVE_VERSION && (st.phase === 'REG' || st.phase === 'PLAYOFFS' || st.phase === 'RECAP')) ensureDraftClass(st.season + 1);
  // positional comfort & adaptability for saves that predate them
  if (st.version === SAVE_VERSION) for (const id in st.players) { const p = st.players[id]; if (!p.a) continue; if (p.h && p.h.adapt === undefined) p.h.adapt = Math.round(clamp(gauss(55, 18), 5, 99)); if (!p.cf) { genComfort(p); updateRatings(p); } }
  // Phase 5: perception (fog, hype, labels) for saves that predate it
  if (st.version === SAVE_VERSION) {
    st.settings.showTrue = !!st.settings.showTrue;
    for (const id in st.players) { delete st.players[id].scout; delete st.players[id].aiGrade; }
    ensurePerception(); computeThresholds();
  }
  return st.version === SAVE_VERSION;
}

function teamName(tid) { const t = T(tid); return t.region + ' ' + t.name; }
function payroll(tid) {
  let s = T(tid).dead || 0;
  for (const p of rosterOf(tid)) if (p.contract.yrs > 0) s += p.contract.amt;
  for (const p of psOf(tid)) s += p.contract.amt;
  return round2(s);
}
function capRoom(tid) { return round2(CAP - payroll(tid)); }

function ensurePicks() {
  for (const yr of [state.season + 1, state.season + 2]) {
    if (state.picks.some(pk => pk.season === yr)) continue;
    for (let r = 1; r <= DRAFT_ROUNDS; r++)
      for (const t of state.teams) state.picks.push({ id: state.nextPickId++, season: yr, round: r, orig: t.id, owner: t.id });
  }
}
function pickLabel(pk) {
  const own = pk.orig === pk.owner ? '' : ` (${T(pk.orig).abbr})`;
  return `${pk.season} Rd ${pk.round}${own}`;
}

function addNews(text, tids = [], type = '') {
  const when = state.phase === 'REG' ? 'Wk ' + Math.min(state.week, SEASON_WEEKS) : PHASE_LABEL[state.phase];
  state.news.unshift({ s: state.season, when, text, tids, type });
  if (state.news.length > 400) state.news.length = 400;
}

// ---------- schedule ----------
function genSchedule() {
  const divs = {};
  for (const t of state.teams) (divs[t.conf + t.div] = divs[t.conf + t.div] || []).push(t.id);
  const divOf = state.teams.map(t => t.conf + t.div);
  const weeks = [];
  const homeCt = new Array(32).fill(0);
  const rounds = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
  for (let rep = 0; rep < 2; rep++) for (const r of rounds) {
    const wk = [];
    for (const k in divs) for (const [i, j] of r) {
      const [h, a] = rep ? [divs[k][j], divs[k][i]] : [divs[k][i], divs[k][j]];
      wk.push({ h, a }); homeCt[h]++;
    }
    weeks.push(wk);
  }
  const met = new Set();
  const key = (a, b) => a < b ? a + '-' + b : b + '-' + a;
  for (let k = 0; k < SEASON_WEEKS - 6; k++) {
    const pairs = matchAll(divOf, met, key);
    const wk = [];
    for (const [x, y] of pairs) {
      met.add(key(x, y));
      const [h, a] = homeCt[x] < homeCt[y] || (homeCt[x] === homeCt[y] && rand() < 0.5) ? [x, y] : [y, x];
      homeCt[h]++; wk.push({ h, a });
    }
    weeks.push(wk);
  }
  shuffle(weeks);
  return weeks.map(wk => shuffle(wk).map(m => ({ h: m.h, a: m.a, gid: null, score: null })));
}
function matchAll(divOf, met, key) {
  const ids = shuffle([...Array(32).keys()]);
  const used = new Set(), pairs = [];
  function bt() {
    const x = ids.find(i => !used.has(i));
    if (x === undefined) return true;
    used.add(x);
    const cands = shuffle(ids.filter(j => !used.has(j) && divOf[j] !== divOf[x] && !met.has(key(x, j))));
    for (const y of cands) {
      used.add(y); pairs.push([x, y]);
      if (bt()) return true;
      used.delete(y); pairs.pop();
    }
    used.delete(x);
    return false;
  }
  if (!bt()) throw new Error('schedule failed');
  return pairs;
}

// ---------- standings ----------
function standings() {
  const recs = state.teams.map(t => ({ tid: t.id, w: 0, l: 0, t: 0, pf: 0, pa: 0, dw: 0, dl: 0, dt: 0, cw: 0, cl: 0, ct: 0, streak: '' , last: [] }));
  for (const wk of state.schedule) for (const m of wk) {
    if (!m.score) continue;
    const [hs, as] = m.score, H = recs[m.h], A = recs[m.a];
    H.pf += hs; H.pa += as; A.pf += as; A.pa += hs;
    const sameDiv = T(m.h).conf === T(m.a).conf && T(m.h).div === T(m.a).div;
    const sameConf = T(m.h).conf === T(m.a).conf;
    const res = hs > as ? ['w', 'l'] : hs < as ? ['l', 'w'] : ['t', 't'];
    [[H, res[0]], [A, res[1]]].forEach(([R, r]) => {
      R[r]++; R.last.push(r.toUpperCase());
      if (sameDiv) R['d' + r]++;
      if (sameConf) R['c' + r]++;
    });
  }
  for (const r of recs) {
    let n = 0; const lst = r.last;
    for (let i = lst.length - 1; i >= 0 && lst[i] === lst[lst.length - 1]; i--) n++;
    r.streak = lst.length ? lst[lst.length - 1] + n : '';
  }
  return recs;
}
function teamRecord(tid) { return standings()[tid]; }
function pct(r) { const g = r.w + r.l + r.t; return g ? (r.w + 0.5 * r.t) / g : 0; }
function recStr(r) { return r.w + '-' + r.l + (r.t ? '-' + r.t : ''); }
function cmpRec(a, b) {
  return pct(b) - pct(a) || pct({ w: b.dw, l: b.dl, t: b.dt }) - pct({ w: a.dw, l: a.dl, t: a.dt }) ||
    pct({ w: b.cw, l: b.cl, t: b.ct }) - pct({ w: a.cw, l: a.cl, t: a.ct }) || (b.pf - b.pa) - (a.pf - a.pa) || b.pf - a.pf;
}
function divisionStandings() {
  const recs = standings(), out = {};
  for (const t of state.teams) (out[t.conf + ' ' + t.div] = out[t.conf + ' ' + t.div] || []).push(recs[t.id]);
  for (const k in out) out[k].sort(cmpRec);
  return out;
}
function confSeeds(conf) {
  const divs = divisionStandings();
  const winners = [], rest = [];
  for (const k in divs) if (k.startsWith(conf)) { winners.push(divs[k][0]); rest.push(...divs[k].slice(1)); }
  winners.sort(cmpRec); rest.sort(cmpRec);
  return [...winners, ...rest].map(r => r.tid); // index 0..6 are playoff seeds 1..7
}

// ---------- weekly sim ----------
function simWeek() {
  if (state.phase !== 'REG') return;
  refreshChart(state.userTid); // auto units follow the staff; departed players drop off
  const wk = state.schedule[state.week - 1];
  for (const m of wk) {
    const box = simGame(m.h, m.a, { week: state.week, pbp: m.h === state.userTid || m.a === state.userTid });
    m.gid = box.id; m.score = [box.score[0], box.score[1]];
    state.games[box.id] = box;
    applyBox(box, false);
  }
  irPlacements();
  injuryTick();
  irActivations();
  weeklyRecovery();
  practiceReps(state.userTid);
  inSeasonMoves();
  { const i = CP_WEEKS.indexOf(state.week); if (i >= 0) devCheckpoint(state.week >= SEASON_WEEKS ? 'final' : 'season', state.week - (i ? CP_WEEKS[i - 1] : 0)); } // growth earned over the last month
  state.week++;
  practiceWeekAll(); // the week of work leading into the next game
  refreshPerception();
  if (state.week > SEASON_WEEKS) startPlayoffs();
}

function applyBox(box, playoff) {
  filmUpdate(box); // every snap on tape sharpens the league's read on who played
  repsLearning(box); // game reps at a spot build positional comfort
  recordForm(box); // rolling game grades feed the star rating
  // advanced charting: season totals for players and teams (regular season); full detail kept for your games and the playoffs
  if (box.adv) {
    if (!playoff) {
      for (const pid in box.adv) { const p = P(pid); if (!p) continue; p.advS = p.advS || {}; addAdv(p.advS, box.adv[pid]); }
      box.tids.forEach((tid, s) => { const t = T(tid); t.advS = t.advS || {}; addAdv(t.advS, box.tadv[s]); });
    }
    if (!playoff && !box.tids.includes(state.userTid)) delete box.adv;
  }
  for (const pid in box.stats) {
    const p = P(pid);
    if (!p) continue;
    if (playoff) { p.pstats = p.pstats || {}; addStats(p.pstats, box.stats[pid]); }
    else addStats(p.stats, box.stats[pid]);
    if (p.tid >= 0) addWear(p, box.stats[pid], p.tid);
  }
  for (const inj of box.injuries) {
    const p = P(inj.pid);
    if (!p) continue;
    if (inj.tid === state.userTid || (perOvr(p) >= 78 && inj.weeks >= 3)) {
      const len = inj.weeks >= 17 ? 'out for the season' : `out ${inj.weeks} week${inj.weeks > 1 ? 's' : ''}`;
      addNews(`${T(inj.tid).abbr} ${p.lbl} ${pname(p)} suffered a ${inj.name.toLowerCase()} — ${len}.`, [inj.tid], 'inj');
    }
  }
}

function injuryTick() {
  for (const id in state.players) {
    const p = state.players[id];
    if (!p.injury) continue;
    if (p.injury.fresh) { p.injury.fresh = false; continue; }
    p.injury.weeks--;
    if (p.injury.weeks <= 0) p.injury = null;
  }
}

function simToEndOfRegular() { while (state.phase === 'REG') simWeek(); }

// ---------- playoffs ----------
function startPlayoffs() {
  state.phase = 'PLAYOFFS';
  const seeds = { AFC: confSeeds('AFC').slice(0, 7), NFC: confSeeds('NFC').slice(0, 7) };
  state.playoffs = { seeds, round: 0, rounds: [], elim: {}, champ: null };
  for (const c of ['AFC', 'NFC']) seeds[c].forEach((tid, i) => { if (i < 7) addNews(`${teamName(tid)} clinch the ${c} #${i + 1} seed.`, [tid]); });
}
function seedOf(tid) {
  const s = state.playoffs.seeds;
  for (const c of ['AFC', 'NFC']) { const i = s[c].indexOf(tid); if (i >= 0) return i + 1; }
  return 99;
}
function playoffMatchups() {
  const po = state.playoffs, r = po.round, matchups = [];
  if (r < 3) {
    for (const c of ['AFC', 'NFC']) {
      let alive = po.seeds[c].filter(t => po.elim[t] === undefined);
      alive.sort((a, b) => seedOf(a) - seedOf(b));
      if (r === 0) { alive = alive.slice(1); matchups.push([alive[0], alive[5]], [alive[1], alive[4]], [alive[2], alive[3]]); }
      else if (r === 1) matchups.push([alive[0], alive[3]], [alive[1], alive[2]]);
      else matchups.push([alive[0], alive[1]]);
    }
  } else {
    const a = po.seeds.AFC.find(t => po.elim[t] === undefined), n = po.seeds.NFC.find(t => po.elim[t] === undefined);
    matchups.push(seedOf(a) <= seedOf(n) ? [a, n] : [n, a]);
  }
  return matchups;
}
function simPlayoffRound() {
  const po = state.playoffs;
  const r = po.round;
  const matchups = playoffMatchups();
  const results = [];
  for (const [h, a] of matchups) {
    const box = simGame(h, a, { playoff: ROUND_NAMES[r], neutral: r === 3, pbp: true });
    state.games[box.id] = box;
    applyBox(box, true);
    let win = box.score[0] > box.score[1] ? h : box.score[1] > box.score[0] ? a : h;
    const lose = win === h ? a : h;
    po.elim[lose] = r;
    results.push({ h, a, gid: box.id, score: box.score, win });
    addNews(`${ROUND_NAMES[r]}: ${T(win).abbr} ${Math.max(...box.score)}, ${T(lose).abbr} ${Math.min(...box.score)}`, [win, lose]);
  }
  injuryTick();
  po.rounds.push(results);
  po.round++;
  if (po.round === 4) {
    po.champ = results[0].win;
    po.elim[po.champ] = 4;
    addNews(`🏆 The ${teamName(po.champ)} are ${state.season} champions!`, [po.champ]);
    endSeason();
  }
}

// ---------- positional comfort from game reps ----------
function repsLearning(box) {
  for (const pid in box.stats) {
    const l = box.stats[pid], p = P(pid);
    if (!l.sp) continue;
    if (p && p.a) {
      let changed = false;
      const L = learnRate(p);
      p.spSeason = p.spSeason || {};
      for (const s in l.sp) {
        p.spSeason[s] = (p.spSeason[s] || 0) + l.sp[s];
        if (comfortOf(p, s) < 100 && learnSpot(p, s, l.sp[s] * 0.015 * L)) changed = true;
      }
      if (changed) { updateRatings(p); if (p.tid === state.userTid) addNews(`${pname(p)} is now ${comfortLabel(comfortOf(p, Object.keys(l.sp).sort((a, b) => l.sp[b] - l.sp[a])[0])).toLowerCase()} at ${SPOTS[Object.keys(l.sp).sort((a, b) => l.sp[b] - l.sp[a])[0]].l}.`, [p.tid], 'prog'); }
    }
    delete l.sp;
  }
}
