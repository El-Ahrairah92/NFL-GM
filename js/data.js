'use strict';
// ---------- league constants ----------
let CAP = 280;               // salary cap, $M (grows each league year: state.cap)
let MIN_SALARY = 0.9;        // scales with the cap
const ROSTER_MAX = 53;       // regular season (IR doesn't count)
const OFFSEASON_MAX = 90;      // camp roster limit (one cutdown to 53 after the last preseason game)
const WAIVER_EXP = 4;         // players with fewer accrued seasons than this go through waivers when released
const SEASON_WEEKS = 17;
const TRADE_DEADLINE = 9;    // last week trades are allowed
const IR_WEEKS = 4;          // injuries this long go to IR and free a roster spot
const FA_WAVES = 3;
const DRAFT_ROUNDS = 7;
const START_SEASON = 2026;

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'];
const OFF_POS = ['QB', 'RB', 'WR', 'TE', 'OL'];
const DEF_POS = ['DL', 'LB', 'CB', 'S'];
// legacy groups (current engine): TE includes FB, DL includes NT/DT/DE/EDGE
const ROSTER_TEMPLATE = { QB: 3, RB: 3, WR: 6, TE: 4, OL: 9, DL: 10, LB: 5, CB: 6, S: 4, K: 1, P: 1 }; // 52
const ROSTER_MIN = { QB: 2, RB: 2, WR: 5, TE: 2, OL: 7, DL: 8, LB: 4, CB: 5, S: 3, K: 1, P: 1 };
// healthy bodies a team wants available at each legacy group (in-season signings)
const LINEUP_NEED = { QB: 1, RB: 2, WR: 4, TE: 2, OL: 5, DL: 4, LB: 2, CB: 3, S: 2, K: 1, P: 1 };
const STARTERS = { QB: 1, RB: 1, WR: 3, TE: 1, OL: 5, DL: 4, LB: 2, CB: 3, S: 2, K: 1, P: 1 };
const POS_SAL_EXP = { QB: 1.3, RB: 1.6, WR: 1.8, TE: 1.7, OL: 1.8, DL: 1.8, LB: 1.9, CB: 1.8, S: 1.9, K: 2.0, P: 2.0 };
// legacy-group importance (AI needs/trades); per-spot salary & value live in attributes.js SPOTS
const POS_VALUE = { QB: 1.6, RB: 0.7, WR: 1.0, TE: 0.75, OL: 0.9, DL: 1.05, LB: 0.75, CB: 0.95, S: 0.75, K: 0.3, P: 0.25 };

// [name, min weeks, max weeks, weight]
const INJURIES = [
  ['Ankle sprain', 1, 3, 14], ['Hamstring strain', 1, 4, 13], ['Concussion', 1, 3, 9], ['Knee sprain', 1, 4, 8],
  ['MCL sprain', 3, 7, 5], ['High ankle sprain', 3, 7, 5], ['Shoulder sprain', 1, 4, 6], ['Groin strain', 1, 3, 6],
  ['Back spasms', 1, 2, 5], ['Rib injury', 1, 3, 5], ['Quad strain', 1, 3, 5], ['Calf strain', 1, 4, 5],
  ['Hip pointer', 1, 2, 4], ['Broken hand', 3, 6, 3], ['Turf toe', 2, 6, 3], ['Foot fracture', 6, 12, 2],
  ['Broken arm', 6, 10, 1.5], ['Torn pectoral', 12, 30, 1], ['Torn ACL', 30, 45, 2], ['Torn Achilles', 35, 50, 1],
];

const TEAMS = [
  // AFC
  ['Buffalo', 'Blizzard', 'BUF', 'AFC', 'East', '#2a5cd6'], ['Miami', 'Sharks', 'MIA', 'AFC', 'East', '#14a3a0'],
  ['New England', 'Minutemen', 'NE', 'AFC', 'East', '#27408b'], ['New York', 'Knights', 'NYK', 'AFC', 'East', '#1d6b43'],
  ['Baltimore', 'Hawks', 'BAL', 'AFC', 'North', '#4b2b8a'], ['Cincinnati', 'Kings', 'CIN', 'AFC', 'North', '#e0621b'],
  ['Cleveland', 'Rockers', 'CLE', 'AFC', 'North', '#8a3a12'], ['Pittsburgh', 'Ironmen', 'PIT', 'AFC', 'North', '#c9a00c'],
  ['Houston', 'Wildcatters', 'HOU', 'AFC', 'South', '#a3162f'], ['Indianapolis', 'Racers', 'IND', 'AFC', 'South', '#1e4fa8'],
  ['Jacksonville', 'Gators', 'JAX', 'AFC', 'South', '#0f7f7a'], ['Nashville', 'Stallions', 'NAS', 'AFC', 'South', '#4a90d9'],
  ['Denver', 'Mustangs', 'DEN', 'AFC', 'West', '#e8591e'], ['Kansas City', 'Monarchs', 'KC', 'AFC', 'West', '#d61f26'],
  ['Las Vegas', 'Aces', 'LV', 'AFC', 'West', '#8c8c8c'], ['Los Angeles', 'Stars', 'LAS', 'AFC', 'West', '#1aa3d9'],
  // NFC
  ['Dallas', 'Wranglers', 'DAL', 'NFC', 'East', '#2b4a86'], ['New York', 'Empire', 'NYE', 'NFC', 'East', '#1f3fa0'],
  ['Philadelphia', 'Liberty', 'PHI', 'NFC', 'East', '#10705a'], ['Washington', 'Sentinels', 'WAS', 'NFC', 'East', '#7d1c2c'],
  ['Chicago', 'Bruisers', 'CHI', 'NFC', 'North', '#e2622a'], ['Detroit', 'Motors', 'DET', 'NFC', 'North', '#2388c9'],
  ['Green Bay', 'Lumberjacks', 'GB', 'NFC', 'North', '#2f6b3a'], ['Minnesota', 'Norsemen', 'MIN', 'NFC', 'North', '#5b2a8f'],
  ['Atlanta', 'Firebirds', 'ATL', 'NFC', 'South', '#c3162d'], ['Carolina', 'Cougars', 'CAR', 'NFC', 'South', '#1b9ad6'],
  ['New Orleans', 'Krewe', 'NO', 'NFC', 'South', '#b39b56'], ['Tampa Bay', 'Cannons', 'TB', 'NFC', 'South', '#c4262e'],
  ['Arizona', 'Scorpions', 'ARI', 'NFC', 'West', '#a8193b'], ['Los Angeles', 'Grizzlies', 'LAG', 'NFC', 'West', '#2a55b0'],
  ['San Francisco', 'Gold', 'SF', 'NFC', 'West', '#b3261e'], ['Seattle', 'Storm', 'SEA', 'NFC', 'West', '#3aa655'],
];

