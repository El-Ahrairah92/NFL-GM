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
// sort keys that follow the labels exactly: tier (or upside) first, then standing within the position group
function tierSort(p) { return (TIER_ORDER.length - TIER_ORDER.indexOf(tierOf(p))) * 1000 + pctInGroup(p, uOvr(p)) * 100; }
function upSort(p) { return (UPSIDE_ORDER.length - UPSIDE_ORDER.indexOf(upsideOf(p))) * 1000 + pctInGroup(p, uCeil(p)) * 100; }
function trueNums(p) { return trueOn() ? ` <span class="small muted" title="True OVR / POT (debug view)">${p.ovr}/${p.pot}</span>` : ''; }
function traitsTxt(p) { const t = scoutTraits(p); return `<span title="${esc([...t.str.map(x => '+ ' + x), ...t.weak.map(x => '− ' + x)].join(' | '))}">${esc(scoutProfile(p, true))}</span>`; }
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
function applyTheme() { document.documentElement.classList.toggle('dark', !!(state && state.settings && state.settings.theme === 'dark')); }
function render() {
  const app = $('#app');
  applyTheme();
  if (!state) { app.innerHTML = setupHTML(); return; }
  document.documentElement.style.setProperty('--accent', T(state.userTid).color);
  let page;
  try { page = pageHTML(); } catch (e) { showError(e, `drawing the ${view} page`); page = `<div class="callout bad">This page hit an error (details at the bottom of the screen).</div>`; }
  app.innerHTML = topbarHTML() + `<main>${page}</main>`;
}
// any error shows on screen instead of failing silently (so a "dead" click has an explanation)
function showError(e, where) {
  const bar = document.getElementById('errbar');
  if (!bar) return;
  const msg = (e && (e.stack || e.message)) || String(e);
  bar.innerHTML = `<b>Something went wrong${where ? ' while ' + esc(where) : ''}.</b> <span class="small">${esc(String(msg).split(/\r?\n/).slice(0, 3).join(' · '))}</span> <button class="sm" onclick="this.parentNode.classList.add('hidden')">Dismiss</button>`;
  bar.classList.remove('hidden');
  console.error(e);
}
window.addEventListener('error', ev => showError(ev.error || ev.message));
window.addEventListener('unhandledrejection', ev => showError(ev.reason));

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

const PAGES = [['home', 'Home'], ['roster', 'Roster'], ['depth', 'Depth Chart'], ['coaches', 'Staff'], ['playbook', 'Playbook'], ['schedule', 'Schedule'], ['standings', 'Standings'], ['stats', 'League Stats'], ['trade', 'Trade'], ['fa', 'Free Agents'], ['search', 'Player Search'], ['draft', 'Draft'], ['news', 'News'], ['history', 'History'], ['settings', 'Settings']];

