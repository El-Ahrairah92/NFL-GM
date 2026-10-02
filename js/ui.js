'use strict';
// =====================================================================
//  UI
// =====================================================================
const SAVE_KEY = 'gridiron-gm-save-v2';
let view = 'home';
const ui = {
  rosterTid: null, schedWeek: null, statCat: 'passing', statSeason: null, statMine: false,
  tradeTid: null, give: { players: [], picks: [] }, get: { players: [], picks: [] },
  faPos: 'ALL', draftPos: 'ALL', newsMine: false, histTid: null,
};
const sortState = {};
const $ = s => document.querySelector(s);

// ---------- persistence ----------
// Saves live in IndexedDB (localStorage tops out around 5 MB, which a long dynasty outgrows). Older saves in
// localStorage are read once and moved over.
const IDB_NAME = 'gridiron-gm', IDB_STORE = 'saves';
let hasSave = false, saving = null, saveAgain = false;
function idb() {
  return new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('no IndexedDB'));
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
function idbDo(mode, fn) {
  return idb().then(db => new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, mode), req = fn(tx.objectStore(IDB_STORE));
    tx.oncomplete = () => { db.close(); res(req && req.result); }; tx.onerror = () => { db.close(); rej(tx.error); };
  }));
}
function save() {
  if (!state) return;
  if (saving) { saveAgain = true; return; } // one write at a time; the latest state goes in next
  const data = JSON.stringify(state);
  hasSave = true;
  saving = idbDo('readwrite', st => st.put(data, SAVE_KEY))
    .then(() => { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } })
    .catch(() => { try { localStorage.setItem(SAVE_KEY, data); } catch (e) { toast('Could not autosave (browser storage full). Use Export to keep a copy.'); } })
    .finally(() => { saving = null; if (saveAgain) { saveAgain = false; save(); } });
}
function readSave() {
  return idbDo('readonly', st => st.get(SAVE_KEY)).catch(() => null)
    .then(s => s || (() => { try { return localStorage.getItem(SAVE_KEY); } catch (e) { return null; } })());
}
function load() {
  return readSave().then(s => {
    try { if (s) { const st = JSON.parse(s); if (st.version >= 2 && migrateState(st)) return true; state = null; } } catch (e) { state = null; }
    return false;
  });
}
function deleteSave() {
  hasSave = false;
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  return idbDo('readwrite', st => st.delete(SAVE_KEY)).catch(() => null);
}
function exportSave() {
  const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `gridiron-gm-${T(state.userTid).abbr}-${state.season}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function importSave(file) {
  const r = new FileReader();
  r.onload = () => {
    try { const st = JSON.parse(r.result); if (!(st.version >= 2 && migrateState(st))) { state = null; toast('That save is from an older version of the game.'); render(); return; } save(); view = 'home'; render(); toast('Save loaded.'); }
    catch (e) { toast('That file is not a valid save.'); }
  };
  r.readAsText(file);
}

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---------- small render helpers ----------
function rCls(v) { return v >= 85 ? 'r-elite' : v >= 75 ? 'r-good' : v >= 65 ? 'r-avg' : 'r-low'; }
function rat(v) { return `<span class="r ${rCls(v)}">${v}</span>`; }
// ---------- perception labels: what your front office believes (true numbers only in the debug view) ----------
function trueOn() { return !!(state && state.settings && state.settings.showTrue); }
const TIER_CLS = { 'Elite': 'pt-elite', 'All-Pro': 'pt-allpro', 'Starter': 'pt-starter', 'Rotation': 'pt-rot', 'Backup': 'pt-rot', 'Depth': 'pt-depth', 'Project': 'pt-low', 'Fringe': 'pt-low', 'Washed': 'pt-low' };
const UP_CLS = { 'Elite': 'pt-elite', 'High-End Starter': 'pt-allpro', 'Solid Starter': 'pt-starter', 'Borderline Starter': 'pt-rot', 'Strong Depth': 'pt-depth', 'Decent Depth': 'pt-depth', 'Special Teamer': 'pt-low', 'Limited Upside': 'pt-low' };
function tierPill(p, v) { const t = tierOf(p, v); return `<span class="pill ${TIER_CLS[t]}">${t}</span>`; }
function upsidePill(p) { const u = upsideOf(p); return `<span class="pill up ${UP_CLS[u]}">${u}</span>`; }
function trueNums(p) { return trueOn() ? ` <span class="small muted" title="True OVR / POT (debug view)">${p.ovr}/${p.pot}</span>` : ''; }
function traitsTxt(p) { return traitTags(p).map(esc).join(' · '); }
function teamLink(tid, full) {
  const t = T(tid);
  return `<button class="link" data-action="team" data-tid="${tid}"><span class="dot" style="background:${t.color}"></span> ${full ? esc(t.region + ' ' + t.name) : t.abbr}</button>`;
}
function playerLink(p, short) {
  if (!p) return '—';
  return `<button class="link" data-action="player" data-pid="${p.id}">${esc(short ? pshort(p) : pname(p))}</button>`;
}
const FAM_INDEX = {};
FAMILIES.forEach(([, spots], i) => spots.forEach(s => FAM_INDEX[s] = i));
function famOrder(a, b) { return FAM_INDEX[a.spot] - FAM_INDEX[b.spot] || uOvr(b) - uOvr(a); }
function inFamily(p, fam) { return fam === 'ALL' || FAMILIES.find(f => f[0] === fam)[1].includes(p.spot); }
function famTabs(cur, action) { return ['ALL', ...FAMILIES.map(f => f[0])].map(f => `<button class="${cur === f ? 'on' : ''}" data-action="${action}" data-pos="${f}">${f}</button>`).join(''); }
function htwt(p) { return `${fmtHeight(p.m.ht)} ${p.m.wt}`; }
function statusPills(p) {
  let s = '';
  if (p.injury) s += `<span class="pill ${onIR(p) ? 'ir' : 'inj'}" title="${esc(p.injury.name)}">${onIR(p) ? 'IR' : 'INJ'} ${p.injury.weeks}w</span> `;
  if (p.expiring) s += `<span class="pill exp">Expiring</span> `;
  if ((p.wear || 0) >= 8) s += `<span class="pill inj" title="Heavy workload: playing below his ratings and at higher injury risk">Worn</span> `;
  if (p.exp === 0 && p.tid >= 0) s += `<span class="pill rook">R</span> `;
  return s;
}
function fmtContract(p) {
  const c = p.contract;
  if (p.tid === -3) return `<span class="muted">PS ${fmtMoney(c.amt)}</span>`;
  if (!(c.yrs > 0)) return '—';
  const tags = (c.tagged ? ' <span class="pill exp" title="Franchise tag (fully guaranteed)">Tag</span>' : '') +
    (c.next ? ` <span class="pill" title="${c.opt5 === 'exercised' ? '5th-year option' : 'Extension'}: ${c.next.yrs} yr × ${fmtMoney(c.next.amt)} starting next season">${c.opt5 === 'exercised' && c.next.yrs === 1 ? 'Opt' : 'Ext'}</span>` : '');
  return `<span title="${fmtMoney(c.gtd || 0)} guaranteed remaining">${fmtMoney(c.amt)} × ${c.yrs}</span>${tags}`;
}
function recOf(tid, recs) { return recStr((recs || standings())[tid]); }

// generic sortable table: cols [{k, l, v: row=>value, f: row=>html, num, title}]
function table(id, cols, rows, opts = {}) {
  const ss = sortState[id] || (opts.sort ? { k: opts.sort, dir: opts.dir || -1 } : null);
  if (ss) {
    const col = cols.find(c => c.k === ss.k);
    if (col) rows = rows.slice().sort((a, b) => {
      const va = col.v(a), vb = col.v(b);
      return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * ss.dir;
    });
  }
  if (opts.limit) rows = rows.slice(0, opts.limit);
  const head = cols.map(c => `<th class="${c.num ? 'num' : ''} ${c.v && !opts.nosort ? 'sortable' : ''} ${ss && ss.k === c.k ? 'sorted' : ''}" ${c.v && !opts.nosort ? `data-action="sort" data-table="${id}" data-k="${c.k}"` : ''} title="${c.title || ''}">${c.l}${ss && ss.k === c.k ? (ss.dir < 0 ? ' ▾' : ' ▴') : ''}</th>`).join('');
  const body = rows.map((r, i) => {
    const cls = opts.rowClass ? opts.rowClass(r, i) : '';
    return `<tr class="${cls}">` + cols.map(c => `<td class="${c.num ? 'num' : ''}">${c.f ? c.f(r, i) : (c.v ? c.v(r) : '')}</td>`).join('') + '</tr>';
  }).join('');
  return `<div class="tbl-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length}" class="muted">Nothing here.</td></tr>`}</tbody></table></div>`;
}

// ---------- top level ----------
function render() {
  const app = $('#app');
  if (!state) { app.innerHTML = setupHTML(); return; }
  document.documentElement.style.setProperty('--accent', T(state.userTid).color);
  app.innerHTML = topbarHTML() + `<main>${pageHTML()}</main>`;
}

function setupHTML() {
  const has = hasSave;
  let html = `<div class="setup"><h1>Gridiron <span style="color:var(--accent)">GM</span></h1>
  <p class="muted">Build a football team through the draft, free agency and trades, then sim the season one week at a time.</p>
  <div class="row">${has ? '<button class="primary" data-action="continueSave">Continue saved league</button>' : ''}
  <label class="row"><button data-action="importClick">Import save…</button></label></div>
  <h3 style="margin-top:28px">Start a new league — pick your team</h3><div class="team-pick">`;
  for (const conf of ['AFC', 'NFC']) {
    html += `<div class="conf-h">${conf}</div>`;
    TEAMS.forEach((t, i) => { if (t[3] === conf) html += `<button data-action="newLeague" data-tid="${i}"><span class="dot" style="background:${t[5]}"></span><span><b>${t[0]}</b> ${t[1]}<br><span class="muted small">${t[3]} ${t[4]}</span></span></button>`; });
  }
  return html + '</div></div>';
}

const PAGES = [['home', 'Home'], ['roster', 'Roster'], ['schedule', 'Schedule'], ['standings', 'Standings'], ['stats', 'League Stats'], ['trade', 'Trade'], ['fa', 'Free Agents'], ['draft', 'Draft'], ['coaches', 'Coaches'], ['news', 'News'], ['history', 'History'], ['settings', 'Settings']];

function continueLabel() {
  switch (state.phase) {
    case 'REG': return `▶ Play Week ${state.week}`;
    case 'PLAYOFFS': return `▶ Play ${ROUND_NAMES[state.playoffs.round]}`;
    case 'RECAP': return 'Start Offseason →';
    case 'COACHES': return 'Done with Coaches →';
    case 'RESIGN': return 'Done Re-signing →';
    case 'FA': return `Next FA Wave (${state.faWave + 1}/${FA_WAVES}) →`;
    case 'DRAFT': { const pk = currentPick(); return pk && pk.owner === state.userTid ? 'Auto-pick for Me' : 'Sim to My Pick'; }
    case 'PRESEASON': return `Start ${state.season + 1} Season →`;
  }
}
function topbarHTML() {
  const t = T(state.userTid), recs = standings();
  const wk = state.phase === 'REG' ? ` · Week ${state.week}` : '';
  let sim2 = '';
  if (state.phase === 'REG') sim2 = '<button data-action="simPlayoffs">⏩ To Playoffs</button>';
  else if (state.phase === 'PLAYOFFS') sim2 = '<button data-action="simPlayoffs">⏩ Finish Playoffs</button>';
  else if (state.phase === 'DRAFT') sim2 = '<button data-action="simDraft">⏩ Sim Draft</button>';
  return `<div class="topbar"><div class="topbar-inner">
    <div class="brand">GRIDIRON <span>GM</span></div>
    <div class="phase"><b>${state.season}</b> · ${PHASE_LABEL[state.phase]}${wk}</div>
    <div class="spacer"></div>
    <div class="teambadge"><span class="dot" style="background:${t.color}"></span>${esc(t.region + ' ' + t.name)} <span class="muted">${recOf(t.id, recs)}</span></div>
    <span class="muted small">Cap ${fmtMoney(capRoom(t.id))}</span>
    <button class="primary" data-action="continue">${continueLabel()}</button>
    ${sim2}
    <button data-action="simYear" title="Auto-manages your team through the rest of this season and the offseason">⏭ Sim to Next Season</button>
  </div><nav class="tabs">${PAGES.map(([k, l]) => `<button class="${view === k ? 'on' : ''}" data-action="nav" data-view="${k}">${l}</button>`).join('')}</nav></div>`;
}
function pageHTML() {
  switch (view) {
    case 'home': return homeHTML();
    case 'roster': return rosterHTML();
    case 'schedule': return scheduleHTML();
    case 'standings': return standingsHTML();
    case 'stats': return statsHTML();
    case 'trade': return tradeHTML();
    case 'fa': return faHTML();
    case 'draft': return draftHTML();
    case 'coaches': return coachesHTML();
    case 'news': return newsHTML();
    case 'history': return historyHTML();
    case 'settings': return settingsHTML();
  }
  return '';
}

