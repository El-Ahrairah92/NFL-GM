'use strict';
// =====================================================================
//  SCOUTING LANGUAGE — graded strength/weakness phrases and organic player profiles
//  Everything here describes what scouts THINK they see (fogged by confidence), never true numbers.
//  TRAITS[attr] = { p: [mild, solid, elite], n: [mild, bad, awful] } — each a list of variants.
// =====================================================================
const TRAITS = {
  spd: { p: [['Good long speed', 'Runs well for the position', 'Enough speed to threaten a defense'], ['Plus speed', 'Pulls away in the open field', 'Legit vertical speed'], ['Rare long speed', 'Track speed', 'One of the fastest players on the field', 'Blazing top gear']],
    n: [['A step slow', 'Average speed at best', 'Builds speed slowly', 'Not a burner'], ['Lacks top-end speed', 'Gets caught from behind', 'Plays at one speed', 'Speed is a real limitation'], ['Painfully slow', 'Runs like he is in sand', 'No long speed to speak of', 'Cannot threaten anyone vertically']] },
  bur: { p: [['Gets off the ball well', 'Decent short-area burst', 'Good initial quickness'], ['Explosive first step', 'Sudden out of his stance', 'Hits top speed in a hurry'], ['Shot out of a cannon', 'Rare get-off', 'Explodes off the snap', 'Elite short-area burst']],
    n: [['A tick late off the ball', 'Ordinary burst', 'Needs a runway', 'Not sudden'], ['Slow to accelerate', 'Gears down and takes time to get going', 'Lacks a second gear', 'Labors to get started'], ['Heavy-footed', 'No burst whatsoever', 'Stuck in the mud off the snap', 'Glacial get-off']] },
  agi: { p: [['Moves well laterally', 'Loose hips', 'Changes direction without much wasted motion'], ['Fluid change of direction', 'Quick feet', 'Sinks his hips and redirects'], ['Rare short-area quickness', 'Stops on a dime', 'Joystick lateral agility']],
    n: [['A little tight in the hips', 'Rounds off his cuts', 'Straight-line athlete'], ['Stiff hips', 'Struggles to redirect', 'Labored change of direction', 'Plays tall and tight'], ['Robotic mover', 'Cannot change direction', 'Turns like a cruise ship']] },
  str: { p: [['Functional strength', 'Holds his ground', 'Plays stronger than he looks'], ['Powerful at the point of attack', 'Heavy hands', 'Moves people'], ['Rare play strength', 'Bully', 'Overpowers grown men', 'Weight-room freak']],
    n: [['Could add strength', 'Average power', 'Needs a year in the weight room'], ['Gets pushed around', 'Lacks anchor strength', 'Loses the leverage battle', 'Overpowered too often'], ['Gets tossed aside', 'Badly underpowered', 'Folds on contact']] },
  siz: { p: [['Good size', 'Well put together'], ['Prototype size', 'Looks the part', 'Ideal frame'], ['Rare size', 'Enormous frame', 'Built in a lab']],
    n: [['A touch undersized', 'Lean frame'], ['Undersized', 'Lacks ideal length', 'Small for the position'], ['Tiny for the position', 'Size is a major question']] },
  sacc: { p: [['Accurate underneath', 'Throws a catchable ball'], ['Very accurate short and intermediate', 'Puts it on the numbers', 'Hits receivers in stride'], ['Pinpoint ball placement', 'Surgical underneath', 'Throws receivers open']],
    n: [['Inconsistent ball placement', 'Misses a few layups'], ['Scattershot short accuracy', 'Makes receivers work for it', 'Sprays the ball'], ['Cannot hit the easy ones', 'Wildly inaccurate']] },
  dacc: { p: [['Can hit the deep shot', 'Decent touch downfield'], ['Drops it in the bucket deep', 'Throws a beautiful deep ball'], ['Elite deep-ball accuracy', 'Hits a moving target 50 yards away']],
    n: [['Deep ball is hit or miss', 'Underthrows some shots'], ['Erratic deep ball', 'Leaves big plays on the field'], ['Cannot connect downfield', 'Deep ball is a prayer']] },
  arm: { p: [['Good arm', 'Can make most throws'], ['Big arm', 'Drives the ball outside the numbers', 'Makes every throw'], ['Cannon arm', 'Rare arm talent', 'Throws it through a wall']],
    n: [['Average arm', 'Ball loses steam downfield'], ['Limited arm', 'Struggles to drive the ball', 'Floats it to the sideline'], ['Noodle arm', 'Cannot stretch the field at all']] },
  proc: { p: [['Gets through his reads', 'Understands the offense'], ['Quick processor', 'Sees it fast', 'Gets to his second and third reads'], ['Elite processor', 'Wins before the snap', 'Sees the field like a coach']],
    n: [['A beat slow through progressions', 'Locks onto his first read at times'], ['Slow through progressions', 'One-read quarterback', 'Holds the ball too long'], ['Lost against complex looks', 'Cannot read a defense']] },
  dec: { p: [['Takes care of the ball', 'Mostly sound decisions'], ['Smart with the football', 'Takes what the defense gives him'], ['Elite decision-maker', 'Almost never puts the ball in danger']],
    n: [['Will force one now and then', 'Trusts his arm a little too much'], ['Forces throws', 'Throws into coverage', 'Turnover-prone decisions'], ['Reckless with the football', 'A turnover waiting to happen']] },
  pkt: { p: [['Comfortable in the pocket', 'Keeps his eyes downfield'], ['Calm in the pocket', 'Feels pressure and slides', 'Poised under duress'], ['Elite pocket presence', 'Ice water under pressure']],
    n: [['Gets antsy in the pocket', 'Drifts into pressure at times'], ['Panics under pressure', 'Sees ghosts', 'Bails from clean pockets'], ['Melts under pressure', 'Completely rattled by the rush']] },
  tor: { p: [['Can throw on the move', 'Functional outside the pocket'], ['Dangerous on the move', 'Accurate off-platform'], ['Elite off-script playmaker', 'Makes throws from any arm angle']],
    n: [['Better from a set base', 'Loses accuracy on the move'], ['Struggles outside the pocket', 'Mechanics fall apart on the run'], ['Statue who cannot throw on the move']] },
  vis: { p: [['Finds the crease', 'Follows his blocks'], ['Patient, sees the cutback', 'Presses the hole and makes the right cut', 'Natural feel for running lanes'], ['Elite vision', 'Sees holes before they open']],
    n: [['Leaves some yards on the field', 'Bounces runs too often'], ['Misses running lanes', 'Runs into his own blockers', 'Impatient behind the line'], ['Blind runner', 'No feel for blocking schemes']] },
  elu: { p: [['Can make the first man miss', 'Some wiggle'], ['Makes defenders miss', 'Slippery in space', 'Shifty in the open field'], ['Ankle-breaker', 'Elite elusiveness', 'A nightmare to tackle in space']],
    n: [['Not much wiggle', 'Straight-line runner'], ['Goes down easy in space', 'Will not make anyone miss', 'No creativity after the catch'], ['Zero elusiveness', 'First tackler always gets him']] },
  bal: { p: [['Falls forward', 'Runs through arm tackles'], ['Runs through contact', 'Tough to bring down', 'Great contact balance'], ['Elite contact balance', 'Bounces off tacklers', 'Carries defenders for extra yards']],
    n: [['Goes down on solid contact', 'Average balance'], ['Goes down on first contact', 'Gets knocked off his path', 'Loses his feet easily'], ['Folds at the first hit', 'No contact balance']] },
  bsec: { p: [['Secure with the ball', 'Takes care of the football'], ['Very reliable ball security', 'Rarely puts it on the ground'], ['Vice-grip ball security']],
    n: [['Carries it a little loose', 'Occasional ball-security lapse'], ['Fumble issues', 'Puts the ball on the ground'], ['Fumble machine', 'Cannot be trusted with the ball']] },
  rte: { p: [['Runs solid routes', 'Understands leverage'], ['Polished route runner', 'Crisp in and out of breaks', 'Sets up defenders'], ['Elite route technician', 'Creates separation at will', 'Master of the route tree']],
    n: [['Routes need refinement', 'Rounds his breaks'], ['Raw route runner', 'Limited route tree', 'Telegraphs his breaks'], ['Cannot separate', 'Does not know how to run routes']] },
  rel: { p: [['Gets off the line cleanly', 'Decent release package'], ['Wins off the line', 'Beats press with quickness and hands'], ['Elite release', 'Unjammable at the line']],
    n: [['Can get hung up at the line', 'Release needs work'], ['Struggles vs. press', 'Gets rerouted by physical corners'], ['Erased by press coverage', 'Cannot get off a jam']] },
  hnd: { p: [['Catches what he should', 'Dependable hands'], ['Reliable hands', 'Plucks the ball away from his body', 'Sure-handed'], ['Elite hands', 'Catches everything', 'Vacuum hands']],
    n: [['Will drop the occasional easy one', 'Body catcher'], ['Concentration drops', 'Fights the ball', 'Inconsistent hands'], ['Hands of stone', 'Drops are a serious problem']] },
  cth: { p: [['Competes at the catch point', 'Can win in traffic'], ['Wins 50-50 balls', 'Strong hands in traffic', 'Big catch radius'], ['Dominant at the catch point', 'Mosses defenders', 'Elite above the rim']],
    n: [['Average in traffic', 'Does not win many contested balls'], ['Loses contested catches', 'Gets outmuscled at the catch point'], ['Disappears in traffic', 'Needs to be wide open']] },
  pbk: { p: [['Holds up in pass protection', 'Solid pass sets'], ['Sturdy pass protector', 'Mirrors rushers well', 'Rarely beaten in protection'], ['Elite pass protector', 'Shuts down his side', 'Brick wall in pass pro']],
    n: [['Can be beaten by good rushers', 'Pass sets need work'], ['Leaky in pass protection', 'Gives up pressure', 'A target for pass rushers'], ['Liability in pass protection', 'Turnstile in pass pro']] },
  rbk: { p: [['Gets a hat on people', 'Willing run blocker'], ['Road grader', 'Moves defenders off the ball', 'Finishes blocks'], ['Dominant run blocker', 'Mauler', 'Buries defenders in the run game']],
    n: [['Gets stalemated in the run game', 'More positional than powerful'], ['Soft run blocker', 'Does not move anyone', 'Falls off blocks'], ['Liability as a run blocker', 'Gets driven backward']] },
  bawr: { p: [['Knows his assignments', 'Sound in protection calls'], ['Picks up stunts and blitzes', 'Smart, assignment-sure blocker'], ['Elite blocking instincts', 'Never fooled by a stunt or pressure']],
    n: [['Occasional mental error', 'Late to pass off stunts'], ['Misses assignments', 'Gets fooled by stunts and blitzes'], ['Assignment bust waiting to happen', 'Lost against any kind of pressure look']] },
  prsh: { p: [['Can win as a rusher', 'Has a go-to move'], ['Refined pass-rush plan', 'Wins with hands and counters', 'Consistent pressure'], ['Elite pass rusher', 'Unblockable one-on-one', 'Game-wrecker off the edge']],
    n: [['Limited rush moves', 'Effort rusher'], ['Limited rush repertoire', 'Stalls if his first move fails', 'Rarely affects the quarterback'], ['No pass-rush value', 'Offers nothing as a rusher']] },
  shed: { p: [['Can disengage', 'Uses his hands well'], ['Sheds blocks', 'Stacks and sheds at the point of attack'], ['Elite at defeating blocks', 'Cannot be blocked one-on-one in the run game']],
    n: [['Slow to disengage', 'Gets hung up on blocks'], ['Stays blocked', 'Engulfed by bigger blockers'], ['Erased by any blocker', 'Gets washed out of plays']] },
  tkl: { p: [['Solid tackler', 'Wraps up'], ['Sure tackler', 'Rarely misses in the open field', 'Finishes plays'], ['Elite tackler', 'Nothing gets through him']],
    n: [['Will miss the occasional tackle', 'Tackles a little high'], ['Misses tackles', 'Ducks his head', 'Poor angles to the ball'], ['Tackling is a liability', 'Whiffs constantly']] },
  strp: { p: [['Goes after the ball'], ['Punches the ball out', 'Knack for forcing fumbles'], ['Elite ball-stripper']], n: [[], [], []] },
  prec: { p: [['Reads his keys', 'Rarely out of position'], ['Diagnoses quickly', 'Sniffs out screens and draws', 'Plays a step ahead'], ['Elite instincts', 'Always around the ball', 'Reads the play before the snap']],
    n: [['A beat late to diagnose', 'Takes a false step now and then'], ['Bites on play-action', 'Slow to read and react', 'Fooled by misdirection'], ['Constantly out of position', 'No feel for the game']] },
  man: { p: [['Can match up in man', 'Stays in phase'], ['Sticky in man coverage', 'Mirrors routes', 'Travels with top receivers'], ['Shutdown man corner', 'Takes away his side of the field']],
    n: [['Gives up some separation in man', 'Better with help'], ['Exposed in man', 'Loses receivers at the break point'], ['Cannot cover man-to-man', 'Gets roasted in man']] },
  zone: { p: [['Sound in zone', 'Reads the quarterback'], ['Instinctive in zone', 'Jumps routes', 'Great eyes and spacing'], ['Elite zone defender', 'Erases his area of the field']],
    n: [['Spacing can drift in zone', 'Late to pass off routes'], ['Lost in zone', 'Loses track of receivers behind him'], ['A liability in zone', 'Blown coverages follow him around']] },
  prs: { p: [['Willing to challenge at the line', 'Gets hands on receivers'], ['Physical at the line', 'Disrupts timing with his jam'], ['Elite press corner', 'Suffocates releases']],
    n: [['Not much of a jam', 'Prefers to play off'], ['Soft at the line', 'Gives free releases'], ['Avoids contact at the line entirely']] },
  bsk: { p: [['Gets his hands on passes', 'Plays the ball well'], ['Ball hawk', 'Finishes interceptions', 'Finds the ball in the air'], ['Elite ball skills', 'Turns tipped balls into takeaways']],
    n: [['Drops interceptions', 'Late to locate the ball'], ['Rarely finds the ball', 'Panics with his back to the ball'], ['Hands of a defensive tackle', 'Never makes a play on the ball']] },
  kcon: { p: [['Steady'], ['Consistent kicker', 'Automatic inside his range'], ['Metronome accuracy']], n: [['Streaky'], ['Inconsistent'], ['Cannot be trusted']] },
  krng: { p: [['Good leg'], ['Big leg'], ['Howitzer leg']], n: [['Average range'], ['Limited range'], ['Popgun leg']] },
  kfal: { p: [['Accuracy holds up at distance'], ['Holds accuracy from distance'], ['Just as accurate from 50+']], n: [['Fades a bit from distance'], ['Fades from distance'], ['Falls off a cliff past 45']] },
  ktrj: { p: [['Clean trajectory'], ['Gets the ball up quickly'], ['Rarely gets one blocked']], n: [['Low trajectory'], ['Line-drive kicks'], ['Block risk']] },
  pdis: { p: [['Good leg'], ['Booming leg'], ['Flips the field']], n: [['Average distance'], ['Short punter'], ['Hurts field position']] },
  pplc: { p: [['Decent placement'], ['Pins it inside the 10'], ['Coffin-corner artist']], n: [['Spotty placement'], ['Erratic placement'], ['No directional control']] },
  phng: { p: [['Solid hang time'], ['Great hang time'], ['Elite hang time']], n: [['Average hang time'], ['Low hang time'], ['Outkicks his coverage']] },
  pspn: { p: [['Controls the bounce'], ['Kills it dead'], ['Master of the backspin']], n: [['Bounces are unpredictable'], ['Touchback-prone'], ['Touchback machine']] },
};
// noun for "X is the best part of his game"
const TRAIT_NOUN = { spd: 'long speed', bur: 'burst', agi: 'lateral quickness', str: 'play strength', siz: 'size', sacc: 'short accuracy', dacc: 'deep ball', arm: 'arm strength', proc: 'processing',
  dec: 'decision-making', pkt: 'pocket presence', tor: 'ability to throw on the move', vis: 'vision', elu: 'elusiveness', bal: 'contact balance', bsec: 'ball security', rte: 'route running',
  rel: 'release', hnd: 'hands', cth: 'contested-catch ability', pbk: 'pass protection', rbk: 'run blocking', bawr: 'assignment awareness', prsh: 'pass rush', shed: 'block shedding',
  tkl: 'tackling', strp: 'knack for forcing fumbles', prec: 'instincts', man: 'man coverage', zone: 'zone coverage', prs: 'press technique', bsk: 'ball skills',
  kcon: 'consistency', krng: 'range', kfal: 'long-range accuracy', ktrj: 'trajectory', pdis: 'distance', pplc: 'placement', phng: 'hang time', pspn: 'touch' };

