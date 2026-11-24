// =====================================================================
//  THE PRACTICE REPORT
//  How the week went, on one sheet the size of the screen. The club's band and the week's figures; the position rooms as
//  medallions (each room stamped on the club's leather, the rim the metal of its week: gold great, silver good, bronze
//  solid, iron poor), the offense's and the defense's play-callers over them; then the room you pick, man by man (his place
//  in the reps, his week, his playbook, where he works, his character), and beside it the week's standouts or the man you
//  picked. ← → walks the rooms.
// =====================================================================
function prMetal(g) { return g === null || g === undefined ? 'steel' : g >= 72 ? 'gold' : g >= 59 ? 'silver' : g >= 42 ? 'bronze' : 'iron'; }
const prWhen = () => state.phase === 'REG' ? `Week ${state.week}` : state.phase === 'PRESEASON' ? 'Preseason' : state.phase === 'PLAYOFFS' ? 'Playoffs' : PHASE_LABEL[state.phase] || state.phase;
// where a man works this week, if not simply at his own spot: [main spot, second spot, its share]
function prWork(p) { const w = workOf(p); return w.a !== p.spot || w.b ? w : null; }
function prWorkText(p) { const w = workOf(p); return `${SPOTS[w.a] ? SPOTS[w.a].l : p.lbl}${w.b ? ` · ${SPOTS[w.b].l} ${Math.round(w.sb * 100)}%` : ''}`; }
function prInstall(u, side) { const ps = rosterOf(u).filter(p => PRAC_SIDE[p.pos] === side); return ps.length ? ps.reduce((a, p) => a + pbOf(p), 0) / ps.length : 100; }

// ---------- the rooms: a medallion each ----------
function prMedalHTML(r, on) {
  const tip = `${ROOM_NAME[r.pos]}: ${r.avg === null ? 'no report yet' : pracGradeLabel(r.avg).toLowerCase()} · ${r.order.length} men${r.squad.length ? `, ${r.squad.length} on the practice squad` : ''} · ${r.coach ? cname(r.coach) : 'no position coach'} · ${r.tone[0].toLowerCase()}${r.best ? ' · best: ' + pname(r.best) : ''}${r.pb !== null ? ` · playbook ${Math.round(r.pb)}%` : ''}`;
  return `<button class="pr-md m-${prMetal(r.avg)} ${on ? 'on' : ''}" data-action="pracRoom" data-pos="${r.pos}" title="${esc(tip)}"><span class="pm-disc"><b>${r.pos}</b><i class="pr-cnt">${r.order.length}</i></span>
    <span class="pm-plate"><b>${ROOM_NAME[r.pos]}</b><em>${r.avg === null ? 'No report' : pracGradeLabel(r.avg)}${r.pb !== null ? ` · ${Math.round(r.pb)}%` : ''}</em></span></button>`;
}
function prBandHTML(t, rooms, sel) {
  const grp = ([sd, name, groups]) => { const coach = sd === 'O' ? offCaller(t) : defCaller(t), sys = t.sys && t.sys[sd], rs = rooms.filter(r => groups.includes(r.pos)); if (!rs.length) return '';
    return `<div class="pr-grp ${sd === 'O' ? 'o' : 'd'}"><div class="pr-gh"><b>${name}</b><span>${coach ? coachNameLink(coach) : 'No play-caller'}${sys && sys.yrs <= 0 ? ' · <b>new system this year</b>' : sys ? ` · year ${sys.yrs + 1} in the system` : ''} · ${Math.round(prInstall(t.id, sd))}% installed</span></div>
      <div class="pr-meds">${rs.map(r => prMedalHTML(r, r === sel)).join('')}</div></div>`; };
  return `<section class="pr-band" title="The rim is the room's week: gold great, silver good, bronze solid, iron poor. ← → walks the rooms">${PRAC_ROOMS.map(grp).join('')}</section>`;
}