function continueLabel() {
  switch (state.phase) {
    case 'REG': return `▶ Play Week ${state.week}`;
    case 'PLAYOFFS': return `▶ Play ${ROUND_NAMES[state.playoffs.round]}`;
    case 'RECAP': return 'Start Offseason →';
    case 'COACHES': return 'Done with Coaches →';
    case 'RESIGN': return 'Done Re-signing →';
    case 'FA': return `Next FA Wave (${state.faWave + 1}/${FA_WAVES}) →`;
    case 'DRAFT': { const pk = currentPick(); return pk && pk.owner === state.userTid ? 'Auto-pick for Me' : 'Sim to My Pick'; }
    case 'PRESEASON': return `▶ Play Preseason Game ${(state.pre ? state.pre.wk : 0) + 1}`;
    case 'CUTDOWN': return `Finalize Roster & Start ${state.season + 1} Season →`;
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
  </div><nav class="tabs">${(state.phase === 'CUTDOWN' ? [['cutdown', '✂ Cutdown Day'], ...PAGES] : PAGES).map(([k, l]) => `<button class="${view === k ? 'on' : ''}" data-action="nav" data-view="${k}">${l}</button>`).join('')}</nav></div>`;
}
function pageHTML() {
  switch (view) {
    case 'home': return homeHTML();
    case 'roster': return rosterHTML();
    case 'depth': return depthChartHTML();
    case 'playbook': return playbookHTML();
    case 'schedule': return scheduleHTML();
    case 'standings': return standingsHTML();
    case 'stats': return statsHTML();
    case 'trade': return tradeHTML();
    case 'fa': return faHTML();
    case 'search': return searchHTML();
    case 'cutdown': return state.phase === 'CUTDOWN' ? cutdownHTML() : homeHTML();
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
    case 'PRESEASON': return `Preseason: ${PRESEASON_GAMES} exhibition games. Your starters sit; the bubble players and rookies get the snaps, and what they put on film sharpens every evaluation before <b>Cutdown Day</b>.`;
    case 'CUTDOWN': { const n = rosterOf(u).filter(countsOn53).length; return `Cutdown Day: ${n} players, ${ROSTER_MAX} spots. Go through each position group with your staff on the <b>Cutdown Day</b> tab. Anything you leave undecided, the staff decides.`; }
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
const ROSTER_VIEWS = [['scout', 'Scouting'], ['contract', 'Contracts'], ['stats', 'Season Stats'], ['adv', 'Advanced'], ['comfort', 'Positional Comfort'], ['true', 'True Ratings (debug)']];
function starHTML(n) {
  if (n === null || n === undefined) return '';
  let h = ''; for (let i = 1; i <= 5; i++) h += `<i class="${n >= i ? 'f' : n >= i - 0.5 ? 'h' : 'e'}">★</i>`;
  return `<span class="stars" title="${n} stars: ability at his position, weighted toward recent form">${h}</span>`;
}
const STAT_NUM = (k) => ({ k, v: r => r.stats[k] || 0, num: 1 });
function rosterHTML() {
  const tid = ui.rosterTid == null ? state.userTid : ui.rosterTid;
  const mine = tid === state.userTid;
  const vw = ui.rosterView === 'true' && !trueOn() ? 'scout' : (ui.rosterView || 'scout');
  const ro = rosterOf(tid).filter(p => inFamily(p, ui.rosterPos || 'ALL'));
  const opts = state.teams.map(t => `<option value="${t.id}" ${t.id === tid ? 'selected' : ''}>${t.region} ${t.name}</option>`).join('');
  const vopts = ROSTER_VIEWS.filter(([k]) => k !== 'true' || trueOn()).map(([k, l]) => `<option value="${k}" ${k === vw ? 'selected' : ''}>${l}</option>`).join('');
  let html = `<div class="row" style="margin-bottom:8px"><select data-change="rosterTeam">${opts}</select> <label class="small muted">View</label> <select data-change="rosterView">${vopts}</select>
    <span class="spacer"></span>${mine && state.phase === 'RESIGN' ? '<button data-action="resignAll">Re-sign all affordable starters</button>' : ''}
    ${mine && rosterOf(tid).length > ROSTER_MAX && state.phase === 'PRESEASON' ? `<button data-action="autoCut">Auto-cut to ${ROSTER_MAX}</button>` : ''}</div>
    <div class="muted small" style="margin-bottom:8px">Cap ${fmtMoney(state.cap)} · Payroll ${fmtMoney(payroll(tid))} · Cap space <b>${fmtMoney(capRoom(tid))}</b>${T(tid).dead ? ` · Dead money ${fmtMoney(T(tid).dead)}` : ''} · Next year committed ${fmtMoney(payrollNext(tid))} · ${rosterCount(tid)}/${rosterLimit()} players${state.phase === 'REG' ? ' (IR excluded)' : ''} · PS ${psOf(tid).length}/${PS_MAX}</div>
    <div class="subtabs">${famTabs(ui.rosterPos || 'ALL', 'rosterPos')}</div>`;
  if (mine && state.phase === 'RESIGN') html += decisionsHTML(tid);
  const dv = depthView(tid), starters = new Set();
  for (const e of [...dv.off, ...dv.nickel, ...dv.base, dv.k, dv.p]) starters.add(e.p.id);
  const base = [
    { k: 'pos', l: 'Pos', v: p => FAM_INDEX[p.spot] * 1000 - uOvr(p), f: p => esc(p.lbl) + (starters.has(p.id) ? '' : '<span class="muted small">²</span>') },
    { k: 'n', l: 'Name', v: p => p.last, f: p => playerLink(p) + ' ' + statusPills(p) },
    { k: 'age', l: 'Age', v: p => p.age, num: 1 },
  ];
  const stars = { k: 'star', l: '★', v: p => starsOf(p) || 0, f: p => starHTML(starsOf(p)), title: 'Ability at his position, weighted toward current form' };
  const tier = { k: 'tier', l: 'Tier', v: tierSort, f: p => tierPill(p) + trueNums(p) };
  const grade = { k: 'gr', l: 'Grade', v: p => p.advS ? overallGrade(p.advS, p.spot) || 0 : 0, f: p => gradeChip(p.advS ? overallGrade(p.advS, p.spot) : null), num: 1 };
  let cols;
  if (vw === 'contract') cols = [...base, tier,
    { k: 'amt', l: 'Cap hit', v: p => p.contract.yrs > 0 ? p.contract.amt : 0, f: p => p.contract.yrs > 0 ? fmtMoney(p.contract.amt) : '—', num: 1 },
    { k: 'yrs', l: 'Yrs', v: p => p.contract.yrs || 0, num: 1 },
    { k: 'gtd', l: 'Gtd left', v: p => p.contract.gtd || 0, f: p => fmtMoney(p.contract.gtd || 0), num: 1 },
    { k: 'dead', l: 'Dead if cut', v: p => { const d = deadIfCut(p); return d.now + d.next; }, f: p => { const d = deadIfCut(p); return d.now + d.next ? fmtMoney(d.now) + (d.next ? ` <span class="muted small">+${fmtMoney(d.next)}</span>` : '') : '—'; }, num: 1 },
    { k: 'save', l: 'Cut saves', v: p => cutSavings(p), f: p => { const v = cutSavings(p); return `<span class="${v < 0 ? 'bad' : ''}">${fmtMoney(v)}</span>`; }, num: 1 },
    { k: 'nx', l: 'Status', v: p => p.contract.next ? 2 : p.expiring ? 1 : 0, f: p => fmtContract(p).replace(/^.*?<\/span>/, '') + (p.expiring ? ' <span class="pill exp">Expiring</span>' : '') + (p.contract.rookie ? ' <span class="pill">Rookie deal</span>' : '') },
  ];
  else if (vw === 'stats') cols = [...base, { k: 'gp', l: 'GP', v: p => p.stats.gp || 0, num: 1 }, { k: 'gs', l: 'GS', v: p => p.stats.gs || 0, num: 1 }, { k: 'snp', l: 'Snaps', v: p => p.stats.snp || 0, num: 1 },
    { k: 'line', l: 'Season', v: p => hypeMetric(p, p.stats), f: p => `<span class="small">${p.stats.gp ? statSummary(p.stats, p.pos) : ''}</span>` },
    { ...STAT_NUM('tkl'), l: 'Tkl' }, { ...STAT_NUM('sck'), l: 'Sck' }, { ...STAT_NUM('dint'), l: 'INT' }, { ...STAT_NUM('pd'), l: 'PD' }, grade];
  else if (vw === 'adv') {
    const fg = (k, l) => ({ k: 'f' + k, l, v: p => (p.advS && facetGrade(p.advS, k)) || 0, f: p => gradeChip(p.advS ? facetGrade(p.advS, k) : null), num: 1 });
    cols = [...base, stars, grade, fg('q', 'Pass'), fg('rec', 'Recv'), fg('run', 'Rush'), fg('pb', 'Pass blk'), fg('rb', 'Run blk'), fg('pr', 'Pass rush'), fg('rd', 'Run def'), fg('cov', 'Cover'), fg('tk', 'Tackle'),
      { k: 'snp', l: 'Snaps', v: p => p.stats.snp || 0, num: 1 }];
  } else if (vw === 'comfort') cols = [...base, tier,
    { k: 'cf', l: 'Positional comfort', v: p => Object.keys(p.cf || {}).length, f: p => Object.entries(p.cf || {}).sort((a, b) => b[1] - a[1]).map(([s, c]) => `<span class="pill ${CF_CLS[comfortLabel(c)]}" title="${Math.round(c)}">${SPOTS[s].l} · ${comfortLabel(c)}</span>`).join(' ') },
    { k: 'ad', l: 'Learns', v: p => (p.h && p.h.adapt) || 0, f: p => { const r = learnRate(p); return `<span class="small ${r >= 1.15 ? 'good' : r <= 0.8 ? 'bad' : 'muted'}">${r >= 1.15 ? 'Quick' : r <= 0.8 ? 'Slow' : 'Average'}</span>`; }, title: 'How fast he picks up a new position' }];
  else if (vw === 'true') cols = [...base, { k: 'ovr', l: 'OVR', v: p => p.ovr, f: p => rat(p.ovr), num: 1 }, { k: 'pot', l: 'POT', v: p => p.pot, f: p => rat(p.pot), num: 1 },
    { k: 'seen', l: 'Seen as', v: p => uOvr(p), f: p => `${uOvr(p).toFixed(0)} <span class="muted small">(${(uOvr(p) - p.ovr) > 0 ? '+' : ''}${(uOvr(p) - p.ovr).toFixed(1)})</span>`, num: 1 },
    { k: 'hype', l: 'Hype', v: p => p.per ? p.per.h : 0, f: p => p.per ? p.per.h.toFixed(1) : '—', num: 1 },
    { k: 'adapt', l: 'Adapt', v: p => (p.h && p.h.adapt) || 0, num: 1 }];
  else cols = [...base, { k: 'hw', l: 'Ht/Wt', v: p => p.m.wt, f: p => `<span class="small muted">${htwt(p)}</span>` }, stars, tier,
    { k: 'up', l: 'Upside', v: upSort, f: p => upsidePill(p) },
    { k: 'sk', l: 'Scouting', f: p => `<span class="small muted wrapcell">${traitsTxt(p)}</span>` },
    { k: 'fit', l: 'Fit', v: p => schemeFit(p, tid), f: p => { const f = schemeFit(p, tid); return `<span class="small ${f >= 1 ? 'good' : f <= -1 ? 'bad' : 'muted'}" title="Scheme fit in ${esc(T(tid).abbr)}'s system">${fitLabel(f).replace(' fit', '')}${trueOn() ? ` (${f > 0 ? '+' : ''}${f})` : ''}</span>`; } },
    { k: 'c', l: 'Contract', v: p => p.contract.yrs > 0 ? p.contract.amt : 0, f: p => fmtContract(p), num: 1 }];
  if (mine) cols.push({ k: 'a', l: '', f: p => rosterActions(p) });
  html += `<div class="card">` + table('roster_' + vw, cols, ro, { sort: 'pos', dir: 1 }) +
    `<div class="muted small" style="margin-top:6px">² = depth (not in the current lineup). Click any column header to sort. Set your lineup on the Depth Chart page; 48 of the 53 dress on game day.</div></div>`;
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
  if (ext.length) h += `<div class="section-title">Extension candidates (entering final year)</div>` + ext.sort((a, b) => uOvr(b) - uOvr(a)).slice(0, 6).map(p => { const a = extensionAsk(p); return li(p, `asks ${a.yrs} yr × ${fmtMoney(a.amt)} <span class="small muted">(leverage ${leverageLabel(leverageOf(p)).toLowerCase()})</span> <button class="sm" data-action="extend" data-pid="${p.id}">Extend</button> <button class="sm" data-action="player" data-pid="${p.id}">Terms…</button>`); }).join('');
  return h + '</div>';
}
function practiceSquadHTML(tid, mine) {
  const ps = psOf(tid).sort(famOrder);
  if (!ps.length) return '';
  return `<div class="card" style="margin-top:16px"><h3>Practice Squad (${ps.length}/${PS_MAX})</h3><p class="muted small">Develops like everyone else, doesn't dress on game day, can be promoted when injuries hit — and other teams can sign them away to their 53.</p>` + table('ps', [
    { k: 'pos', l: 'Pos', f: p => esc(p.lbl) }, { k: 'n', l: 'Name', f: p => playerLink(p) + ' ' + statusPills(p) }, { k: 'age', l: 'Age', f: p => p.age, num: 1 },
    { k: 'tier', l: 'Tier', v: tierSort, f: p => tierPill(p) + trueNums(p) }, { k: 'up', l: 'Upside', v: upSort, f: p => upsidePill(p) },
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
  else if (p.expiring) h += `Expiring · asking ${prefYears(p)} yr × ${fmtMoney(p.ask)} · leverage ${leverageLabel(leverageOf(p)).toLowerCase()}`;
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
  if (p.expiring && state.phase === 'RESIGN') return `<button class="sm primary" data-action="resign" data-pid="${p.id}" title="His preferred deal. Open his card for other lengths.">Re-sign ${prefYears(p)} yr · ${fmtMoney(p.ask)}</button> <button class="sm" data-action="player" data-pid="${p.id}">Terms…</button> <button class="sm danger" data-action="release" data-pid="${p.id}">Let go</button>`;
  return `<button class="sm danger" data-action="release" data-pid="${p.id}">Release</button>`;
}

// contract-length choices: his preferred deal first-class, other lengths priced by his leverage (or refused)
function termButtons(p, kind) {
  const t = kind === 'extend' ? extensionTerms(p) : resignTerms(p), room = kind === 'extend' ? Infinity : capRoom(p.tid);
  const btn = o => `<button class="sm ${o.pref ? 'primary' : ''}" data-action="${kind}" data-pid="${p.id}" data-yrs="${o.yrs}" ${!o.ok ? `disabled title="${esc(o.why)}"` : o.amt > room ? 'disabled title="Not enough cap space"' : `title="${o.pref ? 'The deal he wants' : o.amt > t.opts.find(x => x.pref).amt ? 'He charges more for this length' : 'A discount for this length'}"`}>${o.yrs} yr · ${o.ok ? fmtMoney(o.amt) : '✕'}</button>`;
  return `<div class="terms"><div class="small muted" style="margin-bottom:4px">${kind === 'extend' ? 'Extension' : 'Re-sign'} · leverage: <b>${leverageLabel(t.lev)}</b> · wants ${t.pref} yr${t.pref === 1 ? '' : 's'}</div><div class="row" style="gap:6px">${t.opts.map(btn).join('')}</div></div>`;
}

// ---------- depth chart ----------
// how your staff sees him at a spot: perceived level, adjusted for how well he knows that spot
function chartValue(p, spot) { return uOvr(p) + (slotRating(p, spot) - p.ovr); }
const CF_CLS = { Natural: 'good', Comfortable: '', Decent: 'warn', Raw: 'bad', Unfamiliar: 'bad' };
function dcPlayerMeta(p, key, spot) {
  const cf = comfortLabel(comfortOf(p, spot));
  return `<span class="dc-meta">${['K', 'P', 'KR'].includes(key) ? '' : `<span class="pill ${CF_CLS[cf]}">${cf} at ${SPOTS[spot].l}</span>`}${tierPill(p)}${starHTML(starsOf(p))}${p.injury ? ` <span class="pill inj">${onIR(p) ? 'IR' : 'INJ'} ${p.injury.weeks}w</span>` : ''}</span>`;
}
// formation boards: [key, grid column, grid row]
const DC_BOARD = {
  off: [['X', 1, 1], ['LT', 3, 1], ['LG', 4, 1], ['C', 5, 1], ['RG', 6, 1], ['RT', 7, 1], ['Y', 8, 1], ['Z', 9, 1],
    ['SLOT', 2, 2], ['QB', 5, 2], ['H', 8, 2], ['FB', 5, 3], ['RB', 5, 4], ['SLOT2', 1, 4], ['Y2', 8, 4], ['OL6', 9, 4]],
  def: [['FS', 4, 1], ['SS', 6, 1], ['CB1', 1, 2], ['NCB', 3, 2], ['DIME', 7, 2], ['CB2', 9, 2], ['WLB', 3, 3], ['MLB', 5, 3], ['SAM', 7, 3],
    ['EDGE1', 2, 4], ['IDL1', 4, 4], ['NT', 5, 4], ['IDL2', 6, 4], ['EDGE2', 8, 4]],
  pkg: [['RB3D', 1, 1], ['RBSY', 3, 1], ['RUSHE', 5, 1], ['RUSHI', 7, 1], ['K', 1, 2], ['P', 3, 2], ['KR', 5, 2]],
};
function dcPlayerMeta(p, key, spot) {
  const cf = comfortLabel(comfortOf(p, spot));
  return `<span class="dc-meta">${['K', 'P', 'KR'].includes(key) ? '' : `<span class="pill ${CF_CLS[cf]}">${cf} at ${SPOTS[spot].l}</span>`}${tierPill(p)}${starHTML(starsOf(p))}${p.injury ? ` <span class="pill inj">${onIR(p) ? 'IR' : 'INJ'} ${p.injury.weeks}w</span>` : ''}</span>`;
}
function dcBox(c, key, cur, u) {
  const ids = (c.lists[key] || []).filter(id => P(id) && P(id).tid === u), spot = CHART_SPOT[key];
  const row = (id, i) => { const p = P(id), cf = ['K', 'P', 'KR'].includes(key) ? null : comfortLabel(comfortOf(p, spot));
    return `<div class="${i ? 'b2' : 'b1'}" title="${esc(pname(p))}">${esc(p.last)}${cf && cf !== 'Natural' && cf !== 'Comfortable' ? ` <span class="cfdot ${CF_CLS[cf]}" title="${cf} at ${SPOTS[spot].l}">●</span>` : ''}${p.injury ? ' <span class="cfdot bad" title="Injured">✚</span>' : ''}</div>`; };
  return `<div class="dc-box ${key === cur ? 'on' : ''}" data-action="dchPick" data-key="${key}"><div class="hd">${chartName(key)}</div>${ids.slice(0, 3).map(row).join('') || '<div class="b2 muted">—</div>'}</div>`;
}
function depthChartHTML() {
  const u = state.userTid, c = ensureChart(u);
  refreshChart(u);
  const ro = rosterOf(u).filter(p => p.a);
  const tab = ui.dchTab || 'off';
  let key = ui.dchKey && DC_BOARD[tab].some(x => x[0] === ui.dchKey) ? ui.dchKey : DC_BOARD[tab][0][0];
  const sec = CHART_SECTIONS.find(x => x.rows.some(r => r[0] === key));
  const label = sec.rows.find(r => r[0] === key)[1], spot = CHART_SPOT[key], n = Math.max(CHART_DEPTH[key] || 3, 1);
  const list = (c.lists[key] || []).filter(id => P(id) && P(id).tid === u);
  const unitOf = { off: 'off', def: 'def' }[tab];
  let html = `<div class="row" style="margin-bottom:10px"><div class="subtabs" style="margin:0">${[['off', 'Offense'], ['def', 'Defense'], ['pkg', 'Packages & Special Teams']].map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" data-action="dchTab" data-tab="${k}">${l}</button>`).join('')}</div><span class="spacer"></span>
    ${unitOf ? (c.auto[unitOf] ? `<span class="small muted">The staff is setting the ${tab === 'off' ? 'offense' : 'defense'}.</span> <button class="sm primary" data-action="dchAuto" data-unit="${unitOf}" data-on="0">Take control</button>` : `<span class="small muted">You're setting the ${tab === 'off' ? 'offense' : 'defense'}.</span> <button class="sm" data-action="dchAuto" data-unit="${unitOf}" data-on="1">Hand to staff</button>`) : `<span class="small muted">Special teams: ${c.auto.st ? 'staff' : 'you'}</span> <button class="sm" data-action="dchAuto" data-unit="st" data-on="${c.auto.st ? 0 : 1}">${c.auto.st ? 'Take control' : 'Hand to staff'}</button>`}</div>
    ${state.settings.autoUser ? '<div class="callout"><b>Auto-manage is on</b>: the staff sets the depth chart until you turn it off in Settings.</div>' : ''}
    <div class="dc-wrap"><div class="card"><div class="dc-board ${tab}">${DC_BOARD[tab].map(([k, col, row]) => `<div style="grid-column:${col};grid-row:${row}">${dcBox(c, k, key, u)}</div>`).join('')}</div>
    <div class="small muted" style="margin-top:10px">Click a position to set its order. <span class="cfdot warn">●</span> Decent / <span class="cfdot bad">●</span> Raw or unfamiliar at the spot · <span class="cfdot bad">✚</span> injured.${tab === 'off' ? ' Bottom row: sub-package spots (4th WR, 3rd TE, 6th OL).' : ''}</div></div><div class="dc-side">`;
  // ---- right: the selected slot ----
  const lvl = p => { const cc = comfortOf(p, spot); return cc >= 85 ? 4 : cc >= 60 ? 3 : cc >= 30 ? 2 : cc > 0 ? 1 : 0; };
  const fam = (FAMILIES.find(f => f[1].includes(spot)) || [null, []])[1];
  const all = ro.filter(p => (key === 'KR' ? returnScore(p) > -1e8 : SPOTS[p.spot].side === SPOTS[spot].side) && !list.includes(p.id));
  const related = all.filter(p => key === 'KR' || ['K', 'P'].includes(key) || lvl(p) > 0 || fam.includes(p.spot));
  const cands = (ui.dchAll ? all : related).sort((x, y) => key === 'KR' ? returnScore(y) - returnScore(x) : lvl(y) - lvl(x) || chartValue(y, spot) - chartValue(x, spot));
  const rot = ROT_KEYS.has(key) ? `<label class="small muted">No. 2 snaps</label> <select data-change="dchRot" data-key="${key}">${ROT_OPTS.map(([v, l]) => `<option value="${v}" ${(c.rot[key] || 0) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>` : '';
  html += `<div class="card"><div class="row" style="margin-bottom:6px"><h3 style="margin:0">${chartName(key)} · ${esc(label)}</h3><span class="spacer"></span>${rot}</div>
    <div class="section-title" style="margin-top:6px">Depth order <span class="small muted">· drag to reorder</span></div><div class="dc-order">
    ${list.map((id, i) => { const p = P(id); return `<div class="dc-row" draggable="true" data-dcpid="${id}" data-dcfrom="${i}" data-dcdrop="${i}"><span class="n">${i + 1}</span><span>${esc(p.lbl)} ${playerLink(p)}</span><span class="dc-meta">${dcPlayerMeta(p, key, spot)}<button class="sm" data-action="dchRemove" data-key="${key}" data-i="${i}" title="Remove">✕</button></span></div>`; }).join('')}
    <div class="dc-drop" data-dcdrop="${list.length}">${list.length < n ? `Drop a player here for No. ${list.length + 1}` : `Drop here to make him No. ${n} (bumps the last man)`}</div></div>
    <div class="row" style="margin:16px 0 8px"><span class="section-title" style="margin:0">Available · by comfort at ${SPOTS[spot].l}, then ability</span><span class="spacer"></span>
      <label class="small muted"><input type="checkbox" data-change="dchAll" ${ui.dchAll ? 'checked' : ''}> Show everyone (+${all.length - related.length})</label></div>
    <div class="dc-cands">${cands.map(p => `<div class="dc-row cand" draggable="true" data-dcpid="${p.id}"><span>${esc(p.lbl)} ${playerLink(p)} <span class="muted small">${p.age}y</span></span><span class="dc-meta">${dcPlayerMeta(p, key, spot)}<button class="sm primary" data-action="dchAdd" data-key="${key}" data-pid="${p.id}" title="Add to the depth order">+</button></span></div>`).join('') || '<div class="muted small" style="padding:10px">Nobody else available.</div>'}</div></div>`;
  return html + '</div></div>';
}
// ---------- playbook (view only) ----------
const PERS_LABEL = { '10': '10 (1 RB, 0 TE, 4 WR)', '11': '11 (1 RB, 1 TE, 3 WR)', '12': '12 (1 RB, 2 TE, 2 WR)', '13': '13 (1 RB, 3 TE, 1 WR)', '21': '21 (2 RB, 1 TE, 2 WR)', '22': '22 (2 RB, 2 TE, 1 WR)', JUMBO: 'Jumbo (6 OL)' };
const TYPE_LABEL = { RUN: 'Designed runs', DRAW: 'Draws', OPTION: 'Option', SNEAK: 'QB sneak', JET: 'Jet sweep', QUICK: 'Quick game', DROP: 'Dropback', DEEP: 'Deep shots', RBSCR: 'RB screen', WRSCR: 'WR screen', GADGET: 'Gadget' };
const FORM_LABEL = { SG: 'Shotgun', UC: 'Under center', PI: 'Pistol', EMP: 'Empty' };
const TAG_LABEL = { PA: 'Play-action', MOTION: 'Motion', RPO: 'RPO', BOOT: 'Bootleg', SIDE: 'Sideline concepts', RUB: 'Rub/pick routes', TRICK: 'Trick plays' };
const SIT_LABEL = { '1st': '1st down', '2L': '2nd & long (7+)', '2S': '2nd & short', '3S': '3rd/4th & 1–2', '3M': '3rd & 3–6', '3L': '3rd & 7+' };
const COV_LABEL = { C0: 'Cover 0', C1: 'Cover 1 (man-free)', C2: 'Cover 2', C2M: '2-Man', C3: 'Cover 3', C4: 'Quarters' };
const PRES_LABEL = { FOUR: '4-man rush', BLITZ: 'Blitz', SIM: 'Simulated pressure', THREE: '3-man rush' };
const PKG_LABEL = { BASE: 'Base', NICKEL: 'Nickel', DIME: 'Dime', GL: 'Goal line' };
function tendBar(label, v, hint) { return `<div class="glance knob" title="${esc(hint || '')}"><span class="gl-l">${label}</span><span class="gl-bar"><i style="width:${Math.round(v * 100)}%;background:var(--accent)"></i></span><span class="gl-v small">${Math.round(v * 100)}%</span></div>`; }
// usage & results for keys with a prefix (self-scout)
function scoutTable(id, a, prefix, labels, opts = {}) {
  const keys = Object.keys(a).filter(k => k.startsWith('u_' + prefix)).map(k => k.slice(2 + prefix.length));
  const total = opts.total || keys.reduce((s, k) => s + a['u_' + prefix + k], 0);
  if (!keys.length || !total) return '<div class="muted small">No snaps yet.</div>';
  const rows = keys.map(k => ({ k, n: a['u_' + prefix + k], e: a['e_' + prefix + k] / a['u_' + prefix + k], s: (a['s_' + prefix + k] || 0) / a['u_' + prefix + k] }));
  const def = opts.def;
  return table(id, [
    { k: 'k', l: opts.head || 'Call', v: r => r.n, f: r => esc(labels[r.k] || r.k) },
    { k: 'n', l: 'Snaps', v: r => r.n, num: 1 },
    { k: 'u', l: 'Usage', v: r => r.n, f: r => Math.round(100 * r.n / total) + '%', num: 1 },
    { k: 'e', l: def ? 'EPA allowed' : 'EPA/play', v: r => def ? -r.e : r.e, f: r => `<span class="${(def ? -r.e : r.e) > 0.08 ? 'good' : (def ? -r.e : r.e) < -0.08 ? 'bad' : ''}">${r.e.toFixed(2)}</span>`, num: 1 },
    { k: 's', l: def ? 'Success allowed' : 'Success', v: r => def ? -r.s : r.s, f: r => Math.round(100 * r.s) + '%', num: 1 },
  ], rows, { sort: 'n' });
}
function lineupFor(tid, pers) {
  const g = { tids: [tid, tid], side: [null, null], ps: {}, famPen: [0, 0], down: 1, togo: 10, ydl: 30 };
  initSide(g, 0);
  return offUnit(g, 0, pers, null);
}
function defLineup(tid, pkg) {
  const g = { tids: [tid, tid], side: [null, null], ps: {}, famPen: [0, 0], down: 1, togo: 10, ydl: 30 };
  initSide(g, 0);
  return defUnit(g, 0, defTend(T(tid)).front, pkg, false);
}
function lineupHTML(units) {
  return units.map(e => `<span class="pill" title="${esc(SPOTS[e.spot] ? SPOTS[e.spot].l : e.spot)}"><b>${e.name}</b> ${e.p.a ? esc(pshort(e.p)) : 'Emergency'}${e.pen >= 3 ? ' <span class="warn">·' + comfortLabel(comfortOf(e.p, e.spot)) + '</span>' : ''}</span>`).join(' ');
}
// ---------- formation viewer: where everyone lines up ----------
const FORM_NAMES = [['SG', 'Shotgun'], ['UC', 'Under center'], ['PI', 'Pistol'], ['EMP', 'Empty']];
function alignOffense(units, form) {
  return units.map(e => {
    let x = e.x || 0, d = e.depth || 0;
    if (OL_SLOTS.includes(e.slot)) d = 0;
    else if (e.slot === 'QB') d = form === 'UC' ? 2 : form === 'PI' ? 4 : 5;
    else if (e.slot === 'RB') { if (form === 'SG') { x = 1.1; d = 5; } else if (form === 'EMP') { x = -5.3; d = 1; } else d = 7; }
    else if (e.slot === 'FB') d = 4;
    else if (INLINE.has(e.slot)) d = 0.35;
    else d = e.slot === 'X' ? 0.35 : 1.3; // X on the line, Z and slots off it
    return { e, x, d };
  });
}
function formationSVG(pts, side) {
  const W = 760, H = 320, cx = W / 2, sx = 64;
  const off = side === 'off', los = off ? 46 : 270, sy = off ? 32 : 16;
  let g = `<svg viewBox="0 0 ${W} ${H}" class="field" role="img" aria-label="${off ? 'Offensive' : 'Defensive'} alignment">`;
  // field: yard lines every 5 yards from the line of scrimmage, hashes, LOS
  g += `<rect x="0" y="0" width="${W}" height="${H}" rx="10" class="fld"/>`;
  for (let yd = 5; yd <= 15; yd += 5) { const y = off ? los + yd * sy : los - yd * sy; if (y > 4 && y < H - 4) g += `<line x1="10" x2="${W - 10}" y1="${y}" y2="${y}" class="yl"/><text x="16" y="${y - 4}" class="yt">${yd}</text>`; }
  for (const hx of [cx - 70, cx + 70]) g += `<line x1="${hx}" x2="${hx}" y1="8" y2="${H - 8}" class="hash"/>`;
  g += `<line x1="10" x2="${W - 10}" y1="${los}" y2="${los}" class="los"/><text x="${W - 16}" y="${los - 6}" class="yt" text-anchor="end">line of scrimmage</text>`;
  if (!off) g += `<circle cx="${cx}" cy="${los + 14}" r="5" class="ball"/>`;
  for (const { e, x, d } of pts) {
    const px = clamp(cx + x * sx, 26, W - 26), py = off ? los + d * sy + 2 : los - Math.max(0.4, d) * sy - 2;
    const warn = e.p.a && e.pen >= 3;
    g += `<g ${e.p.a ? `data-action="player" data-pid="${e.p.id}"` : ''} class="dot ${off ? 'o' : 'd'} ${warn ? 'warn' : ''}"><title>${esc(e.p.a ? pname(e.p) + ' — ' + e.p.lbl + (warn ? ' (' + comfortLabel(comfortOf(e.p, e.spot)) + ' at ' + SPOTS[e.spot].l + ')' : '') : 'Emergency')}</title>
      <circle cx="${px}" cy="${py}" r="19"/><text x="${px}" y="${py + 5}" class="sl">${e.name.replace(/[0-9]$/, '')}</text><text x="${px}" y="${py + (off ? 37 : -26)}" class="nm">${esc(e.p.a ? e.p.last : 'Sub')}</text></g>`;
  }
  return g + '</svg>';
}
function formationViewerHTML(tid) {
  const ot = offTend(T(tid)), dt = defTend(T(tid));
  const persUsed = Object.entries(ot.pers || {}).sort((x, y) => y[1] - x[1]).map(x => x[0]).filter(k => PERSONNEL[k]);
  const allPers = [...persUsed, ...Object.keys(PERSONNEL).filter(k => !persUsed.includes(k))];
  const pers = ui.pbPers && PERSONNEL[ui.pbPers] ? ui.pbPers : persUsed[0] || '11';
  const form = ui.pbForm || 'SG', pkg = ui.pbPkg || 'NICKEL';
  const btn = (act, v, cur, l, dim) => `<button class="sm ${v === cur ? 'primary' : ''}" data-action="${act}" data-v="${v}" ${dim ? 'style="opacity:.6"' : ''}>${l}</button>`;
  const offPts = alignOffense(lineupFor(tid, pers), form);
  const defPts = defLineup(tid, pkg).map(e => ({ e, x: e.x || 0, d: e.depth || 0 }));
  return `<div class="grid fv-grid" style="margin-top:16px">
    <div class="card"><h3>Offense · ${esc(PERS_LABEL[pers] || pers)} · ${FORM_NAMES.find(f => f[0] === form)[1]}</h3>
      <div class="row" style="gap:4px;margin-bottom:6px">${allPers.map(k => btn('pbPers', k, pers, k, !persUsed.includes(k))).join('')}</div>
      <div class="row" style="gap:4px;margin-bottom:8px">${FORM_NAMES.map(([k, l]) => btn('pbForm', k, form, l)).join('')}</div>
      ${formationSVG(offPts, 'off')}
      <div class="small muted">Dimmed groupings aren't part of this play caller's usual mix. Orange rings: lined up away from a spot he's comfortable at. Click a player for his card.</div></div>
    <div class="card"><h3>Defense · ${PKG_LABEL[pkg]} · ${esc(dt.front || '')} front</h3>
      <div class="row" style="gap:4px;margin-bottom:8px">${['BASE', 'NICKEL', 'DIME', 'GL'].map(k => btn('pbPkg', k, pkg, PKG_LABEL[k])).join('')}</div>
      ${formationSVG(defPts, 'def')}
      <div class="small muted">Shown from the defense's side: the ball is at the bottom. Edges, tackles and nose line up by the front; corners, nickel and safeties by the package.</div></div></div>`;
}
function playbookHTML() {
  const u = state.userTid, nx = userMatchup();
  const tid = ui.pbTid == null ? u : ui.pbTid, t = T(tid);
  const opts = state.teams.map(x => `<option value="${x.id}" ${x.id === tid ? 'selected' : ''}>${x.region} ${x.name}</option>`).join('');
  const oppId = nx ? (nx.h === u ? nx.a : nx.h) : null;
  let html = `<div class="row" style="margin-bottom:10px"><select data-change="pbTeam">${opts}</select>
    ${oppId !== null ? `<button class="sm" data-action="pbTeamSet" data-tid="${oppId}">Scout next opponent (${T(oppId).abbr})</button>` : ''}${tid !== u ? `<button class="sm" data-action="pbTeamSet" data-tid="${u}">My team</button>` : ''}
    <span class="spacer"></span><span class="small muted">View only: the play callers run their systems. What they call is shown below.</span></div>`;
  const oc = offCaller(t), dc = defCaller(t), ot = offTend(t), dt = defTend(t);
  const src = t.advS && t.advS.plays ? { a: t.advS, lbl: `${state.season} season to date` } : t.advPrev && t.advPrev.plays ? { a: t.advPrev, lbl: `${t.advPrev.season} season` } : null;
  // ---- identity ----
  const persTot = Object.values(ot.pers || {}).reduce((s, v) => s + v, 0) || 1;
  html += `<div class="grid g2"><div class="card"><h3>Offense · ${esc(OFF_ARCH[offArch(t)] ? OFF_ARCH[offArch(t)].l : '—')}</h3><div class="small muted" style="margin-bottom:8px">Play caller: ${coachNameLink(oc)} ${oc ? `(${ROLE_SHORT[oc.role]})` : ''}</div>
    ${tendBar('Pass rate', ot.pass, 'Share of dropbacks on neutral downs')}${tendBar('Zone runs', ot.zone, 'Zone vs gap/power run scheme')}${tendBar('Under center', ot.uc)}${tendBar('Quick game', ot.quick)}${tendBar('Deep shots', ot.deep)}
    ${tendBar('Screens', ot.screen)}${tendBar('Play-action', ot.pa)}${tendBar('Motion', ot.motion)}${tendBar('RPO', ot.rpo)}${tendBar('Bootlegs', ot.boot)}${tendBar('QB runs', ot.qbRun)}${tendBar('Lead back share', ot.rb1, 'How much the No. 1 back carries it')}
    <div class="section-title">Personnel mix</div><div class="row small">${Object.entries(ot.pers || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="pill">${k} · ${Math.round(100 * v / persTot)}%</span>`).join(' ')}</div></div>
    <div class="card"><h3>Defense · ${esc(DEF_ARCH[defArch(t)] ? DEF_ARCH[defArch(t)].l : '—')}</h3><div class="small muted" style="margin-bottom:8px">Play caller: ${coachNameLink(dc)} ${dc ? `(${ROLE_SHORT[dc.role]})` : ''} · ${esc(dt.front || '')} front</div>
    ${tendBar('Man coverage', dt.man)}${tendBar('Two-high shells', dt.high)}${tendBar('Blitz', dt.blitz)}${tendBar('Simulated pressure', dt.sim)}${tendBar('Stunts', dt.stunt)}${tendBar('Base personnel', dt.base, 'vs. nickel/dime')}</div></div>`;
  html += formationViewerHTML(tid);
  // ---- self-scout ----
  if (src) {
    const a = src.a;
    html += `<div class="section-title">Self-scout · ${src.lbl} <span class="small muted">· EPA/play and success rate by call</span></div>
      <div class="grid g2"><div class="card"><h3>By personnel</h3>${scoutTable('pbp', a, 'pers', PERS_LABEL, { head: 'Personnel' })}<h3 style="margin-top:14px">By play type</h3>${scoutTable('pbt', a, 'type', TYPE_LABEL, { head: 'Play type' })}</div>
      <div class="card"><h3>Situational run/pass</h3>${(() => {
        const rows = Object.keys(SIT_LABEL).map(k => { const r = a['u_sit' + k + 'R'] || 0, p = a['u_sit' + k + 'P'] || 0; return { k, r, p, n: r + p, eR: r ? a['e_sit' + k + 'R'] / r : null, eP: p ? a['e_sit' + k + 'P'] / p : null }; }).filter(x => x.n);
        return table('pbs', [{ k: 'k', l: 'Situation', f: x => SIT_LABEL[x.k] }, { k: 'n', l: 'Plays', f: x => x.n, num: 1 }, { k: 'r', l: 'Run%', f: x => Math.round(100 * x.r / x.n) + '%', num: 1 },
          { k: 'er', l: 'Run EPA', f: x => x.eR === null ? '—' : x.eR.toFixed(2), num: 1 }, { k: 'ep', l: 'Pass EPA', f: x => x.eP === null ? '—' : x.eP.toFixed(2), num: 1 }], rows, { nosort: 1 });
      })()}<h3 style="margin-top:14px">Formations & tags</h3>${scoutTable('pbf', a, 'form', FORM_LABEL, { head: 'Formation' })}${scoutTable('pbg', a, 'tag', TAG_LABEL, { head: 'Tag', total: a.plays })}</div></div>
      <div class="grid g2" style="margin-top:16px"><div class="card"><h3>Defense by coverage</h3>${scoutTable('pdc', a, 'cov', COV_LABEL, { head: 'Coverage', def: 1 })}<h3 style="margin-top:14px">By pressure</h3>${scoutTable('pdp', a, 'pres', PRES_LABEL, { head: 'Rush', def: 1 })}</div>
      <div class="card"><h3>Defense by package</h3>${scoutTable('pdk', a, 'pkg', PKG_LABEL, { head: 'Package', def: 1 })}<h3 style="margin-top:14px">vs. Run / Pass</h3>${scoutTable('pdr', a, 'vs', { Run: 'vs. Run', Pass: 'vs. Pass' }, { head: 'Facing', def: 1 })}</div></div>`;
  } else html += `<div class="callout">Self-scout numbers appear once ${T(tid).abbr} has played a game.</div>`;
  // ---- packages: who's on the field ----
  const persUsed = Object.entries(ot.pers || {}).sort((x, y) => y[1] - x[1]).map(x => x[0]).filter(k => PERSONNEL[k]);
  html += `<div class="section-title">Packages · who's on the field <span class="small muted">· from ${tid === u ? 'your depth chart' : 'their depth chart'}${tid === u ? ' (edit on the Depth Chart page)' : ''}</span></div><div class="card">
    ${persUsed.map(k => `<div style="margin:6px 0"><div class="small" style="font-weight:700">${PERS_LABEL[k] || k}</div><div class="row small" style="gap:4px">${lineupHTML(lineupFor(tid, k).filter(e => e.slot !== 'QB' && !OL_SLOTS.includes(e.slot)))}</div></div>`).join('')}
    <div style="margin:6px 0"><div class="small" style="font-weight:700">Offensive line & QB</div><div class="row small" style="gap:4px">${lineupHTML(lineupFor(tid, '11').filter(e => e.slot === 'QB' || OL_SLOTS.includes(e.slot)))}</div></div>
    ${['BASE', 'NICKEL', 'DIME'].map(k => `<div style="margin:6px 0"><div class="small" style="font-weight:700">${PKG_LABEL[k]} defense</div><div class="row small" style="gap:4px">${lineupHTML(defLineup(tid, k))}</div></div>`).join('')}</div>`;
  return html;
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
  RB: { spots: ['RB', 'FB'], min: (a, k) => (a.rush || 0) >= 25 * k, cols: [['YBC/att', a => a.rush ? a.ybc / a.rush : 0, 2], ['YACo/att', a => a.rush ? a.yaco / a.rush : 0, 2], ['MTF/att%', a => a.rush ? 100 * (a.mtf || 0) / a.rush : 0, 0, a => a.mtf || 0], ['Stuff%', a => a.rush ? 100 * (a.stuff || 0) / a.rush : 0, 0], ['EPA/rush', a => a.rush ? (a.epaRush || 0) / a.rush : 0, 2]] },
  OL: { spots: ['LT', 'LG', 'C', 'RG', 'RT'], min: (a, k) => (a.pbSnaps || 0) >= 80 * k, cols: [['PB win%', a => a.pbSnaps ? 100 - 100 * (a.pbLoss || 0) / a.pbSnaps : 0, 1], ['Pressure% allowed', a => a.pbSnaps ? 100 * (a.prsA || 0) / a.pbSnaps : 0, 1, a => a.prsA || 0], ['Sack% allowed', a => a.pbSnaps ? 100 * (a.sackA || 0) / a.pbSnaps : 0, 1, a => a.sackA || 0], ['RB win%', a => a.rbSnaps ? 100 * (a.rbWins || 0) / a.rbSnaps : 0, 1]] },
  DL: { spots: ['NT', 'DT', 'DE', 'EDGE'], min: (a, k) => (a.prSnaps || 0) >= 60 * k, cols: [['PR win%', a => a.prSnaps ? 100 * (a.prWins || 0) / a.prSnaps : 0, 1], ['Double%', a => a.prSnaps ? 100 * (a.dbl || 0) / a.prSnaps : 0, 0], ['RS win%', a => a.rdSnaps ? 100 * (a.rdWins || 0) / a.rdSnaps : 0, 1], ['Stop%', a => a.rdSnaps ? 100 * (a.stops || 0) / a.rdSnaps : 0, 1, a => a.stops || 0]] },
  'LB/DB': { spots: ['MLB', 'WLB', 'CB', 'NCB', 'FS', 'SS'], min: (a, k) => (a.covSnaps || 0) >= 80 * k, cols: [['Targeted%', a => a.covSnaps ? 100 * (a.tgtA || 0) / a.covSnaps : 0, 1, a => a.tgtA || 0], ['Comp%', a => a.tgtA ? 100 * (a.cmpA || 0) / a.tgtA : 0, 0], ['Yds/snap', a => a.covSnaps ? (a.ydsA || 0) / a.covSnaps : 0, 2], ['Rtg allowed', a => ratingAllowed(a) || 0, 1], ['MT%', a => a.tkAtt ? 100 * (a.mt || 0) / a.tkAtt : 0, 0, a => a.mt || 0]] },
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
        <span style="width:64px" class="small">${esc(p.lbl)}</span><span class="grow">${playerLink(p)} ${statusPills(p)}</span><span class="muted small">${p.age}y</span> ${starHTML(starsOf(p))} ${tierPill(p)} <span class="muted small" style="width:90px;text-align:right">${fmtContract(p)}</span></div>`;
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
  } else evalHTML = '<div class="muted">Tick players or picks on either side to build a deal. Click a name to open his card.</div>';
  // everything currently in the deal
  const assetList = (assets, key) => {
    const rows = [...assets.players.map(id => P(id)).filter(Boolean).map(p => `<div class="row small" style="gap:6px;margin:3px 0"><button class="sm" data-action="tradeToggle" data-side="${key}" data-type="players" data-id="${p.id}" title="Remove from the deal">✕</button>${esc(p.lbl)} ${playerLink(p)} ${tierPill(p)} <span class="muted">${p.age}y · ${p.contract.yrs > 0 ? fmtMoney(p.contract.amt) + ' × ' + p.contract.yrs : '—'}</span></div>`),
      ...assets.picks.map(id => state.picks.find(pk => pk.id === id)).filter(Boolean).map(pk => `<div class="row small" style="gap:6px;margin:3px 0"><button class="sm" data-action="tradeToggle" data-side="${key}" data-type="picks" data-id="${pk.id}" title="Remove from the deal">✕</button>${pickLabel(pk)}</div>`)];
    return rows.join('') || '<div class="small muted">Nothing yet.</div>';
  };
  const dealHTML = `<div class="section-title" style="margin-top:0">The deal</div><div class="small" style="font-weight:700">${T(u).abbr} send</div>${assetList(ui.give, 'give')}
    <div class="small" style="font-weight:700;margin-top:8px">${T(o).abbr} send</div>${assetList(ui.get, 'get')}<div style="height:10px"></div>`;
  const opts = state.teams.filter(t => t.id !== u).map(t => `<option value="${t.id}" ${t.id === o ? 'selected' : ''}>${t.region} ${t.name} (${recOf(t.id)})</option>`).join('');
  return `${open ? '' : `<div class="callout">${state.phase === 'REG' ? 'The trade deadline has passed.' : 'Trades are closed during this phase.'}</div>`}
  <div class="grid g3">
    <div class="card"><h3>You Send — ${T(u).abbr}</h3>${side(u, ui.give, 'give')}</div>
    <div class="card"><h3>Trade Partner</h3><select data-change="tradeTeam" style="width:100%;margin-bottom:12px">${opts}</select>
      <div class="kv small" style="margin-bottom:12px"><div>Cap space</div><div>${fmtMoney(capRoom(o))}</div><div>Roster</div><div>${rosterCount(o)}/${rosterLimit()}</div><div>Head coach</div><div>${esc(cname(C(T(o).hc)))}</div></div>
      ${dealHTML}${evalHTML}
      <p class="muted small" style="margin-top:14px">AI teams value young high-potential players, cheap contracts, premium positions (QB, pass rush, WR, CB) and picks from bad teams. They charge extra for their own starters and want a little more than they give.</p></div>
    <div class="card"><h3>You Receive — ${T(o).abbr}</h3>${side(o, ui.get, 'get')}</div>
  </div>`;
}

