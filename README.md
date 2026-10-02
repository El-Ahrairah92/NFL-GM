# Gridiron GM

A hands-off pro football GM sim. Build a roster through the draft, free agency and trades, then sim the league a week at a time.

**Run it:** open `index.html` in a browser (no build, no install). Progress autosaves to browser storage (IndexedDB); use Settings → Export to back up.

## Game loop
One **Continue** button walks through the year:

Regular season (17 weeks, trade deadline after wk 9) → Playoffs (7 teams/conf) → Season recap & awards →
Coaching carousel → Re-sign players → Free agency (3 waves) → Draft (7 rounds) → Preseason cutdown → next season

- **⏩** buttons sim to the playoffs / through the playoffs / through the draft.
- **⏭ Sim to Next Season** auto-manages your team through everything until next year's week 1.
- **Settings → Auto-manage my team** makes the AI GM run your team permanently. You can still step in at any time.

## Files
| File | What it does |
|---|---|
| `js/data.js` | Tunable constants: cap, roster sizes, salary curves, injury table, teams, names |
| `js/attributes.js` | Attributes, position spots, measurables, position fits & labels, aging groups & development |
| `js/derived.js` | **Generated** by the Phase 4 calibration: attribute weights per spot, positional value, scheme multipliers, rating re-centering |
| `js/players.js` | Player generation, contracts & market value, trade value, retirement |
| `js/perception.js` | The fog: scouting estimates, hype, tiers/upside labels, trait tags, training camp reports |
| `js/contracts.js` | Cap growth & market, guarantees/dead money, rookie scale & 5th-year options, franchise tag, extensions, restructures, practice squad, IR, game-day actives |
| `js/coaches.js` | Five-coach staffs, knobs, scheme archetypes & tendencies, coaching trees, development by skill group, S&C wear, carousel |
| `js/engine/depth.js` | Engine tuning constants (`TUNE`), personnel groupings, defensive packages by front, depth charts, fatigue & rotation |
| `js/engine/calls.js` | Offensive & defensive play calling: tendencies, situation, film, play-calling quality, predictability |
| `js/engine/trench.js` | Assignment-based pass protection and run blocking |
| `js/engine/plays.js` | Runs, passes vs. man/zone coverage, QB reads & pressure, screens, gadgets, contact & tackling |
| `js/engine/metrics.js` | Film charting: EPA, success rate, separation, time to throw, CPOE, win rates, PFF-style play grades |
| `js/engine/game.js` | Game flow, rulebook clock management, special teams, scoring, stats, play-by-play |
| `js/league.js` | League setup, schedule generation, weekly sim, standings/tiebreakers, playoffs |
| `js/offseason.js` | Awards, progression, re-signing, free agency AI, draft, cuts, in-season AI moves |
| `js/trade.js` | Trade evaluation and AI-to-AI trades |
| `js/ui.js` | All pages, box scores, player cards |

## Scouting, not numbers
True ratings are hidden. You (and every AI GM) see players through scouting **tiers** (Elite · All-Pro · Starter · Rotation/Backup · Depth · Project/Fringe/Washed),
**upside** labels, a few scouting phrases and an evaluation confidence. Perception lags reality, sharpens with snaps, and is biased by hype:
volume stats, team success and contract years inflate it, and the market (contract asks, AI trades, the draft) prices perception.
Training camp reports each preseason are ~70% reliable. Film grades and the Advanced tab are honest signals for finding the gaps.
Settings → *Show true ratings (debug)* reveals everything.

## Contracts & roster rules
The cap grows ~6% a year and the market moves with it. Deals carry **guaranteed money** (dead cap when you cut someone; offseason cuts split
over two years). In the re-signing period you get **5th-year option** decisions on 1st-rounders, one **franchise tag**, and **extensions** for
players entering their final year (also available through the trade deadline). Teams that can't get under the cap restructure.
Each team keeps a 16-man **practice squad** (promote, release, or lose players to other teams), 48 of 53 dress on game day,
and **IR** has a 4-week minimum stay and 8 returns per season.

## Film Room & advanced stats
Every snap is charted (`engine/metrics.js`): expected points, success, separation at the catch point, time to throw,
completion probability, pass-rush / pass-block / run-block wins, missed tackles, coverage targets, and a play-by-play grade
for every player on the field.
- **Box score → Film Room:** team EPA, success rate, pressure, time to throw, aDOT, and per-player game grades.
  Click a player for his tracking numbers and every play he was involved in.
- **League Stats → Advanced:** season grades and next-gen numbers by position group, plus team EPA tables.
- **Player card:** season-to-date grades and tracking numbers, a Grade column in career stats, and Scheme Fit.

## Tuning realism
Engine calibration constants live in `TUNE` at the top of `js/engine/depth.js`. Current league averages (800 games across 8 leagues):
~23 pts/team, ~64% completions, ~7.0 Y/A, ~6.3% sacks, ~2.3% INT, ~4.3 YPC, ~40% 3rd downs (by distance: ~65% / 47% / 24%),
~35% pressure rate, NFL-like personnel/coverage/blitz usage and snap shares. Ratings hold steady over 12+ simulated seasons.

Attribute weights (`js/derived.js`) come from a regression of game margin on random per-game attribute nudges over
~36,000 engine games, i.e. what each attribute is actually worth in this engine, blended with design priors.