// which traits a scout weighs at each position group (wider than the value weights: roles live in the secondary skills)
const PROFILE_ATTRS = {
  QB: ['sacc', 'dacc', 'arm', 'proc', 'dec', 'pkt', 'tor', 'spd', 'elu'],
  RB: ['vis', 'elu', 'bal', 'bsec', 'spd', 'bur', 'str', 'hnd', 'rte', 'pbk'],
  FB: ['rbk', 'pbk', 'bawr', 'str', 'hnd', 'bal', 'vis'],
  WR: ['rte', 'rel', 'hnd', 'cth', 'spd', 'bur', 'agi', 'elu', 'siz', 'rbk'],
  TE: ['rte', 'hnd', 'cth', 'spd', 'rbk', 'pbk', 'bawr', 'str', 'elu', 'siz'],
  OL: ['pbk', 'rbk', 'bawr', 'agi', 'str', 'siz'],
  IDL: ['prsh', 'shed', 'tkl', 'prec', 'bur', 'str', 'siz'],
  EDGE: ['prsh', 'shed', 'tkl', 'prec', 'bur', 'spd', 'agi', 'str'],
  LB: ['tkl', 'shed', 'prec', 'zone', 'man', 'prsh', 'spd', 'str'],
  CB: ['man', 'zone', 'prs', 'bsk', 'prec', 'tkl', 'spd', 'agi', 'siz'],
  S: ['zone', 'man', 'bsk', 'prec', 'tkl', 'shed', 'spd', 'str'],
  K: ['kcon', 'krng', 'kfal', 'ktrj'], P: ['pdis', 'pplc', 'phng', 'pspn'],
};
const PROFILE_GROUP = { QB: 'QB', RB: 'RB', FB: 'FB', WRX: 'WR', WRZ: 'WR', SLOT: 'WR', TEY: 'TE', TEH: 'TE', LT: 'OL', LG: 'OL', C: 'OL', RG: 'OL', RT: 'OL',
  NT: 'IDL', DT: 'IDL', DE: 'IDL', EDGE: 'EDGE', MLB: 'LB', WLB: 'LB', CB: 'CB', NCB: 'CB', FS: 'S', SS: 'S', K: 'K', P: 'P' };
