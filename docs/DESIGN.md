# Gridiron GM — Design Decisions (v2 overhaul)

**Build status:** Phase 1 players ✅ · Phase 2 coaches ✅ · Phase 3 engine ✅ · Phase 4 calibration & film ✅ · Phase 5 perception ✅ · Phase 6 contracts & roster ✅

Phase 1 notes: `p.pos` (legacy group) is still used by AI roster logic (needs, cuts, FA) until Phase 6. Spot value weights in `SPOTS[*].w` are now calibrated in Phase 4 (`js/derived.js`). True ratings are hidden since Phase 5 (Settings → "Show true ratings (debug)").

Phase 2 notes (`coaches.js`): what the legacy engine can express is wired now — design knobs as net unit matchups, Deception as explosive-play rate, Play Calling as a pre-game tilt + in-game adjustment + a per-snap "won the call" edge vs. the opposing caller, Adaptability bending pass rate / QB-run usage to the roster, tendencies for pass rate, deep share, QB runs, RB1 share and blitz rate, Game Management as an expected-points 4th-down call plus hurry-up timing (others fall back to conventional football), Culture as a steadier game-day form, ST units on returns, S&C on injury rate, recovery time and in-season wear. Scheme familiarity is tracked per team side (not per player) for now.

Phase 3 notes (`js/engine/`): play-by-play engine per PLAYBOOK_SPEC — personnel/formations/packages by front, assignment-based trenches (protections, doubles, chips, blitz/sim/stunt pickups, run fits, combo→climb, pullers, box counts), all play types & tags, man/zone coverage with area ownership and holes, QB pre-snap read + progression + pressure handling, contact/tackling mini-sim, special teams with the 4-attribute kicker/punter models, rulebook clock (timeouts, 2-minute warning, spikes, kneels, Hail Marys, 2-pt chart with a real play from the 2), fatigue-driven rotation (snap counts emerge), predictability/film keys, play-by-play log for user & playoff games. Calibration constants live in `TUNE` (engine/depth.js); `TUNE.spread` is the global "how much talent gaps matter" dial.
Coaching in the engine, measured on identical rosters at extreme knob gaps (95 vs 20): Game Management +0.3 wins · Play Calling +0.8 · all six design knobs +1.9 · Culture ≈ 0 (variance only). Home field ≈ 56%, +2 pts. Best vs. worst natural team ≈ 62–91% / +5 to +23. Known Phase-4 items: points ~+1, completion % ~−2, top passing/rushing totals slightly high, parity slightly high (top teams 12–14 wins).

Phase 4 notes:
- **Attribute value from the engine (`js/derived.js`, generated).** Each game, every player's attributes get random nudges (sd 7). Point margin is regressed on snap-share-weighted nudges, restricted to the attributes the engine reads at each spot, over about 36k games. Ridge solve, then shrinkage by standard error, then a reliability-weighted blend with the design priors, which give rarely-used spots more prior.
  - Positional value is leverage relative to WR X. Results: QB 2.1, SS/MLB/WLB/RB ~1.0, OL ~0.5–0.7, K ~0.2.
  - Scheme multipliers are kept only where significant.
  - Per-spot offsets re-center ratings so an average starter still reads ~74.
- **Scheme fit is mechanical.** A play caller's actual call mix (zone share, deep share, man share, front…) scales the attributes those plays read. The same guard is worth more in a zone scheme if he's agile. Fit feeds AI free agency, draft and trade values. It's shown on the player card and as a roster column.
- **Film / advanced metrics (`engine/metrics.js`).** Every snap is charted:
  - EPA from a down/distance/field-position expected-points table, and success rate.
  - Separation at the catch point, time to throw, and completion probability for CPOE.
  - Pass-block, pass-rush and run-block wins (3.0 s threshold), doubles, stops, missed tackles, and coverage allowed (targets, completions, yards, rating).
  - PFF-style play grades, built from 9 facets (passing, receiving, rushing, pass and run block, pass rush, run defense, coverage, tackling). Each facet is normalized from measured league means so an average starter is about 62 and elite is 85+. Receivers are graded on every route against their man; QB misses don't count against them.
  - Game-level detail is kept for your games and the playoffs. Season sums for everyone, and compact career rows with a career grade.
