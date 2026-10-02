# Gridiron GM — Playbook & Attribute Spec (review draft)

Everything the sim uses to resolve a snap: play types, tags, defensive calls, attributes, and exactly which attributes drive which parts of each play.
Numbers in **Target shape** are *initial calibration targets* (NFL-like league averages) — the tuning harness will fit the sim to these.

Legend: **O** = offense attributes · **D** = defense attributes · (+) helps the offense · (−) hurts the offense

---

## 0. How a snap resolves

Every play runs through the same pipeline. Each play type below lists which attributes plug into each phase.

| # | Phase | What happens |
|---|---|---|
| 1 | **Situation** | Down, distance, field position, score, clock → coaches' tendencies choose the call |
| 2 | **Personnel + Formation** | OC picks personnel/formation; DC answers with a package |
| 3 | **Calls** | Offense: play type + scheme (runs: Zone/Gap) + up to 2 tags. Defense: front + coverage + pressure |
| 4 | **Pre-snap** | Motion / QB coverage ID (Processing vs. disguise) |
| 5 | **Trenches** | Assignment-based blocking (see 0a): count blockers vs. threats, assign by scheme (1v1, double, combo → climb, unblocked), resolve. Produces run lanes or pressure time |
| 6 | **Primary matchup** | Runs: carrier vs. first/second-level defenders. Passes: read → target → separation → throw → catch |
| 7 | **Ball in hand** | Yards after catch/contact, missed tackles, breakaways |
| 8 | **Risk** | Fumbles, interceptions, sacks, drops, tackles for loss, injuries |
| 9 | **Noise** | Each player's **Consistency** sets how much his game-day performance swings around his true ratings |

