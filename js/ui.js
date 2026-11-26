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
function trackPill(p) { if (!p.grow || p.tid === -2) return ''; const t = trackOf(p); return `<span class="pill ${TRACK_CLS[t]}">${TRACK_LABEL[t]}</span>` + rookiePill(p); }
// the rookie year: he plays below what he is until the pro game slows down for him (snaps teach fastest)
function rookiePill(p) { const r = p.rook || 0; return r < 0.5 ? '' : `<span class="pill warn" title="Rookies play below their level until the speed and the playbook catch up. Game snaps close the gap fastest, practice slowly.">${r >= 2 ? 'Learning the pro game' : 'Nearly up to speed'}</span>`; }
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
  // opts.group {k, f: row => [key, label]}: while the table is sorted by column k, each group opens with a heading row and its count
  const grp = opts.group && ss && ss.k === opts.group.k ? opts.group : null, gn = {};
  if (grp) for (const r of rows) { const g = grp.f(r)[0]; gn[g] = (gn[g] || 0) + 1; }
  let gk;
  const head = cols.map(c => `<th class="${c.num ? 'num' : ''} ${c.v && !opts.nosort ? 'sortable' : ''} ${ss && ss.k === c.k ? 'sorted' : ''}${c.cls ? ' ' + c.cls : ''}" ${c.v && !opts.nosort ? `data-action="sort" data-table="${id}" data-k="${c.k}"` : ''} title="${c.title || ''}">${c.l}${ss && ss.k === c.k ? (ss.dir < 0 ? ' ▾' : ' ▴') : ''}</th>`).join('');
  const body = rows.map((r, i) => {
    const cls = opts.rowClass ? opts.rowClass(r, i) : '', attr = opts.rowAttr ? opts.rowAttr(r, i) : '', after = opts.rowAfter ? opts.rowAfter(r, i) : '';
    let gh = '';
    if (grp) { const [g, l] = grp.f(r); if (g !== gk) { gk = g; gh = `<tr class="grp"><td colspan="${cols.length}"><span class="grp-l">${l}</span><span class="grp-n">${gn[g]}</span></td></tr>`; } }
    return gh + `<tr class="${cls}" ${attr}>` + cols.map(c => `<td class="${c.num ? 'num' : ''}${c.l ? '' : ' act'}${c.cls ? ' ' + c.cls : ''}" data-l="${esc(c.l)}">${c.f ? c.f(r, i) : (c.v ? c.v(r) : '')}</td>`).join('') + '</tr>' + (after ? `<tr class="xrow"><td colspan="${cols.length}">${after}</td></tr>` : '');
  }).join('');
  const pn = cols.length > 2 && cols[0].k === 'pos' && ['n', 'name'].includes(cols[1].k); // position + name stay pinned on a phone
  const rk = !pn && cols.length > 2 && cols[0].k === 'rk'; // a rank column, then the name
  // phones: player lists read as cards (with their own sort control); a toggle brings the table back
  const sortable = opts.nosort ? [] : cols.filter(c => c.v && c.l);
  const mbar = pn && rows.length > 10 ? `<div class="mbar">${sortable.length ? `<label class="small muted">Sort</label><select data-change="msort" data-table="${id}">${sortable.map(c => `<option value="${c.k}" ${ss && ss.k === c.k ? 'selected' : ''}>${c.l}</option>`).join('')}</select><button class="sm" data-action="msortDir" data-table="${id}" data-k="${ss ? ss.k : sortable[0].k}" title="Reverse the order">${ss && ss.dir > 0 ? '▴' : '▾'}</button>` : ''}<span class="spacer"></span><span class="seg"><button class="sm ${ui.mcards ? 'on' : ''}" data-action="mview" data-v="">Cards</button><button class="sm ${ui.mcards ? '' : 'on'}" data-action="mview" data-v="1">Table</button></span></div>` : '';
  return mbar + `<div class="tbl-wrap"><table class="${pn ? 'pn' + (ui.mcards ? ' cards' : '') : rk ? 'rk' : ''}${opts.cls ? ' ' + opts.cls : ''}"><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length}" class="muted">Nothing here.</td></tr>`}</tbody></table></div>`;
}

// ---------- top level ----------
// a club's colors for the frame: its own, a second one for the piping on its leather (the game keeps one color per club),
// the color its lettering takes on that leather, and the shadow that lettering wants
const CLUB_SECOND = { BUF: '#c9d3e0', MIA: '#f2794a', NE: '#c0282d', NYK: '#c4cbd0', BAL: '#d9a92e', CIN: '#f1ece2', CLE: '#f08a24', PIT: '#f1ece2',
  HOU: '#c9d1dc', IND: '#eef1f6', JAX: '#d4ad35', NAS: '#e9eef5', DEN: '#e9eef5', KC: '#f2b632', LV: '#e8e8e8', LAS: '#f4c430',
  DAL: '#c6ccd4', NYE: '#e04150', PHI: '#cdd6d9', WAS: '#e0b33c', CHI: '#e9eef5', DET: '#c7ced6', GB: '#f2b632', MIN: '#f1c232',
  ATL: '#f1ece2', CAR: '#e9eef5', NO: '#f1ece2', TB: '#d9d9d9', ARI: '#f2f0e6', LAG: '#f2b632', SF: '#c9a24a', SEA: '#c7e6cf' };
function colorLum(hex) { const n = parseInt(String(hex).slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function clubVars(tid) { const t = T(tid), lt = colorLum(t.color) > 0.42; return { '--tc': t.color, '--tc2': CLUB_SECOND[t.abbr] || '#d8d8d8', '--tci': lt ? '#14171b' : '#fff', '--tsh': lt ? '0 1px 0 rgba(255,255,255,.35)' : '0 -1px 0 rgba(0,0,0,.32)' }; }
function applyTheme() { document.documentElement.classList.toggle('dark', !!(state && state.settings && state.settings.theme === 'dark')); }
function render() {
  const app = $('#app');
  applyTheme();
  if (!state) { app.className = ''; app.innerHTML = setupHTML(); return; }
  if (state.rv2 !== 3) { state.rv2 = 3; for (const c of Object.values(state.coaches)) { migrateCoach(c, state.teams, state.coaches); updateCoachOvr(c); } TEND_VER++; }
  if (state.phase === 'FA' && (!state.fa || state.fa.yr !== state.season)) { faOpen(); save(); } // a save that was already in free agency when the market was added
  document.documentElement.style.setProperty('--accent', T(state.userTid).color);
  for (const [k, v] of Object.entries(clubVars(state.userTid))) document.documentElement.style.setProperty(k, v); // the frame's leather wears your club's colors
  if (state.phase === 'RECAP' && ui.wrapSeen !== state.season) { ui.wrapSeen = state.season; ui.seasonYr = null; view = 'season'; } // the season just ended: open its review once
  if (state.phase === 'PRESEASON' && !state.pre && !state.settings.autoUser && ui.prepSeen !== state.season) { ui.prepSeen = state.season; ui.staffTid = null; ui.staffSel = T(state.userTid).hc; view = 'coaches'; setTimeout(() => { if (view === 'coaches' && C(T(state.userTid).hc)) coachModal(T(state.userTid).hc); }, 0); } // rookie free agency is over: meet with the staff before camp
  let page;
  try { page = pageHTML(); } catch (e) { showError(e, `drawing the ${view} page`); page = `<div class="callout bad">This page hit an error (details at the bottom of the screen).</div>`; }
  const SC = '.rs-scroll, .cl-col, .tbl-wrap, .scroll, .dc-cands, .dc-side, nav.tabs, .subnav, .subtabs, .msheet-card, .fa-list, .fa-left', keep = [...app.querySelectorAll(SC)].map(e => [e.scrollLeft, e.scrollTop]), wy = window.scrollY, same = app.dataset.view === view;
  const ctx = clubCtx();
  app.className = 'shell'; app.innerHTML = sideHTML() + `<div class="stage">${topbarHTML()}<main${ctx !== null ? ` style="${clubVarsCSS(ctx)}"` : ''}>${page}</main></div>` + mobileNavHTML(); { const cc = app.querySelector('.cal-st.cur'), ct = app.querySelector('.cal-track'); if (cc && ct) ct.scrollLeft = cc.offsetLeft - ct.offsetLeft - ct.clientWidth / 2 + cc.offsetWidth / 2; } // keep where we are in the year in view
  app.dataset.view = view;
  phoneKit(app.querySelector('main'));
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
    case 'FA': { if (faTampering()) return state.fa.day >= FA_TAMPER - 1 ? 'Open the League Year →' : `Next Day of the Negotiating Window (${state.fa.day + 1} of ${FA_TAMPER}) →`;
      const d = state.fa && state.fa.yr === state.season ? state.fa.day : 0; return d >= FA_DAYS - 1 ? 'Close Free Agency →' : `Next Day of Free Agency (${d + 1} of ${FA_DAYS}) →`; }
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
    case 'FA': { const d = state.fa ? state.fa.day : 0, tw = !!(state.fa && state.fa.tw); let h = ''; for (let i = 0; i < FA_DAYS; i++) h += tk(i < d ? 'done' : i === d ? 'cur' : '', tw && i < FA_TAMPER ? `Negotiating window, day ${i + 1}` : 'Day ' + (i + 1)); return `<span class="cal-n">${faTampering() ? `Negotiating window, day ${d + 1} of ${FA_TAMPER}` : `Day ${Math.min(d + 1, FA_DAYS)} of ${FA_DAYS}`}</span><span class="cal-t">${h}</span>`; }
    case 'DRAFT': { const pk = currentPick(), r = pk ? pk.round : DRAFT_ROUNDS; let h = ''; for (let i = 1; i <= DRAFT_ROUNDS; i++) h += tk(i < r ? 'done' : i === r ? 'cur' : '', 'Round ' + i); return `<span class="cal-n">${pk ? `Round ${pk.round}, pick ${pk.pick}` : 'Done'}</span><span class="cal-t">${h}</span>`; }
    case 'UDFA': { const r = state.udfa ? state.udfa.round : 0; let h = ''; for (let i = 0; i < UDFA_ROUNDS; i++) h += tk(i < r ? 'done' : i === r ? 'cur' : '', 'Round ' + (i + 1)); return `<span class="cal-n">Round ${r + 1} of ${UDFA_ROUNDS}</span><span class="cal-t">${h}</span>`; }
    case 'PRESEASON': { const st = preSteps().filter(x => x.k !== 'cut'), c = st.find(x => x.cur); return `<span class="cal-n">${c ? c.l : 'Camp'}</span><span class="cal-t">${st.map(x => tk(x.done ? 'done' : x.cur ? 'cur' : '', x.l)).join('')}</span>`; }
  }
  return '';
}
// the year as a compact strip: finished and coming stages are dots, the current one is opened up
function calendarHTML() {
  const cur = CAL.findIndex(c => c[0] === state.phase);
  return `<div class="cal-track">${CAL.map(([k, l], i) => i === cur ? `<div class="cal-st cur" title="${esc(l)}"><span class="cal-l">${l}</span>${watchOn() ? '' : calSubHTML()}</div>` : `<div class="cal-st ${i < cur ? 'done' : ''}" title="${esc(l)}: ${i < cur ? 'done' : 'still to come'}"><span class="cal-d">${i < cur ? '✓' : ''}</span><span class="cal-l">${l}</span></div>`).join('<i></i>')}</div>`;
}
// what moves the year on: watch or quick-sim a game, or the step the phase calls for; plus the sims that skip ahead
function goButtonsHTML() {
  let sim2 = '';
  if (state.phase === 'REG') sim2 = '<button class="sm" data-action="simPlayoffs" title="Sim to the playoffs">⏩ Playoffs</button>';
  else if (state.phase === 'PLAYOFFS') sim2 = '<button class="sm" data-action="simPlayoffs" title="Finish the playoffs">⏩ Finish</button>';
  else if (state.phase === 'DRAFT') sim2 = '<button class="sm" data-action="simDraft" title="Sim the rest of the draft">⏩ Draft</button>';
  const go = watchable() ? `<button class="primary" data-action="watchGo" title="Play the game and watch it, play by play">▶ Watch</button><button data-action="continue" title="Play it and go straight to the result">${continueLabel().replace('▶ Play', 'Quick sim')}</button>` : `<button class="primary" data-action="continue">${continueLabel()}</button>`;
  return `${sim2}<button class="sm" data-action="simYear" title="Auto-manages your team through the rest of this season and the offseason">⏭ Season</button>${go}`;
}
// the bar over the page: where you are, the pages beside it, and what moves the year on
const VIEW_LABEL = { carwrap: 'Coaching search', watch: 'Game day', season: 'Season Review', camp: 'Preseason', cutdown: 'Preseason' };
// another club, when the page on screen is one of its own (its page, its roster, its staff)
function clubCtx() { const tid = view === 'club' ? ui.clubTid : view === 'roster' ? ui.rosterTid : view === 'coaches' ? ui.staffTid : view === 'playbook' ? ui.pbTid : null; return tid != null && tid !== state.userTid && T(tid) ? tid : null; }
const clubVarsCSS = tid => Object.entries(clubVars(tid)).map(([k, v]) => `${k}:${v}`).join(';');
function topbarHTML() {
  const ct = clubCtx();
  if (ct !== null) {
    const c = T(ct), on = { club: 'club', roster: 'roster', coaches: 'staff', playbook: 'book' }[view], ph = CAL.find(x => x[0] === state.phase), sub = calSubHTML().match(/<span class="cal-n">(.*?)<\/span>/);
    const tab = (k, l, act) => `<button class="${k === on ? 'on' : ''}" data-action="${act}" data-tid="${ct}">${l}</button>`;
    return `<div class="topbar light" style="${clubVarsCSS(ct)}"><div class="tb1"><div class="tb-title"><span>${esc(c.conf + ' ' + c.div)}</span><b>${esc(c.region + ' ' + c.name)}</b></div><nav class="tb-tabs">${tab('club', 'Club', 'team')}${tab('roster', 'Roster', 'clubRoster')}${tab('staff', 'Staff', 'clubStaff')}${tab('book', 'Playbook', 'clubBook')}${tab('trade', 'Trade', 'clubTrade')}</nav><span class="spacer"></span><span class="tb-when">${ph ? ph[1] : ''}${sub && !watchOn() ? ' · ' + sub[1] : ''}</span><div class="tb-go">${goButtonsHTML()}</div></div></div>`;
  }
  const tree = navTree(), cur = navHeadOf(view, tree), head = tree.find(x => x[0] === cur), v = view === 'cutdown' || view === 'camp' ? 'pre' : view, hot = navHot();
  const here = (head[2].find(x => x[0] === v) || [])[1] || VIEW_LABEL[view] || head[1];
  const tabs = head[2].length > 1 ? `<nav class="tb-tabs">${head[2].map(([k, l]) => `<button class="${k === v ? 'on' : ''}" data-action="nav" data-view="${k}">${l}${k === hot && k !== v ? '<i class="nav-dot"></i>' : ''}</button>`).join('')}</nav>` : '';
  const ph = CAL.find(c => c[0] === state.phase), sub = calSubHTML().match(/<span class="cal-n">(.*?)<\/span>/);
  return `<div class="topbar light"><div class="tb1"><div class="tb-title">${head[1] !== here ? `<span>${head[1]}</span>` : ''}<b>${here}</b></div>${tabs}<span class="spacer"></span><span class="tb-when">${ph ? ph[1] : ''}${sub && !watchOn() ? ' · ' + sub[1] : ''}</span><div class="tb-go">${goButtonsHTML()}</div></div></div>`;
}
// the year down the side: every stage as a pip, the one we are in opened up
function sideYearHTML() {
  const cur = CAL.findIndex(c => c[0] === state.phase);
  return `<div class="sb-year"><div class="sb-pips">${CAL.map(([k, l], i) => `<b class="${i < cur ? 'done' : i === cur ? 'cur' : ''}" title="${esc(l)}${i < cur ? ': done' : i > cur ? ': still to come' : ''}"></b>`).join('')}</div>
    <div class="sb-now"><b>${cur >= 0 ? CAL[cur][1] : ''}</b>${watchOn() ? '' : calSubHTML()}</div></div>`;
}
// phones: a bottom bar with the pages you live in, and a sheet with everything else
const MNAV_ICON = { home: '⌂', roster: '☰', depth: '▦', practice: '◔', coaches: '♜', playbook: '✎', schedule: '▤', standings: '≡', stats: '∑', trade: '⇄', fa: '✚', search: '⌕', draft: '◆', news: '✉', history: '★', settings: '⚙', cutdown: '✂', waivers: '☑' };
// ---------- navigation: six headers, each with its own row of pages ----------
function navTree() {
  const hist = state.history && state.history.length;
  return [
    ['home', 'Home', [['home', 'Overview'], ['news', 'News']]],
    ['team', 'Team', [['roster', 'Roster'], ...(preOpen() ? [['pre', preCampOn() ? 'Preseason' : 'Roster Planner']] : []), ['depth', 'Depth chart'], ['practice', 'Practice report']]],
    ['staff', 'Staff', [['coaches', 'Coaches'], ['playbook', 'Playbook'], ...(preCampOn() ? [['meeting', 'Staff meeting']] : [])]],
    ['league', 'League', [['schedule', 'Schedule'], ['standings', 'Standings'], ['stats', 'League Stats'], ['history', 'History'], ...(hist ? [['season', 'Season Review']] : [])]],
    ['players', 'Players', [['fa', 'Free Agents'], ['trade', 'Trade'], ['search', 'Player Search'], ['draft', 'Draft'], ...(['WAIVERS', 'REG', 'PLAYOFFS'].includes(state.phase) ? [['waivers', 'Waiver Wire']] : [])]],
    ['settings', 'Settings', [['settings', 'Settings']]],
  ];
}
// the page where this phase's business is done
function navHot() { if ((state.phase === 'REG' || state.phase === 'PLAYOFFS') && onWaivers().some(p => p.waiver.from !== state.userTid)) return 'waivers'; return { RECAP: 'season', COACHES: 'coaches', RESIGN: 'roster', FA: 'fa', DRAFT: 'draft', UDFA: 'fa', PRESEASON: state.pre ? 'pre' : 'coaches', CUTDOWN: 'pre', WAIVERS: 'waivers' }[state.phase] || null; }
function navHeadOf(v, tree) { if (v === 'club') return 'league'; v = v === 'cutdown' || v === 'camp' ? 'pre' : v; const h = (tree || navTree()).find(x => x[2].some(y => y[0] === v)); return h ? h[0] : 'home'; }
const NAV_ICON = { home: '⌂', team: '☰', staff: '♜', league: '≡', players: '✚', settings: '⚙' };
// the sidebar's drawn icons
const SB_ICON = { home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  team: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.6c2.6.2 4.4 1.9 5 4.9"/>',
  staff: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9z"/><path d="M8.5 11h7M8.5 15h5"/>',
  league: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4M8 20h8M9.5 17h5"/>',
  players: '<circle cx="10" cy="8" r="3.5"/><path d="M3.5 20c.6-3.6 3.3-5.5 6.5-5.5 1.3 0 2.5.3 3.5.9"/><circle cx="17.5" cy="16.5" r="2.7"/><path d="M19.5 18.5l2 2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>' };
const sbIcon = k => `<svg class="sb-ic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SB_ICON[k] || ''}</svg>`;
// the sidebar: the club, the year, then the six headers; hovering a header pops its pages out to the side
function sideHTML() {
  const tree = navTree(), cur = navHeadOf(view, tree), hot = navHot(), v = view === 'cutdown' || view === 'camp' ? 'pre' : view, t = T(state.userTid), dot = '<i class="nav-dot" title="This is where the current phase happens"></i>';
  (ui.navLast = ui.navLast || {})[cur] = v;
  const items = tree.map(([k, l, subs]) => { const on = k === cur, many = subs.length > 1;
    return `<div class="sb-item ${on ? 'on' : ''}"><button class="sb-head" data-action="navHead" data-h="${k}">${sbIcon(k)}<span class="sb-l">${l}</span>${hot && subs.some(y => y[0] === hot && y[0] !== v) ? dot : ''}${many ? '<i class="sb-car">›</i>' : ''}</button>${many ? `<div class="sb-fly"><div class="sb-fly-h">${l}</div>${subs.map(([s2, l2]) => `<button class="${s2 === v ? 'on' : ''}" data-action="nav" data-view="${s2}">${l2}${s2 === hot && s2 !== v ? dot : ''}</button>`).join('')}</div>` : ''}</div>`; }).join('');
  const over = rosterOver() && !['CUTDOWN', 'WAIVERS'].includes(state.phase);
  return `<aside class="side">
    <div class="sb-brand">GRIDIRON <span>GM</span></div>
    <button class="sb-team" data-action="navHead" data-h="home" style="--tc:${t.color}" title="${esc(t.region + ' ' + t.name)}"><span class="sb-mono">${esc(t.abbr)}</span><span class="sb-tn"><b>${esc(t.region)}</b><span>${esc(t.name)}</span></span></button>
    <div class="sb-meta"><div><span>${state.season}</span><b>${watchOn() ? '—' : recOf(t.id, standings())}</b></div><div title="Cap room"><span>Cap</span><b>${fmtMoney(capRoom(t.id))}</b></div></div>
    ${over ? `<button class="sb-warn" data-action="nav" data-view="roster" title="You are over the roster limit: make a move before the next game">Roster ${rosterCount(t.id)}/${rosterLimit()}: over the limit</button>` : ''}
    ${!state.settings.autoUser && psOverBy(t.id) ? `<button class="sb-warn" data-action="nav" data-view="roster" title="Your practice squad is over its limit: promote or release someone before the next game">Practice squad ${psOf(t.id).length}/${PS_MAX}: over the limit</button>` : ''}
    ${sideYearHTML()}
    <nav class="sb-nav">${items}</nav>
  </aside>`;
}
// phones: no header and no calendar strip. A dock at the bottom holds where the year is, the button that moves it on, and the six headers;
// a header with more than one page opens a small menu above the dock.
function isPhone() { return typeof matchMedia === 'function' && matchMedia('(max-width: 760px)').matches; }
// ---------- phones: room for the names ----------
// After every draw on a phone: a row of picker buttons that won't fit on one line becomes a dropdown, and a row's own buttons
// fold away into a menu that opens when you tap the row, so the name keeps the width.
const MK_ROWS = 'tr, .ph-row, .mrow, .dec-r, .fut-row, .dk-chip';
let mkPass = false, mkDragEnd = 0; // a click the menu passes on to the row's own button; when a drag by the handle last let go
function phoneKit(root) {
  if (!root || !isPhone()) return;
  for (const g of new Set([...root.querySelectorAll('button.on')].map(b => b.parentElement))) {
    if (g.closest('.mdock, .mpop, .side, .mk-keep')) continue;
    const bs = [...g.children].filter(x => x.tagName === 'BUTTON');
    if (bs.length < 3 || bs.filter(b => b.classList.contains('on')).length !== 1 || !g.offsetParent) continue;
    if (g.scrollWidth <= g.clientWidth + 2 && new Set(bs.map(b => b.offsetTop)).size === 1) continue; // it fits
    const sel = document.createElement('select'); sel.className = 'mk-sel';
    sel.innerHTML = bs.map((b, i) => `<option value="${i}" ${b.classList.contains('on') ? 'selected' : ''} ${b.disabled ? 'disabled' : ''}>${esc(mkText(b))}</option>`).join('');
    sel.mkBtns = bs; bs[0].before(sel); bs.forEach(b => b.classList.add('mk-hid'));
  }
  for (const r of root.querySelectorAll(MK_ROWS)) {
    if (r.closest('.mk-keep')) continue;
    const acts = [...r.querySelectorAll('button:not(.link)')].filter(b => !b.classList.contains('mk-hid') && !b.closest('.mk-keep'));
    if (!acts.length || (acts.length === 1 && acts[0].textContent.trim().length <= 2)) continue; // one small + or × can stay
    r.classList.add('mk-row'); acts.forEach(b => b.classList.add('mk-act'));
    r.querySelectorAll(':scope > td').forEach(td => { const bs = [...td.querySelectorAll('.mk-act')], cur = bs.find(mkOn); if (!bs.length) return; td.classList.add('mk-dots'); if (cur) td.dataset.mkCur = mkText(cur); }); // the cell still shows the call that is made
  }
}
// a button's words with a space between its parts ("QB Singleton 2", not "QBSingleton2")
function mkText(el) { return [...el.childNodes].map(n => n.nodeType === 3 ? n.textContent : n.nodeType === 1 ? mkText(n) : '').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' '); }
// a dropdown that runs one of the page's actions, for a phone: opts are [value, label]
function mkSel(act, key, opts, cur) { return `<select data-change="mkAct" data-act="${act}" data-key="${key}">${opts.map(([v, l]) => `<option value="${esc(String(v))}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`; }
// the chosen one of a row of choices: marked on, or the filled (or red) button of a segmented set
function mkOn(b) { return b.classList.contains('on') || (b.parentElement.classList.contains('seg') && (b.classList.contains('primary') || b.classList.contains('danger'))); }
// the menu a tapped row opens: his file, the row's own action, then each of its buttons
function rowMenu(r) {
  let sh = $('#mksheet'); if (!sh) { sh = document.createElement('div'); sh.id = 'mksheet'; sh.className = 'mk-sheet hidden'; document.body.appendChild(sh); }
  const pl = r.querySelector('[data-action="player"], [data-action="coach"]'), acts = [...r.querySelectorAll('.mk-act')];
  const label = b => { const t = mkText(b), tip = b.getAttribute('title') || b.dataset.tip || ''; return t.length > 2 || !tip ? t || tip : `${t} ${tip}`; };
  sh.mkActs = [...acts, r]; sh.mkPl = pl;
  sh.innerHTML = `<div class="mk-card"><div class="mk-h">${esc(pl ? pl.textContent.trim() : r.textContent.replace(/\s+/g, ' ').trim().slice(0, 48))}</div>
    ${pl ? `<button data-mk="file">${pl.dataset.action === 'coach' ? 'Open his page' : 'Open his file'}</button>` : ''}${r.dataset.action ? `<button data-mk="${acts.length}">${esc(r.dataset.mkl || 'Details')}</button>` : ''}
    ${acts.map((b, i) => `<button data-mk="${i}" class="${mkOn(b) ? 'on' : ''} ${b.classList.contains('danger') ? 'danger' : ''}" ${b.disabled ? 'disabled' : ''}>${esc(label(b))}</button>`).join('')}
    <button data-mk="x" class="mk-x">Cancel</button></div>`;
  sh.classList.remove('hidden');
}
function rowMenuClick(e) {
  const sh = $('#mksheet'), b = e.target.closest('[data-mk]');
  if (e.target !== sh && !b) return;
  sh.classList.add('hidden');
  const t = !b || b.dataset.mk === 'x' ? null : b.dataset.mk === 'file' ? sh.mkPl : (sh.mkActs || [])[+b.dataset.mk];
  sh.mkActs = sh.mkPl = null;
  if (t) { mkPass = true; try { t.click(); } finally { mkPass = false; } }
}
if (typeof matchMedia === 'function') { const mq = matchMedia('(max-width: 760px)'), f = () => { if (state) render(); }; if (mq.addEventListener) mq.addEventListener('change', f); else if (mq.addListener) mq.addListener(f); } // turning a tablet redraws for the new width
function mobileNavHTML() {
  if (!state) return '';
  const tree = navTree(), cur = navHeadOf(view, tree), hot = navHot(), t = T(state.userTid), v = view === 'cutdown' || view === 'camp' ? 'pre' : view, pop = ui.mPop ? tree.find(x => x[0] === ui.mPop) : null;
  const sims = state.phase === 'REG' ? [['simPlayoffs', '⏩ Sim to the playoffs']] : state.phase === 'PLAYOFFS' ? [['simPlayoffs', '⏩ Finish the playoffs']] : state.phase === 'DRAFT' ? [['simDraft', '⏩ Sim the draft']] : [];
  const menu = !pop ? '' : `<div class="mpop-bg" data-action="mPop" data-h=""></div><div class="mpop"><div class="mpop-h">${pop[1]}</div>${pop[2].map(([k, l]) => `<button class="${k === v ? 'on' : ''}" data-action="nav" data-view="${k}">${l}${k === hot ? '<i class="nav-dot"></i>' : ''}</button>`).join('')}
    ${pop[0] === 'settings' ? [...sims, ['simYear', '⏭ Sim to next season']].map(([a, l]) => `<button class="mpop-x" data-action="${a}">${l}</button>`).join('') : ''}</div>`;
  return `${menu}<div class="mdock"><div class="mgo"><div class="mgo-w"><b>${state.season} · ${PHASE_LABEL[state.phase]}${state.phase === 'REG' ? ' · Wk ' + state.week : ''}</b><span>${esc(t.abbr)} ${watchOn() ? '' : recOf(t.id, standings())} · cap ${fmtMoney(capRoom(t.id))}</span></div>${watchable() ? `<button class="primary" data-action="watchGo">▶ Watch</button><button data-action="continue">Sim</button>` : `<button class="primary" data-action="continue">${continueLabel()}</button>`}</div>
    <nav class="mnav">${tree.map(([k, l, subs]) => `<button class="${k === cur ? 'on' : ''} ${pop && pop[0] === k ? 'open' : ''}" data-action="navHead" data-h="${k}"><i>${NAV_ICON[k]}</i><span>${l}${hot && k !== cur && subs.some(y => y[0] === hot) ? ' •' : ''}</span></button>`).join('')}</nav></div>`;
}
function pageHTML() {
  switch (view) {
    case 'home': return homeHTML();
    case 'club': return ui.clubTid == null || ui.clubTid === state.userTid || !T(ui.clubTid) ? homeHTML() : clubPageHTML(ui.clubTid);
    case 'roster': return rosterHTML();
    case 'depth': return withPendingElev(state.userTid, depthChartHTML); // squad men coming up for the game can be put on the chart
    case 'playbook': return playbookHTML();
    case 'schedule': return scheduleHTML();
    case 'standings': return standingsHTML();
    case 'stats': return statsHTML();
    case 'trade': return tradeHTML();
    case 'practice': return practiceHTML();
    case 'fa': return faHTML();
    case 'search': return searchHTML();
    case 'cutdown': return state.phase === 'CUTDOWN' ? preHubHTML() : homeHTML(); // cutdown day lives on the preseason page
    case 'waivers': return state.phase === 'WAIVERS' ? waiversHTML() : state.phase === 'REG' || state.phase === 'PLAYOFFS' ? weekWaiversHTML() : homeHTML();
    case 'draft': return draftHTML();
    case 'coaches': return coachesHTML();
    case 'carwrap': return carWrapHTML();
    case 'news': return newsHTML();
    case 'history': return historyHTML();
    case 'season': return seasonHTML();
    case 'camp': return preHubHTML();
    case 'pre': return preHubHTML();
    case 'meeting': if (!preCampOn()) return coachesHTML(); ensureReps(); return `<div class="pagehead"><div><h1>Staff meeting</h1><div class="sub">Your position coaches, one at a time: what they see in camp, and where they would change your practice reps. Before ${preNextLabel()}.</div></div></div>${preMeetHTML()}`;
    case 'watch': return watchHTML();
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
    case 'FA': return faTampering() ? `The negotiating window, day ${state.fa.day + 1} of ${FA_TAMPER}. Clubs can talk to every free agent and agree terms, but a deal with a new club is only an agreement until the league year opens. Your own free agents can still re-sign with you, and if one agrees terms elsewhere you can beat it until then. Sit down with a player's agent on the <b>Free Agents</b> tab.` : `Free agency, day ${(state.fa ? state.fa.day : 0) + 1} of ${FA_DAYS}. Every club is bidding and nobody sees the other offers. Sit down with a player's agent on the <b>Free Agents</b> tab; players decide overnight, and prices soften as the days pass.`;
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
// ---------- the club page: one composed sheet, the way a club's front office would lay it out ----------
//  A leather masthead in the club's colors (badge, name, the men in charge, the record and its form, the next game), an engraved strip
//  of the figures that matter, the phase's business in a ribbon, then three ruled columns: the full schedule and the club's news;
//  the division, the front office and staff, the injuries; the cap, the draft picks, the leaders. Every club, man and game is a link.
function homeHTML() {
  const u = state.userTid;
  let html = clubPageHTML(u, { notice: phaseCallout(), alert: waiverAlertHTML() });
  if (state.phase === 'RECAP') html += recapHTML();
  html += campCardHTML();
  return html;
}
// a club as a link: its color, then its name
function clubTag(tid, full) { const t = T(tid); return `<button class="link cl-team" data-action="team" data-tid="${tid}" title="${esc(t.region + ' ' + t.name)}"><i class="cl-chip" style="background:${t.color}"></i><span>${esc(full ? t.region + ' ' + t.name : t.name)}</span></button>`; }
const clSec = (title, body, more, cls) => `<div class="cl-sec${cls ? ' ' + cls : ''}"><div class="cl-sh"><h3>${title}</h3>${more || ''}</div>${body}</div>`;
const clMore = (label, v) => `<button class="link cl-more" data-action="nav" data-view="${v}">${label} ›</button>`;
const clGo = (label, act, tid) => `<button class="link cl-more" data-action="${act}" data-tid="${tid}">${label} ›</button>`;
const clTier = v => { const t = coachTier(v); return `<span class="cl-tier t-${t}">${t}</span>`; };
// names in the news become links: players and coaches by name, clubs by name or abbreviation
function clLinkNames(text) {
  const full = new Map(), coach = new Map(), club = new Map();
  for (const p of Object.values(state.players)) { if (!p.first) continue; const f = p.first + ' ' + p.last; if (!full.has(f) || p.tid >= 0) full.set(f, p); }
  for (const c of Object.values(state.coaches)) coach.set(c.first + ' ' + c.last, c);
  for (const t of state.teams) { club.set(t.region + ' ' + t.name, t.id); club.set(t.abbr, t.id); }
  const abbrs = state.teams.map(t => t.abbr).sort((a, b) => b.length - a.length);
  const re = new RegExp(`\\b(${abbrs.join('|')})\\b|([A-Z][\\w'’-]+ (?:[A-Z][\\w'’.-]+)(?: (?:Jr\\.|Sr\\.|II|III|IV|[A-Z][\\w'’-]+))?)`, 'g');
  const look = s => { if (club.has(s)) return `<button class="link" data-action="team" data-tid="${club.get(s)}">${esc(s)}</button>`; const p = full.get(s); if (p) return `<button class="link" data-action="player" data-pid="${p.id}">${esc(s)}</button>`; const c = coach.get(s); if (c) return `<button class="link" data-action="coach" data-cid="${c.id}">${esc(s)}</button>`; return null; };
  let html = '', i = 0, m;
  while ((m = re.exec(text))) {
    html += esc(text.slice(i, m.index)); i = re.lastIndex;
    if (m[1]) { html += look(m[1]) || esc(m[1]); continue; }
    const s = m[2], w = s.split(' '); let h = look(s);
    if (!h && w.length === 3) { const t = look(w.slice(1).join(' ')); if (t) h = esc(w[0]) + ' ' + t; else { const a = look(w.slice(0, 2).join(' ')); if (a) h = a + ' ' + esc(w[2]); } }
    html += h || esc(s);
  }
  return html + esc(text.slice(i));
}
// the club's games this season, one row each: the schedule's weeks, then any playoff games
function clGames(tid) {
  const out = [];
  state.schedule.forEach((wk, i) => {
    const m = wk.find(x => x.h === tid || x.a === tid);
    if (!m) { out.push({ wk: i + 1, bye: true }); return; }
    const home = m.h === tid, opp = home ? m.a : m.h, g = { wk: i + 1, label: String(i + 1), home, opp, gid: m.gid, div: T(opp).conf === T(tid).conf && T(opp).div === T(tid).div };
    if (m.score) { g.us = home ? m.score[0] : m.score[1]; g.them = home ? m.score[1] : m.score[0]; }
    out.push(g);
  });
  const po = Object.values(state.games).filter(b => b.season === state.season && b.playoff && !b.pre && b.tids.includes(tid)).sort((a, b) => a.id - b.id);
  for (const b of po) { const s = b.tids.indexOf(tid), opp = b.tids[1 - s]; out.push({ label: String(b.playoff).split(' ').map(w => w[0]).join(''), title: b.playoff, home: s === 0, opp, gid: b.id, us: b.score[s], them: b.score[1 - s], po: true }); }
  return out;
}
const clRes = g => g.us === undefined ? null : g.us > g.them ? 'W' : g.us < g.them ? 'L' : 'T';
function clSchedule(tid, games, o = {}) {
  const recs = o.recs || standings(); let w = 0, l = 0, t = 0; const split = { h: [0, 0, 0], a: [0, 0, 0], d: [0, 0, 0] };
  const rows = games.map(g => {
    if (g.bye) return `<tr class="bye"><td class="cl-wk">${g.wk}</td><td></td><td class="cl-opp" colspan="4">Bye week</td></tr>`;
    const next = o.live !== false && !g.po && state.phase === 'REG' && g.wk === state.week, r = clRes(g);
    let res = next ? '<span class="cl-nexttag">Next game</span>' : '', cum = '';
    if (r) { if (!g.po) { const k = r === 'W' ? 0 : r === 'L' ? 1 : 2; if (k === 0) w++; else if (k === 1) l++; else t++; split[g.home ? 'h' : 'a'][k]++; if (g.div) split.d[k]++; cum = `${w}-${l}${t ? '-' + t : ''}`; }
      const sc = `<b>${r}</b>${g.us}–${g.them}`; res = g.gid !== undefined && state.games[g.gid] ? `<button class="link cl-res ${r}" data-action="box" data-gid="${g.gid}" title="Box score">${sc}</button>` : `<span class="cl-res ${r}">${sc}</span>`; }
    return `<tr class="${next ? 'next' : ''}${g.po ? ' po' : ''}"><td class="cl-wk"${g.title ? ` title="${esc(g.title)}"` : ''}>${g.label}</td><td class="cl-ha">${g.home ? 'vs' : 'at'}</td><td class="cl-opp"><div class="cl-ow">${clubTag(g.opp, !o.short)}${g.div ? '<i class="cl-div" title="Division game">DIV</i>' : ''}</div></td><td class="cl-orec">${recOf(g.opp, recs)}</td><td class="cl-r">${res}</td><td class="cl-cum">${cum}</td></tr>`;
  }).join('');
  const sp = a => `${a[0]}-${a[1]}${a[2] ? '-' + a[2] : ''}`;
  const played = games.some(g => !g.po && clRes(g)), reg = games.filter(g => !g.po), n = reg.length || 1, bw = 100 / n;
  const bars = reg.map((g, i) => { const x = (i * bw + bw * 0.14).toFixed(2), w = (bw * 0.72).toFixed(2), r = clRes(g);
    if (g.bye) return `<rect x="${x}" y="11.2" width="${w}" height="1.6" class="sp-bye"><title>Week ${g.wk}: bye</title></rect>`;
    if (!r) return state.phase === 'REG' && g.wk === state.week ? `<rect x="${x}" y="4" width="${w}" height="16" class="sp-next"><title>Week ${g.wk}: next</title></rect>` : '';
    const m = g.us - g.them, h = Math.max(1.5, Math.min(11, Math.abs(m) / 2.4));
    return `<rect x="${x}" y="${m >= 0 ? 12 - h : 12}" width="${w}" height="${h}" class="sp-${r}"><title>Week ${g.wk}: ${r} ${g.us}–${g.them} ${g.home ? 'vs' : 'at'} ${esc(T(g.opp).name)}</title></rect>`; }).join('');
  const spark = played ? `<svg class="cl-spark" viewBox="0 0 100 24" preserveAspectRatio="none" role="img" aria-label="Margin of each game"><line x1="0" y1="12" x2="100" y2="12" class="sp-axis"/>${bars}</svg>` : '';
  return `<table class="cl-tbl cl-sched"><thead><tr><th class="l">Wk</th><th></th><th class="l">Opponent</th><th></th><th class="l">Result</th><th>Rec</th></tr></thead><tbody>${rows}</tbody></table>
    ${played ? `${spark ? `<div class="cl-sparkrow" title="The margin of each game: up for a win, down for a loss">${spark}</div>` : ''}<div class="cl-splits"><span>Home <b>${sp(split.h)}</b></span><span>Away <b>${sp(split.a)}</b></span><span>Division <b>${sp(split.d)}</b></span></div>` : ''}`;
}
function clDivision(tid) {
  const t = T(tid), rows = divisionStandings()[t.conf + ' ' + t.div] || [];
  return `<table class="cl-tbl"><thead><tr><th class="l">${esc(t.conf + ' ' + t.div)}</th><th>W-L</th><th>Div</th><th>Diff</th><th>Strk</th></tr></thead><tbody>
    ${rows.map(r => { const d = r.pf - r.pa; return `<tr class="${r.tid === tid ? 'me' : ''}"><td class="cl-opp">${clubTag(r.tid)}</td><td>${recStr(r)}</td><td>${r.dw}-${r.dl}${r.dt ? '-' + r.dt : ''}</td><td class="${d > 0 ? 'good' : d < 0 ? 'bad' : ''}">${d > 0 ? '+' : ''}${d}</td><td>${esc(r.streak || '–')}</td></tr>`; }).join('')}</tbody></table>`;
}
function clStaff(tid) {
  const t = T(tid), mine = tid === state.userTid, g = mine ? null : gmOf(tid), yrs = (state.history ? state.history.length : 0) + 1;
  const gm = mine ? `<b>You</b><span class="muted"> · ${ordinal(yrs)} season</span>` : g ? `<span title="${esc(gmCareer(g))}"><b>${esc(gmName(g))}</b><span class="muted"> · ${g.age}, ${esc(gmCareer(g).replace(/^In his (\w+) season\..*/, '$1 season'))}</span></span>` : '<span class="bad">Vacant</span>';
  const hc = C(t.hc), hcTen = hc && hc.hist ? hc.hist.filter(h => h.tid === tid && (h.role === 'HC' || !h.role)).length + 1 : 1;
  const SHORT = { OC: 'Offense', DC: 'Defense', STC: 'Special teams', SC: 'Strength' };
  const rows = [['GM', gm],
    ['Head coach', hc ? `${coachNameLink(hc)}${hc.rec && hc.rec.w + hc.rec.l ? `<span class="muted"> · ${hc.rec.w}-${hc.rec.l}${hc.rec.t ? '-' + hc.rec.t : ''}${hc.rec.titles ? `, ${hc.rec.titles} title${hc.rec.titles > 1 ? 's' : ''}` : ''}</span>` : ''}` : '<span class="bad">Vacant</span>', hc ? clTier(hc.ovr) : ''],
    ...COACH_ROLES.filter(r => r !== 'HC').map(r => { const c = C(t[r.toLowerCase()]); return [SHORT[r], c ? coachNameLink(c) : '<span class="bad">Vacant</span>', c ? clTier(c.ovr) : '']; })];
  const off = teamOvr(tid, 'off'), def = teamOvr(tid, 'def');
  return `<table class="cl-tbl cl-kv"><tbody>${rows.map(([k, v, x]) => `<tr><th class="l">${k}</th><td class="l cl-name"${x === undefined ? ' colspan="2"' : ''}>${v}</td>${x === undefined ? '' : `<td class="cl-tc">${x}</td>`}</tr>`).join('')}
    <tr><th class="l">Schemes</th><td class="l cl-name" colspan="2" title="${esc((teamSchemeLabel(t, 'O') || '—') + ' · ' + (teamSchemeLabel(t, 'D') || '—'))}">${esc(teamSchemeLabel(t, 'O') || '—')} <span class="muted">·</span> ${esc(teamSchemeLabel(t, 'D') || '—')}</td></tr>
    <tr><th class="l">Rating</th><td class="l" colspan="2">Offense ${rat(off)} <span class="muted">·</span> Defense ${rat(def)}</td></tr></tbody></table>${hc ? `<div class="cl-foot">${esc(hc.first + ' ' + hc.last)} is in his ${ordinal(hcTen)} season here.${g ? ` ${esc(gmName(g))}: ${esc(gmSummary(g).replace(/^Known/, 'known'))}` : ''}</div>` : ''}`;
}
function clInjuries(tid) {
  const inj = rosterOf(tid).filter(p => p.injury).sort((a, b) => b.injury.weeks - a.injury.weeks || uOvr(b) - uOvr(a)), worn = rosterOf(tid).filter(p => !p.injury && (p.wear || 0) >= 8);
  if (!inj.length && !worn.length) return '<div class="cl-empty">Everyone is healthy.</div>';
  return `<table class="cl-tbl cl-injt"><tbody>${inj.map(p => `<tr><td class="l cl-pos" title="${esc(p.lbl)}">${esc(p.pos)}</td><td class="l cl-name" title="${esc(pname(p) + ' · ' + tierOf(p))}">${playerLink(p)}</td><td class="l muted cl-inj">${esc(p.injury.name)}</td><td class="cl-out"><b>${p.injury.weeks}</b> wk${onIR(p) ? '<i class="cl-ir">IR</i>' : ''}</td></tr>`).join('')}
    ${worn.map(p => `<tr><td class="l cl-pos" title="${esc(p.lbl)}">${esc(p.pos)}</td><td class="l cl-name">${playerLink(p)}</td><td class="l muted cl-inj" colspan="2">Worn down</td></tr>`).join('')}</tbody></table>`;
}
function clCap(tid) {
  const t = T(tid), cap = typeof capOf === 'function' ? capOf(tid) : CAP, pay = payroll(tid), room = capRoom(tid), dead = t.dead || 0, next = payrollNext(tid), act = Math.max(0, pay - dead);
  const pct = v => Math.max(0, Math.min(100, 100 * v / Math.max(cap, pay))).toFixed(1);
  const top = rosterOf(tid).filter(p => p.contract && p.contract.yrs > 0).sort((a, b) => b.contract.amt - a.contract.amt).slice(0, 5);
  return `<div class="cl-capbar" title="Payroll ${fmtMoney(pay)} of a ${fmtMoney(cap)} cap"><i class="cb-pay" style="width:${pct(act)}%"></i><i class="cb-dead" style="width:${pct(dead)}%"></i></div>
    <div class="cl-capfig"><div><span>Cap space</span><b class="${room < 0 ? 'bad' : ''}">${fmtMoney(room)}</b></div><div><span>Payroll</span><b>${fmtMoney(pay)}</b></div><div><span>Cap</span><b>${fmtMoney(cap)}</b></div>
      <div><span>Dead money</span><b class="${dead > 0 ? 'bad' : ''}">${fmtMoney(dead)}</b></div><div><span>Next year</span><b>${fmtMoney(next)}</b></div><div><span>Signed for next year</span><b>${rosterOf(tid).filter(p => p.contract && (p.contract.yrs >= 2 || p.contract.next)).length}</b></div></div>
    <table class="cl-tbl cl-hits"><thead><tr><th class="l">Biggest cap hits</th><th class="lo">Yrs</th><th>Cap hit</th></tr></thead><tbody>${top.map(p => `<tr><td class="l cl-name"><span class="cl-pos">${esc(p.lbl)}</span> ${playerLink(p)}</td><td class="lo">${p.contract.yrs}</td><td><b>${fmtMoney(p.contract.amt)}</b></td></tr>`).join('')}</tbody></table>`;
}
// where a club's first-round pick would fall if the season ended today: worst record first
function clProjected(orig) {
  const recs = standings(), pct = r => { const g = r.w + r.l + r.t; return g ? (r.w + r.t / 2) / g : 0.5; };
  const order = state.teams.map(t => t.id).sort((a, b) => pct(recs[a]) - pct(recs[b]) || (recs[a].pf - recs[a].pa) - (recs[b].pf - recs[b].pa));
  return order.indexOf(orig) + 1;
}
function clPicks(tid) {
  const yrs = [...new Set(state.picks.filter(pk => pk.owner === tid || pk.orig === tid).map(pk => pk.season))].sort((a, b) => a - b).slice(0, 2);
  if (!yrs.length) return '<div class="cl-empty">No picks on the books.</div>';
  const live = state.phase === 'REG' || state.phase === 'PLAYOFFS' || state.phase === 'RECAP';
  const slot = pk => { const o = state.draft && pk.season === state.draft.year ? state.draft.order.find(z => z.pickId === pk.id) : null; return o ? `#${o.pick}` : live && pk.season === state.season + 1 ? `~#${(pk.round - 1) * state.teams.length + clProjected(pk.orig)}` : ''; };
  let held = 0;
  const grid = yrs.map(yr => `<div class="cl-py">${yr}</div>${Array.from({ length: DRAFT_ROUNDS }, (_, i) => {
    const r = i + 1, mine = state.picks.filter(pk => pk.season === yr && pk.round === r && pk.owner === tid), away = state.picks.find(pk => pk.season === yr && pk.round === r && pk.orig === tid && pk.owner !== tid);
    held += mine.length;
    const own = mine.find(pk => pk.orig === tid), extra = mine.filter(pk => pk.orig !== tid);
    const title = [own ? `Your own round ${r} pick` : away ? `Round ${r} traded to the ${teamName(away.owner)}` : `No round ${r} pick`, ...extra.map(pk => `Round ${r} from the ${teamName(pk.orig)}`)].join(' · ');
    return `<button class="cl-pk ${own ? 'own' : away ? 'gone' : 'none'}${extra.length ? ' plus' : ''}" data-action="nav" data-view="draft" title="${esc(title)}"><b>R${r}</b>${own ? `<span>${slot(own) || 'Own'}</span>` : away ? `<span>→ ${T(away.owner).abbr}</span>` : '<span>—</span>'}${extra.map(pk => `<span class="cl-px" style="--c:${T(pk.orig).color}">+${T(pk.orig).abbr}${slot(pk) ? ' ' + slot(pk) : ''}</span>`).join('')}</button>`;
  }).join('')}`).join('');
  return `<div class="cl-picks">${grid}</div><div class="cl-foot">${held} pick${held === 1 ? '' : 's'} in the next ${yrs.length === 1 ? 'draft' : 'two drafts'}${live ? ' · ~ projected on today’s standings' : ''}</div>`;
}
function clLeaders(tid) {
  const ro = rosterOf(tid).filter(p => p.stats && p.stats.gp), cats = [['Passing', 'passY', ' yds'], ['Rushing', 'rushY', ' yds'], ['Receiving', 'recY', ' yds'], ['Tackles', 'tkl', ''], ['Sacks', 'sck', ''], ['Interceptions', 'dint', '']];
  const rows = cats.map(([l, k, un]) => { const p = ro.slice().sort((a, b) => (b.stats[k] || 0) - (a.stats[k] || 0))[0]; return p && p.stats[k] ? `<tr><th class="l">${l}</th><td class="l cl-name">${playerLink(p)} <span class="cl-pos">${esc(p.lbl)}</span></td><td><b>${round1(p.stats[k])}</b>${un}</td></tr>` : ''; }).join('');
  return rows ? `<table class="cl-tbl cl-kv"><tbody>${rows}</tbody></table>` : '<div class="cl-empty">No stats yet this season.</div>';
}
function clNews(tid) {
  const items = state.news.filter(n => n.tids && n.tids.includes(tid)).slice(0, 3);
  return items.length ? `<ul class="cl-news">${items.map(n => `<li><span>${n.s} ${esc(n.when)}</span><div>${clLinkNames(n.text)}</div></li>`).join('')}</ul>` : '<div class="cl-empty">No club news yet.</div>';
}
function clubPageHTML(tid, o = {}) {
  const t = T(tid), recs = standings(), r = recs[tid], games = clGames(tid), mine = tid === state.userTid;
  const div = divisionStandings()[t.conf + ' ' + t.div] || [], place = div.findIndex(x => x.tid === tid) + 1;
  const pct = x => { const g = x.w + x.l + x.t; return g ? (x.w + x.t / 2) / g : 0; };
  const conf = state.teams.filter(x => x.conf === t.conf).map(x => x.id).sort((a, b) => pct(recs[b]) - pct(recs[a]) || (recs[b].pf - recs[b].pa) - (recs[a].pf - recs[a].pa)), cplace = conf.indexOf(tid) + 1;
  const done = games.filter(g => clRes(g)), form = done.slice(-5);
  const formHTML = Array.from({ length: 5 }, (_, i) => { const g = form[i - (5 - form.length)]; if (!g) return '<i class="cl-f none"></i>'; const x = clRes(g); return g.gid !== undefined && state.games[g.gid] ? `<button class="cl-f ${x}" data-action="box" data-gid="${g.gid}" title="${g.po ? esc(g.title) : 'Week ' + g.wk}: ${x} ${g.us}–${g.them} ${g.home ? 'vs' : 'at'} ${esc(T(g.opp).name)}">${x}</button>` : `<i class="cl-f ${x}">${x}</i>`; }).join('');
  const hc = C(t.hc), when = `${state.season} · ${state.phase === 'REG' ? 'Week ' + Math.min(state.week, SEASON_WEEKS) : esc(PHASE_LABEL[state.phase] || state.phase)}`;
  // the next game, or what the club is doing instead
  let next;
  const ng = nextGame(tid);
  if (ng) { const opp = ng.h === tid ? ng.a : ng.h, home = ng.h === tid;
    next = `<div class="cl-nl">Next game · Week ${state.week}</div><div class="cl-nm"><span class="cl-mini" style="--c:${T(opp).color}">${esc(T(opp).abbr)}</span><div><b>${home ? 'vs' : 'at'} ${clubTag(opp, true)}</b><span>${recOf(opp, recs)} · ${home ? 'at home' : 'on the road'}${T(opp).conf === t.conf && T(opp).div === t.div ? ' · division' : ''}</span>${(recs[opp].last || []).length ? `<span class="cl-oform" title="Their last ${Math.min(5, recs[opp].last.length)}">${recs[opp].last.slice(-5).map(x => `<i class="${x}"></i>`).join('')}</span>` : ''}</div></div>`; }
  else if (state.phase === 'PLAYOFFS' && state.playoffs) { const po = state.playoffs, out = po.elim && po.elim[tid] !== undefined, seed = po.seeds && po.seeds[t.conf] && po.seeds[t.conf].includes(tid) ? seedOf(tid) : null;
    next = `<div class="cl-nl">Playoffs</div><div class="cl-nm"><div><b>${out ? `Out in the ${ROUND_NAMES[po.elim[tid]]}` : seed ? `#${seed} seed` : 'Missed the playoffs'}</b><span>${!out && seed ? ROUND_NAMES[po.round] || '' : `${state.season} season over`}</span></div></div>`; }
  else { const pk = state.picks.filter(x => x.owner === tid && x.round === 1).sort((a, b) => a.season - b.season)[0];
    next = `<div class="cl-nl">${esc(PHASE_LABEL[state.phase] || 'Offseason')}</div><div class="cl-nm"><div><b>${state.phase === 'REG' ? 'Season over' : 'The offseason'}</b><span>${pk ? `First-round pick ${pk.season}${pk.orig !== tid ? ' (from ' + T(pk.orig).abbr + ')' : ''}` : 'No first-round pick'}</span></div></div>`; }
  const inj = rosterOf(tid).filter(p => p.injury).length, d = r.pf - r.pa;
  const fig = (k, v, s) => `<div><div class="k">${k}</div><div class="v">${v}${s ? `<small>${s}</small>` : ''}</div></div>`;
  return `<div class="club" style="${Object.entries(clubVars(tid)).map(([k, v]) => `${k}:${v}`).join(';')}">
    <header class="cl-mast" data-abbr="${esc(t.abbr)}">
      <div class="cl-badge" title="${esc(t.region + ' ' + t.name)}"><span>${esc(t.abbr)}</span></div>
      <div class="cl-id"><div class="cl-over">${esc(t.conf + ' ' + t.div)} · ${when}${mine ? ' · your club' : T(state.userTid).conf === t.conf && T(state.userTid).div === t.div ? ' · division rival' : ''}</div>
        <h1>${esc(t.region)} <b>${esc(t.name)}</b></h1>
        <div class="cl-men"><span class="cl-ml">Head coach</span> ${hc ? coachNameLink(hc) : '<span>Vacant</span>'}<i>·</i><span class="cl-ml">GM</span> ${mine ? '<b>You</b>' : gmOf(tid) ? `<b>${esc(gmName(gmOf(tid)))}</b>` : 'Vacant'}</div></div>
      <div class="cl-rec"><div class="cl-big">${recStr(r)}</div><div class="cl-place">${ordinal(place)} ${esc(t.conf)} ${esc(t.div)} · ${ordinal(cplace)} ${esc(t.conf)}</div><div class="cl-form">${formHTML}</div></div>
      <div class="cl-next">${next}</div>
    </header>
    <div class="cl-ledger">${fig('Pts for', r.pf, done.length ? `${round1(r.pf / Math.max(1, r.w + r.l + r.t))}/g` : '')}${fig('Pts against', r.pa, done.length ? `${round1(r.pa / Math.max(1, r.w + r.l + r.t))}/g` : '')}
      ${fig('Diff', `<span class="${d > 0 ? 'good' : d < 0 ? 'bad' : ''}">${d > 0 ? '+' : ''}${d}</span>`)}${fig('Streak', esc(r.streak || '–'))}
      ${fig('Cap space', `<span class="${capRoom(tid) < 0 ? 'bad' : ''}">${fmtMoney(capRoom(tid))}</span>`)}${fig('Payroll', fmtMoney(payroll(tid)))}${fig('Next year', fmtMoney(payrollNext(tid)))}
      ${fig('Roster', `${rosterCount(tid)}<small>/ ${rosterLimit()}</small>`)}${fig('Injured', inj, inj === 1 ? 'player' : 'players')}</div>
    ${o.notice ? `<div class="cl-notice"><b>Now</b><span>${o.notice}</span></div>` : ''}${o.alert ? `<div class="cl-alert">${o.alert}</div>` : ''}
    <div class="cl-body">
      <div class="cl-col cl-a">${clSec(`${state.season} schedule`, games.length ? clSchedule(tid, games) : '<div class="cl-empty">The schedule comes out when the season starts.</div>', clMore('Full schedule', 'schedule'), 'cl-schedsec')}
        ${clSec(`Injuries${inj ? ` <span class="cl-count">${inj}</span>` : ''}`, clInjuries(tid), clGo('Roster', 'clubRoster', tid))}</div>
      <div class="cl-col cl-b">${clSec('Division', clDivision(tid), clMore('Standings', 'standings'))}
        ${clSec('Front office and staff', clStaff(tid), clGo('Staff', 'clubStaff', tid))}
        ${clSec('Club news', clNews(tid), clMore('All news', 'news'))}</div>
      <div class="cl-col cl-c">${clSec('Salary cap', clCap(tid), clGo('Contracts', 'clubRoster', tid))}
        ${clSec('Draft picks', clPicks(tid), clMore('Draft', 'draft'))}
        ${clSec('Team leaders', clLeaders(tid), clMore('League stats', 'stats'))}</div>
    </div></div>`;
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
    rec, drills: rec ? `<b>${rec.w}–${rec.l}</b>` : '<span class="muted">—</span>', vs1: rec && rec.v1[0] + rec.v1[1] ? `${rec.v1[0]}–${rec.v1[1]}` : '<span class="muted">—</span>',
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
const PRE_ROOMS = [['ALL', 'Everyone'], ['QB', 'QB'], ['RB', 'RB'], ['WR', 'WR'], ['TE', 'TE'], ['OL', 'OL'], ['DL', 'DL'], ['LB', 'LB'], ['CB', 'CB'], ['S', 'S'], ['ST', 'K/P']];
function preRoomOf(p) { const c = cpos(p); return c === 'K' || c === 'P' ? 'ST' : c; }
function preCamped() { return !!(state.pre && (state.pre.camped || (state.camp && state.camp.blocks >= 2))); }
function preNextLabel() { return !state.pre ? 'camp opens' : !preCamped() ? 'two weeks of camp' : state.phase === 'CUTDOWN' ? 'the cuts' : `exhibition ${state.pre.wk + 1}`; }
// camp is on the field (the meeting, the chart and the tracker have something to show); the page itself opens with the offseason
function preCampOn() { return !!(state && state.pre && state.camp && ['PRESEASON', 'CUTDOWN'].includes(state.phase)); }
function preOpen() { return !!state && (planOn() || preCampOn()); }
function preTabs() { const cut = state.phase === 'CUTDOWN' && !!state.cut;
  return [['roster', 'The roster'], ...(cut ? [['cut', 'The cuts']] : [])]; }
function preTabNow() { const t = preTabs(); return t.some(x => x[0] === ui.preTab) ? ui.preTab : t[0][0]; }
// the roster page: everyone ranked in his room as the staff has him, with the cut line, every row opening into his camp; or your own groups
function preRosterHTML() {
  const v = ui.rosView === 'groups' ? 'groups' : 'pos';
  const sw = `<div class="pr-sw"><span class="seg"><button class="${v === 'pos' ? 'on' : ''}" data-action="rosView" data-v="pos">By position</button><button class="${v === 'groups' ? 'on' : ''}" data-action="rosView" data-v="groups">Custom groups</button></span>
    <span class="small muted">${v === 'pos' ? 'Each room in its coach’s order, with the line where he would cut today. Click a man for his week-by-week; a heading to sort.' : 'Your own groups and orders, any men side by side. They change nothing on the chart or the roster.'}</span></div>`;
  return sw + (v === 'groups' ? preGroupsHTML() : preFiguresHTML() + preTrackHTML());
}
// the staff's count, as five printed figures
function preFiguresHTML() {
  const u = state.userTid, ro = rosterOf(u), on = ro.filter(countsOn53), bub = campBubble(u), cnt = k => on.filter(p => bub[p.id] && bub[p.id].cat === k).length, d = on.length - ROSTER_MAX;
  const fig = (v2, l, st, cls, i) => `<div class="fig"><div class="fig-v">${v2}</div><div class="fig-l">${l}</div>${st ? `<span class="stamp ${cls} s${i}">${st}</span>` : ''}</div>`;
  return `<div class="card bb-top"><div class="ds-lb">The staff’s ${ROSTER_MAX}, as it stands today</div><div class="figs five">
      ${fig(on.length, 'on the roster', d > 0 ? d + ' to cut' : d < 0 ? 'room for ' + -d : 'at the limit', d > 0 ? 'bad' : 'good', 0)}${fig(cnt('lock') + cnt('likely'), 'locks and likely', 'safe', 'good', 1)}${fig(cnt('bubble'), 'on the bubble', 'undecided', 'note', 2)}${fig(cnt('ps'), 'practice-squad candidates', 'stash', '', 3)}${fig(cnt('long'), 'long shots', 'long odds', 'bad', 0)}</div>
    ${ro.length - on.length ? `<div class="small muted" style="margin-top:6px">${ro.length - on.length} more are heading to injured reserve and do not count.</div>` : ''}</div>`;
}
// your groups, with the same rows as the roster: open any man into his camp
function preGroupsHTML() {
  const u = state.userTid, ro = rosterOf(u), camp = campOn(), cm = camp ? state.camp : { battles: [], blocks: 0 }, open = ui.trkOpen || {};
  const pl = ensurePlan(), bub = campBubble(u), room = PLAN_ROOMS.find(r => r[0] === ui.campRoom) || PLAN_ROOMS[0], [rk, rname, poss] = room;
  const all = ro.filter(p => p.a && poss.includes(cpos(p))), groups = (pl.groups[rk] || []);
  for (const g of groups) g.pids = g.pids.filter(id => { const p = P(id); return p && p.tid === u; });
  const grouped = new Set(groups.flatMap(g => g.pids)), hints = cm.battles.filter(b => poss.includes(b.pos));
  let h = `<div class="pl-rooms">${PLAN_ROOMS.map(r => { const n = ro.filter(p => r[2].includes(cpos(p))).length; return `<button class="${r[0] === rk ? 'on' : ''}" data-action="campRoom" data-room="${r[0]}">${r[0]}<span>${n}</span></button>`; }).join('')}<span class="spacer"></span>
    <input type="text" placeholder="New group, e.g. Backup X" maxlength="40" data-change="planNew" data-room="${rk}" style="width:200px"><button class="sm" data-action="planReset" data-room="${rk}" title="Throw away your groups in this room and start from the staff's chart">Reset room</button></div>
    ${hints.length ? `<div class="small pl-hints">${hints.map(b => `<span><span class="muted">Too close to call for the staff:</span> <b>${esc(b.label)}</b> — ${battleBoard(b).map(r => esc(r.p.last)).join(', ')} <button class="sm" data-action="planFromBattle" data-bid="${b.id}" data-room="${rk}">Make it a group</button></span>`).join('')}</div>` : ''}`;
  const head = `<div class="ph-thead"><span>Player</span><span>Job · string</span><span>Staff has him</span><span class="ph-num">Camp grade</span><span class="ph-num">One-on-ones</span><span class="ph-num">Team periods</span><span class="ph-num">Exhibitions</span><span></span></div>`;
  for (const g of groups) {
    const free = all.filter(p => !g.pids.includes(p.id)).sort((a, b) => (bub[a.id] ? bub[a.id].i : 99) - (bub[b.id] ? bub[b.id].i : 99));
    h += `<div class="card ph-track pg-g"><div class="ph-group pg-h"><input type="text" class="pl-name" value="${esc(g.name)}" maxlength="40" data-change="planName" data-gid="${g.id}" title="Rename this group"><span class="muted">${g.pids.length} ${g.pids.length === 1 ? 'man' : 'men'}</span><span class="spacer"></span>
      <select data-change="planAdd" data-gid="${g.id}"><option value="">Add a player…</option>${free.map(p => `<option value="${p.id}">${esc(p.lbl)} ${esc(pname(p))}${grouped.has(p.id) ? '' : ' ·'}</option>`).join('')}<option value="other">Someone from another room…</option></select>
      <button class="sm" data-action="planGroupMove" data-gid="${g.id}" data-dir="-1" title="Move this group up">▲</button><button class="sm" data-action="planGroupMove" data-gid="${g.id}" data-dir="1" title="Move this group down">▼</button><button class="sm danger" data-action="planDelete" data-gid="${g.id}" title="Delete this group">Delete</button></div>
      ${g.pids.length ? head + g.pids.map((id, i) => preTrackRow(P(id), bub, !!open[id], `<span class="pg-ctl"><span class="pl-n">${i + 1}</span><button class="sm" data-action="planMove" data-gid="${g.id}" data-pid="${id}" data-dir="-1" title="Move up" ${i === 0 ? 'disabled' : ''}>▲</button><button class="sm" data-action="planMove" data-gid="${g.id}" data-pid="${id}" data-dir="1" title="Move down" ${i === g.pids.length - 1 ? 'disabled' : ''}>▼</button><button class="sm" data-action="planRemove" data-gid="${g.id}" data-pid="${id}" title="Take him out of this group">✕</button></span>`)).join('') : '<div class="small muted" style="padding:10px 14px">Empty. Add anyone you want to compare here.</div>'}</div>`;
  }
  if (ui.planOther) { const g = planGroup(ui.planOther), others = ro.filter(p => p.a && !poss.includes(p.pos) && !(g && g.pids.includes(p.id))).sort((a, b) => POSITIONS.indexOf(a.pos) - POSITIONS.indexOf(b.pos) || uOvr(b) - uOvr(a));
    if (g) h += `<div class="callout small">Add a player from another room to <b>${esc(g.name)}</b>: <select data-change="planAdd" data-gid="${g.id}"><option value="">Choose…</option>${others.map(p => `<option value="${p.id}">${esc(p.lbl)} ${esc(pname(p))}</option>`).join('')}</select> <button class="sm" data-action="planOtherClose">Done</button></div>`; }
  if (!groups.length) h += `<div class="callout small">No groups in this room yet. Name one above, or press Reset room to start from the staff's chart.</div>`;
  return h;
}
function preHubHTML() {
  if (!preOpen()) return '<div class="pagehead"><div><h1>Roster planner</h1></div></div><div class="card"><p class="muted">This page opens when the season ends and stays through the coaching search, free agency, the draft and camp, until your cuts are final.</p></div>';
  const camp = preCampOn(), u = state.userTid, ro = rosterOf(u), on = ro.filter(countsOn53), d = on.length - ROSTER_MAX; if (camp) ensureReps();
  const tabs = preTabs(), tab = preTabNow();
  return `<div class="pagehead"><div><h1>${camp ? 'Preseason' : 'Roster planner'}</h1><div class="sub">${camp ? `${ro.length} men, ${ROSTER_MAX} jobs. Next: ${preNextLabel()}.` : `${PHASE_LABEL[state.phase]} · camp has not opened · ${on.length} on the roster, ${d > 0 ? d + ' over ' + ROSTER_MAX : -d + ' under ' + ROSTER_MAX}`}</div></div></div>
    ${tabs.length > 1 ? `<div class="ph-tabs">${tabs.map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" data-action="preTab" data-v="${k}">${l}</button>`).join('')}</div>` : ''}
    ${tab === 'cut' ? cutdownHTML() : preCutBarHTML() + preRosterHTML()}`;
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
function preRepsHTML(unitArg, tabsArg) {
  const u = state.userTid, R = ensureReps(), unit = unitArg || (['off', 'def', 'st'].includes(ui.repsUnit) ? ui.repsUnit : 'off'), ro = rosterOf(u), bub = campBubble(u);
  const groups = (unit === 'st' ? [['Kicking game', ['K', 'P']]] : DC_GROUPS[unit].map(([t, ks]) => [t, ks.filter(k => REP_JOB[k])]).filter(g => g[1].length)); ui.repsGrp = ui.repsGrp || {};
  let grp = groups.find(g => g[0] === ui.repsGrp[unit]) || groups[0];
  if (ui.repsJob && REP_JOB[ui.repsJob] && REP_JOB[ui.repsJob][4] === unit && !grp[1].includes(ui.repsJob)) grp = groups.find(g => g[1].includes(ui.repsJob)) || grp;
  if (!grp) return '<div class="callout">No practice jobs here.</div>';
  ui.repsGrp[unit] = grp[0];
  const job = grp[1].includes(ui.repsJob) ? ui.repsJob : grp[1][0]; ui.repsJob = job;
  const J = REP_JOB[job], list = R.jobs[job] || [];
  const tabs = tabsArg || `<div class="dc2-tabs">${[['off', 'Offense'], ['def', 'Defense'], ['st', 'Kicking']].map(([k, l]) => `<button class="${k === unit ? 'on' : ''}" data-action="repsUnit" data-v="${k}">${l}</button>`).join('')}</div>`;
  const nOwn = Object.keys(R.own).length, ctl = `<div class="dc2-ctl"><span class="small muted">${nOwn ? `You have set ${nOwn} job${nOwn === 1 ? '' : 's'}; the rest follow your game order.` : 'Every job follows your game order.'}</span>${nOwn ? `<button class="sm" data-action="repsRs" data-k="">Hand it all back</button>` : ''}</div>`;
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
      <div class="rp-kv"><span>On your chart</span><b>${js.map(q => `${esc(REP_JOB[q.k][1])}, ${REP_STRING[q.s].toLowerCase()}`).join(' · ') || `<span class="muted">off it: the coaches have him with the ${REP_STRING[repsString(pickP.id)].toLowerCase()}</span>`}</b></div>
      <div class="rp-kv"><span>Camp grade</span><b>${x.grade}${x.weeks ? ' ' + x.weeks : ''}</b></div><div class="rp-kv"><span>One-on-ones</span><b>${x.drills} <span class="muted small">(${x.vs1} against the ones)</span></b></div>${campTeamGrade(pickP) !== null ? `<div class="rp-kv"><span>Team periods</span><b>${gradeChip(campTeamGrade(pickP))} <span class="muted small">(${pickP.camp.tp.snp} snaps)</span></b></div>` : ''}
      ${note ? `<div class="ph-note" style="margin-top:6px">“${esc(note[2])}”</div>` : ''}
      <div class="row" style="gap:8px;margin-top:10px">${here || repsCanWork(pickP, job) ? `<span class="seg">${[0, 1, 2].map(st => `<button class="sm ${here && here.s === st ? 'on' : ''}" data-action="repsDo" data-k="${job}" data-pid="${pickP.id}" data-s="${st}" title="${esc(J[1])}: with the ${REP_STRING[st].toLowerCase()}">${REP_STRING[st]}</button>`).join('')}</span><span class="small muted">at ${esc(J[1].toLowerCase())}</span>` : `<span class="small muted">He cannot work at ${esc(J[1].toLowerCase())}.</span>`}<span class="spacer"></span><button class="sm" data-action="player" data-pid="${pickP.id}">His file</button></div></div>`; }
  const benchCard = `<div class="dc2-side rp-side"><div class="card dc2-bench"><div class="dc2-bh"><div><div class="dc2-bk">Who could work at</div><h3 style="margin:0">${esc(J[1])}</h3></div><span class="small muted">${can.length} men</span></div>
    <div class="dc2-bl">${can.map(benchRow).join('') || '<div class="muted small">Nobody on the roster can work here.</div>'}</div></div>${big}</div>`;
  return `<div class="dc2"><div class="dc2-top">${tabs}${ctl}</div>
    <div class="dc2-main"><div class="dc2-left"><div class="dc2-jobs">${grpSel}${cards}</div>
      <div class="small muted" style="margin-top:8px"><b>Drag a man</b> to a place in a job’s order, from the list on the right or from another card. <b>+</b> gives him practice reps at the job you have selected; <b>×</b> takes him off (take him off everything and the coaches put him wherever they see fit); his name opens his card. A job you have not changed follows your game order. In camp the ones practice against the ones; in the season the order sets each room's first-team reps.</div></div>${benchCard}</div></div>`;
}
// ---- the roster, man by man ----
function preTrackRow(p, bub, open, ctl, rank) {
  const x = campPlayerBits(p), jobs = repsJobsOf(p.id), cat = bub[p.id] ? CAMP_CAT[bub[p.id].cat] : null, c = p.camp && p.camp.s === state.season ? p.camp : null, pre = p.preS;
  let h = `<div class="ph-row ${open ? 'open' : ''}" data-action="trk" data-pid="${p.id}" data-mkl="Week by week"><div class="ph-who">${ctl || ''}${rank ? `<span class="pr-rk">${rank}</span>` : ''}<button class="link" data-action="player" data-pid="${p.id}" title="Open his card"><b>${esc(pname(p))}</b></button><span class="muted"> ${esc(p.lbl)} · ${p.age}${p.exp === 0 ? ' · rookie' : ''}</span>${p.injury ? ` <span class="pill inj" title="${esc(p.injury.name)}">${p.injury.weeks}w</span>` : ''}</div>
    <div class="ph-job1">${jobs.length ? jobs.map(j => `<span class="ph-js s${j.s}" title="${esc(REP_JOB[j.k][1])}: with the ${REP_STRING[j.s].toLowerCase()}">${esc(j.k)} ${j.s + 1}s</span>`).join('') : '<span class="muted">—</span>'}</div>
    <div>${cat ? `<span class="pill ${cat[1]}">${cat[0]}</span>` : ''}</div>
    <div class="ph-num">${x.grade}${x.weeks ? `<span class="ph-wks">${x.weeks}</span>` : ''}</div>
    <div class="ph-num">${x.drills}${x.rec ? `<span class="muted small"> · ${x.vs1} v ones</span>` : ''}</div>
    <div class="ph-num">${(() => { const g = campTeamGrade(p); return g === null ? '<span class="muted">—</span>' : gradeChip(g) + `<span class="muted small"> · ${p.camp.tp.snp} snaps</span>`; })()}</div>
    <div class="ph-num">${pre && pre.snp ? `${pre.snp} snaps ${gradeChip(preGrade(p))}` : '<span class="muted">—</span>'}</div><span class="ph-chev">▾</span></div>`;
  if (!open) return h;
  const log = (c && c.log) || [], wk = log.map((w, b) => { if (!w) return ''; const ty = Object.keys(w.ty || {}).map(k => `<div class="ph-kv"><span>${REP_DRILL[k] || k}</span><b>${w.ty[k][0]}–${w.ty[k][1]}</b></div>`).join(''), note = (c.notes || []).find(n => n[0] === b);
    return `<div class="ph-wk"><div class="ph-wh"><b>${esc(w.lb || 'Week ' + (b + 1))}</b><span class="ph-js s${w.t}">${REP_STRING[w.t]}</span>${gradeChip(c.sc[b])}</div>
      ${ty || '<div class="muted small">No one-on-one work.</div>'}${w.v1 && w.v1[0] + w.v1[1] ? `<div class="ph-kv"><span>Against the ones</span><b>${w.v1[0]}–${w.v1[1]}</b></div>` : ''}
      ${w.tp ? `<div class="ph-tp"><div class="ph-kv"><span>Team periods · ${w.tp.snp} snaps</span><b>${w.tp.g === null ? '<span class="muted">too few to grade</span>' : gradeChip(w.tp.g)}</b></div>${Object.keys(w.tp.f || {}).map(k => `<div class="ph-kv sub"><span>${FACETS[k]}</span><b>${w.tp.f[k]}</b></div>`).join('')}${w.tp.line ? `<div class="small muted">${esc(w.tp.line)}</div>` : ''}</div>`
        : w.up || w.dn ? `<div class="ph-kv"><span>Team periods</span><b>${w.up ? `<span class="good">${w.up} that stood out</span>` : ''}${w.up && w.dn ? ', ' : ''}${w.dn ? `<span class="bad">${w.dn} bad</span>` : ''}</b></div>` : ''}
      ${w.line ? `<div class="small muted">${esc(w.line)}</div>` : ''}${note ? `<div class="ph-note">“${esc(note[2])}”</div>` : ''}</div>`; }).join('');
  const games = ((pre && pre.log) || []).map(g => `<div class="ph-wk game"><div class="ph-wh"><b>Exhibition ${g.wk}</b>${gradeChip(g.g)}</div><div class="ph-kv"><span>Snaps</span><b>${g.snp || 0}</b></div>${g.line ? `<div class="small muted">${esc(g.line)}</div>` : ''}</div>`).join('');
  return h + `<div class="ph-detail">${wk || games ? wk + games : '<div class="muted small">Nothing on him yet: camp has not started.</div>'}
    <div class="ph-dact"><button class="sm" data-action="player" data-pid="${p.id}">Open his file</button>${jobs[0] ? `<button class="sm" data-action="repsGo" data-k="${jobs[0].k}" data-pid="${p.id}">Find him on the chart</button>` : ''}</div></div>`;
}
function preTrackHTML() {
  const u = state.userTid, bub = campBubble(u), room = PRE_ROOMS.some(r => r[0] === ui.trkRoom) ? ui.trkRoom : 'ALL', open = ui.trkOpen || {};
  const so = ui.trkSort && typeof ui.trkSort === 'object' ? ui.trkSort : { k: typeof ui.trkSort === 'string' && ui.trkSort ? ui.trkSort : 'rank', d: 1 }, sort = so.k;
  const move = p => { const c = p.camp && p.camp.s === state.season ? p.camp : null, sc = c ? c.sc.filter(v => v !== undefined && v !== null) : []; return sc.length >= 2 ? sc[sc.length - 1] - sc[sc.length - 2] : 0; };
  const oo = p => { const r = campRecord(p); return r && r.w + r.l ? r.w / (r.w + r.l) : null; }, nul = v => v === null || v === undefined ? null : v;
  const K = { rank: p => bub[p.id] ? bub[p.id].i : 999, name: p => p.last + ' ' + p.first, chart: p => repsString(p.id) * 100 + (bub[p.id] ? bub[p.id].i : 50), bubble: p => ({ bubble: 0, ps: 1, likely: 2, long: 3, lock: 4, ir: 5 }[bub[p.id] ? bub[p.id].cat : 'long']),
    grade: p => nul(campGrade(p)), oo, team: p => nul(campTeamGrade(p)), exh: p => nul(preGrade(p)), move: p => move(p), fall: p => -move(p) };
  const DIR = { rank: -1, name: -1, chart: -1, bubble: -1, grade: 1, oo: 1, team: 1, exh: 1, move: 1, fall: 1 }, kf = K[sort] || K.chart, dd = so.d * (DIR[sort] || 1);
  const cmp = (a, b) => { const x = kf(a), y = kf(b); if (x === null || y === null) return x === null ? (y === null ? 0 : 1) : -1; return (typeof x === 'string' ? x.localeCompare(y) * -1 : y - x) * dd; };
  const th = (k, l, num) => `<span class="ph-th ${num ? 'ph-num' : ''} ${sort === k ? 'on' : ''}" data-action="trkSortH" data-v="${k}" title="Click to sort">${l}${sort === k ? `<i>${so.d > 0 ? '▼' : '▲'}</i>` : ''}</span>`;
  let h = `<div class="ph-bar"><span class="seg">${PRE_ROOMS.map(([k, l]) => `<button class="sm ${k === room ? 'on' : ''}" data-action="trkRoom" data-v="${k}">${l}</button>`).join('')}</span>
    <label class="small muted">Also</label><select data-change="trkSort"><option value="">—</option>${[['move', 'Rising this week'], ['fall', 'Falling this week']].map(([k, l]) => `<option value="${k}" ${k === sort ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <span class="small muted">Click a heading to sort, a man for his week-by-week.</span></div>
    <div class="ph-thead">${th('rank', '# · Player')}${th('chart', 'Job · string')}${th('bubble', 'Staff has him')}${th('grade', 'Camp grade', 1)}${th('oo', 'One-on-ones', 1)}${th('team', 'Team periods', 1)}${th('exh', 'Exhibitions', 1)}<span></span></div>`;
  for (const [rk, rl] of PRE_ROOMS.slice(1)) { if (room !== 'ALL' && room !== rk) continue;
    const l = rosterOf(u).filter(p => preRoomOf(p) === rk).sort((a, b) => cmp(a, b) || (bub[a.id] ? bub[a.id].i : 50) - (bub[b.id] ? bub[b.id].i : 50)); if (!l.length) continue;
    const line = rk === 'ST' ? 0 : ROSTER_TEMPLATE[rk] || 0, ranked = sort === 'rank' && so.d > 0, c = rk === 'ST' ? null : campCoach(u, rk);
    h += `<div class="ph-group"><span>${esc(ROOM_NAME[rk] || (rk === 'ST' ? 'Kickers and punters' : rl))}</span><span class="muted">${l.length} men${c ? ` · ${esc(c.last)}'s order` : ''}${line ? ` · staff keeps ${line}` : rk === 'ST' ? ' · staff keeps a kicker and a punter' : ''}</span></div>`
      + l.map((p, i) => (ranked && line && i === line && !(bub[p.id] && bub[p.id].cat === 'ir') ? '<div class="pr-line"><span>the line</span></div>' : '') + preTrackRow(p, bub, !!open[p.id], '', bub[p.id] ? bub[p.id].i + 1 : '')).join(''); }
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
// a player's season, game by game: what the roster row opens into
function rosterGamesHTML(p) {
  const games = Object.values(state.games).filter(b => b && b.season === state.season && !b.pre && b.stats && b.stats[p.id]).sort((a, b) => a.id - b.id);
  const lg = p.glog || [], line = s2 => s2 && (s2.gp || s2.snp) ? statSummary(s2, p.pos) : '';
  // a game to a line: the week, the opponent (to his club), the result (to the box score), his grade, snaps, line and job grades
  const row = b => { const l = b.stats[p.id], me = b.tids.indexOf(l.tid !== undefined ? l.tid : p.tid), side = me < 0 ? 0 : me, opp = b.tids[1 - side], us = b.score[side], them = b.score[1 - side];
    const g = lg.find(x => x.o === opp && (x.w === 'Wk ' + b.week || x.w === b.playoff)), res2 = us > them ? 'W' : us < them ? 'L' : 'T';
    const fc = g && g.f && Object.keys(g.f).length ? Object.keys(g.f).map(k => `${FACETS[k]} ${Math.round(g.f[k])}`).join(' · ') : '';
    return `<tr><td class="rg-wk">${b.playoff ? esc(b.playoff) : b.week}</td><td class="rg-op">${side === 0 ? 'vs' : '@'} <button class="link" data-action="team" data-tid="${opp}" title="${esc(T(opp).region + ' ' + T(opp).name)}">${esc(T(opp).abbr)}</button></td>
      <td><button class="link rg-res ${res2}" data-action="box" data-gid="${b.id}" title="Box score"><b>${res2}</b>${us}–${them}</button></td><td class="num" data-l="Grade">${g ? gradeChip(Math.round(g.g)) : ''}</td><td class="num" data-l="Snaps">${l.snp || ''}</td><td class="rg-ln">${esc(line(l))}</td><td class="rg-fc">${esc(fc)}</td></tr>`; };
  const st = p.stats || {}, gr = p.advS ? overallGrade(p.advS, p.spot) : null, prev = (p.career || []).filter(r => r.season === state.season - 1).pop();
  const head = `<div class="ros-sum"><span><b>${state.season}</b> · ${st.gp || 0} game${st.gp === 1 ? '' : 's'}${st.gs ? `, ${st.gs} start${st.gs === 1 ? '' : 's'}` : ''}${st.snp ? `, ${st.snp} snaps` : ''}</span>${gr !== null ? `<span>Season grade ${gradeChip(gr)}</span>` : ''}${line(st) ? `<span class="small">${esc(line(st))}</span>` : ''}<span class="spacer"></span><button class="sm" data-action="player" data-pid="${p.id}">Open his file</button></div>`;
  const body = games.length ? `<table class="rsg"><thead><tr><th>Wk</th><th>Opp</th><th>Result</th><th class="num">Grade</th><th class="num">Snaps</th><th>Line</th><th>Job grades</th></tr></thead><tbody>${games.slice(-8).reverse().map(row).join('')}</tbody></table>${games.length > 8 ? `<div class="small muted">The last eight of ${games.length} games; every game is on his card.</div>` : ''}`
    : `<div class="small muted" style="padding:6px 2px">No games yet this season.${prev && prev.gp ? ` Last season: ${prev.gp} games, ${prev.gs || 0} starts${line(prev) ? ', ' + esc(line(prev)) : ''}.` : ''}</div>`;
  const tr = scoutTraits(p), sc = `<div class="ros-sc"><b>${esc(scoutProfile(p, true))}</b>${tr.str.map(x => ` <span class="good">+ ${esc(x)}</span>`).join('')}${tr.weak.map(x => ` <span class="bad">− ${esc(x)}</span>`).join('')}</div>`;
  return `<div class="ros-x">${head}${sc}${body}</div>`;
}
// another club's GM, at the head of its roster: who he is, his career, what he is known for (your own club has none: you are it)
function gmLineHTML(tid) {
  const g = typeof gmOf === 'function' && tid !== state.userTid ? gmOf(tid) : null; if (!g) return '';
  return `<div class="cl-notice rs-gm"><b>GM</b><span><b>${esc(gmName(g))}</b> (${g.age}) · ${esc(gmCareer(g))} <span class="muted">${esc(gmSummary(g))}</span></span></div>`;
}
// the position groups by name, for the heading rows of the roster
const FAM_NAME = { QB: 'Quarterbacks', RB: 'Running backs', FB: 'Fullbacks', WR: 'Wide receivers', TE: 'Tight ends', OL: 'Offensive line', 'Interior DL': 'Interior line', EDGE: 'Edge rushers', LB: 'Linebackers', CB: 'Cornerbacks', S: 'Safeties', K: 'Kickers', P: 'Punters' };
// his position in a tag the color of his unit (offense, defense, the kicking game): filled when he is in the current lineup,
// outlined when he is depth, dashed on the practice squad
function posTag(p, how) {
  const s = SPOTS[p.spot] ? SPOTS[p.spot].side : '', u = s === 'off' ? 'o' : s === 'def' ? 'd' : 's';
  return `<span class="rs-pc u-${u}${how ? ' ' + how : ''}" title="${esc(p.lbl)}: ${how === 'on' ? 'in the lineup' : how === 'ps' ? 'practice squad' : 'depth, not in the current lineup'}">${esc(p.lbl === 'Outside WR' ? 'X/Z' : p.lbl)}</span>`;
}
// his scouting line for a roster row, its whole text and his strengths and weaknesses on hover
function scoutCell(p) { const t = scoutTraits(p), line = scoutProfile(p, true); return `<span class="small muted wrapcell" title="${esc([line, ...t.str.map(x => '+ ' + x), ...t.weak.map(x => '− ' + x)].join('\n'))}">${esc(line)}</span>`; }
// the roster: the club's men on one ruled sheet under the club's masthead and figures, a heading row for each position group
function rosterHTML() {
  const tid = ui.rosterTid == null ? state.userTid : ui.rosterTid;
  const mine = tid === state.userTid, t = T(tid);
  const vw = ui.rosterView === 'true' && !trueOn() ? 'scout' : (ui.rosterView || 'scout');
  const fam = ui.rosterPos || 'ALL', all = rosterOf(tid), ro = all.filter(p => inFamily(p, fam));
  const opts = state.teams.map(x => `<option value="${x.id}" ${x.id === tid ? 'selected' : ''}>${esc(x.region + ' ' + x.name)}</option>`).join('');
  const vopts = ROSTER_VIEWS.filter(([k]) => k !== 'true' || trueOn()).map(([k, l]) => `<option value="${k}" ${k === vw ? 'selected' : ''}>${l}</option>`).join('');
  const rOpen = ui.rosOpen || {};
  const dv = depthView(tid), starters = new Set();
  for (const e of [...dv.off, ...dv.nickel, ...dv.base, dv.k, dv.p]) starters.add(e.p.id);
  const base = [
    { k: 'pos', l: 'Pos', v: p => FAM_INDEX[p.spot] * 1000 - uOvr(p), f: p => posTag(p, starters.has(p.id) ? 'on' : ''), cls: 'rs-p' },
    { k: 'n', l: 'Name', v: p => p.last, f: p => playerLink(p) + ' ' + statusPills(p), cls: 'rs-n' },
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
    { k: 'nx', l: 'Status', v: p => p.contract.next ? 2 : p.expiring ? 1 : 0, f: p => fmtContract(p).replace(/^.*?<\/span>/, '') + (p.expiring ? ' <span class="pill exp">Expiring</span>' : '') + (p.contract.rookie ? ' <span class="pill">Rookie deal</span>' : ''), cls: 'rs-flex' },
  ];
  else if (vw === 'pre') { const pl = state.prePlan || { feat: {}, hold: {} }, canPlan = mine && state.phase === 'PRESEASON';
    cols = [...base, tier, { k: 'up', l: 'Upside', v: upSort, f: p => upsidePill(p) },
      { k: 'cg', l: 'Camp', v: p => campGrade(p) || 0, f: p => gradeChip(campGrade(p)), num: 1, title: 'Practice grade so far in camp' },
      { k: 'psn', l: 'Pre snaps', v: p => p.preS ? p.preS.snp : 0, num: 1, cls: 'rs-w' }, { k: 'pg', l: 'Pre grade', v: p => preGrade(p) || 0, f: p => gradeChip(preGrade(p)), num: 1, cls: 'rs-w' },
      { k: 'pl', l: 'Line', f: p => p.preS && p.preS.gp ? `<span class="small">${statSummary(p.preS.st, p.pos)}</span>` : '', cls: 'rs-flex' },
      { k: 'role', l: 'Role', f: p => starters.has(p.id) ? '<span class="pill">Starter</span>' : '<span class="muted small">Competing</span>' },
      { k: 'plan', l: 'Playing time', f: p => !canPlan ? (pl.feat[p.id] ? 'Featured' : pl.hold[p.id] ? 'Held out' : '') : `<span class="seg">${[['', 'Normal'], ['feat', 'Feature'], ['hold', 'Hold out']].map(([k, l]) => `<button class="sm ${(pl.feat[p.id] ? 'feat' : pl.hold[p.id] ? 'hold' : '') === k ? 'on' : ''}" data-action="preFeat" data-pid="${p.id}" data-v="${k}">${l}</button>`).join('')}</span>` }];
  }
  else if (vw === 'stats') cols = [...base, { k: 'gp', l: 'GP', v: p => p.stats.gp || 0, num: 1 }, { k: 'gs', l: 'GS', v: p => p.stats.gs || 0, num: 1 }, { k: 'snp', l: 'Snaps', v: p => p.stats.snp || 0, num: 1 },
    { k: 'line', l: 'Season', v: p => hypeMetric(p, p.stats), f: p => `<span class="small">${p.stats.gp ? statSummary(p.stats, p.pos) : ''}</span>`, cls: 'rs-flex' },
    { ...STAT_NUM('tkl'), l: 'Tkl' }, { ...STAT_NUM('sck'), l: 'Sck' }, { ...STAT_NUM('dint'), l: 'INT' }, { ...STAT_NUM('pd'), l: 'PD' }, grade];
  else if (vw === 'adv') {
    const fg = (k, l) => ({ k: 'f' + k, l, v: p => (p.advS && facetGrade(p.advS, k, 20, p.spot)) || 0, f: p => gradeChip(p.advS ? facetGrade(p.advS, k, 20, p.spot) : null), num: 1, cls: 'rs-w' });
    cols = [...base, stars, grade, fg('pass', 'Pass'), fg('rush', 'Rush'), fg('rec', 'Recv'), fg('pb', 'Pass blk'), fg('rb', 'Run blk'), fg('rd', 'Run def'), fg('pr', 'Pass rush'), fg('man', 'Man cov'), fg('zone', 'Zone cov'),
      { k: 'snp', l: 'Snaps', v: p => p.stats.snp || 0, num: 1 }];
  } else if (vw === 'comfort') cols = [...base, tier,
    { k: 'cf', l: 'Positional comfort', v: p => Object.keys(p.cf || {}).length, f: p => Object.entries(p.cf || {}).sort((a, b) => b[1] - a[1]).map(([s, c]) => `<span class="pill ${CF_CLS[comfortLabel(c)]}" title="${Math.round(c)}">${SPOTS[s].l} · ${comfortLabel(c)}</span>`).join(' '), cls: 'rs-wrap' },
    { k: 'ad', l: 'Learns', v: p => (p.h && p.h.adapt) || 0, f: p => { const r = learnRate(p); return `<span class="small ${r >= 1.15 ? 'good' : r <= 0.8 ? 'bad' : 'muted'}">${r >= 1.15 ? 'Quick' : r <= 0.8 ? 'Slow' : 'Average'}</span>`; }, title: 'How fast he picks up a new position' }];
  else if (vw === 'dev') { const gms = Math.max(1, state.phase === 'REG' ? state.week - 1 : SEASON_WEEKS), share = p => clamp((p.stats.snp || 0) / (gms * DEV.gameSnaps), 0, 1), TO = Object.keys(TRACK_LABEL);
    cols = [...base, tier, { k: 'up', l: 'Upside', v: upSort, f: p => upsidePill(p), cls: 'rs-w2' },
      { k: 'trk', l: 'Development', v: p => -TO.indexOf(trackOf(p)), f: p => trackPill(p), title: 'How his development is going against what the staff expected', cls: 'rs-w2 rs-w' },
      { k: 'fin', l: 'Finished product', f: p => { if (!isDeveloping(p)) return '<span class="small muted">Finished article</span>'; const line = scoutProfile(finishedPlayer(p), true), c = compFor(p);
        return `<div class="rs-l1" title="${esc(line)}">${esc(line)}</div>${c ? `<div class="rs-l2">Plays like ${compLink(c)}</div>` : ''}`; }, cls: 'rs-flex rs-two rs-w' },
      { k: 'sn', l: 'Snaps', v: p => share(p), f: p => p.stats.snp ? Math.round(share(p) * 100) + '%' : '<span class="muted">—</span>', num: 1, title: 'Share of his unit’s snaps this season. 60% earns full credit for growth' },
      { k: 'pr', l: 'Practice', v: p => pracAvg(p), f: p => PRAC_SIDE[p.pos] ? `<span class="small">${pracGradeLabel(pracAvg(p))}</span>` : '', title: 'His practice weeks since the last checkpoint', cls: 'rs-w2' },
      { k: 'pc', l: 'Position coach', f: p => { const c = posCoach(tid, p.pos); return c ? `<span class="small">${esc(c.last)} ${wordPill(asstWord(c, 'dev'))}</span>` : ''; }, cls: 'rs-w2 rs-w' }];
  }
  else if (vw === 'true') cols = [...base, { k: 'ovr', l: 'OVR', v: p => p.ovr, f: p => rat(p.ovr), num: 1 }, { k: 'pot', l: 'POT', v: p => p.pot, f: p => rat(p.pot), num: 1 },
    { k: 'seen', l: 'Seen as', v: p => uOvr(p), f: p => `${uOvr(p).toFixed(0)} <span class="muted small">(${(uOvr(p) - p.ovr) > 0 ? '+' : ''}${(uOvr(p) - p.ovr).toFixed(1)})</span>`, num: 1 },
    { k: 'hype', l: 'Hype', v: p => p.per ? p.per.h : 0, f: p => p.per ? p.per.h.toFixed(1) : '—', num: 1 },
    { k: 'adapt', l: 'Adapt', v: p => (p.h && p.h.adapt) || 0, num: 1 }];
  else cols = [...base, { k: 'ht', l: 'Ht', v: p => p.m.ht, f: p => `<span class="small muted">${fmtHeight(p.m.ht)}</span>`, num: 1 }, { k: 'wt', l: 'Wt', v: p => p.m.wt, f: p => `<span class="small muted">${p.m.wt}</span>`, num: 1 }, stars, tier,
    { k: 'up', l: 'Upside', v: upSort, f: p => upsidePill(p) },
    { k: 'sk', l: 'Scouting', f: p => scoutCell(p), cls: 'rs-flex' },
    { k: 'fit', l: 'Fit', v: p => schemeFit(p, tid), f: p => { const f = schemeFit(p, tid); return `<span class="small ${f >= 1 ? 'good' : f <= -1 ? 'bad' : 'muted'}" title="Scheme fit in ${esc(T(tid).abbr)}'s system">${fitLabel(f).replace(' fit', '')}${trueOn() ? ` (${f > 0 ? '+' : ''}${f})` : ''}</span>`; } },
    { k: 'c', l: 'Contract', v: p => p.contract.yrs > 0 ? p.contract.amt : 0, f: p => fmtContract(p), num: 1 }];
  if (mine) cols.push({ k: 'a', l: '', f: p => rosterActions(p) });
  const group = { k: 'pos', f: p => { const f = FAMILIES[FAM_INDEX[p.spot]][0]; return [f, FAM_NAME[f] || f]; } };
  const list = table('roster_' + vw, cols, ro, { cls: 'rs-tbl', group, rowClass: p => 'ros-r' + (rOpen[p.id] ? ' open' : ''), rowAttr: p => `data-action="rosOpen" data-pid="${p.id}" data-mkl="Game by game"`, rowAfter: p => rOpen[p.id] ? rosterGamesHTML(p) : '', sort: 'pos', dir: 1 });
  // the masthead: the club (its name switches to another club's roster), its coach and GM, and the head count
  const hc = C(t.hc), g = !mine && typeof gmOf === 'function' ? gmOf(tid) : null, rival = !mine && T(state.userTid).conf === t.conf && T(state.userTid).div === t.div;
  const when = `${state.season} · ${state.phase === 'REG' ? 'Week ' + Math.min(state.week, SEASON_WEEKS) : esc(PHASE_LABEL[state.phase] || state.phase)}`;
  const cnt = rosterCount(tid), lim = rosterLimit(), inj = all.filter(p => p.injury).length, ir = all.filter(p => p.injury && onIR(p)).length;
  const fig = (k, v, s) => `<div><div class="k">${k}</div><div class="v">${v}${s ? `<small>${s}</small>` : ''}</div></div>`;
  const famN = f => f === 'ALL' ? all.length : all.filter(p => inFamily(p, f)).length;
  const strip = ['ALL', ...FAMILIES.map(f => f[0])].map(f => `<button class="${fam === f ? 'on' : ''}" data-action="rosterPos" data-pos="${f}" title="${f === 'ALL' ? 'The whole roster' : FAM_NAME[f] || f}">${f === 'ALL' ? 'All' : f === 'Interior DL' ? 'IDL' : f}<i>${famN(f)}</i></button>`).join('');
  const acts = (mine && state.phase === 'RESIGN' ? '<button class="primary" data-action="resignAll">Re-sign all affordable starters</button>' : '')
    + (mine && all.length > ROSTER_MAX && state.phase === 'PRESEASON' ? `<button class="primary" data-action="autoCut">Auto-cut to ${ROSTER_MAX}</button>` : '');
  return `<div class="club ros" style="${clubVarsCSS(tid)}">
    <header class="cl-mast rs-mast" data-abbr="${esc(t.abbr)}">
      <button class="cl-badge" data-action="team" data-tid="${tid}" title="${mine ? 'Home' : 'The club page'}">${esc(t.abbr)}</button>
      <div class="cl-id"><div class="cl-over">${esc(t.conf + ' ' + t.div)} · Roster · ${when}${mine ? ' · your club' : rival ? ' · division rival' : ''}</div>
        <div class="rs-name"><h1>${esc(t.region)} <b>${esc(t.name)}</b></h1><span class="rs-caret">▾</span><select data-change="rosterTeam" title="Show another club's roster" aria-label="Club">${opts}</select></div>
        <div class="cl-men"><span class="cl-ml">Head coach</span> ${hc ? coachNameLink(hc) : '<span>Vacant</span>'}<i>·</i><span class="cl-ml">GM</span> ${mine ? '<b>You</b>' : g ? `<b>${esc(gmName(g))}</b>` : 'Vacant'}</div></div>
      <div class="cl-rec rs-count"><div class="cl-big">${cnt}<small>/${lim}</small></div><div class="cl-place">${cnt > lim ? `${cnt - lim} over the limit` : 'On the roster'}${state.phase === 'REG' ? ' · IR excluded' : ''}</div><div class="cl-place">Practice squad ${psOf(tid).length}/${PS_MAX}</div></div>
    </header>
    <div class="cl-ledger" style="--n:${t.carry ? 10 : 9}">${fig('Cap', fmtMoney(state.cap))}${t.carry ? fig('Carryover', '+' + fmtMoney(t.carry)) : ''}${fig('Payroll', fmtMoney(payroll(tid)))}
      ${fig('Cap space', `<span class="${capRoom(tid) < 0 ? 'bad' : ''}">${fmtMoney(capRoom(tid))}</span>`)}${fig('Dead money', t.dead ? fmtMoney(t.dead) : '—')}${fig('Next year', fmtMoney(payrollNext(tid)))}
      ${fig('Average age', all.length ? round1(all.reduce((s, p) => s + p.age, 0) / all.length) : '—')}${fig('Rookies', all.filter(p => p.exp === 0).length)}${fig('Expiring', all.filter(p => p.expiring).length)}${fig('Injured', inj, ir ? ir + ' on IR' : '')}</div>
    <div class="rs-bar"><nav class="rs-pos">${strip}</nav><span class="spacer"></span><label class="rs-vl"><span>View</span><select data-change="rosterView">${vopts}</select></label>${acts}</div>
    <div class="rs-scroll">${gmLineHTML(tid)}${mine && state.phase === 'RESIGN' ? decisionsHTML(tid) : ''}${list}
      <div class="rs-foot"><span>${posTag({ spot: 'QB', lbl: 'QB' }, 'on')} in the lineup</span><span>${posTag({ spot: 'QB', lbl: 'QB' })} depth</span><span>Click a column heading to sort it, a row for his season game by game.</span><span>${mine ? `Set the lineup in the <button class="link" data-action="nav" data-view="depth">depth chart</button>; ` : ''}${GAMEDAY_ACTIVE} of the ${ROSTER_MAX} dress on game day.</span></div>
      ${practiceSquadHTML(tid, mine)}</div></div>`;
}
// re-signing season: what needs a decision
function decisionsHTML(tid) {
  const ro = rosterOf(tid);
  const opts = ro.filter(optionDue), ext = ro.filter(extensionDue), exp = ro.filter(p => p.expiring);
  const tagUsed = T(tid).tagYr === state.season + 1;
  const li = (p, extra, btns) => `<div class="rs-dr dec-r">${posTag(p)}<span class="rs-dn">${playerLink(p)} ${tierPill(p)}</span><span class="rs-dx">${extra}</span><span class="rs-db">${btns}</span></div>`;
  const grp = (title, n, body, note) => `<section><div class="rs-sh"><h3>${title}</h3>${n ? `<span class="rs-shn">${n}</span>` : ''}</div>${note ? `<p class="rs-note">${note}</p>` : ''}${body}</section>`;
  let g = '';
  if (opts.length) g += grp('5th-year options due', opts.length, opts.map(p => li(p, `option year ${fmtMoney(optionAmount(p))} <span class="muted">(fully guaranteed)</span>`, `<button class="sm primary" data-action="option" data-pid="${p.id}" data-v="1">Exercise</button><button class="sm" data-action="option" data-pid="${p.id}" data-v="0">Decline</button>`)).join(''));
  if (!tagUsed && exp.length) { const top = exp.slice().sort((a, b) => uOvr(b) - uOvr(a)).slice(0, 3); g += grp('Franchise tag', '1 per year', top.map(p => li(p, `tag ${fmtMoney(tagAmount(p))} for one year`, `<button class="sm" data-action="tag" data-pid="${p.id}">Tag</button>`)).join('')); }
  else if (tagUsed) g += grp('Franchise tag', '', '<p class="rs-note">Franchise tag used this year.</p>');
  const fut = psOf(tid).sort((a, b) => uCeil(b) - uCeil(a));
  if (fut.length) g += grp('Practice squad: reserve/future deals', fut.length, `<div class="fut">${fut.map(p => `<div class="rs-dr fut-row">${posTag(p, 'ps')}<span class="rs-dn">${playerLink(p)} ${tierPill(p)} ${upsidePill(p)}</span><span class="rs-dx muted">age ${p.age}</span><span class="rs-db"><button class="sm" data-action="futures" data-pid="${p.id}">Sign futures deal</button></span></div>`).join('')}</div>`, 'Two years at the minimum, nothing guaranteed. Anyone you do not sign is released when you continue.');
  if (ext.length) g += grp('Extension candidates', 'entering final year', ext.sort((a, b) => uOvr(b) - uOvr(a)).slice(0, 6).map(p => { const a = extensionAsk(p); return li(p, `asks ${a.yrs} yr × ${fmtMoney(a.amt)} <span class="muted">(leverage ${leverageLabel(leverageOf(p)).toLowerCase()})</span>`, `<button class="sm" data-action="extend" data-pid="${p.id}">Extend</button><button class="sm" data-action="player" data-pid="${p.id}">Terms…</button>`); }).join(''));
  return `<div class="rs-dec"><div class="cl-notice"><b>Re-signing</b><span>Expiring players ask for the amount in their row; anyone you don't re-sign (or tag) hits free agency. Undecided 5th-year options get your staff's recommendation when you continue.</span></div>${g ? `<div class="rs-decg">${g}</div>` : ''}</div>`;
}
// elevate him for the next game: on or off, with what he has left this season
function elevCell(p) {
  const u = state.userTid, on = ((state.elev && state.elev[u]) || []).includes(p.id), po = state.phase === 'PLAYOFFS', left = elevLeft(p), full = !on && ((state.elev && state.elev[u]) || []).length >= ELEV_MAX;
  const why = p.injury ? 'Injured' : !po && left <= 0 ? 'No elevations left this season' : full ? `You already have ${ELEV_MAX} elevated for this game` : '';
  return `<button class="sm ${on ? 'on' : ''}" data-action="elevToggle" data-pid="${p.id}" ${why && !on ? `disabled title="${why}"` : 'title="Dress him for the next game; he returns to the squad afterwards"'}>${on ? 'Elevated' : 'Elevate'}</button> <span class="small muted">${po ? 'playoffs' : left + ' left'}</span>`;
}
function practiceSquadHTML(tid, mine) {
  const ps = psOf(tid).sort(famOrder), live = mine && ['REG', 'PLAYOFFS'].includes(state.phase);
  if (!ps.length && !live) return '';
  const head = `<div class="rs-sh"><h3>Practice squad</h3><span class="rs-shn">${ps.length}/${PS_MAX}</span></div>`;
  if (!ps.length) return `<section class="rs-ps">${head}<p class="rs-note">Empty. Sign free agents to it from the Free Agents tab or a player's card: up to ${PS_MAX} players, ${PS_VETS} of them with 3+ seasons.</p></section>`;
  return `<section class="rs-ps">${head}<p class="rs-note">Develops like everyone else and doesn't dress on game day unless you elevate him: up to ${ELEV_MAX} a game, each man ${ELEV_SEASON} times a regular season (playoff elevations don't count), and he goes back to the squad after the game. Can be promoted by you at any time, and other teams can sign them away to their 53. Nobody is promoted for you when injuries hit.</p>` + table('ps', [
    { k: 'pos', l: 'Pos', f: p => posTag(p, 'ps'), cls: 'rs-p' }, { k: 'n', l: 'Name', f: p => playerLink(p) + ' ' + statusPills(p), cls: 'rs-n' }, { k: 'age', l: 'Age', f: p => p.age, num: 1 },
    { k: 'tier', l: 'Tier', v: tierSort, f: p => tierPill(p) + trueNums(p) }, { k: 'up', l: 'Upside', v: upSort, f: p => upsidePill(p) },
    { k: 'sk', l: 'Scouting', f: p => scoutCell(p), cls: 'rs-flex' },
    ...(live ? [{ k: 'el', l: 'Game day', f: p => elevCell(p) }] : []),
    ...(mine ? [{ k: 'a', l: '', f: p => `<button class="sm primary" data-action="promote" data-pid="${p.id}">Promote</button> <button class="sm danger" data-action="psRelease" data-pid="${p.id}">Release</button>` }] : []),
  ], ps, { nosort: 1, cls: 'rs-tbl' }) + '</section>';
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
// the move to the practice squad is on every card of a man on your 53 while squads exist; a click on one who cannot go says why
function psBtnOK(p) { const w = toPSWhyNot(p, state.userTid); return !w || !/not on your 53|time of year/.test(w); }
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
  def: [['Defensive line', ['WE', 'NOSE', 'T3', 'SE', 'WOLB', 'SOLB']], ['Nickel line', ['WEDGE', 'DT', 'SEDGE']], ['Linebackers', ['MLB', 'WLB', 'SAM']], ['Secondary', ['CB', 'NCB', 'DIME', 'FS', 'SS']], ['Passing downs', ['RUSHE', 'RUSHI', 'WLBP', 'NCBP']]],
  off: [['Backfield', ['QB', 'RB', 'FB', 'RB3D', 'RBSY']], ['Receivers', ['X', 'Z', 'SLOT', 'SLOT2']], ['Tight ends', ['Y', 'H', 'Y2', 'Y3D']], ['Offensive line', ['LT', 'LG', 'C', 'RG', 'RT', 'OL6']]],
  st: [['Kicking game', ['K', 'P', 'KR', 'PRET']], ['Coverage and return units', ['KO', 'KRU', 'PU', 'PRU']]],
};
const JOB_HELP = {
  NOSE: 'The nose: over the center in most looks. Mass and strength: he holds the middle.', T3: 'The 3-technique: outside a guard in most looks. Burst and pass rush from the inside.',
  WE: 'The weak-side end: the same man in every base look, wherever the look puts him (the card shows where, and how he grades there).', SE: 'The strong-side end, over or outside the tight end side: in a 4-3 the big end, pinched to a 3 in the Bear.',
  WOLB: 'The weak outside linebacker in the 3-4: the base rusher off the edge.', SOLB: 'The strong outside linebacker in the 3-4: sets the edge on the tight end and drops into coverage when four rush.',
  DT: 'The two tackles in nickel and dime.', WEDGE: 'The weak-side edge in nickel and dime, wide on a 9: the pass rusher.', SEDGE: 'The strong-side edge in nickel and dime.',
  MLB: 'The middle of the defense: run fits and the calls.', WLB: 'Runs and covers. In nickel he is one of two linebackers left on the field.', SAM: 'The strong side in base, over the tight end.',
  CB: 'Outside corners, in order. The first two start; your coach decides whether the best one travels with their top receiver.', NCB: 'Covers the slot. A corner here is a nickel; a safety here is a big nickel.',
  DIME: 'The sixth defensive back.', FS: 'The deep safety: range and ball skills.', SS: 'The safety who comes down into the box.',
  RUSHE: 'Take the edge spots on passing downs in nickel and dime. Leave empty and your regular ends stay in.', RUSHI: 'Take the inside spots on passing downs in nickel and dime. Leave empty and your regular tackles stay in.',
  WLBP: 'Takes the Will job on passing downs. Leave empty and your Will stays in.', NCBP: 'Takes the nickel job on passing downs. Leave empty and your nickel stays in.',
  RB3D: 'Third and long and the two-minute drill. Leave empty and your lead back stays in.', RBSY: 'Short yardage and the goal line. Leave empty and your lead back stays in.', Y3D: 'Takes the tight end spot on third and long and in the two-minute drill when only one tight end is on the field. Leave empty and your in-line man stays in.',
  KR: 'Kick returner.', PRET: 'Punt returner.', KO: 'Ten men: the kickoff coverage team.', KRU: 'Ten men: blockers on kick returns.', PU: 'Ten men: the punt team. The first two are the gunners.', PRU: 'Ten men: punt return. The first two hold up the gunners.',
};
function jobLabel(k) { const r = CHART_SECTIONS.map(s => s.rows.find(x => x[0] === k)).find(Boolean); return r ? r[1].replace(/ \(.*\)$/, '') : k; }
function jobAx(k) { return RUSH_AX[k] !== undefined ? RUSH_AX[k] : null; }
// a seat on defense: his grade where the coach lines it up, look by look (see seatGrade), and how at home he is across those spots
function jobSeat(p, k) { return CHART_UNIT(k) === 'def' && !RUSH_AX[k] ? seatGrade(p, T(state.userTid), k) : null; }
function seatComfort(p, k) { const pl = seatPlaces(T(state.userTid))[k]; if (!pl || !pl.length) return null; let s = 0, n = 0;
  for (const q of pl) { const lw = rowReps(q.slot, q.x, q.depth, q.seat), c = lw ? lw.reduce((a, [sp, w]) => a + w * (LINE_SPOTS.has(sp) ? lineComfort(p, LINE_ANCHORS.find(x => x[0] === sp)[1]) : comfortOf(p, sp)), 0) : comfortOf(p, DEF_SLOT[q.slot][0]); s += q.w * c; n += q.w; }
  return n ? s / n : null; }
function jobSide(k) { return ST_UNIT[k] || ['K', 'P', 'KR', 'PRET'].includes(k) ? 'st' : CHART_UNIT(k); }
// how your staff sees him at this job: his level, adjusted for how the job suits him and how well he knows it
function jobValue(p, k) {
  if (ST_UNIT[k]) return ST_OK.has(p.spot) ? stSeen(p, stRole(p, k)) : 0;
  if (k === 'KR' || k === 'PRET') return returnScore(p);
  const ax = jobAx(k); if (ax !== null) return uOvr(p) + (lineSlotRating(p, ax) - p.ovr); const sg = jobSeat(p, k); return sg !== null ? uOvr(p) + (sg - p.ovr) : chartValue(p, CHART_SPOT[k]);
}
function jobComfort(p, k) { if (jobSide(k) === 'st') return 100; const ax = jobAx(k); if (ax !== null) return lineComfort(p, ax); const sc = CHART_UNIT(k) === 'def' ? seatComfort(p, k) : null; return sc !== null ? sc : comfortOf(p, CHART_SPOT[k]); }
function jobTier(p, k) { return jobSide(k) === 'st' ? null : tierOf(p, jobValue(p, k)); }
function dcDot(p, k) { const cf = comfortLabel(jobComfort(p, k)); return (cf !== 'Natural' && cf !== 'Comfortable' ? `<i class="dcd ${CF_CLS[cf]}" title="${cf} at this job"></i>` : '') + (p.injury ? `<i class="dcd inj" title="Out ${p.injury.weeks} week${p.injury.weeks === 1 ? '' : 's'}">✚</i>` : ''); }
// one man on a job card
// in preseason, how long each man plays: his turn in the relay down this job's list
function dcDurSel(p, k, i) {
  if (scPrac() || !preTimeOn() || typeof RELAY_OPTS === 'undefined' || ST_UNIT[k] || k === 'K' || k === 'P' || k === 'KR' || k === 'PRET') return '';
  const u = state.userTid, per = relayPer(u, k), cur = relayCode(k, p.id, i, per), set = !!(state.prePlan.dur && state.prePlan.dur[k] && state.prePlan.dur[k][p.id]);
  return `<select class="dcc-dur ${set ? 'set' : ''} d-${cur}" data-change="dcDur" data-key="${k}" data-pid="${p.id}" title="How long he plays in the next exhibition, in his turn down this list">${RELAY_OPTS.map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
}
function dcSat(p) { const u = state.userTid, c = T(u).dch; return state.phase === 'PRESEASON' && state.prePlan ? !!state.prePlan.hold[p.id] : !!(c && c.sit && c.sit[p.id]); }
// A seat's card: where the coach lines the seat up in each of his looks and how often, and how each man listed there grades in
// each (the colour; his grade for the seat is these weighted by how often each look is called)
function seatCardHTML(t, k, list) {
  if (!LINE_SEATS.has(k) && k !== 'SAM') return '';
  const pl = seatPlaces(t)[k]; if (!pl || !pl.length) return '';
  const high = defTend(t).high, by = new Map();
  for (const q of pl) { if (q.L.pkg === 'GL') continue; let e = by.get(q.L.id); if (!e) by.set(q.L.id, e = { lab: (q.L.pkg === 'NICKEL' && !LINE_SEATS.has(k) ? 'Nickel ' : '') + q.L.label, qs: [], w: q.w }); e.qs.push(q); }
  const looks = [...by.values()].sort((a, b) => b.w - a.w), tot = looks.reduce((a, e) => a + e.w, 0) || 1; if (!looks.length) return '';
  const tech = e => [...new Set(e.qs.map(q => q.depth >= 2 ? 'off' : techOf(q.x)))].join('/');
  const lv = r => r >= 80 ? 4 : r >= 74 ? 3 : r >= 68 ? 2 : r >= 62 ? 1 : 0, men = list.slice(0, 4), cols = `grid-template-columns:minmax(0, 1fr) repeat(${men.length}, 22px)`;
  const head = `<div class="stc-r stc-h" style="${cols}"><span></span>${men.map((p, i) => `<span title="${esc(pname(p))}">${i + 1}</span>`).join('')}</div>`;
  const rows = looks.map(e => `<div class="stc-r" style="${cols}"><span class="stc-n" title="${esc(e.lab)}: the ${esc(tech(e))} technique, about ${Math.round(e.w / tot * 100)}% of this seat's snaps">${esc(e.lab)} <b>${esc(tech(e))}</b> <i>${Math.round(e.w / tot * 100)}%</i></span>${men.map(p => {
    const r = uOvr(p) + e.qs.reduce((a, q) => a + rowFit(p, q.slot, q.x, q.depth, q.seat, high), 0) / e.qs.length - p.ovr; return `<span class="ls-c ls-${lv(r)}" title="${esc(p.last)} at the ${esc(tech(e))} in ${esc(e.lab)}"></span>`; }).join('')}</div>`).join('');
  return `<details class="dcj-more" ${foldAttr('dcs' + k)}><summary>where he lines up</summary><div class="stc">${head}${rows}</div></details>`;
}
function scPrac() { return view === 'depth' && ui.scMode === 'prac'; }
// the practice order, shaped like a depth chart so the same page can show it
function pracChart(u) { const R = ensureReps(); return { lists: R.jobs, auto: { off: false, def: false, st: false }, ov: {}, rot: {}, prac: true, own: R.own }; }
// who lines up in team periods for one string: each job's men for that string, packages on the downs they are for
function pracLineup(t, tab, vid, pass, str) {
  const R = ensureReps(), lay = dcLayout(t, tab, vid, pass), m = {}, used = new Set(), oneTE = tab === 'off' && PERSONNEL[vid].includes('Y') && !PERSONNEL[vid].includes('H'), has = k => (R.jobs[k] || []).length > 0;
  for (const b of lay) {
    let k = b.key;
    if (tab === 'off') k = b.name === 'RB' ? (pass === 'pass' && has('RB3D') ? 'RB3D' : pass === 'short' && has('RBSY') ? 'RBSY' : 'RB') : b.name === 'Y' && pass === 'pass' && oneTE && has('Y3D') ? 'Y3D' : b.name;
    else k = pass && b.passKey && has(b.passKey) ? b.passKey : (b.baseKey || b.key);
    b.key = k; b.label = tab === 'off' ? chartName(k) : (JOB_SHORT[k] || k);
    const J = REP_JOB[k], L = (R.jobs[k] || []).filter(id => { const p = P(id); return p && p.tid === t.id && !p.injury; });
    // as team periods pick it: a package job takes its men for this string; any other job the first man on its list who practices with this string
    const pool = J && J[5] ? L.slice(str * J[3], str * J[3] + J[3]) : L.filter(id => repsString(id) === str);
    let id = pool.find(x => !used.has(x)); if (id === undefined) id = L.filter(x => !used.has(x)).sort((a, b2) => Math.abs(repsString(a) - str) - Math.abs(repsString(b2) - str))[0]; // short at this string: the nearest man, as camp borrows
    m[b.name] = id !== undefined ? P(id) : null; if (id !== undefined) used.add(id);
  }
  Object.defineProperty(m, '_why', { value: {} }); return { lay, m };
}
// ---------- playbook (view only) ----------
const PERS_LABEL = { '10': '10 (1 RB, 0 TE, 4 WR)', '11': '11 (1 RB, 1 TE, 3 WR)', '12': '12 (1 RB, 2 TE, 2 WR)', '13': '13 (1 RB, 3 TE, 1 WR)', '21': '21 (2 RB, 1 TE, 2 WR)', '22': '22 (2 RB, 2 TE, 1 WR)', JUMBO: 'Jumbo (6 OL)' };
const TYPE_LABEL = { RUN: 'Designed runs', DRAW: 'Draws', OPTION: 'Option', SNEAK: 'QB sneak', JET: 'Jet sweep', QUICK: 'Quick game', DROP: 'Dropback', DEEP: 'Deep shots', RBSCR: 'RB screen', WRSCR: 'WR screen', GADGET: 'Gadgets (reverse, flea flicker)' };
const FORM_LABEL = { SG: 'Shotgun', UC: 'Under center', PI: 'Pistol', EMP: 'Empty' };
const TAG_LABEL = { PA: 'Play-action', MOTION: 'Motion', RPO: 'RPO', BOOT: 'Bootleg' };
const SIT_LABEL = { '1st': '1st down', '2L': '2nd & long (7+)', '2S': '2nd & short', '3S': '3rd/4th & 1–2', '3M': '3rd & 3–6', '3L': '3rd & 7+' };
const COV_LABEL = { C0: 'Cover 0', C1: 'Cover 1 (man-free)', C2: 'Cover 2', C2M: '2-Man', C3: 'Cover 3', C4: 'Quarters', T2: 'Tampa 2', C6: 'Cover 6' };
const PRES_LABEL = { FOUR: '4-man rush', BLITZ: 'Man blitz', FZ: 'Fire zone', SIM: 'Simulated pressure', THREE: '3-man rush' };
const PKG_LABEL = { BASE: 'Base', NICKEL: 'Nickel', DIME: 'Dime', GL: 'Goal line' };
// usage & results for keys with a prefix (self-scout)
function scoutTable(id, a, prefix, labels, opts = {}) {
  const keys = Object.keys(a).filter(k => k.startsWith('u_' + prefix)).map(k => k.slice(2 + prefix.length)).filter(k => labels[k]); // a call that no longer exists (an old save's tags) is not listed
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
  'Under': 'The line slides weak, the nose shades the center to the strength and the Sam (or the strong outside linebacker) stands over the tight end. The same eleven as base.',
  'Bear': 'The center and both guards covered, the strong end pinched to a 3 and a linebacker on the line outside the tight end: the 46. Built to stop the run.',
};
function lookFamily(front, pkg) { return pkg === 'BASE' ? (front === '3-4' || front === 'Tite' ? 'odd' : 'even') : 'sub'; }
// the looks this caller carries for a package, home look first: [[name, share]]
function looksFor(tid, pkg) {
  const dt = defTend(T(tid)), lib = dt.pk && dt.pk.lib, fam = lookFamily(dt.front, pkg);
  if (pkg === 'GL') return { fam, list: [] };
  const list = lib ? (fam === 'sub' ? lib.sub : lib.fam === fam ? lib.base : null) : null;
  let out = (list || [[fam === 'sub' ? 'Even' : LOOK_HOME[dt.front] || 'Over', 1]]).filter(x => LOOKS[fam][x[0]] && !LOOKS[fam][x[0]].fr);
  if (pkg === 'BASE') { const fr = (dt.pk && dt.pk.fr) || {}, keep = clamp(1 - (fr.BEAR || 0) - (fr.UNDER || 0), 0.2, 1); out = out.map(([k, v]) => [k, v * keep]); for (const k of ['Under', 'Bear']) if (fr[k.toUpperCase()]) out.push([k, fr[k.toUpperCase()]]); } // Under and Bear: his base men, moved
  return { fam, list: out };
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

// ---------- the schedule, the standings, the stats, history and the season in review: js/leaguepage.js ----------

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
function foldAttr(k) { return `data-fold="${k}" ${ui.fold && ui.fold[k] ? 'open' : ''}`; }
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
// ---------- trade, free agents, the search, the draft and the waiver wire: js/playerspage.js ----------
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
  const tone = rs.tone >= 0.7 ? ['Strong leadership', 'good'] : rs.tone >= 0.25 ? ['Has a leader', ''] : ['No clear leader', 'muted'];
  const best = graded.slice().sort((a, b) => b.prac.g - a.prac.g)[0];
  return { pos, rs, order, squad, graded, avg, pb, tone, best, coach: posCoach(u, pos) };
}
function pracRating(avg) { return avg === null ? '<span class="pill">No report yet</span>' : `<span class="pill ${avg >= 59 ? 'good' : avg < 42 ? 'bad' : ''}">${pracGradeLabel(avg)}</span>`; }
// ---------- waiver wire (after league-wide cuts) ----------
const wvOpen = () => state.phase === 'WAIVERS' && state.wv && !state.wv.done;
function wvFaButtons(p, big) {
  const wv = state.wv, on = (wv.offers || {})[p.id] !== undefined, ps = !!wv.want[p.id], d = on && wv.offers[p.id] ? P(wv.offers[p.id]) : null;
  return `<button class="${on ? 'primary' : big ? '' : 'sm'}" data-action="wvOffer" data-pid="${p.id}" title="Settled with every club's offers when you process claims">${on ? '✓ Offer in' + (d ? ' (drop ' + esc(d.last) + ')' : '') : `Offer (${fmtMoney(p.ask)}, 1 yr)`}</button>`
    + (p.age <= PS_AGE && p.pos !== 'K' && p.pos !== 'P' ? ` <button class="${ps ? 'on' : big ? '' : 'sm'}" data-action="wvWant" data-pid="${p.id}" title="Sign him to your practice squad when claims are processed, if nobody signs him to a 53 first">${ps ? '✓ PS target' : 'PS target'}</button>` : '');
}
// ---------- waivers during the season ----------
function waiverAlertHTML() {
  if (state.phase !== 'REG' && state.phase !== 'PLAYOFFS') return '';
  const u = state.userTid, wire = onWaivers(), theirs = wire.filter(p => p.waiver.from !== u), mine = wire.filter(p => p.waiver.from === u), n = Object.keys((state.iw || {}).claims || {}).length, last = state.iw && state.iw.last;
  let h = '';
  if (theirs.length || mine.length) h += `<div class="callout"><b>Waiver wire:</b> ${theirs.length} player${theirs.length === 1 ? '' : 's'} waived by other clubs${mine.length ? `, ${mine.length} of yours` : ''}. Claims settle before your next game${n ? ` · you have ${n} claim${n === 1 ? '' : 's'} in` : ''}. <button class="sm" data-action="nav" data-view="waivers">Waiver Wire</button></div>`;
  if (last) h += `<div class="callout">${waiverLastTxt(last)}</div>`;
  return h;
}
function waiverLastTxt(r) {
  const n = p => `${esc(p.lbl)} ${esc(pname(p))}`, out = [];
  r.won.forEach(p => out.push(`you were awarded ${n(p)}`)); r.lost.forEach(x => out.push(`${n(x.p)} went to ${x.to !== null ? T(x.to).abbr : 'nobody (your claim could not be completed)'}`));
  r.taken.forEach(x => out.push(`${T(x.to).abbr} claimed your ${n(x.p)}`)); r.cleared.forEach(p => out.push(`${n(p)} cleared${r.ps.includes(p) ? ' and is on your practice squad' : ' and is a free agent'}`));
  return `<b>Waivers settled before ${r.round ? 'the playoff round' : 'week ' + r.wk}:</b> ${out.join('; ')}.`;
}
function waiverDropModal(pid, kind) {
  const p = P(pid), u = state.userTid, used = new Set((kind === 'iw' ? Object.entries((state.iw || {}).claims || {}).filter(([id]) => +id !== pid).map(x => x[1]) : wvPending(pid).map(x => x[1])).filter(Boolean)), offer = kind === 'offer' || kind === 'mdrop';
  const cands = rosterOf(u).filter(x => !onIR(x) && !used.has(x.id)).sort((a, b) => cutValue(a) - cutValue(b)).slice(0, 14);
  openModal(`<h2 style="margin-top:0">${offer ? 'Offer' : 'Claim'} ${esc(pname(p))}</h2><p class="small muted">Your 53 is full. Choose who you release if ${offer ? 'he signs with you' : 'the claim is awarded'} (nothing happens if ${offer ? 'he goes elsewhere' : 'you lose the claim'}).</p>` +
    cands.map(x => `<div class="row small" style="margin:5px 0"><span style="min-width:60px">${esc(x.lbl)}</span> ${playerLink(x)} ${tierPill(x)} <span class="muted">saves ${fmtMoney(cutSavings(x))}</span><span class="spacer"></span><button class="sm danger" data-action="${kind === 'iw' ? 'iwClaimDrop' : kind === 'mdrop' ? 'wvMDropSet' : offer ? 'wvOfferDrop' : 'wvClaimDrop'}" data-pid="${p.id}" data-drop="${x.id}">Release if ${offer ? 'he signs' : 'claimed'}</button></div>`).join(''));
}
function waiverResultModal(r) {
  const row = (p, txt) => `<div class="row small" style="margin:4px 0">${playerLink(p)} <span class="muted">${esc(p.lbl)}${txt ? ' · ' + esc(txt) : ''}</span></div>`;
  let h = '<h2 style="margin-top:0">Waivers processed</h2>';
  if (r.won.length) h += '<div class="section-title">Claims awarded to you</div>' + r.won.map(p => row(p)).join('');
  if (r.lost.length) h += '<div class="section-title">Claims you lost</div>' + r.lost.map(x => row(x.p, x.to !== null ? 'awarded to ' + T(x.to).abbr + ' (higher priority)' : 'your claim could not be completed')).join('');
  if (r.taken.length) h += '<div class="section-title bad">Your cuts claimed by other teams</div>' + r.taken.map(x => row(x.p, 'claimed by ' + T(x.to).abbr + (x.ps ? ' before he could reach your practice squad' : ''))).join('');
  if ((r.offWon || []).length) h += '<div class="section-title">Took your offer</div>' + r.offWon.map(p => row(p, `1 yr, ${fmtMoney(p.contract.amt)}`)).join('');
  if ((r.offLost || []).length) h += '<div class="section-title">Offers that did not land</div>' + r.offLost.map(x => row(x.p, x.why)).join('');
  if (r.ps.length) h += '<div class="section-title">Signed to your practice squad</div>' + r.ps.map(p => row(p)).join('');
  if (r.psLost.length) h += '<div class="section-title">Practice squad targets who went elsewhere</div>' + r.psLost.map(x => row(x.p, x.why)).join('');
  if (!r.won.length && !r.lost.length && !r.taken.length && !r.ps.length && !r.psLost.length && !(r.offWon || []).length && !(r.offLost || []).length) h += '<p class="muted">No claims or offers involved you.</p>';
  const u = state.userTid, short = rosterShortfalls(u);
  h += `<p class="small muted" style="margin-top:14px">Active roster ${rosterOf(u).filter(p => !onIR(p)).length}/${ROSTER_MAX} · practice squad ${psOf(u).length}/${PS_MAX}. ${psOf(u).length < PS_MAX ? 'Open practice squad spots are yours to fill from the Free Agents tab. ' : ''}${!psOf(u).some(p => p.pos === 'QB') ? '<b>You have no quarterback on your practice squad.</b> ' : ''}${short.length ? 'Short at: ' + short.join(', ') + '.' : ''}</p>`;
  openModal(h);
}
// ---------- preseason playing-time plan ----------
function preTimeOn() { return !!(state && state.phase === 'PRESEASON' && state.prePlan && !state.settings.autoUser); }
// on the depth chart in preseason: what the coach plans, who is short of snaps, and a way back to his plan
function prePlanHTML() {
  const pl = state.prePlan || { feat: {}, hold: {} }, u = state.userTid, js = pl.jobShare || {}, nSet = Object.keys(js).length + Object.keys(pl.share || {}).length;
  const names = o => Object.keys(o).map(id => P(+id)).filter(p => p && p.tid === u).map(p => playerLink(p, true)).join(', ') || '<span class="muted">none</span>';
  const wk = state.pre ? state.pre.wk : 0, auto = prePlanFor(u).auto, word = v => (PRE_SHARE_OPTS.find(o => o[0] === v) || [0, Math.round(v * 100) + '%'])[1].toLowerCase();
  const starters = preStarters(u), short = rosterOf(u).filter(p => starters.has(p.id) && p.pos !== 'K' && p.pos !== 'P' && (p.preS ? p.preS.snp : 0) < SHARP_SNAPS);
  return `<div class="card pre-time"><div class="row"><div><div class="ds-lb">Preseason playing time · game ${Math.min(wk + 1, PRESEASON_GAMES)} of ${PRESEASON_GAMES}</div>
      <div class="small">Each job plays its list in order: the first man (the first two at a two-man job) starts, and when his time is up the next man comes in, changing between drives. Set each man's time with the menu by his name. Left alone, the first unit plays ${word(auto)} this game, the second to halftime, the third the rest; the last man on a list stays on if it runs out.</div></div><span class="spacer"></span>
      ${nSet || Object.keys(pl.dur || {}).length ? `<button class="sm" data-action="preShareReset" title="Every man back to the coach's plan">Coach's plan everywhere</button>` : ''}</div>
    ${short.length ? `<div class="small ${wk >= PRESEASON_GAMES - 1 ? 'warn' : 'muted'}" style="margin-top:6px"><b>${short.length} starter${short.length === 1 ? '' : 's'}</b> ${short.length === 1 ? 'has' : 'have'} fewer than ${SHARP_SNAPS} preseason snaps and would open the season a step slow: ${short.slice(0, 8).map(p => playerLink(p, true) + ' <span class="muted">(' + (p.preS ? p.preS.snp : 0) + ')</span>').join(', ')}${short.length > 8 ? ' and more' : ''}.</div>` : '<div class="small good" style="margin-top:6px">Every starter has enough preseason work to open the season sharp.</div>'}
    <div class="small" style="margin-top:4px"><b>Featured</b> (stay in for extra snaps): ${names(pl.feat)} · <b>Held out</b>: ${names(pl.hold)} <span class="muted">· set these on a player's card</span></div></div>`;
}
// the share control on a job card
function preJobSel(k) {
  if (!preTimeOn() || ST_UNIT[k] || k === 'K' || k === 'P' || k === 'KR' || k === 'PRET') return '';
  const js = state.prePlan.jobShare || {}, cur = js[k] === undefined ? -1 : js[k];
  return `<div class="dcj-pre ${cur >= 0 ? 'set' : ''}" title="How long this job's first unit plays in the next exhibition"><span>1st unit plays</span><select data-change="preJob" data-key="${k}">${PRE_SHARE_OPTS.map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
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
const FA_DEF = { view: 'scout', q: '', ageMax: '', tier: '', up: '', maxAsk: '', exp: '', afford: false, played: false };
// ---- the free agent page: a narrow list, the selected player's card, and the sit-down with his agent ----
function faMarketOn() { return state.phase === 'FA' && state.fa && !state.fa.over; }
function faStatus(p) {
  const u = state.userTid;
  if (!faInMarket(p)) return ['Signs now', 'muted'];
  const ag = faAgreedWith(p); if (ag) return ag.tid === u ? ['Agreed with you', 'good'] : [`Agreed with ${T(ag.tid).abbr}${p.lastTid === u ? ': you can still beat it' : ''}`, p.lastTid === u ? 'warn' : 'bad'];
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
  { const ag = faAgreedWith(p); if (ag && ag.tid !== u) { // agreed elsewhere in the negotiating window: only his old club can still talk to him
    if (p.lastTid !== u) return h + `<div class="callout" style="margin-top:10px">He has agreed to terms with <b>${esc(T(ag.tid).abbr)}</b>: ${ag.yrs} yr, ${fmtMoney(ag.aav * ag.yrs)}. It becomes official when the league year opens.</div>`;
    h += `<div class="callout" style="margin-top:10px">He has agreed to terms with <b>${esc(T(ag.tid).abbr)}</b>: ${ag.yrs} yr, ${fmtMoney(ag.aav * ag.yrs)}. You are his old club: beat it before the league year opens and he stays.</div>`; } }
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
const faLast = p => p.career[p.career.length - 1] || {}, faM = (k, dec) => [p => p.m[k], p => p.m[k] === undefined ? '<span class="muted">—</span>' : dec ? p.m[k].toFixed(dec) : p.m[k]];
const FA_COLS = {
  tier: ['Tier', '74px', p => tierSort(p), p => tierPill(p), 1, 'What he is today, as your scouts see him'],
  up: ['Upside', '104px', p => upSort(p), p => upsidePill(p), 1, 'What he could become'],
  ask: ['Expected', '80px', p => faSortVal(p), p => `<span class="fa-exp">${faExpTxt(p)}</span>`, 1, 'What he is expected to cost a year'],
  status: ['Status', '104px', p => faStatus(p)[0], p => { const x = faStatus(p); return `<span class="fa-st ${x[1]}">${x[0]}</span>`; }, -1, 'Where his market stands'],
  report: ['Report', 'minmax(0, 1.5fr)', null, p => `<span class="fa-txt small muted">${traitsTxt(p)}</span>`],
  gs: ['GS', '30px', p => faLast(p).gs || 0, p => faLast(p).gp ? faLast(p).gs || 0 : '—', 1, 'Starts last season'],
  snp: ['Snaps', '46px', p => faLast(p).snp || 0, p => faLast(p).snp || '—', 1, 'Snaps last season'],
  grade: ['Grade', '44px', p => (faLast(p).adv && faLast(p).adv.g) || 0, p => gradeChip(faLast(p).adv ? faLast(p).adv.g : null), 1, 'Season grade last year'],
  line: ['Last season', 'minmax(0, 1.5fr)', null, p => `<span class="fa-txt small">${faLast(p).gp ? statSummary(faLast(p), p.pos) : '<span class="muted">Did not play</span>'}</span>`],
  ht: ['Ht', '42px', p => p.m.ht, p => fmtHeight(p.m.ht), 1], wt: ['Wt', '38px', p => p.m.wt, p => p.m.wt, 1],
  forty: ['40', '40px', ...faM('forty', 2), -1], ten: ['10', '40px', ...faM('ten', 2), -1], vert: ['Vert', '40px', ...faM('vert'), 1], broad: ['Broad', '44px', ...faM('broad'), 1],
  cone: ['Cone', '40px', ...faM('cone', 2), -1], shut: ['Shut', '40px', ...faM('shut', 2), -1], bench: ['Bench', '44px', ...faM('bench'), 1],
  ras: ['Athlete', '56px', p => rasOf(p), p => rasOf(p) === null ? '<span class="muted">—</span>' : rasOf(p).toFixed(2), 1, 'Athletic score out of 10 against his position'],
  mine: ['Your staff', '82px', p => viewOvr(p, state.userTid), p => tierPill(p, viewOvr(p, state.userTid)), 1, 'What your own coaches make of him'],
  rank: ['Would be', '70px', p => -faRankFor(p)[0], p => { const r = faRankFor(p); return `<span class="${r[0] <= STARTERS[p.pos] ? 'good' : ''}">#${r[0]}</span> <span class="muted small">of ${r[1]}</span>`; }, 1, 'Where he would stand at his position on your roster'],
  fit: ['Scheme', '86px', p => schemeFit(p, state.userTid), p => { const f = schemeFit(p, state.userTid), sd = SPOTS[p.spot].side; return sd === 'off' || sd === 'def' ? `<span class="small ${f >= 1 ? 'good' : f <= -1 ? 'bad' : 'muted'}">${fitLabel(f)}</span>` : '<span class="muted">—</span>'; }, 1, 'How he fits what you run'],
  st: ['Kicking game', 'minmax(0, 1fr)', p => (stWord(p) ? stCover(p) : 0), p => { const w = stWord(p); return w ? `<span class="fa-txt small ${w[1]}">${w[0]}</span>` : '<span class="muted">—</span>'; }, 1, 'His value on special teams'],
  lastTm: ['Last club', '62px', p => (p.lastTid != null && p.lastTid >= 0 ? T(p.lastTid).abbr : 'zz'), p => p.lastTid != null && p.lastTid >= 0 ? T(p.lastTid).abbr : '<span class="muted">—</span>', -1],
  lastPay: ['Was paid', '70px', p => p.lastAmt || 0, p => p.lastAmt ? fmtMoney(p.lastAmt) : '<span class="muted">—</span>', 1, 'His salary last season'],
  yrs: ['Wants', '50px', p => faYears(p), p => faYears(p) + ' yr', 1, 'The length of deal he is after'],
  xp: ['Exp', '34px', p => p.exp, p => p.exp || 'R', 1, 'Seasons in the league'],
  cgs: ['Starts', '46px', p => p.career.reduce((n, r) => n + (r.gs || 0), 0), p => p.career.reduce((n, r) => n + (r.gs || 0), 0), 1, 'Career starts'],
  best: ['Best', '44px', p => Math.max(0, ...p.career.map(r => (r.adv && r.adv.g) || 0)), p => gradeChip(Math.max(0, ...p.career.map(r => (r.adv && r.adv.g) || 0)) || null), 1, 'His best season grade'],
};
['gs', 'snp', 'ht', 'wt', 'forty', 'ten', 'vert', 'broad', 'cone', 'shut', 'bench', 'ras', 'lastPay', 'yrs', 'xp', 'cgs', 'ask'].forEach(k => FA_COLS[k].num = 1);
const FA_LVIEWS = [['market', 'The market', ['tier', 'ask', 'status']], ['scout', 'Scouting report', ['tier', 'up', 'report']], ['fit', 'Fit for your club', ['mine', 'rank', 'fit', 'st']], ['stats', 'Last season', ['gs', 'snp', 'grade', 'line']],
  ['career', 'Career', ['xp', 'cgs', 'best', 'lastTm']], ['money', 'Contract', ['ask', 'yrs', 'lastPay', 'lastTm']], ['phys', 'Size and speed', ['ht', 'wt', 'forty', 'ras']], ['test', 'Workout numbers', ['forty', 'ten', 'vert', 'broad', 'cone', 'shut', 'bench']]];
const FA_BASE = { pos: [null, null, p => FAM_INDEX[p.spot] * 1000 - uOvr(p), null, -1], name: [null, null, p => p.last + ' ' + p.first, null, -1], age: [null, null, p => p.age, null, -1] };
function faYears(p) { try { return faInMarket(p) ? prefYears(p) : state.phase === 'REG' ? 1 : contractYears(p); } catch (e) { return 1; } }
let faRankMemo = null;
function faRankFor(p) { const u = state.userTid; if (!faRankMemo || faRankMemo.at !== ui._tick) { faRankMemo = { at: ui._tick, by: {} }; for (const q of rosterOf(u)) if (!q.expiring) (faRankMemo.by[q.pos] = faRankMemo.by[q.pos] || []).push(viewOvr(q, u)); }
  const l = faRankMemo.by[p.pos] || [], v = viewOvr(p, u); return [l.filter(x => x > v).length + 1, l.length + 1]; }
const FA_FILTERS = ['tier', 'up', 'ageMax', 'exp', 'maxAsk', 'afford', 'mine', 'played', 'start', 'fits', 'ps'];
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
  html += cutInjuredHTML(u);
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
  const verdict = p => p.injury && !p.injury.preview && irCallOf(p, true) ? [{ pup: 'PUP', ir: 'IR (year)', dtr: 'IR → return' }[irCallOf(p, true)], 'muted'] : prev.cuts.has(p.id) ? [p.exp <= 2 && p.age <= 25 ? 'Cut → PS' : 'Cut', 'bad'] : prev.bubble.has(p.id) ? ['Bubble', 'warn'] : ['Keep', 'good'];
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
    { k: 'd', l: 'Your call', f: p => p.injury && !p.injury.preview ? cutIRSeg(p) : `<span class="seg">${[['keep', 'Keep'], ['cut', 'Cut'], ['ps', 'Practice squad']].map(([k, l]) => `<button class="sm ${(plan[p.id] || 'keep') === k ? (k === 'keep' ? 'primary' : k === 'cut' ? 'danger' : 'on') : ''}" data-action="cutSet" data-pid="${p.id}" data-v="${k}">${l}</button>`).join('')}</span>` },
  ], list, { sort: 'pos', dir: 1, rowClass: p => gone(plan[p.id]) ? 'cutrow' : '' }) + '</div>';
  return html;
}

// the injured on cut day: each one is your call, with the staff's beside it
function cutIRSeg(p) {
  const ir = (state.cut.ir || {})[p.id], plan = state.cut.plan[p.id], cur = plan === 'cut' || plan === 'ps' ? 'cut' : ir || 'keep';
  const opts = [['keep', '53'], ['dtr', 'IR → return'], ...(pupEligible(p) ? [['pup', 'PUP']] : []), ['ir', 'IR (year)'], ['cut', 'Cut']];
  return `<span class="seg">${opts.map(([k, l]) => `<button class="sm ${cur === k ? (k === 'cut' ? 'danger' : k === 'keep' ? 'primary' : 'on') : ''}" data-action="cutIR" data-pid="${p.id}" data-v="${k}" title="${esc({ keep: 'Stays on the 53 and counts against it', dtr: 'Makes the 53 today, then goes to IR with a designation to return: misses at least four games (two allowed at cutdown)', pup: 'Hurt before camp: reserve/PUP, does not count, misses at least the first four games', ir: 'Injured reserve before the cut: does not count, and he is done for the year', cut: 'Released (waived/injured)' }[k])}">${l}</button>`).join('')}</span>`;
}
function cutInjuredHTML(u) {
  const hurt = rosterOf(u).filter(p => p.injury && !p.injury.preview).sort((a, b) => b.injury.weeks - a.injury.weeks);
  if (!hurt.length) return '';
  const ir = state.cut.ir || {}, dtr = Object.values(ir).filter(v => v === 'dtr').length, staff = staffIRCalls(u);
  return `<div class="card" style="margin-bottom:14px"><h3 style="margin-top:0">Injured (${hurt.length})</h3>
    <p class="small muted" style="margin:0 0 8px">A player put on injured reserve before the cut is done for the year. One hurt before camp can go on <b>reserve/PUP</b>: he does not count and misses at least the first four games. Anyone else you want back this season has to make the 53; <b>IR → return</b> puts him on IR right after the cut with a designation to return, which opens his spot (${CUT_DTR} at cutdown, ${dtr}/${CUT_DTR} used; each return counts against your ${IR_RETURNS} for the season). Until you choose, an injured player stays on the 53.</p>`
    + table('cutinj', [
      { k: 'pos', l: 'Pos', f: p => esc(p.lbl) }, { k: 'n', l: 'Name', f: p => playerLink(p) }, { k: 'tier', l: 'Tier', f: p => tierPill(p) },
      { k: 'inj', l: 'Injury', f: p => `${esc(p.injury.name || 'Injury')} <span class="small muted">${p.injury.weeks} wk · ${campHurt(p) ? 'hurt in camp' : 'before camp'}</span>` },
      { k: 's', l: 'Staff', f: p => staff[p.id] ? `<span class="pill">${IR_CALL_TXT[staff[p.id]]}</span>` : '<span class="pill">Keep on the 53</span>' },
      { k: 'd', l: 'Your call', f: p => cutIRSeg(p) },
    ], hurt, { nosort: 1 }) + `<div class="row" style="margin-top:8px"><button class="sm" data-action="cutIRStaff">Take the staff's calls on the injured</button></div></div>`;
}

// ---------- player search: find future targets anywhere in the league ----------
const SEARCH_DEF = { q: '', fam: 'ALL', where: 'all', team: '', ageMin: '', ageMax: '', tier: '', up: '', maxCap: '', expiring: false, comfort: '' };
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
        { k: 'k', l: 'Background', f: r => r.c ? `<span class="small muted">${esc([bgLabel(r.c), r.c.style].filter(Boolean).join(' · '))}</span>` : '' },
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
function asstModal(c, replace) {
  const spec = SPEC_ROLES.includes(c.role), t = c.tid >= 0 ? T(c.tid) : null;
  let h = `<div class="row"><h2 style="margin:0">${esc(cname(c))}</h2><span class="pill">${ASST_LABEL[c.role]}</span></div>
    <div class="muted" style="margin:4px 0 12px">${t ? teamLink(c.tid, true) : 'Available'} · Age ${c.age} · ${asstTrack(c)}</div>
    <div class="row" style="gap:6px;margin-bottom:12px">${kwPills(c)}</div>` + staffFileHTML(c);
  h += `<div class="cc-grid"><div><div class="section-title" style="margin-top:0">Ratings</div>${ratingBarsHTML(c)}<p class="small muted" style="margin-top:8px">${coachRoleBlurb(c)}</p></div><div>`;
  if (spec) {
    const L = LEANS[c.role][c.lean];
    ensureDefPk(c); ensureOffPk(c);
    h += `<div class="section-title" style="margin-top:0">What he brings</div><div class="small">Leans <b>${esc(L[0])}</b>${c.pks && c.pks.length ? `<div style="margin-top:6px">${c.pks.map(id => `<span class="pill on">${PK_NAME[id]}</span>`).join(' ')}</div>` : ''}</div>
      <p class="small muted" style="margin-top:8px">${t ? tendInfluences(t, ASST_SIDE[c.role]).filter(x => x.includes(cname(c))).map(esc).join(' ') : 'More creativity means more for an opponent to prepare for, and more for your own players to learn.'}</p>`;
  } else h += `<div class="section-title" style="margin-top:0">Background</div><div class="small">${rootsOf(c) ? `Learned his playbook under ${esc(cname(rootsOf(c)))} (${esc(bgLabel(c))})` : 'No playbook of his own yet'} · ${esc(c.style)}</div><p class="small muted" style="margin-top:8px">${rootsOf(c) ? 'If he is ever promoted, he starts from that playbook and makes it his own.' : 'If he is ever promoted, he draws up his own.'}</p>`;
  h += `</div></div>`;
  h += `<p class="small muted">${c.tid === state.userTid ? ((c.yrs || 0) >= 3 ? 'Your staff knows him well: these reads are reliable.' : 'He is still new to your staff: these reads will firm up over a couple of seasons.') : 'You have not worked with him: treat these reads as rough.'}</p>`;
  const mentors = c.mentors.map(id => C(id)).filter(Boolean);
  if (mentors.length) h += `<div class="section-title">Coaching Tree</div><div class="small">Worked under: ${mentors.map(m => coachNameLink(m)).join(', ')}</div>`;
  if (c.hist.length) h += `<div class="section-title">Career</div>` + table('ahist', [
    { k: 's', l: 'Season', f: x => x.s }, { k: 't', l: 'Team', f: x => T(x.tid).abbr }, { k: 'r', l: 'Role', f: x => ROLE_SHORT[x.role] || x.role }, { k: 'w', l: 'Record', f: x => `${x.w}-${x.l}` },
  ], c.hist.slice().reverse(), { nosort: 1 });
  openModal(h, replace);
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
  let html = `<div class="card csearch" style="margin-top:16px"><div class="row"><h3 style="margin:0">Coaching search · day ${car.day + 1} of ${CAROUSEL_DAYS}</h3><span class="spacer"></span>
    <span class="small">Staff budget <b>${fmtMoney(pay)}</b> of ${fmtMoney(t.staffBud)}${t.staffDead ? ` <span class="muted">(incl. ${fmtMoney(t.staffDead)} owed to coaches you let go)</span>` : ''} · <b class="${staffRoom(u) < 0 ? 'bad' : 'good'}">${fmtMoney(staffRoom(u))} left</b></span></div>
    <p class="small muted mclamp" style="margin:8px 0">Every coach here is his own man with his own ties. Until you <b>interview</b> a man you only know his reputation, at every level of the staff; then <b>negotiate</b>: play-calling, which of his people he may bring (each slot you promise is a job you no longer fill), a player re-signed, money and guaranteed years. Other clubs hire <b>${DAY_NAME[Math.min(car.day, 3)].toLowerCase()}</b> when you advance, so the best are gone first.
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
function staffSeason(c) { const n = (c.yrs || 0) + 1; return `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'} season`; }
function staffBoss(t, role) { return role === 'HC' ? null : ROLE_TIER[role] === 2 ? 'HC' : ROLE_TIER[role] === 3 ? (ASST_SIDE[role] === 'O' ? 'OC' : 'DC') : SPEC_OVER[role]; }
// ---- the staff pyramid: a medallion for every job, the head coach at the apex, each man joined to the man he answers to ----
// rows: y (px from the top) and the medallion's size; x is a share of the width, so the pyramid widens and narrows with the window
const PYR_ROWS = [{ y: 0, d: 84 }, { y: 196, d: 62 }, { y: 358, d: 50 }, { y: 490, d: 44 }], PYR_H = 600, PYR_H2 = 340;
const PYR_POS = { HC: [50, 0], OC: [27.5, 1], STC: [44, 1], SC: [58, 1], DC: [79.17, 1], PGC: [15, 2], RGC: [40, 2], DRC: [66.67, 2], DPC: [91.67, 2],
  QB: [5, 3], WR: [15, 3], TE: [25, 3], RB: [35, 3], OL: [45, 3], DL: [58.33, 3], LB: [75, 3], DB: [91.67, 3] };
const PYR_LABEL = { HC: 'Head coach', OC: 'Offensive coordinator', DC: 'Defensive coordinator', STC: 'Special teams', SC: 'Strength', PGC: 'Pass game', RGC: 'Run game', DPC: 'Pass defense', DRC: 'Run defense' };
const TIER_METAL = { Elite: 'gold', Strong: 'silver', Average: 'bronze', Weak: 'iron' };
const WORD_METAL = { Excellent: 'gold', Good: 'silver', Average: 'bronze', 'Below average': 'iron', Poor: 'iron' };
const shortName = c => `${esc((c.first || '')[0] || '')}. ${esc(c.last)}`;
const wordSpan = w => `<span class="${asstWordCls(w)}" title="${esc(w)}">${esc(w === 'Below average' ? 'Below avg' : w === 'Not interviewed' ? 'Unknown' : w)}</span>`;
// one medallion and the plate under it; a click opens his card
function medalHTML(t, role, canHire) {
  const [x, ri] = PYR_POS[role], row = PYR_ROWS[ri], c = staffCoach(t, role), r = 'r' + (ri + 1), nar = role === 'STC' || role === 'SC' ? ' nar' : '';
  const pos = `left:${x}%;top:${row.y}px`, label = PYR_LABEL[role] || ASST_LABEL[role].replace(' Coach', '');
  if (!c) return `<div class="pm vac ${r}${nar}" style="${pos}"><span class="pm-disc"><b>${roleCode(role)}</b></span><span class="pm-plate"><i>${esc(label)}</i><b class="bad">Vacant</b>${canHire ? `<button class="sm primary" data-action="searchRole" data-role="${role}">Find someone</button>` : ''}</span></div>`;
  const top = COACH_ROLES.includes(role), spec = SPEC_ROLES.includes(role);
  const calls = offCaller(t) === c ? 'Calls the offense' : defCaller(t) === c ? 'Calls the defense' : '';
  let metal, body;
  if (top) {
    const tr = coachTier(c.ovr), tier = `<span class="cl-tier t-${tr}">${tr}</span>`; metal = TIER_METAL[tr];
    if (role === 'HC') body = `<b>${esc(cname(c))}</b><i>Head coach · ${staffSeason(c)}</i><em>${tier}${c.rec && c.rec.w + c.rec.l ? ` · Career ${c.rec.w}-${c.rec.l}${c.rec.t ? '-' + c.rec.t : ''}${c.rec.titles ? `, ${c.rec.titles} title${c.rec.titles > 1 ? 's' : ''}` : ''}` : ''}</em><em class="pm-sub">${schemeLabel(c) ? esc(schemeLabel(c)) : coachStrengths(c)}</em>`;
    else body = role === 'OC' || role === 'DC' ? `<b>${esc(cname(c))}</b><i>${label}</i><em>${tier} · ${schemeLabel(c) ? esc(schemeLabel(c)) : staffSeason(c)}</em>` : `<b>${esc(cname(c))}</b><i>${label}</i><em>${tier}</em><em class="pm-sub">${staffSeason(c)}</em>`;
  } else if (spec) {
    ensureDefPk(c); ensureOffPk(c); const w = asstWord(c, 'cre'); metal = WORD_METAL[w] || 'steel';
    body = `<b>${esc(cname(c))}</b><i>${label}</i><em title="Creativity: ${esc(w)}">${wordSpan(w)}${leanLabel(c) ? ' · ' + esc(leanLabel(c)) : ''}</em>`;
  } else {
    const dv = asstWord(c, 'dev'), co = asstWord(c, 'coh'); metal = WORD_METAL[dv] || 'steel';
    body = `<b title="${esc(cname(c))}">${shortName(c)}</b><em title="Technique: how fast his room improves"><u>Tech</u>${wordSpan(dv)}</em><em title="Cohesion: how far his room can get on the same page"><u>Coh</u>${wordSpan(co)}</em>`;
  }
  return `<button class="pm ${r}${nar} m-${metal}" style="${pos}" data-action="coach" data-cid="${c.id}" title="${esc(cname(c))}, ${esc(roleName(role).toLowerCase())}: open his card"><span class="pm-disc"><b>${roleCode(role)}</b></span><span class="pm-plate">${body}${calls ? `<span class="pm-calls">${calls}</span>` : ''}</span></button>`;
}
function staffPyramidHTML(t, canHire) {
  const has = !!t.asst, roles = has ? STAFF_ORDER : COACH_ROLES, H = has ? PYR_H : PYR_H2;
  const X = r => PYR_POS[r][0], ROW = r => PYR_ROWS[PYR_POS[r][1]];
  const paths = roles.filter(r => r !== 'HC').map(r => { const b = staffBoss(t, r); if (!b || !roles.includes(b)) return ''; const br = ROW(b), cr = ROW(r);
    return `<path class="${b === 'HC' ? 'top' : ''}" d="M${X(b)} ${br.y + br.d / 2}V${cr.y - 14}H${X(r)}V${cr.y}"/>`; }).join('');
  const split = has ? `<path class="split" d="M50 ${PYR_ROWS[2].y - 28}V${H}"/>` : '';
  const medal = r => medalHTML(t, r, canHire);
  const key = `<div class="pyr-key" title="The rim is his rating: head coach and coordinators by their tier; the game coordinators by their creativity, the position coaches by their technique">${[['gold', 'Elite'], ['silver', 'Strong'], ['bronze', 'Average'], ['iron', 'Weak']].map(([m, l]) => `<span><i class="m-${m}"></i>${l}</span>`).join('')}</div>`;
  return `<section class="pyr-wrap"><div class="pyr-head">${key}<span class="spacer"></span><span class="pyr-hint">Click a coach for his card · ← → walks the staff</span>${state.carWrap ? `<button class="link cl-more" data-action="nav" data-view="carwrap">League coaching moves ›</button>` : ''}</div>
    <div class="pyr" style="height:${H}px"><svg class="pyr-lines" viewBox="0 0 100 ${H}" preserveAspectRatio="none" aria-hidden="true"><g class="hi">${paths}</g><g class="ln">${split}${paths}</g></svg>
      ${has ? '<span class="pyr-wm o">Offense</span><span class="pyr-wm d">Defense</span>' : ''}
      <div class="pyr-row" data-l="Head coach">${medal('HC')}</div>
      <div class="pyr-row" data-l="Coordinators">${['OC', 'STC', 'SC', 'DC'].map(medal).join('')}</div>
      ${has ? `<div class="pyr-row" data-l="Game coordinators">${['PGC', 'RGC', 'DRC', 'DPC'].map(medal).join('')}</div>
      <div class="pyr-row" data-l="Position coaches">${['QB', 'WR', 'TE', 'RB', 'OL', 'DL', 'LB', 'DB'].map(medal).join('')}</div>` : ''}</div></section>`;
}
function tendWord(v) { return v >= 0.6 ? 'Heavy' : v >= 0.42 ? 'Often' : v >= 0.25 ? 'Some' : v >= 0.1 ? 'Light' : 'Rare'; }
function railBar(label, v, hint) { v = clamp(v || 0, 0, 1); return `<div class="rb" title="${esc(hint || '')}"><span class="rb-l">${label}</span><span class="rb-t"><i style="width:${Math.round(v * 100)}%"></i></span><span class="rb-v">${tendWord(v)}</span></div>`; }
// a coach on a club's staff, in his card: his place in the building, his deal, what he was promised, his room this week,
// his word before camp (yours), and, in the coaching search, the moves you can make with him
function staffFileHTML(c) {
  if (!c || !(c.tid >= 0) || !T(c.tid)) return '';
  const t = T(c.tid), role = STAFF_ORDER.find(r => staffCoach(t, r) === c); if (!role) return '';
  const mine = t.id === state.userTid, canHire = state.phase === 'COACHES' && mine, top = COACH_ROLES.includes(role), spec = SPEC_ROLES.includes(role);
  const bossRole = staffBoss(t, role), boss = bossRole ? staffCoach(t, bossRole) : null;
  const ladder = top ? (role === 'HC' ? ['HC'] : role === 'OC' || role === 'DC' ? [role, 'HC'] : [role]) : spec ? [role, ASST_SIDE[role] === 'O' ? 'OC' : 'DC'] : [role, SPEC_OVER[role], ASST_SIDE[role] === 'O' ? 'OC' : 'DC'];
  const kv = [['On the staff', `<span class="oc-code static">${roleCode(role)}</span> ${esc(roleName(role))} · ${staffSeason(c)} here${bossRole ? ` · answers to ${boss ? coachNameLink(boss) : 'a vacant job'} <span class="muted">(${roleCode(bossRole)})</span>` : ''}`]];
  if (top) kv.push(['Standing', esc(repLabel(c))]);
  kv.push(['Contract', c.sal !== undefined ? `<b>${fmtMoney(c.sal)}</b> / ${c.cyrs} yr${c.cyrs === 1 ? '' : 's'} · ${c.cgtd ? `${c.cgtd} guaranteed${mine ? ` · owed ${fmtMoney(owedIfFired(c))} if let go` : ''}` : 'nothing guaranteed'}` : '—']);
  const prom = promiseChips(t, role, c); if (prom) kv.push(['Promised', prom]);
  if (ladder.length > 1) kv.push(['Career path', ladder.map((r, i) => i ? esc(roleName(r)) : `<b>${esc(roleName(r))}</b>`).join(' <span class="muted">→</span> ')]);
  if (mine && POS_ROLES.includes(role)) { const rooms = role === 'DB' ? ['CB', 'S'] : [role], rs = rooms.map(r => pracRoomInfo(t.id, r)).filter(r => r.avg !== null);
    if (rs.length) kv.push(['His room this week', rs.map(r => `<span class="small muted">${rooms.length > 1 ? ROOM_NAME[r.pos] + ' ' : ''}</span>${pracRating(r.avg)}`).join(' ')]); }
  let fx = '';
  if (spec) { const L = LEANS[role][c.lean]; if (L) fx = `<div class="cf-fx"><span class="cf-k">Effect on the call sheet</span>${Object.entries(L[1]).map(([k, v]) => `<span>${LEAN_WORD[k] || k} <b class="${v > 0 ? 'good' : 'bad'}">${v > 0 ? (v >= 1.5 ? 'Much more' : 'More') : (v <= -1.5 ? 'Much less' : 'Less')} ${v > 0 ? '▲' : '▼'}</b></span>`).join('')}</div>`; }
  let act = '';
  if (canHire) {
    const lock = t.locks && t.locks[role] && C(t.locks[role]) && C(t.locks[role]).tid === t.id ? C(t.locks[role]) : null;
    if (lock) act = `<span class="small muted" title="You promised this job to ${esc(cname(lock))} for his man">🔒 ${esc(lock.last)}'s man</span>`;
    else {
      const toHead = ['OC', 'DC', 'STC'].includes(role) && !C(t.hc), up = top ? false : spec ? !C(t[ASST_SIDE[role] === 'O' ? 'oc' : 'dc']) : !asst(t, SPEC_OVER[role]);
      if (toHead) act += `<button class="sm primary" data-action="asstPromote" data-cid="${c.id}" title="Your head coaching job is open: give it to him">Promote to head coach</button>`;
      if (up) act += `<button class="sm primary" data-action="asstPromote" data-cid="${c.id}" title="Move him up into the open job above him">Promote</button>`;
      act += `<button class="sm danger" data-action="fireCoach" data-role="${role}">Let go</button>`;
    }
  }
  const walk = view === 'coaches' && (ui.staffTid == null ? state.userTid : ui.staffTid) === t.id ? '<span class="cf-walk">← → the next man on the staff</span>' : '';
  return `${mine ? briefHTML(t, role) : ''}<div class="cf-here"><div class="cf-kv">${kv.map(([k, v]) => `<span class="cf-k">${k}</span><span>${v}</span>`).join('')}</div>${fx}${act || walk ? `<div class="cf-act">${act}${walk}</div>` : ''}</div>`;
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
// the staff: the club's masthead and figures, the pyramid of medallions, then the systems the staff runs, and the ledgers
function coachesHTML() {
  const tid = ui.staffTid == null ? state.userTid : ui.staffTid, t = T(tid), mine = tid === state.userTid, canHire = state.phase === 'COACHES' && mine;
  const opts = state.teams.map(x => `<option value="${x.id}" ${x.id === tid ? 'selected' : ''}>${esc(x.region + ' ' + x.name)}</option>`).join('');
  const hc = C(t.hc), g = !mine && typeof gmOf === 'function' ? gmOf(tid) : null, rival = !mine && T(state.userTid).conf === t.conf && T(state.userTid).div === t.div;
  const when = `${state.season} · ${state.phase === 'REG' ? 'Week ' + Math.min(state.week, SEASON_WEEKS) : esc(PHASE_LABEL[state.phase] || state.phase)}`;
  const jobs = t.asst ? STAFF_ORDER : COACH_ROLES, filled = jobs.filter(r => staffCoach(t, r)).length;
  const ot = offTend(t), dt = defTend(t), oc = offCaller(t), dc = defCaller(t);
  const yrs = side => { const s = t.sys && t.sys[side]; return !s ? '—' : s.yrs <= 0 ? 'New this year' : `Year ${s.yrs + 1}`; };
  const inst = side => { const ps = rosterOf(t.id).filter(p => PRAC_SIDE[p.pos] === side); return ps.length ? ps.reduce((a, p) => a + pbOf(p), 0) / ps.length / 100 : 1; };
  const fig = (k, v, s, tt) => `<div${tt ? ` title="${esc(tt)}"` : ''}><div class="k">${k}</div><div class="v">${v}${s ? `<small>${s}</small>` : ''}</div></div>`;
  const yr = side => yrs(side).replace('New this year', 'year 1').replace('Year', 'year'), bud = mine && t.staffBud;
  const figs = [fig('Calls offense', oc ? esc(oc.last) : '—', '', oc ? cname(oc) : ''), fig('Calls defense', dc ? esc(dc.last) : '—', '', dc ? cname(dc) : ''),
    fig('Offense installed', instWord(inst('O')), yr('O'), `How much of the playbook the offense knows · ${yrs('O')} in the system`), fig('Defense installed', instWord(inst('D')), yr('D'), `How much of the playbook the defense knows · ${yrs('D')} in the system`)];
  if (bud) figs.push(fig('Staff budget', fmtMoney(t.staffBud)), fig('Committed', fmtMoney(staffPayroll(tid))), fig('Free', `<span class="${staffRoom(tid) < 0 ? 'bad' : ''}">${fmtMoney(staffRoom(tid))}</span>`));
  if (bud && t.staffDead) figs.push(fig('Owed, let go', fmtMoney(t.staffDead), '', 'Owed to coaches let go'));
  const notice = state.phase === 'COACHES' ? (mine ? 'The coaching search is open: let a coach go to open his job (in his card), then interview and negotiate below.' : 'The coaching search is open.')
    : mine && briefOn() ? `${campOn() ? 'Camp reports' : 'Before camp'}: click any coach to hear him out, and ← → walks the staff.${campOn() ? '' : ' When you have heard enough, open training camp.'}` : '';
  // the systems the staff runs, and the money
  const kvt = rows => `<table class="cl-tbl cl-kv"><tbody>${rows.map(([k, v]) => `<tr><th class="l">${k}</th><td class="l cl-name">${v}</td></tr>`).join('')}</tbody></table>`;
  const offense = kvt([['System', esc(teamSchemeLabel(t, 'O') || '—')], ['Play caller', oc ? coachNameLink(oc) : '—'], ['In the system', yrs('O')]])
    + `<div class="stf-bars">${railBar('Pass rate', ot.pass, 'On neutral downs')}${railBar('Play-action', ot.pa)}${railBar('Deep shots', ot.deep)}${railBar('Quick game', ot.quick)}${railBar('Motion', ot.motion)}${railBar('RPO', ot.rpo)}${railBar('Screens', ot.screen)}${railBar('Zone runs', ot.zone, 'Zone against gap and power runs')}</div>`;
  const defense = kvt([['System', esc(teamSchemeLabel(t, 'D') || '—')], ['Play caller', dc ? coachNameLink(dc) : '—'], ['Front', esc(dt.front || '—')], ['In the system', yrs('D')]])
    + `<div class="stf-bars">${railBar('Man coverage', dt.man)}${railBar('Two-high shells', dt.high)}${railBar('Blitz', dt.blitz)}${railBar('Sim pressure', dt.sim)}${railBar('Stunts', dt.stunt)}${railBar('Base personnel', dt.base, 'Against nickel and dime')}</div>`;
  const installed = `<div class="stf-bars"><div class="rb"><span class="rb-l">Offense</span><span class="rb-t"><i style="width:${Math.round(inst('O') * 100)}%"></i></span><span class="rb-v">${instWord(inst('O'))}</span></div>
    <div class="rb"><span class="rb-l">Defense</span><span class="rb-t"><i style="width:${Math.round(inst('D') * 100)}%"></i></span><span class="rb-v">${instWord(inst('D'))}</span></div></div>`;
  let money = '';
  if (bud) { const pay = staffPayroll(tid), room = staffRoom(tid);
    money = `<div class="stf-bars"><div class="rb"><span class="rb-l">Committed</span><span class="rb-t"><i style="width:${clamp(Math.round(100 * pay / t.staffBud), 0, 100)}%${room < 0 ? ';background:var(--bad)' : ''}"></i></span><span class="rb-v">${fmtMoney(pay)}</span></div></div>`
      + kvt([['Budget', fmtMoney(t.staffBud)], ['Free', `<span class="${room < 0 ? 'bad' : 'good'}">${fmtMoney(room)}</span>`], ...(t.staffDead ? [['Owed to coaches let go', fmtMoney(t.staffDead)]] : [])]); }
  const sides = [['O', 'offense'], ['D', 'defense']].map(([side, name]) => { const infl = tendInfluences(t, side); return `<div><div class="stf-k">Who shapes the ${name}</div>${infl.length ? '<ul class="tight">' + infl.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>' : '<div class="small muted">Nobody below the play caller is bending the call sheet.</div>'}</div>`; }).join('');
  const rows = ALL_ROLES.map(role => ({ role, c: staffCoach(t, role) })).filter(r => r.c);
  const pay = table('staffpay', [
    { k: 'r', l: 'Role', v: r => ALL_ROLES.indexOf(r.role), f: r => `<span class="oc-code static">${roleCode(r.role)}</span>` },
    { k: 'n', l: 'Coach', v: r => r.c.last, f: r => coachNameLink(r.c) },
    { k: 'a', l: 'Age', v: r => r.c.age, num: 1 },
    { k: 'b', l: 'Best at / leans', f: r => `<span class="small muted">${COACH_ROLES.includes(r.role) ? coachStrengths(r.c) : esc([bgLabel(r.c), leanLabel(r.c), r.c.style].filter(Boolean).join(' · '))}</span>`, cls: 'rs-flex' },
    { k: 'l', l: 'Track record', f: r => `<span class="small">${COACH_ROLES.includes(r.role) ? (lastUnitLine(r.c) || '—') : asstTrack(r.c)}</span>` },
    { k: 's', l: 'Salary', v: r => r.c.sal || 0, f: r => r.c.sal !== undefined ? fmtMoney(r.c.sal) : '—', num: 1 },
    { k: 'y', l: 'Yrs', v: r => r.c.cyrs || 0, f: r => r.c.cyrs || '—', num: 1 },
    { k: 'g', l: 'Gtd', v: r => r.c.cgtd || 0, f: r => r.c.cgtd || '—', num: 1, title: 'Guaranteed years: what he is owed if you let him go' },
    { k: 'pr', l: 'Promised', f: r => promiseChips(t, r.role, r.c) },
  ], rows, { sort: 'r', dir: 1, cls: 'rs-tbl' });
  const all = state.teams.map(tm => ({ tm, s: COACH_ROLES.map(r => C(tm[r.toLowerCase()])) }));
  const cell = c => c ? `${coachNameLink(c)} ${tierChip(c.ovr)}` : '<span class="bad">Vacant</span>';
  const league = table('allcoach', [
    { k: 't', l: 'Team', v: r => r.tm.abbr, f: r => teamLink(r.tm.id) },
    ...COACH_ROLES.map((role, i) => ({ k: role, l: ROLE_SHORT[role], v: r => r.s[i] ? r.s[i].ovr : 0, f: r => cell(r.s[i]) })),
  ], all, { rowClass: r => r.tm.id === tid ? 'me' : '', cls: 'rs-tbl' });
  const fold = (k, title, body) => `<details class="stf-fold" ${foldAttr(k)}><summary><span>${title}</span></summary><div class="stf-fb">${body}</div></details>`;
  return `<div class="club ros stf" style="${clubVarsCSS(tid)}">
    <header class="cl-mast rs-mast" data-abbr="${esc(t.abbr)}">
      <button class="cl-badge" data-action="team" data-tid="${tid}" title="${mine ? 'Home' : 'The club page'}">${esc(t.abbr)}</button>
      <div class="cl-id"><div class="cl-over">${esc(t.conf + ' ' + t.div)} · Coaching staff · ${when}${mine ? ' · your club' : rival ? ' · division rival' : ''}</div>
        <div class="rs-name"><h1>${esc(t.region)} <b>${esc(t.name)}</b></h1><span class="rs-caret">▾</span><select data-change="staffTeam" title="Show another club's staff" aria-label="Club">${opts}</select></div>
        <div class="cl-men"><span class="cl-ml">Head coach</span> ${hc ? coachNameLink(hc) : '<span>Vacant</span>'}<i>·</i><span class="cl-ml">GM</span> ${mine ? '<b>You</b>' : g ? `<b>${esc(gmName(g))}</b>` : 'Vacant'}</div></div>
      <div class="cl-rec rs-count"><div class="cl-big">${filled}<small>/${jobs.length}</small></div><div class="cl-place">Coaches on staff</div><div class="cl-place">${filled < jobs.length ? `${jobs.length - filled} job${jobs.length - filled === 1 ? '' : 's'} open` : 'Every job filled'}</div></div>
    </header>
    <div class="cl-ledger" style="--n:${figs.length}">${figs.join('')}</div>
    <div class="rs-scroll">${notice ? `<div class="cl-notice"><b>Now</b><span>${notice}</span></div>` : ''}
      ${staffPyramidHTML(t, canHire)}
      ${state.phase === 'COACHES' && mine && state.car ? `<div class="stf-search">${searchHTML2(t)}</div>` : ''}
      <div class="cl-body stf-sys"><div class="cl-col">${clSec('Offense', offense)}</div><div class="cl-col">${clSec('Defense', defense)}</div>
        <div class="cl-col">${clSec('Installed', installed, `<button class="link cl-more" data-action="clubBook" data-tid="${tid}">Playbook ›</button>`)}${money ? clSec('Staff budget', money) : ''}</div></div>
      ${fold('shape', 'How the call sheets are shaped', `<div class="stf-two small">${sides}</div>`)}
      ${fold('staffpay', 'Contracts, track records and promises', pay)}
      ${fold('allstaff', 'League staffs', league)}
      <div class="rs-foot"><span>Changes happen in the coaching search, right after the season.</span></div></div></div>`;
}
function coachModal(cid, replace) {
  const c = C(cid);
  if (!c) return;
  ui.cardCid = c.id;
  if (isAsst(c)) return asstModal(c, replace);
  const t = c.tid >= 0 ? T(c.tid) : null;
  const callsFor = (c.role === 'OC' || c.role === 'DC') && t && C(t.hc) && C(t.hc).t.caller === (c.role === 'OC' ? 'O' : 'D');
  let html = `<div class="row"><h2 style="margin:0">${esc(cname(c))}</h2><span class="pill">${ROLE_LABEL[c.role]}</span> ${tierChip(c.ovr)}</div>
    <div class="muted" style="margin:4px 0 12px">${c.tid >= 0 ? teamLink(c.tid, true) : 'Available'} · Age ${c.age}${schemeLabel(c) ? ' · ' + esc(schemeLabel(c)) : ''}${c.role === 'HC' ? ` · Career ${c.rec.w}-${c.rec.l}${c.rec.titles ? `, ${c.rec.titles} title${c.rec.titles > 1 ? 's' : ''}` : ''}` : ''}</div>`;
  if (callsFor) html += `<div class="callout small">The head coach calls the ${c.role === 'OC' ? 'offense' : 'defense'}: this coordinator contributes design and development.</div>`;
  html += staffFileHTML(c);
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
  openModal(html, replace);
}

// ---------- news / history / settings ----------
function newsHTML() {
  const items = ui.newsMine ? state.news.filter(n => n.tids.includes(state.userTid)) : state.news;
  const lim = isPhone() ? Math.min(250, ui.newsN || 60) : 250; // a phone takes the feed a page at a time
  return `<div class="subtabs"><button class="${!ui.newsMine ? 'on' : ''}" data-action="newsMine" data-v="0">All News</button><button class="${ui.newsMine ? 'on' : ''}" data-action="newsMine" data-v="1">My Team</button></div><div class="card">${newsList(items.slice(0, lim))}${items.length > lim ? `<button class="sm" data-action="newsMore" style="margin-top:8px">Show more</button>` : ''}</div>`;
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
  m.classList.remove('hidden'); m.scrollTop = keepY; phoneKit(body);
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
  const a = src.a, first = Object.keys(gradeFacets(p.spot)), cats = first.concat(Object.keys(FACETS).filter(f => !first.includes(f))).filter(f => gradeN(a, f) >= (src.pre ? 8 : 15)); // a preseason is short: fewer plays make a grade
  if (!cats.length) return `<div class="muted small">${Object.keys(a).some(k => /^g[a-z]/.test(k)) && !Object.keys(a).some(k => /^G[a-z]/.test(k)) ? 'Graded under the old system: the new grades start with his next game.' : 'Not enough plays on tape yet.'}</div>`;
  return cats.map(f => { const v = facetGrade(a, f, 0, p.spot), n = gradeN(a, f), b = GRADE_BAND(v);
    return `<div class="adv-r" title="${n} plays where he had a job in it"><span class="adv-l">${FACETS[f]}</span><span class="adv-v ${v >= 70 ? 'good' : v < 50 ? 'bad' : ''}" style="font-size:15px">${v}</span><span class="adv-tag ${b[1]}">${b[0]}</span><span class="adv-rk">${n}</span></div>`; }).join('');
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
// grades by game: one row for each job he did, one column for each game
const gcBand = v => v >= 80 ? 'e' : v >= 70 ? 'g' : v >= 60 ? '' : v >= 50 ? 'w' : 'b';
function gameLogHTML(p) {
  const src = p.glog && p.glog.length ? { season: state.season, log: p.glog } : p.glogPrev;
  if (!src || !src.log.length) return '';
  const log = src.log.slice(-21), first = Object.keys(gradeFacets(p.spot)), cats = first.concat(Object.keys(FACETS).filter(f => !first.includes(f))).filter(f => log.some(x => x.f && x.f[f] !== undefined));
  const cell = v => v === undefined || v === null ? '<td class="gc-n">·</td>' : `<td class="gc-c ${gcBand(v)}">${Math.round(v)}</td>`;
  const avg = l => { const v = l.filter(x => x !== undefined && x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const row = (label, vals, cls) => `<tr class="${cls || ''}"><th>${label}</th>${vals.map(cell).join('')}${cell(avg(vals)).replace('class="', 'class="gc-avg ')}</tr>`;
  return `<div class="ds-lb">Grade by job, game by game · ${src.season}</div><div class="gc-wrap"><table class="gc"><thead><tr><th></th>${log.map(x => `<th><b>${esc(String(x.w).replace('Wk ', ''))}</b><span>${x.h ? '' : '@'}${T(x.o).abbr}</span></th>`).join('')}<th><b>Avg</b><span>${log.length} gm</span></th></tr></thead>
    <tbody>${row('Overall', log.map(x => x.g), 'gc-all')}${cats.map(f => row(FACETS[f], log.map(x => x.f ? x.f[f] : undefined))).join('')}
    <tr class="gc-sn"><th>Snaps</th>${log.map(x => `<td>${x.s || 0}</td>`).join('')}<td>${Math.round(avg(log.map(x => x.s || 0)) || 0)}</td></tr></tbody></table></div>
    <div class="sc-fine">80 elite · 70 good starter · 60 decent starter · 50 rotation · below that a liability. A dot is a game where he did too little of that job to grade.${cats.length ? '' : ' Grades by job are charted from his next game on.'}</div>`;
}
// combine numbers shaded by percentile against everyone at his position group
function physRowsHTML(p) {
  const peers = Object.values(state.players).filter(q => q.m && q.pos === p.pos);
  ensureJumps(p); peers.forEach(ensureJumps); ensureHand(p);
  const x = p.m.x || {}, pw = p.pw || {};
  return COMBINE.map(([k, l, f, dir], i) => { const v = p.m[k], mine = pw[k];
    if (v === undefined) { const w = DRILL_WHY[x[k]] || ['—', '']; return `<div class="ph-r" ${w[1] ? `data-tip="${esc(w[1])}"` : ''}><span>${l}</span><b class="${mine !== undefined ? '' : 'muted'}">${mine !== undefined ? f(mine) + '†' : w[0]}</b></div>`; }
    const vals = peers.map(q => q.m[k]).filter(z => z !== undefined && z !== null), below = vals.filter(z => z < v).length, raw = vals.length > 1 ? below / (vals.length - 1) : 0.5, pct = Math.round(100 * (dir > 0 ? raw : 1 - raw));
    const size = k === 'ht' || k === 'wt' || k === 'arm' || k === 'hand';
    return `<div class="ph-r ${size ? '' : 'hi hi' + (i % 4)}" ${size ? '' : `style="${hiStyle(pct)}"`} data-tip="${ordinal(pct)} percentile among ${esc(p.pos)}s${x[k] === 'p' ? ' · pro day' : ''}${mine !== undefined ? ' · your workout: ' + f(mine) : ''}"><span>${l}</span><b>${f(v)}${x[k] === 'p' ? '*' : ''}${mine !== undefined ? `<em>${f(mine)}†</em>` : ''}</b></div>`; }).join('');
}
// the physical sheet for a panel: the same highlighted rows as the player file, in two columns
function combineHTML(p) { return `<div class="ph-rows two">${physRowsHTML(p)}</div>${workoutNoteHTML(p)}`; }
function strengthsHTML(p) {
  const { str, weak, best } = scoutTraits(p);
  return `<div class="pp-sw"><div><div class="ds-lb">Strengths</div>${str.map(t => `<div class="sw-t good">${esc(t)}</div>`).join('')}${str.length < 2 ? best.map(t => `<div class="sw-t rel" title="Relative to the rest of his game, not to a starter">${esc(t)}</div>`).join('') : ''}${!str.length && !best.length ? '<div class="sc-note">Nothing that stands out.</div>' : ''}</div>
    <div><div class="ds-lb">Weaknesses</div>${weak.length ? weak.map(t => `<div class="sw-t bad">${esc(t)}</div>`).join('') : '<div class="sc-note">No glaring holes.</div>'}</div></div>`;
}
// Where he plays, in coaching terms: every technique along the line for a lineman, the box, space and the edge for a linebacker,
// outside, slot, box and deep for a defensive back. Each against his own best, with how at home he is and his size for it.
const TECH_POINTS = [['0', 0], ['1', 0.45], ['2i', 0.75], ['3', 1.35], ['4i', 1.65], ['5', 2.3], ['7', 2.6], ['6', 2.9], ['9', 3.3], ['W9', 3.8]];
const BACK_POINTS = { LB: [['Box', 'MLB'], ['Space', 'WLB'], ['Edge', 'SAM']], DB: [['Outside', 'CB'], ['Slot', 'NCB'], ['Box', 'SS'], ['Deep', 'FS']] };
function techPoints(p) {
  const g = SPOTS[p.spot] && SPOTS[p.spot].g;
  if (g === 'DL') return TECH_POINTS.map(([l, ax]) => ({ l, r: lineSlotRating(p, ax), c: lineComfort(p, ax), m: lineMass(p, ax) }));
  const pts = g === 'LB' ? BACK_POINTS.LB : g === 'CB' || g === 'S' ? BACK_POINTS.DB : null; if (!pts) return null;
  return pts.map(([l, sp]) => sp === 'SAM' ? { l, r: rowFit(p, 'SAM', 3.3, 1.5), c: comfortOf(p, 'WLB'), m: lineMass(p, 3.3) } : { l, r: slotRating(p, sp), c: comfortOf(p, sp), m: 0 }); // the edge: walked up on the tight end
}
function techStripHTML(p) {
  if (!p.a || !SPOTS[p.spot]) return '';
  const v = techPoints(p); if (!v) return '';
  const top = Math.max(...v.map(x => x.r));
  return `<div class="line-strip ${v.length > 6 ? 'many' : ''}" style="grid-template-columns:repeat(${v.length}, minmax(0, 1fr))" title="How he plays at each spot, against his own best one. Comfort is what he has learned there; size is against what the spot asks for.">${v.map(x => { const d = Math.round(x.r - top), lv = d >= -1 ? 4 : d >= -4 ? 3 : d >= -8 ? 2 : d >= -13 ? 1 : 0;
    return `<div class="ls-c ls-${lv}" title="${esc(x.l)}: ${esc(comfortLabel(x.c))} there${x.m <= -1.5 ? ' · light for it' : x.m >= 1.5 ? ' · heavy for it' : ''}"><b>${esc(x.l)}</b><span>${d >= -1 ? (v.length > 6 ? '●' : 'best') : d}</span></div>`; }).join('')}</div>`;
}
function comfortHTML(p) {
  const cf = Object.entries(p.cf || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return `<div class="pp-kv">${techStripHTML(p)}${cf.map(([s, c]) => { const l = comfortLabel(c); return `<div class="sc-kv" title="${trueOn() ? Math.round(c) : ''}"><span>${esc(JOB_NAME[s] || SPOTS[s].l)}</span><b class="cf-${CF_PIPS[l]}">${l}</b></div>`; }).join('')}
    <div class="sc-fine">Learns new spots ${learnRate(p) >= 1.15 ? 'quickly' : learnRate(p) <= 0.8 ? 'slowly' : 'at an ordinary pace'}.</div></div>`;
}
// ---------- the player file: a bio header that never moves, and tabs under it ----------
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
  const k = src.pre ? advPreK() : src.cur ? clamp((state.week - 1) / 17, 1 / 17, 1) : 1, key = state.season + ':' + state.week + ':' + state.phase + ':' + src.season + ':' + src.cur + ':' + (src.pre ? 'pre' + (state.pre ? state.pre.wk : '') : '');
  if (ADV_POOL.key !== key) ADV_POOL = { key, by: {} };
  if (!ADV_POOL.by[grp]) { const pool = [];
    for (const id in state.players) { const q = state.players[id]; if (advGroupOf(q) !== grp) continue;
      if (src.pre) { if (q.preS && q.preS.season === src.season && q.preS.adv && advQualified(grp, q.preS.adv, k)) pool.push([q.preS.adv, q.preS.st || {}]); continue; }
      const a = src.cur ? q.advS : q.advPrev && q.advPrev.season === src.season ? q.advPrev : null; if (a && advQualified(grp, a, k)) pool.push([a, cardBox(q, src.season, src.cur) || {}]); }
    ADV_POOL.by[grp] = pool; }
  return { grp, k, pool: ADV_POOL.by[grp] };
}
function advSheetOf(p, src) { const P_ = advPoolFor(p, src); return P_ ? { grp: P_.grp, n: P_.pool.length, qual: advQualified(P_.grp, src.a, P_.k), sheet: advSheet(P_.grp, src.a, src.pre ? p.preS.st || {} : cardBox(p, src.season, src.cur) || {}, P_.pool, P_.k) } : null; }
// a preseason is a few games, and most men play part of each: the bar to qualify is set to match
function advPreK() { const gms = state.phase === 'PRESEASON' && state.pre ? Math.max(1, state.pre.wk) : PRESEASON_GAMES; return gms * 0.5 / 17; }
// which numbers the Advanced tab reads: the season (or last season), or this preseason
function cardAdvSrc(p) { if (ui.advScope === 'pre' && p.preS && p.preS.adv && p.preS.snp) return { a: p.preS.adv, season: p.preS.season || state.season, cur: false, pre: true }; return cardAdv(p); }
function advTag(m) { const q = Math.round(100 * m.pct); return m.dir === 0 ? (q >= 85 ? 'Among the highest' : q <= 15 ? 'Among the lowest' : ordinal(q) + ' percentile') : q >= 90 ? `Top ${Math.max(1, 100 - q)}%` : q <= 10 ? `Bottom ${Math.max(1, q)}%` : ordinal(q) + ' percentile'; }
function advTone(m) { return m.dir === 0 || m.z === null ? '' : m.z >= 0.8 ? 'good' : m.z <= -0.8 ? 'bad' : ''; }
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
// ---- the scouting page of the file: the report, what he does and where, and the physical sheet, on one screen ----
const CF_PIPS = { Natural: 4, Comfortable: 3, Decent: 2, Raw: 1, Unfamiliar: 0 };
function pipsHTML(n, cls) { return `<span class="pips ${cls || ''}">${[0, 1, 2, 3].map(i => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`; }
function scTraitsHTML(p) {
  const { str, weak, best } = scoutTraits(p), li = (t, c) => `<div class="sw-t ${c}">${esc(t)}</div>`;
  return `<div class="ds-lb">Strengths</div>${str.map(t => li(t, 'good')).join('') || (best.length ? '' : '<div class="sc-note">Nothing that stands out.</div>')}${str.length < 2 ? best.map(t => `<div class="sw-t rel" title="Relative to the rest of his game, not to a starter">${esc(t)}</div>`).join('') : ''}
    <div class="ds-lb" style="margin-top:14px">Weaknesses</div>${weak.map(t => li(t, 'bad')).join('') || '<div class="sc-note">No glaring holes.</div>'}`;
}
function scWhereHTML(p) {
  if (p.tid === -2) return '';
  const u = state.userTid, cf = Object.entries(p.cf || {}).sort((a, b) => b[1] - a[1]).slice(0, 5); let h = '';
  if (cf.length) h += `<div class="ds-rule"></div><div class="ds-lb">Where he can play <span class="sc-lbr">learns new spots ${learnRate(p) >= 1.15 ? 'quickly' : learnRate(p) <= 0.8 ? 'slowly' : 'at an ordinary pace'}</span></div>${techStripHTML(p)}
    ${cf.map(([s, c]) => { const l = comfortLabel(c); return `<div class="sc-kv" title="${trueOn() ? Math.round(c) : ''}"><span>${esc(JOB_NAME[s] || SPOTS[s].l)}</span><b class="cf-${CF_PIPS[l]}">${l}</b></div>`; }).join('')}`;
  const side = SPOTS[p.spot].side, fitTeams = [...new Set([p.tid >= 0 ? p.tid : null, u].filter(t => t !== null && t >= 0))];
  const rows = [];
  if (side === 'off' || side === 'def') for (const t of fitTeams) { const f = schemeFit(p, t), lab = teamSchemeLabel(T(t), side === 'off' ? 'O' : 'D') || '—';
    rows.push(`<div class="sc-kv"><span>${T(t).abbr} · ${esc(lab)}</span><b class="${f >= 1 ? 'good' : f <= -1 ? 'bad' : ''}">${fitLabel(f)}${trueOn() ? ` ${f > 0 ? '+' : ''}${f}` : ''}</b></div>`); }
  if (p.tid >= 0 && (CH_UNIT[p.pos] || ['RB', 'WR', 'TE'].includes(p.pos))) { ensureChem(); const qb = repsOrder(p.tid, 'QB')[0], v = CH_UNIT[p.pos] ? chemOf(p) : chemPair(p, qb);
    rows.push(`<div class="sc-kv"><span>Chemistry ${CH_UNIT[p.pos] ? 'with the ' + CH_NAME[CH_UNIT[p.pos]].toLowerCase() : qb ? 'with ' + esc(pshort(qb)) : 'with his quarterback'}</span><b class="${v >= 70 ? 'cf-4' : v < 50 ? 'cf-1' : ''}">${chemWord(v)}</b></div>`); }
  { const w = typeof stWord === 'function' ? stWord(p) : null, sg = stGrade(p.stats); if (w) rows.push(`<div class="sc-kv"><span>Special teams${p.stats && p.stats.sts ? ` · ${p.stats.sts} snaps` : ''}</span><b class="${w[1]}">${w[0]}${sg !== null && p.stats && p.stats.sts ? ' · ' + sg : ''}</b></div>`); }
  if (rows.length) h += `<div class="ds-rule"></div><div class="ds-lb">Fit</div>${rows.join('')}`;
  if (p.awards && p.awards.length) h += `<div class="ds-rule"></div><div class="ds-lb">Honours</div><div class="sc-note">${p.awards.slice(-4).map(esc).join(' · ')}${p.awards.length > 4 ? ` · and ${p.awards.length - 4} more` : ''}</div>`;
  return h;
}
// a stroke of highlighter: green for the top of his position, red for the bottom, yellow between
function hiStyle(pct) { const h = Math.round(clamp(pct, 0, 100) * 1.18), a = 0.3 + Math.abs(pct - 50) / 50 * 0.4; return `--hi:hsla(${h},62%,${h > 45 && h < 75 ? 62 : 68}%,${a.toFixed(2)});--hi2:hsla(${h},62%,70%,${(a * 0.55).toFixed(2)})`; }
function scPhysicalHTML(p) {
  const rows = physRowsHTML(p), r = rasOf(p);
  const yr = p.draft ? p.draft.year : p.tid === -2 ? p.draftYear : state.season - (p.exp || 0);
  return `<div class="ds-lb">Physical <span class="sc-lbr">${p.tid === -2 ? (p.m.pd ? 'pro day' : 'this year’s combine') : 'measured ' + yr}</span></div>
    <div class="sc-ras">${r === null ? '<span class="sc-note">Too little of a workout for an athletic score.</span>' : `<span class="fig-v ph-r hi hi1" style="${hiStyle(r * 10)}" data-tip="Relative athletic score: his drills as percentiles against every ${esc(p.pos)}, averaged">${r.toFixed(2)}</span><span class="sc-note">athletic score out of 10</span>`}</div>
    <div class="ph-rows">${rows}</div>${workoutNoteHTML(p)}${p.tid === -2 && p.m.med && p.m.med !== 'clean' ? `<div class="sc-note ${p.m.med === 'flag' ? 'bad' : 'warn'}" style="margin-top:6px">${p.m.med === 'flag' ? 'The doctors flagged him.' : 'The doctors noted a minor concern.'} They are not always right.</div>` : ''}`;
}
function cardAdvHTML(p) {
  const hasPre = !!(p.preS && p.preS.adv && p.preS.snp), src = cardAdvSrc(p), S = src ? advSheetOf(p, src) : null, reg = cardAdv(p);
  const scope = hasPre || ui.advScope === 'pre' ? `<div class="subtabs" style="margin:0 0 10px">${[['reg', reg ? (reg.cur ? `${reg.season} season` : `${reg.season} season`) : 'Season'], ['pre', `${(p.preS && p.preS.season) || state.season} preseason`]].map(([k, l]) => `<button class="${(src && src.pre ? 'pre' : 'reg') === k ? 'on' : ''}" data-action="advScope" data-v="${k}" data-pid="${p.id}" ${k === 'pre' && !hasPre ? 'disabled' : ''}>${l}</button>`).join('')}${src && src.pre ? `<span class="small muted" style="margin-left:8px">${p.preS.gp} game${p.preS.gp === 1 ? '' : 's'}, ${p.preS.snp} snaps · against everyone who has played enough this preseason</span>` : ''}</div>` : '';
  const facets = `<div class="adv-sec"><div class="ds-lb">Grades${src ? ` · ${src.season}${src.pre ? ' preseason' : src.cur ? ' to date' : ''}` : ''} <span style="float:right">plays</span></div>${glanceHTML(p, src)}</div>`;
  if (!S) { const adv = src && src.pre ? '' : advRankHTML(p, src); return scope + `<div class="grid card-cols"><div>${facets}</div><div>${adv ? `<div class="ds-lb">Tracking</div>${adv}` : '<div class="muted small">No tracking numbers at his position.</div>'}</div></div>${advancedSeasonHTML(p)}`; }
  const outs = new Set(advOutliers(S.sheet, 4, S.grp).map(m => m.id));
  const secs = Object.keys(ADV_SEC).map(k => { const ms = S.sheet.filter(m => m.sec === k); if (!ms.length) return '';
    return `<div class="adv-sec"><div class="ds-lb">${ADV_SEC[k]}</div>${ms.map(m => { const has = m.v !== null && m.ok, tone = has ? advTone(m) : '', col = tone === 'good' ? 'var(--good)' : tone === 'bad' ? 'var(--bad)' : m.dir === 0 ? 'var(--accent)' : 'var(--mid)';
      return `<div class="adv-r ${outs.has(m.id) ? 'out' : ''}" title="${m.dir < 0 ? 'Lower is better' : m.dir === 0 ? 'A description, not a grade' : 'Higher is better'}${has && m.pct !== null ? ' · ' + advTag(m) : m.v !== null ? ' · too small a sample to rank' : ''}"><span class="adv-l">${esc(m.label)}</span><span class="adv-v ${tone} ${has ? '' : 'muted'}">${advFmt(m.id, m.v)}</span><span class="adv-tag ${has && m.pct !== null ? tone || (m.dir === 0 ? 'note' : 'mid') : 'none'}">${has && m.pct !== null ? advTag(m).replace(' percentile', '').replace('Among the highest', 'High').replace('Among the lowest', 'Low') : m.v !== null ? 'few snaps' : ''}</span><span class="adv-rk">${has && m.rank ? m.rank + '/' + m.n : ''}</span></div>`; }).join('')}</div>`; }).join('');
  return scope + `<div class="small muted" style="margin-bottom:8px">Against ${S.n} ${esc(S.grp)} who have played enough to qualify${S.qual ? '' : ' (he has not)'} · the tag is where he stands among them · <b class="adv-key">marked</b> rows are the four on his overview</div><div class="adv-grid">${facets}${secs}</div>${advancedSeasonHTML(p)}`;
}
// the deal he is playing under, written out like the one you negotiate
function cardDealDocHTML(p) {
  const c = p.contract; if (!c || p.tid < 0 || !(c.yrs > 0)) return '';
  const t = T(p.tid), club = `${esc(t.region)} ${esc(t.name)}`, y0 = state.season, M = v => `<b>${fmtMoney(v)}</b>`, words = n => ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'][n] || n;
  const art = (n, title, body) => `<div class="fd-art"><div class="fd-h">ARTICLE ${n} — ${title}</div>${body}</div>`, sub = (n, body) => `<p><span class="fd-n">${n}</span>${body}</p>`;
  const hits = []; for (let i = 0; i < c.yrs; i++) hits.push(i === 0 ? c.amt : c.sched && c.sched[i] !== undefined ? c.sched[i] : c.amt);
  const dead = deadIfCut(p); let a = null; try { a = agentOf(p); } catch (e) { a = null; }
  let d = `<div class="fd-top">STANDARD PLAYER CONTRACT</div><div class="fd-mid">between<br><b>${club} Football Club</b> ("Club")<br>and<br><b>${esc(pname(p))}</b> ("Player")</div>`;
  d += art('I', 'TERM', sub('1.1', `${words(c.yrs)[0].toUpperCase() + String(words(c.yrs)).slice(1)} (${c.yrs}) football season${c.yrs === 1 ? ' remains' : 's remain'} under this Agreement, concluding at the end of the ${y0 + c.yrs - 1} League Year, unless sooner terminated in accordance with Article VI.`)
    + (c.next ? sub('1.2', `By ${c.opt5 === 'exercised' && c.next.yrs === 1 ? 'option exercised by Club' : 'extension executed during the Term'}, Player is further bound for ${words(c.next.yrs)} (${c.next.yrs}) League Year${c.next.yrs === 1 ? '' : 's'} thereafter at ${M(c.next.amt)} per League Year, of which ${M(c.next.gtd || 0)} is guaranteed.`) : '')
    + (c.rookie ? sub(c.next ? '1.3' : '1.2', `This Agreement is a rookie contract under the League wage scale${c.opt5 ? `; fifth-year option: ${esc(String(c.opt5))}` : ''}.`) : '')
    + (c.tagged ? sub('1.2', 'This Agreement is a one-year franchise tender.') : ''));
  d += art('II', 'SIGNING BONUS AND GUARANTEE', (c.bonus ? sub('2.1', `Club paid Player a signing bonus of ${M(c.bonus)} upon execution, allocated in equal instalments to each League Year of the original Term.`) : sub('2.1', 'No signing bonus remains to be allocated under this Agreement.'))
    + sub('2.2', `Of the sums still payable hereunder, ${M(c.gtd || 0)} is guaranteed. Should Club terminate this Agreement today, ${M(dead.now)} would be charged to the present League Year${dead.next ? ` and ${M(dead.next)} to the next` : ''}.`));
  d += art('III', 'COMPENSATION', sub('3.1', 'The following amounts shall be charged to Club under the League salary cap in respect of Player:') + `<div class="fd-sched">${hits.map((b, k) => `<span>${y0 + k} League Year</span><span>${fmtMoney(b)}</span>`).join('')}</div>`
    + sub('3.2', `The aggregate remaining under this Agreement, exclusive of incentives, is ${M(hits.reduce((x, y) => x + y, 0))}.`));
  d += art('IV', 'INCENTIVES', c.inc && c.inc.length ? c.inc.map((x, k) => sub('4.' + (k + 1), `Should Player, in any League Year of the Term, ${incLabel(x, true)}, Club shall pay Player an additional ${M(x.amt)}. <i>(${x.likely ? 'Likely to be earned' : 'Not likely to be earned'}.)</i>`)).join('') : sub('4.1', 'This Agreement contains no performance incentives.'));
  if (a) d += art('V', 'REPRESENTATION', sub('5.1', `Player is represented by ${esc(agentName(a))}, a certified contract advisor.`));
  d += art(a ? 'VI' : 'V', 'TERMINATION', sub(a ? '6.1' : '5.1', 'Club may terminate this Agreement upon written notice if, in the sole judgment of Club, Player\'s skill or performance has been unsatisfactory as compared with that of other players competing for positions on Club\'s roster.'));
  d += `<div class="fd-sig"><div><span><i class="fd-ink">${esc(pname(p))}</i></span>Player</div><div><span><i class="fd-ink">${esc(t.abbr)} Football Club</i></span>For the Club</div></div>`;
  return d;
}
function cardManageHTML(p) {
  const u = state.userTid; let left = '';
  if ((p.tid === u || (p.tid === -3 && p.psTid === u)) && p.a && workSpots(p).length > 1) left += `<div class="terms"><div class="small muted" style="margin-bottom:4px">Where he is working <span title="Sets the room he sits in during camp, the drills he takes, what the reports say about him, and where his comfort at a new spot grows.">ⓘ</span></div>${crossTrainSelect(p, true)}</div>`;
  if ((p.tid === u || (p.tid === -3 && p.psTid === u)) && PRAC_SIDE[p.pos]) left += `<div class="terms"><div class="small muted" style="margin-bottom:4px">In the building${p.seenW ? ` · ${p.seenW} week${p.seenW === 1 ? '' : 's'} with your staff` : ''}</div><div class="small" style="margin-bottom:4px">Playbook ${pbBar(pbOf(p))} <span class="muted">${pbLabel(pbOf(p))}</span> · this week ${pracChip(p)}</div><div class="row small" style="gap:6px">${charPill(p, 'pas')}${charPill(p, 'disc')}${charPill(p, 'lead')}</div>${p.tid === u && crossTrainSpots(p).length ? `<div class="small" style="margin-top:6px">Cross-train at ${crossTrainSelect(p).replace('data-pid=', 'data-card="1" data-pid=')}${p.xt ? ` <span class="muted">now ${comfortLabel(comfortOf(p, p.xt)).toLowerCase()} (${Math.round(comfortOf(p, p.xt))}/100)</span>` : ''}</div>` : ''}</div>`;
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
    if (psBtnOK(p)) left += `<button data-action="toPS" data-pid="${p.id}" title="Released and put on your practice squad (through waivers if his experience calls for it)">Move to practice squad</button>`;
    left += `<button class="danger" data-action="release" data-pid="${p.id}">Release</button>`;
  } else if (p.waiver) { left += '<div class="small muted">On waivers: claim him from the Waiver Wire tab.</div>';
  } else if (state.phase === 'UDFA' && state.udfa && isUdfa(p)) { const cur = state.udfa.offers[p.id], pl = udfaPathLabel(udfaPath(p, u)); left += `<div class="terms"><div class="small muted" style="margin-bottom:4px">Undrafted rookie · market: <b>${udfaInterest(p)}</b> · his view of your roster: <b>${pl}</b>${cur !== undefined ? ` · your offer: <b>${fmtBonus(cur)}</b>` : ''}</div><div class="row" style="gap:6px">${UDFA_BONUS.map(b => `<button class="sm ${cur === b ? 'primary' : ''}" data-action="udfaOfferBtn" data-pid="${p.id}" data-b="${b}">${b ? fmtBonus(b) : 'No bonus'}</button>`).join('')}${cur !== undefined ? `<button class="sm danger" data-action="udfaOfferBtn" data-pid="${p.id}" data-b="">Withdraw</button>` : ''}</div></div>`;
  } else if (p.tid === -1 && faInMarket(p)) { left += `<button class="primary" data-action="faGo" data-pid="${p.id}">Sit down with his agent</button>`;
  } else if (p.tid === -1 && wvOpen()) { left += wvFaButtons(p, true) + '<div class="small muted">The waiver window is open: offers are settled with every other club\'s when you process claims.</div>';
  } else if (p.tid === -1 && state.phase !== 'PLAYOFFS' && state.phase !== 'RECAP') left += `<button class="primary" data-action="sign" data-pid="${p.id}">Sign (${fmtMoney(p.ask)})</button>`;
  else if (p.tid >= 0) left += `<button data-action="tradeFor" data-pid="${p.id}">Trade for ${esc(p.last)}</button>`;
  if (p.tid === -2) { const n = pwState().left; left += p.pw ? '<span class="small muted">You have worked him out privately: your numbers are on the Scouting tab.</span>' : `<button ${n ? '' : 'disabled'} data-action="privateWorkout" data-pid="${p.id}" title="He runs every drill again for you alone, including any he skipped. The numbers are yours: the rest of the league does not see them.">Private workout</button><span class="small muted">${n} of ${PW_PER_CLASS} left for this class</span>`; }
  return left;
}
// ---------- the player file: one window. A leather title band in his club's colors, a row of facts, then panes:
//  the read (today and the future) beside a pane that switches between strengths and weaknesses, advanced stats, where he plays,
//  his physical sheet and, for your own men, how he is being worked; the contract year by year beside his honours; and every season
//  of his stats by split, category or grade, or his grades game by game. Each page of the old card is one of these views. ----------
const FILE_LO = 1;
const fileYpc = s => s.rushA ? round1(s.rushY / s.rushA) : 0, fileYpr = s => s.rec ? round1(s.recY / s.rec) : 0;
// the box score in categories, each a short table so nothing runs off the side; a column marked lo folds away in a narrow window
const FILE_GROUPS = {
  QB: [['Passing', [['passC', 'Cmp', null, 2], ['passA', 'Att'], ['pct', 'Pct', s => s.passA ? round1(100 * s.passC / s.passA) : 0], ['passY', 'Yds'], ['ypa', 'Y/A', s => s.passA ? round1(s.passY / s.passA) : 0, FILE_LO], ['passTD', 'TD'], ['passInt', 'Int'],
    ['rtg', 'Rtg', s => round1(passerRating(s.passC || 0, s.passA || 0, s.passY || 0, s.passTD || 0, s.passInt || 0))], ['sacked', 'Sck', null, FILE_LO], ['passLng', 'Lng', null, FILE_LO]]],
    ['Rushing', [['rushA', 'Car'], ['rushY', 'Yds'], ['ypc', 'Avg', fileYpc], ['rushTD', 'TD'], ['fum', 'Fum']]]],
  RB: [['Rushing', [['snp', 'Snaps', null, FILE_LO], ['rushA', 'Car'], ['rushY', 'Yds'], ['ypc', 'Avg', fileYpc], ['rushTD', 'TD'], ['rushLng', 'Lng', null, FILE_LO], ['fum', 'Fum']]],
    ['Receiving', [['tgt', 'Tgt'], ['rec', 'Rec'], ['recY', 'Yds'], ['ypr', 'Avg', fileYpr, FILE_LO], ['recTD', 'TD']]]],
  WR: [['Receiving', [['snp', 'Snaps', null, FILE_LO], ['tgt', 'Tgt'], ['rec', 'Rec'], ['cpct', 'Catch%', s => s.tgt ? round1(100 * s.rec / s.tgt) : 0, FILE_LO], ['recY', 'Yds'], ['ypr', 'Avg', fileYpr], ['recTD', 'TD'], ['recLng', 'Lng', null, FILE_LO]]],
    ['Rushing', [['rushA', 'Car'], ['rushY', 'Yds'], ['rushTD', 'TD'], ['fum', 'Fum']]]],
  OL: [['Blocking', [['snp', 'Snaps'], ['pen', 'Penalties']]]],
  DEF: [['Tackling', [['snp', 'Snaps', null, FILE_LO], ['tkl', 'Tkl'], ['tfl', 'TFL'], ['sck', 'Sck'], ['prs', 'Pres'], ['pen', 'Pen', null, FILE_LO]]],
    ['Takeaways', [['dint', 'Int'], ['pd', 'PD'], ['ff', 'FF'], ['fr', 'FR'], ['dtd', 'TD']]]],
  K: [['Kicking', [['fgm', 'FGM'], ['fga', 'FGA'], ['fgp', 'FG%', s => s.fga ? round1(100 * s.fgm / s.fga) : 0], ['fgLng', 'Lng'], ['xpm', 'XPM'], ['xpa', 'XPA', null, FILE_LO], ['xpp', 'XP%', s => s.xpa ? round1(100 * s.xpm / s.xpa) : 0, FILE_LO]]]],
  P: [['Punting', [['pnt', 'Punts'], ['pntY', 'Yds', null, FILE_LO], ['pavg', 'Avg', s => s.pnt ? round1(s.pntY / s.pnt) : 0], ['pi20', 'In 20'], ['ptb', 'TB']]]] };
const FILE_ST = ['Special teams', [['sts', 'Snaps'], ['stk', 'Tkl'], ['krA', 'KR'], ['krY', 'KR yds', null, FILE_LO], ['kravg', 'KR avg', s => s.krA ? round1(s.krY / s.krA) : 0], ['prA', 'PR'], ['prY', 'PR yds', null, FILE_LO], ['pravg', 'PR avg', s => s.prA ? round1(s.prY / s.prA) : 0], ['rtd', 'TD', s => (s.krTD || 0) + (s.prTD || 0)]]];
const fileGroupsOf = pos => FILE_GROUPS[pos === 'TE' ? 'WR' : DEF_POS.includes(pos) ? 'DEF' : pos] || FILE_GROUPS.DEF;
const fileVal = (r, [k, , fn]) => fn ? fn(r) : r[k] || 0;
const fileLo = c => c[3] === 2 ? ' class="num lo2"' : c[3] ? ' class="num lo"' : ' class="num"';
// the colors his file wears: his club's, or plain leather for a man without one
function fileStyle(p) { const tid = clubOf(p); return tid === null || tid === undefined || tid < 0 ? '--tc:#6c5b4d;--tc2:#b8a48e;--tci:#fff;--tsh:0 -1px 0 rgba(0,0,0,.32)' : Object.entries(clubVars(tid)).map(([k, v]) => `${k}:${v}`).join(';'); }
// a dropdown in a pane's header: its choice lives in ui under its key, and changing it redraws the file
function fileSelect(k, opts, cur, pid) { return `<select class="fsel" data-change="fileOpt" data-k="${k}" data-pid="${pid}">${opts.map(([v, l]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`; }
const filePane = (area, title, html, ctl, cls) => `<section class="fp${cls ? ' ' + cls : ''}" style="grid-area:${area}"><div class="fp-h"><h3>${title}</h3>${ctl || ''}</div><div class="fp-b"><div class="fp-in">${html}</div></div></section>`;
const fileKV = rows => `<div class="fkv">${rows.filter(Boolean).map(([k, v]) => `<div class="fkv-k">${k}</div><div class="fkv-v">${v}</div>`).join('')}</div>`;
function fileHeadHTML(p) {
  const prospect = p.tid === -2, stars = starsOf(p), c = p.contract || {}, ras = p.m && typeof rasOf === 'function' ? rasOf(p) : null;
  const team = p.tid >= 0 ? teamLink(p.tid, true) : p.tid === -3 ? `Practice squad · ${teamLink(p.psTid, true)}` : p.tid === -1 ? 'Free agent' : `${p.draftYear} draft prospect`;
  const drafted = p.draft ? `Round ${p.draft.round} (no. ${p.draft.pick}), ${p.draft.year}${p.draft.tid >= 0 ? ' by ' + T(p.draft.tid).abbr : ''}` : prospect ? `${p.draftYear} class` : 'Undrafted';
  const facts = [[prospect ? 'Ready now' : 'Level', tierPill(p), prospect ? '' : stars !== null ? starHTML(stars) : ''], ['Upside', upsidePill(p), ''],
    prospect ? ['Draft', `${p.draftYear} class`, esc(p.college || '')] : p.tid === -1 ? ['Asking', fmtMoney(p.ask), 'a year'] : ['Contract', c.amt ? fmtMoney(c.amt) : '—', c.yrs ? `${c.yrs} yr${c.yrs === 1 ? '' : 's'} left` : ''],
    ['Age', String(p.age), ''], ['Size', p.m ? fmtHeight(p.m.ht) : '—', p.m ? `${p.m.wt} lb` : ''],
    [prospect ? 'Athletic score' : 'Experience', prospect ? (ras === null ? '—' : ras.toFixed(2)) : p.exp === 0 ? 'Rookie' : `Year ${p.exp + 1}`, prospect ? 'out of 10' : drafted]];
  return `<div class="pf-top"><div class="pf-id"><div class="pf-over">${esc(p.lbl)} · ${team} · file no. ${String(p.id).padStart(4, '0')}</div><h2>${esc(pname(p))}<span>${JOB_NAME[p.spot] || esc(p.lbl)}${p.college ? ' · ' + esc(p.college) : ''}</span></h2></div>
      <div class="pf-pills">${statusPills(p)}${medPill(p)}${trueNums(p)}${rasHTML(p)}</div></div>
    <div class="pf-facts">${facts.map(([k, v, s]) => `<div><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s || '&nbsp;'}</div></div>`).join('')}</div>`;
}
// the read: what he is today, and what he becomes
function fileReadHTML(p) {
  const prospect = p.tid === -2, own = clubOf(p) === state.userTid, src = cardSrc(p), dv = devStatement(p), form = (p.form || []).slice(-5), buzz = buzzLabel(p);
  const sg = src && p.pos !== 'K' && p.pos !== 'P' && src.a && Object.keys(src.a).length ? overallGrade(src.a, p.spot) : null;
  const rk = src && sg !== null ? (src.cur ? gradeRanks()[p.id] : seasonRank(p, (p.career || []).find(r => r.season === src.season) || {})) : null;
  const tierT = tierOf(p), upT = upsideOf(p), young = p.age <= 25 && upT !== tierT;
  const DAY1 = { Elite: 'a franchise-changing talent', 'All-Pro': 'an instant-impact player', Starter: 'a day-one starter', Rotation: 'a rotational contributor', Backup: 'a backup early on', Depth: 'a depth player early on', Project: 'a developmental prospect', Fringe: 'a developmental prospect', Washed: 'a developmental prospect' };
  const viewed = prospect ? `Scouts see ${DAY1[tierT] || 'a developmental prospect'} with ${upT.toLowerCase()} upside.` : `Viewed as ${/^[AEIOU]/.test(tierT) ? 'an' : 'a'} ${tierT.toLowerCase()} today${young ? ` with ${upT.toLowerCase()} upside` : ''}.`;
  const know = own ? knowWord(p) : null, conf = confLabel(p), box = prospect ? '' : cardBoxLine(p);
  const stamp = `<span class="stamp ${own ? (know === 'Known well' ? 'good' : know === 'Still learning him' ? 'bad' : '') : conf === 'High' ? 'good' : conf === 'Low' ? 'bad' : ''}">${own ? know : conf + ' confidence'}</span>${buzz ? ` <span class="stamp note">${esc(buzz)}</span>` : ''}`;
  const today = [!prospect && [src && !src.cur ? `${src.season} grade` : 'Season grade', sg === null ? '<span class="muted">No grade yet</span>' : `${gradeChip(sg)} ${rk ? `<span class="small muted">${rk[0]}${ordinal(rk[0]).replace(/\d+/, '')} of ${rk[1]}${rk[2] ? ' ' + rk[2] : ''}</span>` : '<span class="small muted">below the snap minimum</span>'}`],
    !prospect && form.length && [`Last ${form.length} games`, form.map(g => gradeChip(Math.round(g))).join(' ')],
    box && ['This season', box],
    p.injury && ['Status', `<span class="bad">Injured: ${esc(p.injury.name)}, out ${p.injury.weeks} more week${p.injury.weeks > 1 ? 's' : ''}${onIR(p) ? ' (injured reserve)' : ''}</span>`],
    p.rust && ['Status', '<span class="warn">Rusty: short of preseason work, a step slow until he has played a game or two</span>'],
    [own ? 'Your staff' : 'Your scouts', stamp], p.awards && p.awards.length && ['Honours', p.awards.slice(-4).map(esc).join(' · ') + (p.awards.length > 4 ? ` · and ${p.awards.length - 4} more` : '')]];
  const m = p.upM, future = [['Upside', `${upsidePill(p)}${dv ? ` <span class="pill ${dv.cls}">${dv.k}</span>` : ''}${prospect ? '' : ' ' + trackPill(p)}`]];
  let note = '';
  if (p.a && p.per && p.grow && isDeveloping(p)) {
    const r = finishedRemark(p), c = compFor(p), b = compFor(p, true), same = b && c && ((b.id !== undefined && b.id === c.id) || (b.rid !== undefined && b.rid === c.rid));
    future.push(['Finished product', esc(r.line || 'Too little to go on yet') + '.']);
    if (c) future.push(['Plays like', compLink(c) + compBuild(p, c)]);
    if (b && !same) future.push(['Best case', compLink(b) + compBuild(p, b)]);
    note = `A projection from ${filmBasis(p)}; rewritten as the film comes in.`;
  } else if (dv) future.push(['Outlook', esc(dv.line)]);
  if (m && !prospect) note += `${note ? ' ' : ''}<span class="${m.d > 0 ? 'good' : 'bad'}">${m.d > 0 ? '▲' : '▼'} Upside ${m.d > 0 ? 'raised' : 'lowered'} from ${esc(m.from)} after ${esc(m.why)} (${esc(String(m.s))}).</span>`;
  return `<div class="pf-lead">${esc(scoutProfile(p))}.</div><div class="pf-viewed">${esc(viewed)}</div><div class="pf-sub">Today</div>${fileKV(today)}${prospect ? '' : readRangeHTML(p)}<div class="pf-sub">The future</div>${fileKV(future)}${note ? `<div class="sc-fine">${note}</div>` : ''}`;
}
// the pane beside the read: whichever of his pages you choose
function fileSideViews(p) {
  const prospect = p.tid === -2, manage = cardManageHTML(p);
  return [['sw', 'Strengths and weaknesses'], !prospect && ['adv', 'Advanced stats'], !prospect && scWhereHTML(p) && ['where', 'Where he plays'], p.m && ['phys', 'Physical'], manage && ['manage', 'In the building'],
    prospect && typeof protoReportHTML === 'function' && ['proto', 'New report (prototype)'], trueOn() && ['attrs', 'Ratings (debug)']].filter(Boolean);
}
function fileSideHTML(p) {
  const views = fileSideViews(p), v = views.some(x => x[0] === ui.fileSide) ? ui.fileSide : 'sw', title = views.find(x => x[0] === v)[1];
  const html = v === 'adv' ? cardAdvHTML(p) : v === 'where' ? scWhereHTML(p).replace(/^\s*<div class="ds-rule"><\/div>/, '') : v === 'phys' ? `${spiderHTML(p)}<div class="ds-rule"></div>${scPhysicalHTML(p)}`
    : v === 'manage' ? cardManageHTML(p) : v === 'proto' ? protoReportHTML(p) : v === 'attrs' ? attributesHTML(p) : scTraitsHTML(p);
  return filePane('side', title, html, views.length > 1 ? fileSelect('fileSide', views, v, p.id) : '', 'fill');
}
// the contract: every year of it with the pay and the guarantee (the game wears a guarantee off evenly over the years left), then the moves on it
function fileContractHTML(p) {
  const c = p.contract || {}, btn = cardButtonsHTML(p), acts = btn ? `<div class="ds-acts pf-acts">${btn}</div>` : '';
  const info = contractHTML(p).replace(/<div class="section-title">Contract<\/div>/, '');
  if (p.tid === -2) return filePane('con', 'Draft', `<div class="small">${p.draftYear} draft class${p.college ? ' · ' + esc(p.college) : ''}</div>${acts}`);
  if (!(p.tid >= 0 && c.yrs > 0)) return filePane('con', 'Contract', `${info}${acts}`);
  const rows = [], g1 = (c.gtd || 0) / c.yrs;
  for (let i = 0; i < c.yrs; i++) rows.push([state.season + i, i === 0 ? c.amt : c.sched && c.sched[i] !== undefined ? c.sched[i] : c.amt, g1, i === 0 ? 'this year' : '']);
  if (c.next) for (let i = 0; i < c.next.yrs; i++) rows.push([state.season + c.yrs + i, c.next.sched && c.next.sched[i] !== undefined ? c.next.sched[i] : c.next.amt, (c.next.gtd || 0) / c.next.yrs, c.opt5 === 'exercised' && c.next.yrs === 1 ? 'option year' : 'extension']);
  const sum = i => round2(rows.reduce((s, x) => s + x[i], 0));
  const inc = c.inc && c.inc.length ? `<div class="pf-sub">Incentives</div>${c.inc.map(x => `<div class="small" style="margin:3px 0"><span class="pill rook">${fmtMoney(x.amt)}</span> if he ${esc(incLabel(x))} <span class="muted">· ${x.likely ? 'likely: counts this year' : 'not likely: charged next year if earned'}</span></div>`).join('')}` : '';
  const table = `<table class="pf-tbl"><thead><tr><th>Season</th><th class="num">Pay</th><th class="num">Guaranteed</th><th></th></tr></thead><tbody>${rows.map(([y, v, g, n]) => `<tr class="${n === 'this year' ? 'me' : ''}"><td>${y}</td><td class="num">${fmtMoney(v)}</td><td class="num">${g > 0 ? fmtMoney(round2(g)) : '<span class="muted">—</span>'}</td><td class="small muted">${n}</td></tr>`).join('')}
    <tr class="pf-tot"><td>Total</td><td class="num">${fmtMoney(sum(1))}</td><td class="num">${fmtMoney(sum(2))}</td><td></td></tr></tbody></table>`;
  return filePane('con', 'Contract', `${table}<div class="pf-cinfo">${info}</div>${inc}${acts}`, cardDealDocHTML(p) ? `<button class="sm link pf-paper" data-action="filePaper" data-pid="${p.id}">The paper</button>` : '');
}
// his seasons: a split, then a category of the box score, his grades, or his grades game by game
function fileStatsHTML(p) {
  const SPL = [['reg', 'Regular season'], ['po', 'Playoffs'], ['pre', 'Preseason']], sp = SPL.some(x => x[0] === ui.cardScope) ? ui.cardScope : 'reg';
  const rows = sp === 'po' ? [...(p.pcareer || [])] : sp === 'pre' ? [...(p.preCar || [])] : [...(p.career || [])];
  if (sp === 'reg' && p.stats.gp) rows.push(Object.assign({ season: state.season, tid: p.tid, cur: true }, p.stats));
  if (sp === 'po' && p.pstats && p.pstats.gp) rows.push(Object.assign({ season: state.season, tid: p.tid, cur: true }, p.pstats));
  if (sp === 'pre' && p.preS && p.preS.gp) rows.push(Object.assign({ season: p.preS.season || state.season, tid: p.tid, cur: true, snp: p.preS.snp }, p.preS.st));
  const cats = fileGroupsOf(p.pos).filter(([, cols], i) => i === 0 || rows.some(r => cols.some(c => +fileVal(r, c))));
  if (rows.some(stAny)) cats.push(FILE_ST);
  const SHOW = [...cats.map(([n]) => [n, n]), sp === 'reg' ? ['grades', 'Grades by season'] : null, ['games', 'Grades game by game']].filter(Boolean), sh = SHOW.some(x => x[0] === ui.fileShow) ? ui.fileShow : SHOW[0][0];
  const ctl = fileSelect('cardScope', SPL, sp, p.id) + fileSelect('fileShow', SHOW, sh, p.id);
  const club = r => r.tot ? '' : r.tid >= 0 ? T(r.tid).abbr : 'FA', season = r => r.tot ? '<b>Career</b>' : r.season + (r.cur ? '*' : '');
  let html;
  if (sh === 'games') html = gameLogHTML(p) || '<div class="small muted">No graded games yet.</div>';
  else if (!rows.length) html = `<div class="small muted">Nothing on record in the ${SPL.find(x => x[0] === sp)[1].toLowerCase()}.</div>`;
  else if (sh === 'grades') {
    // grades every season, plus how your staff rated him at the end of each year
    const ga = r => r.cur ? (p.advS ? careerAdv(p.advS, p.spot) : {}) : (r.adv || {});
    const OLDF = { pass: 'q', rush: 'run', zone: 'cov' }, gf = (r, f) => ga(r)['g' + f] || (OLDF[f] ? ga(r)['g' + OLDF[f]] : null) || null;
    const fs = Object.keys(FACETS).filter(f => rows.some(r => gf(r, f)));
    html = `<table class="pf-tbl"><thead><tr><th>Season</th><th class="lo">Tm</th><th class="num lo">Snaps</th><th class="num">Overall</th>${fs.map(f => `<th class="num">${FACETS[f]}</th>`).join('')}<th class="lo">Tier</th><th class="lo">Upside</th></tr></thead><tbody>
      ${rows.map(r => `<tr class="${r.cur ? 'me' : ''}"><td>${season(r)}</td><td class="lo">${club(r)}</td><td class="num lo">${r.snp || 0}</td><td class="num">${gradeChip(ga(r).g || null)}${seasonRank(p, r) ? ` <span class="lo">${gradeRankTxt(seasonRank(p, r))}</span>` : ''}</td>${fs.map(f => `<td class="num">${gradeChip(gf(r, f))}</td>`).join('')}
        <td class="lo">${r.cur ? tierPill(p) : r.ti ? `<span class="pill ${TIER_CLS[r.ti] || ''}">${r.ti}</span>` : '<span class="muted">—</span>'}</td><td class="lo">${r.cur ? upsidePill(p) : r.up ? `<span class="pill up ${UP_CLS[r.up] || ''}">${r.up}</span>` : '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table>`;
  } else {
    const [name, cols] = cats.find(x => x[0] === sh) || cats[0], st = name === 'Special teams';
    const use = st ? rows.filter(stAny) : rows, tot = {}; use.forEach(r => { const c = Object.assign({}, r, { season: 0 }); delete c.adv; delete c.sp; addStats(tot, c); }); tot.tot = true;
    const grade = r => r.tot ? '' : st ? gradeChip(stGrade(r)) : sp === 'pre' ? gradeChip(r.cur ? preGrade(p) : null) : sp === 'po' ? '' : gradeChip(r.cur ? (p.advS ? overallGrade(p.advS, p.spot) : null) : r.adv ? r.adv.g : null) + (seasonRank(p, r) ? ` <span class="lo">${gradeRankTxt(seasonRank(p, r))}</span>` : '');
    html = `<table class="pf-tbl"><thead><tr><th>Season</th><th class="lo">Tm</th><th class="num">GP</th><th class="num lo">GS</th><th class="num">Grade</th>${cols.map(c => `<th${fileLo(c)}>${c[1]}</th>`).join('')}</tr></thead><tbody>
      ${[...use, ...(use.length > 1 ? [tot] : [])].map(r => `<tr class="${r.tot ? 'pf-tot' : r.cur ? 'me' : ''}"><td>${season(r)}</td><td class="lo">${club(r)}</td><td class="num">${r.gp || 0}</td><td class="num lo">${r.gs || 0}</td><td class="num">${grade(r)}</td>${cols.map(c => `<td${fileLo(c)}>${round1(fileVal(r, c))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  return filePane('sts', 'Stats', html, ctl);
}
function playerModal(pid, replace) {
  const p = P(pid);
  if (!p) return;
  const prospect = p.tid === -2;
  const body = prospect ? `<div class="pf-panes pro">${filePane('read', 'The read', fileReadHTML(p))}${fileSideHTML(p)}${fileContractHTML(p)}</div>`
    : `<div class="pf-panes">${filePane('read', 'The read', fileReadHTML(p))}${fileSideHTML(p)}${fileContractHTML(p)}${fileStatsHTML(p)}</div>`;
  openModal(`<div class="pfile" style="${fileStyle(p)}">${fileHeadHTML(p)}${body}</div>`, replace);
}

// what your scouts say: phrases, confidence, buzz — never numbers
// how well your staff knows its own man, in words (it knows how much it has seen of him, not how far off it is)
function knowWord(p) { const sd = readSd(p, state.userTid); return sd <= 1.3 ? 'Known well' : sd <= 2.5 ? 'Getting to know him' : 'Still learning him'; }
// the tiers the truth could sit between (your read, give or take its uncertainty), and your position coach's lean on him
function readRangeHTML(p) {
  const u = state.userTid, own = clubOf(p) === u, sd = readSd(p, u), v = uOvr(p), lo = tierOf(p, v - 1.3 * sd), hi = tierOf(p, v + 1.3 * sd);
  let h = lo === hi ? '' : `<div class="sc-note">Could be anywhere from <b>${lo}</b> to <b>${hi}</b>.</div>`;
  if (own && typeof campCoach === 'function') { const c = campCoach(u, cpos(p)), bias = staffLean(p, u);
    if (c && Math.abs(bias) >= 1) h += `<div class="sc-note">His position coach ${bias > 0 ? 'is high on him' : 'is cooler on him'}: ${esc(bias > 0 ? campBiasWhy(c, p) : c.style === 'Teacher' ? 'he wants the young players on the field' : c.style === 'Old school' ? 'he has not earned it the hard way yet' : 'he does not see what the others see')}.</div>`; }
  return h;
}
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

function boxModal(gid, replace) {
  const b = state.games[gid];
  if (!b) { toast('Box score no longer available.'); return; }
  const [h, a] = b.tids;
  const one = !isPhone() ? null : b.tids.includes(ui.boxSide) ? ui.boxSide : b.tids.includes(state.userTid) ? state.userTid : a; // a phone shows one side's players at a time
  const nq = b.ot ? 5 : 4;
  const qh = ['1', '2', '3', '4', 'OT'].slice(0, nq);
  let html = `<div class="muted small">${b.season} · ${b.playoff ? b.playoff : 'Week ' + b.week}${b.pbp && b.pbp.some(e => e.f) ? ` · <button class="link" data-action="watchReplay" data-gid="${b.id}">watch it play by play</button>` : ''}</div>
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
  const sideSw = one === null ? '' : `<div class="seg mbox-side">${[a, h].map(tid => `<button class="${tid === one ? 'on' : ''}" data-action="boxSide" data-gid="${b.id}" data-tid="${tid}">${esc(T(tid).abbr)} players</button>`).join('')}</div>`;
  html += filmRoomHTML(b, one, sideSw);
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
  html += sideSw;
  for (const [name, has, cols, sortv] of cats) {
    if (name === 'Kicking') html += `<h3 style="margin:22px 0 0">Special teams</h3>`;
    html += `<div class="section-title">${name}</div><div class="grid g2">`;
    for (const tid of [a, h]) {
      if (one !== null && tid !== one) continue;
      const rows = lines.filter(x => x.l.tid === tid && has(x.l)).sort((x, y) => sortv(y.l) - sortv(x.l)).slice(0, name === 'Defense' ? 30 : 12); // everyone who recorded a stat
      html += `<div>` + table('bx', [{ k: 'n', l: T(tid).abbr, f: x => playerLink(x.p, true) + ` <span class="muted small">${esc(x.p.lbl)}</span>` }, ...cols.map(([l, f]) => ({ k: l, l, num: 1, f: x => f(x.l) }))], rows, { nosort: 1 }) + '</div>';
    }
    html += '</div>';
  }
  if (b.injuries.length) html += `<div class="section-title">Injuries</div>` + b.injuries.map(i => `<div>${T(i.tid).abbr} — ${playerLink(P(i.pid)) || 'Player'}: ${esc(i.name)} (${i.weeks} wk)</div>`).join('');
  // snap counts
  html += `<details style="margin-top:14px"><summary class="section-title" style="cursor:pointer;display:inline">Snap Counts</summary><div class="grid g2">`;
  for (const tid of [a, h]) {
    if (one !== null && tid !== one) continue;
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
      pb += `<tr><td class="small muted" style="white-space:nowrap">${fmtClock(l.c)} ${typeof l.t === 'number' && T(l.t) ? T(l.t).abbr : ''}</td><td class="small muted" style="white-space:nowrap">${esc(l.dd || '')}</td><td class="small" style="white-space:normal${big ? ';font-weight:600' : ''}">${pbpText(b, l)}</td></tr>`;
    }
    html += `<details style="margin-top:14px"><summary class="section-title" style="cursor:pointer;display:inline">Play-by-Play (${b.pbp.length})</summary><div class="tbl-wrap"><table>${pb}</table></div></details>`;
  }
  html += `<details style="margin-top:14px"><summary class="section-title" style="cursor:pointer;display:inline">Drive Chart (${b.drives.length})</summary>` + table('dr', [
    { k: 'q', l: 'Q', f: d => d.q > 4 ? 'OT' : d.q }, { k: 'c', l: 'Start', f: d => fmtClock(d.clock) }, { k: 't', l: 'Team', f: d => T(d.tid).abbr }, { k: 's', l: 'Field', f: d => d.start },
    { k: 'p', l: 'Plays', f: d => d.plays, num: 1 }, { k: 'y', l: 'Yds', f: d => d.yds, num: 1 }, { k: 'tm', l: 'TOP', f: d => fmtClock(d.time), num: 1 },
    { k: 'r', l: 'Result', f: d => `<span class="${['Touchdown', 'Field Goal'].includes(d.result) ? 'good' : ['Interception', 'Fumble', 'Downs', 'Safety'].includes(d.result) ? 'bad' : 'muted'}">${d.result}</span>` },
  ], b.drives.filter(d => d.plays > 0 || d.result !== 'End of Game'), { nosort: 1 }) + '</details>';
  openModal(html, replace);
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
function filmRoomHTML(b, one, sideSw) { // one: a phone's side, its switch above the grades
  const [h, a] = b.tids, ta = b.tadv || [{}, {}];
  let html = `<div class="section-title">Film Room · Advanced</div><table style="max-width:560px"><thead><tr><th class="num">${T(a).abbr}</th><th></th><th>${T(h).abbr}</th></tr></thead><tbody>`;
  for (const [l, f] of teamAdvRows()) html += `<tr><td class="num">${f(ta[1])}</td><td style="text-align:center" class="muted">${l}</td><td>${f(ta[0])}</td></tr>`;
  html += '</tbody></table>';
  if (!b.adv) return html + '<div class="muted small" style="margin-top:6px">Player grades and charting are kept for your games and the playoffs.</div>';
  html += `${sideSw || ''}<div class="grid g2" style="margin-top:10px">`;
  for (const tid of [a, h]) {
    if (one != null && tid !== one) continue;
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

// ---------- watching a game: every play in two clicks, the line-up first, then what happened ----------
function watchSteps(b) { const out = []; (b.pbp || []).forEach((e, i) => { if (e.f) out.push([i, 0]); out.push([i, 1]); }); return out; }
function watchable() {
  const u = state.userTid; if (state.settings.autoUser) return false;
  if (state.phase === 'REG') return (state.schedule[state.week - 1] || []).some(m => m.h === u || m.a === u);
  if (state.phase === 'PLAYOFFS') { try { return playoffMatchups().some(m => m.includes(u)); } catch (e) { return false; } }
  if (state.phase === 'PRESEASON') return !!(state.pre && preCamped() && state.pre.wk < PRESEASON_GAMES);
  return false;
}
// only the game you are about to watch keeps its line-ups: they are large
function pruneWatch() { pruneWatchFrames(); }
function newestWatchGid() { const u = state.userTid; let best = -1; for (const id in state.games) { const b = state.games[id]; if (b && b.tids.includes(u) && b.pbp && b.id > best && b.pbp.some(e => e.f)) best = b.id; } return best; }
function watchOn() { return !!(view === 'watch' && ui.watch && state.games[ui.watch.gid] && !ui.watch.done); }
const WF_FORM = { SG: 'Shotgun', UC: 'Under center', PI: 'Pistol', EMP: 'Empty' };
// lateral spots on the engine's scale (a lineman is one apart; receivers out near four) become yards across the field
function wfLat(x) { const a = Math.abs(x); return Math.sign(x) * (a <= 2.5 ? a * 3.3 : 8.25 + (a - 2.5) * 6); } // the line is drawn wider than life so every man can be read
// how far behind the ball an offensive man is drawn: linemen and attached ends on the line, flankers and slots a step off it, backs at their depth
function wfOffDepth(name, d) { if (['LT', 'LG', 'C', 'RG', 'RT', 'OL6'].includes(name)) return 0.6; if (['X', 'Y', 'H', 'Y2'].includes(name)) return 0.75; if (['Z', 'SLOT', 'SLOT2'].includes(name)) return 1.8; return name === 'QB' ? Math.max(1.6, d) : Math.max(1.6, d); }
// The field as it lies, the same way round as the strip above it: the home club attacks to the right, the visitors to the left. The
// yard lines are the real ones and the ball moves along them; the offense's right hand is on its right as it faces downfield.
function watchFieldHTML(b, f, e, res, nextE) {
  const u = state.userTid, tid = b.tids[f.o], opp = b.tids[1 - f.o], oc = T(tid).color, dcol = T(opp).color, BACK = 13, AHEAD = 19, SPAN = BACK + AHEAD, HALF = 27;
  const dir = f.o === 0 ? 1 : -1, X = d => (dir === 1 ? BACK + d : AHEAD - d) / SPAN * 100, Y = lat => 50 + dir * wfLat(lat) / HALF * 50;
  const band = (d0, d1, cls, c) => { const a = clamp(X(d0), 0, 100), z = clamp(X(d1), 0, 100); return Math.abs(z - a) < 0.01 ? '' : `<div class="${cls}" style="left:${Math.min(a, z)}%;width:${Math.abs(z - a)}%${c ? ';--c:' + c : ''}"></div>`; };
  const dot = (r, side) => { const p = P(r[0]); if (!p) return ''; const d = side === 'off' ? -wfOffDepth(r[1], r[3] || 0) : Math.max(0.8, r[3] || 0);
    const left = clamp(X(d), 1.5, 98.5), top = clamp(Y(r[2] || 0), 3, 97), lab = side === 'off' ? r[1] : (JOB_SHORT[r[1]] || r[1]);
    return `<div class="wf-dot ${side} ${p.tid === u ? 'mine' : ''}" style="left:${left}%;top:${top}%;--c:${side === 'off' ? oc : dcol}" data-tip="${esc(lab)} · ${esc(pname(p))} (${esc(p.lbl)}, ${p.age})" data-action="player" data-pid="${p.id}"><span>${esc(String(lab).slice(0, 4))}</span></div>`; };
  // the real five-yard lines in view (yards from the offense's own goal line), the mown stripe between every other pair, the end zones
  const first = f.ydl + f.tg >= 100 ? null : f.tg, marks = [];
  for (let m = 5; m <= 95; m += 5) if (m - f.ydl > -BACK && m - f.ydl < AHEAD) marks.push(m);
  let stripes = ''; for (let m = 0; m < 100; m += 10) if (m + 5 - f.ydl > -BACK && m - f.ydl < AHEAD) stripes += band(Math.max(m, f.ydl - BACK) - f.ydl, Math.min(m + 5, f.ydl + AHEAD) - f.ydl, 'wf-band');
  const ends = (f.ydl - BACK < 0 ? band(-BACK, -f.ydl, 'wf-ez', oc) : '') + (f.ydl + AHEAD > 100 ? band(100 - f.ydl, AHEAD, 'wf-ez', dcol) : '');
  let h = `<div class="wf-zoom ${res ? 'res' : ''}">${stripes}${ends}<div class="wf-los" style="left:${X(0)}%"></div>${first !== null ? `<div class="wf-first" style="left:${X(first)}%"></div>` : ''}
    ${marks.map(m => `<div class="wf-yl" style="left:${X(m - f.ydl)}%"><span>${m > 50 ? 100 - m : m}</span></div>`).join('')}
    ${f.off.map(r => dot(r, 'off')).join('')}${f.def.map(r => dot(r, 'def')).join('')}
    <div class="wf-tag off" style="--c:${oc}">${esc(T(tid).abbr)} ${esc(f.pers)} · ${esc(WF_FORM[f.form] || f.form || '')}${f.fm ? ' · ' + esc(f.fm) : ''}</div><div class="wf-tag def" style="--c:${dcol}">${esc(T(opp).abbr)} ${esc({ BASE: 'Base', NICKEL: 'Nickel', DIME: 'Dime', GL: 'Goal line', BIGN: 'Big nickel' }[f.pkg] || f.pkg)}${f.bign ? ' (big)' : ''} · ${esc(f.front)} front</div></div>`;
  return h;
}
// a play's words with every man in them a link to his card: anyone on the field for the snap or with a line in the box score.
// Two men with the same short name in one game are left as plain words: there is no telling which one it was.
function pbpText(b, e) {
  const txt = esc(e.x || (typeof e.t === 'string' ? e.t : '')); if (!txt) return txt; // older saves kept an emergency quarterback's line where the team goes
  const ids = new Set(Object.keys(b.stats || {}).map(Number).filter(id => id >= 0)); if (e.f) for (const r of [...e.f.off, ...e.f.def]) ids.add(r[0]);
  const m = new Map(); for (const id of ids) { const p = P(id); if (!p) continue; const k = esc(pshort(p)); m.set(k, m.has(k) && m.get(k) !== p.id ? null : p.id); }
  const keys = [...m.keys()].filter(k => m.get(k)).sort((x, y) => y.length - x.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!keys.length) return txt;
  return txt.replace(new RegExp('(^|[^A-Za-z])(' + keys.join('|') + ')(?![A-Za-z])', 'g'), (all, pre, nm) => `${pre}<button class="link pbp-p" data-action="player" data-pid="${m.get(nm)}">${nm}</button>`);
}
function watchStripHTML(b, y, poss, firstTo) {
  const h = b.tids[0], a = b.tids[1], bx = poss === 0 ? y : 100 - y, fx = firstTo === null || firstTo === undefined ? null : poss === 0 ? y + firstTo : 100 - y - firstTo;
  const P_ = v => 8.33 + v * 0.8333;
  return `<div class="wf-strip"><div class="wf-ez1" style="--c:${T(h).color}"><span>${esc(T(h).abbr)}</span></div><div class="wf-ez2" style="--c:${T(a).color}"><span>${esc(T(a).abbr)}</span></div>
    ${[10, 20, 30, 40, 50, 60, 70, 80, 90].map(v => `<i style="left:${P_(v)}%"><b>${v > 50 ? 100 - v : v}</b></i>`).join('')}${fx !== null && fx > 0 && fx < 100 ? `<div class="wf-sfirst" style="left:${P_(fx)}%"></div>` : ''}<div class="wf-ball" style="left:${P_(clamp(bx, 0, 100))}%" title="The ball"></div></div>`;
}
function watchHTML() {
  const W = ui.watch, b = W && state.games[W.gid]; if (!b) return '<div class="callout">Nothing to watch.</div>';
  const steps = watchSteps(b), k = clamp(W.k || 0, 0, steps.length - 1), [i, st] = steps[k], e = b.pbp[i], last = k >= steps.length - 1;
  if (last) W.done = true;
  const prevS = i > 0 ? b.pbp[i - 1].s || [0, 0] : [0, 0], sc = st === 0 ? (e.f ? e.f.sc : prevS) : (e.s || prevS), hT = b.tids[0], a = b.tids[1];
  const f = e.f || null, q = st === 0 && f ? f.q : e.q, clock = st === 0 && f ? f.c : e.c, poss = f ? f.o : e.p;
  const big = /TOUCHDOWN|INTERCEPT|FUMBLE|SAFETY|BLOCKED|RETURNS IT|GOOD|sacked|Injury/i.test(e.x || ''), bad = /INTERCEPT|FUMBLE|Injury|BLOCKED|no good|sacked/i.test(e.x || '');
  const team = (tid, s2, side) => `<div class="wsb-t ${poss === side ? 'pos' : ''}" style="--c:${T(tid).color}"><b>${esc(T(tid).abbr)}</b><span class="wsb-s">${s2}</span>${poss === side ? '<i title="Has the ball">●</i>' : ''}</div>`;
  const dd = f ? `${ordinal(f.dn)} & ${f.ydl + f.tg >= 100 ? 'Goal' : f.tg}` : '';
  let h = `<div class="watch"><div class="wsb">${team(a, sc[1], 1)}<div class="wsb-mid"><b>${q > 4 ? 'OT' : 'Q' + q}</b> <span>${fmtClock(clock)}</span>${dd ? `<em>${dd}</em>` : ''}</div>${team(hT, sc[0], 0)}</div>`;
  const y = f ? f.ydl : e.y, firstTo = f ? (f.ydl + f.tg >= 100 ? null : f.tg) : null;
  if (y !== undefined) h += watchStripHTML(b, y, poss, firstTo);
  if (f) h += watchFieldHTML(b, f, e, st === 1);
  else h += `<div class="wf-zoom wf-none"><div>${esc(e.dd || '')}</div></div>`;
  // the card under the field: the look before the snap, what happened after it
  const look = f ? `<b>${esc(T(b.tids[f.o]).abbr)}</b> ${esc(f.pers)} personnel, ${esc(WF_FORM[f.form] || f.form || '')}${f.fm ? ', ' + esc(f.fm) : ''}${f.tags ? ' <span class="muted">(' + esc(f.tags.toLowerCase().replace('pa', 'play-action look').replace('motion', 'motion')) + ')</span>' : ''} <span class="muted">against</span> <b>${esc(T(b.tids[1 - f.o]).abbr)}</b> ${esc({ BASE: 'base', NICKEL: 'nickel', DIME: 'dime', GL: 'goal line' }[f.pkg] || String(f.pkg).toLowerCase())}, ${esc(f.front)} front` : '';
  h += `<div class="wcard ${st === 1 ? 'res' : 'pre'} ${st === 1 && big ? (bad ? 'bad' : 'big') : ''}">${st === 0 ? `<div class="ds-lb">At the line · ${esc(e.dd || dd)}</div><div class="wc-x">${look}</div><div class="small muted">Hover a player to see who he is. Next to run the play.</div>`
    : `<div class="ds-lb">${e.dd ? esc(e.dd) : 'The play'}</div><div class="wc-x">${pbpText(b, e)}</div>`}</div>`;
  h += `<div class="wctl"><button data-action="watchStep" data-d="-1" ${k === 0 ? 'disabled' : ''}>◀ Previous</button><span class="small muted">Play ${b.pbp.slice(0, i + 1).filter(x => x.f).length} · ${st === 0 ? 'before the snap' : 'the result'}${last ? ' · final' : ''}</span>
    <button class="primary" data-action="watchStep" data-d="1" ${last ? 'disabled' : ''}>Next ▶</button><span class="spacer"></span><button data-action="watchDrive">Skip to the next drive</button><button data-action="watchEnd">Skip to the final</button>${last ? `<button class="primary" data-action="watchDone">Box score</button>` : ''}</div>`;
  const recent = []; for (let j = i - (st === 0 ? 1 : 0); j >= 0 && recent.length < 6; j--) recent.push(b.pbp[j]);
  h += `<div class="wlog">${recent.map(x => `<div class="wl-r"><span class="muted">${x.q > 4 ? 'OT' : 'Q' + x.q} ${fmtClock(x.c)}</span><span class="muted">${esc(x.dd || '')}</span><span>${pbpText(b, x)}</span></div>`).join('')}</div>`;
  return h + '</div>';
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
    ${state.phase === 'PRESEASON' ? `<div class="small muted" style="margin-bottom:12px">Exhibition. How long each man plays is set on the depth chart. The result does not count; the film does.</div>` : `<div class="row small" style="margin-bottom:12px"><span>Line: <b>${T(fav).abbr} −${(Math.round(sp * 2) / 2).toFixed(1)}</b></span><span class="muted">·</span><span>Your win chance ≈ <b>${Math.round(pUser * 100)}%</b></span></div>`}
    <div class="grid g2">${side(u)}${side(opp)}</div>
    <div class="row" style="margin-top:14px"><button class="primary" data-action="playGame" data-recap="watch">▶ Watch the game</button><button data-action="playGame" data-recap="1">Quick sim</button><button data-action="playGame" data-recap="0">Sim without recap</button><span class="spacer"></span><button class="sm" data-action="popupsOff">Turn off game popups</button></div>`);
}
function playWeek(recap) { // regular season, playoffs and preseason all go through here
  const before = new Set(Object.keys(state.games)), watch = recap === 'watch' || !!ui.watchIntent; ui.watchIntent = false;
  runSteps(stepContinue, (() => { let n = 0; return () => n++ > 0; })(), phaseLabel).then(() => {
    const keep = newestWatchGid(); pruneWatch(keep);
    if (watch) { const box = Object.values(state.games).find(b => !before.has(String(b.id)) && b.tids.includes(state.userTid) && b.pbp && b.pbp.some(e => e.f)); if (box) { ui.watch = { gid: box.id, k: 0, back: view === 'watch' ? 'home' : view }; view = 'watch'; save(); render(); window.scrollTo(0, 0); return; } }
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
  if (['CUTDOWN', 'WAIVERS'].includes(state.phase)) return false;
  const n = rosterOver(), u = state.userTid, ps = state.settings.autoUser ? 0 : psOverBy(u), nps = psOf(u).length, vets = psOf(u).filter(psVet).length;
  if (!n && !ps) return false;
  const parts = [];
  if (n) parts.push(`You have ${rosterCount(u)} players on a ${rosterLimit()}-man roster. Release, trade or move ${n === 1 ? 'one player' : n + ' players'} to injured reserve or the practice squad.`);
  if (ps) parts.push(nps > PS_MAX ? `Your practice squad has ${nps} players; it holds ${PS_MAX}. Promote or release ${nps - PS_MAX === 1 ? 'one' : nps - PS_MAX}.` : `Your practice squad has ${vets} veterans; it can carry ${PS_VETS}. Promote or release ${vets - PS_VETS === 1 ? 'one' : vets - PS_VETS}.`);
  ask({ title: n ? 'Roster over the limit' : 'Practice squad over the limit', body: parts.join(' ') + ' Do it before you carry on: nobody is cut for you.', yes: 'Go to the roster', no: 'Close' }).then(go => { if (go) { view = 'roster'; render(); } });
  return true;
}

// ---------- actions ----------
const faAct = fn => d => { const pid = +d.pid, was = negMode(P(pid)), err = fn(pid, d); if (err) toast(err); const p = P(pid); if (p && p.tid === state.userTid && was && !negMode(p) && !err) toast('Signed!'); save(); render(); if (ui.faNeg === pid) faNegotiate(pid, true); const lg = document.getElementById('faLog'); if (lg) lg.scrollTop = lg.scrollHeight; };
const actions = {
  faPick: d => { ui.faSel = +d.pid; render(); const lg = document.getElementById('faLog'); if (lg) lg.scrollTop = lg.scrollHeight; const fr = isPhone() && document.querySelector('.fa-right, .px-far'); if (fr) fr.scrollIntoView({ block: 'start' }); }, // a phone jumps to his file
  faGo: d => { ui.faSel = +d.pid; ui.faView = 'now'; ui.faPos = 'ALL'; ui.faF = null; view = 'fa'; closeModal(); render(); },
  faSortA: d => { const c = FA_COLS[d.v] || FA_BASE[d.v], cur = ui.faSort && typeof ui.faSort === 'object' ? ui.faSort : { k: 'ask', d: 1 }; if (!c) return; ui.faSort = cur.k === d.v ? { k: d.v, d: -cur.d } : { k: d.v, d: c[4] || 1 }; render(); },
  faLV: d => { ui.faLV = d.v; render(); },
  faMore: () => { ui.faMore = !ui.faMore; render(); },
  faClear: () => { const q = (ui.faF || {}).q || ''; ui.faF = Object.assign({}, FA_DEF, { q }); render(); },
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
  nav: d => { view = d.view; ui.more = false; ui.mPop = null; ui.rosterTid = null; ui.staffTid = null; ui.pbTid = null; render(); window.scrollTo(0, 0); },
  mPop: d => { ui.mPop = d.h || null; render(); },
  navHead: d => { const h = navTree().find(x => x[0] === d.h); if (!h) return; if (isPhone() && (h[2].length > 1 || h[0] === 'settings')) { ui.mPop = ui.mPop === d.h ? null : d.h; render(); return; } ui.mPop = null; ui.rosterTid = null; ui.staffTid = null; ui.pbTid = null; const last = (ui.navLast || {})[d.h], hot = navHot(), ok = v => h[2].some(y => y[0] === v); view = navHeadOf(view) === d.h && view !== 'club' ? view : ok(hot) ? hot : ok(last) ? last : h[2][0][0]; ui.more = false; render(); window.scrollTo(0, 0); },
  more: () => { ui.more = !ui.more; render(); },
  dchUp: d => { const k = d.key, i = +d.i, list = (ensureChart(state.userTid).lists[k] || []); if (i > 0 && list[i]) { setChart(state.userTid, k, i - 1, list[i]); save(); render(); } },
  newLeague: d => { busy('Building league…'); setTimeout(() => { newLeague(+d.tid); save(); view = 'home'; busy(null); render(); }, 10); },
  continueSave: () => { load().then(ok => { if (ok) render(); else toast('Could not read the saved league.'); }); },
  importClick: () => $('#importFile').click(),
  export: () => exportSave(),
  newGame: async () => { if (await ask({ title: 'Start a new league?', body: 'Your current league will be overwritten. Export it first if you want to keep it.', yes: 'Start over', no: 'Keep this league', danger: true })) { state = null; deleteSave(); render(); } },
  watchGo: async () => { ui.watchIntent = true; await actions.continue(); },
  watchStep: d => { const W = ui.watch, b = W && state.games[W.gid]; if (!b) return; W.k = clamp((W.k || 0) + +d.d, 0, watchSteps(b).length - 1); render(); },
  watchDrive: () => { const W = ui.watch, b = W && state.games[W.gid]; if (!b) return; const steps = watchSteps(b), cur = b.pbp[steps[W.k || 0][0]], who = cur.f ? cur.f.o : cur.p;
    let k = (W.k || 0) + 1; while (k < steps.length - 1) { const e = b.pbp[steps[k][0]]; if (steps[k][1] === 0 && e.f && e.f.o !== who) break; k++; } W.k = k; render(); },
  watchEnd: () => { const W = ui.watch, b = W && state.games[W.gid]; if (!b) return; W.k = watchSteps(b).length - 1; render(); },
  watchDone: () => { const W = ui.watch; view = (W && W.back) || 'home'; if (W) { W.done = true; boxModal(W.gid); } render(); },
  watchReplay: d => { closeModal(); ui.watch = { gid: +d.gid, k: 0, back: view }; view = 'watch'; render(); window.scrollTo(0, 0); },
  continue: async () => {
    if (rosterBlock()) return;
    if (state.phase === 'RESIGN' && !state.settings.autoUser) {
      const n = rosterOf(state.userTid).filter(p => p.expiring).length;
      if (n && !await ask(`${n} expiring player(s) go to the market. You can still re-sign them during the two-day negotiating window, and beat any deal one of them agrees elsewhere before the league year opens. Continue?`)) return;
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
      if (state.phase === 'PRESEASON' && !state.pre) { if (!await ask({ title: 'Open training camp?', body: 'Camp opens with a staff meeting and the reps chart: who works where, and with which string. Nothing is practiced until you say so. Other clubs fill their camp rosters now.', yes: 'Open camp', no: 'Not yet' })) return; startPreseason(); view = 'meeting'; save(); render(); window.scrollTo(0, 0); return; }
      if (state.phase === 'PRESEASON' && state.pre && !preCamped() && !state.settings.autoUser) { campRun(); ui.preTab = 'roster'; ui.rosView = 'pos'; ui.trkSort = { k: 'rank', d: 1 }; view = 'pre'; save(); render(); window.scrollTo(0, 0); return; } // two weeks of camp, then stop and look
      if (state.settings.gamePopups !== false && userMatchup()) { pregameModal(); return; }
      playWeek(false);
    } else { stepContinue(); pruneWatch(newestWatchGid()); save(); render(); if (ui.udfaResult) { const r = ui.udfaResult; ui.udfaResult = null; udfaResultModal(r); } if (ui.wvResult) { const r = ui.wvResult; ui.wvResult = null; waiverResultModal(r); } }
  },
  playGame: d => { closeModal(); ui.watchIntent = false; playWeek(d.recap === 'watch' ? 'watch' : d.recap !== '0'); },
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
  mview: d => { ui.mcards = !d.v; render(); },
  player: d => playerModal(+d.pid),
  team: d => { const tid = +d.tid; modalStack = []; closeModal(); if (tid === state.userTid) view = 'home'; else { ui.clubTid = tid; view = 'club'; } render(); window.scrollTo(0, 0); },
  clubRoster: d => { ui.rosterTid = +d.tid; view = 'roster'; modalStack = []; closeModal(); $('#app').dataset.view = ''; render(); window.scrollTo(0, 0); }, // another club's roster opens at its top
  clubStaff: d => { const tid = +d.tid; ui.staffTid = tid === state.userTid ? null : tid; view = 'coaches'; modalStack = []; closeModal(); render(); window.scrollTo(0, 0); },
  clubTrade: d => { ui.tradeTid = +d.tid; ui.get = { players: [], picks: [] }; view = 'trade'; modalStack = []; closeModal(); render(); window.scrollTo(0, 0); },
  box: d => boxModal(+d.gid),
  boxSide: d => { ui.boxSide = +d.tid; boxModal(+d.gid, true); },
  seasonOpen: d => { ui.seasonYr = d && d.s ? +d.s : null; view = 'season'; closeModal(true); render(); window.scrollTo(0, 0); },
  campTab: d => { ui.preTab = d.tab === 'cut' ? 'cut' : 'roster'; if (d.tab === 'plan') ui.rosView = 'groups'; render(); },
  rosView: d => { ui.rosView = d.v; render(); },
  rosOpen: d => { const m = ui.rosOpen || (ui.rosOpen = {}); m[d.pid] = !m[d.pid]; render(); },
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
  cardScope: d => { ui.cardScope = d.v; playerModal(+d.pid, true); },
  filePaper: d => { const p = P(+d.pid), doc = p ? cardDealDocHTML(p) : ''; if (doc) openModal(`<div class="fa-doc ds-doc pf-doc">${doc}</div>`); },
  cardTab: d => { ui.cardTab = d.v; playerModal(+d.pid, true); },
  protoDepth: d => { ui.protoDepth = +d.v; playerModal(+d.pid, true); },
  preTab: d => { ui.preTab = d.v; render(); },
  meetRole: d => { ui.meetRole = d.v; render(); },
  meetAll: d => { const u = state.userTid, room = d.v; for (const a of repsAdvice(u)) { const p = P(a.pid); if (!p) continue; const rk = preRoomOf(p); if (rk === room) repsToString(a.k, a.pid, a.cs); } save(); render(); },
  preShareReset: () => { const pl = state.prePlan; if (pl) { pl.jobShare = {}; pl.share = {}; pl.dur = {}; } save(); render(); },
  trkSortH: d => { const cur = ui.trkSort && typeof ui.trkSort === 'object' ? ui.trkSort : { k: 'rank', d: 1 }; ui.trkSort = cur.k === d.v ? { k: d.v, d: -cur.d } : { k: d.v, d: 1 }; render(); },
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
  repsGo: d => { ensureReps(); const j = REP_JOB[d.k]; view = 'depth'; ui.scMode = 'prac'; ui.dchTab = j ? j[4] : 'off'; ui.repsJob = d.k; ui.repsPid = +d.pid; ui.dcJob = d.k; ui.dchPid = +d.pid; $('#app').dataset.view = ''; render(); window.scrollTo(0, 0); }, // the practice chart, open at his job with him picked
  scMode: d => { ui.scMode = d.v; render(); },
  scCopy: async d => { const unit = ['off', 'def'].includes(ui.dchTab) ? ui.dchTab : 'def', side = unit === 'off' ? 'offense' : 'defense';
    if (!await ask(d.v === 'g2p' ? `Replace the ${side}'s practice order with its game order?` : `Replace the ${side}'s game order with its practice order? You will be setting the ${side} yourself.`)) return;
    if (d.v === 'g2p') repsFromGame(unit); else gameFromReps(unit); save(); render(); toast('Copied.'); },
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
      const inS = state.phase === 'REG' || state.phase === 'PLAYOFFS', wire = inS && (p.exp < WAIVER_EXP || state.week > TRADE_DEADLINE);
      const where = wire ? ` He goes on waivers: any club can claim him before your next game. If nobody does, he is a free agent${p.age <= PS_AGE && p.pos !== 'K' && p.pos !== 'P' ? ', and you can mark him on the Waiver Wire to sign him to your practice squad if he clears' : ''}.` : inS ? ' He is a free agent right away: any club can sign him.' : '';
      if (!await ask({ title: `Release ${pname(p)}?`, body: (d.now + d.next ? `Dead money: <b>${fmtMoney(d.now)}</b> this year${d.next ? ` and <b>${fmtMoney(d.next)}</b> next year` : ''}.` : 'He comes off your books with no dead money.') + where, yes: 'Release him', no: 'Keep him', danger: true })) return;
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
  elevToggle: d => { const u = state.userTid, id = +d.pid; state.elev = state.elev || {}; const L = state.elev[u] || (state.elev[u] = []), k = L.indexOf(id); if (k >= 0) L.splice(k, 1); else { if (L.length >= ELEV_MAX) { toast(`Only ${ELEV_MAX} a game.`); return; } L.push(id); } save(); render(); },
  promote: d => { const u = state.userTid, err = promoteFromPS(+d.pid, u); toast(err || (activeCount(u) > ROSTER_MAX ? `Promoted to the 53. You are at ${activeCount(u)} of ${ROSTER_MAX}: make a move before your next game.` : 'Promoted to the 53.')); closeModal(); save(); render(); },
  toPS: async d => {
    const p = P(+d.pid), u = state.userTid, why = toPSWhyNot(p, u); if (why) { toast(why); return; }
    const dm = deadIfCut(p), inS = state.phase === 'REG' || state.phase === 'PLAYOFFS', wire = inS && (p.exp < WAIVER_EXP || state.week > TRADE_DEADLINE);
    const full = !psRoom(u, p) ? ` <b>Your squad is full</b>: ${wire ? 'if he clears, he' : 'he'} puts it over (${psOf(u).length + 1} of ${PS_MAX}${psVet(p) && psOf(u).filter(psVet).length >= PS_VETS ? `, or past its ${PS_VETS} veterans` : ''}), and you will have to promote or release someone from it before you can play again.` : '';
    const how = wire ? `To go down he has to be released, and ${p.exp < WAIVER_EXP ? `with ${p.exp} accrued season${p.exp === 1 ? '' : 's'}` : 'after the trade deadline'} he goes on waivers until your next game: <b>any club can claim him</b>. If nobody does, he signs to your practice squad.` : 'He is released and signs straight onto your practice squad.';
    if (!await ask({ title: `Move ${pname(p)} to the practice squad?`, body: how + full + ` He comes off the 53 now and is paid the squad rate (${fmtMoney(PS_SALARY)}).` + (dm.now + dm.next ? ` Dead money from his current deal: <b>${fmtMoney(dm.now)}</b> this year${dm.next ? ` and <b>${fmtMoney(dm.next)}</b> next year` : ''}.` : ''), yes: 'Move him', no: 'Keep him' })) return;
    const err = sendToPS(p.id, u); toast(err || (p.waiver ? `${pname(p)} is on waivers. He joins your practice squad if he clears.` : `${pname(p)} is on your practice squad.`)); closeModal(); save(); render();
  },
  psRelease: d => { releaseFromPS(+d.pid); toast('Released from the practice squad.'); closeModal(); save(); render(); },
  signPS: d => { const err = signToPS(+d.pid, state.userTid); toast(err || 'Signed to the practice squad.'); closeModal(); save(); render(); },
  dcJob: d => { ui.dcJob = d.key; ui.dchPid = null; render(); },
  trTab: d => { ui.trTab = d.v; render(); window.scrollTo(0, 0); },
  newsMore: () => { ui.newsN = (ui.newsN || 60) + 60; render(); },
  dcMove: d => { const k = d.key, pid = +d.pid, to = Math.max(0, +d.to); if (scPrac()) { const l = ensureReps().jobs[k] || [], j = l.indexOf(pid); pracSet(k, j >= 0 && j < to ? to + 1 : to, pid); } else setChart(state.userTid, k, to, pid); save(); render(); }, // a man to a place in a job's order
  dcLook: d => { (ui.dchView = ui.dchView || {})[['def', 'off'].includes(ui.dchTab) ? ui.dchTab : 'def'] = d.v; render(); },
  dcPass: d => { ui.dcPass = d.v; render(); },
  advScope: d => { ui.advScope = d.v; playerModal(+d.pid, true); },
  dcSit: d => { if (d.pid === undefined) { ui.dcSit = d.v; render(); return; } const id = +d.pid, u = state.userTid;
    if (state.phase === 'PRESEASON' && state.prePlan) { const pl = state.prePlan; if (pl.hold[id]) delete pl.hold[id]; else { pl.hold[id] = 1; delete pl.feat[id]; } }
    else { const c = ensureChart(u); c.sit = c.sit || {}; if (c.sit[id]) delete c.sit[id]; else c.sit[id] = 1; }
    T(u).stu = null; save(); render(); },
  dcFm: d => { ui.dcFm = d.k; render(); },
  dcOut: d => { const keep = ui.dchPid; ui.dcOut = +d.pid || null; ui.dchPid = keep || +d.pid || null; render(); },
  dcRemove: d => { if (scPrac()) pracRemoveAt(d.key, +d.i); else setChart(state.userTid, d.key, +d.i, 0); save(); render(); },
  pracStr: d => { ui.pracStr = +d.v; render(); },
  pracReset: d => { repsResetUnit(d.unit); save(); render(); },
  dcAdd: d => { const blocked = !ui.dchAll && chartBlocked(state.userTid, d.key, +d.pid); if (blocked) { toast(blocked); return; } if (scPrac()) { const R2 = ensureReps(); pracSet(d.key, (R2.jobs[d.key] || []).length, +d.pid); save(); render(); return; } const cc = ensureChart(state.userTid); setChart(state.userTid, d.key, (cc.lists[d.key] || []).length, +d.pid); save(); render(); },
  dcOvClear: d => { const tab = ['def', 'off'].includes(ui.dchTab) ? ui.dchTab : 'def', t = T(state.userTid), views = dcViews(t, tab), vid = views.some(v => v.id === (ui.dchView || {})[tab]) ? ui.dchView[tab] : views[0].id; setOverride(state.userTid, tab, vid, ui.dcPass === '1', d.name, 0); save(); render(); },
  dchPick: d => { ui.dchKey = d.key; render(); },
  dchView: d => { (ui.dchView = ui.dchView || {})[ui.dchTab || 'off'] = d.v; render(); },
  dchTab: d => { ui.dchTab = d.tab; ui.dcJob = null; ui.dchPid = null; render(); },
  dchMan: d => { ui.dchPid = +d.pid; render(); }, // the small card on the depth chart follows the man you click
  dchRemove: d => { setChart(state.userTid, d.key, +d.i, 0); save(); render(); },
  dchAdd: d => { const blocked = !ui.dchAll && chartBlocked(state.userTid, d.key, +d.pid); if (blocked) { toast(blocked); return; } const cc = ensureChart(state.userTid); if (cc.auto[CHART_UNIT(d.key)]) setChartAuto(state.userTid, CHART_UNIT(d.key), false); const l = cc.lists[d.key] || []; setChart(state.userTid, d.key, l.length, +d.pid); save(); render(); },
  dchAuto: d => { setChartAuto(state.userTid, d.unit, d.on === '1'); save(); render(); },
  autoCut: () => { const c = autoCut(state.userTid, ROSTER_MAX, false); toast(`Released ${c.length} player(s).`); save(); render(); },
  sign: d => { if (wvOpen()) return actions.wvOffer(d); const err = signFA(+d.pid, state.userTid); if (err) toast(err); else toast('Signed!'); closeModal(); save(); render(); },
  faReset: () => { ui.faF = null; render(); },
  faView: d => { ui.faView = d.v; render(); },
  repMove: d => { moveReps(+d.pid, +d.d); save(); render(); },
  udfaOfferBtn: d => { const err = udfaOffer(+d.pid, d.b === '' ? null : +d.b); if (err) toast(err); save(); playerModal(+d.pid, true); render(); },
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
  wvOffer: d => { const p = P(+d.pid); if ((state.wv.offers || {})[p.id] !== undefined) { waiverOffer(p.id, null); save(); render(); return; }
    const err = waiverOffer(p.id, 0); if (!err) { save(); render(); return; }
    if (/roster is full/.test(err)) { waiverDropModal(p.id, 'offer'); return; } toast(err); },
  wvMDrop: d => waiverDropModal(+d.pid, 'mdrop'),
  iwClaim: d => { const p = P(+d.pid), iw = state.iw || (state.iw = { claims: {}, ps: [] }); if (iw.claims[p.id] !== undefined) { iwClaim(p.id, null); save(); render(); return; }
    const err = iwClaim(p.id, 0); if (!err) { save(); render(); return; } if (/roster is full/.test(err)) { waiverDropModal(p.id, 'iw'); return; } toast(err); },
  iwClaimDrop: d => { const err = iwClaim(+d.pid, +d.drop); if (err) toast(err); closeModal(); save(); render(); },
  iwPS: d => { const iw = state.iw || (state.iw = { claims: {}, ps: [] }), id = +d.pid, i = iw.ps.indexOf(id); if (i >= 0) iw.ps.splice(i, 1); else iw.ps.push(id); save(); render(); },
  wvMDropSet: d => { const wv = state.wv; if (wvPending(+d.pid).some(([, x]) => x === +d.drop)) { toast('That player is already tied to another move'); return; } (wv.mdrop = wv.mdrop || {})[d.pid] = +d.drop; closeModal(); save(); render(); },
  wvOfferDrop: d => { const err = waiverOffer(+d.pid, +d.drop); if (err) toast(err); closeModal(); save(); render(); },
  wvWant: d => { wantForPS(+d.pid, !state.wv.want[d.pid]); save(); render(); },
  futures: d => { const err = signFutures(+d.pid); toast(err || 'Signed to a reserve/future deal.'); save(); render(); },
  preFeat: d => { const pl = state.prePlan, id = +d.pid; if (d.v === 'feat') { pl.feat[id] = 1; delete pl.hold[id]; } else if (d.v === 'hold') { pl.hold[id] = 1; delete pl.feat[id]; } else { delete pl.feat[id]; delete pl.hold[id]; } save(); if (d.card) playerModal(id, true); render(); },
  cutStaff: () => { const prev = cutPreview(state.userTid); state.cut.plan = {}; state.cut.ir = staffIRCalls(state.userTid); prev.cuts.forEach(id => state.cut.plan[id] = 'cut'); save(); render(); },
  cutClear: () => { state.cut.plan = {}; state.cut.ir = {}; save(); render(); },
  cutIR: d => { const c = state.cut, ir = c.ir || (c.ir = {}), pid = +d.pid, p = P(pid);
    if (d.v === 'dtr' && ir[pid] !== 'dtr' && Object.values(ir).filter(v => v === 'dtr').length >= CUT_DTR) { toast(`Only ${CUT_DTR} players can be designated to return at cutdown`); return; }
    if (d.v === 'pup' && !pupEligible(p)) { toast('PUP is only for players hurt before camp'); return; }
    delete c.plan[pid]; if (d.v === 'keep') delete ir[pid]; else if (d.v === 'cut') { delete ir[pid]; c.plan[pid] = 'cut'; } else ir[pid] = d.v;
    save(); render(); },
  cutIRStaff: () => { state.cut.ir = staffIRCalls(state.userTid); for (const id in state.cut.ir) delete state.cut.plan[id]; save(); render(); },
  srchReset: () => { ui.search = Object.assign({}, SEARCH_DEF); render(); },
  rosterPos: d => { ui.rosterPos = d.pos; render(); },
  newsMine: d => { ui.newsMine = d.v === '1'; render(); },
  draftOffer: d => { const err = draftAcceptOffer(+d.i); if (err) toast(err); else { toast('Trade made.'); simDraftToUser(); } save(); render(); },
  draftPick: d => {
    draftPlayer(+d.pid);
    simDraftToUser();
    save(); render();
  },
  fireCoach: async d => { const c = staffCoach(T(state.userTid), d.role); if (!c) return; const owed = owedIfFired(c); if (!await ask({ title: `Let ${cname(c)} go?`, body: owed ? `He is owed <b>${fmtMoney(owed)}</b>, which stays on this year's staff budget.` : 'Nothing is owed on his deal.', yes: 'Let him go', no: 'Keep him', danger: true })) return; const err = userFire(d.role); if (err) toast(err); closeModal(true); save(); render(); },
  searchTab: d => { ui.searchTab = d.tab; render(); },
  searchRole: d => { ui.searchRole = d.role; ui.searchTab = SPEC_ROLES.includes(d.role) ? 'SPEC' : POS_ROLES.includes(d.role) ? 'POS' : d.role; render(); const cs = isPhone() && document.querySelector('.csearch'); if (cs) cs.scrollIntoView({ block: 'start' }); },
  interview: d => { const err = interview(+d.cid, d.role); if (err) toast(err); else { save(); render(); actions.negOpen({ cid: d.cid, role: d.role || C(+d.cid).role }); } },
  raidKeep: d => { toast(answerRaid(+d.i, true)); save(); render(); },
  raidGo: async d => { const r = state.car && state.car.raids[+d.i]; if (!r) return; const c = C(r.cid); if (!await ask({ title: `Let ${cname(c)} go?`, body: `He leaves for ${T(r.tid).abbr} now and his job on your staff opens up.`, yes: 'Let him go', no: 'Not yet', danger: true })) return; toast(answerRaid(+d.i, false)); save(); render(); },
  negOpen: d => { const c = C(+d.cid), role = d.role || c.role; const dm = demandsOf(c, role); ui.neg = { cid: c.id, role, call: dm.call !== 'none' && !(callSide(c, role) && callHeldBy(T(state.userTid), callSide(c, role))), slots: {}, resign: !!dm.resign, sal: dm.sal, yrs: dm.yrs, gtd: dm.gtd }; ui.negOpen = false; negModal(); },
  negAll: d => { const n = ui.neg, t = T(state.userTid); n.slots = {}; if (d.v === '1') for (const g of demandsOf(C(n.cid), n.role).slots) if (!(t.locks && t.locks[g.role] && C(t.locks[g.role]) && C(t.locks[g.role]).tid === t.id)) n.slots[g.role] = g.cid; negModal(); },
  negOffer: () => { const n = ui.neg, err = userHire(n.cid, n); if (err) { toast(err); negModal(); return; } toast('He signed.'); ui.negOpen = false; closeModal(true); save(); render(); },
  reqYes: d => { const err = answerRequest(+d.i, true); if (err) toast(err); save(); render(); },
  reqNo: d => { answerRequest(+d.i, false); save(); render(); },
  coach: d => coachModal(+d.cid),
  film: d => filmModal(+d.gid, +d.pid),
  coachRole: d => { ui.coachRole = d.role; render(); },
  hireCoach: d => { hireCoach(state.userTid, +d.cid); closeModal(); save(); render(); },
  asstPool: d => asstPoolModal(d.role),
  asstHire: d => { const c = C(+d.cid); if (c && c.tid < 0 && isAsst(c)) setAsst(T(state.userTid), c.role, c); closeModal(true); save(); render(); },
  asstPromote: async d => { const c = C(+d.cid);
    if (c && ['OC', 'DC', 'STC'].includes(c.role) && !(await ask({ title: `Make ${cname(c)} your head coach?`, body: `He would want <b>${fmtMoney(promoteHeadCost(c))}</b> a year. His old job opens up.${c.role === 'STC' ? ' He has never called plays: your coordinators keep the call sheets and he runs the game and the building.' : ' He keeps his side of the ball and may keep the play sheet.'} What kind of head coach he turns out to be is not known until he does the job.`, yes: 'Promote him', no: 'Not now' }))) return;
    const err = userPromote(+d.cid); if (err) toast(err); closeModal(true); save(); render(); },
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
  fileOpt: (v, el) => { ui[el.dataset.k] = v; playerModal(+el.dataset.pid, true); },
  dotSet: v => { T(state.userTid).dot = +v; save(); },
  eqbSet: v => { T(state.userTid).eqb = +v; save(); },
  faIncM: (v, el) => { const p = P(+el.dataset.pid); faIn(p).inc[+el.dataset.i].m = v; setTimeout(() => { if (ui.faNeg === p.id) faNegotiate(p.id, true); }, 0); },
  rosterTeam: v => { ui.rosterTid = +v; $('#app').dataset.view = ''; }, // and opens at its top
  rosterView: v => { ui.rosterView = v; },
  msort: (v, el) => { sortState[el.dataset.table] = { k: v, dir: -1 }; },
  negCall: (v, el) => { ui.neg.call = el.checked; negModal(); },
  negSlot: (v, el) => { if (el.checked) ui.neg.slots[el.dataset.role] = +el.dataset.g; else delete ui.neg.slots[el.dataset.role]; negModal(); },
  negResign: (v, el) => { ui.neg.resign = el.checked; negModal(); },
  negSal: v => { ui.neg.sal = Math.max(0.1, +v || 0.1); negModal(); },
  negYrs: v => { ui.neg.yrs = +v; ui.neg.gtd = Math.min(ui.neg.gtd, ui.neg.yrs); negModal(); },
  negGtd: v => { ui.neg.gtd = +v; negModal(); },
  preStarters: v => { state.prePlan.starters = v; save(); },
  dcDur: (v, el) => { const pl = state.prePlan; if (!pl) return; const k = el.dataset.key, u = state.userTid, c = ensureChart(u), un = CHART_UNIT(k); if (c.auto[un]) setChartAuto(u, un, false); (pl.dur = pl.dur || {})[k] = pl.dur[k] || {}; pl.dur[k][+el.dataset.pid] = v; save(); },
  preJob: (v, el) => { const pl = state.prePlan; if (!pl) return; pl.jobShare = pl.jobShare || {}; if (+v < 0) delete pl.jobShare[el.dataset.key]; else pl.jobShare[el.dataset.key] = +v; save(); },
  preShare: (v, el) => { const pl = state.prePlan; pl.share = pl.share || {}; if (+v < 0) delete pl.share[el.dataset.pos]; else pl.share[el.dataset.pos] = +v; save(); },
  workSet: (v, el) => { setWork(+el.dataset.pid, el.dataset.part, v); save(); if (el.dataset.card) playerModal(+el.dataset.pid, true); },
  xtSet: (v, el) => { setCrossTrain(+el.dataset.pid, v || null); save(); if (el.dataset.card) playerModal(+el.dataset.pid, true); render(); },
  udfaOffer: (v, el) => { const err = udfaOffer(+el.dataset.pid, v === '' ? null : +v); if (err) toast(err); save(); render(); },
  faLV: v => { ui.faLV = v; },
  faF: (v, el) => { (ui.faF || (ui.faF = Object.assign({}, FA_DEF)))[el.dataset.f] = v; },
  faChk: (v, el) => { (ui.faF || (ui.faF = Object.assign({}, FA_DEF)))[el.dataset.f] = el.checked; },
  srch: (v, el) => { (ui.search || (ui.search = Object.assign({}, SEARCH_DEF)))[el.dataset.f] = v; },
  srchChk: (v, el) => { (ui.search || (ui.search = Object.assign({}, SEARCH_DEF)))[el.dataset.f] = el.checked; },
  staffTeam: v => { ui.staffTid = +v; $('#app').dataset.view = ''; }, // and opens at its top
  statSeason: v => { ui.statSeason = +v; },
  statTeam: v => { ui.statTeam = v === '' ? null : +v; },
  tradeTeam: v => { ui.tradeTid = +v; ui.get = { players: [], picks: [] }; },
  histTeam: v => { ui.histTid = +v; },
  seasonPick: v => { ui.seasonYr = +v; },
  schedYr: v => { ui.schedYr = +v; ui.schedWeekA = 1; },
  planNew: (v, el) => { planNew(el.dataset.room, v); save(); },
  planName: (v, el) => { const g = planGroup(+el.dataset.gid), n = String(v || '').trim().slice(0, 40); if (g && n) g.name = n; save(); },
  repsAdd: (v, el) => { if (!v) return; const e = repsAdd(el.dataset.k, +v); if (e) toast(e); else ui.repsHi = +v; save(); render(); },
  repsAlso: (v, el) => { if (!v) return; const e = repsAdd(v, +el.dataset.pid); if (e) toast(e); save(); render(); },
  trkSort: v => { ui.trkSort = { k: v || 'rank', d: 1 }; render(); },
  planAdd: (v, el) => { if (v === 'other') { ui.planOther = +el.dataset.gid; return; } if (v) planAdd(+el.dataset.gid, +v); save(); },
  autoUser: (v, el) => { state.settings.autoUser = el.checked; save(); toast(el.checked ? 'Auto-manage on.' : 'Auto-manage off.'); },
  showTrue: (v, el) => { state.settings.showTrue = el.checked; save(); },
  gamePopups: (v, el) => { state.settings.gamePopups = el.checked; save(); },
  theme: v => { state.settings.theme = v; save(); },
  dch: (v, el) => { setChart(state.userTid, el.dataset.key, +el.dataset.i, v ? +v : 0); save(); },
  dchAll: (v, el) => { ui.dchAll = el.checked; },
  mkAct: (v, el) => { const f = actions[el.dataset.act]; if (f) f({ [el.dataset.key || 'v']: v }, el); }, // a phone's dropdown runs the page's own action
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
const dcTarget = e => e.target.closest && (e.target.closest('[data-dcov]') || e.target.closest('[data-dci]') || e.target.closest('[data-dcjob]'));
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
  if (scPrac()) { if (!REP_JOB[key]) { render(); return; } const R2 = ensureReps(); pracSet(key, t.dataset.dci !== undefined ? +t.dataset.dci : (R2.jobs[key] || []).length, d.pid); save(); render(); return; } // the practice order
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
  if (e.target.closest('#mksheet')) { rowMenuClick(e); return; }
  if (Date.now() - mkDragEnd < 400) { e.preventDefault(); return; } // the click that ends a drag is not a tap
  if (!mkPass && isPhone()) {
    const r = e.target.closest('.mk-row'); if (r && !e.target.closest('select, input, textarea, label')) { e.preventDefault(); rowMenu(r); return; }
    const sb = e.target.closest('.pagehead .sub, .mclip, .mclamp, main p.small.muted'); if (sb && !e.target.closest('button, a, select')) sb.classList.toggle('open');
  }
  if (window.matchMedia && window.matchMedia('(hover: none)').matches && !e.target.closest('button, select, input, a, [data-action]')) { const tt = e.target.closest('[title], [data-tip]'), tx = tt && (tt.getAttribute('title') || tt.dataset.tip); if (tx) toast(tx); }
  if (navPressed && e.target.closest('[data-action="nav"]')) { navPressed = null; return; }
  navPressed = null;
  const el = e.target.closest('[data-action]');
  if (!el) return;
  { const f = e.target.closest('select, textarea, option, input:not([type="checkbox"]):not([type="radio"])'); if (f && !f.dataset.action && el.contains(f)) return; } // a dropdown or text box inside a clickable row is for typing and choosing; a tick box is the row
  const fn = actions[el.dataset.action];
  if (fn) { e.preventDefault(); try { fn(el.dataset, el); } catch (err) { showError(err, 'handling ' + el.dataset.action); } } // caught here, the real message shows (an uncaught one from a page opened as a file reads only "Script error")
});
// numbers typed into the sit-down are kept without redrawing the page (a redraw between the keystroke and the click would eat the click)
document.addEventListener('input', e => {
  const el = e.target.closest && e.target.closest('[data-fain]'); if (!el || !state) return;
  const p = P(+el.dataset.pid); if (!p) return; const i = faIn(p), f = el.dataset.fain, v = el.value === '' ? 0 : +el.value;
  if (f.startsWith('inc')) { const x = (i.inc || [])[+f.slice(3)]; if (x) x.amt = v; } else i[f] = v;
  if (ui.faNeg === p.id) for (const [id, fn] of [['faHead', faHeadHTML], ['faDoc', faDocHTML], ['faCap', faCapTableHTML]]) { const n = document.getElementById(id); if (n) n.innerHTML = fn(p); } // the contract rewrites itself as you type
});
document.addEventListener('change', e => {
  if (e.target.mkBtns) { const b = e.target.mkBtns[+e.target.value]; if (b) b.click(); return; } // a phone's dropdown stands in for a row of buttons
  const el = e.target.closest('[data-change]');
  if (!el) return;
  const fn = changes[el.dataset.change];
  if (fn) { try { fn(el.value, el); render(); } catch (err) { showError(err, 'handling ' + el.dataset.change); } }
});
document.addEventListener('toggle', e => { const el = e.target; if (el && el.dataset && el.dataset.fold) (ui.fold || (ui.fold = {}))[el.dataset.fold] = el.open; if (el && el.open && el.tagName === 'DETAILS') phoneKit(el); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if ($('#mksheet') && !$('#mksheet').classList.contains('hidden')) $('#mksheet').classList.add('hidden'); else if (askResolve) askDone(false); else closeModal(); } });
document.addEventListener('keydown', e => { if (!state || view !== 'watch' || !ui.watch || document.querySelector('.modal-card') || /INPUT|SELECT|TEXTAREA/.test((e.target && e.target.tagName) || '')) return; if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { actions.watchStep({ d: e.key === 'ArrowRight' ? 1 : -1 }); e.preventDefault(); } });
document.addEventListener('keydown', e => { // ← → walks the rooms of the squad planner
  if (!state || !['pre', 'camp', 'cutdown'].includes(view) || !preOpen() || preTabNow() !== 'roster' || ui.rosView !== 'groups' || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
  const tg = e.target; if (tg && tg.closest && tg.closest('input, select, textarea')) return;
  if (!$('#modal').classList.contains('hidden') || askResolve) return;
  actions.campRoomStep({ dir: e.key === 'ArrowLeft' ? -1 : 1 }); e.preventDefault();
});
document.addEventListener('keydown', e => { // ← → walks the staff, card to card, while one of its men's cards is open
  if (!state || view !== 'coaches' || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || (e.target.closest && e.target.closest('input, select, textarea')) || $('#modal').classList.contains('hidden') || modalStack.length) return;
  const list = staffList(T(ui.staffTid == null ? state.userTid : ui.staffTid)), i = list.findIndex(c => c.id === ui.cardCid); if (i < 0) return;
  e.preventDefault(); coachModal(list[(i + (e.key === 'ArrowRight' ? 1 : list.length - 1)) % list.length].id, true);
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
// ---- phones: a man dragged up or down a job's order by the handle on his row (touch has no drag and drop) ----
let mkDrag = null;
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', e => {
    const h = e.target.closest && e.target.closest('[data-reo]'); if (!h || !isPhone()) return;
    const row = h.closest('.mrow'); if (!row) return;
    mkDrag = { row, y0: e.clientY, rows: [...row.parentElement.querySelectorAll(':scope > .mrow[data-i]')], moved: false };
    try { h.setPointerCapture(e.pointerId); } catch (x) { /* nothing to capture */ }
  });
  document.addEventListener('pointermove', e => {
    if (!mkDrag) return; const dy = e.clientY - mkDrag.y0;
    if (!mkDrag.moved && Math.abs(dy) < 6) return;
    mkDrag.moved = true; mkDrag.row.classList.add('mdrag'); mkDrag.row.style.transform = `translateY(${dy}px)`; e.preventDefault();
  });
  const mkDrop = e => {
    const d = mkDrag; mkDrag = null; if (!d || !d.moved) return;
    d.row.style.transform = ''; d.row.classList.remove('mdrag'); mkDragEnd = Date.now();
    const to = d.rows.filter(r => r !== d.row && e.clientY > r.getBoundingClientRect().top + r.offsetHeight / 2).length; // the rows whose middle he passed
    if (to !== +d.row.dataset.i) actions.dcMove({ key: d.row.dataset.key, pid: d.row.dataset.pid, to });
  };
  document.addEventListener('pointerup', mkDrop); document.addEventListener('pointercancel', mkDrop);
}
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