- **Engine realism fixes found in this phase:**
  - **QB reads.** Decision-Making is now read accuracy (a noisy perception of each window), not pickiness. Elite QBs: ~68–70% / 7.4–8.5 Y/A. Backup-level: ~60% / 6.3.
  - **Defenses on the offense's best receiver.** Coverage shades toward the opponent's best receiver.
  - **Short-yardage and money downs.** Stacked boxes on 3rd/4th & short, and defenses sitting on the sticks. 3rd down by distance now ~65% / 47% / 24%.
  - **Checkdowns** are conceded underneath, so backs catch ~72% with a ~19% target share.
  - **Sacks** are credited to whoever finishes them: cleanup after an escape, or a split when rushers arrive together.
  - **RB committees.** Committee series go to the real RB2. Receivers rarely play RB (larger move costs). Carry leaders land at ~300–380.
- **Long-run stability.** Draft-class quality is set per position (`DRAFT_Q_ADJ`). Positions with many prospects per starting job, like QB and RB, otherwise out-select the starting league. Every position group now holds within about ±2 OVR, and league passing efficiency holds steady over 12 simulated seasons.
- **Saves** moved to IndexedDB, because localStorage's ~5 MB fills up within a few seasons. Old localStorage saves migrate automatically.
- **Known items:**
  - Home field is +3.3 pts (56.8% wins; NFL ≈ +2).
  - Natural best-vs-worst margins run ~20 pts.
  - The regression weights predate the QB-read change. QB Decision-Making was hand-raised to 1.6 after a targeted test; a full re-run (`valuereg.js` + `regsolve.js`) is still worth doing.
  - An all-injured roster (emergency fillers) doesn't record player stat lines.

Status: **LOCKED** unless noted. This is the spec for the ratings/positions/play-model rewrite.

Phase 5 notes (`js/perception.js`):
- **One perception per player.** `p.per` holds three parts: a scouting estimate **b**, hype **h**, and a growth estimate **g**. Consensus value is `b + h`.
- **The estimate b tracks the truth with a lag:**
  - Every game nudges it toward a noisy read of the true rating, scaled by snap share (film). Backups stay foggy.
  - A season-end film review nudges it again.
  - Each offseason, scouts add league-average aging (+~2/yr young, about −0.4/yr past peak; RB peak −1 yr, QB +3, K/P +4) and their growth estimate.
  - The real change (breakouts, cliffs, shocks) stays hidden until training camp and film.
  - Measured accuracy: correlation about 0.96 with truth; RMSE about 2.2 at high confidence and about 3.7 at low.
- **Hype h** comes from:
  - each player's percentile rank on volume stats within his position group;
  - team win%, weighted by starts;
  - awards;
  - a contract-year boost (×1.4 on positive stat hype);
  - combine numbers, for prospects.
  
  It carries over at half strength each year. Measured: perception error correlates +0.25–0.33 with team win% and +0.3–0.47 with yardage, so overrated stat-padders and underrated players on bad teams exist.
- **Who sees what:**
  - AI teams see consensus plus their own deterministic noise per player and season.
  - Every team sees its own players half-way to the truth, because coaches watch practice. That includes you.
  - The engine always plays the truly better player. Depth charts and film grades are honest signals.
- **AI decisions run on perception:** market value and asks, re-signing, free agency, the draft board, cuts, trade value and needs. FA asks correlate 0.61–0.66 with perception versus 0.52 with truth. Draft order correlates about −0.65 with true potential.
- **Labels:**
  - **Tier:** league-wide rank by consensus within the position group, against starting jobs. Elite is the top 3%, All-Pro the top 10%, Starter covers the starting jobs, Rotation/Backup up to 1.75×, and Depth up to 2.6×. Below that, players are Project/Fringe/Washed by age.
  - **Upside:** perceived ceiling against the same cut lines. Special Teamer covers athletic players whose ceiling is depth-level.
  - **Trait tags:** 2–3 scouting phrases built from attribute deviations, weighted by how much each attribute matters at the spot. They're blurred by low confidence.
  - **Confidence and buzz:** shown alongside the tags.
- **Training camp:** surprises (true change minus expected change) of 2.5+ get reported 70% of the time, padded with false reports so about 30% of reports are wrong. True reports move perception by half the surprise; false ones by ±1.2. Shown on Home through week 5, with notable ones in the news. A season-end "Breakout season" / "Disappointing year" news item fires on perception swings of 4+.
- **UI:** labels everywhere instead of OVR/POT (roster, FA, draft board, trade, player card scouting report). Settings has a debug toggle for true numbers and attributes. Old saves get perception on load.

