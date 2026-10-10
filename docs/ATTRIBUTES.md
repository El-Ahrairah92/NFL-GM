# Attributes: what each one does and what it is worth

Measured with the engine as of this commit. For each row, one team's players at that position were given +15 on the attribute and the opponent's −15 (a 30-point gap), over 1,600 games. "Points" is the change in average margin. Anything under about 0.7 is inside the test's noise and is shown as "small".

Every attribute is compressed halfway toward the league average on each snap (`TUNE.spread`), except a quarterback's passing skills, which count slightly more than face value (`TUNE.spreadQB`).

## Whole position groups

| Group | Points |
|---|---|
| QB | 9.4 |
| WR room | 7.6 |
| Edge rushers | 6.7 |
| Linebackers | 6.2 |
| Offensive line | 6.0 |
| Cornerbacks | 5.9 |
| RB | 4.6 |
| TE | 4.5 |
| Interior DL | 4.5 |
| Safeties | 4.2 |
| K | 1.1 |
| P | 1.0 |

## Quarterback

| Attribute | Used for | Points |
|---|---|---|
| Processing | Speed through the progression; reading the coverage before the snap; spotting the blitz; helping the line pick it up; option and RPO reads | 2.2 |
| Arm strength | Accuracy on intermediate and deep throws and out-breakers; fitting the ball into tight windows; throwing under pressure; fewer interceptions on balls that travel; maximum range | 1.6 |
| Speed | Scrambling and escaping the rush | 1.6 |
| Short accuracy | Catchable balls under 10 yards and half of the 10–20 yard throws | 1.3 |
| Deep accuracy | Catchable balls beyond 10 yards | 0.9 |
| Decision-making | How accurately he judges each window; interceptions; throwing it away | 0.9 |
| Agility | Escaping pressure, scrambling | 0.7 |
| Pocket presence | Feeling and slipping the rush; less of a hurry penalty. Trades sacks (−0.9 a game) for hurried throws, so completions dip | small |
| Throw on the run | Accuracy on bootlegs and after escaping | small |
| Contact balance | Breaking tackles as a runner | small |

## Running back

| Attribute | Used for | Points |
|---|---|---|
| Contact balance | Breaking tackles at the line; yards after contact | 1.3 |
| Hands | Catch radius and drops as a receiver; screens | 1.1 |
| Elusiveness | Making tacklers miss, mostly in space | small (0.6) |
| Strength | Yards after contact against the tackler's strength | small (0.6) |
| Burst, vision, ball security, agility, speed | Hitting the hole; cutbacks on zone runs; fumbles; breakaways | small each |
| Route running, pass blocking | Getting open out of the backfield; blitz pickup | small |

## Receivers

| Attribute | Used for | Points |
|---|---|---|
| Route running | The largest part of getting open, man or zone; option routes | 2.7 |
| Hands | Catch radius, drops on every target (more in traffic), part of contested catches | 1.8 |
| Burst | Separation on short and intermediate routes | 1.2 |
| Release | Beating the jam and hand-fighting against man; squat corners and reroutes in zone | 0.8 |
| Contested catch | Winning the ball in a tight window | small (0.6) |
| Contact balance | Yards after the catch | small (0.7) |
| Speed | Separation on deep routes; breakaways | small |
| Agility, elusiveness, strength | Part of separation; yards after the catch | small |

## Tight end

| Attribute | Used for | Points |
|---|---|---|
| Route running | Getting open | 1.4 |
| Run blocking | Edge and second-level blocks | 0.8 |
| Burst | Short and intermediate separation | 0.8 |
| Hands | Drops and catch radius (about half a drop a game) | small |
| Contested catch, release, strength, speed | As for receivers | small |
| Pass blocking, blocking awareness, agility, elusiveness, ball security | Kept in to protect; after the catch | small |

## Offensive line

| Attribute | Used for | Points |
|---|---|---|
| Run blocking | Winning the block at the point of attack | 1.8 |
| Pass blocking | Time before the rusher gets home, against speed and power | 1.4 |
| Blocking awareness | Picking up blitzes and stunts; part of pass blocking against speed | 1.3 |
| Agility | Pass blocking against speed rushers; reaching blocks | 1.1 |
| Strength | Pass blocking against power; run-block movement | 0.9 |
| Speed, burst | Pulling and climbing | small |

## Interior defensive line