// ---------- the room you picked, man by man ----------
function prRoomHTML(u, rooms, sel, pick) {
  const i = rooms.indexOf(sel), prev = rooms[(i + rooms.length - 1) % rooms.length], next = rooms[(i + 1) % rooms.length], ro = repsOrder(u, sel.pos), nFirst = REPS_FIRST[sel.pos] || 1;
  const known = v => (v.p.seenW || 0) >= 2, lead = sel.rs.work.find(v => v.w >= 0.2), calm = sel.rs.calm.find(v => v.w >= 0.2);
  const coach = sel.coach ? `<span class="dk-k">Coach</span>${coachNameLink(sel.coach)} · ${esc(sel.coach.style)} · develops ${wordPill(asstWord(sel.coach, 'dev'))} discipline ${wordPill(asstWord(sel.coach, 'disc'))}` : '<span class="bad">No position coach</span>';
  const voice = lead || calm ? [lead && known(lead) ? `Sets the work: ${playerLink(lead.p, true)}` : '', calm && known(calm) ? `Keeps it in line: ${playerLink(calm.p, true)}` : ''].filter(Boolean).join(' · ') || 'Your staff is still learning who runs this room' : 'No veteran voice in this room';
  const head = `<div class="pr-r pr-h"><span title="His place in the room's reps: the leather ones take the first-team reps. Click one to set the practice order in the depth chart">Reps</span><span>Name</span><span class="pr-pos">Pos</span><span class="pr-yr">Yrs</span><span class="pr-tier">Tier</span><span>This week</span><span class="pr-tr">Recent</span><span>Playbook</span><span class="pr-gr">Grades</span><span class="pr-wa" title="The spot he practices at. A second spot takes a share of his reps, and a spot that is new to him is where his comfort grows.">Working at</span><span class="pr-ch">Passion</span><span class="pr-ch">Discipline</span><span class="pr-ch">Leadership</span></div>`;
  const row = p => { const ps = p.tid === -3, oi = ps ? -1 : ro.indexOf(p), job = repsJobsOf(p.id)[0] || {}, wk = prWork(p);
    return `<div class="pr-r ${pick && pick.id === p.id ? 'sel' : ''} ${ps ? 'ps' : ''} ${p.prac && p.prac.dnp ? 'dnp' : ''}" data-action="prPick" data-pid="${p.id}">
      <span>${ps ? '<i class="pr-psq" title="Practice squad">PS</i>' : `<button class="pr-n ${oi < nFirst ? 'u1' : ''}" data-action="repsGo" data-k="${job.k || ''}" data-pid="${p.id}" title="#${oi + 1} in the room's reps${job.k ? ` · ${REPS_NAME[job.s].toLowerCase()} at ${jobLabel(job.k).toLowerCase()}` : ''}. Click to set the practice order in the depth chart">${oi + 1}</button>`}</span>
      <span class="pr-nm">${playerLink(p)}${statusPills(p)}</span><span class="pr-pos">${esc(p.lbl)}</span><span class="pr-yr">${p.exp === 0 ? 'R' : p.exp}</span><span class="pr-tier">${tierPill(p)}</span>
      <span>${pracChip(p)}</span><span class="pr-tr">${pracTrend(p)}</span><span class="pr-pb" title="${esc(pbLabel(pbOf(p)))}">${pbBar(pbOf(p))}</span><span class="pr-gr">${rowGrades(p)}</span>
      <span class="pr-wa ${wk ? 'on' : ''}" title="${wk ? 'Working at ' + esc(prWorkText(p)) : 'His own spot'}. Click him to change it">${wk ? esc(prWorkText(p)) : '<i>His spot</i>'}</span>
      <span class="pr-ch">${charPill(p, 'pas')}</span><span class="pr-ch">${charPill(p, 'disc')}</span><span class="pr-ch">${charPill(p, 'lead')}</span></div>`; };
  return `<section class="pr-room"><div class="pr-rh"><button class="pr-nav" data-action="pracRoom" data-pos="${prev.pos}" title="${ROOM_NAME[prev.pos]} (←)">‹</button><h2>${ROOM_NAME[sel.pos]}</h2>${pracRating(sel.avg)}<span class="pill ${sel.tone[1]}">${sel.tone[0]}</span><button class="pr-nav" data-action="pracRoom" data-pos="${next.pos}" title="${ROOM_NAME[next.pos]} (→)">›</button>
      <span class="spacer"></span><span class="pr-sz">${sel.order.length} men${sel.squad.length ? ` · ${sel.squad.length} on the practice squad` : ''}</span></div>
    <div class="pr-coach">${coach}<span class="pr-voice">${voice}</span></div>
    <div class="pr-tbl">${head}${[...sel.order, ...sel.squad].map(row).join('')}</div></section>`;
}

