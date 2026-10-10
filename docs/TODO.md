# To do

Things we have talked about and not built yet. Newest decisions win; cross items off by deleting them.

## Up next (agreed order)

1. **Free agency and re-signing on the valuation** (this is what makes the cap bind):
   - clubs re-sign only when the player is worth his price to them (today 161 of 177 expiring players rated 75+ are kept)
   - steeper pay at the top for non-quarterbacks (85+ averages 5% of the cap; real stars take 8 to 12%)
   - a spending floor so cheap clubs bid (league spends 88% of the cap, lowest club 68%)
   - multi-year money needs cap logic that looks ahead
   - decide whether unsigned veterans' asking prices sag toward the minimum after the draft
   - young players who are still improving price themselves on where they are heading, or bet on themselves with a short deal (a starting quarterback at the end of his rookie contract should not ask backup money)
   - proven backups in their prime want a starting job or to test the market (a 26-year-old swing tackle who has graded 80+ filling in should expect a real chance somewhere)
2. **Draft and trades.** Dial in draft pick value exactly; go deep on trades. Trades in the offseason.

## Fronts and the trenches (agreed order)

Done: the line of scrimmage is geometry and a front is data (DESIGN section 41). Each side has a move at the line, defenses that repeat themselves are punished, inside and outside runs are balanced (section 42). The pocket: stepping up, interior push, flushes (section 43). Where the ball is thrown (section 44). Coaches carry their own looks, line games and walked-up linebackers (section 45).

1. **Season film.** Record each game's defensive tendencies (looks, slants, pressure) so opponents prepare for a coach's habits before kickoff.
2. **Pressure packages and the offense's answers.** Disguised and overload pressures; protection calls as a choice the offense makes. Offensive coaches get the same depth.
3. **Playbook page, scouting text, roster valuation by technique.**

Left open by the pre-snap work: the run flip is nearly worthless against ordinary fronts; too many players reach 100 tackles (back-seven starters never leave the field); runs of 10+ a little common (14%); throws behind the line are half the real share (7.7%).

After the trench work: re-measure attribute values and refit rating weights.

## Computer front offices (behind the curtain)

- Three-season projection in the valuation (stubbed).
- Team direction: contend or rebuild.
- Retraining projects for computer clubs (a few a year, fog decides the failure rate).
- Familiarity in reads (a club knows a man better the longer it has him).
- Position ceilings are a blunt safety net: replace with something the sums decide.
- Camp role targeting for specialist jobs: re-check once specialists exist.
- Twenty-season audit with an "exploiter" club that plays the market as hard as a person would.
- Odd roster extremes at week one (4 quarterbacks, 13 defensive linemen): confirm it is injury cover.
- Injured reserve runs light: about 2 a club at season's end.
- Trades only to fill a job on the depth chart: no arbitrary moves.
- Practice squad poaching during the season: review how it works for and against you.

## Coaches

- Fronts and techniques: see "Fronts and the trenches" above. The engine now decides blocks from alignment; coaches generating their own fronts is step 2 there.

- Your position coaches suggest retraining candidates in the camp meeting.
- A coach Evaluation rating.
- Promotions down either the run or the pass path.
- Coach progression pass.
- Exotic packages.
- Sort coaches by under contract.
- A living "coach input system" (later; the camp meeting is the first piece).
- Fire a coach during the season, not only in the carousel.

## Players and schemes

- **Positional value is out of date** (see the known gaps below for the latest measurement). Decide in the free agency step.
- Attributes still too small to measure: see the last section of ATTRIBUTES.md.
- Kicking: 86% from 40 to 49 yards (real about 83%) and about 35 tries a season from 60+ at 56 to 63%.

- Inline and move tight end decided by the play call.
- Loosen skill ties at other positions the way running backs were (pass-rush-only linemen, slot-only receivers, coverage linebackers), if wanted.
- A low-rated power back cannot exist: balance and strength are over half of a back's rating. Would need short yardage to reward mass and strength differently from open-field running.
- Size outliers.
- Scheme fit pass.
- Practice habits balance pass.
- ST+ and ST++ tags.
- Kick return as its own attribute? (undecided)
- **Bug: special teams slots are teaching positions.** A receiver on special teams shows as raw at corner, H tight end, strong safety and running back. Comfort at a position must not come from kicking-game snaps.
- What moves a player's perceived upside over time: review the inputs.
- More names, balanced for how common each one is.

## Football realism (known gaps)

- The best back still averages 6.2 a carry (real 5.2 to 5.9). The tackle leader is a little low (158, real 165 to 185) and the leading cornerback makes too many (112, real 80 to 100).
- Passes defended are short at the top (fifth-best 14, real 15 to 17).
- An interior lineman's pass rush moves sacks but barely the score (0.2 points); linebacker and safety coverage skills are too small to measure. Look at both in the trench and front work.
- Positional value was fitted three retunes ago (rating weights are current, version 6). Latest measurement: quarterback 11.1, receivers 7.4, line 6.2, corners 6.0, edge 5.9, back 5.8, linebackers 5.3, interior 5.0, safeties 4.9, tight end 3.6. Refit in the free agency work.

- **Yards before and after contact are inverted** (3.1 before and 1.6 after; real about 1.4 and 2.9): backs are first hit too deep and go down too soon after.
- **Success rate is high** (50.5%, real 43 to 45%) and expected points per play average +0.03 instead of zero.

- Two tails are still a little outside the real range after the distribution work: the top deep threat averages 20.5 yards a catch (real 16.5 to 19) and 11.5 defenders a season get 5+ interceptions (real 5 to 10). The most-intercepted quarterback throws 21.7 (real 14 to 18).
- Rushing leader a bit low (about 1,475, real 1,550 to 1,950) and 300-carry backs rare (0.75 a season, real 1 to 4), even with back usage following the playbook.
- A safety is credited to nobody, and two-point conversions are not on anyone's stat line.
- Kick return yards are really the yard line the return reached, not yards gained from the catch.
- Kicking looks generous: about half the league's kickers hit from 60+ in a season, and 46% of punts end inside the 20 (real: about 38%). Only 28% of punts are returned (real: about 40%).
- A club with two quarterbacks that loses both in a game still plays a tight end there (about ten plays a season): decide whether every club should name an emergency passer.

- Quarterback completion percentage: spread between best and worst.
- Catch percentage for high-volume receivers.
- Sack leaders' tail (a 29.5-sack season happened). You said not to touch pass rush for now.
- **Third-down back sometimes gets no snaps?** Check every specialist role against snap counts.
- **Grades should sit on the same scale at every position**, so one position does not average 54 while another averages 72.
- **Advanced stats deep dive, possibly a full overhaul.** Start with whether receiver separation is just a readout of quarterback play.

## Screens

- Playbook page redesign.
- In-season practice rooms by working position, not listed position.
- Consolidating depth chart, practice and planner further.
- Overhaul the specialist page and roles.

## Football realism, from the advanced stats audit

- Missed tackle rate runs a little high (about 14% of attempts; the real league is 10 to 12%).
- Only 42% of sacks and 48% of pressured dropbacks are charged to a blocker; the rest are unblocked rushers, missed assignments and coverage sacks. Decide whether more should be charged.
- Pass-block win rate (95%) and pass-rush win rate (7%) sit outside the published real ranges (about 88 to 90% and 10 to 15%). The definition (beaten inside three seconds) may want tuning. Touches pass rush, which is on hold.
- About 7% of attempts have no target (throwaways and passes batted at the line together). Check the split against the real league (throwaways about 3%).