// role nouns by the trait that defines him (several ways to say each)
const ROLES = {
  QB: { sacc: ['rhythm passer', 'ball-control distributor', 'timing thrower'], dacc: ['vertical passer', 'downfield thrower', 'shot-play quarterback'], arm: ['big-armed thrower', 'arm-talent quarterback', 'power thrower'],
    proc: ['cerebral pocket passer', 'point-guard quarterback', 'pre-snap technician'], dec: ['game manager', 'caretaker quarterback', 'low-risk distributor'], pkt: ['poised pocket passer', 'tough pocket quarterback'],
    tor: ['off-script creator', 'movement passer', 'bootleg quarterback'], spd: ['dual-threat quarterback', 'running quarterback', 'designed-run threat'], elu: ['scrambler', 'escape artist'] },
  RB: { vis: ['patient zone runner', 'one-cut runner', 'instinctive between-the-tackles runner'], elu: ['shifty space back', 'make-you-miss scatback', 'jitterbug runner'], bal: ['tackle-breaking grinder', 'yards-after-contact runner', 'downhill banger'],
    bsec: ['reliable ball-security back', 'trustworthy clock-killer'], spd: ['home-run threat', 'big-play speed back', 'breakaway runner'], bur: ['explosive change-of-pace back', 'quick-twitch slasher'],
    str: ['short-yardage plodder', 'goal-line hammer', 'power back', 'downhill thumper'], hnd: ['receiving back', 'third-down back', 'pass-catching back'], rte: ['route-running back', 'mismatch receiving back', 'satellite back'],
    pbk: ['third-down protector', 'trusted pass-pro back', 'blitz-pickup specialist'] },
  FB: { rbk: ['lead-blocking fullback', 'old-school hammer', 'iso-lead thumper'], pbk: ['protection-first fullback'], bawr: ['smart, assignment-sure fullback'], str: ['short-yardage battering ram'], hnd: ['pass-catching fullback', 'H-back type'], bal: ['fullback who can carry it'], vis: ['fullback with tailback instincts'] },
  WR: { rte: ['route technician', 'separator', 'chain-moving route runner'], rel: ['press-beating receiver', 'release artist'], hnd: ['sure-handed possession receiver', 'reliable chain mover'], cth: ['contested-catch specialist', 'jump-ball receiver', 'red-zone target'],
    spd: ['field stretcher', 'vertical threat', 'take-the-top-off burner'], bur: ['quick-twitch separator', 'sudden underneath receiver'], agi: ['shifty slot type', 'option-route specialist'], elu: ['run-after-catch weapon', 'catch-and-run playmaker', 'gadget player'],
    siz: ['big-bodied boundary receiver', 'size mismatch'], rbk: ['blocking receiver', 'run-game enforcer'] },
  TE: { rte: ['move tight end', 'route-running tight end', 'big slot type'], hnd: ['reliable safety-valve tight end', 'chain-moving tight end'], cth: ['red-zone tight end', 'seam-stretching target'], spd: ['seam-stretching tight end', 'vertical tight end'],
    rbk: ['in-line blocking tight end', 'sixth lineman type', 'run-game tight end'], pbk: ['protection tight end', 'max-protect specialist'], bawr: ['smart blocking tight end'], str: ['point-of-attack mauler'], elu: ['run-after-catch tight end'], siz: ['oversized in-line tight end'] },
  OL: { pbk: ['pass-protecting technician', 'blind-side protector type', 'finesse pass blocker'], rbk: ['run-game mauler', 'road grader', 'drive blocker'], bawr: ['cerebral lineman', 'assignment-sure anchor of the line', 'smart, steady veteran type'],
    agi: ['athletic zone blocker', 'pulling and reach-block lineman', 'light-footed mover'], str: ['power anchor', 'phone-booth brawler'], siz: ['massive space-eater', 'long, wide-bodied blocker'] },
  IDL: { prsh: ['interior pass rusher', 'penetrating three-technique', 'pocket-collapsing tackle'], shed: ['two-gapping run stuffer', 'block-eating anchor', 'stack-and-shed lineman'], tkl: ['sure-tackling run defender'], prec: ['instinctive, assignment-sound lineman'],
    bur: ['quick-twitch gap shooter', 'one-gap penetrator'], str: ['power-based nose', 'bull-rushing brawler'], siz: ['space-eating nose tackle', 'wide-bodied plugger'] },
  EDGE: { prsh: ['polished edge rusher', 'designated pass rusher', 'technician off the edge'], shed: ['edge-setting run defender', 'strong-side edge setter'], tkl: ['reliable edge tackler'], prec: ['smart, disciplined edge'],
    bur: ['speed rusher', 'bend-and-burst edge', 'first-step specialist'], spd: ['chase-down pursuit player', 'stand-up rush linebacker'], agi: ['bendy speed-to-power rusher'], str: ['power rusher', 'bull-rush edge'] },
  LB: { tkl: ['tackling machine', 'downhill thumper', 'box linebacker'], shed: ['take-on linebacker', 'block-destroying run stopper'], prec: ['instinctive green-dot linebacker', 'quarterback of the defense'], zone: ['coverage linebacker', 'zone-dropping linebacker'],
    man: ['matchup linebacker', 'tight-end eraser'], prsh: ['blitzing linebacker', 'pressure-package weapon'], spd: ['sideline-to-sideline run-and-chase linebacker', 'modern space linebacker'], str: ['old-school thumper'] },
  CB: { man: ['man-coverage corner', 'travel corner', 'sticky cover man'], zone: ['zone corner', 'off-coverage playmaker', 'instinctive zone defender'], prs: ['press corner', 'physical boundary corner'], bsk: ['ballhawking corner', 'takeaway artist'],
    prec: ['smart, instinctive corner'], tkl: ['run-support corner', 'physical tackling corner'], spd: ['recovery-speed corner', 'deep-speed cover man'], agi: ['quick-footed slot corner', 'mirror-and-match nickel'], siz: ['long, rangy boundary corner', 'big-bodied press corner'] },
  S: { zone: ['center-field safety', 'rangy deep-middle safety', 'single-high free safety'], man: ['matchup safety', 'big nickel type'], bsk: ['ballhawking safety', 'turnover machine'], prec: ['instinctive last line of defense', 'smart, communicative safety'],
    tkl: ['box safety', 'downhill enforcer', 'run-support safety'], shed: ['hybrid linebacker-safety'], spd: ['rangy sideline-to-sideline safety'], str: ['thumping strong safety'] },
  K: { kcon: ['consistent kicker'], krng: ['big-legged kicker'], kfal: ['long-range specialist'], ktrj: ['clean-striking kicker'] },
  P: { pdis: ['big-legged punter'], pplc: ['directional punter'], phng: ['hang-time punter'], pspn: ['pooch-punt specialist'] },
};
// "…with ___" add-ons for a second calling card
const MODS = { spd: ['with real speed', 'who can run'], bur: ['with a quick first step', 'with good burst'], agi: ['with quick feet', 'who changes direction well'], str: ['with real power', 'who plays strong'], siz: ['with good size'],
  sacc: ['who is accurate underneath'], dacc: ['who can hit the deep ball'], arm: ['with a live arm'], proc: ['who sees the field well'], dec: ['who protects the football'], pkt: ['who stays calm in the pocket'], tor: ['who can throw on the move'],
  vis: ['with good vision', 'who finds the crease'], elu: ['with some wiggle', 'who can make a man miss'], bal: ['who runs through contact', 'with good contact balance'], bsec: ['who holds onto the ball'], rte: ['who runs good routes', 'with route polish'],
  rel: ['who beats press'], hnd: ['with reliable hands', 'who catches the ball well'], cth: ['who wins in traffic'], pbk: ['who holds up in pass protection', 'you can trust in pass pro'], rbk: ['who helps in the run game', 'who blocks'],
  bawr: ['who knows his assignments'], prsh: ['with some pass-rush juice', 'who can get after the quarterback'], shed: ['who gets off blocks'], tkl: ['who tackles well', 'who finishes plays'], prec: ['with good instincts'],
  man: ['who can cover man-to-man'], zone: ['with good zone instincts'], prs: ['who can press'], bsk: ['with ball skills', 'who gets his hands on the ball'], kcon: ['who is steady'], krng: ['with a strong leg'], kfal: ['who holds up from distance'], ktrj: ['with a clean stroke'],
  pdis: ['with a big leg'], pplc: ['with good placement'], phng: ['with good hang time'], pspn: ['with touch'] };
