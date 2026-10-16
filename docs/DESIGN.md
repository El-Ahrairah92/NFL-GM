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


## 40. The quarterback over his receivers, the run after contact, and who makes the tackle

After the timing retune a receiver room was worth more than the quarterback throwing to it (8.9 points a game against 7.4), the best back averaged 6.35 a carry, and 31 defenders a season made 120+ tackles.

**Quarterback.**
- Accuracy counts for more on every throw, and a well-placed ball lets the receiver run after the catch (and a poorly placed one lets the first tackler close).
- Processing sets how fast he gets through his reads. A slow processor sometimes locks on to his first read and loses a beat.
- A receiver's own skill counts for a little less in whether he comes open.

**Running.** What a back's elusiveness, burst and vision can add to a missed tackle is capped, so no one attribute stacks into a back nobody can bring down. Safeties fill sooner against the run and less is gained after the first contact; burst through the hole was trimmed.

**Tackles.**
- Assists are shared by position (safeties and linebackers most, interior linemen least) and are a little rarer.
- Fewer runs spill to the linebackers untouched.
- Linebackers come off for a series now and then, as the line already did. A depth chart set by the user is left alone.
- Dime is called less on long and middle distance, so a linebacker is on the field more.

Result over 16 seasons: scoring 22.8, completion rate 64.8%, yards per attempt 7.16, yards per carry 4.37, interceptions 0.77, sack rate 7.2%. Defenders with 120+ tackles 31 to 21 (real 18 to 26); best back 6.35 to 6.2 a carry (real 5.2 to 5.9, still a little high). The quarterback is worth 11.1 points a game for the 30-point gap and the receiver room 7.4.

Position groups, points a game (2,400 games a row): quarterback 11.1, receivers 7.4, offensive line 6.2, cornerbacks 6.0, edge rushers 5.9, running back 5.8, linebackers 5.3, interior line 5.0, safeties 4.9, tight end 3.6, kicker 1.0, punter 0.7. Per player an edge rusher is worth about 3.0 and a cornerback 2.0.

**Rating weights refitted (version 6)** on that measurement, by the same rule as before (half old, half measured, noise earns nothing, every position re-centred). A typical player moves about one rating point, the largest under four. Main shifts: a quarterback's short accuracy and processing up and arm down; a back's burst and speed up and balance down; receivers' hands up; linebackers' and safeties' speed up; interior linemen's block shedding up and pass rush down. Positional value still left alone for the free agency work.

Still outside the real range: completions of 20+ yards (2.4 a team-game, real 3.0 to 3.6), stuffed runs (21%), the best offense (34 points a game), the most-intercepted quarterback (21), the top deep threat's yards per catch (21), a cornerback's tackles (112 for the leader) and passes defended (the fifth-best has 14, real 15 to 17). The tackle leader is now a little low (158, real 165 to 185).

## 41. The line of scrimmage as geometry: any front against any offense

The trenches used to know a handful of fixed fronts. Now a front is data and the engine works out the blocking from where the men are standing, so any front can be handed in and resolved.

