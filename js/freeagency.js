'use strict';
// =====================================================================
//  FREE AGENCY AS A MARKET (DESIGN §51)
//  The league prices the player (an expected yearly value, shown as a range). Clubs compete with binding offers over a run of
//  days and never see each other's numbers. Every player has an agent; the user negotiates in a sit-down with three steps:
//  length and signing bonus, then salary and how it is spread, with incentives as an optional sweetener.
//  Nobody names a role: the agent reads the club's depth chart himself.
//
//  state.fa = { day, in: {pid: 1}, off: {pid: [offer]}, talks: {pid: talk}, heat: {pos: x}, win: {tid: pct}, inbox: [text], orders: {pid: order}, over }
//  offer    = { tid, yrs, gtd (the signing bonus), aav (yearly value: salary plus the bonus's yearly share), sal?, load ('even'|'front'|'back'),
//               inc?: [{ k, th, amt }], incL (incentives that count now), jobs, role, share, newPos, day, dl?, night? }
//             role is what naming those jobs means given who the club already has there: 'start' (his to lose), 'compete', 'depth'
//  state.agents = [{ id, first, last, w (how many clients he tends to have), d: [open, honest, patience, security, memory, client] }]
//  state.agentHist = { agentId: [{ s, n, r ('signed'|'lost'|'walked'|'pulled'), aav, ask }] }   the user's own dealings with him
// =====================================================================
const FA_DAYS = 8, AGENT_N = 46, FA_MARKET_MIN = 1.6; // a player expected to earn under 1.6x the minimum signs without a negotiation

function faHash(a, b) { const x = Math.sin(a * 127.1 + b * 311.7 + 13.37) * 43758.5453; return x - Math.floor(x); }

// ---------- agents ----------
// Agents are the only people in the league who can be women: these names are used for nobody else.
const AGENT_F_NAMES = ('Alicia Amanda Andrea Angela Bianca Camille Carmen Catherine Christine Claire Dana Danielle Diane Elena Erin Gabrielle Grace Hannah Isabel Jasmine Jennifer Joanna Julia Karen Kendra Lauren Leah Lisa Maria Megan Michelle Monica Naomi Natalie Nicole Olivia Paige Rachel Rebecca Renee Sandra Sarah Simone Stephanie Tanya Teresa Valerie Vanessa Veronica Whitney').split(' ');
function agentAge(a) { return state.season - a.born; }
function agentFill(a) { // older saves: agents made before they had an age
  if (a.born === undefined) a.born = state.season - randInt(31, 66);
  if (a.sex === undefined) { a.sex = rand() < 0.35 ? 'f' : 'm'; if (a.sex === 'f') a.first = pick(AGENT_F_NAMES); }
}
function ensureAgents() {
  if (state.agents && state.agents.length) { if (state.agents[0].born === undefined) state.agents.forEach(agentFill); state.agentHist = state.agentHist || {}; return; }
  state.agents = [];
  for (let i = 0; i < AGENT_N; i++) {
    const sex = rand() < 0.35 ? 'f' : 'm', nm = randomName(), last = nm[1], first = sex === 'f' ? pick(AGENT_F_NAMES) : nm[0];
    state.agents.push({ id: i, first, last, sex, born: state.season - randInt(31, 66), w: i < 3 ? 7 : i < 8 ? 4 : i < 18 ? 2 : 1, d: [0, 0, 0, 0, 0, 0].map(() => round2(rand())) });
  }
  state.agentHist = state.agentHist || {};
}
function agentOf(p) {
  ensureAgents();
  if (p.agent === undefined || !state.agents[p.agent]) p.agent = weightedPick(state.agents, state.agents.map(a => a.w)).id;
  return state.agents[p.agent];
}
function agentName(a) { return a.first + ' ' + a.last; }
function agentClients(a) { return Object.values(state.players).filter(p => p.agent === a.id && (p.tid >= 0 || p.tid === -1) && perOvr(p) >= 70).sort((x, y) => perOvr(y) - perOvr(x)); }
function agentNote(a, p, r, aav, ask) {
  const h = state.agentHist[a.id] || (state.agentHist[a.id] = []);
  h.push({ s: state.season, n: pname(p), r, aav: aav || 0, ask: ask || 0, d: state.fa ? state.fa.day : 0 }); if (h.length > 8) h.shift();
}
// how he feels about the user from past dealings: positive is a grudge
function agentGrudge(a) {
  const h = (state.agentHist && state.agentHist[a.id] || []).filter(x => x.s >= state.season - 2);
  return clamp(h.reduce((s, x) => s + (x.r === 'walked' || x.r === 'pulled' ? 1 : x.r === 'signed' ? -0.6 : 0), 0) * a.d[4], -1.5, 3);
}