// "…who ___" caveats: [mild, bad, awful]
const CAVEATS = { spd: [['without real long speed', 'who is not a burner'], ['who lacks top-end speed', 'who gets caught from behind'], ['with no speed to speak of']], bur: [['who is not sudden'], ['who is slow to accelerate', 'without a second gear'], ['who is heavy-footed']],
  agi: [['who is a little stiff'], ['with stiff hips', 'who struggles to change direction'], ['who cannot redirect']], str: [['who could be stronger'], ['who gets pushed around', 'who lacks play strength'], ['who is badly underpowered']], siz: [['who is a bit undersized'], ['who is undersized'], ['who is tiny for the position']],
  sacc: [['whose ball placement wanders'], ['who sprays the ball underneath'], ['who misses the easy ones']], dacc: [['whose deep ball comes and goes'], ['with an erratic deep ball'], ['who cannot connect downfield']], arm: [['with an average arm'], ['with a limited arm'], ['with a noodle arm']],
  proc: [['who is a beat slow through his reads'], ['who is slow through progressions'], ['who cannot read a defense']], dec: [['who will force a throw'], ['who forces too many throws', 'who is turnover-prone'], ['who is reckless with the ball']], pkt: [['who gets antsy in the pocket'], ['who panics under pressure'], ['who melts against the rush']],
  tor: [['who is better from a set base'], ['who struggles outside the pocket'], ['who cannot throw on the move']], vis: [['who leaves yards on the field'], ['who misses running lanes'], ['with no feel for the blocking']], elu: [['without much wiggle'], ['who will not make anyone miss'], ['who goes down to the first man every time']],
  bal: [['who goes down on solid contact'], ['who goes down on first contact'], ['who folds at the first hit']], bsec: [['who carries it loose at times'], ['with fumble issues'], ['who cannot be trusted with the ball']], rte: [['whose routes need polish'], ['who is a raw route runner'], ['who cannot separate']],
  rel: [['who can get hung up at the line'], ['who struggles against press'], ['who is erased by press coverage']], hnd: [['who drops the occasional easy one'], ['with inconsistent hands', 'who fights the ball'], ['with hands of stone']], cth: [['who is average in traffic'], ['who loses contested catches'], ['who needs to be wide open']],
  pbk: [['who can be beaten in pass protection'], ['who struggles in pass pro', 'who is leaky in protection'], ['who is a liability in pass protection']], rbk: [['who gets stalemated as a run blocker'], ['who does not move anyone in the run game'], ['who is a liability as a run blocker']],
  bawr: [['who has the occasional mental error'], ['who misses assignments'], ['who busts assignments constantly']], prsh: [['with limited rush moves'], ['who rarely affects the quarterback'], ['who offers nothing as a rusher']], shed: [['who is slow to disengage'], ['who stays blocked'], ['who gets erased by blockers']],
  tkl: [['who will miss a tackle'], ['who misses too many tackles'], ['whose tackling is a liability']], prec: [['who is a beat late to diagnose'], ['who bites on play-action', 'who is slow to read and react'], ['who is constantly out of position']], man: [['who needs help in man'], ['who is exposed in man coverage'], ['who cannot cover man-to-man']],
  zone: [['whose zone spacing drifts'], ['who gets lost in zone'], ['who is a liability in zone']], prs: [['who prefers to play off'], ['who is soft at the line'], ['who avoids contact at the line']], bsk: [['who drops interceptions'], ['who rarely finds the ball'], ['who never makes a play on the ball']],
  kcon: [['who is streaky'], ['who is inconsistent'], ['who cannot be trusted']], krng: [['with average range'], ['with limited range'], ['with a popgun leg']], kfal: [['who fades from distance'], ['who fades badly from distance'], ['who falls apart past 45']], ktrj: [['with a low trajectory'], ['who kicks line drives'], ['who is a block risk']],
  pdis: [['with average distance'], ['who is a short punter'], ['who hurts field position']], pplc: [['with spotty placement'], ['with erratic placement'], ['with no directional control']], phng: [['with average hang time'], ['with low hang time'], ['who outkicks his coverage']], pspn: [['with unpredictable bounces'], ['who is touchback-prone'], ['who is a touchback machine']] };