// ---------- free agents ----------
// next offseason's class: everyone in the last year of his deal with no extension signed
function upcomingFA(p) { return p.tid >= 0 && p.a && (p.expiring || (p.contract.yrs <= 1 && !p.contract.next && !(p.contract.rookie && p.contract.opt5 === 'pending'))); }
function staySignal(p) {
  if (p.tid === state.userTid) return '<span class="muted">Your call</span>';
  const v = viewOvr(p, p.tid), t = tierOf(p);
  if (p.age >= 34 && v < 80) return '<span class="pill">Could retire or walk</span>';
  if (['Elite', 'All-Pro'].includes(t)) return '<span class="pill bad">Tag or extension likely</span>';
  if (t === 'Starter' && p.age <= 30) return '<span class="pill warn">Team wants him back</span>';
  if (t === 'Starter' || t === 'Rotation' || t === 'Backup') return '<span class="pill">Could reach the market</span>';
  return '<span class="pill good">Likely available</span>';
}
function upcomingFAHTML() {
  const u = state.userTid, resign = state.phase === 'RESIGN';
  const ps = Object.values(state.players).filter(upcomingFA).filter(p => inFamily(p, ui.faPos));
  let html = `<div class="callout">${resign ? 'Contracts that just expired. Teams are deciding now: whoever is not re-signed or tagged reaches free agency when you advance.' : `Players in the final year of their deals: the ${state.season + (['REG', 'PLAYOFFS', 'RECAP', 'COACHES'].includes(state.phase) ? 1 : 2)} free agent class as it stands today. Teams will extend, tag or re-sign the best of them before they get there.`}
    Market value is what the league thinks he is worth per year right now.</div><div class="subtabs">${famTabs(ui.faPos, 'faPos')}</div>`;
  html += '<div class="card">' + table('upfa', [
    { k: 'pos', l: 'Pos', v: p => FAM_INDEX[p.spot], f: p => esc(p.lbl) },
    { k: 'n', l: 'Name', v: p => p.last, f: p => playerLink(p) + ' ' + statusPills(p) },
    { k: 'tm', l: 'Team', v: p => T(p.tid).abbr, f: p => teamLink(p.tid) },
    { k: 'age', l: 'Age', v: p => p.age, num: 1 },
    { k: 'ovr', l: 'Tier', v: tierSort, f: p => tierPill(p) + trueNums(p) },
    { k: 'pot', l: 'Upside', v: upSort, f: p => upsidePill(p) },
    { k: 'gr', l: 'Grade', v: p => p.advS ? overallGrade(p.advS, p.spot) || 0 : 0, f: p => gradeChip(p.advS ? overallGrade(p.advS, p.spot) : null), num: 1 },
    { k: 'sk', l: 'Scouting', f: p => `<span class="small muted">${traitsTxt(p)}</span>` },
    { k: 'cur', l: 'Current AAV', v: p => p.contract.amt || p.lastAmt || 0, f: p => p.contract.amt ? fmtMoney(p.contract.amt) : '<span class="muted">—</span>', num: 1 },
    { k: 'mv', l: 'Market value', v: p => marketValue(p), f: p => fmtMoney(marketValue(p)), num: 1 },
    { k: 'lev', l: 'Leverage', v: p => leverageOf(p), f: p => leverageLabel(leverageOf(p)) },
    { k: 'st', l: 'Outlook', f: staySignal },
  ], ps, { sort: 'ovr', limit: 250 }) + '</div>';
  return html;
}
function faHTML() {
  const u = state.userTid;
  const tabs = `<div class="subtabs">${[['now', 'Available now'], ['next', 'Upcoming free agents']].map(([k, l]) => `<button class="${(ui.faView || 'now') === k ? 'on' : ''}" data-action="faView" data-v="${k}">${l}</button>`).join('')}</div>`;
  if (ui.faView === 'next') return tabs + upcomingFAHTML();
  let fas = Object.values(state.players).filter(p => p.tid === -1);
  fas = fas.filter(p => inFamily(p, ui.faPos));
  const canSign = state.phase !== 'PLAYOFFS' && state.phase !== 'RECAP';
  let html = tabs + `<div class="callout">${state.phase === 'FA' ? `Free agency wave ${state.faWave + 1}/${FA_WAVES}. AI teams sign players when you advance. Asking prices drop each wave.` : state.phase === 'REG' ? 'In-season signings are 1-year deals. Players on IR (4+ weeks) don\'t count toward the 53-man limit.' : 'Free agents available now.'}
    Cap space: <b>${fmtMoney(capRoom(u))}</b> · Roster ${rosterCount(u)}/${rosterLimit()}</div>`;
  html += `<div class="subtabs">${famTabs(ui.faPos, 'faPos')}</div>`;
  html += `<div class="card">` + table('fa', [
    { k: 'pos', l: 'Pos', v: p => FAM_INDEX[p.spot], f: p => esc(p.lbl) },
    { k: 'n', l: 'Name', v: p => p.last, f: p => playerLink(p) + ' ' + statusPills(p) },
    { k: 'age', l: 'Age', v: p => p.age, num: 1 },
    { k: 'hw', l: 'Ht/Wt', v: p => p.m.wt, f: p => `<span class="small muted">${htwt(p)}</span>` },
    { k: 'ovr', l: 'Tier', v: tierSort, f: p => tierPill(p) + trueNums(p) },
    { k: 'pot', l: 'Upside', v: upSort, f: p => upsidePill(p) },
    { k: 'sk', l: 'Scouting', f: p => `<span class="small muted">${traitsTxt(p)}</span>` },
    { k: 'yoe', l: 'YOE', v: p => p.exp, num: 1, title: 'Years of experience' },
    { k: 'pt', l: 'Prev team', v: p => p.lastTid != null && p.lastTid >= 0 ? T(p.lastTid).abbr : '', f: p => p.lastTid != null && p.lastTid >= 0 ? teamLink(p.lastTid) : '<span class="muted">—</span>' },
    { k: 'pa', l: 'Prev AAV', v: p => p.lastAmt || 0, f: p => p.lastAmt ? fmtMoney(p.lastAmt) : '<span class="muted">—</span>', num: 1 },
    { k: 'mv', l: 'Market value', v: p => marketValue(p), f: p => fmtMoney(marketValue(p)), num: 1, title: 'What the league thinks he is worth per year (perception, not truth)' },
    { k: 'ask', l: 'Asking', v: p => p.ask, f: p => fmtMoney(p.ask), num: 1 },
    { k: 'y', l: 'Yrs', f: p => state.phase === 'REG' ? 1 : contractYears(p), num: 1 },
    { k: 'a', l: '', f: p => canSign ? `<button class="sm primary" data-action="sign" data-pid="${p.id}" ${p.ask > capRoom(u) ? 'disabled title="Not enough cap space"' : ''}>Sign</button>` : '' },
  ], fas, { sort: 'ovr', limit: 200 }) + '</div>';
  return html;
}