| Attribute | Used for | Points |
|---|---|---|
| Burst | Getting home when free; part of speed rush | 1.5 |
| Block shedding | Defeating run blocks | 1.4 |
| Strength | Power rush; holding the point against the run | 1.1 |
| Pass rush | Time to beat a pass blocker | 1.1 |
| Tackling | Finishing at the line | 0.8 |
| Agility | Speed rush; looping on stunts | 0.8 |
| Strip, play recognition | Forcing fumbles; not biting on draws and fakes | small |

## Edge rushers

| Attribute | Used for | Points |
|---|---|---|
| Pass rush | Time to beat the tackle (0.7 more sacks a game) | 2.2 |
| Block shedding | Setting the edge against the run | 1.4 |
| Burst | Speed rush; closing on the quarterback | 1.2 |
| Strength | Power rush; holding the edge | 1.0 |
| Agility | Speed rush | 0.9 |
| Speed, tackling, strip, play recognition | Pursuit; finishing; strip-sacks; reading option and boot | small |

## Linebackers

| Attribute | Used for | Points |
|---|---|---|
| Play recognition | Not biting on play-action, draws and RPOs; part of zone coverage | 1.1 |
| Strength | Tackling at the line | 0.9 |
| Ball skills | Interceptions and breakups | 0.9 |
| Zone coverage | Underneath zones (linebackers move the window less than defensive backs) | small (0.5) |
| Tackling, agility | Finishing; mirroring runners in space and underneath coverage | small (0.6 each) |
| Burst, man coverage, press, shed, speed | Blitzing; covering backs and tight ends; rerouting; taking on blocks; pursuit | small |

## Cornerbacks

| Attribute | Used for | Points |
|---|---|---|
| Tackling | Limiting yards after the catch; run force | 1.3 |
| Burst | Staying with short and intermediate routes in man | 1.2 |
| Zone coverage | Closing the window in zone | 1.1 |
| Press | Jamming the release, in man and as a squat corner | 0.8 |
| Man coverage | Closing the window in man | small (0.6) |
| Agility | Part of man coverage and space tackling | small (0.7) |
| Ball skills | Interceptions, breakups, contested catches | small on margin; +0.1 interceptions a game |
| Speed, play recognition, strip, shed | Deep routes and pursuit; zone reads; fumbles | small |

## Safeties

| Attribute | Used for | Points |
|---|---|---|
| Man coverage | Covering tight ends and slots | 0.9 |
| Speed | Deep range in single-high and deep zones; pursuit angles | 0.9 |
| Ball skills | Interceptions and breakups | 0.8 |
| Agility | Underneath coverage and tackling in space | 0.7 |
| Tackling | Last line against runs and catches | small (0.5) |
| Zone coverage | Deep and robber zones | small on margin; lowers completion rate |
| Play recognition, press, burst, shed, strength | Reading fakes; rerouting; run fits | small |

## Kicker and punter

| Attribute | Used for | Points |
|---|---|---|
| K range | How far out he stays reliable (+8 points of field-goal rate) | 0.9 |
| K falloff | How quickly accuracy drops beyond his range | 0.9 |
| K consistency | Making the kicks inside his range (+5 points of field-goal rate) | small (0.4) |
| K trajectory | A small part of range | small |
| P distance | Gross yards (+3.1 a punt) | small |
| P hang time | Fair catches and return length | small |
| P placement | Pinning inside the 10 from plus territory | small |
| P spin | Saving touchbacks, forcing fair catches and muffs | small |

## Still too small to measure

These are connected and do change individual plays, but a 30-point gap did not move the score in this test: QB throw on the run; RB route running and pass blocking; most tight end side skills; OL speed and burst; interior DL play recognition; safety play recognition, press, shed and strength; kicker trajectory; and all four punter skills individually (together the punter is worth about a point).

## Final measurement (after the shape fixes and the rating refit)

Same method, 1,600 games per row, engine as committed. Noise is about ±0.7 points on any single row. These supersede the per-attribute point values in the tables above; the "used for" descriptions still apply, with these changes: ball placement (accuracy) now decides much more of whether a throw is catchable; speed is the main separator on deep routes for receivers and the defenders covering them; man-coverage skill carries more of man coverage; hands are part of every catch; interior pressure makes it harder for the quarterback to step up and throw; linebackers move coverage windows less than defensive backs; a missed tackle after the catch is worth more.

