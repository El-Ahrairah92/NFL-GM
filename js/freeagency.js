'use strict';
// =====================================================================
//  FREE AGENCY AS A MARKET (DESIGN §51)
//  The league prices the player (an expected yearly value, shown as a range). Clubs compete with binding offers over a run of
//  days and never see each other's numbers. Every player has an agent; the user negotiates in a sit-down with three steps:
//  the role, the commitment (years and guaranteed money), then the salary on top.
//
//  state.fa = { day, in: {pid: 1}, off: {pid: [offer]}, talks: {pid: talk}, heat: {pos: x}, win: {tid: pct}, inbox: [text], orders: {pid: order}, over }
//  offer    = { tid, yrs, gtd, aav, load ('even'|'front'|'back'), role ('start'|'depth'), spot, day, dl?, night? }
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
    const sex = rand() < 0.35 ? 'f' : 'm', last = pick(LAST_NAMES), first = sex === 'f' ? pick(AGENT_F_NAMES) : pick(FIRST_NAMES);
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
// the share of the deal he expects guaranteed, and the length he has in mind once he knows the role
function faGtdWant(p, yrs) {
  const t = tierOf(p); let s = { Elite: 0.68, 'All-Pro': 0.55, Starter: 0.38, Rotation: 0.22, Backup: 0.22, Depth: 0.1 }[t] || 0.05;
  if (p.age >= 31) s *= 0.75; if (yrs <= 1) s = Math.max(s, 0.5);
  return clamp(s, 0, 1);
}
function faPrefYears(p, role) {
  let y = prefYears(p);
  if ((!faProven(p) && role === 'start') || faWants(p).includes('prove')) y = Math.min(y, 2); // he bets on himself: prove it, then get paid
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
  const a = agentOf(p), lev = leverageOf(p), wants = faWants(p), py = faPrefYears(p, o.role), dev = o.yrs - py;
  let v = o.aav;
  if (dev < 0) v *= 1 - Math.min(0.2, -dev * 0.035 * (0.5 + lev));
  else if (dev > 0) v *= p.age >= 30 || lev < 0.3 ? 1 + 0.01 * dev : 1 - Math.min(0.2, dev * 0.03 * (0.5 + lev));
  const gs = o.aav * o.yrs > 0 ? o.gtd / (o.aav * o.yrs) : 0, g0 = faGtdWant(p, o.yrs), gd = clamp(gs - g0, -0.5, 0.5);
  v *= 1 + gd * (0.12 + a.d[3] * 0.2 + (p.age >= 30 ? 0.06 : 0) + (o.spot && o.spot !== p.spot ? 0.1 : 0) + (wants.includes('secure') ? 0.1 : 0));
  if (o.yrs >= 2 && o.load && o.load !== 'even') v *= 1 + (o.load === 'front' ? 1 : -1) * 0.012 * (1 + a.d[3]);
  if (o.role === 'depth' && faProven(p)) v *= 0.85; // a starter asked to sit
  if (o.spot && o.spot !== p.spot) v *= 0.97;       // a new position is a risk to his next contract
  if (wants.includes('start')) v *= o.role === 'start' ? 1.05 : 0.93;
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

// ---------- contracts with a shape ----------
// front-loaded pays more early (cap hit now, cheap to keep later); back-loaded the reverse
function loadSched(aav, yrs, load) {
  if (yrs <= 1 || !load || load === 'even') return Array.from({ length: yrs }, () => round2(aav));
  const t = (load === 'front' ? 1 : -1) * 0.14, s = [];
  for (let i = 0; i < yrs; i++) s.push(round2(Math.max(MIN_SALARY, aav * (1 + t * (1 - 2 * i / (yrs - 1))))));
  return s;
}
function faContract(o) {
  const sched = loadSched(o.aav, o.yrs, o.load), total = sched.reduce((s, x) => s + x, 0);
  const c = { amt: sched[0], yrs: o.yrs, gtd: round2(Math.min(total, Math.max(0, o.gtd))), aav: round2(o.aav), role: { r: o.role, spot: o.spot, s: state.season + 1 } };
  if (o.load && o.load !== 'even' && o.yrs >= 2) { c.sched = sched; c.load = o.load; }
  return c;
}

// ---------- the market ----------
function faPool() { return Object.values(state.players).filter(p => p.tid === -1 && !p.waiver && state.fa.in[p.id]); }
function faOffers(p) { return state.fa.off[p.id] || []; }
function faBest(p, notTid) { let b = null, bv = -1; for (const o of faOffers(p)) { if (o.tid === notTid) continue; const v = faOfferValue(p, o); if (v > bv) { bv = v; b = o; } } return b ? { o: b, v: bv } : null; }
function faCommitted(tid) { let s = 0, n = 0; for (const pid in state.fa.off) for (const o of state.fa.off[pid]) if (o.tid === tid) { s += loadSched(o.aav, o.yrs, o.load)[0]; n++; } return { amt: round2(s), n }; }
function faPlace(p, o) {
  const list = state.fa.off[p.id] || (state.fa.off[p.id] = []), i = list.findIndex(x => x.tid === o.tid);
  o.day = state.fa.day; if (i >= 0) list[i] = o; else list.push(o);
}
function faPull(p, tid) { const l = state.fa.off[p.id]; if (!l) return; const i = l.findIndex(x => x.tid === tid); if (i >= 0) l.splice(i, 1); if (!l.length) delete state.fa.off[p.id]; }
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
    const mk = aav => ({ tid, yrs, aav: round2(aav), gtd: round2(faGtdWant(p, yrs) * aav * yrs), load: 'even', role, spot: p.spot });
    let aav = mine ? mine.aav : Math.min(cv, Math.max(faFloor(p, day), faExp(p) * (0.9 + faHash(p.id, tid + 9) * 0.08)));
    let v = faOfferValue(p, mk(aav));
    if (best && best.v >= v) { aav = round2(aav * best.v * 1.03 / Math.max(0.01, v)); v = faOfferValue(p, mk(aav)); } // the agent says someone is higher
    if (aav > cv) continue; // past what he is worth to this club
    if (mine && Math.abs(aav - mine.aav) < 0.01) continue;
    cand.push({ p, o: mk(aav), raise: !!mine, old: mine ? loadSched(mine.aav, mine.yrs, mine.load)[0] : 0, score: faGain(tid, p) - aav * 0.15 + (cv - aav) * 0.4 });
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
    const yrs = ord.yrs || faPrefYears(p, ord.role), mk = aav => ({ tid: u, yrs, aav: round2(aav), gtd: round2(faGtdWant(p, yrs) * aav * yrs), load: 'even', role: ord.role, spot: p.spot, fo: true });
    const mine = faOffers(p).find(o => o.tid === u), best = faBest(p, u);
    let aav = mine ? mine.aav : Math.min(ord.max, Math.max(faFloor(p, fa.day), faExp(p) * 0.93)), v = faOfferValue(p, mk(aav));
    if (best && best.v >= v) aav = round2(aav * best.v * 1.03 / Math.max(0.01, v));
    if (aav > ord.max) { if (!mine) continue; aav = ord.max; }
    const old = mine ? loadSched(mine.aav, mine.yrs, mine.load)[0] : 0;
    if (aav - old > capRoom(u) - faCommitted(u).amt) continue;
    if (!mine && rosterCount(u) + faCommitted(u).n >= rosterLimit()) continue;
    faPlace(p, mk(aav));
  }
}
function faSign(p, o) {
  const a = agentOf(p), exp = faExp(p), fa = state.fa;
  const others = faOffers(p).filter(x => x.tid !== o.tid).map(x => x.tid);
  setTid(p, o.tid); p.contract = faContract(o); delete p.ask; p.expiring = false;
  delete fa.off[p.id]; delete fa.in[p.id]; delete fa.orders[p.id];
  if (o.aav > exp * 1.04) fa.heat[p.pos] = round2(Math.min(1.12, (fa.heat[p.pos] || 1) * (1 + Math.min(0.04, (o.aav / exp - 1) * 0.3)))); // a big deal resets the market at his position
  const u = state.userTid, mineWon = o.tid === u, iLost = others.includes(u) && !mineWon;
  if (perOvr(p) >= 72 || mineWon || iLost) addNews(`${T(o.tid).abbr} signed ${p.lbl} ${pname(p)} (${tierOf(p)}) — ${o.yrs} yr, ${fmtMoney(o.aav)}/yr, ${fmtMoney(p.contract.gtd)} guaranteed.`, [o.tid], 'sign');
  if (!isAI(u)) { if (mineWon) { agentNote(a, p, 'signed', o.aav, faAsk(p)); fa.inbox.push(`${pname(p)} signed with you: ${o.yrs} yr, ${fmtMoney(o.aav)}/yr.`); }
    else if (iLost || fa.talks[p.id]) { agentNote(a, p, 'lost', o.aav, 0); fa.inbox.push(`${pname(p)} signed with ${T(o.tid).abbr}${a.d[1] > 0.5 ? ` for ${fmtMoney(o.aav)}/yr over ${o.yrs}` : ''}.`); } }
  delete fa.talks[p.id];
}
function faCanFit(tid, o) { return rosterCount(tid) < rosterLimit() && loadSched(o.aav, o.yrs, o.load)[0] <= capRoom(tid); }
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
      else if (o.night) { delete o.night; if (o.tid === u) { fa.inbox.push(`${pname(p)}: ${agentName(agentOf(p))} called back. Another club came in overnight.`); const t = fa.talks[p.id]; if (t) { t.step = 3; t.closed = null; t.log.push({ w: 'a', t: 'Something came in last night. If you want him, it takes more than we shook on.' }); } } }
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
// talk = { step (1 role, 2 commitment, 3 salary), pat, pat0, log: [{w: 'a'|'u', t}], role, spot, yrs, gtd, aav, load, S (the number he is holding out for), closed (null|'day'|'done'), stood }
const FA_LINES = {
  hard: { open: ['You called me. Tell me why.', 'My phone has not stopped. Make it worth the time.'], roleOk: ['Fine. That is the job he expects.', 'Good. Then we are talking about the same player.'], no: ['Not close.', 'That number insults him.', 'I will pretend I did not hear that.'], near: ['Closer. Not there.', 'You are in the room now. Keep going.'], yes: ['Done. Send the paper.', 'You have a deal.'], bye: ['We are finished for today.', 'I have other calls to make.'] },
  warm: { open: ['Good to hear from you. He likes what you are building.', 'Glad you called. Let us see if we can get this done.'], roleOk: ['He will be glad to hear that.', 'That is what he was hoping you would say.'], no: ['I cannot take that to him. I wish I could.', 'We are a ways apart, friend.'], near: ['We are getting close. Help me a little more.', 'I can almost sell that.'], yes: ['He is going to be very happy. Deal.', 'That works. Let us get it signed.'], bye: ['Let us sleep on it and talk tomorrow.', 'I need to step away. Call me tomorrow.'] },
  plain: { open: ['Thanks for the call. Where do you see him?', 'Let us talk. What did you have in mind for him?'], roleOk: ['Understood. That works for us.', 'All right. We can work with that.'], no: ['That does not get it done.', 'We are too far apart on that.'], near: ['That is close. Not quite.', 'Nearly. A little more.'], yes: ['We have a deal.', 'Agreed.'], bye: ['That is enough for today.', 'We will pick this up tomorrow.'] },
};
function faTone(a) { return a.d[0] > 0.58 && a.d[1] < 0.55 ? 'hard' : a.d[4] + a.d[5] > 1.15 ? 'warm' : 'plain'; }
function faSay(a, k) { const l = FA_LINES[faTone(a)][k]; return l[Math.floor(rand() * l.length)]; }
function faTalk(pid) {
  const p = P(pid), fa = state.fa; if (!p || !faInMarket(p)) return null;
  let t = fa.talks[pid];
  if (!t) {
    const a = agentOf(p), pat0 = Math.max(3, Math.round(4 + a.d[2] * 3 - Math.max(0, agentGrudge(a))));
    t = fa.talks[pid] = { step: 1, pat: pat0, pat0, log: [], role: null, spot: p.spot, yrs: null, gtd: null, aav: null, load: 'even', S: null, closed: null, stood: false };
    const w = faWants(p), tell = a.d[1] > 0.3 || a.d[5] > 0.6;
    t.log.push({ w: 'a', t: faSay(a, 'open') + (w.length && tell ? ` He ${w.slice(0, a.d[1] > 0.65 ? 3 : 1).map(k => FA_WANT_TXT[k]).join(', and he ')}.` : '') });
  }
  return t;
}
function faTalkOffer(p, t) { return { tid: state.userTid, yrs: t.yrs, gtd: t.gtd, aav: t.aav, load: t.load, role: t.role, spot: t.spot }; }
function faTire(p, t, n) {
  t.pat -= n === undefined ? 1 : n;
  if (t.pat <= 0 && !t.closed) { t.closed = 'day'; t.log.push({ w: 'a', t: faSay(agentOf(p), 'bye') }); }
}
function faOpenCheck(p, t) { return !t ? 'He is not on the market' : t.closed === 'done' ? 'His agent will not take your calls about him' : t.closed === 'day' ? 'His agent is done for today' : null; }
// step 1: the role
function faSayRole(pid, role, spot) {
  const p = P(pid), t = faTalk(pid), err = faOpenCheck(p, t); if (err) return err;
  if (t.step !== 1) return 'The role is settled';
  const a = agentOf(p), lev = leverageOf(p), fa = state.fa, newSpot = spot && spot !== p.spot;
  t.log.push({ w: 'u', t: `We see him as ${role === 'start' ? 'a starter' : 'depth'} at ${SPOTS[spot || p.spot].l}${newSpot ? ', which is a new position for him' : ''}.` });
  if (role === 'depth' && faProven(p) && lev >= 0.55 && fa.day < 4) {
    t.closed = a.d[0] > 0.6 ? 'done' : 'day'; t.log.push({ w: 'a', t: 'He is a starter in this league. Call me when you see him the way everyone else does.' }); return null; }
  t.role = role; t.spot = spot || p.spot; t.step = 2;
  const py = faPrefYears(p, role); let line = faSay(a, 'roleOk');
  if (role === 'start' && !faProven(p)) line = `He will take that chance. But he bets on himself: ${py === 1 ? 'one year' : 'two years at most'}, then he gets paid like what he shows you.`;
  else if (role === 'depth' && faProven(p)) line = 'He will listen, this late. It will cost you to have him sit.';
  if (newSpot) line += ' A new position is his risk, not yours. We will need more guaranteed for it.';
  if (a.d[1] > 0.35 && !(role === 'start' && !faProven(p))) line += ` We are thinking ${py} year${py === 1 ? '' : 's'}.`;
  t.log.push({ w: 'a', t: line });
  return null;
}
function faGtdNeed(p, t, yrs) {
  const a = agentOf(p);
  return round2(faGtdWant(p, yrs) * (0.72 + a.d[3] * 0.3 + (t.spot !== p.spot ? 0.12 : 0)) * faExp(p) * yrs);
}
// step 2: years and guaranteed money, one move
function faSayCommit(pid, yrs, gtd) {
  const p = P(pid), t = faTalk(pid), err = faOpenCheck(p, t); if (err) return err;
  if (t.step < 2) return 'Settle the role first';
  const a = agentOf(p), lev = leverageOf(p), py = faPrefYears(p, t.role), lim = lev >= 0.8 ? 1 : lev >= 0.55 ? 2 : 3, maxY = clamp((['QB', 'K', 'P'].includes(p.pos) ? 40 : 36) - p.age, 1, 5);
  yrs = clamp(Math.round(yrs), 1, 5); gtd = round2(Math.max(0, gtd));
  t.log.push({ w: 'u', t: `${yrs} year${yrs === 1 ? '' : 's'}, ${fmtMoney(gtd)} guaranteed.` });
  if (yrs > Math.max(py, maxY)) { t.log.push({ w: 'a', t: 'Nobody is signing for that long at his age. Be serious.' }); faTire(p, t); return null; }
  if (Math.abs(yrs - py) > lim && !(yrs > py && p.age >= 30)) { t.log.push({ w: 'a', t: yrs < py ? `He wants security, not a short look. ${a.d[1] > 0.4 ? `Think ${py} years.` : 'Longer.'}` : `He is not locking himself up that long. ${a.d[1] > 0.4 ? `Think ${py} years.` : 'Shorter.'}` }); faTire(p, t); return null; }
  const need = faGtdNeed(p, t, yrs);
  if (gtd + 0.005 < need) {
    const r = gtd / Math.max(0.01, need);
    t.log.push({ w: 'a', t: a.d[1] > 0.6 ? `On ${yrs} year${yrs === 1 ? '' : 's'} he needs ${fmtMoney(need)} guaranteed before we talk salary.` : r > 0.85 ? faSay(a, 'near') + ' The guarantee.' : faSay(a, 'no') + ' The guarantee is the real money.' });
    faTire(p, t); return null; }
  t.yrs = yrs; t.gtd = gtd; t.step = 3; t.aav = null; t.S = null;
  t.log.push({ w: 'a', t: (gtd > need * 1.25 ? 'That is real commitment. He will remember it. ' : '') + 'Now the salary.' });
  return null;
}
function faBackToCommit(pid) {
  const p = P(pid), t = faTalk(pid), err = faOpenCheck(p, t); if (err) return err;
  if (t.step !== 3) return 'Nothing to reopen';
  t.step = 2; t.log.push({ w: 'u', t: 'Let us look at the years and the guarantee again.' }); t.log.push({ w: 'a', t: 'If we must.' }); faTire(p, t); return null;
}
// the number he would truly take from this club today, and the number he is holding out for
function faTrue(p) { const best = faBest(p, state.userTid); return Math.max(faDemand(p, state.fa.day), best ? best.v * 1.01 : 0) * (1 + Math.max(0, agentGrudge(agentOf(p))) * 0.015); }
function faStance(p, t) {
  if (t.S === null) { const TH = faTrue(p); t.S = TH + Math.max(0, faAsk(p) - TH) * 0.7 + TH * 0.02; }
  return Math.max(t.S, faTrue(p));
}
function faConcede(p, t, k) { const a = agentOf(p), TH = faTrue(p), c = (0.22 + (1 - a.d[2]) * 0.33) * (k || 1); t.S = TH + Math.max(0, faStance(p, t) - TH) * (1 - c); }
function faUserFits(p, o) {
  const u = state.userTid, mine = faOffers(p).find(x => x.tid === u), com = faCommitted(u), y1 = loadSched(o.aav, o.yrs, o.load)[0], old = mine ? loadSched(mine.aav, mine.yrs, mine.load)[0] : 0;
  if (y1 - old > capRoom(u) - com.amt) return 'Not enough cap room with your other offers out';
  if (!mine && rosterCount(u) + com.n >= rosterLimit()) return 'No roster spot left with your other offers out';
  return null;
}
function faAgree(p, t, o, viaPlayer) {
  const a = agentOf(p), fa = state.fa, lev = leverageOf(p), rivals = faOffers(p).filter(x => x.tid !== o.tid).length;
  const wait = !viaPlayer && ((lev >= 0.8 && fa.day < 1 && faOfferValue(p, o) < faAsk(p)) || (rivals > 0 && a.d[2] > 0.62));
  if (wait) { o.night = true; faPlace(p, o); t.closed = 'day'; t.log.push({ w: 'a', t: 'I can sell that. Let me take it to him tonight. You will hear from me tomorrow.' }); return; }
  t.log.push({ w: 'a', t: viaPlayer ? 'He called me himself. He wants to be there. Get the paper ready.' : faSay(a, 'yes') });
  faSign(p, o);
}
// step 3: the salary on top, and how it is paid
function faSaySalary(pid, aav, load) {
  const p = P(pid), t = faTalk(pid), err = faOpenCheck(p, t); if (err) return err;
  if (t.step !== 3) return 'Settle the years and the guarantee first';
  const a = agentOf(p);
  aav = round2(Math.max(MIN_SALARY, aav, t.gtd / t.yrs)); t.aav = aav; t.load = load || 'even';
  const o = faTalkOffer(p, t), fit = faUserFits(p, o); if (fit) return fit;
  t.log.push({ w: 'u', t: `${fmtMoney(aav)} a year${t.yrs >= 2 && t.load !== 'even' ? (t.load === 'front' ? ', more of it up front' : ', more of it at the back') : ''}.` });
  const v = faOfferValue(p, o), S = faStance(p, t), TH = faTrue(p);
  if (v >= S) { faAgree(p, t, o); return null; }
  if (v >= faFloor(p, state.fa.day) && v >= TH * 0.97 && faWantsMet(p, o) >= 2 && a.d[5] > 0.55) { faAgree(p, t, o, true); return null; }
  const needAav = round2(aav * S / Math.max(0.01, v)), gap = S / Math.max(0.01, v) - 1, real = faBest(p, state.userTid);
  let line;
  if (a.d[1] > 0.62) line = `On these terms it takes ${fmtMoney(needAav)} a year.`;
  else if (a.d[1] > 0.35) line = (gap > 0.12 ? faSay(a, 'no') : faSay(a, 'near')) + (real && rand() < a.d[1] + 0.2 ? ' There is a real offer ahead of yours.' : '');
  else line = (gap > 0.12 ? faSay(a, 'no') : faSay(a, 'near')) + (rand() < 0.6 ? ` I have a club at ${fmtMoney(round2(needAav * (1.04 + rand() * 0.1)))}.` : '');
  t.log.push({ w: 'a', t: line });
  if (gap > 0.3) faTire(p, t, 2); else faTire(p, t);
  faConcede(p, t);
  return null;
}
function faHold(pid) {
  const p = P(pid), t = faTalk(pid), err = faOpenCheck(p, t); if (err) return err;
  if (t.step !== 3 || t.aav === null) return 'Make an offer first';
  const a = agentOf(p), o = faTalkOffer(p, t);
  t.log.push({ w: 'u', t: 'That is our number.' });
  faConcede(p, t, 0.6);
  if (faOfferValue(p, o) >= faStance(p, t)) { faAgree(p, t, o); return null; }
  t.log.push({ w: 'a', t: faBest(p, state.userTid) ? 'Then you are going to lose him.' : a.d[0] > 0.55 ? 'Then we wait. The market will come to him.' : 'I hear you. I cannot do it there.' });
  faTire(p, t); return null;
}
function faFinal(pid) {
  const p = P(pid), t = faTalk(pid), err = faOpenCheck(p, t); if (err) return err;
  if (t.step !== 3 || t.aav === null) return 'Make an offer first';
  const a = agentOf(p), o = faTalkOffer(p, t);
  t.log.push({ w: 'u', t: 'That is our best and final offer.' });
  if (faOfferValue(p, o) >= faTrue(p)) { faAgree(p, t, o); return null; }
  t.closed = a.d[0] > 0.6 ? 'done' : 'day'; faPull(p, state.userTid);
  t.log.push({ w: 'a', t: t.closed === 'done' ? 'Then we are finished. Good luck.' : 'Then it is no. If that changes, you know where I am.' });
  if (t.closed === 'done') agentNote(a, p, 'walked', o.aav, faAsk(p));
  return null;
}
function faStand(pid) {
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
  const p = P(pid), t = faTalk(pid); if (!t) return 'He is not on the market';
  if (t.closed === 'done') return 'His agent will not take your calls about him';
  if (t.step !== 3 || t.aav === null) return 'There is no full offer to leave';
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
  const p = P(pid), t = state.fa.talks[pid]; if (!t) return null;
  if (t.step === 3 && t.aav !== null) agentNote(agentOf(p), p, 'walked', t.aav, faAsk(p));
  faPull(p, state.userTid); delete state.fa.orders[pid]; delete state.fa.talks[pid]; return null;
}
// hand it to the front office with a ceiling
function faOrder(pid, max, role) {
  const p = P(pid); if (!p || !faInMarket(p)) return 'He is not on the market';
  if (!max) { delete state.fa.orders[pid]; return null; }
  state.fa.orders[pid] = { max: round2(max), role: role || 'start' }; return null;
}