// ---------- cutdown day: the coaches' meeting ----------
function cutdownHTML() {
  const u = state.userTid, plan = state.cut.plan, prev = cutPreview(u);
  const ro = rosterOf(u), on = ro.filter(countsOn53);
  const keeps = on.filter(p => plan[p.id] !== 'cut'), need = keeps.length - ROSTER_MAX;
  const fam = ui.cutFam || 'ALL';
  const coachFor = p => { const t = T(u), side = SPOTS[p.spot].side; return C(side === 'off' ? t.oc : side === 'def' ? t.dc : t.stc) || C(t.hc); };
  let html = `<div class="card" style="margin-bottom:14px"><div class="row"><div><div class="big ${need > 0 ? 'bad' : 'good'}">${keeps.length} / ${ROSTER_MAX}</div><div class="small muted">${need > 0 ? `Cut ${need} more to get to ${ROSTER_MAX}` : need < 0 ? `${-need} open spot${need === -1 ? '' : 's'}: the staff will fill them with camp bodies` : 'Roster is set'} · ${ro.length - on.length} heading to IR (not counted) · dead money so far ${fmtMoney(on.filter(p => plan[p.id] === 'cut').reduce((s, p) => { const d = deadIfCut(p); return s + d.now + d.next; }, 0))}</div></div>
    <span class="spacer"></span><button data-action="cutStaff">Use the staff's recommendations</button><button data-action="cutClear">Clear my cuts</button></div>
    <p class="small muted" style="margin:10px 0 0">Go group by group. Each player has the staff's call and their reasoning; <b>Cut</b> / <b>Keep</b> is yours. Young players you cut can land on your practice squad if they clear. When you're done, press <b>Finalize Roster</b> at the top.</p></div>`;
  // position rooms: how many you're carrying vs. what the staff would carry
  const room = FAMILIES.map(([f, spots]) => { const all = on.filter(p => spots.includes(p.spot)); return { f, n: all.filter(p => plan[p.id] !== 'cut').length, staff: all.filter(p => !prev.cuts.has(p.id)).length, total: all.length }; }).filter(r => r.total);
  html += `<div class="subtabs"><button class="${fam === 'ALL' ? 'on' : ''}" data-action="cutFam" data-pos="ALL">All (${keeps.length})</button>${room.map(r => `<button class="${fam === r.f ? 'on' : ''}" data-action="cutFam" data-pos="${r.f}" title="Staff would carry ${r.staff}">${r.f} ${r.n}${r.n !== r.staff ? `<span class="small" style="opacity:.75"> (staff ${r.staff})</span>` : ''}</button>`).join('')}</div>`;
  const list = ro.filter(p => inFamily(p, fam));
  if (fam !== 'ALL' && list.length) {
    const c = coachFor(list[0]), r = room.find(x => x.f === fam);
    const bub = list.filter(p => prev.bubble.has(p.id) && countsOn53(p));
    const stars = list.filter(p => preGrade(p) !== null).sort((a, b) => preGrade(b) - preGrade(a))[0];
    html += `<div class="callout"><b>${c ? esc(cname(c)) : 'Staff'}:</b> "We'd carry ${r.staff} in this room.${bub.length ? ` The tough call${bub.length > 1 ? 's are' : ' is'} ${bub.slice(0, 3).map(p => esc(p.last)).join(', ')}.` : ' No hard decisions here.'}${stars && preGrade(stars) >= 75 ? ` ${esc(stars.last)} had the best preseason of the group.` : ''}"</div>`;
  }
  const verdict = p => !countsOn53(p) ? ['IR', 'muted'] : prev.cuts.has(p.id) ? [p.exp <= 2 && p.age <= 25 ? 'Cut → PS' : 'Cut', 'bad'] : prev.bubble.has(p.id) ? ['Bubble', 'warn'] : ['Keep', 'good'];
  html += `<div class="card">` + table('cutdown', [
    { k: 'pos', l: 'Pos', v: p => FAM_INDEX[p.spot] * 1000 - uOvr(p), f: p => esc(p.lbl) },
    { k: 'n', l: 'Name', v: p => p.last, f: p => playerLink(p) + ' ' + statusPills(p) },
    { k: 'age', l: 'Age', v: p => p.age, num: 1 },
    { k: 'star', l: '★', v: p => starsOf(p) || 0, f: p => starHTML(starsOf(p)) },
    { k: 'tier', l: 'Tier', v: tierSort, f: p => tierPill(p) + trueNums(p) },
    { k: 'up', l: 'Upside', v: upSort, f: p => upsidePill(p) },
    { k: 'pre', l: 'Preseason', v: p => preGrade(p) || 0, f: p => p.preS ? `${gradeChip(preGrade(p))} <span class="small muted">${p.preS.snp} snaps</span>` : '<span class="muted small">sat</span>', num: 1 },
    { k: 'c', l: 'Contract', v: p => p.contract.amt, f: p => fmtContract(p), num: 1 },
    { k: 'save', l: 'Cut saves', v: p => cutSavings(p), f: p => { const v = cutSavings(p); return `<span class="${v < 0 ? 'bad' : ''}">${fmtMoney(v)}</span>`; }, num: 1 },
    { k: 'staff', l: 'Staff says', v: p => (prev.cuts.has(p.id) ? 0 : prev.bubble.has(p.id) ? 1 : 2), f: p => { const [t, c] = verdict(p); return `<span class="pill ${c}">${t}</span> <span class="small muted wrapcell" style="max-width:340px">${esc(cutNote(p, prev))}</span>`; } },
    { k: 'd', l: 'Your call', f: p => !countsOn53(p) ? '' : plan[p.id] === 'cut' ? `<button class="sm danger" data-action="cutToggle" data-pid="${p.id}">✂ Cut · undo</button>` : `<button class="sm" data-action="cutToggle" data-pid="${p.id}">Keep · cut</button>` },
  ], list, { sort: 'pos', dir: 1, rowClass: p => plan[p.id] === 'cut' ? 'cutrow' : '' }) + '</div>';
  return html;
}

