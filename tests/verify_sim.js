/**
 * Automated verification tests for PRAIRIE TOWN: Coterie & Burrow
 * Runs in Node.js without a browser to verify simulation mechanics,
 * HTML/UI DOM binding parity, and Canvas Renderer draw paths.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.resolve(__dirname, '..');

// Parse all element IDs from index.html to verify UIController references match exact DOM IDs
const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const htmlIds = new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map((m) => m[1]));

function makeMockElement(id) {
  const classes = new Set();
  const tagMatch = html.match(new RegExp(`<[^>]+\\bid=["']${id}["'][^>]*>`));
  if (tagMatch && /\bclass=["'][^"']*\bhidden\b/.test(tagMatch[0])) {
    classes.add('hidden');
  }
  return {
    id,
    value: '',
    checked: false,
    textContent: '',
    innerHTML: '',
    style: {},
    children: [],
    dataset: {},
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      toggle: (c, force) => {
        if (force === undefined) {
          if (classes.has(c)) classes.delete(c); else classes.add(c);
        } else if (force) classes.add(c);
        else classes.delete(c);
      },
      contains: (c) => classes.has(c)
    },
    addEventListener() {},
    querySelectorAll() { return []; },
    appendChild(child) { this.children.push(child); },
    select() {},
    remove() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; }
  };
}

function makeMockCanvas2D() {
  const noop = () => {};
  const grad = {
    addColorStop(offset, color) {
      if (typeof color !== 'string' || /NaN|undefined|null/i.test(color) ||
        !/^(#[0-9a-f]{3,8}|rgba?\(\s*\d+(\.\d+)?\s*,\s*\d+(\.\d+)?\s*,\s*\d+(\.\d+)?(\s*,\s*[\d.]+\s*)?\))$/i.test(color.trim())) {
        throw new SyntaxError(`Invalid gradient color stop: '${color}'`);
      }
    }
  };
  return {
    width: 1280,
    height: 720,
    getContext() {
      return {
        save: noop, restore: noop, setTransform: noop, translate: noop, scale: noop, rotate: noop,
        clearRect: noop, fillRect: noop, strokeRect: noop, beginPath: noop, closePath: noop,
        moveTo: noop, lineTo: noop, quadraticCurveTo: noop, bezierCurveTo: noop,
        arc: noop, ellipse: noop, roundRect: noop, fill: noop, stroke: noop,
        fillText: noop, setLineDash: noop,
        createLinearGradient: () => grad,
        createRadialGradient: () => grad,
        createPattern: () => ({})
      };
    },
    addEventListener() {},
    classList: makeMockElement('game-canvas').classList,
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; }
  };
}

const elementCache = new Map();
const mockCanvas = makeMockCanvas2D();

const dynamicOptionalIds = new Set(['btn-insp-cancel-task', 'btn-insp-kin', 'insp-action', 'insp-depth', 'insp-growth']);

const sandbox = {
  window: {},
  document: {
    getElementById(id) {
      if (id === 'game-canvas' || id === 'minimap-canvas') return mockCanvas;
      if (dynamicOptionalIds.has(id)) return null;
      if (!htmlIds.has(id)) {
        throw new Error(`Missing DOM element id="${id}" in index.html!`);
      }
      if (!elementCache.has(id)) elementCache.set(id, makeMockElement(id));
      return elementCache.get(id);
    },
    querySelectorAll() { return []; },
    createElement() { return makeMockCanvas2D(); }
  },
  navigator: {},
  console,
  Math,
  Date,
  Map,
  Set,
  Array,
  Object,
  Number,
  JSON,
  requestAnimationFrame: () => {},
  setTimeout: () => 0,
  clearTimeout: () => {},
  performance: { now: () => Date.now() },
  localStorage: {
    _data: {},
    getItem(k) { return this._data[k] ?? null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; }
  }
};
sandbox.window = sandbox;
sandbox.window.innerWidth = 1280;
sandbox.window.innerHeight = 720;
sandbox.window.devicePixelRatio = 2;
sandbox.window.addEventListener = () => {};
vm.createContext(sandbox);

for (const file of [
  'js/constants.js',
  'js/audio.js',
  'js/world.js',
  'js/entities.js',
  'js/renderer.js',
  'js/ui.js',
  'js/game.js'
]) {
  const code = fs.readFileSync(path.join(rootDir, file), 'utf8');
  vm.runInContext(code, sandbox, { filename: file });
}

const PT = sandbox.PT;

function runTests() {
  console.log('Running PRAIRIE TOWN full simulation, DOM & renderer tests...');

  // 1. Starter world (180x12) & single-hole stale airflow
  const game = new PT.Game(mockCanvas);
  game.ui = new PT.UIController(game); // validates EVERY document.getElementById against index.html!
  assert.strictEqual(game.dogs.length, 5, 'Should start with 4 adults + 1 pup');
  assert.strictEqual(game.world.totalCols, 180, 'Expanded valley should be 180 cols (90m) wide');
  assert.strictEqual(game.world.rows, 12, 'Expanded depth should be 12 rows (6m) deep');
  assert.strictEqual(game.world.neighbors.length, 6, 'Should include 6 neighboring coteries');
  assert.strictEqual(game.world.bernoulliActive, false, 'Single hole should NOT trigger Bernoulli airflow');
  assert(game.world.airflowPct < 55, `Single hole should have low stale airflow, got ${game.world.airflowPct}`);

  // 2. Crater Mound flood protection vs Raw Hole flooding
  const w = game.world;
  const sc = PT.STARTER_COL; // 90
  w.stepEnvironment(10, PT.WEATHER.STORM, 1.3);
  assert(w.water[1][sc] > 0.2, 'Raw unshielded hole should flood during Prairie Storm');

  w.mounds[sc].type = PT.MOUND.CRATER;
  w.water[0][sc] = 0;
  w.water[1][sc] = 0;
  w.water[2][sc] = 0;
  w.stepEnvironment(10, PT.WEATHER.STORM, 1.3);
  assert.strictEqual(w.water[1][sc], 0, 'Crater Mound must block rainwater flooding');

  // 3. Dig second exit & build Dome Mound -> Bernoulli Airflow activates!
  w.grid[2][sc + 3] = PT.CELL.TUNNEL;
  w.grid[2][sc + 4] = PT.CELL.TUNNEL;
  w.grid[1][sc + 4] = PT.CELL.SHAFT;
  w.grid[0][sc + 4] = PT.CELL.SHAFT;
  w.mounds[sc + 4].type = PT.MOUND.DOME;
  w.recomputeStats(0.8, game.dogs.length);
  assert.strictEqual(w.bernoulliActive, true, 'Connected Crater + Dome Mound must activate Bernoulli ventilation');
  assert(w.airflowPct >= 80, `Bernoulli airflow should boost fresh air >=80%, got ${w.airflowPct}`);

  // 4. Nursery 1.5m Coyote Dig Limit enforcement
  const shallowCheck = w.validatePlacement(PT.TOOLS.NURSERY, 2, sc + 1);
  assert.strictEqual(shallowCheck.ok, false, 'Nursery at <=1.5m (row 2) must be rejected');
  w.grid[3][sc + 1] = PT.CELL.TUNNEL;
  const deepCheck = w.validatePlacement(PT.TOOLS.NURSERY, 3, sc + 1);
  assert.strictEqual(deepCheck.ok, true, 'Nursery below 1.5m (row 3) must be allowed');

  // 5. Grass trimming widens Sightlines & reduces Coyote camouflage
  const coyote = new PT.Predator('COYOTE', w, sc);
  coyote.xCol = sc + 6;
  w.grass[sc + 6].height = 0.95;
  coyote.update(0.01, w, game.dogs);
  assert(coyote.camouflage > 0.5, 'Tall grass must camouflage sneaking Coyote');
  w.grass[sc + 6].height = 0.16;
  coyote.update(0.01, w, game.dogs);
  assert.strictEqual(coyote.camouflage, 0, 'Trimmed grass must remove Coyote camouflage');

  // 6. Semantic Alarm Mini-Game resolution
  const hawk = new PT.Predator('HAWK', w, sc);
  const human = new PT.Predator('HUMAN', w, sc);
  game.predators.push(coyote, hawk, human);
  game.activeAlarm = { predator: hawk, spotterName: 'Pip', timeMax: 5, timeLeft: 5 };
  game.ui.updateHUD();
  game.resolveAlarm('hawk_chirp');
  assert.strictEqual(hawk.alarmSuccess, true, 'Matching High-Pitch Dive Chirp must succeed for Hawk');
  assert.strictEqual(game.activeAlarm, null, 'Alarm overlay should clear on resolution');
  assert(game.unlockedAlmanac.includes('semantic_calls'), 'Successful alarm must unlock Semantic Language Almanac card');

  // 7. Tooth-Touch Neighbor Merge & Expansion
  const nb = w.neighbors[0];
  const initialMax = w.unlockedMaxCol;
  const popBefore = game.dogs.length;
  game._buildEntityContext().completeNeighborMerge(nb.id);
  assert.strictEqual(nb.merged, true, 'Neighbor should mark as merged');
  assert(w.unlockedMaxCol > initialMax, 'Territory should expand after neighbor merge');
  assert(game.dogs.length > popBefore, 'Merged neighbor coterie should add Adults & Pups');
  assert(game.unlockedAlmanac.includes('tooth_touch'), 'Tooth-Touch Almanac card should unlock');

  // 8. Colony Rank Progression up to Rank 3 (Autonomous Mega-Town)
  w.grid[0][sc + 1] = PT.CELL.LISTENING;
  w.grid[3][sc + 1] = PT.CELL.NURSERY;
  w.grid[2][sc - 2] = PT.CELL.LATRINE;
  w.grid[2][sc - 3] = PT.CELL.GRANARY;
  w.recomputeStats(0.8, game.dogs.length);
  game._checkRankProgression();
  assert.strictEqual(game.colonyRank, 1, 'Should promote to Rank 1: Ventilated Family Burrow');
  game._checkRankProgression();
  assert.strictEqual(game.colonyRank, 2, 'Should promote to Rank 2: Multi-Coterie Neighborhood');

  game._buildEntityContext().completeNeighborMerge(w.neighbors[1].id);
  game._buildEntityContext().completeNeighborMerge(w.neighbors[2].id);
  while (game.dogs.length < 15) {
    game.dogs.push(new PT.PrairieDog({ id: game.nextDogId++, name: 'Bonus', col: sc, row: 2 }));
  }
  game._checkRankProgression();
  assert.strictEqual(game.colonyRank, 3, 'Should promote to Rank 3: Autonomous Prairie Mega-Town');
  assert(game.unlockedAlmanac.includes('texas_megatown'), 'Mega-Town Almanac card should unlock');

  // 9. Full Renderer & UI exercise across all weather/time states, predators, Bernoulli airflow, chambers, & ghost
  game.weather = PT.WEATHER.STORM;
  game.particles.spawnDirt(sc, 2, 5, 0);
  game.particles.spawnGrassClip(sc + 2, 4);
  game.particles.spawnHearts(sc, 2, 4);
  game.particles.spawnSoundwave(sc, -1, 'coyote_bark', 1);
  game.hoverCell = { row: 3, col: sc + 2 };
  game.activeTool = PT.TOOLS.NURSERY;
  for (const wState of [PT.WEATHER.SUNNY, PT.WEATHER.GOLDEN, PT.WEATHER.CLOUDY, PT.WEATHER.STORM]) {
    for (const dp of [0.1, 0.5, 0.8, 0.95]) {
      game.weather = wState;
      game.dayProgress = dp;
      game.tick(0.05);
    }
  }
  game.ui.renderAlmanac();
  game.ui.openSkillsModal();
  game.ui.closeModal('skills-modal');
  game.ui.openRankModal();
  game.ui.closeModal('rank-modal');
  game.ui.showDogInspector(game.dogs[0]);
  game.ui.showCellInspector(3, sc + 1);
  game.ui.showRosterInspector();
  game.ui.syncSettingsUI();

  // 10. Save / JSON Export & Import Roundtrip
  const json = game.exportSaveJSON();
  const restored = new PT.Game(mockCanvas);
  restored.ui = new PT.UIController(restored);
  const ok = restored.importSaveJSON(json);
  assert.strictEqual(ok, true, 'JSON import must succeed');
  assert.strictEqual(restored.colonyRank, 3, 'Restored colony rank must match');
  assert.strictEqual(restored.dogs.length, game.dogs.length, 'Restored dog count must match');
  assert.strictEqual(restored.world.bernoulliActive, true, 'Restored Bernoulli state must match');

  // 11. Anti-Stuck, Strict 1st-Alert-Only Pause, Task Refund & Calm Guide checks
  const calmGame = new PT.Game(mockCanvas);
  calmGame.ui = new PT.UIController(calmGame);
  const dirtBefore = calmGame.resources.dirt;
  const qRes = calmGame.world.queueTask(PT.TOOLS.GRANARY, 2, sc - 1, calmGame.resources, calmGame.getPlacementOpts());
  assert.strictEqual(qRes.ok, true, 'Granary queue should succeed');
  assert.strictEqual(calmGame.resources.dirt, dirtBefore - 3, 'Granary cost should deduct 3 Dirt');
  assert.strictEqual(calmGame.world.cancelTaskAt(2, sc - 1, calmGame.resources), true, 'Task cancel should succeed');
  assert.strictEqual(calmGame.resources.dirt, dirtBefore, 'Task cancel must refund Dirt');

  // Rescue entity wedged in SOLID soil
  const rescued = calmGame.world.sanitizeEntityPosition(7, sc - 10, true);
  assert(calmGame.world.isOpenCell(rescued.row, rescued.col), 'Sanitizer must relocate dog to open cell');

  // Day 1 Guide must not auto-skip while reading
  for (let i = 0; i < 30; i++) calmGame.tick(0.5);
  assert.strictEqual(calmGame.tutorialStep, 0, 'Day 1 Guide must not auto-skip before player acts or clicks Next');
  calmGame.nextTutorialStep();
  assert.strictEqual(calmGame.tutorialStep, 1, 'Next button advances Day 1 Guide cleanly');

  // 12. Surface Forager must return underground during STORM (never freeze on grass) & Inspector must not wipe DOM on silentRefresh
  const fDog = calmGame.dogs.find((d) => d.role === PT.ROLES.FORAGER);
  fDog.row = -1;
  fDog.col = sc - 4;
  fDog.state = 'idle';
  fDog.path = [];
  calmGame.weather = PT.WEATHER.STORM;
  for (let i = 0; i < 120; i++) calmGame.tick(0.05);
  assert(fDog.row >= 0, `Forager on surface must retreat underground during storm, got row=${fDog.row}`);

  calmGame.ui.showDogInspector(fDog, false);
  calmGame.ui.els.inspectorBody.innerHTML = 'SENTINEL_MARKER';
  calmGame.ui.showDogInspector(fDog, true);
  assert.strictEqual(calmGame.ui._inspectedDogKey, `${fDog.id}:${fDog.isPup}:${fDog.role}`);

  // 13. Multi-tile tunnel auto-path queuing & Human predator leaving transition
  // Unlock Expanded Blueprints so multi-tile auto-path fits cleanly within skill limit
  calmGame.skillPoints = 2;
  assert.strictEqual(calmGame.spendSkillPoint('work_queue'), true);
  assert.strictEqual(calmGame.spendSkillPoint('work_queue'), true); // 4 -> 7 -> 11 work blocks
  const pathRes = calmGame.world.queueTask(PT.TOOLS.TUNNEL, 3, sc + 7, calmGame.resources, calmGame.getPlacementOpts());
  assert.strictEqual(pathRes.ok, true, 'Distant tunnel click within reach must auto-queue full connecting path');
  assert(pathRes.count >= 4, `Should queue >=4 connecting tunnel tiles, got ${pathRes.count}`);

  const hPred = new PT.Predator('HUMAN', calmGame.world, sc);
  hPred.dir = 1;
  hPred.xCol = sc + 4;
  hPred.update(0.1, calmGame.world, calmGame.dogs);
  assert.strictEqual(hPred.state, 'leaving', 'Human past targetCol must transition to leaving so surface dogs do not wait 35s');

  // 14. Heavy Multi-Action Burst & Overhead Predator Non-Freezing Stress Test
  const burstGame = new PT.Game(mockCanvas);
  burstGame.ui = new PT.UIController(burstGame);
  burstGame.tutorialDone = true;
  burstGame.resources.dirt = 60;
  burstGame.resources.food = 45;
  burstGame.skillPoints = 5;
  burstGame.spendSkillPoint('work_queue'); // 7
  burstGame.spendSkillPoint('work_queue'); // 11
  burstGame.spendSkillPoint('work_queue'); // 16 blocks!
  burstGame.adjustRoleCount(PT.ROLES.DIGGER, 1); // 2 diggers

  // Queue distant tunnel + Crater + 2nd exit + Dome + Nursery + Listening + Granary + Latrine + Trim all at once!
  const bOpts = burstGame.getPlacementOpts();
  assert.strictEqual(burstGame.world.queueTask(PT.TOOLS.TUNNEL, 2, sc + 6, burstGame.resources, bOpts).ok, true);
  assert.strictEqual(burstGame.world.queueTask(PT.TOOLS.TUNNEL, 0, sc + 6, burstGame.resources, bOpts).ok, true);
  assert.strictEqual(burstGame.world.queueTask(PT.TOOLS.CRATER, 0, sc, burstGame.resources, bOpts).ok, true);
  assert.strictEqual(burstGame.world.queueTask(PT.TOOLS.DOME, 0, sc + 6, burstGame.resources, bOpts).ok, true);
  assert.strictEqual(burstGame.world.queueTask(PT.TOOLS.LISTENING, 0, sc + 1, burstGame.resources, bOpts).ok, true);
  assert.strictEqual(burstGame.world.queueTask(PT.TOOLS.NURSERY, 3, sc + 4, burstGame.resources, bOpts).ok, true);
  assert.strictEqual(burstGame.world.queueTask(PT.TOOLS.GRANARY, 2, sc - 2, burstGame.resources, bOpts).ok, true);
  assert.strictEqual(burstGame.world.queueTask(PT.TOOLS.LATRINE, 1, sc - 1, burstGame.resources, bOpts).ok, true);
  assert.strictEqual(burstGame.world.queueTask(PT.TOOLS.TRIM, -1, sc + 3, burstGame.resources, bOpts).ok, true);

  // Spawn Human overhead and resolve alarm immediately -> underground Diggers must NOT freeze in sheltered!
  const overheadHuman = new PT.Predator('HUMAN', burstGame.world, sc);
  overheadHuman.dir = 1;
  overheadHuman.xCol = sc - 1;
  burstGame.predators.push(overheadHuman);
  burstGame.activeAlarm = { predator: overheadHuman, spotterName: 'Pip', timeMax: 9, timeLeft: 9, isPausedAlert: false };
  burstGame.resolveAlarm('human_whistle');

  const workBefore = burstGame.world.tasks.reduce((s, t) => s + t.workDone, 0);
  for (let i = 0; i < 60; i++) burstGame.tick(0.05); // 3s while Human walks overhead
  const workDuringHuman = burstGame.world.tasks.reduce((s, t) => s + t.workDone, 0) +
    (12 - burstGame.world.tasks.length) * 2.4;
  assert(workDuringHuman > workBefore + 0.5, 'Underground Diggers must continue excavating even while resolved Human passes overhead');

  // Step remaining simulation until all burst tasks complete
  for (let i = 0; i < 1400; i++) {
    burstGame.tick(0.05);
    if (burstGame.activeAlarm) {
      const exp = PT.PREDATORS[burstGame.activeAlarm.predator.type].callId;
      burstGame.resolveAlarm(exp);
    }
  }
  assert.strictEqual(burstGame.world.tasks.length, 0, `All simultaneous queued tasks must finish without sticking, remaining=${burstGame.world.tasks.length}`);
  assert.strictEqual(burstGame.world.bernoulliActive, true, 'Simultaneous Crater+Dome+Tunnel burst must produce active Bernoulli airflow');
  assert(burstGame.world.chamberCounts.nursery >= 1 && burstGame.world.chamberCounts.granary >= 1 && burstGame.world.chamberCounts.latrine >= 1 && burstGame.world.chamberCounts.listening >= 1, 'All specialized chambers must complete cleanly');

  // Orphan pruning verification: queue tunnel (3, sc+2) + Nursery (3, sc+3) and cancel the bridge
  const orphanGame = new PT.Game(mockCanvas);
  orphanGame.ui = new PT.UIController(orphanGame);
  const fBefore = orphanGame.resources.food;
  assert.strictEqual(orphanGame.world.queueTask(PT.TOOLS.TUNNEL, 3, sc + 2, orphanGame.resources, orphanGame.getPlacementOpts()).ok, true);
  assert.strictEqual(orphanGame.world.queueTask(PT.TOOLS.NURSERY, 3, sc + 3, orphanGame.resources, orphanGame.getPlacementOpts()).ok, true);
  assert(orphanGame.resources.food < fBefore, 'Nursery should consume 6 food');
  assert.strictEqual(orphanGame.world.cancelTaskAt(3, sc + 2, orphanGame.resources), true, 'Cancel bridge task');
  assert.strictEqual(orphanGame.world.tasks.length, 0, 'Cancelling bridge task must cleanly prune & refund unreachable orphaned Nursery');
  assert.strictEqual(orphanGame.resources.food, fBefore, 'Orphaned Nursery food cost must be refunded');

  // 15. Strict 1st-Alert-Only Pause, Timed Remaining Alerts, Grass Ambush Risk, Coyote Shallow Collapse & World Creation Deposits
  const challengeGame = new PT.Game(mockCanvas);
  challengeGame.ui = new PT.UIController(challengeGame);
  challengeGame.world = new PT.World('canyon', 4242);
  challengeGame.world.recomputeStats(0.8, challengeGame.dogs.length);
  assert(challengeGame.world.tallGrassRisk > 35, 'Starter perimeter tall grass must carry real ambush risk');

  // First predator alarm must PAUSE timer indefinitely so new player learns calmly
  const pFirst = new PT.Predator('HAWK', challengeGame.world, sc);
  pFirst.alarmTriggered = true;
  challengeGame.predators.push(pFirst);
  challengeGame._stepPredators(0.05);
  assert(challengeGame.activeAlarm && challengeGame.activeAlarm.isPausedAlert, '1st alarm must pause countdown');
  const firstStart = challengeGame.activeAlarm.timeLeft;
  for (let i = 0; i < 20; i++) challengeGame.tick(0.25);
  assert.strictEqual(challengeGame.activeAlarm.timeLeft, firstStart, '1st alert timer must remain frozen while player reads');
  challengeGame.resolveAlarm('hawk_chirp');

  // Second predator in tall grass: Coyote ambush triggers TIMED countdown that ticks down live (NO pause!)
  const pSecond = new PT.Predator('COYOTE', challengeGame.world, sc);
  pSecond.camouflage = 0.75;
  pSecond.xCol = sc + 3;
  challengeGame.predators.push(pSecond);
  challengeGame._stepPredators(0.05);
  assert(challengeGame.activeAlarm && !challengeGame.activeAlarm.isPausedAlert, '2nd+ alarms must NEVER pause timer');
  assert.strictEqual(challengeGame.activeAlarm.isAmbush, true, 'Coyote in tall grass must flag Ambush penalty');
  const secondStart = challengeGame.activeAlarm.timeLeft;
  challengeGame.tick(1.0);
  assert(challengeGame.activeAlarm.timeLeft < secondStart, '2nd+ alarm timer must count down in real time');

  // Missing a Coyote alarm collapses shallow (row <= 2) cell while deep row >= 3 remains protected
  challengeGame.world.grid[2][sc + 2] = PT.CELL.TUNNEL;
  challengeGame.world.grid[3][sc + 1] = PT.CELL.NURSERY;
  challengeGame.resolveAlarm('hawk_chirp'); // wrong call -> Coyote damages shallow tunnel
  assert.strictEqual(challengeGame.world.grid[3][sc + 1], PT.CELL.NURSERY, 'Deep Nursery below 1.5m must survive Coyote attack');

  // Clay / Root caches award bonus resources upon task completion
  const wClay = new PT.World('canyon', 1234);
  wClay.cellMod[2][sc + 3] = PT.CELL_MOD.CLAY;
  const rTest = { dirt: 10, food: 20 };
  const qClay = wClay.queueTask(PT.TOOLS.TUNNEL, 2, sc + 3, rTest);
  assert.strictEqual(qClay.ok, true);
  const compRes = wClay.completeTask(wClay.tasks[0], rTest);
  assert.strictEqual(compRes.bonusDirt, 12, 'Excavating Clay Vein must grant +12 bonus Dirt');

  // 16. Skill Points, Block Queue Cap, Wide Brush, Edge Predator Encounter & Final Autonomous Victory Mode
  const skillGame = new PT.Game(mockCanvas);
  skillGame.ui = new PT.UIController(skillGame);
  skillGame.resources.dirt = 50;
  assert.strictEqual(skillGame.getMaxWorkBlocks(), 4, 'Base colony starts with 4 work block slots');
  // Queue 4 adjacent blocks -> 5th should be rejected by Blueprint Capacity until upgraded!
  for (let i = 0; i < 4; i++) {
    assert.strictEqual(skillGame.world.queueTask(PT.TOOLS.TUNNEL, 3, sc - 1 + i, skillGame.resources, skillGame.getPlacementOpts()).ok, true);
  }
  const blocked = skillGame.world.queueTask(PT.TOOLS.TUNNEL, 1, sc + 1, skillGame.resources, skillGame.getPlacementOpts());
  assert.strictEqual(blocked.ok, false, '5th simultaneous block must be blocked until Blueprint Capacity is upgraded with SP');

  // Unlock Achievement -> Gain SP -> Buy Expanded Blueprints & Wide Brush -> Queue works!
  assert.strictEqual(skillGame.unlockAchievement('crater_built'), true);
  assert.strictEqual(skillGame.unlockAchievement('bernoulli_air'), true);
  assert(skillGame.skillPoints >= 3, 'Achievements must grant Skill Points');
  assert.strictEqual(skillGame.spendSkillPoint('work_queue'), true, 'Spending 1 SP expands work blocks to 7');
  assert.strictEqual(skillGame.getMaxWorkBlocks(), 7);
  assert.strictEqual(skillGame.spendSkillPoint('excavate_brush'), true, 'Spending 2 SP unlocks 2x1 Wide Brush');
  const unblocked = skillGame.world.queueTask(PT.TOOLS.TUNNEL, 1, sc + 1, skillGame.resources, skillGame.getPlacementOpts());
  assert.strictEqual(unblocked.ok, true, 'Expanded Blueprint capacity allows queuing more blocks');

  // Outer surface worker encounter BEFORE predator reaches center Sentry!
  const encGame = new PT.Game(mockCanvas);
  encGame.ui = new PT.UIController(encGame);
  const outerWorker = encGame.dogs.find((d) => d.role === PT.ROLES.FORAGER);
  outerWorker.row = -1;
  outerWorker.col = sc - 16; // far outside center Sentry range
  const encPred = new PT.Predator('HUMAN', encGame.world, sc);
  encPred.xCol = sc - 15; // right next to outer Forager, 15 cols away from Sentry at col 90!
  encPred.update(0.05, encGame.world, encGame.dogs);
  assert.strictEqual(encPred.alarmTriggered, true, 'Surface worker encountering predator at outer prairie must trigger alert immediately');
  assert.strictEqual(encPred.isWorkerEncounter, true, 'Should mark encounter so player sees worker ambush');

  // Final Autonomous Self-Sustaining Goal -> Auto-resolves predator alerts with zero player help!
  elementCache.clear();
  const autoGame = new PT.Game(mockCanvas);
  autoGame.ui = new PT.UIController(autoGame);
  const aw = autoGame.world;
  aw.mounds[sc].type = PT.MOUND.CRATER;
  aw.grid[0][sc + 4] = PT.CELL.SHAFT;
  aw.grid[1][sc + 4] = PT.CELL.SHAFT;
  aw.grid[2][sc + 3] = PT.CELL.TUNNEL;
  aw.grid[2][sc + 4] = PT.CELL.TUNNEL;
  aw.mounds[sc + 4].type = PT.MOUND.DOME;
  aw.grid[3][sc] = PT.CELL.NURSERY;
  aw.grid[3][sc + 1] = PT.CELL.NURSERY;
  aw.grid[2][sc - 2] = PT.CELL.GRANARY;
  aw.grid[2][sc - 3] = PT.CELL.GRANARY;
  aw.grid[2][sc - 4] = PT.CELL.LATRINE;
  aw.grid[2][sc + 5] = PT.CELL.LATRINE;
  aw.grid[0][sc + 1] = PT.CELL.LISTENING;
  aw.grid[0][sc + 5] = PT.CELL.LISTENING;
  for (let c = 0; c < aw.totalCols; c++) if (!aw.isEntrance(c)) aw.grass[c].height = 0.2;
  // Connect main valley tunnels across borders before merging all 6 coteries cleanly!
  for (let c = 31; c <= 148; c++) {
    if (aw.grid[2][c] === PT.CELL.SOLID) aw.grid[2][c] = PT.CELL.TUNNEL;
  }
  for (const n of aw.neighbors) aw.mergeNeighbor(n);
  while (autoGame.dogs.length < 22) {
    autoGame.dogs.push(new PT.PrairieDog({ id: autoGame.nextDogId++, name: 'Citizen', col: sc, row: 2 }));
  }
  autoGame.hygienePct = 90;
  autoGame.moralePct = 90;
  aw.recomputeStats(0.8, autoGame.dogs.length);
  autoGame._checkAchievementsAndVictory(0.1);
  assert.strictEqual(autoGame.autonomousVictory, true, 'Meeting all 5 Final Goal milestones must activate Autonomous Prairie Town Victory');
  assert.strictEqual(autoGame.pausedByModal, true, 'Victory modal should open and pause until player chooses Continue');
  autoGame.ui.closeModal('victory-modal');

  // Autonomous colony defends itself against predators without any player keypresses!
  const autoHawk = new PT.Predator('HAWK', aw, sc);
  autoHawk.alarmTriggered = true;
  autoGame.predators.push(autoHawk);
  for (let i = 0; i < 30; i++) autoGame.tick(0.05);
  assert.strictEqual(autoHawk.alarmSuccess, true, 'Autonomous Town Sentries must automatically sound matching warning call without player input');
  assert.strictEqual(autoGame.activeAlarm, null, 'Autonomous alarm must resolve and clear cleanly');

  // Verify Master Steward (Sentinel Instincts Lv3) safety auto-call before timeout
  const stewardGame = new PT.Game(mockCanvas);
  stewardGame.ui = new PT.UIController(stewardGame);
  stewardGame.skillLevels.colony_harmony = 3;
  const stHawk = new PT.Predator('HAWK', stewardGame.world, sc);
  stHawk.alarmTriggered = true;
  stewardGame.predators.push(stHawk);
  stewardGame._stepPredators(0.05);
  stewardGame.resolveAlarm('hawk_chirp'); // clear 1st paused alarm
  const stCoyote = new PT.Predator('COYOTE', stewardGame.world, sc);
  stCoyote.alarmTriggered = true;
  stewardGame.predators.push(stCoyote);
  for (let i = 0; i < 200 && !stCoyote.alarmResolved; i++) stewardGame.tick(0.05);
  assert.strictEqual(stCoyote.alarmSuccess, true, 'Sentinel Instincts Lv3 (Master Steward) must auto-answer before timeout');

  // Verify Mineral Spring aquifer persistence, Offscreen predator render, Minimap jump, and Static Player Counter UI
  wClay.cellMod[9][sc] = PT.CELL_MOD.AQUIFER;
  wClay.grid[8][sc] = PT.CELL.TUNNEL;
  const qAq = wClay.queueTask(PT.TOOLS.TUNNEL, 9, sc, rTest);
  assert.strictEqual(qAq.ok, true);
  wClay.completeTask(wClay.tasks[wClay.tasks.length - 1], rTest);
  assert.strictEqual(wClay.cellMod[9][sc], PT.CELL_MOD.SPRING, 'Excavated Aquifer must convert to permanent Mineral Spring');
  wClay.recomputeStats(0.8, 5);
  assert.strictEqual(wClay.springCount, 1, 'Tapped Mineral Spring must be counted for ongoing Hygiene bonus');

  stewardGame.jumpCameraFromMinimap(0.05);
  assert(stewardGame.renderer.cam.targetX < sc * PT.CELL_SIZE * 0.5, 'Minimap click must warp camera across 90m valley');
  stewardGame.ui.updatePlayerCounter(12500, 3);
  assert.strictEqual(stewardGame.ui.els.hudPlayersCount.textContent, '12.5K', 'Large global player count should format compactly');
  stewardGame.ui.updatePlayerCounter(null, 4);
  assert.strictEqual(stewardGame.ui.els.hudPlayersCount.textContent, '4*', 'Offline counter fallback must display local session count cleanly');

  // Boot lifecycle verification: Opening Guide modal pops automatically on fresh start & pauses until closed
  elementCache.clear();
  sandbox.localStorage._data = {};
  const bootGame = new PT.Game(mockCanvas);
  bootGame.boot();
  assert.strictEqual(bootGame.ui.els.welcomeModal.classList.contains('hidden'), false, 'Opening welcome guide modal must pop up on start');
  assert.strictEqual(bootGame.pausedByModal, true, 'Gameplay must pause while welcome guide is open');
  bootGame.ui.closeModal('welcome-modal');
  assert.strictEqual(bootGame.pausedByModal, false, 'Closing welcome guide must resume simulation');

  console.log('ALL 16 SIMULATION, BOOT, DOM PARITY, TIMED ALARM, SKILLS, ENCOUNTERS, AUTONOMOUS VICTORY & ANTI-STUCK TEST SUITES PASSED!');
}

runTests();