const FIRST_NAMES = ('Aaron Adrian Aiden Alex Andre Andrew Anthony Antonio Austin Bailey Ben Blake Brandon Brian Brock Bryce Caleb Calvin Cameron Carson Chase Chris Cody Colby Cole Connor Cooper Corey Curtis Dalton Damien Damon Daniel Darius Darnell Darren David Davion Dawson Deandre Demarcus Derek Derrick Desmond Devin Devon Dillon Dominic Donovan Drake Drew Dylan Eli Elijah Emmanuel Eric Ethan Evan Garrett Gavin Grant Hunter Isaac Isaiah Jabari Jack Jackson Jake Jalen Jamal James Jared Jarvis Jason Javon Jaylen Jeff Jermaine Jerome Jordan Joseph Josh Julian Justin Kaleb Kareem Keenan Keith Kendall Kenny Kevin Khalil Kyle Lamar Landon Lance Lawrence Logan Lucas Luke Malik Marcus Mario Mark Marquise Mason Matt Max Micah Michael Miles Nate Nick Noah Omar Owen Parker Patrick Quentin Quincy Rashad Reggie Ricky Riley Robert Ryan Sam Sean Seth Shane Shawn Spencer Stefon Terrell Terry Travis Trent Trevon Tristan Tyler Tyree Tyrone Victor Wade Will Xavier Zach Zion').split(' ');
const LAST_NAMES = ('Adams Alexander Allen Anderson Armstrong Bailey Baker Banks Barnes Bell Bennett Blackwell Booker Bowman Boyd Bradley Brooks Brown Bryant Burke Burns Butler Caldwell Campbell Carter Chambers Clark Coleman Collins Cook Cooper Crawford Cunningham Daniels Davis Dawson Dixon Douglas Dunn Edwards Ellis Evans Fields Fisher Fleming Flowers Ford Foster Franklin Freeman Fuller Gaines Garcia Gibson Gilbert Graham Grant Graves Gray Green Griffin Hall Hamilton Harper Harris Hart Hawkins Hayes Henderson Hill Holmes Hopkins Howard Hudson Hughes Hunt Jackson James Jefferson Jenkins Johnson Jones Jordan Keller Kelly Kennedy King Knight Lane Lawson Lee Lewis Lockett Long Lyons Mack Marshall Martin Mason Matthews McCoy McDonald Miller Mitchell Moore Morgan Morris Murphy Murray Nelson Newton Norris Owens Parker Patterson Payne Perry Peters Phillips Pierce Porter Powell Price Ramsey Reed Reynolds Rice Richardson Riley Roberts Robinson Rogers Ross Russell Sanders Scott Shaw Simmons Simpson Smith Spencer Stephens Stewart Stokes Sullivan Taylor Thomas Thompson Tucker Turner Walker Wallace Ward Warren Washington Watkins Watson Webb Wells West White Wilkins Williams Wilson Woods Wright Young').split(' ');
const COLLEGES = ('Alabama,Georgia,Ohio State,Michigan,LSU,Clemson,Texas,Oklahoma,USC,Oregon,Notre Dame,Penn State,Florida,Florida State,Miami,Auburn,Tennessee,Texas A&M,Wisconsin,Iowa,Washington,Utah,Stanford,UCLA,TCU,Baylor,Ole Miss,Mississippi State,Arkansas,Kentucky,South Carolina,Missouri,Nebraska,Minnesota,Pittsburgh,Boise State,North Carolina,NC State,Virginia Tech,Louisville,Purdue,Michigan State,Iowa State,Kansas State,Oklahoma State,West Virginia,Cincinnati,Houston,Tulane,Memphis,Colorado,Arizona State,Syracuse,Duke,Appalachian State,North Dakota State,Toledo,Western Michigan,Fresno State,San Diego State').split(',');
