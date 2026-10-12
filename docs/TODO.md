# To do

Things we have talked about and not built yet. Newest decisions win; cross items off by deleting them.

## Coaches (after the rebuild, section 52)

- **Coach progression deep dive.** How every rating changes over a career. Today the caller's two improve by calling games and the rest drift with age.
- **Special teams Situations.** Fakes, onside kicks and real punt blocks, and a rating for whether they work and whether his side is fooled by them.
- Fire a coach during the season, and who takes over.
- Morale and individual behaviour, for Accountability and Team Building to act on.
- Whether a defense learns the offense's concepts and formations during a game (today it learns run and pass by situation).
- A center making protection calls, as the green dot does for the defense.
- Other clubs choosing a green dot and an emergency quarterback with more thought than "the best one".
- **A better fourth-down model for Game Management.** The rating is worth about nothing in points: the decisions a good manager follows are not better than the ones a poor one makes. Clock management is in; the fourth-down, field goal and punt choices need a model that is right.
- Accountability is strong: 20 points of it either way is about two penalties a game and close to two points.
- A defensive caller picks his looks and slants from the run-or-pass guess the same way whoever he is: Play Calling should make his slant go to the play more often.

## Up next (agreed order)

1. **Free agency and re-signing on the valuation** (this is what makes the cap bind):
   - done (section 51): free agency is a market of binding offers over eight days, with agents and a three-step sit-down; clubs bid from their own view of the player
   - still to do there: re-sign the user's own players at the same table; consequences for a broken role promise (with morale); other clubs using front- and back-loaded deals; agents gaining and losing clients
   - clubs re-sign only when the player is worth his price to them (today 161 of 177 expiring players rated 75+ are kept)
   - steeper pay at the top for non-quarterbacks (85+ averages 5% of the cap; real stars take 8 to 12%)
   - a spending floor so cheap clubs bid (league spends 88% of the cap, lowest club 68%)
   - multi-year money needs cap logic that looks ahead
   - decide whether unsigned veterans' asking prices sag toward the minimum after the draft
   - young players who are still improving price themselves on where they are heading, or bet on themselves with a short deal (a starting quarterback at the end of his rookie contract should not ask backup money)
   - proven backups in their prime want a starting job or to test the market (a 26-year-old swing tackle who has graded 80+ filling in should expect a real chance somewhere)
2. **Draft and trades.** Dial in draft pick value exactly; go deep on trades. Trades in the offseason.

## Fronts and the trenches (agreed order)

Done: the line of scrimmage is geometry and a front is data (DESIGN section 41). Each side has a move at the line, defenses that repeat themselves are punished, inside and outside runs are balanced (section 42). The pocket: stepping up, interior push, flushes (section 43). Where the ball is thrown (section 44). Coaches carry their own looks, line games and walked-up linebackers (section 45). The defensive line is one continuous line; bigger libraries are slower to learn (section 46).

0. **Finish the role-based depth chart (section 47).** Weigh a defensive back's rating at a job by the coach's mix of man and zone. Let the quarterback see a linebacker or safety walked out over a receiver and throw at it, and a small nickel on an early down and run at it. Reword cross-training and scouting text away from NT, DT, DE, EDGE. Offensive jobs once offensive coaches have libraries. Ratings read between points for linebackers, safeties and receivers, as the line has.
0b. **Finish the offense (sections 49 and 50).** Done in section 50: routes by job, on and off the line, zone carry, tackle-breaking after the catch, real motion, the hash. Still to do: receivers and tight ends as one line of jobs (split end, flanker, slot, move tight end, in-line tight end) with ratings read between points; offensive jobs from the coach's formations and overrides per formation; the featured receiver moved around the formation (coach trait, stored, not yet acting); refit rating weights to the new attribute values. From section 50: a back motioning out of the backfield, safeties rotating to motion in zone, corners assigned by field and boundary, quarterback and receiver timing (with team chemistry).
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

- The rebuild of coach ratings: see "Coaches: the rebuild" at the top.
- Your position coaches suggest retraining candidates in the camp meeting.
- A coach Evaluation rating.
- Promotions down either the run or the pass path.
- Coach progression pass.
- Exotic packages.
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
- Kick return as its own attribute? (undecided)
- **Bug: special teams slots are teaching positions.** A receiver on special teams shows as raw at corner, H tight end, strong safety and running back. Comfort at a position must not come from kicking-game snaps.
- What moves a player's perceived upside over time: review the inputs.

