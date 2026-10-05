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

## Note on ratings

A player's tier and upside come from rating weights fitted to an older engine. They no longer match these values (for example safety speed is 25% of a safety's rating). Refitting them to this table is the next step.