// ---------- beside it: the week, or the man you picked ----------
function prWeekHTML(u, rooms) {
  const all = rooms.flatMap(r => r.graded), top = all.slice().sort((a, b) => b.prac.g - a.prac.g).slice(0, 5), low = all.slice().sort((a, b) => a.prac.g - b.prac.g).filter(p => p.prac.g < 42).slice(0, 5);
  const dnp = rooms.flatMap(r => r.order).filter(p => p.prac && p.prac.dnp), xt = [...rosterOf(u), ...psOf(u)].filter(p => p.a && prWork(p));
  const line = p => `<div class="pr-wl" data-action="prPick" data-pid="${p.id}" data-room="${p.pos}" title="Show him in his room"><span class="pr-wp">${esc(p.lbl)}</span><span class="pr-wn">${playerLink(p, true)}</span>${pracChip(p)}</div>`;
  return `<div class="pr-week"><div class="pr-st"><b>Top performers</b></div>${top.length ? top.map(line).join('') : '<div class="dk-none">No practice report yet. One arrives with each week of the season and preseason.</div>'}
    <div class="pr-st"><b>Rough weeks</b></div>${low.length ? low.map(line).join('') : '<div class="dk-none">Nobody had a poor week.</div>'}
    ${dnp.length ? `<div class="pr-nt"><span class="dk-k">Did not practice</span>${dnp.map(p => playerLink(p, true)).join(', ')}</div>` : ''}
    ${xt.length ? `<div class="pr-nt"><span class="dk-k">Cross-training</span>${xt.map(p => `${playerLink(p, true)} → ${esc(prWorkText(p))}`).join(', ')}</div>` : ''}
    <details class="pr-how" ${foldAttr('prachelp')}><summary>How practice works</summary><p>A strong week is a small edge on game day and a poor one a small drag. Passion drives it, Discipline a little, a respected veteran who works lifts his whole room, and Consistency keeps a player from having bad weeks. A room's leaders also drive its offseason program and keep its tempers in check.</p>
      <p>Players learn the playbook through reps; who takes the first-team reps is set in the depth chart's Practice view (click a man's number). A player who does not know a call loses that snap to someone who does when possible, and can blow the assignment when he has to play it.</p>
      <p><b>Working at</b> sets the spot a player practices at. A second spot takes a share of his reps and is where his comfort grows (weeks to months, quicker for nearby jobs and quick learners).</p></details></div>`;
}
function prManHTML(p) {
  const jobs = repsJobsOf(p.id), ctl = crossTrainSelect(p), ch = [['pas', 'Passion'], ['disc', 'Discipline'], ['lead', 'Leadership']];
  return `<div class="pr-card"><div class="dk-ch">${posTag(p)}<b class="dk-cn">${playerLink(p)}</b>${statusPills(p)}<span class="spacer"></span><button class="link" data-action="player" data-pid="${p.id}">His file ›</button></div>
    <div class="dk-bio">${esc(JOB_NAME[p.spot] || p.lbl)} · age ${p.age} · ${p.exp === 0 ? 'rookie' : p.exp + ' yr' + (p.exp === 1 ? '' : 's')}${p.tid === -3 ? ' · practice squad' : ` · ${fmtContract(p)}`}</div>
    <div class="pr-kv"><span class="dk-k">This week</span><span>${pracChip(p)} ${pracTrend(p)}</span>
      <span class="dk-k">Grades</span><span>${rowGrades(p) || '<i class="muted">None yet</i>'}</span>
      <span class="dk-k">Playbook</span><span>${pbBar(pbOf(p))} <i class="muted">${pbLabel(pbOf(p))}</i></span>
      <span class="dk-k">Reps</span><span>${jobs.length ? jobs.map(j => `<button class="pill" data-action="repsGo" data-k="${j.k}" data-pid="${p.id}" title="Set the practice order in the depth chart">${esc(jobLabel(j.k))} · ${REPS_NAME[j.s].toLowerCase()}</button>`).join(' ') : '<i class="muted">No practice job</i>'}</span>
      ${ch.map(([k, l]) => `<span class="dk-k">${l}</span><span>${charPill(p, k)}</span>`).join('')}</div>
    <div class="pr-work"><span class="dk-k">Working at</span>${ctl || '<i class="muted">He only plays one spot.</i>'}</div>
    <div class="dk-pills">${tierPill(p)}${upsidePill(p)}</div>
    <div class="dk-k pr-k2">Where he can play</div>${comfortHTML(p)}</div>`;
}

