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
function upMark(p) { const m = p.upM; return m && p.tid !== -2 && m.cp === (state.cp || 0) ? ` <span class="${m.d > 0 ? 'good' : 'bad'}" title="Upside ${m.d > 0 ? 'raised' : 'lowered'} from ${m.from} after ${esc(m.why)}">${m.d > 0 ? '▲' : '▼'}</span>` : ''; }
function upsidePill(p) { const u = upsideOf(p); return `<span class="pill up ${UP_CLS[u]}">${u}</span>${upMark(p)}`; }
function trackPill(p) { if (!p.grow || p.tid === -2) return ''; const t = trackOf(p); return `<span class="pill ${TRACK_CLS[t]}">${TRACK_LABEL[t]}</span>`; }
function filmBasis(p) {
  if (p.tid === -2) return 'college tape and workouts';
  const c = p.per ? p.per.conf : 1;
  return c < 0.4 ? 'very little pro film' : c < 0.58 ? 'a limited sample of pro film' : c < 0.8 ? 'a solid body of film' : 'years of film';
}
// how his build differs from the man he is compared to
function compBuild(p, c) {
  if (!p || !c || !p.m || !c.m) return '';
  const dh = p.m.ht - c.m.ht, dw = p.m.wt - c.m.wt, da = p.m.arm && c.m.arm ? p.m.arm - c.m.arm : 0, bits = [];
  if (dh >= 2) bits.push(`${dh} inches taller`); else if (dh <= -2) bits.push(`${-dh} inches shorter`);
  if (dw >= 15) bits.push(`${Math.round(dw / 5) * 5} pounds heavier`); else if (dw <= -15) bits.push(`${Math.round(-dw / 5) * 5} pounds lighter`);
  if (da >= 1) bits.push('with longer arms'); else if (da <= -1) bits.push('with shorter arms');
  return bits.length ? ` <span class="muted">· ${bits.join(', ')}</span>` : '';
}
function compLink(c) { return !c ? '' : c.rid !== undefined ? `<b>${esc(c.n)}</b> <span class="muted">(retired ${c.yrs})</span>` : `${playerLink(P(c.id))} <span class="muted">(${c.tid >= 0 ? T(c.tid).abbr : 'FA'})</span>`; }
// beneath the upside pill: who the staff thinks he becomes, who that looks like, and how it is going
function devPanelHTML(p) {
  if (!p.a || !p.per || !p.grow) return '';
  const prospect = p.tid === -2, dev = isDeveloping(p), m = p.upM;
  const moved = m && !prospect ? `<div class="small ${m.d > 0 ? 'good' : 'bad'}" style="margin-top:6px">${m.d > 0 ? '▲' : '▼'} Upside ${m.d > 0 ? 'raised' : 'lowered'} from ${m.from} after ${esc(m.why)} (${m.s}).</div>` : '';
  if (!dev) {
    if (prospect) return '';
    const t = trackOf(p);
    return `<div class="devbox"><div class="row" style="gap:8px"><span class="dev-h">Finished product</span>${trackPill(p)}</div>
      <div class="small muted" style="margin-top:4px">${t === 'fall' ? 'The decline is real and it is moving fast.' : t === 'slip' ? 'He has lost a step from his best.' : m && m.d > 0 && m.s === state.season ? 'He made the jump and has reached it: the scouting report below is the player he has become.' : 'He is what he is: the scouting report below is the finished article.'}</div>${moved}</div>`;
  }
  const r = finishedRemark(p), c = compFor(p), b = compFor(p, true), up = upsideOf(p);
  const same = b && c && ((b.id !== undefined && b.id === c.id) || (b.rid !== undefined && b.rid === c.rid));
  return `<div class="devbox"><div class="row" style="gap:8px"><span class="dev-h">Finished product</span><span class="pill up ${UP_CLS[up]}">${up}</span>${prospect ? '' : trackPill(p)}</div>
    <div class="dev-line">${esc(r.line || 'Too little to go on yet.')}</div>
    ${r.str.length || r.weak.length ? `<div class="small muted">${r.str.map(x => `<span class="good">+ ${esc(x)}</span>`).concat(r.weak.map(x => `<span class="bad">− ${esc(x)}</span>`)).join(' &nbsp; ')}</div>` : ''}
    ${c ? `<div class="small" style="margin-top:6px">Plays like: ${compLink(c)}${compBuild(p, c)}${b && !same ? ` · <span class="muted">best case:</span> ${compLink(b)}${compBuild(p, b)}` : ''}</div>` : ''}
    <div class="small muted" style="margin-top:4px">Your staff's projection, based on ${filmBasis(p)}. It is rewritten as the film comes in.</div>${moved}</div>`;
}
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
  { const w = typeof stWord === 'function' && p.a && p.tid !== -2 ? stWord(p) : null; if (w && w[0] === 'Core special teamer') s += `<span class="pill good" title="Core special teamer">ST++</span> `; else if (w && w[0] === 'Helps on special teams') s += `<span class="pill" title="Helps on special teams">ST+</span> `; }
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
    return `<tr class="${cls}">` + cols.map(c => `<td class="${c.num ? 'num' : ''}${c.l ? '' : ' act'}" data-l="${esc(c.l)}">${c.f ? c.f(r, i) : (c.v ? c.v(r) : '')}</td>`).join('') + '</tr>';
  }).join('');
  const pn = cols.length > 2 && cols[0].k === 'pos' && ['n', 'name'].includes(cols[1].k); // position + name stay pinned on a phone
  const rk = !pn && cols.length > 2 && cols[0].k === 'rk'; // a rank column, then the name
  // phones: player lists read as cards (with their own sort control); a toggle brings the table back
  const sortable = opts.nosort ? [] : cols.filter(c => c.v && c.l);
  const mbar = pn ? `<div class="mbar">${sortable.length ? `<label class="small muted">Sort</label><select data-change="msort" data-table="${id}">${sortable.map(c => `<option value="${c.k}" ${ss && ss.k === c.k ? 'selected' : ''}>${c.l}</option>`).join('')}</select><button class="sm" data-action="msortDir" data-table="${id}" data-k="${ss ? ss.k : sortable[0].k}" title="Reverse the order">${ss && ss.dir > 0 ? '▴' : '▾'}</button>` : ''}<span class="spacer"></span><span class="seg"><button class="sm ${ui.mtable ? '' : 'on'}" data-action="mview" data-v="">Cards</button><button class="sm ${ui.mtable ? 'on' : ''}" data-action="mview" data-v="1">Table</button></span></div>` : '';
  return mbar + `<div class="tbl-wrap"><table class="${pn ? 'pn' + (ui.mtable ? '' : ' cards') : rk ? 'rk' : ''}"><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length}" class="muted">Nothing here.</td></tr>`}</tbody></table></div>`;
}

// ---------- top level ----------
function applyTheme() { document.documentElement.classList.toggle('dark', !!(state && state.settings && state.settings.theme === 'dark')); }
function render() {
  const app = $('#app');
  applyTheme();
  if (!state) { app.innerHTML = setupHTML(); return; }
  if (state.rv2 !== 3) { state.rv2 = 3; for (const c of Object.values(state.coaches)) { migrateCoach(c, state.teams, state.coaches); updateCoachOvr(c); } TEND_VER++; }
  if (state.phase === 'FA' && (!state.fa || state.fa.yr !== state.season)) { faOpen(); save(); } // a save that was already in free agency when the market was added
  document.documentElement.style.setProperty('--accent', T(state.userTid).color);
  if (state.phase === 'RECAP' && ui.wrapSeen !== state.season) { ui.wrapSeen = state.season; ui.seasonYr = null; view = 'season'; } // the season just ended: open its review once
  if (state.phase === 'PRESEASON' && !state.pre && !state.settings.autoUser && ui.prepSeen !== state.season) { ui.prepSeen = state.season; ui.staffTid = null; ui.staffSel = T(state.userTid).hc; view = 'coaches'; } // rookie free agency is over: meet with the staff before camp
  let page;
  try { page = pageHTML(); } catch (e) { showError(e, `drawing the ${view} page`); page = `<div class="callout bad">This page hit an error (details at the bottom of the screen).</div>`; }
  const SC = '.tbl-wrap, .scroll, .dc-cands, .dc-side, nav.tabs, .subnav, .subtabs, .msheet-card', keep = [...app.querySelectorAll(SC)].map(e => [e.scrollLeft, e.scrollTop]), wy = window.scrollY, same = app.dataset.view === view;
  app.innerHTML = topbarHTML() + `<main>${page}</main>` + mobileNavHTML(); { const cc = app.querySelector('.cal-st.cur'), ct = app.querySelector('.cal-track'); if (cc && ct) ct.scrollLeft = cc.offsetLeft - ct.offsetLeft - ct.clientWidth / 2 + cc.offsetWidth / 2; } // keep where we are in the year in view
  app.dataset.view = view;
  if (same) { [...app.querySelectorAll(SC)].forEach((e, i) => { if (keep[i]) { e.scrollLeft = keep[i][0]; e.scrollTop = keep[i][1]; } }); if (Math.abs(window.scrollY - wy) > 2) window.scrollTo(0, wy); }
  else { const nav = app.querySelector('nav.tabs'), i = [...app.querySelectorAll(SC)].indexOf(nav); if (nav && keep[i]) nav.scrollLeft = keep[i][0]; }
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

const PAGES = [['home', 'Home'], ['roster', 'Roster'], ['depth', 'Depth Chart'], ['practice', 'Practice'], ['coaches', 'Staff'], ['playbook', 'Playbook'], ['schedule', 'Schedule'], ['standings', 'Standings'], ['stats', 'League Stats'], ['trade', 'Trade'], ['fa', 'Free Agents'], ['search', 'Player Search'], ['draft', 'Draft'], ['news', 'News'], ['history', 'History'], ['settings', 'Settings']];

function continueLabel() {
  switch (state.phase) {
    case 'REG': return `▶ Play Week ${state.week}`;
    case 'PLAYOFFS': return `▶ Play ${ROUND_NAMES[state.playoffs.round]}`;
    case 'RECAP': return 'Start Offseason →';
    case 'COACHES': { const d = state.car ? state.car.day : 0; return d >= CAROUSEL_DAYS - 1 ? 'Close the Coaching Search →' : `Next Day of the Search (${d + 1} of ${CAROUSEL_DAYS}) →`; }
    case 'RESIGN': return 'Done Re-signing →';
    case 'FA': { const d = state.fa && state.fa.yr === state.season ? state.fa.day : 0; return d >= FA_DAYS - 1 ? 'Close Free Agency →' : `Next Day of Free Agency (${d + 1} of ${FA_DAYS}) →`; }
    case 'DRAFT': { const pk = currentPick(); return pk && pk.owner === state.userTid ? 'Auto-pick for Me' : 'Sim to My Pick'; }
    case 'UDFA': return state.udfa && state.udfa.round >= UDFA_ROUNDS - 1 ? 'Final Round: Send Offers & Open Camp →' : `Send Offers (Round ${(state.udfa ? state.udfa.round : 0) + 1} of ${UDFA_ROUNDS}) →`;
    case 'PRESEASON': return !state.pre ? '▶ Open Training Camp' : !preCamped() ? '▶ Run Training Camp (two weeks)' : `▶ Play Preseason Game ${state.pre.wk + 1}`;
    case 'CUTDOWN': return 'Finalize Cuts → Waiver Wire';
    case 'WAIVERS': return `Process Claims & Start ${state.season + 1} Season →`;
  }
}
// the year as a strip: where the league is, what is behind it, and the button that moves it on
const CAL = [['REG', 'Season'], ['PLAYOFFS', 'Playoffs'], ['RECAP', 'Review'], ['COACHES', 'Staff'], ['RESIGN', 'Re-signing'], ['FA', 'Free agency'], ['DRAFT', 'Draft'], ['UDFA', 'Rookies'], ['PRESEASON', 'Camp'], ['CUTDOWN', 'Cuts'], ['WAIVERS', 'Waivers']];
function calSubHTML() {
  const u = state.userTid, tk = (cls, title) => `<b class="${cls}" title="${esc(title || '')}"></b>`;
  switch (state.phase) {
    case 'REG': { let h = ''; for (let w = 1; w <= SEASON_WEEKS; w++) { const m = (state.schedule[w - 1] || []).find(x => x.h === u || x.a === u), opp = m ? (m.h === u ? 'vs ' : 'at ') + T(m.h === u ? m.a : m.h).abbr : 'bye';
        if (m && m.score) { const a = m.h === u ? m.score[0] : m.score[1], b = m.h === u ? m.score[1] : m.score[0]; h += tk(a > b ? 'w' : a < b ? 'l' : 't', `Week ${w}: ${a > b ? 'won' : a < b ? 'lost' : 'tied'} ${a}–${b} ${opp}`); }
        else h += tk(w === state.week ? 'cur' : m ? '' : 'bye', `Week ${w}: ${opp}`); }
      return `<span class="cal-n">Week ${Math.min(state.week, SEASON_WEEKS)} of ${SEASON_WEEKS}</span><span class="cal-t">${h}</span>`; }
    case 'PLAYOFFS': { const r = state.playoffs ? state.playoffs.round : 0; return `<span class="cal-n">${ROUND_NAMES[r] || ''}</span><span class="cal-t">${ROUND_NAMES.map((n, i) => tk(i < r ? 'done' : i === r ? 'cur' : '', n)).join('')}</span>`; }
    case 'FA': { const d = state.fa ? state.fa.day : 0; let h = ''; for (let i = 0; i < FA_DAYS; i++) h += tk(i < d ? 'done' : i === d ? 'cur' : '', 'Day ' + (i + 1)); return `<span class="cal-n">Day ${Math.min(d + 1, FA_DAYS)} of ${FA_DAYS}</span><span class="cal-t">${h}</span>`; }
    case 'DRAFT': { const pk = currentPick(), r = pk ? pk.round : DRAFT_ROUNDS; let h = ''; for (let i = 1; i <= DRAFT_ROUNDS; i++) h += tk(i < r ? 'done' : i === r ? 'cur' : '', 'Round ' + i); return `<span class="cal-n">${pk ? `Round ${pk.round}, pick ${pk.pick}` : 'Done'}</span><span class="cal-t">${h}</span>`; }
    case 'UDFA': { const r = state.udfa ? state.udfa.round : 0; let h = ''; for (let i = 0; i < UDFA_ROUNDS; i++) h += tk(i < r ? 'done' : i === r ? 'cur' : '', 'Round ' + (i + 1)); return `<span class="cal-n">Round ${r + 1} of ${UDFA_ROUNDS}</span><span class="cal-t">${h}</span>`; }
    case 'PRESEASON': { const st = preSteps().filter(x => x.k !== 'cut'), c = st.find(x => x.cur); return `<span class="cal-n">${c ? c.l : 'Camp'}</span><span class="cal-t">${st.map(x => tk(x.done ? 'done' : x.cur ? 'cur' : '', x.l)).join('')}</span>`; }
  }
  return '';
}
function calendarHTML() {
  const cur = CAL.findIndex(c => c[0] === state.phase);
  return `<div class="cal"><div class="cal-track">${CAL.map(([k, l], i) => i === cur ? `<div class="cal-st cur"><span class="cal-l">${l}</span>${calSubHTML()}</div>` : `<div class="cal-st ${i < cur ? 'done' : ''}" title="${i < cur ? 'Done' : 'Still to come'}"><span class="cal-d">${i < cur ? '✓' : ''}</span><span class="cal-l">${l}</span></div>`).join('<i></i>')}</div>
    <button class="primary cal-go" data-action="continue">${continueLabel()}</button></div>`;
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
    <span class="muted small">Cap ${fmtMoney(capRoom(t.id))}</span>${rosterOver() && !['CUTDOWN', 'WAIVERS'].includes(state.phase) ? `<button class="sm danger" data-action="nav" data-view="roster" title="You are over the roster limit: make a move before the next game">Roster ${rosterCount(t.id)}/${rosterLimit()}</button>` : ''}
    ${sim2}
    <button data-action="simYear" title="Auto-manages your team through the rest of this season and the offseason">⏭ Sim to Next Season</button>
  </div>${calendarHTML()}${navHTML()}</div>`;
}
// phones: a bottom bar with the pages you live in, and a sheet with everything else
const MNAV_ICON = { home: '⌂', roster: '☰', depth: '▦', practice: '◔', coaches: '♜', playbook: '✎', schedule: '▤', standings: '≡', stats: '∑', trade: '⇄', fa: '✚', search: '⌕', draft: '◆', news: '✉', history: '★', settings: '⚙', cutdown: '✂', waivers: '☑' };
// ---------- navigation: six headers, each with its own row of pages ----------
function navTree() {
  const hist = state.history && state.history.length;
  return [
    ['home', 'Home', [['home', 'Overview'], ['news', 'News']]],
    ['team', 'Team', [['roster', 'Roster'], ...(preOpen() ? [['pre', preCampOn() ? 'Preseason' : 'Roster Planner']] : []), ['depth', 'Depth Chart'], ['practice', 'Practice']]],
    ['staff', 'Staff', [['coaches', 'Coaches'], ['playbook', 'Playbook']]],
    ['league', 'League', [['schedule', 'Schedule'], ['standings', 'Standings'], ['stats', 'League Stats'], ['history', 'History'], ...(hist ? [['season', 'Season Review']] : [])]],
    ['players', 'Players', [['fa', 'Free Agents'], ['trade', 'Trade'], ['search', 'Player Search'], ['draft', 'Draft'], ...(state.phase === 'WAIVERS' ? [['waivers', 'Waiver Wire']] : [])]],
    ['settings', 'Settings', [['settings', 'Settings']]],
  ];
}
// the page where this phase's business is done
function navHot() { return { RECAP: 'season', COACHES: 'coaches', RESIGN: 'roster', FA: 'fa', DRAFT: 'draft', UDFA: 'fa', PRESEASON: state.pre ? 'pre' : 'coaches', CUTDOWN: 'pre', WAIVERS: 'waivers' }[state.phase] || null; }
function navHeadOf(v, tree) { v = v === 'cutdown' || v === 'camp' ? 'pre' : v; const h = (tree || navTree()).find(x => x[2].some(y => y[0] === v)); return h ? h[0] : 'home'; }
const NAV_ICON = { home: '⌂', team: '☰', staff: '♜', league: '≡', players: '✚', settings: '⚙' };
function navHTML() {
  const tree = navTree(), cur = navHeadOf(view, tree), hot = navHot(), v = view === 'cutdown' || view === 'camp' ? 'pre' : view, dot = '<i class="nav-dot" title="This is where the current phase happens"></i>';
  (ui.navLast = ui.navLast || {})[cur] = v;
  const head = tree.find(x => x[0] === cur);
  return `<nav class="tabs">${tree.map(([k, l, subs]) => `<button class="${k === cur ? 'on' : ''}" data-action="navHead" data-h="${k}">${l}${hot && k !== cur && subs.some(y => y[0] === hot) ? dot : ''}</button>`).join('')}</nav>${head[2].length > 1 ? `<nav class="subnav">${head[2].map(([k, l]) => `<button class="${k === v ? 'on' : ''}" data-action="nav" data-view="${k}">${l}${k === hot && k !== v ? dot : ''}</button>`).join('')}</nav>` : ''}`;
}
// phones: no header and no calendar strip. A dock at the bottom holds where the year is, the button that moves it on, and the six headers;
// a header with more than one page opens a small menu above the dock.
function isPhone() { return typeof matchMedia === 'function' && matchMedia('(max-width: 760px)').matches; }
function mobileNavHTML() {
  if (!state) return '';
  const tree = navTree(), cur = navHeadOf(view, tree), hot = navHot(), t = T(state.userTid), v = view === 'cutdown' || view === 'camp' ? 'pre' : view, pop = ui.mPop ? tree.find(x => x[0] === ui.mPop) : null;
  const sims = state.phase === 'REG' ? [['simPlayoffs', '⏩ Sim to the playoffs']] : state.phase === 'PLAYOFFS' ? [['simPlayoffs', '⏩ Finish the playoffs']] : state.phase === 'DRAFT' ? [['simDraft', '⏩ Sim the draft']] : [];
  const menu = !pop ? '' : `<div class="mpop-bg" data-action="mPop" data-h=""></div><div class="mpop"><div class="mpop-h">${pop[1]}</div>${pop[2].map(([k, l]) => `<button class="${k === v ? 'on' : ''}" data-action="nav" data-view="${k}">${l}${k === hot ? '<i class="nav-dot"></i>' : ''}</button>`).join('')}
    ${pop[0] === 'settings' ? [...sims, ['simYear', '⏭ Sim to next season']].map(([a, l]) => `<button class="mpop-x" data-action="${a}">${l}</button>`).join('') : ''}</div>`;
  return `${menu}<div class="mdock"><div class="mgo"><div class="mgo-w"><b>${state.season} · ${PHASE_LABEL[state.phase]}${state.phase === 'REG' ? ' · Wk ' + state.week : ''}</b><span>${esc(t.abbr)} ${recOf(t.id, standings())} · cap ${fmtMoney(capRoom(t.id))}</span></div><button class="primary" data-action="continue">${continueLabel()}</button></div>
    <nav class="mnav">${tree.map(([k, l, subs]) => `<button class="${k === cur ? 'on' : ''} ${pop && pop[0] === k ? 'open' : ''}" data-action="navHead" data-h="${k}"><i>${NAV_ICON[k]}</i><span>${l}${hot && k !== cur && subs.some(y => y[0] === hot) ? ' •' : ''}</span></button>`).join('')}</nav></div>`;
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
    case 'practice': return practiceHTML();
    case 'fa': return faHTML();
    case 'search': return searchHTML();
    case 'cutdown': return state.phase === 'CUTDOWN' ? preHubHTML() : homeHTML(); // cutdown day lives on the preseason page
    case 'waivers': return state.phase === 'WAIVERS' ? waiversHTML() : homeHTML();
    case 'draft': return draftHTML();
    case 'coaches': return coachesHTML();
    case 'carwrap': return carWrapHTML();
    case 'news': return newsHTML();
    case 'history': return historyHTML();
    case 'season': return seasonHTML();
    case 'camp': return preHubHTML();
    case 'pre': return preHubHTML();
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
    case 'COACHES': { const d = state.car ? state.car.day : 0, open = ALL_ROLES.filter(r => !staffCoach(T(u), r)).length; return `Coaching search, day ${d + 1} of ${CAROUSEL_DAYS}. Other clubs hire <b>${DAY_NAME[Math.min(d, 3)].toLowerCase()}</b> when you advance. Interview, negotiate and hire on the <b>Staff</b> tab. You have <b>${open}</b> open job${open === 1 ? '' : 's'} and ${fmtMoney(staffRoom(u))} of staff budget left. Jobs still open when the search closes are filled by the coaches above them.`; }
    case 'RESIGN': { const n = rosterOf(u).filter(p => p.expiring).length; return `You have <b>${n}</b> expiring contract${n === 1 ? '' : 's'}. Re-sign players on the <b>Roster</b> tab. Anyone you don't re-sign becomes a free agent.`; }
    case 'FA': return `Free agency, day ${(state.fa ? state.fa.day : 0) + 1} of ${FA_DAYS}. Every club is bidding and nobody sees the other offers. Sit down with a player's agent on the <b>Free Agents</b> tab; players decide overnight, and prices soften as the days pass.`;
    case 'DRAFT': { const pk = currentPick(); return pk ? `Pick ${pk.pick} (Rd ${pk.round}): <b>${T(pk.owner).abbr}</b> on the clock. ${pk.owner === u ? 'That\'s you! Choose on the <b>Draft</b> tab.' : ''}` : ''; }
    case 'UDFA': { const n = rosterOf(u).length, o = state.udfa ? Object.keys(state.udfa.offers).length : 0; return `Rookie free agency, round ${(state.udfa ? state.udfa.round : 0) + 1} of ${UDFA_ROUNDS}. Every team is bidding for the best undrafted players. Make your offers on the <b>Free Agents</b> tab, then send them. You have <b>${n}</b> of ${OFFSEASON_MAX} camp spots filled and <b>${o}</b> offer${o === 1 ? '' : 's'} out. Nobody is signed for you.`; }
    case 'PRESEASON': return !state.pre ? 'Rookie free agency is over. <b>Meet with your staff</b> on the Staff page: every coach has his view of the roster, the open jobs and what he wants to see. When you are ready, open training camp.' : `Camp and ${PRESEASON_GAMES} exhibition games. Each coach files a <b>camp report</b> on the Staff page after every practice block. Set how long each group plays on the Roster page: a starter who does not play in August opens the season a step slow.`;
    case 'WAIVERS': { const n = onWaivers().length, pos = state.wv.prio.indexOf(u) + 1; return `Cuts are in across the league: <b>${n}</b> players are on waivers. You are <b>#${pos}</b> of ${state.teams.length} in claim order (worst record first). Put in claims and line up your practice squad on the <b>Waiver Wire</b> tab, then start the season.`; }
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
      <div>Schemes</div><div class="small">${esc(teamSchemeLabel(t, 'O') || '—')} · ${esc(teamSchemeLabel(t, 'D') ? teamSchemeLabel(t, 'D') : '—')}</div>
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
// ---------- the staff speaks: the meeting before camp, the report after each practice block ----------
function briefOn() { return !state.settings.autoUser && (state.phase === 'PRESEASON' || (state.phase === 'CUTDOWN' && campOn())); }
function briefHTML(t, role) {
  if (!briefOn()) return '';
  const b = coachBrief(t.id, role); if (!b) return '';
  const on = campOn(), lvl = role === 'HC' ? 'The whole roster' : ['OC', 'DC', 'STC', 'SC'].includes(role) ? 'His side of the building' : SPEC_ROLES.includes(role) ? 'His area' : 'His room';
  return `<div class="card brief"><div class="row"><div><div class="camp-k">${on ? 'Camp report' : 'Prepare for training camp'} · ${lvl}</div><h3 style="margin:2px 0 0">${esc(cname(b.c))} <span class="small muted" style="font-weight:400">${esc(b.title)}${b.eye ? ' · ' + b.eye.toLowerCase() : ''}</span></h3></div><span class="spacer"></span>
    <span class="small muted">${on ? 'Updated after every practice block.' : 'Pick anyone on the chart to hear him out. ← → walks the staff.'}</span></div>
    ${b.sections.length ? b.sections.map(x => `<div class="brief-s"><div class="camp-k">${x.h}</div>${x.lines.map(l => `<p>${l}</p>`).join('')}</div>`).join('') : '<p class="muted small">He has nothing to add right now.</p>'}
    ${on ? '' : '<div class="small muted" style="margin-top:10px">This is advice from one man at his level. When you have heard enough, press <b>Open Training Camp</b>.</div>'}</div>`;
}
// ---------- training camp ----------
const CAMP_CAT = { lock: ['Lock', 'good'], likely: ['Likely', ''], bubble: ['Bubble', 'warn'], ps: ['Practice squad', 'muted'], long: ['Long shot', 'bad'], ir: ['IR', 'muted'] };
function campPlayerBits(p) {
  const rec = campRecord(p), c = p.camp && p.camp.s === state.season ? p.camp : null, g = campGrade(p), sc = c ? c.sc.filter(v => v !== undefined && v !== null) : [];
  const trend = sc.length >= 2 ? (sc[sc.length - 1] - sc[sc.length - 2] >= 6 ? ' <span class="good" title="Better this week">▲</span>' : sc[sc.length - 1] - sc[sc.length - 2] <= -6 ? ' <span class="bad" title="Worse this week">▼</span>' : '') : '';
  const last = p.preS && p.preS.last, sq = p.preS && p.preS.sq, tot = sq ? sq[0] + sq[1] + sq[2] : 0;
  const when = tot ? [['early', sq[0]], ['2nd quarter', sq[1]], ['2nd half', sq[2]]].filter(x => x[1] / tot >= 0.2).map(x => `${Math.round(100 * x[1] / tot)}% ${x[0]}`).join(', ') : '';
  const n = campLastNote(p), lastYr = (p.career || []).filter(x => x.season === state.season - 1 || x.season === state.season).pop();
  return { lastYr, g, grade: gradeChip(g) + trend, weeks: sc.length ? sc.map(v => `<span class="camp-wk">${v}</span>`).join('') : '',
    drills: rec ? `<b>${rec.w}–${rec.l}</b>` : '<span class="muted">—</span>', vs1: rec && rec.v1[0] + rec.v1[1] ? `${rec.v1[0]}–${rec.v1[1]}` : '<span class="muted">—</span>',
    reps: c && c.t !== undefined ? ['Ones', 'Twos', 'Threes'][c.t] : '<span class="muted">—</span>',
    pre: gradeChip(preGrade(p)), snaps: p.preS ? p.preS.snp : 0, when, line: p.preS && p.preS.gp && p.pos !== 'OL' ? statSummary(p.preS.st, p.pos) : '', lastG: last ? gradeChip(last.g) : '',
    traits: campTraits(p).map(([t, cls]) => `<span class="pill ${cls}">${esc(t)}</span>`).join(' '),
    note: n ? `<span class="${n[1] > 0 ? 'good' : n[1] < 0 ? 'bad' : ''}">${n[1] > 0 ? '＋' : n[1] < 0 ? '－' : '·'}</span> ${esc(n[2])}` : '' };
}
// one player's line in the planner: everything camp has shown about him, side by side with the men next to him
const PLAN_VIEWS = [['camp', 'Camp'], ['scout', 'Scouting'], ['contract', 'Contract'], ['st', 'Special teams']];
const PLAN_COLS = { camp: ['Coach has him', 'Reps', 'Camp', 'One-on-ones', 'Games'], scout: ['Coach has him', 'Build', 'Fit', 'Track', 'The read'], contract: ['Salary', 'Years', 'Guaranteed', 'If cut', 'Dead money if cut'], st: ['Special teams', 'Grade', 'Snaps', 'Tackles', 'Units'] };
function planHeadHTML() { const v = PLAN_VIEWS.some(x => x[0] === ui.planView) ? ui.planView : 'camp'; return `<div class="pl-r pl-hd"><span>Player</span>${PLAN_COLS[v].map(l => `<span>${l}</span>`).join('')}<span></span></div>`; }
function planRowHTML(p, bub, rank, g, i) {
  const view = PLAN_VIEWS.some(v => v[0] === ui.planView) ? ui.planView : 'camp', x = campPlayerBits(p), cat = bub[p.id] ? CAMP_CAT[bub[p.id].cat] : null, wl = workLabel(p), cell = (k, body) => `<div class="pl-c"><span class="camp-k">${k}</span>${body}</div>`;
  let mid = '', foot = '';
  // cutdown day: the call, and whether he would get through waivers, sit under his name
  const cutDay = state.phase === 'CUTDOWN' && state.cut && p.tid === state.userTid && countsOn53(p), risk = cutDay ? claimRiskIfCut(p) : '';
  const cutCtl = !cutDay ? '' : `<div class="pl-cut"><span class="seg">${[['keep', 'Keep'], ['cut', 'Cut'], ['ps', 'Practice squad']].map(([k, l]) => `<button class="sm ${(state.cut.plan[p.id] || 'keep') === k ? (k === 'keep' ? 'primary' : k === 'cut' ? 'danger' : 'on') : ''}" data-action="cutSet" data-pid="${p.id}" data-v="${k}">${l}</button>`).join('')}</span><span class="small ${/Will be/.test(risk) ? 'bad' : /Could/.test(risk) ? 'warn' : 'muted'}" title="The staff's read on what happens if you waive him. A player who is claimed cannot come back to your practice squad.">If waived: <b>${risk}</b></span></div>`;
  if (view === 'camp') {
    mid = cell('Coach has him', rank ? `<b>${rank[0]}</b> <span class="small muted">of ${rank[1]}</span>` : '—') + cell('Reps', x.reps) + cell('Camp', `${x.grade}<div class="camp-wks" title="Practice blocks, oldest first">${x.weeks}</div>`) + cell('Drills', `${x.drills}<div class="small muted">vs ones ${x.vs1}</div>`)
      + `<div class="pl-c pl-game">${!x.snaps && x.lastYr ? `<span class="small muted">Last season</span> ${gradeChip(x.lastYr.adv ? x.lastYr.adv.g : null)} <span class="small muted">${x.lastYr.snp || 0} snaps · ${x.lastYr.gs || 0} starts</span><div class="small">${p.pos === 'OL' ? '' : esc(statSummary(x.lastYr, p.pos))}</div>` : `<span class="camp-k">Games</span>${x.pre} <span class="small muted">${x.snaps ? x.snaps + ' snaps' : 'no snaps'}</span>${x.when ? `<div class="small muted">${x.when}</div>` : ''}${x.line ? `<div class="small">${esc(x.line)}</div>` : ''}`}</div>`;
    foot = `${x.traits}${x.note ? ` <span class="small">${x.note}</span>` : ''}`;
  } else if (view === 'scout') {
    const t = scoutTraits(p), dev = isDeveloping(p);
    mid = cell('Coach has him', rank ? `<b>${rank[0]}</b> <span class="small muted">of ${rank[1]}</span>` : '—') + cell('Build', `<span class="small">${htwt(p)}</span>`) + cell('Fit', `<span class="small">${fitLabel(schemeFit(p, p.tid))}</span>`) + cell('Track', trackPill(p) || '—')
      + `<div class="pl-c pl-game"><span class="camp-k">The read</span><span class="small">${esc(scoutProfile(p))}</span>${dev ? `<div class="small muted">Becomes: ${esc(scoutProfile(finishedPlayer(p), true))}</div>` : ''}</div>`;
    foot = t.str.slice(0, 3).map(z => `<span class="pill good">${esc(z)}</span>`).join(' ') + ' ' + t.weak.slice(0, 2).map(z => `<span class="pill bad">${esc(z)}</span>`).join(' ');
  } else if (view === 'contract') {
    const c = p.contract || {}, d = deadIfCut(p), sv = cutSavings(p);
    mid = cell('Salary', `<b>${fmtMoney(c.amt || 0)}</b>`) + cell('Years', p.expiring ? '<span class="warn">Expiring</span>' : (c.yrs || 0) + '') + cell('Guaranteed', c.gtd ? fmtMoney(c.gtd) : '<span class="muted">none</span>') + cell('If cut', `<span class="${sv > 0 ? 'good' : 'muted'}">saves ${fmtMoney(Math.max(0, sv))}</span>`)
      + `<div class="pl-c pl-game"><span class="camp-k">Dead money if cut</span><span class="${d.now + d.next > 0 ? 'bad' : 'muted'}">${fmtMoney(d.now)} now${d.next ? ', ' + fmtMoney(d.next) + ' next year' : ''}</span>${p.exp < WAIVER_EXP && state.phase !== 'REG' ? `<div class="small muted">If waived: ${claimRiskIfCut(p)}</div>` : ''}</div>`;
  } else {
    const w = stWord(p), ch = ensureChart(state.userTid), units = ST_KEYS.filter(k => (ch.lists[k] || []).includes(p.id)).map(k => ST_UNIT[k]), rs = returnScore(p), sg = stGrade(p.stats);
    mid = cell('Special teams', w ? `<span class="pill ${w[1]}">${w[0]}</span>` : '<span class="muted small">Not a special teams body</span>') + cell('Grade', sg !== null ? gradeChip(sg) : '<span class="muted">—</span>') + cell('Snaps', (p.stats && p.stats.sts) || 0) + cell('Tackles', (p.stats && p.stats.stk) || 0)
      + `<div class="pl-c pl-game"><span class="camp-k">Units</span><span class="small">${units.length ? units.join(', ') : '<span class="muted">none</span>'}</span>${rs > 60 ? `<div class="small muted">${rs >= 72 ? 'A real return man' : 'Can return kicks'}</div>` : ''}</div>`;
  }
  return `<div class="pl-r"><div class="pl-who">${g ? `<span class="pl-n">${i + 1}</span>` : ''}<div><div>${playerLink(p)} <span class="small muted">${esc(p.lbl)} · ${p.age} · ${p.exp === 0 ? 'R' : p.exp + 'y'}${view !== 'contract' && p.contract ? ` · ${fmtMoney(p.contract.amt)}${p.expiring ? ', <span class="warn">expiring</span>' : ''}` : ''}</span></div><div class="pl-pills"><span class="pill">${tierOf(p)}</span>${upsidePill(p)}${cat ? ` <span class="pill ${cat[1]}" title="Where his position coach has him today">${cat[0]}</span>` : ''}${wl ? ` <span class="pill on" title="Where he is working">at ${esc(wl)}</span>` : ''}</div></div></div>
    ${mid}<div class="pl-note">${foot}</div>
    <div class="pl-act">${cutCtl}${g ? `<button class="sm" data-action="planMove" data-gid="${g.id}" data-pid="${p.id}" data-dir="-1" title="Move up" ${i === 0 ? 'disabled' : ''}>▲</button><button class="sm" data-action="planMove" data-gid="${g.id}" data-pid="${p.id}" data-dir="1" title="Move down" ${i === g.pids.length - 1 ? 'disabled' : ''}>▼</button><button class="sm" data-action="planRemove" data-gid="${g.id}" data-pid="${p.id}" title="Take him out of this group">✕</button>` : ''}</div></div>`;
}
// =====================================================================
//  THE PRESEASON PAGE: the calendar, the staff meeting, the reps chart, and all ninety men followed week to week.
//  One thing on screen at a time; the detail is a click down, not spread across the page.
// =====================================================================
const PRE_ROOMS = [['ALL', 'Everyone'], ['QB', 'QB'], ['RB', 'RB'], ['WR', 'WR'], ['TE', 'TE'], ['OL', 'OL'], ['DL', 'DL'], ['LB', 'LB'], ['DB', 'DB'], ['ST', 'K/P']];
function preRoomOf(p) { const c = cpos(p); return c === 'CB' || c === 'S' ? 'DB' : c === 'K' || c === 'P' ? 'ST' : c; }
function preCamped() { return !!(state.pre && (state.pre.camped || (state.camp && state.camp.blocks >= 2))); }
function preNextLabel() { return !state.pre ? 'camp opens' : !preCamped() ? 'two weeks of camp' : state.phase === 'CUTDOWN' ? 'the cuts' : `exhibition ${state.pre.wk + 1}`; }
// camp is on the field (the meeting, the chart and the tracker have something to show); the page itself opens with the offseason
function preCampOn() { return !!(state && state.pre && state.camp && ['PRESEASON', 'CUTDOWN'].includes(state.phase)); }
function preOpen() { return !!state && (planOn() || preCampOn()); }
function preTabs() { const cut = state.phase === 'CUTDOWN' && !!state.cut;
  return [...(preCampOn() ? [['meet', 'Staff meeting'], ['reps', 'Reps chart'], ['track', 'Man by man']] : []), ...(cut ? [['cut', 'The cuts']] : []), ['bubble', `The ${ROSTER_MAX}`], ['plan', 'Compare']]; }
function preTabNow() { const t = preTabs(); return t.some(x => x[0] === ui.preTab) ? ui.preTab : t[0][0]; }
function preHubHTML() {
  if (!preOpen()) return '<div class="pagehead"><div><h1>Roster planner</h1></div></div><div class="card"><p class="muted">This page opens when the season ends and stays through the coaching search, free agency, the draft and camp, until your cuts are final.</p></div>';
  const camp = preCampOn(), u = state.userTid, ro = rosterOf(u), on = ro.filter(countsOn53), d = on.length - ROSTER_MAX; if (camp) ensureReps();
  const tabs = preTabs(), tab = preTabNow();
  return `<div class="pagehead"><div><h1>${camp ? 'Preseason' : 'Roster planner'}</h1><div class="sub">${camp ? `${ro.length} men, ${ROSTER_MAX} jobs. Next: ${preNextLabel()}.` : `${PHASE_LABEL[state.phase]} · camp has not opened · ${on.length} on the roster, ${d > 0 ? d + ' over ' + ROSTER_MAX : -d + ' under ' + ROSTER_MAX}`}</div></div></div>
    <div class="ph-tabs">${tabs.map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" data-action="preTab" data-v="${k}">${l}</button>`).join('')}</div>
    ${tab === 'reps' ? preRepsHTML() : tab === 'track' ? preTrackHTML() : tab === 'meet' ? preMeetHTML() : tab === 'cut' ? cutdownHTML() : preCutBarHTML() + (tab === 'bubble' ? preBubbleHTML() : preCompareHTML())}`;
}
// ---- the meeting: one coach at a time, in his own words, with his room in front of you ----
function preMeetHTML() {
  const u = state.userTid, rooms = campMeeting(u), adv = repsAdvice(u), own = Object.keys(state.reps.own).length, pl = p => playerLink(p, true), bub = campBubble(u);
  const inRoom = (r, p) => r.role === 'ST' ? ['K', 'P'].includes(cpos(p)) : (CAMP_ROOMS.find(x => x[0] === r.role) || [0, []])[1].includes(cpos(p));
  const asks = r => adv.filter(a => { const p = P(a.pid); return p && inRoom(r, p); });
  const r = rooms.find(x => x.role === ui.meetRole) || rooms.find(x => asks(x).length) || rooms[0]; if (!r) return '<div class="callout">Nobody to meet with.</div>';
  const mine = asks(r), say = (cs, ms) => `${cs < ms ? 'up' : 'down'} with the <b>${REP_STRING[cs].toLowerCase()}</b>`, note = p => { const n = campLastNote(p); return n ? ` <span class="muted">${esc(n[2])}</span>` : ''; };
  let h = `<div class="mt-pick">${rooms.map(x => { const n = asks(x).length; return `<button class="${x === r ? 'on' : ''}" data-action="meetRole" data-v="${x.role}"><b>${x.role === 'ST' ? 'K/P' : x.role}</b><span>${x.c ? esc(x.c.last) : 'Vacant'}</span>${n ? `<i>${n}</i>` : ''}</button>`; }).join('')}
    ${own ? `<button class="mt-all" data-action="repsRs" data-k="" title="Every job goes back to the order its coach would set">Use the coaches’ chart everywhere</button>` : ''}</div>`;
  const said = [];
  if (r.star) said.push(['good', 'Standing out', pl(r.star) + note(r.star)]);
  if (r.worry) said.push(['bad', 'A concern', pl(r.worry) + note(r.worry)]);
  if (r.push) said.push(['note', 'His man', `${pl(r.push.p)} <span class="muted">He rates him above where you have him${r.push.why ? ': ' + esc(r.push.why) : '.'}</span>`]);
  if (r.cool) said.push(['', 'Cooler on', `${pl(r.cool)} <span class="muted">He is not as sold as the room’s reputation.</span>`]);
  h += `<div class="card mt-card"><div class="mt-head"><div class="mt-face">${r.c ? esc((r.c.first || ' ')[0] + (r.c.last || ' ')[0]) : '—'}</div><div><h2>${r.c ? esc(cname(r.c)) : 'No coach in this room'}</h2><div class="muted">${esc({ QB: 'Quarterbacks', RB: 'Running backs', WR: 'Receivers', TE: 'Tight ends', OL: 'Offensive line', DL: 'Defensive line', LB: 'Linebackers', DB: 'Secondary', ST: 'Specialists' }[r.role] || r.role)} · ${r.n} men · ${esc(r.eye)}</div></div>
      <span style="flex:1"></span><div class="mt-when">Before ${preNextLabel()}</div></div>
    <div class="mt-cols"><div>
      <div class="mt-h">What he tells you</div>${said.length ? said.map(([c, t, x]) => `<div class="mt-say"><span class="ph-tag ${c}">${t}</span><div>${x}</div></div>`).join('') : '<div class="muted small" style="padding:6px 0">He has nothing for you yet. Ask him again after a week of practice.</div>'}
      <div class="mt-h mt-hx" style="margin-top:14px"><span>Where he would change your chart</span>${mine.length > 1 ? `<button class="sm" data-action="meetAll" data-v="${r.role}">Take all ${mine.length}</button>` : ''}</div>
      ${mine.length ? mine.map(a => `<div class="mt-say mt-ask"><span class="ph-tag warn">${esc(a.k)}</span><div>He would have ${pl(P(a.pid))} ${say(a.cs, a.ms)} at ${esc(REP_JOB[a.k][1].toLowerCase())}. <span class="muted">You have him with the ${REP_STRING[a.ms].toLowerCase()}.</span></div><button class="sm" data-action="repsDo" data-k="${a.k}" data-pid="${a.pid}" data-s="${a.cs}">Do it</button></div>`).join('') : `<div class="muted small" style="padding:6px 0">${own ? 'Nothing: he would draw this room the way you have.' : 'Nothing: the chart for his room is still his own.'}</div>`}
    </div><div>
      <div class="mt-h">His room, in his order</div>
      <div class="mt-ord head"><span></span><span>Player</span><span>Staff has him</span><span>Your chart</span><span class="ph-num">Camp</span><span class="ph-num">One-on-ones</span></div>
      ${r.order.map((o, i) => { const p = o.p, x = campPlayerBits(p), cat = CAMP_CAT[o.cat], jobs = repsJobsOf(p.id);
        return `<div class="mt-ord"><span class="mt-rk">${i + 1}</span><span class="ph-who">${pl(p)}<span class="muted"> ${esc(p.lbl)} · ${p.age}</span></span><span>${cat ? `<span class="pill ${cat[1]}">${cat[0]}</span>` : ''}</span><span>${jobs.map(j => `<span class="ph-js s${j.s}">${esc(j.k)} ${j.s + 1}s</span>`).join('')}</span><span class="ph-num">${x.grade}</span><span class="ph-num">${x.drills}</span></div>`; }).join('')}
    </div></div></div>`;
  return h;
}
// ---- the reps chart ----
function repChipTone(p) { const c = p.camp && p.camp.s === state.season ? p.camp : null, sc = c ? c.sc.filter(v => v !== undefined && v !== null) : []; if (p.injury) return 'inj'; if (sc.length < 2) return ''; const d = sc[sc.length - 1] - sc[sc.length - 2]; return d >= 6 ? 'up' : d <= -6 ? 'dn' : ''; }
// Built like the depth chart, and worked the same way: pick a unit and a group, each job is a card with its men in order,
// the bench on the right lists everyone who could work the job you have selected. Drag a man to a place, + to add him, × to take him off.
const REP_GROUPS = { off: [['Backfield', ['QB', 'RB', 'FB']], ['Receivers', ['X', 'Z', 'SLOT']], ['Tight ends', ['Y', 'H']], ['Offensive line', ['LT', 'LG', 'C', 'RG', 'RT']]],
  def: [['Defensive line', ['EDGE', 'DE', 'DT', 'NT']], ['Linebackers', ['MLB', 'WLB']], ['Secondary', ['CB', 'NCB', 'FS', 'SS']]], st: [['Kicking game', ['K', 'P']]] };
function repChip(p, k, i, n) {
  const tone = repChipTone(p), two = repsJobsOf(p.id), second = two.length > 1 && two[0].k !== k;
  return `<div class="dcc ${i < n ? 'st' : ''} ${ui.repsPid === p.id ? 'pk' : ''} rp-${tone}" draggable="true" data-rpp="${p.id}" data-rpjob="${k}" data-rpi="${i}" data-action="repsMan" data-pid="${p.id}" data-k="${k}" title="${esc(pname(p))} · ${esc(p.lbl)} · age ${p.age}${second ? ' · his second job' : ''}${p.injury ? ' · ' + esc(p.injury.name) : ''}">
    <span class="dcc-n">${i + 1}</span><button class="link dcc-nm" data-action="player" data-pid="${p.id}" title="${esc(pname(p))} — open his card">${esc(p.last)}</button>${second ? '<span class="rp-2" title="His second job">2nd</span>' : ''}${tone === 'up' ? '<span class="good" title="Better this week">▲</span>' : tone === 'dn' ? '<span class="bad" title="Worse this week">▼</span>' : tone === 'inj' ? '<span class="warn" title="Hurt">✚</span>' : ''}<span class="dcc-sp"></span><button class="dcc-x" data-action="repsRm" data-k="${k}" data-pid="${p.id}" title="Take him off this job" aria-label="Remove ${esc(p.last)}">×</button></div>`;
}
function repJobCard(k, R) {
  const J = REP_JOB[k], n = J[3], list = (R.jobs[k] || []).map(P).filter(Boolean), on = ui.repsJob === k, own = !!R.own[k];
  return `<div class="dcj ${on ? 'on' : ''}" data-action="repsJob" data-k="${k}" data-rpjob="${k}">
    <div class="dcj-h"><b>${esc(J[1])}</b>${n > 1 ? `<span class="dcj-tag two" title="Two men work with each string at this job">${n} a string</span>` : ''}${own ? `<span class="dcj-tag rp-own" title="You have changed this job. It stays as you set it until you hand it back.">yours</span><button class="rp-back" data-action="repsRs" data-k="${k}" title="Hand this job back to its coach">↺</button>` : `<span class="dcj-tag" title="In the order its coach sees it. It follows his board until you change it.">coach</span>`}</div>
    <div class="dcj-list">${list.length ? '<div class="dcj-div first"><span>the ones</span></div>' : ''}${list.map((p, i) => (i === n ? '<div class="dcj-div"><span>the twos</span></div>' : i === 2 * n ? '<div class="dcj-div"><span>the threes</span></div>' : '') + repChip(p, k, i, n)).join('')}<div class="dcj-drop ${list.length ? 'more' : ''}" data-rpjob="${k}" data-rpi="${list.length}">${list.length ? 'drop here' : 'drag a player here'}</div></div></div>`;
}
function preRepsHTML() {
  const u = state.userTid, R = state.reps, unit = ['off', 'def', 'st'].includes(ui.repsUnit) ? ui.repsUnit : 'off', ro = rosterOf(u), bub = campBubble(u);
  const groups = REP_GROUPS[unit]; ui.repsGrp = ui.repsGrp || {};
  let grp = groups.find(g => g[0] === ui.repsGrp[unit]) || groups[0];
  if (ui.repsJob && REP_JOB[ui.repsJob] && REP_JOB[ui.repsJob][4] === unit && !grp[1].includes(ui.repsJob)) grp = groups.find(g => g[1].includes(ui.repsJob)) || grp;
  ui.repsGrp[unit] = grp[0];
  const job = grp[1].includes(ui.repsJob) ? ui.repsJob : grp[1][0]; ui.repsJob = job;
  const J = REP_JOB[job], list = R.jobs[job] || [];
  const tabs = `<div class="dc2-tabs">${[['off', 'Offense'], ['def', 'Defense'], ['st', 'Kicking']].map(([k, l]) => `<button class="${k === unit ? 'on' : ''}" data-action="repsUnit" data-v="${k}">${l}</button>`).join('')}</div>`;
  const nOwn = Object.keys(R.own).length, ctl = `<div class="dc2-ctl"><span class="small muted">${nOwn ? `You have set ${nOwn} job${nOwn === 1 ? '' : 's'}; the coaches set the rest.` : 'The coaches have set every job.'}</span>${nOwn ? `<button class="sm" data-action="repsRs" data-k="">Hand it all back</button>` : ''}</div>`;
  const grpSel = `<div class="dc2-gsel">${groups.map(([title]) => `<button class="${title === grp[0] ? 'on' : ''}" data-action="repsGrp" data-v="${esc(title)}">${esc(title)}</button>`).join('')}</div>`;
  const cards = `<div class="dc2-cards one" style="--n:${grp[1].length}">${grp[1].map(k => repJobCard(k, R)).join('')}</div>`;
  // the bench: everyone who could work the selected job, best first by the coach's read of him there
  const can = ro.filter(p => repsCanWork(p, job)).sort((a, b) => (b.a ? jobRead(b, J[2], u) : b.ovr) - (a.a ? jobRead(a, J[2], u) : a.ovr));
  const pickP = ui.repsPid && ro.some(p => p.id === ui.repsPid) ? P(ui.repsPid) : list.length ? P(list[0]) : can[0] || null;
  const benchRow = p => { const on = list.includes(p.id), cat = bub[p.id] ? CAMP_CAT[bub[p.id].cat] : null, js = repsJobsOf(p.id).filter(x => x.k !== job);
    return `<div class="dcb ${pickP && pickP.id === p.id ? 'pk' : ''} ${on ? 'in' : ''}" draggable="true" data-rpp="${p.id}" data-action="repsMan" data-pid="${p.id}"><span class="dcb-nm"><button class="link" data-action="player" data-pid="${p.id}" title="Open his full card">${esc(pname(p))}</button></span><span class="dcb-pos">${esc(p.lbl)} · ${p.age}</span>
      ${cat ? `<span class="pill ${cat[1]}">${cat[0]}</span>` : ''}${js.map(x => `<span class="pill muted" title="Also on the chart at ${esc(REP_JOB[x.k][1].toLowerCase())}">${esc(x.k)} ${x.s + 1}s</span>`).join('')}
      ${on ? '<span class="dcb-in">on the card</span>' : `<button class="sm" data-action="repsPut" data-k="${job}" data-pid="${p.id}" title="Give him a look at this job">+</button>`}</div>`; };
  let big = '';
  if (pickP) { const x = campPlayerBits(pickP), js = repsJobsOf(pickP.id), cat = bub[pickP.id] ? CAMP_CAT[bub[pickP.id].cat] : null, note = campLastNote(pickP), here = js.find(q => q.k === job);
    big = `<div class="card rp-big"><div class="row" style="gap:8px"><button class="link rp-nm" data-action="player" data-pid="${pickP.id}" title="Open his card">${esc(pname(pickP))}</button><span class="muted">${esc(pickP.lbl)} · ${pickP.age}${pickP.exp === 0 ? ' · rookie' : ''}</span><span class="spacer"></span>${cat ? `<span class="pill ${cat[1]}">${cat[0]}</span>` : ''}</div>
      <div class="rp-kv"><span>On your chart</span><b>${js.map(q => `${esc(REP_JOB[q.k][1])}, ${REP_STRING[q.s].toLowerCase()}`).join(' · ') || 'nowhere'}</b></div>
      <div class="rp-kv"><span>Camp grade</span><b>${x.grade}${x.weeks ? ' ' + x.weeks : ''}</b></div><div class="rp-kv"><span>One-on-ones</span><b>${x.drills} <span class="muted small">(${x.vs1} against the ones)</span></b></div>
      ${note ? `<div class="ph-note" style="margin-top:6px">“${esc(note[2])}”</div>` : ''}
      <div class="row" style="gap:8px;margin-top:10px">${here || repsCanWork(pickP, job) ? `<span class="seg">${[0, 1, 2].map(st => `<button class="sm ${here && here.s === st ? 'on' : ''}" data-action="repsDo" data-k="${job}" data-pid="${pickP.id}" data-s="${st}" title="${esc(J[1])}: with the ${REP_STRING[st].toLowerCase()}">${REP_STRING[st]}</button>`).join('')}</span><span class="small muted">at ${esc(J[1].toLowerCase())}</span>` : `<span class="small muted">He cannot work at ${esc(J[1].toLowerCase())}.</span>`}<span class="spacer"></span><button class="sm" data-action="player" data-pid="${pickP.id}">His file</button></div></div>`; }
  const benchCard = `<div class="dc2-side rp-side"><div class="card dc2-bench"><div class="dc2-bh"><div><div class="dc2-bk">Who could work at</div><h3 style="margin:0">${esc(J[1])}</h3></div><span class="small muted">${can.length} men</span></div>
    <div class="dc2-bl">${can.map(benchRow).join('') || '<div class="muted small">Nobody on the roster can work here.</div>'}</div></div>${big}</div>`;
  return `<div class="dc2"><div class="dc2-top">${tabs}${ctl}</div>
    <div class="dc2-main"><div class="dc2-left"><div class="dc2-jobs">${grpSel}${cards}</div>
      <div class="small muted" style="margin-top:8px"><b>Drag a man</b> to a place in a job’s order, from the list on the right or from another card. <b>+</b> gives him a look at the job you have selected; <b>×</b> takes him off; his name opens his card. The ones face the ones in practice and start the exhibitions; the threes get the second half.</div></div>${benchCard}</div></div>`;
}
// ---- the roster, man by man ----
function preTrackRow(p, bub, open) {
  const x = campPlayerBits(p), jobs = repsJobsOf(p.id), cat = bub[p.id] ? CAMP_CAT[bub[p.id].cat] : null, c = p.camp && p.camp.s === state.season ? p.camp : null, pre = p.preS;
  let h = `<div class="ph-row ${open ? 'open' : ''}" data-action="trk" data-pid="${p.id}"><div class="ph-who"><button class="link" data-action="player" data-pid="${p.id}" title="Open his card"><b>${esc(pname(p))}</b></button><span class="muted"> ${esc(p.lbl)} · ${p.age}${p.exp === 0 ? ' · rookie' : ''}</span>${p.injury ? ` <span class="pill inj" title="${esc(p.injury.name)}">${p.injury.weeks}w</span>` : ''}</div>
    <div class="ph-job1">${jobs.length ? jobs.map(j => `<span class="ph-js s${j.s}" title="${esc(REP_JOB[j.k][1])}: with the ${REP_STRING[j.s].toLowerCase()}">${esc(j.k)} ${j.s + 1}s</span>`).join('') : '<span class="muted">—</span>'}</div>
    <div>${cat ? `<span class="pill ${cat[1]}">${cat[0]}</span>` : ''}</div>
    <div class="ph-num">${x.grade}${x.weeks ? `<span class="ph-wks">${x.weeks}</span>` : ''}</div>
    <div class="ph-num">${x.drills}<span class="muted small"> · ${x.vs1} v ones</span></div>
    <div class="ph-num">${pre && pre.snp ? `${pre.snp} snaps ${gradeChip(preGrade(p))}` : '<span class="muted">—</span>'}</div><span class="ph-chev">▾</span></div>`;
  if (!open) return h;
  const log = (c && c.log) || [], wk = log.map((w, b) => { if (!w) return ''; const ty = Object.keys(w.ty || {}).map(k => `<div class="ph-kv"><span>${REP_DRILL[k] || k}</span><b>${w.ty[k][0]}–${w.ty[k][1]}</b></div>`).join(''), note = (c.notes || []).find(n => n[0] === b);
    return `<div class="ph-wk"><div class="ph-wh"><b>${esc(w.lb || 'Week ' + (b + 1))}</b><span class="ph-js s${w.t}">${REP_STRING[w.t]}</span>${gradeChip(c.sc[b])}</div>
      ${ty || '<div class="muted small">No one-on-one work.</div>'}${w.v1 && w.v1[0] + w.v1[1] ? `<div class="ph-kv"><span>Against the ones</span><b>${w.v1[0]}–${w.v1[1]}</b></div>` : ''}
      ${w.up || w.dn ? `<div class="ph-kv"><span>Team periods</span><b>${w.up ? `<span class="good">${w.up} that stood out</span>` : ''}${w.up && w.dn ? ', ' : ''}${w.dn ? `<span class="bad">${w.dn} bad</span>` : ''}</b></div>` : ''}
      ${w.line ? `<div class="small muted">${esc(w.line)}</div>` : ''}${note ? `<div class="ph-note">“${esc(note[2])}”</div>` : ''}</div>`; }).join('');
  const games = ((pre && pre.log) || []).map(g => `<div class="ph-wk game"><div class="ph-wh"><b>Exhibition ${g.wk}</b>${gradeChip(g.g)}</div><div class="ph-kv"><span>Snaps</span><b>${g.snp || 0}</b></div>${g.line ? `<div class="small muted">${esc(g.line)}</div>` : ''}</div>`).join('');
  return h + `<div class="ph-detail">${wk || games ? wk + games : '<div class="muted small">Nothing on him yet: camp has not started.</div>'}
    <div class="ph-dact"><button class="sm" data-action="player" data-pid="${p.id}">Open his file</button>${jobs[0] ? `<button class="sm" data-action="repsGo" data-k="${jobs[0].k}" data-pid="${p.id}">Find him on the chart</button>` : ''}</div></div>`;
}
function preTrackHTML() {
  const u = state.userTid, bub = campBubble(u), room = PRE_ROOMS.some(r => r[0] === ui.trkRoom) ? ui.trkRoom : 'ALL', sort = ui.trkSort || 'chart', open = ui.trkOpen || {};
  const move = p => { const c = p.camp && p.camp.s === state.season ? p.camp : null, sc = c ? c.sc.filter(v => v !== undefined && v !== null) : []; return sc.length >= 2 ? sc[sc.length - 1] - sc[sc.length - 2] : 0; };
  const key = { chart: p => repsString(p.id) * 100 + (bub[p.id] ? bub[p.id].i : 50), grade: p => -(campGrade(p) || 0), move: p => -move(p), fall: p => move(p), bubble: p => ({ bubble: 0, ps: 1, likely: 2, long: 3, lock: 4, ir: 5 }[bub[p.id] ? bub[p.id].cat : 'long']) }[sort] || (p => 0);
  let h = `<div class="ph-bar"><span class="seg">${PRE_ROOMS.map(([k, l]) => `<button class="sm ${k === room ? 'on' : ''}" data-action="trkRoom" data-v="${k}">${l}</button>`).join('')}</span>
    <label class="small muted">Order by</label><select data-change="trkSort">${[['chart', 'The chart'], ['grade', 'Camp grade'], ['move', 'Rising'], ['fall', 'Falling'], ['bubble', 'On the bubble first']].map(([k, l]) => `<option value="${k}" ${k === sort ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <span class="small muted">Click a man for his week-by-week.</span></div>
    <div class="ph-thead"><span>Player</span><span>Job · string</span><span>Staff has him</span><span class="ph-num">Camp grade</span><span class="ph-num">One-on-ones</span><span class="ph-num">Exhibitions</span><span></span></div>`;
  for (const [rk, rl] of PRE_ROOMS.slice(1)) { if (room !== 'ALL' && room !== rk) continue;
    const l = rosterOf(u).filter(p => preRoomOf(p) === rk).sort((a, b) => key(a) - key(b)); if (!l.length) continue;
    h += `<div class="ph-group"><span>${rl}</span><span class="muted">${l.length} men</span></div>` + l.map(p => preTrackRow(p, bub, !!open[p.id])).join(''); }
  return `<div class="card ph-track">${h}</div>`;
}
// cutdown day: the count that matters, above the planner and the bubble
function preCutBarHTML() {
  if (state.phase !== 'CUTDOWN' || !state.cut) return '';
  const u = state.userTid, ro = rosterOf(u), on = ro.filter(countsOn53), plan = state.cut.plan, gone = v => v === 'cut' || v === 'ps', keeps = on.filter(p => !gone(plan[p.id])), need = keeps.length - ROSTER_MAX, psN = on.filter(p => plan[p.id] === 'ps').length;
  return `<div class="card bb-cut"><div class="row"><div class="fig-v ${need > 0 ? 'bad' : 'good'}">${keeps.length}<span class="bb-of"> / ${ROSTER_MAX}</span></div><div class="small muted">${need > 0 ? `Cut ${need} more to get to ${ROSTER_MAX}` : need < 0 ? `${-need} open spot${need === -1 ? '' : 's'}: nobody will be signed for you` : 'Roster is set'}<br>practice squad ${psN}/${PS_MAX} marked · ${ro.length - on.length} heading to IR</div>
    <span class="spacer"></span><button data-action="cutStaff">Use the staff's recommendations</button><button data-action="cutClear">Clear my cuts</button><button class="primary" data-action="preTab" data-v="cut">The cut list</button></div></div>` + campObjectionsHTML(u, plan);
}
// the staff's roster as it stands: five printed figures, then one side of the ball at a time, each room in its coach's order
const BUB_UNITS = [['off', 'Offense', ['QB', 'RB', 'WR', 'TE', 'OL']], ['def', 'Defense', ['DL', 'LB', 'CB', 'S']], ['st', 'Specialists', ['K', 'P']]];
function preBubbleHTML() {
  const u = state.userTid, ro = rosterOf(u), on = ro.filter(countsOn53), bub = campBubble(u), cnt = k => on.filter(p => bub[p.id] && bub[p.id].cat === k).length, d = on.length - ROSTER_MAX;
  const fig = (v, l, st, cls, i) => `<div class="fig"><div class="fig-v">${v}</div><div class="fig-l">${l}</div>${st ? `<span class="stamp ${cls} s${i}">${st}</span>` : ''}</div>`;
  const unit = BUB_UNITS.find(x => x[0] === ui.bubUnit) || BUB_UNITS[0];
  let h = `<div class="card bb-top"><div class="ds-lb">The staff’s ${ROSTER_MAX}, as it stands today</div><div class="figs five">
      ${fig(on.length, 'on the roster', d > 0 ? d + ' to cut' : d < 0 ? 'room for ' + -d : 'at the limit', d > 0 ? 'bad' : 'good', 0)}${fig(cnt('lock') + cnt('likely'), 'locks and likely', 'safe', 'good', 1)}${fig(cnt('bubble'), 'on the bubble', 'undecided', 'note', 2)}${fig(cnt('ps'), 'practice-squad candidates', 'stash', '', 3)}${fig(cnt('long'), 'long shots', 'long odds', 'bad', 0)}</div>
    <div class="ds-devl">Room by room, in each coach’s order. The line is where he would stop if he had to cut today${ro.length - on.length ? `; ${ro.length - on.length} more are heading to injured reserve and do not count` : ''}. It is his opinion, and it sharpens as camp goes on.</div></div>
    <div class="row bb-bar"><span class="seg">${BUB_UNITS.map(([k, l, ps]) => `<button class="sm ${k === unit[0] ? 'on' : ''}" data-action="bubUnit" data-v="${k}">${l} <span class="muted">${on.filter(p => ps.includes(cpos(p))).length}</span></button>`).join('')}</span></div><div class="camp-bub bb-rooms" style="--n:${unit[2].length}">`;
  for (const pos of unit[2]) { const l = ro.filter(p => cpos(p) === pos && bub[p.id]).sort((a, b) => bub[a.id].i - bub[b.id].i); if (!l.length) continue; const line = ROSTER_TEMPLATE[pos], c = campCoach(u, pos);
    h += `<div class="card camp-room bb-room"><div class="bb-rh"><div><h3>${ROOM_NAME[pos] || (pos === 'K' ? 'Kickers' : 'Punters')}</h3><div class="ds-lb">${c ? esc(c.last) : 'no coach'} · carrying ${l.filter(p => countsOn53(p)).length} · keeps ${line}</div></div></div>
      ${l.map((p, i) => { const cat = CAMP_CAT[bub[p.id].cat], g = campGrade(p); return `${i === line && bub[p.id].cat !== 'ir' ? '<div class="camp-line"><span>the line</span></div>' : ''}<div class="camp-br ${i >= line ? 'out' : ''}"><span class="mt-rk">${i + 1}</span>${playerLink(p, true)} <span class="small muted">${p.age}</span><span class="spacer"></span><span class="pill ${cat[1]}">${cat[0]}</span>${gradeChip(g)}</div>`; }).join('')}</div>`; }
  return h + '</div>';
}
// your own comparisons: any men, in any groups, side by side. It changes nothing on the chart or the roster.
function preCompareHTML() {
  const u = state.userTid, ro = rosterOf(u), camp = campOn(), cm = camp ? state.camp : { battles: [], blocks: 0 }; let html = '';
    const pl = ensurePlan(), bub = campBubble(u), room = PLAN_ROOMS.find(r => r[0] === ui.campRoom) || PLAN_ROOMS[0], [rk, rname, poss] = room;
    const all = ro.filter(p => p.a && poss.includes(cpos(p))), groups = (pl.groups[rk] || []);
    for (const g of groups) g.pids = g.pids.filter(id => { const p = P(id); return p && p.tid === u; });
    // each coach's order in his room, as a rank
    const rankOf = {}; for (const pos of poss) { const l = all.filter(p => cpos(p) === pos).sort((a, b) => coachRead(b, u) - coachRead(a, u)); l.forEach((p, i) => rankOf[p.id] = [i + 1, l.length]); }
    html += `<div class="pl-rooms">${PLAN_ROOMS.map(r => { const n = ro.filter(p => r[2].includes(cpos(p))).length; return `<button class="${r[0] === rk ? 'on' : ''}" data-action="campRoom" data-room="${r[0]}">${r[0]}<span>${n}</span></button>`; }).join('')}<span class="spacer"></span><span class="seg" title="What to show beside each man">${PLAN_VIEWS.map(([k, l]) => `<button class="sm ${(ui.planView || 'camp') === k ? 'on' : ''}" data-action="planView" data-v="${k}">${l}</button>`).join('')}</span><button class="sm" data-action="campRoomStep" data-dir="-1" title="Previous room (←)">←</button><button class="sm" data-action="campRoomStep" data-dir="1" title="Next room (→)">→</button></div>`;
    // the coach's word on this room
    const meet = !camp ? (() => { const c = campCoach(u, poss[0]); return { c, eye: campEyeWord(c), star: null, push: null, cool: null, worry: null }; })() : campMeeting(u).filter(m => (m.role === 'ST' ? ['K', 'P'] : m.role === 'DB' ? ['CB', 'S'] : [m.role]).some(x => poss.includes(x)))[0];
    const say = []; if (meet) { const inRoom = p => p && poss.includes(p.pos);
      if (inRoom(meet.star)) say.push(`<b>${playerLink(meet.star, true)}</b> had the best week.`);
      if (meet.push && inRoom(meet.push.p)) say.push(`Pushing for <b>${playerLink(meet.push.p, true)}</b>: ${esc(meet.push.why)}.`);
      if (inRoom(meet.cool)) say.push(`Has cooled on <b>${playerLink(meet.cool, true)}</b>.`);
      if (inRoom(meet.worry)) say.push(`<b>${playerLink(meet.worry, true)}</b> had a rough week.`); }
    const hints = cm.battles.filter(b => poss.includes(b.pos));
    html += `<div class="card pl-head"><div class="row"><div><div class="camp-k">${rname} · ${all.length} on the roster · staff would keep ${poss.reduce((s, x) => s + ROSTER_TEMPLATE[x], 0)}</div><h3 style="margin:2px 0 0">${meet && meet.c ? coachNameLink(meet.c) : '<span class="muted">No position coach</span>'} <span class="small muted" style="font-weight:400">${meet && meet.c ? esc(meet.c.style || '') + ' · ' : ''}${meet ? meet.eye.toLowerCase() : ''}</span></h3></div><span class="spacer"></span>
      <input type="text" placeholder="New group, e.g. Backup X" maxlength="40" data-change="planNew" data-room="${rk}" style="width:210px"><button class="sm" data-action="planReset" data-room="${rk}" title="Throw away your groups in this room and start from the staff's chart">Reset room</button></div>
      ${say.length ? `<div class="small" style="margin-top:8px">${say.join(' ')}</div>` : ''}
      ${hints.length ? `<div class="small pl-hints">${hints.map(b => `<span><span class="muted">Too close to call for the staff:</span> <b>${esc(b.label)}</b> — ${battleBoard(b).map(r => esc(r.p.last)).join(', ')} <button class="sm" data-action="planFromBattle" data-bid="${b.id}" data-room="${rk}">Make it a group</button></span>`).join('')}</div>` : ''}</div>`;
    const grouped = new Set(groups.flatMap(g => g.pids));
    for (const g of groups) {
      const ps = g.pids.map(id => P(id)), free = all.filter(p => !g.pids.includes(p.id)).sort((a, b) => rankOf[a.id][0] - rankOf[b.id][0]);
      html += `<div class="card pl-g"><div class="row pl-gh"><input type="text" class="pl-name" value="${esc(g.name)}" maxlength="40" data-change="planName" data-gid="${g.id}" title="Rename this group"><span class="small muted">${ps.length} ${ps.length === 1 ? 'man' : 'men'}</span><span class="spacer"></span>
        <select data-change="planAdd" data-gid="${g.id}"><option value="">Add a player…</option>${free.map(p => `<option value="${p.id}">${esc(p.lbl)} ${esc(pname(p))}${grouped.has(p.id) ? '' : ' ·'}</option>`).join('')}<option value="other">Someone from another room…</option></select>
        <button class="sm" data-action="planGroupMove" data-gid="${g.id}" data-dir="-1" title="Move this group up">▲</button><button class="sm" data-action="planGroupMove" data-gid="${g.id}" data-dir="1" title="Move this group down">▼</button><button class="sm danger" data-action="planDelete" data-gid="${g.id}" title="Delete this group">Delete</button></div>
        ${ps.length ? `<div class="pl-rows">${planHeadHTML()}${ps.map((p, i) => planRowHTML(p, bub, rankOf[p.id] || null, g, i)).join('')}</div>` : '<div class="small muted" style="padding:8px 0">Empty. Add anyone you want to compare here.</div>'}</div>`;
    }
    if (ui.planOther) { const g = planGroup(ui.planOther), others = ro.filter(p => p.a && !poss.includes(p.pos) && !(g && g.pids.includes(p.id))).sort((a, b) => POSITIONS.indexOf(a.pos) - POSITIONS.indexOf(b.pos) || uOvr(b) - uOvr(a));
      if (g) html += `<div class="callout small">Add a player from another room to <b>${esc(g.name)}</b>: <select data-change="planAdd" data-gid="${g.id}"><option value="">Choose…</option>${others.map(p => `<option value="${p.id}">${esc(p.lbl)} ${esc(pname(p))}</option>`).join('')}</select> <button class="sm" data-action="planOtherClose">Done</button></div>`; }
    const rest = all.filter(p => !grouped.has(p.id)).sort((a, b) => POSITIONS.indexOf(a.pos) - POSITIONS.indexOf(b.pos) || rankOf[a.id][0] - rankOf[b.id][0]);
    html += `<div class="card pl-g"><div class="row pl-gh"><h3 style="margin:0">Not in a group</h3><span class="small muted">${rest.length} · in the coach's order</span></div>${rest.length ? `<div class="pl-rows">${planHeadHTML()}${rest.map(p => planRowHTML(p, bub, rankOf[p.id], null, 0)).join('')}</div>` : '<div class="small muted" style="padding:8px 0">Everyone in this room is in one of your groups.</div>'}</div>
      <div class="small muted" style="margin-top:8px">This is your scratch pad. Groups, names and order are yours and change nothing on the real depth chart or the roster. A player can sit in more than one group. "Coach has him" is the position coach's order in his room, which is an opinion that sharpens as camp goes on.</div>`;
  return html;
}
// on cutdown day: where a position coach would not make the cut you are making
function campObjectionsHTML(u, plan) {
  if (!campOn()) return '';
  const obj = campObjections(u, plan); if (!obj.length) return '';
  return '<div class="callout"><b>Your coaches would not make these cuts.</b> It is your call, and nobody holds it against you.' + obj.slice(0, 6).map(o => `<div class="small" style="margin:5px 0">${o.c ? esc(cname(o.c)) : 'The staff'} would keep ${playerLink(o.p, true)}${o.over ? ` over ${playerLink(o.over, true)}` : ''}.${o.note ? ` <span class="muted">${esc(o.note[2])}</span>` : ''}</div>`).join('') + '</div>';
}
// ---------- the season in review ----------
function seasonHTML() {
  const hs = state.history; if (!hs.length) return '<div class="card"><h3>Season review</h3><div class="muted">Finish a season and its review opens here.</div></div>';
  const h = hs.find(x => x.season === ui.seasonYr) || hs[hs.length - 1], w = h.wrap || {}, u = state.userTid, aw = h.awards || {};
  const who = a => a.pid !== undefined && P(a.pid) ? playerLink(P(a.pid)) : a.cid !== undefined && C(a.cid) ? coachNameLink(C(a.cid)) : `<b>${esc(a.name)}</b>`;
  const club = tid => `<span class="wr-club${tid === u ? ' u' : ''}"><i style="background:${T(tid).color}"></i>${T(tid).abbr}</span>`;
  const final = w.bracket && w.bracket.length ? w.bracket[w.bracket.length - 1].games[0] : null;
  let html = `<div class="pagehead"><div><h1>${h.season} season in review</h1><div class="sub">Champions, awards, the best at every position and how your own year went.</div></div><span class="spacer"></span>
    <select data-change="seasonPick">${hs.slice().reverse().map(x => `<option value="${x.season}" ${x.season === h.season ? 'selected' : ''}>${x.season}</option>`).join('')}</select></div><div class="wrap">`;
  // champion
  html += `<div class="wr-hero"><div class="wr-cup">🏆</div><div><div class="wr-k">League champions</div><div class="wr-champ">${esc(T(h.champ).region + ' ' + T(h.champ).name)}</div>
    <div class="wr-sub">Beat ${esc(T(h.runnerUp).region + ' ' + T(h.runnerUp).name)}${final && final.score ? ` ${Math.max(...final.score)}–${Math.min(...final.score)}` : ''} in the championship game${final && final.gid && state.games[final.gid] ? ` · <button class="link" data-action="box" data-gid="${final.gid}">box score</button>` : ''}</div></div>
    <span class="spacer"></span>${w.mine ? `<div class="wr-you"><div class="wr-k">Your season</div><div class="wr-rec">${w.mine.rec}</div><div class="wr-sub">${esc(w.mine.result)}</div></div>` : `<div class="wr-you"><div class="wr-k">Your season</div><div class="wr-rec">${esc(h.userRec || '')}</div></div>`}</div>`;
  // awards
  const card = (k, big) => { const a = aw[k]; if (!a) return ''; return `<div class="wr-aw${big ? ' big' : ''}${a.tid === u ? ' u' : ''}"><div class="wr-k">${AWARD_NAMES[k] || k}</div><div class="wr-n">${who(a)}</div><div class="wr-t">${club(a.tid)} <span class="muted">${esc(a.pos)}</span></div><div class="wr-l">${esc(a.line || '')}${a.note ? `<br><span class="muted">${esc(a.note)}</span>` : ''}</div></div>`; };
  html += `<div class="wr-sec">Player awards</div><div class="wr-grid">${['mvp', 'opoy', 'dpoy'].map(k => card(k, true)).join('')}</div><div class="wr-grid sm">${['oroy', 'droy', 'cpoy', 'mip', 'oly', 'moy'].map(k => card(k)).join('')}</div>`;
  if (aw.coy || aw.acoy || aw.exec) html += `<div class="wr-sec">Coaches and front offices</div><div class="wr-grid sm">${['coy', 'acoy', 'exec'].map(k => card(k)).join('')}</div>`;
  // teams of the year
  const pl = x => `<span class="wr-p${x.tid === u ? ' u' : ''}">${P(x.pid) ? playerLink(P(x.pid), true) : esc(x.name)} <span class="muted">${T(x.tid).abbr}</span></span>`;
  if (w.allPro) {
    const rows = HONOR_SLOTS.map(([g]) => ({ g, a: w.allPro[1].filter(x => x.g === g), b: w.allPro[2].filter(x => x.g === g) })).filter(r => r.a.length || r.b.length);
    const mineN = [...w.allPro[1], ...w.allPro[2]].filter(x => x.tid === u).length;
    html += `<div class="wr-two"><div class="card"><h3>All-Pro teams</h3><div class="small muted" style="margin-bottom:8px">The best season at every position: production where the position has it, the season grade where it does not.${mineN ? ` <b>${mineN} of yours</b> made it.` : ''}</div>
      <table class="wr-tbl"><thead><tr><th>Position</th><th>First team</th><th>Second team</th></tr></thead><tbody>${rows.map(r => `<tr><td class="muted">${HONOR_NAME[r.g]}</td><td>${r.a.map(pl).join('')}</td><td>${r.b.map(pl).join('')}</td></tr>`).join('')}</tbody></table></div>`;
    html += `<div><div class="card"><h3>All-Rookie team</h3>${w.allRookie && w.allRookie.length ? `<table class="wr-tbl"><tbody>${ROOKIE_SLOTS.map(([g]) => { const l = w.allRookie.filter(x => x.g === g); return l.length ? `<tr><td class="muted">${HONOR_NAME[g]}</td><td>${l.map(pl).join('')}</td></tr>` : ''; }).join('')}</tbody></table>` : '<div class="muted small">No rookies played enough to qualify.</div>'}</div>`;
    if (w.proBowl) { const confs = Object.keys(w.proBowl).sort(), mineN = confs.reduce((n, c) => n + w.proBowl[c].filter(x => x.tid === u).length, 0);
      html += `<div class="card" style="margin-top:14px"><h3>Pro Bowl</h3><div class="small muted" style="margin-bottom:8px">The best of each conference.${mineN ? ` <b>${mineN} of yours</b> ${mineN === 1 ? 'was' : 'were'} named.` : ''}</div><table class="wr-tbl"><thead><tr><th>Position</th>${confs.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${PRO_BOWL_SLOTS.map(([g]) => `<tr><td class="muted">${HONOR_NAME[g]}</td>${confs.map(c => `<td>${w.proBowl[c].filter(x => x.g === g).map(pl).join('')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; }
    if (w.league) html += `<div class="card" style="margin-top:14px"><h3>Around the league</h3><div class="kv">${w.league.map(l => `<div>${l.label}</div><div>${teamLink(l.tid)} <span class="muted">${esc(l.line)}</span></div>`).join('')}</div></div>`;
    html += '</div></div>';
  }
  // your club
  if (w.mine) { const m = w.mine, row = (l, x) => x ? `<div>${l}</div><div>${P(x.pid) ? playerLink(P(x.pid)) : esc(x.name)} <span class="muted">${esc(x.pos)} · ${esc(x.line)}${x.note ? ' · now ' + esc(x.note) : ''}</span></div>` : '';
    const mineAw = Object.keys(aw).filter(k => aw[k].tid === u).map(k => AWARD_NAMES[k]);
    html += `<div class="card"><h3>Your club: ${esc(T(u).region + ' ' + T(u).name)}</h3><div class="wr-stat"><div><b>${m.rec}</b><span>${esc(m.result)}</span></div><div><b>${m.pf}</b><span>points scored · No. ${m.offRk}</span></div><div><b>${m.pa}</b><span>points allowed · No. ${m.defRk}</span></div></div>
      <div class="kv" style="margin-top:10px">${row('Best season', m.mvp)}${row('Top rookie', m.rookie)}${row('Biggest step forward', m.improved)}${mineAw.length ? `<div>Honors</div><div>${mineAw.map(x => `<span class="pill good">${x}</span>`).join(' ')}</div>` : ''}</div></div>`; }
  // leaders
  if (w.leaders) html += `<div class="wr-sec">League leaders</div><div class="wr-lead">${w.leaders.filter(l => l.rows.length).map(l => `<div class="wr-lc"><div class="wr-k">${l.label}</div>${l.rows.map((r, i) => `<div class="wr-lr${r.tid === u ? ' u' : ''}"><span class="wr-ln">${i + 1}</span><span class="wr-lp">${P(r.pid) ? playerLink(P(r.pid), true) : esc(r.name)} <span class="muted">${T(r.tid).abbr}</span></span><b>${r.v}</b></div>`).join('')}</div>`).join('')}</div>`;
  // the road to the title
  if (w.bracket && w.bracket.length) html += `<div class="card" style="margin-top:14px"><h3>The playoffs</h3><div class="wr-br">${w.bracket.map(rd => `<div><div class="wr-k">${rd.name}</div>${rd.games.map(g => { const hi = g.score ? Math.max(...g.score) : '', lo = g.score ? Math.min(...g.score) : '', lose = g.win === g.h ? g.a : g.h; return `<div class="wr-g${g.h === u || g.a === u ? ' u' : ''}"><b>${T(g.win).abbr}</b> ${hi} <span class="muted">${T(lose).abbr} ${lo}</span></div>`; }).join('')}</div>`).join('')}</div></div>`;
  if (!h.wrap) html += '<div class="callout small">This season was played before the full review existed, so only the main awards were kept.</div>';
  return html + '</div>';
}
function recapHTML() {
  const h = state.history[state.history.length - 1];
  if (!h) return '';
  if (h.wrap) return `<div class="card" style="margin-bottom:16px"><div class="row"><div><h3 style="margin:0">${h.season} season in review</h3><div class="small muted">🏆 ${esc(T(h.champ).region + ' ' + T(h.champ).name)} are champions${h.awards.mvp ? ' · MVP ' + esc(h.awards.mvp.name) : ''}</div></div><span class="spacer"></span><button class="primary" data-action="seasonOpen">Open the season review</button></div></div>`;
  let html = `<div class="card" style="margin-bottom:16px"><h3>${h.season} Season Awards</h3><div class="row" style="margin-bottom:10px">🏆 <b>Champion:</b> ${teamLink(h.champ, true)} <span class="muted">def. ${T(h.runnerUp).abbr}</span></div><div class="kv">`;
  for (const k in h.awards) { const a = h.awards[k]; html += `<div>${AWARD_NAMES[k]}</div><div>${P(a.pid) ? playerLink(P(a.pid)) : esc(a.name)} <span class="muted">(${T(a.tid).abbr} ${a.pos}) — ${esc(a.line)}</span></div>`; }
  return html + '</div></div>';
}

// ---------- roster ----------
const ROSTER_VIEWS = [['scout', 'Scouting'], ['pre', 'Preseason'], ['contract', 'Contracts'], ['stats', 'Season Stats'], ['adv', 'Advanced'], ['comfort', 'Positional Comfort'], ['dev', 'Development'], ['true', 'True Ratings (debug)']];
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
  if (mine && state.phase === 'PRESEASON' && state.prePlan) html += prePlanHTML();
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
  else if (vw === 'pre') { const pl = state.prePlan || { feat: {}, hold: {} }, canPlan = mine && state.phase === 'PRESEASON';
    cols = [...base, tier, { k: 'up', l: 'Upside', v: upSort, f: p => upsidePill(p) },
      { k: 'cg', l: 'Camp', v: p => campGrade(p) || 0, f: p => gradeChip(campGrade(p)), num: 1, title: 'Practice grade so far in camp' },
      { k: 'psn', l: 'Pre snaps', v: p => p.preS ? p.preS.snp : 0, num: 1 }, { k: 'pg', l: 'Pre grade', v: p => preGrade(p) || 0, f: p => gradeChip(preGrade(p)), num: 1 },
      { k: 'pl', l: 'Line', f: p => p.preS && p.preS.gp ? `<span class="small">${statSummary(p.preS.st, p.pos)}</span>` : '' },
      { k: 'role', l: 'Role', f: p => starters.has(p.id) ? '<span class="pill">Starter</span>' : '<span class="muted small">Competing</span>' },
      { k: 'plan', l: 'Playing time', f: p => !canPlan ? (pl.feat[p.id] ? 'Featured' : pl.hold[p.id] ? 'Held out' : '') : `<span class="seg">${[['', 'Normal'], ['feat', 'Feature'], ['hold', 'Hold out']].map(([k, l]) => `<button class="sm ${(pl.feat[p.id] ? 'feat' : pl.hold[p.id] ? 'hold' : '') === k ? 'on' : ''}" data-action="preFeat" data-pid="${p.id}" data-v="${k}">${l}</button>`).join('')}</span>` }];
  }
  else if (vw === 'stats') cols = [...base, { k: 'gp', l: 'GP', v: p => p.stats.gp || 0, num: 1 }, { k: 'gs', l: 'GS', v: p => p.stats.gs || 0, num: 1 }, { k: 'snp', l: 'Snaps', v: p => p.stats.snp || 0, num: 1 },
    { k: 'line', l: 'Season', v: p => hypeMetric(p, p.stats), f: p => `<span class="small">${p.stats.gp ? statSummary(p.stats, p.pos) : ''}</span>` },
    { ...STAT_NUM('tkl'), l: 'Tkl' }, { ...STAT_NUM('sck'), l: 'Sck' }, { ...STAT_NUM('dint'), l: 'INT' }, { ...STAT_NUM('pd'), l: 'PD' }, grade];
  else if (vw === 'adv') {
    const fg = (k, l) => ({ k: 'f' + k, l, v: p => (p.advS && facetGrade(p.advS, k, 20, p.spot)) || 0, f: p => gradeChip(p.advS ? facetGrade(p.advS, k, 20, p.spot) : null), num: 1 });
    cols = [...base, stars, grade, fg('pass', 'Pass'), fg('rush', 'Rush'), fg('rec', 'Recv'), fg('pb', 'Pass blk'), fg('rb', 'Run blk'), fg('rd', 'Run def'), fg('pr', 'Pass rush'), fg('man', 'Man cov'), fg('zone', 'Zone cov'),
      { k: 'snp', l: 'Snaps', v: p => p.stats.snp || 0, num: 1 }];
  } else if (vw === 'comfort') cols = [...base, tier,
    { k: 'cf', l: 'Positional comfort', v: p => Object.keys(p.cf || {}).length, f: p => Object.entries(p.cf || {}).sort((a, b) => b[1] - a[1]).map(([s, c]) => `<span class="pill ${CF_CLS[comfortLabel(c)]}" title="${Math.round(c)}">${SPOTS[s].l} · ${comfortLabel(c)}</span>`).join(' ') },
    { k: 'ad', l: 'Learns', v: p => (p.h && p.h.adapt) || 0, f: p => { const r = learnRate(p); return `<span class="small ${r >= 1.15 ? 'good' : r <= 0.8 ? 'bad' : 'muted'}">${r >= 1.15 ? 'Quick' : r <= 0.8 ? 'Slow' : 'Average'}</span>`; }, title: 'How fast he picks up a new position' }];
  else if (vw === 'dev') { const gms = Math.max(1, state.phase === 'REG' ? state.week - 1 : SEASON_WEEKS), share = p => clamp((p.stats.snp || 0) / (gms * DEV.gameSnaps), 0, 1), TO = Object.keys(TRACK_LABEL);
    cols = [...base, tier, { k: 'up', l: 'Upside', v: upSort, f: p => upsidePill(p) },
      { k: 'trk', l: 'Development', v: p => -TO.indexOf(trackOf(p)), f: p => trackPill(p), title: 'How his development is going against what the staff expected' },
      { k: 'fin', l: 'Finished product', f: p => isDeveloping(p) ? `<span class="small muted wrapcell">${esc(scoutProfile(finishedPlayer(p), true))}</span>` : '<span class="small muted">Finished article</span>' },
      { k: 'cmp', l: 'Plays like', f: p => { const c = isDeveloping(p) ? compFor(p) : null; return c ? `<span class="small">${compLink(c)}</span>` : ''; } },
      { k: 'sn', l: 'Snaps', v: p => share(p), f: p => p.stats.snp ? Math.round(share(p) * 100) + '%' : '<span class="muted">—</span>', num: 1, title: 'Share of his unit’s snaps this season. 60% earns full credit for growth' },
      { k: 'pr', l: 'Practice', v: p => pracAvg(p), f: p => PRAC_SIDE[p.pos] ? `<span class="small">${pracGradeLabel(pracAvg(p))}</span>` : '', title: 'His practice weeks since the last checkpoint' },
      { k: 'pc', l: 'Position coach', f: p => { const c = posCoach(tid, p.pos); return c ? `<span class="small">${esc(c.last)} ${wordPill(asstWord(c, 'dev'))}</span>` : ''; } }];
  }
  else if (vw === 'true') cols = [...base, { k: 'ovr', l: 'OVR', v: p => p.ovr, f: p => rat(p.ovr), num: 1 }, { k: 'pot', l: 'POT', v: p => p.pot, f: p => rat(p.pot), num: 1 },
    { k: 'seen', l: 'Seen as', v: p => uOvr(p), f: p => `${uOvr(p).toFixed(0)} <span class="muted small">(${(uOvr(p) - p.ovr) > 0 ? '+' : ''}${(uOvr(p) - p.ovr).toFixed(1)})</span>`, num: 1 },
    { k: 'hype', l: 'Hype', v: p => p.per ? p.per.h : 0, f: p => p.per ? p.per.h.toFixed(1) : '—', num: 1 },
    { k: 'adapt', l: 'Adapt', v: p => (p.h && p.h.adapt) || 0, num: 1 }];
  else cols = [...base, { k: 'ht', l: 'Ht', v: p => p.m.ht, f: p => `<span class="small muted">${fmtHeight(p.m.ht)}</span>`, num: 1 }, { k: 'wt', l: 'Wt', v: p => p.m.wt, f: p => `<span class="small muted">${p.m.wt}</span>`, num: 1 }, stars, tier,
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
  const fut = psOf(tid).sort((a, b) => uCeil(b) - uCeil(a));
  if (fut.length) h += `<div class="section-title">Practice squad: reserve/future deals</div><div class="small muted" style="margin-bottom:4px">Two years at the minimum, nothing guaranteed. Anyone you do not sign is released when you continue.</div>` + `<div class="fut">${fut.map(p => `<div class="fut-row"><div class="fut-who"><span class="muted small">${esc(p.lbl)}</span> ${playerLink(p)} ${tierPill(p)} ${upsidePill(p)} <span class="muted small">age ${p.age}</span></div><button class="sm" data-action="futures" data-pid="${p.id}">Sign futures deal</button></div>`).join('')}</div>`;
  if (ext.length) h += `<div class="section-title">Extension candidates (entering final year)</div>` + ext.sort((a, b) => uOvr(b) - uOvr(a)).slice(0, 6).map(p => { const a = extensionAsk(p); return li(p, `asks ${a.yrs} yr × ${fmtMoney(a.amt)} <span class="small muted">(leverage ${leverageLabel(leverageOf(p)).toLowerCase()})</span> <button class="sm" data-action="extend" data-pid="${p.id}">Extend</button> <button class="sm" data-action="player" data-pid="${p.id}">Terms…</button>`); }).join('');
  return h + '</div>';
}
function practiceSquadHTML(tid, mine) {
  const ps = psOf(tid).sort(famOrder);
  if (!ps.length) return mine && ['REG', 'PLAYOFFS'].includes(state.phase) ? `<div class="card" style="margin-top:16px"><h3>Practice Squad (0/${PS_MAX})</h3><p class="muted small">Empty. Sign free agents to it from the Free Agents tab or a player's card: up to ${PS_MAX} players, ${PS_VETS} of them with 3+ seasons.</p></div>` : '';
  return `<div class="card" style="margin-top:16px"><h3>Practice Squad (${ps.length}/${PS_MAX})</h3><p class="muted small">Develops like everyone else, doesn't dress on game day, can be promoted by you at any time, and other teams can sign them away to their 53. Nobody is promoted for you when injuries hit.</p>` + table('ps', [
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
  if (p.expiring && state.phase === 'RESIGN') return `<button class="sm primary" data-action="faOpen" data-pid="${p.id}" title="Sit down with his agent">Negotiate · asks ${fmtMoney(p.ask)}</button>`;
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
// ---------- depth chart: jobs you fill once, and a field that shows who plays where in every look ----------
const THIN_TIERS = new Set(['Depth', 'Project', 'Fringe', 'Washed']), OK_TIERS = new Set(['Rotation', 'Backup']);
const DC_GROUPS = {
  def: [['Defensive line', ['NOSE', 'SHADE', 'T3', 'END', 'WIDE', 'OLB']], ['Linebackers', ['MLB', 'WLB', 'SAM']], ['Secondary', ['CB', 'NCB', 'DIME', 'FS', 'SS']], ['Passing downs', ['RUSHE', 'RUSHI', 'WLBP', 'NCBP']]],
  off: [['Backfield', ['QB', 'RB', 'FB', 'RB3D', 'RBSY']], ['Receivers', ['X', 'Z', 'SLOT', 'SLOT2']], ['Tight ends', ['Y', 'H', 'Y2']], ['Offensive line', ['LT', 'LG', 'C', 'RG', 'RT', 'OL6']]],
  st: [['Kicking game', ['K', 'P', 'KR', 'PRET']], ['Coverage and return units', ['KO', 'KRU', 'PU', 'PRU']]],
};
const JOB_HELP = {
  NOSE: 'Over the center (0 and 1 technique). Mass and strength: he holds the middle.', SHADE: 'Inside the guard (2i and 2). A nose who can move, or a tackle who can anchor.',
  T3: 'Outside the guard. Burst and pass rush from the inside.', END: 'On the tackle (4i, 4 and 5). Length and strength to hold the edge of the line.',
  WIDE: 'Outside the tackle with a hand down (7, 6, 9 and wide). Speed off the edge.', OLB: 'The stand-up edge in the base front. Rushes and sets the edge.',
  MLB: 'The middle of the defense: run fits and the calls.', WLB: 'Runs and covers. In nickel he is one of two linebackers left on the field.', SAM: 'The strong side in base, over the tight end.',
  CB: 'Outside corners, in order. The first two start; your coach decides whether the best one travels with their top receiver.', NCB: 'Covers the slot. A corner here is a nickel; a safety here is a big nickel.',
  DIME: 'The sixth defensive back.', FS: 'The deep safety: range and ball skills.', SS: 'The safety who comes down into the box.',
  RUSHE: 'Take the edge spots on passing downs in nickel and dime. Leave empty and your regular ends stay in.', RUSHI: 'Take the inside spots on passing downs in nickel and dime. Leave empty and your regular tackles stay in.',
  WLBP: 'Takes the Will job on passing downs. Leave empty and your Will stays in.', NCBP: 'Takes the nickel job on passing downs. Leave empty and your nickel stays in.',
  RB3D: 'Third and long and the two-minute drill. Leave empty and your lead back stays in.', RBSY: 'Short yardage and the goal line. Leave empty and your lead back stays in.',
  KR: 'Kick returner.', PRET: 'Punt returner.', KO: 'Ten men: the kickoff coverage team.', KRU: 'Ten men: blockers on kick returns.', PU: 'Ten men: the punt team. The first two are the gunners.', PRU: 'Ten men: punt return. The first two hold up the gunners.',
};
function jobLabel(k) { const r = CHART_SECTIONS.map(s => s.rows.find(x => x[0] === k)).find(Boolean); return r ? r[1].replace(/ \(.*\)$/, '') : k; }
function jobAx(k) { return LINE_ROLE_AX[k] !== undefined ? LINE_ROLE_AX[k] : k === 'RUSHI' ? 1.35 : k === 'RUSHE' ? 3 : null; }
function jobSide(k) { return ST_UNIT[k] || ['K', 'P', 'KR', 'PRET'].includes(k) ? 'st' : CHART_UNIT(k); }
// how your staff sees him at this job: his level, adjusted for how the job suits him and how well he knows it
function jobValue(p, k) {
  if (ST_UNIT[k]) return ST_OK.has(p.spot) ? stSeen(p, stRole(p, k)) : 0;
  if (k === 'KR' || k === 'PRET') return returnScore(p);
  const ax = jobAx(k); return ax !== null ? uOvr(p) + (lineSlotRating(p, ax) - p.ovr) : chartValue(p, CHART_SPOT[k]);
}
function jobComfort(p, k) { if (jobSide(k) === 'st') return 100; const ax = jobAx(k); return ax !== null ? lineComfort(p, ax) : comfortOf(p, CHART_SPOT[k]); }
function jobTier(p, k) { return jobSide(k) === 'st' ? null : tierOf(p, jobValue(p, k)); }
function dcDot(p, k) { const cf = comfortLabel(jobComfort(p, k)); return (cf !== 'Natural' && cf !== 'Comfortable' ? `<i class="dcd ${CF_CLS[cf]}" title="${cf} at this job"></i>` : '') + (p.injury ? `<i class="dcd inj" title="Out ${p.injury.weeks} week${p.injury.weeks === 1 ? '' : 's'}">✚</i>` : ''); }
// one man on a job card
function dcChip(p, k, i, starts) {
  const tr = jobTier(p, k);
  return `<div class="dcc ${tr ? TIER_CLS[tr] : ''} ${i < starts ? 'st' : ''} ${ui.dchPid === p.id ? 'pk' : ''}" draggable="true" data-dcp="${p.id}" data-dci="${i}" data-dcjob="${k}" data-action="dchMan" data-pid="${p.id}" title="${esc(pname(p))}${tr ? ' · ' + tr + ' at this job' : ''}">
    <span class="dcc-n">${i + 1}</span><button class="link dcc-nm" data-action="player" data-pid="${p.id}" title="${esc(pname(p))} · ${esc(p.lbl)}${tr ? ' · ' + tr + ' at this job' : ''} — open his card">${esc(p.last)}</button>${dcDot(p, k)}<span class="dcc-sp"></span><button class="dcc-x" data-action="dcRemove" data-key="${k}" data-i="${i}" title="Take him off this job" aria-label="Remove ${esc(p.last)}">×</button></div>`;
}
function dcJobCard(t, c, k, need, where, prob) {
  const u = t.id, list = (c.lists[k] || []).map(id => P(id)).filter(p => p && p.tid === u), n = chartMax(k), on = ui.dcJob === k;
  const rotNow = rotOf(c, k), rotList = rotOpts(k), rotPick = rotList.length ? rotList.reduce((a, o) => Math.abs(o[0] - rotNow) < Math.abs(a[0] - rotNow) ? o : a)[0] : 0;
  const rot = ROT_KEYS.has(k) && rotList.length > 1 ? `<div class="dcj-rot"><span>Next man's snaps</span><select data-change="dchRot" data-key="${k}">${rotList.map(([v, l]) => `<option value="${v}" ${v === rotPick ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` : '';
  return `<div class="dcj ${on ? 'on' : ''} ${prob ? 'bad' : ''}" data-action="dcJob" data-key="${k}">
    <div class="dcj-h"><b>${esc(jobLabel(k))}</b>${need > 1 && !ST_UNIT[k] ? `<span class="dcj-tag two" title="This job has ${need} spots on the field at once: the first ${need} listed both start">top ${need} start</span>` : ''}${prob ? '<span class="dcj-tag bad">needs a man</span>' : ''}</div>
    <div class="dcj-list">${list.map((p, i) => (i === need && !ST_UNIT[k] ? '<div class="dcj-div"><span>next in line</span></div>' : '') + dcChip(p, k, i, need)).join('')}${list.length < n ? `<div class="dcj-drop ${list.length ? 'more' : ''}" data-dcjob="${k}" data-dci="${list.length}">${list.length ? 'drop here' : 'drag a player here'}</div>` : ''}</div>
    <details class="dcj-more" ${foldAttr('dcj' + k)}><summary>about this job</summary><div class="small muted">${esc(JOB_HELP[k] || '')}${where && where.length ? `<br><b>Plays in:</b> ${esc([...new Set(where)].join(', '))}` : ''}</div>${rot}</details></div>`;
}
// the green dot: the defender who gets the call and makes the checks
function greenDotHTML(t) {
  const pool = dotPool(t.id).sort((a, b) => dotScore(b) - dotScore(a)).slice(0, 12), cur = greenDot(t.id);
  return `<div class="dc2-lk" title="The linebacker who gets the call from the sideline and makes the checks at the line. What he sees, how well he knows the system and whether the others listen all count."><span>Green dot</span><select data-change="dotSet">${pool.map(p => `<option value="${p.id}" ${cur && cur.id === p.id ? 'selected' : ''}>${esc(pshort(p))} · ${esc(p.lbl)}</option>`).join('')}</select>${t.dot === undefined ? '<i class="small muted" style="margin-left:6px">staff pick</i>' : ''}</div>`;
}
// how well each unit knows itself: one bar a room
function chemStripHTML(tid, tab) {
  ensureChem();
  const units = tab === 'def' ? ['DL', 'LB', 'DB'] : tab === 'off' ? ['OL', 'QB'] : ['KB'];
  const cap = u => u === 'QB' ? (chemCap(tid, 'WR') + chemCap(tid, 'TE') + chemCap(tid, 'RB')) / 3 : chemCap(tid, { OL: 'OL', DL: 'DL', LB: 'LB', DB: 'CB', KB: 'K' }[u]);
  const bar = (label, v, c, hint) => `<div class="chm" title="${esc(hint)}"><span class="chm-l">${label}</span><span class="chm-t"><i style="width:${Math.round(v)}%;background:${gradeColor(v)}"></i></span><span class="chm-w">${chemWord(v)}</span></div>`;
  let h = units.map(u => bar(CH_NAME[u], unitChem(tid, u), cap(u), `Chemistry of the first team`)).join('');
  if (tab === 'def') h += bar('The defense', defChem(tid), 0, 'The three rooms together: what it takes to all be in the same call');
  return `<div class="chm-strip"><span class="chm-h" title="How well the men in each unit know each other. It builds with weeks together and falls when the unit changes.">Chemistry</span>${h}</div>`;
}
// the emergency quarterback: who takes the snaps if every quarterback is hurt
function emergencyQBHTML(t) {
  const pool = rosterOf(t.id).filter(p => p.pos !== 'QB' && !['OL', 'DL', 'K', 'P'].includes(p.pos) && p.a).sort((a, b) => emergencyScore(b) - emergencyScore(a)).slice(0, 12), cur = emergencyPasser(t.id);
  return `<div class="dc2-lk" title="If every quarterback is hurt during a game, he takes the snaps."><span>Emergency QB</span><select data-change="eqbSet">${pool.map(p => `<option value="${p.id}" ${cur && cur.id === p.id ? 'selected' : ''}>${esc(pshort(p))} · ${esc(p.lbl)}</option>`).join('')}</select>${t.eqb === undefined ? '<i class="small muted" style="margin-left:6px">staff pick</i>' : ''}</div>`;
}
function depthChartHTML() {
  const u = state.userTid, t = T(u), c = ensureChart(u);
  refreshChart(u);
  const ro = rosterOf(u).filter(p => p.a);
  const tab = ['def', 'off', 'st'].includes(ui.dchTab) ? ui.dchTab : 'def';
  const probs = chartProblems(u), auto = c.auto[tab], side = { def: 'defense', off: 'offense', st: 'special teams' }[tab];
  const tabs = `<div class="dc2-tabs">${[['def', 'Defense'], ['off', 'Offense'], ['st', 'Special teams']].map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" data-action="dchTab" data-tab="${k}">${l}${probs.some(p => p.tab === k) ? ' <i class="dcd bad"></i>' : ''}</button>`).join('')}</div>`;
  const ctl = `<div class="dc2-ctl"><span class="small muted">${auto ? `The staff is setting the ${side}.` : `You are setting the ${side}.`}</span><button class="sm ${auto ? 'primary' : ''}" data-action="dchAuto" data-unit="${tab}" data-on="${auto ? 0 : 1}">${auto ? 'Take control' : 'Hand to the staff'}</button></div>`;
  let html = `<div class="dc2"><div class="dc2-top">${tabs}${ctl}</div>${state.settings.autoUser ? '<div class="callout"><b>Auto-manage is on</b>: the staff sets the depth chart until you turn it off in Settings.</div>' : ''}`;
  const mine = probs.filter(p => p.tab === tab);
  if (mine.length) html += `<div class="callout small"><b class="bad">This chart is not complete.</b> ${mine.map(p => esc(p.text)).join(' · ')}. If you play a game like this, the staff fills the gap for that game only.</div>`;
  // ---- the jobs on this tab ----
  const J = tab === 'def' ? defJobs(t) : null;
  const groups = DC_GROUPS[tab].map(([title, keys]) => [title, keys.filter(k => tab !== 'def' || J.n[k] || ['RUSHE', 'RUSHI', 'WLBP', 'NCBP'].includes(k))]).filter(g => g[1].length);
  const jobs = groups.flatMap(g => g[1]);
  ui.dcGrp = ui.dcGrp || {};
  // the group on show: the one you picked, unless the job you just clicked on the field lives in another
  let grp = groups.find(g => g[0] === ui.dcGrp[tab]) || groups[0];
  if (jobs.includes(ui.dcJob) && !grp[1].includes(ui.dcJob)) grp = groups.find(g => g[1].includes(ui.dcJob));
  ui.dcGrp[tab] = grp[0];
  const job = grp[1].includes(ui.dcJob) ? ui.dcJob : grp[1][0]; ui.dcJob = job;
  const need = k => tab === 'def' ? (J.n[k] || (k === 'RUSHE' || k === 'RUSHI' ? 2 : 1)) : ST_UNIT[k] ? 10 : 1;
  // who starts where, for the bench
  const startsAt = {}; for (const k of jobs) (c.lists[k] || []).slice(0, need(k)).forEach(id => { if (!startsAt[id]) startsAt[id] = k; });
  // ---- the field ----
  let field = '';
  if (tab !== 'st') {
    const views = dcViews(t, tab); ui.dchView = ui.dchView || {};
    const vid = views.some(v => v.id === ui.dchView[tab]) ? ui.dchView[tab] : views[0].id, view = views.find(v => v.id === vid);
    const sub = tab === 'def' && (view.pkg === 'NICKEL' || view.pkg === 'DIME'), pass = sub && ui.dcPass === '1';
    const outP = ui.dcOut && ro.some(p => p.id === ui.dcOut) ? P(ui.dcOut) : null;
    const lay = dcLayout(t, tab, vid, pass), normal = dcLineup(u, tab, vid, pass), lineup = outP ? dcLineup(u, tab, vid, pass, outP.id) : normal, ok = ovKeyFor(t, tab, vid, pass);
    // why a spot is not being played by the first man on its list
    const whyText = (b, p) => { const w = lineup._why[b.name]; if (!w || w === 'ov' || auto) return null;
      if (w === 'staff') return ['staff', "Nobody left on this job's list: the staff put him here"];
      if (w === 'rot' || w === 'tired') return ['rest', 'In while the man ahead of him takes a breather'];
      const list = c.lists[b.key] || [], above = list.slice(0, Math.max(0, list.indexOf(p.id))).map(id => P(id)).filter(Boolean), at = q => lay.find(x => lineup[x.name] === q);
      const why = above.map(q => (outP && q.id === outP.id) || q.injury ? `${q.last} is out` : at(q) ? `${q.last} is at ${at(q).label.toLowerCase()} in this look` : `${q.last} is not dressed`);
      return ['next up', why.length ? why.join(' · ') : 'Next man up']; };
    const pills = tab === 'def'
      ? [...new Set(views.map(v => v.group))].map(gr => `<div class="dc2-lk"><span>${esc(gr)}</span>${views.filter(v => v.group === gr).map(v => `<button class="${v.id === vid ? 'on' : ''}" data-action="dcLook" data-v="${esc(v.id)}">${esc(v.label)}${v.share && v.group !== 'Other' ? ` <i>${Math.round(v.share * 100)}%</i>` : ''}</button>`).join('')}</div>`).join('') + greenDotHTML(t)
      : `<div class="dc2-lk"><span>Personnel</span>${views.map(v => `<button class="${v.id === vid ? 'on' : ''}" data-action="dcLook" data-v="${esc(v.id)}">${esc(v.id === 'JUMBO' ? 'Jumbo' : v.id)}${v.share ? ` <i>${Math.round(v.share * 100)}%</i>` : ''}</button>`).join('')}</div><div class="dc2-lk"><span>Formation</span>${formShares(t, vid).map(([k, s2]) => `<button class="${k === (FORMS[vid][ui.dcFm] ? ui.dcFm : FORM_HOME[vid]) ? 'on' : ''}" data-action="dcFm" data-k="${esc(k)}">${esc(k)} <i>${Math.round(s2 * 100)}%</i></button>`).join('')}</div>${emergencyQBHTML(t)}`;
    const scen = sub ? `<div class="dc2-scen"><button class="${pass ? '' : 'on'}" data-action="dcPass" data-v="0">Run downs</button><button class="${pass ? 'on' : ''}" data-action="dcPass" data-v="1">Passing downs</button></div>` : '';
    // where each man really stands: across the formation by his alignment, up the field by his depth. Nobody is snapped to a grid;
    // two men who would sit on top of each other are eased apart just enough to read both.
    const fmD = tab === 'off' ? (FORMS[vid] && FORMS[vid][ui.dcFm] ? ui.dcFm : FORM_HOME[vid]) : null, flexD = fmD && FORMS[vid][fmD]._flex || [];
    const snapD = fmD ? formSnap(vid, fmD) : 'SG', BK = d => 0.9 + d * 0.62; // backs are drawn at their real depth, squeezed to fit the card
    const OFFD = b => OL_SLOTS.includes(b.name) ? [OL_X[b.name], 0] : ['QB', 'RB', 'FB'].includes(b.name) ? [backSpot(snapD, fmD, b.name)[0], BK(backSpot(snapD, fmD, b.name)[1])] : [formX(vid, fmD, b.name), (INLINE.has(b.name) && !flexD.includes(b.name)) || b.name === 'X' ? 0.4 : 1.4];
    const pos = lay.map(b => { const [x, d] = tab === 'def' ? [b.x, b.depth] : OFFD(b); return { b, left: 50 + x * 10.2, top: tab === 'def' ? 86 - d * 5.5 : 13 + d * 14 }; });
    { const W = 9.9; pos.sort((a, q) => a.top - q.top || a.left - q.left);
      for (let pass = 0; pass < 8; pass++) for (const a of pos) for (const q of pos) { if (a === q || Math.abs(a.top - q.top) >= 11) continue; const gap = Math.abs(a.left - q.left); if (gap < W) { const push = (W - gap) / 2, dir = a.left <= q.left ? -1 : 1; a.left += dir * push; q.left -= dir * push; } }
      for (const a of pos) a.left = clamp(a.left, 5.2, 94.8); }
    const yard = tab === 'def' ? [5, 10].map(y => `<div class="dcf-yl" style="top:${86 - y * 5.5 + 6}%"><span>${y}</span></div>`).join('') : '';
    const spots = pos.map(({ b, left, top }) => { const p = lineup[b.name] && lineup[b.name].a ? lineup[b.name] : null, ov = !auto && c.ov[ok + ':' + b.name] !== undefined, tr = p ? jobTier(p, b.key) : null;
      const cls = !p ? 'empty' : THIN_TIERS.has(tr) ? 'thin' : OK_TIERS.has(tr) ? 'soft' : '';
      const wy = p ? whyText(b, p) : null, chg = outP && normal[b.name] !== lineup[b.name];
      return `<div class="dcs ${cls} ${b.key === job ? 'on' : ''} ${ov ? 'ov' : ''} ${chg ? 'chg' : ''}" style="left:${left.toFixed(2)}%;top:${top.toFixed(2)}%" data-action="dcJob" data-key="${b.key}" data-dcov="${b.name}" ${p ? `draggable="true" data-dcp="${p.id}"` : ''} title="${p ? esc(pname(p)) + ' · ' + esc(p.lbl) + ' · ' + tr + ' at this job' : 'Nobody'}${ov ? ' · set for this look only' : ''}">
        <div class="dcs-r">${esc(b.label)}${b.tech ? `<i>${b.tech}</i>` : ''}</div><div class="dcs-n">${p ? esc(p.last) : '—'}${p ? dcDot(p, b.key) : ''}</div>${ov ? `<button class="dcs-pin" data-action="dcOvClear" data-name="${b.name}" title="Remove the override: go back to the job order">this look ×</button>` : wy ? `<span class="dcs-why ${wy[0] === 'staff' ? 'bad' : ''}" title="${esc(wy[1])}">${wy[0]}</span>` : ''}</div>`; }).join('');
    const nOv = Object.keys(c.ov).filter(k => k.startsWith(ok + ':')).length;
    field = `<div class="card dc2-field"><div class="dc2-looks">${pills}</div>${chemStripHTML(t.id, tab)}
      <div class="row" style="margin:6px 0 8px"><h3 style="margin:0">${tab === 'def' ? esc(view.group === 'Other' ? view.label : view.label + (view.pkg === 'BASE' ? ' · ' + view.group : ' · nickel')) : esc(PERS_LABEL[vid] || vid) + ' · ' + esc(fmD) + ' · ' + (snapD === 'UC' ? 'under center' : 'shotgun')}</h3><span class="spacer"></span>${scen}</div>
      ${outP ? `<div class="dc2-out">Showing this ${tab === 'def' ? 'look' : 'grouping'} <b>without ${esc(pname(outP))}</b>. Outlined spots change hands. <button class="sm" data-action="dcOut" data-pid="0">Back to the real lineup</button></div>` : ''}
      <div class="dcf ${tab}"><div class="dcf-los"></div>${yard}${spots}</div>
      <div class="small muted" style="margin-top:6px">${auto ? "The staff's lineup. Drag anything and the unit is yours." : `<b>Drag a player onto a spot</b> to use him there in this ${tab === 'def' ? 'look' : 'grouping'} only${nOv ? ` (${nOv} set here)` : ''}.`} Top edge: green is starter level, amber below it, red well below. <i class="dcd warn"></i> learning the job · <i class="dcd bad"></i> raw.</div></div>`;
  }
  // ---- the bench: everyone who could do the selected job, best first ----
  const sideOf = tab === 'st' ? null : tab, list = c.lists[job] || [];
  const all = ro.filter(p => ST_UNIT[job] ? ST_OK.has(p.spot) || ui.dchAll : job === 'KR' || job === 'PRET' ? returnScore(p) > -1e8 : ['K', 'P'].includes(job) ? comfortOf(p, job) > 0 || ui.dchAll : SPOTS[p.spot].side === SPOTS[CHART_SPOT[job]].side);
  const fam = (FAMILIES.find(f => f[1].includes(CHART_SPOT[job])) || [null, []])[1];
  const near = all.filter(p => jobSide(job) === 'st' || jobComfort(p, job) >= 25 || fam.includes(p.spot));
  const bench = (ui.dchAll ? all : near).sort((a, b) => jobValue(b, job) - jobValue(a, job));
  const pickP = ui.dchPid && ro.some(p => p.id === ui.dchPid) ? P(ui.dchPid) : list.length && P(list[0]) ? P(list[0]) : bench[0] || null;
  const benchRow = p => { const tr = jobTier(p, job), at = startsAt[p.id], on = list.includes(p.id);
    return `<div class="dcb ${pickP && pickP.id === p.id ? 'pk' : ''} ${on ? 'in' : ''}" draggable="true" data-dcp="${p.id}" data-action="dchMan" data-pid="${p.id}"><span class="dcb-nm"><button class="link" data-action="player" data-pid="${p.id}" title="Open his full card">${esc(pname(p))}</button>${dcDot(p, job)}</span><span class="dcb-pos">${esc(p.lbl)} · ${p.age}</span>
      ${tr ? `<span class="pill ${TIER_CLS[tr]}">${tr}</span>` : stWord(p, ST_UNIT[job] ? job : null) ? `<span class="pill ${stWord(p, ST_UNIT[job] ? job : null)[1]}">${stWord(p, ST_UNIT[job] ? job : null)[0]}</span>` : ''}${at && at !== job ? `<span class="pill muted" title="He starts there">${esc(jobLabel(at))}</span>` : ''}
      ${on ? '<span class="dcb-in">on the card</span>' : `<button class="sm" data-action="dcAdd" data-key="${job}" data-pid="${p.id}" title="Add him to this job">+</button>`}</div>`; };
  const benchCard = `<div class="dc2-side"><div class="card dc2-bench"><div class="dc2-bh"><div><div class="dc2-bk">Best fits for</div><h3 style="margin:0">${esc(jobLabel(job))}</h3></div><label class="small muted"><input type="checkbox" data-change="dchAll" ${ui.dchAll ? 'checked' : ''}> everyone</label></div>
    <div class="dc2-bl">${bench.map(benchRow).join('') || '<div class="muted small">Nobody on the roster can play here.</div>'}</div></div>
    ${pickP ? dcBigCard(pickP, job, jobs, c) : ''}</div>`;
  // ---- the job cards ----
  const grpSel = `<div class="dc2-gsel">${groups.map(([title, keys]) => `<button class="${title === grp[0] ? 'on' : ''}" data-action="dcGrp" data-v="${esc(title)}">${esc(title)}${keys.some(k => mine.some(p => p.key === k)) ? ' <i class="dcd bad"></i>' : ''}</button>`).join('')}</div>`;
  const cards = `<div class="dc2-cards one" style="--n:${grp[1].length}">${grp[1].map(k => dcJobCard(t, c, k, need(k), J ? J.where[k] : null, mine.some(p => p.key === k))).join('')}</div>`;
  html += `<div class="dc2-main"><div class="dc2-left">${field}
    <div class="dc2-jobs">${grpSel}${cards}</div></div>${benchCard}</div></div>`;
  return html;
}
// the man you are looking at, in full: who he is, how he fits the job on show, where else he is listed
function dcBigCard(p, job, jobs, c) {
  const tr = jobTier(p, job), cf = comfortLabel(jobComfort(p, job)), ax = jobAx(job), m = ax !== null && p.m ? lineMass(p, ax) : 0;
  const listed = jobs.map(k => [k, (c.lists[k] || []).indexOf(p.id)]).filter(x => x[1] >= 0);
  const ord = i => ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'][i] || (i + 1) + 'th';
  const pb = PRAC_SIDE[p.pos] ? pbOf(p) : null;
  return `<div class="card dc2-card"><div class="row"><b style="font-size:19px">${playerLink(p)}</b><span class="pill">${esc(p.lbl)}</span>${statusPills(p)}${tierPill(p)}${upsidePill(p)}${starHTML(starsOf(p))}<span class="spacer"></span><button class="sm ${ui.dcOut === p.id ? 'primary' : ''}" data-action="dcOut" data-pid="${ui.dcOut === p.id ? 0 : p.id}" title="Show the field as it would line up without him">${ui.dcOut === p.id ? 'Showing without him' : 'If he goes down'}</button><button class="sm" data-action="player" data-pid="${p.id}">Full card</button></div>
    <div class="small muted" style="margin:4px 0 8px">Age ${p.age} · ${fmtHeight(p.m.ht)}, ${p.m.wt} lb · ${p.exp} yr${p.exp === 1 ? '' : 's'} · ${fmtContract(p)}${p.injury ? ` · <span class="bad">out ${p.injury.weeks} wk</span>` : ''}</div>
    <div class="dc2-fit"><div class="dc2-bk">At ${esc(jobLabel(job).toLowerCase())}</div><div class="row small" style="margin-top:4px">${tr ? `<span class="pill ${TIER_CLS[tr]}">${tr} here</span>` : ''}${jobSide(job) === 'st' ? '' : `<span class="pill ${CF_CLS[cf]}">${cf}</span>`}${m <= -1.5 ? '<span class="pill warn">light for the spot</span>' : m >= 1.5 ? '<span class="pill warn">heavy for the spot</span>' : ''}${listed.some(x => x[0] === job) ? `<span class="pill">${ord(listed.find(x => x[0] === job)[1])} on the card</span>` : `<button class="sm primary" data-action="dcAdd" data-key="${job}" data-pid="${p.id}">Add to this job</button>`}</div></div>
    <div style="margin:10px 0">${esc(scoutProfile(p))}</div>
    <div class="row small" style="margin-bottom:10px">${rowGrades(p)}${stWord(p) ? `<span class="pill ${stWord(p)[1]}">${stWord(p)[0]}</span>` : ''}${pb !== null ? `<span class="pill" title="How much of the playbook he knows">${pbLabel(pb)}</span>` : ''}</div>
    ${strengthsHTML(p)}
    <div class="section-title" style="margin-top:12px">Where he can play</div><div class="row small">${comfortHTML(p)}</div>
    ${listed.length ? `<div class="section-title" style="margin-top:12px">Listed at</div><div class="row small">${listed.map(([k, i]) => `<button class="pill dc2-at" data-action="dcJob" data-key="${k}">${esc(jobLabel(k))} · ${ord(i)}</button>`).join('')}</div>` : ''}
    <div class="section-title" style="margin-top:12px">Measurables</div>${combineHTML(p)}</div>`;
}
// a small card for the man you have selected on the depth chart, so you can judge him without leaving the page
function dcMiniCard(p, key, spot) {
  const stw = typeof stWord === 'function' ? stWord(p, ST_UNIT[key] ? key : null) : null, cf = Object.keys(p.cf || {}).filter(sp => sp !== p.spot && comfortOf(p, sp) >= 30).sort((a, b) => comfortOf(p, b) - comfortOf(p, a)).slice(0, 4);
  return `<div class="dc-mini"><div class="row"><b style="font-size:16px">${playerLink(p)}</b><span class="pill">${esc(p.lbl)}</span>${statusPills(p)}${tierPill(p)}${upsidePill(p)}${starHTML(starsOf(p))}<span class="spacer"></span><button class="sm" data-action="player" data-pid="${p.id}">Full card</button></div>
    <div class="small muted" style="margin:4px 0">Age ${p.age} · ${fmtHeight(p.m.ht)}, ${p.m.wt} lb · ${p.exp} yr${p.exp === 1 ? '' : 's'} · ${fmtContract(p)}${p.injury ? ` · <span class="bad">out ${p.injury.weeks} wk</span>` : ''}</div>
    <div class="small">${esc(scoutProfile(p, true))}</div>
    <div class="row small" style="margin-top:6px">${rowGrades(p)}${stw ? `<span class="pill ${stw[1]}">${stw[0]}</span>` : ''}${cf.map(sp => `<span class="pill muted" title="${comfortLabel(comfortOf(p, sp))}">${SPOTS[sp].l}</span>`).join('')}</div></div>`;
}
// ---------- playbook (view only) ----------
const PERS_LABEL = { '10': '10 (1 RB, 0 TE, 4 WR)', '11': '11 (1 RB, 1 TE, 3 WR)', '12': '12 (1 RB, 2 TE, 2 WR)', '13': '13 (1 RB, 3 TE, 1 WR)', '21': '21 (2 RB, 1 TE, 2 WR)', '22': '22 (2 RB, 2 TE, 1 WR)', JUMBO: 'Jumbo (6 OL)' };
const TYPE_LABEL = { RUN: 'Designed runs', DRAW: 'Draws', OPTION: 'Option', SNEAK: 'QB sneak', JET: 'Jet sweep', QUICK: 'Quick game', DROP: 'Dropback', DEEP: 'Deep shots', RBSCR: 'RB screen', WRSCR: 'WR screen', GADGET: 'Gadget' };
const FORM_LABEL = { SG: 'Shotgun', UC: 'Under center', PI: 'Pistol', EMP: 'Empty' };
const TAG_LABEL = { PA: 'Play-action', MOTION: 'Motion', RPO: 'RPO', BOOT: 'Bootleg', SIDE: 'Sideline concepts', RUB: 'Rub/pick routes', TRICK: 'Trick plays' };
const SIT_LABEL = { '1st': '1st down', '2L': '2nd & long (7+)', '2S': '2nd & short', '3S': '3rd/4th & 1–2', '3M': '3rd & 3–6', '3L': '3rd & 7+' };
const COV_LABEL = { C0: 'Cover 0', C1: 'Cover 1 (man-free)', C2: 'Cover 2', C2M: '2-Man', C3: 'Cover 3', C4: 'Quarters', T2: 'Tampa 2', C6: 'Cover 6' };
const PRES_LABEL = { FOUR: '4-man rush', BLITZ: 'Man blitz', FZ: 'Fire zone', SIM: 'Simulated pressure', THREE: '3-man rush' };
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
function defLineup(tid, pkg, look) {
  const g = { tids: [tid, tid], side: [null, null], ps: {}, famPen: [0, 0], down: 1, togo: 10, ydl: 30 };
  initSide(g, 0);
  return defUnit(g, 0, defTend(T(tid)).front, pkg, false, false, look);
}
function lineupHTML(units) {
  return units.map(e => `<span class="pill" title="${esc(SPOTS[e.spot] ? SPOTS[e.spot].l : e.spot)}"><b>${e.name}</b> ${e.p.a ? esc(pshort(e.p)) : 'Emergency'}${e.pen >= 3 ? ' <span class="warn">·' + comfortLabel(comfortOf(e.p, e.spot)) + '</span>' : ''}</span>`).join(' ');
}
// ---------- formation viewer: where everyone lines up ----------
const FORM_NAMES = [['SG', 'Shotgun'], ['UC', 'Under center'], ['PI', 'Pistol'], ['EMP', 'Empty']];
function alignOffense(units, form, pers, fm) {
  const flex = pers && fm && FORMS[pers] && FORMS[pers][fm] && FORMS[pers][fm]._flex || [];
  return units.map(e => {
    let x = pers && fm && !OL_SLOTS.includes(e.slot) && e.slot !== 'QB' && e.slot !== 'RB' && e.slot !== 'FB' ? formX(pers, fm, e.slot) : e.x || 0, d = e.depth || 0;
    if (['QB', 'RB', 'FB'].includes(e.slot) && form !== 'EMP') { const b = backSpot(form, fm || (pers ? FORM_HOME[pers] : null), e.slot); return { e, x: b[0], d: e.slot === 'QB' && form === 'UC' ? 2 : b[1] }; }
    if (OL_SLOTS.includes(e.slot)) d = 0;
    else if (e.slot === 'QB') d = form === 'UC' ? 2 : form === 'PI' ? 4 : 5;
    else if (e.slot === 'RB') { if (form === 'EMP') { x = emptySpot(pers || '11', fm || FORM_HOME[pers || '11']); d = 1; } else d = 7; }
    else if (e.slot === 'FB') d = 4;
    else if (INLINE.has(e.slot) && !flex.includes(e.slot)) d = 0.35;
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
      <circle cx="${px}" cy="${py}" r="19"/><text x="${px}" y="${py + 5}" class="sl">${e.name.replace(/[0-9]$/, '')}</text><text x="${px}" y="${py + (off ? 37 : -26)}" class="nm">${esc(e.p.a ? e.p.last : 'Sub')}</text>${!off && d === 0 ? `<text x="${px}" y="${py + 33}" class="tq">${techOf(x)}</text>` : ''}</g>`;
  }
  return g + '</svg>';
}
// ---------- the play caller's fronts: one small diagram for every look he carries ----------
const LOOK_NOTE = {
  'Over': 'Tackle outside the strong guard, nose shaded weak. Balanced.',
  'Weak shade': 'The line slides toward the weak side. Built to stop the run.',
  'G': 'A tackle moves inside the guard to close the middle. Built to stop the run.',
  'Wide': 'Ends line up wide of everyone for a running start at the passer. Softer against the run.',
  'Double 3': 'Both tackles outside the guards: quick inside rush, linebackers own the middle.',
  'Okie': 'Nose on the center, ends on the tackles, outside linebackers on the edges. Balanced.',
  'Tite': 'Ends squeeze inside the tackles to choke inside runs; the edges belong to the outside linebackers.',
  'Eagle': 'Nose shades the center and one end slides inside: a pass-rush look.',
  'Heavy': 'Ends head-up on the tackles, each holding two gaps. Built to stop the run.',
  'Even': 'Two tackles outside the guards, two ends outside the tackles. Balanced.',
  'Tilt': 'One tackle shades the center. Firmer inside, a little less rush.',
  'Pinch': 'Both tackles inside the guards and the ends tight. Stops the inside run; gives up rush and the edge.',
};
function lookFamily(front, pkg) { return pkg === 'BASE' ? (front === '3-4' || front === 'Tite' ? 'odd' : 'even') : 'sub'; }
// the looks this caller carries for a package, home look first: [[name, share]]
function looksFor(tid, pkg) {
  const dt = defTend(T(tid)), lib = dt.pk && dt.pk.lib, fam = lookFamily(dt.front, pkg);
  if (pkg === 'GL') return { fam, list: [] };
  const list = lib ? (fam === 'sub' ? lib.sub : lib.fam === fam ? lib.base : null) : null;
  return { fam, list: (list || [[fam === 'sub' ? 'Even' : LOOK_HOME[dt.front] || 'Over', 1]]).filter(x => LOOKS[fam][x[0]]) };
}
function lookSVG(front, pkg, fam, name) {
  const W = 232, H = 92, cx = W / 2, sx = 26, yo = 62, yd = 34;
  const rows = lookRows(packageLayout0(front, pkg), { t: LOOKS[fam][name].t }).filter(r => r[3] === 0);
  let g = `<svg viewBox="0 0 ${W} ${H}" class="look" role="img" aria-label="${esc(name)} alignment">`;
  for (const [gx, l] of [[0.5, 'A'], [1.5, 'B'], [2.5, 'C']]) for (const s of [-1, 1]) g += `<text x="${cx + s * gx * sx}" y="${H - 4}" class="gap">${l}</text>`;
  for (let i = -2; i <= 2; i++) g += `<rect x="${cx + i * sx - 8}" y="${yo - 8}" width="16" height="16" rx="3" class="ol${i === 0 ? ' c' : ''}"/>`;
  g += `<circle cx="${cx + 2.9 * sx}" cy="${yo}" r="8" class="te"/><text x="${cx + 2.9 * sx}" y="${yo + 3.5}" class="tel">TE</text>`;
  for (const r of rows) { const x = cx + r[2] * sx;
    g += `<circle cx="${x}" cy="${yd}" r="11" class="dl"/><text x="${x}" y="${yd + 3.5}" class="tech">${techOf(r[2])}</text><text x="${x}" y="${yd - 15}" class="slot">${esc(r[0].replace(/[0-9]$/, ''))}</text>`; }
  return g + '</svg>';
}
function frontsHTML(tid, pkg, cur) {
  const t = T(tid), dt = defTend(t), lib = dt.pk && dt.pk.lib, dc = defCaller(t);
  const group = (title, p) => { const { fam, list } = looksFor(tid, p); if (!list.length) return '';
    return `<div class="section-title">${title}</div><div class="look-row">${list.map(([k, v], i) => { const L = LOOKS[fam][k], on = cur && cur.fam === fam && cur.k === k;
      return `<button class="look-tile ${on ? 'sel' : ''}" data-action="pbLook" data-pkg="${p}" data-k="${esc(k)}" title="Show it on the field above with your players"><div class="look-h"><b>${esc(k)}</b><span>${Math.round(v * 100)}%</span></div>${lookSVG(dt.front, p, fam, k)}<div class="look-n">${i === 0 ? '<span class="pill">home look</span> ' : L.k === 'run' ? '<span class="pill">run look</span> ' : L.k === 'rush' ? '<span class="pill">rush look</span> ' : ''}${esc(LOOK_NOTE[k] || '')}</div></button>`; }).join('')}</div>`; };
  let games = '';
  if (lib) {
    const sd = lib.sd || {}, way = [['S', 'to the strength'], ['W', 'away from it'], ['P', 'both tackles pinching']].sort((a, b) => (sd[b[0]] || 0) - (sd[a[0]] || 0));
    games = `<div class="section-title">Line games</div><div class="small"><b>Slants</b> on about ${Math.round(lib.sl * 100)}% of snaps${lib.sl >= 0.02 ? `, most often ${way[0][1]} (${way.map(w => `${w[1]} ${Math.round((sd[w[0]] || 0) * 100)}%`).join(' · ')})` : ''}.<br>
      <b>Twists</b> on about ${Math.round((dt.stunt || 0) * 100)}% of rushes: ${lib.tt >= 0.6 ? 'usually the two tackles trading lanes' : lib.tt <= 0.4 ? 'usually a tackle and the end next to him' : 'tackle with tackle and tackle with end about equally'}.<br>
      <b>Walked-up linebackers</b>: ${lib.mug >= 0.02 ? `about ${Math.round(lib.mug * 100)}% of nickel and dime snaps, more on passing downs. They may come or drop.` : 'almost never.'}</div>`;
  }
  return `<div class="card" style="margin-top:16px"><h3>Fronts · ${dc ? esc(cname(dc)) + "'s looks" : 'the looks'}</h3>
    <div class="small muted" style="margin-bottom:6px">Where each lineman puts his hand down. The number is his technique: 0 on the center, 1 a shade of him; 2i, 2, 3 inside, on and outside the guard; 4i, 4, 5 the same on the tackle; 7, 6, 9 on the tight end's spot; W9 wide of everyone. Letters are the gaps. Run looks come out when a run is expected, rush looks on passing downs. Click one to see it with ${tid === state.userTid ? 'your' : 'their'} players.</div>
    ${group(esc(dt.front || '') + ' base', 'BASE')}${group('Nickel and dime', 'NICKEL')}${games}</div>`;
}
// ---------- the play caller's formations and pass concepts ----------
const FORM_NOTE = {
  Trey: 'Tight end and two receivers to the strength, one receiver alone away from it. The everyday look.', Doubles: 'Two receivers each side. Balanced: the defense cannot roll its coverage one way.',
  Trips: 'Three split to one side, the tight end flexed out as one of them. Isolates the man on the back side; fewer blockers for the run.',
  Bunch: 'Three men in a cluster. Man coverage gets picked off in the traffic and nobody can be pressed.', Tight: 'Everyone in close. Crossers run free and receivers can block the edge; little room for deep balls and outs.',
  Ace: 'A tight end on each side. Balanced run surface with both edges covered.', Wing: 'Both tight ends on the same side. An extra blocker and gap at the point of attack.',
  Heavy: 'Extra tight ends on the line. Built to run and to throw off the run.', I: 'Under center, fullback straight ahead of the tailback. A lead blocker through either side.', Offset: 'Under center, the fullback a step to the strong side. The lead block gets there sooner that way and later the other.', Split: 'Shotgun with a back on each side of the quarterback. Both can protect or release.', Jumbo: 'A sixth lineman. Short yardage and the goal line.',
};
// roughly how often he lines up in each formation of a grouping, from his habits
function formShares(t, pers) {
  const ot = offTend(t), ft = formTraits(t), F = FORMS[pers] || {}, s = ['10', '11'].includes(pers) ? 1 - clamp(ot.uc || 0, 0, 0.92) : 0, out = {};
  const pT = F.Trips ? s * (ot.trips || 0) : 0, pB = F.Bunch ? (s - pT) * (ot.bunch || 0) : 0, r1 = 1 - pT - pB, pTi = F.Tight ? r1 * (ot.tight || 0) : 0, r2 = r1 - pTi;
  const pD = F.Doubles && FORM_HOME[pers] !== 'Doubles' ? r2 * ft.doubles : 0, pW = F.Wing ? (r2 - pD) * ft.wing : 0;
  if (pT) out.Trips = pT; if (pB) out.Bunch = pB; if (pTi) out.Tight = pTi; if (pD) out.Doubles = pD; if (pW) out.Wing = pW;
  let home = Math.max(0, r2 - pD - pW);
  if (F.Split) { const uc = clamp((ot.uc || 0) + 0.3, 0, 0.92), gun = (1 - uc) * 0.85; out.Split = home * gun; out.Offset = home * uc * ft.offI; home -= out.Split + out.Offset; }
  out[FORM_HOME[pers]] = Math.max(0, home);
  return Object.entries(out).sort((a, b) => (b[0] === FORM_HOME[pers]) - (a[0] === FORM_HOME[pers]) || b[1] - a[1]);
}
function formSVG(pers, fm) {
  const W = 232, H = 84, cx = W / 2, sx = 24, yl = 20, F = FORMS[pers][fm] || {}, flex = F._flex || [];
  let g = `<svg viewBox="0 0 ${W} ${H}" class="look" role="img" aria-label="${esc(fm)} formation">`;
  for (let i = -2; i <= 2; i++) g += `<rect x="${cx + i * sx - 7}" y="${yl - 7}" width="14" height="14" rx="3" class="ol${i === 0 ? ' c' : ''}"/>`;
  const snap = formSnap(pers, fm), by = d => 9 + d * 5.6, q = backSpot(snap, fm, 'QB');
  g += `<circle cx="${cx}" cy="${yl + by(q[1])}" r="7" class="sk q"/><text x="${cx}" y="${yl + by(q[1]) + 3}" class="tech">Q</text>`;
  for (const k of PERSONNEL[pers]) { const inl = INLINE.has(k) && !flex.includes(k), bk = k === 'RB' || k === 'FB' ? backSpot(snap, fm, k) : null, x = bk ? bk[0] : formX(pers, fm, k), d = bk ? by(bk[1]) : inl || k === 'X' ? 0 : 9;
    const px = clamp(cx + x * sx, 10, W - 10), py = yl + d + (k === 'FB' ? 0 : 0);
    g += inl ? `<rect x="${px - 7}" y="${py - 7}" width="14" height="14" rx="3" class="ol te2"/>` : `<circle cx="${px}" cy="${py}" r="7.5" class="sk"/>`;
    g += `<text x="${px}" y="${py + (d >= 40 ? 3 : inl ? 3 : 3)}" class="tech" style="font-size:7.5px">${esc({ SLOT: 'S', SLOT2: 'S', OL6: 'T', Y2: 'Y' }[k] || k[0])}</text>`; }
  return g + '</svg>';
}
function offBookHTML(tid, pers, fmCur) {
  const t = T(tid), oc = offCaller(t), ft = formTraits(t), book = conceptBook(t), shares = formShares(t, pers);
  const tiles = shares.map(([k, v]) => `<button class="look-tile ${k === fmCur ? 'sel' : ''}" data-action="pbFm" data-k="${esc(k)}" title="Show it on the field above with ${tid === state.userTid ? 'your' : 'their'} players"><div class="look-h"><b>${esc(k)}</b><span>${Math.round(v * 100)}%</span></div>${formSVG(pers, k)}<div class="look-n">${k === FORM_HOME[pers] ? '<span class="pill">home</span> ' : ''}${esc(FORM_NOTE[k] || '')}</div></button>`).join('');
  const COVN = { C0: 'Cover 0', C1: 'Cover 1', C2: 'Cover 2', C2M: '2-Man', C3: 'Cover 3', C4: 'Quarters', T2: 'Tampa 2', C6: 'Cover 6' };
  const beats = k => { const e = Object.entries(CONCEPTS[k].vs).sort((a, b) => b[1] - a[1]); return [e.filter(x => x[1] >= 0.07).slice(0, 3).map(x => COVN[x[0]]), e.filter(x => x[1] <= -0.07).slice(-3).reverse().map(x => COVN[x[0]])]; };
  const fam = (f, title) => `<div class="section-title">${title}</div><div class="cpt-row">${Object.entries(book[f] || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => { const [good, poor] = beats(k);
    return `<div class="cpt"><div class="look-h"><b>${esc(k)}</b><span>${Math.round(v * 100)}%</span></div><div class="look-n">${esc(CONCEPTS[k].d)}</div>${good.length ? `<div class="small"><span class="good">Beats</span> ${good.join(', ')}</div>` : ''}${poor.length ? `<div class="small"><span class="bad">Struggles against</span> ${poor.join(', ')}</div>` : ''}</div>`; }).join('')}</div>`;
  return `<div class="card" style="margin-top:16px"><h3>Formations and pass concepts · ${oc ? esc(cname(oc)) + "'s book" : 'the book'}</h3>
    <div class="small muted" style="margin-bottom:6px">How he lines up ${esc(PERS_LABEL[pers] || pers)}, and how often. Pick another grouping on the field above. What a formation does comes from where it puts people: the defense lines up to it, and the strong side is the ${ft.strR >= 0.55 ? 'right more often than the left' : ft.strR <= 0.47 ? 'left more often than the right' : 'right and the left about equally'}.${ft.move ? ' He moves his best receiver around the formation to find a matchup.' : ''}</div>
    <div class="look-row">${tiles}</div>
    ${fam('QUICK', 'Quick game')}${fam('DROP', 'Dropback')}${fam('DEEP', 'Deep shots')}
    <div class="small muted" style="margin-top:6px">He carries these and no others. A sharp play caller leans on the ones that beat what a defense keeps playing, and a quarterback who reads the coverage can get to a better one at the line.</div></div>`;
}
function formationViewerHTML(tid) {
  const ot = offTend(T(tid)), dt = defTend(T(tid));
  const persUsed = Object.entries(ot.pers || {}).sort((x, y) => y[1] - x[1]).map(x => x[0]).filter(k => PERSONNEL[k]);
  const allPers = [...persUsed, ...Object.keys(PERSONNEL).filter(k => !persUsed.includes(k))];
  const pers = ui.pbPers && PERSONNEL[ui.pbPers] ? ui.pbPers : persUsed[0] || '11';
  const form = ui.pbForm || 'SG', pkg = ui.pbPkg || 'NICKEL';
  const btn = (act, v, cur, l, dim) => `<button class="sm ${v === cur ? 'primary' : ''}" data-action="${act}" data-v="${v}" ${dim ? 'style="opacity:.6"' : ''}>${l}</button>`;
  const fmCur = FORMS[pers] && FORMS[pers][ui.pbFm] ? ui.pbFm : FORM_HOME[pers];
  const offPts = alignOffense(lineupFor(tid, pers), form, pers, fmCur);
  // the look on the field: the one clicked below if this package has it, otherwise the caller's home look
  const lk = looksFor(tid, pkg), lookName = lk.list.some(x => x[0] === ui.pbLook) ? ui.pbLook : lk.list.length ? lk.list[0][0] : null, cur = lookName ? { fam: lk.fam, k: lookName } : null;
  const defPts = defLineup(tid, pkg, lookName ? { t: LOOKS[lk.fam][lookName].t } : null).map(e => ({ e, x: e.x || 0, d: e.depth || 0 }));
  return `<div class="grid fv-grid" style="margin-top:16px">
    <div class="card"><h3>Offense · ${esc(PERS_LABEL[pers] || pers)} · ${esc(fmCur)} · ${FORM_NAMES.find(f => f[0] === form)[1]}</h3>
      <div class="row" style="gap:4px;margin-bottom:6px">${allPers.map(k => btn('pbPers', k, pers, k, !persUsed.includes(k))).join('')}</div>
      <div class="row" style="gap:4px;margin-bottom:8px">${FORM_NAMES.map(([k, l]) => btn('pbForm', k, form, l)).join('')}</div>
      ${formationSVG(offPts, 'off')}
      <div class="small muted">Dimmed groupings aren't part of this play caller's usual mix. Orange rings: lined up away from a spot he's comfortable at. Click a player for his card.</div></div>
    <div class="card"><h3>Defense · ${PKG_LABEL[pkg]} · ${lookName ? esc(lookName) + ' look' : esc(dt.front || '') + ' front'}</h3>
      <div class="row" style="gap:4px;margin-bottom:8px">${['BASE', 'NICKEL', 'DIME', 'GL'].map(k => btn('pbPkg', k, pkg, PKG_LABEL[k])).join('')}</div>
      ${formationSVG(defPts, 'def')}
      <div class="small muted">Shown from the defense's side: the ball is at the bottom. Edges, tackles and nose line up by the front; corners, nickel and safeties by the package. The small number under a lineman is his technique.</div></div></div>${offBookHTML(tid, pers, fmCur)}${frontsHTML(tid, pkg, cur)}`;
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
  ensureChem();
  const tab = ['over', 'off', 'def', 'field', 'scout', 'who'].includes(ui.pbTab) ? ui.pbTab : 'over';
  const tabs = [['over', 'Overview'], ['off', 'Offense'], ['def', 'Defense'], ['field', 'On the field'], ['scout', 'Self-scout'], ['who', 'Who plays']];
  html += `<div class="subtabs">${tabs.map(([k2, l]) => `<button class="${tab === k2 ? 'on' : ''}" data-action="pbTab" data-v="${k2}">${l}</button>`).join('')}</div>`;
  const insBar = side => { const v = installedPct(tid, side), pl = installPlan(tid, side), sz = sysSize(tid, side), big = sz >= (side === 'O' ? 0.95 : 0.5), small = sz <= (side === 'O' ? 0.65 : 0.22);
    return `<div class="pb-ins"><div class="row"><b>${side === 'O' ? 'Offense' : 'Defense'}</b><span class="muted small">${esc(teamSchemeLabel(t, side) || '')}</span><span class="spacer"></span><b>${Math.round(v)}%</b> <span class="muted small">installed</span></div>
      <div class="chm-t" style="height:8px;margin:6px 0"><i style="width:${Math.round(v)}%;background:${gradeColor(v)}"></i>${pl.cap < 99 ? `<b style="left:${Math.round(pl.cap)}%"></b>` : ''}</div>
      <div class="small muted">${big ? 'A big system: more answers, more to learn.' : small ? 'A compact system: quick to learn, less in it.' : 'An ordinary-sized system.'} ${pl.cap < 99 ? `Under this coordinator the unit tops out near ${Math.round(pl.cap)}%.` : ''} ${v < 88 ? 'Until it is in, the caller keeps to what the players know: fewer formations, concepts and looks.' : ''}</div></div>`; };
  const chemRow = us => us.map(u => { const v = u === 'D' ? defChem(tid) : unitChem(tid, u); return `<div class="chm"><span class="chm-l">${u === 'D' ? 'The defense' : CH_NAME[u]}</span><span class="chm-t"><i style="width:${Math.round(v)}%;background:${gradeColor(v)}"></i></span><span class="chm-w">${chemWord(v)}</span></div>`; }).join('');
  if (tab === 'over') {
    const dot = greenDot(tid), hc = C(t.hc);
    html += `<div class="grid g2"><div class="card"><h3>What is installed</h3>${insBar('O')}<div style="height:12px"></div>${insBar('D')}</div>
      <div class="card"><h3>Chemistry</h3><div class="chm-col">${chemRow(['OL', 'QB', 'DL', 'LB', 'DB', 'D', 'KB'])}</div>
        <div class="small muted" style="margin-top:8px">How well the men in each unit know each other. It builds with weeks together, faster under a head coach who builds a team, and only as far as each room's coach can take it.</div></div></div>
      <div class="grid g3" style="margin-top:14px">
        <div class="card"><h3>Calls the offense</h3><div>${coachNameLink(oc)} <span class="muted small">${oc ? ROLE_SHORT[oc.role] : ''}</span></div><div class="small muted" style="margin-top:4px">${esc(teamSchemeLabel(t, 'O') || '')}</div></div>
        <div class="card"><h3>Calls the defense</h3><div>${coachNameLink(dc)} <span class="muted small">${dc ? ROLE_SHORT[dc.role] : ''}</span></div><div class="small muted" style="margin-top:4px">${esc(teamSchemeLabel(t, 'D') || '')}${dot ? ` · green dot ${playerLink(dot, true)}` : ''}</div></div>
        <div class="card"><h3>Practice</h3><div><b>${Math.round(repAllowance(tid))}</b> <span class="muted small">reps in a week (100 is ordinary)</span></div><div class="small muted" style="margin-top:4px">${hc ? esc(cname(hc)) + ' runs it.' : ''} The extra, or the shortfall, lands on the second and third team.</div></div>
      </div>`;
  }
  if (tab === 'off') html += `<div class="grid g2">` + `<div class="card"><h3>Offense · ${esc(teamSchemeLabel(t, 'O') || '—')}</h3><div class="small" style="margin-bottom:8px">${offPkHTML(offTend(t))}<br><span class="muted">This is what your staff has installed. Names in brackets are packages your specialists brought. The name of the offense is read off the sheet.</span></div><div class="small muted" style="margin-bottom:8px">Play caller: ${coachNameLink(oc)} ${oc ? `(${ROLE_SHORT[oc.role]})` : ''}</div>
    ${tendBar('Pass rate', ot.pass, 'Share of dropbacks on neutral downs')}${tendBar('Zone runs', ot.zone, 'Zone vs gap/power run scheme')}${tendBar('Under center', ot.uc)}${tendBar('Quick game', ot.quick)}${tendBar('Deep shots', ot.deep)}
    ${tendBar('Screens', ot.screen)}${tendBar('Play-action', ot.pa)}${tendBar('Motion', ot.motion)}${tendBar('RPO', ot.rpo)}${tendBar('Bootlegs', ot.boot)}${tendBar('QB runs', ot.qbRun)}${tendBar('Lead back share', ot.rb1, 'How much the No. 1 back carries it')}
    <div class="section-title">Personnel mix</div><div class="row small">${Object.entries(ot.pers || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="pill">${k} · ${Math.round(100 * v / persTot)}%</span>`).join(' ')}</div></div>` + `<div>${insBar('O')}<div class="card" style="margin-top:14px"><h3>Chemistry</h3><div class="chm-col">${chemRow(['OL', 'QB'])}</div></div></div></div>`;
  if (tab === 'def') html += `<div class="grid g2"><div>${insBar('D')}<div class="card" style="margin-top:14px"><h3>Chemistry</h3><div class="chm-col">${chemRow(['DL', 'LB', 'DB', 'D'])}</div></div></div>` + `<div class="card"><h3>Defense · ${esc(teamSchemeLabel(t, 'D') || '—')}</h3><div class="small muted" style="margin-bottom:8px">Play caller: ${coachNameLink(dc)} ${dc ? `(${ROLE_SHORT[dc.role]})` : ''} · ${esc(dt.front || '')} front</div>
    ${dt.pk ? `<div class="small" style="margin-bottom:8px"><b>Coverage packages:</b> ${Object.entries(dt.pk.sh).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${SHELLS[k]} ${Math.round(v * 100)}%${dt.pk.by[k] && C(dt.pk.by[k]) ? ` <span class="muted">(${esc(C(dt.pk.by[k]).last)})</span>` : ''}`).join(' · ')}<br><b>Pressure packages:</b> ${Object.entries(dt.pk.pr).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${PRESSURES[k]} ${Math.round(v * 100)}%${dt.pk.by[k] && C(dt.pk.by[k]) ? ` <span class="muted">(${esc(C(dt.pk.by[k]).last)})</span>` : ''}`).join(' · ')}${dt.pk.fr && (dt.pk.fr.UNDER || dt.pk.fr.BEAR || dt.pk.fr.BIGN) ? `<br><b>Front and sub packages:</b> ${dt.front} base${['UNDER', 'BEAR', 'BIGN'].filter(k => dt.pk.fr[k]).map(k => ` · ${PK_NAME[k]}${dt.pk.by[k] && C(dt.pk.by[k]) ? ` <span class="muted">(${esc(C(dt.pk.by[k]).last)})</span>` : ''}`).join('')}` : ''}${dt.pk.disg ? `<br>Disguises the coverage on ${Math.round(dt.pk.disg * 100)}% of snaps${dt.pk.by.DISG && C(dt.pk.by.DISG) ? ` <span class="muted">(${esc(C(dt.pk.by.DISG).last)})</span>` : ''}` : ''}<br><span class="muted">Names in brackets are packages your specialists installed. The bars below are read off this sheet.</span></div>` : ''}
    ${tendBar('Man coverage', dt.man)}${tendBar('Two-high shells', dt.high)}${tendBar('Blitz', dt.blitz)}${tendBar('Simulated pressure', dt.sim)}${tendBar('Stunts', dt.stunt)}${tendBar('Base personnel', dt.base, 'vs. nickel/dime')}</div></div>`;
  if (tab === 'field') html += formationViewerHTML(tid);
  // ---- self-scout ----
  if (tab !== 'scout') { /* another tab */ } else if (src) {
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
  if (tab !== 'who') return html;
  const persUsed = Object.entries(ot.pers || {}).sort((x, y) => y[1] - x[1]).map(x => x[0]).filter(k => PERSONNEL[k]);
  html += `<div class="section-title">Packages · who's on the field <span class="small muted">· from ${tid === u ? 'your depth chart' : 'their depth chart'}${tid === u ? ' (edit on the Depth Chart page)' : ''}</span></div><div class="card">
    ${persUsed.map(k => `<div style="margin:6px 0"><div class="small" style="font-weight:700">${PERS_LABEL[k] || k}</div><div class="row small" style="gap:4px">${lineupHTML(lineupFor(tid, k).filter(e => e.slot !== 'QB' && !OL_SLOTS.includes(e.slot)))}</div></div>`).join('')}
    <div style="margin:6px 0"><div class="small" style="font-weight:700">Offensive line & QB</div><div class="row small" style="gap:4px">${lineupHTML(lineupFor(tid, '11').filter(e => e.slot === 'QB' || OL_SLOTS.includes(e.slot)))}</div></div>
    ${['BASE', 'NICKEL', 'DIME'].map(k => `<div style="margin:6px 0"><div class="small" style="font-weight:700">${PKG_LABEL[k]} defense</div><div class="row small" style="gap:4px">${lineupHTML(defLineup(tid, k))}</div></div>`).join('')}</div>`;
  return html;
}

// ---------- schedule ----------
function schedWeeksHTML(u, weeks, label, live) {
  if (!weeks || !weeks.length) return '<div class="card muted">Nothing was kept for this part of that season.</div>';
  const mine = weeks.map((wk, i) => { const m = wk.find(g => g[0] === u || g[1] === u); return m ? { wk: i + 1, h: m[0], a: m[1], hs: m[2], as: m[3] } : { wk: i + 1 }; });
  const w = Math.min(ui.schedWeekA || 1, weeks.length);
  let html = `<div class="grid g2"><div class="card"><h3>${T(u).abbr} · ${label}</h3>` + table('schedA', [
    { k: 'wk', l: label === 'Preseason' ? 'Game' : 'Wk', f: m => m.wk },
    { k: 'o', l: 'Opponent', f: m => m.h === undefined ? '<span class="muted">Bye</span>' : (m.h === u ? 'vs ' : '@ ') + teamLink(m.h === u ? m.a : m.h, true) },
    { k: 'r', l: 'Result', f: m => { if (m.h === undefined || m.hs < 0) return ''; const a = m.h === u ? m.hs : m.as, b = m.h === u ? m.as : m.hs; return `<b class="${a > b ? 'good' : a < b ? 'bad' : ''}">${a > b ? 'W' : a < b ? 'L' : 'T'}</b> ${a}–${b}`; } },
  ], mine, { nosort: 1 }) + `</div><div class="card"><h3>Scoreboard</h3><div class="row" style="margin-bottom:10px"><select data-change="schedWeekA">${weeks.map((_, i) => `<option value="${i + 1}" ${i + 1 === w ? 'selected' : ''}>${label === 'Preseason' ? 'Game' : 'Week'} ${i + 1}</option>`).join('')}</select></div><div class="games">`;
  for (const m of weeks[w - 1]) html += m[2] < 0 ? `<div class="game" style="cursor:default"><div class="ln"><span>${T(m[1]).abbr}</span></div><div class="ln"><span>@ ${T(m[0]).abbr}</span></div></div>` : `<div class="game${m[0] === u || m[1] === u ? ' mine' : ''}" style="cursor:default"><div class="ln ${m[3] > m[2] ? 'w' : ''}"><span>${T(m[1]).abbr}</span><span>${m[3]}</span></div><div class="ln ${m[2] > m[3] ? 'w' : ''}"><span>${T(m[0]).abbr}</span><span>${m[2]}</span></div></div>`;
  return html + '</div></div></div>';
}
function scheduleHTML() {
  const u = state.userTid, recs = standings();
  const yrs = [state.season, ...state.history.filter(h => h.res || (h.wrap && h.wrap.bracket)).map(h => h.season).reverse()].filter((v, i, a) => a.indexOf(v) === i);
  const yr = yrs.includes(ui.schedYr) ? ui.schedYr : state.season, cur = yr === state.season, part = ui.schedPart || 'reg', hist = state.history.find(h => h.season === yr);
  const head = `<div class="row" style="margin-bottom:12px;gap:8px"><select data-change="schedYr">${yrs.map(y => `<option value="${y}" ${y === yr ? 'selected' : ''}>${y}${y === state.season ? ' (current)' : ''}</option>`).join('')}</select><div class="subtabs" style="margin:0">${[['pre', 'Preseason'], ['reg', 'Regular season'], ['po', 'Playoffs']].map(([k, l]) => `<button class="${k === part ? 'on' : ''}" data-action="schedPart" data-part="${k}">${l}</button>`).join('')}</div></div>`;
  if (part === 'pre') return head + schedWeeksHTML(u, cur ? (state.pre && state.pre.sched ? packWeeks(state.pre.sched) : state.preRes) : hist && hist.res ? hist.res.pre : null, 'Preseason');
  if (part === 'po') { if (cur) return head + (state.playoffs ? `<div class="card"><h3>Playoff Bracket</h3>${bracketHTML()}</div>` : '<div class="card muted">The playoffs have not started.</div>'); const br = hist && hist.wrap && hist.wrap.bracket; return head + (br ? `<div class="card"><h3>${yr} playoffs</h3><div class="wr-br">${br.map(rd => `<div><div class="wr-k">${rd.name}</div>${rd.games.map(g => { const hi = g.score ? Math.max(...g.score) : '', lo = g.score ? Math.min(...g.score) : '', lose = g.win === g.h ? g.a : g.h; return `<div class="wr-g${g.h === u || g.a === u ? ' u' : ''}"><b>${T(g.win).abbr}</b> ${hi} <span class="muted">${T(lose).abbr} ${lo}</span></div>`; }).join('')}</div>`).join('')}</div></div>` : '<div class="card muted">That bracket was not kept.</div>'); }
  if (!cur) return head + schedWeeksHTML(u, hist && hist.res ? hist.res.reg : null, 'Regular season');
  let html = head + '<div class="grid g2">';
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
  returns: { min: s => (s.krA || 0) + (s.prA || 0) >= 1, sort: 'krY', cols: [['krA', 'KR'], ['krY', 'KR Yds'], ['kravg', 'KR Avg', s => s.krA ? round1(s.krY / s.krA) : 0], ['prA', 'PR'], ['prY', 'PR Yds'], ['pravg', 'PR Avg', s => s.prA ? round1(s.prY / s.prA) : 0], ['rtd', 'TD', s => (s.krTD || 0) + (s.prTD || 0)]] },
  special: { min: s => (s.sts || 0) >= 20, sort: 'stk', cols: [['sts', 'ST snaps'], ['stk', 'ST tkl'], ['stg', 'ST grade', s => stGrade(s) || 0], ['snp', 'Scrimmage snaps']] },
  kicking: { pos: ['K', 'P'], min: s => (s.fga || 0) + (s.pnt || 0) >= 1, sort: 'fgm', cols: [['fgm', 'FGM'], ['fga', 'FGA'], ['fgp', 'FG%', s => s.fga ? round1(100 * s.fgm / s.fga) : 0], ['fgLng', 'Lng'], ['xpm', 'XPM'], ['xpa', 'XPA'], ['pnt', 'Punts'], ['pavg', 'P Avg', s => s.pnt ? round1(s.pntY / s.pnt) : 0], ['pi20', 'In 20']] },
};
const ADV_GROUPS = {
  QB: { spots: ['QB'], min: (a, k) => (a.db || 0) >= 60 * k, cols: [['EPA/db', a => a.db ? a.epaDb / a.db : 0, 2], ['CPOE', a => a.att ? 100 * (a.cmp - a.xc) / a.att : 0, 1], ['TTT', a => a.tttN ? a.ttt / a.tttN : 0, 2], ['aDOT', a => a.att ? a.air / a.att : 0, 1], ['Pressured%', a => a.db ? 100 * (a.prsd || 0) / a.db : 0, 0]] },
  'WR/TE': { spots: ['WRX', 'WRZ', 'SLOT', 'TEY', 'TEH'], min: (a, k) => (a.routes || 0) >= 60 * k, cols: [['Routes', a => a.routes || 0, 0], ['Sep (yds)', a => a.sepR && a.routes ? a.sepR / a.routes : a.sepN ? a.sep / a.sepN : 0, 2], ['Tgt/Route%', a => a.routes ? 100 * (a.sepN || 0) / a.routes : 0, 0], ['aDOT', a => a.sepN ? a.adot / a.sepN : 0, 1], ['EPA/Tgt', a => a.sepN ? (a.epaTgt || 0) / a.sepN : 0, 2]] },
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
    if (!statTeamOk(tid)) continue;
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
function foldAttr(k) { return `data-fold="${k}" ${ui.fold && ui.fold[k] ? 'open' : ''}`; }
function statTeamSel() {
  const u = state.userTid, cur = ui.statTeam == null ? '' : ui.statTeam;
  const ts = [T(u), ...state.teams.filter(t => t.id !== u).sort((a, b) => (a.region + a.name).localeCompare(b.region + b.name))];
  return `<select data-change="statTeam" title="Show one team's players"><option value="">All teams</option>${ts.map(t => `<option value="${t.id}" ${cur === t.id ? 'selected' : ''}>${t.region} ${t.name}${t.id === u ? ' (my team)' : ''}</option>`).join('')}</select>`;
}
function statTeamOk(tid) { return ui.statTeam == null || tid === ui.statTeam; }
function statsHead(season, seasons, teams) {
  return `<div class="subtabs">${[...Object.keys(STAT_CATS), 'advanced', 'teams'].map(k => `<button class="${k === ui.statCat ? 'on' : ''}" data-action="statCat" data-cat="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}
    <span class="spacer"></span>${teams ? '' : `<select data-change="statSeason">${seasons.map(x => `<option ${x === season ? 'selected' : ''}>${x}</option>`).join('')}</select>${statTeamSel()}`}</div>`;
}
// season totals for every club, built from the box scores (regular season only)
function teamTotals() {
  const z = () => Object.assign({ g: 0, pts: 0 }, newTS());
  const out = state.teams.map(t => ({ t, o: z(), d: z() }));
  const add = (acc, ts, pts) => { acc.g++; acc.pts += pts; for (const k in ts) acc[k] = (acc[k] || 0) + (ts[k] || 0); };
  for (const b of Object.values(state.games)) {
    if (b.pre || b.playoff || b.season !== state.season || !b.ts) continue;
    for (const i of [0, 1]) { const r = out[b.tids[i]]; if (!r) continue; add(r.o, b.ts[i], b.score[i]); add(r.d, b.ts[1 - i], b.score[1 - i]); }
  }
  return out;
}
function teamStatsHTML() {
  const side = ui.statSide || 'off', per = ui.statPer !== 'tot', rows = teamTotals().filter(r => r.o.g);
  const head = `<div class="row" style="margin-bottom:10px"><span class="seg">${[['off', 'Offense'], ['def', 'Defense'], ['net', 'Differential']].map(([k, l]) => `<button class="sm ${side === k ? 'on' : ''}" data-action="statSide" data-v="${k}">${l}</button>`).join('')}</span>
    <span class="seg">${[['pg', 'Per game'], ['tot', 'Totals']].map(([k, l]) => `<button class="sm ${(per ? 'pg' : 'tot') === k ? 'on' : ''}" data-action="statPer" data-v="${k}">${l}</button>`).join('')}</span>
    <span class="spacer"></span><span class="small muted">${state.season} regular season · click a column to sort</span></div>`;
  if (!rows.length) return head + '<div class="card muted">No regular-season games have been played yet this year.</div>';
  const team = { k: 't', l: 'Team', v: r => r.t.abbr, f: r => teamLink(r.t.id, true) }, gp = { k: 'g', l: 'G', v: r => r.o.g, num: 1 };
  const rk = { k: 'rk', l: '#', f: (r, i) => i + 1 };
  const rowClass = r => r.t.id === state.userTid ? 'me' : '';
  if (side === 'net') {
    const d = (l, k, fn, dp = 1, title = '') => ({ k, l, num: 1, title, v: r => fn(r), f: r => { const v = fn(r); return `<span class="${v > 0 ? 'good' : v < 0 ? 'bad' : ''}">${v > 0 ? '+' : ''}${v.toFixed(dp)}</span>`; } });
    const yds = a => a.passY + a.rushY, ypp = a => a.plays ? yds(a) / a.plays : 0;
    return head + '<div class="card">' + table('tstat-net', [rk, team, gp,
      d('Pts/G', 'pts', r => (r.o.pts - r.d.pts) / r.o.g), d('Yds/G', 'yds', r => (yds(r.o) - yds(r.d)) / r.o.g), d('Yds/Play', 'ypp', r => ypp(r.o) - ypp(r.d), 2),
      d('Y/Att', 'ypa', r => (r.o.passA ? r.o.passY / r.o.passA : 0) - (r.d.passA ? r.d.passY / r.d.passA : 0), 2), d('Y/Car', 'ypc', r => (r.o.rushA ? r.o.rushY / r.o.rushA : 0) - (r.d.rushA ? r.d.rushY / r.d.rushA : 0), 2),
      d('Sacks', 'sk', r => r.d.sacks - r.o.sacks, 0, 'Sacks made minus sacks allowed'), d('Turnovers', 'to', r => r.d.to - r.o.to, 0, 'Takeaways minus giveaways'),
      d('3rd down %', 'd3', r => 100 * ((r.o.d3a ? r.o.d3c / r.o.d3a : 0) - (r.d.d3a ? r.d.d3c / r.d.d3a : 0)), 1),
    ], rows, { sort: 'pts', rowClass }) + '</div>';
  }
  const A = r => side === 'off' ? r.o : r.d, def = side === 'def';
  const vol = (l, k, fn, title = '') => ({ k, l, num: 1, title, v: r => per ? fn(A(r)) / A(r).g : fn(A(r)), f: r => per ? (fn(A(r)) / A(r).g).toFixed(1) : Math.round(fn(A(r))) });
  const rate = (l, k, fn, dp = 1, title = '') => ({ k, l, num: 1, title, v: r => fn(A(r)), f: r => fn(A(r)).toFixed(dp) });
  const cols = [rk, team, gp,
    vol(def ? 'Pts allowed' : 'Points', 'pts', a => a.pts), vol('Yards', 'yds', a => a.passY + a.rushY), vol('Plays', 'plays', a => a.plays),
    rate('Yds/Play', 'ypp', a => a.plays ? (a.passY + a.rushY) / a.plays : 0, 2),
    vol('Pass yds', 'passY', a => a.passY), rate('Cmp%', 'pct', a => a.passA ? 100 * a.passC / a.passA : 0), rate('Y/Att', 'ypa', a => a.passA ? a.passY / a.passA : 0, 2),
    vol(def ? 'Sacks' : 'Sacks allowed', 'sacks', a => a.sacks),
    vol('Rush yds', 'rushY', a => a.rushY), vol('Carries', 'rushA', a => a.rushA), rate('Y/Car', 'ypc', a => a.rushA ? a.rushY / a.rushA : 0, 2),
    vol('1st downs', 'fd', a => a.fd), rate('3rd down %', 'd3', a => a.d3a ? 100 * a.d3c / a.d3a : 0),
    vol(def ? 'Takeaways' : 'Giveaways', 'to', a => a.to), vol('Punts', 'punts', a => a.punts),
    ...(def ? [] : [vol('Penalties', 'pen', a => a.pen || 0, 'Accepted penalties committed'), vol('Pen yds', 'penY', a => a.penY || 0)]),
  ];
  return head + '<div class="card">' + table('tstat-' + side, cols, rows, { sort: 'pts', dir: def ? 1 : -1, rowClass }) + '</div>' + (def ? '<div class="muted small" style="margin-top:6px">Defense shows what each club has allowed: fewest points first.</div>' : '');
}
function statsHTML() {
  const seasons = [state.season, ...state.history.map(h => h.season).filter(x => x !== state.season).reverse()];
  const season = ui.statSeason || state.season;
  if (ui.statCat === 'teams') return statsHead(season, seasons, true) + teamStatsHTML();
  if (ui.statCat === 'advanced') return statsHead(season, seasons) + advStatsHTML(season);
  const cat = STAT_CATS[ui.statCat];
  let rows = [];
  for (const p of Object.values(state.players)) {
    if (cat.pos && !cat.pos.includes(p.pos)) continue;
    const live = season === state.season && (state.phase === 'REG' || state.phase === 'PLAYOFFS');
    const s = live ? (p.stats.gp ? p.stats : null) : p.career.find(c => c.season === season);
    if (!s || !cat.min(s)) continue;
    const tid = live ? p.tid : s.tid;
    if (!statTeamOk(tid)) continue;
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
  let html = statsHead(season, seasons);
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
// ---------- practice: rooms, reps, playbook install ----------
function charPill(p, k) { const l = charRead(p, k); return l ? `<span class="pill ${charCls(l)}">${l}</span>` : '<span class="muted small">Too early to say</span>'; }
function pbBar(k) { const c = k >= 85 ? 'var(--good)' : k >= 60 ? 'var(--mid, #c9a227)' : 'var(--bad)'; return `<span class="pbbar" title="${Math.round(k)}% of the playbook"><i style="width:${Math.round(k)}%;background:${c}"></i></span> <span class="small">${Math.round(k)}%</span>`; }
function pracChip(p) {
  const pr = p.prac;
  if (!pr) return '<span class="muted small">—</span>';
  if (pr.dnp) return '<span class="pill inj">Did not practice</span>';
  const l = pracGradeLabel(pr.g), c = pr.g >= 59 ? 'good' : pr.g < 42 ? 'bad' : '';
  return `<span class="pill ${c}">${l}</span>`;
}
function pracTrend(p) { const h = (p.pracH || []).slice(-5); return h.map(g => `<i class="pdot" style="background:${g >= 59 ? 'var(--good)' : g < 42 ? 'var(--bad)' : 'var(--muted)'}" title="${pracGradeLabel(g)}"></i>`).join(''); }
function crossTrainSelect(p, card) { // where he is working: his own spot, another one, or a split of the two
  if ((p.tid !== state.userTid && !(p.tid === -3 && p.psTid === state.userTid)) || !p.a) return '';
  const opts = workSpots(p); if (opts.length < 2) return card ? '<span class="small muted">He only plays one spot.</span>' : '';
  const w = workOf(p), lab = sp => `${SPOTS[sp].l}${sp === p.spot ? '' : ' (' + comfortLabel(comfortOf(p, sp)).toLowerCase() + ')'}`, cd = card ? ' data-card="1"' : '';
  return `<span class="work-sel"><select data-change="workSet" data-part="a" data-pid="${p.id}"${cd} class="${w.a !== p.spot ? 'on' : ''}" title="The spot he practices and competes at">${opts.map(sp => `<option value="${sp}" ${w.a === sp ? 'selected' : ''}>${lab(sp)}</option>`).join('')}</select><select data-change="workSet" data-part="b" data-pid="${p.id}"${cd} class="${w.b ? 'on' : ''}" title="A second spot that takes a share of his reps"><option value="">+ second spot</option>${opts.filter(sp => sp !== w.a).map(sp => `<option value="${sp}" ${w.b === sp ? 'selected' : ''}>${lab(sp)}</option>`).join('')}</select>${w.b ? `<select data-change="workSet" data-part="sb" data-pid="${p.id}"${cd} title="Share of his reps at the second spot">${[0.2, 0.3, 0.4, 0.5].map(v => `<option value="${v}" ${Math.abs(w.sb - v) < 0.05 ? 'selected' : ''}>${Math.round(v * 100)}% there</option>`).join('')}</select>` : ''}</span>`;
}
// camp, exhibition and season grades in one glance, for any list of players
function rowGrades(p) {
  const cg = campOn() ? campGrade(p) : null, pg = (state.phase === 'PRESEASON' || state.phase === 'CUTDOWN') ? preGrade(p) : null, sg = p.advS && state.phase !== 'PRESEASON' && state.phase !== 'CUTDOWN' ? overallGrade(p.advS, p.spot) : null, pr = p.prac && p.prac.g !== null && p.prac.g !== undefined && state.phase === 'REG' ? Math.round(p.prac.g) : null;
  const bit = (l, v, t) => v === null || v === undefined ? '' : `<span class="rg" title="${t}"><i>${l}</i>${gradeChip(v)}</span>`;
  return bit('Camp', cg, 'Practice grade so far in camp') + bit('Pre', pg, 'Grade in the exhibitions') + bit('Season', sg, 'Game grade this season') + bit('Prac', pr, 'This week of practice');
}
const PRAC_ORDER = PRAC_ROOMS.flatMap(r => r[2]);
function pracRoomInfo(u, pos) {
  const rs = roomState(u, pos), order = repsOrder(u, pos), squad = psOf(u).filter(p => p.pos === pos);
  const graded = order.filter(p => p.prac && p.prac.g != null && !p.prac.dnp), avg = graded.length ? graded.reduce((a, p) => a + p.prac.g, 0) / graded.length : null;
  const pb = order.length ? order.reduce((a, p) => a + pbOf(p), 0) / order.length : null;
  const tone = rs.tone > 0.3 ? ['Strong room', 'good'] : rs.tone < -0.2 ? ['Bad habits spreading', 'bad'] : ['Neutral room', ''];
  const best = graded.slice().sort((a, b) => b.prac.g - a.prac.g)[0];
  return { pos, rs, order, squad, graded, avg, pb, tone, best, coach: posCoach(u, pos) };
}
function pracRating(avg) { return avg === null ? '<span class="pill">No report yet</span>' : `<span class="pill ${avg >= 59 ? 'good' : avg < 42 ? 'bad' : ''}">${pracGradeLabel(avg)}</span>`; }
function pracMeter(avg) { if (avg === null) return ''; const w = clamp(Math.round(avg), 4, 100), c = avg >= 59 ? 'var(--good)' : avg < 42 ? 'var(--bad)' : 'var(--mid)'; return `<div class="pmeter"><i style="width:${w}%;background:${c}"></i></div>`; }
function practiceHTML() {
  const u = state.userTid, t = T(u);
  const when = state.phase === 'REG' ? `Week ${state.week}` : state.phase === 'PRESEASON' ? 'Preseason' : state.phase === 'PLAYOFFS' ? 'Playoffs' : PHASE_LABEL[state.phase];
  const rooms = PRAC_ORDER.map(pos => pracRoomInfo(u, pos)).filter(r => r.order.length || r.squad.length);
  const all = rooms.flatMap(r => r.graded);
  let html = `<div class="row" style="margin-bottom:10px"><h2 style="margin:0">Practice report <span class="small muted" style="font-weight:400">· ${when}</span></h2><span class="spacer"></span></div>
    <details class="fold" ${foldAttr(`prachelp`)} style="margin-bottom:14px"><summary>How practice works</summary><div class="small muted" style="margin-top:6px">A strong week is a small edge on game day and a poor one a small drag. Work Ethic and Discipline drive it, the veterans in each room set the tone (for better or worse), and Consistency keeps a player from having bad weeks.
    Players learn the playbook through reps: inside a room, use the arrows to set who gets the first-team reps. A player who does not know a call loses that snap to someone who does when possible, and can blow the assignment when he has to play it.
    <b>Working at</b> sets the spot a player practices at. A second spot takes a share of his reps and is where his comfort grows (weeks to months, quicker for nearby jobs and quick learners).</div></details>`;
  // the week's standouts
  const line = p => `<div class="row" style="gap:8px;padding:3px 0"><span class="small muted" style="width:34px">${esc(p.lbl)}</span>${playerLink(p, true)}<span class="spacer"></span>${pracChip(p)}</div>`;
  const top = all.slice().sort((a, b) => b.prac.g - a.prac.g).slice(0, 5), low = all.slice().sort((a, b) => a.prac.g - b.prac.g).filter(p => p.prac.g < 42).slice(0, 5);
  const xt = rosterOf(u).filter(p => p.xt), dnp = rooms.flatMap(r => r.order).filter(p => p.prac && p.prac.dnp);
  html += `<div class="grid g2" style="margin-bottom:16px"><div class="card"><h3>Top performers this week</h3>${top.length ? top.map(line).join('') : '<div class="muted small">No practice report yet. One arrives with each week of the season and preseason.</div>'}</div>
    <div class="card"><h3>Rough weeks</h3>${low.length ? low.map(line).join('') : '<div class="muted small">Nobody had a poor week.</div>'}
    ${dnp.length ? `<div class="small muted" style="margin-top:8px">Did not practice: ${dnp.map(p => playerLink(p, true)).join(', ')}</div>` : ''}${xt.length ? `<div class="small muted" style="margin-top:8px">Cross-training: ${xt.map(p => `${playerLink(p, true)} → ${SPOTS[p.xt].l}`).join(', ')}</div>` : ''}</div></div>`;
  // one card per room, as its coach reports it
  const sel = rooms.find(r => r.pos === ui.pracRoom) || null;
  for (const [side, name, groups] of PRAC_ROOMS) {
    const coach = side === 'O' ? offCaller(t) : defCaller(t), sys = t.sys && t.sys[side];
    const sidePs = rosterOf(u).filter(p => PRAC_SIDE[p.pos] === side), install = sidePs.length ? sidePs.reduce((a, p) => a + pbOf(p), 0) / sidePs.length : 100;
    html += `<h3 class="sech">${name} <span class="small muted" style="font-weight:400;text-transform:none;letter-spacing:0">· ${coach ? esc(cname(coach)) : 'no play-caller'}${sys && sys.yrs <= 0 ? ' · <b>new system this year</b>' : sys ? ` · year ${sys.yrs + 1} in the system` : ''} · playbook installed ${Math.round(install)}%</span></h3><div class="roomgrid">`;
    for (const r of rooms.filter(x => groups.includes(x.pos))) {
      html += `<button class="roomcard ${sel && sel.pos === r.pos ? 'on' : ''}" data-action="pracRoom" data-pos="${r.pos}" data-toggle="1">
        <div class="row" style="gap:6px"><b>${ROOM_NAME[r.pos]}</b><span class="spacer"></span><span class="small muted">${r.order.length}</span></div>
        <div class="small muted">${r.coach ? esc(cname(r.coach)) : 'No position coach'}</div>
        <div style="margin:8px 0 4px">${pracRating(r.avg)}</div>${pracMeter(r.avg)}
        <div class="small ${r.tone[1]}" style="margin-top:6px">${r.tone[0]}</div>
        <div class="small muted">${r.best ? `Best: ${esc(r.best.last)}` : '&nbsp;'}${r.pb !== null ? ` · playbook ${Math.round(r.pb)}%` : ''}</div></button>`;
    }
    html += '</div>';
  }
  if (!sel) return html + '<div class="muted small" style="margin-top:14px">Click a room for its full report: reps order, playbook knowledge, cross-training and character reads.</div>';
  // the open room
  const i = rooms.indexOf(sel), prev = rooms[(i + rooms.length - 1) % rooms.length], next = rooms[(i + 1) % rooms.length], pos = sel.pos, order = sel.order;
  const known = v => (v.p.seenW || 0) >= 2, lead = sel.rs.voices[0], drag = sel.rs.voices.filter(v => v.a < -0.15).sort((a, b) => a.w * a.a - b.w * b.a)[0];
  html += `<div class="card" id="pracDetail" style="margin-top:16px"><div class="row" style="margin-bottom:8px">
      <button class="sm" data-action="pracRoom" data-pos="${prev.pos}" title="${ROOM_NAME[prev.pos]}">◀ ${ROOM_NAME[prev.pos]}</button>
      <span class="spacer"></span><h2 style="margin:0">${ROOM_NAME[pos]}</h2>${pracRating(sel.avg)}<span class="pill ${sel.tone[1]}">${sel.tone[0]}</span><span class="spacer"></span>
      <button class="sm" data-action="pracRoom" data-pos="${next.pos}" title="${ROOM_NAME[next.pos]}">${ROOM_NAME[next.pos]} ▶</button></div>
    <div class="small muted" style="margin-bottom:10px">${sel.coach ? `Coach: ${coachNameLink(sel.coach)} · ${esc(sel.coach.style)} · develops ${wordPill(asstWord(sel.coach, 'dev'))} discipline ${wordPill(asstWord(sel.coach, 'disc'))}` : 'No position coach'}
      · ${lead && known(lead) ? `Sets the tone: ${playerLink(lead.p, true)}${lead.a < -0.15 ? ' <span class="bad">(not a good example)</span>' : ''}` : sel.rs.voices.length ? 'Your staff is still learning who runs this room' : 'No veteran voice in this room'}${drag && lead && drag.p !== lead.p && known(drag) ? ` · dragging it down: ${playerLink(drag.p, true)}` : ''}</div>` +
    table('prac' + pos, [
      { k: 'ord', l: 'Reps', f: p => p.tid === -3 ? '<span class="muted small">Practice squad</span>' : `<span class="seg"><button class="sm" data-action="repMove" data-pid="${p.id}" data-d="-1" title="More reps">▲</button><button class="sm" data-action="repMove" data-pid="${p.id}" data-d="1" title="Fewer reps">▼</button></span> <span class="small ${repsTier(order.indexOf(p), pos) === 0 ? '' : 'muted'}">${REPS_NAME[repsTier(order.indexOf(p), pos)]}</span>` },
      { k: 'n', l: 'Name', f: p => playerLink(p) + ' ' + statusPills(p) },
      { k: 'pos', l: 'Pos', f: p => esc(p.lbl) },
      { k: 'exp', l: 'Yrs', f: p => p.exp === 0 ? 'R' : p.exp, num: 1 },
      { k: 'tier', l: 'Tier', f: p => tierPill(p) },
      { k: 'pr', l: 'This week', f: p => pracChip(p) },
      { k: 'tr', l: 'Recent', f: p => pracTrend(p) },
      { k: 'pb', l: 'Playbook', f: p => `${pbBar(pbOf(p))} <span class="small muted">${pbLabel(pbOf(p))}</span>` },
      { k: 'xt', l: 'Working at', f: p => crossTrainSelect(p), title: 'The spot he practices at. A second spot takes a share of his reps, and a spot that is new to him is where his comfort grows.' },
      { k: 'rg', l: 'Grades', f: p => rowGrades(p) },
      { k: 'we', l: 'Work ethic', f: p => charPill(p, 'work') },
      { k: 'di', l: 'Discipline', f: p => charPill(p, 'disc') },
      { k: 'le', l: 'Leadership', f: p => charPill(p, 'lead') },
    ], [...order, ...sel.squad], { nosort: 1 }) + '</div>';
  return html;
}

// ---------- waiver wire (after league-wide cuts) ----------
function waiversHTML() {
  const u = state.userTid, wv = state.wv, fam = ui.wvFam || 'ALL';
  const all = onWaivers(), mineOut = all.filter(p => p.waiver.from === u), wire = all.filter(p => p.waiver.from !== u && inFamily(p, fam));
  const cleared = Object.values(state.players).filter(p => p.tid === -1 && !p.waiver && p.lastTid === u && wv.ps.includes(p.id));
  const active = rosterOf(u).filter(p => !onIR(p)).length, claims = Object.keys(wv.claims).length, psCount = wv.ps.length + Object.keys(wv.want).length;
  const RISK = { 'Will be claimed': 'bad', 'Could be claimed': 'warn', 'Should clear': 'good' };
  let html = `<div class="card" style="margin-bottom:14px"><div class="row"><div><div class="big">#${wv.prio.indexOf(u) + 1}</div><div class="small muted">your claim priority (worst record goes first)</div></div>
    <div style="margin-left:28px"><div class="big">${active} / ${ROSTER_MAX}</div><div class="small muted">active roster · ${claims} claim${claims === 1 ? '' : 's'} in</div></div>
    <div style="margin-left:28px"><div class="big">${psOf(u).length} / ${PS_MAX}</div><div class="small muted">on your practice squad now</div></div>
    <div style="margin-left:28px"><div class="big">${psCount}</div><div class="small muted">lined up for it, not signed yet<br>(${wv.ps.length} of your cuts · ${Object.keys(wv.want).length} from other teams)</div></div></div>
    <p class="small muted" style="margin:10px 0 0"><b>Claim</b> a player to add him to your 53 on his current contract; if two teams claim him, the one higher in the order gets him. Mark <b>PS target</b> to try to sign him to your practice squad if nobody claims him (he may prefer to return to his old club). Your own cuts marked for the practice squad come back automatically if they clear.</p></div>`;
  html += `<div class="card" style="margin-bottom:14px"><h3 style="margin-top:0">Your cuts (${mineOut.length + cleared.length + Object.values(state.players).filter(p => p.tid === -1 && !p.waiver && p.lastTid === u && !wv.ps.includes(p.id) && wv.cutIds && wv.cutIds.includes(p.id)).length})</h3><p class="small muted" style="margin:0 0 8px">Nobody here is on your practice squad yet. Players on waivers can be claimed by other teams when you press <b>Process Claims</b>; the ones you marked for the practice squad sign with you then, if they are still unclaimed.</p>`;
  if (!mineOut.length && !cleared.length) html += '<p class="small">You did not cut anyone, or none of your cuts are on waivers or marked for the practice squad.</p></div>';
  else html += table('wvmine', [
    { k: 'pos', l: 'Pos', f: p => esc(p.lbl) }, { k: 'n', l: 'Name', f: p => playerLink(p) }, { k: 'age', l: 'Age', f: p => p.age, num: 1 }, { k: 'exp', l: 'YOE', f: p => p.exp, num: 1 },
    { k: 'tier', l: 'Tier', f: p => tierPill(p) }, { k: 'up', l: 'Upside', f: p => upsidePill(p) },
    { k: 'plan', l: 'Your plan', f: p => wv.ps.includes(p.id) ? '<span class="pill on">Practice squad</span>' : '<span class="muted">Released</span>' },
    { k: 'risk', l: 'Waivers', f: p => p.waiver ? `<span class="pill ${RISK[waiverRisk(p)]}">${waiverRisk(p)}</span>` : '<span class="pill good">Free agent: no waivers</span>' },
  ], [...mineOut, ...cleared].sort(famOrder), { nosort: 1 }) + '</div>';
  html += `<div class="subtabs">${famTabs(fam, 'wvFam')}</div><div class="card">` + table('wire', [
    { k: 'pos', l: 'Pos', v: p => FAM_INDEX[p.spot], f: p => esc(p.lbl) },
    { k: 'n', l: 'Name', v: p => p.last, f: p => playerLink(p) },
    { k: 'tm', l: 'Waived by', v: p => T(p.waiver.from).abbr, f: p => teamLink(p.waiver.from) },
    { k: 'age', l: 'Age', v: p => p.age, num: 1 }, { k: 'exp', l: 'YOE', v: p => p.exp, num: 1 },
    { k: 'tier', l: 'Tier', v: tierSort, f: p => tierPill(p) + trueNums(p) },
    { k: 'up', l: 'Upside', v: upSort, f: p => upsidePill(p) },
    { k: 'pre', l: 'Preseason', v: p => preGrade(p) || 0, f: p => p.preS ? `${gradeChip(preGrade(p))} <span class="small muted">${p.preS.snp} snaps</span>` : '<span class="muted small">—</span>', num: 1 },
    { k: 'sk', l: 'Scouting', f: p => `<span class="small muted">${traitsTxt(p)}</span>` },
    { k: 'c', l: 'Contract', v: p => p.waiver.c.amt, f: p => `${fmtMoney(p.waiver.c.amt)} × ${Math.max(1, p.waiver.c.yrs || 1)} yr`, num: 1 },
    { k: 'risk', l: 'Interest', v: p => (wv.ai[p.id] || []).length, f: p => `<span class="pill ${RISK[waiverRisk(p)]}">${waiverRisk(p) === 'Should clear' ? 'None seen' : waiverRisk(p) === 'Could be claimed' ? 'Some' : 'Heavy'}</span>` },
    { k: 'a', l: '', f: p => { const c = wv.claims[p.id]; return `<button class="sm ${c !== undefined ? 'primary' : ''}" data-action="wvClaim" data-pid="${p.id}">${c !== undefined ? '✓ Claim in' + (c ? ' (drop ' + esc(P(c).last) + ')' : '') : 'Claim'}</button> <button class="sm ${wv.want[p.id] ? 'on' : ''}" data-action="wvWant" data-pid="${p.id}">${wv.want[p.id] ? '✓ PS target' : 'PS target'}</button>`; } },
  ], wire, { sort: 'up', limit: 300 }) + '</div>';
  return html;
}
function waiverDropModal(pid) {
  const p = P(pid), u = state.userTid, used = new Set(Object.values(state.wv.claims).filter(Boolean));
  const cands = rosterOf(u).filter(x => !onIR(x) && !used.has(x.id)).sort((a, b) => cutValue(a) - cutValue(b)).slice(0, 14);
  openModal(`<h2 style="margin-top:0">Claim ${esc(pname(p))}</h2><p class="small muted">Your 53 is full. Choose who you release if the claim is awarded (nothing happens if you lose the claim).</p>` +
    cands.map(x => `<div class="row small" style="margin:5px 0"><span style="min-width:60px">${esc(x.lbl)}</span> ${playerLink(x)} ${tierPill(x)} <span class="muted">saves ${fmtMoney(cutSavings(x))}</span><span class="spacer"></span><button class="sm danger" data-action="wvClaimDrop" data-pid="${p.id}" data-drop="${x.id}">Release if claimed</button></div>`).join(''));
}
function waiverResultModal(r) {
  const row = (p, txt) => `<div class="row small" style="margin:4px 0">${playerLink(p)} <span class="muted">${esc(p.lbl)}${txt ? ' · ' + esc(txt) : ''}</span></div>`;
  let h = '<h2 style="margin-top:0">Waivers processed</h2>';
  if (r.won.length) h += '<div class="section-title">Claims awarded to you</div>' + r.won.map(p => row(p)).join('');
  if (r.lost.length) h += '<div class="section-title">Claims you lost</div>' + r.lost.map(x => row(x.p, x.to !== null ? 'awarded to ' + T(x.to).abbr + ' (higher priority)' : 'your claim could not be completed')).join('');
  if (r.taken.length) h += '<div class="section-title bad">Your cuts claimed by other teams</div>' + r.taken.map(x => row(x.p, 'claimed by ' + T(x.to).abbr + (x.ps ? ' before he could reach your practice squad' : ''))).join('');
  if (r.ps.length) h += '<div class="section-title">Signed to your practice squad</div>' + r.ps.map(p => row(p)).join('');
  if (r.psLost.length) h += '<div class="section-title">Practice squad targets who went elsewhere</div>' + r.psLost.map(x => row(x.p, x.why)).join('');
  if (!r.won.length && !r.lost.length && !r.taken.length && !r.ps.length && !r.psLost.length) h += '<p class="muted">No claims involved you.</p>';
  const u = state.userTid, short = rosterShortfalls(u);
  h += `<p class="small muted" style="margin-top:14px">Active roster ${rosterOf(u).filter(p => !onIR(p)).length}/${ROSTER_MAX} · practice squad ${psOf(u).length}/${PS_MAX}. ${psOf(u).length < PS_MAX ? 'Open practice squad spots are yours to fill from the Free Agents tab. ' : ''}${short.length ? 'Short at: ' + short.join(', ') + '.' : ''}</p>`;
  openModal(h);
}
// ---------- preseason playing-time plan ----------
function prePlanHTML() {
  const pl = state.prePlan || { feat: {}, hold: {} }, u = state.userTid, sh = pl.share || {};
  const names = o => Object.keys(o).map(id => P(+id)).filter(p => p && p.tid === u).map(p => playerLink(p, true)).join(', ') || '<span class="muted">none</span>';
  const wk = state.pre ? state.pre.wk : 0, auto = prePlanFor(u).auto, word = v => (PRE_SHARE_OPTS.find(o => o[0] === v) || [0, Math.round(v * 100) + '%'])[1].toLowerCase();
  const starters = preStarters(u), short = rosterOf(u).filter(p => starters.has(p.id) && p.pos !== 'K' && p.pos !== 'P' && (p.preS ? p.preS.snp : 0) < SHARP_SNAPS);
  return `<div class="card" style="margin-bottom:14px"><div class="row"><h3 style="margin:0">Preseason playing time · game ${Math.min(wk + 1, PRESEASON_GAMES)} of ${PRESEASON_GAMES}</h3><span class="spacer"></span><span class="small muted">Coach's plan this game: first team plays ${word(auto)}</span></div>
    <p class="small muted" style="margin:8px 0 8px">How long each group's first team plays. The backups take over from there and give way to the third string after halftime. More snaps is better film and more risk of injury. <b>A unit you set yourself plays straight off your depth chart:</b> the first man listed at each spot for the share you choose here, the second man until halftime, the third after it. A player listed second at one spot and third at another plays both. Starters you sit do not fill in elsewhere.</p>
    <div class="pre-shares">${PRE_GROUPS.map(g => `<label><span>${g}</span><select data-change="preShare" data-pos="${g}">${PRE_SHARE_OPTS.map(([v, l]) => `<option value="${v}" ${(sh[g] === undefined ? -1 : sh[g]) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`).join('')}</div>
    ${short.length ? `<div class="small ${wk >= PRESEASON_GAMES - 1 ? 'warn' : 'muted'}" style="margin-top:8px"><b>${short.length} starter${short.length === 1 ? '' : 's'}</b> ${short.length === 1 ? 'has' : 'have'} fewer than ${SHARP_SNAPS} preseason snaps and would open the season a step slow: ${short.slice(0, 10).map(p => playerLink(p, true) + ' <span class="muted">(' + (p.preS ? p.preS.snp : 0) + ')</span>').join(', ')}${short.length > 10 ? ' and more' : ''}.</div>` : '<div class="small good" style="margin-top:8px">Every starter has enough preseason work to open the season sharp.</div>'}
    <div class="small" style="margin-top:8px"><b>Featured</b> (stay in for extra snaps): ${names(pl.feat)}</div><div class="small" style="margin-top:3px"><b>Held out</b>: ${names(pl.hold)}</div>
    <div class="small muted" style="margin-top:6px">Set these per player in the <b>Preseason</b> roster view or on his card.</div></div>`;
}
function preSnapReport(b) {
  const u = state.userTid;
  const rows = Object.entries(b.stats).map(([pid, l]) => ({ p: P(pid), l })).filter(x => x.p && x.l.tid === u && (x.l.snp || 0) > 0 && x.p.pos !== 'K' && x.p.pos !== 'P')
    .map(x => ({ ...x, g: b.adv && b.adv[x.p.id] && x.l.snp >= 10 ? overallGrade(b.adv[x.p.id], x.p.spot) : null, tot: x.p.preS ? x.p.preS.snp : x.l.snp })).sort((a, c) => c.l.snp - a.l.snp);
  const sat = rosterOf(u).filter(p => !p.injury && !b.stats[p.id] && p.pos !== 'K' && p.pos !== 'P' && !(state.prePlan && state.prePlan.hold[p.id]));
  const thin = rosterOf(u).filter(p => p.exp <= 2 && (!p.preS || p.preS.snp < 30) && !p.injury).sort((a, c) => uCeil(c) - uCeil(a)).slice(0, 8);
  return `<div class="section-title">Snap report</div>` + table('presnap', [
    { k: 'pos', l: 'Pos', f: x => esc(x.p.lbl) }, { k: 'n', l: 'Name', f: x => playerLink(x.p) },
    { k: 's', l: 'Snaps', f: x => x.l.snp, num: 1 }, { k: 'g', l: 'Grade', f: x => gradeChip(x.g), num: 1 },
    { k: 't', l: 'Preseason total', f: x => `${x.tot} <span class="small ${x.tot < 30 ? 'warn' : 'muted'}">${x.tot < 30 ? 'thin sample' : ''}</span>`, num: 1 },
  ], rows.slice(0, 40), { nosort: 1 }) +
    (thin.length ? `<div class="small" style="margin-top:8px"><b>Still short of film:</b> ${thin.map(p => playerLink(p, true) + ' <span class="muted">(' + (p.preS ? p.preS.snp : 0) + ')</span>').join(', ')}</div>` : '') +
    (sat.length ? `<div class="small muted" style="margin-top:4px">${sat.length} healthy player${sat.length === 1 ? '' : 's'} did not play.</div>` : '');
}

// post-draft bidding for undrafted rookies
function udfaHTML() {
  const u = state.userTid, s = state.udfa, n = rosterOf(u).length, offers = Object.keys(s.offers).length;
  const mine = !!ui.udfaMine && offers > 0;
  const ps = Object.values(state.players).filter(isUdfa).filter(p => mine ? s.offers[p.id] !== undefined : inFamily(p, ui.faPos));
  const committed = Object.values(s.offers).reduce((a, b) => a + MIN_SALARY + b, 0);
  let html = `<div class="callout"><b>Round ${s.round + 1} of ${UDFA_ROUNDS}.</b> Offer a guaranteed signing bonus on a three-year minimum deal (${fmtMoney(MIN_SALARY)}/yr). When you send offers, each player picks a team: the money matters, but so does whether he sees a job to win and where he simply wants to be. The bonus is dead money if you cut him.
    Camp roster <b>${n}/${OFFSEASON_MAX}</b> · offers out <b>${offers}</b> · committed ${fmtMoney(committed)} of ${fmtMoney(capRoom(u))} cap room.${s.round === UDFA_ROUNDS - 1 ? ' <b>Last round:</b> after this, camp opens with whoever you have.' : ''}</div>
    <div class="row" style="margin-bottom:8px"><span class="seg"><button class="sm ${mine ? '' : 'on'}" data-action="udfaMine" data-v="">The whole class</button><button class="sm ${mine ? 'on' : ''}" data-action="udfaMine" data-v="1" ${offers ? '' : 'disabled'}>My offers (${offers})</button></span></div>
    ${mine ? '' : `<div class="subtabs">${famTabs(ui.faPos, 'faPos')}</div>`}`;
  const offerCell = p => {
    const cur = s.offers[p.id];
    return `<select data-change="udfaOffer" data-pid="${p.id}" class="${cur !== undefined ? 'on' : ''}"><option value="">No offer</option>${UDFA_BONUS.map(b => `<option value="${b}" ${cur === b ? 'selected' : ''}>${b ? fmtBonus(b) + ' guaranteed' : 'Offer, no bonus'}</option>`).join('')}</select>`;
  };
  const HEAT = { 'Bidding war': 'bad', 'Several teams': 'warn', 'A team or two': '', Quiet: 'good' }, PATH = { 'Clear path to a job': 'good', 'Fair shot': '', 'Crowded room': 'warn', 'Long odds': 'bad' };
  html += '<div class="card">' + table('udfa', [
    { k: 'pos', l: 'Pos', v: p => FAM_INDEX[p.spot], f: p => esc(p.lbl) },
    { k: 'n', l: 'Name', v: p => p.last, f: p => playerLink(p) },
    { k: 'age', l: 'Age', v: p => p.age, num: 1 },
    { k: 'ht', l: 'Ht', v: p => p.m.ht, f: p => `<span class="small muted">${fmtHeight(p.m.ht)}</span>`, num: 1 }, { k: 'wt', l: 'Wt', v: p => p.m.wt, f: p => `<span class="small muted">${p.m.wt}</span>`, num: 1 },
    { k: 'ovr', l: 'Ready now as', v: tierSort, f: p => tierPill(p) + trueNums(p) },
    { k: 'pot', l: 'Upside', v: upSort, f: p => upsidePill(p) },
    { k: 'ras', l: 'RAS', v: p => rasOf(p) || 0, f: p => rasHTML(p), num: 1 },
    { k: 'sk', l: 'Scouting', f: p => `<span class="small muted">${traitsTxt(p)}</span>` },
    { k: 'heat', l: 'Market', v: p => (s.ai[p.id] || []).length, f: p => { const h = udfaInterest(p); return `<span class="pill ${HEAT[h]}">${h}</span>`; }, title: 'How many other teams are after him this round' },
    { k: 'path', l: 'His view of you', v: p => udfaPath(p, u), f: p => { const l = udfaPathLabel(udfaPath(p, u)); return `<span class="pill ${PATH[l]}">${l}</span>`; }, title: 'Does he see a job to win on your roster?' },
    { k: 'o', l: 'Your offer', v: p => s.offers[p.id] !== undefined ? 1 + s.offers[p.id] : 0, f: offerCell },
  ], ps, { sort: 'pot', limit: 240 }) + '</div>';
  return html;
}
function udfaResultModal(res) {
  const won = res.filter(r => r.won), lost = res.filter(r => !r.won);
  let h = `<h2 style="margin-top:0">Rookie free agency: ${state.phase === 'UDFA' ? 'round ' + state.udfa.round + ' results' : 'final results'}</h2>`;
  if (!res.length) h += '<p class="muted">You made no offers this round.</p>';
  if (won.length) h += '<div class="section-title">Signed</div>' + won.map(r => `<div class="row small" style="margin:4px 0">${playerLink(r.p)} <span class="muted">${esc(r.p.lbl)} · ${fmtBonus(r.b)}${r.rivals ? ' · chose you over ' + r.rivals + ' other team' + (r.rivals === 1 ? '' : 's') : ''}</span></div>`).join('');
  if (lost.length) h += '<div class="section-title">Got away</div>' + lost.map(r => `<div class="row small" style="margin:4px 0">${playerLink(r.p)} <span class="muted">${esc(r.p.lbl)} · ${r.to !== undefined ? 'signed with ' + T(r.to).abbr + ': ' : ''}${esc(r.why)}</span></div>`).join('');
  h += `<p class="small muted" style="margin-top:14px">${state.phase === 'UDFA' ? 'Players still unsigned are back on the board for the next round.' : 'Camp is open. Your roster: ' + rosterOf(state.userTid).length + '/' + OFFSEASON_MAX + '. Anyone left unsigned can still be signed from the Free Agents tab.'}</p>`;
  openModal(h);
}

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
const FA_VIEWS = [['scout', 'Scouting'], ['market', 'Contract & market'], ['last', 'Last season'], ['comfort', 'Positions']];
const FA_DEF = { view: 'scout', q: '', ageMax: '', tier: '', up: '', maxAsk: '', exp: '', afford: false, played: false };
function faHTML() {
  const u = state.userTid;
  const udfa = state.phase === 'UDFA' && state.udfa, fv = ui.faView && (ui.faView !== 'udfa' || udfa) ? ui.faView : udfa ? 'udfa' : 'now';
  const tabs = `<div class="subtabs">${[...(udfa ? [['udfa', 'Undrafted rookies']] : []), ['now', udfa ? 'Veterans' : 'Available now'], ['next', 'Upcoming free agents']].map(([k, l]) => `<button class="${fv === k ? 'on' : ''}" data-action="faView" data-v="${k}">${l}</button>`).join('')}</div>`;
  if (fv === 'next') return tabs + upcomingFAHTML();
  if (fv === 'udfa' && udfa) return tabs + udfaHTML();
  return tabs + faMarketHTML();
}
// ---- the free agent page: a narrow list, the selected player's card, and the sit-down with his agent ----
function faMarketOn() { return state.phase === 'FA' && state.fa && !state.fa.over; }
function faStatus(p) {
  const u = state.userTid;
  if (!faInMarket(p)) return ['Signs now', 'muted'];
  const mine = faOffers(p).find(o => o.tid === u), t = state.fa.talks[p.id];
  if (mine) return [mine.night ? 'Answer tomorrow' : mine.dl ? 'Deadline tonight' : mine.fo ? 'Front office bidding' : 'Your offer is out', 'good'];
  if (state.fa.orders[p.id]) return ['Front office bidding', 'good'];
  if (t && t.closed === 'done') return ['Talks over', 'bad'];
  if (t) return [t.closed ? 'Talks paused' : 'In talks', 'warn'];
  return [faRumor(p), 'muted'];
}
function faExpTxt(p) { if (!faInMarket(p)) return fmtMoney(p.ask); const r = faRange(p); return `$${r[0] >= 10 ? r[0].toFixed(0) : r[0].toFixed(1)}–${r[1] >= 10 ? r[1].toFixed(0) : r[1].toFixed(1)}M`; }
function faSortVal(p) { return faInMarket(p) ? faExp(p) : p.ask; }
function faIn(p) {
  const all = ui.faIn || (ui.faIn = {});
  if (!all[p.id] || all[p.id].v !== 2) { const y = state.phase === 'REG' ? 1 : contractYears(p), e = faExp(p), b = round2(faGtdWant(p, y) * e * y * 0.8);
    all[p.id] = { v: 2, yrs: y, bonus: b, sal: round2(Math.max(MIN_SALARY, e * 0.95 - b / y)), load: 'even', inc: [], max: round2(e) }; }
  return all[p.id];
}
// the terms on the table right now: what has been agreed in the meeting, with whatever is being typed on top
function faDraft(p) {
  const i = faIn(p), t = negTalkOf(p), yrs = t && t.step === 2 ? t.yrs : clamp(Math.round(+i.yrs || 1), 1, 5), bonus = t && t.step === 2 ? t.gtd : Math.max(0, +i.bonus || 0);
  const sal = Math.max(MIN_SALARY, +i.sal || 0), aav = round2(sal + bonus / yrs), inc = incClean(p, (i.inc || []).map(x => { const [k, th] = String(x.m || '').split(':'); return { k, th: +th, amt: +x.amt || 0 }; }), aav);
  const o = { tid: state.userTid, yrs, gtd: bonus, sal, aav, load: yrs >= 2 ? i.load : 'even', inc }; o.incL = incLikelySum(p, inc);
  return o;
}
// what every other contract on the books costs in a later year (0 is this year)
function futureCommit(tid, i) {
  let s = i === 0 ? (T(tid).dead || 0) : i === 1 ? (T(tid).deadNext || 0) : 0;
  for (const q of rosterOf(tid)) { const c = q.contract; if (!c) continue;
    if (c.yrs > i) s += i === 0 ? c.amt : (c.sched && c.sched[i] !== undefined ? c.sched[i] + (c.incL || 0) : c.sal !== undefined && c.bonus !== undefined ? c.amt : c.amt);
    else if (c.next && i < c.yrs + c.next.yrs) s += c.next.amt; }
  return round2(s);
}
function negOffset(p) { return negMode(p) === 'extend' ? p.contract.yrs : 0; } // an extension starts when his present deal ends
function faHeadHTML(p) {
  const o = faDraft(p), tot = o.sal * o.yrs + o.gtd, hit = faHit(o), mx = o.inc.reduce((s, x) => s + x.amt, 0), off = negOffset(p);
  return `<b>${o.yrs} year${o.yrs === 1 ? '' : 's'}, ${fmtMoney(tot)}</b><span>${fmtMoney(o.gtd)} signing bonus</span><span><b>${fmtMoney(hit)}</b> against ${off ? 'the ' + (state.season + 1 + off) : "this year's"} cap</span>${mx ? `<span>up to ${fmtMoney(mx)} a year in incentives</span>` : ''}`;
}
function faCapTableHTML(p) {
  const o = faDraft(p), u = state.userTid, base = loadSched(o.sal, o.yrs, o.load), share = o.gtd / o.yrs, mine = faOffers(p).find(x => x.tid === u), off = negOffset(p), com = negMode(p) === 'fa' ? faCommitted(u).amt - (mine ? faHit(mine) : 0) : 0;
  const poss = o.inc.filter(x => !incLikely(p, x)).reduce((s, x) => s + x.amt, 0);
  const rows = base.map((b, k) => { const hit = round2(b + share + (k === 0 ? o.incL : o.incL)), room = round2(state.cap - futureCommit(u, k + off) - (k === 0 ? com : 0) - hit), dead = round2(o.gtd * (o.yrs - k) / o.yrs);
    return `<tr><td>${state.season + 1 + off + k}</td><td class="num">${fmtMoney(b)}</td><td class="num">${fmtMoney(share)}</td>${o.inc.length ? `<td class="num">${o.incL ? fmtMoney(o.incL) : '—'}</td>` : ''}<td class="num"><b>${fmtMoney(hit)}</b></td><td class="num ${room < 0 ? 'bad' : ''}">${fmtMoney(room)}</td>${o.inc.length ? `<td class="num muted">${poss ? '+' + fmtMoney(poss) : '—'}</td>` : ''}<td class="num warn" title="Cut him before the ${state.season + 1 + off + k} season and this much of the signing bonus counts against your cap at once. You would no longer owe his salary.">${fmtMoney(dead)}</td></tr>`; }).join('');
  return `<table class="tbl fa-cap"><thead><tr><th>Season</th><th class="num" title="His pay for the season">Salary</th><th class="num" title="The signing bonus, spread evenly over the deal">Bonus share</th>${o.inc.length ? '<th class="num" title="Incentives he reached last season: they count now">Likely incentives</th>' : ''}<th class="num" title="What he costs against the cap that season">Cap hit</th><th class="num" title="Your cap room that season with everything else already on the books">Room left</th>${o.inc.length ? '<th class="num" title="Incentives he did not reach last season: they cost nothing now, and are charged the season after if he earns them">If earned</th>' : ''}<th class="num" title="What counts against your cap if you cut him before that season">If you cut him</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="small muted" style="margin-top:4px">Cap hit is the certain number. ${o.inc.length ? 'Incentives he did not reach last year cost nothing now: you are charged the following season, and only if he gets there. ' : ''}The last column is what it costs to move on from him.</div>`;
}
// The contract itself. None of the language matters; it follows the terms as they change.
function faDocHTML(p) {
  const o = faDraft(p), u = state.userTid, t = T(u), a = agentOf(p), base = loadSched(o.sal, o.yrs, o.load), tot = o.sal * o.yrs + o.gtd, share = o.gtd / o.yrs, y0 = state.season + 1 + negOffset(p);
  const words = n => ['zero', 'one', 'two', 'three', 'four', 'five'][n] || n, M = v => `<b>${fmtMoney(v)}</b>`, club = `${esc(t.region)} ${esc(t.name)}`;
  const art = (n, title, body) => `<div class="fd-art"><div class="fd-h">ARTICLE ${n} — ${title}</div>${body}</div>`;
  const sub = (n, body) => `<p><span class="fd-n">${n}</span>${body}</p>`;
  let d = `<div class="fd-top">STANDARD PLAYER CONTRACT</div><div class="fd-mid">between<br><b>${club} Football Club</b> ("Club")<br>and<br><b>${esc(pname(p))}</b> ("Player")</div>`;
  d += art('I', 'TERM', sub('1.1', `This Agreement covers ${words(o.yrs)} (${o.yrs}) football season${o.yrs === 1 ? '' : 's'}, commencing with the ${y0} League Year and concluding at the end of the ${y0 + o.yrs - 1} League Year, unless sooner terminated in accordance with Article VI.`)
    + sub('1.2', `Player shall report to Club in good physical condition and shall render services as a professional football player at ${esc(p.lbl)}, or at such position as Club may reasonably direct.`));
  d += art('II', 'SIGNING BONUS', o.gtd > 0 ? sub('2.1', `As additional consideration for the execution of this Agreement, Club shall pay Player a signing bonus in the amount of ${M(o.gtd)}, payable within thirty (30) days of execution.`)
    + sub('2.2', `For purposes of the League salary cap, said bonus shall be allocated in ${words(o.yrs)} (${o.yrs}) equal instalment${o.yrs === 1 ? '' : 's'} of ${M(share)} to each League Year of the Term. Upon termination, any unallocated portion shall be charged in accordance with League rules.`)
    : sub('2.1', 'No signing bonus is payable under this Agreement.'));
  d += art('III', 'COMPENSATION', sub('3.1', `For performance of Player's services Club shall pay Player the following annual salary${o.yrs >= 2 && o.load !== 'even' ? ` (${o.load === 'front' ? 'declining' : 'escalating'} schedule)` : ''}:`)
    + `<div class="fd-sched">${base.map((b, k) => `<span>${y0 + k} League Year</span><span>${fmtMoney(b)}</span>`).join('')}</div>`
    + sub('3.2', `Salary shall be paid in equal weekly instalments over the course of the regular season. The aggregate value of this Agreement, inclusive of the signing bonus and exclusive of incentives, is ${M(tot)}.`));
  d += art('IV', 'INCENTIVES', o.inc.length ? o.inc.map((x, k) => sub('4.' + (k + 1), `Should Player, in any League Year of the Term, ${incLabel(x, true)}, Club shall pay Player an additional ${M(x.amt)}. <i>(${incLikely(p, x) ? 'Likely to be earned' : 'Not likely to be earned'}, on the basis of the ${state.season} season.)</i>`)).join('')
    + sub('4.' + (o.inc.length + 1), 'Incentives shall be treated for salary cap purposes in accordance with the League rules governing amounts likely and not likely to be earned.')
    : sub('4.1', 'This Agreement contains no performance incentives.'));
  d += art('V', 'REPRESENTATION', sub('5.1', `Player is represented in the negotiation of this Agreement by ${esc(agentName(a))}, a certified contract advisor, and acknowledges having had the opportunity to review its terms.`));
  d += art('VI', 'TERMINATION', sub('6.1', 'Club may terminate this Agreement upon written notice if, in the sole judgment of Club, Player\'s skill or performance has been unsatisfactory as compared with that of other players competing for positions on Club\'s roster.')
    + sub('6.2', 'Upon such termination Club shall have no further obligation in respect of salary not yet earned. Amounts paid under Article II shall be retained by Player.'));
  const signed = p.tid === u;
  d += `<div class="fd-sig"><div><span>${signed ? '<i class="fd-ink">' + esc(pname(p)) + '</i>' : ''}</span>Player</div><div><span>${signed ? '<i class="fd-ink">' + esc(T(u).abbr) + ' Football Club</i>' : ''}</span>For the Club</div></div>`;
  return d;
}
function faIncNoteHTML(p, x) {
  if (!x.k || !INC_STAT[x.k]) return ''; const last = incValue(p, x.k, state.season), lk = incLikely(p, x), hon = x.k === 'pb' || x.k === 'ap';
  return `<div class="small muted fa-incn">${hon ? (last ? `He made it last season, so this is counted as <b>likely</b>` : `He did not make it last season, so this is counted as <b>unlikely</b>`) : `He had ${last.toLocaleString('en-US')} ${INC_STAT[x.k][0]} last season, so ${x.th.toLocaleString('en-US')} is counted as <b>${lk ? 'likely' : 'unlikely'}</b>`}: ${lk ? `it counts against this year's cap now, and comes back next year if he misses.` : `it costs nothing now, and is charged next year only if he gets there.`}</div>`;
}
// the controls beside the contract: what you can say next
function faControlsHTML(p) {
  const u = state.userTid, t = negTalkOf(p), mode = negMode(p), onMkt = mode === 'fa', i = faIn(p), o = faDraft(p), dis = !t || t.aav === null ? 'disabled' : '';
  const seg = (fk, opts) => `<span class="seg">${opts.map(([v, l]) => `<button class="sm ${String(i[fk]) === String(v) ? 'on' : ''}" data-action="faSeg" data-pid="${p.id}" data-f="${fk}" data-v="${v}">${l}</button>`).join('')}</span>`;
  const num = (fk, w, extra) => `<input type="number" step="0.1" min="0" data-fain="${fk}" data-pid="${p.id}" ${extra || ''} value="${fk === 'amt' ? '' : i[fk]}" style="width:${w}px">`;
  if (!t) return '';
  if (t.closed) return `<div class="small muted" style="margin-top:8px">${t.closed === 'done' ? 'The agent will not take your calls about this player again.' : onMkt ? 'The meeting is over for today. Advance the day to talk again.' : 'He has heard enough for now. Come back to it once some time has passed.'}</div>${onMkt ? `<div class="row" style="gap:6px;margin-top:8px"><button class="sm danger" data-action="faWalkA" data-pid="${p.id}">Walk away for good</button></div>` : ''}`;
  let h = '';
  if (t.step === 1) h += `<div class="fa-step"><div class="fa-h">1 · Length and signing bonus</div>
      <div class="fa-ctl"><label>Length</label>${seg('yrs', [1, 2, 3, 4, 5].map(y => [y, y + (y === 1 ? ' yr' : ' yrs')]))}</div>
      <div class="fa-ctl"><label title="Paid when he signs. Spread evenly across your cap. If you cut him, the rest counts at once.">Signing bonus $M</label>${num('bonus', 84)}<button class="primary" data-action="faCommit" data-pid="${p.id}">Propose</button></div>
      <div class="small muted">The bonus is his the day he signs. It is what makes him costly to cut.</div></div>`;
  else {
    const opts = incOptions(p), incs = i.inc || [];
    h += `<div class="fa-step"><div class="fa-h">2 · Salary <span class="muted small">· ${t.yrs} year${t.yrs === 1 ? '' : 's'}, ${fmtMoney(t.gtd)} to sign</span></div>
      <div class="fa-ctl"><label>Salary per year $M</label>${num('sal', 84)}</div>
      ${t.yrs >= 2 ? `<div class="fa-ctl"><label title="When the salary is paid. More now costs cap room this year and makes him cheap later.">Paid</label>${seg('load', [['even', 'Evenly'], ['front', 'More now'], ['back', 'More later']])}</div>` : ''}
      <div class="fa-h" style="margin-top:10px">3 · Incentives <span class="muted small">· optional</span></div>
      ${incs.map((x, k) => { const [ik, th] = String(x.m || '').split(':'); return `<div class="fa-ctl"><label>If he</label><select data-change="faIncM" data-pid="${p.id}" data-i="${k}">${opts.map(q => `<option value="${q.k}:${q.th}" ${x.m === q.k + ':' + q.th ? 'selected' : ''}>${esc(incLabel(q))}</option>`).join('')}</select><input type="number" step="0.1" min="0" data-fain="inc${k}" data-pid="${p.id}" value="${x.amt}" style="width:70px" title="$M"><button class="sm" data-action="faIncX" data-pid="${p.id}" data-i="${k}">×</button></div>${faIncNoteHTML(p, { k: ik, th: +th })}`; }).join('')}
      ${incs.length < 2 ? `<button class="sm" data-action="faIncAdd" data-pid="${p.id}">+ Add a bonus if he…</button>` : ''}
      <div class="row" style="gap:6px;margin-top:10px"><button class="primary" data-action="faSalary" data-pid="${p.id}">Make the offer</button>
        <button class="sm" data-action="faHoldA" data-pid="${p.id}" ${dis} title="Repeat your last offer and see if he moves">Hold</button>
        <button class="sm" data-action="faFinalA" data-pid="${p.id}" ${dis} title="Yes or no on your last offer. A no ends the talks.">Best and final</button></div>
      <div class="row" style="gap:6px;margin-top:6px">
        ${onMkt ? `<button class="sm" data-action="faLeaveA" data-pid="${p.id}" ${dis} title="Leave your last offer live and end the meeting. It is binding.">Leave it on the table</button>
        <button class="sm" data-action="faLeaveA" data-dl="1" data-pid="${p.id}" ${dis} title="He must answer tonight or the offer is gone">Deadline: tonight</button>` : ''}
        <button class="sm" data-action="faBack" data-pid="${p.id}" title="Go back to the length and the bonus. It costs patience.">Change length or bonus</button></div></div>`;
  }
  h += `<div class="row" style="gap:6px;margin-top:8px">${onMkt ? `<button class="sm" data-action="faStandA" data-pid="${p.id}" ${t.stood ? 'disabled' : ''}>Where do things stand?</button>` : ''}<button class="sm danger" data-action="faWalkA" data-pid="${p.id}">${onMkt ? 'Walk away' : 'Leave it for now'}</button></div>`;
  return h;
}
// the negotiating table: the contract on the left writing itself, the agent on the right
function faNegotiate(pid, replace) {
  const p = P(pid); if (!p) return;
  const mode = negMode(p), u = state.userTid;
  if (!mode) { ui.faNeg = null; const c = p.tid === u ? (ui.faNegWas === 'extend' && p.contract.next ? p.contract.next : p.contract) : null;
    if (c && c.role) openModal(`<div class="fa-neg signed"><div class="fa-neg-top"><div><h2 style="margin:0">${esc(pname(p))} has signed</h2><div class="muted small">${c.yrs} year${c.yrs === 1 ? '' : 's'} · ${fmtMoney(c.gtd)} signing bonus · ${fmtMoney(c.amt)} against the cap in the first year</div></div></div><div class="fa-doc" style="max-height:64vh">${faSignedDoc(p, c)}</div></div>`, replace);
    else closeModal();
    return; }
  const t = faTalk(pid), a = agentOf(p), mine = faOffers(p).find(o => o.tid === u); ui.faNeg = pid; ui.faNegWas = mode;
  const sub = mode === 'fa' ? `expected ${faExpTxt(p)} a year` : mode === 'resign' ? `his deal is up · he is asking about ${fmtMoney(p.ask)} a year` : `${p.contract.yrs} year${p.contract.yrs === 1 ? '' : 's'} left at ${fmtMoney(p.contract.amt)} · an extension would start in ${state.season + 1 + p.contract.yrs}`;
  const html = `<div class="fa-neg"><div class="fa-neg-top"><div><h2 style="margin:0">${esc(pname(p))} <span class="pill">${esc(p.lbl)}</span> <span class="pill">${mode === 'fa' ? 'Free agent' : mode === 'resign' ? 'Re-signing' : 'Extension'}</span></h2>
      <div class="muted small">Age ${p.age} · ${tierOf(p)} · ${sub} · represented by ${agentLink(a)}</div></div>
      <div class="fa-headline" id="faHead">${faHeadHTML(p)}</div></div>
    ${mine ? `<div class="callout" style="margin:8px 0">Your live offer: <b>${mine.yrs} yr, ${fmtMoney((mine.sal !== undefined ? mine.sal * mine.yrs + mine.gtd : mine.aav * mine.yrs))}</b>, ${fmtMoney(mine.gtd)} to sign · ${mine.night ? 'the agent took it to him: answer tomorrow' : mine.dl ? 'expires tonight' : 'on the table, binding'} <button class="sm" data-action="faPullA" data-pid="${p.id}">Withdraw</button></div>` : ''}
    <div class="fa-neg-grid"><div class="fa-neg-l"><div class="fa-doc" id="faDoc">${faDocHTML(p)}</div><div id="faCap">${faCapTableHTML(p)}</div></div>
      <div class="fa-neg-r"><div class="fa-agent"><b>${esc(agentName(a))}</b> <span class="muted small">· across the table</span></div>
        <div class="fa-log" id="faLog">${t.log.map(l => `<div class="fa-line ${l.w}"><span>${esc(l.t)}</span></div>`).join('')}</div>
        ${faControlsHTML(p)}</div></div></div>`;
  openModal(html, replace);
  const lg = document.getElementById('faLog'); if (lg) lg.scrollTop = lg.scrollHeight;
}
function faSignedDoc(p, c) { c = c || p.contract;
  const keep = ui.faIn; ui.faIn = { [p.id]: { v: 2, yrs: c.yrs, bonus: c.bonus !== undefined ? c.bonus : c.gtd, sal: c.sal !== undefined ? c.sal : c.aav || c.amt, load: c.load || 'even', inc: (c.inc || []).map(x => ({ m: x.k + ':' + x.th, amt: x.amt })), max: 0 } };
  const d = faDocHTML(p); ui.faIn = keep; return d; }
// the right-hand panel on the Free Agents page: where things stand, and the way in
function faSitHTML(p) {
  const u = state.userTid, a = agentOf(p), t = state.fa.talks[p.id], i = faIn(p), mine = faOffers(p).find(o => o.tid === u), ord = state.fa.orders[p.id];
  const hist = (state.agentHist[a.id] || []).slice(-3).reverse(), cl = agentClients(a).filter(x => x.id !== p.id).slice(0, 3);
  let h = `<div class="fa-agent"><div><b>${agentLink(a)}</b> <span class="muted small">· agent, ${agentAge(a)}</span></div>
    <div class="small muted">${cl.length ? 'Also represents ' + cl.map(x => playerLink(x, true)).join(', ') : 'A small client list'}</div>
    ${hist.length ? `<div class="small muted">Your dealings: ${hist.map(x => `${esc(x.n)} ${x.s} — ${x.r === 'signed' ? `signed, ${fmtMoney(x.aav)}/yr${x.ask ? ` (opened at ${fmtMoney(x.ask)})` : ''}` : x.r === 'lost' ? 'went elsewhere' : x.r === 'pulled' ? 'you pulled your offer' : 'you walked away'}`).join(' · ')}</div>` : ''}</div>`;
  if (mine) h += `<div class="callout" style="margin:8px 0">Your offer: <b>${mine.yrs} yr, ${fmtMoney(mine.sal !== undefined ? mine.sal * mine.yrs + mine.gtd : mine.aav * mine.yrs)}</b>, ${fmtMoney(mine.gtd)} to sign · ${mine.night ? 'the agent took it to him: answer tomorrow' : mine.dl ? 'expires tonight' : 'on the table, binding'} <button class="sm" data-action="faPullA" data-pid="${p.id}">Withdraw</button></div>`;
  if (t && t.log.length) h += `<div class="fa-log" style="max-height:120px">${t.log.slice(-2).map(l => `<div class="fa-line ${l.w}"><span>${esc(l.t)}</span></div>`).join('')}</div>`;
  h += `<div style="margin-top:10px"><button class="primary" data-action="faOpen" data-pid="${p.id}" ${t && t.closed === 'done' ? 'disabled' : ''}>${t ? (t.closed === 'done' ? 'Talks are over' : t.closed ? 'Back to the table (he is done for today)' : 'Back to the table') : 'Negotiate with ' + esc(a.last)}</button></div>`;
  return h + faOrderHTML(p, ord, i);
}
function faOrderHTML(p, ord, i) {
  return `<details class="fa-fo" ${ord ? 'open' : ''}><summary class="small">Hand it to the front office</summary><div class="row small" style="gap:8px;margin-top:6px">
    ${ord ? `<span>Bidding up to <b>${fmtMoney(ord.max)}</b>/yr, for ${esc((ord.jobs || []).map(faJobLabel).join(' and ') || 'his usual job')}.</span><button class="sm" data-action="faOrderX" data-pid="${p.id}">Call them off</button>`
      : `<label class="muted">Ceiling per year $M</label><input type="number" step="0.1" min="0" data-fain="max" data-pid="${p.id}" value="${i.max}" style="width:80px"><button class="sm" data-action="faOrderA" data-pid="${p.id}">Let them bid</button>`}
    </div><div class="small muted" style="margin-top:4px">They make a standard offer each day and raise it when another club is ahead, never past your ceiling.</div></details>`;
}
function faFitHTML(p) {
  const u = state.userTid, same = rosterOf(u).filter(x => x.pos === p.pos && !x.expiring).sort((a, b) => viewOvr(b, u) - viewOvr(a, u)), v = viewOvr(p, u);
  const rank = same.filter(x => viewOvr(x, u) > v).length + 1, f = schemeFit(p, u), side = SPOTS[p.spot].side;
  return `<div class="small">Your staff sees ${tierPill(p, v)} · he would be your <b>#${rank}</b> of ${same.length + 1} at ${esc(p.pos)}${rank <= STARTERS[p.pos] ? ' — <b class="good">a starter</b>' : ''}${same[rank - 1] ? `, ahead of ${playerLink(same[rank - 1], true)}` : ''}.${side === 'off' || side === 'def' ? ` Scheme fit: <b class="${f >= 1 ? 'good' : f <= -1 ? 'bad' : ''}">${fitLabel(f)}</b>.` : ''}</div>`;
}
function faCardHTML(p) {
  const u = state.userTid, mk = faInMarket(p), last = p.career[p.career.length - 1], st = faStatus(p), src = cardAdv(p);
  const canSign = state.phase !== 'PLAYOFFS' && state.phase !== 'RECAP';
  let h = `<div class="row"><h2 style="margin:0">${playerLink(p)}</h2><span class="pill">${esc(p.lbl)}</span> ${statusPills(p)} ${rasHTML(p)}<span class="spacer"></span><button class="sm" data-action="player" data-pid="${p.id}">Full card</button></div>
    <div class="muted small" style="margin:3px 0 10px">Age ${p.age} · ${p.exp} yr${p.exp === 1 ? '' : 's'} · ${fmtHeight(p.m.ht)}, ${p.m.wt} · ${p.lastTid != null && p.lastTid >= 0 ? 'last with ' + teamLink(p.lastTid) : 'no club last year'}${p.lastAmt ? ` at ${fmtMoney(p.lastAmt)}/yr` : ''}${mk ? ` · agent ${agentLink(agentOf(p))}` : ''}</div>
    <div class="stat-tiles" style="margin-bottom:10px">
      <div class="tile"><div class="v ${TIER_CLS[tierOf(p)]}" style="font-size:15px">${tierOf(p)}</div><div class="l">Tier</div></div>
      <div class="tile"><div class="v ${UP_CLS[upsideOf(p)]}" style="font-size:14px">${upsideOf(p)}${upMark(p)}</div><div class="l">Upside</div></div>
      <div class="tile"><div class="v" style="font-size:15px">${faExpTxt(p)}</div><div class="l">${mk ? 'Expected / yr' : 'Asking / yr'}</div></div>
      <div class="tile"><div class="v ${st[1]}" style="font-size:13px">${st[0]}</div><div class="l">${mk ? 'Market' : 'Status'}</div></div>
      <div class="tile"><div class="v" style="font-size:13px">${last && last.gp ? `${last.gs || 0} starts ${gradeChip(last.adv ? last.adv.g : null)}` : '—'}</div><div class="l">${last && last.gp ? last.season : 'Last season'}</div></div>
    </div>
    <div class="fa-cols"><div>
      <div class="section-title" style="margin-top:0">Where he fits</div>${faFitHTML(p)}
      <div class="section-title">Scouting</div><div class="small">${traitsTxt(p)}</div>${strengthsHTML(p)}
      <div class="section-title">Positions</div><div class="row small">${comfortHTML(p)}</div>
      ${devPanelHTML(p) ? `<div class="section-title">Upside</div>${devPanelHTML(p)}` : ''}
    </div><div>`;
  if (mk) h += `<div class="section-title" style="margin-top:0">The sit-down</div>${faSitHTML(p)}`;
  else h += `<div class="section-title" style="margin-top:0">Sign him</div><div class="small muted" style="margin-bottom:8px">${state.phase === 'FA' ? 'No agent meeting for a contract this small.' : state.phase === 'REG' ? 'In-season signings are one-year deals.' : 'Available now at his asking price.'}</div>
    <div class="row" style="gap:8px">${canSign ? `<button class="primary" data-action="sign" data-pid="${p.id}" ${p.ask > capRoom(u) ? 'disabled title="Not enough cap space"' : ''}>Sign (${fmtMoney(p.ask)}, ${state.phase === 'REG' ? 1 : contractYears(p)} yr)</button>` : ''}
    ${p.exp <= 6 && psRoom(u, p) && ['REG', 'PRESEASON', 'CUTDOWN', 'DRAFT', 'FA'].includes(state.phase) ? `<button data-action="signPS" data-pid="${p.id}">Practice squad (${fmtMoney(PS_SALARY)})</button>` : ''}</div>`;
  h += `<div class="section-title">Production${src ? ` · ${src.season}${src.cur ? ' to date' : ''}` : ''}</div>${last && last.gp ? `<div class="small" style="margin-bottom:6px">${statSummary(last, p.pos)}</div>` : ''}${glanceHTML(p, src)}
    ${p.career.length > 1 ? `<div class="small muted" style="margin-top:6px">${p.career.slice(-4, -1).reverse().map(r => `${r.season}: ${r.gs || 0} starts${r.gp ? ', ' + statSummary(r, p.pos) : ''}`).join('<br>')}</div>` : ''}
    <div class="section-title">Physicals <span class="small muted">· shaded by percentile at his position</span></div>${combineHTML(p)}`;
  return h + '</div></div>';
}
const FA_LVIEWS = [['market', 'Market'], ['scout', 'Scouting'], ['stats', 'Last season'], ['phys', 'Physical']];
function faRowCells(p, lv) {
  const last = p.career[p.career.length - 1];
  if (lv === 'scout') return `${tierPill(p)}${upsidePill(p)}<span class="fa-txt small muted">${traitsTxt(p)}</span>`;
  if (lv === 'stats') return `<span class="fa-num">${last && last.gp ? (last.gs || 0) : '—'}</span><span class="fa-num">${gradeChip(last && last.adv ? last.adv.g : null)}</span><span class="fa-txt small">${last && last.gp ? statSummary(last, p.pos) : '<span class="muted">Did not play</span>'}</span>`;
  if (lv === 'phys') return `<span class="fa-num">${fmtHeight(p.m.ht)}</span><span class="fa-num">${p.m.wt}</span><span class="fa-num">${p.m.forty ? p.m.forty.toFixed(2) : '—'}</span><span class="fa-txt">${rasHTML(p)}</span>`;
  const s = faStatus(p); return `${tierPill(p)}<span class="fa-exp">${faExpTxt(p)}</span><span class="fa-st ${s[1]}">${s[0]}</span>`;
}
const FA_LHEAD = { market: ['Tier', 'Expected', 'Status'], scout: ['Tier', 'Upside', 'Scouting'], stats: ['GS', 'Grade', 'Line'], phys: ['Ht', 'Wt', '40', 'Athlete'] };
function faMarketHTML() {
  const u = state.userTid, on = faMarketOn(), udfa = state.phase === 'UDFA' && state.udfa;
  let fas = Object.values(state.players).filter(p => p.tid === -1 && !p.waiver && !(udfa && isUdfa(p)) && inFamily(p, ui.faPos));
  const f = ui.faF || (ui.faF = Object.assign({}, FA_DEF)), tIdx = x => TIER_ORDER.indexOf(x), com = on ? faCommitted(u) : { amt: 0, n: 0 };
  if (f.q) { const q = f.q.toLowerCase(); fas = fas.filter(p => (p.first + ' ' + p.last).toLowerCase().includes(q)); }
  if (f.tier) fas = fas.filter(p => tIdx(tierOf(p)) <= tIdx(f.tier) || (f.tier === 'Rotation' && tierOf(p) === 'Backup'));
  if (f.afford) fas = fas.filter(p => faSortVal(p) <= capRoom(u) - com.amt);
  if (f.mine && on) fas = fas.filter(p => state.fa.talks[p.id] || state.fa.orders[p.id] || faOffers(p).some(o => o.tid === u));
  const sort = ui.faSort || 'exp', total = fas.length, lv = FA_LVIEWS.some(x => x[0] === ui.faLV) ? ui.faLV : 'market';
  fas.sort(sort === 'age' ? (a, b) => a.age - b.age : sort === 'tier' ? (a, b) => uOvr(b) - uOvr(a) : sort === 'pos' ? (a, b) => famOrder(a, b) : (a, b) => faSortVal(b) - faSortVal(a) || uOvr(b) - uOvr(a));
  fas = fas.slice(0, 150);
  let sel = ui.faSel !== undefined ? P(ui.faSel) : null; if (!sel || sel.tid !== -1 || sel.waiver) sel = fas[0] || null;
  const live = on ? Object.keys(state.fa.off).map(id => P(+id)).filter(p => p && faOffers(p).some(o => o.tid === u)) : [];
  let html = `<div class="fa-strip card"><div class="row" style="gap:18px">
    ${on ? `<div><div class="big">Day ${state.fa.day + 1} <span class="muted small">of ${FA_DAYS}</span></div><div class="small muted">Clubs bid, players decide overnight</div></div>` : `<div><div class="big">Free agents</div><div class="small muted">${state.phase === 'REG' ? 'In-season signings are one-year deals' : 'Available now'}</div></div>`}
    <div><div class="big">${fmtMoney(capRoom(u))}</div><div class="small muted">Cap room</div></div>
    ${on ? `<div><div class="big ${com.amt > capRoom(u) ? 'bad' : ''}">${fmtMoney(com.amt)}</div><div class="small muted">In ${com.n} live offer${com.n === 1 ? '' : 's'}</div></div>` : ''}
    <div><div class="big">${rosterCount(u)}<span class="muted small">/${rosterLimit()}</span></div><div class="small muted">Roster</div></div>
    <div class="fa-live">${live.map(p => { const o = faOffers(p).find(x => x.tid === u); return `<button class="sm" data-action="faPick" data-pid="${p.id}">${esc(pshort(p))} · ${fmtMoney(o.aav)} × ${o.yrs}${o.night ? ' · answer tomorrow' : o.dl ? ' · tonight' : ''}</button>`; }).join('')}</div></div>
    ${on && state.fa.inbox.length ? `<div class="fa-inbox">${state.fa.inbox.slice(-5).map(x => `<div class="small">• ${esc(x)}</div>`).join('')}<button class="sm" data-action="faInboxX">Clear</button></div>` : ''}</div>`;
  const sortBtn = (k, l) => `<button class="sm ${sort === k ? 'on' : ''}" data-action="faSortA" data-v="${k}">${l}</button>`;
  html += `<div class="fa-wrap"><div class="card fa-left">
    <div class="subtabs" style="margin:0 0 8px">${famTabs(ui.faPos, 'faPos')}</div>
    <div class="row" style="gap:8px;margin-bottom:8px">
      <input type="text" data-change="faF" data-f="q" value="${esc(f.q)}" placeholder="Name…" style="width:110px">
      <select data-change="faF" data-f="tier">${[['', 'Any tier'], ...['Elite', 'All-Pro', 'Starter', 'Rotation', 'Depth'].map(t => [t, t + ' or better'])].map(([v, l]) => `<option value="${v}" ${f.tier === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <label class="small"><input type="checkbox" data-change="faChk" data-f="afford" ${f.afford ? 'checked' : ''}> Can afford</label>
      ${on ? `<label class="small"><input type="checkbox" data-change="faChk" data-f="mine" ${f.mine ? 'checked' : ''}> Mine</label>` : ''}</div>
    <div class="row" style="gap:8px;margin-bottom:8px"><span class="small muted">View</span><span class="seg">${FA_LVIEWS.map(([k, l]) => `<button class="sm ${lv === k ? 'on' : ''}" data-action="faLV" data-v="${k}">${l}</button>`).join('')}</span>
      <span class="spacer"></span><span class="small muted">Sort</span><span class="seg">${sortBtn('exp', '$')}${sortBtn('tier', 'Tier')}${sortBtn('age', 'Age')}${sortBtn('pos', 'Pos')}</span></div>
    <div class="fa-row fa-head lv-${lv}"><span>Pos</span><span>Name</span><span>Age</span>${FA_LHEAD[lv].map(x => `<span>${x}</span>`).join('')}</div>
    <div class="fa-list">${fas.map(p => `<div class="fa-row lv-${lv} ${sel && sel.id === p.id ? 'on' : ''}" data-action="faPick" data-pid="${p.id}">
      <span class="fa-pos">${esc(p.lbl)}</span><span class="fa-name">${playerLink(p)}</span><span class="fa-age muted">${p.age}</span>${faRowCells(p, lv)}</div>`).join('') || '<div class="muted small" style="padding:10px">Nobody matches.</div>'}</div>
    <div class="small muted" style="margin-top:6px">${fas.length} of ${total} shown · click a row to select, a name for the full card</div></div>
    <div class="card fa-right">${sel ? faCardHTML(sel) : '<div class="muted">No free agents.</div>'}</div></div>`;
  return html;
}
// ---- agents: a name, an age, the people he represents, and what has passed between you ----
function agentLink(a) { return `<button class="link" data-action="agent" data-aid="${a.id}">${esc(agentName(a))}</button>`; }
function agentModal(aid) {
  ensureAgents(); const a = state.agents[aid]; if (!a) return;
  const cl = Object.values(state.players).filter(p => p.agent === a.id && (p.tid >= 0 || p.tid === -1)).sort((x, y) => uOvr(y) - uOvr(x)), hist = (state.agentHist[a.id] || []).slice().reverse();
  const res = x => x.r === 'signed' ? `signed with you for ${fmtMoney(x.aav)}/yr${x.ask ? ` · he opened at ${fmtMoney(x.ask)}` : ''}${x.d !== undefined ? ` · day ${x.d + 1}` : ''}` : x.r === 'lost' ? `signed elsewhere${x.aav ? ` for ${fmtMoney(x.aav)}/yr` : ''}` : x.r === 'pulled' ? 'you pulled your offer' : 'you walked away';
  openModal(`<div class="row"><h2 style="margin:0">${esc(agentName(a))}</h2><span class="pill">Agent</span></div>
    <div class="muted" style="margin:4px 0 12px">Age ${agentAge(a)} · ${cl.length} client${cl.length === 1 ? '' : 's'}</div>
    <div class="grid card-cols"><div><div class="section-title" style="margin-top:0">Clients</div>
      ${cl.length ? `<table class="tbl"><tbody>${cl.slice(0, 40).map(p => `<tr><td class="small muted">${esc(p.lbl)}</td><td>${playerLink(p)}</td><td class="small muted">${p.age}</td><td>${tierPill(p)}</td><td class="small">${p.tid >= 0 ? teamLink(p.tid) : '<span class="muted">Free agent</span>'}</td></tr>`).join('')}</tbody></table>${cl.length > 40 ? `<div class="small muted">and ${cl.length - 40} more</div>` : ''}` : '<div class="muted small">Nobody in the league right now.</div>'}</div>
    <div><div class="section-title" style="margin-top:0">Your history with ${a.sex === 'f' ? 'her' : 'him'}</div>
      ${hist.length ? hist.map(x => `<div class="small" style="margin-bottom:6px"><b>${esc(x.n)}</b> <span class="muted">${x.s + 1} offseason</span><br>${res(x)}</div>`).join('') : '<div class="muted small">You have not done business yet.</div>'}</div></div>`);
}

// ---------- cutdown day: the coaches' meeting ----------
function cutdownHTML() {
  const u = state.userTid, plan = state.cut.plan, prev = cutPreview(u);
  const ro = rosterOf(u), on = ro.filter(countsOn53);
  const gone = v => v === 'cut' || v === 'ps';
  const keeps = on.filter(p => !gone(plan[p.id])), need = keeps.length - ROSTER_MAX;
  const psN = on.filter(p => plan[p.id] === 'ps').length, psVets = on.filter(p => plan[p.id] === 'ps' && psVet(p)).length;
  const fam = ui.cutFam || 'ALL';
  const coachFor = p => { const t = T(u), side = SPOTS[p.spot].side; return posCoach(u, p.pos) || C(side === 'off' ? t.oc : side === 'def' ? t.dc : t.stc) || C(t.hc); };
  let html = `<div class="card" style="margin-bottom:14px"><div class="row"><div><div class="big ${need > 0 ? 'bad' : 'good'}">${keeps.length} / ${ROSTER_MAX}</div><div class="small muted">${need > 0 ? `Cut ${need} more to get to ${ROSTER_MAX}` : need < 0 ? `${-need} open spot${need === -1 ? '' : 's'}: nobody will be signed for you` : 'Roster is set'} · practice squad ${psN}/${PS_MAX} marked (${psVets}/${PS_VETS} veterans) · ${ro.length - on.length} heading to IR (not counted) · dead money so far ${fmtMoney(on.filter(p => plan[p.id] === 'cut').reduce((s, p) => { const d = deadIfCut(p); return s + d.now + d.next; }, 0))}</div></div>
    <span class="spacer"></span><button data-action="cutStaff">Use the staff's recommendations</button><button data-action="cutClear">Clear my cuts</button></div>
    <p class="small muted" style="margin:10px 0 0">Go group by group. Each player has the staff's call and their reasoning; <b>Keep</b>, <b>Cut</b> or <b>Practice squad</b> is yours. Players with fewer than ${WAIVER_EXP} seasons must clear waivers before they can come back to your practice squad: the "If waived" column shows who is likely to be claimed. Veterans are free agents and can go straight to it. When you're done, press <b>Finalize Roster</b> at the top.</p></div>`;
  html += campObjectionsHTML(u, plan);
  // position rooms: how many you're carrying vs. what the staff would carry
  const room = FAMILIES.map(([f, spots]) => { const all = on.filter(p => spots.includes(p.spot)); return { f, n: all.filter(p => !gone(plan[p.id])).length, staff: all.filter(p => !prev.cuts.has(p.id)).length, total: all.length }; }).filter(r => r.total);
  html += `<div class="subtabs"><button class="${fam === 'ALL' ? 'on' : ''}" data-action="cutFam" data-pos="ALL">All (${keeps.length})</button>${room.map(r => `<button class="${fam === r.f ? 'on' : ''}" data-action="cutFam" data-pos="${r.f}" title="Staff would carry ${r.staff}">${r.f} ${r.n}${r.n !== r.staff ? `<span class="small" style="opacity:.75"> (staff ${r.staff})</span>` : ''}</button>`).join('')}</div>`;
  const list = ro.filter(p => inFamily(p, fam));
  if (fam !== 'ALL' && list.length) {
    const c = coachFor(list[0]), r = room.find(x => x.f === fam);
    const bub = list.filter(p => prev.bubble.has(p.id) && countsOn53(p));
    const stars = list.filter(p => preGrade(p) !== null).sort((a, b) => preGrade(b) - preGrade(a))[0];
    html += `<div class="callout"><b>${c ? esc(cname(c)) : 'Staff'}:</b> "We'd carry ${r.staff} in this room.${bub.length ? ` The tough call${bub.length > 1 ? 's are' : ' is'} ${bub.slice(0, 3).map(p => esc(p.last)).join(', ')}.` : ' No hard decisions here.'}${stars && preGrade(stars) >= 75 ? ` ${esc(stars.last)} had the best preseason of the group.` : ''}"</div>`;
  }
  const verdict = p => !countsOn53(p) ? ['IR', 'muted'] : prev.cuts.has(p.id) ? [p.exp <= 2 && p.age <= 25 ? 'Cut → PS' : 'Cut', 'bad'] : prev.bubble.has(p.id) ? ['Bubble', 'warn'] : ['Keep', 'good'];
  // two ways to look at the room: the staff's case for each player, or what he actually did this preseason
  const film = ui.cutView === 'film';
  const fam_ = p => (FAMILIES.find(([, spots]) => spots.includes(p.spot)) || [p.pos])[0];
  const roomRank = {}; { const by = {}; for (const p of on) if (preGrade(p) !== null) (by[fam_(p)] = by[fam_(p)] || []).push(p); for (const k in by) by[k].sort((x, y) => preGrade(y) - preGrade(x)).forEach((p, i) => roomRank[p.id] = [i + 1, by[k].length]); }
  const facets = p => !p.preS ? '' : Object.keys(FACETS).map(k => [k, gradeN(p.preS.adv, k) >= 8 ? facetGrade(p.preS.adv, k, 0, p.spot) : null]).filter(x => x[1] !== null).map(([k, g]) => `<span class="small" style="white-space:nowrap;margin-right:8px">${FACETS[k]} ${gradeChip(g)}</span>`).join('');
  const mid = film ? [
    { k: 'pgp', l: 'GP', v: p => p.preS ? p.preS.gp : 0, num: 1 },
    { k: 'psn', l: 'Snaps', v: p => p.preS ? p.preS.snp : 0, f: p => p.preS ? `${p.preS.snp}${p.preS.snp < 30 ? ' <span class="small warn" title="Thin sample: grades on this little film are unreliable">thin</span>' : ''}` : '<span class="muted small">sat</span>', num: 1 },
    { k: 'pre', l: 'Grade', v: p => preGrade(p) || 0, f: p => gradeChip(preGrade(p)), num: 1 },
    { k: 'rk', l: 'In room', v: p => roomRank[p.id] ? -roomRank[p.id][0] : -99, f: p => roomRank[p.id] ? `<span class="small muted">${roomRank[p.id][0]}/${roomRank[p.id][1]}</span>` : '', title: 'Preseason grade rank within his position group on your roster', num: 1 },
    { k: 'fac', l: 'By area', f: p => `<span class="wrapcell" style="max-width:330px;display:inline-block">${facets(p)}</span>` },
    { k: 'line', l: 'Preseason stats', f: p => p.preS && p.preS.gp ? `<span class="small">${statSummary(p.preS.st, p.pos)}</span>` : '' },
    { k: 'staff', l: 'Staff', v: p => (prev.cuts.has(p.id) ? 0 : prev.bubble.has(p.id) ? 1 : 2), f: p => { const [t, c] = verdict(p); return `<span class="pill ${c}" title="${esc(cutNote(p, prev))}">${t}</span>`; } },
  ] : [
    { k: 'pre', l: 'Preseason', v: p => preGrade(p) || 0, f: p => p.preS ? `${gradeChip(preGrade(p))} <span class="small muted">${p.preS.snp} snaps</span>` : '<span class="muted small">sat</span>', num: 1 },
    { k: 'c', l: 'Contract', v: p => p.contract.amt, f: p => fmtContract(p), num: 1 },
    { k: 'save', l: 'Cut saves', v: p => cutSavings(p), f: p => { const v = cutSavings(p); return `<span class="${v < 0 ? 'bad' : ''}">${fmtMoney(v)}</span>`; }, num: 1 },
    { k: 'staff', l: 'Staff says', v: p => (prev.cuts.has(p.id) ? 0 : prev.bubble.has(p.id) ? 1 : 2), f: p => { const [t, c] = verdict(p); return `<span class="pill ${c}">${t}</span> <span class="small muted wrapcell" style="max-width:340px">${esc(cutNote(p, prev))}</span>`; } },
  ];
  html += `<div class="subtabs" style="margin-top:0">${[['staff', 'Staff meeting'], ['film', 'Preseason stats & grades']].map(([k, l]) => `<button class="${(film ? 'film' : 'staff') === k ? 'on' : ''}" data-action="cutView" data-v="${k}">${l}</button>`).join('')}</div>`;
  html += `<div class="card">` + table('cutdown', [
    { k: 'pos', l: 'Pos', v: p => FAM_INDEX[p.spot] * 1000 - uOvr(p), f: p => esc(p.lbl) },
    { k: 'n', l: 'Name', v: p => p.last, f: p => playerLink(p) + ' ' + statusPills(p) },
    { k: 'age', l: 'Age', v: p => p.age, num: 1 },
    { k: 'star', l: '★', v: p => starsOf(p) || 0, f: p => starHTML(starsOf(p)) },
    { k: 'tier', l: 'Tier', v: tierSort, f: p => tierPill(p) + trueNums(p) },
    { k: 'up', l: 'Upside', v: upSort, f: p => upsidePill(p) },
    ...mid,
    { k: 'risk', l: 'If waived', f: p => { if (!countsOn53(p)) return ''; const r = claimRiskIfCut(p); return `<span class="pill ${r === 'Will be claimed' ? 'bad' : r === 'Could be claimed' ? 'warn' : r === 'Should clear' ? 'good' : ''}">${r}</span>`; }, title: 'Would another team claim him off waivers?' },
    { k: 'd', l: 'Your call', f: p => !countsOn53(p) ? '' : `<span class="seg">${[['keep', 'Keep'], ['cut', 'Cut'], ['ps', 'Practice squad']].map(([k, l]) => `<button class="sm ${(plan[p.id] || 'keep') === k ? (k === 'keep' ? 'primary' : k === 'cut' ? 'danger' : 'on') : ''}" data-action="cutSet" data-pid="${p.id}" data-v="${k}">${l}</button>`).join('')}</span>` },
  ], list, { sort: 'pos', dir: 1, rowClass: p => gone(plan[p.id]) ? 'cutrow' : '' }) + '</div>';
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
  const grade = p => uOvr(p) + 0.55 * p.per.g + ({ QB: 3, RB: -2, K: -22, P: -24 }[p.pos] || 0); // consensus big board
  const ranked = prospects().sort((a, b) => grade(b) - grade(a));
  const rankOf = new Map(ranked.map((p, i) => [p.id, i + 1]));
  html += `<div class="callout">${['REG', 'PLAYOFFS', 'RECAP'].includes(state.phase) ? `<b>${prospects()[0].draftYear} draft class.</b> Reports sharpen as the college season goes on, but stay foggy until these players are in the league. ` : ''}${state.phase !== 'DRAFT' ? `Draft preview — the draft happens after free agency. Everything here is your scouts' read: prospects are the foggiest players in football, and workout numbers get overhyped.` : onClock ? `<b>You're on the clock</b> with pick #${pk.pick} (Round ${pk.round}). Choose a player below.` : pk ? `Pick #${pk.pick}: ${T(pk.owner).abbr} on the clock.` : ''}</div>`;
  if (state.phase === 'DRAFT') { // the phones: offers for your pick, and the trade desk
    const offs = onClock && d.offer && d.offer.idx === d.idx ? d.offer.list : [];
    html += `<div class="card" style="margin-bottom:12px"><div class="row" style="justify-content:space-between;gap:10px"><h3 style="margin:0">The phones</h3><span class="small muted">Trades are open during the draft: build one on Players → Trade, picks included.</span></div>
      ${offs.length ? offs.map((o, i) => `<div class="row" style="gap:10px;margin-top:8px"><span>${teamLink(o.tid)} want to come up to <b>pick ${pk.pick}</b>. They offer ${o.give.map(id => { const x = state.picks.find(z => z.id === id); return x ? `<b>${esc(pickLabel(x))}</b>` : ''; }).join(' and ')}.</span><button class="sm primary" data-action="draftOffer" data-i="${i}">Take it</button></div>`).join('') : `<div class="small muted" style="margin-top:6px">${onClock ? 'Nobody has called about this pick.' : 'Quiet for now. Clubs call when you are on the clock.'}</div>`}</div>`;
  }
  html += `<div class="grid" style="grid-template-columns:minmax(0,3fr) minmax(260px,1fr)"><div class="card"><h3>Prospects</h3>
    <div class="subtabs">${famTabs(ui.draftPos, 'draftPos')}</div>` + table('draft', [
    { k: 'rk', l: 'Rank', v: p => rankOf.get(p.id), num: 1 },
    { k: 'pos', l: 'Pos', v: p => FAM_INDEX[p.spot], f: p => esc(p.lbl) },
    { k: 'n', l: 'Name', v: p => p.last, f: p => playerLink(p) },
    { k: 'col', l: 'College', v: p => p.college, f: p => `<span class="muted">${esc(p.college)}</span>` },
    { k: 'age', l: 'Age', v: p => p.age, num: 1 },
    { k: 'ht', l: 'Ht', v: p => p.m.ht, f: p => `<span class="small muted">${fmtHeight(p.m.ht)}</span>`, num: 1 }, { k: 'wt', l: 'Wt', v: p => p.m.wt, f: p => `<span class="small muted">${p.m.wt}</span>`, num: 1 },
    { k: 'forty', l: '40', v: p => -(p.m.forty !== undefined ? p.m.forty : p.pw && p.pw.forty !== undefined ? p.pw.forty : 9), f: p => p.m.forty !== undefined ? p.m.forty.toFixed(2) + (p.m.x && p.m.x.forty === 'p' ? '<span class="muted">*</span>' : '') : p.pw && p.pw.forty !== undefined ? `<span title="Your private workout">${p.pw.forty.toFixed(2)}†</span>` : `<span class="small muted" title="${((p.m.x && DRILL_WHY[p.m.x.forty]) || ['', 'No result'])[1]}">${p.m.x && p.m.x.forty === 'i' ? 'inj' : 'DNR'}</span>`, num: 1 },
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
  if (c.role === 'OC') { ensureOffPk(c); const t = c.t; return `<div style="margin-bottom:6px">${offPkHTML(t)}</div>${pctS(t.pass)} pass · zone ${pctS(t.zone)} · deep ${pctS(t.deep)} · PA ${pctS(t.pa)} · motion ${pctS(t.motion)} · RPO ${pctS(t.rpo)} · QB runs ${pctS(t.qbRun)} · RB1 ${pctS(t.rb1)} of carries`; }
  if (c.role === 'DC' && c.pk) { const t = c.t; return `${t.front} front · base personnel ${pctS(t.base)}<div style="margin-top:6px"><b>Coverage packages:</b> ${pkList(c.pk.sh, SHELLS)}</div><div style="margin-top:4px"><b>Pressure packages:</b> ${pkList(c.pk.pr, PRESSURES)}</div><div style="margin-top:4px">Stunts ${pctS(c.pk.stunt)}${c.pk.disg ? ` · disguises the coverage ${pctS(c.pk.disg)} of the time` : ' · shows what he is playing'}</div>${c.pk.lib ? `<div style="margin-top:4px"><b>Fronts:</b> ${c.pk.lib.base.map(x => `${esc(x[0])} ${Math.round(x[1] * 100)}%`).join(' · ')} in base; ${c.pk.lib.sub.map(x => `${esc(x[0])} ${Math.round(x[1] * 100)}%`).join(' · ')} in nickel and dime</div><div style="margin-top:4px">Line slants ${pctS(c.pk.lib.sl)}${c.pk.lib.mug >= 0.02 ? ` · walks linebackers up ${pctS(c.pk.lib.mug)}` : ''}</div>` : ''}`; }
  if (c.role === 'DC') { const t = c.t; return `${t.front} front · man ${pctS(t.man)} · two-high ${pctS(t.high)} · blitz ${pctS(t.blitz)} · sim pressure ${pctS(t.sim)} · stunts ${pctS(t.stunt)} · base pkg ${pctS(t.base)}`; }
  return '';
}
function coachKnobChips(c) {
  return coachRatings(c).map(r => `<span class="small" style="white-space:nowrap${r.grey ? ';opacity:.55' : ''}">${r.l} ${isAsst(c) ? wordPill(asstWord(c, r.k)) : tierChip(r.v)}</span>`).join(' ');
}
// A coach's ratings as bars and words. A caller's two ratings show only for a man who calls plays; greyed, with the year,
// for one who used to. What you see of an assistant is your staff's read of him.
function ratingBarsHTML(c) {
  if (!coachKnown(c)) return `<div class="muted small">You only know his reputation (${repLabel(c)}). Interview him to see what he is really good at.</div>`;
  const as = isAsst(c);
  return `<div class="cr-list">` + coachRatings(c).map(r => { const v = Math.round(as ? asstSeen(c, r.k) : r.v), w = as ? asstWord(c, r.k) : coachTier(v);
    return `<div class="cr ${r.grey ? 'grey' : ''}" title="${esc(KNOB_HELP[r.k] || '')}${r.note ? ' — ' + esc(r.note) : ''}"><span class="cr-l">${r.l}${r.grey ? ` <i>${c.called}</i>` : ''}</span><span class="cr-bar"><i style="width:${v}%;background:${r.grey ? 'var(--muted)' : gradeColor(v)}"></i></span><span class="cr-w">${w}${trueOn() ? ' ' + v : ''}</span></div>`; }).join('') + `</div>`
    + (CALLER_ROLES.includes(c.role) && !callerState(c) ? `<div class="small muted" style="margin-top:4px">He has never called plays: nobody knows how he would do.</div>` : '');
}
function coachRoleBlurb(c) {
  return { HC: 'He runs the building and the game: practice, discipline, how fast new players fit in, and the decisions on Sunday.',
    OC: 'His scheme, and how much of it his players ever learn. If he calls the plays, the calls and the adjustments are his too.', DC: 'His scheme, and how much of it his players ever learn. If he calls the plays, the calls and the adjustments are his too.',
    STC: 'Coverage and return units, the kicking operation, and the kickers and punters themselves.', SC: 'Who gets hurt, how fast they come back, how fresh the team is late, and how bodies develop and age.',
    PGC: 'His creativity keeps your passing game hard to figure out; his adjustments figure out their pass defense as the game goes on.', RGC: 'His creativity keeps your run game hard to figure out; his adjustments figure out their run defense as the game goes on.',
    DPC: 'His creativity keeps your coverage and pressure hard to figure out; his adjustments figure out their passing game as the game goes on.', DRC: 'His creativity keeps your run defense hard to figure out; his adjustments figure out their run game as the game goes on.' }[c.role]
    || 'Cohesion is how far his room can get on the same page: the ceiling on its chemistry. Technique is how fast his players improve.';
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
function knobRow(c, k) {
  const v = c.k[k] === undefined ? 50 : c.k[k];
  return `<div class="glance knob" title="${KNOB_LABEL[k]}"><span class="gl-l">${KNOB_LABEL[k]}</span><span class="gl-bar"><i style="width:${v}%;background:${gradeColor(v)}"></i></span><span class="gl-v small">${coachTier(v)}${trueOn() ? ' ' + v : ''}</span></div>`;
}
function coachStrengths(c) { return coachRatings(c).filter(r => !r.grey).sort((a, b) => b.v - a.v).slice(0, 2).map(r => r.l).join(', '); }
function wordPill(w) { return `<span class="pill ${asstWordCls(w)}">${w}</span>`; }
function kwPills(c) { return [bgLabel(c), leanLabel(c), c.style].filter(Boolean).map(k => `<span class="pill">${esc(k)}</span>`).join(' '); }
function asstTrack(c) {
  const bits = [];
  if (c.tid >= 0) bits.push(`${c.yrs || 0} yr${c.yrs === 1 ? '' : 's'} on this staff`);
  if (c.tr && c.tr.n >= 3) bits.push(`young players ${c.tr.sum / c.tr.n >= 0 ? '+' : ''}${(c.tr.sum / c.tr.n).toFixed(1)}/yr${c.tr.jumps ? ', ' + c.tr.jumps + ' big jump' + (c.tr.jumps === 1 ? '' : 's') : ''}`);
  return bits.join(' · ') || '—';
}
// the two tiers below the coordinators, grouped by side of the ball
function assistantsHTML(t, mine, canHire) {
  if (!t.asst) return '';
  let html = '';
  for (const [side, name, coordKey] of [['O', 'Offense', 'oc'], ['D', 'Defense', 'dc']]) {
    const coord = C(t[coordKey]), infl = tendInfluences(t, side);
    const act = (role, c) => {
      if (!canHire) return '';
      const lock = t.locks && t.locks[role] && C(t.locks[role]) && C(t.locks[role]).tid === t.id ? C(t.locks[role]) : null;
      if (!c) return `<button class="sm primary" data-action="searchRole" data-role="${role}">Find someone</button>`;
      if (lock) return `<span class="small muted" title="You promised this job to ${esc(cname(lock))} for his man">🔒 ${esc(lock.last)}'s man</span>`;
      const up = SPEC_ROLES.includes(role) ? !coord : !asst(t, SPEC_OVER[role]);
      return `${up ? `<button class="sm primary" data-action="asstPromote" data-cid="${c.id}" title="Move him up into the open job above him">Promote</button> ` : ''}<button class="sm danger" data-action="fireCoach" data-role="${role}">Let go</button>`;
    };
    const spec = SPEC_ROLES.filter(r => ASST_SIDE[r] === side).map(role => ({ role, c: asst(t, role) }));
    const pos = POS_ROLES.filter(r => ASST_SIDE[r] === side).map(role => ({ role, c: asst(t, role) }));
    html += `<div class="card" style="margin-top:16px"><h3 style="margin-top:0">${name} staff <span class="small muted" style="font-weight:400">· under ${coord ? esc(cname(coord)) : 'a vacant coordinator job'}</span></h3>
      ${infl.length ? `<div class="small muted" style="margin-bottom:8px">How the call sheet is shaped: ${infl.map(esc).join(' · ')}</div>` : ''}` +
      table('spec' + side, [
        { k: 'r', l: 'Specialist', f: r => `<b>${ASST_LABEL[r.role]}</b>` },
        { k: 'n', l: 'Coach', f: r => coachNameLink(r.c) },
        { k: 'a', l: 'Age', f: r => r.c ? r.c.age : '', num: 1 },
        { k: 'l', l: 'Leans', f: r => r.c ? `<span class="pill on">${esc(leanLabel(r.c))}</span>` : '' },
        { k: 'p', l: 'Brings', f: r => { if (!r.c) return ''; ensureDefPk(r.c); ensureOffPk(r.c); return r.c.pks && r.c.pks.length ? `<span class="small">${r.c.pks.map(id => PK_NAME[id]).join(', ')}</span>` : '<span class="small muted">—</span>'; } },
        { k: 'e', l: 'Expertise', f: r => r.c ? wordPill(asstWord(r.c, 'exp')) : '' },
        { k: 'k', l: 'Background', f: r => r.c ? `<span class="small muted">${esc(bgLabel(r.c))} · ${esc(r.c.style)}</span>` : '' },
        { k: 't', l: 'Track record', f: r => r.c ? `<span class="small muted">${asstTrack(r.c)}</span>` : '' },
        { k: 'ct', l: 'Contract', f: r => r.c && r.c.sal !== undefined ? `<span class="small">${fmtMoney(r.c.sal)} × ${r.c.cyrs}</span>` : '' },
        { k: 'x', l: '', f: r => act(r.role, r.c) },
      ], spec, { nosort: 1 }) + '<div style="height:10px"></div>' +
      table('pos' + side, [
        { k: 'r', l: 'Position coach', f: r => `<b>${ASST_LABEL[r.role].replace(' Coach', '')}</b>` },
        { k: 'n', l: 'Coach', f: r => coachNameLink(r.c) },
        { k: 'a', l: 'Age', f: r => r.c ? r.c.age : '', num: 1 },
        { k: 'd', l: 'Development', f: r => r.c ? wordPill(asstWord(r.c, 'dev')) : '' },
        { k: 'i', l: 'Discipline', f: r => r.c ? wordPill(asstWord(r.c, 'disc')) : '' },
        { k: 'k', l: 'Keywords', f: r => r.c ? kwPills(r.c) : '' },
        { k: 't', l: 'Track record', f: r => r.c ? `<span class="small muted">${asstTrack(r.c)}</span>` : '' },
        { k: 'ct', l: 'Contract', f: r => r.c && r.c.sal !== undefined ? `<span class="small">${fmtMoney(r.c.sal)} × ${r.c.cyrs}</span>` : '' },
        { k: 'x', l: '', f: r => act(r.role, r.c) },
      ], pos, { nosort: 1 }) + '</div>';
  }
  return html;
}
function asstPoolModal(role) {
  const t = T(state.userTid), cur = asst(t, role), spec = SPEC_ROLES.includes(role);
  const pool = Object.values(state.coaches).filter(c => c.tid < 0 && c.role === role).sort((a, b) => b.ovr - a.ovr);
  let h = `<h2 style="margin-top:0">${ASST_LABEL[role]}</h2><p class="small muted">${cur ? `Currently ${esc(cname(cur))}. Hiring someone else lets him go.` : 'The job is open. If you leave it empty, your coordinator fills it when you continue.'} Ratings on men you have not worked with are rougher guesses.</p>`;
  h += pool.length ? table('apool', [
    { k: 'n', l: 'Name', f: c => coachNameLink(c) }, { k: 'a', l: 'Age', f: c => c.age, num: 1 },
    ...(spec ? [{ k: 'l', l: 'Leans', f: c => `<span class="pill on">${esc(leanLabel(c))}</span>` }, { k: 'e', l: 'Expertise', f: c => wordPill(asstWord(c, 'cre')) }]
      : [{ k: 'd', l: 'Development', f: c => wordPill(asstWord(c, 'dev')) }, { k: 'i', l: 'Discipline', f: c => wordPill(asstWord(c, 'coh')) }]),
    { k: 'k', l: 'Keywords', f: c => kwPills(c) },
    { k: 'h', l: '', f: c => `<button class="sm primary" data-action="asstHire" data-cid="${c.id}">Hire</button>` },
  ], pool, { nosort: 1 }) : '<p class="muted">Nobody is available for this job right now.</p>';
  openModal(h);
}
function asstModal(c) {
  const spec = SPEC_ROLES.includes(c.role), t = c.tid >= 0 ? T(c.tid) : null;
  let h = `<div class="row"><h2 style="margin:0">${esc(cname(c))}</h2><span class="pill">${ASST_LABEL[c.role]}</span></div>
    <div class="muted" style="margin:4px 0 12px">${t ? teamLink(c.tid, true) : 'Available'} · Age ${c.age} · ${asstTrack(c)}</div>
    <div class="row" style="gap:6px;margin-bottom:12px">${kwPills(c)}</div>`;
  h += `<div class="cc-grid"><div><div class="section-title" style="margin-top:0">Ratings</div>${ratingBarsHTML(c)}<p class="small muted" style="margin-top:8px">${coachRoleBlurb(c)}</p></div><div>`;
  if (spec) {
    const L = LEANS[c.role][c.lean];
    ensureDefPk(c); ensureOffPk(c);
    h += `<div class="section-title" style="margin-top:0">What he brings</div><div class="small">Leans <b>${esc(L[0])}</b>${c.pks && c.pks.length ? `<div style="margin-top:6px">${c.pks.map(id => `<span class="pill on">${PK_NAME[id]}</span>`).join(' ')}</div>` : ''}</div>
      <p class="small muted" style="margin-top:8px">${t ? tendInfluences(t, ASST_SIDE[c.role]).filter(x => x.includes(cname(c))).map(esc).join(' ') : 'More creativity means more for an opponent to prepare for, and more for your own players to learn.'}</p>`;
  } else h += `<div class="section-title" style="margin-top:0">Background</div><div class="small">${esc(bgLabel(c))} background · ${esc(c.style)}</div><p class="small muted" style="margin-top:8px">If he is ever promoted, his keywords become his system and tendencies.</p>`;
  h += `</div></div>`;
  h += `<p class="small muted">${c.tid === state.userTid ? ((c.yrs || 0) >= 3 ? 'Your staff knows him well: these reads are reliable.' : 'He is still new to your staff: these reads will firm up over a couple of seasons.') : 'You have not worked with him: treat these reads as rough.'}</p>`;
  const mentors = c.mentors.map(id => C(id)).filter(Boolean);
  if (mentors.length) h += `<div class="section-title">Coaching Tree</div><div class="small">Worked under: ${mentors.map(m => coachNameLink(m)).join(', ')}</div>`;
  if (c.hist.length) h += `<div class="section-title">Career</div>` + table('ahist', [
    { k: 's', l: 'Season', f: x => x.s }, { k: 't', l: 'Team', f: x => T(x.tid).abbr }, { k: 'r', l: 'Role', f: x => ROLE_SHORT[x.role] || x.role }, { k: 'w', l: 'Record', f: x => `${x.w}-${x.l}` },
  ], c.hist.slice().reverse(), { nosort: 1 });
  openModal(h);
}
// ---------- the coaching search ----------
function promiseChips(t, role, c) {
  const bits = [];
  if (c.prom && c.prom.call) bits.push('calls the ' + (c.prom.call === 'O' ? 'offense' : 'defense'));
  const n = c.prom && c.prom.slots ? Object.keys(c.prom.slots).length : 0; if (n) bits.push(n + ' staff slot' + (n === 1 ? '' : 's'));
  if (c.prom && c.prom.resign && P(c.prom.resign)) bits.push('re-sign ' + P(c.prom.resign).last);
  const lock = t.locks && t.locks[role] && C(t.locks[role]) && C(t.locks[role]).tid === t.id ? C(t.locks[role]) : null;
  if (lock) bits.push('🔒 ' + lock.last + "'s man");
  return bits.length ? `<span class="small muted">${esc(bits.join(' · '))}</span>` : '';
}
const SEARCH_TABS = [['HC', 'Head coach'], ['OC', 'Off. coordinator'], ['DC', 'Def. coordinator'], ['STC', 'Special teams'], ['SC', 'Strength'], ['SPEC', 'Specialists'], ['POS', 'Position coaches']];
function tiesTo(c, t) { // who on your staff (or in your plans) he is tied to
  const out = [];
  for (const r of ALL_ROLES) { const s = staffCoach(t, r); if (s && linkOf(c, s) >= 0.3) out.push(`${s.last} (${linkWord(linkOf(c, s))})`); }
  const boss = Object.keys(c.links || {}).map(id => C(+id)).filter(b => b && b.tid < 0 && linkOf(c, b) >= 0.5 && ROLE_TIER[b.role] < ROLE_TIER[c.role]).sort((a, b) => linkOf(c, b) - linkOf(c, a))[0];
  if (boss) out.push(`follows ${boss.last} (${ROLE_SHORT[boss.role]}, on the market)`);
  return out.join(' · ');
}
function searchHTML2(t) {
  const car = state.car, tab = ui.searchTab || 'HC', u = t.id;
  const roles = tab === 'SPEC' ? SPEC_ROLES : tab === 'POS' ? POS_ROLES : [tab];
  const sub = (tab === 'SPEC' || tab === 'POS') && roles.includes(ui.searchRole) ? ui.searchRole : roles[0];
  const role = roles.length > 1 ? sub : tab;
  const pay = staffPayroll(u), open = ALL_ROLES.filter(r => !staffCoach(t, r));
  let html = `<div class="card" style="margin-top:16px"><div class="row"><h3 style="margin:0">Coaching search · day ${car.day + 1} of ${CAROUSEL_DAYS}</h3><span class="spacer"></span>
    <span class="small">Staff budget <b>${fmtMoney(pay)}</b> of ${fmtMoney(t.staffBud)}${t.staffDead ? ` <span class="muted">(incl. ${fmtMoney(t.staffDead)} owed to coaches you let go)</span>` : ''} · <b class="${staffRoom(u) < 0 ? 'bad' : 'good'}">${fmtMoney(staffRoom(u))} left</b></span></div>
    <p class="small muted" style="margin:8px 0">Every coach here is his own man with his own ties. Until you <b>interview</b> a man you only know his reputation, at every level of the staff; then <b>negotiate</b>: play-calling, which of his people he may bring (each slot you promise is a job you no longer fill), a player re-signed, money and guaranteed years. Other clubs hire <b>${DAY_NAME[Math.min(car.day, 3)].toLowerCase()}</b> when you advance, so the best are gone first.
    A coach under contract elsewhere will move for a promotion, or sideways for a clearly better offer, and his club can match. Open jobs: ${open.length ? open.map(r => ROLE_SHORT[r]).join(', ') : 'none'}.</p>`;
  html += raidsHTML(t);
  if (car.req.length) html += '<div class="callout"><b>Requests from your new staff.</b> These are asks, not demands: granting one fills the job with his man and makes it his to keep.' + car.req.map((r, i) => { const by = C(r.by), g = C(r.cid), cur = staffCoach(t, r.role); return `<div class="row small" style="margin:6px 0">${coachNameLink(by)} would like ${coachNameLink(g)} <span class="muted">(${linkWord(r.w)})</span> as ${roleName(r.role).toLowerCase()}${cur ? ` <span class="muted">in place of ${esc(cname(cur))}${owedIfFired(cur) ? ', who is owed ' + fmtMoney(owedIfFired(cur)) : ''}</span>` : ''} · ${fmtMoney(coachAsk(g, r.role))}/yr<span class="spacer"></span><button class="sm primary" data-action="reqYes" data-i="${i}">Grant</button><button class="sm" data-action="reqNo" data-i="${i}">Keep the job</button></div>`; }).join('') + '</div>';
  html += `<div class="subtabs">${SEARCH_TABS.map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" data-action="searchTab" data-tab="${k}">${l}</button>`).join('')}</div>`;
  if (roles.length > 1) html += `<div class="subtabs" style="margin-top:-4px">${roles.map(r => `<button class="${r === role ? 'on' : ''}" data-action="searchRole" data-role="${r}">${ASST_LABEL[r].replace(' Coach', '').replace(' Coordinator', '')}${staffCoach(t, r) ? '' : ' <span class="bad">●</span>'}</button>`).join('')}</div>`;
  const cur = staffCoach(t, role);
  const pool = Object.values(state.coaches).filter(c => c.tid !== u && fitsJob(c, role, t)).sort((a, b) => repOf(b) - repOf(a));
  const light = ROLE_TIER[role] >= 3, ivN = ivLeftOf(role);
  html += `<div class="small" style="margin-bottom:4px"><b>${ivN}</b> interview${ivN === 1 ? '' : 's'} left for this job.</div><div class="small muted" style="margin-bottom:6px">${cur ? `${roleName(role)}: currently ${coachNameLink(cur)}${t.locks && t.locks[role] && C(t.locks[role]) && C(t.locks[role]).tid === u ? ' 🔒 promised' : ''}. Hiring someone else lets him go${owedIfFired(cur) ? ' (he is owed ' + fmtMoney(owedIfFired(cur)) + ')' : ''}.` : `The ${roleName(role).toLowerCase()} job is open.`}</div>` + table('search' + role, [
    { k: 'n', l: 'Name', v: c => c.last, f: c => coachNameLink(c) + (c.role !== role ? ` <span class="pill">promotion from ${ROLE_SHORT[c.role] || c.role}</span>` : c.tid >= 0 ? ' <span class="pill warn">under contract</span>' : '') + (c.tid >= 0 ? ` <span class="small muted">${T(c.tid).abbr}</span>` : '') },
    { k: 'st', l: 'Status', v: c => c.tid >= 0 ? 1 : c.college ? -1 : 0, f: c => c.tid >= 0 ? `<span class="small warn">Under contract</span>` : c.college ? `<span class="small muted">College</span>` : `<span class="small good">Free</span>`, title: 'Click to put coaches who are free to sign, or those under contract elsewhere, first' },
    { k: 'a', l: 'Age', v: c => c.age, num: 1 },
    { k: 'rep', l: 'Reputation', v: c => repOf(c), f: c => `<span class="small">${repLabel(c)}</span>` },
    { k: 's', l: light ? 'Keywords' : 'System', f: c => isAsst(c) ? kwPills(c) : `<span class="small">${esc(schemeLabel(c) || '—')}</span>` },
    { k: 'q', l: 'Your read', v: c => coachKnown(c) ? c.ovr : 0, f: c => !coachKnown(c) ? '<span class="muted small">Interview to learn more</span>' : isAsst(c) ? coachRatings(c).map(r => `<span class="small muted">${r.l.replace('Concept ', '').replace('Game ', '')}</span> ` + wordPill(asstWord(c, r.k))).join(' ') : tierChip(c.ovr) + ` <span class="small muted">${coachStrengths(c)}</span>` },
    { k: 'g', l: 'His people', f: c => { const g = guysOf(c, role, t); return g.length ? `<span class="small muted">${g.length} he would bring</span>` : '<span class="small muted">comes alone</span>'; } },
    { k: 't', l: 'Ties', f: c => `<span class="small muted wrapcell">${esc(tiesTo(c, t))}</span>` },
    { k: 'ask', l: 'Asking', v: c => coachAsk(c, role), f: c => `<span class="small">${fmtMoney(coachAsk(c, role))}</span>`, num: 1 },
    { k: 'x', l: '', f: c => car.blocked && car.blocked[c.id] ? '<span class="small muted">Staying put</span>' : coachKnown(c) ? `<button class="sm primary" data-action="negOpen" data-cid="${c.id}" data-role="${role}">Negotiate</button>` : `<span class="row" style="gap:4px;flex-wrap:nowrap"><button class="sm" data-action="interview" data-cid="${c.id}" data-role="${role}" ${ivN <= 0 ? 'disabled title="No interviews left for this job"' : ''}>Interview</button><button class="sm" data-action="negOpen" data-cid="${c.id}" data-role="${role}" title="Make an offer on his reputation alone, without sitting down with him first">Offer</button></span>` },
  ], pool, { sort: 'rep', limit: 400 }).replace('<div class="tbl-wrap"', '<div class="tbl-wrap longlist"') + '</div>';
  return html;
}
// other clubs asking for your coaches: answer before you advance
function raidsHTML(t) {
  const car = state.car; if (!car || !car.raids || !car.raids.length) return '';
  return '<div class="callout"><b>Other clubs want your people.</b> Anyone you have not answered leaves when you advance.' + car.raids.map((r, i) => { const c = C(r.cid), club = T(r.tid), by = r.by ? C(r.by) : null, raise = Math.max(0, r.sal - (c.sal || 0)), over = raise > staffRoom(t.id) + 0.001;
    return `<div class="row small" style="margin:8px 0"><div>${coachNameLink(c)} <span class="muted">(your ${roleName(c.role).toLowerCase()})</span> has an offer from <b>${club.abbr}</b> to be their ${roleName(r.role).toLowerCase()}: ${fmtMoney(r.sal)} × ${r.yrs} yr${by && r.tie >= 0.4 ? ` <span class="muted">· ${esc(cname(by))} asked for him (${linkWord(r.tie)})</span>` : ''}.<br><span class="muted">${r.promo ? 'It is a step up for him. You can pay him the same to stay, but a promotion is hard to talk a man out of.' : r.tie >= 0.6 ? 'Same job, with a man he is close to. Matching the money may not be enough.' : 'Same job, more money. Match it and he will most likely stay.'}</span></div><span class="spacer"></span><button class="sm primary" data-action="raidKeep" data-i="${i}" ${over ? 'disabled title="Over your staff budget"' : ''}>${r.promo ? 'Counter' : 'Match'} (+${fmtMoney(raise)})</button><button class="sm" data-action="raidGo" data-i="${i}">Let him go</button></div>`; }).join('') + '</div>';
}
// the negotiating table
function negModal() {
  const n = ui.neg, c = C(n.cid), t = T(state.userTid), d = demandsOf(c, n.role), j = judgeOffer(c, n), [il, ic] = interestLabel(j);
  const cur = staffCoach(t, n.role), side = callSide(c, n.role), held = side ? callHeldBy(t, side) : null;
  const chk = (on, act, extra, label, dis) => `<label class="row small" style="margin:5px 0;gap:8px"><input type="checkbox" data-change="${act}" ${extra || ''} ${on ? 'checked' : ''} ${dis ? 'disabled' : ''}> <span>${label}</span></label>`;
  let h = `<div class="row"><h2 style="margin:0">${esc(cname(c))}</h2><span class="pill">${roleName(n.role)}</span>${coachKnown(c) ? `<span class="pill ${ic}">${il}</span>` : '<span class="pill warn">Not interviewed</span>'}<span class="spacer"></span><button class="sm" data-action="coach" data-cid="${c.id}">His card</button></div>
    <div class="muted small" style="margin:4px 0 10px">${repLabel(c)} · age ${c.age}${schemeLabel(c) ? ' · ' + esc(schemeLabel(c)) : ''}${c.role !== n.role ? ' · this would be a promotion' : ''}${cur ? ` · replaces ${esc(cname(cur))}${owedIfFired(cur) ? ' (owed ' + fmtMoney(owedIfFired(cur)) + ')' : ''}` : ''}</div>`;
  if (!coachKnown(c)) h += '<div class="callout small"><b>You have not sat down with him.</b> You are offering on his reputation alone: you do not know what he is really good at, and he will not tell you how he feels about the offer until you make it.</div>';
  h += '<div class="grid card-cols"><div>';
  h += '<div class="section-title" style="margin-top:0">Play-calling</div>';
  if (d.call === 'none') h += '<div class="small muted">He has no wish to call plays.</div>';
  else h += chk(n.call, 'negCall', '', `He ${d.call === 'hard' ? '<b>insists on</b>' : 'would like'} calling the ${side === 'O' ? 'offense' : 'defense'}${held && held !== c ? ` <span class="bad">(already promised to ${esc(cname(held))})</span>` : ''}`, held && held !== c);
  h += `<div class="section-title">His people <span class="small muted">· ${d.slots.length ? 'each slot you promise is a job you no longer fill' : ''}</span></div>`;
  if (!d.slots.length) h += '<div class="small muted">He comes alone: every job under him stays yours to fill.</div>';
  else {
    h += d.slots.map(g => { const x = C(g.cid), occ = staffCoach(t, g.role), lock = t.locks && t.locks[g.role] && C(t.locks[g.role]) && C(t.locks[g.role]).tid === t.id;
      return chk(n.slots[g.role] === g.cid, 'negSlot', `data-role="${g.role}" data-g="${g.cid}"`, `<b>${roleName(g.role)}</b>: ${coachNameLink(x)} <span class="muted">(${linkWord(g.w)}${g.firm ? ', <b>he insists</b>' : ''}) · ${fmtMoney(coachAsk(x, g.role))}/yr${occ ? ` · replaces ${esc(cname(occ))}${owedIfFired(occ) ? ', owed ' + fmtMoney(owedIfFired(occ)) : ''}` : ''}${lock ? ' · <span class="bad">already promised to someone else</span>' : ''}</span>`, lock); }).join('');
    h += `<div class="row" style="margin-top:6px"><button class="sm" data-action="negAll" data-v="1">Give him all of them</button><button class="sm" data-action="negAll" data-v="0">None</button></div>`;
  }
  h += '<div class="section-title">Roster</div>';
  if (d.resign && P(d.resign)) h += chk(n.resign, 'negResign', '', `He wants ${playerLink(P(d.resign))} re-signed <span class="muted">(a market-value offer of ${fmtMoney(P(d.resign).ask)}/yr keeps your word; it is made for you if you forget)</span>`);
  else h += '<div class="small muted">No requests about your players.</div>';
  h += '</div><div>';
  h += `<div class="section-title" style="margin-top:0">Contract <span class="small muted">· he is asking ${fmtMoney(d.sal)} × ${d.yrs} yr, ${d.gtd} guaranteed</span></div>
    <div class="row small" style="gap:10px 14px"><label>Salary $M <input type="number" step="0.05" min="0.1" style="width:86px" data-change="negSal" value="${n.sal}"></label>
    <label>Years <select data-change="negYrs">${[1, 2, 3, 4, 5, 6].map(y => `<option ${y === n.yrs ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
    <label>Guaranteed <select data-change="negGtd">${[0, 1, 2, 3, 4, 5, 6].filter(y => y <= n.yrs).map(y => `<option ${y === n.gtd ? 'selected' : ''}>${y}</option>`).join('')}</select></label></div>
    <div class="small muted" style="margin-top:6px">Guaranteed years stay on your staff budget if you let him go early.</div>`;
  const slotCost = Object.entries(n.slots).reduce((s, [r, id]) => { const occ = staffCoach(t, r); return s + coachAsk(C(id), r) - (occ ? occ.sal || 0 : 0) + (occ ? owedIfFired(occ) : 0); }, 0);
  const cost = n.sal - (cur ? cur.sal || 0 : 0) + (cur ? owedIfFired(cur) : 0) + slotCost, room = staffRoom(t.id);
  h += `<div class="section-title">Where it stands</div><div class="small">This deal adds <b>${fmtMoney(cost)}</b> to this year's staff budget (${fmtMoney(room)} available)${cost > room + 0.001 ? ' <b class="bad">· over budget</b>' : ''}.</div>`;
  if (isLateral(c, n.role) && !j.hard) h += `<div class="small warn" style="margin-top:8px">${clubMatchWord(clubMatchChance(c, n.sal))}. A bigger offer makes that less likely; if they match, he stays and you cannot go back to him this year.</div>`;
  h += j.hard ? `<div class="callout small bad" style="margin-top:8px">${esc(j.hard)}.</div>` : `<div class="small" style="margin-top:8px">${j.notes.length ? j.notes.map(([s, x]) => `<div class="${s === '+' ? 'good' : 'bad'}">${s === '+' ? '＋' : '－'} ${esc(x)}</div>`).join('') : '<span class="muted">Nothing is bothering him.</span>'}</div>`;
  h += `<div class="row" style="margin-top:14px"><button class="primary" data-action="negOffer" ${cost > room + 0.001 ? 'disabled' : ''}>Make the offer</button><button data-action="closeModal">Walk away</button></div>`;
  h += '</div></div>';
  openModal(h, !!ui.negOpen); ui.negOpen = true;
}
const STAFF_POS_ROW = ['QB', 'WR', 'TE', 'RB', 'OL', 'DL', 'LB', 'DB']; // grouped by the specialist each room answers to
const STAFF_ORDER = ['HC', 'OC', 'PGC', 'RGC', 'DC', 'DPC', 'DRC', 'STC', 'SC', 'QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB'];
const LEAN_WORD = { deep: 'Deep shots', pa: 'Play-action', quick: 'Quick game', boot: 'Bootlegs', screen: 'Screens', zone: 'Zone runs', qbRun: 'QB runs', rpo: 'RPOs', blitz: 'Blitzes', sim: 'Simulated pressure', man: 'Man coverage', high: 'Two-high shells', stunt: 'Stunts', base: 'Base personnel' };
const SPEC_SHORT = { PGC: 'Pass game', RGC: 'Run game', DPC: 'Pass defense', DRC: 'Run defense' };
function instWord(v) { return v >= 0.95 ? 'Full' : v >= 0.85 ? 'Strong' : v >= 0.6 ? 'Learning' : 'Thin'; }
function roleName(role) { return COACH_ROLES.includes(role) ? ROLE_LABEL[role] : ASST_LABEL[role]; }
function roleCode(role) { return COACH_ROLES.includes(role) ? ROLE_SHORT[role] : role; }
function monogram(c, cls) { return `<span class="mono ${cls || ''}">${c ? esc((c.first[0] || '') + (c.last[0] || '')) : '—'}</span>`; }
function staffSeason(c) { const n = (c.yrs || 0) + 1; return `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'} season`; }
function staffBoss(t, role) { return role === 'HC' ? null : ROLE_TIER[role] === 2 ? 'HC' : ROLE_TIER[role] === 3 ? (ASST_SIDE[role] === 'O' ? 'OC' : 'DC') : SPEC_OVER[role]; }
// one card in the hierarchy: kind is 'hc', 'co' (coordinator) or 'sp' (specialist)
function orgCard(t, role, c, canHire, kind, sel) {
  const top = COACH_ROLES.includes(role), on = c && sel && sel.id === c.id;
  const calls = c && offCaller(t) === c ? 'Calls the offense' : c && defCaller(t) === c ? 'Calls the defense' : '';
  if (!c) return `<div class="oc ${kind === 'pc' ? 'sp pc' : kind} vacant"><div class="oc-body"><div class="oc-role">${kind === 'sp' ? SPEC_SHORT[role] : kind === 'pc' ? ASST_LABEL[role].replace(' Coach', '') : roleName(role)}</div><div class="oc-name bad">Vacant</div>
    ${canHire ? `<button class="sm primary" data-action="searchRole" data-role="${role}" style="margin-top:6px">Find someone</button>` : '<div class="oc-sub">The job is open</div>'}</div><span class="oc-code">${roleCode(role)}</span></div>`;
  if (kind === 'sp') { ensureDefPk(c); ensureOffPk(c); return `<button class="oc sp ${on ? 'sel' : ''}" data-action="coachSel" data-cid="${c.id}"><div class="oc-body"><div class="oc-role"><span class="oc-code static">${role}</span> ${SPEC_SHORT[role]}</div><div class="oc-name">${esc(cname(c))}</div><div class="oc-sub">${wordPill(asstWord(c, 'cre'))}<span>${esc(leanLabel(c))}</span></div></div></button>`; }
  if (kind === 'pc') return `<button class="oc sp pc ${on ? 'sel' : ''}" data-action="coachSel" data-cid="${c.id}"><div class="oc-body"><div class="oc-role"><span class="oc-code static">${role}</span> ${ASST_LABEL[role].replace(' Coach', '')}</div><div class="oc-name">${esc(cname(c))}</div><div class="pc-r" title="Technique: how fast his room improves"><span>Tech.</span>${wordPill(asstWord(c, 'dev'))}</div><div class="pc-r" title="Cohesion: how far his room can get on the same page"><span>Coh.</span>${wordPill(asstWord(c, 'coh'))}</div></div></button>`;
  let sub;
  if (top) sub = `${tierChip(c.ovr)}<span>${staffSeason(c)}</span>`;
  else { ensureDefPk(c); ensureOffPk(c); sub = `${wordPill(asstWord(c, 'cre'))}<span>${esc(leanLabel(c))}</span>`; }
  const line2 = top ? (schemeLabel(c) ? esc(schemeLabel(c)) : coachStrengths(c)) : '';
  return `<button class="oc ${kind} ${on ? 'sel' : ''}" data-action="coachSel" data-cid="${c.id}">${monogram(c)}
    <div class="oc-body"><div class="oc-name">${esc(cname(c))}</div><div class="oc-role">${roleName(role)}</div>
    <div class="oc-sub">${sub}</div>${line2 ? `<div class="oc-line">${line2}</div>` : ''}${calls ? `<div class="oc-flag">${calls}</div>` : ''}</div><span class="oc-code">${roleCode(role)}</span></button>`;
}
function tendWord(v) { return v >= 0.6 ? 'Heavy' : v >= 0.42 ? 'Often' : v >= 0.25 ? 'Some' : v >= 0.1 ? 'Light' : 'Rare'; }
function railBar(label, v, hint) { v = clamp(v || 0, 0, 1); return `<div class="rb" title="${esc(hint || '')}"><span class="rb-l">${label}</span><span class="rb-t"><i style="width:${Math.round(v * 100)}%"></i></span><span class="rb-v">${tendWord(v)}</span></div>`; }
function staffRailHTML(t, mine) {
  const ot = offTend(t), dt = defTend(t), oc = offCaller(t), dc = defCaller(t);
  const yrs = side => { const s = t.sys && t.sys[side]; return !s ? '—' : s.yrs <= 0 ? 'New this year' : `Year ${s.yrs + 1}`; };
  const inst = side => { const ps = rosterOf(t.id).filter(p => PRAC_SIDE[p.pos] === side); return ps.length ? ps.reduce((a, p) => a + pbOf(p), 0) / ps.length / 100 : 1; };
  let h = `<div class="card rail"><h3>Playbook &amp; system</h3>
    <div class="rail-h">Offense</div>
    <div class="kv2"><span>System</span><b>${esc(teamSchemeLabel(t, 'O') || '—')}</b><span>Play caller</span><b>${oc ? esc(cname(oc)) : '—'}</b><span>In the system</span><b>${yrs('O')}</b></div>
    ${railBar('Pass rate', ot.pass, 'On neutral downs')}${railBar('Play-action', ot.pa)}${railBar('Deep shots', ot.deep)}${railBar('Quick game', ot.quick)}${railBar('Motion', ot.motion)}${railBar('RPO', ot.rpo)}${railBar('Screens', ot.screen)}${railBar('Zone runs', ot.zone, 'Zone against gap and power runs')}
    <div class="rail-h" style="margin-top:14px">Defense</div>
    <div class="kv2"><span>System</span><b>${esc(teamSchemeLabel(t, 'D') || '—')}</b><span>Play caller</span><b>${dc ? esc(cname(dc)) : '—'}</b><span>Front</span><b>${esc(dt.front || '—')}</b><span>In the system</span><b>${yrs('D')}</b></div>
    ${railBar('Man coverage', dt.man)}${railBar('Two-high shells', dt.high)}${railBar('Blitz', dt.blitz)}${railBar('Sim pressure', dt.sim)}${railBar('Stunts', dt.stunt)}${railBar('Base personnel', dt.base, 'Against nickel and dime')}
    <div class="rail-h" style="margin-top:14px">Installed</div>
    <div class="rb"><span class="rb-l">Offense</span><span class="rb-t"><i style="width:${Math.round(inst('O') * 100)}%"></i></span><span class="rb-v">${instWord(inst('O'))}</span></div>
    <div class="rb"><span class="rb-l">Defense</span><span class="rb-t"><i style="width:${Math.round(inst('D') * 100)}%"></i></span><span class="rb-v">${instWord(inst('D'))}</span></div>
    <button class="sm wide" data-action="nav" data-view="playbook" style="margin-top:12px">Open the playbook →</button></div>`;
  if (mine && t.staffBud) {
    const pay = staffPayroll(t.id), room = staffRoom(t.id);
    h += `<div class="card rail" style="margin-top:12px"><h3>Staff budget</h3><div class="rb"><span class="rb-l">Committed</span><span class="rb-t"><i style="width:${clamp(Math.round(100 * pay / t.staffBud), 0, 100)}%${room < 0 ? ';background:var(--bad)' : ''}"></i></span><span class="rb-v">${fmtMoney(pay)}</span></div>
      <div class="kv2" style="margin-top:6px"><span>Budget</span><b>${fmtMoney(t.staffBud)}</b><span>Free</span><b class="${room < 0 ? 'bad' : 'good'}">${fmtMoney(room)}</b>${t.staffDead ? `<span>Owed to coaches let go</span><b>${fmtMoney(t.staffDead)}</b>` : ''}</div></div>`;
  }
  return h;
}
// the strip under the tree: everything about the coach you clicked, without leaving the page
function staffSelHTML(t, c, role, mine, canHire) {
  const top = COACH_ROLES.includes(role), spec = SPEC_ROLES.includes(role), bossRole = staffBoss(t, role), boss = bossRole ? staffCoach(t, bossRole) : null;
  const sec = (l, body) => `<div class="ss-l">${l}</div><div class="ss-b">${body}</div>`;
  // identity
  let a = `<div class="ss-id">${monogram(c, 'lg')}<div><div class="row" style="gap:6px"><span class="oc-code static">${roleCode(role)}</span><span class="ss-tag">Selected coach</span></div>
    <div class="ss-name">${esc(cname(c))}</div><div class="muted">${roleName(role)}</div>
    <div class="small muted" style="margin-top:4px">Age ${c.age} · ${staffSeason(c)} here${bossRole ? `<br>Under ${boss ? esc(cname(boss)) : 'a vacant job'} (${roleCode(bossRole)})` : ''}</div>
    ${role === 'HC' && c.rec ? `<div class="small muted">Career ${c.rec.w}-${c.rec.l}${c.rec.titles ? ` · ${c.rec.titles} title${c.rec.titles > 1 ? 's' : ''}` : ''}</div>` : ''}</div></div>`;
  // what he does
  let b = '';
  if (top) {
    b += sec('Overall', `${tierChip(c.ovr)} <span class="small muted">${esc(repLabel(c))}</span>`);
    if (schemeLabel(c)) b += sec('System', esc(schemeLabel(c)));
    b += `<div class="ss-l">Ratings</div>` + ratingBarsHTML(c);
    if (role === 'HC') b += `<div class="small muted" style="margin-top:6px">${tendencySummary(c)}</div>`;
  } else if (spec) {
    const L = LEANS[role][c.lean];
    b += `<div class="ss-l">Ratings</div>` + ratingBarsHTML(c);
    b += sec('Leans', esc(L ? L[0] : '—') + ` <span class="small muted">· ${esc(bgLabel(c))} background · ${esc(c.style)}</span>`);
    if (c.pks && c.pks.length) b += sec('Brings', c.pks.map(id => `<span class="pill on">${PK_NAME[id]}</span>`).join(' '));
    if (L) b += `<div class="ss-l">Effect on the call sheet</div>` + Object.entries(L[1]).map(([k, v]) => `<div class="ss-row"><span>${LEAN_WORD[k] || k}</span><span class="${v > 0 ? 'good' : 'bad'}">${v > 0 ? (v >= 1.5 ? 'Much more' : 'More') : (v <= -1.5 ? 'Much less' : 'Less')} ${v > 0 ? '▲' : '▼'}</span></div>`).join('');
  } else {
    b += `<div class="ss-l">Ratings</div>` + ratingBarsHTML(c);
    b += sec('Keywords', kwPills(c));
    b += `<div class="small muted" style="margin-top:6px">Cohesion is the ceiling on his room's chemistry. Technique is how fast his players improve. If he moves up, his keywords become his system.</div>`;
  }
  // where he has been and where he can go
  const ladder = top ? (role === 'HC' ? ['HC'] : role === 'OC' || role === 'DC' ? [role, 'HC'] : [role]) : spec ? [role, ASST_SIDE[role] === 'O' ? 'OC' : 'DC'] : [role, SPEC_OVER[role], ASST_SIDE[role] === 'O' ? 'OC' : 'DC'];
  let p = `<div class="ss-l">Career path</div><div class="ladder">${ladder.map((r, i) => `<div class="lad ${i === 0 ? 'cur' : ''}"><span class="oc-code static">${roleCode(r)}</span><span>${roleName(r)}</span>${i === 0 ? '<span class="ss-tag">Current</span>' : ''}</div>`).join('<div class="lad-a">↓</div>')}</div>`;
  const hist = (c.hist || []).slice(-3).reverse();
  if (hist.length) p += `<div class="ss-l" style="margin-top:10px">Recent seasons</div>` + hist.map(x => `<div class="ss-row"><span>${x.s} · ${T(x.tid).abbr} ${ROLE_SHORT[x.role] || x.role}</span><span>${x.w}-${x.l}${x.role === 'OC' && x.off ? ` · #${x.off} off` : x.role === 'DC' && x.def ? ` · #${x.def} def` : ''}</span></div>`).join('');
  else p += `<div class="small muted" style="margin-top:8px">${top ? '' : asstTrack(c)}</div>`;
  const mentors = (c.mentors || []).map(id => C(id)).filter(Boolean);
  if (mentors.length) p += `<div class="small muted" style="margin-top:6px">Worked under ${mentors.slice(0, 3).map(m => esc(m.last)).join(', ')}</div>`;
  // money and moves
  let m = `<div class="ss-l">Contract</div><div class="ss-big">${c.sal !== undefined ? `${fmtMoney(c.sal)} <span class="muted">/ ${c.cyrs} yr${c.cyrs === 1 ? '' : 's'}</span>` : '—'}</div>`;
  if (c.sal !== undefined) m += `<div class="small muted">${c.cgtd ? `${c.cgtd} guaranteed${mine ? ` · owed ${fmtMoney(owedIfFired(c))} if let go` : ''}` : 'Nothing guaranteed'}</div>`;
  const prom = promiseChips(t, role, c);
  if (prom) m += `<div class="ss-l" style="margin-top:8px">Promised</div><div>${prom}</div>`;
  if (!top && mine) { const pos = spec ? null : POS_ROLES.includes(role) ? role : null; if (pos) { const rooms = pos === 'DB' ? ['CB', 'S'] : [pos]; const rs = rooms.map(r => pracRoomInfo(t.id, r)).filter(r => r.avg !== null); if (rs.length) m += `<div class="ss-l" style="margin-top:8px">His room this week</div><div>${rs.map(r => `<span class="small muted">${rooms.length > 1 ? ROOM_NAME[r.pos] + ' ' : ''}</span>${pracRating(r.avg)}`).join(' ')}</div>`; } }
  let act = `<button class="sm" data-action="coach" data-cid="${c.id}">View full card</button>`;
  if (canHire) {
    const lock = t.locks && t.locks[role] && C(t.locks[role]) && C(t.locks[role]).tid === t.id ? C(t.locks[role]) : null;
    if (lock) act += `<span class="small muted" title="You promised this job to ${esc(cname(lock))} for his man">🔒 ${esc(lock.last)}'s man</span>`;
    else {
      const toHead = ['OC', 'DC', 'STC'].includes(role) && !C(t.hc);
      const up = top ? false : spec ? !C(t[ASST_SIDE[role] === 'O' ? 'oc' : 'dc']) : !asst(t, SPEC_OVER[role]);
      if (toHead) act += `<button class="sm primary" data-action="asstPromote" data-cid="${c.id}" title="Your head coaching job is open: give it to him">Promote to head coach</button>`;
      if (up) act += `<button class="sm primary" data-action="asstPromote" data-cid="${c.id}" title="Move him up into the open job above him">Promote</button>`;
      act += `<button class="sm danger" data-action="fireCoach" data-role="${role}">Let go</button>`;
    }
  }
  m += `<div class="ss-act">${act}</div>`;
  return `<div class="card ss"><div class="ss-c">${a}</div><div class="ss-c">${b}</div><div class="ss-c">${p}</div><div class="ss-c">${m}</div></div>`;
}
function staffList(t) { return STAFF_ORDER.map(r => staffCoach(t, r)).filter(Boolean); }
// ---- the coaching carousel, after it stops ----
function carWrapHTML() {
  const w = state.carWrap, u = state.userTid;
  if (!w || !w.moves.length) return `<div class="pagehead"><div><h1>Coaching moves</h1><div class="sub">Nothing changed around the league this offseason.</div></div></div>`;
  const who = (id, name) => id !== undefined && C(id) ? coachNameLink(C(id)) : name ? esc(name) : '<span class="muted">nobody</span>';
  const line = m => `<tr class="${m.tid === u ? 'mine' : ''}"><td>${teamLink(m.tid)}</td><td class="muted small">${esc(roleName(m.role))}</td>
    <td>${m.inName ? `<b>${who(m.inId, m.inName)}</b> <span class="small muted">${esc(m.from)}${m.scheme ? ' · ' + esc(m.scheme) : ''}</span>` : '<span class="muted">vacant</span>'}</td>
    <td>${m.outName ? `${who(m.outId, m.outName)} <span class="small muted">${esc(m.to)}</span>` : '<span class="muted small">new job</span>'}</td></tr>`;
  const sec = (title, list) => list.length ? `<div class="card" style="margin-bottom:14px"><h3>${title} <span class="muted small" style="font-weight:400">${list.length}</span></h3><table class="tbl cw-tbl"><thead><tr><th>Club</th><th>Job</th><th>In</th><th>Out</th></tr></thead><tbody>${list.sort((a, b) => (b.tid === u) - (a.tid === u) || a.tid - b.tid).map(line).join('')}</tbody></table></div>` : '';
  const hc = w.moves.filter(m => m.role === 'HC'), co = w.moves.filter(m => ['OC', 'DC', 'STC', 'SC'].includes(m.role)), sp = w.moves.filter(m => SPEC_ROLES.includes(m.role)), pos = w.moves.filter(m => POS_ROLES.includes(m.role));
  const clubs = new Set(w.moves.map(m => m.tid)).size, promo = w.moves.filter(m => m.from.startsWith('promoted')).length, college = w.moves.filter(m => m.from.includes('college')).length;
  return `<div class="pagehead"><div><h1>Coaching moves</h1><div class="sub">The ${w.season + 1} carousel has stopped. ${w.moves.length} jobs changed hands at ${clubs} clubs: ${hc.length} head coach${hc.length === 1 ? '' : 'es'}, ${co.length} coordinators, ${promo} promoted from within, ${college} up from the college ranks.</div></div>
    <span class="spacer"></span><button data-action="nav" data-view="coaches">Your staff</button></div>
    ${sec('Head coaches', hc)}${sec('Coordinators', co)}${sec('Pass and run game coordinators', sp)}
    ${pos.length ? `<details class="card" style="margin-bottom:14px"${pos.some(m => m.tid === u) ? ' open' : ''}><summary><b>Position coaches</b> <span class="muted small">${pos.length}</span></summary><table class="tbl cw-tbl" style="margin-top:8px"><thead><tr><th>Club</th><th>Job</th><th>In</th><th>Out</th></tr></thead><tbody>${pos.sort((a, b) => (b.tid === u) - (a.tid === u) || a.tid - b.tid).map(line).join('')}</tbody></table></details>` : ''}`;
}
function coachesHTML() {
  const tid = ui.staffTid == null ? state.userTid : ui.staffTid, t = T(tid), mine = tid === state.userTid, canHire = state.phase === 'COACHES' && mine;
  const opts = state.teams.map(x => `<option value="${x.id}" ${x.id === tid ? 'selected' : ''}>${x.region} ${x.name}</option>`).join('');
  const list = staffList(t), sel = list.find(c => c.id === ui.staffSel) || list[0] || null, selRole = sel ? STAFF_ORDER.find(r => staffCoach(t, r) === sel) : null;
  const has = !!t.asst, card = (role, kind) => orgCard(t, role, staffCoach(t, role), canHire, kind, sel);
  let html = `<div class="pagehead"><div><h1>Coaching staff</h1><div class="sub">${state.phase === 'COACHES' ? (mine ? 'The coaching search is open: let a coach go to open his job, then interview and negotiate below.' : 'The coaching search is open.') : 'Hierarchy, responsibilities and what each man brings. Changes happen in the coaching search, right after the season.'}</div></div>
    <span class="spacer"></span>${state.carWrap ? `<button class="sm" data-action="nav" data-view="carwrap">League coaching moves</button>` : ''}<select data-change="staffTeam">${opts}</select></div>`;
  const branch = (coordRole, specs) => `<div class="br">${card(coordRole, 'co')}${has ? `<div class="fork">${specs.map(r => `<div class="leaf">${card(r, 'sp')}</div>`).join('')}</div>` : ''}</div>`;
  const tree = `<div class="card tree"><h3>Staff hierarchy</h3>
    <div class="tree-top">${card('HC', 'hc')}</div>
    <div class="tree-row"><div class="tbr">${branch('OC', ['PGC', 'RGC'])}</div><div class="tbr">${branch('DC', ['DPC', 'DRC'])}</div>
      <div class="tbr"><div class="br stack">${card('STC', 'co')}${card('SC', 'co')}</div></div></div>
    ${has ? `<div class="tree-pos"><i class="stem o"></i><i class="stem d"></i>${STAFF_POS_ROW.map(r => `<div class="leaf">${card(r, 'pc')}</div>`).join('')}</div>` : ''}
    <div class="tree-foot">Click anyone to bring up his file below. ← → moves through the staff.</div></div>`;
  let main = tree;
  if (sel && mine) main += briefHTML(t, selRole); // during camp his word comes first, right under the chart
  if (sel) main += staffSelHTML(t, sel, selRole, mine, canHire);
  html += `<div class="staff-wrap"><div class="staff-main">${main}</div><div class="staff-rail">${staffRailHTML(t, mine)}</div></div>`;
  if (state.phase === 'COACHES' && mine && state.car) html += searchHTML2(t);
  const sides = [['O', 'offense'], ['D', 'defense']].map(([side, name]) => { const infl = tendInfluences(t, side); return `<div><div class="ss-l">Who shapes the ${name}</div>${infl.length ? '<ul class="tight">' + infl.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>' : '<div class="small muted">Nobody below the play caller is bending the call sheet.</div>'}</div>`; }).join('');
  html += `<details class="fold card" ${foldAttr('shape')} style="margin-top:12px"><summary>How the call sheets are shaped</summary><div class="grid g2 small" style="margin-top:10px">${sides}</div></details>`;
  const rows = ALL_ROLES.map(role => ({ role, c: staffCoach(t, role) })).filter(r => r.c);
  html += `<details class="fold card" ${foldAttr('staffpay')} style="margin-top:12px"><summary>Contracts, track records and promises</summary><div style="margin-top:10px">` + table('staffpay', [
    { k: 'r', l: 'Role', v: r => ALL_ROLES.indexOf(r.role), f: r => `<span class="oc-code static">${roleCode(r.role)}</span>` },
    { k: 'n', l: 'Coach', v: r => r.c.last, f: r => coachNameLink(r.c) },
    { k: 'a', l: 'Age', v: r => r.c.age, num: 1 },
    { k: 'b', l: 'Best at / leans', f: r => `<span class="small muted">${COACH_ROLES.includes(r.role) ? coachStrengths(r.c) : esc([bgLabel(r.c), leanLabel(r.c), r.c.style].filter(Boolean).join(' · '))}</span>` },
    { k: 'l', l: 'Track record', f: r => `<span class="small">${COACH_ROLES.includes(r.role) ? (lastUnitLine(r.c) || '—') : asstTrack(r.c)}</span>` },
    { k: 's', l: 'Salary', v: r => r.c.sal || 0, f: r => r.c.sal !== undefined ? fmtMoney(r.c.sal) : '—', num: 1 },
    { k: 'y', l: 'Yrs', v: r => r.c.cyrs || 0, f: r => r.c.cyrs || '—', num: 1 },
    { k: 'g', l: 'Gtd', v: r => r.c.cgtd || 0, f: r => r.c.cgtd || '—', num: 1, title: 'Guaranteed years: what he is owed if you let him go' },
    { k: 'pr', l: 'Promised', f: r => promiseChips(t, r.role, r.c) },
  ], rows, { sort: 'r', dir: 1 }) + '</div></details>';
  const all = state.teams.map(tm => ({ tm, s: COACH_ROLES.map(r => C(tm[r.toLowerCase()])) }));
  const cell = c => c ? `${coachNameLink(c)} ${tierChip(c.ovr)}` : '<span class="bad">Vacant</span>';
  html += `<details class="fold card" ${foldAttr('allstaff')} style="margin-top:12px"><summary>League staffs</summary><div style="margin-top:10px">` + table('allcoach', [
    { k: 't', l: 'Team', v: r => r.tm.abbr, f: r => teamLink(r.tm.id) },
    ...COACH_ROLES.map((role, i) => ({ k: role, l: ROLE_SHORT[role], v: r => r.s[i] ? r.s[i].ovr : 0, f: r => cell(r.s[i]) })),
  ], all, { rowClass: r => r.tm.id === state.userTid ? 'me' : '' }) + '</div></details>';
  return html;
}
function coachModal(cid) {
  const c = C(cid);
  if (!c) return;
  if (isAsst(c)) return asstModal(c);
  const t = c.tid >= 0 ? T(c.tid) : null;
  const callsFor = (c.role === 'OC' || c.role === 'DC') && t && C(t.hc) && C(t.hc).t.caller === (c.role === 'OC' ? 'O' : 'D');
  let html = `<div class="row"><h2 style="margin:0">${esc(cname(c))}</h2><span class="pill">${ROLE_LABEL[c.role]}</span> ${tierChip(c.ovr)}</div>
    <div class="muted" style="margin:4px 0 12px">${c.tid >= 0 ? teamLink(c.tid, true) : 'Available'} · Age ${c.age}${schemeLabel(c) ? ' · ' + esc(schemeLabel(c)) : ''}${c.role === 'HC' ? ` · Career ${c.rec.w}-${c.rec.l}${c.rec.titles ? `, ${c.rec.titles} title${c.rec.titles > 1 ? 's' : ''}` : ''}` : ''}</div>`;
  if (callsFor) html += `<div class="callout small">The head coach calls the ${c.role === 'OC' ? 'offense' : 'defense'}: this coordinator contributes design and development.</div>`;
  let left = `<div class="section-title" style="margin-top:0">Ratings</div>${ratingBarsHTML(c)}<p class="small muted" style="margin-top:8px">${coachRoleBlurb(c)}</p>`;
  const tend = tendencySummary(c);
  if (tend) left += `<div class="section-title">Tendencies</div><div class="small">${tend}</div>`;
  const lu = lastUnitLine(c);
  if (lu) left += `<div class="small muted" style="margin-top:6px">${lu}</div>`;
  let right = '';
  if (c.tid >= 0 && (c.role === 'OC' || c.role === 'DC')) { const side = c.role === 'OC' ? 'O' : 'D', pl = installPlan(c.tid, side), ins = installedPct(c.tid, side);
    right += `<div class="section-title" style="margin-top:0">His system here</div>${railBar('Installed', ins / 100, 'How much of the playbook the first team knows')}<div class="small muted">${pl.cap < 99 ? 'His players are not going to get all of it in: the unit tops out short of the full book.' : 'Nothing stops this unit learning all of it.'} ${sysSize(c.tid, side) >= (side === 'O' ? 0.95 : 0.5) ? 'It is a big system.' : sysSize(c.tid, side) <= (side === 'O' ? 0.65 : 0.22) ? 'It is a compact system.' : ''}</div>`; }
  if (c.tid >= 0 && c.role === 'HC') right += `<div class="section-title" style="margin-top:0">His practice</div>${railBar('Reps in a week', (repAllowance(c.tid) - 60) / 80, 'An ordinary week is 100')}<div class="small muted">${Math.round(repAllowance(c.tid))} reps where an ordinary practice has 100. The extra, or the shortfall, lands on the second and third team.</div>`;
  right += `<div class="section-title"${right ? '' : ' style="margin-top:0"'}>Player development</div>`;
  if (c.dev && c.dev.length) right += table('cdev', [
    { k: 's', l: 'Offseason', f: d => d.s }, { k: 't', l: 'Team', f: d => T(d.tid).abbr }, { k: 'n', l: 'Young players', f: d => d.n, num: 1 },
    { k: 'a', l: 'Avg change', f: d => `<span class="${d.avg >= 2.5 ? 'good' : d.avg < 1 ? 'bad' : ''}">${d.avg > 0 ? '+' : ''}${d.avg}</span>`, num: 1 },
    { k: 'j', l: 'Big jumps (+5)', f: d => d.jumps, num: 1 },
  ], c.dev.slice().reverse(), { nosort: 1 }) + `<div class="small muted">Players 26 and under on his side of the ball (whole roster for HC and S&amp;C).</div>`;
  else right += `<div class="small muted">Results appear after his first offseason on the job.</div>`;
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
// the record book: everyone who has retired from the league
function retiredHTML() {
  const rs = Object.values(state.retired || {});
  if (!rs.length) return '';
  const pk = r => tierOf({ age: 30, pos: r.pos }, r.pk, r.pos);
  return `<details class="fold card" ${foldAttr('retired')} style="margin-top:12px"><summary>Retired players (${rs.length})</summary><div style="margin-top:10px">` + table('retired', [
    { k: 'n', l: 'Player', v: r => r.n, f: r => `<b>${esc(r.n)}</b>` }, { k: 'pos', l: 'Pos', v: r => r.pos, f: r => esc(r.lbl || r.pos) },
    { k: 'yrs', l: 'Career', v: r => r.to, f: r => `${r.from}–${r.to}` }, { k: 'sn', l: 'Seasons', v: r => r.yrs, num: 1 },
    { k: 'tm', l: 'Teams', f: r => (r.tm || []).map(t => T(t).abbr).join(', ') },
    { k: 'dr', l: 'Drafted', v: r => r.dr ? -r.dr[2] : -999, f: r => r.dr ? `${r.dr[0]} R${r.dr[1]} #${r.dr[2]}` : '<span class="muted">Undrafted</span>' },
    { k: 'pk', l: 'At his best', v: r => r.pk, f: r => `<span class="pill ${TIER_CLS[pk(r)] || ''}">${pk(r)}</span>` },
    { k: 'gp', l: 'GP', v: r => r.tot.gp || 0, num: 1 }, { k: 'gs', l: 'GS', v: r => r.tot.gs || 0, num: 1 },
    { k: 'line', l: 'Career totals', f: r => `<span class="small">${statSummary(r.tot, r.pos)}</span>` },
    { k: 'aw', l: 'Awards', v: r => (r.aw || []).length, f: r => (r.aw || []).length ? `<span class="small" title="${esc(r.aw.join(' | '))}">🏅 ${r.aw.length}</span>` : '', num: 1 },
  ], rs, { sort: 'pk', limit: 250 }) + '</div></details>';
}
function historyHTML() {
  const tid = ui.histTid == null ? state.userTid : ui.histTid;
  let html = `<div class="grid g2"><div class="card"><h3>Champions & MVPs</h3>` + table('champs', [
    { k: 's', l: 'Season', f: h => h.season }, { k: 'c', l: 'Champion', f: h => teamLink(h.champ, true) }, { k: 'r', l: 'Runner-up', f: h => teamLink(h.runnerUp) },
    { k: 'm', l: 'MVP', f: h => h.awards.mvp ? `${esc(h.awards.mvp.name)} <span class="muted">(${T(h.awards.mvp.tid).abbr} ${h.awards.mvp.pos})</span>` : '' },
    { k: 'd', l: 'DPOY', f: h => h.awards.dpoy ? `${esc(h.awards.dpoy.name)} <span class="muted">(${T(h.awards.dpoy.tid).abbr})</span>` : '' },
    { k: 'v', l: '', f: h => `<button class="sm" data-action="seasonOpen" data-s="${h.season}">Review</button>` },
  ], state.history.slice().reverse(), { nosort: 1 }) + (state.history.length ? '' : '<div class="muted">Finish a season to start the history books.</div>') + '</div>';
  const opts = state.teams.map(t => `<option value="${t.id}" ${t.id === tid ? 'selected' : ''}>${t.region} ${t.name}</option>`).join('');
  const th = state.teamHist[tid] || [];
  const tot = th.reduce((a, s) => ({ w: a.w + s.w, l: a.l + s.l, t: a.t + s.t, ti: a.ti + (s.result === 'Won Championship' ? 1 : 0) }), { w: 0, l: 0, t: 0, ti: 0 });
  html += `<div class="card"><h3>Team History</h3><select data-change="histTeam" style="margin-bottom:10px">${opts}</select>
    <div class="muted small" style="margin-bottom:8px">All-time: ${tot.w}-${tot.l}${tot.t ? '-' + tot.t : ''} · ${tot.ti} championship${tot.ti === 1 ? '' : 's'}</div>` + table('th', [
    { k: 's', l: 'Season', f: s => s.season }, { k: 'r', l: 'Record', f: s => `${s.w}-${s.l}${s.t ? '-' + s.t : ''}` }, { k: 'pf', l: 'PF', f: s => s.pf, num: 1 }, { k: 'pa', l: 'PA', f: s => s.pa, num: 1 },
    { k: 'seed', l: 'Seed', f: s => s.seed || '', num: 1 }, { k: 'res', l: 'Result', f: s => `<span class="${s.result === 'Won Championship' ? 'good' : s.result === 'Missed playoffs' ? 'muted' : ''}">${s.result}</span>` },
  ], th.slice().reverse(), { nosort: 1 }) + '</div></div>';
  return html + retiredHTML();
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
// ---------- the game's own "are you sure?" ----------
// ask('plain question') or ask({ title, body (html), list, yes, no, danger }) -> Promise<boolean>. Nothing happens until one is picked.
let askResolve = null;
function ask(o) {
  if (typeof o === 'string') o = { body: esc(o).replace(/\n/g, '<br>') };
  let el = $('#ask');
  if (!el) { el = document.createElement('div'); el.id = 'ask'; el.className = 'ask hidden'; document.body.appendChild(el); }
  if (askResolve) askResolve(false);
  el.innerHTML = `<div class="ask-card" role="alertdialog" aria-modal="true"><div class="ask-title">${esc(o.title || 'Are you sure?')}</div>${o.body ? `<div class="ask-body">${o.body}</div>` : ''}${o.list && o.list.length ? `<ul class="ask-list">${o.list.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}<div class="ask-btns"><button data-action="askNo">${esc(o.no || 'Cancel')}</button><button class="${o.danger ? 'danger' : 'primary'}" data-action="askYes">${esc(o.yes || 'Continue')}</button></div></div>`;
  el.classList.remove('hidden');
  const b = el.querySelector('[data-action="askYes"]'); if (b) b.focus();
  return new Promise(res => { askResolve = res; });
}
function askDone(v) { const el = $('#ask'); if (el) el.classList.add('hidden'); const r = askResolve; askResolve = null; if (r) r(v); }
// popups stack: opening a player card from the game recap (or another card) keeps what was underneath, with a Back button
let modalStack = [];
function openModal(html, replace) {
  const m = $('#modal'), body = $('#modal-body');
  if (!m.classList.contains('hidden') && body.dataset.raw && !replace) modalStack.push({ html: body.dataset.raw, y: m.scrollTop });
  const keepY = replace && !m.classList.contains('hidden') ? m.scrollTop : 0, inner = replace ? [...m.querySelectorAll('.tbl-wrap, .scroll')].map(e => [e.scrollLeft, e.scrollTop]) : [];
  body.dataset.raw = html;
  body.innerHTML = (modalStack.length ? '<button class="sm" data-action="closeModal" style="margin-bottom:10px">← Back</button>' : '') + html;
  m.classList.remove('hidden'); m.scrollTop = keepY;
  if (replace) [...m.querySelectorAll('.tbl-wrap, .scroll')].forEach((e, i) => { if (inner[i]) { e.scrollLeft = inner[i][0]; e.scrollTop = inner[i][1]; } });
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
  QB: [['passC', 'Cmp'], ['passA', 'Att'], ['pct', 'Pct', s => s.passA ? round1(100 * s.passC / s.passA) : 0], ['passY', 'Yds'], ['passTD', 'TD'], ['passInt', 'Int'], ['rtg', 'Rtg', s => round1(passerRating(s.passC || 0, s.passA || 0, s.passY || 0, s.passTD || 0, s.passInt || 0))], ['ypa', 'Y/A', s => s.passA ? round1(s.passY / s.passA) : 0], ['sacked', 'Sck'], ['passLng', 'Lng'], ['rushA', 'Car'], ['rushY', 'RuYds'], ['rushTD', 'RuTD'], ['fum', 'Fum']],
  RB: [['snp', 'Snaps'], ['rushA', 'Car'], ['rushY', 'Yds'], ['ypc', 'Avg', s => s.rushA ? round1(s.rushY / s.rushA) : 0], ['rushTD', 'TD'], ['rushLng', 'Lng'], ['tgt', 'Tgt'], ['rec', 'Rec'], ['recY', 'RecYds'], ['recTD', 'RecTD'], ['fum', 'Fum']],
  WR: [['snp', 'Snaps'], ['tgt', 'Tgt'], ['rec', 'Rec'], ['cpct', 'Catch%', s => s.tgt ? round1(100 * s.rec / s.tgt) : 0], ['recY', 'Yds'], ['ypr', 'Avg', s => s.rec ? round1(s.recY / s.rec) : 0], ['recTD', 'TD'], ['recLng', 'Lng'], ['rushA', 'Car'], ['rushY', 'RuYds'], ['fum', 'Fum']],
  OL: [['snp', 'Snaps'], ['pen', 'Pen']],
  DEF: [['snp', 'Snaps'], ['pen', 'Pen'], ['tkl', 'Tkl'], ['tfl', 'TFL'], ['sck', 'Sck'], ['prs', 'Prs'], ['dint', 'Int'], ['pd', 'PD'], ['ff', 'FF'], ['fr', 'FR'], ['dtd', 'TD']],
  K: [['fgm', 'FGM'], ['fga', 'FGA'], ['fgp', 'FG%', s => s.fga ? round1(100 * s.fgm / s.fga) : 0], ['fgLng', 'Lng'], ['xpm', 'XPM'], ['xpa', 'XPA'], ['xpp', 'XP%', s => s.xpa ? round1(100 * s.xpm / s.xpa) : 0]],
  P: [['pnt', 'Punts'], ['pntY', 'Yds'], ['pavg', 'Avg', s => s.pnt ? round1(s.pntY / s.pnt) : 0], ['pi20', 'In 20'], ['ptb', 'TB']],
};
// the kicking game, kept apart from what a man does from scrimmage
const ST_COLS = [['sts', 'ST snaps'], ['stk', 'ST tkl'], ['krA', 'KR'], ['krY', 'KR yds'], ['kravg', 'KR avg', s => s.krA ? round1(s.krY / s.krA) : 0], ['prA', 'PR'], ['prY', 'PR yds'], ['pravg', 'PR avg', s => s.prA ? round1(s.prY / s.prA) : 0], ['rtd', 'Ret TD', s => (s.krTD || 0) + (s.prTD || 0)]];
const stAny = r => (r.sts || 0) + (r.stk || 0) + (r.krA || 0) + (r.prA || 0) > 0;
function careerCols(pos) { return pos === 'TE' ? CAREER_COLS.WR : DEF_POS.includes(pos) ? CAREER_COLS.DEF : CAREER_COLS[pos]; }

// ---------- player card: an at-a-glance read ----------
// red (bottom) → grey (middle) → green (top); dir -1 means lower is better, 0 means no judgment
function pctStyle(pct, dir) {
  if (pct === null || pct === undefined || !dir) return '';
  const q = dir > 0 ? pct : 1 - pct, hue = Math.round(q * 130), dark = state && state.settings.theme === 'dark';
  const alpha = ((0.12 + Math.abs(q - 0.5) * 0.9) * (dark ? 1 : 0.55)).toFixed(2);
  return dark ? `background:hsla(${hue},65%,38%,${alpha});border-color:hsla(${hue},70%,45%,.6)` : `background:hsla(${hue},70%,48%,${alpha});border-color:hsla(${hue},60%,42%,.55)`;
}
function gradeColor(v) { return v >= 80 ? 'var(--elite)' : v >= 70 ? 'var(--good)' : v >= 60 ? 'var(--mid)' : v >= 50 ? 'var(--warn)' : 'var(--bad)'; }
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
const GRADE_BAND = v => v >= 80 ? ['Elite', 'good'] : v >= 70 ? ['Good starter', 'good'] : v >= 60 ? ['Decent starter', ''] : v >= 50 ? ['Rotation', 'mid'] : ['Liability', 'bad'];
function glanceHTML(p, src) {
  if (!src) return `<div class="muted small">No snaps on tape yet.</div>`;
  const a = src.a, first = Object.keys(gradeFacets(p.spot)), cats = first.concat(Object.keys(FACETS).filter(f => !first.includes(f))).filter(f => gradeN(a, f) >= 15);
  if (!cats.length) return `<div class="muted small">${Object.keys(a).some(k => /^g[a-z]/.test(k)) && !Object.keys(a).some(k => /^G[a-z]/.test(k)) ? 'Graded under the old system: the new grades start with his next game.' : 'Not enough plays on tape yet.'}</div>`;
  return cats.map(f => { const v = facetGrade(a, f, 0, p.spot), n = gradeN(a, f), b = GRADE_BAND(v);
    return `<div class="adv-r" title="${n} plays where he had a job in it"><span class="adv-l">${FACETS[f]}</span><span class="adv-v" style="color:${gradeColor(v)};font-size:15px">${v}</span><span class="adv-tag ${b[1]}">${b[0]}</span><span class="adv-rk">${n}</span></div>`; }).join('');
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
const COMBINE = [['ht', 'Height', v => fmtHeight(v), 1], ['wt', 'Weight', v => v, 1], ['arm', 'Arm', v => v.toFixed(2) + '"', 1], ['hand', 'Hand', v => v.toFixed(2) + '"', 1], ['forty', '40-yd', v => v.toFixed(2), -1],
  ['ten', '10-yd', v => v.toFixed(2), -1], ['vert', 'Vertical', v => v + '"', 1], ['broad', 'Broad', v => `${Math.floor(v / 12)}'${v % 12}"`, 1],
  ['cone', '3-cone', v => v.toFixed(2), -1], ['shut', 'Shuttle', v => v.toFixed(2), -1], ['bench', 'Bench', v => v, 1]];
// why a drill is blank. A man who chose not to run and a man hiding something read the same.
const DRILL_WHY = { i: ['Injured', 'Did not work out: injured'], s: ['Did not run', 'Chose not to do this drill'], n: ['No result', 'Never tested'], c: ['—', 'Not asked of his position'] };
function drillFmt(k, v) { const c = COMBINE.find(x => x[0] === k); return c ? c[2](v) : v; }
function workoutNoteHTML(p) {
  const m = p.m || {}, x = m.x || {}, bits = [];
  if (m.inj) bits.push(`<span class="bad">Did not work out fully: ${esc(m.inj)}</span>`);
  if (m.pd) bits.push('Pro day numbers: a home track and a friendly stopwatch');
  else if (Object.values(x).includes('p')) bits.push('Ran his 40 at his pro day, not the combine');
  const sk = Object.keys(x).filter(k => x[k] === 's'); if (sk.length) bits.push(`Chose not to do: ${sk.map(k => COMBINE.find(c => c[0] === k)[1].toLowerCase()).join(', ')}`);
  if (p.pw) bits.push('<span class="good">You worked him out privately</span>');
  return bits.length ? `<div class="small muted" style="margin-top:6px">${bits.join(' · ')}</div>` : '';
}
function medPill(p) { const g = p.tid === -2 && p.m ? p.m.med : null; return g === 'flag' ? '<span class="pill bad" title="The doctors flagged him. They are not always right.">Medical flag</span>' : g === 'minor' ? '<span class="pill warn" title="The doctors noted a minor concern.">Medical: minor</span>' : ''; }
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
  ensureJumps(p); peers.forEach(ensureJumps); ensureHand(p);
  const x = p.m.x || {}, pw = p.pw || {};
  return `<div class="stat-tiles">${COMBINE.map(([k, l, f, dir]) => {
    const v = p.m[k], mine = pw[k];
    if (v === undefined) { const w = DRILL_WHY[x[k]] || ['—', '']; return `<div class="tile ${mine !== undefined ? 'tile-pw' : 'tile-dnp'}" title="${w[1]}${mine !== undefined ? ' · the number is from your private workout' : ''}"><div class="v" style="font-size:${mine !== undefined ? 15 : 12}px">${mine !== undefined ? f(mine) : w[0]}</div><div class="l">${l}</div>${mine !== undefined ? '<div class="rk">your workout</div>' : ''}</div>`; }
    let style = '', title = '';
    if (dir) { const vals = peers.map(q => q.m[k]).filter(z => z !== undefined && z !== null).sort((a, b) => a - b), below = vals.filter(z => z < v).length, pct = vals.length > 1 ? below / (vals.length - 1) : 0.5; style = pctStyle(pct, dir); title = `${Math.round(100 * (dir > 0 ? pct : 1 - pct))}th percentile among ${p.pos}s`; }
    return `<div class="tile" style="${style}" title="${title}${x[k] === 'p' ? ' · pro day' : ''}"><div class="v" style="font-size:15px">${f(v)}${x[k] === 'p' ? '<span class="small muted">*</span>' : ''}</div><div class="l">${l}</div>${mine !== undefined ? `<div class="rk" title="Your private workout">yours ${f(mine)}</div>` : ''}</div>`;
  }).join('')}</div>${workoutNoteHTML(p)}`;
}
function strengthsHTML(p) {
  const { str, weak, best } = scoutTraits(p);
  return `<div class="grid g2" style="gap:10px"><div><div class="sw-h good">Strengths</div>${str.map(t => `<div class="sw good">+ ${esc(t)}</div>`).join('')}${str.length < 2 ? best.map(t => `<div class="sw" title="Relative to the rest of his game, not to a starter">◦ ${esc(t)}</div>`).join('') : ''}${!str.length && !best.length ? '<div class="muted small">Nothing that stands out.</div>' : ''}</div>
    <div><div class="sw-h bad">Weaknesses</div>${weak.length ? weak.map(t => `<div class="sw bad">− ${esc(t)}</div>`).join('') : '<div class="muted small">No glaring holes.</div>'}</div></div>`;
}
// where along the defensive line he can play: each spot against his own best one, with how at home he is there
const LINE_POINTS = [['Nose', 0.1], ['Shade', 0.6], ['3-tech', 1.35], ['4i', 1.65], ['5-tech', 2.3], ['Wide', 3.3]];
function lineStripHTML(p) {
  if (!p.a || !SPOTS[p.spot] || SPOTS[p.spot].g !== 'DL') return '';
  const v = LINE_POINTS.map(([l, ax]) => ({ l, r: lineSlotRating(p, ax), c: lineComfort(p, ax), m: lineMass(p, ax) })), top = Math.max(...v.map(x => x.r));
  return `<div class="line-strip" title="How he plays at each spot on the line, against his own best spot. Comfort is what he has learned there; size is against what the spot asks for.">${v.map(x => { const d = Math.round(x.r - top), lv = d >= -1 ? 4 : d >= -4 ? 3 : d >= -8 ? 2 : d >= -13 ? 1 : 0;
    return `<div class="ls-c ls-${lv}" title="${esc(comfortLabel(x.c))} there${x.m <= -1.5 ? ' · light for the spot' : x.m >= 1.5 ? ' · heavy for the spot' : ''}"><b>${x.l}</b><span>${d >= -1 ? 'best' : d}</span></div>`; }).join('')}</div>`;
}
function comfortHTML(p) {
  const cf = Object.entries(p.cf || {}).sort((a, b) => b[1] - a[1]);
  return lineStripHTML(p) + cf.map(([s, c]) => `<span class="pill ${CF_CLS[comfortLabel(c)]}" title="${trueOn() ? Math.round(c) : ''}">${SPOTS[s].l} · ${comfortLabel(c)}</span>`).join(' ') +
    ` <span class="small muted">· learns new spots ${learnRate(p) >= 1.15 ? 'quickly' : learnRate(p) <= 0.8 ? 'slowly' : 'at an average pace'}</span>`;
}
// ---------- the player file: a bio header that never moves, and tabs under it ----------
const CARD_TABS = [['over', 'Overview'], ['scout', 'Scouting'], ['stats', 'Stats'], ['adv', 'Advanced'], ['contract', 'Contract']];
const JOB_NAME = { QB: 'Quarterback', RB: 'Running back', FB: 'Fullback', WRX: 'Split end (X)', WRZ: 'Flanker (Z)', SLOT: 'Slot receiver', TEY: 'In-line tight end', TEH: 'Move tight end', LT: 'Left tackle', LG: 'Left guard', C: 'Center', RG: 'Right guard', RT: 'Right tackle',
  NT: 'Nose tackle', DT: 'Defensive tackle', DE: 'Defensive end', EDGE: 'Edge rusher', MLB: 'Middle linebacker', WLB: 'Coverage linebacker', CB: 'Outside corner', NCB: 'Slot corner', FS: 'Deep safety', SS: 'Box safety', K: 'Kicker', P: 'Punter' };
// what the overview can show: [label, (advanced, box score) => value or null, decimals, direction (0: no judgment), unit]
const cardPct = (n, d) => d ? 100 * (n || 0) / d : null;
const CARD_MET = {
  epaDb: ['EPA per dropback', a => a.db ? a.epaDb / a.db : null, 2, 1], cpoe: ['Completion % over expected', a => a.att ? 100 * (a.cmp - a.xc) / a.att : null, 1, 1],
  adot: ['Depth of target', a => a.att ? a.air / a.att : null, 1, 0], ttt: ['Time to throw', a => a.tttN ? a.ttt / a.tttN : null, 2, 0, 's'], prsd: ['Pressured', a => cardPct(a.prsd, a.db), 0, -1, '%'],
  yaco: ['Yards after contact', a => a.rush ? a.yaco / a.rush : null, 2, 1], mtf: ['Missed tackles forced', a => cardPct(a.mtf, a.rush), 0, 1, '%'], ybc: ['Yards before contact', a => a.rush ? a.ybc / a.rush : null, 2, 1],
  stuff: ['Stuffed', a => cardPct(a.stuff, a.rush), 0, -1, '%'], epaRush: ['EPA per carry', a => a.rush ? (a.epaRush || 0) / a.rush : null, 2, 1],
  yprr: ['Yards per route', (a, s) => a.routes && s ? (s.recY || 0) / a.routes : null, 2, 1], sep: ['Separation', a => a.sepR && a.routes ? a.sepR / a.routes : a.sepN ? a.sep / a.sepN : null, 2, 1, ' yd'],
  tpr: ['Targets per route', a => cardPct(a.sepN, a.routes), 0, 1, '%'], radot: ['Depth of target', a => a.sepN ? a.adot / a.sepN : null, 1, 0], epaTgt: ['EPA per target', a => a.sepN ? (a.epaTgt || 0) / a.sepN : null, 2, 1],
  ctd: ['Contested catches', a => facetGrade(a, 'rec_ctd', 15), 0, 1, '', 1], rbg: ['Run blocking', a => facetGrade(a, 'rb', 15), 0, 1, '', 1], pbg: ['Pass protection', a => facetGrade(a, 'pb', 15), 0, 1, '', 1],
  pbw: ['Pass-block win rate', a => a.pbSnaps ? 100 - 100 * (a.pbLoss || 0) / a.pbSnaps : null, 1, 1, '%'], prsA: ['Pressure allowed', a => cardPct(a.prsA, a.pbSnaps), 1, -1, '%'],
  sackA: ['Sacks allowed', a => a.pbSnaps ? a.sackA || 0 : null, 0, -1], rbw: ['Run-block win rate', a => cardPct(a.rbWins, a.rbSnaps), 1, 1, '%'],
  prw: ['Pass-rush win rate', a => cardPct(a.prWins, a.prSnaps), 1, 1, '%'], prsR: ['Pressure rate', (a, s) => a.prSnaps && s ? 100 * (s.prs || 0) / a.prSnaps : null, 1, 1, '%'], dbl: ['Double-teamed', a => cardPct(a.dbl, a.prSnaps), 0, 0, '%'],
  rsw: ['Run-defense win rate', a => cardPct(a.rdWins, a.rdSnaps), 1, 1, '%'], stop: ['Run-stop rate', a => cardPct(a.stops, a.rdSnaps), 1, 1, '%'],
  tgtd: ['Targeted', a => cardPct(a.tgtA, a.covSnaps), 1, 0, '%'], cmpA: ['Completion % allowed', a => cardPct(a.cmpA, a.tgtA), 0, -1, '%'], ypcs: ['Yards per coverage snap', a => a.covSnaps ? (a.ydsA || 0) / a.covSnaps : null, 2, -1],
  rtgA: ['Passer rating allowed', a => a.tgtA ? ratingAllowed(a) || 0 : null, 1, -1], mt: ['Missed tackles', a => cardPct(a.mt, a.tkAtt), 0, -1, '%'],
  fgp: ['Field goals', (a, s) => s && s.fga ? 100 * (s.fgm || 0) / s.fga : null, 0, 1, '%'], fgl: ['Longest', (a, s) => s && s.fga ? s.fgLng || 0 : null, 0, 1], xpp: ['Extra points', (a, s) => s && s.xpa ? 100 * (s.xpm || 0) / s.xpa : null, 0, 1, '%'],
  pavg: ['Punt average', (a, s) => s && s.pnt ? s.pntY / s.pnt : null, 1, 1], pi20: ['Inside the 20', (a, s) => s && s.pnt ? 100 * (s.pi20 || 0) / s.pnt : null, 0, 1, '%'], ptb: ['Touchbacks', (a, s) => s && s.pnt ? 100 * (s.ptb || 0) / s.pnt : null, 0, -1, '%'],
};
// the four a man is judged on, by the job he holds; the next ones in line fill in for a number he has not produced
const JOB_MET = { QB: ['epaDb', 'cpoe', 'adot', 'ttt', 'prsd'], RB: ['yaco', 'mtf', 'ybc', 'stuff', 'epaRush'], FB: ['rbg', 'yaco', 'yprr', 'pbg', 'stuff'],
  WRX: ['yprr', 'ctd', 'radot', 'tpr', 'sep'], WRZ: ['yprr', 'sep', 'radot', 'epaTgt', 'tpr'], SLOT: ['yprr', 'sep', 'tpr', 'epaTgt', 'radot'], TEY: ['rbg', 'pbg', 'yprr', 'tpr', 'sep'], TEH: ['yprr', 'tpr', 'sep', 'ctd', 'epaTgt'],
  LT: ['pbw', 'prsA', 'sackA', 'rbw'], RT: ['pbw', 'prsA', 'sackA', 'rbw'], LG: ['rbw', 'pbw', 'prsA', 'sackA'], C: ['rbw', 'pbw', 'prsA', 'sackA'], RG: ['rbw', 'pbw', 'prsA', 'sackA'],
  DE: ['prw', 'prsR', 'stop', 'dbl', 'rsw'], EDGE: ['prw', 'prsR', 'stop', 'dbl', 'rsw'], NT: ['stop', 'dbl', 'rsw', 'prw'], DT: ['stop', 'dbl', 'prw', 'rsw'],
  MLB: ['stop', 'mt', 'ypcs', 'rsw', 'rtgA'], WLB: ['ypcs', 'rtgA', 'cmpA', 'mt', 'stop'], CB: ['ypcs', 'rtgA', 'cmpA', 'tgtd'], NCB: ['ypcs', 'mt', 'tgtd', 'rtgA'], FS: ['rtgA', 'ypcs', 'cmpA', 'mt'], SS: ['stop', 'mt', 'ypcs', 'rtgA'],
  K: ['fgp', 'fgl', 'xpp'], P: ['pavg', 'pi20', 'ptb'] };
function cardBox(p, season, cur) { return cur ? p.stats : (p.career || []).find(r => r.season === season) || null; }
// the overview reads this season once he has played enough of it, and last season until then
function cardSrc(p) {
  const cur = p.advS && Object.keys(p.advS).length > 1 ? p.advS : null, prev = p.advPrev || null;
  if (cur && ((p.stats && p.stats.snp) || 0) >= 100) return { a: cur, season: state.season, cur: true };
  if (prev) return { a: prev, season: prev.season, cur: false };
  if (cur) return { a: cur, season: state.season, cur: true };
  if (p.pos === 'K' || p.pos === 'P') { if (p.stats && p.stats.gp) return { a: {}, season: state.season, cur: true }; const r = (p.career || [])[p.career.length - 1]; return r ? { a: {}, season: r.season, cur: false } : null; }
  return null;
}
// ---- his sheet against the men who played enough at his position, and the four numbers that say most about him ----
let ADV_POOL = { key: '', by: {} };
function advPoolFor(p, src) {
  const grp = advGroupOf(p); if (!grp || !ADV_POS[grp] || !src) return null;
  const k = src.cur ? clamp((state.week - 1) / 17, 1 / 17, 1) : 1, key = state.season + ':' + state.week + ':' + state.phase + ':' + src.season + ':' + src.cur;
  if (ADV_POOL.key !== key) ADV_POOL = { key, by: {} };
  if (!ADV_POOL.by[grp]) { const pool = [];
    for (const id in state.players) { const q = state.players[id]; if (advGroupOf(q) !== grp) continue; const a = src.cur ? q.advS : q.advPrev && q.advPrev.season === src.season ? q.advPrev : null; if (a && advQualified(grp, a, k)) pool.push([a, cardBox(q, src.season, src.cur) || {}]); }
    ADV_POOL.by[grp] = pool; }
  return { grp, k, pool: ADV_POOL.by[grp] };
}
function advSheetOf(p, src) { const P_ = advPoolFor(p, src); return P_ ? { grp: P_.grp, n: P_.pool.length, qual: advQualified(P_.grp, src.a, P_.k), sheet: advSheet(P_.grp, src.a, cardBox(p, src.season, src.cur) || {}, P_.pool, P_.k) } : null; }
function advTag(m) { const q = Math.round(100 * m.pct); return m.dir === 0 ? (q >= 85 ? 'Among the highest' : q <= 15 ? 'Among the lowest' : ordinal(q) + ' percentile') : q >= 90 ? `Top ${Math.max(1, 100 - q)}%` : q <= 10 ? `Bottom ${Math.max(1, q)}%` : ordinal(q) + ' percentile'; }
function advTone(m) { return m.dir === 0 || m.z === null ? '' : m.z >= 0.8 ? 'good' : m.z <= -0.8 ? 'bad' : ''; }
function cardOutliersHTML(p, src) {
  const S = advSheetOf(p, src); if (!S) return null;
  const out = advOutliers(S.sheet, 4, S.grp);
  if (!out.length) return `<div class="muted small">${S.qual ? 'Nothing stands out.' : 'Not enough snaps on tape yet.'}</div>`;
  return `<div class="figs">${out.map((m, n) => { const tone = advTone(m);
    return `<div class="fig" title="${esc(m.label)} · ${esc(ADV_SEC[m.sec])}${m.rank ? ` · ${m.rank}${m.dir === 0 ? '' : ordinal(m.rank).replace(/\d+/, '')} of ${m.n} qualified` : ''}${m.dir < 0 ? ' · lower is better' : m.dir === 0 ? ' · a description, not a grade' : ''}"><div class="fig-v ${tone}">${advFmt(m.id, m.v)}</div><div class="fig-l">${esc(m.label.replace(/ \(.*/, ''))}</div><span class="stamp ${tone || (m.dir === 0 ? 'note' : '')} s${n % 4}">${advTag(m)}</span></div>`; }).join('')}</div>${S.qual ? '' : '<div class="small muted" style="margin-top:4px">Short of the snaps to qualify: read these loosely.</div>'}`;
}
function cardFourHTML(p, src) {
  { const o = src ? cardOutliersHTML(p, src) : null; if (o !== null) return o; }
  const ids = JOB_MET[p.spot];
  if (!ids || !src) return `<div class="muted small">Nothing on tape yet.</div>`;
  const gk = Object.keys(ADV_GROUPS).find(k => ADV_GROUPS[k].spots.includes(p.spot)), G = gk ? ADV_GROUPS[gk] : null;
  const qualK = src.cur ? clamp((state.week - 1) / 17, 1 / 17, 1) : 1, mineS = cardBox(p, src.season, src.cur), qual = G ? G.min(src.a, qualK) : true;
  const pool = [];
  for (const id in state.players) { const q = state.players[id]; if (q.pos !== p.pos || q.id === p.id) continue; const a = p.pos === 'K' || p.pos === 'P' ? {} : src.cur ? q.advS : q.advPrev && q.advPrev.season === src.season ? q.advPrev : null; if (!a) continue;
    const s = cardBox(q, src.season, src.cur); if (G ? G.min(a, qualK) : s && s.gp) pool.push([a, s]); }
  const tiles = [];
  for (const id of ids) {
    if (tiles.length === 4) break;
    const [label, fn, dec, dir, unit, isGrade] = CARD_MET[id], v = fn(src.a, mineS);
    if (v === null || v === undefined || isNaN(v)) continue;
    const vals = pool.map(([a, s]) => fn(a, s)).filter(x => x !== null && x !== undefined && !isNaN(x)), below = vals.filter(x => x < v).length;
    const raw = vals.length ? below / vals.length : 0.5, pct = dir < 0 ? 1 - raw : raw, col = !dir ? 'var(--accent)' : pct >= 0.7 ? 'var(--good)' : pct >= 0.35 ? 'var(--mid)' : pct >= 0.15 ? 'var(--warn)' : 'var(--bad)';
    const txt = (dec === 2 && v < 0 ? '−' + Math.abs(v).toFixed(2) : v.toFixed(dec).replace('-', '−')) + (unit || '');
    tiles.push(`<div class="ds-m" title="${qual ? `${ordinal(Math.round(100 * raw))} percentile among qualified ${p.pos}s${dir < 0 ? ' (lower is better)' : !dir ? ' (a style, not a grade)' : ''}` : 'Too few snaps to rank'}"><div class="ds-ml">${label}${isGrade ? ' <span class="muted">grade</span>' : ''}</div><div class="ds-mv">${txt}</div><div class="ds-bar"><i style="width:${qual ? Math.round(clamp(pct, 0.03, 1) * 100) : 0}%;background:${col}"></i></div></div>`);
  }
  return tiles.length ? `<div class="ds-four">${tiles.join('')}</div>` : `<div class="muted small">Not enough snaps on tape yet.</div>`;
}
// the five drills as a web, each spoke his percentile against his own position
const SPIDER = [['forty', '40 yard', -1], ['bench', 'Bench', 1], ['shut', 'Shuttle', -1], ['cone', '3-cone', -1], ['vert', 'Vertical', 1]];
function spiderHTML(p, peers) {
  if (!p.m) return '';
  ensureJumps(p); peers = peers || Object.values(state.players).filter(q => q.m && q.pos === p.pos); peers.forEach(ensureJumps);
  const cx = 115, cy = 94, R = 64, ang = i => (-90 + 72 * i) * Math.PI / 180, pt = (i, r) => `${(cx + Math.cos(ang(i)) * r).toFixed(1)},${(cy + Math.sin(ang(i)) * r).toFixed(1)}`;
  const val = k => p.m[k] !== undefined && p.m[k] !== null ? p.m[k] : p.pw && p.pw[k] !== undefined ? p.pw[k] : null, x = p.m.x || {};
  const pcts = SPIDER.map(([k, , dir]) => { const v = val(k); if (v === null) return null; const vals = peers.map(q => q.m[k]).filter(x => x !== undefined && x !== null), below = vals.filter(x => x < v).length, raw = vals.length > 1 ? below / (vals.length - 1) : 0.5; return clamp(dir > 0 ? raw : 1 - raw, 0, 1); });
  const ring = f => `<polygon points="${SPIDER.map((_, i) => pt(i, R * f)).join(' ')}" class="sp-ring"/>`;
  const LBL = [[115, 12, 'middle'], [181, 66, 'start'], [158, 160, 'middle'], [72, 160, 'middle'], [49, 66, 'end']];
  const yr = p.draft ? p.draft.year : p.tid === -2 ? p.draftYear : state.season - (p.exp || 0);
  return `<div class="ds-lb" style="text-align:center">Measurables · against ${esc(p.pos)}s</div>
    <svg viewBox="0 0 230 178" class="spider" role="img" aria-label="Combine results as percentiles at his position">${ring(1)}${ring(0.5)}
    ${SPIDER.map((_, i) => `<line x1="${cx}" y1="${cy}" x2="${pt(i, R).split(',')[0]}" y2="${pt(i, R).split(',')[1]}" class="sp-ax"/>`).join('')}
    <polygon points="${pcts.map((q, i) => pt(i, R * (q === null ? 0 : 0.08 + 0.92 * q))).join(' ')}" class="sp-me"/>
    ${SPIDER.map(([k, l], i) => `<text x="${LBL[i][0]}" y="${LBL[i][1]}" text-anchor="${LBL[i][2]}" class="sp-l">${l}</text><text x="${LBL[i][0]}" y="${LBL[i][1] + 13}" text-anchor="${LBL[i][2]}" class="sp-v${val(k) === null ? ' sp-no' : ''}">${val(k) === null ? (x[k] === 'i' ? 'inj' : x[k] === 's' ? 'DNR' : '—') : drillFmt(k, val(k)) + (p.m[k] === undefined ? '†' : x[k] === 'p' ? '*' : '')}<title>${pcts[i] !== null ? ordinal(Math.round(100 * pcts[i])) + ' percentile' + (p.m[k] === undefined ? ' · your private workout' : x[k] === 'p' ? ' · pro day' : '') : (DRILL_WHY[x[k]] || ['', 'No result'])[1]}</title></text>`).join('')}</svg>
    <div class="small muted" style="text-align:center">${p.tid === -2 ? (p.m.pd ? 'Pro day numbers' : 'This year’s combine') : 'As measured in ' + yr}${SPIDER.some(([k]) => p.m[k] === undefined && val(k) !== null) ? ' · † your workout' : ''}</div>${p.m.inj ? `<div class="small bad" style="text-align:center">Did not work out fully: ${esc(p.m.inj)}</div>` : ''}`;
}
// has he topped out, or is there more to come
function devStatement(p) {
  if (!p.a || !p.grow) return null;
  const own = p.tid === state.userTid || (p.tid === -3 && p.psTid === state.userTid), hedge = !own && p.tid !== -2 && confLabel(p) === 'Low';
  let k, cls = '', line;
  if (isDeveloping(p)) {
    const near = p.tid !== -2 && upsideOf(p) === tierOf(p) && uCeil(p) - uOvr(p) <= 3, r = finishedRemark(p);
    k = near ? 'Near his ceiling' : 'Still improving'; cls = near ? '' : 'good';
    line = r.line ? `The finished product: ${r.line.charAt(0).toLowerCase() + r.line.slice(1)}.` : 'Too little to go on yet.';
  } else {
    const t = trackOf(p);
    if (t === 'fall' || t === 'slip') { k = 'Declining'; cls = 'bad'; line = t === 'fall' ? 'The decline is real and it is moving fast.' : 'He has lost a step from his best.'; }
    else { k = 'Topped out'; line = 'He is what he is: the finished article.'; }
  }
  return { k: hedge ? 'Looks ' + k.charAt(0).toLowerCase() + k.slice(1) : k, cls, line: hedge ? line + ' Your staff has seen very little of him.' : line };
}
function cardBoxLine(p) {
  const cur = p.stats && p.stats.gp, s = cur ? p.stats : (p.career || [])[(p.career || []).length - 1];
  if (!s || !s.gp) return '';
  const g = p.pos, n = k => s[k] || 0;
  const t = g === 'QB' ? `${n('passC')}/${n('passA')} · ${n('passY').toLocaleString('en-US')} yds · ${n('passTD')} TD · ${n('passInt')} int`
    : g === 'RB' ? `${n('rushA')} car · ${n('rushY').toLocaleString('en-US')} yds · ${n('rushTD')} TD${n('rec') ? ` · ${n('rec')} rec` : ''}`
    : g === 'WR' || g === 'TE' ? `${n('rec')} rec · ${n('recY').toLocaleString('en-US')} yds · ${n('recTD')} TD`
    : g === 'OL' ? `${n('gs')} starts · ${n('snp')} snaps · ${n('pen')} penalties`
    : g === 'K' ? `${n('fgm')}/${n('fga')} FG · long ${n('fgLng')} · ${n('xpm')}/${n('xpa')} XP`
    : g === 'P' ? `${n('pnt')} punts · ${n('pnt') ? round1(n('pntY') / n('pnt')) : 0} avg · ${n('pi20')} inside the 20`
    : `${n('tkl')} tkl · ${n('sck')} sacks · ${n('dint')} int · ${n('pd')} PD`;
  return t + (cur ? '' : ` <span class="muted">(${s.season})</span>`);
}
function cardContractLine(p) {
  const c = p.contract || {};
  if (p.tid === -2) return `Draft prospect · ${p.draftYear} class`;
  if (p.tid === -3) return `Practice squad · ${fmtMoney(c.amt)}`;
  if (p.tid === -1) return `Free agent · ${faInMarket(p) ? 'expected ' + faExpTxt(p) + ' a year' : 'asking ' + fmtMoney(p.ask) + ' a year'}`;
  if (!(c.yrs > 0)) return '—';
  const d = deadIfCut(p), inc = c.inc && c.inc.length ? ` <span class="pill rook">${c.inc.length} incentive${c.inc.length > 1 ? 's' : ''}</span>` : '';
  return `${p.expiring ? '<b class="warn">Final year</b>' : `<b>${c.yrs} year${c.yrs > 1 ? 's' : ''} left</b>`} · ${fmtMoney(c.amt)} against this year’s cap · ${fmtMoney(d.now)} to cut him${c.next ? ` · then ${c.next.yrs} × ${fmtMoney(c.next.amt)}` : ''}${c.tagged ? ' <span class="pill exp">Tag</span>' : ''}${inc}`;
}
function cardHeadHTML(p) {
  const prospect = p.tid === -2, stars = starsOf(p);
  const team = p.tid >= 0 ? teamLink(p.tid, true) : p.tid === -3 ? `Practice squad · ${teamLink(p.psTid, true)}` : p.tid === -1 ? 'Free agent' : 'Draft prospect';
  const yr = prospect ? `${p.draftYear} draft class` : p.exp === 0 ? 'Rookie' : `Year ${p.exp + 1}`;
  const drafted = p.draft ? `Drafted ${p.draft.year}, round ${p.draft.round} (no. ${p.draft.pick}) by ${T(p.draft.tid).abbr}` : prospect ? '' : 'Undrafted';
  return `<div class="ds-head"><div>
      <div class="ds-lb">Player file · no. ${String(p.id).padStart(4, '0')}${p.tid >= 0 ? ' · ' + T(p.tid).abbr : ''}</div>
      <h2 class="ds-name">${esc(pname(p))}</h2>
      <div class="ds-bio"><b>${JOB_NAME[p.spot] || esc(p.lbl)}</b> · Age <b>${p.age}</b> · <b>${p.m ? fmtHeight(p.m.ht) : '—'}</b> · <b>${p.m ? p.m.wt : '—'} lb</b> · ${yr} · ${esc(p.college)}</div>
      <div class="ds-sub">${team}${drafted ? ' · ' + drafted : ''}</div>
    </div>
    <div class="ds-pills"><div><span class="pill">${esc(p.lbl)}</span> ${statusPills(p)} ${medPill(p)} ${stars !== null && !prospect ? starHTML(stars) : ''}</div>
      <div><span title="${prospect ? 'Ready now as' : 'Tier'}">${tierPill(p)}</span> <span title="Upside">${upsidePill(p)}</span>${trueNums(p)} ${rasHTML(p)}</div></div></div>`;
}
function cardOverHTML(p) {
  const prospect = p.tid === -2, src = cardSrc(p), dv = devStatement(p), form = (p.form || []).slice(-5);
  const sg = src && p.pos !== 'K' && p.pos !== 'P' && src.a && Object.keys(src.a).length ? overallGrade(src.a, p.spot) : null;
  const rk = src && sg !== null ? (src.cur ? gradeRanks()[p.id] : seasonRank(p, (p.career || []).find(r => r.season === src.season) || {})) : null;
  const more = (k, l) => `<button class="link ds-more" data-action="cardTab" data-v="${k}" data-pid="${p.id}">${l} →</button>`;
  let left = `<div class="ds-lb">Scout’s read</div><div class="ds-read">${esc(scoutProfile(p))}.</div>`;
  if (dv) left += `<div class="ds-dev"><span class="ds-lb">Development</span> <span class="pill ${dv.cls}">${dv.k}</span>${prospect ? '' : ' ' + trackPill(p)}</div><div class="ds-devl">${esc(dv.line)}</div>`;
  if (p.injury) left += `<div class="ds-note bad">Injured: ${esc(p.injury.name)}, out ${p.injury.weeks} more week${p.injury.weeks > 1 ? 's' : ''}${onIR(p) ? ' (injured reserve)' : ''}.</div>`;
  if (p.rust) left += `<div class="ds-note warn">Rusty: short of preseason work, a step slow until he has played a game or two.</div>`;
  if (!prospect) {
    const box = cardBoxLine(p);
    left += `<div class="ds-rule"></div><div class="ds-grade"><span class="ds-lb">${src && !src.cur ? src.season + ' grade' : 'Season grade'}</span> <b class="ds-g" style="color:${sg === null ? 'var(--muted)' : gradeColor(sg)}">${sg === null ? '—' : sg}</b>${form.length ? ` <span class="ds-form" title="His last ${form.length} game${form.length > 1 ? 's' : ''}, oldest first">(${form.map(g => Math.round(g)).join(', ')})</span>` : ''}${rk ? ` <span class="pill">${rk[0]}${ordinal(rk[0]).replace(/\d+/, '')} of ${rk[1]}${rk[2] ? ' ' + rk[2] : ''}</span>` : sg !== null ? ' <span class="small muted">below the snap minimum</span>' : ''}</div>
      ${box ? `<div class="ds-boxl">${box}</div>` : ''}`;
  }
  let h = `<div class="ds-top"><div>${left}</div><div class="ds-spider">${spiderHTML(p)}</div></div>`;
  if (!prospect) h += `<div class="ds-rule"></div><div class="ds-sec"><span class="ds-lb">What stands out${src ? ` · ${src.season}${src.cur ? '' : ' (last season)'}` : ''}</span>${more('adv', 'All of them')}</div>${cardFourHTML(p, src)}`;
  h += `<div class="ds-rule"></div><div class="ds-sec"><span><span class="ds-lb">Contract</span> <span class="ds-con">${cardContractLine(p)}</span></span>${prospect ? '' : more('contract', 'The deal')}</div>`;
  return h;
}
// ---- the scouting page of the file: the report, what he does and where, and the physical sheet, on one screen ----
const CF_PIPS = { Natural: 4, Comfortable: 3, Decent: 2, Raw: 1, Unfamiliar: 0 };
function pipsHTML(n, cls) { return `<span class="pips ${cls || ''}">${[0, 1, 2, 3].map(i => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`; }
function scReportHTML(p) {
  const prospect = p.tid === -2, own = p.tid === state.userTid || (p.tid === -3 && p.psTid === state.userTid), buzz = buzzLabel(p);
  const tierT = tierOf(p), upT = upsideOf(p), young = p.age <= 25 && upT !== tierT;
  const DAY1 = { Elite: 'a franchise-changing talent', 'All-Pro': 'an instant-impact player', Starter: 'a day-one starter', Rotation: 'a rotational contributor', Backup: 'a backup early on', Depth: 'a depth player early on', Project: 'a developmental prospect', Fringe: 'a developmental prospect', Washed: 'a developmental prospect' };
  const line = prospect ? `Scouts see ${DAY1[tierT]} with ${upT.toLowerCase()} upside.` : `Viewed as ${/^[AEIOU]/.test(tierT) ? 'an' : 'a'} ${tierT.toLowerCase()} today${young ? ` with ${upT.toLowerCase()} upside` : ''}.`;
  let h = `<div class="ds-lb">The report</div><div class="ds-read sc-read">${esc(scoutProfile(p))}.</div><div class="sc-note">${esc(line)}</div>
    <div class="sc-meta"><span class="stamp ${own || confLabel(p) === 'High' ? 'good' : confLabel(p) === 'Low' ? 'bad' : ''}" title="How sure your staff is of this read">${own ? 'Seen daily' : confLabel(p) + ' confidence'}</span>${buzz ? ` <span class="stamp note">${esc(buzz)}</span>` : ''}</div>`;
  // the finished product
  if (p.a && p.per && p.grow) {
    const dev = isDeveloping(p), m = p.upM, moved = m && !prospect ? `<div class="sc-note ${m.d > 0 ? 'good' : 'bad'}">${m.d > 0 ? '▲' : '▼'} Upside ${m.d > 0 ? 'raised' : 'lowered'} from ${m.from} after ${esc(m.why)} (${m.s}).</div>` : '';
    if (dev) { const r = finishedRemark(p), c = compFor(p), b = compFor(p, true), same = b && c && ((b.id !== undefined && b.id === c.id) || (b.rid !== undefined && b.rid === c.rid));
      h += `<div class="ds-rule"></div><div class="ds-lb">The finished product ${prospect ? '' : trackPill(p)}</div><div class="sc-fin">${esc(r.line || 'Too little to go on yet.')}.</div>
        ${c ? `<div class="sc-note">Plays like ${compLink(c)}${compBuild(p, c)}${b && !same ? `<br>Best case ${compLink(b)}${compBuild(p, b)}` : ''}</div>` : ''}<div class="sc-fine">A projection from ${filmBasis(p)}; rewritten as the film comes in.</div>${moved}`; }
    else if (!prospect) { const t = trackOf(p);
      h += `<div class="ds-rule"></div><div class="ds-lb">The finished product ${trackPill(p)}</div><div class="sc-fin">${t === 'fall' ? 'The decline is real and it is moving fast.' : t === 'slip' ? 'He has lost a step from his best.' : 'He is what he is: this report is the finished article.'}</div>${moved}`; }
  }
  return h;
}
function scTraitsHTML(p) {
  const { str, weak, best } = scoutTraits(p), li = (t, c, m) => `<div class="sw-i ${c}"><b>${m}</b><span>${esc(t)}</span></div>`;
  return `<div class="ds-lb">Strengths</div>${str.map(t => li(t, 'good', '+')).join('') || (best.length ? '' : '<div class="sc-note">Nothing that stands out.</div>')}${str.length < 2 ? best.map(t => li(t, 'rel', '·')).join('') : ''}
    <div class="ds-lb" style="margin-top:10px">Weaknesses</div>${weak.map(t => li(t, 'bad', '−')).join('') || '<div class="sc-note">No glaring holes.</div>'}`;
}
function scWhereHTML(p) {
  if (p.tid === -2) return '';
  const u = state.userTid, cf = Object.entries(p.cf || {}).sort((a, b) => b[1] - a[1]).slice(0, 5); let h = '';
  if (cf.length) h += `<div class="ds-rule"></div><div class="ds-lb">Where he can play <span class="sc-lbr">learns new spots ${learnRate(p) >= 1.15 ? 'quickly' : learnRate(p) <= 0.8 ? 'slowly' : 'at an ordinary pace'}</span></div>${lineStripHTML(p)}
    <div class="sc-spots">${cf.map(([s, c]) => { const l = comfortLabel(c); return `<div class="sc-spot" title="${trueOn() ? Math.round(c) : ''}"><b>${esc(SPOTS[s].l)}</b>${pipsHTML(CF_PIPS[l], CF_CLS[l])}<span>${l}</span></div>`; }).join('')}</div>`;
  const side = SPOTS[p.spot].side, fitTeams = [...new Set([p.tid >= 0 ? p.tid : null, u].filter(t => t !== null && t >= 0))];
  const rows = [];
  if (side === 'off' || side === 'def') for (const t of fitTeams) { const f = schemeFit(p, t), sk = side === 'off' ? offArch(T(t)) : defArch(T(t)), lab = sk ? (side === 'off' ? OFF_ARCH : DEF_ARCH)[sk].l : '—';
    rows.push(`<div class="sc-kv"><span>${T(t).abbr} · ${esc(lab)}</span><b class="${f >= 1 ? 'good' : f <= -1 ? 'bad' : ''}">${fitLabel(f)}${trueOn() ? ` ${f > 0 ? '+' : ''}${f}` : ''}</b></div>`); }
  if (p.tid >= 0 && (CH_UNIT[p.pos] || ['RB', 'WR', 'TE'].includes(p.pos))) { ensureChem(); const qb = repsOrder(p.tid, 'QB')[0], v = CH_UNIT[p.pos] ? chemOf(p) : chemPair(p, qb);
    rows.push(`<div class="sc-kv"><span>Chemistry ${CH_UNIT[p.pos] ? 'with the ' + CH_NAME[CH_UNIT[p.pos]].toLowerCase() : qb ? 'with ' + esc(pshort(qb)) : 'with his quarterback'}</span><b style="color:${gradeColor(v)}">${chemWord(v)}</b></div>`); }
  { const w = typeof stWord === 'function' ? stWord(p) : null, sg = stGrade(p.stats); if (w) rows.push(`<div class="sc-kv"><span>Special teams${p.stats && p.stats.sts ? ` · ${p.stats.sts} snaps` : ''}</span><b class="${w[1]}">${w[0]}${sg !== null && p.stats && p.stats.sts ? ' · ' + sg : ''}</b></div>`); }
  if (rows.length) h += `<div class="ds-rule"></div><div class="ds-lb">Fit</div>${rows.join('')}`;
  if (p.awards && p.awards.length) h += `<div class="ds-rule"></div><div class="ds-lb">Honours</div><div class="sc-note">${p.awards.slice(-4).map(esc).join(' · ')}${p.awards.length > 4 ? ` · and ${p.awards.length - 4} more` : ''}</div>`;
  return h;
}
function scPhysicalHTML(p) {
  const peers = Object.values(state.players).filter(q => q.m && q.pos === p.pos);
  ensureJumps(p); peers.forEach(ensureJumps); ensureHand(p);
  const x = p.m.x || {}, pw = p.pw || {}, r = rasOf(p);
  const rows = COMBINE.map(([k, l, f, dir]) => { const v = p.m[k], mine = pw[k];
    if (v === undefined) { const w = DRILL_WHY[x[k]] || ['—', '']; return `<div class="ph-r" title="${w[1]}"><span>${l}</span><b class="${mine !== undefined ? '' : 'muted'}">${mine !== undefined ? f(mine) + '†' : w[0]}</b><i></i></div>`; }
    const vals = peers.map(q => q.m[k]).filter(z => z !== undefined && z !== null), below = vals.filter(z => z < v).length, raw = vals.length > 1 ? below / (vals.length - 1) : 0.5, pct = Math.round(100 * (dir > 0 ? raw : 1 - raw));
    const size = k === 'ht' || k === 'wt' || k === 'arm' || k === 'hand', tone = size ? 'note' : pct >= 75 ? 'good' : pct <= 25 ? 'bad' : 'mid';
    return `<div class="ph-r" title="${ordinal(pct)} percentile among ${p.pos}s${x[k] === 'p' ? ' · pro day' : ''}${mine !== undefined ? ' · your workout: ' + f(mine) : ''}"><span>${l}</span><b>${f(v)}${x[k] === 'p' ? '*' : ''}${mine !== undefined ? `<em>${f(mine)}†</em>` : ''}</b><i class="adv-tag ${tone}">${ordinal(pct)}</i></div>`; }).join('');
  const yr = p.draft ? p.draft.year : p.tid === -2 ? p.draftYear : state.season - (p.exp || 0);
  return `<div class="ds-lb">Physical <span class="sc-lbr">${p.tid === -2 ? (p.m.pd ? 'pro day' : 'this year’s combine') : 'measured ' + yr}</span></div>
    <div class="sc-ras">${r === null ? '<span class="sc-note">Too little of a workout for an athletic score.</span>' : `<span class="fig-v" style="font-size:24px;color:${rasColor(r)}">${r.toFixed(2)}</span><span class="sc-note">athletic score out of 10, against ${esc(p.pos)}s</span>`}</div>
    ${rows}${workoutNoteHTML(p)}${p.tid === -2 && p.m.med && p.m.med !== 'clean' ? `<div class="sc-note ${p.m.med === 'flag' ? 'bad' : 'warn'}" style="margin-top:6px">${p.m.med === 'flag' ? 'The doctors flagged him.' : 'The doctors noted a minor concern.'} They are not always right.</div>` : ''}`;
}
function cardScoutHTML(p) {
  const manage = cardManageHTML(p);
  return `<div class="sc-grid"><div class="sc-col">${scReportHTML(p)}${manage ? `<div class="ds-rule"></div><div class="sc-manage">${manage}</div>` : ''}</div>
    <div class="sc-col">${scTraitsHTML(p)}${scWhereHTML(p)}</div><div class="sc-col">${scPhysicalHTML(p)}</div></div>${trueOn() ? attributesHTML(p) : ''}`;
}
function cardStatsHTML(p) {
  let html = gameLogHTML(p);
  // career
  const cc = careerCols(p.pos);
  const scope = ['po', 'pre'].includes(ui.cardScope) ? ui.cardScope : 'reg';
  const rows = scope === 'po' ? [...(p.pcareer || [])] : scope === 'pre' ? [...(p.preCar || [])] : [...p.career];
  if (scope === 'reg' && p.stats.gp) rows.push(Object.assign({ season: state.season, tid: p.tid, cur: true }, p.stats));
  if (scope === 'po' && p.pstats && p.pstats.gp) rows.push(Object.assign({ season: state.season, tid: p.tid, cur: true }, p.pstats));
  if (scope === 'pre' && p.preS && p.preS.gp) rows.push(Object.assign({ season: p.preS.season || state.season, tid: p.tid, cur: true, snp: p.preS.snp }, p.preS.st));
  const scopeTabs = `<div class="subtabs" style="margin:0">${[['reg', 'Regular season'], ['po', 'Playoffs'], ['pre', 'Preseason']].map(([k, l]) => `<button class="${k === scope ? 'on' : ''}" data-action="cardScope" data-v="${k}" data-pid="${p.id}">${l}</button>`).join('')}</div>`;
  if (!rows.length && (scope !== 'reg' || (p.preS && p.preS.gp) || (p.preCar && p.preCar.length) || (p.pcareer && p.pcareer.length))) html += `<div class="row" style="margin:18px 0 8px"><span class="section-title" style="margin:0">Career</span>${scopeTabs}</div><div class="small muted">Nothing on record.</div>`;
  if (rows.length) {
    const tot = {}; rows.forEach(r => { const c = Object.assign({}, r, { season: 0 }); delete c.adv; delete c.sp; addStats(tot, c); });
    const cols = [{ k: 's', l: 'Season', f: r => r.tot ? '<b>Career</b>' : r.season + (r.cur ? '*' : '') }, { k: 't', l: 'Tm', f: r => r.tot ? '' : (r.tid >= 0 ? T(r.tid).abbr : 'FA') }, { k: 'gp', l: 'GP', f: r => r.gp || 0, num: 1 }, { k: 'gs', l: 'GS', f: r => r.gs || 0, num: 1 },
    { k: 'gr', l: 'Grade', f: r => r.tot ? '' : scope === 'pre' ? gradeChip(r.cur ? preGrade(p) : null) : scope === 'po' ? '' : gradeChip(r.cur ? (p.advS ? overallGrade(p.advS, p.spot) : null) : r.adv ? r.adv.g : null) + (seasonRank(p, r) ? '<br>' + gradeRankTxt(seasonRank(p, r)) : ''), num: 1 },
    ...cc.map(([k, l, fn]) => ({ k, l, num: 1, f: r => fn ? fn(r) : (r[k] || 0) }))];
    const cv = ui.cardView === 'ratings' ? 'ratings' : 'stats';
    html += `<div class="row" style="margin:18px 0 8px"><span class="section-title" style="margin:0">Career</span>${scopeTabs}<div class="subtabs" style="margin:0">${[['stats', 'Stats'], ['ratings', 'Ratings']].map(([k, l]) => `<button class="${k === cv ? 'on' : ''}" data-action="cardView" data-v="${k}" data-pid="${p.id}">${l}</button>`).join('')}</div></div>`;
    if (cv === 'stats' || scope !== 'reg') {
      html += table('career', cols, [...rows, Object.assign(tot, { tot: true })], { nosort: 1 });
      if (rows.some(stAny)) html += `<div class="section-title" style="margin-top:14px">Special teams</div>` + table('careerST', [{ k: 's', l: 'Season', f: r => r.tot ? '<b>Career</b>' : r.season + (r.cur ? '*' : '') }, { k: 't', l: 'Tm', f: r => r.tot ? '' : (r.tid >= 0 ? T(r.tid).abbr : 'FA') },
        { k: 'gr', l: 'Grade', num: 1, f: r => r.tot ? '' : gradeChip(stGrade(r)) }, ...ST_COLS.map(([k, l, fn]) => ({ k, l, num: 1, f: r => fn ? fn(r) : (r[k] || 0) }))], [...rows.filter(stAny), tot], { nosort: 1 });
    }
    else {
      // grades every season, plus how your staff rated him at the end of each year
      const ga = r => r.cur ? (p.advS ? careerAdv(p.advS, p.spot) : {}) : (r.adv || {});
      const OLDF = { pass: 'q', rush: 'run', zone: 'cov' }, gf = (r, f) => ga(r)['g' + f] || (OLDF[f] ? ga(r)['g' + OLDF[f]] : null) || null;
      const fcols = Object.keys(FACETS).filter(f => rows.some(r => gf(r, f))).map(f => ({ k: f, l: FACETS[f], num: 1, f: r => gradeChip(gf(r, f)) }));
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
  return html || '<div class="muted small">Nothing on record yet.</div>';
}
function cardAdvHTML(p) {
  const src = cardAdv(p), S = src ? advSheetOf(p, src) : null;
  const facets = `<div class="adv-sec"><div class="ds-lb">Grades${src ? ` · ${src.season}${src.cur ? ' to date' : ''}` : ''} <span style="float:right">plays</span></div>${glanceHTML(p, src)}</div>`;
  if (!S) { const adv = advRankHTML(p, src); return `<div class="grid card-cols"><div>${facets}</div><div>${adv ? `<div class="ds-lb">Tracking</div>${adv}` : '<div class="muted small">No tracking numbers at his position.</div>'}</div></div>${advancedSeasonHTML(p)}`; }
  const outs = new Set(advOutliers(S.sheet, 4, S.grp).map(m => m.id));
  const secs = Object.keys(ADV_SEC).map(k => { const ms = S.sheet.filter(m => m.sec === k); if (!ms.length) return '';
    return `<div class="adv-sec"><div class="ds-lb">${ADV_SEC[k]}</div>${ms.map(m => { const has = m.v !== null && m.ok, tone = has ? advTone(m) : '', col = tone === 'good' ? 'var(--good)' : tone === 'bad' ? 'var(--bad)' : m.dir === 0 ? 'var(--accent)' : 'var(--mid)';
      return `<div class="adv-r ${outs.has(m.id) ? 'out' : ''}" title="${m.dir < 0 ? 'Lower is better' : m.dir === 0 ? 'A description, not a grade' : 'Higher is better'}${has && m.pct !== null ? ' · ' + advTag(m) : m.v !== null ? ' · too small a sample to rank' : ''}"><span class="adv-l">${esc(m.label)}</span><span class="adv-v ${tone} ${has ? '' : 'muted'}">${advFmt(m.id, m.v)}</span><span class="adv-tag ${has && m.pct !== null ? tone || (m.dir === 0 ? 'note' : 'mid') : 'none'}">${has && m.pct !== null ? advTag(m).replace(' percentile', '').replace('Among the highest', 'High').replace('Among the lowest', 'Low') : m.v !== null ? 'few snaps' : ''}</span><span class="adv-rk">${has && m.rank ? m.rank + '/' + m.n : ''}</span></div>`; }).join('')}</div>`; }).join('');
  return `<div class="small muted" style="margin-bottom:8px">Against ${S.n} ${esc(S.grp)} who have played enough to qualify${S.qual ? '' : ' (he has not)'} · the tag is where he stands among them · <b class="adv-key">marked</b> rows are the four on his overview</div><div class="adv-grid">${facets}${secs}</div>${advancedSeasonHTML(p)}`;
}
function cardContractHTML(p) {
  const c = p.contract || {};
  let h = contractHTML(p).replace('<div class="section-title">', '<div class="section-title" style="margin-top:0">');
  if (p.tid >= 0 && c.yrs > 0) {
    const rows = []; for (let i = 0; i < c.yrs; i++) rows.push([state.season + i, i === 0 ? c.amt : c.sched && c.sched[i] !== undefined ? c.sched[i] : c.sal !== undefined && !c.sched ? c.amt : c.amt]);
    if (c.next) for (let i = 0; i < c.next.yrs; i++) rows.push([state.season + c.yrs + i, c.next.sched && c.next.sched[i] !== undefined ? c.next.sched[i] : c.next.amt, 1]);
    h += `<div class="section-title">Against the cap, by season</div><table class="tbl fa-cap" style="max-width:420px"><thead><tr><th>Season</th><th class="num">Cap hit</th><th></th></tr></thead><tbody>${rows.map(([y, v, nx]) => `<tr><td>${y}</td><td class="num"><b>${fmtMoney(v)}</b></td><td class="small muted">${nx ? (c.opt5 === 'exercised' && c.next.yrs === 1 ? 'option year' : 'extension') : y === state.season ? 'this year' : ''}</td></tr>`).join('')}</tbody></table>`;
    if (c.inc && c.inc.length) h += `<div class="section-title">Incentives</div>${c.inc.map(x => `<div class="small" style="margin:3px 0"><span class="pill rook">${fmtMoney(x.amt)}</span> if he ${esc(incLabel(x))} <span class="muted">· ${x.likely ? 'likely to be earned: counted against this year’s cap' : 'not likely to be earned: charged next year only if he gets there'}</span></div>`).join('')}`;
  }
  return h;
}
function cardManageHTML(p) {
  const u = state.userTid; let left = '';
  if ((p.tid === u || (p.tid === -3 && p.psTid === u)) && p.a && workSpots(p).length > 1) left += `<div class="terms"><div class="small muted" style="margin-bottom:4px">Where he is working <span title="Sets the room he sits in during camp, the drills he takes, what the reports say about him, and where his comfort at a new spot grows.">ⓘ</span></div>${crossTrainSelect(p, true)}</div>`;
  if ((p.tid === u || (p.tid === -3 && p.psTid === u)) && PRAC_SIDE[p.pos]) left += `<div class="terms"><div class="small muted" style="margin-bottom:4px">In the building${p.seenW ? ` · ${p.seenW} week${p.seenW === 1 ? '' : 's'} with your staff` : ''}</div><div class="small" style="margin-bottom:4px">Playbook ${pbBar(pbOf(p))} <span class="muted">${pbLabel(pbOf(p))}</span> · this week ${pracChip(p)}</div><div class="row small" style="gap:6px">${charPill(p, 'work')}${charPill(p, 'disc')}${charPill(p, 'lead')}</div>${p.tid === u && crossTrainSpots(p).length ? `<div class="small" style="margin-top:6px">Cross-train at ${crossTrainSelect(p).replace('data-pid=', 'data-card="1" data-pid=')}${p.xt ? ` <span class="muted">now ${comfortLabel(comfortOf(p, p.xt)).toLowerCase()} (${Math.round(comfortOf(p, p.xt))}/100)</span>` : ''}</div>` : ''}</div>`;
  if (p.tid === u && state.phase === 'PRESEASON' && state.prePlan && p.pos !== 'K' && p.pos !== 'P') { const pl = state.prePlan, cur = pl.feat[p.id] ? 'feat' : pl.hold[p.id] ? 'hold' : ''; left += `<div class="terms"><div class="small muted" style="margin-bottom:4px">Preseason playing time${p.preS ? ` · ${p.preS.snp} snaps so far` : ''}</div><span class="seg">${[['', 'Normal'], ['feat', 'Feature'], ['hold', 'Hold out']].map(([k, l]) => `<button class="sm ${cur === k ? 'on' : ''}" data-action="preFeat" data-card="1" data-pid="${p.id}" data-v="${k}">${l}</button>`).join('')}</span></div>`; }
  return left;
}
function cardButtonsHTML(p) {
  const u = state.userTid; let left = '';
  if (p.tid === u && optionDue(p) && state.phase === 'RESIGN') left += `<button class="primary" data-action="option" data-pid="${p.id}" data-v="1">Exercise option (${fmtMoney(optionAmount(p))})</button><button data-action="option" data-pid="${p.id}" data-v="0">Decline option</button>`;
  if (p.tid === u && canTag(p)) left += `<button data-action="tag" data-pid="${p.id}">Franchise tag (${fmtMoney(tagAmount(p))})</button>`;
  if (p.tid === u && extensionDue(p)) left += `<button class="primary" data-action="faOpen" data-pid="${p.id}">Negotiate an extension</button>`;
  if (p.tid === -3 && p.psTid === u) left += `<button class="primary" data-action="promote" data-pid="${p.id}">Promote to 53</button><button class="danger" data-action="psRelease" data-pid="${p.id}">Release</button>`;
  if (p.tid === -1 && p.exp <= 6 && psRoom(u, p) && ['REG', 'PRESEASON', 'CUTDOWN', 'DRAFT', 'FA'].includes(state.phase)) left += `<button data-action="signPS" data-pid="${p.id}">Sign to practice squad (${fmtMoney(PS_SALARY)})</button>`;
  if (p.tid === u) {
    if (p.expiring && state.phase === 'RESIGN') left += `<button class="primary" data-action="faOpen" data-pid="${p.id}">Negotiate a new contract</button>`;
    left += `<button class="danger" data-action="release" data-pid="${p.id}">Release</button>`;
  } else if (p.waiver) { left += '<div class="small muted">On waivers: claim him from the Waiver Wire tab.</div>';
  } else if (state.phase === 'UDFA' && state.udfa && isUdfa(p)) { const cur = state.udfa.offers[p.id], pl = udfaPathLabel(udfaPath(p, u)); left += `<div class="terms"><div class="small muted" style="margin-bottom:4px">Undrafted rookie · market: <b>${udfaInterest(p)}</b> · his view of your roster: <b>${pl}</b>${cur !== undefined ? ` · your offer: <b>${fmtBonus(cur)}</b>` : ''}</div><div class="row" style="gap:6px">${UDFA_BONUS.map(b => `<button class="sm ${cur === b ? 'primary' : ''}" data-action="udfaOfferBtn" data-pid="${p.id}" data-b="${b}">${b ? fmtBonus(b) : 'No bonus'}</button>`).join('')}${cur !== undefined ? `<button class="sm danger" data-action="udfaOfferBtn" data-pid="${p.id}" data-b="">Withdraw</button>` : ''}</div></div>`;
  } else if (p.tid === -1 && faInMarket(p)) { left += `<button class="primary" data-action="faGo" data-pid="${p.id}">Sit down with his agent</button>`;
  } else if (p.tid === -1 && state.phase !== 'PLAYOFFS' && state.phase !== 'RECAP') left += `<button class="primary" data-action="sign" data-pid="${p.id}">Sign (${fmtMoney(p.ask)})</button>`;
  else if (p.tid >= 0) left += `<button data-action="tradeFor" data-pid="${p.id}">Trade for ${esc(p.last)}</button>`;
  if (p.tid === -2) { const n = pwState().left; left += p.pw ? '<span class="small muted">You have worked him out privately: your numbers are on the Scouting tab.</span>' : `<button ${n ? '' : 'disabled'} data-action="privateWorkout" data-pid="${p.id}" title="He runs every drill again for you alone, including any he skipped. The numbers are yours: the rest of the league does not see them.">Private workout</button><span class="small muted">${n} of ${PW_PER_CLASS} left for this class</span>`; }
  return left;
}
function playerModal(pid, replace) {
  const p = P(pid);
  if (!p) return;
  const prospect = p.tid === -2, tabs = CARD_TABS.filter(([k]) => !prospect || k === 'over' || k === 'scout');
  const tab = tabs.some(([k]) => k === ui.cardTab) ? ui.cardTab : 'over';
  const body = tab === 'scout' ? cardScoutHTML(p) : tab === 'stats' ? cardStatsHTML(p) : tab === 'adv' ? cardAdvHTML(p) : tab === 'contract' ? cardContractHTML(p) : cardOverHTML(p);
  const btn = cardButtonsHTML(p);
  openModal(`<div class="dossier">${cardHeadHTML(p)}<div class="ds-tabs">${tabs.map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" data-action="cardTab" data-v="${k}" data-pid="${p.id}">${l}</button>`).join('')}</div>
    <div class="ds-body">${body}</div>${btn ? `<div class="ds-foot row">${btn}</div>` : ''}</div>`, replace);
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
    ${tsr('Turnovers', t => t.to)}${tsr('Penalties', t => t.pen === undefined ? '—' : `${t.pen}-${t.penY}`)}${tsr('Punts', t => t.punts)}${tsr('Possession', t => fmtClock(t.top))}</tbody></table>`;
  html += filmRoomHTML(b);
  // player stats
  const lines = Object.entries(b.stats).map(([pid, l]) => ({ p: P(pid) || (+pid < 0 ? { id: +pid, first: 'Emergency', last: l.nm || 'Sub', lbl: '—', pos: 'WR', spot: 'WRZ', tid: l.tid } : null), l })).filter(x => x.p);
  const cats = [
    ['Passing', l => l.passA, [['C/Att', l => `${l.passC || 0}/${l.passA}`], ['Yds', l => l.passY || 0], ['TD', l => l.passTD || 0], ['Int', l => l.passInt || 0], ['Sck', l => l.sacked || 0], ['Rtg', l => round1(passerRating(l.passC || 0, l.passA, l.passY || 0, l.passTD || 0, l.passInt || 0))]], l => l.passY || 0],
    ['Rushing', l => l.rushA, [['Car', l => l.rushA], ['Yds', l => l.rushY || 0], ['Avg', l => round1((l.rushY || 0) / l.rushA)], ['TD', l => l.rushTD || 0], ['Lng', l => l.rushLng || 0]], l => l.rushY || 0],
    ['Receiving', l => l.tgt, [['Rec', l => l.rec || 0], ['Tgt', l => l.tgt], ['Yds', l => l.recY || 0], ['YAC', l => l.yac || 0], ['TD', l => l.recTD || 0], ['Lng', l => l.recLng || 0], ['Drp', l => l.drp || 0]], l => l.recY || 0],
    ['Defense', l => (l.tkl || 0) + (l.pd || 0) + (l.dint || 0) + (l.prs || 0), [['Snaps', l => l.snp || 0], ['Tkl', l => l.tkl || 0], ['TFL', l => l.tfl || 0], ['Sck', l => l.sck || 0], ['Prs', l => l.prs || 0], ['Int', l => l.dint || 0], ['PD', l => l.pd || 0], ['FF', l => l.ff || 0]], l => (l.tkl || 0) + (l.sck || 0) * 3 + (l.dint || 0) * 4 + (l.prs || 0)],
    ['Kicking', l => (l.fga || 0) + (l.xpa || 0), [['FG', l => `${l.fgm || 0}/${l.fga || 0}`], ['Lng', l => l.fgLng || 0], ['XP', l => `${l.xpm || 0}/${l.xpa || 0}`]], l => l.fga || 0],
    ['Punting', l => l.pnt, [['No', l => l.pnt], ['Yds', l => l.pntY], ['Avg', l => round1(l.pntY / l.pnt)], ['In 20', l => l.pi20 || 0], ['TB', l => l.ptb || 0]], l => l.pnt],
    ['Returns', l => (l.krA || 0) + (l.prA || 0), [['KR', l => l.krA || 0], ['KR Yds', l => l.krY || 0], ['PR', l => l.prA || 0], ['PR Yds', l => l.prY || 0], ['TD', l => (l.krTD || 0) + (l.prTD || 0)]], l => (l.krY || 0) + (l.prY || 0)],
    ['Coverage and return units', l => (l.stk || 0) > 0 || (l.sts || 0) >= 8, [['ST snaps', l => l.sts || 0], ['ST tkl', l => l.stk || 0]], l => (l.stk || 0) * 100 + (l.sts || 0)],
  ];
  for (const [name, has, cols, sortv] of cats) {
    if (name === 'Kicking') html += `<h3 style="margin:22px 0 0">Special teams</h3>`;
    html += `<div class="section-title">${name}</div><div class="grid g2">`;
    for (const tid of [a, h]) {
      const rows = lines.filter(x => x.l.tid === tid && has(x.l)).sort((x, y) => sortv(y.l) - sortv(x.l)).slice(0, name === 'Defense' ? 30 : 12); // everyone who recorded a stat
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
  const c = v >= 80 ? 'r-elite' : v >= 70 ? 'r-good' : v >= 50 ? 'r-avg' : 'bad';
  return `<span class="r ${c}">${v}</span>`;
}
function teamAdvRows(ta) {
  const per = (x, k, n, d = 2) => x && x[n] ? (x[k] / x[n]).toFixed(d) : '—';
  const pc = (x, k, n) => x && x[n] ? Math.round(100 * (x[k] || 0) / x[n]) + '%' : '—';
  return [
    ['EPA / play', x => per(x, 'epa', 'plays')], ['Success rate', x => pc(x, 'succ', 'plays')], ['Explosive plays', x => (x && x.expl) || 0],
    ['Pass EPA / dropback', x => per(x, 'passEpa', 'db')], ['Rush EPA / carry', x => per(x, 'rushEpa', 'rushN')], ['Pressure rate allowed', x => pc(x, 'prs', 'db')],
    ['Time to throw', x => x && x.tttN ? (x.ttt / x.tttN).toFixed(2) + 's' : '—'], ['aDOT', x => per(x, 'air', 'airN', 1)], ['Early-down pass rate', x => pc(x, 'earlyPass', 'early')],
    ['Runs stuffed', x => pc(x, 'ly0', 'lyN')], ['Line yards / carry (first 5)', x => per(x, 'ly5', 'lyN')], ['Second-level yards / carry', x => per(x, 'ly10', 'lyN')], ['Open-field yards / carry', x => per(x, 'lyOpen', 'lyN')], ['Pressure without a blitz (defense)', x => pc(x, 'nbPrs', 'nbDb')],
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
      { k: 'f', l: '', f: r => `<span class="small muted">${Object.keys(gradeFacets(r.p.spot)).map(f => gradeN(r.x, f) >= 4 ? `${FACETS[f]} ${facetGrade(r.x, f, 0, r.p.spot)}` : '').filter(Boolean).slice(0, 2).join(' · ')}</span>` },
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
    <div class="row" style="margin:10px 0;gap:14px"><span>Game grade ${gradeChip(overallGrade(x, p.spot))}</span>${Object.keys(FACETS).filter(f => gradeN(x, f) >= 3).map(f => `<span class="small">${FACETS[f]} ${gradeChip(facetGrade(x, f, 0, p.spot))} <span class="muted">(${gradeN(x, f)})</span></span>`).join('')}</div>`;
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
    ${state.phase === 'PRESEASON' ? `<div class="small muted" style="margin-bottom:12px">Exhibition. Playing time by group is set on the Roster tab. The result does not count; the film does.</div>` : `<div class="row small" style="margin-bottom:12px"><span>Line: <b>${T(fav).abbr} −${(Math.round(sp * 2) / 2).toFixed(1)}</b></span><span class="muted">·</span><span>Your win chance ≈ <b>${Math.round(pUser * 100)}%</b></span></div>`}
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
    ${b.pre ? preSnapReport(b) : ''}
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
    case 'COACHES': advanceCarousel(); if (state.phase !== 'COACHES' && state.carWrap && !state.settings.autoUser) view = 'carwrap'; break;
    case 'RESIGN': leaveResign(); break;
    case 'FA': advanceFA(); break;
    case 'DRAFT': { const pk = currentPick(); if (pk && pk.owner === state.userTid) simDraftPick(); else simDraftToUser(); break; }
    case 'UDFA': { const res = resolveUdfaRound(); if (!state.settings.autoUser) ui.udfaResult = res; break; }
    case 'PRESEASON': simPreseasonWeek(); if (state.phase === 'CUTDOWN' && !state.settings.autoUser) { view = 'pre'; ui.preTab = 'cut'; } break;
    case 'CUTDOWN': beginWaivers(); if (state.settings.autoUser) resolveWaivers(); else view = 'waivers'; break;
    case 'WAIVERS': { const r = resolveWaivers(); if (!state.settings.autoUser) ui.wvResult = r; if (view === 'waivers') view = 'home'; break; }
  }
}
function phaseLabel() {
  return state.phase === 'PRESEASON' ? 'Playing preseason…' : state.phase === 'REG' ? `Simulating week ${state.week}…` : state.phase === 'PLAYOFFS' ? `Playing ${ROUND_NAMES[state.playoffs.round]}…` : `${PHASE_LABEL[state.phase]}…`;
}

// You may sit over the roster limit between games (a man back from injured reserve, a trade), but not play one.
// Nothing is cut for you: this just sends you to the roster to make the move yourself.
function rosterOver() { if (!state || state.settings.autoUser) return 0; const u = state.userTid; return Math.max(0, rosterCount(u) - rosterLimit()); }
function rosterBlock() {
  const n = rosterOver(); if (!n || ['CUTDOWN', 'WAIVERS'].includes(state.phase)) return false;
  ask({ title: 'Roster over the limit', body: `You have ${rosterCount(state.userTid)} players on a ${rosterLimit()}-man roster. Release, trade or move ${n === 1 ? 'one player' : n + ' players'} to injured reserve or the practice squad before you carry on. Nobody is cut for you.`, yes: 'Go to the roster', no: 'Close' }).then(go => { if (go) { view = 'roster'; render(); } });
  return true;
}

// ---------- actions ----------
const faAct = fn => d => { const pid = +d.pid, was = negMode(P(pid)), err = fn(pid, d); if (err) toast(err); const p = P(pid); if (p && p.tid === state.userTid && was && !negMode(p) && !err) toast('Signed!'); save(); render(); if (ui.faNeg === pid) faNegotiate(pid, true); const lg = document.getElementById('faLog'); if (lg) lg.scrollTop = lg.scrollHeight; };
const actions = {
  faPick: d => { ui.faSel = +d.pid; render(); const lg = document.getElementById('faLog'); if (lg) lg.scrollTop = lg.scrollHeight; },
  faGo: d => { ui.faSel = +d.pid; ui.faView = 'now'; ui.faPos = 'ALL'; ui.faF = null; view = 'fa'; closeModal(); render(); },
  faSortA: d => { ui.faSort = d.v; render(); },
  faLV: d => { ui.faLV = d.v; render(); },
  agent: d => agentModal(+d.aid),
  faInboxX: () => { state.fa.inbox = []; save(); render(); },
  faSeg: d => { const p = P(+d.pid); faIn(p)[d.f] = d.f === 'yrs' ? +d.v : d.v; if (ui.faNeg === p.id) faNegotiate(p.id, true); else render(); },
  faOpen: d => { faNegotiate(+d.pid); save(); render(); },
  faIncAdd: d => { const p = P(+d.pid), i = faIn(p), o = incOptions(p), used = (i.inc || []).map(x => x.m), q = o.find(x => !used.some(m => m.split(':')[0] === x.k)) || o[0]; (i.inc = i.inc || []).push({ m: q.k + ':' + q.th, amt: round2(Math.max(0.1, faExp(p) * 0.08)) }); faNegotiate(p.id, true); },
  faIncX: d => { const p = P(+d.pid); faIn(p).inc.splice(+d.i, 1); faNegotiate(p.id, true); },
  faCall: d => { faNegotiate(+d.pid); save(); render(); },
  faCommit: faAct(pid => { const i = faIn(P(pid)); return faSayCommit(pid, +i.yrs, +i.bonus || 0); }),
  faSalary: faAct(pid => { const p = P(pid), i = faIn(p), o = faDraft(p); return faSaySalary(pid, +i.sal || 0, o.load, o.inc); }),
  faHoldA: faAct(pid => faHold(pid)),
  faFinalA: faAct(pid => faFinal(pid)),
  faStandA: faAct(pid => faStand(pid)),
  faLeaveA: faAct((pid, d) => faLeave(pid, !!d.dl)),
  faBack: faAct(pid => faBackToCommit(pid)),
  faWalkA: d => { const p = P(+d.pid); if (negMode(p) !== 'fa') { ui.faNeg = null; closeModal(); return; } faAct(pid => faWalk(pid))(d); },
  faPullA: faAct(pid => faWithdraw(pid)),
  faOrderA: faAct(pid => { const i = faIn(P(pid)); return faOrder(pid, +i.max || 0, i.jobs); }),
  faOrderX: faAct(pid => faOrder(pid, 0)),
  nav: d => { view = d.view; ui.more = false; ui.mPop = null; render(); window.scrollTo(0, 0); },
  mPop: d => { ui.mPop = d.h || null; render(); },
  navHead: d => { const h = navTree().find(x => x[0] === d.h); if (!h) return; if (isPhone() && (h[2].length > 1 || h[0] === 'settings')) { ui.mPop = ui.mPop === d.h ? null : d.h; render(); return; } ui.mPop = null; const last = (ui.navLast || {})[d.h], hot = navHot(), ok = v => h[2].some(y => y[0] === v); view = navHeadOf(view) === d.h ? view : ok(hot) ? hot : ok(last) ? last : h[2][0][0]; ui.more = false; render(); window.scrollTo(0, 0); },
  more: () => { ui.more = !ui.more; render(); },
  dchUp: d => { const k = d.key, i = +d.i, list = (ensureChart(state.userTid).lists[k] || []); if (i > 0 && list[i]) { setChart(state.userTid, k, i - 1, list[i]); save(); render(); } },
  newLeague: d => { busy('Building league…'); setTimeout(() => { newLeague(+d.tid); save(); view = 'home'; busy(null); render(); }, 10); },
  continueSave: () => { load().then(ok => { if (ok) render(); else toast('Could not read the saved league.'); }); },
  importClick: () => $('#importFile').click(),
  export: () => exportSave(),
  newGame: async () => { if (await ask({ title: 'Start a new league?', body: 'Your current league will be overwritten. Export it first if you want to keep it.', yes: 'Start over', no: 'Keep this league', danger: true })) { state = null; deleteSave(); render(); } },
  continue: async () => {
    if (rosterBlock()) return;
    if (state.phase === 'RESIGN' && !state.settings.autoUser) {
      const n = rosterOf(state.userTid).filter(p => p.expiring).length;
      if (n && !await ask(`${n} expiring player(s) will leave in free agency. Continue?`)) return;
    }
    if (state.phase === 'UDFA' && !state.settings.autoUser && state.udfa.round >= UDFA_ROUNDS - 1) {
      const n = rosterOf(state.userTid).length + Object.keys(state.udfa.offers).length;
      if (n < ROSTER_MAX + 8 && !await ask(`This is the last round and you would go to camp with at most ${n} players. Nobody will be signed for you. Open camp anyway?`)) return;
    }
    if (state.phase === 'CUTDOWN' && !state.settings.autoUser) {
      const gone = v => v === 'cut' || v === 'ps';
      const short = rosterShortfalls(state.userTid), have = rosterOf(state.userTid).filter(p => countsOn53(p) && !gone(state.cut.plan[p.id])).length;
      if ((short.length || have < ROSTER_MAX) && !await ask(`${have < ROSTER_MAX ? `You only have ${have} of ${ROSTER_MAX} roster spots filled. ` : ''}${short.length ? `You are short at: ${short.join(', ')}. ` : ''}Nobody will be signed for you. Start the season anyway?`)) return;
      const left = have - ROSTER_MAX;
      if (left > 0) { await ask({ title: 'Roster is not set', body: `You still need to cut ${left} more player${left === 1 ? '' : 's'} to reach ${ROSTER_MAX}. Nobody is cut for you: make the calls on the Preseason page, or press "Use the staff's recommendations" there.`, yes: 'Go to the cuts', no: 'Close' }); view = 'pre'; ui.preTab = 'cut'; render(); return; }
    }
    if (state.phase === 'COACHES' && !state.settings.autoUser && state.car && state.car.raids && state.car.raids.length) {
      if (!await ask({ title: 'Unanswered offers', body: 'These coaches leave your staff if you advance without answering:', list: state.car.raids.map(r => `${cname(C(r.cid))} → ${T(r.tid).abbr} ${roleName(r.role).toLowerCase()}`), yes: 'Let them go', no: 'Go back', danger: true })) { view = 'coaches'; render(); return; }
    }
    if (state.phase === 'DRAFT' && !state.settings.autoUser) { const pk = currentPick(); if (pk && pk.owner === state.userTid && !await ask({ title: 'Let the staff make this pick?', body: `You are on the clock at pick ${pk.inRound} of round ${pk.round}. The staff will choose for you.`, yes: 'Let the staff pick', no: 'I will pick' })) return; }
    if ((state.phase === 'REG' || state.phase === 'PLAYOFFS' || state.phase === 'PRESEASON') && !state.settings.autoUser && userMatchup()) {
      const pr = chartProblems(state.userTid);
      if (pr.length && !await ask(`Your depth chart is not complete:\n\n${pr.slice(0, 8).map(p => '• ' + p.text).join('\n')}${pr.length > 8 ? '\n• and ' + (pr.length - 8) + ' more' : ''}\n\nThe staff will fill these gaps for this game only (your chart is not changed). Play anyway?`)) { view = 'depth'; render(); return; }
    }
    if ((state.phase === 'REG' || state.phase === 'PLAYOFFS') && !state.settings.autoUser && userMatchup()) {
      const short = lineupShort(state.userTid);
      if (short.length && !await ask(`You are short-handed at ${short.join(', ')}. Nobody will be promoted or signed for you. Play anyway?`)) return;
    }
    if (state.phase === 'REG' || state.phase === 'PLAYOFFS' || state.phase === 'PRESEASON') {
      if (state.phase === 'PRESEASON' && !state.pre) { if (!await ask({ title: 'Open training camp?', body: 'Camp opens with a staff meeting and the reps chart: who works where, and with which string. Nothing is practiced until you say so. Other clubs fill their camp rosters now.', yes: 'Open camp', no: 'Not yet' })) return; startPreseason(); ui.preTab = 'meet'; view = 'pre'; save(); render(); window.scrollTo(0, 0); return; }
      if (state.phase === 'PRESEASON' && state.pre && !preCamped() && !state.settings.autoUser) { campRun(); ui.preTab = 'track'; ui.trkSort = 'grade'; view = 'pre'; save(); render(); window.scrollTo(0, 0); return; } // two weeks of camp, then stop and look
      if (state.settings.gamePopups !== false && userMatchup()) { pregameModal(); return; }
      playWeek(false);
    } else { stepContinue(); save(); render(); if (ui.udfaResult) { const r = ui.udfaResult; ui.udfaResult = null; udfaResultModal(r); } if (ui.wvResult) { const r = ui.wvResult; ui.wvResult = null; waiverResultModal(r); } }
  },
  playGame: d => { closeModal(); playWeek(d.recap !== '0'); },
  popupsOff: () => { state.settings.gamePopups = false; save(); closeModal(); playWeek(false); toast('Game popups off. Turn them back on in Settings.'); },
  simPlayoffs: async () => {
    const ph = state.phase;
    if (rosterBlock()) return;
    if (!await ask(ph === 'REG' ? { title: 'Sim to the playoffs?', body: `The rest of the regular season is played back to back${state.week ? ` (from week ${state.week})` : ''}. In between games you will not get to:`, list: ['Adjust your depth chart or game plan', 'Replace injured players or work the waiver wire', 'Change the practice plan'], yes: 'Sim to the playoffs', no: 'Keep playing' } : { title: 'Finish the playoffs?', body: 'Every remaining playoff game is played without stopping, yours included.', yes: 'Finish the playoffs', no: 'Keep playing' })) return;
    if (ph === 'REG') runSteps(simWeek, () => state.phase !== 'REG', phaseLabel);
    else runSteps(simPlayoffRound, () => state.phase !== 'PLAYOFFS', phaseLabel);
  },
  simDraft: async () => {
    if (!await ask({ title: 'Sim the rest of the draft?', body: 'The staff makes <b>every pick you have left</b>, by its own board and its own read of your needs.', yes: 'Sim the draft', no: 'Keep picking' })) return;
    const prev = state.settings.autoUser;
    state.settings.autoUser = true; simDraftToUser(); state.settings.autoUser = prev;
    save(); render();
  },
  simYear: async () => {
    if (!await ask({ title: 'Sim to next season?', body: 'The staff runs your team until next season kicks off. You will not be asked about any of it:', list: ['The rest of this season and the playoffs', 'The coaching search and re-signings', 'Free agency and the draft', 'Camp, the preseason and the final cuts'], yes: 'Sim to next season', no: 'Keep playing' })) return;
    const startSeason = state.season, prev = state.settings.autoUser;
    state.settings.autoUser = true;
    runSteps(stepContinue, () => state.season > startSeason && state.phase === 'REG', phaseLabel).then(() => { state.settings.autoUser = prev; save(); render(); });
  },
  sort: d => {
    const cur = sortState[d.table];
    sortState[d.table] = cur && cur.k === d.k ? { k: d.k, dir: -cur.dir } : { k: d.k, dir: -1 };
    render();
  },
  msortDir: d => { const cur = sortState[d.table]; sortState[d.table] = { k: cur ? cur.k : d.k, dir: cur ? -cur.dir : 1 }; render(); },
  mview: d => { ui.mtable = !!d.v; render(); },
  player: d => playerModal(+d.pid),
  team: d => { ui.rosterTid = +d.tid; view = 'roster'; closeModal(); render(); window.scrollTo(0, 0); },
  box: d => boxModal(+d.gid),
  seasonOpen: d => { ui.seasonYr = d && d.s ? +d.s : null; view = 'season'; closeModal(true); render(); window.scrollTo(0, 0); },
  campTab: d => { ui.preTab = d.tab === 'report' ? 'track' : d.tab; render(); },
  bubUnit: d => { ui.bubUnit = d.v; render(); },
  campRoom: d => { ui.campRoom = d.room; ui.planOther = null; render(); },
  campRoomStep: d => { const i = Math.max(0, PLAN_ROOMS.findIndex(r => r[0] === ui.campRoom)); ui.campRoom = PLAN_ROOMS[(i + +d.dir + PLAN_ROOMS.length) % PLAN_ROOMS.length][0]; ui.planOther = null; render(); },
  planMove: d => { planMove(+d.gid, +d.pid, +d.dir); save(); render(); },
  planRemove: d => { planRemove(+d.gid, +d.pid); save(); render(); },
  planGroupMove: d => { planGroupMove(+d.gid, +d.dir); save(); render(); },
  planDelete: async d => { const g = planGroup(+d.gid); if (!g) return; if (g.pids.length && !await ask({ title: `Delete "${g.name}"?`, body: 'The group goes away. The players stay on your roster and in camp.', yes: 'Delete group', no: 'Keep it', danger: true })) return; planDelete(+d.gid); save(); render(); },
  planReset: async d => { if (!await ask({ title: 'Reset this room?', body: 'Your groups in this room are replaced with a fresh set from the staff\'s chart.', yes: 'Reset', no: 'Keep mine', danger: true })) return; planSeedRoom(state.userTid, d.room); save(); render(); },
  planFromBattle: d => { const b = state.camp.battles.find(x => x.id === d.bid); if (b) planNew(d.room, b.label, battleBoard(b).map(r => r.p.id)); save(); render(); },
  planOtherClose: () => { ui.planOther = null; render(); },
  schedPart: d => { ui.schedPart = d.part; ui.schedWeekA = 1; render(); },
  cardScope: d => { ui.cardScope = d.v; playerModal(+d.pid, true); },
  cardTab: d => { ui.cardTab = d.v; playerModal(+d.pid, true); },
  preTab: d => { ui.preTab = d.v; render(); },
  meetRole: d => { ui.meetRole = d.v; render(); },
  meetAll: d => { const u = state.userTid, room = d.v; for (const a of repsAdvice(u)) { const p = P(a.pid); if (!p) continue; const rk = preRoomOf(p); if (rk === room) repsToString(a.k, a.pid, a.cs); } save(); render(); },
  repsUnit: d => { ui.repsUnit = d.v; ui.repsJob = null; ui.repsPid = null; render(); },
  repsGrp: d => { const un = ['off', 'def', 'st'].includes(ui.repsUnit) ? ui.repsUnit : 'off'; (ui.repsGrp = ui.repsGrp || {})[un] = d.v; ui.repsJob = null; render(); },
  repsJob: d => { ui.repsJob = d.k; render(); },
  repsMan: d => { ui.repsPid = +d.pid; if (d.k) ui.repsJob = d.k; render(); },
  repsPut: d => { const e = repsPlace(null, +d.pid, d.k, (state.reps.jobs[d.k] || []).length); if (e) toast(e); else ui.repsPid = +d.pid; save(); render(); },
  repsSel: d => { const s = ui.repsSel; ui.repsSel = s && s.k === d.k && s.pid === +d.pid ? null : { k: d.k, pid: +d.pid }; render(); },
  repsMv: d => { repsMove(d.k, +d.pid, +d.d); save(); render(); },
  repsDo: d => { repsToString(d.k, +d.pid, +d.s); save(); render(); },
  repsRm: d => { const e = repsRemove(d.k, +d.pid); if (e) toast(e); else ui.repsSel = null; save(); render(); },
  repsRs: d => { repsReset(d.k || null); ui.repsSel = null; save(); render(); },
  repsGo: d => { const j = REP_JOB[d.k]; ui.preTab = 'reps'; ui.repsUnit = j ? j[4] : 'off'; ui.repsJob = d.k; ui.repsPid = +d.pid; render(); },
  trk: d => { const o = ui.trkOpen || (ui.trkOpen = {}); if (o[d.pid]) delete o[d.pid]; else o[d.pid] = 1; render(); },
  trkRoom: d => { ui.trkRoom = d.v; render(); },
  privateWorkout: d => { const err = privateWorkout(+d.pid); if (err) toast(err); else { ui.cardTab = 'scout'; save(); } playerModal(+d.pid, true); },
  planView: d => { ui.planView = d.v; render(); },
  askYes: () => askDone(true),
  askNo: () => askDone(false),
  closeModal: () => closeModal(),
  closeModalAll: () => closeModal(true),
  cardView: d => { ui.cardView = d.v; playerModal(+d.pid, true); },
  release: async d => {
    const p = P(+d.pid);
    if (state.phase === 'RESIGN' && p.expiring) { toFreeAgency(p); addNews(`${T(state.userTid).abbr} let ${p.lbl} ${pname(p)} walk.`, [state.userTid]); }
    else {
      const d = deadIfCut(p);
      if (!await ask({ title: `Release ${pname(p)}?`, body: d.now + d.next ? `Dead money: <b>${fmtMoney(d.now)}</b> this year${d.next ? ` and <b>${fmtMoney(d.next)}</b> next year` : ''}.` : 'He comes off your books with no dead money.', yes: 'Release him', no: 'Keep him', danger: true })) return;
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
  pbTab: d => { ui.pbTab = d.v; render(); },
  pbPers: d => { ui.pbPers = d.v; ui.pbPkg = { '10': 'DIME', '11': 'NICKEL', '12': 'BASE', '13': 'BASE', '21': 'BASE', '22': 'BASE', JUMBO: 'GL' }[d.v] || ui.pbPkg; render(); },
  pbForm: d => { ui.pbForm = d.v; render(); },
  pbPkg: d => { ui.pbPkg = d.v; render(); },
  pbFm: d => { ui.pbFm = d.k; render(); },
  pbLook: d => { ui.pbLook = d.k; if (d.pkg === 'BASE') ui.pbPkg = 'BASE'; else if (ui.pbPkg !== 'NICKEL' && ui.pbPkg !== 'DIME') ui.pbPkg = 'NICKEL'; render(); },
  dcJob: d => { ui.dcJob = d.key; ui.dchPid = null; render(); },
  dcGrp: d => { const tab = ['def', 'off', 'st'].includes(ui.dchTab) ? ui.dchTab : 'def'; (ui.dcGrp = ui.dcGrp || {})[tab] = d.v; ui.dcJob = null; ui.dchPid = null; render(); },
  dcLook: d => { (ui.dchView = ui.dchView || {})[['def', 'off'].includes(ui.dchTab) ? ui.dchTab : 'def'] = d.v; render(); },
  dcPass: d => { ui.dcPass = d.v; render(); },
  dcFm: d => { ui.dcFm = d.k; render(); },
  dcOut: d => { const keep = ui.dchPid; ui.dcOut = +d.pid || null; ui.dchPid = keep || +d.pid || null; render(); },
  dcRemove: d => { setChart(state.userTid, d.key, +d.i, 0); save(); render(); },
  dcAdd: d => { const blocked = !ui.dchAll && chartBlocked(state.userTid, d.key, +d.pid); if (blocked) { toast(blocked); return; } const cc = ensureChart(state.userTid); setChart(state.userTid, d.key, (cc.lists[d.key] || []).length, +d.pid); save(); render(); },
  dcOvClear: d => { const tab = ['def', 'off'].includes(ui.dchTab) ? ui.dchTab : 'def', t = T(state.userTid), views = dcViews(t, tab), vid = views.some(v => v.id === (ui.dchView || {})[tab]) ? ui.dchView[tab] : views[0].id; setOverride(state.userTid, tab, vid, ui.dcPass === '1', d.name, 0); save(); render(); },
  dchPick: d => { ui.dchKey = d.key; render(); },
  dchView: d => { (ui.dchView = ui.dchView || {})[ui.dchTab || 'off'] = d.v; render(); },
  dchTab: d => { ui.dchTab = d.tab; ui.dcJob = null; ui.dchPid = null; render(); },
  dchMan: d => { ui.dchPid = +d.pid; render(); }, // the small card on the depth chart follows the man you click
  dchRemove: d => { setChart(state.userTid, d.key, +d.i, 0); save(); render(); },
  dchAdd: d => { const blocked = !ui.dchAll && chartBlocked(state.userTid, d.key, +d.pid); if (blocked) { toast(blocked); return; } const cc = ensureChart(state.userTid); if (cc.auto[CHART_UNIT(d.key)]) setChartAuto(state.userTid, CHART_UNIT(d.key), false); const l = cc.lists[d.key] || []; setChart(state.userTid, d.key, l.length, +d.pid); save(); render(); },
  dchAuto: d => { setChartAuto(state.userTid, d.unit, d.on === '1'); save(); render(); },
  autoCut: () => { const c = autoCut(state.userTid, ROSTER_MAX, false); toast(`Released ${c.length} player(s).`); save(); render(); },
  sign: d => { const err = signFA(+d.pid, state.userTid); if (err) toast(err); else toast('Signed!'); closeModal(); save(); render(); },
  statCat: d => { ui.statCat = d.cat; render(); },
  statSide: d => { ui.statSide = d.v; render(); },
  statPer: d => { ui.statPer = d.v; render(); },
  pracRoom: d => { ui.pracRoom = d.pos === ui.pracRoom && d.toggle ? null : d.pos; render(); const el = document.getElementById('pracDetail'); if (el && d.toggle) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); },
  faReset: () => { ui.faF = null; render(); },
  faPos: d => { ui.faPos = d.pos; render(); },
  udfaMine: d => { ui.udfaMine = !!d.v; render(); },
  faView: d => { ui.faView = d.v; render(); },
  repMove: d => { moveReps(+d.pid, +d.d); save(); render(); },
  udfaOfferBtn: d => { const err = udfaOffer(+d.pid, d.b === '' ? null : +d.b); if (err) toast(err); save(); playerModal(+d.pid, true); render(); },
  srchFam: d => { (ui.search || (ui.search = Object.assign({}, SEARCH_DEF))).fam = d.pos; render(); },
  cutFam: d => { ui.cutFam = d.pos; render(); },
  cutView: d => { ui.cutView = d.v; render(); },
  cutToggle: d => { const pl = state.cut.plan; if (pl[d.pid] === 'cut') delete pl[d.pid]; else pl[d.pid] = 'cut'; save(); render(); },
  cutSet: d => {
    const pl = state.cut.plan, p = P(+d.pid);
    if (d.v === 'ps') { const marked = Object.keys(pl).filter(id => pl[id] === 'ps' && +id !== p.id).map(id => P(+id)).filter(Boolean);
      if (marked.length >= PS_MAX) { toast('Your practice squad is full (' + PS_MAX + ')'); return; }
      if (psVet(p) && marked.filter(psVet).length >= PS_VETS) { toast('Only ' + PS_VETS + ' practice squad spots can go to players with 3+ seasons'); return; } }
    if (d.v === 'keep') delete pl[d.pid]; else pl[d.pid] = d.v; save(); render();
  },
  wvClaim: d => { const p = P(+d.pid); if (state.wv.claims[p.id] !== undefined) { waiverClaim(p.id, null); save(); render(); return; }
    const err = waiverClaim(p.id, 0); if (!err) { save(); render(); return; }
    if (/roster is full/.test(err)) { waiverDropModal(p.id); return; } toast(err); },
  wvClaimDrop: d => { const err = waiverClaim(+d.pid, +d.drop); if (err) toast(err); closeModal(); save(); render(); },
  wvWant: d => { wantForPS(+d.pid, !state.wv.want[d.pid]); save(); render(); },
  wvFam: d => { ui.wvFam = d.pos; render(); },
  futures: d => { const err = signFutures(+d.pid); toast(err || 'Signed to a reserve/future deal.'); save(); render(); },
  preFeat: d => { const pl = state.prePlan, id = +d.pid; if (d.v === 'feat') { pl.feat[id] = 1; delete pl.hold[id]; } else if (d.v === 'hold') { pl.hold[id] = 1; delete pl.feat[id]; } else { delete pl.feat[id]; delete pl.hold[id]; } save(); if (d.card) playerModal(id, true); render(); },
  cutStaff: () => { const prev = cutPreview(state.userTid); state.cut.plan = {}; prev.cuts.forEach(id => state.cut.plan[id] = 'cut'); save(); render(); },
  cutClear: () => { state.cut.plan = {}; save(); render(); },
  srchReset: () => { ui.search = Object.assign({}, SEARCH_DEF); render(); },
  rosterPos: d => { ui.rosterPos = d.pos; render(); },
  draftPos: d => { ui.draftPos = d.pos; render(); },
  newsMine: d => { ui.newsMine = d.v === '1'; render(); },
  draftOffer: d => { const err = draftAcceptOffer(+d.i); if (err) toast(err); else { toast('Trade made.'); simDraftToUser(); } save(); render(); },
  draftPick: d => {
    draftPlayer(+d.pid);
    simDraftToUser();
    save(); render();
  },
  fireCoach: async d => { const c = staffCoach(T(state.userTid), d.role); if (!c) return; const owed = owedIfFired(c); if (!await ask({ title: `Let ${cname(c)} go?`, body: owed ? `He is owed <b>${fmtMoney(owed)}</b>, which stays on this year's staff budget.` : 'Nothing is owed on his deal.', yes: 'Let him go', no: 'Keep him', danger: true })) return; const err = userFire(d.role); if (err) toast(err); save(); render(); },
  searchTab: d => { ui.searchTab = d.tab; render(); },
  searchRole: d => { ui.searchRole = d.role; ui.searchTab = SPEC_ROLES.includes(d.role) ? 'SPEC' : POS_ROLES.includes(d.role) ? 'POS' : d.role; render(); },
  interview: d => { const err = interview(+d.cid, d.role); if (err) toast(err); else { save(); render(); actions.negOpen({ cid: d.cid, role: d.role || C(+d.cid).role }); } },
  raidKeep: d => { toast(answerRaid(+d.i, true)); save(); render(); },
  raidGo: async d => { const r = state.car && state.car.raids[+d.i]; if (!r) return; const c = C(r.cid); if (!await ask({ title: `Let ${cname(c)} go?`, body: `He leaves for ${T(r.tid).abbr} now and his job on your staff opens up.`, yes: 'Let him go', no: 'Not yet', danger: true })) return; toast(answerRaid(+d.i, false)); save(); render(); },
  negOpen: d => { const c = C(+d.cid), role = d.role || c.role; const dm = demandsOf(c, role); ui.neg = { cid: c.id, role, call: dm.call !== 'none' && !(callSide(c, role) && callHeldBy(T(state.userTid), callSide(c, role))), slots: {}, resign: !!dm.resign, sal: dm.sal, yrs: dm.yrs, gtd: dm.gtd }; ui.negOpen = false; negModal(); },
  negAll: d => { const n = ui.neg, t = T(state.userTid); n.slots = {}; if (d.v === '1') for (const g of demandsOf(C(n.cid), n.role).slots) if (!(t.locks && t.locks[g.role] && C(t.locks[g.role]) && C(t.locks[g.role]).tid === t.id)) n.slots[g.role] = g.cid; negModal(); },
  negOffer: () => { const n = ui.neg, err = userHire(n.cid, n); if (err) { toast(err); negModal(); return; } toast('He signed.'); ui.negOpen = false; closeModal(true); save(); render(); },
  reqYes: d => { const err = answerRequest(+d.i, true); if (err) toast(err); save(); render(); },
  reqNo: d => { answerRequest(+d.i, false); save(); render(); },
  coach: d => coachModal(+d.cid),
  coachSel: d => { ui.staffSel = +d.cid; render(); },
  film: d => filmModal(+d.gid, +d.pid),
  advGrp: d => { ui.advGrp = d.g; render(); },
  coachRole: d => { ui.coachRole = d.role; render(); },
  hireCoach: d => { hireCoach(state.userTid, +d.cid); closeModal(); save(); render(); },
  asstPool: d => asstPoolModal(d.role),
  asstHire: d => { const c = C(+d.cid); if (c && c.tid < 0 && isAsst(c)) setAsst(T(state.userTid), c.role, c); closeModal(true); save(); render(); },
  asstPromote: async d => { const c = C(+d.cid);
    if (c && ['OC', 'DC', 'STC'].includes(c.role) && !(await ask({ title: `Make ${cname(c)} your head coach?`, body: `He would want <b>${fmtMoney(promoteHeadCost(c))}</b> a year. His old job opens up.${c.role === 'STC' ? ' He has never called plays: your coordinators keep the call sheets and he runs the game and the building.' : ' He keeps his side of the ball and may keep the play sheet.'} What kind of head coach he turns out to be is not known until he does the job.`, yes: 'Promote him', no: 'Not now' }))) return;
    const err = userPromote(+d.cid); if (err) toast(err); save(); render(); },
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
  dotSet: v => { T(state.userTid).dot = +v; save(); },
  pbTabSet: v => { ui.pbTab = v; },
  eqbSet: v => { T(state.userTid).eqb = +v; save(); },
  faIncM: (v, el) => { const p = P(+el.dataset.pid); faIn(p).inc[+el.dataset.i].m = v; setTimeout(() => { if (ui.faNeg === p.id) faNegotiate(p.id, true); }, 0); },
  rosterTeam: v => { ui.rosterTid = +v; },
  rosterView: v => { ui.rosterView = v; },
  msort: (v, el) => { sortState[el.dataset.table] = { k: v, dir: -1 }; },
  negCall: (v, el) => { ui.neg.call = el.checked; negModal(); },
  negSlot: (v, el) => { if (el.checked) ui.neg.slots[el.dataset.role] = +el.dataset.g; else delete ui.neg.slots[el.dataset.role]; negModal(); },
  negResign: (v, el) => { ui.neg.resign = el.checked; negModal(); },
  negSal: v => { ui.neg.sal = Math.max(0.1, +v || 0.1); negModal(); },
  negYrs: v => { ui.neg.yrs = +v; ui.neg.gtd = Math.min(ui.neg.gtd, ui.neg.yrs); negModal(); },
  negGtd: v => { ui.neg.gtd = +v; negModal(); },
  preStarters: v => { state.prePlan.starters = v; save(); },
  preShare: (v, el) => { const pl = state.prePlan; pl.share = pl.share || {}; if (+v < 0) delete pl.share[el.dataset.pos]; else pl.share[el.dataset.pos] = +v; save(); },
  workSet: (v, el) => { setWork(+el.dataset.pid, el.dataset.part, v); save(); if (el.dataset.card) playerModal(+el.dataset.pid, true); },
  xtSet: (v, el) => { setCrossTrain(+el.dataset.pid, v || null); save(); if (el.dataset.card) playerModal(+el.dataset.pid, true); render(); },
  udfaOffer: (v, el) => { const err = udfaOffer(+el.dataset.pid, v === '' ? null : +v); if (err) toast(err); save(); render(); },
  faF: (v, el) => { (ui.faF || (ui.faF = Object.assign({}, FA_DEF)))[el.dataset.f] = v; },
  faChk: (v, el) => { (ui.faF || (ui.faF = Object.assign({}, FA_DEF)))[el.dataset.f] = el.checked; },
  srch: (v, el) => { (ui.search || (ui.search = Object.assign({}, SEARCH_DEF)))[el.dataset.f] = v; },
  srchChk: (v, el) => { (ui.search || (ui.search = Object.assign({}, SEARCH_DEF)))[el.dataset.f] = el.checked; },
  staffTeam: v => { ui.staffTid = +v; },
  pbTeam: v => { ui.pbTid = +v; },
  schedWeek: v => { ui.schedWeek = +v; },
  statSeason: v => { ui.statSeason = +v; },
  statTeam: v => { ui.statTeam = v === '' ? null : +v; },
  tradeTeam: v => { ui.tradeTid = +v; ui.get = { players: [], picks: [] }; },
  histTeam: v => { ui.histTid = +v; },
  seasonPick: v => { ui.seasonYr = +v; },
  schedYr: v => { ui.schedYr = +v; ui.schedWeekA = 1; },
  schedWeekA: v => { ui.schedWeekA = +v; },
  planNew: (v, el) => { planNew(el.dataset.room, v); save(); },
  planName: (v, el) => { const g = planGroup(+el.dataset.gid), n = String(v || '').trim().slice(0, 40); if (g && n) g.name = n; save(); },
  repsAdd: (v, el) => { if (!v) return; const e = repsAdd(el.dataset.k, +v); if (e) toast(e); else ui.repsHi = +v; save(); render(); },
  repsAlso: (v, el) => { if (!v) return; const e = repsAdd(v, +el.dataset.pid); if (e) toast(e); save(); render(); },
  trkSort: v => { ui.trkSort = v; render(); },
  planAdd: (v, el) => { if (v === 'other') { ui.planOther = +el.dataset.gid; return; } if (v) planAdd(+el.dataset.gid, +v); save(); },
  autoUser: (v, el) => { state.settings.autoUser = el.checked; save(); toast(el.checked ? 'Auto-manage on.' : 'Auto-manage off.'); },
  showTrue: (v, el) => { state.settings.showTrue = el.checked; save(); },
  gamePopups: (v, el) => { state.settings.gamePopups = el.checked; save(); },
  theme: v => { state.settings.theme = v; save(); },
  dch: (v, el) => { setChart(state.userTid, el.dataset.key, +el.dataset.i, v ? +v : 0); save(); },
  dchAll: (v, el) => { ui.dchAll = el.checked; },
  dchRot: (v, el) => { const cc = ensureChart(state.userTid); cc.rot[el.dataset.key] = +v; if (cc.auto[CHART_UNIT(el.dataset.key)]) setChartAuto(state.userTid, CHART_UNIT(el.dataset.key), false); save(); },
};

// depth chart drag & drop: a player (from the bench, a job card or the field) onto a place in a job's order, or onto a spot on the field
let dcDrag = null;
document.addEventListener('dragstart', e => {
  const el = e.target.closest && e.target.closest('[data-dcp]');
  if (!el) return;
  dcDrag = { pid: +el.dataset.dcp };
  el.classList.add('drag'); document.body.classList.add('dc-dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(dcDrag.pid));
});
document.addEventListener('dragend', () => { document.querySelectorAll('.drag').forEach(x => x.classList.remove('drag')); document.querySelectorAll('.dc-over').forEach(x => x.classList.remove('dc-over')); document.body.classList.remove('dc-dragging'); dcDrag = null; });
const dcTarget = e => e.target.closest && (e.target.closest('[data-dcov]') || e.target.closest('[data-dci]') || e.target.closest('.dcj'));
document.addEventListener('dragover', e => {
  const t = dcDrag && dcTarget(e); if (!t) return;
  e.preventDefault();
  document.querySelectorAll('.dc-over').forEach(x => x !== t && x.classList.remove('dc-over'));
  t.classList.add('dc-over');
});
document.addEventListener('drop', e => {
  const t = dcDrag && dcTarget(e); if (!t) return;
  e.preventDefault();
  const d = dcDrag, u = state.userTid; dcDrag = null; document.body.classList.remove('dc-dragging');
  if (t.dataset.dcov !== undefined) { // onto the field: this look only
    const tab = ['def', 'off'].includes(ui.dchTab) ? ui.dchTab : 'def', tm = T(u), views = dcViews(tm, tab), vid = views.some(v => v.id === (ui.dchView || {})[tab]) ? ui.dchView[tab] : views[0].id;
    const blocked = chartBlocked(u, t.dataset.key || '', d.pid); if (blocked) { toast(blocked); render(); return; }
    setOverride(u, tab, vid, ui.dcPass === '1', t.dataset.dcov, d.pid); save(); render(); return;
  }
  const key = t.dataset.dcjob || t.dataset.key, cc = ensureChart(u);
  if (!key) { render(); return; }
  const blocked = !ui.dchAll && chartBlocked(u, key, d.pid); if (blocked) { toast(blocked); render(); return; }
  setChart(u, key, t.dataset.dci !== undefined ? +t.dataset.dci : (cc.lists[key] || []).length, d.pid);
  ui.dcJob = key; save(); render();
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
  if (e.target.id === 'ask') { askDone(false); return; }
  if (e.target.id === 'modal') { closeModal(true); return; }
  if (window.matchMedia && window.matchMedia('(hover: none)').matches && !e.target.closest('button, select, input, a, [data-action]')) { const tt = e.target.closest('[title], [data-tip]'), tx = tt && (tt.getAttribute('title') || tt.dataset.tip); if (tx) toast(tx); }
  if (navPressed && e.target.closest('[data-action="nav"]')) { navPressed = null; return; }
  navPressed = null;
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el.dataset, el); }
});
// numbers typed into the sit-down are kept without redrawing the page (a redraw between the keystroke and the click would eat the click)
document.addEventListener('input', e => {
  const el = e.target.closest && e.target.closest('[data-fain]'); if (!el || !state) return;
  const p = P(+el.dataset.pid); if (!p) return; const i = faIn(p), f = el.dataset.fain, v = el.value === '' ? 0 : +el.value;
  if (f.startsWith('inc')) { const x = (i.inc || [])[+f.slice(3)]; if (x) x.amt = v; } else i[f] = v;
  if (ui.faNeg === p.id) for (const [id, fn] of [['faHead', faHeadHTML], ['faDoc', faDocHTML], ['faCap', faCapTableHTML]]) { const n = document.getElementById(id); if (n) n.innerHTML = fn(p); } // the contract rewrites itself as you type
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-change]');
  if (!el) return;
  const fn = changes[el.dataset.change];
  if (fn) { fn(el.value, el); render(); }
});
document.addEventListener('toggle', e => { const el = e.target; if (el && el.dataset && el.dataset.fold) (ui.fold || (ui.fold = {}))[el.dataset.fold] = el.open; }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (askResolve) askDone(false); else closeModal(); } });
document.addEventListener('keydown', e => { // ← → walks the rooms of the squad planner
  if (!state || !['pre', 'camp', 'cutdown'].includes(view) || !preOpen() || preTabNow() !== 'plan' || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
  const tg = e.target; if (tg && tg.closest && tg.closest('input, select, textarea')) return;
  if (!$('#modal').classList.contains('hidden') || askResolve) return;
  actions.campRoomStep({ dir: e.key === 'ArrowLeft' ? -1 : 1 }); e.preventDefault();
});
document.addEventListener('keydown', e => { // ← → walks the staff chart
  if (!state || view !== 'coaches' || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || (e.target.closest && e.target.closest('input, select, textarea')) || !$('#modal').classList.contains('hidden')) return;
  const list = staffList(T(ui.staffTid == null ? state.userTid : ui.staffTid)); if (!list.length) return;
  const i = Math.max(0, list.findIndex(c => c.id === ui.staffSel));
  ui.staffSel = list[(i + (e.key === 'ArrowRight' ? 1 : list.length - 1)) % list.length].id; e.preventDefault(); render();
});
$('#importFile').addEventListener('change', e => { if (e.target.files[0]) importSave(e.target.files[0]); e.target.value = ''; });

$('#app').innerHTML = '<div class="setup"><p class="muted">Loading…</p></div>';
readSave().then(s => { hasSave = !!s; return load(); }).then(render, render);

// ---------- the game's own tooltip (replaces the browser's) ----------
let tipT = null;
function tipHide() { clearTimeout(tipT); const t = document.getElementById('tip'); if (t) t.classList.remove('on'); }
document.addEventListener('mouseover', e => {
  if (window.matchMedia && window.matchMedia('(hover: none)').matches) return;
  const el = e.target.closest && e.target.closest('[title], [data-tip]'); if (!el) { tipHide(); return; }
  if (el.hasAttribute('title')) { const v = el.getAttribute('title'); el.removeAttribute('title'); if (v) el.dataset.tip = v; } // take it away from the browser
  const tx = el.dataset.tip; if (!tx) { tipHide(); return; }
  clearTimeout(tipT);
  tipT = setTimeout(() => {
    if (!document.body.contains(el)) return;
    let t = document.getElementById('tip'); if (!t) { t = document.createElement('div'); t.id = 'tip'; document.body.appendChild(t); }
    t.textContent = tx; t.classList.add('on');
    const r = el.getBoundingClientRect(), w = t.offsetWidth, h = t.offsetHeight;
    let y = r.top - h - 8; if (y < 6) y = r.bottom + 8;
    t.style.left = Math.max(6, Math.min(window.innerWidth - w - 6, r.left + r.width / 2 - w / 2)) + 'px'; t.style.top = y + 'px';
  }, 260);
});
document.addEventListener('mouseout', e => { const a = e.target.closest && e.target.closest('[data-tip]'), b = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('[data-tip]'); if (a !== b) tipHide(); });
document.addEventListener('scroll', tipHide, true); document.addEventListener('mousedown', tipHide); document.addEventListener('keydown', tipHide);
// ---- the reps chart: drag a man (from the bench or a card) to a place in a job's order, as on the depth chart ----
let repDrag = null;
if (typeof document !== 'undefined') {
  const rpTarget = e => e.target.closest && (e.target.closest('[data-rpi]') || e.target.closest('.dcj[data-rpjob]'));
  const rpClear = () => document.querySelectorAll('.dc-over').forEach(x => x.classList.remove('dc-over'));
  document.addEventListener('dragstart', e => { const el = e.target.closest && e.target.closest('[data-rpp]'); if (!el) return; repDrag = { pid: +el.dataset.rpp, k: el.dataset.rpjob || null };
    el.classList.add('drag'); document.body.classList.add('dc-dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(repDrag.pid)); } catch (x) { /* some browsers refuse */ } });
  document.addEventListener('dragend', () => { if (!repDrag) return; repDrag = null; document.querySelectorAll('.drag').forEach(x => x.classList.remove('drag')); rpClear(); document.body.classList.remove('dc-dragging'); });
  document.addEventListener('dragover', e => { const t = repDrag && rpTarget(e); if (!t) return; const p = P(repDrag.pid); if (!p || !repsCanWork(p, t.dataset.rpjob)) { rpClear(); return; } e.preventDefault(); document.querySelectorAll('.dc-over').forEach(x => x !== t && x.classList.remove('dc-over')); t.classList.add('dc-over'); });
  document.addEventListener('drop', e => { const t = repDrag && rpTarget(e); if (!t) return; e.preventDefault(); const d = repDrag; repDrag = null; document.body.classList.remove('dc-dragging');
    const k = t.dataset.rpjob, err = repsPlace(d.k, d.pid, k, t.dataset.rpi !== undefined ? +t.dataset.rpi : (state.reps.jobs[k] || []).length);
    if (err) toast(err); else { ui.repsJob = k; ui.repsPid = d.pid; } save(); render(); });
}