| Group | Whole group | Attributes, most valuable first |
|---|---|---|
| Quarterback | 11.8 | Arm strength 2.7, Processing 2.7, Short accuracy 2.1, Pocket presence 1.5, Deep accuracy 1.2, Speed 1.1, Decision-making 1.0, Agility small, Contact balance small, Throw on the run small |
| Running back | 3.9 | Contact balance 1.9, Strength 1.0, Elusiveness small, Vision small, Ball security small, Route running small, Speed small, Hands small, Pass blocking small, Burst small, Agility small |
| Receivers | 9.1 | Route running 3.1, Burst 1.4, Hands 1.4, Contested catch 1.2, Strength 1.1, Agility 1.0, Speed 0.9, Release small, Elusiveness small, Contact balance small |
| Tight end | 3.8 | Route running 1.0, Agility 1.0, Burst small, Release small, Blocking awareness small, Contested catch small, Run blocking small, Hands small, Pass blocking small, Strength small, Elusiveness small, Ball security small, Speed small |
| Offensive line | 6.0 | Run blocking 1.9, Pass blocking 1.9, Strength 1.7, Agility 1.6, Blocking awareness 1.4, Burst small, Speed small |
| Interior defensive line | 5.9 | Block shedding 1.5, Burst 1.3, Pass rush 1.3, Strength 1.0, Agility small, Tackling small, Play recognition small, Strip small |
| Edge rushers | 6.1 | Block shedding 1.7, Pass rush 1.6, Agility 1.0, Burst 0.9, Tackling 0.8, Strength 0.8, Play recognition small, Speed small, Strip small |
| Linebackers | 4.6 | Tackling 1.2, Speed 0.9, Play recognition 0.9, Zone coverage small, Burst small, Agility small, Man coverage small, Strength small, Ball skills small, Press small, Block shedding small |
| Cornerbacks | 6.5 | Man coverage 1.8, Zone coverage 1.1, Ball skills 0.9, Agility 0.8, Press small, Burst small, Speed small, Play recognition small, Strip small, Tackling small, Block shedding small |
| Safeties | 4.9 | Speed 1.5, Play recognition 1.3, Ball skills 0.7, Zone coverage small, Tackling small, Burst small, Block shedding small, Man coverage small, Strength small, Agility small, Press small |
| Kicker | 0.8 | Trajectory small, Range small, Falloff small, Consistency small |
| Punter | 1.4 | Hang time 0.8, Placement small, Spin small, Distance small |

Rating weights (`js/derived.js`, version 4) are fitted to this table: 65% what each attribute moves on the field, 35% the earlier weights, with every position re-centred so its average rating did not change. A typical player moved about one rating point.

An elite quarterback (92 in every passing skill) takes a bottom-six roster to about ten wins in seventeen; a poor one (62) wins about five with the same roster.

## Size

Height, weight and reach are judged against the norm for a player's own position, so "big" means big for a corner or big for a guard. Bigger is generally better. The cost of weight is mostly carried by his athletic ratings (a prospect a standard deviation heavier than his position's norm is generated about 2 points slower, 1.5 less agile and 3 stronger), with only small direct penalties in the engine.

| Position | Weight | Height and reach |
|---|---|---|
| QB | Harder to sack; sneaks. Slightly slower to escape | Throws over the middle; fewer batted passes |
| RB | Runs through tackles at the line, yards after contact | A shorter back has the lower centre of gravity at the line |
| WR / TE | Beating press, contested catches, yards through contact, perimeter blocks | Contested catches; deep balls |
| OL | Anchor against power; drive blocks. Slightly worse against speed and on the move | Reach keeps speed rushers off |
| DL / Edge | Holds the point against the run; power rush. Tires a little sooner | Speed rush; batting passes; playing off zone blocks |
| LB | Takes on linemen; tackling | Closes underneath throwing lanes |
| CB / S | Press, contested catches, tackling | Press; contested catches; deep balls |

Measured (a player 1.5 standard deviations above the norm against one 1.5 below, 2,000 games, body only with ratings held equal), in points per game: weight is worth QB 0.3, RB 1.5, WR 0.8, TE 0.6, OL 1.6, interior DL 1.1, edge 1.4, LB 0.9, CB 1.3, S 0.8. Height is worth QB 0.5, TE 0.8, S 0.8, and about 0.3–0.4 for OL, edge and CB; it is neutral for RB, WR, interior DL and LB. About 1.5% of throws are batted at the line (0.46 per team per game), almost all by defensive linemen.

`TUNE.size` scales every one of these effects; 0 switches them off.

## Receivers blocking on the edge

