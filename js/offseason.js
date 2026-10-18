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
const AWARD_NAMES = { mvp: 'MVP', opoy: 'Offensive Player of the Year', dpoy: 'Defensive Player of the Year', oroy: 'Offensive Rookie of the Year', droy: 'Defensive Rookie of the Year',
  cpoy: 'Comeback Player of the Year', mip: 'Most Improved Player', oly: 'Offensive Lineman of the Year', moy: 'Man of the Year',
  coy: 'Coach of the Year', acoy: 'Assistant Coach of the Year', exec: 'Executive of the Year' };
// =====================================================================
//  SEASON HONORS: the wider award slate, All-Pro and All-Rookie teams, leaders, and the story of the year.
//  Worked out once, when the season ends, and kept with that season in the history books.
// =====================================================================
const HONOR_SLOTS = [['QB', 1], ['RB', 1], ['WR', 3], ['TE', 1], ['OL', 5], ['EDGE', 2], ['IDL', 2], ['LB', 3], ['CB', 3], ['S', 2], ['K', 1], ['P', 1]];
const PRO_BOWL_SLOTS = [['QB', 3], ['RB', 3], ['WR', 4], ['TE', 2], ['OL', 8], ['EDGE', 3], ['IDL', 3], ['LB', 5], ['CB', 4], ['S', 3], ['K', 1], ['P', 1]];
const ROOKIE_SLOTS = [['QB', 1], ['RB', 1], ['WR', 2], ['TE', 1], ['OL', 2], ['EDGE', 1], ['IDL', 1], ['LB', 1], ['CB', 1], ['S', 1]];
const HONOR_NAME = { QB: 'Quarterback', RB: 'Running back', WR: 'Receiver', TE: 'Tight end', OL: 'Offensive line', EDGE: 'Edge', IDL: 'Interior line', LB: 'Linebacker', CB: 'Corner', S: 'Safety', K: 'Kicker', P: 'Punter' };
function honorGroup(p) { return p.spot === 'FB' ? null : p.pos === 'DL' ? (p.spot === 'EDGE' ? 'EDGE' : 'IDL') : p.pos; }
// one number for "how good was his year": production where the position has it, the season grade where it does not
function honorScore(p) {
  const s = p.stats, g = honorGroup(p), gr = p.advS ? overallGrade(p.advS, p.spot) : null, grade = gr || 60, snaps = s.snp || 0;
  if (g === 'QB' || g === 'RB' || g === 'WR' || g === 'TE') return offScore(s) + (grade - 60) * 1.2;
  if (g === 'OL') return snaps < 500 ? -1 : (grade - 50) * 4 + snaps / 40;
  if (g === 'K') return (s.fga || 0) < 12 ? -1 : (s.fgm || 0) * 3 - ((s.fga || 0) - (s.fgm || 0)) * 5 + (s.fgLng || 0) * 0.3;
  if (g === 'P') return (s.pnt || 0) < 20 ? -1 : (s.pntY / s.pnt) * 4;
  if (snaps < 380) return -1;
  return defScore(s) * (g === 'CB' ? 0.8 : 1) + (grade - 60) * (g === 'CB' || g === 'S' ? 3 : 2.2);
}
function honorRef(p, extra) { return Object.assign({ pid: p.id, name: pname(p), pos: p.lbl, tid: p.tid, line: honorGroup(p) === 'OL' ? `${p.stats.gs || 0} starts, ${p.stats.snp || 0} snaps` : statSummary(p.stats, p.pos) }, extra || {}); }
function seasonHonors(awards) {
  const recs = standings(), season = state.season, po = state.playoffs;
  const all = Object.values(state.players).filter(p => p.tid >= 0 && p.stats && (p.stats.gp || 0) >= 6 && p.a);
  const by = {}; for (const p of all) { const g = honorGroup(p); if (g) (by[g] || (by[g] = [])).push([p, honorScore(p)]); }
  for (const g in by) by[g] = by[g].filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
  const tag = (p, txt) => { p.awards = p.awards || []; p.awards.push(season + ' ' + txt); };
  // All-Pro: first and second teams
  const allPro = { 1: [], 2: [] };
  for (const [g, n] of HONOR_SLOTS) { const l = by[g] || []; l.slice(0, n).forEach(([p]) => { allPro[1].push(honorRef(p, { g })); tag(p, 'First-team All-Pro'); }); l.slice(n, n * 2).forEach(([p]) => { allPro[2].push(honorRef(p, { g })); tag(p, 'Second-team All-Pro'); }); }
  // the Pro Bowl: the best of each conference, a wider net than All-Pro
  const proBowl = {};
  for (const [g, n] of PRO_BOWL_SLOTS) for (const conf of [...new Set(state.teams.map(t => t.conf))]) { const l = (by[g] || []).filter(x => T(x[0].tid).conf === conf).slice(0, n);
    for (const [p] of l) { (proBowl[conf] = proBowl[conf] || []).push(honorRef(p, { g })); tag(p, 'Pro Bowl'); } }
  const allRookie = [];
  for (const [g, n] of ROOKIE_SLOTS) (by[g] || []).filter(x => x[0].exp === 0).slice(0, n).forEach(([p]) => { allRookie.push(honorRef(p, { g })); tag(p, 'All-Rookie team'); });
  // the wider slate
  const give = (k, p, extra) => { if (!p || awards[k]) return; awards[k] = honorRef(p, extra); tag(p, AWARD_NAMES[k]); };
  if (by.OL && by.OL[0]) give('oly', by.OL[0][0]);
  const rate = p => { const g = honorGroup(p), l = by[g] || [], top = l.length ? l[0][1] : 1, me = l.find(x => x[0] === p); return me ? me[1] / Math.max(1, top) : 0; }; // how close to the best at his position
  const back = all.filter(p => { const c = p.career || [], last = c.find(x => x.season === season - 1); return p.exp >= 2 && (p.stats.gp || 0) >= 12 && c.length && (!last || (last.gp || 0) <= 9); }).map(p => [p, rate(p)]).filter(x => x[1] >= 0.55).sort((a, b) => b[1] - a[1])[0];
  if (back) { const last = (back[0].career || []).find(x => x.season === season - 1); give('cpoy', back[0], { note: last ? `played ${last.gp || 0} game${last.gp === 1 ? '' : 's'} last season` : 'out of the league last season' }); }
  const up = all.filter(p => p.per && p.per.s0 !== undefined && (p.stats.gs || 0) >= 8 && p.exp >= 1 && rate(p) >= 0.4).map(p => [p, perOvr(p) - p.per.s0 + rate(p) * 5]).filter(x => x[1] >= 5).sort((a, b) => b[1] - a[1])[0]; // a real player now, not just a better backup
  if (up) give('mip', up[0], { note: `now viewed as ${/^[AEIOU]/.test(tierOf(up[0])) ? 'an' : 'a'} ${tierOf(up[0])}` });
  const man = all.filter(p => p.exp >= 4 && (p.stats.gs || 0) >= 10 && p.h && p.h.lead !== undefined).map(p => [p, p.h.lead * 0.5 + p.h.work * 0.25 + p.h.disc * 0.25 + Math.min(p.exp, 10) * 1.5 + rate(p) * 12]).sort((a, b) => b[1] - a[1])[0];
  if (man) give('moy', man[0], { note: 'for leadership and the way he goes about his work' });
  // coaches and front offices: the biggest step forward, weighted by where the club finished
  const hadPrev = state.teams.some(t => (state.teamHist[t.id] || []).length), since = (t, word) => hadPrev ? `, ${word} ${Math.round(prevW(t))} wins a year ago` : '';
  const prevW = t => { const h = state.teamHist[t.id] || [], l = h[h.length - 1]; return l ? l.w + l.t * 0.5 : 8.5; }, nowW = t => recs[t.id].w + recs[t.id].t * 0.5;
  const pf = state.teams.map(t => recs[t.id].pf), pa = state.teams.map(t => recs[t.id].pa), rank = (arr, v, desc) => 1 + arr.filter(x => desc ? x > v : x < v).length;
  const jump = t => (nowW(t) - prevW(t)) * 1.2 + nowW(t) * 0.7 + (po && po.elim[t.id] !== undefined ? 1.5 : 0);
  const coyT = state.teams.filter(t => C(t.hc)).sort((a, b) => jump(b) - jump(a))[0];
  if (coyT) { const c = C(coyT.hc), r = recs[coyT.id]; awards.coy = { cid: c.id, name: cname(c), pos: 'HC', tid: coyT.id, line: recStr(r) + since(coyT, 'after') }; (c.awards = c.awards || []).push(season + ' Coach of the Year'); }
  const coords = []; for (const t of state.teams) for (const [k, off] of [['oc', true], ['dc', false]]) { const c = C(t[k]); if (!c) continue; const rk = off ? rank(pf, recs[t.id].pf, true) : rank(pa, recs[t.id].pa, false), last = (c.hist || []).filter(h => h.tid === t.id && h.role === c.role).pop(), before = last ? (off ? last.off : last.def) : 16; coords.push({ c, t, rk, off, sc: (33 - rk) * 1.0 + (before - rk) * 0.7 }); }
  coords.sort((a, b) => b.sc - a.sc);
  if (coords[0]) { const x = coords[0]; awards.acoy = { cid: x.c.id, name: cname(x.c), pos: x.c.role, tid: x.t.id, line: `No. ${x.rk} ${x.off ? 'scoring offense' : 'scoring defense'}` }; (x.c.awards = x.c.awards || []).push(season + ' Assistant Coach of the Year'); }
  const rookieHelp = t => all.filter(p => p.tid === t.id && p.exp === 0).reduce((s, p) => s + Math.min(1, (p.stats.snp || 0) / 700), 0);
  const execT = state.teams.slice().sort((a, b) => (jump(b) + rookieHelp(b) * 1.5) - (jump(a) + rookieHelp(a) * 1.5))[0];
  if (execT) awards.exec = { name: execT.id === state.userTid ? 'You' : `${execT.region} front office`, pos: 'GM', tid: execT.id, line: `${recStr(recs[execT.id])}${since(execT, 'after')}${rookieHelp(execT) >= 2 ? ', with a rookie class that played right away' : ''}` };
  // leaders
  const lead = (k, label, f, min) => ({ label, rows: all.filter(p => !min || min(p)).map(p => [p, f ? f(p) : (p.stats[k] || 0)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p, v]) => ({ pid: p.id, name: pname(p), pos: p.lbl, tid: p.tid, v: Math.round(v * 10) / 10 })) });
  const leaders = [lead('passY', 'Passing yards'), lead('passTD', 'Passing touchdowns'), lead('rushY', 'Rushing yards'), lead('rushTD', 'Rushing touchdowns'), lead('recY', 'Receiving yards'), lead('rec', 'Receptions'), lead('recTD', 'Receiving touchdowns'),
    lead('tkl', 'Tackles'), lead('sck', 'Sacks'), lead('dint', 'Interceptions'), lead('pd', 'Passes defended'), lead('ff', 'Forced fumbles')];
  // around the league
  const best = f => state.teams.slice().sort((a, b) => f(b) - f(a))[0];
  const league = [['Best record', best(t => nowW(t) + recs[t.id].pf / 10000), t => recStr(recs[t.id])], ['Top offense', best(t => recs[t.id].pf), t => `${(recs[t.id].pf / 17).toFixed(1)} points a game`], ['Top defense', best(t => -recs[t.id].pa), t => `${(recs[t.id].pa / 17).toFixed(1)} allowed a game`],
    ['Biggest turnaround', best(t => nowW(t) - prevW(t)), t => `${Math.round(prevW(t))} wins to ${recStr(recs[t.id])}`], ['Hardest fall', best(t => prevW(t) - nowW(t)), t => `${Math.round(prevW(t))} wins to ${recStr(recs[t.id])}`]].filter(x => hadPrev || !/turnaround|fall/.test(x[0])).map(([label, t, f]) => ({ label, tid: t.id, line: f(t) }));
  // your club
  const u = state.userTid, mineAll = all.filter(p => p.tid === u), e = po ? po.elim[u] : undefined;
  const topOf = l => l.map(p => [p, rate(p)]).sort((a, b) => b[1] - a[1])[0];
  const mvpU = topOf(mineAll), rookU = topOf(mineAll.filter(p => p.exp === 0 && (p.stats.snp || 0) >= 150)), upU = mineAll.filter(p => p.per && p.per.s0 !== undefined && (p.stats.gs || 0) >= 4).map(p => [p, perOvr(p) - p.per.s0]).sort((a, b) => b[1] - a[1])[0];
  const mine = { rec: recStr(recs[u]), result: e === undefined ? 'Missed the playoffs' : e === 4 ? 'Won the championship' : 'Lost in the ' + ROUND_NAMES[e], prev: Math.round(prevW(T(u))), pf: recs[u].pf, pa: recs[u].pa, offRk: rank(pf, recs[u].pf, true), defRk: rank(pa, recs[u].pa, false),
    mvp: mvpU ? honorRef(mvpU[0]) : null, rookie: rookU ? honorRef(rookU[0]) : null, improved: upU && upU[1] >= 2 ? honorRef(upU[0], { note: tierOf(upU[0]) }) : null };
  const bracket = po ? po.rounds.map((rd, i) => ({ name: ROUND_NAMES[i], games: rd.map(g => ({ h: g.h, a: g.a, win: g.win, score: g.score, gid: g.gid })) })) : [];
  return { allPro, allRookie, proBowl, leaders, league, mine, bracket };
}