// ---------- what the league thinks he is worth ----------
function faExp(p) { return round2(Math.max(MIN_SALARY, marketValue(p) * (state.fa && state.fa.heat && state.fa.heat[p.pos] || 1))); }
function faRange(p) { const e = faExp(p); return [round2(Math.max(MIN_SALARY, e * 0.9)), round2(Math.max(MIN_SALARY, e * 1.1))]; }
function faInMarket(p) { return !!(state.fa && !state.fa.over && state.fa.in[p.id] && p.tid === -1); }
// Three kinds of negotiation sit at the same table: a free agent on the market, one of your own players whose deal is up, and an
// extension for a man entering his last year. Only the first has other clubs in it.
function negMode(p) { const u = state.userTid; return !p ? null : faInMarket(p) ? 'fa' : p.tid === u && p.expiring && state.phase === 'RESIGN' ? 'resign' : p.tid === u && !p.expiring && extensionDue(p) && !(p.contract.role && p.contract.role.s === state.season + 1 && state.phase !== 'REG') ? 'extend' : null; } // not a deal signed this same offseason
function negTalks(mode) { if (mode === 'fa') return state.fa.talks; return (state.neg || (state.neg = { talks: {} })).talks; }
function negTalkOf(p) { const m = negMode(p); return m ? negTalks(m)[p.id] || null : null; }
function negStamp() { return state.season + ':' + state.phase + ':' + (state.week || 0); }
// what he would really take from his own club, a year: his asking price, a little more with an agent who opens high
function negTarget(p, mode) { const a = agentOf(p); return mode === 'extend' ? extensionAsk(p).amt : round2((p.ask || marketValue(p)) * (0.97 + a.d[0] * 0.04)); }
function negFloor(p) { return negMode(p) === 'fa' ? faFloor(p, state.fa.day) : faTrue(p) * 0.97; }
// a known commodity: the league sees a starter, or he has just been one
function faProven(p) {
  if (['Elite', 'All-Pro', 'Starter'].includes(tierOf(p))) return true;
  const r = p.career && p.career[p.career.length - 1];
  return !!(r && r.season >= state.season - 1 && (r.gs || 0) >= 8);
}
// what he cares about besides money: two or three things, fixed for the player
function faWants(p) {
  const w = [], h = k => faHash(p.id, k), r = p.career && p.career[p.career.length - 1];
  if (p.age <= 26 && !faProven(p) && h(1) < 0.55) w.push('prove');
  if (p.age <= 31 && h(2) < 0.5) w.push('start');
  if (h(3) < (p.age >= 29 ? 0.6 : 0.18)) w.push('win');
  if (p.lastTid >= 0 && h(4) < 0.28) w.push('home');
  if (h(5) < 0.3) w.push('fit');
  if (h(6) < (p.age >= 29 ? 0.5 : 0.2) && !w.includes('prove')) w.push('secure');
  return w.slice(0, 3);
}
const FA_WANT_TXT = { prove: 'wants a short deal to prove himself', start: 'wants a starting job', win: 'wants to play for a contender', home: 'would like to stay where he was', fit: 'wants a system that suits him', secure: 'wants security' };
function faWinPct(tid) { return state.fa && state.fa.win && state.fa.win[tid] !== undefined ? state.fa.win[tid] : 0.5; }
// ---------- the jobs a club can name ----------
// Nobody promises a starting place. A club names the job (or two) it has in mind on its own depth chart, and the agent looks at who
// is already there: an open job, a competition, or a seat behind an established man. Some jobs are only part of the snaps.
const FA_JOB_SHARE = { RB3D: 0.3, RBSY: 0.15, RUSHE: 0.4, RUSHI: 0.35, WLBP: 0.35, NCBP: 0.35, FB: 0.25, SLOT2: 0.12, Y2: 0.12, OL6: 0.05, DIME: 0.3, SAM: 0.45, H: 0.5, NCB: 0.8 };
const FA_JOB_ROWS = CHART_SECTIONS.filter(x => x.unit !== 'st').flatMap(x => x.rows).concat([['K', 'Kicker'], ['P', 'Punter']]);
function faJobLabel(k) { const r = FA_JOB_ROWS.find(x => x[0] === k); return r ? r[1].replace(/ \(.*\)$/, '') : k; }
function faJobSay(k) { const l = faJobLabel(k); return /^[A-Z] /.test(l) || /^\d/.test(l) || /^(Mike|Will|Sam) /.test(l) ? l : l[0].toLowerCase() + l.slice(1); } // mid-sentence: 'slot receiver', but 'Z receiver'
function faJobAx(k) { return LINE_ROLE_AX[k] !== undefined ? LINE_ROLE_AX[k] : k === 'RUSHI' ? 1.35 : k === 'RUSHE' ? 3 : null; }
function faJobSpot(k) { return k === 'K' || k === 'P' ? k : CHART_SPOT[k] || null; }
function faJobComfort(p, k) { const ax = faJobAx(k); return ax !== null ? lineComfort(p, ax) : faJobSpot(k) ? comfortOf(p, faJobSpot(k)) : 0; }
function faJobRate(p, k, base) { const ax = faJobAx(k), sp = faJobSpot(k); return base + (ax !== null ? lineSlotRating(p, ax) : sp ? slotRating(p, sp) : p.ovr) - p.ovr; }
// The jobs this club can name for him: the same jobs, under the same names and in the same order, as its depth chart shows for
// his part of the team (only the ones its systems use), plus any job elsewhere that he is at least passable at.
const FA_JOB_GROUPS = [
  [['QB', 'RB'], ['QB', 'RB', 'FB', 'RB3D', 'RBSY']], [['WR'], ['X', 'Z', 'SLOT', 'SLOT2']], [['TE'], ['Y', 'H', 'Y2']], [['OL'], ['LT', 'LG', 'C', 'RG', 'RT', 'OL6']],
  [['DL'], ['NOSE', 'SHADE', 'T3', 'END', 'WIDE', 'OLB', 'RUSHE', 'RUSHI']], [['LB'], ['MLB', 'WLB', 'SAM', 'OLB', 'WLBP', 'RUSHE']], [['CB', 'S'], ['CB', 'NCB', 'DIME', 'FS', 'SS', 'NCBP']], [['K'], ['K']], [['P'], ['P']],
];
function faJobsFor(tid, p) {
  const t = T(tid), dj = defJobs(t).n, side = SPOTS[p.spot].side, onChart = k => {
    const ax = faJobAx(k), sp = faJobSpot(k); if (ax === null && !sp) return false;
    const def = ax !== null || (sp && SPOTS[sp] && SPOTS[sp].side === 'def');
    return !def || dj[k] || ['RUSHE', 'RUSHI', 'WLBP', 'NCBP'].includes(k); }; // not every front has a nose or a Sam
  const own = (FA_JOB_GROUPS.find(g => g[0].includes(p.pos)) || [[], []])[1].filter(onChart);
  if (p.pos === 'QB') return own.filter(k => k === 'QB'); if (p.pos === 'RB') return own.filter(k => k !== 'QB' && (k !== 'FB' || p.spot === 'FB' || faJobComfort(p, k) >= 30));
  const extra = FA_JOB_ROWS.map(x => x[0]).filter(k => !own.includes(k) && onChart(k) && k !== 'K' && k !== 'P' && faJobSpot(k) !== 'QB'
    && (side === 'def') === (faJobAx(k) !== null || SPOTS[faJobSpot(k)].side === 'def') && faJobComfort(p, k) >= 30);
  return [...own, ...extra];
}
// the job among those that suits him best: where an offer starts unless the club says otherwise
function faBestJob(tid, p) { return faJobsFor(tid, p).slice().sort((a, b) => faJobRate(p, b, 0) + faJobComfort(p, b) * 0.05 - faJobRate(p, a, 0) - faJobComfort(p, a) * 0.05)[0] || null; }
// who is there now, and what naming this job means to the man being offered it (the league's view of everyone, as an agent sees it)
function faJobStanding(tid, p, k) {
  const t = T(tid), ch = ensureChart(tid), n = (defJobs(t).n[k] || 1), here = (ch.lists[k] || []).map(id => P(id)).filter(q => q && q.tid === tid && !q.expiring && q.id !== p.id);
  const mine = faJobRate(p, k, perOvr(p)), sorted = here.map(q => ({ q, r: faJobRate(q, k, perOvr(q)) })).sort((a, b) => b.r - a.r), bar = sorted[n - 1];
  const lvl = !bar || mine >= bar.r + 3 ? 'start' : mine >= bar.r - 3 ? 'compete' : 'depth';
  return { lvl, who: bar ? bar.q : null, share: FA_JOB_SHARE[k] !== undefined ? FA_JOB_SHARE[k] : 1, comfort: faJobComfort(p, k) };
}
// one or two jobs named together: the better standing, the snaps of both
function faJobsRead(tid, p, jobs) {
  const st = jobs.filter(Boolean).slice(0, 2).map(k => Object.assign({ k }, faJobStanding(tid, p, k))); if (!st.length) return null;
  const rank = { start: 2, compete: 1, depth: 0 }, best = st.slice().sort((a, b) => rank[b.lvl] - rank[a.lvl] || b.share - a.share)[0];
  return { role: best.lvl, who: best.who, share: Math.min(1, st.reduce((s2, x) => s2 + x.share, 0)), newPos: st[0].comfort < 55, st };
}
function faEveryDown(p) { const r = p.career && p.career[p.career.length - 1]; return faProven(p) || !!(r && r.season >= state.season - 1 && (r.gs || 0) >= 8); }
// some players have a job in mind, not just a place: the receiver who wants to play outside, the end who wants to stand up
const FA_JOB_PREF = { WRX: ['X', 'Z'], WRZ: ['Z', 'X'], SLOT: ['SLOT'], EDGE: ['WIDE', 'OLB'], DE: ['END'], DT: ['T3'], NT: ['NOSE'], CB: ['CB'], NCB: ['NCB'], FS: ['FS'], SS: ['SS'], MLB: ['MLB'], WLB: ['WLB'], RB: ['RB'], TEY: ['Y'], TEH: ['H'] };
function faWantJob(p) { const l = FA_JOB_PREF[p.spot]; return l && faHash(p.id, 8) < 0.4 ? l[Math.floor(faHash(p.id, 9) * l.length)] : null; }