On an outside run the widest receiver or tight end on that side has to block the corner who forces the play. His run blocking, strength, agility and weight go against the corner's block shedding, tackling, strength and weight, with the receiver giving up a dozen points because he is not a lineman. A good block makes the corner less likely to be in on the tackle, later to arrive and easier to break. It is a small, situational skill: too small to move league-wide rushing numbers in testing, but it is live on every outside run.

## Penalties

Flags follow discipline. Each side's chance on a play scales with the discipline of the players involved (about two thirds), the position coach who runs their room (about one third) and the head coach's culture. The least disciplined player on the field is the likeliest to draw the flag, and penalties are kept as a player stat.

- Before the snap: false start, delay, illegal formation (more when the unit is still learning the playbook, and on the road); offside, neutral zone, encroachment, twelve men.
- During the play: offensive holding (more when the rusher has won), defensive pass interference at the spot (more for a beaten or slow defender), defensive holding and illegal contact, roughing the passer. The other side declines when the play already went its way.
- After the whistle: face mask, unnecessary roughness, horse collar, taunting. The play stands and fifteen yards are added.

Measured over sixteen seasons: about 5.9 accepted penalties and 45 yards per team per game, with teams ranging from roughly 60 to 135 a season. Low-discipline players are flagged about three times as often as high-discipline ones.

## Season realism audit

The engine is checked against about 120 season-level numbers from a normal recent NFL season: league rates, team extremes, leaderboards at several depths, and how many players clear the usual milestones. Sixteen simulated seasons, after tuning:

- League rates in range: points 23.2, plays 63.2, completion 64.3%, 7.2 yards per attempt, sack rate 6.7%, 4.4 yards per carry, third down 40%, field goals 86%, scrambles 5.5% of dropbacks, about 2 defensive touchdowns per team.
- Catch rates by position: receivers about 65%, tight ends 71%, backs 79%.
- Leaders in range: passing about 5,100, rushing about 1,640, receiving about 1,650, 120 catches, 170 tackles, 17 sacks, 6 interceptions, 19 passes defended.
- Still off: the best and worst starting quarterbacks are further apart in completion percentage than real ones (about 74% and 55% against 70% and 58%); gains of 20 yards or more are a little rare and first downs a little common; too many players reach 120 tackles because starting linebackers never rotate.

Quarterback remains the most leveraged position after this pass: a 30-point gap across his attributes is worth about 11 points a game, against 8.5 for a whole receiver group and 7 for a whole offensive line.

## Snap counts and playing-time bands

Snap counts are exact: every play puts eleven men on each side and each one is credited, so a player's snaps always reconcile with the personnel grouping and package that were called. Kneel-downs, spikes and kicking plays are not counted.

Measured share of the unit's snaps in games a player appeared in (staff-run teams / your own chart at its usual settings):

- Quarterback 98. Lead back 69, second back 33–38.
- Receivers 91 / 83 / 67 / 30. Tight ends 77 / 35 / 15. Linemen 93–100.
- Edge 81–84 / 72–77 / 43–50. Interior line 77–80 / 67–71 / 48–55 / 29–31.
- Linebackers 95 / 80–85 / 38. Corners 99 / 96 / 57–66. Safeties 99 / 92–96, with a third safety around 45 (big nickel and dime).
- Calls: 11 personnel about 60%, 12 about 18%, 10 about 9%; nickel about 57%, base about 29%, dime about 13%.

When you run a unit yourself, "Next man's snaps" at each spot moves inside a band (least / usual / most) and the engine never goes outside it, whatever an older save holds:

- Running back 20 / 35 / 50%. Edge 10 / 20 / 40%. Interior line 15 / 25 / 45%. Nose 15 / 25 / 50%.
- X and Z 0 / 3 / 15%. Slot 0 / 6 / 25%. Tight ends 0 / 8 / 30%.
- Middle linebacker 0–10%, weak side 0–20%, corners 0–8 or 10%, slot corner 0–20%, safeties 0–8 or 10%. Quarterback and offensive line do not rotate.

The man who rotates in is the first one listed at the spot who is not already starting somewhere else in that grouping, and the staff's default order keeps players in their own position rooms.

## Re-audit after the explosive-play retune (rating weights version 5)

Same method (one club's men at a position +15 on the attribute, the opponent's -15), 1,200 games a row, 2,400 to 2,800 for anything doubtful. Noise is about 0.4 points on a 1,200-game row and 0.3 on the larger ones.

