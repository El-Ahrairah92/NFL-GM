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

## 11. Stat-range calibration (leaders and team spread)
League averages were right but the spread between teams and players was too wide. Causes found and fixed:
- **Play-action was worth +5 yards per attempt** (11.0 vs 6.0), so PA-heavy schemes won regardless of talent. Now ~8.7 vs 6.6 (shallower PA routes, fewer defenders bite, smaller separation bonus). Screens gain real yards (were ~1 yd).
- **Talent leverage tempered:** `TUNE.spread` 0.55 → 0.5, `TUNE.spreadQB` 0.85 → 0.66. Ratings still order outcomes; the gaps are smaller.
- **Run/pass identity tempered:** `TUNE.passLean` 0.55 scales how far a play-caller strays from the league mix; base pass rate clamped to 47–64%.
- **Rushing:** QB scrambles gain yards (were tackled at the line), jet sweeps too; backs add less after contact (`runAfter`); carries tire a back more (`carryLoad`) and committees are more common, so the lead back averages ~46% of team carries.
- Measured with `leaders.js` (season leaders, per-player rate distributions, team spreads) and `decomp.js` (which inputs drive team results).
- Known gaps: completion % spread is still wide at the bottom; 20+ yard completions are low.

## 12. The offensive line
A controlled test (half the league given an elite line, half a bottom one) showed the line moved pressure and sacks but not passing efficiency: a QB with a clean pocket ran his reads on a fixed clock and threw, so time bought nothing.
- **Clean pocket = routes come open.** While protection holds, the QB can hold on an intermediate or deep route (`TUNE.pocketOpen` separation per second held) and works back through his progression instead of dumping it off. Intermediate and deep routes start more covered (`midCov`, `deepCov`), so a poor line is pushed into the short game.
- **Trench gaps count more:** `rushScale` 0.03 → 0.036 (pass rush vs protection), `runScale` 0.055 → 0.12 (run block vs front).
- Result in ordinary leagues, per one standard deviation of line quality: 0.16 offensive TD a game (QB 0.25, receivers 0.12), 0.12 yards per carry (the back himself 0.17), 3.3 points of pressure rate. An elite line versus a bottom one is roughly 4–5 points a game.
- Check with `olexp.js` (controlled split) and `decomp.js` (natural leagues).

## 13. Margins of victory
Games were decided by 16.9 on average (NFL 11.3) with 21% decided by 28+. Talent gaps explained a normal amount; the excess was a hidden team-wide form roll each game (`TUNE.teamForm`), which shifted every player at once. Cut from 1.6 to 0.4, home field from 0.6 to 0.3 (now ~1.5 points). Teams protecting a second-half lead run more and play soft shells (`call.soft`). Result: average margin ~11, 14% of games by 21+, 6% by 28+, heavy favourites win ~80%. Check with `blow.js`.

## 14. Offensive usage
- Receivers and tight ends rotate (rating gap discounted against fatigue): WR1 ~95% of snaps, WR4 ~23%, TE1 ~83%, TE2 ~30%. A fullback is not used as the tight end.
- Backs are the outlet less often (17% of targets, was 25%); the QB looks for his best receiver; tight ends work the seams. Mobile QBs scramble and run by design more (top ~650-700 yards).
- **Planned rest series** (`REST_P`): each drive a starting receiver (7.5%, slot 4%) or tight end (14%) may sit, never in the two-minute drill or late in games. Fatigue alone cannot rotate an offense because it rests whenever the defense plays. The third back takes about a quarter of the No. 2's series. Result: WR 91/82/67/23/10% of snaps, TE 76/33/13%, carries 47/28/8%.
- **Sacks by alignment** match the NFL (edge ~50%, interior ~26%, blitzers ~23%): interior rushers get home slower (`TUNE.insideRush`) and finish less often, and credit is shared among everyone arriving with the first rusher. About 23 players reach 10 sacks; tackles average ~3.5. Check with `sackdist.js` and `sackslot.js`.
- Injuries away from the ball, in the trenches and on sacks are more common: about 19 QBs start 16+ games and over a third of starting linemen miss time. Check with `offuse.js`.

## 15. Rookie free agency (post-draft)
- New phase `UDFA` between the draft and preseason, three rounds. The undrafted class is topped up to 240 players; the league sees them as depth or projects at best (a few are really much better).
- Offers are a guaranteed signing bonus ($0 to $200K) on a three-year minimum deal. Every other team builds its own target board each round. On "Send Offers" each player picks a team: money, his path to a roster spot there, and personal preference.
- The user's roster is never auto-filled: no camp signings and no roster fill at the start of the season. Warnings fire before camp opens thin and before a season starts short at a position. (Practice squad auto-fill is unchanged.)

## 16. Camp roster, cutdown, waivers and the practice squad
- **Roster rules (checked against the NFL):** 90 in the offseason and camp, one cutdown to 53 after the last preseason game; practice squad 16, of which up to 6 may have 3+ seasons (no experience ceiling on those six); players with fewer than 4 seasons go through waivers when released, veterans are free agents at once.
- **Cutdown Day:** each player is Keep, Cut or Practice squad, with an "If waived" read on whether another team would claim him.
- **Waivers phase** (`WAIVERS`, between cutdown and week 1): every team's cuts hit the wire together. Claims are awarded worst record first; the claiming team takes the existing contract and names who it drops. You can also mark other teams' cuts as practice squad targets (they may prefer their old club). Your own practice-squad designations come back if they clear.
- **Nothing is done for the user:** no practice squad fill, no injury call-ups (a warning fires if you would play short-handed), no automatic reserve/future deals (sign them one by one in the re-signing period; the rest are released). New leagues start with a practice squad in place.