// the share of the deal he expects guaranteed, and the length he has in mind once he knows the role
function faGtdWant(p, yrs) {
  // the share of the deal he expects as a signing bonus: the money that is his whatever happens
  const t = tierOf(p); let s = { Elite: 0.36, 'All-Pro': 0.3, Starter: 0.22, Rotation: 0.13, Backup: 0.13, Depth: 0.06 }[t] || 0.03;
  if (p.age >= 31) s *= 0.75; if (yrs <= 1) s = Math.max(s, 0.25);
  return clamp(s, 0, 1);
}
function faPrefYears(p, role, share) {
  let y = prefYears(p);
  if ((!faProven(p) && (role === 'start' || role === 'compete') && (share === undefined || share >= 0.6)) || faWants(p).includes('prove')) y = Math.min(y, 2); // he bets on himself: prove it, then get paid
  return y;
}
// The player's own number: the yearly value he would sign for today. It softens as the market passes him by; stars hold longer.
function faFloor(p, day) {
  const lev = leverageOf(p), d = Math.max(0, day - (lev >= 0.8 ? 2 : lev >= 0.55 ? 1 : 0));
  return round2(Math.max(MIN_SALARY, faExp(p) * Math.max(0.6, 0.96 - 0.05 * d)));
}
// where the agent opens, and what he would really take today
function faAsk(p) { const a = agentOf(p); return round2(Math.max(MIN_SALARY, faExp(p) * (1.08 + a.d[0] * 0.2))); }
function faDemand(p, day) {
  const a = agentOf(p), fl = faFloor(p, day), ask = faAsk(p), span = 2 + a.d[2] * 5;
  return round2(fl + (ask - fl) * Math.max(0, 1 - day / span) * 0.55);
}
// What an offer is worth to him, as a yearly figure: the money, bent by length, guarantee, when it is paid, and what he cares about.
function faOfferValue(p, o) {
  const a = agentOf(p), lev = leverageOf(p), wants = faWants(p), py = faPrefYears(p, o.role, o.share), dev = o.yrs - py;
  let v = o.aav + incWorth(p, o.inc);
  if (dev < 0) v *= 1 - Math.min(0.2, -dev * 0.035 * (0.5 + lev));
  else if (dev > 0) v *= p.age >= 30 || lev < 0.3 ? 1 + 0.01 * dev : 1 - Math.min(0.2, dev * 0.03 * (0.5 + lev));
  const gs = o.aav * o.yrs > 0 ? o.gtd / (o.aav * o.yrs) : 0, g0 = faGtdWant(p, o.yrs), gd = clamp(gs - g0, -0.5, 0.5);
  v *= 1 + gd * (0.12 + a.d[3] * 0.2 + (p.age >= 30 ? 0.06 : 0) + (o.newPos ? 0.1 : 0) + (wants.includes('secure') ? 0.1 : 0));
  if (o.yrs >= 2 && o.load && o.load !== 'even') v *= 1 + (o.load === 'front' ? 1 : -1) * 0.012 * (1 + a.d[3]);
  if (faProven(p)) v *= o.role === 'depth' ? 0.85 : o.role === 'compete' ? 0.97 : 1; // a starter asked to sit, or to win a job he thinks is his
  if (o.newPos) v *= 0.97;                                                            // a new position is a risk to his next contract
  if (o.share !== undefined && o.share < 0.6 && faEveryDown(p)) v *= 0.9 + 0.1 * o.share / 0.6; // a part-time job for a man who has played every down
  if (wants.includes('start')) v *= o.role === 'start' ? 1.05 : o.role === 'compete' ? 0.99 : 0.93;
  // The job he has in mind. Being offered it is worth something; being told he will also play somewhere else takes that away and more:
  // a man who sees himself outside does not want to hear about the slot. And nobody likes a second job he cannot yet play.
  { const wj = faWantJob(p); if (wj && o.jobs) { v *= o.jobs.includes(wj) ? 1.03 : 0.98; if (o.jobs.some(k => k !== wj)) v *= 0.965; } }
  if (o.jobs && o.jobs.length > 1 && faJobComfort(p, o.jobs[1]) < 55) v *= 0.985;
  if (wants.includes('win')) v *= 1 + clamp((faWinPct(o.tid) - 0.5) * 0.22, -0.06, 0.08);
  if (wants.includes('home') && o.tid === p.lastTid) v *= 1.05;
  if (wants.includes('fit')) v *= 1 + clamp(schemeFit(p, o.tid) * 0.012, -0.04, 0.05);
  if (wants.includes('prove')) v *= o.yrs <= 2 ? 1.04 : 1 - 0.03 * (o.yrs - 2);
  return v;
}
function faWantsMet(p, o) {
  const w = faWants(p); let n = 0;
  if (w.includes('start') && o.role === 'start') n++; if (w.includes('win') && faWinPct(o.tid) >= 0.56) n++; if (w.includes('home') && o.tid === p.lastTid) n++;
  if (w.includes('fit') && schemeFit(p, o.tid) >= 1) n++; if (w.includes('prove') && o.yrs <= 2) n++; if (w.includes('secure') && o.gtd >= faGtdWant(p, o.yrs) * o.aav * o.yrs) n++;
  return n;
}

// ---------- incentives ----------
// Extra money if he reaches a mark. The league's own rule decides the cap: a mark he reached last season is "likely to be earned" and
// counts against this year's cap from the day he signs; one he did not reach is "not likely" and counts nothing now. After the season
// one adjustment lands on the next year's cap: plus the unlikely ones he hit, minus the likely ones he missed.
const INC_STAT = { gs: ['games started', 'starts {n} games', 'start {n} games'], passY: ['passing yards', 'throws for {n} yards', 'throw for {n} yards'], passTD: ['touchdown passes', 'throws {n} touchdown passes', 'throw {n} touchdown passes'], rushY: ['rushing yards', 'rushes for {n} yards', 'rush for {n} yards'],
  rec: ['catches', 'catches {n} passes', 'catch {n} passes'], recY: ['receiving yards', 'has {n} receiving yards', 'have {n} receiving yards'], sck: ['sacks', 'has {n} sacks', 'record {n} sacks'], dint: ['interceptions', 'intercepts {n} passes', 'intercept {n} passes'], tkl: ['tackles', 'makes {n} tackles', 'make {n} tackles'],
  pb: ['a Pro Bowl', 'makes the Pro Bowl', 'be selected to the Pro Bowl'], ap: ['first-team All-Pro', 'is named first-team All-Pro', 'be named first-team All-Pro'] };