// ---------- home ----------
function phaseCallout() {
  const u = state.userTid;
  switch (state.phase) {
    case 'REG': return state.week <= TRADE_DEADLINE ? `Trade deadline: after week ${TRADE_DEADLINE}.` : 'The trade deadline has passed.';
    case 'PLAYOFFS': {
      const po = state.playoffs;
      if (po.elim[u] !== undefined) return `Your season ended in the ${ROUND_NAMES[po.elim[u]]}.`;
      if (po.seeds[T(u).conf].includes(u)) return `You're the #${seedOf(u)} seed. Win and advance!`;
      return 'You missed the playoffs. Watch the bracket unfold, then the offseason begins.';
    }
    case 'RECAP': return 'The season is over. Review the awards below, then start the offseason: players age and progress, contracts expire and a draft class is revealed.';
    case 'COACHES': return 'Coaching carousel: fire and hire coaches on the <b>Coaches</b> tab. Any open spots get filled automatically when you continue.';
    case 'RESIGN': { const n = rosterOf(u).filter(p => p.expiring).length; return `You have <b>${n}</b> expiring contract${n === 1 ? '' : 's'}. Re-sign players on the <b>Roster</b> tab. Anyone you don't re-sign becomes a free agent.`; }
    case 'FA': return `Free agency wave ${state.faWave + 1} of ${FA_WAVES}. Sign players on the <b>Free Agents</b> tab before AI teams do. Unsigned players lower their asking price each wave.`;
    case 'DRAFT': { const pk = currentPick(); return pk ? `Pick ${pk.pick} (Rd ${pk.round}): <b>${T(pk.owner).abbr}</b> on the clock. ${pk.owner === u ? 'That\'s you! Choose on the <b>Draft</b> tab.' : ''}` : ''; }
    case 'PRESEASON': { const n = rosterOf(u).length; return `Roster: ${n} players (limit ${ROSTER_MAX}). ${n > ROSTER_MAX ? 'Extra players will be auto-cut (lowest value first) when the season starts. Release players yourself on the Roster tab if you prefer.' : 'You\'re set for the season.'}`; }
  }
  return '';
}
function nextGame(tid) {
  if (state.phase !== 'REG') return null;
  const m = state.schedule[state.week - 1].find(g => g.h === tid || g.a === tid);
  return m;
}
function lastGame(tid) {
  const ids = Object.keys(state.games).map(Number).sort((a, b) => b - a);
  for (const id of ids) { const g = state.games[id]; if (g.tids.includes(tid)) return g; }
  return null;
}
function homeHTML() {
  const u = state.userTid, t = T(u), recs = standings(), r = recs[u];
  const divs = divisionStandings(), myDiv = divs[t.conf + ' ' + t.div];
  const place = myDiv.findIndex(x => x.tid === u) + 1;
  const ng = nextGame(u), lg = lastGame(u);
  let html = `<div class="callout">${phaseCallout()}</div>`;
  if (state.phase === 'RECAP') html += recapHTML();
  html += `<div class="grid g3">`;
  // team card
  html += `<div class="card"><h3>${esc(t.region + ' ' + t.name)}</h3>
    <div class="row" style="align-items:baseline"><span class="big">${recStr(r)}</span><span class="muted">${ordinal(place)} in ${t.conf} ${t.div}</span></div>
    <div class="stat-tiles" style="margin-top:10px">
      <div class="tile"><div class="v">${r.pf}</div><div class="l">Points For</div></div>
      <div class="tile"><div class="v">${r.pa}</div><div class="l">Points Against</div></div>
      <div class="tile"><div class="v">${fmtMoney(capRoom(u))}</div><div class="l">Cap Space</div></div>
      <div class="tile"><div class="v">${rosterCount(u)}/${rosterLimit()}</div><div class="l">Roster</div></div>
    </div>
    <div class="kv" style="margin-top:12px">
      ${COACH_ROLES.map(r => `<div>${ROLE_SHORT[r] === 'HC' ? 'Head Coach' : ROLE_SHORT[r]}</div><div>${coachLink(C(t[r.toLowerCase()]))}</div>`).join('')}
      <div>Schemes</div><div class="small">${esc(OFF_ARCH[offArch(t)] ? OFF_ARCH[offArch(t)].l : '—')} · ${esc(DEF_ARCH[defArch(t)] ? DEF_ARCH[defArch(t)].l : '—')}</div>
      <div>Team Rating</div><div>Off ${rat(teamOvr(u, 'off'))} · Def ${rat(teamOvr(u, 'def'))}</div>
    </div></div>`;
  // games card
  html += `<div class="card"><h3>Games</h3>`;
  if (ng) {
    const opp = ng.h === u ? ng.a : ng.h;
    html += `<div class="muted small">NEXT — WEEK ${state.week}</div><div class="row" style="margin:4px 0 12px"><b>${ng.h === u ? 'vs' : '@'}</b> ${teamLink(opp, true)} <span class="muted">(${recOf(opp, recs)})</span></div>`;
  }
  if (lg) {
    const [h, a] = lg.tids, us = lg.tids.indexOf(u), won = lg.score[us] > lg.score[1 - us], tie = lg.score[0] === lg.score[1];
    html += `<div class="muted small">LAST GAME${lg.playoff ? ' — ' + lg.playoff.toUpperCase() : ' — WEEK ' + lg.week}</div>
      <div class="game" data-action="box" data-gid="${lg.id}" style="margin-top:4px">
        <div class="ln ${lg.score[1] > lg.score[0] ? 'w' : ''}"><span>${T(a).abbr}</span><span>${lg.score[1]}</span></div>
        <div class="ln ${lg.score[0] > lg.score[1] ? 'w' : ''}"><span>${T(h).abbr}</span><span>${lg.score[0]}</span></div>
        <div class="small ${tie ? 'muted' : won ? 'good' : 'bad'}">${tie ? 'Tie' : won ? 'Win' : 'Loss'}${lg.ot ? ' (OT)' : ''} · click for box score</div>
      </div>`;
  }
  if (!ng && !lg) html += '<div class="muted">No games yet.</div>';
  html += `<h3 style="margin-top:16px">${t.conf} ${t.div}</h3>` + miniStandings(myDiv) + `</div>`;
  // leaders
  html += `<div class="card"><h3>Team Leaders</h3>${teamLeaders(u)}</div>`;
  html += `</div><div class="grid g2" style="margin-top:16px">`;
  const inj = rosterOf(u).filter(p => p.injury).sort((a, b) => uOvr(b) - uOvr(a));
  html += `<div class="card"><h3>Injury Report</h3>${inj.length ? table('inj', [
    { k: 'pos', l: 'Pos', v: p => p.lbl }, { k: 'n', l: 'Player', f: p => playerLink(p) }, { k: 'o', l: 'Tier', f: p => tierPill(p) },
    { k: 'i', l: 'Injury', f: p => esc(p.injury.name) }, { k: 'w', l: 'Out', f: p => p.injury.weeks + ' wk' + (onIR(p) ? ' (IR)' : ''), num: 1 },
  ], inj, { nosort: 1 }) : '<div class="muted">Everyone is healthy.</div>'}</div>`;
  html += `<div class="card"><h3>Latest News</h3>${newsList(state.news.slice(0, 14))}</div></div>`;
  html += campCardHTML();
  return html;
}
function coachLink(c) { return c ? `${coachNameLink(c)} ${tierChip(c.ovr)}` : '<span class="bad">Vacant</span>'; }
function teamOvr(tid, side) {
  const v = depthView(tid);
  const units = side === 'off' ? v.off : v.nickel;
  let s = 0, n = 0;
  for (const e of units) { const w = e.slot === 'QB' ? 3.5 : 1; s += (slotRating(e.p, e.spot) + (e.p.a ? uOvr(e.p) - e.p.ovr : 0)) * w; n += w; }
  return Math.round(s / n);
}
function miniStandings(rows) {
  return table('mini', [
    { k: 't', l: 'Team', f: r => teamLink(r.tid) }, { k: 'w', l: 'W-L-T', f: r => recStr(r), num: 1 },
    { k: 'd', l: 'Div', f: r => `${r.dw}-${r.dl}`, num: 1 }, { k: 'pd', l: 'Diff', f: r => (r.pf - r.pa > 0 ? '+' : '') + (r.pf - r.pa), num: 1 },
  ], rows, { nosort: 1, rowClass: r => r.tid === state.userTid ? 'me' : '' });
}
function teamLeaders(tid) {
  const ro = rosterOf(tid).filter(p => p.stats.gp);
  const lead = (k, fmt) => { const p = ro.slice().sort((a, b) => (b.stats[k] || 0) - (a.stats[k] || 0))[0]; return p && p.stats[k] ? `<div>${fmt}</div><div>${playerLink(p, true)} <span class="muted">${p.stats[k]}</span></div>` : ''; };
  const s = lead('passY', 'Pass Yds') + lead('rushY', 'Rush Yds') + lead('recY', 'Rec Yds') + lead('tkl', 'Tackles') + lead('sck', 'Sacks') + lead('dint', 'INT');
  return s ? `<div class="kv">${s}</div>` : '<div class="muted">No stats yet this season.</div>';
}
function newsList(items) {
  if (!items.length) return '<div class="muted">No news.</div>';
  return `<ul class="news">${items.map(n => `<li class="${n.tids.includes(state.userTid) ? 'mine' : ''}"><span class="when">${n.s} ${esc(n.when)}</span><span>${esc(n.text)}</span></li>`).join('')}</ul>`;
}
function recapHTML() {
  const h = state.history[state.history.length - 1];
  if (!h) return '';
  let html = `<div class="card" style="margin-bottom:16px"><h3>${h.season} Season Awards</h3><div class="row" style="margin-bottom:10px">🏆 <b>Champion:</b> ${teamLink(h.champ, true)} <span class="muted">def. ${T(h.runnerUp).abbr}</span></div><div class="kv">`;
  for (const k in h.awards) { const a = h.awards[k]; html += `<div>${AWARD_NAMES[k]}</div><div>${P(a.pid) ? playerLink(P(a.pid)) : esc(a.name)} <span class="muted">(${T(a.tid).abbr} ${a.pos}) — ${esc(a.line)}</span></div>`; }
  return html + '</div></div>';
}