// ---------- player search: find future targets anywhere in the league ----------
const SEARCH_DEF = { q: '', fam: 'ALL', where: 'all', team: '', ageMin: '', ageMax: '', tier: '', up: '', maxCap: '', expiring: false, comfort: '' };
function searchHTML() {
  const f = ui.search || (ui.search = Object.assign({}, SEARCH_DEF)), u = state.userTid;
  const tIdx = t => TIER_ORDER.indexOf(t), uIdx = x => UPSIDE_ORDER.indexOf(x);
  const where = p => p.tid === -1 ? 'fa' : p.tid === -2 ? 'draft' : p.tid === -3 ? 'ps' : p.tid === u ? 'mine' : 'other';
  let ps = Object.values(state.players).filter(p => p.a && p.per);
  if (f.q) { const q = f.q.toLowerCase(); ps = ps.filter(p => pname(p).toLowerCase().includes(q)); }
  if (f.fam !== 'ALL') ps = ps.filter(p => inFamily(p, f.fam));
  if (f.where !== 'all') ps = ps.filter(p => f.where === 'notmine' ? where(p) !== 'mine' : where(p) === f.where);
  if (f.team !== '') ps = ps.filter(p => p.tid === +f.team || (p.tid === -3 && p.psTid === +f.team));
  if (f.ageMin !== '') ps = ps.filter(p => p.age >= +f.ageMin);
  if (f.ageMax !== '') ps = ps.filter(p => p.age <= +f.ageMax);
  if (f.tier) ps = ps.filter(p => tIdx(tierOf(p)) <= tIdx(f.tier) || (f.tier === 'Rotation' && tierOf(p) === 'Backup'));
  if (f.up) ps = ps.filter(p => uIdx(upsideOf(p)) <= uIdx(f.up));
  if (f.maxCap !== '') ps = ps.filter(p => (p.tid === -1 ? p.ask : p.contract.yrs > 0 ? p.contract.amt : 0) <= +f.maxCap);
  if (f.expiring) ps = ps.filter(p => p.tid >= 0 && (p.contract.yrs <= 1 && !p.contract.next));
  if (f.comfort) ps = ps.filter(p => comfortOf(p, f.comfort) >= 60);
  const sel = (k, opts) => `<select data-change="srch" data-f="${k}">${opts.map(([v, l]) => `<option value="${v}" ${String(f[k]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const num = (k, ph) => `<input type="number" data-change="srch" data-f="${k}" value="${f[k]}" placeholder="${ph}" style="width:74px">`;
  let html = `<div class="card" style="margin-bottom:14px"><div class="row" style="gap:10px 14px">
    <input type="text" data-change="srch" data-f="q" value="${esc(f.q)}" placeholder="Name…" style="width:160px">
    ${sel('where', [['all', 'Everyone'], ['notmine', 'Not on my team'], ['other', 'Other teams'], ['fa', 'Free agents'], ['ps', 'Practice squads'], ['draft', 'Draft prospects'], ['mine', 'My team']])}
    ${sel('team', [['', 'Any team'], ...state.teams.map(t => [t.id, t.abbr])])}
    <label class="small muted">Age</label>${num('ageMin', 'min')}<span class="muted">–</span>${num('ageMax', 'max')}
    <label class="small muted">Tier ≥</label>${sel('tier', [['', 'Any'], ...['Elite', 'All-Pro', 'Starter', 'Rotation', 'Depth'].map(t => [t, t === 'Rotation' ? 'Rotation / Backup' : t])])}
    <label class="small muted">Upside ≥</label>${sel('up', [['', 'Any'], ...UPSIDE_ORDER.slice(0, 6).map(t => [t, t])])}
    <label class="small muted">Cap hit ≤ $M</label>${num('maxCap', 'any')}
    <label class="small muted">Comfortable at</label>${sel('comfort', [['', 'Any spot'], ...SPOT_KEYS.map(k => [k, SPOTS[k].l])])}
    <label class="small"><input type="checkbox" data-change="srchChk" data-f="expiring" ${f.expiring ? 'checked' : ''}> Contract year</label>
    <button class="sm" data-action="srchReset">Reset</button></div>
    <div class="subtabs" style="margin:10px 0 0">${famTabs(f.fam, 'srchFam')}</div></div>`;
  const loc = p => p.tid >= 0 ? teamLink(p.tid) : p.tid === -1 ? '<span class="muted">FA</span>' : p.tid === -3 ? `<span class="muted">PS</span> ${teamLink(p.psTid)}` : `<span class="muted">${p.draftYear} draft</span>`;
  html += `<div class="card"><div class="small muted" style="margin-bottom:6px">${ps.length} player${ps.length === 1 ? '' : 's'} match${ps.length > 250 ? ' (showing the top 250 by the current sort)' : ''}. Click a column to sort, a name for his card.</div>` + table('search', [
    { k: 'pos', l: 'Pos', v: p => FAM_INDEX[p.spot], f: p => esc(p.lbl) },
    { k: 'n', l: 'Name', v: p => p.last, f: p => playerLink(p) + ' ' + statusPills(p) },
    { k: 'tm', l: 'Team', v: p => p.tid >= 0 ? T(p.tid).abbr : p.tid === -1 ? 'zFA' : 'zz', f: loc },
    { k: 'age', l: 'Age', v: p => p.age, num: 1 },
    { k: 'yoe', l: 'YOE', v: p => p.exp, num: 1 },
    { k: 'star', l: '★', v: p => starsOf(p) || 0, f: p => p.tid === -2 ? '' : starHTML(starsOf(p)) },
    { k: 'tier', l: 'Tier', v: tierSort, f: p => tierPill(p) + trueNums(p) },
    { k: 'up', l: 'Upside', v: upSort, f: p => upsidePill(p) },
    { k: 'sk', l: 'Profile', f: p => `<span class="small muted wrapcell">${traitsTxt(p)}</span>` },
    { k: 'gr', l: 'Grade', v: p => p.advS ? overallGrade(p.advS, p.spot) || 0 : 0, f: p => gradeChip(p.advS ? overallGrade(p.advS, p.spot) : null), num: 1 },
    { k: 'ras', l: 'RAS', v: p => rasOf(p) || 0, f: p => rasHTML(p), num: 1 },
    { k: 'c', l: 'Contract', v: p => p.tid === -1 ? p.ask : p.contract.yrs > 0 ? p.contract.amt : 0, f: p => p.tid === -1 ? `asks ${fmtMoney(p.ask)}` : p.tid === -2 ? '—' : fmtContract(p), num: 1 },
  ], ps, { sort: 'tier', limit: 250 }) + '</div>';
  return html;
}

// ---------- draft ----------
function draftHTML() {
  const u = state.userTid;
  const my = state.picks.filter(pk => pk.owner === u).sort((a, b) => a.season - b.season || a.round - b.round);
  let html = '';
  if (!prospects().length) {
    html += `<div class="callout">Next year's draft class arrives on the board when the season starts.</div>`;
    return html + `<div class="card"><h3>Your Picks</h3>${my.map(pk => `<div>${pickLabel(pk)}</div>`).join('') || '<div class="muted">None.</div>'}</div>`;
  }
  const d = state.draft, pk = currentPick();
  const onClock = state.phase === 'DRAFT' && pk && pk.owner === u;
  let pros = prospects();
  pros = pros.filter(p => inFamily(p, ui.draftPos));
  const grade = p => uOvr(p) + 0.55 * p.per.g + ({ QB: 3, RB: -2, K: -10, P: -12 }[p.pos] || 0); // consensus big board
  const ranked = prospects().sort((a, b) => grade(b) - grade(a));
  const rankOf = new Map(ranked.map((p, i) => [p.id, i + 1]));
  html += `<div class="callout">${['REG', 'PLAYOFFS', 'RECAP'].includes(state.phase) ? `<b>${prospects()[0].draftYear} draft class.</b> Reports sharpen as the college season goes on, but stay foggy until these players are in the league. ` : ''}${state.phase !== 'DRAFT' ? `Draft preview — the draft happens after free agency. Everything here is your scouts' read: prospects are the foggiest players in football, and workout numbers get overhyped.` : onClock ? `<b>You're on the clock</b> with pick #${pk.pick} (Round ${pk.round}). Choose a player below.` : pk ? `Pick #${pk.pick}: ${T(pk.owner).abbr} on the clock.` : ''}</div>`;
  html += `<div class="grid" style="grid-template-columns:minmax(0,3fr) minmax(260px,1fr)"><div class="card"><h3>Prospects</h3>
    <div class="subtabs">${famTabs(ui.draftPos, 'draftPos')}</div>` + table('draft', [
    { k: 'rk', l: 'Rank', v: p => rankOf.get(p.id), num: 1 },
    { k: 'pos', l: 'Pos', v: p => FAM_INDEX[p.spot], f: p => esc(p.lbl) },
    { k: 'n', l: 'Name', v: p => p.last, f: p => playerLink(p) },
    { k: 'col', l: 'College', v: p => p.college, f: p => `<span class="muted">${esc(p.college)}</span>` },
    { k: 'age', l: 'Age', v: p => p.age, num: 1 },
    { k: 'hw', l: 'Ht/Wt', v: p => p.m.wt, f: p => `<span class="small muted">${htwt(p)}</span>` },
    { k: 'forty', l: '40', v: p => -p.m.forty, f: p => p.m.forty.toFixed(2), num: 1 },
    { k: 'ras', l: 'RAS', v: p => rasOf(p) || 0, f: p => rasHTML(p), num: 1, title: 'Relative Athletic Score (0–10) vs. his position' },
    { k: 'ovr', l: 'Now', v: tierSort, f: p => tierPill(p) + trueNums(p), title: 'Ready to contribute as…' },
    { k: 'pot', l: 'Upside', v: upSort, f: p => upsidePill(p) },
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
// ---------- staff ----------
const GAMEDAY_KNOBS = new Set(['gm', 'cul', 'pc', 'adp', 'runD', 'passD', 'dcp', 'frontD', 'covD', 'presD', 'units']);
function knobRow(c, k) {
  const v = c.k[k];
  return `<div class="glance knob" title="${KNOB_LABEL[k]}"><span class="gl-l">${KNOB_LABEL[k]}</span><span class="gl-bar"><i style="width:${v}%;background:${gradeColor(v)}"></i></span><span class="gl-v small">${coachTier(v)}${trueOn() ? ' ' + v : ''}</span></div>`;
}
function coachStrengths(c) { return KNOBS[c.role].slice().sort((a, b) => c.k[b] - c.k[a]).slice(0, 2).map(k => KNOB_LABEL[k]).join(', '); }
function coachesHTML() {
  const tid = ui.staffTid == null ? state.userTid : ui.staffTid, t = T(tid), mine = tid === state.userTid, canHire = state.phase === 'COACHES' && mine;
  const opts = state.teams.map(x => `<option value="${x.id}" ${x.id === tid ? 'selected' : ''}>${x.region} ${x.name}</option>`).join('');
  let html = `<div class="row" style="margin-bottom:10px"><select data-change="staffTeam">${opts}</select><span class="spacer"></span>
    <span class="small muted">${state.phase === 'COACHES' ? 'Coaching carousel is open: fire a coach to open the spot, then hire from the pool below.' : 'Coaching changes happen during the Coaching Carousel phase of the offseason.'}</span></div>`;
  const rows = COACH_ROLES.map(role => ({ role, c: C(t[role.toLowerCase()]) }));
  html += `<div class="card">` + table('staff', [
    { k: 'r', l: 'Role', v: r => COACH_ROLES.indexOf(r.role), f: r => `<b>${ROLE_SHORT[r.role]}</b> <span class="small muted">${ROLE_LABEL[r.role]}</span>` },
    { k: 'n', l: 'Coach', v: r => r.c ? r.c.last : '', f: r => coachNameLink(r.c) },
    { k: 'o', l: 'Overall', v: r => r.c ? r.c.ovr : 0, f: r => r.c ? tierChip(r.c.ovr) : '' },
    { k: 'a', l: 'Age', v: r => r.c ? r.c.age : 0, f: r => r.c ? r.c.age : '', num: 1 },
    { k: 's', l: 'System', v: r => schemeLabel(r.c), f: r => r.c ? `<span class="small">${esc(schemeLabel(r.c) || '—')}${r.role === 'HC' && r.c.t.caller ? ` · calls ${r.c.t.caller === 'O' ? 'offense' : 'defense'}` : ''}</span>` : '' },
    { k: 'b', l: 'Best at', f: r => r.c ? `<span class="small muted">${coachStrengths(r.c)}</span>` : '' },
    { k: 'l', l: 'Last season', f: r => r.c ? `<span class="small">${lastUnitLine(r.c) || '—'}</span>` : '' },
    { k: 'x', l: '', f: r => canHire && r.c ? `<button class="sm danger" data-action="fireCoach" data-role="${r.role}">Fire</button>` : '' },
  ], rows, { sort: 'r', dir: 1 }) + `<div class="muted small" style="margin-top:6px">Click a coach for his card: game-day knobs on one side, development on the other.</div></div>`;
  if (state.phase === 'COACHES') {
    const role = ui.coachRole || 'HC';
    const pool = Object.values(state.coaches).filter(c => c.tid < 0 && c.role === role);
    html += `<div class="card" style="margin-top:16px"><h3>Available Coaches</h3><div class="subtabs">${COACH_ROLES.map(r => `<button class="${r === role ? 'on' : ''}" data-action="coachRole" data-role="${r}">${ROLE_SHORT[r]}</button>`).join('')}</div>` + table('pool' + role, [
      { k: 'n', l: 'Name', v: c => c.last, f: c => coachNameLink(c) }, { k: 'o', l: 'Overall', v: c => c.ovr, f: c => tierChip(c.ovr) }, { k: 'a', l: 'Age', v: c => c.age, num: 1 },
      { k: 's', l: 'Scheme', v: c => schemeLabel(c), f: c => `<span class="small">${esc(schemeLabel(c))}${c.role === 'HC' && c.t.caller ? ` · calls ${c.t.caller === 'O' ? 'offense' : 'defense'}` : ''}</span>` },
      { k: 'st', l: 'Best at', f: c => `<span class="small muted">${coachStrengths(c)}</span>` },
      { k: 'h', l: '', f: c => `<button class="sm primary" data-action="hireCoach" data-cid="${c.id}" ${T(state.userTid)[role.toLowerCase()] ? 'disabled title="Fire your current coach first"' : ''}>Hire</button>` },
    ], pool, { sort: 'o' }) + '</div>';
  }
  const all = state.teams.map(tm => ({ tm, s: COACH_ROLES.map(r => C(tm[r.toLowerCase()])) }));
  const cell = c => c ? `${coachNameLink(c)} ${tierChip(c.ovr)}` : '<span class="bad">Vacant</span>';
  html += `<div class="card" style="margin-top:16px"><h3>League Staffs</h3>` + table('allcoach', [
    { k: 't', l: 'Team', v: r => r.tm.abbr, f: r => teamLink(r.tm.id) },
    ...COACH_ROLES.map((role, i) => ({ k: role, l: ROLE_SHORT[role], v: r => r.s[i] ? r.s[i].ovr : 0, f: r => cell(r.s[i]) })),
  ], all, { rowClass: r => r.tm.id === state.userTid ? 'me' : '' }) + '</div>';
  return html;
}
function coachModal(cid) {
  const c = C(cid);
  if (!c) return;
  const t = c.tid >= 0 ? T(c.tid) : null;
  const callsFor = (c.role === 'OC' || c.role === 'DC') && t && C(t.hc) && C(t.hc).t.caller === (c.role === 'OC' ? 'O' : 'D');
  let html = `<div class="row"><h2 style="margin:0">${esc(cname(c))}</h2><span class="pill">${ROLE_LABEL[c.role]}</span> ${tierChip(c.ovr)}</div>
    <div class="muted" style="margin:4px 0 12px">${c.tid >= 0 ? teamLink(c.tid, true) : 'Available'} · Age ${c.age}${schemeLabel(c) ? ' · ' + esc(schemeLabel(c)) : ''}${c.role === 'HC' ? ` · Career ${c.rec.w}-${c.rec.l}${c.rec.titles ? `, ${c.rec.titles} title${c.rec.titles > 1 ? 's' : ''}` : ''}` : ''}</div>`;
  if (callsFor) html += `<div class="callout small">The head coach calls the ${c.role === 'OC' ? 'offense' : 'defense'}: this coordinator contributes design and development.</div>`;
  const gd = KNOBS[c.role].filter(k => GAMEDAY_KNOBS.has(k)), dv = KNOBS[c.role].filter(k => !GAMEDAY_KNOBS.has(k));
  let left = `<div class="section-title" style="margin-top:0">Game Day</div>`;
  left += gd.length ? gd.map(k => knobRow(c, k)).join('') : '<div class="muted small">No game-day duties.</div>';
  const tend = tendencySummary(c);
  if (tend) left += `<div class="section-title">Tendencies</div><div class="small">${tend}</div>`;
  const lu = lastUnitLine(c);
  if (lu) left += `<div class="small muted" style="margin-top:6px">${lu}</div>`;
  let right = `<div class="section-title" style="margin-top:0">Development</div>`;
  right += dv.length ? dv.map(k => knobRow(c, k)).join('') : '<div class="muted small">No position development duties (his staff handles it).</div>';
  if (c.dev && c.dev.length) right += `<div class="section-title">Player Development</div>` + table('cdev', [
    { k: 's', l: 'Offseason', f: d => d.s }, { k: 't', l: 'Team', f: d => T(d.tid).abbr }, { k: 'n', l: 'Young players', f: d => d.n, num: 1 },
    { k: 'a', l: 'Avg change', f: d => `<span class="${d.avg >= 2.5 ? 'good' : d.avg < 1 ? 'bad' : ''}">${d.avg > 0 ? '+' : ''}${d.avg}</span>`, num: 1 },
    { k: 'j', l: 'Big jumps (+5)', f: d => d.jumps, num: 1 },
  ], c.dev.slice().reverse(), { nosort: 1 }) + `<div class="small muted">Players 26 and under on his side of the ball (whole roster for HC and S&amp;C).</div>`;
  else right += `<div class="small muted" style="margin-top:8px">Development results appear after his first offseason on the job.</div>`;
  const mentors = c.mentors.map(id => C(id)).filter(Boolean);
  if (mentors.length) right += `<div class="section-title">Coaching Tree</div><div class="small">Worked under: ${mentors.map(m => coachNameLink(m)).join(', ')}</div>`;
  html += `<div class="grid card-cols"><div>${left}</div><div>${right}</div></div>`;
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
    <label class="row" style="margin-top:12px"><b>Theme</b> <select data-change="theme"><option value="light" ${state.settings.theme !== 'dark' ? 'selected' : ''}>Light</option><option value="dark" ${state.settings.theme === 'dark' ? 'selected' : ''}>Dark</option></select></label>
    <label class="row" style="margin-top:12px"><input type="checkbox" data-change="gamePopups" ${state.settings.gamePopups !== false ? 'checked' : ''}> <b>Game-day popups</b></label>
    <p class="muted small">A preview before each of your games and a wrap-up (box score, best and worst performers, breakouts, reaction) after.</p>
    <label class="row" style="margin-top:12px"><input type="checkbox" data-change="showTrue" ${state.settings.showTrue ? 'checked' : ''}> <b>Show true ratings (debug)</b></label>
    <p class="muted small">Reveals the hidden numbers behind every label: true OVR/POT and every attribute. Off by default — the game is meant to be played through your scouts' eyes.</p></div>
    <div class="card"><h3>Save Data</h3><p class="muted small">The league autosaves in this browser after every action. Export a copy to back it up or move it to another computer.</p>
    <div class="row"><button data-action="export">Export Save</button><button data-action="importClick">Import Save…</button><button class="danger" data-action="newGame">New League…</button></div></div></div>`;
}

// ---------- modals ----------
// popups stack: opening a player card from the game recap (or another card) keeps what was underneath, with a Back button
let modalStack = [];
function openModal(html, replace) {
  const m = $('#modal'), body = $('#modal-body');
  if (!m.classList.contains('hidden') && body.dataset.raw && !replace) modalStack.push({ html: body.dataset.raw, y: m.scrollTop });
  body.dataset.raw = html;
  body.innerHTML = (modalStack.length ? '<button class="sm" data-action="closeModal" style="margin-bottom:10px">← Back</button>' : '') + html;
  m.classList.remove('hidden'); m.scrollTop = 0;
}
function closeModal(all) {
  const m = $('#modal'), body = $('#modal-body');
  if (!all && modalStack.length) {
    const prev = modalStack.pop();
    body.dataset.raw = prev.html;
    body.innerHTML = (modalStack.length ? '<button class="sm" data-action="closeModal" style="margin-bottom:10px">← Back</button>' : '') + prev.html;
    m.scrollTop = prev.y; return;
  }
  modalStack = []; body.dataset.raw = ''; m.classList.add('hidden');
}

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

// ---------- player card: an at-a-glance read ----------
// red (bottom) → grey (middle) → green (top); dir -1 means lower is better, 0 means no judgment
function pctStyle(pct, dir) {
  if (pct === null || pct === undefined || !dir) return '';
  const q = dir > 0 ? pct : 1 - pct, hue = Math.round(q * 130), dark = state && state.settings.theme === 'dark';
  const alpha = ((0.12 + Math.abs(q - 0.5) * 0.9) * (dark ? 1 : 0.55)).toFixed(2);
  return dark ? `background:hsla(${hue},65%,38%,${alpha});border-color:hsla(${hue},70%,45%,.6)` : `background:hsla(${hue},70%,48%,${alpha});border-color:hsla(${hue},60%,42%,.55)`;
}
function gradeColor(v) { return v >= 85 ? 'var(--elite)' : v >= 72 ? 'var(--good)' : v >= 60 ? 'var(--mid)' : v >= 50 ? 'var(--warn)' : 'var(--bad)'; }
const GLANCE = {
  QB: [['q', 'Passing'], ['q_cln'], ['q_prs'], ['q_sh'], ['q_md'], ['q_dp'], ['q_pa'], ['q_blz']],
  RB: [['run', 'Rushing'], ['run_zn'], ['run_gp'], ['rec', 'Receiving'], ['pb', 'Pass protection']],
  WR: [['rec', 'Receiving'], ['rec_man'], ['rec_zon'], ['rec_press'], ['rec_ctd'], ['rb', 'Run blocking']],
  TE: [['rec', 'Receiving'], ['rec_man'], ['rec_zon'], ['rb', 'Run blocking'], ['rb_zn'], ['rb_gp'], ['pb', 'Pass protection']],
  OL: [['pb', 'Pass blocking'], ['pb_std'], ['pb_blz'], ['rb', 'Run blocking'], ['rb_zn'], ['rb_gp']],
  DL: [['pr', 'Pass rush'], ['pr_sgl'], ['pr_dbl'], ['rd', 'Run defense'], ['tk', 'Tackling']],
  LB: [['rd', 'Run defense'], ['cov', 'Coverage'], ['cov_man'], ['cov_zon'], ['pr', 'Pass rush'], ['tk', 'Tackling']],
  CB: [['cov', 'Coverage'], ['cov_man'], ['cov_zon'], ['rd', 'Run defense'], ['tk', 'Tackling']],
  S: [['cov', 'Coverage'], ['cov_man'], ['cov_zon'], ['rd', 'Run defense'], ['tk', 'Tackling']],
};
function cardAdv(p) { // the season the card reads from
  if (p.advS && Object.keys(p.advS).length > 1) return { a: p.advS, season: state.season, cur: true };
  if (p.advPrev) return { a: p.advPrev, season: p.advPrev.season, cur: false };
  return null;
}
function glanceHTML(p, src) {
  const rows = GLANCE[p.pos];
  if (!rows || !src) return `<div class="muted small">No snaps on tape yet.</div>`;
  const a = src.a;
  let h = '';
  for (const [k, l] of rows) {
    const sub = k.includes('_'), v = facetGrade(a, k, sub ? 15 : 8);
    if (v === null && sub) continue;
    const n = a['n' + k] || 0;
    h += `<div class="glance ${sub ? 'sub' : ''}" title="${n} graded snaps"><span class="gl-l">${esc(l || SPLIT_LABELS[k] || k)}</span>
      <span class="gl-bar"><i style="width:${v === null ? 0 : v}%;background:${v === null ? 'transparent' : gradeColor(v)}"></i></span><span class="gl-v">${v === null ? '—' : v}</span></div>`;
  }
  return h || `<div class="muted small">Not enough snaps on tape yet.</div>`;
}
const ADV_DIR = { 'EPA/db': 1, CPOE: 1, TTT: 0, aDOT: 0, 'Pressured%': -1, Routes: 0, 'Sep (yds)': 1, 'Tgt/Route%': 1, 'EPA/Tgt': 1, 'YBC/att': 1, 'YACo/att': 1, 'MTF/att%': 1, 'Stuff%': -1, 'EPA/rush': 1,
  'PB win%': 1, 'Pressure% allowed': -1, 'Sack% allowed': -1, 'RB win%': 1, 'PR win%': 1, 'Double%': 1, 'RS win%': 1, 'Stop%': 1, 'Targeted%': 0, 'Comp%': -1, 'Yds/snap': -1, 'Rtg allowed': -1, 'MT%': -1 };
// season metrics with league rank among qualified players at his position group
function advRankHTML(p, src) {
  if (!src) return '';
  const gk = Object.keys(ADV_GROUPS).find(k => ADV_GROUPS[k].spots.includes(p.spot));
  if (!gk) return '';
  const G = ADV_GROUPS[gk], qualK = src.cur ? clamp((state.week - 1) / 17, 1 / 17, 1) : 1;
  const pool = [];
  for (const id in state.players) { const q = state.players[id], a = src.cur ? q.advS : q.advPrev && q.advPrev.season === src.season ? q.advPrev : null; if (a && q.pos === p.pos && G.spots.includes(q.spot) && G.min(a, qualK)) pool.push(a); }
  const mine = src.a, qual = G.min(mine, qualK);
  const tiles = G.cols.map(([label, fn, dec, tot]) => {
    const v = fn(mine), dir = ADV_DIR[label] === undefined ? 1 : ADV_DIR[label];
    const vals = pool.map(fn).sort((x, y) => dir < 0 ? x - y : y - x);
    let rank = vals.findIndex(x => dir < 0 ? v <= x : v >= x) + 1; if (!rank) rank = vals.length + 1;
    const n = vals.length + (qual ? 0 : 1), pct = n > 1 ? 1 - (rank - 1) / (n - 1) : 0.5;
    return `<div class="tile" style="${pctStyle(dir < 0 ? 1 - pct : pct, dir)}"><div class="v" style="font-size:15px">${v.toFixed(dec)}${tot ? ` <span class="small muted" title="season total">(${tot(mine)})</span>` : ''}</div><div class="l">${label}</div><div class="rk">${qual ? `${rank}/${n}` : 'below min.'}</div></div>`;
  }).join('');
  return `<div class="stat-tiles">${tiles}</div>`;
}
const COMBINE = [['ht', 'Height', m => fmtHeight(m.ht), 1], ['wt', 'Weight', m => m.wt, 1], ['arm', 'Arm', m => m.arm.toFixed(2) + '"', 1], ['forty', '40-yd', m => m.forty.toFixed(2), -1],
  ['ten', '10-yd', m => m.ten.toFixed(2), -1], ['vert', 'Vertical', m => m.vert + '"', 1], ['broad', 'Broad', m => `${Math.floor(m.broad / 12)}'${m.broad % 12}"`, 1],
  ['cone', '3-cone', m => m.cone.toFixed(2), -1], ['shut', 'Shuttle', m => m.shut.toFixed(2), -1], ['bench', 'Bench', m => m.bench, 1]];
function rasColor(r) { return r >= 9 ? '#1f8a4c' : r >= 8 ? '#2fa35f' : r >= 6.5 ? '#7cae3a' : r >= 5 ? '#c9a227' : r >= 3 ? '#d9822b' : '#c94a3a'; }
function rasHTML(p, peers) {
  const r = rasOf(p, peers);
  if (r === null) return '';
  return `<span class="ras" style="background:${rasColor(r)}" title="Relative Athletic Score: combine results as 0–10 percentiles against every ${p.pos} in the league, averaged">RAS ${r.toFixed(2)}</span>`;
}
// grades by game (PFF-style bars)
function gameLogHTML(p) {
  const src = p.glog && p.glog.length ? { season: state.season, log: p.glog } : p.glogPrev;
  if (!src || !src.log.length) return '';
  return `<div class="section-title">Grades by Game · ${src.season}</div>` + src.log.slice(-17).map(x => `<div class="glance gl-game" title="${x.s} snaps"><span class="gl-l small">${esc(x.w)} ${x.h ? 'vs' : '@'} ${T(x.o).abbr}</span><span class="gl-bar"><i style="width:${x.g}%;background:${gradeColor(x.g)}"></i></span><span class="gl-v">${Math.round(x.g)}</span></div>`).join('');
}
// combine numbers shaded by percentile against everyone at his position group
function combineHTML(p) {
  const peers = Object.values(state.players).filter(q => q.m && q.pos === p.pos);
  ensureJumps(p); peers.forEach(ensureJumps);
  return `<div class="stat-tiles">${COMBINE.map(([k, l, f, dir]) => {
    let style = '', title = '';
    if (dir) { const vals = peers.map(q => q.m[k]).sort((x, y) => x - y), below = vals.filter(x => x < p.m[k]).length, pct = vals.length > 1 ? below / (vals.length - 1) : 0.5; style = pctStyle(pct, dir); title = `${Math.round(100 * (dir > 0 ? pct : 1 - pct))}th percentile among ${p.pos}s`; }
    return `<div class="tile" style="${style}" title="${title}"><div class="v" style="font-size:15px">${f(p.m)}</div><div class="l">${l}</div></div>`;
  }).join('')}</div>`;
}
function strengthsHTML(p) {
  const { str, weak, best } = scoutTraits(p);
  return `<div class="grid g2" style="gap:10px"><div><div class="sw-h good">Strengths</div>${str.map(t => `<div class="sw good">+ ${esc(t)}</div>`).join('')}${str.length < 2 ? best.map(t => `<div class="sw" title="Relative to the rest of his game, not to a starter">◦ ${esc(t)}</div>`).join('') : ''}${!str.length && !best.length ? '<div class="muted small">Nothing that stands out.</div>' : ''}</div>
    <div><div class="sw-h bad">Weaknesses</div>${weak.length ? weak.map(t => `<div class="sw bad">− ${esc(t)}</div>`).join('') : '<div class="muted small">No glaring holes.</div>'}</div></div>`;
}
function comfortHTML(p) {
  const cf = Object.entries(p.cf || {}).sort((a, b) => b[1] - a[1]);
  return cf.map(([s, c]) => `<span class="pill ${CF_CLS[comfortLabel(c)]}" title="${trueOn() ? Math.round(c) : ''}">${SPOTS[s].l} · ${comfortLabel(c)}</span>`).join(' ') +
    ` <span class="small muted">· learns new spots ${learnRate(p) >= 1.15 ? 'quickly' : learnRate(p) <= 0.8 ? 'slowly' : 'at an average pace'}</span>`;
}
function playerModal(pid, replace) {
  const p = P(pid);
  if (!p) return;
  const u = state.userTid, prospect = p.tid === -2, src = cardAdv(p);
  const team = p.tid >= 0 ? teamLink(p.tid, true) : p.tid === -3 ? `Practice squad · ${teamLink(p.psTid, true)}` : p.tid === -1 ? '<span class="muted">Free Agent</span>' : '<span class="muted">Draft Prospect</span>';
  const tierT = tierOf(p), upT = upsideOf(p), stars = starsOf(p);
  const sg = src ? overallGrade(src.a, p.spot) : null, form = (p.form || []).slice(-5);
  let html = `<div class="row"><h2 style="margin:0">${esc(pname(p))}</h2><span class="pill">${esc(p.lbl)}</span> ${statusPills(p)} ${stars !== null && !prospect ? starHTML(stars) : ''} ${rasHTML(p)}</div>
    <div class="muted" style="margin:4px 0 12px">${team} · Age ${p.age} · ${esc(p.college)} · ${p.draft ? `Drafted ${p.draft.year} Rd ${p.draft.round} (#${p.draft.pick}) by ${T(p.draft.tid).abbr}` : prospect ? `${p.draftYear} draft prospect` : 'Undrafted'} · ${p.exp} yr${p.exp === 1 ? '' : 's'} exp</div>
    <div class="stat-tiles" style="margin-bottom:12px">
      <div class="tile"><div class="v ${TIER_CLS[tierT]}" style="font-size:16px">${tierT}</div><div class="l">${prospect ? 'Ready now as' : 'Tier'}${trueOn() ? ` · true ${p.ovr}` : ''}</div></div>
      <div class="tile"><div class="v ${UP_CLS[upT]}" style="font-size:14px">${upT}</div><div class="l">Upside${trueOn() ? ` · true ${p.pot}` : ''}</div></div>
      ${prospect ? '' : `<div class="tile"><div class="v" style="font-size:15px">${p.tid === -1 ? fmtMoney(p.ask) : fmtContract(p)}</div><div class="l">${p.tid === -1 ? 'Asking / yr' : 'Contract'}</div></div>
      <div class="tile"><div class="v">${gradeChip(sg)}</div><div class="l">${src ? `${src.season} grade${src.cur ? '' : ' (last season)'}` : 'Season grade'}</div>${src ? `<div class="rk">${gradeRankTxt(src.cur ? gradeRanks()[p.id] : seasonRank(p, p.career.find(r => r.season === src.season) || {})) || (sg !== null ? 'below min. snaps' : '')}</div>` : ''}</div>
      <div class="tile"><div class="v" style="font-size:14px">${form.length ? form.map(g => gradeChip(Math.round(g))).join(' ') : '—'}</div><div class="l">Recent games</div></div>`}
    </div>`;
  if (p.injury) html += `<div class="callout"><b class="bad">Injured:</b> ${esc(p.injury.name)} — out ${p.injury.weeks} more week${p.injury.weeks > 1 ? 's' : ''}${onIR(p) ? ' (IR)' : ''}.</div>`;
  // ---- left: the scouting read, comfort, fit, contract ----
  let left = scoutingHTML(p).replace(/<div class="row small" style="margin-top:6px">[\s\S]*?<\/div>/, '');
  left += `<div class="section-title">Strengths &amp; Weaknesses</div>` + strengthsHTML(p);
  if (!prospect) {
    left += `<div class="section-title">Positional Comfort</div><div class="row small">${comfortHTML(p)}</div>`;
    const fitTeams = [...new Set([p.tid >= 0 ? p.tid : null, u].filter(t => t !== null && t >= 0))];
    if (SPOTS[p.spot].side === 'off' || SPOTS[p.spot].side === 'def') left += `<div class="section-title">Scheme Fit</div><div class="row small">${fitTeams.map(t => { const f = schemeFit(p, t), sk = SPOTS[p.spot].side === 'off' ? offArch(T(t)) : defArch(T(t)), lab = sk ? (SPOTS[p.spot].side === 'off' ? OFF_ARCH : DEF_ARCH)[sk].l : '—'; return `<span class="pill">${T(t).abbr} ${esc(lab)}: <b class="${f >= 1 ? 'good' : f <= -1 ? 'bad' : ''}">${fitLabel(f)}</b>${trueOn() ? ` ${f > 0 ? '+' : ''}${f}` : ''}</span>`; }).join(' ')}</div>`;
  }
  left += contractHTML(p);
  left += '<div class="row" style="margin-top:12px">';
  if (p.tid === u && optionDue(p) && state.phase === 'RESIGN') left += `<button class="primary" data-action="option" data-pid="${p.id}" data-v="1">Exercise option (${fmtMoney(optionAmount(p))})</button><button data-action="option" data-pid="${p.id}" data-v="0">Decline option</button>`;
  if (p.tid === u && canTag(p)) left += `<button data-action="tag" data-pid="${p.id}">Franchise tag (${fmtMoney(tagAmount(p))})</button>`;
  if (p.tid === u && extensionDue(p)) left += termButtons(p, 'extend');
  if (p.tid === -3 && p.psTid === u) left += `<button class="primary" data-action="promote" data-pid="${p.id}">Promote to 53</button><button class="danger" data-action="psRelease" data-pid="${p.id}">Release</button>`;
  if (p.tid === -1 && p.exp <= 6 && psRoom(u, p) && ['REG', 'PRESEASON', 'CUTDOWN', 'DRAFT', 'FA'].includes(state.phase)) left += `<button data-action="signPS" data-pid="${p.id}">Sign to practice squad (${fmtMoney(PS_SALARY)})</button>`;
  if (p.tid === u) {
    if (p.expiring && state.phase === 'RESIGN') left += termButtons(p, 'resign');
    left += `<button class="danger" data-action="release" data-pid="${p.id}">Release</button>`;
  } else if (p.tid === -1 && state.phase !== 'PLAYOFFS' && state.phase !== 'RECAP') left += `<button class="primary" data-action="sign" data-pid="${p.id}">Sign (${fmtMoney(p.ask)})</button>`;
  else if (p.tid >= 0) left += `<button data-action="tradeFor" data-pid="${p.id}">Trade for ${esc(p.last)}</button>`;
  left += '</div>';
  if (p.awards && p.awards.length) left += `<div class="section-title">Awards</div>${p.awards.map(x => `<div class="small">🏅 ${esc(x)}</div>`).join('')}`;
  // ---- right: at a glance ----
  let right = '';
  if (!prospect) {
    right += `<div class="section-title" style="margin-top:0">At a Glance${src ? ` · ${src.season}${src.cur ? ' season to date' : ''}` : ''}</div>${glanceHTML(p, src)}`;
    const adv = advRankHTML(p, src);
    if (adv) right += `<div class="section-title">Tracking <span class="small muted">· rank among qualified ${p.pos}s</span></div>${adv}`;
  }
  if (!prospect) right += gameLogHTML(p);
  right += `<div class="section-title"${prospect ? ' style="margin-top:0"' : ''}>Combine ${rasHTML(p)} <span class="small muted">· shaded by percentile at his position</span></div>${combineHTML(p)}`;
  html += `<div class="grid card-cols"><div>${left}</div><div>${right}</div></div>`;
  html += advancedSeasonHTML(p);
  if (trueOn()) html += attributesHTML(p);
  // career
  const cc = careerCols(p.pos);
  const rows = [...p.career];
  if (p.stats.gp) rows.push(Object.assign({ season: state.season, tid: p.tid, cur: true }, p.stats));
  if (rows.length) {
    const tot = {}; rows.forEach(r => { const c = Object.assign({}, r, { season: 0 }); delete c.adv; delete c.sp; addStats(tot, c); });
    const cols = [{ k: 's', l: 'Season', f: r => r.tot ? '<b>Career</b>' : r.season + (r.cur ? '*' : '') }, { k: 't', l: 'Tm', f: r => r.tot ? '' : (r.tid >= 0 ? T(r.tid).abbr : 'FA') }, { k: 'gp', l: 'GP', f: r => r.gp || 0, num: 1 }, { k: 'gs', l: 'GS', f: r => r.gs || 0, num: 1 },
    { k: 'gr', l: 'Grade', f: r => r.tot ? '' : gradeChip(r.cur ? (p.advS ? overallGrade(p.advS, p.spot) : null) : r.adv ? r.adv.g : null) + (seasonRank(p, r) ? '<br>' + gradeRankTxt(seasonRank(p, r)) : ''), num: 1 },
    ...cc.map(([k, l, fn]) => ({ k, l, num: 1, f: r => fn ? fn(r) : (r[k] || 0) }))];
    const cv = ui.cardView === 'ratings' ? 'ratings' : 'stats';
    html += `<div class="row" style="margin:18px 0 8px"><span class="section-title" style="margin:0">Career</span><div class="subtabs" style="margin:0">${[['stats', 'Stats'], ['ratings', 'Ratings']].map(([k, l]) => `<button class="${k === cv ? 'on' : ''}" data-action="cardView" data-v="${k}" data-pid="${p.id}">${l}</button>`).join('')}</div></div>`;
    if (cv === 'stats') html += table('career', cols, [...rows, Object.assign(tot, { tot: true })], { nosort: 1 });
    else {
      // grades every season, plus how your staff rated him at the end of each year
      const ga = r => r.cur ? (p.advS ? careerAdv(p.advS, p.spot) : {}) : (r.adv || {});
      const fcols = Object.keys(FACETS).filter(f => rows.some(r => ga(r)['g' + f])).map(f => ({ k: f, l: FACETS[f], num: 1, f: r => gradeChip(ga(r)['g' + f] || null) }));
      html += table('careerR', [{ k: 's', l: 'Season', f: r => r.season + (r.cur ? '*' : '') }, { k: 't', l: 'Tm', f: r => r.tid >= 0 ? T(r.tid).abbr : 'FA' }, { k: 'snp', l: 'Snaps', f: r => r.snp || 0, num: 1 },
        { k: 'g', l: 'Overall', num: 1, f: r => gradeChip(ga(r).g || null) + (seasonRank(p, r) ? '<br>' + gradeRankTxt(seasonRank(p, r)) : '') }, ...fcols,
        { k: 'ti', l: 'Tier', f: r => r.cur ? tierPill(p) : r.ti ? `<span class="pill ${TIER_CLS[r.ti] || ''}">${r.ti}</span>` : '<span class="muted">—</span>' },
        { k: 'up', l: 'Upside', f: r => r.cur ? upsidePill(p) : r.up ? `<span class="pill up ${UP_CLS[r.up] || ''}">${r.up}</span>` : '<span class="muted">—</span>' }], rows, { nosort: 1 });
    }
  }
  if (p.pcareer && p.pcareer.length) {
    const cols = [{ k: 's', l: 'Season', f: r => r.season }, { k: 't', l: 'Tm', f: r => T(r.tid).abbr }, { k: 'gp', l: 'GP', f: r => r.gp || 0, num: 1 }, ...cc.map(([k, l, fn]) => ({ k, l, num: 1, f: r => fn ? fn(r) : (r[k] || 0) }))];
    html += `<div class="section-title">Playoffs</div>` + table('pcareer', cols, p.pcareer, { nosort: 1 });
  }
  openModal(html, replace);
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
  return `<div class="section-title">Scouting Report</div><div class="profile">${esc(scoutProfile(p))}.</div><div class="small muted" style="margin-top:4px">${esc(line)}</div>
    ${tags.length ? `<div class="row small" style="margin-top:6px">${tags.map(t => `<span class="pill">${esc(t)}</span>`).join(' ')}</div>` : ''}
    <div class="small muted" style="margin-top:6px">Evaluation confidence: <b>${conf}</b>${buzz ? ` · <span class="warn">${buzz}</span>` : ''}</div>`;
}
// training camp reports (preseason through the first month): ~70% of them turn out to be right
function campCardHTML() {
  const c = state.camp;
  const pre = state.phase === 'PRESEASON' || state.phase === 'CUTDOWN';
  if (!c || c.season !== state.season + (pre ? 1 : 0)) return '';
  if (!(pre || (state.phase === 'REG' && state.week <= 5))) return '';
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
// "9th of 64 DT": where a season grade stands at his position (qualified players only)
function gradeRankTxt(rk) { return rk ? `<span class="small muted" title="Rank among qualified ${rk[2] || 'players at his position'}">${rk[0]}/${rk[1]}${rk[2] ? ' ' + rk[2] : ''}</span>` : ''; }
function seasonRank(p, r) { return r.cur ? gradeRanks()[p.id] : r.adv && r.adv.rk ? [r.adv.rk, r.adv.rkN, r.adv.rkG] : null; }
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
  let html = `<span></span>
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
  const rows = p.career.filter(r => r.adv).map(r => ({ season: r.season, g: r.adv.g }));
  if (p.advS && Object.keys(p.advS).length > 1) rows.push({ season: state.season, g: overallGrade(p.advS, p.spot) });
  if (rows.length < 2) return '';
  return `<div class="small muted" style="margin-top:12px">Grade by season: ${rows.map(r => `${r.season} ${gradeChip(r.g)}`).join(' · ')}</div>`;
}

// ---------- game day: preview & wrap ----------
function userMatchup() {
  const u = state.userTid;
  if (state.phase === 'REG') { const m = (state.schedule[state.week - 1] || []).find(x => x.h === u || x.a === u); return m ? { h: m.h, a: m.a } : null; }
  if (state.phase === 'PRESEASON' && state.pre && state.pre.sched[state.pre.wk]) { const m = state.pre.sched[state.pre.wk].find(x => x.h === u || x.a === u); return m ? { h: m.h, a: m.a, po: `Preseason ${state.pre.wk + 1}` } : null; }
  if (state.phase === 'PLAYOFFS' && state.playoffs) { const m = playoffMatchups().find(([h, a]) => h === u || a === u); return m ? { h: m[0], a: m[1], po: ROUND_NAMES[state.playoffs.round] } : null; }
  return null;
}
function teamStrength(tid) { return teamOvr(tid, 'off') * 0.55 + teamOvr(tid, 'def') * 0.45; }
// a betting-style line from how good the teams look (your staff's read)
function gameLine(h, a, neutral) {
  const spread = (teamStrength(h) - teamStrength(a)) * 1.6 + (neutral ? 0 : 2);
  return { spread, pHome: 1 / (1 + Math.exp(-spread / 6.5)) };
}
function keyPlayers(tid, n) {
  if (state.phase === 'PRESEASON') { // exhibitions: the young players fighting for jobs, by upside
    const act = preseasonActives(tid);
    return rosterOf(tid).filter(p => p.a && act.has(p.id) && p.pos !== 'K' && p.pos !== 'P').sort((x, y) => (y.exp <= 1) - (x.exp <= 1) || uCeil(y) - uCeil(x)).slice(0, n);
  }
  return keyPlayersReg(tid, n);
}
function keyPlayersReg(tid, n) { return rosterOf(tid).filter(p => p.a && !p.injury && p.pos !== 'K' && p.pos !== 'P').sort((x, y) => (starsOf(y) || 0) - (starsOf(x) || 0) || uOvr(y) - uOvr(x)).slice(0, n); }
function pregameModal() {
  const m = userMatchup(), u = state.userTid, recs = standings();
  const opp = m.h === u ? m.a : m.h, home = m.h === u;
  const ln = gameLine(m.h, m.a, m.po === 'Championship'), fav = ln.spread >= 0 ? m.h : m.a, sp = Math.abs(ln.spread);
  const pUser = home ? ln.pHome : 1 - ln.pHome;
  const side = tid => {
    const out = rosterOf(tid).filter(p => p.injury && ['Elite', 'All-Pro', 'Starter'].includes(tierOf(p)));
    return `<div class="card"><h3>${teamLink(tid, true)} <span class="muted small">${recStr(recs[tid])}</span></h3>
      <div class="section-title" style="margin-top:0">${state.phase === 'PRESEASON' ? 'Fighting for jobs' : 'Players to watch'}</div>${keyPlayers(tid, state.phase === 'PRESEASON' ? 5 : 4).map(p => `<div class="small">${state.phase === 'PRESEASON' ? upsidePill(p) : starHTML(starsOf(p))} ${esc(p.lbl)} ${playerLink(p)}${p.exp === 0 ? ' <span class="pill rook">R</span>' : ''}</div>`).join('')}
      <div class="section-title">Out</div>${out.length ? out.map(p => `<div class="small"><span class="bad">${esc(p.lbl)}</span> ${playerLink(p)} <span class="muted">— ${esc(p.injury.name)}</span></div>`).join('') : '<div class="small muted">Nobody significant.</div>'}</div>`;
  };
  openModal(`<div class="muted small">${m.po ? m.po : `Week ${state.week}`} · ${home ? 'Home' : 'Away'}</div>
    <h2 style="margin:4px 0">${T(m.a).abbr} @ ${T(m.h).abbr}</h2>
    ${state.phase === 'PRESEASON' ? '<div class="small muted" style="margin-bottom:12px">Exhibition: starters sit, the bubble plays. The result does not count; the film does.</div>' : `<div class="row small" style="margin-bottom:12px"><span>Line: <b>${T(fav).abbr} −${(Math.round(sp * 2) / 2).toFixed(1)}</b></span><span class="muted">·</span><span>Your win chance ≈ <b>${Math.round(pUser * 100)}%</b></span></div>`}
    <div class="grid g2">${side(u)}${side(opp)}</div>
    <div class="row" style="margin-top:14px"><button class="primary" data-action="playGame" data-recap="1">▶ Sim game</button><button data-action="playGame" data-recap="0">Sim without recap</button><span class="spacer"></span><button class="sm" data-action="popupsOff">Turn off game popups</button></div>`);
}
function playWeek(recap) { // regular season, playoffs and preseason all go through here
  const before = new Set(Object.keys(state.games));
  runSteps(stepContinue, (() => { let n = 0; return () => n++ > 0; })(), phaseLabel).then(() => {
    if (!recap) return;
    const box = Object.values(state.games).find(b => !before.has(String(b.id)) && b.tids.includes(state.userTid));
    if (box) gameWrapModal(box.id);
  });
}
// the story of a game in a few lines
function headlines(b) {
  const u = state.userTid, us = b.tids.indexOf(u), them = 1 - us, win = b.score[us] > b.score[them], tie = b.score[0] === b.score[1];
  const W = b.tids[b.score[0] >= b.score[1] ? 0 : 1], L = b.tids[b.score[0] >= b.score[1] ? 1 : 0], margin = Math.abs(b.score[0] - b.score[1]);
  const out = [];
  const q3 = s => b.qs[s].slice(0, 3).reduce((x, y) => x + y, 0);
  const wi = b.tids.indexOf(W), li = 1 - wi;
  if (tie) out.push(`${T(b.tids[0]).name} and ${T(b.tids[1]).name} battle to a ${b.score[0]}-${b.score[1]} tie`);
  else if (q3(wi) < q3(li)) out.push(`${T(W).name} rally in the fourth to beat the ${T(L).name}`);
  else if (margin >= 21) out.push(`${T(W).name} rout the ${T(L).name}, ${Math.max(...b.score)}-${Math.min(...b.score)}`);
  else if (margin <= 3) out.push(`${T(W).name} edge the ${T(L).name} in a ${b.ot ? 'overtime ' : ''}thriller`);
  else out.push(`${T(W).name} handle the ${T(L).name}, ${Math.max(...b.score)}-${Math.min(...b.score)}`);
  // the star of the show
  const best = Object.entries(b.stats).map(([pid, l]) => ({ p: P(pid), l, g: b.adv && b.adv[pid] ? overallGrade(b.adv[pid], P(pid) ? P(pid).spot : 'WRX') : null })).filter(x => x.p && x.g !== null && (x.l.snp || 0) >= 15).sort((x, y) => y.g - x.g)[0];
  if (best) out.push(`${esc(best.p.lbl)} ${pname(best.p)} ${best.g >= 90 ? 'dominates' : 'stars'} for ${T(best.l.tid).abbr}: ${gameLineTxt(best.l, best.p)}`);
  const to = b.ts[them].to, sk = b.ts[them].sacks;
  if (to >= 3) out.push(`${T(b.tids[us]).abbr} defense forces ${to} turnovers`);
  else if (sk >= 5) out.push(`${T(b.tids[us]).abbr} pass rush piles up ${sk} sacks`);
  else if (b.ts[us].to >= 3) out.push(`${b.ts[us].to} turnovers sink ${T(u).abbr}`);
  const r = standings()[u];
  if (!b.playoff) out.push(`${T(u).abbr} ${win ? 'improve' : tie ? 'move' : 'fall'} to ${recStr(r)}`);
  const inj = (b.injuries || []).filter(x => x.tid === u && P(x.pid) && x.weeks >= 3).map(x => P(x.pid));
  if (inj.length) out.push(`Concern: ${inj.slice(0, 2).map(p => `${p.lbl} ${pname(p)}`).join(' and ')} ${inj.length > 1 ? 'leave' : 'leaves'} injured`);
  return out;
}
// a compact game line: only the numbers that happened
function gameLineTxt(l, p) {
  const nz = (v, s) => v ? `${v} ${s}` : '';
  let parts;
  if (p.pos === 'QB') parts = [`${l.passC || 0}/${l.passA || 0}, ${l.passY || 0} yds`, nz(l.passTD, 'TD'), nz(l.passInt, 'INT'), (l.rushY || 0) >= 20 ? `${l.rushY} rush yds` : ''];
  else if (['RB', 'WR', 'TE'].includes(p.pos)) parts = [l.rushA ? `${l.rushA} car, ${l.rushY || 0} yds` : '', l.rec ? `${l.rec} rec, ${l.recY || 0} yds` : '', nz((l.rushTD || 0) + (l.recTD || 0), 'TD')];
  else if (p.pos === 'K') parts = [`${l.fgm || 0}/${l.fga || 0} FG`, `${l.xpm || 0}/${l.xpa || 0} XP`];
  else if (p.pos === 'P') parts = [`${l.pnt || 0} punts`];
  else if (p.pos === 'OL') parts = [`${l.snp || 0} snaps`];
  else parts = [nz(l.tkl, 'tkl'), nz(l.tfl, 'TFL'), nz(l.sck, 'sck'), nz(l.prs, 'pressures'), nz(l.dint, 'INT'), nz(l.pd, 'PD'), nz(l.ff, 'FF')];
  return parts.filter(Boolean).join(', ') || `${l.snp || 0} snaps`;
}
function gameWrapModal(gid) {
  const b = state.games[gid];
  if (!b) return;
  const u = state.userTid, us = b.tids.indexOf(u), them = 1 - us, [h, a] = b.tids, nq = b.ot ? 5 : 4;
  const graded = Object.entries(b.stats).map(([pid, l]) => {
    const p = P(pid); if (!p || !b.adv || !b.adv[pid] || (l.snp || 0) < 15) return null;
    return { p, l, g: overallGrade(b.adv[pid], p.spot) };
  }).filter(x => x && x.g !== null);
  const mine = graded.filter(x => x.l.tid === u).sort((x, y) => y.g - x.g), theirs = graded.filter(x => x.l.tid !== u).sort((x, y) => y.g - x.g);
  const line = x => `<div class="small" style="margin:3px 0">${gradeChip(x.g)} ${esc(x.p.lbl)} ${playerLink(x.p)} <span class="muted">${gameLineTxt(x.l, x.p)}</span></div>`;
  // breakouts: well above his usual level (form before this game), or a backup who seized the moment
  const breakouts = mine.filter(x => { const f = (x.p.form || []).slice(0, -1); const avgF = f.length ? f.reduce((s, v) => s + v, 0) / f.length : 60; return x.g >= 78 && (x.g - avgF >= 15 || ['Depth', 'Rotation', 'Backup', 'Project', 'Fringe'].includes(tierOf(x.p))); }).slice(0, 3);
  const ts = s => b.ts[s], fmtTop = sec => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
  const stat = (l, f) => `<tr><td class="num">${f(ts(1))}</td><td class="muted" style="text-align:center">${l}</td><td class="num">${f(ts(0))}</td></tr>`;
  const others = Object.values(state.games).filter(x => x.week === b.week && x.season === b.season && x.playoff === b.playoff && x.id !== b.id);
  const win = b.score[us] > b.score[them];
  const html = `<div class="muted small">${b.playoff || `Week ${b.week}`} · Final${b.ot ? ' (OT)' : ''}</div>
    <h2 style="margin:4px 0" class="${win ? 'good' : b.score[0] === b.score[1] ? '' : 'bad'}">${T(a).abbr} ${b.score[1]} — ${T(h).abbr} ${b.score[0]}</h2>
    <div class="callout">${headlines(b).map((x, i) => `<div style="${i ? 'font-size:13px' : 'font-weight:700'}">${x}</div>`).join('')}</div>
    <div class="grid g2"><div>
      <table class="linescore" style="max-width:420px"><thead><tr><th></th>${['1', '2', '3', '4', 'OT'].slice(0, nq).map(q => `<th>${q}</th>`).join('')}<th>T</th></tr></thead><tbody>
      ${[[1, a], [0, h]].map(([s, tid]) => `<tr><td>${T(tid).abbr}</td>${b.qs[s].slice(0, nq).map(x => `<td>${x}</td>`).join('')}<td class="final">${b.score[s]}</td></tr>`).join('')}</tbody></table>
      <table style="max-width:420px;margin-top:10px"><thead><tr><th class="num">${T(a).abbr}</th><th></th><th class="num">${T(h).abbr}</th></tr></thead><tbody>
      ${stat('Total yards', t => t.passY - t.sackY + t.rushY)}${stat('Passing', t => `${t.passC}/${t.passA}, ${t.passY - t.sackY}`)}${stat('Rushing', t => `${t.rushA}-${t.rushY}`)}
      ${stat('First downs', t => t.fd)}${stat('3rd down', t => `${t.d3c}/${t.d3a}`)}${stat('Turnovers', t => t.to)}${stat('Sacks allowed', t => t.sacks)}${stat('Possession', t => fmtTop(t.top))}</tbody></table>
    </div><div>
      <div class="section-title" style="margin-top:0">Best of ${T(u).abbr}</div>${mine.slice(0, 4).map(line).join('') || '<div class="small muted">—</div>'}
      ${breakouts.length ? `<div class="section-title good">Breakout performances</div>${breakouts.map(line).join('')}` : ''}
      <div class="section-title">Struggled</div>${mine.slice(-3).reverse().filter(x => x.g < 55).map(line).join('') || '<div class="small muted">Nobody had a rough day.</div>'}
      <div class="section-title">Best of ${T(b.tids[them]).abbr}</div>${theirs.slice(0, 2).map(line).join('')}
      ${(b.injuries || []).length ? `<div class="section-title bad">Injuries</div>${b.injuries.map(x => P(x.pid) ? `<div class="small">${T(x.tid).abbr} ${playerLink(P(x.pid))} — ${esc(x.name)} <span class="muted">(${x.weeks} wk)</span></div>` : '').join('')}` : ''}
    </div></div>
    ${others.length ? `<div class="section-title">Around the league</div><div class="row small" style="gap:6px 16px">${others.map(x => `<span>${T(x.tids[1]).abbr} ${x.score[1]} @ ${T(x.tids[0]).abbr} ${x.score[0]}</span>`).join('')}</div>` : ''}
    <div class="row" style="margin-top:14px"><button class="primary" data-action="box" data-gid="${b.id}">Full box score & Film Room</button><button data-action="closeModal">Continue</button></div>`;
  openModal(html);
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
    case 'PRESEASON': simPreseasonWeek(); if (state.phase === 'CUTDOWN' && !state.settings.autoUser) view = 'cutdown'; break;
    case 'CUTDOWN': applyCutPlan(); startNewSeason(); if (view === 'cutdown') view = 'home'; break;
  }
}
function phaseLabel() {
  return state.phase === 'PRESEASON' ? 'Playing preseason…' : state.phase === 'REG' ? `Simulating week ${state.week}…` : state.phase === 'PLAYOFFS' ? `Playing ${ROUND_NAMES[state.playoffs.round]}…` : `${PHASE_LABEL[state.phase]}…`;
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
    if (state.phase === 'CUTDOWN' && !state.settings.autoUser) {
      const left = rosterOf(state.userTid).filter(p => countsOn53(p) && (state.cut.plan[p.id] !== 'cut')).length - ROSTER_MAX;
      if (left > 0 && !confirm(`You still need to cut ${left} more player${left === 1 ? '' : 's'}. Let the staff make the remaining cuts?`)) return;
    }
    if (state.phase === 'REG' || state.phase === 'PLAYOFFS' || state.phase === 'PRESEASON') {
      if (state.phase === 'PRESEASON' && !state.pre) startPreseason();
      if (state.settings.gamePopups !== false && userMatchup()) { pregameModal(); return; }
      playWeek(false);
    } else { stepContinue(); save(); render(); }
  },
  playGame: d => { closeModal(); playWeek(d.recap !== '0'); },
  popupsOff: () => { state.settings.gamePopups = false; save(); closeModal(); playWeek(false); toast('Game popups off. Turn them back on in Settings.'); },
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
  closeModalAll: () => closeModal(true),
  cardView: d => { ui.cardView = d.v; playerModal(+d.pid, true); },
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
  resign: d => { const err = resignPlayer(+d.pid, d.yrs ? +d.yrs : undefined); if (err) toast(err); else toast('Re-signed!'); closeModal(); save(); render(); },
  resignAll: () => {
    let n = 0;
    for (const p of rosterOf(state.userTid).filter(p => p.expiring).sort((a, b) => uOvr(b) - uOvr(a))) {
      if (aiWantsResign(p) && !resignPlayer(p.id)) n++;
    }
    toast(`Re-signed ${n} player(s).`); save(); render();
  },
  option: d => { const err = exerciseOption(+d.pid, d.v === '1'); toast(err || (d.v === '1' ? 'Option exercised.' : 'Option declined.')); closeModal(); save(); render(); },
  tag: d => { const err = franchiseTag(+d.pid); toast(err || 'Franchise tag applied.'); closeModal(); save(); render(); },
  extend: d => { const err = extendPlayer(+d.pid, d.yrs ? +d.yrs : undefined); toast(err || 'Extension signed.'); closeModal(); save(); render(); },
  promote: d => { const err = promoteFromPS(+d.pid, state.userTid); toast(err || 'Promoted to the 53.'); closeModal(); save(); render(); },
  psRelease: d => { releaseFromPS(+d.pid); toast('Released from the practice squad.'); closeModal(); save(); render(); },
  signPS: d => { const err = signToPS(+d.pid, state.userTid); toast(err || 'Signed to the practice squad.'); closeModal(); save(); render(); },
  pbTeamSet: d => { ui.pbTid = +d.tid; render(); },
  pbPers: d => { ui.pbPers = d.v; ui.pbPkg = { '10': 'DIME', '11': 'NICKEL', '12': 'BASE', '13': 'BASE', '21': 'BASE', '22': 'BASE', JUMBO: 'GL' }[d.v] || ui.pbPkg; render(); },
  pbForm: d => { ui.pbForm = d.v; render(); },
  pbPkg: d => { ui.pbPkg = d.v; render(); },
  dchPick: d => { ui.dchKey = d.key; render(); },
  dchTab: d => { ui.dchTab = d.tab; ui.dchKey = null; render(); },
  dchRemove: d => { setChart(state.userTid, d.key, +d.i, 0); save(); render(); },
  dchAdd: d => { const l = ensureChart(state.userTid).lists[d.key] || []; setChart(state.userTid, d.key, l.length, +d.pid); save(); render(); },
  dchAuto: d => { setChartAuto(state.userTid, d.unit, d.on === '1'); save(); render(); },
  autoCut: () => { const c = autoCut(state.userTid, ROSTER_MAX, false); toast(`Released ${c.length} player(s).`); save(); render(); },
  sign: d => { const err = signFA(+d.pid, state.userTid); if (err) toast(err); else toast('Signed!'); closeModal(); save(); render(); },
  statCat: d => { ui.statCat = d.cat; render(); },
  faPos: d => { ui.faPos = d.pos; render(); },
  faView: d => { ui.faView = d.v; render(); },
  srchFam: d => { (ui.search || (ui.search = Object.assign({}, SEARCH_DEF))).fam = d.pos; render(); },
  cutFam: d => { ui.cutFam = d.pos; render(); },
  cutToggle: d => { const pl = state.cut.plan; if (pl[d.pid] === 'cut') delete pl[d.pid]; else pl[d.pid] = 'cut'; save(); render(); },
  cutStaff: () => { const prev = cutPreview(state.userTid); state.cut.plan = {}; prev.cuts.forEach(id => state.cut.plan[id] = 'cut'); save(); render(); },
  cutClear: () => { state.cut.plan = {}; save(); render(); },
  srchReset: () => { ui.search = Object.assign({}, SEARCH_DEF); render(); },
  rosterPos: d => { ui.rosterPos = d.pos; render(); },
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
  rosterView: v => { ui.rosterView = v; },
  srch: (v, el) => { (ui.search || (ui.search = Object.assign({}, SEARCH_DEF)))[el.dataset.f] = v; },
  srchChk: (v, el) => { (ui.search || (ui.search = Object.assign({}, SEARCH_DEF)))[el.dataset.f] = el.checked; },
  staffTeam: v => { ui.staffTid = +v; },
  pbTeam: v => { ui.pbTid = +v; },
  schedWeek: v => { ui.schedWeek = +v; },
  statSeason: v => { ui.statSeason = +v; },
  statMine: (v, el) => { ui.statMine = el.checked; },
  tradeTeam: v => { ui.tradeTid = +v; ui.get = { players: [], picks: [] }; },
  histTeam: v => { ui.histTid = +v; },
  autoUser: (v, el) => { state.settings.autoUser = el.checked; save(); toast(el.checked ? 'Auto-manage on.' : 'Auto-manage off.'); },
  showTrue: (v, el) => { state.settings.showTrue = el.checked; save(); },
  gamePopups: (v, el) => { state.settings.gamePopups = el.checked; save(); },
  theme: v => { state.settings.theme = v; save(); },
  dch: (v, el) => { setChart(state.userTid, el.dataset.key, +el.dataset.i, v ? +v : 0); save(); },
  dchAll: (v, el) => { ui.dchAll = el.checked; },
  dchRot: (v, el) => { ensureChart(state.userTid).rot[el.dataset.key] = +v; ensureChart(state.userTid).auto[CHART_UNIT(el.dataset.key)] = false; save(); },
};

// depth chart drag & drop
let dcDrag = null;
document.addEventListener('dragstart', e => {
  const el = e.target.closest && e.target.closest('[data-dcpid]');
  if (!el) return;
  dcDrag = { pid: +el.dataset.dcpid, from: el.dataset.dcfrom !== undefined ? +el.dataset.dcfrom : null };
  el.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(dcDrag.pid));
});
document.addEventListener('dragend', e => { const el = e.target.closest && e.target.closest('[data-dcpid]'); if (el) el.classList.remove('drag'); document.querySelectorAll('.dc-over').forEach(x => x.classList.remove('dc-over')); });
document.addEventListener('dragover', e => {
  const t = e.target.closest && e.target.closest('[data-dcdrop]');
  if (!t || !dcDrag) return;
  e.preventDefault();
  document.querySelectorAll('.dc-over').forEach(x => x !== t && x.classList.remove('dc-over'));
  t.classList.add('dc-over');
});
document.addEventListener('drop', e => {
  const t = e.target.closest && e.target.closest('[data-dcdrop]');
  if (!t || !dcDrag) return;
  e.preventDefault();
  const key = ui.dchKey || 'QB';
  let at = +t.dataset.dcdrop;
  if (dcDrag.from !== null && dcDrag.from < at) at -= 0; // dropping onto a later row puts him in that row's spot
  setChart(state.userTid, key, at, dcDrag.pid);
  dcDrag = null; save(); render();
});
// navigation fires on press, so a slight mouse movement or a redraw mid-click can't swallow it
let navPressed = null;
document.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  const el = e.target.closest('[data-action="nav"]');
  if (!el) return;
  navPressed = el.dataset.view;
  actions.nav(el.dataset);
});
document.addEventListener('click', e => {
  if (e.target.id === 'modal') { closeModal(true); return; }
  if (navPressed && e.target.closest('[data-action="nav"]')) { navPressed = null; return; }
  navPressed = null;
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