const INC_MENU = {
  QB: { gs: [12, 16], passY: [3500, 4000, 4500], passTD: [25, 30, 35] }, RB: { gs: [10, 14], rushY: [700, 1000, 1300], rec: [40, 60] },
  WR: { gs: [10, 14], rec: [50, 70, 90], recY: [600, 900, 1200] }, TE: { gs: [10, 14], rec: [40, 60, 80], recY: [500, 750, 1000] }, OL: { gs: [10, 14, 17] },
  DL: { gs: [10, 14], sck: [6, 9, 12], tkl: [40, 60] }, LB: { gs: [10, 14], tkl: [80, 110, 140], sck: [5, 8] }, CB: { gs: [10, 14], dint: [3, 5], tkl: [60, 90] }, S: { gs: [10, 14], dint: [3, 5], tkl: [60, 90] }, K: {}, P: {},
};
function incOptions(p) { const m = INC_MENU[p.pos] || {}, out = []; for (const k in m) for (const th of m[k]) out.push({ k, th }); out.push({ k: 'pb', th: 1 }, { k: 'ap', th: 1 }); return out; }
function incLabel(x, base) { return INC_STAT[x.k][base ? 2 : 1].replace('{n}', x.th >= 1000 ? x.th.toLocaleString('en-US') : x.th); } // base: the form a contract uses ("should Player start 10 games")
function incRow(p, season) { return (p.career || []).find(r => r.season === season) || null; }
function incValue(p, k, season) {
  if (k === 'pb' || k === 'ap') return (p.awards || []).includes(season + (k === 'pb' ? ' Pro Bowl' : ' First-team All-Pro')) ? 1 : 0;
  const r = incRow(p, season); return r ? r[k] || 0 : 0;
}
function incLikely(p, x) { return incValue(p, x.k, state.season) >= x.th; } // did he do it in the season just played
// how likely he thinks he is to get there, and so what the money is worth to him
function incChance(p, x) {
  if (x.k === 'pb' || x.k === 'ap') { const t = tierOf(p), b = { Elite: 0.6, 'All-Pro': 0.42, Starter: 0.14, Rotation: 0.04 }[t] || 0.02; return x.k === 'ap' ? b * 0.45 : b; }
  const last = incValue(p, x.k, state.season); return clamp(0.5 + (last / Math.max(1, x.th) - 1) * 1.2, 0.06, 0.92);
}
function incWorth(p, list) {
  if (!list || !list.length) return 0;
  const a = agentOf(p), conf = clamp(1 + (faWants(p).includes('prove') ? 0.25 : 0) + (p.age <= 25 ? 0.1 : p.age >= 30 ? -0.2 : 0) - (a.d[3] - 0.5) * 0.4, 0.55, 1.4); // a man betting on himself rates his chances; a careful agent wants it guaranteed
  return list.reduce((s2, x) => s2 + x.amt * incChance(p, x) * conf, 0);
}
function incClean(p, list, aav) { // two at most, each a real mark for his position and no more than three tenths of the yearly value
  const ok = incOptions(p), out = [];
  for (const x of list || []) { if (out.length >= 2 || !(x.amt > 0)) continue; if (!ok.some(o => o.k === x.k && o.th === x.th) || out.some(o => o.k === x.k)) continue; out.push({ k: x.k, th: x.th, amt: round2(Math.min(x.amt, aav * 0.3)) }); }
  return out;
}
function incLikelySum(p, list) { return round2((list || []).filter(x => incLikely(p, x)).reduce((s2, x) => s2 + x.amt, 0)); }
// after the season: pay what was earned and settle the difference on the new year's cap; then decide what counts in the year ahead
function incSettle(p) {
  const c = p.contract, t = T(p.tid); if (!c || !c.inc || !c.inc.length || !t) return;
  let adj = 0; const hit = [];
  for (const x of c.inc) { const got = incValue(p, x.k, state.season) >= x.th; if (got) hit.push(x); if (got && !x.likely) adj += x.amt; else if (!got && x.likely) adj -= x.amt; }
  if (adj) t.dead = round2((t.dead || 0) + adj);
  if (p.tid === state.userTid && (hit.length || adj)) addNews(`${pname(p)} ${hit.length ? 'earned ' + fmtMoney(hit.reduce((s2, x) => s2 + x.amt, 0)) + ' in incentives (' + hit.map(incLabel).join('; ') + ')' : 'missed his incentives'}${adj ? `: ${adj > 0 ? fmtMoney(adj) + ' is charged to' : fmtMoney(-adj) + ' comes back onto'} this year's cap` : ''}.`, [p.tid], 'sign');
}
function incReclass(p) { // called once the contract has moved to the new year
  const c = p.contract; if (!c || !c.inc || c.yrs <= 0) return;
  for (const x of c.inc) x.likely = incLikely(p, x);
  c.incL = round2(c.inc.filter(x => x.likely).reduce((s2, x) => s2 + x.amt, 0));
  c.amt = round2((c.sched && c.sched.length ? c.sched[0] : c.base !== undefined ? c.base : c.amt) + c.incL);
}

// ---------- contracts with a shape ----------
// front-loaded pays more early (cap hit now, cheap to keep later); back-loaded the reverse
function loadSched(aav, yrs, load) {
  if (yrs <= 1 || !load || load === 'even') return Array.from({ length: yrs }, () => round2(aav));
  const t = (load === 'front' ? 1 : -1) * 0.14, s = [];
  for (let i = 0; i < yrs; i++) s.push(round2(Math.max(MIN_SALARY, aav * (1 + t * (1 - 2 * i / (yrs - 1))))));
  return s;
}
// the cap hit each year of an offer: the salary as it is spread, plus an even share of the signing bonus
function capSched(o) {
  if (o.sal === undefined) return loadSched(o.aav, o.yrs, o.load);
  const share = o.gtd / o.yrs; return loadSched(o.sal, o.yrs, o.load).map(x => round2(x + share));
}
function faHit(o) { return round2(capSched(o)[0] + (o.incL || 0)); } // what it costs against this year's cap
function faContract(o) {
  const sched = capSched(o), total = sched.reduce((s, x) => s + x, 0), inc = (o.inc || []).map(x => Object.assign({}, x));
  const c = { amt: sched[0], yrs: o.yrs, gtd: round2(Math.min(total, Math.max(0, o.gtd))), aav: round2(o.aav), role: { r: o.role, jobs: o.jobs || null, s: state.season + 1 } }; // gtd: the signing bonus not yet used up; role: how the opportunity looked when he signed
  if (o.sal !== undefined) { c.bonus = c.gtd; c.sal = round2(o.sal); }
  if ((o.load && o.load !== 'even' && o.yrs >= 2) || inc.length) { c.sched = sched; if (o.load && o.load !== 'even') c.load = o.load; }
  if (inc.length) { c.inc = inc; c.incL = 0; }
  return c;
}


// ---------- the market ----------
function faPool() { return Object.values(state.players).filter(p => p.tid === -1 && !p.waiver && state.fa.in[p.id]); }
function faOffers(p) { return (state.fa && state.fa.off && state.fa.off[p.id]) || []; }
function faBest(p, notTid) { let b = null, bv = -1; for (const o of faOffers(p)) { if (o.tid === notTid) continue; const v = faOfferValue(p, o); if (v > bv) { bv = v; b = o; } } return b ? { o: b, v: bv } : null; }
function faCommitted(tid) { let s = 0, n = 0; for (const pid in state.fa.off) for (const o of state.fa.off[pid]) if (o.tid === tid) { s += faHit(o); n++; } return { amt: round2(s), n }; }
function faPlace(p, o) {
  const list = state.fa.off[p.id] || (state.fa.off[p.id] = []), i = list.findIndex(x => x.tid === o.tid);
  o.day = state.fa.day; if (i >= 0) list[i] = o; else list.push(o);
}
function faPull(p, tid) { if (!state.fa || !state.fa.off) return; const l = state.fa.off[p.id]; if (!l) return; const i = l.findIndex(x => x.tid === tid); if (i >= 0) l.splice(i, 1); if (!l.length) delete state.fa.off[p.id]; }
// what he is worth to one club, in yearly money: its own read of him in its own system, scaled by how badly it needs the position
function faClubAAV(tid, p) {
  const mv = marketValue(p, viewOvr(p, tid) + schemeFit(p, tid) * 0.8), g = faGain(tid, p);
  return round2(Math.max(MIN_SALARY, mv * clamp(0.62 + g / 14, 0.62, 1.12)));
}
function faOpen() {
  ensureAgents();
  const fa = state.fa = { yr: state.season, day: 0, in: {}, off: {}, talks: {}, heat: {}, win: {}, inbox: [], orders: {}, over: false };
  let ok = false;
  try { const st = standings(); for (const t of state.teams) { const r = st[t.id], g = r ? r.w + r.l + (r.t || 0) : 0; if (g >= 8) { fa.win[t.id] = r.w / g; ok = true; } } } catch (e) { ok = false; }
  if (!ok) { // no finished season to go by: the best rosters are the contenders
    const str = state.teams.map(t => [t.id, rosterOf(t.id).map(p => perOvr(p)).sort((a, b) => b - a).slice(0, 24).reduce((s, x) => s + x, 0)]).sort((a, b) => a[1] - b[1]);
    str.forEach(([tid], i) => fa.win[tid] = 0.3 + 0.4 * i / Math.max(1, str.length - 1));
  }
  for (const p of Object.values(state.players)) if (p.tid === -1 && !p.waiver && !(typeof isUdfa === 'function' && isUdfa(p))) {
    if (marketValue(p) >= MIN_SALARY * FA_MARKET_MIN) { fa.in[p.id] = 1; agentOf(p); p.ask = faExp(p); }
  }
}
// one club's offers for the day
function faClubDay(tid, maxNew) {
  const fa = state.fa, day = fa.day, pool = faPool();
  // drop offers it can no longer mean: the need was filled, or the money went elsewhere
  for (const p of pool) { const mine = faOffers(p).find(o => o.tid === tid); if (mine && (faClubAAV(tid, p) < mine.aav * 0.9 || rosterCount(tid) >= rosterLimit())) faPull(p, tid); }
  const com = faCommitted(tid); let room = capRoom(tid) - 8 - com.amt, slots = rosterLimit() - rosterCount(tid) - com.n, made = 0;
  const cand = [];
  for (const p of pool) {
    const cv = faClubAAV(tid, p), mine = faOffers(p).find(o => o.tid === tid), best = faBest(p, tid);
    const n = needAt(tid, p.pos), role = viewOvr(p, tid) >= n.floor || n.count < STARTERS[p.pos] ? 'start' : 'depth', yrs = faPrefYears(p, role);
    const prove = !faProven(p) && yrs <= 2 && INC_MENU[p.pos] && INC_MENU[p.pos].gs;
    const mk = aav => { const o = { tid, yrs, aav: round2(aav), gtd: round2(faGtdWant(p, yrs) * aav * yrs), load: 'even', role }; if (prove) { o.inc = [{ k: 'gs', th: 10, amt: round2(aav * 0.12) }]; o.incL = incLikelySum(p, o.inc); } return o; };
    let aav = mine ? mine.aav : Math.min(cv, Math.max(faFloor(p, day), faExp(p) * (0.9 + faHash(p.id, tid + 9) * 0.08)));
    let v = faOfferValue(p, mk(aav));
    if (best && best.v >= v) { aav = round2(aav * best.v * 1.03 / Math.max(0.01, v)); v = faOfferValue(p, mk(aav)); } // the agent says someone is higher
    if (aav > cv) continue; // past what he is worth to this club
    if (mine && Math.abs(aav - mine.aav) < 0.01) continue;
    cand.push({ p, o: mk(aav), raise: !!mine, old: mine ? faHit(mine) : 0, score: faGain(tid, p) - aav * 0.15 + (cv - aav) * 0.4 });
  }
  cand.sort((a, b) => b.score - a.score);
  const bar = capRoom(tid) > state.cap * 0.2 ? 0.5 : 2;
  for (const c of cand) {
    if (c.score < bar) break;
    const cost = c.o.aav - c.old;
    if (cost > room) continue;
    if (!c.raise) { if (made >= maxNew || slots <= 0) continue; made++; slots--; }
    faPlace(c.p, c.o); room -= cost;
  }
}
// the user's front office bidding to a ceiling he set
function faOrderDay() {
  const fa = state.fa, u = state.userTid;
  for (const pid in fa.orders) {
    const p = P(+pid), ord = fa.orders[pid]; if (!p || p.tid !== -1) { delete fa.orders[pid]; continue; }
    const yrs = ord.yrs || faPrefYears(p, ord.role, ord.share), mk = aav => ({ tid: u, yrs, aav: round2(aav), gtd: round2(faGtdWant(p, yrs) * aav * yrs), load: 'even', role: ord.role, jobs: ord.jobs, share: ord.share, newPos: ord.newPos, fo: true });
    const mine = faOffers(p).find(o => o.tid === u), best = faBest(p, u);
    let aav = mine ? mine.aav : Math.min(ord.max, Math.max(faFloor(p, fa.day), faExp(p) * 0.93)), v = faOfferValue(p, mk(aav));
    if (best && best.v >= v) aav = round2(aav * best.v * 1.03 / Math.max(0.01, v));
    if (aav > ord.max) { if (!mine) continue; aav = ord.max; }
    const old = mine ? faHit(mine) : 0;
    if (aav - old > capRoom(u) - faCommitted(u).amt) continue;
    if (!mine && rosterCount(u) + faCommitted(u).n >= rosterLimit()) continue;
    faPlace(p, mk(aav));
  }
}
function faSign(p, o) {
  const a = agentOf(p), exp = faExp(p), fa = state.fa;
  const others = faOffers(p).filter(x => x.tid !== o.tid).map(x => x.tid);
  setTid(p, o.tid); p.contract = faContract(o); delete p.ask; p.expiring = false;
  if (p.contract.inc) { for (const x of p.contract.inc) x.likely = incLikely(p, x); p.contract.incL = incLikelySum(p, p.contract.inc); p.contract.amt = round2(p.contract.sched[0] + p.contract.incL); }
  delete fa.off[p.id]; delete fa.in[p.id]; delete fa.orders[p.id];
  if (o.aav > exp * 1.04) fa.heat[p.pos] = round2(Math.min(1.12, (fa.heat[p.pos] || 1) * (1 + Math.min(0.04, (o.aav / exp - 1) * 0.3)))); // a big deal resets the market at his position
  const u = state.userTid, mineWon = o.tid === u, iLost = others.includes(u) && !mineWon;
  if (perOvr(p) >= 72 || mineWon || iLost) addNews(`${T(o.tid).abbr} signed ${p.lbl} ${pname(p)} (${tierOf(p)}) — ${o.yrs} yr, ${fmtMoney(o.aav * o.yrs)}, ${fmtMoney(p.contract.gtd)} signing bonus${o.inc && o.inc.length ? ', plus incentives' : ''}.`, [o.tid], 'sign');
  if (!isAI(u)) { if (mineWon) { agentNote(a, p, 'signed', o.aav, faAsk(p)); fa.inbox.push(`${pname(p)} signed with you: ${o.yrs} yr, ${fmtMoney(o.aav)}/yr.`); }
    else if (iLost || fa.talks[p.id]) { agentNote(a, p, 'lost', o.aav, 0); fa.inbox.push(`${pname(p)} signed with ${T(o.tid).abbr}${a.d[1] > 0.5 ? ` for ${fmtMoney(o.aav)}/yr over ${o.yrs}` : ''}.`); } }
  delete fa.talks[p.id];
}
function faCanFit(tid, o) { return rosterCount(tid) < rosterLimit() && faHit(o) <= capRoom(tid); }
// the end of a day: players with an offer they like sign it
function faResolveDay() {
  const fa = state.fa, day = fa.day, last = day >= FA_DAYS - 1, u = state.userTid;
  const pool = faPool().filter(p => faOffers(p).length).sort((a, b) => faExp(b) - faExp(a));
  for (const p of pool) {
    const lev = leverageOf(p), list = faOffers(p).map(o => ({ o, v: faOfferValue(p, o) })).sort((x, y) => y.v - x.v);
    let signed = false;
    for (const { o, v } of list) {
      if (!faCanFit(o.tid, o)) { faPull(p, o.tid); continue; }
      const agreed = o.night && o === list[0].o; // the agent already said yes to this one; only a better offer overnight stops it
      const bar = last ? faFloor(p, day) * 0.97 : faDemand(p, day), early = lev >= 0.8 && day < 1 && list.length < 2 && v < faAsk(p);
      if (agreed || (o.dl && o === list[0].o && v >= faFloor(p, day)) || (v >= bar && !early)) { faSign(p, o); signed = true; }
      break; // only the best offer is ever taken
    }
    if (signed) continue;
    // an offer with a deadline that was not taken is gone; an overnight yes that got beaten comes back to the table
    for (const o of faOffers(p).slice()) {
      if (o.dl) { faPull(p, o.tid); if (o.tid === u) fa.inbox.push(`${pname(p)}'s agent let your deadline pass.`); }
      else if (o.night) { delete o.night; if (o.tid === u) { fa.inbox.push(`${pname(p)}: ${agentName(agentOf(p))} called back. Another club came in overnight.`); const t = fa.talks[p.id]; if (t) { t.step = 2; t.closed = null; t.log.push({ w: 'a', t: 'Something came in last night. If you want him, it takes more than we shook on.' }); } } }
    }
  }
}
function faEndMarket() {
  const fa = state.fa;
  for (const p of Object.values(state.players)) if (p.tid === -1 && fa.in[p.id]) p.ask = round2(faFloor(p, FA_DAYS + 2)); // whoever is left takes what he can get
  fa.over = true; fa.off = {}; fa.talks = {}; fa.orders = {};
  aiFreeAgencyWave(5);
}
function faAdvanceDay() {
  const fa = state.fa; if (!fa || fa.over) return;
  const order = shuffle(state.teams.filter(t => isAI(t.id)).map(t => t.id));
  for (const tid of order) faClubDay(tid, fa.day === 0 ? 3 : 2);
  if (!isAI(state.userTid)) faOrderDay();
  faResolveDay();
  for (const k in fa.heat) fa.heat[k] = round2(1 + (fa.heat[k] - 1) * 0.85);
  for (const pid in fa.talks) { const t = fa.talks[pid]; if (t.closed === 'day') t.closed = null; t.pat = t.pat0; t.stood = false; }
  for (const p of faPool()) p.ask = faExp(p);
  fa.day++;
  if (fa.day >= FA_DAYS) faEndMarket();
}
// what the grapevine says: how many clubs are thought to be in on him
function faRumor(p) {
  const n = faOffers(p).filter(o => o.tid !== state.userTid).length;
  return n === 0 ? 'Quiet' : n === 1 ? 'One club in' : n <= 3 ? 'A few clubs in' : 'A crowded market';
}

// ---------- the sit-down ----------
// talk = { step (1 role, 2 commitment, 3 salary), pat, pat0, log: [{w: 'a'|'u', t}], jobs, role, share, newPos, yrs, gtd, aav, load, S (the number he is holding out for), closed (null|'day'|'done'), stood }
const FA_LINES = {
  hard: { open: ['You called me. Tell me why.', 'My phone has not stopped. Make it worth the time.'], roleOk: ['Fine. That is the job he expects.', 'Good. Then we are talking about the same player.'], no: ['Not close.', 'That number insults him.', 'I will pretend I did not hear that.'], near: ['Closer. Not there.', 'You are in the room now. Keep going.'], yes: ['Done. Send the paper.', 'You have a deal.'], bye: ['We are finished for today.', 'I have other calls to make.'] },
  warm: { open: ['Good to hear from you. He likes what you are building.', 'Glad you called. Let us see if we can get this done.'], roleOk: ['He will be glad to hear that.', 'That is what he was hoping you would say.'], no: ['I cannot take that to him. I wish I could.', 'We are a ways apart, friend.'], near: ['We are getting close. Help me a little more.', 'I can almost sell that.'], yes: ['He is going to be very happy. Deal.', 'That works. Let us get it signed.'], bye: ['Let us sleep on it and talk tomorrow.', 'I need to step away. Call me tomorrow.'] },
  plain: { open: ['Thanks for the call. Where do you see him?', 'Let us talk. What did you have in mind for him?'], roleOk: ['Understood. That works for us.', 'All right. We can work with that.'], no: ['That does not get it done.', 'We are too far apart on that.'], near: ['That is close. Not quite.', 'Nearly. A little more.'], yes: ['We have a deal.', 'Agreed.'], bye: ['That is enough for today.', 'We will pick this up tomorrow.'] },
};
function faTone(a) { return a.d[0] > 0.58 && a.d[1] < 0.55 ? 'hard' : a.d[4] + a.d[5] > 1.15 ? 'warm' : 'plain'; }
function faSay(a, k) { const l = FA_LINES[faTone(a)][k]; return l[Math.floor(rand() * l.length)]; }
function faTalk(pid) {
  const p = P(pid), mode = negMode(p), fa = state.fa; if (!mode) return null;
  const store = negTalks(mode); let t = store[pid];
  if (t && (t.v !== 2 || t.mode !== mode)) { delete store[pid]; t = null; } // a meeting from before the contract table, or about a different kind of deal
  if (t && mode !== 'fa' && t.closed === 'day' && t.stamp !== negStamp()) { t.closed = null; t.pat = t.pat0; } // away from the open market there are no days: he has cooled off once time has moved on
  if (!t) {
    const a = agentOf(p), u = state.userTid, pat0 = Math.max(3, Math.round(4 + a.d[2] * 3 - Math.max(0, agentGrudge(a))));
    const job = faBestJob(u, p), rd = (job && faJobsRead(u, p, [job])) || { role: 'compete', share: 1, newPos: false, who: null };
    t = store[pid] = { v: 2, mode, stamp: negStamp(), step: 1, pat: pat0, pat0, log: [], role: rd.role, jobs: job ? [job] : null, share: rd.share, newPos: rd.newPos, yrs: null, gtd: null, sal: null, aav: null, inc: [], load: 'even', S: null, closed: null, stood: false };
    // Nobody tells him where he will play. He has looked at the depth chart himself.
    const w = faWants(p), tell = a.d[1] > 0.3 || a.d[5] > 0.6, proven = faProven(p), lev = leverageOf(p), who = rd.who ? pname(rd.who) : null, at = job ? faJobSay(job) : 'his position';
    if (mode === 'fa' && rd.role === 'depth' && proven && lev >= 0.55 && fa.day < 4) {
      t.closed = a.d[0] > 0.6 ? 'done' : 'day';
      t.log.push({ w: 'a', t: `He has looked at your roster. You have ${who || 'your man'} at ${at}, and he is not coming to sit behind him. ${t.closed === 'done' ? 'We have nothing to talk about.' : 'Call me if that changes.'}` });
      return t; }
    let line = faSay(a, 'open') + (mode === 'fa' ? ' He has looked at your roster. ' : mode === 'resign' ? ' He knows this roster as well as you do. ' : ' You want to get ahead of this, and so does he. ');
    line += rd.role === 'start' ? (who ? `He sees ${at} as his job to lose.` : `He sees ${at} wide open.`)
      : rd.role === 'compete' ? `He sees a competition with ${who || 'your man'} at ${at}${proven ? ', and he thinks the job should be his outright. The deal will have to say so.' : ', and he has never run from one.'}`
      : `He knows he would be behind ${who || 'your starter'} at ${at}${proven ? '. It will cost you to have him sit.' : '.'}`;
    if (rd.share < 0.6 && faEveryDown(p)) line += ' That is a part-time job for a man who has played every down.';
    if (!proven && rd.role !== 'depth' && rd.share >= 0.6) line += ' He will bet on himself: a short deal, then he gets paid like what he shows you.';
    if (w.length && tell) line += ` He ${w.slice(0, a.d[1] > 0.65 ? 3 : 1).map(k => FA_WANT_TXT[k]).join(', and he ')}.`;
    t.log.push({ w: 'a', t: line });
  }
  return t;
}
function faTalkOffer(p, t) { const o = { tid: state.userTid, yrs: t.yrs, gtd: t.gtd, sal: t.sal, aav: t.aav, load: t.load, inc: (t.inc || []).map(x => Object.assign({}, x)), role: t.role, jobs: t.jobs, share: t.share, newPos: t.newPos }; o.incL = incLikelySum(p, o.inc); return o; }
function faTire(p, t, n) {
  t.pat -= n === undefined ? 1 : n;
  if (t.pat <= 0 && !t.closed) { t.closed = 'day'; t.log.push({ w: 'a', t: faSay(agentOf(p), 'bye') }); }
}
function faOpenCheck(p, t) { return !t ? 'He is not on the market' : t.closed === 'done' ? 'His agent will not take your calls about him' : t.closed === 'day' ? 'His agent is done for today' : null; }
function faGtdNeed(p, t, yrs) {
  const a = agentOf(p);
  return round2(faGtdWant(p, yrs) * (0.72 + a.d[3] * 0.3 + (t.newPos ? 0.12 : 0)) * faExp(p) * yrs);
}
// step 1: how long, and the signing bonus. The bonus is his the day he signs; it is what makes him expensive to cut.
function faSayCommit(pid, yrs, bonus) {
  const p = P(pid), t = faTalk(pid), err = faOpenCheck(p, t); if (err) return err;
  const a = agentOf(p), lev = leverageOf(p), py = faPrefYears(p, t.role, t.share), lim = lev >= 0.8 ? 1 : lev >= 0.55 ? 2 : 3, maxY = clamp((['QB', 'K', 'P'].includes(p.pos) ? 40 : 36) - p.age, 1, 5);
  yrs = clamp(Math.round(yrs), 1, 5); bonus = round2(Math.max(0, bonus));
  t.log.push({ w: 'u', t: `${yrs} year${yrs === 1 ? '' : 's'}, with ${fmtMoney(bonus)} to sign.` });
  if (yrs > Math.max(py, maxY)) { t.log.push({ w: 'a', t: 'Nobody is signing for that long at his age. Be serious.' }); faTire(p, t); return null; }
  if (Math.abs(yrs - py) > lim && !(yrs > py && p.age >= 30)) { t.log.push({ w: 'a', t: yrs < py ? `He wants security, not a short look. ${a.d[1] > 0.4 ? `Think ${py} years.` : 'Longer.'}` : `He is not locking himself up that long. ${a.d[1] > 0.4 ? `Think ${py} years.` : 'Shorter.'}` }); faTire(p, t); return null; }
  const need = faGtdNeed(p, t, yrs);
  if (bonus + 0.005 < need) {
    const r = bonus / Math.max(0.01, need);
    t.log.push({ w: 'a', t: a.d[1] > 0.6 ? `On ${yrs} year${yrs === 1 ? '' : 's'} the signing bonus needs to be ${fmtMoney(need)} before we talk salary.` : r > 0.85 ? faSay(a, 'near') + ' The bonus.' : faSay(a, 'no') + ' The bonus is the real money.' });
    faTire(p, t); return null; }
  t.yrs = yrs; t.gtd = bonus; t.step = 2; t.aav = null; t.sal = null; t.S = null;
  t.log.push({ w: 'a', t: (bonus > need * 1.25 ? 'That is real commitment. He will remember it. ' : '') + 'Now the salary.' });
  return null;
}
function faBackToCommit(pid) {
  const p = P(pid), t = faTalk(pid), err = faOpenCheck(p, t); if (err) return err;
  if (t.step !== 2) return 'Nothing to reopen';
  t.step = 1; t.log.push({ w: 'u', t: 'Let us look at the length and the bonus again.' }); t.log.push({ w: 'a', t: 'If we must.' }); faTire(p, t); return null;
}
// the number he would truly take from this club today, and the number he is holding out for
function faTrue(p) { const mode = negMode(p); if (!mode) return 0; if (mode !== 'fa') return negTarget(p, mode) * (1 + Math.max(0, agentGrudge(agentOf(p))) * 0.015);
  const best = faBest(p, state.userTid); return Math.max(faDemand(p, state.fa.day), best ? best.v * 1.01 : 0) * (1 + Math.max(0, agentGrudge(agentOf(p))) * 0.015); }
function faStance(p, t) {
  if (t.S === null) { const TH = faTrue(p), top = negMode(p) === 'fa' ? faAsk(p) : TH * (1.06 + agentOf(p).d[0] * 0.14); t.S = TH + Math.max(0, top - TH) * 0.7 + TH * 0.02; }
  return Math.max(t.S, faTrue(p));
}
function faConcede(p, t, k) { const a = agentOf(p), TH = faTrue(p), c = (0.22 + (1 - a.d[2]) * 0.33) * (k || 1); t.S = TH + Math.max(0, faStance(p, t) - TH) * (1 - c); }
function faUserFits(p, o) {
  const u = state.userTid, mode = negMode(p);
  if (mode === 'resign') return faHit(o) > capRoom(u) ? 'Not enough cap room' : null;
  if (mode === 'extend') return payrollNext(u) + faHit(o) > state.cap * 1.06 ? 'It would not fit under next year\'s cap' : null;
  const mine = faOffers(p).find(x => x.tid === u), com = faCommitted(u), y1 = faHit(o), old = mine ? faHit(mine) : 0;
  if (y1 - old > capRoom(u) - com.amt) return 'Not enough cap room with your other offers out';
  if (!mine && rosterCount(u) + com.n >= rosterLimit()) return 'No roster spot left with your other offers out';
  return null;
}
// a deal with one of your own: signed there and then
function negSign(p, o, mode) {
  const a = agentOf(p), c = faContract(o);
  if (c.inc) { for (const x of c.inc) x.likely = incLikely(p, x); c.incL = incLikelySum(p, c.inc); c.amt = round2(c.sched[0] + c.incL); }
  if (mode === 'extend') { c.role.s = state.season + 1 + p.contract.yrs; p.contract.next = c; }
  else { p.contract = c; p.expiring = false; delete p.ask; }
  agentNote(a, p, 'signed', o.aav, 0); delete negTalks(mode)[p.id];
  addNews(`${T(p.tid).abbr} ${mode === 'extend' ? 'extended' : 're-signed'} ${p.lbl} ${pname(p)}: ${o.yrs} yr, ${fmtMoney((o.sal !== undefined ? o.sal : o.aav) * o.yrs + (o.sal !== undefined ? o.gtd : 0))}, ${fmtMoney(c.gtd)} signing bonus${c.inc ? ', plus incentives' : ''}.`, [p.tid], 'sign');
}

function faAgree(p, t, o, viaPlayer) {
  const mode = negMode(p);
  if (mode !== 'fa') { t.log.push({ w: 'a', t: viaPlayer ? 'He called me himself. He wants to stay. Get the paper ready.' : faSay(agentOf(p), 'yes') }); negSign(p, o, mode); return; }
  const a = agentOf(p), fa = state.fa, lev = leverageOf(p), rivals = faOffers(p).filter(x => x.tid !== o.tid).length;
  const wait = !viaPlayer && ((lev >= 0.8 && fa.day < 1 && faOfferValue(p, o) < faAsk(p)) || (rivals > 0 && a.d[2] > 0.62));
  if (wait) { o.night = true; faPlace(p, o); t.closed = 'day'; t.log.push({ w: 'a', t: 'I can sell that. Let me take it to him tonight. You will hear from me tomorrow.' }); return; }
  t.log.push({ w: 'a', t: viaPlayer ? 'He called me himself. He wants to be there. Get the paper ready.' : faSay(a, 'yes') });
  faSign(p, o);
}
// step 2: the salary, how it is spread, and any incentives on top
function faSaySalary(pid, sal, load, inc) {
  const p = P(pid), t = faTalk(pid), err = faOpenCheck(p, t); if (err) return err;
  if (t.step !== 2) return 'Settle the length and the signing bonus first';
  const a = agentOf(p), share = t.gtd / t.yrs;
  sal = round2(Math.max(MIN_SALARY, sal)); const aav = round2(sal + share);
  t.sal = sal; t.aav = aav; t.load = load || 'even'; t.inc = incClean(p, inc, aav);
  const o = faTalkOffer(p, t), fit = faUserFits(p, o); if (fit) return fit;
  t.log.push({ w: 'u', t: `${fmtMoney(sal)} a year in salary${t.yrs >= 2 && t.load !== 'even' ? (t.load === 'front' ? ', more of it early' : ', more of it late') : ''}${t.inc.length ? `, and ${t.inc.map(x => fmtMoney(x.amt) + ' more if he ' + incLabel(x)).join(', ')}` : ''}.` });
  const v = faOfferValue(p, o), S = faStance(p, t), TH = faTrue(p);
  if (v >= S) { faAgree(p, t, o); return null; }
  if (v >= negFloor(p) && v >= TH * 0.97 && faWantsMet(p, o) >= 2 && a.d[5] > 0.55) { faAgree(p, t, o, true); return null; }
  const needSal = round2(Math.max(MIN_SALARY, aav * S / Math.max(0.01, v) - share)), gap = S / Math.max(0.01, v) - 1, real = faBest(p, state.userTid);
  let line;
  if (a.d[1] > 0.62) line = `On these terms the salary needs to be ${fmtMoney(needSal)} a year.`;
  else if (a.d[1] > 0.35) line = (gap > 0.12 ? faSay(a, 'no') : faSay(a, 'near')) + (real && rand() < a.d[1] + 0.2 ? ' There is a real offer ahead of yours.' : '');
  else line = (gap > 0.12 ? faSay(a, 'no') : faSay(a, 'near')) + (rand() < 0.6 ? ` I have a club at ${fmtMoney(round2((needSal + share) * (1.04 + rand() * 0.1)))} a year all in.` : '');
  if (t.inc.length && incWorth(p, t.inc) < t.inc.reduce((s2, x) => s2 + x.amt, 0) * 0.3) line += a.d[3] > 0.6 ? ' And he cannot spend an incentive. Put it in the salary.' : ' He does not think much of his chances at those incentives.';
  t.log.push({ w: 'a', t: line });
  if (gap > 0.3) faTire(p, t, 2); else faTire(p, t);
  faConcede(p, t);
  return null;
}
function faHold(pid) {
  const p = P(pid), t = faTalk(pid), err = faOpenCheck(p, t); if (err) return err;
  if (t.step !== 2 || t.aav === null) return 'Make an offer first';
  const a = agentOf(p), o = faTalkOffer(p, t);
  t.log.push({ w: 'u', t: 'That is our number.' });
  faConcede(p, t, 0.6);
  if (faOfferValue(p, o) >= faStance(p, t)) { faAgree(p, t, o); return null; }
  t.log.push({ w: 'a', t: faBest(p, state.userTid) ? 'Then you are going to lose him.' : a.d[0] > 0.55 ? (negMode(p) === 'fa' ? 'Then we wait. The market will come to him.' : 'Then he will see what the market says.') : 'I hear you. I cannot do it there.' });
  faTire(p, t); return null;
}
function faFinal(pid) {
  const p = P(pid), t = faTalk(pid), err = faOpenCheck(p, t); if (err) return err;
  if (t.step !== 2 || t.aav === null) return 'Make an offer first';
  const a = agentOf(p), o = faTalkOffer(p, t);
  t.log.push({ w: 'u', t: 'That is our best and final offer.' });
  if (faOfferValue(p, o) >= faTrue(p)) { faAgree(p, t, o); return null; }
  t.closed = a.d[0] > 0.6 ? 'done' : 'day'; faPull(p, state.userTid);
  t.log.push({ w: 'a', t: t.closed === 'done' ? 'Then we are finished. Good luck.' : 'Then it is no. If that changes, you know where I am.' });
  if (t.closed === 'done') agentNote(a, p, 'walked', o.aav, faAsk(p));
  return null;
}
function faStand(pid) {
  if (negMode(P(pid)) !== 'fa') return 'There is no market to ask about yet';
  const p = P(pid), t = faTalk(pid), err = faOpenCheck(p, t); if (err) return err;
  if (t.stood) return 'You already asked today';
  const a = agentOf(p), n = faOffers(p).filter(o => o.tid !== state.userTid).length, mine = faOffers(p).find(o => o.tid === state.userTid), best = faBest(p, state.userTid);
  t.stood = true; t.log.push({ w: 'u', t: 'Where do things stand?' });
  const said = a.d[1] > 0.55 ? n : n + (rand() < 0.7 ? 1 : 2);
  let line = said === 0 ? 'You are the first call that got this far.' : said === 1 ? 'One other club is serious.' : `${said} clubs are in.`;
  if (a.d[1] > 0.7 && mine) line += best && best.v > faOfferValue(p, mine) ? ' You are not the best offer he has.' : ' Yours is the best he has right now.';
  else if (a.d[1] < 0.3) line += ' And they are not waiting around.';
  t.log.push({ w: 'a', t: line }); return null;
}
// leave the offer on the table (binding), with or without a deadline of tonight
function faLeave(pid, deadline) {
  if (negMode(P(pid)) !== 'fa') return 'That only applies on the open market';
  const p = P(pid), t = faTalk(pid); if (!t) return 'He is not on the market';
  if (t.closed === 'done') return 'His agent will not take your calls about him';
  if (t.step !== 2 || t.aav === null) return 'There is no full offer to leave';
  const a = agentOf(p), o = faTalkOffer(p, t), fit = faUserFits(p, o); if (fit) return fit;
  if (deadline) o.dl = true; faPlace(p, o);
  t.log.push({ w: 'u', t: deadline ? 'The offer stands until tonight. After that it is gone.' : 'The offer is on the table.' });
  t.log.push({ w: 'a', t: deadline ? (a.d[2] > 0.6 ? 'He does not like being rushed. You will have an answer.' : 'You will have an answer tonight.') : 'I will let him know.' });
  if (!t.closed) t.closed = 'day'; return null;
}
function faWithdraw(pid) {
  const p = P(pid), t = state.fa.talks[pid], mine = faOffers(p).find(o => o.tid === state.userTid); if (!mine) return 'You have no offer out';
  faPull(p, state.userTid); delete state.fa.orders[pid]; agentNote(agentOf(p), p, 'pulled', mine.aav, 0);
  if (t) t.log.push({ w: 'u', t: 'We are pulling the offer.' }, { w: 'a', t: 'I will remember that.' });
  return null;
}
function faWalk(pid) {
  const p = P(pid), mode = negMode(p); if (!mode) return null;
  if (mode !== 'fa') return null; // with one of your own there is nothing to walk away from: the talk waits where it was left
  const t = state.fa.talks[pid]; if (!t) return null;
  if (t.step === 2 && t.aav !== null) agentNote(agentOf(p), p, 'walked', t.aav, faAsk(p));
  faPull(p, state.userTid); delete state.fa.orders[pid]; delete state.fa.talks[pid]; return null;
}
// hand it to the front office with a ceiling
function faOrder(pid, max, jobs) {
  const p = P(pid); if (!p || !faInMarket(p)) return 'He is not on the market';
  if (!max) { delete state.fa.orders[pid]; return null; }
  const u = state.userTid, ok = faJobsFor(u, p); jobs = (jobs || []).filter(k => ok.includes(k)).slice(0, 2); if (!jobs.length) jobs = [faBestJob(u, p)].filter(Boolean);
  const rd = faJobsRead(u, p, jobs) || { role: 'compete', share: 1, newPos: false };
  state.fa.orders[pid] = { max: round2(max), jobs, role: rd.role, share: rd.share, newPos: rd.newPos }; return null;
}