Phase 6 notes (`js/contracts.js`):
- **Contracts:** `{amt, yrs, gtd, next?, rookie?, opt5?, tagged?}`.
  - **Guarantees** work like a prorated bonus: an even share is used up each year.
  - **Dead money if cut** is the remaining guarantee. Offseason cuts of multi-year deals split it over two league years (post-June-1 style); in-season cuts accelerate all of it.
  - **Guarantee share at signing** depends on perceived tier: Elite ~68%, All-Pro ~55%, Starter ~38%, depth ≤10%. Players 31+ get less; one-year deals get at least 50%.
- **Cap growth:** +6% ±1.2%/yr; minimum salary and practice squad pay scale with it.
  - A market index `state.mkt` steers league median payroll toward ~93% of the cap. It flattens the pay curve, so the middle class gets paid while each position's top-of-market stays anchored to its ceiling.
  - Measured over 7 seasons: median payroll 85% rising to 92–95%; top QB 19–22% of cap; top WR 11–14%; top RB 4–6%; worst team dead money up to ~$50M.
- **Rookie scale:** about 3.9% of cap for the #1 pick, falling to the minimum.
  - Round 1 is fully guaranteed, round 2 50–75%, later rounds ~8%.
  - 1st-rounders carry a **5th-year option**, decided before year 4 at the average of the position's 3rd–20th salaries, fully guaranteed. Exercised for stars, and for starters when the price is at or below their market. About 55–65% get exercised.
- **Franchise tag:** one per team per year, one fully guaranteed year.
  - Price: 1st tag = max(top-5 average at the position, 120% of last salary); 2nd = 120% of last; 3rd = 144% of last or the QB tag.
  - The AI never tags a third time and caps a second tag at 15% of the cap. About 2–6 tags league-wide per year.
- **Extensions:** for players entering their final year, any time from re-signing season through the trade deadline. They start next league year (`contract.next`). Asks run about market +4%. The AI extends up to 2 core players per year: about 40–60 extensions league-wide.
- **Restructures:** when a team can't get under the cap by cutting (everything left is guaranteed), it converts this year's salary into a charge on next year's cap.
- **Practice squad:** 16 per team (6 veterans max), `tid -3` plus `psTid`.
  - Squads fill at cutdown and are refilled in-season, balanced across position groups. Undrafted-type rookies are generated if the street is empty.
  - Squad players develop under the team's coaches.
  - Promotions happen automatically when a position runs dry (always for AI teams; for your team in emergencies or on auto-manage). About 10–20 per season.
  - Other teams poach about 2–7 a season, and you get news when it's your player.
  - In the offseason, the best 8 (age ≤27) are kept on reserve/future deals; the rest hit free agency.
- **Game day:** 48 of the 53 dress. Coaches sit the least valuable surplus bodies while keeping positional minimums.
- **Injured reserve:** injuries of 4+ weeks go on IR (frees a spot), with a 4-week minimum stay and 8 returns per team per season (after that, season-ending). Activation cuts the lowest-value player who actually saves money. Players still hurt at cutdown open the season on IR.
- **Roster legality** is enforced everywhere: trades that push a team past 53 trigger a cut, and everyone opens the season cap-compliant. Over 6 audited seasons: max active 53, max dressed 48, no team-weeks over the cap.
- **Performance:** rosters are indexed in one pass and invalidated through `setTid()`, about 2.7× faster season sims.
- **Edge cases tested:**
  - Cap hell (+$150M) resolves through restructures and cuts.
  - A whole roster expiring rebuilds through free agency.
  - An 18-injury crisis is handled by IR plus practice-squad promotions, with 48 still dressing.
  - The IR return limit holds.
  - Repeat tags escalate in price.
  - Options get declined for busts and exercised for stars.
  - Offseason vs. in-season dead money and over-53 trades behave as specified.
  - 25 years of cap growth stays sane.
  - Emergency fill-ins now get box-score lines.

