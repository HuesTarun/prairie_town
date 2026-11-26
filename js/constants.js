/**
 * PRAIRIE TOWN: Coterie & Burrow
 * Shared constants, simulation parameters, colony ranks, and Almanac science database.
 */
(function (root) {
  'use strict';

  const PT = (root.PT = root.PT || {});

  PT.VERSION = '2.1.0';
  PT.STORAGE_KEY = 'prairie_town_save_v2';
  PT.SETTINGS_KEY = 'prairie_town_settings_v2';
  PT.PLAYER_COUNTER_KEY = 'prairie_town_coterie_burrow_players_v2';
  PT.PLAYER_COUNTED_STORAGE = 'pt_global_player_counted_v2';
  PT.LOCAL_SESSIONS_STORAGE = 'pt_local_play_sessions_v2';

  // World & grid dimensions (1 cell = 0.5 meters)
  PT.CELL_SIZE = 44; // world pixels per 0.5m cell
  PT.METERS_PER_CELL = 0.5;
  PT.SURFACE_ROW = 0; // row 0 is just below surface y=0; y<0 is sky/surface
  PT.MAX_DEPTH_ROWS = 12; // 12 rows = 6.0 meters deep!
  PT.WORLD_COLS = 180; // 90 meters wide panoramic prairie valley!
  PT.STARTER_COL = 90; // center starter colony shaft
  PT.COYOTE_DIG_LIMIT_M = 1.5; // 1.5 meters = row 3 boundary
  PT.COYOTE_DIG_LIMIT_ROWS = 3; // rows 0,1,2 are <= 1.5m; row >= 3 is > 1.5m (safe!)
  PT.NURSERY_MIN_DEPTH_ROW = 3; // row 3 = 1.5m-2.0m (center at 1.75m, strictly below 1.5m limit)

  // Initial & expanded world widths (in cells)
  PT.INITIAL_COLS = 36; // 18 meters initial starter valley
  PT.MAX_COLS = 180; // up to 90 meters across 6 merged coteries

  // Cell excavation types
  PT.CELL = {
    SOLID: 0,
    TUNNEL: 1,
    SHAFT: 2,
    LISTENING: 3,
    NURSERY: 4,
    LATRINE: 5,
    GRANARY: 6
  };

  // Underground terrain modifiers inside SOLID soil (creates strategic world variety!)
  PT.CELL_MOD = {
    NONE: 'none',
    CLAY: 'clay',       // +12 bonus Packed Dirt when excavated
    ROOT: 'root',       // +14 bonus Food (sweet prairie tubers) when excavated
    ROCK: 'rock',       // Tough sandstone boulder (2.1x dig work, yields +8 Dirt)
    AQUIFER: 'aquifer', // Deep moist mineral spring (rows 9-11): +6 Dirt, +5% Hygiene & permanent Spring!
    SPRING: 'spring'    // Excavated Aquifer Mineral Spring: ongoing +Hygiene & faster storm drainage
  };

  // World Creation Valley Presets (selectable on New Colony / Welcome Modal)
  PT.WORLD_STYLES = {
    meadow: {
      id: 'meadow',
      name: 'Golden Meadow',
      badge: '🌾',
      desc: 'Lush topsoil with rich Root Caches, moderate Clay veins, and gentle predators.',
      clayCount: 16,
      rootCount: 18,
      rockCount: 12,
      aquiferCount: 5,
      grassMult: 0.9
    },
    canyon: {
      id: 'canyon',
      name: 'Redrock Clay Ridge',
      badge: '🪨',
      desc: 'Bountiful Clay deposits & tougher Sandstone boulders to carve around.',
      clayCount: 24,
      rootCount: 14,
      rockCount: 22,
      aquiferCount: 6,
      grassMult: 0.85
    },
    frontier: {
      id: 'frontier',
      name: 'Coyotebadger Wilds',
      badge: '🐺',
      desc: 'Dense tall grass requiring vigilant trimming, rich treasures, fierce challenges!',
      clayCount: 20,
      rootCount: 22,
      rockCount: 16,
      aquiferCount: 7,
      grassMult: 1.2
    }
  };

  // Surface mound types
  PT.MOUND = {
    NONE: 'none',
    RAW: 'raw',      // Basic unshaped hole - floods in storms, poor airflow
    CRATER: 'crater', // Tall packed volcano ring - flood-proof, Bernoulli exhaust
    DOME: 'dome'      // Low rounded mound - Bernoulli fresh air intake
  };

  // Prairie dog roles
  PT.ROLES = {
    IDLE: 'idle',
    SENTRY: 'sentry',
    DIGGER: 'digger',
    FORAGER: 'forager',
    GARDENER: 'gardener',
    PUP: 'pup'
  };

  PT.ROLE_META = {
    idle: { label: 'Resting', color: '#8f7254', icon: '🐾', desc: 'Rests in warm chambers and lends a paw nearby.' },
    sentry: { label: 'Sentry', color: '#d9822b', icon: '👁️', desc: 'Stands watch atop mounds, scans sightlines, triggers semantic alarms.' },
    digger: { label: 'Digger', color: '#a85a32', icon: '⛏️', desc: 'Carves tunnels & chambers, packs Crater & Dome mounds.' },
    forager: { label: 'Forager', color: '#5c8a3c', icon: '🌾', desc: 'Gathers prairie seeds & dry grass for the Granary.' },
    gardener: { label: 'Gardener', color: '#789e48', icon: '✂️', desc: 'Trims tall grass for sightlines, lines nurseries, cleans latrines.' },
    pup: { label: 'Pup', color: '#e6b87d', icon: '🍼', desc: 'Plays safely below 1.5m and grows into an adult worker.' }
  };

  // Build / Dig tools
  PT.TOOLS = {
    SELECT: 'select',
    TUNNEL: 'tunnel',
    TRIM: 'trim',
    CRATER: 'crater',
    DOME: 'dome',
    LISTENING: 'listening',
    NURSERY: 'nursery',
    LATRINE: 'latrine',
    GRANARY: 'granary',
    KIN_CHECK: 'kin_check'
  };

  PT.CHAMBER_SPECS = {
    tunnel: {
      name: 'Carve Tunnel',
      cellType: PT.CELL.TUNNEL,
      dirtGain: 4,
      workRequired: 2.4,
      costDirt: 0,
      costFood: 0,
      desc: 'Connect passages underground. Grants +4 Packed Dirt.'
    },
    listening: {
      name: 'Listening Chamber',
      cellType: PT.CELL.LISTENING,
      dirtGain: 3,
      workRequired: 3.5,
      costDirt: 2,
      costFood: 0,
      desc: 'Alcove near entrance (<=1.5m). Dogs listen before exiting to avoid ambushes.'
    },
    nursery: {
      name: 'Nursery',
      cellType: PT.CELL.NURSERY,
      dirtGain: 5,
      workRequired: 5.0,
      costDirt: 0,
      costFood: 6,
      desc: 'Deep grass-lined sanctuary (>1.5m coyote dig limit). Boosts pup births & growth.'
    },
    latrine: {
      name: 'Latrine',
      cellType: PT.CELL.LATRINE,
      dirtGain: 4,
      workRequired: 3.8,
      costDirt: 2,
      costFood: 0,
      desc: 'Dedicated toilet chamber keeping colony Hygiene % and morale high.'
    },
    granary: {
      name: 'Granary',
      cellType: PT.CELL.GRANARY,
      dirtGain: 5,
      workRequired: 4.5,
      costDirt: 3,
      costFood: 0,
      desc: 'Dry storage vault for seeds & grass (+45 max Food capacity per chamber).'
    },
    crater: {
      name: 'Crater Mound',
      workRequired: 4.0,
      costDirt: 10,
      costFood: 0,
      desc: 'Tall packed-dirt volcano rim. Blocks storm flooding & exhausts warm stale air via Bernoulli lift.'
    },
    dome: {
      name: 'Dome Mound',
      workRequired: 3.5,
      costDirt: 6,
      costFood: 0,
      desc: 'Low rounded exit mound. Pairs with a connected Crater Mound to pull fresh Bernoulli airflow inside.'
    }
  };

  // Weather definitions
  PT.WEATHER = {
    SUNNY: { id: 'SUNNY', label: 'Warm Breeze', icon: '☀️', windBase: 0.72, rain: 0, skyTint: 0 },
    GOLDEN: { id: 'GOLDEN', label: 'Golden Calm', icon: '🌤️', windBase: 0.45, rain: 0, skyTint: 0.15 },
    DROUGHT: { id: 'DROUGHT', label: 'Dry Heatwave', icon: '🥵', windBase: 0.30, rain: 0, skyTint: 0, heatTint: 0.45 },
    CLOUDY: { id: 'CLOUDY', label: 'Gathering Clouds', icon: '⛅', windBase: 0.95, rain: 0, skyTint: 0.45 },
    STORM: { id: 'STORM', label: 'Prairie Storm', icon: '⛈️', windBase: 1.35, rain: 1.0, skyTint: 0.85 }
  };

  // Predators and matching semantic calls
  PT.PREDATORS = {
    HAWK: {
      id: 'HAWK',
      name: 'Ferruginous Hawk',
      speedLabel: 'Fast Aerial Dive',
      clueText: 'Fast shadow swooping from the sky!',
      callId: 'hawk_chirp',
      callName: 'High-Pitch Dive Chirp',
      hotkey: '1',
      icon: '🦅'
    },
    COYOTE: {
      id: 'COYOTE',
      name: 'Prairie Coyote',
      speedLabel: 'Medium Low Stalk',
      clueText: 'Low-slung stalker creeping through grass!',
      callId: 'coyote_bark',
      callName: 'Rhythmic Ground Bark',
      hotkey: '2',
      icon: '🐺'
    },
    HUMAN: {
      id: 'HUMAN',
      name: 'Passing Human',
      speedLabel: 'Steady Tall Stride',
      clueText: 'Tall footsteps striding across the prairie!',
      callId: 'human_whistle',
      callName: 'Long Low Whistle',
      hotkey: '3',
      icon: '🥾'
    }
  };

  PT.ALARM_CALLS = [
    {
      id: 'hawk_chirp',
      predator: 'HAWK',
      label: 'High-Pitch Dive Chirp',
      short: 'Dive Chirp',
      sub: 'Fast Hawk',
      hotkey: '1',
      color: '#e59f38',
      waveShape: 'spike'
    },
    {
      id: 'coyote_bark',
      predator: 'COYOTE',
      label: 'Rhythmic Ground Bark',
      short: 'Ground Bark',
      sub: 'Stalking Coyote',
      hotkey: '2',
      color: '#d85b3a',
      waveShape: 'staccato'
    },
    {
      id: 'human_whistle',
      predator: 'HUMAN',
      label: 'Long Low Whistle',
      short: 'Low Whistle',
      sub: 'Passing Human',
      hotkey: '3',
      color: '#4e8ca8',
      waveShape: 'smooth'
    }
  ];

  // Pacing difficulty presets
  PT.PACING = {
    cozy: {
      id: 'cozy',
      label: 'Balanced Prairie',
      predatorInterval: [28, 44],
      alarmWindowSec: 6.8,
      foodDrainPerDog: 0.044,
      airDecayMult: 1.0,
      hygieneDecayMult: 1.05,
      stormFreqMult: 1.1,
      fatalRisk: false
    },
    wild: {
      id: 'wild',
      label: 'Hardcore Frontier',
      predatorInterval: [18, 30],
      alarmWindowSec: 5.0,
      foodDrainPerDog: 0.068,
      airDecayMult: 1.3,
      hygieneDecayMult: 1.3,
      stormFreqMult: 1.45,
      fatalRisk: true
    }
  };

  // Colony Ranks
  PT.RANKS = [
    {
      id: 0,
      title: 'Single Hole',
      subtitle: 'Pioneer Coterie',
      badge: '🕳️',
      goalsText: 'Build a Crater Mound, dig a 2nd Dome Mound for Bernoulli airflow, and place a Granary.'
    },
    {
      id: 1,
      title: 'Ventilated Family Burrow',
      subtitle: 'Aerodynamic Engineers',
      badge: '💨',
      goalsText: 'Carve a deep Nursery (>1.5m), Listening Chamber & Latrine, and welcome a Neighbor via Tooth-Touch!'
    },
    {
      id: 2,
      title: 'Multi-Coterie Neighborhood',
      subtitle: 'Thriving Prairie Network',
      badge: '🏘️',
      goalsText: 'Merge 3+ Neighbor Coteries, reach 14+ Prairie Dogs, and sustain 75%+ Airflow & Hygiene.'
    },
    {
      id: 3,
      title: 'Autonomous Prairie Mega-Town',
      subtitle: 'Self-Sustaining Final Milestone',
      badge: '👑',
      goalsText: 'Unite all 6 Coteries across 90m! Your Town defends & maintains itself automatically forever.'
    }
  ];

  // Skill Upgrades (purchased using Skill Points earned from Achievements!)
  PT.SKILLS = [
    {
      id: 'work_queue',
      name: 'Expanded Blueprints',
      icon: '🧱',
      costs: [1, 1, 2, 2, 3],
      tiers: [4, 7, 11, 16, 24, 40], // index 0 = base max simultaneous work blocks
      desc: 'Increase the number of blocks your Diggers can queue & excavate simultaneously.',
      formatTier: (v) => `${v} Work Blocks`
    },
    {
      id: 'excavate_brush',
      name: 'Wide Excavation Brush',
      icon: '⛏️',
      costs: [2, 3],
      tiers: [1, 2, 4], // 1x1 -> 2x1 -> 2x2 blocks per click!
      desc: 'Carve wider tunnels in one click (1x1 -> 2x1 corridor -> 2x2 chamber block!).',
      formatTier: (v) => v === 1 ? '1x1 Block' : (v === 2 ? '2x1 Corridor' : '2x2 Room')
    },
    {
      id: 'dig_speed',
      name: 'Swift Paws & Reach',
      icon: '⚡',
      costs: [1, 1, 2, 2],
      tiers: [1.0, 1.3, 1.65, 2.05, 2.5], // speed multiplier (+ reaches farther auto-paths!)
      desc: 'Boost digging & movement speed and extend Tunnel auto-connect reach.',
      formatTier: (v) => `${Math.round(v * 100)}% Speed`
    },
    {
      id: 'colony_harmony',
      name: 'Sentinel Instincts',
      icon: '🛡️',
      costs: [2, 2, 3],
      tiers: [0, 1, 2, 3], // widens sightlines (+2/lv), lowers decay (-10%/lv), Lv3 unlocks early Semi-Auto Defense!
      desc: 'Widen Sentry sightlines (+2/lv), cut Hygiene/Food drain, & train Autonomous Watch (Lv3).',
      formatTier: (v) => v === 0 ? 'Standard' : (v === 3 ? 'Master Steward' : `Tier ${v} (+${v * 2} Sight)`)
    }
  ];

  // Unlockable Achievements awarding Skill Points (SP)
  PT.ACHIEVEMENTS = [
    { id: 'trim_first', title: 'Clear Sightlines', icon: '✂️', sp: 1, desc: 'Trim 3+ tall grass patches near burrows.' },
    { id: 'clay_finder', title: 'Earth Sculptor', icon: '🏺', sp: 1, desc: 'Excavate a Clay Vein, Sweet Root, or Aquifer deposit.' },
    { id: 'crater_built', title: 'Levee Architect', icon: '🌋', sp: 1, desc: 'Construct a flood-proof Crater Mound.' },
    { id: 'bernoulli_air', title: 'Master of Wind', icon: '💨', sp: 2, desc: 'Activate Bernoulli Airflow (Crater + Dome Mound).' },
    { id: 'deep_nursery', title: 'Coyote-Proof Cradle', icon: '🛏️', sp: 1, desc: 'Carve a deep Nursery below the 1.5m Coyote Dig Limit.' },
    { id: 'vital_rooms', title: 'Town Planner', icon: '🏘️', sp: 2, desc: 'Operate a Listening Chamber, Latrine & Granary simultaneously.' },
    { id: 'owl_ally', title: 'Fledged Lookout', icon: '🦉', sp: 2, desc: 'Attract a Burrowing Owl ally with clean lawns & fresh air.' },
    { id: 'alarm_ace', title: 'Semantic Virtuoso', icon: '📣', sp: 2, desc: 'Answer 3 predator warning alerts accurately.' },
    { id: 'alarm_streak_5', title: 'Prairie Watchmaster', icon: '🔥', sp: 2, desc: 'Build a 5x accurate Predator Alarm Streak in one colony.' },
    { id: 'kin_merge_1', title: 'Tooth-Touch Diplomats', icon: '🦷', sp: 2, desc: 'Welcome your first neighboring Coterie.' },
    { id: 'kin_merge_3', title: 'Regional Network', icon: '🤝', sp: 3, desc: 'Unite 3 neighboring Coteries across the prairie.' },
    { id: 'valley_unifier', title: 'Grand Valley Unifier', icon: '🗺️', sp: 4, desc: 'Merge all 6 Neighbor Coteries across the 90m valley.' },
    { id: 'autonomous_town', title: 'Self-Sustaining Mega-Town', icon: '👑', sp: 5, desc: 'Complete all Final Goal milestones so the colony thrives on its own!' }
  ];

  // Prairie Dog charming names
  PT.DOG_NAMES = [
    'Pip', 'Bramble', 'Clover', 'Sprout', 'Sage', 'Acorn', 'Thistle', 'Rusty',
    'Juniper', 'Pebble', 'Dandelion', 'Sorrel', 'Biscuit', 'Dusty', 'Marigold',
    'Burr', 'Meadow', 'Nugget', 'Chirp', 'Tumble', 'Cinnamon', 'Yucca', 'Fescue',
    'Mesa', 'Willow', 'Wren', 'Prairie', 'Bucktooth', 'Copper', 'Honey', 'Saffron'
  ];

  // Guided First Day (concise actionable goals)
  PT.TUTORIAL_STEPS = [
    {
      id: 'trim_forage',
      title: '1. Cut Tall Grass for Early Warning!',
      text: 'Tall grass hides Coyotes for deadly ambushes & breeds ticks (-Hygiene)! Click tall grass near your mound with Trim (G) for clear sightlines & shoots.',
      hint: 'Click overgrown grass by your mound with Trim (G).'
    },
    {
      id: 'dig_bernoulli',
      title: '2. Sculpt Crater + Dome for Airflow',
      text: 'Dig sideways toward Clay/Root pockets for Dirt & Food, pack a Crater Mound (C) to stop floods, dig a 2nd exit, and top it with a Dome Mound (D)!',
      hint: 'Build 1 Crater Mound + 1 Dome Mound connected underground.'
    },
    {
      id: 'sentry_watch',
      title: '3. Deep Safety Below 1.5m & Chambers',
      text: 'Coyotes can collapse shallow rooms! Dig below the orange 1.5m Coyote Dig Limit line for safe Nurseries, plus a Granary (F) & Latrine (R).',
      hint: 'Carve a deep Nursery below 1.5m (row 3+)!'
    },
    {
      id: 'first_alarm',
      title: '4. Defend the Town (Timed After First Call!)',
      text: 'Your 1st Sentry Alert pauses so you can read calmly. After that, every alert has a live timer — keep grass short to earn extra reaction seconds!',
      hint: 'Answer your first Sentry Alert cleanly (Keys 1, 2, or 3).'
    }
  ];

  // Unlockable Prairie Almanac Entries
  PT.ALMANAC = [
    {
      id: 'bernoulli',
      title: 'Bernoulli Burrow Ventilation',
      category: 'Engineering',
      icon: '💨',
      unlockHint: 'Connect a tall Crater Mound and low Dome Mound underground.',
      science: 'Wind blows faster slightly higher above the ground than right at the soil surface. By building one tall volcano-shaped Crater Mound and one low rounded Dome Mound connected by a tunnel, prairie dogs create a pressure gradient via Bernoulli’s principle: lower pressure over the tall Crater draws stale air UP and OUT, pulling crisp oxygenated prairie air IN through the low Dome!',
      fact: 'Discovered in classic 1970s wind-tunnel studies by Steven Vogel & C. P. Ellington.'
    },
    {
      id: 'semantic_calls',
      title: 'Semantic Alarm Language',
      category: 'Communication',
      icon: '📣',
      unlockHint: 'Successfully sound an accurate Semantic Warning Call.',
      science: 'Black-tailed prairie dogs possess one of the most sophisticated natural languages in the animal kingdom. Professor Con Slobodchikoff demonstrated that their calls encode nouns and adjectives: distinguishing Hawks, Coyotes, Humans, and Domestic Dogs, plus their travel speed, size, and even the color of a human’s shirt!',
      fact: 'Even burrowing owls and grassland birds eavesdrop on prairie dog alarms.'
    },
    {
      id: 'sightlines',
      title: 'Sightline Gardening',
      category: 'Ecology',
      icon: '✂️',
      unlockHint: 'Trim tall prairie grass near your burrow entrances.',
      science: 'Prairie dogs act as ecosystem engineers ("keystone species"). They systematically clip tall coarse grasses around their town to maintain wide 360-degree sightlines against creeping predators like coyotes and badgers, while encouraging nutritious new shoots for grazing bison and pronghorn.',
      fact: 'Clipped prairie dog towns create bright green grazing lawns visible from miles away.'
    },
    {
      id: 'crater_flood',
      title: 'Flood-Proof Crater Mounds',
      category: 'Engineering',
      icon: '🌋',
      unlockHint: 'Construct a packed-earth Crater Mound.',
      science: 'High Plains cloudbursts can turn flat prairie grass into sudden sheet floods. Prairie dogs scrape subsoil and tamp it hard with their noses into steep Crater rims 30–60 cm high, acting as miniature levees that keep flash rainwater out of vertical shafts.',
      fact: 'A prairie dog uses its blunt forehead and nose like a miniature piledriver to pack mound clay.'
    },
    {
      id: 'listening_chamber',
      title: 'Listening Chambers',
      category: 'Architecture',
      icon: '👂',
      unlockHint: 'Excavate a Listening Chamber beside an entrance shaft.',
      science: 'Just inside the steep vertical drop of a burrow entrance, prairie dogs carve a small side shelf—the Listening Chamber. Before sticking their heads into open sky, they pause in this acoustic staging bay to listen for approaching footsteps, wingbeats, or snapping twigs.',
      fact: 'These alcoves also serve as quick turn-around pockets during frantic panic dives.'
    },
    {
      id: 'coyote_limit',
      title: 'The 1.5m Coyote Dig Limit',
      category: 'Defense',
      icon: '🛡️',
      unlockHint: 'Excavate a Nursery deeper than 1.5 meters.',
      science: 'While coyotes, badgers, and foxes can tear open shallow topsoil tunnels, prairie dogs routinely excavate primary living chambers and grass-lined Nurseries 2 to 4 meters deep—safely beneath the ~1.5-meter limit that surface predators can practically excavate.',
      fact: 'Deep burrows also stay remarkably cool in scorching summers and above freezing in winter.'
    },
    {
      id: 'tooth_touch',
      title: 'Tooth-Touch Kin Checks',
      category: 'Sociality',
      icon: '🦷',
      unlockHint: 'Perform a Tooth-Touch greeting with a neighboring burrow.',
      science: 'Prairie dogs live in tight family clans called coteries. When two prairie dogs meet near a territorial edge, they crouch, bare their front incisors, and touch teeth—an affectionate kiss-like kin check! Close coterie kin groom and play together, whereas strangers are chased back across borders.',
      fact: 'Documented in decades of field observation by biologist John L. Hoogland.'
    },
    {
      id: 'hygiene_granary',
      title: 'Granaries & Latrines',
      category: 'Town Planning',
      icon: '🌾',
      unlockHint: 'Build both a Granary and a Latrine chamber.',
      science: 'Cleanliness and winter readiness keep high-density colonies healthy. Prairie dogs designate unused alcoves as buried Latrines (sealing waste away from living quarters) and pack dried seeds and prairie grasses into dry underground chambers for storms and lean seasons.',
      fact: 'Separate waste chambers dramatically cut parasite spread through dense coteries.'
    },
    {
      id: 'texas_megatown',
      title: 'The 1900 Texas Mega-Town',
      category: 'History',
      icon: '👑',
      unlockHint: 'Ascend to Colony Rank IV: 1900 Texas Mega-Town.',
      science: 'In 1901, naturalist Vernon Bailey surveyed a continuous black-tailed prairie dog settlement stretching roughly 250 miles long by 100 miles wide across the Texas Panhandle—an estimated 400 MILLION prairie dogs living in interconnected neighborhood wards across 25,000 square miles!',
      fact: 'It remains one of the largest mammal cities ever documented in Earth history.'
    }
  ];

})(window);