// ---------- the page ----------
function practiceHTML() {
  const u = state.userTid, t = T(u), rooms = PRAC_ORDER.map(pos => pracRoomInfo(u, pos)).filter(r => r.order.length || r.squad.length);
  if (!rooms.length) return '<div class="card">Nobody to practice.</div>';
  const sel = rooms.find(r => r.pos === ui.pracRoom) || rooms[0]; ui.pracRoom = sel.pos;
  const inRoom = [...sel.order, ...sel.squad], pick = ui.prPid ? inRoom.find(p => p.id === ui.prPid) || null : null, man = ui.prSide === 'man' && !!pick;
  const all = rooms.flatMap(r => r.graded), avg = all.length ? all.reduce((a, p) => a + p.prac.g, 0) / all.length : null;
  const good = all.filter(p => p.prac.g >= 59).length, rough = all.filter(p => p.prac.g < 42).length, dnp = rooms.flatMap(r => r.order).filter(p => p.prac && p.prac.dnp).length, xt = [...rosterOf(u), ...psOf(u)].filter(p => p.a && prWork(p)).length;
  const nx = userMatchup(), opp = nx ? (nx.h === u ? nx.a : nx.h) : null;
  const fig = (k, v, s, tt) => `<div${tt ? ` title="${esc(tt)}"` : ''}><div class="k">${k}</div><div class="v">${v}${s ? `<small>${s}</small>` : ''}</div></div>`;
  const pc = v => `<span class="${v >= 85 ? 'good' : v < 60 ? 'bad' : ''}">${Math.round(v)}%</span>`;
  const figs = [fig('The week', avg === null ? '—' : `<span class="${avg >= 59 ? 'good' : avg < 42 ? 'bad' : ''}">${pracGradeLabel(avg)}</span>`, '', 'How the whole team practiced'), fig('Good weeks', good, all.length ? `of ${all.length}` : ''), fig('Rough weeks', rough ? `<span class="bad">${rough}</span>` : 0),
    fig('Did not practice', dnp), fig('Cross-training', xt, '', 'Men working at a spot that is not their own, or splitting their reps'), fig('Offense installed', pc(prInstall(u, 'O')), '', 'How much of the offense the men on that side know'), fig('Defense installed', pc(prInstall(u, 'D')), '', 'How much of the defense the men on that side know')];
  const tabs = `<nav class="dk-stabs"><button class="${man ? '' : 'on'}" data-action="prSide" data-v="week" title="The week's standouts"><i>The week</i>Standouts</button><button class="${man ? 'on' : ''}" data-action="prSide" data-v="man" ${pick ? '' : 'disabled'} title="The man you picked"><i>The man</i>${pick ? esc(pshort(pick)) : '—'}</button></nav>`;
  return `<div class="club ros pr" style="${clubVarsCSS(u)}">
    <header class="cl-mast rs-mast" data-abbr="${esc(t.abbr)}">
      <button class="cl-badge" data-action="team" data-tid="${u}" title="Home">${esc(t.abbr)}</button>
      <div class="cl-id"><div class="cl-over">${esc(t.conf + ' ' + t.div)} · Practice report · ${state.season} · ${esc(prWhen())}${opp !== null ? ` · next: ${nx.h === u ? 'vs' : 'at'} ${esc(T(opp).abbr)}` : ''}</div>
        <div class="rs-name"><h1>${esc(t.region)} <b>${esc(t.name)}</b></h1></div></div>
      <div class="cl-rec rs-count"><div class="cl-big">${avg === null ? '—' : esc(pracGradeLabel(avg))}</div><div class="cl-place">${avg === null ? 'No report yet' : `The week · ${all.length} graded`}</div></div>
    </header>
    <div class="cl-ledger" style="--n:${figs.length}">${figs.join('')}</div>
    ${prBandHTML(t, rooms, sel)}
    <div class="pr-body">${prRoomHTML(u, rooms, sel, pick)}<aside class="dk-side pr-side ${man ? 'man' : 'list'}">${tabs}<div class="pr-sb">${man ? prManHTML(pick) : prWeekHTML(u, rooms)}</div></aside></div></div>`;
}

if (typeof actions !== 'undefined') Object.assign(actions, {
  pracRoom: d => { if (d.pos !== ui.pracRoom) { ui.pracRoom = d.pos; if (ui.prSide === 'man') ui.prSide = 'week'; } render(); },
  prPick: d => { ui.prPid = +d.pid; if (d.room) ui.pracRoom = d.room; ui.prSide = 'man'; render(); if (isPhone()) { const s = document.querySelector('.pr-side'); if (s) s.scrollIntoView({ block: 'start', behavior: 'smooth' }); } }, // a phone: his card is under the room
  prSide: d => { ui.prSide = d.v; render(); },
});
// ← → walks the rooms
if (typeof document !== 'undefined') document.addEventListener('keydown', e => {
  if (!state || view !== 'practice' || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || (e.target.closest && e.target.closest('input, select, textarea')) || !$('#modal').classList.contains('hidden')) return;
  const rooms = PRAC_ORDER.filter(pos => rosterOf(state.userTid).some(p => p.pos === pos) || psOf(state.userTid).some(p => p.pos === pos)), i = rooms.indexOf(ui.pracRoom); if (!rooms.length) return;
  e.preventDefault(); actions.pracRoom({ pos: rooms[((i < 0 ? 0 : i) + (e.key === 'ArrowRight' ? 1 : rooms.length - 1)) % rooms.length] });
});