Post-Phase-6 modifications (round 1):
- **Positional comfort** (`p.cf`, attributes.js) replaces size/athleticism-implied flexibility.
  - Levels: Natural 85+, Comfortable 60+, Decent 30+, Raw, Unfamiliar.
  - The penalty on technique and mental attributes at a spot is 16·(1−c/100)^1.6: Decent about −6 to −9, Raw about −12 to −16.
  - Histories favor close pairs (DT/DE/NT, G/G, LT/RT, MLB/WLB, FS/SS, X/Z, Y/H, CB/NCB).
  - Learning comes from game reps (0.015 per snap), weekly practice when listed on the depth chart (1.4/week), and training camp (+30). Each is scaled by the hidden Adaptability trait, football IQ, age and coaching, so a comfort level takes roughly a camp to a season. Unused spots fade 4/yr.
  - AI teams weigh spot-level needs (front-aware) in free agency and the draft, and cross-train thin spots in camp. Only about 2–3% of starters are Raw or Unfamiliar.
- **Depth chart** (`js/depthchart.js`): a base chart by slot plus package overrides (passing-down back, short-yardage back, 4-man rush unit) and K/P/returner. Per-slot rotation shares give the No. 2 discretionary snaps (RBs by series, others by play). Each unit can be set to auto (staff) or manual. Kneels, spikes and the play-caller's QB read all follow the chart.
- **Player card:** a header with ★ stars, tier and upside, season grade and recent form.
  - Left side: scouting read, Strengths/Weaknesses, positional comfort, scheme fit, contract.
  - Right side: an At a Glance panel with facet grades and splits (QB clean/pressured/depth/PA/blitz; receivers vs man/zone/press/contested; zone/gap run game; pass pro vs 4-man/blitz; pass rush vs single/double; man/zone coverage).
  - Tracking metrics with league ranks among qualified same-position players and percentile shading; combine results shaded by positional percentile.
  - Last season's data stays viewable through the offseason.