const LEVEL_WORD = { Elite: ['Blue-chip', 'Franchise-caliber', 'Elite'], 'All-Pro': ['High-end', 'Top-shelf', 'Pro Bowl-caliber'], Starter: ['Starting-caliber', 'Quality', 'Solid starting'], Rotation: ['Rotational', 'Useful rotational'], Backup: ['Capable backup', 'Backup-level'],
  Depth: ['Depth-level', 'Bottom-of-the-roster', 'Bargain-bin'], Project: ['Developmental', 'Raw developmental'], Fringe: ['Fringe', 'Camp-body'], Washed: ['Fading', 'Aging', 'End-of-the-line'] };

// stable pick: the same player always gets the same wording
function pickStable(list, p, salt) { if (!list || !list.length) return null; const h = Math.abs(Math.floor(hashGauss(p.id, salt, 11) * 1000)) % list.length; return list[h]; }
// what the scouts think each trait is (fogged), as a deviation from a starter at his spot, plus how it compares with the rest of HIS game
function scoutRead(p) {
  const grp = PROFILE_GROUP[p.spot], keys = PROFILE_ATTRS[grp] || [], t = TEMPLATE_A[p.spot] || {}, w = SPOTS[p.spot].w || {};
  const fog = p.per ? 1 - p.per.conf : 0.3, grow = p.age <= 25 && p.per ? p.per.g * 0.7 : 0;
  const rows = keys.map(k => {
    const base = t[k] !== undefined ? t[k] : 45; // skills a starter at this spot isn't asked for: judged against a modest bar
    const seen = (k === 'siz' ? p.a.siz : p.a[k]) + (k === 'siz' ? 0 : grow) + hashGauss(p.id, k.charCodeAt(0) * 31 + k.charCodeAt(1), 3) * 7 * fog;
    return { k, d: seen - base, core: w[k] !== undefined };
  });
  const mean = rows.reduce((s, r) => s + r.d, 0) / Math.max(1, rows.length);
  rows.forEach(r => r.rel = r.d - mean);
  return { grp, rows, mean };
}
// graded strengths & weaknesses + what he does best relative to his own game
function scoutTraits(p) {
  if (!p.a) return { str: [], weak: [], best: [] };
  const { rows } = scoutRead(p);
  const tierP = d => d >= 15 ? 2 : d >= 9 ? 1 : d >= 4 ? 0 : -1, tierN = d => d <= -17 ? 2 : d <= -11 ? 1 : d <= -5.5 ? 0 : -1;
  const phrase = (r, pos) => { const bank = TRAITS[r.k]; if (!bank) return null; const tier = pos ? tierP(r.d) : tierN(r.d); if (tier < 0) return null; return pickStable(bank[pos ? 'p' : 'n'][tier], p, r.k.charCodeAt(0) * 7 + r.k.charCodeAt(1)); };
  const str = rows.filter(r => r.d >= 4).sort((a, b) => b.d - a.d).map(r => phrase(r, true)).filter(Boolean).slice(0, 4);
  // weaknesses are graded half against a starter and half against the rest of his own game,
  // so a depth player's report shows what's REALLY wrong with him instead of "bad at everything"
  const { mean } = scoutRead(p);
  const adj = r => r.d - Math.min(0, mean) * 0.55;
  const weak = rows.filter(r => adj(r) <= -5.5).sort((a, b) => adj(a) - adj(b)).map(r => { const bank = TRAITS[r.k]; if (!bank) return null; const t = tierN(adj(r)); return t < 0 ? null : pickStable(bank.n[t], p, r.k.charCodeAt(0) * 7 + r.k.charCodeAt(1)); }).filter(Boolean).slice(0, 4);
  // relative strengths: even a bargain-bin player does something better than the rest of his game
  const best = rows.filter(r => r.rel >= 4 && TRAIT_NOUN[r.k]).sort((a, b) => b.rel - a.rel).slice(0, 2)
    .map((r, i) => { const n = TRAIT_NOUN[r.k], pl = /s$/.test(n) && !/ness$|speed$/.test(n); return i === 0 ? `His ${n} ${pl ? 'are' : 'is'} the best part of his game` : `${n[0].toUpperCase() + n.slice(1)} ${pl ? 'stand' : 'stands'} out relative to the rest of his skill set`; });
  return { str, weak, best };
}
function traitTags(p) {
  const { str, weak } = scoutTraits(p);
  return [...str.slice(0, 2), ...weak.slice(0, str.length ? 1 : 2)];
}
// one organic line: level + role (his calling card) + a second asset + his biggest hole
function scoutProfile(p, short) {
  if (!p.a) return '';
  const { grp, rows } = scoutRead(p);
  const roles = ROLES[grp] || {};
  // his calling card: core traits for the position get priority over side skills
  const lw = r => r.rel * (r.core ? 1 : 0.55);
  const ranked = rows.slice().sort((a, b) => lw(b) - lw(a));
  const lead = ranked.find(r => roles[r.k]);
  if (!lead) return '';
  const role = pickStable(roles[lead.k], p, 101);
  const second = ranked.find(r => r !== lead && r.rel >= 3 && MODS[r.k] && r.d > -9);
  const worst = rows.slice().sort((a, b) => a.rel - b.rel).find(r => r !== lead && r !== second && r.rel <= -4 && r.d <= -4 && CAVEATS[r.k]);
  const { mean } = scoutRead(p), wAdj = worst ? worst.d - Math.min(0, mean) * 0.55 : 0;
  const lvl = pickStable(LEVEL_WORD[tierOf(p)] || ['Depth-level'], p, 103);
  const mod = second ? pickStable(MODS[second.k], p, 107) : null;
  const cav = worst ? pickStable(CAVEATS[worst.k][wAdj <= -17 ? 2 : wAdj <= -11 ? 1 : 0], p, 109) : null;
  let s = short ? role[0].toUpperCase() + role.slice(1) : `${lvl} ${role}`;
  if (mod) s += ` ${mod}`;
  if (cav) {
    if (mod && /^who|^you/.test(mod)) s += ' but ' + cav.replace(/^who /, '').replace(/^with /, 'has ').replace(/^without /, 'lacks ');
    else if (mod && /^with/.test(cav)) s += ' but ' + cav.replace(/^with /, '').replace(/^without /, 'without '); // "with A but B"
    else s += ' ' + cav;
  }
  return s;
}