// ---------- roster ----------
function rosterHTML() {
  const tid = ui.rosterTid == null ? state.userTid : ui.rosterTid;
  const mine = tid === state.userTid;
  const ro = rosterOf(tid);
  const opts = state.teams.map(t => `<option value="${t.id}" ${t.id === tid ? 'selected' : ''}>${t.region} ${t.name}</option>`).join('');
  let html = `<div class="row" style="margin-bottom:12px"><select data-change="rosterTeam">${opts}</select>
    <span class="muted">Cap ${fmtMoney(state.cap)} · Payroll ${fmtMoney(payroll(tid))} · Cap space <b>${fmtMoney(capRoom(tid))}</b>${T(tid).dead ? ` · Dead money ${fmtMoney(T(tid).dead)}` : ''} · Next year committed ${fmtMoney(payrollNext(tid))} · ${rosterCount(tid)}/${rosterLimit()} players${state.phase === 'REG' ? ' (IR excluded)' : ''} · PS ${psOf(tid).length}/${PS_MAX}</span>
    <span class="spacer"></span>${mine && state.phase === 'RESIGN' ? '<button data-action="resignAll">Re-sign all affordable starters</button>' : ''}
    ${mine && ro.length > ROSTER_MAX && state.phase === 'PRESEASON' ? `<button data-action="autoCut">Auto-cut to ${ROSTER_MAX}</button>` : ''}</div>`;
  if (mine && state.phase === 'RESIGN') html += decisionsHTML(tid);
  // starters = whoever the game engine currently puts on the field
  const dv = depthView(tid), starters = new Set();
  for (const e of [...dv.off, ...dv.nickel, ...dv.base, dv.k, dv.p]) starters.add(e.p.id);
  const rows = [];
  for (const [fam, spots] of FAMILIES) {
    const grp = ro.filter(p => spots.includes(p.spot)).sort((a, b) => (!!a.injury - !!b.injury) || uOvr(b) - uOvr(a));
    if (!grp.length) continue;
    rows.push({ sep: `${fam} (${grp.length})` });
    grp.forEach(p => rows.push(p));
  }
  const cols = [
    { k: 'pos', l: 'Pos', f: p => esc(p.lbl) + (starters.has(p.id) ? '' : '<span class="muted small">²</span>') },
    { k: 'n', l: 'Name', f: p => playerLink(p) + ' ' + statusPills(p) },
    { k: 'age', l: 'Age', f: p => p.age, num: 1 },
    { k: 'hw', l: 'Ht/Wt', f: p => `<span class="small muted">${htwt(p)}</span>` },
    { k: 'tier', l: 'Tier', f: p => tierPill(p) + trueNums(p) },
    { k: 'up', l: 'Upside', f: p => upsidePill(p) },
    { k: 'sk', l: 'Scouting', f: p => `<span class="small muted">${traitsTxt(p)}</span>` },
    { k: 'fit', l: 'Fit', f: p => { const f = schemeFit(p, tid); return `<span class="small ${f >= 1 ? 'good' : f <= -1 ? 'bad' : 'muted'}" title="Scheme fit in ${esc(T(tid).abbr)}'s system">${fitLabel(f).replace(' fit', '')}${trueOn() ? ` (${f > 0 ? '+' : ''}${f})` : ''}</span>`; } },
    { k: 'c', l: 'Contract', f: p => fmtContract(p) },
    { k: 'st', l: 'Season', f: p => `<span class="small">${p.stats.gp ? statSummary(p.stats, p.pos) + ` <span class="muted">(${p.stats.gp} gp)</span>` : ''}</span>` },
  ];
  if (mine) cols.push({ k: 'a', l: '', f: p => rosterActions(p) });
  html += `<div class="card">` + (() => {
    const head = cols.map(c => `<th class="${c.num ? 'num' : ''}">${c.l}</th>`).join('');
    const body = rows.map(r => r.sep ? `<tr class="sep"><td colspan="${cols.length}">${r.sep}</td></tr>` : `<tr>${cols.map(c => `<td class="${c.num ? 'num' : ''}">${c.f(r)}</td>`).join('')}</tr>`).join('');
    return `<div class="tbl-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  })() + `<div class="muted small" style="margin-top:6px">² = depth (non-starter). Your coaches pick the starters (they know who's really better). 48 of the 53 dress on game day.</div></div>`;
  html += practiceSquadHTML(tid, mine);
  return html;
}
// re-signing season: what needs a decision
function decisionsHTML(tid) {
  const ro = rosterOf(tid);
  const opts = ro.filter(optionDue), ext = ro.filter(extensionDue), exp = ro.filter(p => p.expiring);
  const tagUsed = T(tid).tagYr === state.season + 1;
  const li = (p, extra) => `<div class="small" style="margin:3px 0">${esc(p.lbl)} ${playerLink(p)} ${tierPill(p)} ${extra}</div>`;
  let h = `<div class="callout"><b>Re-signing period.</b> Expiring players ask for the amount in their row; anyone you don't re-sign (or tag) hits free agency. Undecided 5th-year options get your staff's recommendation when you continue.`;
  if (opts.length) h += `<div class="section-title">5th-year options due</div>` + opts.map(p => li(p, `option year ${fmtMoney(optionAmount(p))} (fully guaranteed) <button class="sm primary" data-action="option" data-pid="${p.id}" data-v="1">Exercise</button> <button class="sm" data-action="option" data-pid="${p.id}" data-v="0">Decline</button>`)).join('');
  if (!tagUsed && exp.length) { const top = exp.slice().sort((a, b) => uOvr(b) - uOvr(a)).slice(0, 3); h += `<div class="section-title">Franchise tag (1 per year)</div>` + top.map(p => li(p, `tag ${fmtMoney(tagAmount(p))} for one year <button class="sm" data-action="tag" data-pid="${p.id}">Tag</button>`)).join(''); }
  else if (tagUsed) h += `<div class="small muted" style="margin-top:6px">Franchise tag used this year.</div>`;
  if (ext.length) h += `<div class="section-title">Extension candidates (entering final year)</div>` + ext.sort((a, b) => uOvr(b) - uOvr(a)).slice(0, 6).map(p => { const a = extensionAsk(p); return li(p, `asks ${a.yrs} yr × ${fmtMoney(a.amt)} <button class="sm" data-action="extend" data-pid="${p.id}">Extend</button>`); }).join('');
  return h + '</div>';
}
function practiceSquadHTML(tid, mine) {
  const ps = psOf(tid).sort(famOrder);
  if (!ps.length) return '';
  return `<div class="card" style="margin-top:16px"><h3>Practice Squad (${ps.length}/${PS_MAX})</h3><p class="muted small">Develops like everyone else, doesn't dress on game day, can be promoted when injuries hit — and other teams can sign them away to their 53.</p>` + table('ps', [
    { k: 'pos', l: 'Pos', f: p => esc(p.lbl) }, { k: 'n', l: 'Name', f: p => playerLink(p) + ' ' + statusPills(p) }, { k: 'age', l: 'Age', f: p => p.age, num: 1 },
    { k: 'tier', l: 'Tier', v: p => uOvr(p), f: p => tierPill(p) + trueNums(p) }, { k: 'up', l: 'Upside', v: p => uCeil(p), f: p => upsidePill(p) },
    { k: 'sk', l: 'Scouting', f: p => `<span class="small muted">${traitsTxt(p)}</span>` },
    { k: 'a', l: '', f: p => mine ? `<button class="sm primary" data-action="promote" data-pid="${p.id}">Promote</button> <button class="sm danger" data-action="psRelease" data-pid="${p.id}">Release</button>` : '' },
  ], ps, { nosort: 1 }) + '</div>';
}
// the contract block on a player card
function contractHTML(p) {
  const c = p.contract;
  if (p.tid === -2) return '';
  let h = `<div class="section-title">Contract</div><div class="small">`;
  if (p.tid === -3) h += `Practice squad (${T(p.psTid).abbr}) · ${fmtMoney(c.amt)}`;
  else if (p.tid === -1) h += `Free agent · asking ${fmtMoney(p.ask)}/yr`;
  else if (p.expiring) h += `Expiring · asking ${fmtMoney(p.ask)}/yr`;
  else {
    const d = deadIfCut(p);
    h += `${fmtMoney(c.amt)}/yr · ${c.yrs} yr${c.yrs > 1 ? 's' : ''} left · ${fmtMoney(c.gtd || 0)} guaranteed remaining`;
    h += `<div class="muted">Dead money if released now: ${fmtMoney(d.now)}${d.next ? ` (+${fmtMoney(d.next)} next year)` : ''}</div>`;
    if (c.rookie) h += `<div class="muted">Rookie deal${c.opt5 ? ` · 5th-year option: ${c.opt5}` : ''}</div>`;
    if (c.tagged) h += `<div class="muted">Franchise tag (tag #${p.tags || 1})</div>`;
    if (c.next) h += `<div>Then: ${c.next.yrs} yr × ${fmtMoney(c.next.amt)} (${fmtMoney(c.next.gtd || 0)} gtd)${c.opt5 === 'exercised' && c.next.yrs === 1 ? ' — option year' : ' — extension'}</div>`;
  }
  return h + '</div>';
}
function rosterActions(p) {
  if (p.expiring && state.phase === 'RESIGN') return `<button class="sm primary" data-action="resign" data-pid="${p.id}">Re-sign ${fmtMoney(p.ask)}</button> <button class="sm danger" data-action="release" data-pid="${p.id}">Let go</button>`;
  return `<button class="sm danger" data-action="release" data-pid="${p.id}">Release</button>`;
}

// ---------- schedule ----------
function scheduleHTML() {
  const u = state.userTid, recs = standings();
  let html = '<div class="grid g2">';
  // my schedule
  const rows = state.schedule.map((wk, i) => { const m = wk.find(g => g.h === u || g.a === u); return Object.assign({ wk: i + 1 }, m); });
  html += `<div class="card"><h3>${T(u).abbr} Schedule</h3>` + table('mysched', [
    { k: 'wk', l: 'Wk', f: m => m.wk },
    { k: 'o', l: 'Opponent', f: m => (m.h === u ? 'vs ' : '@ ') + teamLink(m.h === u ? m.a : m.h, true) + ` <span class="muted small">${recOf(m.h === u ? m.a : m.h, recs)}</span>` },
    { k: 'r', l: 'Result', f: m => { if (!m.score) return ''; const us = m.h === u ? 0 : 1, a = m.score[us], b = m.score[1 - us]; return `<button class="link" data-action="box" data-gid="${m.gid}"><b class="${a > b ? 'good' : a < b ? 'bad' : 'muted'}">${a > b ? 'W' : a < b ? 'L' : 'T'}</b> ${a}-${b}</button>`; } },
  ], rows, { nosort: 1, rowClass: m => m.wk === state.week && state.phase === 'REG' ? 'me' : '' }) + '</div>';
  // scoreboard
  const maxWk = state.phase === 'REG' ? Math.max(1, state.week - 1) : SEASON_WEEKS;
  const w = ui.schedWeek || maxWk;
  html += `<div class="card"><h3>Scoreboard</h3><div class="row" style="margin-bottom:10px"><select data-change="schedWeek">${state.schedule.map((_, i) => `<option value="${i + 1}" ${i + 1 === w ? 'selected' : ''}>Week ${i + 1}</option>`).join('')}</select></div><div class="games">`;
  for (const m of state.schedule[w - 1]) html += gameTile(m.h, m.a, m.score, m.gid);
  html += '</div></div></div>';
  if (state.playoffs) html += `<div class="card" style="margin-top:16px"><h3>Playoff Bracket</h3>${bracketHTML()}</div>`;
  return html;
}
function gameTile(h, a, score, gid) {
  const mine = h === state.userTid || a === state.userTid;
  if (!score) return `<div class="game ${mine ? 'mine' : ''}" style="cursor:default"><div class="ln"><span>${T(a).abbr}</span><span class="muted">${recOf(a)}</span></div><div class="ln"><span>@ ${T(h).abbr}</span><span class="muted">${recOf(h)}</span></div></div>`;
  const box = state.games[gid];
  return `<div class="game ${mine ? 'mine' : ''}" data-action="box" data-gid="${gid}">
    <div class="ln ${score[1] > score[0] ? 'w' : ''}"><span>${T(a).abbr}</span><span>${score[1]}</span></div>
    <div class="ln ${score[0] > score[1] ? 'w' : ''}"><span>${T(h).abbr}</span><span>${score[0]}</span></div>${box && box.ot ? '<div class="small muted">OT</div>' : ''}</div>`;
}
function bracketHTML() {
  const po = state.playoffs;
  let html = '<div class="bracket">';
  for (let r = 0; r < 4; r++) {
    html += `<div class="col"><h4>${ROUND_NAMES[r]}</h4>`;
    const res = po.rounds[r];
    if (res) for (const g of res) html += gameTile(g.h, g.a, g.score, g.gid);
    else if (r === po.round) html += '<div class="muted small">Up next</div>';
    html += '</div>';
  }
  html += '</div><div class="row small muted" style="margin-top:8px">';
  for (const c of ['AFC', 'NFC']) html += `<span><b>${c}:</b> ${po.seeds[c].map((t, i) => `${i + 1}. ${T(t).abbr}`).join(' · ')}</span>`;
  return html + '</div>';
}

// ---------- standings ----------
function standingsHTML() {
  const divs = divisionStandings();
  let html = '';
  for (const conf of ['AFC', 'NFC']) {
    html += `<h2 style="margin:10px 0">${conf}</h2><div class="grid g2">`;
    for (const d of ['East', 'North', 'South', 'West']) {
      html += `<div class="card"><h3>${conf} ${d}</h3>` + table('st', [
        { k: 't', l: 'Team', f: r => teamLink(r.tid, true) },
        { k: 'w', l: 'W', f: r => r.w, num: 1 }, { k: 'l', l: 'L', f: r => r.l, num: 1 }, { k: 'tt', l: 'T', f: r => r.t, num: 1 },
        { k: 'p', l: 'Pct', f: r => pct(r).toFixed(3).replace(/^0/, ''), num: 1 },
        { k: 'pf', l: 'PF', f: r => r.pf, num: 1 }, { k: 'pa', l: 'PA', f: r => r.pa, num: 1 },
        { k: 'df', l: 'Diff', f: r => (r.pf - r.pa > 0 ? '+' : '') + (r.pf - r.pa), num: 1 },
        { k: 'dv', l: 'Div', f: r => `${r.dw}-${r.dl}${r.dt ? '-' + r.dt : ''}`, num: 1 },
        { k: 'cf', l: 'Conf', f: r => `${r.cw}-${r.cl}${r.ct ? '-' + r.ct : ''}`, num: 1 },
        { k: 'sk', l: 'Strk', f: r => r.streak, num: 1 },
      ], divs[conf + ' ' + d], { nosort: 1, rowClass: r => r.tid === state.userTid ? 'me' : '' }) + '</div>';
    }
    const seeds = confSeeds(conf);
    html += `<div class="card"><h3>${conf} Playoff Picture</h3>` + table('seeds', [
      { k: 's', l: 'Seed', f: (tid, i) => i < 7 ? i + 1 : '' }, { k: 't', l: 'Team', f: tid => teamLink(tid, true) }, { k: 'r', l: 'Record', f: tid => recOf(tid), num: 1 },
    ], seeds.slice(0, 10), { nosort: 1, rowClass: (tid, i) => (tid === state.userTid ? 'me ' : '') + (i === 6 ? 'cut' : '') }) + '</div></div>';
  }
  return html;
}

// ---------- league stats ----------
const STAT_CATS = {
  passing: { pos: ['QB'], min: s => (s.passA || 0) >= 1, sort: 'passY', cols: [['passC', 'Cmp'], ['passA', 'Att'], ['pct', 'Pct', s => s.passA ? round1(100 * s.passC / s.passA) : 0], ['passY', 'Yds'], ['ypa', 'Y/A', s => s.passA ? round1(s.passY / s.passA) : 0], ['passTD', 'TD'], ['passInt', 'Int'], ['sacked', 'Sck'], ['passLng', 'Lng'], ['rtg', 'Rtg', s => round1(passerRating(s.passC || 0, s.passA || 0, s.passY || 0, s.passTD || 0, s.passInt || 0))]] },
  rushing: { min: s => (s.rushA || 0) >= 1, sort: 'rushY', cols: [['rushA', 'Car'], ['rushY', 'Yds'], ['ypc', 'Avg', s => s.rushA ? round1(s.rushY / s.rushA) : 0], ['rushTD', 'TD'], ['rushLng', 'Lng'], ['fum', 'Fum']] },
  receiving: { min: s => (s.tgt || 0) >= 1, sort: 'recY', cols: [['tgt', 'Tgt'], ['rec', 'Rec'], ['recY', 'Yds'], ['ypr', 'Avg', s => s.rec ? round1(s.recY / s.rec) : 0], ['recTD', 'TD'], ['recLng', 'Lng'], ['yac', 'YAC'], ['drp', 'Drops']] },
  defense: { pos: DEF_POS, min: s => (s.tkl || 0) + (s.pd || 0) + (s.prs || 0) >= 1, sort: 'tkl', cols: [['tkl', 'Tkl'], ['tfl', 'TFL'], ['sck', 'Sck'], ['prs', 'Pressures'], ['dint', 'Int'], ['pd', 'PD'], ['ff', 'FF'], ['fr', 'FR'], ['dtd', 'TD']] },
  returns: { min: s => (s.krA || 0) + (s.prA || 0) >= 1, sort: 'krY', cols: [['krA', 'KR'], ['krY', 'KR Yds'], ['kravg', 'KR Avg', s => s.krA ? round1(s.krY / s.krA) : 0], ['prA', 'PR'], ['prY', 'PR Yds'], ['pravg', 'PR Avg', s => s.prA ? round1(s.prY / s.prA) : 0]] },
  kicking: { pos: ['K', 'P'], min: s => (s.fga || 0) + (s.pnt || 0) >= 1, sort: 'fgm', cols: [['fgm', 'FGM'], ['fga', 'FGA'], ['fgp', 'FG%', s => s.fga ? round1(100 * s.fgm / s.fga) : 0], ['fgLng', 'Lng'], ['xpm', 'XPM'], ['xpa', 'XPA'], ['pnt', 'Punts'], ['pavg', 'P Avg', s => s.pnt ? round1(s.pntY / s.pnt) : 0], ['pi20', 'In 20']] },
};
const ADV_GROUPS = {
  QB: { spots: ['QB'], min: (a, k) => (a.db || 0) >= 60 * k, cols: [['EPA/db', a => a.db ? a.epaDb / a.db : 0, 2], ['CPOE', a => a.att ? 100 * (a.cmp - a.xc) / a.att : 0, 1], ['TTT', a => a.tttN ? a.ttt / a.tttN : 0, 2], ['aDOT', a => a.att ? a.air / a.att : 0, 1], ['Pressured%', a => a.db ? 100 * (a.prsd || 0) / a.db : 0, 0]] },
  'WR/TE': { spots: ['WRX', 'WRZ', 'SLOT', 'TEY', 'TEH'], min: (a, k) => (a.routes || 0) >= 60 * k, cols: [['Routes', a => a.routes || 0, 0], ['Sep (yds)', a => a.sepN ? a.sep / a.sepN : 0, 2], ['Tgt/Route%', a => a.routes ? 100 * (a.sepN || 0) / a.routes : 0, 0], ['aDOT', a => a.sepN ? a.adot / a.sepN : 0, 1], ['EPA/Tgt', a => a.sepN ? (a.epaTgt || 0) / a.sepN : 0, 2]] },
  RB: { spots: ['RB', 'FB'], min: (a, k) => (a.rush || 0) >= 25 * k, cols: [['YBC/att', a => a.rush ? a.ybc / a.rush : 0, 2], ['YACo/att', a => a.rush ? a.yaco / a.rush : 0, 2], ['MTF', a => a.mtf || 0, 0], ['Stuff%', a => a.rush ? 100 * (a.stuff || 0) / a.rush : 0, 0], ['EPA/rush', a => a.rush ? (a.epaRush || 0) / a.rush : 0, 2]] },
  OL: { spots: ['LT', 'LG', 'C', 'RG', 'RT'], min: (a, k) => (a.pbSnaps || 0) >= 80 * k, cols: [['PB win%', a => a.pbSnaps ? 100 - 100 * (a.pbLoss || 0) / a.pbSnaps : 0, 1], ['Prs allowed', a => a.prsA || 0, 0], ['Sacks allowed', a => a.sackA || 0, 0], ['RB win%', a => a.rbSnaps ? 100 * (a.rbWins || 0) / a.rbSnaps : 0, 1]] },
  DL: { spots: ['NT', 'DT', 'DE', 'EDGE'], min: (a, k) => (a.prSnaps || 0) >= 60 * k, cols: [['PR win%', a => a.prSnaps ? 100 * (a.prWins || 0) / a.prSnaps : 0, 1], ['Double%', a => a.prSnaps ? 100 * (a.dbl || 0) / a.prSnaps : 0, 0], ['RS win%', a => a.rdSnaps ? 100 * (a.rdWins || 0) / a.rdSnaps : 0, 1], ['Stops', a => a.stops || 0, 0]] },
  'LB/DB': { spots: ['MLB', 'WLB', 'CB', 'NCB', 'FS', 'SS'], min: (a, k) => (a.covSnaps || 0) >= 80 * k, cols: [['Tgts', a => a.tgtA || 0, 0], ['Comp%', a => a.tgtA ? 100 * (a.cmpA || 0) / a.tgtA : 0, 0], ['Yds/snap', a => a.covSnaps ? (a.ydsA || 0) / a.covSnaps : 0, 2], ['Rtg allowed', a => ratingAllowed(a) || 0, 1], ['MT%', a => a.tkAtt ? 100 * (a.mt || 0) / a.tkAtt : 0, 0]] },
};
function advStatsHTML(season) {
  const live = season === state.season && (state.phase === 'REG' || state.phase === 'PLAYOFFS');
  const grp = ui.advGrp || 'QB';
  let html = `<div class="subtabs">${[...Object.keys(ADV_GROUPS), 'Teams'].map(k => `<button class="${k === grp ? 'on' : ''}" data-action="advGrp" data-g="${k}">${k}</button>`).join('')}</div>`;
  if (grp === 'Teams') {
    const rows = state.teams.map(t => {
      const a = live ? (t.advS || {}) : (() => { const h = (state.teamHist[t.id] || []).find(x => x.season === season); return h ? { plays: 1, epa: h.offEpa, dPlays: 1, dEpa: h.defEpa } : {}; })();
      return { t, a };
    });
    return html + `<div class="card">` + table('advteams', [
      { k: 't', l: 'Team', v: r => r.t.abbr, f: r => teamLink(r.t.id, true) },
      { k: 'oe', l: 'Off EPA/play', v: r => r.a.plays ? r.a.epa / r.a.plays : -9, f: r => r.a.plays ? (r.a.epa / r.a.plays).toFixed(3) : '—', num: 1 },
      { k: 'de', l: 'Def EPA/play', v: r => r.a.dPlays ? -r.a.dEpa / r.a.dPlays : -9, f: r => r.a.dPlays ? (r.a.dEpa / r.a.dPlays).toFixed(3) : '—', num: 1, title: 'lower is better' },
      { k: 'os', l: 'Off success', v: r => r.a.plays && r.a.succ ? r.a.succ / r.a.plays : 0, f: r => r.a.succ ? Math.round(100 * r.a.succ / r.a.plays) + '%' : '—', num: 1 },
      { k: 'pr', l: 'Pressure% allowed', v: r => r.a.db ? -(r.a.prs || 0) / r.a.db : 0, f: r => r.a.db ? Math.round(100 * (r.a.prs || 0) / r.a.db) + '%' : '—', num: 1 },
      { k: 'dp', l: 'Pressure% generated', v: r => r.a.dDb ? (r.a.dPrs || 0) / r.a.dDb : 0, f: r => r.a.dDb ? Math.round(100 * (r.a.dPrs || 0) / r.a.dDb) + '%' : '—', num: 1 },
      { k: 'ed', l: 'Early-down pass%', v: r => r.a.early ? r.a.earlyPass / r.a.early : 0, f: r => r.a.early ? Math.round(100 * r.a.earlyPass / r.a.early) + '%' : '—', num: 1 },
    ], rows, { sort: 'oe' }) + '</div>';
  }
  const G = ADV_GROUPS[grp];
  const qualK = live ? clamp((state.week - 1) / 17, 1 / 17, 1) : 1; // qualifying volume scales with games played
  const rows = [];
  for (const p of Object.values(state.players)) {
    if (!G.spots.includes(p.spot)) continue;
    let a = null, tid = p.tid;
    if (live) a = p.advS;
    else { const r = p.career.find(c => c.season === season); if (r && r.adv) { a = r.adv; tid = r.tid; } }
    if (!a || !G.min(a, qualK)) continue;
    if (ui.statMine && tid !== state.userTid) continue;
    rows.push({ p, a, tid, g: live ? overallGrade(a, p.spot) : a.g });
  }
  const cols = [
    { k: 'name', l: 'Player', v: r => r.p.last, f: r => playerLink(r.p) },
    { k: 'pos', l: 'Pos', v: r => r.p.lbl, f: r => esc(r.p.lbl) },
    { k: 'tm', l: 'Team', v: r => r.tid >= 0 ? T(r.tid).abbr : 'FA', f: r => r.tid >= 0 ? teamLink(r.tid) : 'FA' },
    { k: 'gr', l: 'Grade', v: r => r.g || 0, f: r => gradeChip(r.g), num: 1 },
    ...G.cols.map(([l, fn, dp]) => ({ k: l, l, num: 1, v: r => fn(r.a), f: r => (fn(r.a) || 0).toFixed(dp) })),
  ];
  return html + `<div class="card">${table('adv-' + grp, cols, rows, { sort: 'gr', limit: 120 })}</div><div class="muted small" style="margin-top:6px">Charted on every snap. Grades: average starter ≈ 62, elite 85+.</div>`;
}
function statsHTML() {
  if (ui.statCat === 'advanced') {
    const seasons = [state.season, ...state.history.map(h => h.season).filter(x => x !== state.season).reverse()];
    const season = ui.statSeason || state.season;
    return `<div class="subtabs">${[...Object.keys(STAT_CATS), 'advanced'].map(k => `<button class="${k === ui.statCat ? 'on' : ''}" data-action="statCat" data-cat="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}
      <span class="spacer"></span><select data-change="statSeason">${seasons.map(x => `<option ${x === season ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <label class="row small"><input type="checkbox" data-change="statMine" ${ui.statMine ? 'checked' : ''}> My team only</label></div>` + advStatsHTML(season);
  }
  const cat = STAT_CATS[ui.statCat];
  const seasons = [state.season, ...state.history.map(h => h.season).filter(s => s !== state.season).reverse()];
  const season = ui.statSeason || state.season;
  let rows = [];
  for (const p of Object.values(state.players)) {
    if (cat.pos && !cat.pos.includes(p.pos)) continue;
    const live = season === state.season && (state.phase === 'REG' || state.phase === 'PLAYOFFS');
    const s = live ? (p.stats.gp ? p.stats : null) : p.career.find(c => c.season === season);
    if (!s || !cat.min(s)) continue;
    const tid = live ? p.tid : s.tid;
    if (ui.statMine && tid !== state.userTid) continue;
    rows.push({ p, s, tid });
  }
  const cols = [
    { k: 'rk', l: '#', f: (r, i) => i + 1 },
    { k: 'name', l: 'Player', v: r => r.p.last, f: r => playerLink(r.p) },
    { k: 'pos', l: 'Pos', v: r => r.p.lbl, f: r => esc(r.p.lbl) },
    { k: 'tm', l: 'Team', v: r => r.tid >= 0 ? T(r.tid).abbr : 'FA', f: r => r.tid >= 0 ? teamLink(r.tid) : '<span class="muted">FA</span>' },
    { k: 'gp', l: 'GP', v: r => r.s.gp || 0, num: 1 },
    ...cat.cols.map(([k, l, fn]) => ({ k, l, num: 1, v: r => fn ? fn(r.s) : (r.s[k] || 0) })),
  ];
  let html = `<div class="subtabs">${[...Object.keys(STAT_CATS), 'advanced'].map(k => `<button class="${k === ui.statCat ? 'on' : ''}" data-action="statCat" data-cat="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}
    <span class="spacer"></span><select data-change="statSeason">${seasons.map(s => `<option ${s === season ? 'selected' : ''}>${s}</option>`).join('')}</select>
    <label class="row small"><input type="checkbox" data-change="statMine" ${ui.statMine ? 'checked' : ''}> My team only</label></div>`;
  html += `<div class="card">${table('stats-' + ui.statCat, cols, rows, { sort: cat.sort, limit: 150 })}</div>`;
  if (season !== state.season || !['REG', 'PLAYOFFS'].includes(state.phase)) html += '<div class="muted small" style="margin-top:6px">Past seasons show currently active players only.</div>';
  return html;
}

// ---------- trade ----------
function tradeHTML() {
  const u = state.userTid;
  if (ui.tradeTid == null || ui.tradeTid === u) ui.tradeTid = u === 0 ? 1 : 0;
  const o = ui.tradeTid;
  const open = tradeWindowOpen();
  const side = (tid, assets, key) => {
    const ro = rosterOf(tid).sort(famOrder);
    let h = '<div class="scroll">';
    for (const p of ro) {
      const on = assets.players.includes(p.id);
      h += `<div class="check-row" data-action="tradeToggle" data-side="${key}" data-type="players" data-id="${p.id}"><input type="checkbox" ${on ? 'checked' : ''}>
        <span style="width:64px" class="small">${esc(p.lbl)}</span><span class="grow">${esc(pname(p))} ${statusPills(p)}</span><span class="muted small">${p.age}y</span> ${tierPill(p)} <span class="muted small" style="width:90px;text-align:right">${fmtContract(p)}</span></div>`;
    }
    h += '<div class="section-title">Draft Picks</div>';
    for (const pk of tradablePicks(tid)) {
      const on = assets.picks.includes(pk.id);
      h += `<div class="check-row" data-action="tradeToggle" data-side="${key}" data-type="picks" data-id="${pk.id}"><input type="checkbox" ${on ? 'checked' : ''}><span class="grow">${pickLabel(pk)}</span></div>`;
    }
    return h + '</div>';
  };
  let evalHTML = '';
  const any = ui.give.players.length + ui.give.picks.length + ui.get.players.length + ui.get.picks.length;
  if (any) {
    const ev = evaluateTrade(u, o, ui.give, ui.get);
    if (ev.inV !== undefined) {
      const ratio = clamp(ev.inV / Math.max(0.1, ev.needed), 0, 1.5);
      const col = ratio >= 1 ? 'var(--good)' : ratio >= 0.8 ? 'var(--warn)' : 'var(--bad)';
      evalHTML = `<div class="meter"><i style="width:${Math.min(100, ratio * 66.7)}%;background:${col}"></i></div>`;
    }
    evalHTML += `<div class="${ev.ok ? 'good' : 'warn'}">${esc(ev.msg)}</div>
      <div class="muted small" style="margin:6px 0">Salary: you send ${fmtMoney(salaryOf(ui.give))}, receive ${fmtMoney(salaryOf(ui.get))} · your cap space after: ${fmtMoney(capRoom(u) + salaryOf(ui.give) - salaryOf(ui.get))}</div>
      <button class="primary" data-action="proposeTrade" ${open ? '' : 'disabled'}>Propose Trade</button> <button data-action="clearTrade">Clear</button>`;
  } else evalHTML = '<div class="muted">Select players or picks from either side to build a deal.</div>';
  const opts = state.teams.filter(t => t.id !== u).map(t => `<option value="${t.id}" ${t.id === o ? 'selected' : ''}>${t.region} ${t.name} (${recOf(t.id)})</option>`).join('');
  return `${open ? '' : `<div class="callout">${state.phase === 'REG' ? 'The trade deadline has passed.' : 'Trades are closed during this phase.'}</div>`}
  <div class="grid g3">
    <div class="card"><h3>You Send — ${T(u).abbr}</h3>${side(u, ui.give, 'give')}</div>
    <div class="card"><h3>Trade Partner</h3><select data-change="tradeTeam" style="width:100%;margin-bottom:12px">${opts}</select>
      <div class="kv small" style="margin-bottom:12px"><div>Cap space</div><div>${fmtMoney(capRoom(o))}</div><div>Roster</div><div>${rosterCount(o)}/${rosterLimit()}</div><div>Head coach</div><div>${esc(cname(C(T(o).hc)))}</div></div>
      ${evalHTML}
      <p class="muted small" style="margin-top:14px">AI teams value young high-potential players, cheap contracts, premium positions (QB, pass rush, WR, CB) and picks from bad teams. They charge extra for their own starters and want a little more than they give.</p></div>
    <div class="card"><h3>You Receive — ${T(o).abbr}</h3>${side(o, ui.get, 'get')}</div>
  </div>`;
}

// ---------- free agents ----------
function faHTML() {
  const u = state.userTid;
  let fas = Object.values(state.players).filter(p => p.tid === -1);
  fas = fas.filter(p => inFamily(p, ui.faPos));
  const canSign = state.phase !== 'PLAYOFFS' && state.phase !== 'RECAP';
  let html = `<div class="callout">${state.phase === 'FA' ? `Free agency wave ${state.faWave + 1}/${FA_WAVES}. AI teams sign players when you advance. Asking prices drop each wave.` : state.phase === 'REG' ? 'In-season signings are 1-year deals. Players on IR (4+ weeks) don\'t count toward the 53-man limit.' : 'Free agents available now.'}
    Cap space: <b>${fmtMoney(capRoom(u))}</b> · Roster ${rosterCount(u)}/${rosterLimit()}</div>`;
  html += `<div class="subtabs">${famTabs(ui.faPos, 'faPos')}</div>`;
  html += `<div class="card">` + table('fa', [
    { k: 'pos', l: 'Pos', v: p => FAM_INDEX[p.spot], f: p => esc(p.lbl) },
    { k: 'n', l: 'Name', v: p => p.last, f: p => playerLink(p) + ' ' + statusPills(p) },
    { k: 'age', l: 'Age', v: p => p.age, num: 1 },
    { k: 'hw', l: 'Ht/Wt', v: p => p.m.wt, f: p => `<span class="small muted">${htwt(p)}</span>` },
    { k: 'ovr', l: 'Tier', v: p => uOvr(p), f: p => tierPill(p) + trueNums(p) },
    { k: 'pot', l: 'Upside', v: p => uCeil(p), f: p => upsidePill(p) },
    { k: 'sk', l: 'Scouting', f: p => `<span class="small muted">${traitsTxt(p)}</span>` },
    { k: 'ask', l: 'Asking', v: p => p.ask, f: p => fmtMoney(p.ask), num: 1 },
    { k: 'y', l: 'Yrs', f: p => state.phase === 'REG' ? 1 : contractYears(p), num: 1 },
    { k: 'a', l: '', f: p => canSign ? `<button class="sm primary" data-action="sign" data-pid="${p.id}" ${p.ask > capRoom(u) ? 'disabled title="Not enough cap space"' : ''}>Sign</button>` : '' },
  ], fas, { sort: 'ovr', limit: 200 }) + '</div>';
  return html;
}

// ---------- draft ----------
function draftHTML() {
  const u = state.userTid;
  const my = state.picks.filter(pk => pk.owner === u).sort((a, b) => a.season - b.season || a.round - b.round);
  let html = '';
  if (!['COACHES', 'RESIGN', 'FA', 'DRAFT'].includes(state.phase)) {
    html += `<div class="callout">The draft class is revealed when the offseason starts.</div>`;
    return html + `<div class="card"><h3>Your Picks</h3>${my.map(pk => `<div>${pickLabel(pk)}</div>`).join('') || '<div class="muted">None.</div>'}</div>`;
  }
  const d = state.draft, pk = currentPick();
  const onClock = state.phase === 'DRAFT' && pk && pk.owner === u;
  let pros = prospects();
  pros = pros.filter(p => inFamily(p, ui.draftPos));
  const grade = p => uOvr(p) + 0.55 * p.per.g + ({ QB: 3, RB: -2, K: -10, P: -12 }[p.pos] || 0); // consensus big board
  const ranked = prospects().sort((a, b) => grade(b) - grade(a));
  const rankOf = new Map(ranked.map((p, i) => [p.id, i + 1]));
  html += `<div class="callout">${state.phase !== 'DRAFT' ? `Draft preview — the draft happens after free agency. Everything here is your scouts' read: prospects are the foggiest players in football, and workout numbers get overhyped.` : onClock ? `<b>You're on the clock</b> with pick #${pk.pick} (Round ${pk.round}). Choose a player below.` : pk ? `Pick #${pk.pick}: ${T(pk.owner).abbr} on the clock.` : ''}</div>`;
  html += `<div class="grid" style="grid-template-columns:minmax(0,3fr) minmax(260px,1fr)"><div class="card"><h3>Prospects</h3>
    <div class="subtabs">${famTabs(ui.draftPos, 'draftPos')}</div>` + table('draft', [
    { k: 'rk', l: 'Rank', v: p => rankOf.get(p.id), num: 1 },
    { k: 'pos', l: 'Pos', v: p => FAM_INDEX[p.spot], f: p => esc(p.lbl) },
    { k: 'n', l: 'Name', v: p => p.last, f: p => playerLink(p) },
    { k: 'col', l: 'College', v: p => p.college, f: p => `<span class="muted">${esc(p.college)}</span>` },
    { k: 'age', l: 'Age', v: p => p.age, num: 1 },
    { k: 'hw', l: 'Ht/Wt', v: p => p.m.wt, f: p => `<span class="small muted">${htwt(p)}</span>` },
    { k: 'forty', l: '40', v: p => -p.m.forty, f: p => p.m.forty.toFixed(2), num: 1 },
    { k: 'ovr', l: 'Now', v: p => uOvr(p), f: p => tierPill(p) + trueNums(p), title: 'Ready to contribute as…' },
    { k: 'pot', l: 'Upside', v: p => uCeil(p), f: p => upsidePill(p) },
    { k: 'sk', l: 'Scouting', f: p => `<span class="small muted">${traitsTxt(p)}</span>` },
    { k: 'proj', l: 'Proj', v: p => rankOf.get(p.id), f: p => { const r = Math.ceil(rankOf.get(p.id) / 32); return r > 7 ? 'UDFA' : 'Rd ' + r; } },
    { k: 'a', l: '', f: p => onClock ? `<button class="sm primary" data-action="draftPick" data-pid="${p.id}">Draft</button>` : '' },
  ], pros, { sort: 'rk', dir: 1, limit: 300 }) + '</div>';
  // side: my picks + recent picks
  html += `<div><div class="card"><h3>Your Picks</h3>${my.map(x => { const o = d && d.order.find(z => z.pickId === x.id); return `<div>${pickLabel(x)}${o ? ` <span class="muted">— #${o.pick}</span>` : ''}</div>`; }).join('') || '<div class="muted">None.</div>'}</div>`;
  if (state.phase === 'DRAFT') {
    const done = d.order.slice(0, d.idx).reverse().slice(0, 40);
    html += `<div class="card" style="margin-top:16px"><h3>Recent Picks</h3>${done.map(o => { const p = P(o.pid); return `<div class="small ${o.owner === u ? 'good' : ''}">#${o.pick} ${T(o.owner).abbr} — ${p ? `${esc(p.lbl)} ${playerLink(p)}` : ''}</div>`; }).join('') || '<div class="muted">None yet.</div>'}</div>`;
  }
  return html + '</div></div>';
}

// ---------- coaches ----------
function tierChip(v) { const t = coachTier(v); return `<span class="pill tier-${t}">${t}</span>`; }
function pctS(x) { return Math.round(x * 100) + '%'; }
function tendencySummary(c) {
  if (!c) return '';
  if (c.role === 'HC') {
    const a = c.t.aggr >= 0.62 ? 'Aggressive' : c.t.aggr <= 0.38 ? 'Conservative' : 'Balanced';
    const ck = c.t.clock >= 0.62 ? 'grinds clock with a lead' : c.t.clock <= 0.38 ? 'keeps attacking with a lead' : 'standard clock management';
    return `${a} on 4th down · ${ck}${c.t.caller ? ` · <b>calls the ${c.t.caller === 'O' ? 'offense' : 'defense'}</b>` : ''}`;
  }
  if (c.role === 'OC') { const t = c.t; return `${pctS(t.pass)} pass · zone ${pctS(t.zone)} · deep ${pctS(t.deep)} · PA ${pctS(t.pa)} · motion ${pctS(t.motion)} · RPO ${pctS(t.rpo)} · QB runs ${pctS(t.qbRun)} · RB1 ${pctS(t.rb1)} of carries`; }
  if (c.role === 'DC') { const t = c.t; return `${t.front} front · man ${pctS(t.man)} · two-high ${pctS(t.high)} · blitz ${pctS(t.blitz)} · sim pressure ${pctS(t.sim)} · stunts ${pctS(t.stunt)} · base pkg ${pctS(t.base)}`; }
  return '';
}
function coachKnobChips(c) {
  return KNOBS[c.role].map(k => `<span class="small" style="white-space:nowrap">${KNOB_LABEL[k]} ${tierChip(c.k[k])}</span>`).join(' ');
}
function coachNameLink(c) { return c ? `<button class="link" data-action="coach" data-cid="${c.id}">${esc(cname(c))}</button>` : '<span class="bad">Vacant</span>'; }
function lastUnitLine(c) {
  const h = c.hist[c.hist.length - 1];
  if (!h) return '';
  if (c.role === 'HC') return `Last season ${h.w}-${h.l}`;
  if (c.role === 'OC') return `Last season: #${h.off} scoring offense`;
  if (c.role === 'DC') return `Last season: #${h.def} scoring defense`;
  return `Last season with ${T(h.tid).abbr}: ${h.w}-${h.l}`;
}
function coachesHTML() {
  const u = state.userTid, t = T(u), canHire = state.phase === 'COACHES';
  let html = `<div class="callout">${canHire ? 'Coaching carousel is open. Fire a coach to open the spot, then hire from the available pool. Any open spots are filled automatically when you continue.' : 'Coaching changes happen during the <b>Coaching Carousel</b> phase of the offseason.'}
    <div class="muted small" style="margin-top:4px">Design knobs battle the other staff's (Run vs. Front, Pass vs. Coverage/Pressure, Deception vs. recognition). Play Calling picks better calls and adjusts in-game. Development knobs grow those skills on any player, whatever his position. A new play-caller's system costs a little early in his first season.</div></div>`;
  html += `<div class="grid g2">`;
  for (const role of COACH_ROLES) {
    const c = C(t[role.toLowerCase()]);
    html += `<div class="card"><h3>${ROLE_LABEL[role]}</h3>`;
    if (c) {
      html += `<div class="row"><b style="font-size:17px">${coachNameLink(c)}</b> ${tierChip(c.ovr)} <span class="muted small">Age ${c.age}</span>${schemeLabel(c) ? ` <span class="pill">${esc(schemeLabel(c))}</span>` : ''}</div>
        ${(role === 'OC' || role === 'DC') && C(t.hc) && C(t.hc).t.caller === (role === 'OC' ? 'O' : 'D') ? `<div class="small warn">The head coach calls the ${role === 'OC' ? 'offense' : 'defense'}: the team runs his ${esc(schemeLabel(C(t.hc)))} system. This coordinator contributes design and development.</div>` : ''}
        <div class="muted small" style="margin:4px 0 8px">${tendencySummary(c)}${role === 'HC' ? ` · Career ${c.rec.w}-${c.rec.l}${c.rec.titles ? `, ${c.rec.titles} title${c.rec.titles > 1 ? 's' : ''}` : ''}` : ''}${lastUnitLine(c) ? ' · ' + lastUnitLine(c) : ''}</div>
        <div class="row" style="gap:6px 12px">${coachKnobChips(c)}</div>
        ${canHire ? `<button class="sm danger" style="margin-top:10px" data-action="fireCoach" data-role="${role}">Fire</button>` : ''}`;
    } else html += '<div class="bad">Vacant</div>';
    html += '</div>';
  }
  html += '</div>';
  if (canHire) {
    const role = ui.coachRole || 'HC';
    const pool = Object.values(state.coaches).filter(c => c.tid < 0 && c.role === role).sort((a, b) => b.ovr - a.ovr);
    const strengths = c => KNOBS[c.role].slice().sort((a, b) => c.k[b] - c.k[a]).slice(0, 2).map(k => KNOB_LABEL[k]).join(', ');
    html += `<div class="card" style="margin-top:16px"><h3>Available Coaches</h3><div class="subtabs">${COACH_ROLES.map(r => `<button class="${r === role ? 'on' : ''}" data-action="coachRole" data-role="${r}">${ROLE_SHORT[r]}</button>`).join('')}</div>` + table('pool' + role, [
      { k: 'n', l: 'Name', f: c => coachNameLink(c) }, { k: 'o', l: 'Overall', f: c => tierChip(c.ovr) }, { k: 'a', l: 'Age', f: c => c.age, num: 1 },
      { k: 's', l: 'Scheme', f: c => `<span class="small">${esc(schemeLabel(c))}${c.role === 'HC' && c.t.caller ? ` · calls ${c.t.caller === 'O' ? 'offense' : 'defense'}` : ''}</span>` },
      { k: 'st', l: 'Best at', f: c => `<span class="small muted">${strengths(c)}</span>` },
      { k: 'h', l: '', f: c => `<button class="sm primary" data-action="hireCoach" data-cid="${c.id}" ${t[role.toLowerCase()] ? 'disabled title="Fire your current coach first"' : ''}>Hire</button>` },
    ], pool, { nosort: 1 }) + '</div>';
  }
  const all = state.teams.map(tm => ({ tm, s: COACH_ROLES.map(r => C(tm[r.toLowerCase()])) }));
  const cell = c => c ? `${coachNameLink(c)} ${tierChip(c.ovr)}${schemeLabel(c) ? `<div class="small muted">${esc(schemeLabel(c))}</div>` : ''}` : '<span class="bad">Vacant</span>';
  html += `<div class="card" style="margin-top:16px"><h3>League Staffs</h3>` + table('allcoach', [
    { k: 't', l: 'Team', v: r => r.tm.abbr, f: r => teamLink(r.tm.id) },
    ...COACH_ROLES.map((role, i) => ({ k: role, l: ROLE_SHORT[role], v: r => r.s[i] ? r.s[i].ovr : 0, f: r => cell(r.s[i]) })),
  ], all, { rowClass: r => r.tm.id === u ? 'me' : '' }) + '</div>';
  return html;
}
function coachModal(cid) {
  const c = C(cid);
  if (!c) return;
  let html = `<div class="row"><h2 style="margin:0">${esc(cname(c))}</h2><span class="pill">${ROLE_LABEL[c.role]}</span> ${tierChip(c.ovr)}</div>
    <div class="muted" style="margin:4px 0 12px">${c.tid >= 0 ? teamLink(c.tid, true) : 'Available'} · Age ${c.age}${schemeLabel(c) ? ' · ' + esc(schemeLabel(c)) : ''}</div>
    <div class="muted small" style="margin-bottom:12px">${tendencySummary(c)}</div>
    <div class="section-title">Reputation <span class="pill" style="margin-left:6px">numbers = true values · dev view</span></div>
    <div class="grid g2">${KNOBS[c.role].map(k => `<div class="row small" style="gap:8px"><span style="width:170px" class="muted">${KNOB_LABEL[k]}</span>${tierChip(c.k[k])}<span class="bar"><i style="width:${c.k[k]}%"></i></span> ${c.k[k]}</div>`).join('')}</div>`;
  const mentors = c.mentors.map(id => C(id)).filter(Boolean);
  if (mentors.length) html += `<div class="section-title">Coaching Tree</div><div class="small">Worked under: ${mentors.map(m => coachNameLink(m)).join(', ')}</div>`;
  if (c.hist.length) html += `<div class="section-title">Track Record</div>` + table('chist', [
    { k: 's', l: 'Season', f: h => h.s }, { k: 't', l: 'Team', f: h => T(h.tid).abbr }, { k: 'r', l: 'Role', f: h => ROLE_SHORT[h.role] },
    { k: 'w', l: 'Record', f: h => `${h.w}-${h.l}` }, { k: 'o', l: 'Offense', f: h => '#' + h.off, num: 1 }, { k: 'd', l: 'Defense', f: h => '#' + h.def, num: 1 },
  ], c.hist.slice().reverse(), { nosort: 1 });
  openModal(html);
}

// ---------- news / history / settings ----------
function newsHTML() {
  const items = ui.newsMine ? state.news.filter(n => n.tids.includes(state.userTid)) : state.news;
  return `<div class="subtabs"><button class="${!ui.newsMine ? 'on' : ''}" data-action="newsMine" data-v="0">All News</button><button class="${ui.newsMine ? 'on' : ''}" data-action="newsMine" data-v="1">My Team</button></div><div class="card">${newsList(items.slice(0, 250))}</div>`;
}
function historyHTML() {
  const tid = ui.histTid == null ? state.userTid : ui.histTid;
  let html = `<div class="grid g2"><div class="card"><h3>Champions & MVPs</h3>` + table('champs', [
    { k: 's', l: 'Season', f: h => h.season }, { k: 'c', l: 'Champion', f: h => teamLink(h.champ, true) }, { k: 'r', l: 'Runner-up', f: h => teamLink(h.runnerUp) },
    { k: 'm', l: 'MVP', f: h => h.awards.mvp ? `${esc(h.awards.mvp.name)} <span class="muted">(${T(h.awards.mvp.tid).abbr} ${h.awards.mvp.pos})</span>` : '' },
    { k: 'd', l: 'DPOY', f: h => h.awards.dpoy ? `${esc(h.awards.dpoy.name)} <span class="muted">(${T(h.awards.dpoy.tid).abbr})</span>` : '' },
  ], state.history.slice().reverse(), { nosort: 1 }) + (state.history.length ? '' : '<div class="muted">Finish a season to start the history books.</div>') + '</div>';
  const opts = state.teams.map(t => `<option value="${t.id}" ${t.id === tid ? 'selected' : ''}>${t.region} ${t.name}</option>`).join('');
  const th = state.teamHist[tid] || [];
  const tot = th.reduce((a, s) => ({ w: a.w + s.w, l: a.l + s.l, t: a.t + s.t, ti: a.ti + (s.result === 'Won Championship' ? 1 : 0) }), { w: 0, l: 0, t: 0, ti: 0 });
  html += `<div class="card"><h3>Team History</h3><select data-change="histTeam" style="margin-bottom:10px">${opts}</select>
    <div class="muted small" style="margin-bottom:8px">All-time: ${tot.w}-${tot.l}${tot.t ? '-' + tot.t : ''} · ${tot.ti} championship${tot.ti === 1 ? '' : 's'}</div>` + table('th', [
    { k: 's', l: 'Season', f: s => s.season }, { k: 'r', l: 'Record', f: s => `${s.w}-${s.l}${s.t ? '-' + s.t : ''}` }, { k: 'pf', l: 'PF', f: s => s.pf, num: 1 }, { k: 'pa', l: 'PA', f: s => s.pa, num: 1 },
    { k: 'seed', l: 'Seed', f: s => s.seed || '', num: 1 }, { k: 'res', l: 'Result', f: s => `<span class="${s.result === 'Won Championship' ? 'good' : s.result === 'Missed playoffs' ? 'muted' : ''}">${s.result}</span>` },
  ], th.slice().reverse(), { nosort: 1 }) + '</div></div>';
  return html;
}
function settingsHTML() {
  return `<div class="grid g2"><div class="card"><h3>Management</h3>
    <label class="row"><input type="checkbox" data-change="autoUser" ${state.settings.autoUser ? 'checked' : ''}> <b>Auto-manage my team</b></label>
    <p class="muted small">When on, your team is run by the same logic as the AI GMs: re-signings, free agency, the draft, coaching changes, roster cuts and injury replacements. You can still make any move yourself.</p>
    <label class="row" style="margin-top:12px"><input type="checkbox" data-change="showTrue" ${state.settings.showTrue ? 'checked' : ''}> <b>Show true ratings (debug)</b></label>
    <p class="muted small">Reveals the hidden numbers behind every label: true OVR/POT and every attribute. Off by default — the game is meant to be played through your scouts' eyes.</p></div>
    <div class="card"><h3>Save Data</h3><p class="muted small">The league autosaves in this browser after every action. Export a copy to back it up or move it to another computer.</p>
    <div class="row"><button data-action="export">Export Save</button><button data-action="importClick">Import Save…</button><button class="danger" data-action="newGame">New League…</button></div></div></div>`;
}

// ---------- modals ----------
function openModal(html) { $('#modal-body').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); }

const CAREER_COLS = {
  QB: [['passC', 'Cmp'], ['passA', 'Att'], ['pct', 'Pct', s => s.passA ? round1(100 * s.passC / s.passA) : 0], ['passY', 'Yds'], ['passTD', 'TD'], ['passInt', 'Int'], ['rtg', 'Rtg', s => round1(passerRating(s.passC || 0, s.passA || 0, s.passY || 0, s.passTD || 0, s.passInt || 0))], ['rushY', 'RuYds'], ['rushTD', 'RuTD']],
  RB: [['rushA', 'Car'], ['rushY', 'Yds'], ['ypc', 'Avg', s => s.rushA ? round1(s.rushY / s.rushA) : 0], ['rushTD', 'TD'], ['rec', 'Rec'], ['recY', 'RecYds'], ['recTD', 'RecTD'], ['fum', 'Fum']],
  WR: [['tgt', 'Tgt'], ['rec', 'Rec'], ['recY', 'Yds'], ['ypr', 'Avg', s => s.rec ? round1(s.recY / s.rec) : 0], ['recTD', 'TD'], ['recLng', 'Lng']],
  OL: [['snp', 'Snaps']],
  DEF: [['snp', 'Snaps'], ['tkl', 'Tkl'], ['tfl', 'TFL'], ['sck', 'Sck'], ['prs', 'Prs'], ['dint', 'Int'], ['pd', 'PD'], ['ff', 'FF'], ['fr', 'FR'], ['dtd', 'TD']],
  K: [['fgm', 'FGM'], ['fga', 'FGA'], ['fgp', 'FG%', s => s.fga ? round1(100 * s.fgm / s.fga) : 0], ['fgLng', 'Lng'], ['xpm', 'XPM'], ['xpa', 'XPA']],
  P: [['pnt', 'Punts'], ['pntY', 'Yds'], ['pavg', 'Avg', s => s.pnt ? round1(s.pntY / s.pnt) : 0]],
};
function careerCols(pos) { return pos === 'TE' ? CAREER_COLS.WR : DEF_POS.includes(pos) ? CAREER_COLS.DEF : CAREER_COLS[pos]; }

function playerModal(pid) {
  const p = P(pid);
  if (!p) return;
  const u = state.userTid;
  const team = p.tid >= 0 ? teamLink(p.tid, true) : p.tid === -3 ? `Practice squad · ${teamLink(p.psTid, true)}` : p.tid === -1 ? '<span class="muted">Free Agent</span>' : '<span class="muted">Draft Prospect</span>';
  const prospect = p.tid === -2;
  const tierT = tierOf(p), upT = upsideOf(p);
  let html = `<div class="row"><h2 style="margin:0">${esc(pname(p))}</h2><span class="pill">${esc(p.lbl)}</span> ${statusPills(p)}</div>
    <div class="muted" style="margin:4px 0 14px">${team} · Age ${p.age} · ${esc(p.college)} · ${p.draft ? `Drafted ${p.draft.year} Rd ${p.draft.round} (#${p.draft.pick}) by ${T(p.draft.tid).abbr}` : prospect ? `${p.draftYear} draft prospect` : 'Undrafted'} · ${p.exp} yr${p.exp === 1 ? '' : 's'} exp</div>`;
  html += `<div class="grid g2"><div><div class="stat-tiles"><div class="tile"><div class="v ${TIER_CLS[tierT]}" style="font-size:17px">${tierT}</div><div class="l">${prospect ? 'Ready now as' : 'Tier'}${trueOn() ? ` · true ${p.ovr}` : ''}</div></div><div class="tile"><div class="v ${UP_CLS[upT]}" style="font-size:15px">${upT}</div><div class="l">Upside${trueOn() ? ` · true ${p.pot}` : ''}</div></div>
    <div class="tile"><div class="v" style="font-size:16px">${p.tid === -1 ? fmtMoney(p.ask) : prospect ? '—' : fmtContract(p)}</div><div class="l">${p.tid === -1 ? 'Asking / yr' : prospect ? 'Rookie deal on draft' : 'Contract'}</div></div></div>`;
  html += scoutingHTML(p);
  const m = p.m;
  html += `<div class="section-title">Measurables</div><div class="stat-tiles">
    ${[['Height', fmtHeight(m.ht)], ['Weight', m.wt], ['Arm', m.arm.toFixed(2) + '"'], ['40-yd', m.forty.toFixed(2)], ['10-yd', m.ten.toFixed(2)], ['3-cone', m.cone.toFixed(2)], ['Shuttle', m.shut.toFixed(2)], ['Bench', m.bench]]
      .map(([l, v]) => `<div class="tile"><div class="v" style="font-size:16px">${v}</div><div class="l">${l}</div></div>`).join('')}</div>`;
  if (!prospect) {
    const fits = Object.entries(p.fit).sort((a, b) => b[1] - a[1]).slice(0, 5);
    html += `<div class="section-title">Position Fits</div><div class="row small">${fits.map(([s, v]) => `<span class="pill">${SPOTS[s].l} · ${tierOf(p, uOvr(p) + v - p.ovr, SPOTS[s].g)}${trueOn() ? ' ' + v : ''}</span>`).join(' ')}</div>`;
    const fitTeams = [...new Set([p.tid, state.userTid].filter(t => t >= 0))];
    const fitTxt = fitTeams.map(t => { const f = schemeFit(p, t), sk = SPOTS[p.spot].side === 'off' ? offArch(T(t)) : defArch(T(t)), lab = sk ? (SPOTS[p.spot].side === 'off' ? OFF_ARCH : DEF_ARCH)[sk].l : '—'; return `<span class="pill" title="${esc(lab)}">${T(t).abbr} ${esc(lab)}: <b class="${f >= 1 ? 'good' : f <= -1 ? 'bad' : ''}">${fitLabel(f)}</b>${trueOn() ? ` ${f > 0 ? '+' : ''}${f}` : ''}</span>`; }).join(' ');
    if (SPOTS[p.spot].side === 'off' || SPOTS[p.spot].side === 'def') html += `<div class="section-title">Scheme Fit</div><div class="row small">${fitTxt}</div>`;
  } else html += '<p class="muted small">Draft prospect: everything above is projection.</p>';
  html += '</div><div>';
  if (p.injury) html += `<div class="callout"><b class="bad">Injured:</b> ${esc(p.injury.name)} — out ${p.injury.weeks} more week${p.injury.weeks > 1 ? 's' : ''}.</div>`;
  if (p.awards && p.awards.length) html += `<div class="section-title" style="margin-top:0">Awards</div>${p.awards.map(a => `<div>🏅 ${esc(a)}</div>`).join('')}`;
  html += contractHTML(p);
  html += '<div class="row" style="margin-top:12px">';
  if (p.tid === u && optionDue(p) && state.phase === 'RESIGN') html += `<button class="primary" data-action="option" data-pid="${p.id}" data-v="1">Exercise option (${fmtMoney(optionAmount(p))})</button><button data-action="option" data-pid="${p.id}" data-v="0">Decline option</button>`;
  if (p.tid === u && canTag(p)) html += `<button data-action="tag" data-pid="${p.id}">Franchise tag (${fmtMoney(tagAmount(p))})</button>`;
  if (p.tid === u && extensionDue(p)) { const a = extensionAsk(p); html += `<button data-action="extend" data-pid="${p.id}">Extend: ${a.yrs} yr × ${fmtMoney(a.amt)}</button>`; }
  if (p.tid === -3 && p.psTid === u) html += `<button class="primary" data-action="promote" data-pid="${p.id}">Promote to 53</button><button class="danger" data-action="psRelease" data-pid="${p.id}">Release</button>`;
  if (p.tid === -1 && p.exp <= 6 && psRoom(u, p) && ['REG', 'PRESEASON', 'DRAFT', 'FA'].includes(state.phase)) html += `<button data-action="signPS" data-pid="${p.id}">Sign to practice squad (${fmtMoney(PS_SALARY)})</button>`;
  if (p.tid === u) {
    if (p.expiring && state.phase === 'RESIGN') html += `<button class="primary" data-action="resign" data-pid="${p.id}">Re-sign for ${fmtMoney(p.ask)}</button>`;
    html += `<button class="danger" data-action="release" data-pid="${p.id}">Release</button>`;
  } else if (p.tid === -1 && state.phase !== 'PLAYOFFS' && state.phase !== 'RECAP') html += `<button class="primary" data-action="sign" data-pid="${p.id}">Sign (${fmtMoney(p.ask)})</button>`;
  else if (p.tid >= 0) html += `<button data-action="tradeFor" data-pid="${p.id}">Trade for ${esc(p.last)}</button>`;
  html += '</div></div></div>';
  html += advancedSeasonHTML(p);
  if (trueOn()) html += attributesHTML(p);
  // career
  const cc = careerCols(p.pos);
  const rows = [...p.career];
  if (p.stats.gp) rows.push(Object.assign({ season: state.season, tid: p.tid, cur: true }, p.stats));
  if (rows.length) {
    const tot = {}; rows.forEach(r => { const c = Object.assign({}, r, { season: 0 }); delete c.adv; addStats(tot, c); });
    const cols = [{ k: 's', l: 'Season', f: r => r.tot ? '<b>Career</b>' : r.season + (r.cur ? '*' : '') }, { k: 't', l: 'Tm', f: r => r.tot ? '' : (r.tid >= 0 ? T(r.tid).abbr : 'FA') }, { k: 'gp', l: 'GP', f: r => r.gp || 0, num: 1 }, { k: 'gs', l: 'GS', f: r => r.gs || 0, num: 1 },
    { k: 'gr', l: 'Grade', f: r => r.tot ? '' : gradeChip(r.cur ? (p.advS ? overallGrade(p.advS, p.spot) : null) : r.adv ? r.adv.g : null), num: 1 },
    ...cc.map(([k, l, fn]) => ({ k, l, num: 1, f: r => fn ? fn(r) : (r[k] || 0) }))];
    html += `<div class="section-title">Career Stats</div>` + table('career', cols, [...rows, Object.assign(tot, { tot: true })], { nosort: 1 });
  }
  if (p.pcareer && p.pcareer.length) {
    const cols = [{ k: 's', l: 'Season', f: r => r.season }, { k: 't', l: 'Tm', f: r => T(r.tid).abbr }, { k: 'gp', l: 'GP', f: r => r.gp || 0, num: 1 }, ...cc.map(([k, l, fn]) => ({ k, l, num: 1, f: r => fn ? fn(r) : (r[k] || 0) }))];
    html += `<div class="section-title">Playoffs</div>` + table('pcareer', cols, p.pcareer, { nosort: 1 });
  }
  openModal(html);
}

// what your scouts say: phrases, confidence, buzz — never numbers
function scoutingHTML(p) {
  const tags = traitTags(p), buzz = buzzLabel(p), own = p.tid === state.userTid;
  const conf = own ? 'High (your coaches see him every day)' : confLabel(p);
  const tierT = tierOf(p), upT = upsideOf(p);
  const young = p.age <= 25 && upT !== tierT;
  const DAY1 = { Elite: 'a franchise-changing talent', 'All-Pro': 'an instant-impact player', Starter: 'a day-one starter', Rotation: 'a rotational contributor', Backup: 'a backup early on', Depth: 'a depth player early on', Project: 'a developmental prospect', Fringe: 'a developmental prospect', Washed: 'a developmental prospect' };
  const line = p.tid === -2
    ? `Scouts see ${DAY1[tierT]} with ${upT.toLowerCase()} upside.`
    : `Viewed as ${/^[AEIOU]/.test(tierT) ? 'an' : 'a'} ${tierT.toLowerCase()} today${young ? ` with ${upT.toLowerCase()} upside` : ''}.`;
  return `<div class="section-title">Scouting Report</div><div class="small">${esc(line)}</div>
    ${tags.length ? `<div class="row small" style="margin-top:6px">${tags.map(t => `<span class="pill">${esc(t)}</span>`).join(' ')}</div>` : ''}
    <div class="small muted" style="margin-top:6px">Evaluation confidence: <b>${conf}</b>${buzz ? ` · <span class="warn">${buzz}</span>` : ''}</div>`;
}
// training camp reports (preseason through the first month): ~70% of them turn out to be right
function campCardHTML() {
  const c = state.camp;
  if (!c || c.season !== state.season + (state.phase === 'PRESEASON' ? 1 : 0)) return '';
  if (!(state.phase === 'PRESEASON' || (state.phase === 'REG' && state.week <= 5))) return '';
  const live = c.reports.filter(r => P(r.pid) && P(r.pid).tid >= 0); // players since cut don't count
  const mine = live.filter(r => P(r.pid).tid === state.userTid);
  const league = live.filter(r => P(r.pid).tid !== state.userTid && ['Elite', 'All-Pro', 'Starter'].includes(tierOf(P(r.pid), perOvr(P(r.pid))))).slice(0, 8);
  const li = r => `<div class="small" style="margin:3px 0">${r.up ? '<span class="good">▲</span>' : '<span class="bad">▼</span>'} ${P(r.pid) ? playerLink(P(r.pid)) : ''} <span class="muted">${esc(r.text.replace(/^.*?(is|has|added|looks|appears|was) /, '$1 '))}</span></div>`;
  return `<div class="grid g2" style="margin-top:16px"><div class="card"><h3>Training Camp — ${T(state.userTid).abbr}</h3>
    <p class="muted small">Camp buzz is roughly 70% reliable. Film will tell the rest.</p>${mine.map(li).join('') || '<div class="muted small">Quiet camp — no notable reports.</div>'}</div>
    <div class="card"><h3>Around the League</h3>${league.map(r => li(r).replace(/<\/div>$/, ` <span class="muted small">(${T(P(r.pid).tid).abbr})</span></div>`)).join('') || '<div class="muted small">Nothing notable.</div>'}</div></div>`;
}

// true ratings (debug view)
function attributesHTML(p) {
  const pools = SIDE_POOLS[SPOTS[p.spot].side];
  const w = SPOTS[p.spot].w;
  let html = `<div class="section-title">Ratings <span class="pill" style="margin-left:6px">true values · debug view</span></div><div class="grid g3">`;
  for (const pool of pools) {
    html += `<div><div class="small" style="font-weight:700;margin-bottom:4px">${POOL_LABELS[pool]}</div>`;
    if (pool === 'ath') html += attrRow('Size', p.a.siz, w.siz);
    for (const k in ATTRS) if (ATTRS[k][3] === pool) html += attrRow(ATTRS[k][0], p.a[k], w[k]);
    html += '</div>';
  }
  const h = p.h, curve = { early: 'Early peak', normal: 'Normal', late: 'Late bloomer' }[h.curve];
  html += `<div><div class="small" style="font-weight:700;margin-bottom:4px">Hidden Traits</div>${attrRow('Durability', h.dur)}${attrRow('Consistency', h.cons)}${attrRow('Stamina', h.stam)}
    <div class="row small" style="gap:8px"><span style="width:130px" class="muted">Development</span>${curve}</div>
    <div class="small muted" style="margin-top:6px">Aging: ${AGE_GROUPS.map(g => `${AGE_GROUP_LABEL[g]} peak ~${Math.round(peakAge(p, g))}`).join(' · ')}</div></div>`;
  return html + '</div>';
}
function attrRow(label, v, weight) {
  v = Math.round(v);
  return `<div class="row small" style="gap:8px;${weight ? '' : 'opacity:.55'}"><span style="width:130px" class="muted">${label}${weight ? ' ●' : ''}</span><span class="bar"><i style="width:${v}%"></i></span> ${rat(v)}</div>`;
}

function boxModal(gid) {
  const b = state.games[gid];
  if (!b) { toast('Box score no longer available.'); return; }
  const [h, a] = b.tids;
  const nq = b.ot ? 5 : 4;
  const qh = ['1', '2', '3', '4', 'OT'].slice(0, nq);
  let html = `<div class="muted small">${b.season} · ${b.playoff ? b.playoff : 'Week ' + b.week}</div>
    <table class="linescore" style="max-width:520px;margin:8px 0 4px"><thead><tr><th>Team</th>${qh.map(q => `<th>${q}</th>`).join('')}<th>T</th></tr></thead><tbody>
    ${[[1, a], [0, h]].map(([s, tid]) => `<tr><td>${teamLink(tid, true)} <span class="muted small">${s === 0 && !b.playoff ? '(home)' : ''}</span></td>${b.qs[s].slice(0, nq).map(x => `<td>${x}</td>`).join('')}<td class="final ${b.score[s] > b.score[1 - s] ? 'good' : ''}">${b.score[s]}</td></tr>`).join('')}</tbody></table>`;
  // scoring
  html += `<div class="section-title">Scoring Summary</div>`;
  html += b.scoring.length ? table('sc', [
    { k: 'q', l: 'Q', f: s => s.q > 4 ? 'OT' : s.q }, { k: 'c', l: 'Time', f: s => fmtClock(s.clock) }, { k: 't', l: 'Team', f: s => T(s.tid).abbr },
    { k: 'x', l: 'Play', f: s => esc(s.text) }, { k: 's', l: T(a).abbr + '-' + T(h).abbr, f: s => s.score ? `${s.score[1]}-${s.score[0]}` : '', num: 1 },
  ], b.scoring, { nosort: 1 }) : '<div class="muted">No scoring.</div>';
  // team stats
  const ts = b.ts, tsr = (l, f) => `<tr><td class="num">${f(ts[1])}</td><td style="text-align:center" class="muted">${l}</td><td>${f(ts[0])}</td></tr>`;
  html += `<div class="section-title">Team Stats</div><table style="max-width:520px"><thead><tr><th class="num">${T(a).abbr}</th><th style="text-align:center"></th><th>${T(h).abbr}</th></tr></thead><tbody>
    ${tsr('First Downs', t => t.fd)}${tsr('Total Yards', t => t.passY - t.sackY + t.rushY)}${tsr('Passing', t => t.passY - t.sackY)}${tsr('Comp-Att', t => t.passC + '-' + t.passA)}
    ${tsr('Sacked-Yds', t => t.sacks + '-' + t.sackY)}${tsr('Rushing', t => `${t.rushY} (${t.rushA} car)`)}${tsr('3rd Down', t => `${t.d3c}-${t.d3a}`)}${tsr('4th Down', t => `${t.d4c}-${t.d4a}`)}
    ${tsr('Turnovers', t => t.to)}${tsr('Punts', t => t.punts)}${tsr('Possession', t => fmtClock(t.top))}</tbody></table>`;
  html += filmRoomHTML(b);
  // player stats
  const lines = Object.entries(b.stats).map(([pid, l]) => ({ p: P(pid) || (+pid < 0 ? { id: +pid, first: 'Emergency', last: l.nm || 'Sub', lbl: '—', pos: 'WR', spot: 'WRZ', tid: l.tid } : null), l })).filter(x => x.p);
  const cats = [
    ['Passing', l => l.passA, [['C/Att', l => `${l.passC || 0}/${l.passA}`], ['Yds', l => l.passY || 0], ['TD', l => l.passTD || 0], ['Int', l => l.passInt || 0], ['Sck', l => l.sacked || 0], ['Rtg', l => round1(passerRating(l.passC || 0, l.passA, l.passY || 0, l.passTD || 0, l.passInt || 0))]], l => l.passY || 0],
    ['Rushing', l => l.rushA, [['Car', l => l.rushA], ['Yds', l => l.rushY || 0], ['Avg', l => round1((l.rushY || 0) / l.rushA)], ['TD', l => l.rushTD || 0], ['Lng', l => l.rushLng || 0]], l => l.rushY || 0],
    ['Receiving', l => l.tgt, [['Rec', l => l.rec || 0], ['Tgt', l => l.tgt], ['Yds', l => l.recY || 0], ['YAC', l => l.yac || 0], ['TD', l => l.recTD || 0], ['Lng', l => l.recLng || 0], ['Drp', l => l.drp || 0]], l => l.recY || 0],
    ['Defense', l => (l.tkl || 0) + (l.pd || 0) + (l.dint || 0) + (l.prs || 0), [['Tkl', l => l.tkl || 0], ['TFL', l => l.tfl || 0], ['Sck', l => l.sck || 0], ['Prs', l => l.prs || 0], ['Int', l => l.dint || 0], ['PD', l => l.pd || 0], ['FF', l => l.ff || 0]], l => (l.tkl || 0) + (l.sck || 0) * 3 + (l.dint || 0) * 4 + (l.prs || 0)],
    ['Kicking', l => (l.fga || 0) + (l.xpa || 0), [['FG', l => `${l.fgm || 0}/${l.fga || 0}`], ['Lng', l => l.fgLng || 0], ['XP', l => `${l.xpm || 0}/${l.xpa || 0}`]], l => l.fga || 0],
    ['Punting', l => l.pnt, [['No', l => l.pnt], ['Yds', l => l.pntY], ['Avg', l => round1(l.pntY / l.pnt)], ['In 20', l => l.pi20 || 0], ['TB', l => l.ptb || 0]], l => l.pnt],
    ['Returns', l => (l.krA || 0) + (l.prA || 0), [['KR', l => l.krA || 0], ['KR Yds', l => l.krY || 0], ['PR', l => l.prA || 0], ['PR Yds', l => l.prY || 0]], l => (l.krY || 0) + (l.prY || 0)],
  ];
  for (const [name, has, cols, sortv] of cats) {
    html += `<div class="section-title">${name}</div><div class="grid g2">`;
    for (const tid of [a, h]) {
      const rows = lines.filter(x => x.l.tid === tid && has(x.l)).sort((x, y) => sortv(y.l) - sortv(x.l)).slice(0, name === 'Defense' ? 8 : 6);
      html += `<div>` + table('bx', [{ k: 'n', l: T(tid).abbr, f: x => playerLink(x.p, true) + ` <span class="muted small">${esc(x.p.lbl)}</span>` }, ...cols.map(([l, f]) => ({ k: l, l, num: 1, f: x => f(x.l) }))], rows, { nosort: 1 }) + '</div>';
    }
    html += '</div>';
  }
  if (b.injuries.length) html += `<div class="section-title">Injuries</div>` + b.injuries.map(i => `<div>${T(i.tid).abbr} — ${playerLink(P(i.pid)) || 'Player'}: ${esc(i.name)} (${i.weeks} wk)</div>`).join('');
  // snap counts
  html += `<details style="margin-top:14px"><summary class="section-title" style="cursor:pointer;display:inline">Snap Counts</summary><div class="grid g2">`;
  for (const tid of [a, h]) {
    const s = b.tids.indexOf(tid), offN = b.ts[s].plays, defN = b.ts[1 - s].plays;
    const rows = lines.filter(x => x.l.tid === tid && x.l.snp).map(x => ({ ...x, def: DEF_POS.includes(x.p.pos) }));
    rows.sort((x, y) => (x.def - y.def) || FAM_INDEX[x.p.spot] - FAM_INDEX[y.p.spot] || y.l.snp - x.l.snp);
    html += `<div>` + table('snp', [{ k: 'n', l: T(tid).abbr, f: x => playerLink(x.p, true) + ` <span class="muted small">${esc(x.p.lbl)}</span>` }, { k: 's', l: 'Snaps', f: x => x.l.snp, num: 1 }, { k: 'p', l: '%', f: x => Math.round(100 * x.l.snp / Math.max(1, x.def ? defN : offN)) + '%', num: 1 }], rows, { nosort: 1, rowClass: (x, i) => i && rows[i - 1].def !== x.def ? 'cut' : '' }) + '</div>';
  }
  html += '</div></details>';
  // play-by-play (kept for your games and the playoffs)
  if (b.pbp) {
    let cur = 0, pb = '';
    for (const l of b.pbp) {
      if (l.q !== cur) { cur = l.q; pb += `<tr class="sep"><td colspan="3">${cur > 4 ? 'Overtime' : 'Quarter ' + cur}</td></tr>`; }
      const big = /TOUCHDOWN|INTERCEPTED|FUMBLE|field goal is GOOD|sacked|Injury/.test(l.x);
      pb += `<tr><td class="small muted" style="white-space:nowrap">${fmtClock(l.c)} ${T(l.t).abbr}</td><td class="small muted" style="white-space:nowrap">${esc(l.dd || '')}</td><td class="small" style="white-space:normal${big ? ';font-weight:600' : ''}">${esc(l.x)}</td></tr>`;
    }
    html += `<details style="margin-top:14px"><summary class="section-title" style="cursor:pointer;display:inline">Play-by-Play (${b.pbp.length})</summary><div class="tbl-wrap"><table>${pb}</table></div></details>`;
  }
  html += `<details style="margin-top:14px"><summary class="section-title" style="cursor:pointer;display:inline">Drive Chart (${b.drives.length})</summary>` + table('dr', [
    { k: 'q', l: 'Q', f: d => d.q > 4 ? 'OT' : d.q }, { k: 'c', l: 'Start', f: d => fmtClock(d.clock) }, { k: 't', l: 'Team', f: d => T(d.tid).abbr }, { k: 's', l: 'Field', f: d => d.start },
    { k: 'p', l: 'Plays', f: d => d.plays, num: 1 }, { k: 'y', l: 'Yds', f: d => d.yds, num: 1 }, { k: 'tm', l: 'TOP', f: d => fmtClock(d.time), num: 1 },
    { k: 'r', l: 'Result', f: d => `<span class="${['Touchdown', 'Field Goal'].includes(d.result) ? 'good' : ['Interception', 'Fumble', 'Downs', 'Safety'].includes(d.result) ? 'bad' : 'muted'}">${d.result}</span>` },
  ], b.drives.filter(d => d.plays > 0 || d.result !== 'End of Game'), { nosort: 1 }) + '</details>';
  openModal(html);
}

// ---------- film room / advanced ----------
function gradeChip(v) {
  if (v === null || v === undefined) return '<span class="muted">—</span>';
  const c = v >= 85 ? 'r-elite' : v >= 72 ? 'r-good' : v >= 55 ? 'r-avg' : 'bad';
  return `<span class="r ${c}">${v}</span>`;
}
function teamAdvRows(ta) {
  const per = (x, k, n, d = 2) => x && x[n] ? (x[k] / x[n]).toFixed(d) : '—';
  const pc = (x, k, n) => x && x[n] ? Math.round(100 * (x[k] || 0) / x[n]) + '%' : '—';
  return [
    ['EPA / play', x => per(x, 'epa', 'plays')], ['Success rate', x => pc(x, 'succ', 'plays')], ['Explosive plays', x => (x && x.expl) || 0],
    ['Pass EPA / dropback', x => per(x, 'passEpa', 'db')], ['Rush EPA / carry', x => per(x, 'rushEpa', 'rushN')], ['Pressure rate allowed', x => pc(x, 'prs', 'db')],
    ['Time to throw', x => x && x.tttN ? (x.ttt / x.tttN).toFixed(2) + 's' : '—'], ['aDOT', x => per(x, 'air', 'airN', 1)], ['Early-down pass rate', x => pc(x, 'earlyPass', 'early')],
  ];
}
function filmRoomHTML(b) {
  const [h, a] = b.tids, ta = b.tadv || [{}, {}];
  let html = `<div class="section-title">Film Room · Advanced</div><table style="max-width:560px"><thead><tr><th class="num">${T(a).abbr}</th><th></th><th>${T(h).abbr}</th></tr></thead><tbody>`;
  for (const [l, f] of teamAdvRows()) html += `<tr><td class="num">${f(ta[1])}</td><td style="text-align:center" class="muted">${l}</td><td>${f(ta[0])}</td></tr>`;
  html += '</tbody></table>';
  if (!b.adv) return html + '<div class="muted small" style="margin-top:6px">Player grades and charting are kept for your games and the playoffs.</div>';
  html += `<div class="grid g2" style="margin-top:10px">`;
  for (const tid of [a, h]) {
    const rows = Object.entries(b.adv).map(([pid, x]) => ({ p: P(pid), x, snp: (b.stats[pid] || {}).snp || 0 })).filter(r => r.p && r.x.tid === tid && r.snp >= 5)
      .map(r => ({ ...r, gr: overallGrade(r.x, r.p.spot) })).sort((x, y) => (y.gr || 0) - (x.gr || 0));
    html += `<div>` + table('fr', [
      { k: 'n', l: T(tid).abbr + ' grades', f: r => `<button class="link" data-action="film" data-gid="${b.id}" data-pid="${r.p.id}">${esc(pshort(r.p))}</button> <span class="muted small">${esc(r.p.lbl)}</span>` },
      { k: 's', l: 'Snaps', f: r => r.snp, num: 1 },
      { k: 'g', l: 'Grade', f: r => gradeChip(r.gr), num: 1 },
      { k: 'f', l: '', f: r => `<span class="small muted">${Object.keys(gradeFacets(r.p.spot)).map(f => facetGrade(r.x, f) !== null && (r.x['n' + f] || 0) >= 4 ? `${FACETS[f]} ${facetGrade(r.x, f)}` : '').filter(Boolean).slice(0, 2).join(' · ')}</span>` },
    ], rows, { nosort: 1 }) + '</div>';
  }
  return html + '</div><div class="muted small">Grades are charted on every snap (0–100, average starter ≈ 62). Click a player for his film.</div>';
}
function filmModal(gid, pid) {
  const b = state.games[gid], p = P(pid);
  if (!b || !b.adv || !b.adv[pid] || !p) return;
  const x = b.adv[pid], line = b.stats[pid] || {};
  const opp = T(b.tids[0] === p.tid ? b.tids[1] : b.tids[0]).abbr;
  let html = `<button class="sm" data-action="box" data-gid="${gid}">← Box score</button>
    <div class="row" style="margin-top:8px"><h2 style="margin:0">${esc(pname(p))}</h2><span class="pill">${esc(p.lbl)}</span> <span class="muted">vs ${opp} · ${b.playoff || 'Week ' + b.week} · ${line.snp || 0} snaps</span></div>
    <div class="row" style="margin:10px 0;gap:14px"><span>Game grade ${gradeChip(overallGrade(x, p.spot))}</span>${Object.keys(FACETS).filter(f => (x['n' + f] || 0) >= 3).map(f => `<span class="small">${FACETS[f]} ${gradeChip(facetGrade(x, f))} <span class="muted">(${x['n' + f]})</span></span>`).join('')}</div>`;
  const m = advMetrics(x, p.spot);
  if (m.length) html += `<div class="section-title">Tracking</div><div class="stat-tiles">${m.map(([l, v, hint]) => `<div class="tile" title="${esc(hint)}"><div class="v" style="font-size:16px">${v}</div><div class="l">${l}</div></div>`).join('')}</div>`;
  if (b.pbp) {
    const nm = pshort(p);
    const plays = b.pbp.filter(l => l.x.includes(nm));
    html += `<div class="section-title">Plays featuring him (${plays.length})</div>` + (plays.length ? `<div class="tbl-wrap"><table>${plays.map(l => `<tr><td class="small muted" style="white-space:nowrap">Q${l.q > 4 ? 'OT' : l.q} ${fmtClock(l.c)}</td><td class="small muted" style="white-space:nowrap">${esc(l.dd || '')}</td><td class="small" style="white-space:normal">${esc(l.x)}</td></tr>`).join('')}</table></div>`
      : '<div class="muted small">He never touched the ball or made a play that hit the play-by-play — linemen and coverage players live in the tracking numbers above.</div>');
  }
  openModal(html);
}
function advancedSeasonHTML(p) {
  const rows = p.career.filter(r => r.adv).map(r => ({ season: r.season, tid: r.tid, a: r.adv, g: r.adv.g }));
  if (p.advS && Object.keys(p.advS).length > 1) rows.push({ season: state.season, tid: p.tid, a: p.advS, g: overallGrade(p.advS, p.spot), cur: true });
  if (!rows.length) return '';
  const last = rows[rows.length - 1];
  let html = `<div class="section-title">Advanced · ${last.season}${last.cur ? ' (season to date)' : ''}</div>
    <div class="row" style="gap:14px;margin-bottom:8px"><span>Season grade ${gradeChip(last.g)}</span>${Object.keys(FACETS).map(f => { const v = last.cur ? ((last.a['n' + f] || 0) >= 25 ? facetGrade(last.a, f) : null) : last.a['g' + f]; return v ? `<span class="small">${FACETS[f]} ${gradeChip(v)}</span>` : ''; }).join('')}</div>`;
  const m = advMetrics(last.a, p.spot);
  if (m.length) html += `<div class="stat-tiles">${m.map(([l, v, hint]) => `<div class="tile" title="${esc(hint)}"><div class="v" style="font-size:16px">${v}</div><div class="l">${l}</div></div>`).join('')}</div>`;
  if (rows.length > 1) html += `<div class="small muted" style="margin-top:8px">Grade by season: ${rows.map(r => `${r.season} ${gradeChip(r.g)}`).join(' · ')}</div>`;
  return html;
}

// ---------- async sims ----------
function busy(msg) { const b = $('#busy'); if (msg) { b.textContent = msg; b.classList.add('show'); } else b.classList.remove('show'); }
async function runSteps(step, done, label) {
  let guard = 0;
  while (!done() && guard++ < 500) {
    busy(label());
    await new Promise(r => setTimeout(r, 0));
    step();
  }
  busy(null); save(); render();
}
function stepContinue() {
  switch (state.phase) {
    case 'REG': simWeek(); break;
    case 'PLAYOFFS': simPlayoffRound(); break;
    case 'RECAP': startOffseason(); break;
    case 'COACHES': leaveCoaches(); break;
    case 'RESIGN': leaveResign(); break;
    case 'FA': advanceFA(); break;
    case 'DRAFT': { const pk = currentPick(); if (pk && pk.owner === state.userTid) simDraftPick(); else simDraftToUser(); break; }
    case 'PRESEASON': startNewSeason(); break;
  }
}
function phaseLabel() {
  return state.phase === 'REG' ? `Simulating week ${state.week}…` : state.phase === 'PLAYOFFS' ? `Playing ${ROUND_NAMES[state.playoffs.round]}…` : `${PHASE_LABEL[state.phase]}…`;
}

// ---------- actions ----------
const actions = {
  nav: d => { view = d.view; render(); window.scrollTo(0, 0); },
  newLeague: d => { busy('Building league…'); setTimeout(() => { newLeague(+d.tid); save(); view = 'home'; busy(null); render(); }, 10); },
  continueSave: () => { load().then(ok => { if (ok) render(); else toast('Could not read the saved league.'); }); },
  importClick: () => $('#importFile').click(),
  export: () => exportSave(),
  newGame: () => { if (confirm('Start a new league? Your current league will be overwritten (export it first if you want to keep it).')) { state = null; deleteSave(); render(); } },
  continue: () => {
    if (state.phase === 'RESIGN' && !state.settings.autoUser) {
      const n = rosterOf(state.userTid).filter(p => p.expiring).length;
      if (n && !confirm(`${n} expiring player(s) will leave in free agency. Continue?`)) return;
    }
    if (state.phase === 'REG' || state.phase === 'PLAYOFFS') {
      runSteps(stepContinue, (() => { let n = 0; return () => n++ > 0; })(), phaseLabel);
    } else { stepContinue(); save(); render(); }
  },
  simPlayoffs: () => {
    const ph = state.phase;
    if (ph === 'REG') runSteps(simWeek, () => state.phase !== 'REG', phaseLabel);
    else runSteps(simPlayoffRound, () => state.phase !== 'PLAYOFFS', phaseLabel);
  },
  simDraft: () => {
    const prev = state.settings.autoUser;
    state.settings.autoUser = true; simDraftToUser(); state.settings.autoUser = prev;
    save(); render();
  },
  simYear: () => {
    if (!confirm('Sim to the start of next season? Your team will be auto-managed for everything in between (re-signings, free agency, draft, cuts).')) return;
    const startSeason = state.season, prev = state.settings.autoUser;
    state.settings.autoUser = true;
    runSteps(stepContinue, () => state.season > startSeason && state.phase === 'REG', phaseLabel).then(() => { state.settings.autoUser = prev; save(); render(); });
  },
  sort: d => {
    const cur = sortState[d.table];
    sortState[d.table] = cur && cur.k === d.k ? { k: d.k, dir: -cur.dir } : { k: d.k, dir: -1 };
    render();
  },
  player: d => playerModal(+d.pid),
  team: d => { ui.rosterTid = +d.tid; view = 'roster'; closeModal(); render(); window.scrollTo(0, 0); },
  box: d => boxModal(+d.gid),
  closeModal: () => closeModal(),
  release: d => {
    const p = P(+d.pid);
    if (state.phase === 'RESIGN' && p.expiring) { toFreeAgency(p); addNews(`${T(state.userTid).abbr} let ${p.lbl} ${pname(p)} walk.`, [state.userTid]); }
    else {
      const d = deadIfCut(p);
      if (!confirm(`Release ${pname(p)}?${d.now + d.next ? ` Dead money: ${fmtMoney(d.now)} this year${d.next ? ` and ${fmtMoney(d.next)} next year` : ''}.` : ''}`)) return;
      releasePlayer(p.id);
    }
    closeModal(); save(); render();
  },
  resign: d => { const err = resignPlayer(+d.pid); if (err) toast(err); else toast('Re-signed!'); closeModal(); save(); render(); },
  resignAll: () => {
    let n = 0;
    for (const p of rosterOf(state.userTid).filter(p => p.expiring).sort((a, b) => uOvr(b) - uOvr(a))) {
      if (aiWantsResign(p) && !resignPlayer(p.id)) n++;
    }
    toast(`Re-signed ${n} player(s).`); save(); render();
  },
  option: d => { const err = exerciseOption(+d.pid, d.v === '1'); toast(err || (d.v === '1' ? 'Option exercised.' : 'Option declined.')); closeModal(); save(); render(); },
  tag: d => { const err = franchiseTag(+d.pid); toast(err || 'Franchise tag applied.'); closeModal(); save(); render(); },
  extend: d => { const err = extendPlayer(+d.pid); toast(err || 'Extension signed.'); closeModal(); save(); render(); },
  promote: d => { const err = promoteFromPS(+d.pid, state.userTid); toast(err || 'Promoted to the 53.'); closeModal(); save(); render(); },
  psRelease: d => { releaseFromPS(+d.pid); toast('Released from the practice squad.'); closeModal(); save(); render(); },
  signPS: d => { const err = signToPS(+d.pid, state.userTid); toast(err || 'Signed to the practice squad.'); closeModal(); save(); render(); },
  autoCut: () => { const c = autoCut(state.userTid, ROSTER_MAX, false); toast(`Released ${c.length} player(s).`); save(); render(); },
  sign: d => { const err = signFA(+d.pid, state.userTid); if (err) toast(err); else toast('Signed!'); closeModal(); save(); render(); },
  statCat: d => { ui.statCat = d.cat; render(); },
  faPos: d => { ui.faPos = d.pos; render(); },
  draftPos: d => { ui.draftPos = d.pos; render(); },
  newsMine: d => { ui.newsMine = d.v === '1'; render(); },
  draftPick: d => {
    draftPlayer(+d.pid);
    simDraftToUser();
    save(); render();
  },
  fireCoach: d => { if (confirm('Fire this coach?')) { fireCoach(state.userTid, d.role); save(); render(); } },
  coach: d => coachModal(+d.cid),
  film: d => filmModal(+d.gid, +d.pid),
  advGrp: d => { ui.advGrp = d.g; render(); },
  coachRole: d => { ui.coachRole = d.role; render(); },
  hireCoach: d => { hireCoach(state.userTid, +d.cid); closeModal(); save(); render(); },
  tradeToggle: (d) => {
    const assets = d.side === 'give' ? ui.give : ui.get;
    const arr = assets[d.type], id = +d.id, i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1); else arr.push(id);
    render();
  },
  tradeFor: d => {
    const p = P(+d.pid);
    ui.tradeTid = p.tid; ui.give = { players: [], picks: [] }; ui.get = { players: [p.id], picks: [] };
    view = 'trade'; closeModal(); render();
  },
  clearTrade: () => { ui.give = { players: [], picks: [] }; ui.get = { players: [], picks: [] }; render(); },
  proposeTrade: () => {
    const ev = proposeTrade(state.userTid, ui.tradeTid, ui.give, ui.get);
    if (ev.ok) { toast('Trade accepted!'); ui.give = { players: [], picks: [] }; ui.get = { players: [], picks: [] }; save(); }
    else toast(ev.msg);
    render();
  },
};
const changes = {
  rosterTeam: v => { ui.rosterTid = +v; },
  schedWeek: v => { ui.schedWeek = +v; },
  statSeason: v => { ui.statSeason = +v; },
  statMine: (v, el) => { ui.statMine = el.checked; },
  tradeTeam: v => { ui.tradeTid = +v; ui.get = { players: [], picks: [] }; },
  histTeam: v => { ui.histTid = +v; },
  autoUser: (v, el) => { state.settings.autoUser = el.checked; save(); toast(el.checked ? 'Auto-manage on.' : 'Auto-manage off.'); },
  showTrue: (v, el) => { state.settings.showTrue = el.checked; save(); },
};

document.addEventListener('click', e => {
  if (e.target.id === 'modal') { closeModal(); return; }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el.dataset, el); }
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-change]');
  if (!el) return;
  const fn = changes[el.dataset.change];
  if (fn) { fn(el.value, el); render(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
$('#importFile').addEventListener('change', e => { if (e.target.files[0]) importSave(e.target.files[0]); e.target.value = ''; });

$('#app').innerHTML = '<div class="setup"><p class="muted">Loading…</p></div>';
readSave().then(s => { hasSave = !!s; return load(); }).then(render, render);
