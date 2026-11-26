// =====================================================================
//  THE PLAYERS TAB
//  Free agents, trades, the player search, the draft and the waiver wire: your front office's business with the rest of
//  the league. Each is one sheet in the club pages' language and in your club's colors: the band with what matters now,
//  the figures, a bar with the page's choices, then ruled panes (the list on one side, the man or the deal on the other).
//  Every control the old pages had is here; the names, clubs and picks are links.
// =====================================================================
const pxMast = (title, over, big, place) => ({ tid: state.userTid, title, over: `${esc(T(state.userTid).abbr)} · ${over}`, wm: T(state.userTid).abbr, big, place });
const pxFamTabs = (counts) => [['ALL', 'All', counts ? counts.ALL : null], ...FAMILIES.map(([k]) => [k, k === 'Interior DL' ? 'IDL' : k, counts ? counts[k] || 0 : null, k === 'Interior DL' ? 'Interior defensive line' : ''])];
const pxFamCounts = list => { const c = { ALL: list.length }; for (const p of list) { const f = FAMILIES.find(x => x[1].includes(p.spot)); if (f) c[f[0]] = (c[f[0]] || 0) + 1; } return c; };
const pxPosSel = (change, cur) => lgSel('', change, [['ALL', 'All positions'], ...FAMILIES.map(([k]) => [k, k])], cur || 'ALL', 'Position');
// his position in a tag the color of his unit
function pxPos(p) { const s = SPOTS[p.spot] ? SPOTS[p.spot].side : '', u = s === 'off' ? 'o' : s === 'def' ? 'd' : 's'; return `<span class="rs-pc u-${u}" title="${esc(JOB_NAME[p.spot] || p.lbl)}">${esc(p.lbl === 'Outside WR' ? 'X/Z' : p.lbl)}</span>`; }
const pxSec = (title, body, cls) => `<div class="px-sec${cls ? ' ' + cls : ''}"><div class="px-sh">${title}</div>${body}</div>`;
const pxRibbon = (label, body, cls) => `<div class="cl-notice px-rib${cls ? ' ' + cls : ''}"><b>${label}</b><span>${body}</span></div>`;