Individual blocking matchups come from alignment (the DC's front), so a bad RT only gets exposed when an EDGE lines up over him.

### 0a. Trench model (assignment-based, every blocker accounted for)

**Step 1 — Count.** Blockers available (5 OL + any TE/FB/RB kept in) vs. threats (box defenders on runs; rushers on passes).

**Step 2 — Assign by scheme.** Every blocker ends up in exactly one role: **1v1**, **double team**, **combo → climb**, **help/chip**, or **free (no one to block)**. Every threat ends up **blocked**, **doubled**, or **unblocked**.

*Pass protection*
- OL take down linemen per the protection (slide/half-slide/man); RB/TE own designated blitzers.
- Surplus blockers become help on the most dangerous rusher (largest Pass Rush edge over his blocker) → double teams/chips emerge naturally.
- Rush count drives it: **3-man** → two doubles, sacks very rare (but 8 in coverage) · **4-man** → one double/help · **5-man** → all 1v1 + RB pickup · **6+** → a free rusher; QB must throw hot (Processing) or take the hit.
- **Pickup errors:** blitzes from unexpected spots, Sim pressure and stunts/twists force each involved blocker to roll **Blocking Awareness**; a miss = free or late rusher.
- Double team = combined Pass Block (+Strength/Agility) vs. one rusher → rusher win rate collapses.

*Run blocking*
- **Box count:** if box defenders > blockers, one defender is unblocked by numbers (usually the extra safety/backside LB) and his tackle chance uses Speed + Play Recognition. In Option/Bootleg the unblocked defender is intentional (the read).
- **Combo blocks (Zone):** two blockers on a DL → displacement (Run Block + Strength vs. Block Shedding + Strength), then one **climbs** to the LB. Climb timing = **Blocking Awareness** + Agility. Too early → DL not moved (penetration); too late → LB free.
- **Gap schemes:** down blocks/doubles at the point of attack + puller kick-out/lead (Run Block + Agility + Speed).
- **Second level:** climbing blockers vs. LBs (Run Block + Agility vs. Block Shedding + Speed + Play Recognition).

**Step 3 — Resolve** each assignment, then aggregate into run-lane quality (by gap) or the pressure clock (time until the first rusher gets home).

---

## 1. Attributes

All hidden (1–99). Each side of the ball shares one pool, so every defender has every defensive attribute and hybrids/position fits fall out naturally.

### 1a. Athletic (every player) — shown to the GM only as noisy combine measurables
| Attribute | Measurable | What it does |
|---|---|---|
| **Speed** | 40 time | Top-end speed: breakaways, deep separation, pursuit angles, recovering in coverage, closing on QBs |
| **Burst** | 10-yd split | First 3 steps: hitting the hole, get-off on pass rush, YAC acceleration, blitz arrival |
| **Agility** | 3-cone / shuttle | Change of direction: route breaks, zone blocking & pulling, speed-rush bend, mirroring in man coverage, cuts |
| **Strength** | Bench / tape | Gap blocking, anchoring vs. power rush, shedding, contact balance, sneaks, tackling power |
| **Size** | Height / weight / arms | Contested catches, catch radius, block shedding, batted balls, sneak push, position eligibility |

### 1b. Passing
| Attribute | What it does |
|---|---|
| **Short Accuracy** | Throws ≤ 10 air yards (blended with Deep 10–19): completion %, ball placement for YAC |
| **Deep Accuracy** | Throws 20+ air yards (blended 10–19): completion %, underthrow INTs |
| **Arm Strength** | Velocity (tight windows, sideline throws), max range (Deep Shot, Hail Mary), gadget passes |
| **Processing** | *Speed* of the read: coverage ID, finding the open man, getting through progressions before pressure arrives, RPO/option reads |
| **Decision-Making** | *Risk*: willingness to throw into tight windows. Low = INT-prone gunslinger; high = takes the checkdown/throws it away |
| **Pocket Presence** | Feeling and escaping pressure: converts pressure into throwaways/scrambles instead of sacks; accuracy under pressure |
| **Throw on the Run** | Accuracy outside the pocket (Bootleg, scrambles, broken plays) |

### 1c. Ball carrying (RB, FB, QB, WR, TE, returners)
| Attribute | What it does |
|---|---|
| **Vision** | Finding the lane/cutback (esp. Zone), reading blocks on returns and screens |
| **Elusiveness** | Making defenders miss in space: missed tackles, YAC |
| **Contact Balance** | Yards after contact, breaking arm tackles, short-yardage push |
| **Ball Security** | Fumble rate (carries, catches, sacks, option pitches, returns) |

### 1d. Receiving (WR, TE, RB, FB)
| Attribute | What it does |
|---|---|
| **Route Running** | Separation vs. coverage (with Agility vs. Man, spacing/timing vs. Zone); affects target share |
| **Release** | Beating press at the line; timing on Quick game |
| **Hands** | Drop rate, catch % on catchable balls |
| **Contested Catch** | Winning 50/50 balls (with Size): deep shots, red zone, Hail Mary |

### 1e. Blocking (OL, TE, FB, RB, WR)
| Attribute | What it does |
|---|---|
| **Pass Block** | Pass protection technique. vs. speed rush it pairs with Agility; vs. power rush with Strength. RB/TE blitz pickup |
| **Run Block** | Run-blocking technique. Zone pairs with Agility; Gap/pulling pairs with Strength (drive) & Agility (pull). WR = stalk blocking, FB = lead blocking |
| **Blocking Awareness** | The mental side: identifying blitzers, passing off stunts/twists, combo-block climb timing, not missing assignments. OL, TE, RB, FB |

### 1f. Defense (DL, EDGE, LB, CB, S)
| Attribute | What it does |
|---|---|
| **Pass Rush** | Rush technique/moves. With Burst + Agility = speed rusher; with Strength = power rusher. Also blitzing |
| **Block Shedding** | Beating run blocks at the point of attack; setting the edge; holding up vs. double teams (with Strength) |
| **Tackling** | Form/finishing: missed-tackle rate, wrapping up, limiting yards after contact |
| **Ball Stripping** | Punch-outs and strips: forced-fumble chance on every tackle, strip-sacks for rushers. Independent of Tackling |
| **Play Recognition** | Diagnosing run/pass/misdirection. The universal counter to Play-Action, Draw, Screens, RPO, Option, Trickery, Bootleg contain, Gadget; also jumping routes |
| **Man Coverage** | Mirroring a receiver (Cover 0/1); what Rub routes attack |
| **Zone Coverage** | Spacing, depth, and passing off routes (Cover 2/3/4); safety range with Speed |
| **Press** | Jamming at the line (vs. Release): disrupts Quick game and WR Screens |
| **Ball Skills** | INTs and pass breakups; contested-catch defense (with Size) |

### 1g. Special teams

**Kickers**
| Attribute | What it does |
|---|---|
| **Kick Consistency** | Make % inside his comfort range ("gimmes") and on PATs |
| **Comfort Range** | Distance he hits at full accuracy — his natural leg. Also kickoff depth |
| **Range Falloff** | How fast accuracy decays when he must add power beyond Comfort Range. Max attempt range emerges (coach won't try kicks below a make-% threshold) |
| **Trajectory** | Quick elevation: fewer blocks, a little extra effective range, kickoff hang time (lets coverage arrive) |

FG make % = Kick Consistency inside Comfort Range; beyond it, decays at a rate set by Range Falloff; Trajectory adds a small range bonus and cuts block chance.

**Punters**
| Attribute | What it does |
|---|---|
| **Punt Distance** | Gross distance |
| **Directional Placement** | Out-of-bounds, coffin-corner and directional punts away from the returner; inside-20 rate |
| **Hang Time** | Time in the air relative to distance. Low hang + long distance = outkicking the coverage → bigger returns |
| **Spin Control** | Backspin to stop short of the end zone (fewer touchbacks); knuckling balls that are hard to field (more muffs/fair catches) |

### 1h. Hidden traits
| Trait | What it does |
|---|---|
| **Durability** | Injury chance per contact snap; injury severity; recovery speed |
| **Consistency** | Game-to-game performance swing (applied as a per-game shift to all his ratings) |
| **Stamina** | How many snaps before rotating out (DL, EDGE, RB mainly); fatigue penalty on long drives |
| **Development Curve** | Early peak / normal / late bloomer — when growth happens and when decline starts |
| **Ceiling** | Hidden max; drives the Upside label. Breakouts/busts are random shocks around the path to it |

### 1i. Aging groups (PROPOSED — Tier 1 question #2)
| Group | Attributes | Curve |
|---|---|---|
| Explosive | Speed, Burst, Agility | Peaks ~24–26, declines first. RBs/CBs feel it most |
| Power | Strength, Arm Strength, Comfort Range, Punt Distance, Hang Time | Peaks ~26–30, slow decline |
| Technique | Accuracy (both), Throw on the Run, Route Running, Release, Hands, Contested Catch, Elusiveness, Contact Balance, Ball Security, Pass/Run Block, Pass Rush, Block Shedding, Tackling, Ball Stripping, Man/Zone Coverage, Press, Ball Skills, Kick Consistency, Range Falloff, Trajectory, Directional Placement, Spin Control | Peaks ~26–29 (kickers/punters ~28–34) |
| Mental | Processing, Decision-Making, Pocket Presence, Vision, Play Recognition, Blocking Awareness | Grows into early/mid 30s |

---

## 2. Personnel, formation & alignment

### Personnel (who's on the field)
| Grouping | On field | Effect |
|---|---|---|
| **10** | 1 RB, 0 TE, 4 WR | Spread. Pass (+). Defense usually answers Dime |
| **11** | 1 RB, 1 TE, 3 WR | Default. Defense usually answers Nickel |
| **12** | 1 RB, 2 TE, 2 WR | Run (+) with extra blocker; vs. Nickel → run (+) light box; vs. Base → TE vs. LB coverage mismatch, Play-Action (+) |
| **13** | 1 RB, 3 TE, 1 WR | Heavy run/short yardage; Play-Action (+) |
| **21** | 2 RB (FB), 1 TE, 2 WR | FB lead blocking: Gap runs (+), Play-Action (+) |
| **22** | 2 RB (FB), 2 TE, 1 WR | Heavy/goal line |
| **Jumbo** | Extra OL | Short yardage/goal line only; pass (−) |

**Box-count rule:** runs vs. light boxes (Nickel/Dime) get (+); passes vs. heavy packages (Base/Goal Line) get (+).

### Formation
| Formation | Effect |
|---|---|
| **Under center** | Base runs (+), Play-Action (+), QB Sneak requires it; QB read slightly (−) (back to defense) |
| **Shotgun** | Processing (+), sacks slightly (−); Draw/Option/RPO friendly; Base runs slightly (−) |
| **Pistol** | Between the two: small Play-Action (+) and Option/RPO friendly |
| **Empty** | 5 routes, no RB protection: vs. blitz the sack risk jumps; demands Processing. Runs limited to QB Base Run |

### Alignment tags
| Tag | Effect |
|---|---|
| **RB split out** | RB runs routes vs. LB: RB Route Running/Speed vs. LB Man Coverage |
| **TE detached** | TE runs routes vs. LB/S/Slot CB mismatch; loses inline Run Block value |

---

## 3. Offensive play types

Format per play: **Called when** · **Trenches** · **Primary matchup** · **Ball in hand** · **Risk** · **Beats / Dies to** · **Target shape**

### RUNS

#### 3.1 Base Run — Carrier × Direction × Scheme
Carrier: **RB/FB** or **QB** · Direction: **Inside** or **Outside** · Scheme: **Zone** or **Gap** (required)

**Direction**
| | Inside | Outside |
|---|---|---|
| Point of attack | C/G/T vs. NT/DT/DE; MLB fill | T/TE + WR stalk blocks vs. EDGE/DE setting the edge; WLB/S/CB pursuit |
| O | OL Run Block, TE/FB Run Block; carrier Vision, Contact Balance, Strength | OL/TE Run Block + Agility, WR Run Block; carrier Burst, Speed, Elusiveness |
| D | NT/DT/DE Block Shedding + Strength; MLB Play Recognition + Tackling | EDGE/DE Block Shedding (contain); WLB/S Speed + Tackling; CB Tackling |
| Shape | Steady, low variance: ~4.0 YPC, ~20% stuffed (≤0), ~8% 10+ | Boom/bust: ~4.5 YPC, ~23% stuffed, ~13% 10+ |

**Scheme**
| | Zone | Gap (power / counter / trap) |
|---|---|---|
| Blockers | OL Run Block + **Agility**; one weak link = penetration | OL Run Block + **Strength**; pulling G/T Agility + Speed; FB/TE kick-out (Run Block) |
| Carrier | **Vision** weighted heavily (cutbacks) | **Contact Balance** + Strength weighted (downhill) |
| D | Penetrating DT/DE (Burst + Agility) wreck it; LB Play Recognition (gap discipline) | Strong NT/DT (Strength + Block Shedding) stonewall it; fast LBs (Speed + Play Recognition) beat pullers |
| Beats | Over-pursuing, low-Play Recognition defenses | Light boxes, weaker defensive fronts |

**QB as carrier:** uses QB Speed, Burst, Elusiveness, Contact Balance, Ball Security. Gets a numbers bonus (+) (an extra blocker vs. the box). Higher injury exposure (Durability matters). Only called if QB mobility clears the OC's threshold.
**FB as carrier:** Inside only (dive/short yardage).

- **Trenches:** assignment model (0a) — combos/climbs (Zone), down blocks + pullers (Gap), unblocked defender if the box outnumbers blockers.
- **Risk:** TFL from lost assignments or a free defender; fumbles (**Ball Stripping** vs. Ball Security); injuries (Durability).
- **Beats:** light boxes, Dime, Cover 2/4 shells. **Dies to:** Base/Goal Line packages, single-high (Cover 1/3) eighth defender in the box.

#### 3.2 Draw
- **Called when:** passing downs (2nd/3rd & long), mostly from Shotgun/Pistol.
- **Trenches:** OL show pass (Pass Block) then block (Run Block); DL rushing upfield takes itself out of the play.
- **O:** RB Vision + Burst; OL Pass Block → Run Block.
- **D:** DL/LB **Play Recognition** (key); the higher the rushers' aggressiveness (Pass Rush focus, sub-rush package, blitz), the better the draw works (+).
- **Beats:** Dime, sub-rush packages, 5-man blitz. **Dies to:** Base package, high-Play Recognition LBs.
- **Target shape:** ~4.8 YPC on passing downs; bimodal.

#### 3.3 Option (read/zone-read/speed option)
- **Called when:** OC runs option (mobile QB required); Shotgun/Pistol.
- **Trenches:** one defender (usually EDGE) left unblocked and "read"; the rest Zone blocking.
- **O:** QB **Processing** (the read) + Speed + Burst + Elusiveness; RB Burst + Vision; Ball Security for both (mesh/pitch).
- **D:** Read defender (EDGE) **Play Recognition** + Speed + Tackling; LB Play Recognition; S Tackling.
- **Risk:** mesh/pitch fumbles (Ball Security); QB hits (Durability).
- **Beats:** aggressive EDGEs, low-Play Recognition fronts. **Dies to:** disciplined EDGE (Play Recognition), fast LBs.
- **Target shape:** ~5.0 YPC.

#### 3.4 QB Sneak
- **Called when:** ≤1 yard to go (occasionally 2), Under center only.
- **Trenches:** C/G Run Block + **Strength** vs. NT/DT **Strength** + Block Shedding + Size.
- **O:** QB Strength + Size + Contact Balance.
- **D:** interior DL Strength/Size; MLB Tackling.
- **Target shape:** ~85–90% conversion on 3rd/4th & 1; almost never more than 2 yards.

#### 3.5 Jet Sweep (Motion built in)
- **Called when:** OC tendency; WR with Speed is on the field.
- **Trenches:** OL Agility (reach), TE/WR Run Block (stalk).
- **O:** WR Speed + Burst + Elusiveness + Ball Security.
- **D:** EDGE Play Recognition (contain) + Speed; CB/S Speed + Tackling; LB Speed.
- **Beats:** slow-flowing defenses, Cover 2 (corners squatting) … **Dies to:** disciplined contain, fast EDGEs.
- **Target shape:** ~6 YPC, high variance. Running it also makes Motion fakes more effective later in the game (see Motion).

### PASSES — common resolution
All pass plays run the same steps; each play type weights them differently.

1. **Protection:** assignment model (0a). Each assignment resolves **Pass Block** (+ Agility vs. speed rusher, + Strength vs. power rusher) vs. **Pass Rush** (+ Burst/Agility or Strength); doubles combine blockers; blitz/stunt pickup rolls **Blocking Awareness** → time until pressure.
2. **Read:** QB **Processing** works through the concept (primary → secondary → checkdown) against the coverage. Motion and Shotgun help; disguise (Sim pressure) hurts.
3. **Separation:** receiver **Route Running** + Agility (+ Speed deep) vs. defender **Man** (+ Agility/Speed) or **Zone** coverage; **Release** vs. **Press** at the line if pressed.
4. **Throw:** **Short/Deep Accuracy** by depth, **Arm Strength** for tight windows and range; under pressure, **Pocket Presence** decides throw/throwaway/scramble/sack (+ Speed/Agility to escape).
5. **Catch:** **Hands** (drops); contested → **Contested Catch** + Size vs. **Ball Skills** + Size.
6. **After catch:** **Elusiveness**, Contact Balance, Speed vs. **Tackling**, Speed.
7. **Risk:** INT chance from inaccurate/contested throws × QB **Decision-Making** × defender **Ball Skills** (+ Play Recognition for jumped routes). Sack chance from protection loss × (1 − Pocket Presence). Fumbles on sacks/catches: **Ball Stripping** vs. **Ball Security**.

#### 3.6 Quick
- **What:** 3-step timing (slants, hitches, outs, quick flats); ball out < ~2.2s.
- **Trenches:** rush barely matters (sacks rare; mostly unblocked blitzers).
- **O:** QB Short Accuracy + Processing (fast), Arm (outs); WR **Release** + Route Running + Hands; YAC: Elusiveness.
- **D:** CB **Press** + Man Coverage; LB/Slot CB Zone Coverage (underneath windows); Play Recognition + Ball Skills (jumped routes → pick-sixes).
- **Beats:** off coverage, Cover 3/4 underneath space, blitzes (hot throws). **Dies to:** press man (Cover 1 with good Press), Cover 2 squatting corners.
- **Target shape:** ~75% comp, ~4 aDOT, ~6.0 Y/A, ~2% sacks, ~1.5% INT.

#### 3.7 Dropback
- **What:** 5-step progression; depth comes from the read (short through intermediate, occasional deep).
- **Trenches:** full protection battle.
- **O:** QB **Processing** + Short/Deep Accuracy + **Pocket Presence** + Decision-Making; receivers Route Running + Hands + Contested Catch; OL Pass Block.
- **D:** Pass Rush vs. OL; CB/S/LB Man or Zone (per call); S Zone + Speed (range); Ball Skills.
- **Beats:** whichever coverage the QB correctly reads. **Dies to:** strong 4-man pressure + good coverage; disguised pressure vs. low Processing.
- **Target shape:** ~62% comp, ~9 aDOT, ~7.0 Y/A, ~7% sacks, ~2.5% INT.

#### 3.8 Deep Shot
- **What:** 7-step or max protection; 1–2 deep routes.
- **Trenches:** long protection (RB/TE usually stay in to Pass Block) → pass rush amplified.
- **O:** QB **Arm Strength** + **Deep Accuracy** + Pocket Presence; WR **Speed** + Release + Contested Catch + Size.
- **D:** CB **Speed** + Man/Zone + Ball Skills; FS **Speed** + Zone + Play Recognition (help over the top); Pass Rush.
- **Beats:** Cover 0/1 with weak CBs, single-high vs. speed. **Dies to:** Cover 2/4 two-high shells, strong pass rush.
- **Target shape:** ~38% comp, ~25 aDOT, ~9.5 Y/A, ~9% sacks, ~5% INT.

#### 3.9 RB Screen
- **What:** let the rush through, OL release to set a convoy.
- **Trenches:** OL Pass Block briefly, then **Agility** + Speed releasing downfield.
- **O:** RB Hands + **Elusiveness** + Vision + Burst; QB Short Accuracy (touch over the rush).
- **D:** LB **Play Recognition** + Speed + Tackling; DL Play Recognition (retreating); aggressive rushers/blitz = (+).
- **Beats:** blitzes, aggressive 4-man rushes. **Dies to:** high-Play Recognition LBs, disciplined rush.
- **Target shape:** ~85% comp, ~6 Y/A, occasional explosive, ~2% TFL.

#### 3.10 WR Screen (bubble/tunnel)
- **What:** instant throw to the perimeter behind WR/TE stalk blocks.
- **Trenches:** none (ball out instantly; tunnel uses OL Agility).
- **O:** WR/TE **Run Block** (stalk); target Elusiveness + Burst + Speed + Hands; QB Short Accuracy.
- **D:** CB **Press** / rolled-up corners; CB/S Tackling + Play Recognition.
- **Beats:** off coverage, Cover 3/4 with soft corners, light numbers outside. **Dies to:** press, Cover 2 corners, high-Play Recognition DBs.
- **Target shape:** ~90% comp, ~5.5 Y/A, low variance.

#### 3.11 Gadget Pass (HB pass, WR pass, flea flicker)
- **What:** handoff/pitch, non-QB throws (or pitches back to QB for flea flicker). Only callable if a non-QB with real Arm Strength is on the field, or as a flea flicker.
- **Trenches:** long-developing → protection must hold (Pass Block vs. Pass Rush).
- **O:** passer Arm Strength + Short/Deep Accuracy; deep target Speed + Release; carrier Ball Security (exchange).
- **D:** CB/S **Play Recognition** (key), Zone Coverage, Ball Skills.
- **Beats:** aggressive, low-Play Recognition secondaries; teams that have been beaten by the run. **Dies to:** disciplined safeties, pressure.
- **Target shape:** ~45% comp, ~11 Y/A, ~6% INT, rare (≤0.5% of plays).

### SITUATIONAL (triggered by the game state, not the OC's mix)

#### 3.12 Hail Mary
- **When:** last play of half/game, out of range.
- **O:** QB **Arm Strength** (must reach the end zone) + Pocket Presence; receivers **Contested Catch** + **Size** + Hands.
- **D:** DB Ball Skills + Size.
- **Target shape:** ~5–8% TD from 45–55 yards; INT ~20%.

#### 3.13 Spike
Stops the clock, costs a down. No attributes.

#### 3.14 Kneel
Victory formation: −1 yard, runs clock. No attributes.

---

## 4. Offensive tags

Up to **2 tags** per play. Stacking allowed only where the compatibility matrix says so.

| Tag | Effect | O attributes | D attributes (counter) |
|---|---|---|---|
| **Motion** | Reveals man vs. zone → QB read (+); moving receiver gets leverage/separation (+) on the snap; gives Jet Sweep and fake-jet looks. Fake-jet effect grows once the team has actually run Jet Sweeps that game | QB Processing; motion player Speed/Agility | Play Recognition (disguise holds) |
| **Trickery** | Misdirection (reverse, fake reverse, counter look). If the defense bites: big edge (+); if not: slow play, big loss risk (−). Amplifies variance | Carrier Speed + Elusiveness + Ball Security | **Play Recognition** decides it |
| **Play-Action** | Fake handoff pulls LBs/S up → bigger windows behind them (+). Strength scales with the offense's **actual run success that game/season** and Under center (+). Costs: longer drop, back to the defense → pressure risk (−) | QB Pocket Presence; OL Pass Block | LB/S **Play Recognition** (don't bite) |
| **Bootleg** | QB moves the pocket: half-field read (Processing demand (−)), avoids interior rush, adds run option. Unblocked backside EDGE is the danger | QB **Throw on the Run** + Speed + Agility | EDGE **Play Recognition** (contain) + Speed |
| **Rub** | Pick/rub concepts: big separation (+) vs. **man coverage**, nothing vs. zone. Red-zone favorite | Receiver Route Running + Agility | Man Coverage + Play Recognition (fight through) |
| **RPO** | Run play with an attached quick throw; QB picks post-snap by reading a conflict defender (LB/S). Effectively lets the offense pick the better of the run and a Quick throw | QB **Processing** + Decision-Making + Short Accuracy | Conflict defender **Play Recognition** |
| **Sideline** | Auto in 2-minute drill. Targets outside-breaking routes: clock stops on ~70% of completions; YAC (−); tighter throw (Arm Strength + Accuracy); INT risk on outs vs. zone corners | QB Arm Strength + Accuracy | CB Zone Coverage + Ball Skills |

---

## 5. Defensive calls

### 5a. Package (answers personnel)
| Package | Personnel | Effect |
|---|---|---|
| **Base** (4-3 or 3-4) | 4 DL/3 LB or 3 DL/4 LB | Run defense (+), coverage (−) (LBs covering) |
| **Nickel** | 5 DB (Slot CB on) | Balanced; the modern default |
| **Dime** | 6 DB | Coverage (+), run defense (−) (light box) |
| **Goal Line** | Heavy DL/LB | Short-yardage run D (+), very vulnerable to Play-Action/passes |

### 5b. Front (DC scheme — sets alignments → blocking matchups)
| Front | Alignment | Effect |
|---|---|---|
| **4-3 Over/Under** | 3-tech + 1-tech, two EDGE/DE | Balanced; 3-tech DT pass rush emphasized |
| **3-4 Odd** | 0-tech NT, two 5-tech DE, 3-4 OLB (EDGE) | Inside run D (+) if the NT holds (Strength + Block Shedding); interior pass rush (−) |
| **Tite** | 0-tech NT + two 4i DE | Inside & Gap runs (−) for offense, forces runs outside; pairs with two-high shells |
| **Wide-9** | EDGEs aligned very wide | Speed rush (+) (EDGE Pass Rush + Burst + Speed); inside runs and Draws (+) for offense |

### 5c. Coverage
| Coverage | Type | Strong vs. | Weak vs. | Key D attributes |
|---|---|---|---|---|
| **Cover 0** | All man, no deep help (always paired with blitz) | Quick (if pressed), runs (extra box defender) | Deep Shot, Rub, RB Screen, any missed tackle = TD | Man Coverage, Press, Speed |
| **Cover 1** | Man + single-high FS | Runs (8-man box), Quick vs. good press | Rub/crossers, Deep vs. slow CBs, mismatches (RB/TE on LB) | Man Coverage, Press; FS Speed + Zone |
| **Cover 2** | 2 deep halves, 5 under; corners squat | Quick outs/flats, WR Screen, outside runs (corners support) | Deep middle/seams, Dropback intermediate holes, inside runs | CB Press + Tackling; S Zone + Speed |
| **Cover 3** | 3 deep, 4 under; single-high | Runs (8-man box), Deep outside | Flats/seams, Quick, WR Screen, curl-flat Dropback | CB Zone + Speed; FS range |
| **Cover 4** (quarters) | 4 deep; safeties read run | Deep Shot, verticals; runs *if* safeties have Play Recognition | Quick underneath, flats, WR Screen, Play-Action vs. safeties | S Zone + Play Recognition; CB Zone |

### 5d. Pressure
| Pressure | Effect | Key attributes |
|---|---|---|
| **4-man rush** | Baseline | DL/EDGE Pass Rush vs. OL Pass Block |
| **5-man blitz** | Faster pressure/sacks (+) for D; one fewer cover man → hot throws, RB/WR Screens, Draws (+) for O | Blitzer Pass Rush + Burst vs. RB/TE Pass Block; QB Processing (hot read) + Pocket Presence |
| **Sim pressure** | 4 rushers from unexpected spots, a DL drops: confuses protection & reads without losing coverage bodies | OL/RB **Blocking Awareness** (pickup) + QB **Processing**; dropping DL uses their (low) Zone Coverage → small hole |
| **Stunt / Twist** | DL games: rushers exchange gaps to create a free lane without adding rushers. Can pair with any rush count | Looper Pass Rush + Agility vs. OL **Blocking Awareness** (passing it off) |

---

## 6. Special teams

| Play | O / kicking side | D / return side | Notes |
|---|---|---|---|
| **Kickoff** | K Comfort Range (depth/touchback rate) + Trajectory (hang time); coverage unit (depth players) Speed + Tackling | Returner Vision + Burst + Elusiveness + Speed + Ball Security; return blockers Run Block | Touchback → 35 (current rule) |
| **Punt** | P Punt Distance (gross), Hang Time (vs. outkicking coverage), Directional Placement (OOB/coffin corner/away from returner), Spin Control (touchback avoidance, hard to field); coverage Speed + Tackling | Returner as above + Hands (muffs) | Fair catch when coverage arrives first |
| **Field Goal / PAT** | K Kick Consistency (inside comfort range) + Comfort Range + Range Falloff (beyond it) + Trajectory (range, block avoidance); OL Pass Block | DL/EDGE Pass Rush + Size (block chance, reduced by Trajectory) | |
| **2-point try** | Uses normal plays from the 2 (Quick, Dropback, Base Run Inside, Option, Rub tag) | Normal defense (Goal Line or Nickel) | |
| **Onside kick, fakes** | *Deferred* | | |

---

## 7. Compatibility

### 7a. Play type × tag (✓ allowed · ● built in · — not allowed)
| Play | Motion | Trickery | Play-Action | Bootleg | Rub | RPO | Sideline |
|---|---|---|---|---|---|---|---|
| Base Run — RB Inside | ✓ | — | — | — | — | ✓ | — |
| Base Run — RB Outside | ✓ | ✓ | — | — | — | ✓ | — |
| Base Run — QB (either) | ✓ | — | — | — | — | — | — |
| Draw | ✓ | — | — | — | — | — | — |
| Option | ✓ | — | — | — | — | — | — |
| QB Sneak | — | — | — | — | — | — | — |
| Jet Sweep | ● | ✓ (= reverse) | — | — | — | — | — |
| Quick | ✓ | — | — | ✓ (sprint-out) | ✓ | — | ✓ |
| Dropback | ✓ | — | ✓ | ✓ | ✓ | — | ✓ |
| Deep Shot | ✓ | ✓ (fake reverse) | ✓ | ✓ | — | — | ✓ |
| RB Screen | ✓ | — | — | — | — | — | — |
| WR Screen | ✓ | — | — | — | — | — | — |
| Gadget Pass | ✓ | ● | ● | — | — | — | — |
| Hail Mary / Spike / Kneel | — | — | — | — | — | — | — |

Allowed stacks: Motion + any one other tag; Play-Action + Bootleg; Rub + Sideline. No other pairs.

### 7b. Formation restrictions
| Play/Tag | Formations |
|---|---|
| QB Sneak | Under center |
| Option, Draw, RPO | Shotgun, Pistol |
| Base Run (RB) | Any except Empty |
| Base Run (QB) | Any (QB draw from Empty) |
| Play-Action | Any; strongest Under center, then Pistol |
| Kneel | Under center or Shotgun |

---

## 8. Target selection (pass plays)

Each eligible receiver gets a weight = **concept role** × **coverage leverage** × **QB read**:
- **Concept role:** each play type defines primary / secondary / checkdown slots, filled by the players on the field (X, Z, Slot, Y TE, H TE, RB/FB).
- **Coverage leverage:** vs. man → how well his Route Running/Speed/Release beats his defender; vs. zone → whether his route sits in that coverage's soft spot (e.g., seams vs. Cover 2, flats vs. Cover 3, underneath vs. Cover 4).
- **QB read:** low Processing locks onto the primary or checks down early; high Processing finds the best open man. Low Decision-Making forces balls to the primary even when covered.
- **Fixed primary** (no read): RB Screen, WR Screen, Jet Sweep, Gadget Pass, RPO throw.

---

## 9. Attribute → usage index (for review)

| Attribute | Used in |
|---|---|
| Speed | Base Run (Outside carrier, pursuit), Option, Jet Sweep, Deep Shot (WR, CB, FS), YAC on all passes, Screens (convoy & pursuit), Bootleg (QB, EDGE), scrambles, returns & coverage, pullers (Gap) |
| Burst | Base Run carriers, Draw, Option, Jet Sweep, pass rush get-off, blitzing, YAC, returns |
| Agility | Zone blocking, pulling, Screens (OL release), route breaks, Man Coverage mirroring, speed rush bend & pass-pro vs. speed, Bootleg, scrambles, penetrating DL vs. Zone |
| Strength | Gap blocking, QB Sneak (both sides), pass-pro anchor vs. power, power rush, Block Shedding/double teams, Contact Balance, forced fumbles |
| Size | Contested catches, Hail Mary, Block Shedding, QB Sneak, batted balls/FG blocks, position fit |
| Short Accuracy | Quick, Dropback, Screens, RPO, Gadget, Sideline |
| Deep Accuracy | Dropback (deep reads), Deep Shot, Gadget |
| Arm Strength | Deep Shot, Hail Mary, Sideline, tight windows (Dropback), Gadget passer |
| Processing | Dropback, Quick, Option, RPO, Motion bonus, vs. blitz/sim pressure, sack avoidance (time to throw) |
| Decision-Making | INT risk on all passes, target forcing, RPO, throwaways |
| Pocket Presence | Sack/throwaway/scramble conversion under pressure on all passes; Play-Action; Hail Mary |
| Throw on the Run | Bootleg, scramble throws |
| Vision | Base Run (Zone especially), Draw, RB Screen, returns |
| Elusiveness | Outside runs, Jet Sweep, Option, YAC, Screens, returns |
| Contact Balance | Inside/Gap runs, QB Sneak, YAC after contact |
| Ball Security | All carries, catches, sacks (QB), option pitches, returns |
| Route Running | All non-screen passes (separation, target share), Rub |
| Release | Quick, Deep Shot, vs. Press everywhere |
| Hands | All catches (drops), punt returns (muffs) |
| Contested Catch | Deep Shot, Dropback tight windows, red zone, Hail Mary |
| Pass Block | All passes (OL, TE, RB pickup), double teams, Draw (initial set), FG protection |
| Run Block | All runs (OL/TE/FB/WR stalk), combos & climbs, pullers, WR Screen, Jet Sweep, return blocking |
| Blocking Awareness | Blitz pickup, stunt/twist pickup, Sim pressure, combo climb timing, missed assignments (all runs and passes) |
| Pass Rush | All passes, blitzes, FG blocks |
| Block Shedding | All runs (point of attack, edge setting), QB Sneak |
| Tackling | All runs & catches (missed tackles, yards after contact), Screens, special teams coverage |
| Ball Stripping | Forced fumbles on every tackle, strip-sacks |
| Play Recognition | Draw, Option, RPO, Screens, Play-Action, Bootleg, Trickery, Gadget, jumped routes, Zone gap discipline, Cover 4 run support |
| Man Coverage | Cover 0/1 (and man-matched Nickel/Dime), vs. Rub, RB/TE split-out mismatches |
| Zone Coverage | Cover 2/3/4, Sideline INTs, sim-pressure droppers, S range |
| Press | Quick, WR Screen, Release battles, Cover 0/1/2 |
| Ball Skills | INTs & PDs on all passes, Hail Mary, contested catches |
| Kick Consistency | FG inside comfort range, PAT |
| Comfort Range | FG range, kickoff depth |
| Range Falloff | FG beyond comfort range, max attempt distance |
| Trajectory | FG blocks, small range bonus, kickoff hang time |
| Punt Distance | Gross punt yards |
| Directional Placement | OOB/coffin-corner punts, inside-20 rate, punting away from returners |
| Hang Time | Return yardage allowed (outkicking coverage), fair-catch rate |
| Spin Control | Touchback avoidance, muffs, fair catches |
| Durability | Injury rolls on contact (QB runs and Option expose more) |
| Consistency | Per-game rating swing for every player |
| Stamina | DL/EDGE/RB rotation shares, fatigue on long drives |
| Development Curve / Ceiling | Offseason progression only |

---

## 10. Known gaps / decisions flagged in this draft
1. **Jet Sweep vs. "WR carrier" in Base Run** — resolved here: Base Run carriers are RB/FB and QB only; WR runs live in Jet Sweep (+ Trickery = reverse).
2. **FB** — carrier on Inside Base Run only; otherwise lead blocker/receiver in 21/22.
3. **Aging groups (1i)** — proposed, pending approval.
4. **Deferred:** penalties/Discipline, onside kicks, fake punts/FGs, spy/robber coverages, no-huddle tempo, weather/wind (Trajectory will matter more once wind exists).
5. **Added in review:** assignment-based trench model (0a), Blocking Awareness, Ball Stripping (split from Tackling), Stunt/Twist pressure, 4-attribute kicker and punter models.