Whole groups, points a game: quarterback 8.3, cornerbacks 7.6, receivers 7.5, safeties 7.0, edge rushers 6.8, running back 6.4, offensive line 6.3, interior line 5.1, linebackers 4.8, tight end 4.4, punter 0.9, kicker 0.6.

Every attribute is read by the engine and none works backwards. Each one below moves its own statistic clearly in the right direction:
- Quarterback: arm strength (yards per attempt), deep accuracy (yards per attempt), short accuracy (completion rate), decision-making (interceptions), processing and pocket presence (sacks), throw on the run (completion rate, small).
- Running back: contact balance, elusiveness, speed, strength, agility and vision (yards per carry), route running (completion rate), hands (drops), ball security (fumbles).
- Receivers: route running and contested catch (completion rate), speed (yards per attempt and after the catch), hands (drops), release (completion rate), elusiveness and contact balance (yards after the catch).
- Tight end: route running, hands, agility; the blocking skills are too small to see in the score.
- Offensive line: run blocking (yards per carry), pass blocking and blocking awareness (sacks), strength, agility.
- Defensive line: block shedding and strength (yards per carry), pass rush and burst (sacks); edge agility.
- Linebackers: play recognition, tackling (yards after the catch), man and zone coverage (completion rate, small).
- Cornerbacks: man and zone coverage (completion rate), ball skills (interceptions), speed (yards after the catch).
- Safeties: zone coverage, ball skills (interceptions), tackling (yards after the catch).
- Kicker: consistency, range and falloff (field goal rate), trajectory (kick return spot). Punter: distance, hang time, spin.
- Special teams skill: kick return spot and fair catches, very clearly.

Found and fixed:
- **A running back's elusiveness did nothing** (0.00 yards per carry). It now makes tacklers miss directly, most of all in the open field: 0.30 yards per carry for the 30-point gap.
- **Agility and vision did almost nothing for a back.** Agility now helps in the open field (0.16) and vision at the second level, where reading blocks sets up the next defender (0.15).

Still too small to measure: a back's burst and pass blocking, an edge rusher's straight-line speed, a safety's man coverage, a tight end's contested catch and blocking, ball stripping at every position.

**Rating weights refitted (version 5).** Each attribute's weight is half the old weight and half what it is now measured to be worth, counting only what we can be confident of (the measured value less one standard error), so noise earns nothing. Every position is re-centred so its average rating does not move. A typical player moves under one rating point; the largest moves are about three (safeties, whose zone coverage now counts for more). Main shifts: a back's elusiveness and agility up and balance down; a quarterback's arm up; receivers' speed up and burst down; safeties' zone coverage up and speed down. Positional value (what a position is worth against another, which drives pay and draft value) was left alone: the test says defensive backs are worth more than it assumes, and that is a decision for the free agency work.


## Re-audit after the timing and quarterback retunes (rating weights version 6)

Same method, 2,400 games a row (noise about 0.3 points). See DESIGN section 40 for the group figures.

No attribute works backwards. The largest single attributes, points a game for the 30-point gap:
- Quarterback: short accuracy 3.0, processing 2.8, arm strength 1.2, agility 1.0, decision-making 0.8, pocket presence 0.8, deep accuracy 0.7.
- Running back: burst 1.2, contact balance 0.8, speed 0.8, strength 0.7. Elusiveness, vision and agility each move yards per carry clearly (0.21, 0.14, 0.12) without showing in the score.
- Receivers: route running 1.7, hands 1.6, speed 1.2, burst 1.0, agility 0.9.
- Tight end: agility 0.9, run blocking 0.8, hands 0.6.
- Offensive line: pass blocking 2.3, run blocking 2.3, agility 1.4, blocking awareness 1.2, strength 0.9.
- Interior line: block shedding 2.0, strength 0.9. Pass rush moves sacks but only 0.2 in the score.
- Edge: pass rush 1.7, burst 1.4, strength 1.3, block shedding 0.9.
- Linebackers: speed 1.2, play recognition 0.8, tackling 0.7.
- Cornerbacks: zone coverage 1.2, ball skills 1.2, speed 1.0, man coverage 1.0, burst 1.0.
- Safeties: speed 1.4, ball skills 1.0.

Too small to measure even at 2,400 games: a quarterback's throw on the run, a back's pass blocking, a receiver's release and strength, most of a tight end's skills taken one at a time, an edge rusher's speed and agility, linebacker and safety coverage skills, press, and ball stripping everywhere.