## Football realism (known gaps)

- The best back still averages 6.2 a carry (real 5.2 to 5.9). The tackle leader is a little low (158, real 165 to 185) and the leading cornerback makes too many (112, real 80 to 100).
- Passes defended are short at the top (fifth-best 14, real 15 to 17).
- From the latest attribute test (all positions, then the weak ones at 3,000 games): safety zone and man coverage, tight end speed and receiver release now register. Still faint: edge speed and edge play recognition (a small lift to the score, nothing on sacks), linebacker zone coverage, tight end contested catch, quarterback agility, kicker consistency, punter placement.
- Positional value was fitted several retunes ago (rating weights are version 6). Latest measurement, in points: quarterback 11.5, corners 9.3, receivers 8.1, edge 6.3, line 6.1, back 6.0, linebackers 5.8, safeties 5.1, interior 5.0, tight end 4.6. Refit pay and rating weights to it.
- Passing: completions of 20+ yards are a little short (2.8 a game, real 3.0 to 3.6); the best offense scores too much (about 34 a game, real 28.5 to 31.5); the flanker's catch rate is low (56%); the top receiver's share of targets is 24% (real 26%).

- **Yards before and after contact are inverted** (3.1 before and 1.6 after; real about 1.4 and 2.9): backs are first hit too deep and go down too soon after.
- **Success rate is high** (50.5%, real 43 to 45%) and expected points per play average +0.03 instead of zero.

- Two tails are still a little outside the real range after the distribution work: the top deep threat averages 20.5 yards a catch (real 16.5 to 19) and 11.5 defenders a season get 5+ interceptions (real 5 to 10). The most-intercepted quarterback throws 21.7 (real 14 to 18).
- Rushing leader a bit low (about 1,475, real 1,550 to 1,950) and 300-carry backs rare (0.75 a season, real 1 to 4), even with back usage following the playbook.
- Kicking looks generous: about half the league's kickers hit from 60+ in a season, and 46% of punts end inside the 20 (real: about 38%). Only 28% of punts are returned (real: about 40%).

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

## Salary cap overhaul (from the seven-season cap audit)

What the audit found: clubs leave 10 to 17% of the cap unspent in week 1 (the real league is nearer 3 to 6%); dead money is a fraction of the real figure; four in ten contracts end up in their final year and 600 to 700 expire each offseason; players over 30 go from 19% to nearly 30% of rosters; a third of the league ends up on the minimum.

- Re-price the market: aim for week-1 room of about 5% of the cap. The yearly re-pricing toward 93% spending moves too slowly to catch up.
- Put the extra money into the second tier of stars. Quarterbacks are right; the best-paid edge, tackle, corner, receiver and back are well short of their real share of the cap (edge 8% against about 13%, tackle 7% against 10%, corner 6.5% against 10%).
- Lengthen deals: three to five years for starters in free agency and re-signing, so the final-year share settles near a quarter.
- Make commitments cost something: larger signing bonuses on other clubs' deals, so a cut leaves real dead money and a tight club has to restructure or sell.
- Fix the age drift: fewer one-year minimum deals for veterans over 30, and check retirement timing.
- Unused cap room carries over to the next year.
- A minimum-salary scale by experience.
- Other clubs restructure deals to create room.
- A club occasionally ends the draft a few million over the cap.
- Each of the first three changes the others: re-check over several seasons after each.

## Free agency and the draft (from the cycle review)

- Clubs should plan across the two: shop free agency with the draft class in mind, weigh need in the draft, and sign veterans after the draft to fill what is left.
- Clubs' boards are scattered far from consensus; the best talents go too evenly through the rounds; rounds five to seven are the same quality.
- Your scouting tools: a board of your own, scout assignments, a mock draft.
- Compensatory picks; restricted free agency; other clubs trading among themselves in the offseason.
- Other clubs give up future first-round picks readily to move up: watch in play.

## Preseason (after the skeleton, section 58)

- Joint practices: pick another club for a camp week, so your men's reps come against their players.
- Emphasis per player: give a man extra looks, or a kind of work (run game, pass protection), at someone else's expense.
- More life between games: practice injuries, a rookie flashing, a veteran coasting, coaches arguing for their man, a story of the week.
- Game reps in more detail than "the threes get the second half": who plays which quarter, by string and by man.
- Fold the cutdown into the Preseason page, and retire or rebuild the roster planner once this covers what it does.
- The chart for special teams units (who covers kicks) as well as kicker and punter.