- **★ Stars:** position-relative ability (league-average starter ≈ 2.5–3★), weighted 45% toward a recency-weighted average of the last 6 game grades.
- **Roster page views:** Scouting, Contracts, Season Stats, Advanced, Positional Comfort, True Ratings (debug). Position filter, sortable columns, a wider layout.
- **Staff page and coach cards:** a roster-style list with a team selector. Cards split Game Day knobs from Development knobs and show a player-development track record (young players' average change per offseason).
- **Game-day popups:** a preview (line, win chance, players to watch, injuries), then a wrap (headlines, line score, team stats, best/struggled/breakout performers, injuries, around the league). Toggle in Settings.
- **Playbook (view only):** each team's identity and tendencies, a self-scout (usage, EPA and success by personnel, play type, situation, formation, tags, coverage, pressure, package), and who's on the field per personnel and package.
- **Navigation** fires on press (pointerdown) so clicks can't get lost.

Round 2:
- **Route inheritance:** when heavier personnel (12/13/21/22) takes a receiver off the field, the extra TE runs his route; a fullback inherits only short ones. The third TE always has a route.
  - TE2s went from checkdown-only to real targets (5–28 a season), and TE3s now get seams.
  - TE share is about 18% of targets. Calibration is unchanged.
- **Depth chart:**
  - Formation-board layout with Offense / Defense / Packages & Special Teams sub-tabs, and a pinned order panel.
  - SLOT CB / SLOT CB2 names.
  - The passing-down rush unit is split into edge and interior rush specialists (`RUSHE`/`RUSHI`; old `RUSH` lists migrate).
- **Free agency:** RB and FB are separate families. New columns: YOE, previous team, previous AAV, market value.
- **Player card:** RAS (0–10, mean of positional percentiles on height, weight, 40, 10, vertical, broad, 3-cone, shuttle, bench; jumps were added to the combine and backfilled from explosiveness), plus a grades-by-game chart (season game log, last season kept through the offseason). RAS also shows on the draft board.
- **Light theme** by default (Settings → Theme for dark). Scripts and the stylesheet load with a cache-busting query string, and render or runtime errors show in an on-screen banner.

Round 3:
- **Scouting language (`js/scouttext.js`):**
  - Every trait has three grades of good and three of bad, each with several wordings (stable per player).
  - A one-line **player profile** combines level, calling-card role, a second asset and the biggest hole. All of it is relative to the rest of the player's own game, so depth players read as distinct types.
  - Weaknesses are graded 45% against a starter and 55% against his own level. Bargain-bin players also get "best part of his game" lines.
- **Popups stack:** cards open over the game recap, box score or another card with a Back button; × or the backdrop closes all.
- **Trade page:** names open cards; "The deal" lists every asset on both sides.
- **Career view on the card:** Stats or Ratings (grades by season, plus your tier and upside read at each season's end, recorded from now on).
- **Player Search page:** name, where (FA, other teams, practice squads, prospects…), team, age range, minimum tier and upside, cap hit, comfortable-at spot, contract year, and position family. Sortable.
- **Draft classes are generated at season start** and are visible and searchable all year. Prospect reports sharpen weekly (confidence caps at 0.4 before the draft).
- **Preseason (`js/preseason.js`):**
  - Every team signs camp bodies to a 70-man roster.
  - Three exhibition games: starters sit, the twos play the first half and the threes the second.
  - Snaps feed film (perception), positional comfort and a preseason grade. Injuries are real; nothing counts in standings or season stats.
- **Cutdown Day (phase `CUTDOWN`):** a coaches'-meeting page with room counts vs. what the staff would carry, a position-coach summary, a per-player staff verdict (Keep / Bubble / Cut / Cut → PS) with reasoning, and your Keep/Cut call. The staff finishes anything left undecided.
- **Fixes:** kneels with no real QB on the roster credit whoever takes the snap; negative money formats as −$X.


## 1. Player evaluation (what the GM sees)
- True ratings are hidden. The GM sees scout **perception** with confidence that grows with experience/snaps. AI teams see through the same fog (their own noise).
- **Current tier** (percentile within position, league-wide):
  Elite (top ~3%) · All-Pro (top ~10%) · Starter · Rotation *(RB, WR, EDGE, DT, CB)* / Backup *(QB, OL, TE, LB, S, K, P)* · Depth · Project (≤25) / Fringe (26–29) / Washed (30+)
- **Upside** (hidden ceiling projected on same scale):
  Elite · High-End Starter · Solid Starter · Borderline Starter · Strong Depth · Decent Depth · Special Teamer · Limited Upside
- Trait tags (2–3 scouting phrases) instead of attribute numbers.
- Market (contracts, trades, draft) prices *perception*, not truth → exploitable inefficiencies.
- Development: hidden dev curve (early peak / normal / late bloomer), hidden ceiling, fat-tailed yearly shocks (breakouts, stalls, cliffs). Noisy training-camp reports (~70% reliable).
- Player value/overall is **calibrated from the sim** (regression of attributes on team point differential), not hand-weighted.
- Hidden "true ratings" debug toggle in Settings, off by default.

## 2. Positions
**Offense spots:** QB · RB · FB · X WR · Z WR · Slot WR · Y TE (inline) · H TE (move) · LT · LG · C · RG · RT
**Defense roles:** NT (0/1) · DT (2i/3) · DE (4i/5) · EDGE (7/9, 4-3 DE & 3-4 OLB) · MLB (MIKE) · WLB (WILL) · Outside CB · Slot CB · FS · SS
- SAM is not a position: plays as EDGE (3-4) or LB/EDGE by fit (4-3).
- Technique alignment is a **scheme** property (DC's front: 4-3 over/under, 3-4 odd/tite, wide-9), not a player property.
- **Eligibility is computed**: each player has a fit score at every spot from attributes + body; eligible where fit ≥ ~90% of best. Labels collapse families: LG+RG→G, G+C→IOL, LT+RT→OT, X+Z+Slot→WR, FS+SS→S; otherwise combos (Slot CB/SS, DT/DE, EDGE/DE).
- Visible measurables (height, weight, arm length, combine times); skills hidden.

## 3. Snap distribution (emergent from personnel, not hardcoded)
- Offense personnel usage set by OC scheme (league avg: 11 ~60%, 12 ~20%, 21 ~5–10%, 13/22 ~5%, 10/empty ~3%).
  QB 100% · OL 100% · TE1 85–95% · WR starters 80–90% + all key passing snaps · FB only in 21/22 · RB1 50–90% of carries by scheme, 3rd-down back on passing downs.
- Defense packages set by DC (base ~25%, nickel ~60%, dime ~10%, goal line ~2%).
  EDGE1/2 75–85% · EDGE3 30–40% (sub-rush) · DT 65–80% · NT 35–50% (base only) · DE slides inside on passing downs · MLB ~95% · WLB 70–90% · SAM-type ~25% · CB1/2 ~100% · Slot CB 60–75% · S ~100%.
- 3rd-and-long sub-rush package: best 4 rushers regardless of listed position.
- DL rotation governed by hidden Stamina.

## 4. Play model
Calls are fully automatic, driven by OC/DC tendencies. The GM builds the roster; coaches call the game.

1. **Personnel + Formation** — 10/11/12/13/21/22/Jumbo · Under center / Shotgun / Pistol / Empty · RB-out / TE-detached
2. **Play type** (defined by mechanics: blocking & timing, defenders stressed, yardage shape, counters)
   - Runs: **Base Run** = Carrier (RB / QB / WR) × Direction (Inside / Outside); plus **Draw · Option · QB Sneak · Jet Sweep**
   - Pass: **Quick · Dropback · Deep Shot · RB Screen · WR Screen · Gadget Pass** (HB/WR pass, flea flicker)
   - Situational (triggered by game state): **Hail Mary · Spike · Kneel**
   - Pass depth emerges from the QB's read vs. coverage (no Short/Intermediate split); OC style weights the read.
3. **Required dimension** — Runs: **Zone / Gap** (gap = power, counter, trap). Pass: protection implied by play type.
4. **Optional tags** — Motion · Trickery · Play-Action · Bootleg · Rub · RPO (runs) · Sideline (auto in 2-minute)
5. **Defense** — Package · Front · Coverage (Cover 0/1 man, Cover 2/3/4 zone) · Pressure (4-man, 5-man blitz, sim pressure)

Target selection is a separate layer: concept role (primary/secondary/checkdown) × coverage (man: matchup win; zone: concept soft spot) × QB processing. Designed-touch plays (screens, jet, gadget) have a fixed primary.

A compatibility matrix will prevent nonsense combos (e.g., PA Hail Mary, RPO Sneak).

## 5. Attributes (hidden, 1–99)
Shared pools per side of the ball (every defender has every defensive attribute, etc.) so position fits and hybrids emerge. Every attribute must feed at least one matchup.
- **Athletic (all):** Speed · Burst · Agility · Strength · Size — shown only as noisy combine measurables (40, 10-split, 3-cone/shuttle, bench, height/weight/arms)
- **Passing:** Short Accuracy · Deep Accuracy · Arm Strength · Processing (speed of read) · Decision-Making (risk) · Pocket Presence · Throw on the Run
- **Ball carrying:** Vision · Elusiveness · Contact Balance · Ball Security
- **Receiving:** Route Running · Release · Hands · Contested Catch
- **Blocking:** Pass Block · Run Block (zone vs. gap fit comes from Agility vs. Strength) · Blocking Awareness (blitz/stunt pickup, combo climb timing)
- **Defense:** Pass Rush · Block Shedding · Tackling · Ball Stripping · Play Recognition (universal counter to PA/draw/screen/RPO/trickery/boot) · Man Coverage · Zone Coverage · Press · Ball Skills
- **Kicker:** Kick Consistency · Comfort Range · Range Falloff · Trajectory
- **Punter:** Punt Distance · Directional Placement · Hang Time · Spin Control
- **Trenches:** assignment-based (count → assign 1v1/double/combo-climb/unblocked → resolve); see PLAYBOOK_SPEC 0a
- **Hidden traits:** Durability · Consistency · Stamina · Development Curve · Ceiling
- Individual matchups by alignment (OT vs EDGE, G vs 3-tech, C vs NT; CB vs WR in man, zone areas otherwise).

## 6. Coaches
Three distinct layers: a **rulebook** every coach obeys, visible **tendencies** (style), and hidden **quality** knobs (shown as reputation tiers + track record, never numbers). Coach reputation has fog like players ("hot coordinator" carried by a stacked roster can be overrated).

### 6a. Staff & knobs
| Coach | Quality knobs | Style (visible) |
|---|---|---|
| **HC** | Game Management · Culture (team-wide Consistency floor; Discipline later) | 4th-down & 2-pt aggressiveness · late-game clock conservatism · play-caller role (Off/Def/None) · background |
| **S&C** | **Injury Prevention** (per-snap injury risk) · **Recovery** (in-season wear between games, return speed from injury) · Development: **Strength/Power** · **Speed/Agility** | — |
| **OC** | Play Calling · Adaptability · **Run Design** · **Pass Design** · **Deception** · Development: **QB · Ball Carrying · Receiving · O-Line** | Personnel mix · formation · run/pass rate · Zone/Gap split · Quick/Dropback/Deep mix · tag rates (Motion, PA, RPO, Boot, Screens, Trickery) · QB run usage · RB bell-cow vs. committee |
| **DC** | Play Calling · Adaptability · **Front Design** · **Coverage Design** · **Pressure Design** · Development: **Pass Rush · Run Defense · Coverage** | Front (4-3/3-4/Tite/Wide-9) · package lean · Man/Zone split · single- vs. two-high · blitz / Sim pressure / stunt rates |
| **STC** | Coverage & Return Units · Development: **Specialists** | — |

### 6b. Development by skill group (position-agnostic, so hybrids work)
| Group | Attributes | Developed by |
|---|---|---|
| Quarterbacking | Short/Deep Accuracy, Processing, Decision-Making, Pocket Presence, Throw on the Run | OC |
| Ball Carrying | Vision, Elusiveness, Contact Balance, Ball Security | OC |
| Receiving | Route Running, Release, Hands, Contested Catch | OC |
| O-Line | Pass Block, Run Block, Blocking Awareness | OC |
| Pass Rush | Pass Rush, Ball Stripping | DC |
| Run Defense | Block Shedding, Tackling, Play Recognition | DC |
| Coverage | Man, Zone, Press, Ball Skills | DC |
| Specialists | All K/P attributes | STC |
| Strength/Power | Strength, Arm Strength, Comfort Range, Punt Distance | S&C |
| Speed/Agility | Speed, Burst, Agility (mostly slows age decline; real gains are small) | S&C |

**In-season wear (new, driven by S&C Recovery):** heavy workloads (RB carries, DL snaps, hits taken) build wear across the season → small temporary dips to athletic attributes and higher injury risk; Recovery reduces wear buildup and speeds return from injury. Wear resets in the offseason.

### 6c. Design knobs (matched pairs; only the net difference applies, capped small)
| Offense | vs. | Defense | Acts on |
|---|---|---|---|
| Run Design | ⇄ | Front Design | Run blocking assignments: angles, combo/climb timing, box numbers, unblocked-defender placement, draws/option |
| Pass Design | ⇄ | Coverage Design | Separation vs. coverage, protection free-rusher rate, QB read difficulty (disguised shells) |
| Deception | ⇄ | (defense Play Recognition) | PA, Motion, Trickery, RPO, screens, gadgets; offensive predictability |
| (offense Blocking Awareness / QB Processing) | ⇄ | Pressure Design | Blitz, Sim pressure, stunt pickup difficulty; defensive predictability |

No generic "execution" bonus — design works through play mechanics, so effects show up as free runners, open receivers, missed pickups.

### 6d. Game management
- **Rulebook (all coaches, always):** use timeouts in final 2:00 when the clock matters (offense trailing; defense to get the ball back) · 2-minute play pool (no runs with no timeouts unless spiking) · spike / Hail Mary / walk-off FG / kneel when appropriate · must-go 4th downs when kicking ≈ no win chance · obvious 2-pt decisions.
- **Gray zone only** (4th-and-short near midfield, FG vs. go 30–40, 2-pt chart edges, first-half timeouts, when to start hurrying, clock-killing): a simple win-probability check rates options; **Aggressiveness shifts the threshold, Game Management sets the noise.** Mistakes are realistic ones (punting 4th-and-1 at the opp. 40), never absurd ones.

### 6e. Play calling
- Calls are **simultaneous**; nobody sees the other's call. Callers use only film tendencies, in-game observations, and situation.
- Quality = bounded **tilt** of the scheme's call mix toward situation fit, matchup targeting (weakest defender/blocker), exploiting opponent tendencies, and in-game adjustments. Tilt capped (~±20%); mix always stays mixed.
- **Two levels of thinking max** (level 2 = "they expect run, so PA" — elite only). No infinite regress.
- **Predictability:** each offense/defense has a tendency signature by down/distance/personnel/formation. Over-calling a play type from a look gives the opponent a capped recognition bonus against it. Tradeoff: calling your best play vs. staying unreadable. Deception/Pressure Design shrink the signature.

### 6f. Scheme changes
- New coordinator installs his scheme immediately, softened by Adaptability (adaptable coaches bend toward the roster's strengths; rigid "system" coaches don't).
- Players in their first season in a system get a small, fading penalty to mental attributes (Processing, Play Recognition, Blocking Awareness) → continuity has value.
- Scheme **fit** is not a bonus; it emerges because schemes call plays that use certain attributes. Fit is shown as a label and used in AI valuation (per-scheme attribute weights from calibration).

### 6g. Scheme archetypes (generation presets; each coach varies within)
- Offense: Wide Zone/Boot · Spread/Air Raid · Power/Gap · West Coast · Vertical · RPO/QB Run
- Defense: Two-High/Fangio · Cover 3/Seattle · Wide-9 Attack · Man-Blitz · 3-4 Two-Gap

### 6h. Impact targets (calibration)
Game Management ≈ 0.5 wins/season elite vs. poor · Play Calling ≈ 1–1.5 · whole staff ≈ 2–3. Players stay the main driver.

### 6i. Play-calling HC & coaching trees
- An HC may call plays for one side: he then has Play Calling + Adaptability and his tendencies drive that side; the coordinator keeps his Design and Development knobs.
- Coaching trees: HCs lean toward hiring coordinators from their scheme family / former assistants; promoted assistants carry their mentor's scheme.

## 7. Aging
| Group | Attributes | League-typical curve |
|---|---|---|
| Explosive | Speed, Burst, Agility | Peak ~24–26, declines first and fastest |
| Power | Strength, Arm Strength, Comfort Range, Punt Distance, Hang Time | Peak ~26–30, slow decline |
| Technique | Accuracy (both), Throw on the Run, Route Running, Release, Hands, Contested Catch, Elusiveness, Contact Balance, Ball Security, Pass/Run Block, Pass Rush, Block Shedding, Tackling, Ball Stripping, Man/Zone Coverage, Press, Ball Skills, K/P technique | Peak ~26–29 (K/P ~28–34) |
| Mental | Processing, Decision-Making, Pocket Presence, Vision, Play Recognition, Blocking Awareness | Grows into early/mid 30s |

**Individual variation (outliers allowed):** every player gets his own peak-age offset and decline rate *per group*, drawn from a bell curve with fat tails. Most players follow the league curve; a few age like freaks (40-year-old QB, 33-year-old RB still explosive), a few fall off early. Development Curve shifts the windows; S&C Speed/Agility & Strength/Power development slow decline; yearly random shocks (breakouts, stalls, cliffs) sit on top.

## 8. Perception & market
- **Hype bias:** perception over-weights volume stats and team success (stat-padders on big offenses overrated, good players on bad teams underrated, contract-year spikes inflate value). AI teams price perception (with their own noise) → exploitable inefficiencies.

## 9. Contracts & roster rules
- Contracts: annual amount × years + **guaranteed money** (drives dead cap) · **extensions** before expiry · **franchise tag** (1/team/year) · **rookie scale** with **5th-year option** for 1st-rounders · **cap growth** ~5–7%/yr. (No bonus proration, void years, or incentives yet.)
- Roster: 53-man active · **16-man practice squad** (Projects develop there; AI can poach; promotions on injury) · 48-man game-day actives · IR minimum stay.
- **Negotiating leverage:** league-consensus tier and age set a player's leverage. He has a preferred length; other lengths cost more per year the higher his leverage (and stars refuse lengths far from it), while fringe players take any length and give a small discount for extra years. Applies to re-signings and extensions.
- **Upcoming free agents:** Free Agents → "Upcoming free agents" lists every player in the last year of his deal, with market value, leverage and an outlook on whether his team keeps him.

## 10. Defensive usage & stat credit
- Defensive linemen play in waves (rating gaps count half against fresh legs): lead edge ~80% of snaps, third edge ~35–40%, fourth tackle ~25%. Linebackers and defensive backs stay on the field.
- Players stay in their own rooms: a safety is not used as a linebacker just because he grades close.
- Tackle credit: linemen who hold the point often spill the play to the second level; the free linebacker and box safety share credit with the pile; ~9% of tackles add an assist. Team totals ~1,040 a season, leaders ~170–190.
- Sacks: finishing depends less steeply on rusher rating and credit goes to anyone arriving with the first man, so leaders top out near 20 and ~20–25 players reach double digits.

## Deferred
- Penalties / Discipline attribute
- Leadership / intangibles

## Open
- None for v2. Play/tag/defense details, compatibility matrices and the attribute index live in `PLAYBOOK_SPEC.md`.