**A front is a list of eleven men.** A man on the line is given by side and technique (0 head-up on the center, 1 a shade of him; 2i, 2, 3 on the guard; 4i, 4, 5 on the tackle; 7, 6, 9 on the tight end's spot; W9 wide). A man off the ball is given by where he stands and how deep. Any number can be on the line. The seven fronts the game already had (4-3, Wide-9, 3-4, Tite, Bear, Under, goal line, and the sub-package lines) are now written this way.

**A pressure plan says who comes and how.** Any of: who rushes (everyone else drops), who slants one gap left or right on the snap, which two rushers twist, and which gap a blitzer from depth hits. Today's calls (rush four, rush three, blitz, simulated pressure, fire zone, stunt) still pick their own rushers when there is no plan.

**Pass protection.**
- *The call.* The line counts who is showing rush on each side of the center and slides toward the bigger number. Going with the slide a lineman can cover two men's width; against it, barely his own gap. With no slide he reaches a step and a half. The man on each end can always kick out to someone wide of him.
- *Pairing.* Blockers and rushers are paired left to right, because linemen cannot run through each other. If somebody has to be let go it is the widest man. A back kept in takes whoever the line could not reach, inside man first.
- *Help.* A spare lineman doubles the most dangerous rusher next to him (the better blocker takes the man, the other helps). Spare backs chip the edges.
- *Surprise.* A man coming from depth can be missed. A man standing up near the line can be missed only as far as the look lied: if everyone who showed came, the count was right.
- *The angle.* A blocker who has to travel to his man gives up the corner. A rusher lined up very wide has a longer way to go. A man coming from depth has ground to cover first. An interior man head-up on a blocker is reading, not rushing.
- *Slants and twists.* A slant wins quickly if the blocker is slow to see it and runs into the block if not. A twist frees the looper if the two blockers do not pass it off.

So an overload the offense can see gets picked up by sliding; one it cannot see (men from depth, or from the side it slid away from) does not.

**Run blocking.**
- The line takes the men on the line by alignment, paired left to right. If somebody has to be let go it is the man farthest from the play.
- Gap schemes pull the backside guard first; the men next to him cover for it. A man left unblocked at the point of attack is kicked out by the puller or the lead back.
- Zone schemes combo with a spare lineman and climb to a linebacker.
- *The angle.* A blocker already between his man and the play only has to stay there; one who has to get across his man's face has to win a race first. This is what a technique is for: a 3-technique is hard to reach on a run at his gap and easy to wall off on a run away from it.
- A man head-up on his blocker holds two gaps and gets into the backfield less. A man slanting toward the play, or shooting a gap from depth, gets there more, and leaves his old gap to whoever is behind him. A man who meets his blocker from off the line gives ground.
- A gap nobody is standing in has nobody to beat at the first level.

**The front lab.** A test harness hands one club an invented front and plan, plays real games with it and checks every snap: eleven different men a side, every rusher either blocked or free, no blocker on two men, every result a number. Twelve named fronts (a 46 Bear with six on the line, a 3-3-5 stack, two down linemen with four standing, six down linemen, nobody down at all, four linemen on one side, an overload, a prevent) and forty invented at random, about 66,000 snaps: no problems. What each gave up is football: the Bear allowed 2.8 a carry and stuffed 36% of runs; the prevent allowed 8.5 a carry and pressured 17% of dropbacks; four linemen on one side allowed 3.0 a carry to that side and 5.8 to the other; the three-man line pressured 23%.

Two things the lab found and fixed on the way: a strip-sack with nobody on the line crashed (the recovery looked only at men with a hand down), and stacking the line to one side got a free rusher nearly every snap until the offensive line learned to slide.

**League numbers** are where they were over 32 seasons: scoring 22.9, completion rate 64.7%, yards per attempt 7.16, interceptions 0.77, sack rate 7.1%, yards per carry 4.43. The league passing leader runs a little hotter (about 5,600).

Known and left for the next steps:
- Offenses do not check the play at the line. A loaded box is not thrown against and a light side is not run at, so a heavy front is not punished the way it should be. Base personnel against three receivers gives up 1.25 fewer yards a carry and only 0.4 more yards a pass attempt.
- Stuffed runs (21%) and the small value of an interior pass rush are unchanged; both are the next step.
- Attribute values and rating weights were measured on the old trench model. League results did not move, so they were left; re-measure after the trench work is finished.

## 42. Before the snap, and inside against outside runs

**Each side has one move at the line, then the ball is snapped.**

*The quarterback's read.* He counts the box against his blockers, the bodies at the hole on each side, and the shell. What he sees can be wrong: a disguised shell fools him unless he reads through it (processing), and a poor processor miscounts now and then.

*What he may do about it* (at most one):
- a run into a box with two or more men he cannot block: check to a quick pass
- a run at the side with more bodies waiting: flip it
- a pass against a light box with both safeties deep: check to a run (a draw on a passing down), aimed at the lighter side
- a pass with pressure showing: keep the back in, or get to a quick throw

How often he actually does it is his licence: his processing, how well he knows the playbook, and whether he can be heard (less on the road). A quarterback still learning the offense does not check at all. Nothing is automatic: the best quarterbacks change about one play in ten, the worst one in forty.

*Dummy calls.* When he is not changing anything he sometimes sounds as if he is.

*The defense's answer.* The signal-caller (the linebacker or safety with the best play recognition) hears a check and may answer. He has to guess what it was: against a real check he is right more often than not, against a dummy it is a coin flip. Thinking pass, a safety backs out of the box; thinking run, one spins down. A right guess costs the offense about a yard a play; a wrong one gives up about half a yard. So answering is a gamble that favours smart defenders, and dummy calls are what keep it a gamble.

**A defense that does one thing all afternoon stops surprising anyone.** The game used to read a defense's tendencies from film that was never recorded, so no offense ever adapted. Each game now tracks what the defense has shown (pressure, man coverage, slants each way, twists). The more it repeats itself:
- the less often a blitz is missed, a twist comes free or a slant crosses a blocker's face
- the more quick throws and screens it is called, and the fewer deep shots
- the easier its pressure is to see coming

**Inside against outside runs.** Runs to the edge were being stuffed 27% of the time and averaged 3.5 yards, against 17% and 5.3 between the tackles. Two causes, both fixed:
- on an outside run, an interior lineman who beat his block without getting upfield was treated as standing in the hole. He is now chasing the play unless he penetrates.
- linebackers met every run at the same depth. They now meet a run between the tackles sooner than one to the edge, and the corner turns the outside run back a little less often.

Result: inside 4.6 a carry with 15% stuffed, outside 4.3 with 20%: the edge is the bigger gamble for about the same return.

**League, 24 seasons:** scoring 22.5, completion rate 65.4%, yards per attempt 7.18, interceptions 0.74, sack rate 7.1%, yards per carry 4.41. Stuffed runs 21% to 16.8% (real 16 to 19), rushing touchdowns 1.04 (real 0.85 to 1.05), runs of 20+ now in range. 4.9% of plays are changed at the line; clubs range from 3% to 7%.

**The front lab again** (one league for every front, 100 games each, points allowed by an ordinary club that allows 26.5):
- its 4-3 on every down 27.4; a 3-3-5 stack 28.2
- 46 Bear 29.4 (3.3 a carry, but 9.1 a pass attempt); six down linemen 29.2
- two down and four standing 31.9; prevent 46.4
- every lineman slanting the same way every snap 25.9; five rushing with a twist every snap 24.5
- four linemen on one side 27.3 (3.1 a carry at them, 5.9 away)
- forty fronts invented at random 32.0

Heavy fronts stop the run and pay for it in the air. Nothing invented is better than playing the club straight by more than noise.

Still open:
- The flip is nearly worthless against ordinary fronts (4.35 a carry against 4.34 for running at the heavy side). It matters only against a lop-sided front. The count a quarterback can make is not what decides a run in this engine; the blocking angles are.
- Too many players reach 100 tackles (77 a season, real 45 to 58): starters in the back seven never leave the field. The tackle leader is a little low (156).
- Runs of 10+ are a little common (13.3%, real 10.5 to 12.5).

**Light tune afterwards.** Forcing every defense into one shell for whole games showed man coverage with one deep safety was the best call in the game (about 1.5 points a game better than mixing) and a single-high safety was worth 0.85 yards a carry. Sending five every snap also cost nothing in coverage. Feathered, nothing else touched:
- the blocking now more often leaves the late safety, not a linebacker, as the unblocked man, and he arrives a yard deeper: single-high is worth about 0.7 a carry
- in man with one deep safety, anything past the sticks is a little more open
- every rusher beyond four leaves every receiver a little more open (and every man dropped beyond seven a little less)

Forced shells now sit within a point of each other and of mixing them. Five rushing every snap allows 26.0 against the club's 26.6. League averages re-centred: scoring 23.0, completion rate 65.6%, yards per attempt 7.21, yards per carry 4.48, stuffed runs 17.1%. Runs of 10+ went up a little (14%, real 10.5 to 12.5).

## 43. The pocket, and contact on runs

**The pocket.** A rusher used to be only a clock: whoever got home first decided the play, wherever he came from. Now where the pressure comes from matters.
- *Stepping up.* When the first man home is an edge rusher and no interior rusher is close behind him, the quarterback steps up and buys time (more with pocket presence). An edge rusher's win is worth the most when the tackles next to him are winning too.
- *Push up the middle* takes the step-up away, as before makes him harder to escape, and now flushes him into the ends: if he slips an interior rusher, the nearest edge man is on him sooner. The sack then goes to the end.
- *A crowded throw.* An interior rusher nearly home as the ball comes out costs a little accuracy downfield, hit or not.

The rush was made slightly faster to keep pressure (38% of dropbacks) and sacks (7.0%) where they were.

What it is worth, measured on 1,200 games a row with the model off and on: the interior line as a group 3.8 to 5.1 points a game, edge rushers 5.5 to 4.8; a tackle's pass rush 1.1 either way, an end's 1.0 to 1.7. Noise is about 0.4 on each, so the group shift is likely real and the single-attribute ones are not proven. The trench rewrite had already lifted a tackle's pass rush from the 0.2 measured before it.

**Contact on runs.** Backs were first touched 2.9 yards downfield and gained 1.7 after it (real about 1.4 and 2.9). Past the line, tacklers now make first contact two yards sooner and the runner carries them: the play ends at the same spot, with more of it after contact. Now 2.2 before and 2.6 after, with 0.18 missed tackles forced a carry.

**League, 24 seasons:** scoring 22.7, completion rate 65.3%, yards per attempt 7.11, interceptions 0.72, sack rate 7.0%, yards per carry 4.46, stuffed runs 18.7%, runs of 10+ 12.7%, rushing touchdowns 1.07.

**The scramble drill.** A quarterback who slipped the rush used to keep reading the same routes against the same coverage, so buying time created nothing. Now, once he is out:
- receivers break off their routes and work to open grass, the deeper ones going deeper; how much comes open is his speed and agility, and man coverage (backs turned to him) suffers most
- the short outlets get harder, because the defenders who were sitting on them come up at him
- he takes the first man he sees come open and throws on the move (throw-on-the-run accuracy, as before)

Broken plays are 9% of dropbacks. Before and after: completion rate 63% to 53%, yards per attempt 5.9 to 6.1, interceptions 2.3% to 3.8%, completions of 20+ per 100 throws 4.0 to 7.4, with more sacks and more scrambles. Feast or famine, as it should be.

It does not close the gap in 20+ yard completions (2.3 to 2.4 a team-game, real 3.0 to 3.6): broken plays are too few. The gap is in the clean pocket, where 8.6 throws in 100 gain 20+ against a real rate near 10 for all throws.

League after it, 24 seasons: scoring 22.9, completion rate 64.7%, yards per attempt 7.14, interceptions 0.75, sack rate 7.0%, yards per carry 4.50.

## 44. Where the ball is thrown

Completions of 20+ yards were short (2.4 a team-game, real 3.0 to 3.6) because the passing game was too short. Throws by depth, before:

| Thrown | Share | Caught | Real share | Real caught |
|---|---|---|---|---|
| behind the line | 5.5% | 93% | about 15% | about 78% |
| 0 to 9 | 73% | 72% | about 50% | about 74% |
| 10 to 19 | 10.7% | 47% | about 22% | about 58% |
| 20+ | 10.8% | 32% | about 12% | about 38% |

Intermediate routes started far more covered than deep ones and were much harder to complete, so quarterbacks threw underneath.

Changed:
- intermediate routes are less covered and easier to complete
- the short game is a little less open, completed a little more easily, and tackled sooner (a yard less after the catch)
- backs' routes start a yard closer to the line and they catch the ball with more room
- tight ends are a little more open; the primary read goes to a tight end or back slightly more often and to an outside receiver slightly less, so the extra intermediate yards did not all go to wideouts
- deep catches run a little less after the catch; the rush is a touch slower to keep sacks at 7%

Now: behind the line 7.7% (88% caught), 0 to 9 62.6% (70%), 10 to 19 20.0% (57%), 20+ 9.7% (37%). Completions of 20+ are 2.9 a team-game, with 1.2 of them coming from intermediate throws (was 0.5).

League, 24 seasons: scoring 23.1, completion rate 64.8%, yards per attempt 7.27, interceptions 0.69, sack rate 7.0%, yards per carry 4.49, punts 3.67, third downs 39.8%. Receiving leaders are in range (first 1,851 yards; 25 with 1,000+; top tight end 949; top back 599).

Still off: throws behind the line are half the real share; the lowest yards per catch among regulars is 5.0 (real 6.5 to 8) because backs catch it at the line.

## 45. A coach's own fronts

Every defensive play-caller carries a library, generated once and kept with him. You get it by hiring him; nothing about it is set by the user.

**Looks.** A look is one sound way to line the front up: where each lineman puts his hand down. A coach has a home look he plays about half to three-quarters of the time and one to three changeups, in base and separately in nickel and dime.
- 4-3 base: Over, Weak shade, G (a tackle inside the guard), Wide, Double 3 (both tackles outside the guards)
- 3-4 base: Okie, Tite, Eagle, Heavy (ends head-up, two-gapping), Wide
- nickel and dime: Even, Tilt (one tackle shaded on the center), Pinch (both tackles inside the guards, ends tight), Wide

Run looks are leaned on when the film says run; rush looks on passing downs. Bear, Under and goal line are still their own fronts.

**Line games.** How often his line slants (4% to about 25% of snaps) and which way he likes it: to the strength, away from it, or both tackles pinching. Which twist he prefers when one is called: tackle with tackle, or tackle with end.

**Walked-up linebackers.** Some coaches walk both linebackers up into the gaps in sub packages, more on passing downs. They may come or drop.

**What each thing does in the engine** (found by forcing it on every snap, and fixed until it was a trade and not a free lunch):
- A man lined up a gap away from the hole who beats his block without getting upfield is chasing the play, not standing in it. (A pinched line had been stuffing 27% of runs because its ends counted as standing in every inside hole.)
- Contain: when the widest man on a side is lined up inside the play and loses, nobody turns an outside run back and the linebackers are late. A quarterback also gets out more easily when no rusher is wide of the tackles.
- Run-stopping alignments give up pass rush: a tackle shaded inside the guard, and an end tight on the tackle with no room to turn the corner.
- Tight ends on the line can be chipped and slid to like any edge rusher (they could not before: an artifact of a fixed width).
- A slant that guessed wrong is washed down the line.
- An interior man is one who lined up inside, wherever his slant takes him (slanting outward had been turning tackles into edge rushers for the sack rules).
- A linebacker standing in a gap holds the lineman in front of him even when he drops, so the four who rush get one-on-ones; the cost is that he is late getting out to cover.

**Forced on every snap, yards allowed per play** (nickel and dime, where most snaps are): Even 5.39, Pinch 5.45 (4.7 a carry, 34% of dropbacks pressured), Tilt 5.53, Wide 5.62 (5.7 a carry, 39% pressured). Base looks sit within 0.3 of each other. Slanting one way every snap, walking linebackers up every snap and twisting every snap are each within 0.25 of doing none of them.

**League, 24 seasons with libraries live:** scoring 23.2, completion rate 64.8%, yards per attempt 7.28, sack rate 7.2%, yards per carry 4.50, stuffed runs 18.9%. The most sacks by an interior lineman came into range (11.3, was about 15).

**Where the user sees it.** The Playbook page has a Fronts card for whichever club is being viewed: a small line diagram for every look the caller carries (each lineman's technique against the five linemen and the tight end's spot, with the gaps lettered), how often he plays it, whether it is his home, run or rush look, and one line on what it is for. Under them: how often he slants and which way, the twist he prefers, and how often he walks linebackers up. Clicking a look puts it on the big field above with the club's actual players, each lineman's technique under him. A coordinator's card in the coaching search lists his looks and line games in a line.

Not built yet: scouting text by technique, season film on a coach's habits, disguised and overload pressure packages, and the same depth for offensive coaches.

## 46. The defensive line is one line

Nose, defensive tackle, 3-4 end and edge used to be four positions a player had or had not learned. They are now four points along one line: nose over the center, 3-technique on the guard, 5-technique on the tackle, wide edge.

**Rating anywhere on the line** is read between the two points either side. A 2i asks for some of what a nose does and some of what a 3-technique does; no technique is its own position.

**Comfort** works the same way, and never falls below what carries over from the spot he knows best: half a step along the line is nearly the same job, a full step is a different one. A career 3-technique is comfortable at the 2i and the 4i, decent at nose, raw out wide. Snaps count toward the points either side of where he actually lined up, so comfort grows where he plays.

**The lineup follows the alignment.** Each man on the line is chosen and penalised for the spot he is lining up in on this snap, in this look, not for the name of the job. When a coach's look moves a tackle from the 3 to the 2i, the same man is judged as a 2i.

**Each spot asks for its own kind of player** in the engine:
- weight is judged against what the spot asks for (about 330 pounds at nose, 300 at the 3, 288 on the tackle, 256 wide), not against his listed position: too light gives ground against the run, most of all inside; too heavy cannot turn the corner
- inside, strength counts for more and the rush is power; outside, burst and agility count for more and the rush is speed

Every defense playing its linemen at the wrong end of the line (noses wide, edges inside) allows 3 more points a game: dropbacks pressured 36% to 30%, sacks 7.4% to 5.5%, runs stuffed 20% to 13%.

**Knowing the looks.** A changeup look, a line slant or walked-up linebackers each make the call harder to know, so players still learning the book bust in them more. A bigger library is slower to learn: each look past a coach's home ones, and the more his line moves and his linebackers walk up. A simple coach gets young and new players up to speed faster.

**Player card.** A lineman's card shows a strip from nose to wide: each spot against his own best one, with how at home he is there and whether he is light or heavy for it.

Also: a wide alignment gives the rusher more of an angle than before, so the Wide look is a real trade (39% of dropbacks pressured to 40%, sacks 7.5% to 8.5%, against 5.8 a carry).

**League, 24 seasons:** scoring 23.0, completion rate 64.9%, yards per attempt 7.25, sack rate 7.1%, yards per carry 4.53, stuffed runs 18.5%. The audit's clearly-off count is 7, the lowest it has been.

Not done: the four points still exist as labels in cross-training, scouting text and the depth chart lists; the depth chart page built on roles is next.

## 47. The depth chart is a set of jobs

**The idea.** You no longer set a list per position per package. Each side of the ball is a set of jobs, filled once. Whoever is listed first at a job plays it in every look or grouping that has that job; the rest are next in line. An override puts one man at one spot in one look.

**Defensive jobs come from the coach's system.** The page reads his looks and lists only the jobs they contain.
- Line: nose (0, 1), shade (2i, 2), 3-technique, end (4i, 4, 5), wide end (7, 6, 9, wide), and the stand-up edge of a 3-4 base. A job two men play at once (two 3-techniques in an even nickel line) starts the first two listed.
- Linebackers: Mike, Will, Sam. Secondary: corner (one ranked job, the first two start), nickel, dime, free and strong safety.
- Passing downs: edge rusher, inside rusher, and optional pass-down versions of the Will and the nickel. Left empty, the regular man stays in; with fewer men named than spots, the regular job's order fills the rest.

**Big nickel is a choice, not a package.** A corner in the nickel job is a nickel; a safety there is a big nickel; a safety in the Will job on passing downs is a sub linebacker. Computer-run staffs still use their coach's preference.

**Comfort carries to the next job along.** Along the line, from the box to the deep middle (Mike, Will, strong safety, free safety) and from outside in (corner, slot, strong safety), a man is never less at home than about two fifths of what he knows at the job next door. So a safety in the slot starts decent, not unfamiliar, and learns from there.

**Corners.** One job. Whether the best corner travels with the offense's best outside receiver is the coach's: about one in seven does it in man coverage (nearer half of man-blitz coaches).

**No huddle.** The defense plays the snap with the package it already has on the field, so run-down personnel can be caught by a hurry-up.

**Offense** works the same way: jobs filled once across every personnel grouping, with an override for a single grouping. Its formations are not coach-generated yet.

**Old saves.** The old order carries into the new jobs (both tackle lists become the 3-technique, end and shade orders, both corner lists the corner order). A starter who differed in one offensive grouping becomes an override there. Per-package defensive orders are not carried over.

**The page.** Rebuilt.
- Tabs for defense, offense and special teams; one switch between the staff setting a unit and you setting it.
- A field showing the selected look or grouping with whoever the engine would actually put out there, each man's job and technique, coloured by how he grades at that job. Looks are pills grouped by base, nickel and other, with how often the coach plays them; a toggle shows run downs or passing downs.
- Job cards in collapsible groups under it: the order, how many start, a fold with what the job asks for, which looks it plays in, and the rotation share.
- A bench column listing the best fits for the selected job, with where each man already starts.
- Drag a player onto a job card to list him, onto a place in the order to rank him, or onto a spot on the field to use him in that look only. A pin on the spot removes the override.

**League after it, 24 seasons:** scoring 22.9, completion rate 64.2%, yards per attempt 7.27, sack rate 7.4%, yards per carry 4.50, stuffed runs 18.8%; ten items clearly off.

Not done: ratings on the page do not yet weigh a defensive back by the coach's mix of man and zone; the quarterback does not yet look for a linebacker or safety walked out over a receiver; cross-training and scouting text still use the old position names; offensive jobs wait on offensive coach libraries; linebackers, safeties and receivers have carry-over comfort but not ratings read between points the way the line has.

## 48. How a chart becomes a lineup

A look is resolved as a whole, not one spot at a time (which had made the answer depend on the order the spots were filled in).

1. **An override plays where he was pinned**, if he is dressed and healthy. If not, the spot falls back on the job's order for that game and the override is kept.
2. **Every other spot wants the highest available man on its job's list.** Fatigue and a planned series off count against him.
3. **A job with two spots in the look starts the first two listed.** The card says "top 2 start" and draws a line under them.
4. **Next man up moves.** When two jobs want the same man and he is a listed starter at one and the next healthy name at the other, he goes where he is needed and the job he left goes to its own next man. The list is the instruction: to keep him where he is, list someone else second.
5. **First at two jobs in the same look:** he plays where the drop to the man behind him is bigger.
6. **Anyone coming off for a breather** (a rotation snap, a tired man, a planned series off) is replaced by a man further down that job's list who is not on the field. It never moves anyone else, and with nobody behind him he stays in. Breathers are settled last, after every spot is filled.
7. **A spot whose list has run out is filled by the staff for that game**, and the page says so.

**Game-day actives.** Anyone the chart starts (as many per job as it has spots, plus the next man) and anyone pinned to a spot dresses. A second end the user chose to start had been sitting out because he graded low, and a better man from another job was playing for him.

**On the page.** A spot not played by the first man on its list carries a small tag with the reason on hover ("Abbott is out", "Barber is at nose in this look", "staff"). The player card has "If he goes down": the field redraws without him and outlines every spot that changes hands.

Preseason games keep their own first, second and third strings and do not use these rules.

**Checked against the page.** A harness runs one club on a hand-set chart (reordered jobs, an override on each side of the ball, pass-down men) through 17 real games and compares every snap with what the page draws for that look.
- Before kickoff: the page's lineup and the engine's agree at every spot in every look and scenario, and everyone the chart starts or pins dresses.
- Defense, about 12,000 player-snaps: 92.6% exactly as the page shows; 3.8% rotation; 2.4% fatigue; 1.1% a man hurt during the game. Offense: 90.2% as shown; 3.7% the passing-down or short-yardage back; 2.7% in-game injuries; 2.4% rotation; 0.9% a planned series off.
- Overrides: the pinned man was at his spot on every snap of that look (229 of 229 and 509 of 509).
- Where men stand: identical to the page except when linebackers are walked up or a corner travels, which the page does not draw.
- A second harness builds 6,000 lineups from random charts with random men unavailable or tired: eleven different men every time, nobody unavailable on the field, and a breather never changes any other spot.

Two flaws it found, both fixed: a breather (rotation, fatigue, planned rest) could trigger the next-man-up rule and pull another starter out of his job; and a breather could take a man the staff was about to use to fill a spot whose list had run out.

## 49. The offense: formations as geometry, the strong side, and pass concepts

**Formations are data**, as fronts are: where each skill player lines up in a grouping. A slot a formation does not mention stays at its usual spot. What a formation does comes from where it puts people, read off the field once everyone is lined up:
- three detached to one side and one alone on the other: the man alone is more open, the crowded side less
- three men in a cluster: man coverage gets picked and nobody can be pressed; zone passes the routes off
- everyone in close: crossers gain, deep balls and out-breakers lose, receivers can block the edge
- a tight end flexed off the line is a receiver, not a blocker: one fewer hat for the run, and the nearest linebacker or safety widens out over him (sometimes all the way out of the box)

11 personnel has Trey (home), Doubles, Trips, Bunch and Tight; 12 has Ace, Wing and Tight; 10 has Doubles, Trips, Bunch and Tight; heavier groupings have their base set and Tight. The formation is chosen before run or pass, so it does not tip the play.

**The strong side flips.** Each coach sets it right or left by his own habit. The defensive front, the linebackers and the safeties line up to it and the nickel goes to the slot; corners stay on their sides unless the coach travels one. Runs go to the strength a little more often than away. Slants "to the strength" follow it.

**Pass concepts.** Every pass used to be one of a few fixed route sets. There are now twelve named concepts, each a set of routes drawn up for a kind of coverage: Stick, Slant-flat and Spacing in the quick game; Curl-flat, Levels, Four verticals, Mesh, Flood, Dagger and Smash on dropbacks; Post-dig and a Sail shot deep. Each is a little more open against the coverages it beats and a little less against the ones that take it away (Smash against Cover 2, Mesh against man, Four verticals against three-deep and not against quarters). The edges are centred on the league's mix of coverages, so a concept called blind is worth nothing extra.

**A coach carries some concepts and not others**: two quick, five dropback, both deep shots, weighted by his own taste. Every book has an answer to man coverage.

**How concepts meet the rest of the play-calling.**
- The play caller leans, as far as he is sharp, toward the concepts in his book that beat what this defense has been playing today. A defense that mixes its coverages gives him nothing to lean on.
- He also goes to bunch more against a defense that keeps playing man.
- At the line, a quarterback who reads the coverage (the wrong shell if the disguise fooled him) can get out of a concept the coverage has taken away and into a better one in his book. It is one of his possible checks, not an extra one.

**Coach identity** for formations, the strong side and the concept book is read from who the coach is, so nothing new is stored and existing saves have it at once.

**Forced on every snap, yards a play.** 11 personnel: Trey 5.42, Tight 5.44, Bunch 5.42, Trips 5.36 (4.5 a carry against 5.0, a little more through the air), Doubles 5.31. 12 personnel: Ace 5.41, Wing 5.39, Tight 5.29. Strong side right against left: 5.35 and 5.28. As first built, Tight, Bunch and Trips out of four-receiver sets were each a free 0.2 to 0.6 a play; their costs were added until they were trades.

**One coverage all game** (points allowed; mixing is 21.9 on the same schedule): Cover 3 only 22.4, quarters only 22.1, Cover 1 only 21.4, 2-Man only 21.4. Man coverage is still the strongest single call but no longer clearly better than mixing.

**Concepts in league play** (yards per pass play including sacks and interceptions): Curl-flat 6.6 against Cover 3 and 4.0 against Cover 2; Slant-flat 4.8 against Cover 1 and 3.0 against Cover 2; Smash 7.3 against Cover 2; Post-dig 7.4 against Cover 3 and 4.2 against quarters. Plays where the quarterback checked the routes at the line: 3.6% of passes, 6.6 yards against 4.9.

**Changed at the line, all checks together:** quarterbacks under 60 processing change 3.7% of plays, 60 to 72 change 7.1%, 72 to 82 change 10.7%, 82+ change 14.7%; clubs range from 5.6% to 9.2%.

**League, 24 seasons:** scoring 22.6, completion rate 65.1%, yards per attempt 7.13, interceptions 0.68, sack rate 7.1%, yards per carry 4.52, stuffed runs 18.8%; eight items clearly off.

**Attributes, 1,200 games a row.** Nothing works backwards. Groups, points a game: quarterback 11.7, receivers 8.1, offensive line 6.6, cornerbacks 6.6, edge 6.1, running back 5.6, safeties 5.6, interior line 4.4, tight end 3.3. A quarterback's processing rose from 2.8 to 3.7 (the checks) and a corner's man coverage from 1.0 to 1.6. Too small to see at this sample: a quarterback's decision-making, a receiver's release, a tight end's route running, a corner's press, a safety's zone coverage.

**Pages.** The Playbook page has a card for the caller's formations in the grouping on show (a diagram each, how often, what it is for; click one to see it on the field) and his concept book with what each beats and struggles against. The depth chart's offense tab has formation pills under the grouping.

Not built: receivers and tight ends as one line of jobs read between points (they have carry-over comfort only); offensive depth chart overrides per formation (they are per grouping); the featured-receiver-moves trait is stored but does nothing yet; motion to change the strength; rating weights refitted to the new values.

**The backfield.** Where the quarterback and the backs stand now comes from how the snap is taken and the formation, in the engine and in every drawing (one function for both).
- Under center: quarterback at the ball, tailback seven yards deep. Pistol: quarterback at four, tailback behind him. Shotgun: quarterback at five, a lone back beside him on the weak side.
- Two backs: I (fullback straight ahead of the tailback), Offset (fullback a step to the strength), Split (shotgun, a back each side). A two-back call in the gun is Split; under center it is I or Offset by the coach's habit. Two-back and heavy sets are under center more often than before.
- Empty: the back lines up as a receiver on the weak side, in the slot if it is free and outside everyone if not (he had been standing just outside the left tackle).
- Jumbo: the sixth lineman is next to the tackle with the tight end outside him (they had been standing on the same spot).

A check draws out all 61 combinations of grouping, formation and snap, tests each (quarterback behind the center, the right depth for the snap, an I in a line, an offset fullback to the strength, split backs level, nobody on top of anybody, the right number on the line), and then compares every player on every snap of four weeks of games with the drawing for the formation, snap and strong side that was called: 8,300 snaps, no mismatches. The depth chart page shows no overlapping players in any grouping and formation. League numbers did not move.

## 50. Receivers: jobs, the line of scrimmage, motion, and the hash

A receiver's job now changes what happens to him, because the things that make the jobs different on a field are in the engine.

**Routes by job.** The two outside receivers trade routes with each other; the slot joins that trade only now and then, so he keeps the inside and underneath work and the outside men keep the deep and intermediate work. A second or third tight end who inherits a route does not inherit a deep one. Result: outside receivers are thrown to about 13 yards downfield and catch 56 to 58 percent; the slot about 8.5 yards and 63 percent.

**On the line and off it.** The split end is on the line: a corner can get his hands on him, so he is pressed on about a quarter of his routes and his release against the corner's press decides it. The flanker and the slot are a step off the line and are rarely pressed; the flanker gets a clean start. A man in a bunch, a stack or in motion cannot be jammed.

**Who covers whom in zone.** A zone corner carries the outside receiver and the nickel the slot, even when the route ends in a linebacker's area; the linebacker squeezes the window. Outside receivers are now covered by a corner on about 70 percent of routes (it was 41) and by a linebacker on 6 (it was 36). With that in place linebacker coverage counts at full weight for the men they really do cover: tight ends, backs and some slot routes.

**The slot.** No sideline beside him: he can break either way against man coverage, and he catches the ball on the move with room to run. An outside receiver catches it with the sideline next to him and has less room.

**After the catch.** A receiver with the ball can run through a tackle as well as around it: contact balance, strength and his weight against the tackler's all count, next to elusiveness and speed.

**Targets.** Fewer to tight ends (about 21 percent, it was 27), more to the top receiver and to backs (about 16 percent). A target is charted as contested only when the window was really tight (about 18 percent, it was 35 to 40).

**Motion is a man going to a place.** Only a man off the line can move: the flanker, a slot, an H-back. Four kinds:
- Across: he crosses the formation and lines up on the other side. Two-by-two becomes three-by-one or the reverse, and everything that reads the formation (trips, bunch, the lone receiver) reads the new one.
- Short: he tightens down beside another receiver into a stack.
- Jet: he is running flat across at the snap, to take the ball or to hold the linebackers.
- Insert: an H-back comes across to block on the side the run is going.

The defense has to answer. In man his defender goes with him, across the whole formation if need be, trailing; that is a step for the moving man and it tells the quarterback it is man. In zone nobody follows, which tells him that, and the nickel bumps over to the new slot side about two times in three; when the call is late a linebacker is left on a receiver. A disguised coverage answers the wrong way on purpose more often than not. Costs: slightly more pre-snap flags (illegal motion and illegal shift now exist), and less chance of a check at the line on that snap. Callers use it on roughly 35 to 75 percent of snaps by system. Pass plays with motion are worth about a quarter of a yard an attempt more than without.

**The hash.** The ball is spotted on the left hash, the middle or the right hash by where the last play ended (an incompletion comes back to the same spot). From a hash one side of the field is wider. To the wide side: zone defenders each have more ground, there is more room after a catch and on an outside run, and the out-breaking throw is the longest on the field, so it takes an arm. Into the boundary the reverse. Each coach has a habit of setting his strength to the wide side (45 to 80 percent). Measured: outside runs 4.5 a carry to the wide side against 4.3 into the boundary; outside throws about half a yard an attempt better to the wide side. Deliberately small, because professional hashes are narrow.

**Checks.** League averages are where they were (about 23 points, 65 percent, 7.2 to 7.3 a throw, 4.45 a carry). A motion audit confirms one man moves per snap, never a man on the line, never onto another player's spot, and a defender goes with him in man every time. In the attribute test, receiver contact balance, strength and elusiveness each move yards after the catch; release moves how often he is jammed and, after its effect was raised, completion percentage; a corner's press does the same from the other side.

Not built: quarterback and receiver timing (waiting for team chemistry); a back motioning out of the backfield; safeties rotating to motion in zone; the corner assignment by field and boundary.

## 51. Free agency as a market with agents

**Price.** A free agent's card shows an Expected yearly value as a range. The league's shared view of him sets it; no tier label for it is shown. A signing well above expectation lifts the expected value at that position for a while (the market resets). Each club has its own view of him, from its own read of his rating and his fit in its system, scaled by need. A club that sees him higher than the league can pay above the range and still be right. A role does not create value: a proven starter asks starter money because he is one; an unproven player offered a starting job is still priced as unproven, and what changes is the shape of the deal (he wants it short).

**Who is in the market.** Players expected to earn at least 1.6 times the minimum have an agent meeting; everyone below that signs on the spot at his asking price, as before. A player with leverage whose agent likes the open market sometimes turns down his own club to test it, so the market has real starters in it (about 130 to 150 players, 35 or so starters, a handful of stars).

**The days.** Free agency runs eight days. Each day every club can put out offers; offers are binding while live and count against what a club can still spend. Nobody sees another club's offer. An agent tells a club when it has been beaten, and it raises until the player costs more than he is worth to it. Overnight each player takes the best offer if it clears what his agent would accept that day. That bar starts near the agent's opening number and falls as days pass; stars hold longer and do not sign on day one unless someone meets the ask. After day eight whoever is left takes what he can get. Measured: starters and stars sign for 7 to 10 percent over expected, the middle at about expected, and late signings at a discount.

**Agents.** 46 named agents; a few have many clients. Each has six hidden dials rolled independently: how high he opens, how honest he is about rival clubs, patience, how much he values guarantees, how long he remembers past dealings, how far he follows what the client wants. Nothing about them is shown except the name, other clients, and the user's own record with him (who signed, for what, against what opening number; who walked).

**The player.** Besides money each player cares about up to three things: a short prove-it deal, a starting job, a contender, staying with his last club, a system that suits him, security. An offer's worth to him is the yearly money, bent by length against what he wants, the share guaranteed against what his standing commands, when the money is paid, and those wants.

**The negotiating table.** Negotiating opens a window with the contract on the left and the agent on the right. The contract is a formal document that writes itself as the terms change; its language is decoration. What matters is the headline above it (years, total, signing bonus, this year's cap hit) and the table under it: for each season the salary, the bonus share, the cap hit, the cap room left with everything else on the books, and what it costs to cut him before that season.

Nobody names a role and nothing is promised. The agent has read the club's depth chart before the meeting and says how his client sees the opportunity: a job that is his to lose, a competition, or a seat behind an established man. A proven starter who would sit does not negotiate early in free agency. An unproven player who sees an open every-down job wants a short deal.

1. Length and signing bonus. The bonus is paid when he signs and spread evenly across the cap; if he is cut, the unspent part counts at once. It is the security in the deal: there are no separately guaranteed seasons. The agent has a floor on it by the player's standing.
2. Salary, and how it is paid: evenly, more now (more cap hit this year, cheaper later) or more later.
3. Incentives, optional, two at most: extra money if he reaches a mark (starts, yards, catches, sacks, interceptions, tackles, the Pro Bowl, All-Pro). The league's own rule decides the cap. A mark he reached last season is likely to be earned and counts against this year's cap now; one he did not reach counts nothing now. After the season one adjustment lands on the new year's cap: plus the unlikely ones he hit, minus the likely ones he missed. The game says which is which as an incentive is added. To the player an incentive is worth its amount times how likely he thinks he is to get there: a young man betting on himself rates them, an older player or a careful agent wants the money in the salary. A playing-time incentive is the honest way to back an opportunity.

Each failed move costs patience; when it runs out the meeting ends for the day. The agent holds out for more than he would take and gives ground with each exchange. A dishonest agent invents a rival offer. Moves: offer, hold, best and final (a no ends the talks, for good with some agents), ask where things stand, leave the offer on the table, set a deadline of tonight, go back to the length and bonus, walk away. A yes can be immediate, or the agent takes it to his client overnight, when a rival can still beat it. Other clubs put a playing-time incentive on their prove-it deals.

**Contracts.** A negotiated contract records the signing bonus, the salary and its schedule, any incentives, and how the opportunity looked when he signed.

**Hands-off.** The front office can be given a yearly ceiling for a player and bids like any other club up to it.

**The page.** A narrow list (position, name, age, tier, expected value, status) on the left; on the right the selected player's card: where he would fit on the user's roster, scouting, last season, positions, and the sit-down as a conversation. Across the top: the day, cap room, money tied up in live offers, roster count, live offers and overnight news.

Not built: re-signing the user's own players at the same table; consequences for a broken role promise (waits for morale); other clubs using loaded contracts; agents gaining and losing clients over time.

## 52. The staff, rebuilt

The coach ratings were written for an older play system. They have been rebuilt so that every rating is one job and moves something that can be seen. A coach still has a system (what he likes to do: run and pass lean, formations, concepts, fronts, coverages); the ratings are how good he is at the jobs.

**Head coach.**
- Organizing Practice: the week has an allowance of reps, 100 for an ordinary practice and 80 to 120 by this rating (half a rep a point). The first team takes its share whatever happens. Extra reps fill up the second team before the third sees much; a short week comes out of the third team first. So a 10 percent better practice is about a quarter more work for everyone below the starters. Reps feed progression, the playbook, comfort at a new position and chemistry.
- Game Management: fourth downs, timeouts, the clock, two-point tries.
- Accountability: penalties and blown assignments.
- Team Building: how fast a newcomer gets up to speed, in chemistry and in the first half of the playbook.

**Coordinators.** Three design ratings each (run, pass and protection; front, coverage and pressure), which are how good the scheme is, and Install. Install sets how fast the unit learns past the basics and how much of the system it can ever hold: a coordinator below about 60 never gets all of a system in, and the bigger the system the further short his players stop. Until a unit knows its book the caller keeps to what it knows: fewer formations, concepts, looks and line games, which is plainer and easier for an opponent to read. When he is chasing a game or it is a down he must have he reaches for the rest anyway, and that is where the blown assignments come from.

**Play Calling** belongs to whoever calls the plays, and it is his alone. Every head coach and coordinator has it, but it is shown only for a man who calls plays now. One who used to shows it greyed, as it was the last year he called. One who never has shows nothing: nobody knows. Calling games is how a caller improves. It is how sharply his choices follow what he knows: the matchups, the opponent's film (what a defense shows each game goes on its film; older games count less; a new coordinator has none), what is working today, and what the other side is showing. Between the two callers it also decides how well the defense reads the play, all game.

**Specialists** (pass game, run game, pass defense, run defense) have Concept Creativity and Adjustments, each for his own part of the game.
- Catching on. As a game goes on each staff works out what the other keeps doing, separately for the run and the pass. One specialist's Adjustments works against the other side's Creativity: the pass-defense coordinator against the pass-game coordinator and the reverse, and the same for the run. Screens and play-action are passes; draws are runs. Nothing has been seen at kickoff, so it starts at nothing and is at full strength once that offense has run about twenty of that kind of play. It does not reset.
- When the defense has caught on it reads that kind of play better: linebackers fit the run sooner, coverage is tighter, fewer bite on a fake. When the offense has caught on, the defense's blitzes, twists and slants are seen coming, and the caller's choices against that defense land more often.
- Creativity also makes the system bigger, which costs learning time. A unit that has not installed its book is running a short menu, and creativity cannot hide what is not there.

**Play-action.** Linebackers and the strong safety bite by how well the offense has run today, once it has run enough to count (ten carries for full credit), and by how much of the offense the run has been. The pass-game coordinator's Creativity sells the fake. A defense whose pass-defense coordinator adjusts well stops biting on a fake it has seen several times. So a run game that gets figured out takes the play-action with it.

**In the fourth quarter** a well-conditioned team has a little more left than a poorly conditioned one, most of all the men who have played every snap.

**Game Management** now includes the clock: a good manager's hurry-up gets the next snap off sooner and his four-minute offence wastes none of it. When the hurry-up starts no longer depends on the rating (starting it sooner was costing the better managers points).

**Position coaches.** Cohesion is the ceiling on his room's chemistry. Technique is development.

**Special teams coordinator.** Coverage Units and Return Units are separate now (your return units against their coverage units), Kicking Operation (field goal percentage and blocks, with the battery's chemistry), and Technique for the kickers and punters.

**Strength and conditioning.** Durability (injury rate), Recovery (time out), Conditioning (fatigue within a game and wear over a season), Athletic Development (physical growth and how long older players hold it).

**Chemistry.** Each player has a number for how well he knows his unit: offensive line, defensive line, linebackers, secondary, kicking battery. A back, receiver or tight end has one with each quarterback. It builds in two stages. Team Building takes a newcomer to a working level in weeks (about 47 to 63 by the rating). From there his position coach's Cohesion sets the ceiling (55 plus half the rating); past the ceiling progress all but stops. For a quarterback and his targets the quarterbacks coach sets how fast they find each other and the receiver's own coach sets the ceiling. A winter apart costs a few points; a new club starts a player over. Full chemistry takes an excellent coach, about two seasons and little turnover.
- Offensive line: blitz pickup, twists passed off, slants seen.
- Defensive line: twists and slants run in step.
- Linebackers: run fits.
- Secondary: routes passed off in coverage.
- Quarterback and target: timing on every route.
- The defense's chemistry is the average of its three rooms: the bump to motion, and answering a check at the line.
- Kicking battery: field goals and blocks.
Effects are measured against an ordinary settled unit (81), so an average team plays as before.

**The green dot.** One defender gets the call and makes the checks. The club names him on the depth chart; the staff picks if it has not. How good he is at it is what he sees, how well he knows the system and whether the others listen. If he is off the field the best of the rest does it.

**Saves.** Coaches from older saves are converted: each old rating goes to its nearest new one and the new ones are rolled around what kind of coach he was.

**Screens.** Coach cards show every rating as a bar and a word. The depth chart shows each unit's chemistry with the ceiling its coach allows, and has the green dot and the emergency quarterback. The Playbook page is tabs (overview, offense, defense, on the field, self-scout, who plays) and shows how much of each side's system is installed.

Not built: fakes, onside kicks and punt blocks for a special teams Situations rating; how coach ratings change over a career beyond the caller's two; morale and individual behaviour under Accountability and Team Building; firing a coach in season.

## 53. The player file, and leaping

**The player file.** A player's card is a dossier: a bio header that never moves (name, job, age, height, weight, year, school, club, with tier, upside and status as pills) and five tabs under it. The card remembers the tab from one player to the next. A prospect has Overview and Scouting only.

- Overview: the scout's one-line read; whether he is still improving, near his ceiling, topped out or declining, with a sentence; the season grade with his last five games in parentheses and his rank; a box-score line; the five drills as a web (40, bench, shuttle, 3-cone, vertical), each spoke his percentile at his position; four advanced numbers chosen by the job he holds; the contract in one line. It reads last season until he has 100 snaps this year. It fits on one screen.
- Scouting: the finished-product panel, the report, strengths and weaknesses, comfort by spot, chemistry, scheme fit, the full physical sheet, and the controls for where he works and his preseason snaps.
- Stats: grades by game and the career tables. Advanced: grades by facet and the tracked numbers with ranks. Contract: the summary, the cap hit by season, and incentives.

The four numbers by job come from what is tracked today; the fuller list (eight per position, with the over-expected numbers) is to come.

**Leaping.** A fifth athletic rating, in the explosive group, so it ages with speed and burst. An explosive man tends to jump well and a heavy one less well, but it is its own roll. Older saves fill it in from the vertical each man was measured at.

What decides a ball in the air is catch radius: height, arm length and how high he gets, counted in inches, the same for the receiver and the man covering him. It replaces the league-wide size rating at the catch point, where a receiver was being scored against a 245-pound centre. How much of it counts depends on the throw. A deep ball, or anything thrown into the end zone from inside the 25, is a jump ball: reach and leap count in full, and leap for more than its inches, because the man who gets up first wins. An intermediate throw is half that. Underneath, nobody is jumping: reach counts for less, leap for nothing, and a contested catch in traffic goes to strength and hands on both sides. A defender who wins a jump ball is likelier to come down with it if he is a leaper. A big radius also makes an off-target ball a little more catchable, and linemen who get off the ground bat a few more passes. Weight still counts for boxing out. Contested Catch is still the largest part of the receiver's side and Ball Skills of the defender's.


**Vision.** A zone run is a read. When the playside is jammed the cutback is there, and whether the back finds it is vision (with the feet to make the cut). The linebackers flow with a zone run, so the cutback goes behind them and a back who misses it runs into where they are going. When it is not jammed, vision is pressing the lane until the crease shows. Behind pullers in a gap scheme there is one hole and vision is only the patience to let it open, which counts for much less. Past the line, in any scheme, vision sets up the next defender. Measured with every club forced into one scheme: a thirty-point gap in vision between two clubs' backs is worth about 0.28 yards a carry in zone and 0.15 in gap (it was 0.10 and 0.12).

## 54. The workout

**A range, not a number.** Each drill has a raw mark set by what it tests: the 40 is speed with some burst, the 10-yard split burst with some strength, the vertical leaping with some burst, the broad jump leaping, burst and strength (long legs help), the 3-cone agility with some burst (a tall man bends worse), the shuttle agility and burst about evenly, the bench strength (long arms cost about a rep an inch, mass helps). Around the raw mark is a range. Work ethic sets the ceiling, how far better than raw he can go after two months of rehearsing these drills; consistency sets the floor, how far worse. The result is drawn from inside the range, usually near the middle. A slip is the one way to land under the floor. The coachable drills (bench, 3-cone) have the tallest ceilings and the jumps the lowest, so the jumps are the most honest numbers on a sheet. A workout lies downward more easily than upward: a great number is strong evidence, a poor one weak.

**Not every drill.** A prospect may be hurt (the sheet says so, and which drills it cost him). One at the top of the class may stand on his tape and not run, and may run his 40 at his pro day instead. One may skip the drill that is worst against the rest of his own workout, most often the one his position is judged on. The sheet reads "did not run" for both of the last two. Men outside the invited group have pro day numbers only, some missing, taken on a home track with a friendly stopwatch. Quarterbacks and specialists do not bench. The athletic score needs four drills.

**Hand size** is measured, rolled around his position and his height. Big hands nudge hands, ball security, contested catches and ball skills when a player is made, a quarterback's ball security most. **The medical** is clean, a minor concern, or a flag, read from durability through a fog: a fair share of flags are false alarms.

**The league** reads the stopwatch, not the man: a prospect's hype moves with the 40 and the split on his sheet, less for a pro day number, and a medical flag costs him. A drill he skipped earns nothing.

**Private workouts.** Twelve a class. The prospect runs every drill again for you alone, including any he skipped: a second draw from the same range. The numbers are yours and sit beside the combine's.

Players measured before this keep their numbers. Not built: clubs that weigh workouts differently from each other.

## 55. The numbers a player is read by

Nobody can watch the games, so the chart has to do it. Every metric answers one of seven questions: production; is it him or his situation; how big is his role; what kind of player is he; does he finish; what does he cost you; when it matters. One table in the charting code holds them all, with which way is good, how much of a sample each needs, and which ones tell the same story.

**Over expected.** The engine knows what a play was worth before the player touched it, because it runs it again with an ordinary man in his place: the same blocking and the same defenders with an ordinary back (rushing yards over expected), the same space after the catch with an ordinary receiver (yards after catch over expected), the same throw to an ordinary receiver (catch % over expected) and the same throw from an ordinary quarterback (completion % over expected). Every throw also carries its chance of being intercepted: a ball that should have been picked counts as turnover-worthy whether or not it was, and a hard throw downfield that is completed counts as a big-time throw.

**Open, thrown to or not.** Every route is charted, not only targets: separation in yards, how often he is open, wide open or blanketed, and the same route from the defender's side. But how open a receiver gets is mostly where he lines up and what the defense gives: across the league raw separation barely follows how good a receiver is. So each route also records what the receiver himself added to the window over an ordinary receiver on that route against that defender, and what the defender took away over an ordinary defender. Those two are the numbers that are judged.

**Also charted.** Loaded boxes, breakaway share, short yardage; true pass sets (no play-action, screen or quick game), blitzes and stunts, blown blocks, yards before contact through a blocker's own gap; time to pressure, pressure when blitzing, depth of tackle; forced incompletions, yards after the catch allowed, explosive plays allowed; target share, air yards share, route participation and where everyone lines up; clean pocket, third down, red zone and two-minute numbers for quarterbacks; and for clubs, where the rushing yards come from (stuffed, the line's first five, the second level, the open field) and pressure without a blitz.

**The four on the overview** are his outliers: the numbers furthest from an ordinary man at his position, good or bad, no two telling the same story, on strips of label tape. A number has to be further out to make the cut the more of it is luck, and the ones that are nearly all luck never do. The Advanced tab has the whole sheet under the seven questions.

**Two audits stand behind this.** Accuracy: the chart is recounted against the box score game by game (catches, yards, carries, sacks, drops must match; routes, reps and alignments must add up), and the expected numbers are checked against what happened across the league. Usefulness: over ten simulated seasons each metric is measured for how well the odd weeks of a season predict the even weeks, and for how closely it follows the ratings it should. That is where the trust in each number comes from, and it removed several that were noise: pressure-to-sack for rushers, missed tackles for linemen, time before a blocker is beaten, drop rate and pass blocking for backs, and target-based coverage numbers for linebackers.

## 56. Grades

The old grades were torn out. They restated results (the quarterback's was his EPA under another name), sat on a scale that meant different things at different positions, moved with alignment and teammates, and carried facets that measured nothing.

**Twelve categories, the same for everyone who does the job.** Passing, Rushing, Receiving, Pass Blocking, Run Blocking; Run Defense, Pass Rush, Man Coverage, Zone Coverage; Field Goals, Kickoffs, Punting. A player is graded in whichever of them he does. There is no tackling grade: a tackle or a miss counts in the play it happened on. The advanced sheet (section 55) tells the rest.

**One rule.** On every play where a man had a job, a grader marks it from -2 (a clear loss) to +2 (a clear win), and most plays are a zero. The mark is what happened against what an ordinary man at his position would have been expected to do in the same spot: an ordinary blocker against that rusher, an ordinary back behind that blocking, an ordinary receiver on that route against that defender, an ordinary kicker from that distance. So a block held against a rusher an ordinary man loses to is a win, and a block held against one he always beats is a zero. A free rusher earns nothing for the free run, because an ordinary man gets home too.

- The grader sees what a man watching the tape sees. A quarterback is marked for the throw (against an ordinary passer's chance of completing it, a drop counted as the catch it should have been), for throwing into a blanketed man with another standing open, for a ball a defender had a play on, and for a sack he held the ball into with someone open. Nothing is read from the play call or the progression.
- Receivers and the men covering them are marked on every route, thrown to or not: how open the route came, over and above who was running and covering it.
- A missed pickup is charged to the man whose rusher it was. An overload, more rushers than blockers, is charged to nobody.
- Real outcomes are used, not the true odds, so luck stays in a grade and it is evidence about a player and not the answer. The grader also gets about one play in twenty wrong by a step.

**The scale** is by the spot he plays: 62 is the ordinary man who gets real snaps there, and ten points is one step of the spread between players. 80 elite, 70 a good starter, 60 a decent starter, 50 a rotation man, 40 a liability. It is fixed from simulated seasons, so a strong or weak year at a position can show. A handful of plays is pulled toward the ordinary man; a few hundred are not. The overall grade is his categories weighted by the plays where he had a job in each; kickoffs are shown but left out of a kicker's overall, because the return is the coverage unit's play.

Seasons graded before this keep the numbers they had. Checked over ten simulated seasons: every position averages 62 with a spread of ten; slot, split end and flanker grade within two points of each other at equal rating; corners repeat from half-season to half-season at 0.77 and follow rating at 0.78 (0.55 and 0.63 before).

## 57. The draft: specialists, and trades on the clock

**Specialists.** A kicker or punter arrives close to what he will ever be, so on a board built for raw rookies he read like an instant starter and went at the top of the draft. Clubs now treat them as late-round picks, and only a club without a starter-level one looks at all.

**Trades during the draft.** The trade window is open through the draft. Once the order is set a pick is a slot with a price (a chart that is steep at the top and flat at the bottom), and a pick already made cannot be traded. A club that wants a man it does not expect to last comes up for him, paying the difference on the chart in its own picks, this year's first and then next year's; the club on the clock takes it when it gives up little by sliding, and never moves off a quarterback it needs. Roughly five to fifteen such trades happen in a draft, nearly all in the first three rounds. When you are on the clock the phone may ring with one or two offers for your pick, and you can build any trade of your own on the trade screen.

## 58. Preseason: the reps chart and the Preseason page (the skeleton)

**The calendar.** Camp opens, and nothing is practiced until you say so. Then two weeks of camp, three exhibitions with a practice week after each of the first two, and the cuts. One stop was added to what there was before: the one between camp opening and camp being run.

**The reps chart.** For every job (X, Z, slot, each line spot, edge, the corners and so on), who takes the first, second and third string reps. Your coaches fill it in from their own boards. A job you change becomes yours and stays as you set it; a job you have not touched keeps following its coach; you can hand any job back. A man can be listed at two jobs.

- In practice his string decides who he faces (the ones against the ones) and how many reps he gets.
- It takes over "where he is working" through camp: his best job is his spot, a second job gets a share of his reps.
- In the exhibitions the ones start, and the threes wait for the second half.

**The meeting.** Before each step, every position coach reports on his room: who stood out, who worries him, the man he rates higher than you do, and each place he would draw the chart differently, with one button to take his advice.

**The roster, man by man.** All ninety, by room: job and string, where the staff has him (lock, likely, bubble, practice squad, long shot), camp grade week by week, one-on-one record, exhibition snaps and grade. A row opens into his weeks: each kind of rep with its record (routes against coverage, pass protection, pass rush, run blocking, run fits, open-field running and tackling, coverage), his record against the ones, the plays that stood out in team periods, and the coach's note. Practice was already simulated a rep at a time; this keeps what used to be thrown away.

Other clubs run camp as before, by their coaches' boards. The roster planner is untouched.

**Changes after the first look.** The staff meeting shows one coach at a time: pick him from a row of rooms at the top (a badge counts the changes he wants to your chart), and his window has what he tells you, where he would change the chart, and his room in his order with where the staff has each man, his place on your chart, his camp grade and his one-on-one record. The reps chart is dragged: a man's name opens his file, the × takes him off a job, and dropping him on a string or in front of another man puts him there; a job he cannot work will not take him. The year runs across the top of every page as a strip, from the season through the playoffs, the review, the staff, re-signing, free agency, the draft, the rookies, camp, the cuts and waivers, with the current stage opened up (the weeks of the season coloured by result, the days of free agency, the rounds of the draft, the steps of camp) and the button that moves the calendar on at the end of it.


### Second revision: the chart rebuilt, the planner folded in, the phone dock

- **The reps chart is the depth chart's twin.** Same page furniture (unit tabs, group selector, job cards with numbered men, dividers for the ones, twos and threes, a bench on the right of everyone who could work the selected job) and the same drag code: drop a man on a place in a job's order. From another card he moves; from the bench he is added (`repsPlace`). `+` gives him a look, `×` takes him off, his name opens his card.
- **The roster planner is part of the Preseason page.** One nav entry (`pre`), called Roster Planner until camp opens and Preseason after. Tabs: Staff meeting, Reps chart, Man by man (camp only), The cuts (cutdown day), The 53 (the staff's bubble: five printed figures, one side of the ball at a time), Compare (your own groups; column labels once at the head of each list). The old Practice report is the tracker's week-by-week. Old `camp` and `cutdown` views route here.
- **Every name on these tabs opens the player card.** The card's look (serif figures, mono labels, ink stamps) is the guide for new pages.
- **Phones have no header and no calendar strip.** A dock at the bottom carries the date, the record and cap, the continue button and the six headers; a header with more than one page opens a small menu above the dock. Sims live in the Settings menu.

### Third revision: the player file's second pass, and team periods that are played

- **Player file.** The contract's buttons (release, tag, option, extension, sit down with his agent, sign) live on the Contract tab only; a prospect keeps his private-workout button. Scouting is set in larger type; strengths and weaknesses are lettering with a rule beside them, not symbols; where he can play is words. The physical sheet has taller rows, a stroke of highlighter across each drill (green for the top of his position, red for the bottom) and the percentile in a bubble on hover. The Stats tab opens with a chart of grade by job, game by game (each game now stores its grade by job in `p.glog[].f`), in place of the bars. The Contract tab shows the deal he is playing under as the paper itself (`cardDealDocHTML`).
- **Team periods are a scrimmage.** For the user's club each practice week plays a real game of the club against itself (`campScrimmage`: `simGame(tid, tid, { scrim })`), the offense against the defense, one string at a time (`SCRIM_STRING`: ones, twos, threes, then ones and twos again; a string short of bodies borrows from the next). Every snap is graded as a game snap is, so a receiver's run blocking and a back's pass protection are on the sheet. Nothing leaves the field: no stats, no league film, no injuries. The week's team-period grade replaces the abstract "plays that stood out" in the camp grade (the spread of camp grades is unchanged: mean 56, sd 18 either way), and the tracker shows it by job with the line he put up. Other clubs keep the abstract model: a scrimmage for all thirty-two would cost seconds per click.
- **Tight end jobs.** The chart names them for what they are: In-line tight end (Y), Move tight end (H), Extra blocking tight end (13), and a package job, Passing-down tight end (`Y3D`), who takes the one tight end spot on third and long and in the two-minute drill (`offUnit` `keyOf`). A club without its own chart leans the same way: with one tight end on a passing down, the better receiver has a case over the better blocker.
- **Player panels match the file.** The free agent panel and the depth chart's player card and mini card sit on the same paper (`.paper`), with the report in serif, strengths and weaknesses as lettering, positions as words, and the physical sheet as highlighted rows (`physRowsHTML`, shared with the Scouting tab).
- **Preseason playing time lives on the depth chart, job by job** (`state.prePlan.jobShare`). In a unit you run, each job's setting decides when its second and third units come in (`preString(..., key)`, two names per string at a two-man job); a man who starts at any job whose first unit is off the field does not play a deeper listing or fill in elsewhere unless he is featured. In a unit the staff runs, a man who starts at a job you set is a starter for this purpose whatever the reps chart says. The Sit box on a depth chart name keeps him from dressing (preseason: held out; in season: `dch.sit`).

### Lineup audit (snap counts, depth, usage, tracking)

A harness checks every snap of a full season (and a preseason): eleven a side, nobody twice, nobody hurt, undressed or on the wrong club, positions against the slot, the box score's snaps against the men seen on the field, usage by rank against real shares, and the chart against the box score.
- **Clean:** no injured, undressed, duplicated or wrong-club player on any snap; snap counts differ only by pre-snap penalty plays (not snaps, as in the league).
- **Fixed:** a safety outrated the third (or second) linebacker and took Sam and Will even with five linebackers dressed (`GROUP_GUARD` now covers LB, RB, TE; a tight end's guard is doubled because his rating counts half in the choice); a receiver could take the back's spot on short yardage or a passing down because only backs were marked down for the down (now judged the same way, and a real back is never marked below a man who is not one); a grouping was called that the dressed tight ends could not fill (three tight ends need three); a quarterback could fill a tight end spot; starting linebackers sat a series too often (`lbRest` 0.34 → 0.18, the Mike at 15% of that); the Hail Mary was in the box score but not charted or counted as a snap (the last ~1% of uncharted targets).
- **Usage now (a season):** QB1 99%, RB1 67% / RB2 29%, WR 95 / 83 / 63%, TE1 77%, OL starters 95–100%, DL 85 → 65% down the rotation, LB1 ~90% in base and nickel, CB1/2 97–100%, S1/2 90–100%. League averages unchanged over twelve seasons (points 23.65 → 23.23, yards per carry 4.50 → 4.46).
- **Left as is:** 3-4 outside linebackers rushing from the edge spot (realistic), injury fill-ins, and in exhibitions some borrowing across strings when a club's late-game men run out.

### Watching a game

Every game you play can be watched or quick-simmed (the calendar strip, the phone dock and the pre-game popup all offer both; preseason too). The game is played in full first, exactly as a quick sim, then shown to you play by play: two clicks a play, the line-up first (all twenty-two men where they stood, each a dot you can hover for his name and job, with the personnel, formation, front and package) and then what happened. A score bug, a whole-field strip with the ball and the line to gain, the line of scrimmage and first-down marker on the close-up, the last few plays underneath; Previous / Next (and the arrow keys), skip to the next drive, skip to the final, then the box score. While you watch, nothing on screen gives the result away (record and calendar results hidden).
- The engine keeps, for your games only, the line-up of every snap on its log line (`pbp[].f`: side, spot, down and distance, clock, score, personnel, formation, front, package, and each man's id, job, alignment and depth), and the score after every line. A game's line-ups are about 100 KB, so only your latest game keeps them (`pruneWatch`); the box score of that game offers "watch it play by play".
- Kicks, punts, extra points and the like show as a result only. The field drawing widens the line so every man can be read.

### Punts: out of bounds, fair catches and returns

What happens to a punt now follows the league (`PUNT` in game.js): some are kicked out of bounds, to the sideline away from the returner (shorter, nothing comes back) and nearly half of coffin-corner aims in plus territory; the fair-catch base is lower, so more are returned; gross distance is about a yard longer, toward the real average, which keeps net punting where it was. Over 1,632 games: fair catch 50% → 30%, returned 27% → 38%, out of bounds 0% → 8.6%, touchback 7.0%, gross 47.3, net 42.6, return average 8.5, inside the 20 43%. League averages over twelve seasons each are unchanged (points 23.17 → 23.28).

### Snap counts: game snaps and practice reps on one page, all year

The Depth Chart page is now **Snap counts**, with a Game snaps / Practice reps toggle and a copy button each way (for the side of the ball on screen).
- **Practice reps** use the depth chart's own jobs (`REP_JOBS` is rebuilt from `CHART_SECTIONS`; a job's spot and men per string follow the scheme). A job you have not touched follows your game order, with everyone else who works that spot behind it in the coach's order. In camp the order sets the strings (who practices with the ones); all year it sets each room's first-team practice reps (`t.reps`, synced each week). Your working spot follows it only in camp. The Preseason page's reps tab is gone; the Practice page is now the Practice report, its order set here.
- **Game snaps in preseason: the relay.** Each man has a time (one or two series, a quarter, two or three quarters, to halftime, rest of game, sit). Each job plays its list in order: the first man (first two at a two-man job) starts; when his time is up the next comes in, changing only between drives (`relayTick` at each possession); a man who is hurt is replaced at once; if the list runs out the last man stays. A series counts for his side of the ball. A man can have a turn at two jobs at once (corner and nickel); on any snap he lines up at one. A man whose time is over, or whom you sat at a job, is not used to fill a hole elsewhere. Untouched men get the coach's plan: first unit his share for the game, second unit to halftime, third the rest. Setting a time takes control of that side of the ball.
- Tested: the four-quarterback example (one series, two quarters, one series, rest) played exactly that through the page and Quick sim; two-man corner relays, lists that run out, injuries and Sit behave as above.