## 17. Preseason playing time
- Plan per team (`state.prePlan` for the user; other teams use the coach's plan): starters sit, or play a series, a quarter or a half. "Coach's plan" is a series in game one, a quarter in game two, the night off in game three.
- Per player: Feature (stays in for extra snaps) or Hold out. Set from the Preseason roster view or his card.
- Who is in is re-evaluated every drive. Backups give way to the third string after halftime.
- The game wrap shows a snap report: snaps, grade, preseason total and who is still short of film. No bonus for playing starters: the gains are film and positional reps, the cost is injury exposure.

## 18. Practice, playbook knowledge and character
- **Hidden traits** (`p.h.work`, `disc`, `lead`): Work Ethic, Discipline, Leadership. The user's staff reads them as labels that sharpen with weeks in the building (`p.seenW`); nothing is shown for the first two weeks.
- **Practice week** (`practiceTeam`, every week including preseason): grade = Work Ethic and Discipline, plus the room's tone, plus playbook knowledge and head-coach culture, plus noise whose downside shrinks with Consistency. Game-day form is now the practice result (about ±1 rating point typically, ±3 at most) plus a smaller unseen roll.
- **Room tone:** each veteran's influence is Leadership × seniority relative to that room's median experience; what he spreads is his own habits (Work Ethic + Discipline), so a respected veteran with bad habits drags younger players down.
- **Playbook knowledge** (`p.pb`, 0-100): arrivals start at 26-44 (more if they ran the same system elsewhere), learn a share of what is left each week (faster with Work Ethic, learning speed and first-team reps; slower at QB, OL, LB, S), and camp is worth five weeks. A new coordinator with a new system cuts a unit to roughly half. Replaces the old team-wide familiarity penalty.
- **Soft gate:** every call has a complexity (`offNeed`, `defNeed`, 35-80). A player below it is passed over for the snap when a teammate knows it, and may bust (large one-play penalty; less likely for disciplined players) when he has to play. A quarterback still learning gets a simpler menu.
- **Reps:** the user orders each position group on the Practice page; first-team reps teach fastest, and playing without them costs a little, most at QB and OL.

## 19. Staff hierarchy
- **Tiers:** head coach and coordinators (full cards) · four specialists per team (pass game, run game, pass defense, run defense coordinators: a lean, an expertise rating, a personality) · eight position coaches (QB, RB, WR, TE, OL, DL, LB, DB: Development and Discipline, a personality, and keywords for system background and lean). Assistants live in `t.asst` and `state.coaches` with `tier` 3 or 4.
- **Influence:** the play-caller's tendencies are the base; when the head coach calls plays the coordinator supplies 30%; each specialist's lean shifts its fields by 8-18% (more when his position coaches share the lean). `blendedTend` caches this per team. Design ratings are 75% coordinator, 25% specialist (`designKnob`).
- **Development** moved off the coordinators (their dev ratings are gone): 70% position coach, 15% head-coach culture, 15% the specialist over the room. Strength and special teams are unchanged. Position coach Discipline feeds practice grades, softens a bad-attitude veteran, and lowers bust rate; both coaches speed playbook learning.
- **Ratings are shown as words** and are rougher for coaches you have not worked with; they firm up over about three seasons on your staff.
- **Hiring:** a new coordinator replaces about half his side's assistants with his own people; open jobs are filled when the carousel closes. The user may replace or promote any assistant during the carousel.
- **Ladder:** strong position coaches become specialists, strong specialists become coordinators (league-wide each offseason, or by the user into an open job). On promotion the background keyword becomes the system, the lean is baked into the tendencies, and ratings are rolled around his old level with real variance.

## 20. The coaching search
- **The web:** every coach has ties (`c.links`) to men he has worked with. A season on the same staff strengthens them (most along the chain of command); time apart fades them. A coach's "people" (`guysOf`) are his strongest ties who could take a job under him: free coaches in that job, or coaches a tier below for whom it is a promotion. Nobody leaves a club for a sideways move.
- **Four days:** other clubs hire head coaches on day 1, coordinators on day 2, specialists on day 3, and everything left on day 4. Their hires bring their own people too.
- **Interviews** (5 head coach, 3 per coordinator, 2 each special teams and strength) reveal a candidate's real ratings and his demands. Assistants can be negotiated with directly.
- **Demands:** play-calling (hard insist, soft desire, none) · staff slots (asked in bulk, promised one by one; firm for his closest people if he has the reputation) · one upcoming free agent re-signed · salary, years, guaranteed years.
- **Interest** is his view of your offer against the best he could get elsewhere: team appeal (quarterback, record, how often you fire head coaches), money and security, promises kept or refused. A coach tied to a boss still on the market may hold out to follow him.
- **Promises are kept by construction:** a promised slot is filled by his man and locked (you cannot fire or replace him while the coach who was promised it is on staff); promised play-calling is applied and cannot be promised twice; a promised re-signing is made at market value automatically if you leave the re-signing period without doing it.
- **Requests:** a man who arrives with his boss asks for his own people; these are requests you may grant or decline.
- **Staff budget** (`t.staffBud`, grows 5% a year): every coach has a salary, years and guaranteed years; letting a coach go leaves his guaranteed years on that year's budget.
- **College class:** each offseason adds candidates with no ties, cheap asks and wide uncertainty.
- Later pass: consequences for breaking promises by other means, coach morale, renegotiation at contract expiry (deals currently roll over for two years at market).

## 21. Packages (defense first)
- A defensive play-caller carries **packages** with a share of his call sheet (`c.pk`): coverage shells (Cover 0, 1, 2, 3, 2-Man, Quarters, **Tampa 2**, **Cover 6**), pressures (four-man, man blitz, **fire zone**, simulated, three-man), a stunt rate and a **disguise** rate. Each school of defense is a template; a coach keeps his top four shells and three pressures.
- The pass defense coordinator brings three packages of his own (`c.pks`, drawn from his lean) and the run defense coordinator one; each adds 6-16% of the sheet by expertise. `teamDefPk` assembles the team's sheet and records who installed what.
- Man rate, two-high rate, blitz rate and the rest are now **read off the sheet** (`blendedTend`), so scheme fit and the Staff and Playbook pages follow automatically. The call picks a shell and a pressure by share, bent by the situation.
- New on the field: **fire zone** (five rush, a lineman drops, three under and three deep; the quarterback's hot throw can find the dropper), **Tampa 2** (middle linebacker runs the deep middle; softer against the run), **Cover 6** (quarters to the passing strength, Cover 2 away; harder to read), **disguise** (the pre-snap picture lies; costs playbook complexity).
- A promoted specialist keeps his packages as part of his own sheet.
- **Offense** (`OFF_PK`): the caller's sheet is still a set of rates, and a package is a named piece of it. The pass game and run game coordinators install three each. New looks exist only if someone brought them: **trips** (isolates the back-side receiver), **bunch** (beats press and man), **tight splits** (crossers and edge blocking, at the cost of outside throws), **wide zone** vs inside zone, **counter** (fools linebackers), **duo** (double teams, linebackers left for the back), **option routes** (as good as the quarterback and receiver are smart), **max protect** (time for the shot, fewer routes), **no-huddle** (faster clock, the defense tires).
- **Fronts and sub packages:** an **Under** or **Bear** front as a base changeup and a **big nickel** (third safety in the slot), each with a share; the run defense coordinator can bring them.
- **Install cost** is by overlap: the old and new sheets are compared package by package and players keep that share of what they knew. Under 60% overlap counts as a new system.
- **The system name is read off the sheet** (`offSheetLabel`, `defSheetLabel`): Shanahan Wide Zone, West Coast, Air Coryell, Erhardt-Perkins, Air Raid, Spread, Power / Gap, RPO / QB Run, Pro-Style; Fangio Two-High, Cover 3, Tampa 2, Quarters / Match, Wide-9 Attack, Man-Pressure, 3-4 Zone Blitz, 3-4 Two-Gap, Multiple. The stored archetype is now only the school a coach was generated from.
- Outside runs were about a yard worse than inside runs; the force corner no longer makes every outside run, which brought wide zone level with the rest.

## 22. Depth chart by package
- The board is built from the scheme, not a fixed picture: defensive views come from `packageLayout` for the team's front (base, nickel, big nickel, dime, goal line, plus Under and Bear if installed), offensive views from each personnel grouping the play-caller uses. A 3-4 base shows OLB / DE / NT / DE / OLB and two inside linebackers.
- A slot's position is front-aware (`chartSpotFor`): the "interior line" slots of a 3-4 team are graded as ends, not tackles.
- Each box shows who the engine would line up there right now (`dcLineup`), and is tinted when that job is filled below starting level; a "thin in this look" line lists them.
- **One chart per grouping, fully manual:** when the user runs a unit, every personnel grouping and defensive package has its own order at every spot (`lists['10:SLOT2']`, `lists['NICKEL:MLB']`). Taking control copies the staff's chart into every look once (clash-free); after that nothing is filled, moved or re-slotted. The board shows exactly what is listed. Empty spots and one man listed first at two spots in a look are flagged (`chartProblems`) and a game asks before being played that way; the engine covers the gap for that game only and never edits the chart. "Hand to the staff" discards the user's charts for that unit.
- **Package roles:** in sub packages a linebacker spot leans toward coverage, in base and goal line toward run defense (`pkgRoleBias`), for the staff's picks, other teams, and the candidate ranking.

## Deferred
- Penalties / Discipline attribute
- Leadership / intangibles

## Open
- None for v2. Play/tag/defense details, compatibility matrices and the attribute index live in `PLAYBOOK_SPEC.md`.

## 23. Look and feel

The stylesheet ends with a "design layer" that every page inherits: 14px base type, 13px tables with small uppercase headers, crisp panels with a soft layered shadow, squared-off chips, and an ink top bar with a brass hairline. The team colour stays the only accent; brass is the fixed trim.

The Staff page is the first page built on it:
- a hierarchy tree (head coach, coordinators, specialists, with connector lines), each coach a clickable card with a monogram;
- a "selected coach" strip under the tree (who he is, what he does, career path, contract and moves) so nothing needs a popup; ← → walks the staff;
- position coaches as two dense tables;
- a sticky right rail with the offense and defense systems as word-labelled bars (no percentages: those live on the Playbook page) and the staff budget.

Nothing here changes a mechanic. New pages should reuse `.pagehead`, `.card h3`, `.oc`, `.ss-*`, `.rb` and `.kv2` rather than inventing their own.

## 24. Development: growth is earned

Code: `js/develop.js`. Nothing about a player's future is decided by where he is drafted. He is created with his tools, his room to grow and his character; scouts read him through fog; teams pick off that read; the career then plays out.

**Room to grow.** Four areas: explosive, power, technique, mental. Each has a pool and a growth window. More is on offer than a typical player keeps (`DEV.room`), so the pool is not a promise.

**Earning it.** Each year's slice is offered in three periods: the offseason (40%), camp and preseason (15%), and the regular season (45%, paid at checkpoints). What he earns goes onto his ratings; half of what he does not earn is lost for good.

| Area | Game snaps | First-team reps | Position coach | Practice | Work ethic | Strength staff |
|---|---|---|---|---|---|---|
| Mental | 40% | 10% | 25% | 25% | | |
| Technique | 35% | | 35% | 30% | | |
| Body | | | | | 35% | 65% |

Snap credit is a straight line: 60% of his unit's snaps is full credit. Exhibition snaps count for everyone, more in a player's first three years. A player being badly beaten learns a little less from his snaps. Technique rusts when it is not used.

**Checkpoints.** End of camp, end of preseason, after weeks 4, 8, 12, 16 and 18, and the offseason. Each one pays growth, updates what the staff believes, and re-reads the upside pill.

**Rare events.** Surge (a young player cashes in years of growth at once, likelier with snaps and good practice), collapse, late bloomer (26 to 30, likelier under a new, good position coach). Every year also carries a good-year or bad-year swing.

**Prospects.** About 15% have far less growth in them than their tools suggest and about 8% have far more. Nobody can see which on draft day; the truth comes out over a year or two of checkpoints. Fog is heavier at quarterback, receiver and corner.

**Aging.** Each player has an age his decline starts (around a position norm: RB 27, CB 28, WR/edge/LB 29, TE/S/DT 30, OL 31, QB 33, K/P 36) and a type: gradual (65%), cliff (20%), ageless (15%). The legs go first, the mind last. Work habits and the strength staff slow it; heavy seasons bring a running back's forward.

**What you see.**
- The upside pill is the staff's expected outcome. It is sticky between checkpoints, needs to clear a line by a margin to move, and cannot reverse for two checkpoints. A ▲ or ▼ marks a move until the next checkpoint.
- Under it on the player card: the finished-product scouting line (the usual scouting language, written from his projected peak), who he plays like (an active or retired player in this league, matched on style and build first, level second), a best-case comp, and his development track (breaking out, ahead, on track, behind, stalled; for veterans holding steady, lost a step, falling off).
- Roster view "Development" lists all of that with snap share, practice and position coach.

**The record book.** Retired players are kept in `state.retired` (career totals, peak, awards, draft slot) and listed on the History page. They are also available as comps.

**Tuning.** `devtest` harness (scratchpad `dev2.js`): eleven seasons, outcomes by pick, quarterbacks separately, yearly change by age, and how much of a career is talent against path.

**Rookies.** Drafted and undrafted rookies are made by the same routine (`rookiePlayer`). They arrive raw, and the first three seasons carry the most growth. Three hidden things decide who busts:
- *Never develops* (about 24%): far less growth in him than his tools suggest. *More than it looks* (about 9%): far more.
- *Does not translate* (about 18%): the whole league reads him as much more ready than he is, and more college tape does not fix it. About 3% are better than their tape. The truth shows in camp and his first season.
- Below-average prospects have less room to grow into; undrafted rookies are a clear step below the drafted class.

**Position coach.** 30% of mental growth and 40% of technique. Young players under the best quarter of coaches realise about 90% of their room, under the worst quarter about 77%.

**Measured (8 leagues x 16 seasons, careers of 8+ years; a level counts once held for two seasons; a bust never holds the rating of the league's last starter at his position).** League talent drifts down slightly (top-704 average 77.6 at the start, 77.0 at the end). Bust rate by slot: top 3 13%, 4-10 21%, 11-20 27%, 21-32 31%, early round 2 37%, late round 2 42%, round 3 49%, round 4 59%, round 5 68%, round 6 79%, round 7 89%; 78% of undrafted players who make a roster. Stars: 27% of top-3 picks, 22% of 4-10, 15% of 21-32, 6% of round 3, about 1% of round 7. Never a good starter: 36% of top-3 picks, 44% of 4-10, 51% of 11-20, 55% of 21-32. About 18% of prospects are misreads, which by selection is about half of the first round; 69% of first-round busts were misreads. Re-run with `run.sh <tag> 8 16` then `node agg.js <tag> 8` in the scratchpad.

## 25. Coaching market, season review and confirmations

**Coaching search.** Each offseason brings a deep college class (5 head coaches, 6 per coordinator job, 3 each for special teams and strength, 4 per specialist job, 6 per position job). Those not hired go back to campus when the search closes. During the search you only know a man's reputation until you interview him, at every level of the staff. Interviews are counted per job: 5 for head coach, 4 for each coordinator job, 4 for each specialist job, 3 for each position job.

**Men under contract.** A coach employed elsewhere will move for a promotion, or sideways if the offer is clearly better: he wants at least 20% more than he makes, he is less willing the better his current club is, and a tie to someone on your staff or an expiring deal helps. His club gets one chance to match; a bigger offer makes that less likely. If they match he stays and cannot be approached again that year.

**Raids.** Other clubs with an open job can come for your coaches, with no limit on how many: good coaches on winning clubs draw the most interest, and each man is approached at most once a year. It is a step up for him, or the same job next to a man he is tied to. Every offer you match raises his pay, so keeping a great staff together costs more each year. A sideways move you can match and he will usually stay. A promotion you can counter with the same money, but it works less than half the time. Anyone left unanswered leaves when you advance.

**Promotions.** Any of your coordinators, special teams included, can be made head coach when the job is open. A special teams man does not call plays: his coordinators keep the sheets.

**Season review.** When the season ends a review page opens and is kept with that season in History: champion and playoff results, the award slate (MVP, offensive and defensive player, both rookies, comeback, most improved, offensive lineman, man of the year, coach, assistant coach and executive of the year), first- and second-team All-Pro, the All-Rookie team, league leaders, the league's best and most changed teams, and your own club's year. All-Pro and All-Rookie selections are recorded on each player's card.

**Confirmations.** Every multi-step sim (to the playoffs, through the playoffs, the rest of the draft, to next season, letting the staff make your pick) and every destructive action asks first, in the game's own dialog.

**Scout wording.** Role phrases are chosen by the exact spot, not the position group, and a phrase that names a job or a build is only used on a player who has it.

## 26. Training camp

Camp opens when rookie free agency ends. There are three practice weeks (camp opening, then one after each of the first two exhibitions) and three games, then one cutdown day.

**Practice produces evidence, not ratings.** Coaches set the reps: each room is ordered by its coach's board, and men in a battle get a look with the group above them. One-on-one drills (receivers and corners, tight ends and safeties, backs and linebackers, blockers and rushers) give every player a record, kept by who it came against: the ones, the twos or the threes. Team periods add plays that stood out, for better and worse. Each week is graded against the player's own room, and the camp grade is the running total. Exhibition snaps are remembered by when they came (early, second quarter, second half).

**Each coach keeps his own board.** A position coach starts with an impression of every player that is off by more the weaker an evaluator he is, and leans the way his temperament leans (a teacher toward the young, an old-school coach toward veterans). Practice weeks and exhibitions pull his read toward the truth. Boards are never shown as numbers.

**Battles.** The staff names a battle wherever a starting job or the last roster spots at a position are too close to call. Standings (leads, closing, slipping, fading) follow the coach's board and are recomputed every week; a battle that stops being close moves to "settled on the field". You can name a winner, which closes the battle on the page and changes nothing else.

**What camp shows that ratings do not.** Playbook pickup, special teams value (the same speed, tackling and burst the coverage units really use), a second position he can play, conditioning and practice habits appear as tags.

**The bubble.** The staff's 53 as it stands, room by room in each coach's order with the line drawn where he would stop: lock, likely, bubble, practice-squad candidate, long shot.

**Staff meeting.** After every practice week each coach presents his room: his order, who had the best week, who he is pushing for and why, who he has cooled on. It is advisory. On cutdown day, any cut a coach would not make is listed with what he saw.

## 27. Special teams

**The skill.** Every offensive and defensive player has a Special Teams rating: taking on blocks at speed, staying in a lane, tackling in space. It is tied to position (linebackers, safeties and fullbacks run highest; quarterbacks and linemen lowest) and only loosely to how good a player is from scrimmage, so a fringe linebacker can be one of the best special teamers in the league. Older saves are given the rating on load.

**The units.** Four units of ten: kickoff coverage, kick return, the punt team (the first two are gunners) and punt return (the first two hold up the gunners). They are drawn from the men who dress. The staff weighs what a man does on the unit against the risk of exposing a starter; on the Situational & Special Teams tab you can take control and set every unit, the kick returner and the punt returner yourself. An empty place on a unit is filled for that game only.

**The plays.** Kickoffs are settled by the return unit's blocking against the coverage unit. Punts are settled three ways: gunners against the men holding them up (fair catches and balls downed deep), coverage against return blocking (return yards and long returns), and the rush against the protection (blocks). An average matchup changes nothing; league averages are unchanged.

**What it costs and pays.** Every special teams snap tires the men on it and carries a small injury risk, which is the price of using starters. Players are credited with special teams snaps and tackles and carry a special teams grade. A gap of 15 points of skill on every player in both directions is worth about two points a game; a realistic good-versus-bad gap is about one.

**Roster spots.** Core special teamers dress on game day ahead of slightly better players who do not help there, and other clubs value them at cutdown and on waivers. In camp the special teams coordinator objects if you cut one of his best coverage men, and the planner's Specialists room starts with the kickoff and punt units.

**Roster planner (replaces the camp page).** The planner tab opens when the season ends and stays through the coaching search, re-signing, free agency, the draft, rookie free agency, camp and cutdown day. Before camp opens the practice and exhibition columns are empty and each row shows last season instead (grade, snaps, starts, stat line) along with the player's contract. Groups you build carry through the whole offseason and are reset to the staff's chart when the next one begins.

## 28. Camp, restructured

**The meeting.** When rookie free agency ends camp does not open by itself. The Staff page opens on the head coach and every coach on the chart has his say, at his own level: the head coach on the whole roster (strong and thin rooms against the league, open jobs, the rookie class, what he wants out of camp), coordinators on their side room by room, the run and pass specialists on their area, position coaches on their room (order, each competition and what each man has to show, who must make it on special teams), the special teams coordinator on his units, returners and specialists, and the strength coach on conditioning. It is rebuilt from the roster each time you look, so signing or cutting someone changes what they say.

**Camp.** Opening camp runs two heavier practice weeks before the first exhibition, then a lighter week after each of the first two games: four practice blocks in all. Each coach's page then becomes a camp report, updated after every block: who stood out and who struggled, how his board has moved since before camp, where each competition stands, and what he wants from the next game.

**Camp notes.** A much larger bank of lines for every position, plus who a man won and lost against in drills by name. Within a room, no two men get the same line in the same week while another is available.

**Preseason playing time.** Set per position group how long the first team plays (sit, a series, a quarter, a half, three quarters) or leave it on the coach's plan, which is a series in game one, a quarter in game two and the night off in game three.

**Sharpness.** A player with fewer than 16 preseason snaps opens the season rusty: a small cut to every rating in his first game and half of it in his second. The usual build-up is enough to be sharp. The preseason panel lists which starters are short, and a rusty player says so on his card.

## 29. Where a man is working, and the shared player row

**Working at.** Every player has one setting for where he practices: his own spot, another spot, or a split with a second spot that takes 20 to 50 percent of his reps. It is set on his card or in the practice order and replaces the old cross-training picker. With nothing set he works at his listed position. It decides:
- which room and position coach he belongs to in camp (the planner, the bubble, the staff meeting and the camp reports all follow it)
- which drills he takes and who he faces, with his reps divided by the split
- what his notes say: a record at each spot when he is splitting time, and "working at" when he is away from his listed position
- where his comfort grows: the spot that is new to him, at a pace that follows his share of reps there
A spot he does not know yet costs him in the drills, by the same comfort penalty the games use.

**One row, four views.** The roster planner's player row has switchable views: Camp (coach's rank, reps, camp grade, drills, games), Scouting (build, scheme fit, development track, the scouting line and what he becomes, strengths and weaknesses), Contract (salary, years, guaranteed, savings and dead money if cut, waiver risk) and Special teams (tag, grade, snaps, tackles, units, return ability). Camp, exhibition, season and practice grades also appear on the depth chart editor and in the practice order.

**Whole-chart edits.** From any personnel grouping or package you can push one spot's order, or the whole chart, into every other look on that side of the ball.

## 30. Navigation and cutdown day

**Headers and sub-pages.** Six headers, each with its own row of pages: Home (Overview, News), Team (Roster, Roster Planner, Depth Chart, Practice), Staff (Coaches, Playbook), League (Schedule, Standings, League Stats, History, Season Review), Players (Free Agents, Trade, Player Search, Draft, Waiver Wire) and Settings. A header reopens on the page you last used there, or on the page where the current phase happens. That page carries a brass dot, as does its header when you are somewhere else. Pages that only exist in a phase (Roster Planner, Waiver Wire, Season Review) appear inside their header instead of adding tabs. On a phone the six headers are the bottom bar and the header's pages sit under the top bar.

**Cutdown day lives in the Roster Planner.** On cutdown day every planner row carries Keep, Cut and Practice squad, the 53-man count and the coaches' objections sit above every tab, and a Cut list tab holds the full table with the staff's reasoning. The separate Cutdown Day page is gone.

## 31. Front office valuation (behind the curtain)

Nothing in this section is shown to the player. It is how clubs, and your own staff's recommendations, judge a roster.

**The question.** How much better are this club's lineups with a player than without him?

**Jobs.** Built from what the club runs: starters for its personnel groupings and front, rotation jobs that play real snaps when everyone is healthy (second back, fourth receiver, third edge, third and fourth interior linemen, fourth corner, third safety), and situational jobs a man already on the field can also hold (passing-down back, short-yardage back, edge and interior rush specialists). Each job is weighted by how much the club uses it and by the value of the position.

**The read.** What the club thinks a player is at a spot: the film through its own eyes, his size, the scheme, and how well he knows the spot. A club doubts its own players half as much as anyone else's, reads a spot he has not played less surely, and a better front office reads more truly. Every club has a hidden front office rating; the league is sharp with a real spread.

**Scenarios.** Each unit (quarterback, skill players, offensive line, front seven, secondary) is scored healthy, with each starter missing, and with each pair missing, weighted by how likely that is and by how much clubs fear it. In every case the best lineup is found with anyone free to move. A flexible backup is the answer to many single injuries but only one at a time, so a second good backup still earns his place.

**Worth.** What the unit loses without him, plus what he may become (a club carries a project or two at a position, not six), what he does in the kicking game, less what he costs, with a nod to this year's draft picks.

**Cutdown** is the first decision that uses it: the man the club would miss least goes, his unit is re-scored, and it repeats. Two thin safety nets remain: a floor and a ceiling of bodies at each position.

Measured against the old logic (cut the lowest-rated man anywhere, down to a floor): rosters keep 8 to 11 offensive linemen (was 7 to 13), 2 or 3 quarterbacks (was up to 5) and one kicker and punter; a usable sixth lineman exists at 61% of line spots (was 43%); and with half the league cutting each way, the clubs using it averaged 8.9 wins to 8.1 over 384 team-seasons.

**Bringing men in** uses the same sum from the other side: what the lineups gain with him, across the same injury scenarios. Three decisions use it.
- *Camp roster.* Each room is filled to its camp number with the candidates who add the most, with extra weight for a job nobody on the roster has won (weak incumbent, candidate within reach), up to two challengers per job.
- *Waivers.* A club claims a man only when he adds clearly more than the man it would miss least, who is the one released.
- *Injuries.* When the injury list changes, the club looks at the free agents at that position and signs the one who repairs the most of what the lineups lost, releasing its least-missed man if the roster is full. Two moves at most per change.

Measured with every club cutting the new way and half the league also signing the new way (576 team-seasons a side): 8.67 wins against 8.33, point difference ahead in all six runs. A small edge, well short of the cutdown's.

## 32. The player pool

Every club shops from the same supply, so the supply has to be deep enough that choosing matters.

**One class, two depths.** The 256 men with draftable grades are on the board all season. When the season ends the rest of the class declares: 500 more, a clear step below, shaped like a camp roster (more backs, linebackers, linemen, corners and legs, fewer passers). Nobody is told which group a man is in. Everyone discounts a flash from a man without the pedigree (half of what he shows above a rotation grade, and a capped projection), so they go on day three or not at all: none in rounds one and two, a handful in round three, about half of rounds five to seven.

**Undrafted means not picked.** Whoever is left after round seven is an undrafted free agent: about 540 a year. The league then reads all of them the same sceptical way.

**The street carries over.** At the end of an offseason the street keeps its 160 best veterans as before, plus about 330 young men (25 or younger, two seasons or fewer) by position, and always a few kickers and punters. They are next summer's camp bodies.

**Made-up bodies are a last resort** and are now undrafted-type rookies, slightly worse than the real ones, not veterans who rated higher than the men clubs had passed on.

Measured over five seasons, four leagues, before and after:
- camp bodies made up on the spot: 153 a year to 34 (mostly second kickers)
- young free agents against camp openings at each position: 1.2 to 1.6 for every position, where running back, corner and kicker used to run out
- the front office's own camp fill: median 54 overall with nobody made up; the weaker camp men are rookies won in the bidding, misread through the fog
- undrafted men on a roster three seasons later: 14 a class to 54; rated 70 or better: 2 to 8
- draft outcomes level: round one 62 at the draft and 68 three seasons on (was 62 and 68), rounds two and three 58 and 62 (was 59 and 63), later rounds 54 and 54 (was 53 and 54); drafted men reaching 75: 25 a class (was 24)
- league talent level unchanged (best 24 on a roster average 76.6, was 76.7); save size 6.4 to 6.7 MB

## 33. The street market, and the cap out of season

**One routine for every signing window.** Each club names the one free agent who would add the most to its lineups for what he costs. A player wanted by several goes where he adds the most. Then everyone looks again, until nobody left is worth a roster spot to anyone. There is no limit on how many a club signs: each signing fills the hole the next man would have filled, every spot taken is one somebody else loses, and the money runs out. A club keeps a few million back.

The windows:
- *After the draft* (before camp bodies): veterans of any age for the holes the spring and the draft left.
- *After cutdown*: open places on the 53 go to the best man available, and the bottom of the roster is turned over where a better man cleared waivers. The old head counts remain only as a backstop.
- *During the season*: each club looks every third week, and only a clear upgrade is worth the churn.
- *When a man is hurt*: the fix may come from the street or from the club's own practice squad.

At a position where a club already carries all it wants (one kicker, three quarterbacks), a signing means one of those men goes. Not in camp, where rooms are meant to be full.

**Open jobs.** A job is open when the man who actually holds it in the club's best lineup grades below the bar for that job: 66 for a starting job, 60 for a depth job, 62 on the specialist's skill for a situational one. (It used to be measured against the best man in the whole unit, so nothing ever looked open.)

**Cap cuts** take the men whose loss costs the lineups least for each dollar freed. **The practice squad** leans toward jobs the 53 is thin at.

**The cap counts the 51 biggest contracts until the season starts**, as in the real league: camp bodies are free to carry. From week one every contract counts. Clubs must be under when the league year opens, before re-signing and free agency, and again at cutdown and at week one. This applies to you too: your camp cap room is larger than it was, and you are told if week one puts you over.

Audit, eight seasons, three leagues each way (old = cutdown on the valuation, everything else the old rules):
- starting jobs held by a man graded under 62: 0.80 a club to 0.34; under 66: 2.9 to 2.2
- free agents who would clearly improve a club that can afford them, at week one: 27 to 4.5; rated 70 or better on the street: 13.5 to 2.5
- signings a club: spring 5.0 to 6.5, veterans after the draft 2.0 (most by one club in a year: 5), after cutdown 2.7 (8), off the street in season 2.3 (9), injury moves 9.3, in-season releases 0.7 to 11
- who they sign: rated 64 to 66, aged 28 to 29
- week-one rosters: 53 everywhere, one kicker and one punter, 8 to 11 offensive linemen; average roster age 26.6 to 27.0; league talent level 76.5 to 76.6; spread of wins unchanged (2.9)
- camp bodies made up on the spot: 18 a year to 10
- half the league on the new rules against half on the old, same league: 8.86 wins to 8.14 over 336 team-seasons a side (two runs of three ahead; four earlier runs, before one fix, all ahead)

Known limits:
- **The cap does not bind.** In both old and new leagues no club was ever over, the median club has about 45M of room at week one and the loosest over 130M. Cap cuts never fired. Money has to be made scarce in the free agency step before cap logic can do real work.
- **No specialists to sign.** Third-down and short-yardage jobs are open at six or seven clubs a year and nobody on the street grades better than the low 50s at them. Role targeting shows at depth jobs (dime back, fourth corner, third edge, interior rotation); it cannot show at specialist jobs until such players exist.
- A club whose room is already at its camp number does not bring in a challenger for an open job there.

## 34. Injuries over time, roster limits between games, and backs for the down

**Injury moves are judged over the rest of the season.** A replacement helps a lot while the starter is out and little once he is back; the man released to make room is gone for good. A club weighs the weeks of help against the weeks of loss, with a small cost for the churn itself, and lets a player go only when the roster is better for it across the whole stretch. The fix may come from the street or from the club's own practice squad. A man coming off injured reserve displaces the player the lineups would miss least, or waits if he is that player. The old head counts run afterwards, as a backstop.

Audit (766 starter injuries, two seasons): the job's grade falls about eight points to the next man up (about 68), who is far better than anything available (about 58). A clearly better option went unused in 1 to 2% of cases. Clubs made a move after 34% of short injuries and 76% of the longest. Depth through the season is the same or better than under the old rules.

**You may sit over the roster limit between games, but not play one.** A man back from injured reserve or arriving in a trade simply joins your roster. Nothing is cut for you anywhere: the advance button sends you to the roster until it is legal, and cutdown day will not finalize over 53.

**Backs for the down.** A back's hands, routes, pass protection and strength are no longer tied closely to how good a runner he is: the three receiving skills share one roll per player, strength has a wider one. The spread is continuous, with no archetypes. About 8% of lesser backs now catch and protect better than the average starter, and about a quarter of starters are below 50 at it. Staff-run lineups (every computer club, and yours when the staff sets the offense) use the right back for the down: hands and protection on passing downs, strength and balance on short yardage. Before this, they almost never did. On passing downs the back on the field averages 62 at the receiving skills against 53 on other downs; lesser backs who can catch get about twice the snaps and three and a half times the catches of those who cannot.

**Charting fixes.** Yards before and after contact stop at the goal line like the box score; a missed tackle counts as an attempt whether or not anyone got him down; screens are expected to complete 94%, not 85%. 'Ahead of schedule' sets the coach's share aside so a great teacher does not put his whole room over the bar.

**Audits after all of the above.** Front office, eight seasons, two leagues: every club at 53, 0.33 weak starting jobs a club, about 4 free agents worth signing left at week one, league talent 76.5, 7.8 injury moves and 8.9 in-season releases a club. Football realism, 16 seasons: 3 stats clearly off (was 4), the same known ones: best and worst quarterback completion rates, and catch rate for high-volume receivers. The most catches by a back sits at the top of the real range (90).

## 35. Back usage follows the playbook, and an engine reconciliation

**Back usage** is one lean, set by the offensive system (how much it rides its lead back). It decides how many series the next back gets (18% to 58%), and how readily the lead back is swapped out on passing downs and short yardage. A workhorse system keeps him in unless the other man is far better at it; a committee system swaps freely. A series that belongs to the next back stays his on passing downs. On your own chart, the series share and whether you list a passing-down or short-yardage back say the same thing.

**Every play and every box score in a season was checked against itself** (about 35,600 plays, 272 games). Found and fixed:
- *A phantom touchdown.* A defensive penalty at the one-yard line moved the ball onto the goal line, and the next snap scored whatever happened, credited to nobody. Penalties can no longer put the ball on either goal line.
- *Defenders playing offense.* When a club ran out of tight ends in a heavy set, the next body could be a defensive tackle (about 100 plays a season), and now and then a lineman at nose tackle. Each side's depth is now its own players: the extra tight end is a lineman.
- *Return touchdowns* were on the scoreboard but not on the returner's stat line.
- *A muffed punt lost* was a turnover with no recovery credited.
- *Raw yardage ran past the goal line* (a 141-yard completion existed internally). It is capped where the play is resolved, so the box score, the charting and the grades all see the same number.
- *Targets.* 6.9% of attempts were charged to no receiver (real: about 3 to 4%). Under pressure the ball is now usually thrown at somebody and charged to him, and a pass batted at the line keeps its intended receiver. Now 3.9%. Neither counts against the receiver's grade or the coverage man's numbers.

Now exact: passing against receiving (yards, completions, touchdowns), interceptions thrown against caught, sacks taken against credited, team totals against player totals, turnovers against takeaways, the scoring summary against touchdowns, field goals and extra points, eleven legal men a side on every snap, and both clubs' snap totals. Snaps exceed counted plays by about two a game by definition (plays wiped out by penalty, kneel-downs, spikes).

**Second pass** (two full seasons with playoffs, preseason and an offseason: about 87,000 plays, 8,300 kicking units, and the league's books at week one). It checked the situation every play starts from, who lines up where by position, every credit against the men on the field, every box score number, season totals against the sum of the box scores, standings, ages, draft picks, contracts, rosters, coaches and the cap. Found and fixed:
- *A tight end at tackle.* A tight end could rate above a backup lineman playing out of position and take his place on the line (about 400 plays a season). Only a lineman plays the line, and only a quarterback plays quarterback, while a real one is available.
- *Healthy men on injured reserve were dressing.* A player whose injury had healed but who was still on injured reserve could play.
- *Both quarterbacks hurt in one game* put a tight end under center even when a third quarterback was on the roster. He now comes in.
- *Punts inside the 20 were never credited* (the test was written backwards).
- *A kneel-down at the one* put the ball on the goal line.
- *A hail mary on third or fourth down* could count a conversion without an attempt.
- *A defender could be charged a missed tackle on a play he then made the tackle on*, and once in a long while got the tackle and the assist.

Clean: downs, distance, clock and score never impossible; eleven men from the right club on each side; no injured, practice squad or wrong-club players in a game; season totals equal the box scores; every club plays 17; points for equal points against; every player ages one year; draft picks unique; no player on two rosters; every club under the cap with a quarterback, kicker and punter at week one.

## 36. The deep ball and the explosive-play retune

**The arm decides.** A coordinator calls more shots for a quarterback with a big, accurate deep arm (0.45 to 1.5 times the system's rate). On a shot play that quarterback looks downfield first, and the more he trusts his arm the tighter the window he will throw into. A weak arm calls fewer and forces fewer.

**Why that was not enough.** Deep routes almost never came open (about 6% of them were close), so willingness had nothing to act on. The fix was a joint retune of the passing and running balance, searched against the realism audit:
- deep routes start less covered, and a deep ball is harder to put on a receiver (more attempts at a real completion rate)
- a deep ball caught in stride is hard for the trailing defender to bring down, and a safety coming down on a back who has cleared the second level misses more (the long plays)
- tackling is surer everywhere else, a second defender is closer after short catches, intermediate windows are a little tighter and the base catch a little harder (the cost: fewer methodical drives)
- windows are tighter inside the 20, accuracy counts a little less, and interceptions are a little rarer per throw

**Result, 32 seasons before and after.** Throws 20+ yards downfield: 6% of attempts to 10%, completed at 38%; big arms 12.8%, weak arms 9.5%. Completions of 40+ yards a team-game: 0.32 to 0.49. Runs of 20+: 0.43 to 0.75. Interceptions 0.68 to 0.77, first downs 22.0 to 21.5, points 23.6 to 23.4, yards per attempt 7.24 to 7.15, completion rate 64.9 to 63.8, rushing leader 1,463 to 1,618, best completion rate 74.7 to 72.4, catch rate for high-volume receivers 66.2 to 64.0. All of those are now inside the real range except the best completion rate, which is just outside.

**What it cost.** The tails got worse: the top deep threat averages 24.6 yards a catch, interceptions pile up on a few defenders and on the worst quarterbacks, and the best offense scores more. League averages improved; who the plays go to did not.

**Who the plays go to (follow-up).** Deep routes were tied to alignment, so one receiver ran the deep route every time and, once deep balls were thrown, caught little else (one had 72% of his targets deep). And every interception went to the man in coverage. Changed:
- the wide receivers trade routes on three calls in four, so the deep route moves around
- getting open deep is mostly route craft, with speed about a quarter of it (it was over half)
- about a third of interceptions go to a help defender: mostly the man sitting underneath on short and intermediate throws, sometimes the safety over the top on deep ones
- calls are designed a little more for the better receivers, and the quarterback looks for his best man a little more

32 seasons: top deep threat 24.6 yards a catch to 20.5; defenders with 5+ interceptions 13.1 to 11.5; 100-catch receivers 4.5 to 7.9; the catch leader among backs back in range; the receiving-touchdown leader back in range. Scoring, completion rate and yards per attempt unchanged. Against the game before any of this, 13 of the 31 tracked stats are outside the real range, down from 17.

## 37. Attribute and rulebook audit

**Rulebook.** Every snap of a season and playoffs (about 43,500) was checked: the eleven on each side match the personnel and package called; only eligible players are thrown to or carry the ball; nobody both blocks and runs a route, or both rushes and covers; the down, distance and spot after every ordinary play; turnovers on downs; who kicks off after a score and to start each half; timeouts; the clock; penalty yardage; scoring values. Two things were wrong and are fixed:
- clubs out of their kicker's range punted from inside the opponent's 35; they now go for it, or try the long kick with a lot to gain
- the fourth-down chart called a gamble deep in a club's own end when it was only marginally better than punting; going for it there now has to be clearly better

Punts moved into the real range (3.7 a game) as a result.

**Attributes.** See docs/ATTRIBUTES.md: every attribute is connected and none works backwards; a running back's elusiveness, agility and vision were close to dead and now work; rating weights were refitted to the retuned engine (version 5; saves re-rate on load).

## 38. Burst, the trenches as they stand, and the advanced stats audit

**Burst.** A quick back gets through the hole before a blocked defender is off his block, is on the linebackers a little deeper, and gets a screen upfield before the defense turns. A 30-point gap moves yards per carry by 0.30, the same as speed and elusiveness.

**How the trenches are decided today.**
- *Who rushes.* Everyone on the line rushes, down to four; the weakest edge drops out for a three-man rush or a simulated pressure. Blitzers are picked from the linebackers and slot defenders by rush skill.
- *Who blocks whom.* Linemen take the rushers nearest them, tackles on the edges first. A tight end kept in takes the edge on his side. A spare lineman slides to a blitzer, otherwise a back has to pick him up. Any lineman left over doubles the most dangerous rusher next to him, or slides out to an edge whose tackle is clearly overmatched. Backs kept in chip the most dangerous edge.
- *One on one.* The rusher wins by speed (rush skill, burst, agility, length) or by power (rush skill, strength, mass), whichever is better against that blocker's answer (pass blocking with feet and awareness, or with strength and mass). The gap sets how long the block holds; a double or a chip adds to it; the inside path is slower.
- *Blitzes and stunts* test awareness: a missed pickup or a stunt that works sends a man free.
- *Runs.* Linemen take the front by alignment; gap schemes pull the back-side guard; zone schemes combo and climb. Each defender at the point of attack beats his block or does not (shedding plus quickness against zone, strength against gap), and a winner may penetrate. Linebackers are blocked by climbers or fill by reading the play.

What this model does not have: where a lineman lines up within a gap (technique), shifts before the snap, or slants. Alignment today is one of a few fixed fronts.

**Advanced stats audit.**
- *Separation* measured the quarterback: it counted only balls thrown to a receiver, so it followed where the quarterback went (-0.06 with the receiver's route running, +0.22 with the quarterback's rating). It is now charted on every route with the route's depth taken out, and follows route running (0.39) and not the quarterback (0.00). The old number is kept as 'separation when targeted'.
- *Double-team rate* counted only a second lineman or tight end, so edge rushers who were chipped on a quarter of their rushes showed almost none. Chips now count.
- Exact against the box score: attempts, completions, targets, rush yards before and after contact, missed tackles forced and made.

## 39. Pass-game timing

The pass rush was slow and the ball was held too long: 61% of dropback throws took three seconds or more, and a blocked edge rusher reached the quarterback inside three seconds on 8% of rushes. Pressure and sack rates looked right only because the two errors cancelled.

Retuned together, searched against the realism audit:
- routes break sooner and each read is quicker, so receivers come open on time and no longer depend on the quarterback standing in a clean pocket (the longest he will wait dropped from 0.9 to 0.3 seconds)
- the rush is faster to match
- the quick game takes a beat longer
- the pre-snap read knows where the matchup favours the offense, not how the snap will turn out
- two rushers arriving together split a sack less often, and a pressured quarterback goes down a little more often, so the sack leaders stay where they were

Result: throws held three seconds or more 61% to 24% (real about 25%); average time to throw 3.04 to 2.58; edge rusher home inside three seconds 8% to 17% (real about 15%), interior 3% to 10% (real about 8%); dropbacks pressured 35% to 36%; sack rate 6.7% to 7.0%. Scoring 22.8, completion rate 64.5%, yards per attempt 7.10, interceptions 0.79: all in range. Sack leaders 16.5 / 13.0 / 11.5 for first, fifth and tenth, with 19 players at ten or more.

**What a position is worth changed.** For a 30-point gap across the group, points a game: cornerbacks 7.6 to 5.6, safeties 7.0 to 5.3, edge rushers 6.8 to 5.8, interior line 5.1 to 4.7, receivers 7.5 to 8.9, quarterback 8.3 to 7.4. Per player an edge rusher is now worth about 2.9 and a cornerback about 1.9. An edge's pass rush skill went from 1.5 to 2.0; a quarterback's processing from 1.2 to 1.8.

Not improved: completions of 20+ yards (2.4 a team-game, real 3.0 to 3.6).