function statSummary(s, pos) { const b = statSummary0(s, pos), x = s ? [(s.tpc || 0) + (s.tpp || 0) ? `${(s.tpc || 0) + (s.tpp || 0)} two-point` : '', s.sfty ? `${s.sfty} safet${s.sfty === 1 ? 'y' : 'ies'}` : ''].filter(Boolean) : []; return x.length ? b + '; ' + x.join(', ') : b; }
function statSummary0(s, pos) {
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
  let wrap = null; try { wrap = seasonHonors(awards); } catch (e) { console.error(e); }
  seasonMovers();
  seasonPerception(awards);
  const ru = po.rounds[3][0].win === po.rounds[3][0].h ? po.rounds[3][0].a : po.rounds[3][0].h;
  state.history.push({ season: state.season, champ: po.champ, runnerUp: ru, awards, userRec: recStr(recs[state.userTid]), wrap, res: { reg: packWeeks(state.schedule), pre: state.preRes || null } }); // older seasons keep the honors, not every score
  for (const k in awards) addNews(`${state.season} ${AWARD_NAMES[k]}: ${awards[k].name} (${T(awards[k].tid).abbr} ${awards[k].pos})`, [awards[k].tid], 'award');
  for (const t of state.teams) {
    const r = recs[t.id], e = po.elim[t.id];
    const result = e === undefined ? 'Missed playoffs' : e === 4 ? 'Won Championship' : 'Lost ' + ROUND_NAMES[e];
    const ta = t.advS || {};
    state.teamHist[t.id].push({ season: state.season, w: r.w, l: r.l, t: r.t, pf: r.pf, pa: r.pa, seed: e === undefined ? null : seedOf(t.id), result,
      offEpa: ta.plays ? round2(ta.epa / ta.plays) : null, defEpa: ta.dPlays ? round2(ta.dEpa / ta.dPlays) : null });
    t.advPrev = Object.assign({ season: state.season }, t.advS || {}); // last season's self-scout stays viewable
    t.advS = {};
    const hc = C(t.hc);
    if (hc) { hc.rec.w += r.w; hc.rec.l += r.l; hc.rec.t += r.t; if (e === 4) hc.rec.titles++; }
  }
  // archive season stats
  GRADE_RANKS = null; const grk = gradeRanks();
  for (const id in state.players) {
    const p = state.players[id];
    if (p.stats.gp) p.career.push(Object.assign({ season: state.season, tid: p.tid }, p.stats, p.advS ? { adv: Object.assign(careerAdv(p.advS, p.spot), grk[p.id] ? { rk: grk[p.id][0], rkN: grk[p.id][1], rkG: grk[p.id][2] } : {}) } : {}, p.per ? { ti: tierOf(p), up: upsideOf(p) } : {}));
    if (p.pstats && p.pstats.gp) { p.pcareer = p.pcareer || []; p.pcareer.push(Object.assign({ season: state.season, tid: p.tid }, p.pstats)); }
    p.advPrev = p.advS ? Object.assign({ season: state.season }, p.advS) : p.advPrev || null; // last season stays viewable through the offseason
    p.glogPrev = p.glog && p.glog.length ? { season: state.season, log: p.glog } : p.glogPrev || null;
    p.stats = {}; p.pstats = null; p.advS = null; p.glog = [];
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
  state.plan = null; // a new offseason: the roster planner starts from the staff's chart again
  for (const p of Object.values(state.players)) if (p.waiver) delete p.waiver; // the season's waiver wire closes: anyone left on it is a free agent
  if (state.iw) state.iw = { claims: {}, ps: [] };
  const year = state.season + 1;
  const unused = typeof carryoverClose === 'function' ? carryoverClose() : null;
  growCap(); // new league year: cap, minimum salary and dead money roll over
  if (unused) carryoverOpen(unused);
  state.draft = { year, order: draftOrder(year), idx: 0 };
  // progression, retirement, healing, contracts
  const retired = [];
  const devBefore = {};
  for (const id in state.players) { const p = state.players[id]; if (p.tid >= 0 && p.age <= 26) devBefore[id] = p.ovr; }
  for (const id in state.players) {
    const p = state.players[id];
    if (p.tid === -2) continue;
    offseasonExpectation(p);
    comfortOffseason(p);
    progressPlayer(p); // the real change stays hidden; camp reports and film reveal it
    offseasonApply(p);
    p.wear = 0;
    if (p.injury) { p.injury.weeks -= 20; if (p.injury.weeks <= 0) p.injury = null; else p.injury.fresh = false; }
    if (!p.injury) delete p.ir;
    if (shouldRetire(p)) { retired.push(p); continue; }
    if (p.tid >= 0) rolloverContract(p);
  }
  logDevelopment(devBefore);
  for (const p of retired) {
    archiveRetired(p); // the record book keeps everyone
    if (perOvr(p) >= 80 || p.tid === state.userTid || (p.awards && p.awards.length))
      addNews(`${p.lbl} ${pname(p)}${p.tid >= 0 ? ' (' + T(p.tid).abbr + ')' : ''} retired after ${p.exp} seasons.`, p.tid >= 0 ? [p.tid] : [], 'retire');
    delete state.players[p.id]; rostersDirty();
  }
  psOffseason();
  devCheckpoint('off'); // the staff re-reads everyone after a winter of work
  ensureDraftClass(year, true);
  state.carSnap = carouselSnap(); // who held every coaching job before anyone was fired or retired
  chemOffseason();
  coachOffseason();
  state.phase = 'COACHES';
  startCarousel();
}
function resignAsk(p) { return round2(marketValue(p) * (0.95 + rand() * 0.2)); }

// ---------- coaches (see coaches.js) ----------
function leaveCoaches() {
  state.car = null;
  fillCoachVacancies(); // safety net: anything still open
  ensureCoachContracts(); for (const t of state.teams) setCaller(t);
  systemChangeKnowledge(); // new coordinators mean new playbooks
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
  if (p.age >= ageFor(p, 32) && v < 80) return false;
  if (v >= 76) return true;
  const R = clubRead(p.tid, p), n = needAt(p.tid, p.pos, p.id); // what the room loses without him: the gap to the man who would take over
  if ((R.start || R.gap >= -2) && v >= 62) return true;
  if (R.g >= 1.5) return true;
  if (n.count < ROSTER_MIN[p.pos] && p.ask <= 3) return true;
  return rand() < 0.25 && p.ask <= 1.5;
}
function resignPlayer(pid, yrs) {
  const p = P(pid);
  if (!p || !p.expiring) return 'Not expiring';
  const terms = resignTerms(p), o = terms.opts.find(x => x.yrs === (yrs || terms.pref));
  if (!o || !o.ok) return o ? o.why : 'Not an option';
  if (o.amt > capRoom(p.tid)) return 'Not enough cap room';
  p.contract = makeContract(p, o.amt, o.yrs);
  p.expiring = false; delete p.ask;
  return null;
}
// the re-signing decision for a club's own free agent: is he still part of the plan, at a price this club will pay
function aiResign(p, tid) {
  const S = stanceCfg(tid), v = viewOvr(p, tid), st = stanceOf(tid);
  if (p.age >= walkAge(S, p) && v < 80) return false;
  if ((st === 'rebuild' || st === 'retool') && p.age >= ageFor(p, 29) && v < 76) return false;
  if (!aiWantsResign(p) && planNeedFor(tid, p) <= 0) return false;
  if (p.ask > capRoom(tid) - S.reserve || p.ask > aiCeil(p.pos)) return false;
  if (p.pos === 'QB' && clubRead(tid, p).clear < 0.5 && p.ask > 0.05 * state.cap) return false; // a quarterback the club is not sure starts: a competition's money at most
  return p.ask <= clubMaxAAV(tid, p, faClubAAV(tid, p), { own: true, yrs: 2 }) * (clubRead(tid, p).sure >= 0.5 ? 1.08 : 1) + (v >= 76 ? 0.5 : 0); // a little extra to keep a starter the room knows
}
// before the market opens, a club that means to buy and is short of room turns salary into bonus
function aiRestructures(tid) {
  const st = stanceOf(tid); if (st !== 'allin' && st !== 'contend') return 0;
  const S = stanceCfg(tid), b = clubBudget(tid), short = roomPlan(tid).shop0 - (capRoom(tid) - S.reserve);
  if (short <= 0 || (st === 'contend' && b.y[1].slack < short * 0.5)) return 0; // a contender does not mortgage a year it cannot afford
  let made = 0, need = short;
  for (const p of rosterOf(tid).filter(p => p.contract.yrs >= 2 && p.contract.amt > MIN_SALARY * 6 && viewOvr(p, tid) >= 72).sort((a, b) => b.contract.amt - a.contract.amt)) {
    if (need <= 0 || made >= 3) break;
    const x = Math.min(need + 1, p.contract.amt * 0.4); restructure(p, x); need -= x; made++;
  }
  return made;
}
function leaveResign() {
  if (typeof setStances === 'function') setStances(false); // the new league year: each front office decides what it is trying to do
  if (!isAI(state.userTid)) keepResignPromises(state.userTid); // your word to a coach
  autoOptions(state.userTid); // undecided options get the staff's recommendation
  if (!isAI(state.userTid)) releaseUserPS(); // practice squad players you did not sign to a futures deal move on
  for (const t of state.teams) {
    if (isAI(t.id)) fixCap(t.id); // the league year opens: every club has to be under the cap before it does business
    const exp = rosterOf(t.id).filter(p => p.expiring).sort((a, b) => viewOvr(b, t.id) - viewOvr(a, t.id));
    for (const p of exp) {
      // a player with leverage and an agent who likes the open market goes to see what another club thinks he is
      const tests = leverageOf(p) >= 0.55 && p.age <= 31 && rand() < 0.05 + agentOf(p).d[0] * 0.18;
      if (isAI(t.id) && aiResign(p, t.id) && !tests) {
        const terms = resignTerms(p), yrs = Math.min(terms.pref, clubMaxYears(t.id, p)), o = terms.opts.find(x => x.yrs === yrs && x.ok);
        if (resignPlayer(p.id, o ? yrs : undefined)) resignPlayer(p.id);
      } else {
        toFreeAgency(p);
        if (perOvr(p) >= 78 || t.id === state.userTid) addNews(`${p.lbl} ${pname(p)} (${tierOf(p)}) hits free agency from ${t.abbr}.`, [t.id], 'fa');
      }
    }
  }
  for (const t of state.teams) if (isAI(t.id)) aiRestructures(t.id);
  state.phase = 'FA'; state.faWave = 0;
  faOpen(); // the market opens: clubs bid over a run of days (freeagency.js)
}
function toFreeAgency(p) {
  if (p.tid >= 0) { p.lastTid = p.tid; if (p.contract && p.contract.amt) p.lastAmt = p.contract.amt; } // shown on the free-agent board
  setTid(p, -1); p.expiring = false;
  p.ask = round2(marketValue(p) * (1 + rand() * 0.15));
  p.contract = { amt: p.ask, yrs: 0 };
}

// ---------- free agency ----------
const ROSTER_53 = () => state.phase === 'REG' || state.phase === 'PLAYOFFS' || state.phase === 'WAIVERS'; // from cut day on, the 53 is what counts
function rosterLimit() { return ROSTER_53() ? ROSTER_MAX : OFFSEASON_MAX; }
function rosterCount(tid) { return ROSTER_53() ? activeCount(tid) : rosterOf(tid).length; }

function signFA(pid, tid, yrs) {
  const p = P(pid);
  if (!p || p.tid !== -1) return 'Player is not a free agent';
  if (p.waiver) return 'He is on waivers: put in a claim';
  if (typeof faInMarket === 'function' && faInMarket(p)) { if (tid === state.userTid || !state.fa.cut) return 'He is on the market: sit down with his agent'; delete state.fa.in[p.id]; delete state.fa.off[p.id]; delete state.fa.talks[p.id]; } // cut day: a club signing him off the street
  if (state.phase === 'UDFA' && isUdfa(p)) return 'Undrafted rookies choose between offers: make yours on the Free Agents tab';
  if (rosterCount(tid) >= rosterLimit()) return 'Roster is full';
  if (p.ask > capRoom(tid)) return 'Not enough cap room';
  if (isAI(tid) && typeof streetPayOk === 'function' && !streetPayOk(tid, p, p.ask)) return 'Not at that price';
  const qbt = p.pos === 'QB' && isAI(tid) && typeof qbTier === 'function' ? qbTier(tid, p, p.ask) : null;
  setTid(p, tid); if (qbt) qbBought(tid, qbt);
  p.contract = makeContract(p, p.ask, yrs || (state.phase === 'REG' ? 1 : contractYears(p)));
  delete p.ask;
  if (perOvr(p) >= 72 || tid === state.userTid) addNews(`${T(tid).abbr} signed ${p.lbl} ${pname(p)} (${tierOf(p)}) — ${p.contract.yrs} yr, ${fmtMoney(p.contract.amt)}/yr.`, [tid], 'sign');
  return null;
}
function releasePlayer(pid) {
  const p = P(pid);
  if (!p || p.tid < 0) return;
  const t = T(p.tid);
  const d = deadIfCut(p);
  t.dead = round2((t.dead || 0) + d.now); t.deadNext = round2((t.deadNext || 0) + d.next);
  p.lastTid = t.id;
  const old = Object.assign({}, p.contract);
  // waivers: on cut day and all season for anyone with fewer than four seasons; after the trade deadline, everyone
  const inSeason = state.phase === 'REG' || state.phase === 'PLAYOFFS', onWire = ((state.wv && !state.wv.done) || inSeason) && (p.exp < WAIVER_EXP || (inSeason && state.week > TRADE_DEADLINE));
  addNews(`${t.abbr} ${onWire ? 'waived' : 'released'} ${p.lbl} ${pname(p)}.`, [t.id], 'release');
  toFreeAgency(p);
  if (onWire) p.waiver = { from: t.id, c: old, wk: state.week || 0 }; else delete p.waiver;
  if (!onWire && inSeason && isAI(t.id) && p.promPS && p.promPS.tid === t.id && p.promPS.s === state.season && typeof signToPS === 'function') signToPS(p.id, t.id); // a veteran he brought up goes back to the squad
  p.ask = round2(Math.max(MIN_SALARY, p.ask * 0.8));
}

// what he adds to this club: its staff's read of its lineups with him and without (budget.js clubRead)
function faGain(tid, p) { return clubRead(tid, p).g * (p.age >= ageFor(p, 31) ? 0.75 : 1); }
function aiFreeAgencyWave(maxSigns) {
  const fas = () => Object.values(state.players).filter(p => p.tid === -1).sort((a, b) => perOvr(b) - perOvr(a));
  const order = shuffle(state.teams.filter(t => isAI(t.id)).map(t => t.id));
  for (let k = 0; k < maxSigns; k++) {
    const pool = fas();
    for (const tid of order) {
      const S = stanceCfg(tid), reserve = state.phase === 'DRAFT' || state.phase === 'FA' ? S.reserve : 1, w = 0.15 * priceNow(tid) / 0.3;
      const room = capRoom(tid) - reserve;
      let bestP = null, best = 0.5; // the price of money already says how motivated a buyer the club is
      for (const p of pool) {
        if (p.tid !== -1 || p.ask > room || faInMarket(p) || p.ask > clubMaxAAV(tid, p, p.ask * 1.2, { yrs: 1 })) continue;
        if (p.pos === 'QB' && !qbChaseOk(tid, qbTier(tid, p, p.ask), p.ask)) continue;
        const s = faGain(tid, p) * clamp(1 + planNeedFor(tid, p) * 0.15, 0.7, 1.3) - p.ask * w;
        if (s > best) { best = s; bestP = p; }
      }
      if (bestP && rosterCount(tid) < rosterLimit()) signFA(bestP.id, tid);
    }
  }
  // unsigned players lower their demands
  for (const p of fas()) if (!faInMarket(p)) p.ask = round2(Math.max(MIN_SALARY, p.ask * 0.85));
}
function advanceFA() {
  if (!state.fa || state.fa.yr !== state.season) faOpen(); // a save from before the market existed
  faAdvanceDay();
  if (state.fa.day === 3 || state.fa.day === 6) aiFreeAgencyWave(2); // the bottom of the roster gets filled while the market runs
  state.faWave = state.fa.day;
  if (state.fa.over) { state.phase = 'DRAFT'; addNews(`The ${state.draft.year} draft is on the clock.`); }
}

// ---------- draft ----------
function prospects() { return Object.values(state.players).filter(p => p.tid === -2); }
// private workouts: a few prospects a class run every drill again for you alone, including the ones they skipped
const PW_PER_CLASS = 12;
function pwState() { const c = prospects()[0], yr = c ? c.draftYear : 0; if (!state.pw || state.pw.yr !== yr) state.pw = { yr, left: PW_PER_CLASS }; return state.pw; }
function privateWorkout(pid) {
  const p = P(pid);
  if (!p || p.tid !== -2) return 'Only draft prospects can be worked out';
  if (p.pw) return 'You have already worked him out';
  const s = pwState(); if (s.left <= 0) return 'No private workouts left for this class';
  const day = gauss(0, 1), o = {};
  for (const k of DRILL_KEYS) if (!(k === 'bench' && ['QB', 'K', 'P'].includes(p.pos))) o[k] = drillDraw(p, k, day);
  p.pw = o; s.left--; return null;
}
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
function teamNeedsQB(tid) { const q = rosterOf(tid).filter(p => p.pos === 'QB').sort((a, b) => viewOvr(b, tid) - viewOvr(a, tid))[0]; return !q || viewOvr(q, tid) < th(q).mid || q.age >= 34; }
// A specialist arrives close to what he will ever be, so on a board built for raw rookies he reads like an instant starter.
// Clubs know better: kickers and punters are late-round picks, and only for a club that needs one.
const DRAFT_SPEC = { K: -22, P: -24 };
// one club's board: every prospect scored once, with the club's needs counted once
function draftBoard(tid, noise) {
  const need = {}, def = {}, qbNeed = teamNeedsQB(tid) ? 8 : -4, out = [];
  const N = pos => need[pos] || (need[pos] = needAt(tid, pos)), D = s => def[s] !== undefined ? def[s] : (def[s] = spotDeficit(tid, s));
  for (const p of prospects()) {
    const n = N(p.pos), v = viewOvr(p, tid);
    // judged against the starters at his own position (a quarterback is not graded on a guard's scale)
    let s = v - th(p).starter + 74 + 0.55 * viewGrowth(p, tid) + schemeFit(p, tid) * 0.5 + (p.pos === 'RB' ? -2 : 0);
    if (DRAFT_SPEC[p.pos]) s += DRAFT_SPEC[p.pos] - (n.arr[0] && viewOvr(n.arr[0], tid) >= th(p).starter - 3 ? 12 : 0);
    if (p.pos === 'QB') s += qbNeed + (qbHunt(tid) ? 3 : 0);
    s += clamp(planNeedFor(tid, p, v) * 3, -2, 4); // the room plan: a lean, not a takeover
    if (n.count < ROSTER_MIN[p.pos]) s += 4;
    if (v > n.floor) s += 2;
    let sb = 0; for (const k in (p.cf || { [p.spot]: 100 })) if (comfortOf(p, k) >= 60) sb = Math.max(sb, D(k));
    s += sb * 1.5;
    if (n.count >= ROSTER_TEMPLATE[p.pos] + 1) s -= 5;
    if (noise) s += gauss(0, 1.5);
    out.push({ p, s });
  }
  return out.sort((a, b) => b.s - a.s);
}
function aiDraftChoice(tid) { const b = draftBoard(tid, true); return b.length ? b[0].p : null; }
// ---- trades on the clock ----
// what a slot is worth: the chart every front office carries, steep at the top and flat at the bottom
function draftChart(n) { return 2200 * Math.exp(-0.09 * (n - 1)) + 800 * Math.exp(-0.02 * (n - 1)); }
function draftSlotOf(pickId) { const d = state.draft; return d ? d.order.find(o => o.pickId === pickId) || null : null; }
// a club behind this pick that wants a man it does not think will last: what it would give to come up for him
function draftSuitors(T0, limit) {
  const d = state.draft, pk = currentPick(), out = []; if (!pk || !pk.pickId) return out;
  const seen = new Set([T0]);
  for (let i = d.idx + 2; i < Math.min(d.order.length, d.idx + 30) && seen.size < 14; i++) {
    const o = d.order[i], B = o.owner; if (seen.has(B) || !isAI(B) || !o.pickId) continue; seen.add(B);
    const board = draftBoard(B, false); if (board.length < 40) continue;
    const top = board[0], left = board[Math.min(board.length - 1, Math.ceil((o.pick - pk.pick) * 0.55))]; // what he expects to be looking at if he waits
    const gain = top.s - left.s + (top.p.pos === 'QB' && teamNeedsQB(B) ? 4 : 0);
    if (gain < 3.5 + pk.round) continue;
    // the price: the difference on the chart, paid in picks of his own, this year's first
    const owe = (draftChart(pk.pick) - draftChart(o.pick)) * (1.02 + rand() * 0.14), give = [o.pickId]; let paid = 0;
    const mine = state.picks.filter(x => x.owner === B && x.id !== o.pickId && !(draftSlotOf(x.id) && draftSlotOf(x.id).pid)).map(x => ({ x, v: draftSlotOf(x.id) ? draftChart(draftSlotOf(x.id).pick) : pickValue(x) / 0.012 * 0.9 })).filter(q => q.v > 3).sort((a, b) => a.v - b.v);
    while (paid < owe && mine.length) { // the smallest pick that finishes the job, or the biggest one left that does not overshoot it
      let k = mine.findIndex(q => q.v >= owe - paid); if (k < 0) k = mine.length - 1; else if (mine[k].v > (owe - paid) * 1.6 && k > 0) k--;
      const q = mine.splice(k, 1)[0]; if (q.v > (owe - paid) * 2.2 && give.length > 1) break; give.push(q.x.id); paid += q.v; }
    if (paid < owe * 0.92 || paid > owe * 1.5 || give.length > 4) continue;
    out.push({ tid: B, give, for: pk.pickId, target: top.p.id, gain, paid, owe, slot: o.pick });
  }
  return out.sort((a, b) => b.gain - a.gain).slice(0, limit || 3);
}
function draftSwap(T0, off) {
  const tp = P(off.target);
  executeTrade(T0, off.tid, { players: [], picks: [off.for] }, { players: [], picks: off.give });
  if (tp) addNews(`${T(off.tid).abbr} trade up with ${T(T0).abbr} to pick ${currentPick().pick}.`, [off.tid, T0], 'draft');
}
// another club on the clock: most picks are made where they stand, but a club that will not miss much by sliding listens
function aiDraftTrade() {
  const pk = currentPick(); if (!pk || pk.round > 4 || !isAI(pk.owner) || !pk.pickId) return null;
  if (rand() > (pk.round === 1 ? 0.3 : pk.round === 2 ? 0.2 : 0.1)) return null;
  const T0 = pk.owner, mine = draftBoard(T0, false); if (mine.length < 40) return null;
  if (mine[0].p.pos === 'QB' && teamNeedsQB(T0)) return null; // he is not moving off his quarterback
  for (const off of draftSuitors(T0, 3)) {
    const back = mine[Math.min(mine.length - 1, Math.ceil((off.slot - pk.pick) * 0.55))];
    if (mine[0].s - back.s > 2.5 + (off.paid / Math.max(1, off.owe) - 1) * 12) continue; // what he gives up by sliding, against what he is paid over the chart
    draftSwap(T0, off); return off;
  }
  return null;
}
// the phone rings when you are on the clock
function draftUserOffers() {
  const d = state.draft, pk = currentPick(); if (!d || !pk || pk.owner !== state.userTid || isAI(state.userTid)) return;
  if (d.offer && d.offer.idx === d.idx) return;
  d.offer = { idx: d.idx, list: pk.round <= 4 && rand() < (pk.round === 1 ? 0.85 : pk.round === 2 ? 0.65 : 0.45) ? draftSuitors(state.userTid, 2).map(o => ({ tid: o.tid, give: o.give, for: o.for })) : [] };
}
function draftAcceptOffer(i) {
  const d = state.draft, pk = currentPick(), off = d && d.offer && d.offer.idx === d.idx ? d.offer.list[i] : null;
  if (!off || !pk || pk.owner !== state.userTid) return 'That offer is gone';
  executeTrade(state.userTid, off.tid, { players: [], picks: [off.for] }, { players: [], picks: off.give });
  d.offer = null; return null;
}
function simDraftPick() {
  const pk = currentPick();
  if (!pk) return;
  const moved = aiDraftTrade(), now = currentPick();
  const choice = moved && P(moved.target) && P(moved.target).tid === -2 ? P(moved.target) : aiDraftChoice(now.owner);
  if (choice) draftPlayer(choice.id);
}
function simDraftToUser() {
  while (state.phase === 'DRAFT') {
    const pk = currentPick();
    if (!pk) break;
    if (pk.owner === state.userTid && !state.settings.autoUser) { draftUserOffers(); break; }
    simDraftPick();
  }
}
function finishDraft() {
  const left = prospects().sort((a, b) => perOvr(b) + b.per.g * 0.5 - perOvr(a) - a.per.g * 0.5);
  left.forEach((p, i) => {
    if (i < UDFA_KEEP) { setTid(p, -1); p.ask = MIN_SALARY; p.contract = { amt: MIN_SALARY, yrs: 0 }; p.udfa = state.draft.year; undraftedView(p); }
    else delete state.players[p.id]; rostersDirty();
  });
  state.picks = state.picks.filter(pk => pk.season !== state.draft.year);
  state.phase = 'UDFA';
  startUdfa();
  addNews(`The ${state.draft.year} draft is complete. The race for undrafted rookies is on.`);
  campReports(state.draft.year);
}

// ---------- roster maintenance ----------
// what cutting him saves this year (guaranteed money is sunk either way)
function cutSavings(p) { const d = deadIfCut(p); return p.contract.yrs > 0 ? p.contract.amt - d.now - d.next * 0.5 : 0; }
function cutValue(p) { return playerValue(p, p.tid) - (cutSavings(p) - MIN_SALARY) * 0.4 + (p.draft && p.exp <= 1 ? 3 : 0) + stRosterValue(p); } // the last spots go to men who cover kicks
function autoCut(tid, limit, activeOnly) {
  const cuts = [];
  // getting to 53 is the front office's call: the men whose loss hurts the club's lineups least go first
  if (limit === ROSTER_MAX && typeof foCutPlan === 'function' && FO.on !== false && (!FO.only || FO.only(tid))) { for (const id of foCutPlan(tid, limit).order) { const p = P(id); if (p && p.tid === tid) { releasePlayer(id); cuts.push(p); } } }
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
      const p = fa.find(x => x.ask <= capRoom(tid) && (!isAI(tid) || streetPayOk(tid, x, x.ask))) || fa.find(x => x.ask <= MIN_SALARY * 1.5);
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
  // then the men whose loss costs the lineups least for each dollar it frees
  if (capRoom(tid) < 0 && typeof foCapCuts === 'function' && FO.on !== false && (!FO.extra || FO.extra(tid))) foCapCuts(tid);
  let guard = 0;
  while (capRoom(tid) < 0 && guard++ < 20) {
    const cand = rosterOf(tid).filter(p => cutSavings(p) > 1).sort((a, b) => (playerValue(a, tid) / cutSavings(a)) - (playerValue(b, tid) / cutSavings(b)))[0];
    if (!cand) break;
    releasePlayer(cand.id);
  }
}

// One call for anything that skips the waiver screen (auto-managed leagues, test harnesses)
function packWeeks(weeks) { return weeks.map(wk => wk.map(m => [m.h, m.a, m.score ? m.score[0] : -1, m.score ? m.score[1] : -1])); } // a season's results in a few kilobytes
function startNewSeason() { beginWaivers(); resolveWaivers(); }
// ---------- cutdown → waivers → season ----------
// Cuts happen league-wide, players with fewer than four seasons hit the waiver wire, claims are awarded worst record first.
function beginWaivers() {
  const plan = (state.cut && state.cut.plan) || {}, u = state.userTid, calls = {};
  for (const p of Object.values(state.players)) if (p.tid >= 0 && p.injury && !p.injury.preview) { const c = irCallOf(p); if (c) calls[p.id] = c; } // yours from your plan, the rest from each staff
  if (state.pre && state.pre.sched) { state.preRes = packWeeks(state.pre.sched); setSharpness(); }
  state.pre = null; state.cut = null; state.udfa = null;
  const prio = standings().slice().sort((a, b) => (a.w + a.t * 0.5) - (b.w + b.t * 0.5) || a.pf - a.pa - (b.pf - b.pa)).map(r => r.tid);
  state.wv = { claims: {}, ai: {}, ps: [], want: {}, offers: {}, back: {}, prio: prio.length === state.teams.length ? prio : state.teams.map(t => t.id) };
  state.wvPrio = state.wv.prio.slice(); // the order for the first three weeks of the season
  trainingCamp();
  devSummer('pre'); // camp and preseason development, if it has not been paid yet
  // the injured, by the rules: reserve/PUP and season-ending IR go before the cut and do not count; a man designated to return
  // makes the 53 and goes to IR right after it, opening his spot
  for (const p of Object.values(state.players)) { delete p.ir; const c = p.tid >= 0 ? calls[p.id] : null; if (c === 'pup') p.ir = { wk: 1, pup: true }; else if (c === 'ir') p.ir = { wk: 1, season: true }; }
  // your cuts first (practice-squad designations are remembered), then every other front office
  for (const id in plan) { const p = P(+id); if (!p || p.tid !== u || (plan[id] !== 'cut' && plan[id] !== 'ps')) continue; if (plan[id] === 'ps') state.wv.ps.push(p.id); releasePlayer(p.id); }
  for (const t of state.teams) {
    if (isAI(t.id)) fixCap(t.id);
    if (isAI(t.id)) autoCut(t.id, ROSTER_MAX, true); // your cuts are yours: the screen does not let you past cutdown day over the limit
  }
  for (const id in calls) { const p = P(+id); if (calls[id] === 'dtr' && p && p.tid >= 0 && !p.ir) { p.ir = { wk: 1, dtr: true }; if (p.tid === u) addNews(`${p.lbl} ${pname(p)} went to injured reserve with a designation to return (week ${1 + IR_MIN_WEEKS} at the earliest).`, [u], 'inj'); } }
  if (typeof cutMarketOpen === 'function') cutMarketOpen(); // the veterans worth a real contract: the same sit-down as free agency
  // each staff names the cuts it wants back on its practice squad if they clear (only where nobody better is out there)
  for (const t of state.teams) if (isAI(t.id)) state.wv.back[t.id] = psBringBacks(t.id);
  aiWaiverClaims();
  state.phase = 'WAIVERS';
}
const onWaivers = () => Object.values(state.players).filter(p => p.tid === -1 && p.waiver);
// how a team values a waived player against the last man it is carrying at his position
function waiverScore(p, tid) { return viewOvr(p, tid) + (p.age <= 24 ? viewGrowth(p, tid) * 0.4 : 0) + stRosterValue(p); }
function waiverDrop(p, tid) { // the player a claiming team would let go, or null if he would not make their roster
  const room = rosterOf(tid).filter(x => x.pos === p.pos && !onIR(x)).sort((a, b) => waiverScore(a, tid) - waiverScore(b, tid));
  if (!room.length || room.length <= ROSTER_MIN[p.pos] - 1) return null;
  // a quick look first (is he anywhere near our depth?), then the real question: do our lineups get better, and who makes way
  if (typeof foWaiverDrop === 'function' && FO.on !== false && (!FO.extra || FO.extra(tid)) && p.a) return waiverScore(p, tid) > waiverScore(room[0], tid) - 2 ? foWaiverDrop(p, tid) : null;
  return waiverScore(p, tid) > waiverScore(room[0], tid) + 3 ? room[0] : null;
}
function aiWaiverClaims() {
  const wv = state.wv, pool = onWaivers();
  for (const t of state.teams) {
    if (!isAI(t.id)) continue;
    const mine = pool.filter(p => p.waiver.from !== t.id && p.waiver.c.amt <= capRoom(t.id) + 1).map(p => ({ p, d: waiverDrop(p, t.id) })).filter(x => x.d)
      .sort((a, b) => (waiverScore(b.p, t.id) - waiverScore(b.d, t.id)) - (waiverScore(a.p, t.id) - waiverScore(a.d, t.id)));
    for (const x of mine) (wv.ai[x.p.id] = wv.ai[x.p.id] || []).push([t.id, x.d.id]); // as many as it likes: each award is checked again when it comes up
  }
}
function waiverRisk(p) { const n = ((state.wv && state.wv.ai[p.id]) || []).length; return n >= 3 ? 'Will be claimed' : n >= 1 ? 'Could be claimed' : 'Should clear'; }
// before cuts are final: would anyone put in a claim if you waived him? (estimate from each team's depth)
function claimRiskIfCut(p) {
  if (p.exp >= WAIVER_EXP) return 'Free agent if cut';
  let n = 0;
  for (const t of state.teams) { if (t.id === p.tid) continue; const room = rosterOf(t.id).filter(x => x.pos === p.pos).sort((a, b) => perOvr(b) - perOvr(a)); const last = room[Math.min(room.length, ROSTER_TEMPLATE[p.pos]) - 1]; if (last && perOvr(p) + (p.age <= 24 ? p.per.g * 0.4 : 0) > perOvr(last) + (last.age <= 24 ? last.per.g * 0.4 : 0) + 3) n++; }
  return n >= 4 ? 'Will be claimed' : n >= 1 ? 'Could be claimed' : 'Should clear';
}
// your moves in the waiver window that would each take a place on the 53, with the man you named to make room (0 if none)
function wvPending(exceptPid) { const wv = state.wv, l = [...Object.entries(wv.claims), ...Object.entries(wv.offers || {})];
  if (typeof cutMarketOn === 'function' && cutMarketOn()) for (const pid in state.fa.off) if (state.fa.off[pid].some(o => o.tid === state.userTid)) l.push([pid, (wv.mdrop || {})[pid] || 0]);
  return l.filter(([id]) => +id !== exceptPid).map(([id, d]) => [+id, d]); }
function waiverClaim(pid, dropPid) {
  const p = P(pid), wv = state.wv, u = state.userTid;
  if (!wv || !p || !p.waiver) return 'He is not on waivers';
  if (dropPid === null) { delete wv.claims[pid]; return null; }
  const active = rosterOf(u).filter(x => !onIR(x)).length, pend = wvPending(pid);
  const net = active + pend.filter(([, d]) => !d).length;
  if (!dropPid && net >= ROSTER_MAX) return 'Your roster is full: choose a player to release if the claim goes through';
  if (dropPid && pend.some(([, d]) => d === dropPid)) return 'That player is already tied to another claim';
  if (p.waiver.c.amt > capRoom(u) + (dropPid ? cutSavings(P(dropPid)) : 0)) return 'Not enough cap room to take on his contract';
  wv.claims[pid] = dropPid || 0;
  return null;
}
// an offer to a free agent during the waiver window: one year at his asking price, decided with everyone else's when claims are processed
function waiverOffer(pid, dropPid) {
  const p = P(pid), wv = state.wv, u = state.userTid;
  if (!wv || !p || p.tid !== -1 || p.waiver) return 'He is not a free agent';
  wv.offers = wv.offers || {};
  if (dropPid === null) { delete wv.offers[pid]; return null; }
  const active = rosterOf(u).filter(x => !onIR(x)).length, pend = wvPending(pid);
  if (!dropPid && active + pend.filter(([, d]) => !d).length >= ROSTER_MAX) return 'Your roster is full: choose a player to release if he signs';
  if (dropPid && pend.some(([, d]) => d === dropPid)) return 'That player is already tied to another move';
  if (p.ask > capRoom(u) + (dropPid ? cutSavings(P(dropPid)) : 0)) return 'Not enough cap room for his asking price';
  wv.offers[pid] = dropPid || 0;
  return null;
}
// a veteran with more than one offer goes where he sees the clearest path to playing, with a lean toward a winner and his old club
function vetAppeal(p, tid) {
  const ahead = rosterOf(tid).filter(x => x.pos === p.pos && !onIR(x) && x.id !== p.id && perOvr(x) >= perOvr(p) - 1).length, r = standings().find(x => x.tid === tid);
  return clamp((ROSTER_TEMPLATE[p.pos] - ahead) * 1.3, -5, 5) + (r ? (r.w + r.t * 0.5) / Math.max(1, r.w + r.l + r.t) * 2 : 1) + (p.lastTid === tid ? 1.5 : 0) + hashGauss(p.id, 600 + tid, state.season) * 1.5;
}
function wantForPS(pid, on) { const wv = state.wv; if (!wv) return; if (on) wv.want[pid] = 1; else delete wv.want[pid]; }
// award claims (worst record first), settle practice squads, start the season. Returns what happened to you.
function resolveWaivers() {
  const wv = state.wv, u = state.userTid, out = { won: [], lost: [], taken: [], ps: [], psLost: [] };
  wv.done = true; // releases from here on are ordinary
  const rank = tid => wv.prio.indexOf(tid), cleared = new Set();
  // 1. claims, worst record first. A club's claim is looked at again when its turn comes: it may have filled the spot already.
  for (const p of onWaivers().sort((a, b) => perOvr(b) - perOvr(a))) {
    const bids = (wv.ai[p.id] || []).map(([tid]) => ({ tid, ai: true }));
    if (wv.claims[p.id] !== undefined && !isAI(u)) bids.push({ tid: u, drop: wv.claims[p.id] });
    bids.sort((a, b) => rank(a.tid) - rank(b.tid));
    let winner = null;
    for (const b of bids) {
      if (b.ai) { const d = waiverDrop(p, b.tid); if (!d || p.waiver.c.amt > capRoom(b.tid) + cutSavings(d)) continue; b.drop = d.id; }
      const d = b.drop ? P(b.drop) : null;
      if (b.drop && (!d || d.tid !== b.tid)) continue; // the player he would have dropped is already gone
      if (!b.drop && rosterOf(b.tid).filter(x => !onIR(x)).length >= ROSTER_MAX) continue;
      if (d) releasePlayer(d.id);
      winner = b; break;
    }
    const mine = bids.find(b => b.tid === u), from = p.waiver.from;
    if (winner) {
      setTid(p, winner.tid); p.contract = Object.assign({}, p.waiver.c, { gtd: 0 }); if (!(p.contract.yrs > 0)) p.contract.yrs = 1; delete p.ask; delete p.waiver;
      if (typeof FO_MODELS !== 'undefined') delete FO_MODELS.m[winner.tid]; // its roster changed: the next look starts from the new one
      addNews(`${T(winner.tid).abbr} claimed ${p.lbl} ${pname(p)} off waivers from ${T(from).abbr}.`, [winner.tid, from], 'sign');
      if (winner.tid === u) out.won.push(p); else if (mine) out.lost.push({ p, to: winner.tid });
      if (from === u && winner.tid !== u) out.taken.push({ p, to: winner.tid, ps: wv.ps.includes(p.id) });
    } else { if (mine) out.lost.push({ p, to: null }); delete p.waiver; cleared.add(p.id); }
  }
  // 2. the veterans who were on the market all window (not the men who just cleared): every club's offers at once.
  //    A man you and a club both want picks the one he likes better.
  const offers = isAI(u) ? {} : (wv.offers || {}); out.offWon = []; out.offLost = [];
  const myOffer = p => { const dId = offers[p.id], d = dId ? P(dId) : null;
    if (dId && (!d || d.tid !== u)) return 'the player you would have released was already gone';
    if (!d && rosterOf(u).filter(x => !onIR(x)).length >= ROSTER_MAX) return 'your 53 was full';
    if (p.ask > capRoom(u) + (d ? cutSavings(d) : 0)) return 'you no longer had the cap room';
    if (d) releasePlayer(d.id);
    const err = signFA(p.id, u, 1); if (err) return err.toLowerCase();
    out.offWon.push(p); return null; };
  const deals = {}; if (!isAI(u) && typeof cutMarketOn === 'function' && cutMarketOn()) for (const pid in state.fa.off) { const o = state.fa.off[pid].find(x => x.tid === u); if (o) deals[pid] = o; }
  const myDeal = p => { const o = deals[p.id], dId = (wv.mdrop || {})[p.id], d = dId ? P(dId) : null;
    if (!o.night && faOfferValue(p, o) < faDemand(p, state.fa.day) * 0.97) return 'he turned your offer down';
    if (dId && (!d || d.tid !== u)) return 'the player you would have released was already gone';
    if (!d && rosterOf(u).filter(x => !onIR(x)).length >= ROSTER_MAX) return 'your 53 was full';
    if (faHit(o) > capRoom(u) + (d ? cutSavings(d) : 0)) return 'you no longer had the cap room';
    if (d) releasePlayer(d.id);
    faSign(p, o); out.offWon.push(p); return null; };
  const ext = isAI(u) ? null : { tid: u, ids: new Set([...Object.keys(offers), ...Object.keys(deals)].map(Number)), lost: {},
    choose: (p, tid) => deals[p.id] ? faOfferValue(p, deals[p.id]) >= faOfferValue(p, cutAIOffer(p, tid)) : vetAppeal(p, u) >= vetAppeal(p, tid),
    sign: p => !(deals[p.id] ? myDeal(p) : myOffer(p)) };
  const foOn = typeof foShop === 'function' && FO.on !== false;
  if (foOn) foShop('cut', null, { skip: cleared, ext });
  if (ext) for (const id of ext.ids) { const p = P(id); if (!p) continue;
    if (p.tid === -1) { const why = deals[p.id] ? myDeal(p) : myOffer(p); if (why) out.offLost.push({ p, why }); }
    else if (p.tid !== u && !out.offWon.includes(p)) out.offLost.push({ p, why: p.tid >= 0 ? `he chose ${T(p.tid).abbr}` : 'he went elsewhere' }); }
  if (typeof cutMarketClose === 'function') cutMarketClose();
  // 3. practice squads: every club's own cuts it asked for come back first (yours too), then your targets, then the open market
  { const r = psMarket([...wv.ps, ...Object.keys(wv.want).map(Number)]); out.ps.push(...r.got); out.psLost.push(...r.lost); } // nobody is signed to your practice squad for you
  // 4. any holes left on the 53, from whoever is still unsigned. Not yours: you fill your own roster.
  if (foOn) foShop('cut');
  for (const t of state.teams) if (isAI(t.id)) fillRoster(t.id, foOn && (!FO.extra || FO.extra(t.id)) ? ROSTER_MIN : ROSTER_TEMPLATE);
  CAP_ALL = true; // from here every contract counts
  for (const t of state.teams) if (isAI(t.id)) fixCap(t.id);
  if (typeof aiAdvance === 'function') for (const t of state.teams) if (isAI(t.id)) aiAdvance(t.id); // well under what it means to spend: pay ahead
  CAP_ALL = false;
  refreshChart(u);
  state.wv = null;

  // trim free agent pool
  // The street keeps its best veterans, and the young men who went to a camp and did not stick: they are next summer's camp bodies.
  const fas = Object.values(state.players).filter(p => p.tid === -1).sort((a, b) => perOvr(b) - perOvr(a)), keep = new Set(), yq = {};
  fas.forEach((p, i) => { if (i < 160 && perOvr(p) >= 45 && p.age < 36) keep.add(p.id); });
  for (const p of fas.filter(p => p.age <= STREET_AGE && p.exp <= 2).sort((a, b) => perOvr(b) + (b.per ? b.per.g : 0) * 0.5 - perOvr(a) - (a.per ? a.per.g : 0) * 0.5)) { if ((yq[p.pos] || 0) < STREET_KEEP[p.pos]) { yq[p.pos] = (yq[p.pos] || 0) + 1; keep.add(p.id); } }
  for (const pos of ['K', 'P']) fas.filter(p => p.pos === pos && p.age < 38).slice(0, 6).forEach(p => keep.add(p.id)); // there is always a leg to bring in
  fas.forEach(p => { if (!keep.has(p.id)) delete state.players[p.id]; }); rostersDirty();
  state.season++;
  state.week = 1; state.phase = 'REG';
  if (!isAI(u) && capRoom(u) < 0) addNews(`Every contract counts against the cap now that the season is here, and you are ${fmtMoney(-capRoom(u))} over. You cannot add anyone until you clear room.`, [u]);
  updateSystems();
  state.games = {}; state.playoffs = null; state.draft = null;
  for (const p of Object.values(state.players)) { p.stats = {}; }
  ensurePicks();
  state.schedule = genSchedule();
  ensureDraftClass(state.season + 1); // next spring's class is on the board all year
  refreshPerception();
  seasonStartSnapshot();
  practiceWeekAll(); // the week before the opener
  addNews(`The ${state.season} regular season is underway.`);
  return out;
}

// ---------- waivers during the season ----------
// Claims settle before each week's games (and each playoff round): last season's order through week 3, then the current
// standings, worst first. A club claims only a clear upgrade, a little clearer than in the summer: turning a spot over mid-year costs.
function waiverPrioNow() {
  if (state.phase === 'REG' && state.week <= 3 && state.wvPrio && state.wvPrio.length === state.teams.length) return state.wvPrio;
  const pct = r => (r.w + r.t * 0.5) / Math.max(1, r.w + r.l + r.t);
  return standings().slice().sort((a, b) => pct(a) - pct(b) || (a.pf - a.pa) - (b.pf - b.pa)).map(r => r.tid);
}
function inSeasonWaivers() {
  const pool = onWaivers(); if (!pool.length) return null;
  const u = state.userTid, iw = state.iw || (state.iw = { claims: {}, ps: [] }), prio = waiverPrioNow(), rank = tid => prio.indexOf(tid);
  const out = { wk: state.week, round: state.phase === 'PLAYOFFS', won: [], lost: [], taken: [], cleared: [], ps: [] };
  for (const p of pool.sort((a, b) => perOvr(b) - perOvr(a))) {
    const from = p.waiver.from, bids = state.teams.filter(t => isAI(t.id) && t.id !== from).map(t => ({ tid: t.id, ai: true }));
    if (iw.claims[p.id] !== undefined && !isAI(u) && from !== u) bids.push({ tid: u, drop: iw.claims[p.id] });
    bids.sort((a, b) => rank(a.tid) - rank(b.tid));
    let win = null;
    for (const b of bids) {
      if (b.ai) { if (p.waiver.c.amt > capRoom(b.tid) + 2) continue; const d = waiverDrop(p, b.tid); if (!d || p.waiver.c.amt > capRoom(b.tid) + cutSavings(d)) continue; b.drop = d.id; }
      const d = b.drop ? P(b.drop) : null;
      if (b.drop && (!d || d.tid !== b.tid)) continue; // the man he would have dropped is already gone
      if (!b.drop && activeCount(b.tid) >= ROSTER_MAX) continue;
      if (!b.ai && p.waiver.c.amt > capRoom(u) + (d ? cutSavings(d) : 0)) continue;
      if (d) releasePlayer(d.id); // he goes on waivers himself, for next week
      win = b; break;
    }
    const mine = bids.find(b => b.tid === u);
    if (win) {
      setTid(p, win.tid); p.contract = Object.assign({}, p.waiver.c, { gtd: 0 }); if (!(p.contract.yrs > 0)) p.contract.yrs = 1; delete p.ask; delete p.waiver;
      if (typeof FO_MODELS !== 'undefined') delete FO_MODELS.m[win.tid];
      addNews(`${T(win.tid).abbr} claimed ${p.lbl} ${pname(p)} off waivers from ${T(from).abbr}.`, [win.tid, from], 'sign');
      if (win.tid === u) out.won.push(p); else if (mine) out.lost.push({ p, to: win.tid });
      if (from === u) out.taken.push({ p, to: win.tid });
    } else {
      delete p.waiver; if (mine) out.lost.push({ p, to: null });
      if (from !== u && isAI(from) && p.promPS && p.promPS.tid === from && p.promPS.s === state.season) signToPS(p.id, from); // back to the squad he came up from
      if (from === u) { out.cleared.push(p); if (iw.ps.includes(p.id) && !signToPS(p.id, u)) { out.ps.push(p); addNews(`${pname(p)} cleared waivers and signed to your practice squad.`, [u], 'sign'); } }
    }
  }
  iw.claims = {}; iw.ps = [];
  iw.last = out.won.length || out.lost.length || out.taken.length || out.cleared.length ? out : null;
  return out;
}
function iwClaim(pid, dropPid) {
  const p = P(pid), u = state.userTid, iw = state.iw || (state.iw = { claims: {}, ps: [] });
  if (!p || !p.waiver) return 'He is not on waivers';
  if (p.waiver.from === u) return 'You waived him';
  if (dropPid === null) { delete iw.claims[pid]; return null; }
  const pend = Object.entries(iw.claims).filter(([id]) => +id !== pid);
  if (!dropPid && activeCount(u) + pend.filter(([, d]) => !d).length >= ROSTER_MAX) return 'Your roster is full: choose a player to release if the claim goes through';
  if (dropPid && pend.some(([, d]) => d === dropPid)) return 'That player is already tied to another claim';
  if (p.waiver.c.amt > capRoom(u) + (dropPid ? cutSavings(P(dropPid)) : 0)) return 'Not enough cap room to take on his contract';
  iw.claims[pid] = dropPid || 0; return null;
}

// ---------- in-season AI ----------
function inSeasonMoves() {
  if (typeof shutDowns === 'function') for (const t of state.teams) shutDowns(t.id);
  for (const p of Object.values(state.players)) if (p.tid === -1 && !p.waiver && p.ask > MIN_SALARY) p.ask = round2(Math.max(MIN_SALARY, p.ask * 0.92)); // a man still unsigned in season takes less each week
  psPoaching();
  if (typeof foShop === 'function') foShop('week', tid => (tid + state.week) % 3 === 0); // each club takes a look at the street every third week
  psPromotions(state.userTid);
  for (const t of state.teams) {
    if (!isAI(t.id)) continue;
    if (psOf(t.id).length < PS_MAX) fillPS(t.id); // a spot that opens is filled by the next week
    if (typeof foInjuryMoves === 'function' && FO.on !== false && (!FO.extra || FO.extra(t.id))) foInjuryMoves(t.id); // the man who fixes the hole an injury left, from the street or the practice squad
    psPromotions(t.id); // then the old head counts, as a backstop: nobody lines up short
    for (const pos of POSITIONS) {
      const healthy = rosterOf(t.id).filter(p => p.pos === pos && !p.injury).length;
      const need = LINEUP_NEED[pos] + (pos === 'QB' ? 1 : 0);
      if (healthy >= need || elevationCovers(t.id, pos)) continue;
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

// ---------- positional comfort through the year ----------
// spots he didn't play this season fade a little (never his primary)
function comfortOffseason(p) {
  if (!p.cf) return;
  for (const s in p.cf) {
    if (s === p.spot || (p.spSeason && p.spSeason[s] >= 40)) continue;
    p.cf[s] = Math.max(0, Math.round((p.cf[s] - 4) * 10) / 10);
    if (!p.cf[s]) delete p.cf[s];
  }
  p.spSeason = {};
}
// which spots a player cross-trains at in camp: your depth chart decides for your team; AI staffs pick a neighbor he could help at
function campFocus(p) {
  if (p.tid === state.userTid && !isAI(p.tid)) { const s = userDepthSpots(p); if (p.xt && !s.includes(p.xt)) s.unshift(p.xt); if (s.length) return s; }
  if (p.age >= 30) return [];
  const nb = (SPOT_NEIGHBORS[p.spot] || []).filter(s => comfortOf(p, s) < 85);
  // staffs cross-train where the roster is thin first
  const needy = nb.filter(s => p.tid >= 0 && spotDeficit(p.tid, s) > 0).sort((a, b) => spotRating(p, b) - spotRating(p, a));
  if (needy.length && rand() < 0.6) return [needy[0]];
  if (rand() > 0.3) return [];
  nb.sort((a, b) => spotRating(p, b) - spotRating(p, a));
  return nb.length ? [nb[0]] : [];
}
function trainingCamp() {
  for (const p of Object.values(state.players)) {
    if (!p.a || (p.tid < 0 && p.tid !== -3)) continue;
    const L = learnRate(p);
    let changed = false;
    pbLearn(p, 0.9, 0, 5); // install: camp is worth about five weeks of work
    if (comfortOf(p, p.spot) < 100 && learnSpot(p, p.spot, 30 * L)) changed = true;
    for (const s of campFocus(p)) if (s !== p.spot && learnSpot(p, s, 30 * L)) changed = true;
    updateRatings(p);
  }
}

// how much the young players (26 and under) on each side of the ball improved this offseason, credited to that staff
function logDevelopment(before) {
  const acc = {};
  for (const id in before) {
    const p = state.players[id];
    if (!p || p.tid < 0) continue;
    const side = SPOTS[p.spot].side === 'off' ? 'O' : SPOTS[p.spot].side === 'def' ? 'D' : 'S';
    const k = p.tid + side, a = acc[k] || (acc[k] = { n: 0, sum: 0, jumps: 0 });
    const d = p.ovr - before[id]; a.n++; a.sum += d; if (d >= 5) a.jumps++;
    const pc = posCoach(p.tid, p.pos); // the position coach's own track record
    if (pc) { const tr = pc.tr || (pc.tr = { n: 0, sum: 0, jumps: 0 }); tr.n++; tr.sum = round2(tr.sum + d); if (d >= 5) tr.jumps++; }
  }
  for (const t of state.teams) {
    const log = (c, side) => { if (!c) return; const a = side === 'ALL' ? ['O', 'D', 'S'].reduce((x, s) => { const v = acc[t.id + s]; return v ? { n: x.n + v.n, sum: x.sum + v.sum, jumps: x.jumps + v.jumps } : x; }, { n: 0, sum: 0, jumps: 0 }) : acc[t.id + side]; if (!a || !a.n) return; c.dev = [...(c.dev || []).slice(-9), { s: state.season, tid: t.id, n: a.n, avg: Math.round(a.sum / a.n * 10) / 10, jumps: a.jumps }]; };
    log(C(t.oc), 'O'); log(C(t.dc), 'D'); log(C(t.stc), 'S'); log(C(t.sc), 'ALL'); log(C(t.hc), 'ALL');
  }
}

// ---------- spot-level needs (comfort makes specific spots matter, not just position groups) ----------
const SPOT_NEED = { QB: 2, RB: 2, FB: 1, WRX: 2, WRZ: 2, SLOT: 2, TEY: 2, TEH: 1, LT: 2, LG: 1, C: 2, RG: 1, RT: 2, NT: 1, DT: 2, DE: 2, EDGE: 3, MLB: 2, WLB: 2, CB: 3, NCB: 2, FS: 1, SS: 1, K: 1, P: 1 };
// the defensive front decides which line spots a team actually needs
function spotNeedFor(tid, spot) {
  const odd = ['3-4', 'Tite'].includes(defTend(T(tid)).front);
  if (spot === 'DE') return odd ? 3 : 1;
  if (spot === 'DT') return odd ? 1 : 3;
  if (spot === 'NT') return odd ? 2 : 1;
  return SPOT_NEED[spot] || 1;
}
function spotDeficit(tid, spot) {
  let n = 0;
  for (const p of rosterOf(tid)) if (p.a && !onIR(p) && comfortOf(p, spot) >= 60) n++;
  return Math.max(0, spotNeedFor(tid, spot) - n);
}
// a player fills a need at his primary spot or any spot he's comfortable at
function spotNeedBonus(tid, p) {
  let best = 0;
  for (const s in (p.cf || { [p.spot]: 100 })) if (comfortOf(p, s) >= 60) best = Math.max(best, spotDeficit(tid, s));
  return best;
}

// the draft class for a given spring (created once; visible and scouted all season)
function ensureDraftClass(year, deep) {
  const have = Object.values(state.players).filter(p => p.tid === -2 && p.draftYear === year).length;
  for (let i = have; i < CLASS_DRAFT; i++) genProspect(year);
  if (deep) for (let i = Math.max(have, CLASS_DRAFT); i < CLASS_DRAFT + CLASS_DEPTH; i++) genProspect(year, true); // the rest of the class declares once the season is over
}
// Newer modules are pulled in from here rather than listed in index.html, so a browser holding an older copy of that page still loads a complete game.
if (typeof document !== 'undefined' && typeof foCutPlan === 'undefined') document.write('<script src="js/frontoffice.js?v=' + Date.now() + '"></script>');