// ---------- free agents ----------
function faHTML() {
  const u = state.userTid, udfa = state.phase === 'UDFA' && state.udfa, on = faMarketOn(), com = on ? faCommitted(u) : { amt: 0, n: 0 };
  const fv = ui.faView && (ui.faView !== 'udfa' || udfa) ? ui.faView : udfa ? 'udfa' : 'now';
  const views = [...(udfa ? [['udfa', 'Undrafted rookies']] : []), ['now', udfa ? 'Veterans' : 'Available now'], ['next', 'Upcoming free agents']];
  const when = on && faTampering() ? `The negotiating window · day ${state.fa.day + 1} of ${FA_TAMPER}` : on ? `Free agency · day ${state.fa.day + 1} of ${FA_DAYS}` : udfa ? `Rookie free agency · round ${state.udfa.round + 1} of ${UDFA_ROUNDS}` : state.phase === 'REG' ? `Week ${state.week} · in-season signings are one-year deals` : esc(PHASE_LABEL[state.phase] || state.phase);
  const pool = Object.values(state.players).filter(p => p.tid === -1 && !p.waiver && !(udfa && isUdfa(p))), best = pool.slice().sort((a, b) => tierSort(b) - tierSort(a))[0];
  const figs = [lgFig('Cap room', `<span class="${capRoom(u) < 0 ? 'bad' : ''}">${fmtMoney(capRoom(u))}</span>`),
    on ? lgFig('In live offers', `<span class="${com.amt > capRoom(u) ? 'bad' : ''}">${fmtMoney(com.amt)}</span>`, `${com.n} offer${com.n === 1 ? '' : 's'}`) : null,
    udfa ? lgFig('Offers out', Object.keys(state.udfa.offers).length, fmtMoney(Object.values(state.udfa.offers).reduce((a, b) => a + MIN_SALARY + b, 0))) : null,
    lgFig('Roster', `${rosterCount(u)}<small>/ ${rosterLimit()}</small>`), lgFig('Practice squad', `${psOf(u).length}<small>/ ${PS_MAX}</small>`),
    lgFig('On the market', pool.length, '', 'Veterans without a club'), lgFig('Best available', best ? `${playerLink(best, true)}` : '—', best ? `${esc(best.lbl)} · ${tierOf(best)}` : '')].filter(Boolean);
  const right = (fv === 'udfa' && Object.keys(state.udfa.offers).length ? lgSel('', 'pxUdfaMine', [['', 'The whole class'], ['1', `My offers (${Object.keys(state.udfa.offers).length})`]], ui.udfaMine ? '1' : '') : '') + (fv === 'udfa' && ui.udfaMine ? '' : pxPosSel('pxFaPos', ui.faPos));
  const mast = pxMast('Free agents', `${state.season} · ${when}`, fmtMoney(capRoom(u)), on ? `cap room · ${fmtMoney(com.amt)} in ${com.n} live offer${com.n === 1 ? '' : 's'}` : 'cap room');
  const bar = lgBarHTML(views, fv, 'faView', right);
  if (fv === 'next') return lgSheet('px px-fa', mast, figs, bar, upcomingFAHTML());
  if (fv === 'udfa') return lgSheet('px px-fa', mast, figs, bar, udfaHTML());
  // the news from the market and your offers in it
  const live = on ? Object.keys(state.fa.off).map(id => P(+id)).filter(p => p && faOffers(p).some(o => o.tid === u)) : [];
  const rib = live.length || (on && state.fa.inbox.length) ? `<div class="px-news">${live.length ? `<div class="px-live"><span class="dk-k">Your offers</span>${live.map(p => { const o = faOffers(p).find(x => x.tid === u); return `<button class="px-chip" data-action="faPick" data-pid="${p.id}" title="Select him">${esc(pshort(p))} · ${fmtMoney(o.aav)} × ${o.yrs}${o.night ? ' · answer tomorrow' : o.dl ? ' · tonight' : ''}</button>`; }).join('')}</div>` : ''}
    ${on && state.fa.inbox.length ? `<div class="px-inbox"><span class="dk-k">The market</span><div class="px-ib">${state.fa.inbox.slice(-5).map(x => `<div title="${esc(x)}">${clLinkNames(x)}</div>`).join('')}</div><button class="link" data-action="faInboxX">Clear</button></div>` : ''}</div>` : '';
  return lgSheet('px px-fa', mast, figs, bar, rib + faMarketHTML());
}
// the market: the list, and the man you picked
function faMarketHTML() {
  const u = state.userTid, on = faMarketOn(), udfa = state.phase === 'UDFA' && state.udfa;
  let fas = Object.values(state.players).filter(p => p.tid === -1 && !p.waiver && !(udfa && isUdfa(p)) && inFamily(p, ui.faPos));
  const f = ui.faF || (ui.faF = Object.assign({}, FA_DEF)), tIdx = x => TIER_ORDER.indexOf(x), uIdx = x => UPSIDE_ORDER.indexOf(x), com = on ? faCommitted(u) : { amt: 0, n: 0 };
  ui._tick = (ui._tick || 0) + 1;
  if (f.q) { const q = f.q.toLowerCase(); fas = fas.filter(p => (p.first + ' ' + p.last).toLowerCase().includes(q)); }
  if (f.tier) fas = fas.filter(p => tIdx(tierOf(p)) <= tIdx(f.tier) || (f.tier === 'Rotation' && tierOf(p) === 'Backup'));
  if (f.up) fas = fas.filter(p => uIdx(upsideOf(p)) >= 0 && uIdx(upsideOf(p)) <= uIdx(f.up));
  if (f.ageMax) fas = fas.filter(p => f.ageMax === '31+' ? p.age >= 31 : p.age <= +f.ageMax);
  if (f.exp) fas = fas.filter(p => f.exp === 'young' ? p.exp <= 2 : f.exp === 'prime' ? p.exp >= 3 && p.exp <= 7 : p.exp >= 8);
  if (f.maxAsk) fas = fas.filter(p => faSortVal(p) <= +f.maxAsk);
  if (f.afford) fas = fas.filter(p => faSortVal(p) <= capRoom(u) - com.amt);
  if (f.mine && on) fas = fas.filter(p => state.fa.talks[p.id] || state.fa.orders[p.id] || faOffers(p).some(o => o.tid === u));
  if (f.played) fas = fas.filter(p => (faLast(p).gp || 0) > 0);
  if (f.start) fas = fas.filter(p => faRankFor(p)[0] <= (STARTERS[p.pos] || 1));
  if (f.fits) fas = fas.filter(p => schemeFit(p, u) >= 1);
  if (f.ps) fas = fas.filter(p => p.exp <= 6 && psRoom(u, p));
  const total = fas.length, LV = FA_LVIEWS.find(x => x[0] === ui.faLV) || FA_LVIEWS[0], lv = LV[0];
  // any column sorts: click its name; click again to turn it round
  const so = ui.faSort && typeof ui.faSort === 'object' && (FA_COLS[ui.faSort.k] || FA_BASE[ui.faSort.k]) && (FA_BASE[ui.faSort.k] || LV[2].includes(ui.faSort.k)) ? ui.faSort : { k: 'ask', d: 1 };
  { const C = FA_COLS[so.k] || FA_BASE[so.k], val = C[2], none = v => v === undefined || v === null || (typeof v === 'number' && isNaN(v));
    fas.sort((a, b) => { const x = val(a), y = val(b); if (none(x) || none(y)) return none(x) ? (none(y) ? 0 : 1) : -1; return (typeof x === 'string' ? y.localeCompare(x) * -1 : y - x) * (typeof x === 'string' ? -so.d : so.d) || uOvr(b) - uOvr(a); }); }
  fas = fas.slice(0, 150);
  let sel = ui.faSel !== undefined ? P(ui.faSel) : null; if (!sel || sel.tid !== -1 || sel.waiver) sel = fas[0] || null;
  const hd = (k, l, cls, title) => `<span class="fa-h ${cls || ''} ${so.k === k ? 'on' : ''}" data-action="faSortA" data-v="${k}" title="${esc(title || '')}${title ? ' · ' : ''}click to sort">${l}${so.k === k ? `<i>${so.d > 0 ? '▼' : '▲'}</i>` : ''}</span>`;
  const sel1 = (key, opts) => `<select data-change="faF" data-f="${key}" class="${f[key] ? 'set' : ''}">${opts.map(([v, l]) => `<option value="${v}" ${String(f[key] || '') === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const chk = (key, l, title) => `<label class="small fa-chk ${f[key] ? 'set' : ''}" title="${esc(title || '')}"><input type="checkbox" data-change="faChk" data-f="${key}" ${f[key] ? 'checked' : ''}> ${l}</label>`;
  const nF = FA_FILTERS.filter(k => f[k]).length, cols = LV[2].map(k => FA_COLS[k][1]).join(' ');
  const filters = ui.faMore ? `<div class="fa-filters">
      ${sel1('tier', [['', 'Any tier'], ...['Elite', 'All-Pro', 'Starter', 'Rotation', 'Depth'].map(t => [t, t + ' or better'])])}
      ${sel1('up', [['', 'Any upside'], ...UPSIDE_ORDER.slice(0, 4).map(t => [t, t + ' or better'])])}
      ${sel1('ageMax', [['', 'Any age'], ['24', '24 and under'], ['27', '27 and under'], ['30', '30 and under'], ['31+', '31 and over']])}
      ${sel1('exp', [['', 'Any experience'], ['young', 'First three seasons'], ['prime', 'Four to eight seasons'], ['vet', 'Nine seasons or more']])}
      ${sel1('maxAsk', [['', 'Any price'], ['1', 'Up to $1M'], ['3', 'Up to $3M'], ['8', 'Up to $8M'], ['15', 'Up to $15M']])}
      ${chk('afford', 'I can afford', 'Fits under your cap with your live offers counted')}${chk('start', 'Would start for me', 'Your staff rates him above a man who starts for you now')}${chk('fits', 'Fits my scheme')}${chk('played', 'Played last season')}${chk('ps', 'Practice-squad eligible')}${on ? chk('mine', 'I am in on him', 'You have talked, made an offer or sent your front office') : ''}</div>` : '';
  const list = `<section class="lg-pane px-fal"><div class="lg-ph px-fab"><input type="text" data-change="faF" data-f="q" value="${esc(f.q)}" placeholder="Name…" class="px-q">
      <select data-change="faLV" title="What the list shows">${FA_LVIEWS.map(([k, l]) => `<option value="${k}" ${lv === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button class="sm ${ui.faMore || nF ? 'on' : ''}" data-action="faMore">Filters${nF ? ` · ${nF}` : ''} ${ui.faMore ? '▴' : '▾'}</button>${nF ? `<button class="sm" data-action="faClear" title="Remove every filter">Clear</button>` : ''}<span class="lg-pn">${fas.length} of ${total}</span></div>${filters}
    <div class="lg-pb px-fasx"><div class="fa-sx"><div class="fa-row fa-head" style="--fa-cols:${cols}">${hd('pos', 'Pos')}${hd('name', 'Name')}${hd('age', 'Age')}${LV[2].map(k => FA_COLS[k][2] ? hd(k, FA_COLS[k][0], FA_COLS[k].num ? 'fa-num' : '', FA_COLS[k][5]) : `<span>${FA_COLS[k][0]}</span>`).join('')}</div>
    <div class="fa-list" style="--fa-cols:${cols}">${fas.map(p => `<div class="fa-row ${sel && sel.id === p.id ? 'on' : ''}" data-action="faPick" data-pid="${p.id}">
      <span class="fa-pos">${pxPos(p)}</span><span class="fa-name">${playerLink(p)}</span><span class="fa-age muted">${p.age}</span>${LV[2].map(k => `<span class="${FA_COLS[k].num ? 'fa-num' : 'fa-c'}">${FA_COLS[k][3](p)}</span>`).join('')}</div>`).join('') || '<div class="lg-none">Nobody matches.</div>'}</div></div></div>
    <div class="px-foot">Click a row to see him, a name for his file, a heading to sort.</div></section>`;
  return `<div class="lg-body px-fab2">${list}<section class="lg-pane px-far"><div class="lg-pb">${sel ? faCardHTML(sel) : '<div class="lg-none">No free agents.</div>'}</div></section></div>`;
}
// the man you picked: who he is, the deal, where he fits, the report, what he did, where he plays, his body
function faCardHTML(p) {
  const u = state.userTid, mk = faInMarket(p), last = p.career[p.career.length - 1], st = faStatus(p), src = cardAdv(p), canSign = state.phase !== 'PLAYOFFS' && state.phase !== 'RECAP';
  const kv = [['Tier', tierPill(p)], ['Upside', upsidePill(p)], [mk ? 'Expected' : 'Asking', `<b>${faExpTxt(p)}</b> a year`], [mk ? 'Market' : 'Status', `<span class="${st[1]}">${esc(st[0])}</span>`],
    [last && last.gp ? `${last.season}` : 'Last season', last && last.gp ? `${last.gs || 0} starts ${gradeChip(last.adv ? last.adv.g : null)}` : '<i class="muted">Did not play</i>']];
  const deal = mk ? pxSec('The sit-down', faSitHTML(p), 'px-deal')
    : pxSec('Sign him', `<div class="px-note">${state.phase === 'FA' ? 'No agent meeting for a contract this small.' : state.phase === 'REG' ? 'In-season signings are one-year deals.' : 'Available now at his asking price.'}</div>
      <div class="px-btns">${wvOpen() ? wvFaButtons(p, true) : canSign ? `<button class="primary" data-action="sign" data-pid="${p.id}" ${p.ask > capRoom(u) ? 'disabled title="Not enough cap space"' : ''}>Sign (${fmtMoney(p.ask)}, ${state.phase === 'REG' ? 1 : contractYears(p)} yr)</button>` : ''}
      ${!wvOpen() && p.exp <= 6 && psRoom(u, p) && ['REG', 'PRESEASON', 'CUTDOWN', 'DRAFT', 'FA'].includes(state.phase) ? `<button data-action="signPS" data-pid="${p.id}">Practice squad (${fmtMoney(PS_SALARY)})</button>` : ''}</div>`, 'px-deal');
  return `<div class="px-card"><div class="dk-ch">${pxPos(p)}<b class="dk-cn">${playerLink(p)}</b>${statusPills(p)}<span class="spacer"></span><button class="link" data-action="player" data-pid="${p.id}">His file ›</button></div>
    <div class="dk-bio">${esc(JOB_NAME[p.spot] || p.lbl)} · age ${p.age} · ${p.exp} yr${p.exp === 1 ? '' : 's'} · ${fmtHeight(p.m.ht)}, ${p.m.wt} · ${p.lastTid != null && p.lastTid >= 0 ? 'last with ' + teamLink(p.lastTid) : 'no club last year'}${p.lastAmt ? ` at ${fmtMoney(p.lastAmt)}/yr` : ''}${mk ? ` · agent ${agentLink(agentOf(p))}` : ''}</div>
    <div class="pr-kv">${kv.map(([k, v]) => `<span class="dk-k">${k}</span><span>${v}</span>`).join('')}</div>
    ${deal}${pxSec('Where he fits', faFitHTML(p))}${pxSec('The report', `<div class="px-read">${esc(scoutProfile(p))}.</div>${strengthsHTML(p)}`)}
    ${pxSec(`Production${src ? ` · ${src.season}${src.cur ? ' to date' : ''}` : ''}`, `${last && last.gp ? `<div class="px-line">${statSummary(last, p.pos)}</div>` : ''}${glanceHTML(p, src)}${p.career.length > 1 ? `<div class="px-note">${p.career.slice(-4, -1).reverse().map(r => `${r.season}: ${r.gs || 0} starts${r.gp ? ', ' + statSummary(r, p.pos) : ''}`).join('<br>')}</div>` : ''}`)}
    ${pxSec('Where he can play', comfortHTML(p))}${devPanelHTML(p) ? pxSec('Upside', devPanelHTML(p)) : ''}
    ${pxSec(`Physical${rasOf(p) === null ? '' : ` <span class="px-shn">athletic score ${rasOf(p).toFixed(2)}</span>`}`, combineHTML(p))}</div>`;
}
// post-draft bidding for undrafted rookies
function udfaHTML() {
  const u = state.userTid, s = state.udfa, n = rosterOf(u).length, offers = Object.keys(s.offers).length, mine = !!ui.udfaMine && offers > 0;
  const ps = Object.values(state.players).filter(isUdfa).filter(p => mine ? s.offers[p.id] !== undefined : inFamily(p, ui.faPos));
  const committed = Object.values(s.offers).reduce((a, b) => a + MIN_SALARY + b, 0);
  const offerCell = p => { const cur = s.offers[p.id]; return `<select data-change="udfaOffer" data-pid="${p.id}" class="${cur !== undefined ? 'on' : ''}"><option value="">No offer</option>${UDFA_BONUS.map(b => `<option value="${b}" ${cur === b ? 'selected' : ''}>${b ? fmtBonus(b) + ' guaranteed' : 'Offer, no bonus'}</option>`).join('')}</select>`; };
  const HEAT = { 'Bidding war': 'bad', 'Several teams': 'warn', 'A team or two': '', Quiet: 'good' }, PATH = { 'Clear path to a job': 'good', 'Fair shot': '', 'Crowded room': 'warn', 'Long odds': 'bad' };
  return pxRibbon(`Round ${s.round + 1} of ${UDFA_ROUNDS}`, `Offer a guaranteed signing bonus on a three-year minimum deal (${fmtMoney(MIN_SALARY)}/yr). When you send offers, each player picks a team: the money matters, but so does whether he sees a job to win and where he simply wants to be. The bonus is dead money if you cut him. Camp roster <b>${n}/${OFFSEASON_MAX}</b> · offers out <b>${offers}</b> · committed ${fmtMoney(committed)} of ${fmtMoney(capRoom(u))} cap room.${s.round === UDFA_ROUNDS - 1 ? ' <b>Last round:</b> after this, camp opens with whoever you have.' : ''}`)
    + `<div class="rs-scroll lg-scroll">${table('udfa', [
    { k: 'pos', l: 'Pos', v: p => FAM_INDEX[p.spot], f: p => pxPos(p) },
    { k: 'n', l: 'Name', v: p => p.last, f: p => playerLink(p) },
    { k: 'age', l: 'Age', v: p => p.age, num: 1 },
    { k: 'ht', l: 'Ht', v: p => p.m.ht, f: p => `<span class="small muted">${fmtHeight(p.m.ht)}</span>`, num: 1 }, { k: 'wt', l: 'Wt', v: p => p.m.wt, f: p => `<span class="small muted">${p.m.wt}</span>`, num: 1 },
    { k: 'ovr', l: 'Ready now as', v: tierSort, f: p => tierPill(p) + trueNums(p) },
    { k: 'pot', l: 'Upside', v: upSort, f: p => upsidePill(p) },
    { k: 'ras', l: 'RAS', v: p => rasOf(p) || 0, f: p => rasHTML(p), num: 1 },
    { k: 'sk', l: 'Scouting', f: p => `<span class="small muted">${traitsTxt(p)}</span>`, cls: 'px-flex' },
    { k: 'heat', l: 'Market', v: p => (s.ai[p.id] || []).length, f: p => { const h = udfaInterest(p); return `<span class="pill ${HEAT[h]}">${h}</span>`; }, title: 'How many other teams are after him this round' },
    { k: 'path', l: 'His view of you', v: p => udfaPath(p, u), f: p => { const l = udfaPathLabel(udfaPath(p, u)); return `<span class="pill ${PATH[l]}">${l}</span>`; }, title: 'Does he see a job to win on your roster?' },
    { k: 'o', l: 'Your offer', v: p => s.offers[p.id] !== undefined ? 1 + s.offers[p.id] : 0, f: offerCell },
  ], ps, { sort: 'pot', limit: 240, cls: 'rs-tbl lg-tbl', rowClass: p => s.offers[p.id] !== undefined ? 'me' : '' })}</div>`;
}
// next offseason's class: everyone in the last year of his deal with no extension signed
function upcomingFAHTML() {
  const resign = state.phase === 'RESIGN', ps = Object.values(state.players).filter(upcomingFA).filter(p => inFamily(p, ui.faPos));
  return pxRibbon(resign ? 'Just expired' : 'Contract year', `${resign ? 'Contracts that just expired. Teams are deciding now: whoever is not re-signed or tagged reaches free agency when you advance.' : `Players in the final year of their deals: the ${state.season + (['REG', 'PLAYOFFS', 'RECAP', 'COACHES'].includes(state.phase) ? 1 : 2)} free agent class as it stands today. Teams will extend, tag or re-sign the best of them before they get there.`} Market value is what the league thinks he is worth per year right now.`)
    + `<div class="rs-scroll lg-scroll">${table('upfa', [
    { k: 'pos', l: 'Pos', v: p => FAM_INDEX[p.spot], f: p => pxPos(p) },
    { k: 'n', l: 'Name', v: p => p.last, f: p => playerLink(p) + ' ' + statusPills(p) },
    { k: 'tm', l: 'Club', v: p => T(p.tid).abbr, f: p => lgAb(p.tid) },
    { k: 'age', l: 'Age', v: p => p.age, num: 1 },
    { k: 'ovr', l: 'Tier', v: tierSort, f: p => tierPill(p) + trueNums(p) },
    { k: 'pot', l: 'Upside', v: upSort, f: p => upsidePill(p) },
    { k: 'gr', l: 'Grade', v: p => p.advS ? overallGrade(p.advS, p.spot) || 0 : 0, f: p => gradeChip(p.advS ? overallGrade(p.advS, p.spot) : null), num: 1 },
    { k: 'sk', l: 'Scouting', f: p => `<span class="small muted">${traitsTxt(p)}</span>`, cls: 'px-flex' },
    { k: 'cur', l: 'Current AAV', v: p => p.contract.amt || p.lastAmt || 0, f: p => p.contract.amt ? fmtMoney(p.contract.amt) : '<span class="muted">—</span>', num: 1 },
    { k: 'mv', l: 'Market value', v: p => marketValue(p), f: p => fmtMoney(marketValue(p)), num: 1 },
    { k: 'lev', l: 'Leverage', v: p => leverageOf(p), f: p => leverageLabel(leverageOf(p)) },
    { k: 'st', l: 'Outlook', f: staySignal },
  ], ps, { sort: 'ovr', limit: 250, cls: 'rs-tbl lg-tbl', rowClass: p => p.tid === state.userTid ? 'me' : '' })}</div>`;
}

// ---------- trade ----------
function tradeHTML() {
  const u = state.userTid; if (ui.tradeTid == null || ui.tradeTid === u || !T(ui.tradeTid)) ui.tradeTid = u === 0 ? 1 : 0;
  const o = ui.tradeTid, ot = T(o), open = tradeWindowOpen(), n = a => a.players.length + a.picks.length, any = n(ui.give) + n(ui.get), pos = ui.trPos || 'ALL';
  const ev = any ? evaluateTrade(u, o, ui.give, ui.get) : null, after = capRoom(u) + salaryOf(ui.give) - salaryOf(ui.get);
  // a side: its men, then its picks; a click puts one in the deal or takes him out
  const side = (tid, assets, key) => {
    const ro = rosterOf(tid).filter(p => inFamily(p, pos)).sort(famOrder);
    const row = p => `<div class="px-tr${assets.players.includes(p.id) ? ' on' : ''}" data-action="tradeToggle" data-side="${key}" data-type="players" data-id="${p.id}" title="${assets.players.includes(p.id) ? 'Take him out of the deal' : 'Put him in the deal'}"><i class="px-ck"></i>${pxPos(p)}<span class="px-tn">${playerLink(p)}${statusPills(p)}</span><span class="px-ta">${p.age}</span><span class="px-ts">${starHTML(starsOf(p))}</span><span class="px-tt">${tierPill(p)}</span><span class="px-tc">${fmtContract(p)}</span></div>`;
    const picks = tradablePicks(tid).map(pk => `<button class="px-pk${assets.picks.includes(pk.id) ? ' on' : ''}" data-action="tradeToggle" data-side="${key}" data-type="picks" data-id="${pk.id}" title="${assets.picks.includes(pk.id) ? 'Take it out of the deal' : 'Put it in the deal'}">${esc(pickLabel(pk))}</button>`).join('');
    return `${ro.map(row).join('') || '<div class="lg-none">Nobody at this position.</div>'}<div class="px-sh2">Draft picks</div><div class="px-pks">${picks || '<span class="lg-none">None to trade.</span>'}</div>`;
  };
  const inDeal = (assets, key) => [...assets.players.map(id => P(id)).filter(Boolean).map(p => `<div class="px-dl"><button class="px-x" data-action="tradeToggle" data-side="${key}" data-type="players" data-id="${p.id}" title="Take him out of the deal">×</button>${pxPos(p)}<span class="px-tn">${playerLink(p)}</span>${tierPill(p)}<span class="px-dm">${p.age}y · ${p.contract.yrs > 0 ? fmtMoney(p.contract.amt) + ' × ' + p.contract.yrs : '—'}</span></div>`),
    ...assets.picks.map(id => state.picks.find(pk => pk.id === id)).filter(Boolean).map(pk => `<div class="px-dl"><button class="px-x" data-action="tradeToggle" data-side="${key}" data-type="picks" data-id="${pk.id}" title="Take it out of the deal">×</button><span class="px-tn">${esc(pickLabel(pk))}</span></div>`)].join('') || '<div class="px-none">Nothing yet.</div>';
  const ratio = ev && ev.inV !== undefined ? clamp(ev.inV / Math.max(0.1, ev.needed), 0, 1.5) : null;
  const verdict = !any ? '<div class="px-note">Tick players or picks on either side to build a deal. Click a name to open his file.</div>'
    : `${ratio !== null ? `<div class="px-meter" title="How close the deal is to what they need"><i class="${ratio >= 1 ? 'ok' : ratio >= 0.8 ? 'near' : 'far'}" style="width:${Math.min(100, ratio * 66.7)}%"></i><b style="left:66.7%"></b></div>` : ''}
      <div class="px-ev ${ev.ok ? 'good' : 'warn'}">${esc(ev.msg)}</div>
      <div class="px-note">Salary: you send ${fmtMoney(salaryOf(ui.give))}, receive ${fmtMoney(salaryOf(ui.get))} · your cap space after: <b class="${after < 0 ? 'bad' : ''}">${fmtMoney(after)}</b></div>
      <div class="px-btns"><button class="primary" data-action="proposeTrade" ${open ? '' : 'disabled'}>Propose the trade</button><button class="sm" data-action="clearTrade">Clear</button></div>`;
  const how = '<div class="px-note px-how">AI teams value young high-potential players, cheap contracts, premium positions (QB, pass rush, WR, CB) and picks from bad teams. They charge extra for their own starters and want a little more than they give.</div>';
  const partner = `<div class="px-partner">${lgMed(o, { metal: 'steel', tip: teamName(o) })}<div class="px-pkv"><b>${clubTag(o, true)}</b><span>${recOf(o)} · cap space <b class="${capRoom(o) < 0 ? 'bad' : ''}">${fmtMoney(capRoom(o))}</b> · roster ${rosterCount(o)}/${rosterLimit()}</span><span>Head coach ${C(ot.hc) ? coachNameLink(C(ot.hc)) : '<i>vacant</i>'}</span></div></div>`;
  const dealPane = `<section class="lg-pane px-deal"><div class="lg-ph"><h3>The deal</h3>${any ? '<button class="link cl-more" data-action="clearTrade">Clear ›</button>' : ''}</div><div class="lg-pb">${partner}
    <div class="px-dh">${esc(T(u).abbr)} send</div>${inDeal(ui.give, 'give')}<div class="px-dh">${esc(ot.abbr)} send</div>${inDeal(ui.get, 'get')}<div class="px-vd">${verdict}</div>${how}</div></section>`;
  const figs = [lgFig('Your cap room', `<span class="${capRoom(u) < 0 ? 'bad' : ''}">${fmtMoney(capRoom(u))}</span>`), lgFig(`${esc(ot.abbr)} cap room`, fmtMoney(capRoom(o))), lgFig('Your roster', `${rosterCount(u)}<small>/ ${rosterLimit()}</small>`), lgFig(`${esc(ot.abbr)} roster`, `${rosterCount(o)}<small>/ ${rosterLimit()}</small>`),
    lgFig('You send', n(ui.give), n(ui.give) ? fmtMoney(salaryOf(ui.give)) : ''), lgFig('You get', n(ui.get), n(ui.get) ? fmtMoney(salaryOf(ui.get)) : ''), lgFig('Deadline', state.phase === 'REG' ? (open ? `After week ${TRADE_DEADLINE}` : '<span class="bad">Passed</span>') : open ? 'Open' : '<span class="bad">Closed</span>')];
  const opts = state.teams.filter(t => t.id !== u).sort((a, b) => (a.region + a.name).localeCompare(b.region + b.name)).map(t => [t.id, `${t.region} ${t.name} (${recOf(t.id)})`]);
  const bar = `<div class="rs-bar lg-bar px-trbar"><div class="lg-ctl px-trctl">${lgSel('Trade with', 'tradeTeam', opts, o)}${lgSel('', 'pxTrPos', [['ALL', 'All positions'], ...FAMILIES.map(([k]) => [k, k])], pos, 'Show one position group')}</div></div>`;
  const shut = open ? '' : pxRibbon('Closed', state.phase === 'REG' ? 'The trade deadline has passed.' : 'Trades are closed during this phase.', 'bad');
  const mast = pxMast('Trade', `${state.season} · ${state.phase === 'REG' ? `week ${state.week} · ${open ? `deadline after week ${TRADE_DEADLINE}` : 'past the deadline'}` : open ? 'the window is open' : 'closed'}`, `<span class="${after < 0 ? 'bad' : ''}">${fmtMoney(after)}</span>`, any ? 'your cap room after the deal' : 'your cap room');
  if (isPhone()) { // one list at a time: yours, theirs, or the deal
    const tab = ['give', 'get', 'deal'].includes(ui.trTab) ? ui.trTab : 'give';
    const tabs = `<nav class="dk-stabs px-trtabs">${[['give', `${esc(T(u).abbr)} send${n(ui.give) ? ` (${n(ui.give)})` : ''}`], ['get', `${esc(ot.abbr)} send${n(ui.get) ? ` (${n(ui.get)})` : ''}`], ['deal', 'The deal']].map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" data-action="trTab" data-v="${k}">${l}</button>`).join('')}</nav>`;
    return lgSheet('px px-trade', mast, figs, bar, `${shut}${tabs}<div class="lg-body">${tab === 'deal' ? dealPane : `<section class="lg-pane px-side"><div class="lg-pb">${side(tab === 'give' ? u : o, tab === 'give' ? ui.give : ui.get, tab)}</div></section>`}</div>
      ${tab !== 'deal' && any ? `<div class="px-trfoot"><span class="${ev.ok ? 'good' : 'warn'}">${esc(T(u).abbr)} send ${n(ui.give)} · get ${n(ui.get)}</span><button class="sm primary" data-action="trTab" data-v="deal">Review the deal</button></div>` : ''}`);
  }
  return lgSheet('px px-trade', mast, figs, bar, `${shut}<div class="lg-body px-trb"><section class="lg-pane px-side"><div class="lg-ph"><h3>${esc(T(u).abbr)} send</h3><span class="lg-pn">click a man or a pick to put him in the deal</span></div><div class="lg-pb">${side(u, ui.give, 'give')}</div></section>
    ${dealPane}<section class="lg-pane px-side"><div class="lg-ph"><h3>${clubTag(o, true)} send</h3><button class="link cl-more" data-action="team" data-tid="${o}">Their club ›</button></div><div class="lg-pb">${side(o, ui.get, 'get')}</div></section></div>`);
}

// ---------- player search: find future targets anywhere in the league ----------
function searchHTML() {
  const f = ui.search || (ui.search = Object.assign({}, SEARCH_DEF)), u = state.userTid;
  const tIdx = t => TIER_ORDER.indexOf(t), uIdx = x => UPSIDE_ORDER.indexOf(x);
  const where = p => p.tid === -1 ? 'fa' : p.tid === -2 ? 'draft' : p.tid === -3 ? 'ps' : p.tid === u ? 'mine' : 'other';
  let ps = Object.values(state.players).filter(p => p.a && p.per);
  if (f.q) { const q = f.q.toLowerCase(); ps = ps.filter(p => pname(p).toLowerCase().includes(q)); }
  if (f.where !== 'all') ps = ps.filter(p => f.where === 'notmine' ? where(p) !== 'mine' : where(p) === f.where);
  if (f.team !== '') ps = ps.filter(p => p.tid === +f.team || (p.tid === -3 && p.psTid === +f.team));
  if (f.ageMin !== '') ps = ps.filter(p => p.age >= +f.ageMin);
  if (f.ageMax !== '') ps = ps.filter(p => p.age <= +f.ageMax);
  if (f.tier) ps = ps.filter(p => tIdx(tierOf(p)) <= tIdx(f.tier) || (f.tier === 'Rotation' && tierOf(p) === 'Backup'));
  if (f.up) ps = ps.filter(p => uIdx(upsideOf(p)) <= uIdx(f.up));
  if (f.maxCap !== '') ps = ps.filter(p => (p.tid === -1 ? p.ask : p.contract.yrs > 0 ? p.contract.amt : 0) <= +f.maxCap);
  if (f.expiring) ps = ps.filter(p => p.tid >= 0 && (p.contract.yrs <= 1 && !p.contract.next));
  if (f.comfort) ps = ps.filter(p => comfortOf(p, f.comfort) >= 60);
  const counts = pxFamCounts(ps);
  if (f.fam !== 'ALL') ps = ps.filter(p => inFamily(p, f.fam));
  const sel = (k, opts, tt) => `<select data-change="srch" data-f="${k}" class="${String(f[k]) !== String(SEARCH_DEF[k]) ? 'set' : ''}"${tt ? ` title="${esc(tt)}"` : ''}>${opts.map(([v, l]) => `<option value="${v}" ${String(f[k]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const num = (k, ph, tt) => `<input type="number" data-change="srch" data-f="${k}" value="${f[k]}" placeholder="${ph}" class="px-num ${f[k] !== '' ? 'set' : ''}" title="${esc(tt)}">`;
  const nSet = Object.keys(SEARCH_DEF).filter(k => k !== 'q' && k !== 'fam' && String(f[k]) !== String(SEARCH_DEF[k])).length;
  const nameBox = `<input type="text" data-change="srch" data-f="q" value="${esc(f.q)}" placeholder="Name…" class="px-q" title="Search by name">`;
  const rest = `${isPhone() ? '' : nameBox}${sel('where', [['all', 'Everyone'], ['notmine', 'Not on my team'], ['other', 'Other teams'], ['fa', 'Free agents'], ['ps', 'Practice squads'], ['draft', 'Draft prospects'], ['mine', 'My team']], 'Where he is')}
    ${sel('team', [['', 'Any club'], ...state.teams.map(t => [t.id, t.abbr])], 'One club')}
    <span class="px-fl">Age</span>${num('ageMin', 'min', 'Youngest')}<span class="muted">–</span>${num('ageMax', 'max', 'Oldest')}
    <span class="px-fl">Tier ≥</span>${sel('tier', [['', 'Any'], ...['Elite', 'All-Pro', 'Starter', 'Rotation', 'Depth'].map(t => [t, t === 'Rotation' ? 'Rotation / Backup' : t])], 'This tier or better')}
    <span class="px-fl">Upside ≥</span>${sel('up', [['', 'Any'], ...UPSIDE_ORDER.slice(0, 6).map(t => [t, t])], 'This upside or better')}
    <span class="px-fl">Cap hit</span>${num('maxCap', 'any $M', 'Cap hit at most, $M')}
    <span class="px-fl">Plays</span>${sel('comfort', [['', 'Any spot'], ...SPOT_KEYS.map(k => [k, SPOTS[k].l])], 'Comfortable at this spot')}
    <label class="fa-chk ${f.expiring ? 'set' : ''}"><input type="checkbox" data-change="srchChk" data-f="expiring" ${f.expiring ? 'checked' : ''}> Contract year</label>
    ${nSet ? `<button class="sm" data-action="srchReset">Reset</button>` : ''}`;
  const filt = isPhone() ? `<div class="px-filt"><div class="px-fr">${nameBox}</div><details class="mfold-in" ${foldAttr('srchMore')}><summary>Filters${nSet ? ` <b>(${nSet} set)</b>` : ''}</summary><div class="px-fr">${rest}</div></details></div>` : `<div class="px-filt"><div class="px-fr">${rest}</div></div>`;
  const by = k => ps.filter(p => where(p) === k).length;
  const figs = [lgFig('Matches', ps.length), lgFig('On other clubs', by('other')), lgFig('Free agents', by('fa')), lgFig('Practice squads', by('ps')), lgFig('Draft prospects', by('draft')), lgFig('In a contract year', ps.filter(p => p.tid >= 0 && p.contract.yrs <= 1 && !p.contract.next).length), lgFig('Yours', by('mine'))];
  const loc = p => p.tid >= 0 ? lgAb(p.tid) : p.tid === -1 ? '<span class="muted">FA</span>' : p.tid === -3 ? `<span class="muted">PS</span> ${lgAb(p.psTid)}` : `<span class="muted">${p.draftYear} draft</span>`;
  return lgSheet('px px-srch', pxMast('Player search', `${state.season} · every player in the league, on the street and in the draft class`, lgNum(ps.length), `match${ps.length === 1 ? 'es' : ''}${ps.length > 250 ? ' · the first 250 shown' : ''}`), figs,
    lgBarHTML(pxFamTabs(counts), f.fam, 'pxSrchFam', ''),
    filt + `<div class="rs-scroll lg-scroll">${table('search', [
    { k: 'pos', l: 'Pos', v: p => FAM_INDEX[p.spot], f: p => pxPos(p) },
    { k: 'n', l: 'Name', v: p => p.last, f: p => playerLink(p) + ' ' + statusPills(p) },
    { k: 'tm', l: 'Club', v: p => p.tid >= 0 ? T(p.tid).abbr : p.tid === -1 ? 'zFA' : 'zz', f: loc },
    { k: 'age', l: 'Age', v: p => p.age, num: 1 },
    { k: 'yoe', l: 'Yrs', v: p => p.exp, num: 1, title: 'Seasons in the league' },
    { k: 'star', l: '★', v: p => starsOf(p) || 0, f: p => p.tid === -2 ? '' : starHTML(starsOf(p)) },
    { k: 'tier', l: 'Tier', v: tierSort, f: p => tierPill(p) + trueNums(p) },
    { k: 'up', l: 'Upside', v: upSort, f: p => upsidePill(p) },
    { k: 'sk', l: 'Profile', f: p => `<span class="small muted">${traitsTxt(p)}</span>`, cls: 'px-flex' },
    { k: 'gr', l: 'Grade', v: p => p.advS ? overallGrade(p.advS, p.spot) || 0 : 0, f: p => gradeChip(p.advS ? overallGrade(p.advS, p.spot) : null), num: 1 },
    { k: 'ras', l: 'RAS', v: p => rasOf(p) || 0, f: p => rasHTML(p), num: 1 },
    { k: 'c', l: 'Contract', v: p => p.tid === -1 ? p.ask : p.contract.yrs > 0 ? p.contract.amt : 0, f: p => p.tid === -1 ? `asks ${fmtMoney(p.ask)}` : p.tid === -2 ? '—' : fmtContract(p), num: 1 },
  ], ps, { sort: 'tier', limit: 250, cls: 'rs-tbl lg-tbl', rowClass: p => p.tid === u || (p.tid === -3 && p.psTid === u) ? 'me' : '' })}<div class="rs-foot">Click a column to sort, a name for his file.</div></div>`);
}

// ---------- the draft ----------
function draftHTML() {
  const u = state.userTid, d = state.draft, my = state.picks.filter(pk => pk.owner === u).sort((a, b) => a.season - b.season || a.round - b.round), all = prospects();
  const yr = all.length ? all[0].draftYear : state.season + 1;
  const mine = my.filter(pk => pk.season === yr), slot = pk => d && pk.season === d.year ? d.order.find(z => z.pickId === pk.id) : null;
  const picksPane = `<section class="lg-pane px-dpicks"><div class="lg-ph"><h3>Your picks</h3><button class="link cl-more" data-action="nav" data-view="trade">Trade ›</button></div><div class="lg-pb">${clPicks(u)}
    ${!my.length ? '<div class="lg-none">None.</div>' : d ? `<div class="px-pl">${my.filter(x => x.season === d.year).map(x => { const o = slot(x), p = o && o.pid ? P(o.pid) : null; return `<div class="${p ? 'gone' : ''}">${esc(pickLabel(x))}${p ? ` · ${playerLink(p, true)}` : ''}</div>`; }).join('')}</div>` : ''}</div></section>`;
  if (!all.length) return lgSheet('px px-dr', pxMast('The draft', `${state.season} · the class is not on the board yet`, mine.length || my.length, `pick${my.length === 1 ? '' : 's'} on the books`),
    [lgFig('Your picks', my.length), lgFig('First round', my.filter(pk => pk.round === 1).length)], '', `${pxRibbon('Next year', "Next year's draft class arrives on the board when the season starts.")}<div class="lg-body">${picksPane}</div>`);
  const pk = currentPick(), onClock = state.phase === 'DRAFT' && pk && pk.owner === u;
  const grade = p => uOvr(p) + 0.55 * p.per.g + ({ QB: 3, RB: -2, K: -22, P: -24 }[p.pos] || 0); // consensus big board
  const ranked = all.slice().sort((a, b) => grade(b) - grade(a)), rankOf = new Map(ranked.map((p, i) => [p.id, i + 1]));
  const pros = all.filter(p => inFamily(p, ui.draftPos));
  const next = mine.map(x => [x, slot(x)]).find(([, o]) => !o || !o.pid);
  // the band, the figures
  const status = state.phase === 'DRAFT' ? (pk ? `round ${pk.round}, pick ${pk.pick}: ${onClock ? 'you are on the clock' : esc(T(pk.owner).abbr) + ' on the clock'}` : 'the draft is done') : 'the draft comes after free agency';
  const made = d ? d.order.filter(o => o.pid).length : 0;
  const figs = [lgFig('Class', yr), lgFig('Prospects', all.length, 'on the board'), lgFig('Your picks', mine.length, `this draft · ${my.length} in all`), lgFig('Your next', next ? (next[1] ? `#${next[1].pick}` : `Rd ${next[0].round}`) : '—', next ? `round ${next[0].round}` : ''),
    lgFig('On the clock', state.phase === 'DRAFT' && pk ? lgAb(pk.owner) : '—', state.phase === 'DRAFT' && pk ? `#${pk.pick}` : ''), lgFig('Picks made', d ? made : 0, d ? `of ${d.order.length}` : '')];
  const note = ['REG', 'PLAYOFFS', 'RECAP'].includes(state.phase) ? `<b>${yr} draft class.</b> Reports sharpen as the college season goes on, but stay foggy until these players are in the league. ` : '';
  const rib = onClock ? pxRibbon('On the clock', `Pick #${pk.pick}, round ${pk.round}. Choose a player below.`, 'hot')
    : pxRibbon(state.phase === 'DRAFT' ? 'The draft' : 'Preview', `${note}${state.phase !== 'DRAFT' ? 'The draft happens after free agency. Everything here is your scouts\' read: prospects are the foggiest players in football, and workout numbers get overhyped.' : pk ? `Pick #${pk.pick}: ${esc(T(pk.owner).abbr)} on the clock.` : 'The draft is done.'}`);
  // the phones, the picks going in
  let side = picksPane;
  if (state.phase === 'DRAFT') {
    const offs = onClock && d.offer && d.offer.idx === d.idx ? d.offer.list : [];
    side += `<section class="lg-pane px-phones"><div class="lg-ph"><h3>The phones</h3><span class="lg-pn">trades are open: build one on Trade, picks included</span></div><div class="lg-pb">${offs.length ? offs.map((x, i) => `<div class="px-off"><span>${lgAb(x.tid)} want to come up to <b>pick ${pk.pick}</b>. They offer ${x.give.map(id => { const z = state.picks.find(q => q.id === id); return z ? `<b>${esc(pickLabel(z))}</b>` : ''; }).join(' and ')}.</span><button class="sm primary" data-action="draftOffer" data-i="${i}">Take it</button></div>`).join('') : `<div class="lg-none">${onClock ? 'Nobody has called about this pick.' : 'Quiet for now. Clubs call when you are on the clock.'}</div>`}</div></section>
      <section class="lg-pane px-recent"><div class="lg-ph"><h3>The picks</h3><span class="lg-pn">${made} made</span></div><div class="lg-pb">${d.order.slice(0, d.idx).reverse().slice(0, 40).map(x => { const p = P(x.pid); return `<div class="px-rp${x.owner === u ? ' me' : ''}"><b>${x.pick}</b>${lgAb(x.owner)}${p ? `${pxPos(p)}${playerLink(p, true)}` : ''}</div>`; }).join('') || '<div class="lg-none">None yet.</div>'}</div></section>`;
  }
  const lo = 'px-lo';
  const tbl = table('draft', [
    { k: 'rk', l: 'Rank', v: p => rankOf.get(p.id), num: 1 },
    { k: 'pos', l: 'Pos', v: p => FAM_INDEX[p.spot], f: p => pxPos(p) },
    { k: 'n', l: 'Name', v: p => p.last, f: p => playerLink(p) },
    { k: 'col', l: 'College', v: p => p.college, f: p => `<span class="muted">${esc(p.college)}</span>`, cls: lo },
    { k: 'age', l: 'Age', v: p => p.age, num: 1, cls: lo },
    { k: 'ht', l: 'Ht', v: p => p.m.ht, f: p => `<span class="small muted">${fmtHeight(p.m.ht)}</span>`, num: 1, cls: lo }, { k: 'wt', l: 'Wt', v: p => p.m.wt, f: p => `<span class="small muted">${p.m.wt}</span>`, num: 1, cls: lo },
    { k: 'forty', l: '40', v: p => -(p.m.forty !== undefined ? p.m.forty : p.pw && p.pw.forty !== undefined ? p.pw.forty : 9), f: p => p.m.forty !== undefined ? p.m.forty.toFixed(2) + (p.m.x && p.m.x.forty === 'p' ? '<span class="muted">*</span>' : '') : p.pw && p.pw.forty !== undefined ? `<span title="Your private workout">${p.pw.forty.toFixed(2)}†</span>` : `<span class="small muted" title="${((p.m.x && DRILL_WHY[p.m.x.forty]) || ['', 'No result'])[1]}">${p.m.x && p.m.x.forty === 'i' ? 'inj' : 'DNR'}</span>`, num: 1 },
    { k: 'ras', l: 'RAS', v: p => rasOf(p) || 0, f: p => rasHTML(p), num: 1, title: 'Relative Athletic Score (0–10) vs. his position' },
    { k: 'ovr', l: 'Now', v: tierSort, f: p => tierPill(p) + trueNums(p), title: 'Ready to contribute as…' },
    { k: 'pot', l: 'Upside', v: upSort, f: p => upsidePill(p) },
    { k: 'sk', l: 'Scouting', f: p => `<span class="small muted">${traitsTxt(p)}</span>`, cls: 'px-flex' },
    { k: 'proj', l: 'Proj', v: p => rankOf.get(p.id), f: p => { const r = Math.ceil(rankOf.get(p.id) / 32); return r > 7 ? 'UDFA' : 'Rd ' + r; } },
    { k: 'a', l: '', f: p => onClock ? `<button class="sm primary" data-action="draftPick" data-pid="${p.id}">Draft</button>` : '' },
  ], pros, { sort: 'rk', dir: 1, limit: 300, cls: 'rs-tbl lg-tbl' });
  return lgSheet('px px-dr', pxMast('The draft', `${yr} class · ${status}`, next ? (next[1] ? `#${next[1].pick}` : `Rd ${next[0].round}`) : '—', next ? `your next pick · round ${next[0].round}` : 'no pick left in this draft'), figs,
    lgBarHTML(pxFamTabs(pxFamCounts(all)), ui.draftPos || 'ALL', 'pxDraftPos', ''), `${rib}<div class="lg-body px-drb"><section class="lg-pane px-board"><div class="lg-pb">${tbl}</div></section><div class="px-dside">${side}</div></div>`);
}

// ---------- the waiver wire ----------
const PX_RISK = { 'Will be claimed': 'bad', 'Could be claimed': 'warn', 'Should clear': 'good' };
// a man in the side pane: who he is on one line, what you have decided about him on the next
const pxMan = (p, right, sub) => `<div class="px-mr"><div class="px-m1">${pxPos(p)}<span class="px-tn">${playerLink(p)}</span>${tierPill(p)}<span class="px-dm">${p.age}y</span></div>${sub ? `<div class="px-m2">${sub}</div>` : ''}${right ? `<div class="px-m3">${right}</div>` : ''}</div>`;
function waiversHTML() {
  const u = state.userTid, wv = state.wv, fam = ui.wvFam || 'ALL';
  const all = onWaivers(), mineOut = all.filter(p => p.waiver.from === u), theirs = all.filter(p => p.waiver.from !== u), wire = theirs.filter(p => inFamily(p, fam));
  const cleared = Object.values(state.players).filter(p => p.tid === -1 && !p.waiver && p.lastTid === u && wv.ps.includes(p.id));
  const active = rosterOf(u).filter(p => !onIR(p)).length, claims = Object.keys(wv.claims).length, psCount = wv.ps.length + Object.keys(wv.want).length;
  const deals = cutMarketOn() ? Object.keys(state.fa.off).map(id => P(+id)).filter(p => p && cutDealOf(p.id)) : [];
  const offs = [...deals, ...Object.keys(wv.offers || {}).map(id => P(+id)).filter(Boolean)], tg = Object.keys(wv.want).map(id => P(+id)).filter(p => p && !p.waiver);
  const nCuts = mineOut.length + cleared.length + Object.values(state.players).filter(p => p.tid === -1 && !p.waiver && p.lastTid === u && !wv.ps.includes(p.id) && wv.cutIds && wv.cutIds.includes(p.id)).length;
  const figs = [lgFig('Claim order', `#${wv.prio.indexOf(u) + 1}`, `of ${state.teams.length}`, 'Worst record goes first'), lgFig('Active roster', `${active}<small>/ ${ROSTER_MAX}</small>`), lgFig('Claims in', claims), lgFig('Practice squad', `${psOf(u).length}<small>/ ${PS_MAX}</small>`),
    lgFig('Lined up for it', psCount, `${wv.ps.length} yours · ${Object.keys(wv.want).length} others`, 'Not signed yet: your cuts and targets from other clubs'), lgFig('On waivers', all.length), lgFig('Your cuts', nCuts)];
  const terms = p => { const o = cutDealOf(p.id); return o ? `${o.night ? '<span class="pill good">Agreed</span>' : '<span class="pill">On the table</span>'} ${o.yrs} yr, ${fmtMoney(o.aav)}/yr${o.gtd ? `, ${fmtMoney(o.gtd)} bonus` : ''}` : wv.want[p.id] && !(wv.offers || {})[p.id] ? '<span class="muted">practice squad</span>' : `1 yr, ${fmtMoney(p.ask || MIN_SALARY)}`; };
  const offBtns = p => cutDealOf(p.id) ? `<button class="sm" data-action="faGo" data-pid="${p.id}">Talks</button> <button class="sm" data-action="wvMDrop" data-pid="${p.id}" title="If your 53 is full when he signs, this is who goes">${(wv.mdrop || {})[p.id] ? 'Release if he signs: ' + esc(P(wv.mdrop[p.id]).last) : 'Who goes if he signs?'}</button>` : wvFaButtons(p);
  const moves = `<section class="lg-pane px-wvside"><div class="lg-ph"><h3>Your offers and targets</h3><span class="lg-pn">${offs.length} offer${offs.length === 1 ? '' : 's'} · ${tg.length} target${tg.length === 1 ? '' : 's'}</span><button class="link cl-more" data-action="nav" data-view="fa">Free agents ›</button></div><div class="lg-pb">
      <div class="px-note">Veterans cut today, and anyone else unsigned, can take an offer now. Players worth a real contract go through a sit-down with their agent, as in free agency; a deal you shake on is official when claims are processed, unless a club comes in with something he likes better. Everyone else signs for one year at his asking price.</div>
      ${[...offs, ...tg.filter(p => !offs.includes(p))].map(p => pxMan(p, offBtns(p), `${p.lastTid != null && p.lastTid >= 0 ? `last with ${lgAb(p.lastTid)} · ` : ''}${p.exp} yr${p.exp === 1 ? '' : 's'} · ${terms(p)}`)).join('') || '<div class="lg-none">None yet.</div>'}</div></section>
    <section class="lg-pane px-wvside"><div class="lg-ph"><h3>Your cuts</h3><span class="lg-pn">${nCuts}</span></div><div class="lg-pb">
      <div class="px-note">Nobody here is on your practice squad yet. Players on waivers can be claimed by other teams when you press <b>Process claims</b>; the ones you marked for the practice squad sign with you then, if they are still unclaimed.</div>
      ${mineOut.length || cleared.length ? [...mineOut, ...cleared].sort(famOrder).map(p => pxMan(p, '', `${upsidePill(p)} · ${wv.ps.includes(p.id) ? '<span class="pill on">Practice squad</span>' : '<span class="muted">Released</span>'} · ${p.waiver ? `<span class="pill ${PX_RISK[waiverRisk(p)]}">${waiverRisk(p)}</span>` : '<span class="pill good">Free agent: no waivers</span>'}`)).join('') : '<div class="lg-none">You did not cut anyone, or none of your cuts are on waivers or marked for the practice squad.</div>'}
      <details class="pr-how" ${foldAttr('wvhow')}><summary>How claims are settled</summary><p>Everything you set here is settled at once when you press <b>Process claims</b>, in this order: <b>1.</b> waiver claims, worst record first (a claim adds him to your 53 on his current contract); <b>2.</b> veterans on the market choose between your offer and any other club's; <b>3.</b> practice squads: each club's own cuts it wants back sign first, then your targets, then the open market; <b>4.</b> clubs fill any open places on their 53. A player you and a club both want picks the one he likes better: the clearer path to the field, a winning club, his old team.</p></details></div></section>`;
  const tbl = table('wire', [
    { k: 'pos', l: 'Pos', v: p => FAM_INDEX[p.spot], f: p => pxPos(p) },
    { k: 'n', l: 'Name', v: p => p.last, f: p => playerLink(p) },
    { k: 'tm', l: 'Waived by', v: p => T(p.waiver.from).abbr, f: p => lgAb(p.waiver.from) },
    { k: 'age', l: 'Age', v: p => p.age, num: 1 }, { k: 'exp', l: 'Yrs', v: p => p.exp, num: 1, cls: 'px-lo', title: 'Seasons in the league' },
    { k: 'tier', l: 'Tier', v: tierSort, f: p => tierPill(p) + trueNums(p) },
    { k: 'up', l: 'Upside', v: upSort, f: p => upsidePill(p) },
    { k: 'pre', l: 'Preseason', v: p => preGrade(p) || 0, f: p => p.preS ? `${gradeChip(preGrade(p))} <span class="small muted">${p.preS.snp} snaps</span>` : '<span class="muted small">—</span>', num: 1, cls: 'px-lo' },
    { k: 'sk', l: 'Scouting', f: p => `<span class="small muted">${traitsTxt(p)}</span>`, cls: 'px-flex' },
    { k: 'c', l: 'Contract', v: p => p.waiver.c.amt, f: p => `${fmtMoney(p.waiver.c.amt)} × ${Math.max(1, p.waiver.c.yrs || 1)} yr`, num: 1 },
    { k: 'risk', l: 'Interest', v: p => (wv.ai[p.id] || []).length, f: p => `<span class="pill ${PX_RISK[waiverRisk(p)]}">${waiverRisk(p) === 'Should clear' ? 'None seen' : waiverRisk(p) === 'Could be claimed' ? 'Some' : 'Heavy'}</span>` },
    { k: 'a', l: '', f: p => { const c = wv.claims[p.id]; return `<button class="sm ${c !== undefined ? 'primary' : ''}" data-action="wvClaim" data-pid="${p.id}">${c !== undefined ? '✓ Claim in' + (c ? ' (drop ' + esc(P(c).last) + ')' : '') : 'Claim'}</button> <button class="sm ${wv.want[p.id] ? 'on' : ''}" data-action="wvWant" data-pid="${p.id}">${wv.want[p.id] ? '✓ PS target' : 'PS target'}</button>`; } },
  ], wire, { sort: 'up', limit: 300, cls: 'rs-tbl lg-tbl', rowClass: p => wv.claims[p.id] !== undefined || wv.want[p.id] ? 'me' : '' });
  return lgSheet('px px-wv', pxMast('Waiver wire', `${state.season} · cutdown day · everything settles when you process claims`, `#${wv.prio.indexOf(u) + 1}`, `your claim order · ${claims} claim${claims === 1 ? '' : 's'} in`), figs,
    lgBarHTML(pxFamTabs(pxFamCounts(theirs)), fam, 'pxWvPos', ''), `<div class="lg-body px-wvb"><section class="lg-pane px-board"><div class="lg-ph"><h3>On waivers</h3><span class="lg-pn">${wire.length} from other clubs</span></div><div class="lg-pb">${tbl}</div></section><div class="px-dside">${moves}</div></div>`);
}
function weekWaiversHTML() {
  const u = state.userTid, iw = state.iw || (state.iw = { claims: {}, ps: [] }), fam = ui.wvFam || 'ALL', prio = waiverPrioNow();
  const wire = onWaivers(), theirsAll = wire.filter(p => p.waiver.from !== u), theirs = theirsAll.filter(p => inFamily(p, fam)), mine = wire.filter(p => p.waiver.from === u);
  const early = state.phase === 'REG' && state.week <= 3, nc = Object.keys(iw.claims).length;
  const figs = [lgFig('Claim order', `#${prio.indexOf(u) + 1}`, `of ${state.teams.length}`, early ? "Last season's order until week 4" : 'Worst record goes first'), lgFig('Active roster', `${activeCount(u)}<small>/ ${ROSTER_MAX}</small>`), lgFig('Claims in', nc),
    lgFig('On waivers', wire.length), lgFig('From other clubs', theirsAll.length), lgFig('Yours', mine.length), lgFig('Practice squad', `${psOf(u).length}<small>/ ${PS_MAX}</small>`)];
  const side = `<section class="lg-pane px-wvside"><div class="lg-ph"><h3>Your waived players</h3><span class="lg-pn">${mine.length}</span></div><div class="lg-pb">
      ${mine.length ? mine.map(p => pxMan(p, p.age <= PS_AGE && p.pos !== 'K' && p.pos !== 'P' ? `<button class="sm ${iw.ps.includes(p.id) ? 'on' : ''}" data-action="iwPS" data-pid="${p.id}">${iw.ps.includes(p.id) ? '✓ Practice squad' : 'Practice squad'}</button>` : '', `If he clears: ${p.age <= PS_AGE && p.pos !== 'K' && p.pos !== 'P' ? (iw.ps.includes(p.id) ? 'your practice squad' : 'a free agent') : 'a free agent'}`)).join('') : '<div class="lg-none">None of your players are on waivers.</div>'}
      <details class="pr-how" ${foldAttr('iwhow')} open><summary>How waivers work</summary><p>Players released with fewer than ${WAIVER_EXP} seasons go on waivers${state.week > TRADE_DEADLINE ? ', and since the trade deadline everyone does' : ' (after the trade deadline, everyone does)'}. Claims settle before your next game: a claim adds him to your 53 on his current contract, and the club highest in the order gets him. Anyone not claimed becomes a free agent.</p></details></div></section>`;
  const tbl = theirs.length ? table('iwire', [
    { k: 'pos', l: 'Pos', v: p => FAM_INDEX[p.spot], f: p => pxPos(p) }, { k: 'n', l: 'Name', v: p => p.last, f: p => playerLink(p) },
    { k: 'tm', l: 'Waived by', v: p => T(p.waiver.from).abbr, f: p => lgAb(p.waiver.from) }, { k: 'age', l: 'Age', v: p => p.age, num: 1 }, { k: 'exp', l: 'Yrs', v: p => p.exp, num: 1, title: 'Seasons in the league' },
    { k: 'tier', l: 'Tier', v: tierSort, f: p => tierPill(p) + trueNums(p) }, { k: 'up', l: 'Upside', v: upSort, f: p => upsidePill(p) },
    { k: 'sk', l: 'Scouting', f: p => `<span class="small muted">${traitsTxt(p)}</span>`, cls: 'px-flex' },
    { k: 'c', l: 'Contract', v: p => p.waiver.c.amt, f: p => `${fmtMoney(p.waiver.c.amt)} × ${Math.max(1, p.waiver.c.yrs || 1)} yr`, num: 1 },
    { k: 'a', l: '', f: p => { const c = iw.claims[p.id]; return `<button class="sm ${c !== undefined ? 'primary' : ''}" data-action="iwClaim" data-pid="${p.id}">${c !== undefined ? '✓ Claim in' + (c ? ' (drop ' + esc(P(c).last) + ')' : '') : 'Claim'}</button>`; } },
  ], theirs, { sort: 'tier', limit: 200, cls: 'rs-tbl lg-tbl', rowClass: p => iw.claims[p.id] !== undefined ? 'me' : '' }) : '<div class="lg-none">Nobody from another club is on waivers right now.</div>';
  return lgSheet('px px-wv', pxMast('Waiver wire', `${state.season} · ${state.phase === 'REG' ? `week ${state.week}` : 'the playoffs'} · claims settle before your next game`, `#${prio.indexOf(u) + 1}`, `your claim order · ${nc} claim${nc === 1 ? '' : 's'} in`), figs,
    lgBarHTML(pxFamTabs(pxFamCounts(theirsAll)), fam, 'pxWvPos', ''), `${iw.last ? `<div class="cl-alert"><div class="callout">${waiverLastTxt(iw.last)}</div></div>` : ''}<div class="lg-body px-wvb"><section class="lg-pane px-board"><div class="lg-ph"><h3>On waivers</h3><span class="lg-pn">${theirs.length} from other clubs</span></div><div class="lg-pb">${tbl}</div></section><div class="px-dside">${side}</div></div>`);
}

if (typeof actions !== 'undefined') Object.assign(actions, {
  pxSrchFam: d => { (ui.search || (ui.search = Object.assign({}, SEARCH_DEF))).fam = d.v; render(); },
  pxDraftPos: d => { ui.draftPos = d.v; render(); },
  pxWvPos: d => { ui.wvFam = d.v; render(); },
});
if (typeof changes !== 'undefined') Object.assign(changes, {
  pxFaPos: v => { ui.faPos = v; },
  pxTrPos: v => { ui.trPos = v; },
  pxUdfaMine: v => { ui.udfaMine = !!v; },
});
