/**
 * PRAIRIE TOWN: Coterie & Burrow
 * World simulation: terrain grid, grass height, sightlines, Bernoulli airflow,
 * flood protection, specialized chambers, neighbor coteries, and BFS pathfinding.
 */
(function (root) {
  'use strict';

  const PT = (root.PT = root.PT || {});

  class World {
    constructor(worldStyle = 'meadow', worldSeed = null) {
      this.totalCols = PT.WORLD_COLS || 180; // 90 meters total width across panoramic valley
      this.rows = PT.MAX_DEPTH_ROWS; // 12 rows = 6.0m deep
      this.worldStyle = PT.WORLD_STYLES[worldStyle] ? worldStyle : 'meadow';
      this.worldSeed = worldSeed ?? Math.floor(Math.random() * 9000 + 1000);

      // Player initially controls center valley [72..107] around starter col 90
      this.unlockedMinCol = 72;
      this.unlockedMaxCol = 107;

      // Grid layers [row][col]
      this.grid = [];
      this.cellMod = [];    // NONE | CLAY (+Dirt) | ROOT (+Food) | ROCK (tough boulder)
      this.water = [];      // 0..1 rainwater flooding
      this.airflowCell = []; // { vx, vy, strength, bernoulli }
      this.soilSeed = [];   // deterministic pebble/root seed per cell

      // Surface arrays [col]
      this.mounds = [];     // { type, progress, health }
      this.grass = [];      // { height (0.12..1.1), trimMarked, flower, seedAmount }
      this.blooms = [];     // Interactive Golden Seed Blooms [{ id, col, food, ttl }]
      this.nextBloomId = 1;

      // Queued dig/build tasks: { id, kind, row, col, workDone, workTotal, cellType, moundType, dirtGain }
      this.tasks = [];
      this.nextTaskId = 1;

      // Neighboring coteries waiting behind border walls
      this.neighbors = [];

      // Computed telemetry
      this.airflowPct = 42;
      this.bernoulliActive = false;
      this.bernoulliPairs = []; // [{ craterCol, domeCol, pathCells }]
      this.chamberCounts = { listening: 0, nursery: 0, latrine: 0, granary: 0 };
      this.moundCounts = { raw: 0, crater: 0, dome: 0 };
      this.springCount = 0;
      this.sightlineZones = []; // [{ col, leftCol, rightCol, moundType }]
      this.tallGrassRisk = 55;  // % of near-entrance perimeter overgrown with tall predator-hiding grass
      this.sightlineClear = false;
      this.owlCol = null;       // Burrowing Owl ally perched when colony has >=2 mounds, clean grass & airflow

      this._initFreshWorld();
    }

    _seededRand(idx) {
      const x = Math.sin(this.worldSeed * 0.137 + idx * 78.233) * 43758.5453;
      return x - Math.floor(x);
    }

    _initFreshWorld() {
      this.grid = [];
      this.cellMod = [];
      this.water = [];
      this.airflowCell = [];
      this.soilSeed = [];
      this.blooms = [];
      this.owlCol = null;

      const style = PT.WORLD_STYLES[this.worldStyle] || PT.WORLD_STYLES.meadow;

      for (let r = 0; r < this.rows; r++) {
        this.grid[r] = new Array(this.totalCols).fill(PT.CELL.SOLID);
        this.cellMod[r] = new Array(this.totalCols).fill(PT.CELL_MOD.NONE);
        this.water[r] = new Array(this.totalCols).fill(0);
        this.airflowCell[r] = [];
        this.soilSeed[r] = [];
        for (let c = 0; c < this.totalCols; c++) {
          this.airflowCell[r][c] = { vx: 0, vy: 0, strength: 0, bernoulli: false };
          this.soilSeed[r][c] = Math.abs(Math.sin((r + 1) * 97.13 + (c + 1) * 43.71 + this.worldSeed * 0.1) * 10000) % 1;
        }
      }

      const sc = PT.STARTER_COL || 90;
      this.mounds = [];
      this.grass = [];
      for (let c = 0; c < this.totalCols; c++) {
        this.mounds.push({ type: PT.MOUND.NONE, buildingType: null, progress: 0 });
        const nearStarter = Math.abs(c - sc) <= 1;
        const baseH = (0.58 + (Math.sin(c * 1.7 + this.worldSeed * 0.03) * 0.18 + 0.22)) * style.grassMult;
        const h = nearStarter ? 0.24 : baseH;
        this.grass.push({
          height: Math.min(1.08, Math.max(0.16, h)),
          trimMarked: false,
          flower: (c * 7) % 5 === 0,
          seedAmount: 0.7 + ((c * 13) % 5) * 0.1
        });
      }

      // Starter Single-Hole Pioneer Burrow at center col 90
      this.mounds[sc].type = PT.MOUND.RAW;
      this.grid[0][sc] = PT.CELL.SHAFT;
      this.grid[1][sc] = PT.CELL.SHAFT;
      this.grid[2][sc] = PT.CELL.TUNNEL;
      this.grid[2][sc - 1] = PT.CELL.TUNNEL;
      this.grid[2][sc + 1] = PT.CELL.TUNNEL;
      this.grid[2][sc + 2] = PT.CELL.TUNNEL;

      // 6 Neighboring Coterie Burrows (3 East, 3 West) across the 90m valley!
      this.neighbors = [
        {
          id: 'east_1',
          name: 'Suncrest Coterie',
          side: 'east',
          borderCol: 108,
          moundCol: 115,
          unlockToCol: 125,
          merged: false,
          kinProgress: 0,
          greetingActive: false,
          adults: 2,
          pups: 1
        },
        {
          id: 'west_1',
          name: 'Sagebrush Kin',
          side: 'west',
          borderCol: 71,
          moundCol: 64,
          unlockFromCol: 54,
          merged: false,
          kinProgress: 0,
          greetingActive: false,
          adults: 2,
          pups: 1
        },
        {
          id: 'east_2',
          name: 'Mesa Ridge Ward',
          side: 'east',
          borderCol: 126,
          moundCol: 136,
          unlockToCol: 147,
          merged: false,
          kinProgress: 0,
          greetingActive: false,
          adults: 3,
          pups: 1
        },
        {
          id: 'west_2',
          name: 'Redrock Clan',
          side: 'west',
          borderCol: 53,
          moundCol: 43,
          unlockFromCol: 32,
          merged: false,
          kinProgress: 0,
          greetingActive: false,
          adults: 3,
          pups: 2
        },
        {
          id: 'east_3',
          name: 'Cottonwood Frontier',
          side: 'east',
          borderCol: 148,
          moundCol: 162,
          unlockToCol: 175,
          merged: false,
          kinProgress: 0,
          greetingActive: false,
          adults: 3,
          pups: 2
        },
        {
          id: 'west_3',
          name: 'High Plains Eldertown',
          side: 'west',
          borderCol: 31,
          moundCol: 17,
          unlockFromCol: 4,
          merged: false,
          kinProgress: 0,
          greetingActive: false,
          adults: 3,
          pups: 2
        }
      ];

      // Pre-carve each Neighbor Coterie's cozy mini-burrow behind its border
      this.neighbors.forEach((nb) => {
        const mc = nb.moundCol;
        this.mounds[mc].type = nb.side === 'east' ? PT.MOUND.DOME : PT.MOUND.CRATER;
        this.grass[mc].height = 0.2;
        this.grass[mc - 1].height = 0.22;
        this.grass[mc + 1].height = 0.22;
        this.grid[0][mc] = PT.CELL.SHAFT;
        this.grid[1][mc] = PT.CELL.SHAFT;
        this.grid[2][mc] = PT.CELL.TUNNEL;
        this.grid[3][mc] = PT.CELL.TUNNEL;
        const dir = nb.side === 'east' ? -1 : 1;
        for (let i = 1; i <= 4; i++) {
          this.grid[2][mc + dir * i] = PT.CELL.TUNNEL;
        }
        this.grid[3][mc + dir] = PT.CELL.NURSERY;
      });

      // Populate procedural underground pockets (Clay, Root Caches, Sandstone, Deep Aquifers)
      this._populateWorldDeposits(style);

      // Seed 2 starter Golden Seed Blooms nearby on surface to invite active exploring!
      this.blooms.push({ id: this.nextBloomId++, col: sc - 6, food: 7, ttl: 55 });
      this.blooms.push({ id: this.nextBloomId++, col: sc + 8, food: 7, ttl: 55 });

      this.recomputeStats(0.7, 5);
    }

    _populateWorldDeposits(style) {
      let randIdx = 1;
      const sc = PT.STARTER_COL || 90;
      const placeFeature = (mod, count, minRow, maxRow) => {
        let placed = 0;
        let attempts = 0;
        while (placed < count && attempts < 360) {
          attempts++;
          const r = minRow + Math.floor(this._seededRand(randIdx++) * (maxRow - minRow + 1));
          const c = 8 + Math.floor(this._seededRand(randIdx++) * (this.totalCols - 16));
          if (Math.abs(c - sc) <= 3 && r <= 3) continue;
          if (this.grid[r][c] !== PT.CELL.SOLID || this.cellMod[r][c] !== PT.CELL_MOD.NONE) continue;
          this.cellMod[r][c] = mod;
          placed++;
        }
      };

      // Guarantee nearby Clay & Root pockets in starter valley
      if (this.grid[3][sc + 4] === PT.CELL.SOLID) this.cellMod[3][sc + 4] = PT.CELL_MOD.CLAY;
      if (this.grid[4][sc - 3] === PT.CELL.SOLID) this.cellMod[4][sc - 3] = PT.CELL_MOD.ROOT;
      if (this.grid[9][sc] === PT.CELL.SOLID) this.cellMod[9][sc] = PT.CELL_MOD.AQUIFER;

      placeFeature(PT.CELL_MOD.CLAY, style.clayCount * 2, 1, this.rows - 3);
      placeFeature(PT.CELL_MOD.ROOT, style.rootCount * 2, 1, 6);
      placeFeature(PT.CELL_MOD.ROCK, style.rockCount * 2, 2, this.rows - 2);
      placeFeature(PT.CELL_MOD.AQUIFER, (style.aquiferCount || 5) * 2, 9, this.rows - 1);
    }

    inBounds(r, c) {
      return r >= 0 && r < this.rows && c >= 0 && c < this.totalCols;
    }

    isUnlocked(c) {
      return c >= this.unlockedMinCol && c <= this.unlockedMaxCol;
    }

    isOpenCell(r, c) {
      return this.inBounds(r, c) && this.grid[r][c] !== PT.CELL.SOLID;
    }

    isEntrance(c) {
      return c >= 0 && c < this.totalCols && this.mounds[c].type !== PT.MOUND.NONE && this.isOpenCell(0, c);
    }

    // Can a cell be excavated or built upon? Supports skill-upgraded brushSize & maxAutoDist
    validatePlacement(tool, row, col, opts = {}) {
      const maxAutoDist = opts.maxAutoDist ?? 6;
      const brushSize = opts.brushSize ?? 1;
      if (col < this.unlockedMinCol || col > this.unlockedMaxCol) {
        return { ok: false, reason: 'Outside territory — perform a Tooth-Touch Kin Check at a border!' };
      }

      if (tool === PT.TOOLS.TRIM) {
        if (row > 0) return { ok: false, reason: 'Click surface grass above ground to trim.' };
        if (this.grass[col].height <= 0.24) return { ok: false, reason: 'Grass here is already trimmed short.' };
        return { ok: true, reason: 'Mark tall grass to trim for wide sightlines.' };
      }

      if (tool === PT.TOOLS.CRATER || tool === PT.TOOLS.DOME) {
        if (row !== 0 && row !== -1) {
          return { ok: false, reason: 'Place mounds along the surface line (top row).' };
        }
        if (this.tasks.some((t) => t.kind === 'mound' && t.col === col)) {
          return { ok: false, reason: 'Mound construction already queued here (right-click to cancel).' };
        }
        if (!this.isOpenCell(0, col) && !this.isOpenCell(1, col) && !this._hasQueuedDigAt(0, col) && !this._hasQueuedDigAt(1, col)) {
          return { ok: false, reason: 'Dig a tunnel up to row 1 or surface first to open an exit.' };
        }
        if (this.mounds[col].type === (tool === PT.TOOLS.CRATER ? PT.MOUND.CRATER : PT.MOUND.DOME)) {
          return { ok: false, reason: 'This mound is already built here.' };
        }
        return {
          ok: true,
          reason: tool === PT.TOOLS.CRATER
            ? 'Build tall flood-proof Crater Mound (Bernoulli exhaust).'
            : 'Build low rounded Dome Mound (Bernoulli intake).'
        };
      }

      if (tool === PT.TOOLS.KIN_CHECK) {
        const nb = this.getReachableNeighborNear(Math.max(0, row), col);
        if (!nb) {
          return { ok: false, reason: 'Dig a tunnel up to the East or West territory border first!' };
        }
        return { ok: true, neighbor: nb, reason: `Tooth-Touch Kin Check with ${nb.name}!` };
      }

      // Underground tools
      if (row < 0 || row >= this.rows) {
        return { ok: false, reason: 'Select an underground soil stratum.' };
      }

      const existing = this.grid[row][col];
      if (this.tasks.some((t) => t.kind === 'dig' && t.row === row && t.col === col)) {
        return { ok: false, reason: 'Excavation already queued here (right-click to cancel).' };
      }

      const hasAdjOpen = this._hasAdjacentOpenOrQueued(row, col) || (row === 0 && (this.isOpenCell(1, col) || this._hasQueuedDigAt(1, col)));
      const autoPath = (!hasAdjOpen && existing === PT.CELL.SOLID && tool !== PT.TOOLS.LISTENING)
        ? this._findTunnelConnectPath(row, col, maxAutoDist)
        : null;

      if (!hasAdjOpen && existing === PT.CELL.SOLID && !autoPath) {
        return { ok: false, reason: `Click within ${maxAutoDist} tiles of an open/queued tunnel (extend reach in ⭐ Skills!).` };
      }

      if (tool === PT.TOOLS.TUNNEL) {
        if (existing !== PT.CELL.SOLID) return { ok: false, reason: 'Already excavated.' };
        if (autoPath && autoPath.length > 1) {
          return { ok: true, autoPath, reason: `Carve ${autoPath.length}-tile connecting tunnel (+${autoPath.length * 4} Dirt).` };
        }
        // Multi-block Wide Excavation Brush (2x1 or 2x2) when unlocked in Skills!
        if (brushSize > 1) {
          const offsets = brushSize >= 4 ? [[0, 0], [0, 1], [1, 0], [1, 1]] : [[0, 0], [0, 1]];
          const brushCells = offsets
            .map(([dr, dc]) => ({ row: row + dr, col: col + dc }))
            .filter((p) => this.inBounds(p.row, p.col) && this.isUnlocked(p.col) && this.grid[p.row][p.col] === PT.CELL.SOLID && !this._hasQueuedDigAt(p.row, p.col));
          if (brushCells.length > 1) {
            return { ok: true, brushCells, reason: `Wide Brush: Carve ${brushCells.length} blocks (+${brushCells.length * 4} Dirt)!` };
          }
        }
        return { ok: true, reason: row === 0 ? 'Break through to surface exit (+4 Dirt).' : 'Carve passage (+4 Dirt).' };
      }

      if (tool === PT.TOOLS.LISTENING) {
        if (row > 1) return { ok: false, reason: 'Listening Chambers belong near entrances (depth <= 1.0m).' };
        const nearShaft = this.isEntrance(col) || this.isEntrance(col - 1) || this.isEntrance(col + 1) ||
          (this.inBounds(0, col - 1) && (this.grid[0][col - 1] === PT.CELL.SHAFT || this._hasQueuedDigAt(0, col - 1))) ||
          (this.inBounds(0, col + 1) && (this.grid[0][col + 1] === PT.CELL.SHAFT || this._hasQueuedDigAt(0, col + 1)));
        if (!nearShaft) return { ok: false, reason: 'Place adjacent to an entrance shaft.' };
        if (existing === PT.CELL.LISTENING) return { ok: false, reason: 'Already a Listening Chamber.' };
        return { ok: true, reason: 'Excavate Listening Chamber (safe exit awareness).' };
      }

      if (tool === PT.TOOLS.NURSERY) {
        if (row < PT.NURSERY_MIN_DEPTH_ROW) {
          return { ok: false, reason: 'Unsafe depth! Nurseries must be below 1.5m (Coyote Dig Limit).' };
        }
        if (existing === PT.CELL.NURSERY) return { ok: false, reason: 'Already a Nursery.' };
        const tunnelNote = autoPath && autoPath.length > 1 ? ` + ${autoPath.length - 1} tunnel` : '';
        return { ok: true, autoPath, reason: `Deep grass-lined Nursery (safe from Coyotes, boosts pups!${tunnelNote}).` };
      }

      if (tool === PT.TOOLS.LATRINE) {
        if (row < 1) return { ok: false, reason: 'Place Latrine deeper than surface row.' };
        if (existing === PT.CELL.LATRINE) return { ok: false, reason: 'Already a Latrine.' };
        const tunnelNote = autoPath && autoPath.length > 1 ? ` + ${autoPath.length - 1} tunnel` : '';
        return { ok: true, autoPath, reason: `Dedicated Latrine room (keeps Hygiene % high${tunnelNote}).` };
      }

      if (tool === PT.TOOLS.GRANARY) {
        if (row < 1) return { ok: false, reason: 'Place Granary underground (depth >= 1.0m) to stay dry.' };
        if (existing === PT.CELL.GRANARY) return { ok: false, reason: 'Already a Granary.' };
        const tunnelNote = autoPath && autoPath.length > 1 ? ` + ${autoPath.length - 1} tunnel` : '';
        return { ok: true, autoPath, reason: `Dry Granary vault (+45 Food capacity${tunnelNote}).` };
      }

      return { ok: false, reason: '' };
    }

    _hasQueuedDigAt(r, c) {
      return this.tasks.some((t) => t.kind === 'dig' && t.row === r && t.col === c);
    }

    _hasAdjacentOpen(r, c) {
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of dirs) {
        const nr = r + dr;
        const nc = c + dc;
        if (this.inBounds(nr, nc) && this.isUnlocked(nc) && this.isOpenCell(nr, nc)) {
          return true;
        }
      }
      return false;
    }

    _hasAdjacentOpenOrQueued(r, c) {
      if (this._hasAdjacentOpen(r, c)) return true;
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of dirs) {
        const nr = r + dr;
        const nc = c + dc;
        if (this.inBounds(nr, nc) && this.isUnlocked(nc) && this._hasQueuedDigAt(nr, nc)) {
          return true;
        }
      }
      return false;
    }

    // BFS from target (row, col) to nearest already-open OR queued tunnel cell within maxSteps
    _findTunnelConnectPath(targetRow, targetCol, maxSteps = 10) {
      const key = (r, c) => `${r},${c}`;
      const queue = [[targetRow, targetCol, 0]];
      const parent = new Map();
      parent.set(key(targetRow, targetCol), null);

      while (queue.length > 0) {
        const [r, c, dist] = queue.shift();
        if (dist > 0 && (this.isOpenCell(r, c) || this._hasQueuedDigAt(r, c))) {
          // Reconstruct cells from nearest open neighbor back toward targetRow/targetCol
          const cells = [];
          let cur = parent.get(key(r, c)); // skip already-open cell
          while (cur) {
            const [pr, pc] = cur.split(',').map(Number);
            cells.push({ row: pr, col: pc });
            cur = parent.get(cur);
          }
          return cells;
        }
        if (dist >= maxSteps) continue;
        // Prefer horizontal then vertical expansion
        for (const [dr, dc] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          const nr = r + dr;
          const nc = c + dc;
          const nk = key(nr, nc);
          if (this.inBounds(nr, nc) && this.isUnlocked(nc) && !parent.has(nk)) {
            parent.set(nk, key(r, c));
            queue.push([nr, nc, dist + 1]);
          }
        }
      }
      return null;
    }

    getReachableNeighborNear(row, col) {
      for (const nb of this.neighbors) {
        if (nb.merged) continue;
        if (Math.abs(col - nb.borderCol) <= 3 && row >= 0) {
          // Check if player dug right adjacent to borderCol
          for (let r = 0; r < this.rows; r++) {
            const checkCol = nb.side === 'east' ? nb.borderCol - 1 : nb.borderCol + 1;
            if (this.isOpenCell(r, checkCol) || this.isOpenCell(r, nb.borderCol)) {
              return nb;
            }
          }
        }
      }
      return null;
    }

    getAvailableNeighbors() {
      return this.neighbors.filter((nb) => {
        if (nb.merged) return false;
        const checkCol = nb.side === 'east' ? nb.borderCol - 1 : nb.borderCol + 1;
        for (let r = 0; r < this.rows; r++) {
          if (this.isOpenCell(r, checkCol) || this.isOpenCell(r, nb.borderCol)) return true;
        }
        return false;
      });
    }

    queueTask(tool, row, col, resources, opts = {}) {
      const check = this.validatePlacement(tool, row, col, opts);
      if (!check.ok) return { ok: false, reason: check.reason };

      if (tool === PT.TOOLS.TRIM) {
        this.grass[col].trimMarked = true;
        return { ok: true, instant: true };
      }

      const maxTasks = opts.maxTasks ?? 999;
      if (this.tasks.length >= maxTasks) {
        return {
          ok: false,
          reason: `Work Queue full (${this.tasks.length}/${maxTasks} blocks)! Upgrade Expanded Blueprints in ⭐ Skills.`
        };
      }

      if (tool === PT.TOOLS.CRATER || tool === PT.TOOLS.DOME) {
        const spec = PT.CHAMBER_SPECS[tool];
        if (resources.dirt < spec.costDirt) {
          return { ok: false, reason: `Need ${spec.costDirt} Packed Dirt (dig tunnels to collect dirt!).` };
        }
        // Prevent duplicate task at col
        const existingTask = this.tasks.find((t) => t.kind === 'mound' && t.col === col);
        if (existingTask) return { ok: false, reason: 'Mound construction already queued here.' };

        resources.dirt -= spec.costDirt;
        this.tasks.push({
          id: this.nextTaskId++,
          kind: 'mound',
          row: 0,
          col,
          moundType: tool === PT.TOOLS.CRATER ? PT.MOUND.CRATER : PT.MOUND.DOME,
          workDone: 0,
          workTotal: spec.workRequired,
          dirtGain: 0
        });
        return { ok: true };
      }

      const spec = PT.CHAMBER_SPECS[tool];
      if (!spec) return { ok: false, reason: 'Unknown tool.' };

      if (resources.dirt < spec.costDirt) {
        return { ok: false, reason: `Need ${spec.costDirt} Packed Dirt.` };
      }
      if (resources.food < spec.costFood) {
        return { ok: false, reason: `Need ${spec.costFood} Food (dry grass & seeds) to line Nursery.` };
      }

      const cellsToQueue = check.autoPath && check.autoPath.length > 0
        ? check.autoPath
        : (check.brushCells && check.brushCells.length > 0 ? check.brushCells : null);

      if (cellsToQueue) {
        const remainingCap = Math.max(0, maxTasks - this.tasks.length);
        const filtered = cellsToQueue.filter((cell) => {
          const isTarget = cell.row === row && cell.col === col && tool !== PT.TOOLS.TUNNEL;
          if (!isTarget && this.grid[cell.row][cell.col] !== PT.CELL.SOLID) return false;
          return !this.tasks.some((t) => t.kind === 'dig' && t.row === cell.row && t.col === cell.col);
        });
        if (filtered.length > remainingCap) {
          return {
            ok: false,
            reason: `Need ${filtered.length} open work slots (${this.tasks.length}/${maxTasks} used). Upgrade ⭐ Skills or finish digs!`
          };
        }
        resources.dirt -= spec.costDirt;
        resources.food -= spec.costFood;
        const tunnelSpec = PT.CHAMBER_SPECS[PT.TOOLS.TUNNEL];
        let added = 0;
        for (const cell of filtered) {
          const isTarget = cell.row === row && cell.col === col && tool !== PT.TOOLS.TUNNEL;
          const cellSpec = isTarget ? spec : tunnelSpec;
          const mod = this.cellMod[cell.row]?.[cell.col] || PT.CELL_MOD.NONE;
          const workReq = mod === PT.CELL_MOD.ROCK ? cellSpec.workRequired * 2.1 : cellSpec.workRequired;
          this.tasks.push({
            id: this.nextTaskId++,
            kind: 'dig',
            row: cell.row,
            col: cell.col,
            cellType: isTarget ? spec.cellType : (cell.row === 0 ? PT.CELL.SHAFT : PT.CELL.TUNNEL),
            workDone: 0,
            workTotal: workReq,
            dirtGain: cellSpec.dirtGain,
            costDirt: isTarget ? spec.costDirt : 0,
            costFood: isTarget ? spec.costFood : 0
          });
          added++;
        }
        return added > 0 ? { ok: true, count: added } : { ok: false, reason: 'Excavation already queued here.' };
      }

      const dup = this.tasks.find((t) => t.kind === 'dig' && t.row === row && t.col === col);
      if (dup) return { ok: false, reason: 'Excavation already queued here (right-click to cancel).' };

      resources.dirt -= spec.costDirt;
      resources.food -= spec.costFood;

      const mod = this.cellMod[row]?.[col] || PT.CELL_MOD.NONE;
      const workReq = mod === PT.CELL_MOD.ROCK ? spec.workRequired * 2.1 : spec.workRequired;
      this.tasks.push({
        id: this.nextTaskId++,
        kind: 'dig',
        row,
        col,
        cellType: row === 0 && tool === PT.TOOLS.TUNNEL ? PT.CELL.SHAFT : spec.cellType,
        workDone: 0,
        workTotal: workReq,
        dirtGain: this.grid[row][col] === PT.CELL.SOLID ? spec.dirtGain : 1,
        costDirt: spec.costDirt,
        costFood: spec.costFood
      });
      return { ok: true };
    }

    _refundTaskResources(task, resources) {
      if (!resources) return;
      const spec = task.kind === 'mound'
        ? PT.CHAMBER_SPECS[task.moundType]
        : null;
      resources.dirt += task.costDirt ?? (spec ? spec.costDirt : 0);
      resources.food += task.costFood ?? (spec ? spec.costFood : 0);
    }

    // BFS over (already open cells) U (queued dig tasks) to drop any unreachable orphaned tasks after cancel/load
    pruneOrphanedTasks(resources) {
      if (this.tasks.length === 0) return 0;
      const key = (r, c) => `${r},${c}`;
      const reachable = new Set();
      const queue = [];

      for (let r = 0; r < this.rows; r++) {
        for (let c = this.unlockedMinCol; c <= this.unlockedMaxCol; c++) {
          if (this.isOpenCell(r, c)) {
            const k = key(r, c);
            reachable.add(k);
            queue.push([r, c]);
          }
        }
      }

      const queuedDigSet = new Set();
      for (const t of this.tasks) {
        if (t.kind === 'dig') queuedDigSet.add(key(t.row, t.col));
      }

      while (queue.length > 0) {
        const [r, c] = queue.shift();
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nr = r + dr;
          const nc = c + dc;
          const nk = key(nr, nc);
          if (!reachable.has(nk) && this.inBounds(nr, nc) && this.isUnlocked(nc) && queuedDigSet.has(nk)) {
            reachable.add(nk);
            queue.push([nr, nc]);
          }
        }
      }

      let removed = 0;
      for (let i = this.tasks.length - 1; i >= 0; i--) {
        const t = this.tasks[i];
        const ok = t.kind === 'mound'
          ? (reachable.has(key(0, t.col)) || reachable.has(key(1, t.col)))
          : reachable.has(key(t.row, t.col));
        if (!ok) {
          this.tasks.splice(i, 1);
          this._refundTaskResources(t, resources);
          removed++;
        }
      }
      return removed;
    }

    cancelTaskAt(row, col, resources) {
      const idx = this.tasks.findIndex((t) =>
        (t.kind === 'mound' && t.col === col && row <= 0) ||
        (t.kind === 'dig' && t.row === row && t.col === col)
      );
      if (idx === -1) return false;
      const [task] = this.tasks.splice(idx, 1);
      this._refundTaskResources(task, resources);
      this.pruneOrphanedTasks(resources);
      return true;
    }

    sanitizeEntityPosition(row, col, allowSurface = true) {
      const c = Math.max(this.unlockedMinCol, Math.min(this.unlockedMaxCol, Math.round(col)));
      if (row < -0.45 && allowSurface) {
        return { row: -1, col: c };
      }
      const r = Math.max(0, Math.min(this.rows - 1, Math.round(row)));
      if (this.isOpenCell(r, c)) {
        return { row: r, col: c };
      }
      if (row < 0.25 && allowSurface) {
        return { row: -1, col: c };
      }
      return this.findNearestSafeCell(r, c, false);
    }

    completeTask(task, resources) {
      let bonusMod = PT.CELL_MOD.NONE;
      let bonusFood = 0;
      let bonusDirt = 0;
      if (task.kind === 'mound') {
        if (this.grid[0][task.col] === PT.CELL.SOLID) {
          this.grid[0][task.col] = PT.CELL.SHAFT;
        }
        this.mounds[task.col].type = task.moundType;
        this.grass[task.col].height = 0.16;
      } else if (task.kind === 'dig') {
        this.grid[task.row][task.col] = task.cellType;
        if (task.row === 0 && this.mounds[task.col].type === PT.MOUND.NONE) {
          this.mounds[task.col].type = PT.MOUND.RAW;
          this.grass[task.col].height = 0.2;
        }
        const mod = this.cellMod[task.row]?.[task.col] || PT.CELL_MOD.NONE;
        if (mod === PT.CELL_MOD.CLAY) {
          bonusDirt = 12;
          bonusMod = mod;
        } else if (mod === PT.CELL_MOD.ROOT) {
          bonusFood = 14;
          bonusMod = mod;
        } else if (mod === PT.CELL_MOD.ROCK) {
          bonusDirt = 8;
          bonusMod = mod;
        } else if (mod === PT.CELL_MOD.AQUIFER) {
          bonusDirt = 6;
          bonusMod = mod;
        }
        if (this.cellMod[task.row]) {
          this.cellMod[task.row][task.col] = mod === PT.CELL_MOD.AQUIFER ? PT.CELL_MOD.SPRING : PT.CELL_MOD.NONE;
        }
        resources.dirt += task.dirtGain + bonusDirt;
        resources.food += bonusFood;
      }
      this.tasks = this.tasks.filter((t) => t.id !== task.id);
      return { bonusMod, bonusDirt, bonusFood };
    }

    // Coyote ambush damage on shallow (< 1.5m) unreinforced cells when alarm is missed/wrong
    applyCoyoteShallowDamage(aroundCol) {
      let collapsed = 0;
      for (let dc = -3; dc <= 3 && collapsed < 1; dc++) {
        const c = aroundCol + dc;
        if (!this.isUnlocked(c)) continue;
        // Rows 1 and 2 are above the 1.5m Coyote Dig Limit! Never destroy row 0's sole exit shaft or row >= 3.
        for (let r = 1; r <= 2; r++) {
          const cell = this.grid[r][c];
          if (cell === PT.CELL.SOLID || cell === PT.CELL.SHAFT) continue;
          // Ensure removing (r, c) doesn't cut off an entrance shaft cleanly
          if (c === aroundCol && this.isEntrance(c)) continue;
          this.grid[r][c] = PT.CELL.SOLID;
          this.water[r][c] = 0;
          collapsed++;
          break;
        }
      }
      return collapsed;
    }

    mergeNeighbor(nb) {
      if (nb.merged) return false;
      nb.merged = true;
      // Carve connecting tunnel seamlessly from whichever depth the player reached borderCol -> row 2 -> nb.moundCol!
      const step = nb.side === 'east' ? 1 : -1;
      const touchCol = nb.borderCol - step;
      for (let r = 0; r < this.rows; r++) {
        if (this.isOpenCell(r, touchCol) && r !== 2) {
          const rDir = r < 2 ? 1 : -1;
          for (let cr = r; cr !== 2 + rDir; cr += rDir) {
            if (this.grid[cr][touchCol] === PT.CELL.SOLID) this.grid[cr][touchCol] = PT.CELL.TUNNEL;
          }
          break;
        }
      }
      for (let c = nb.borderCol; c !== nb.moundCol + step; c += step) {
        if (this.inBounds(2, c) && this.grid[2][c] === PT.CELL.SOLID) {
          this.grid[2][c] = PT.CELL.TUNNEL;
        }
      }
      if (nb.side === 'east') {
        this.unlockedMaxCol = Math.max(this.unlockedMaxCol, nb.unlockToCol);
      } else {
        this.unlockedMinCol = Math.min(this.unlockedMinCol, nb.unlockFromCol);
      }
      return true;
    }

    // Recomputes chamber counts, Bernoulli airflow physics, and sentry sightlines
    recomputeStats(windSpeed, popCount) {
      // Clear airflow vectors
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.totalCols; c++) {
          this.airflowCell[r][c].vx = 0;
          this.airflowCell[r][c].vy = 0;
          this.airflowCell[r][c].strength = 0;
          this.airflowCell[r][c].bernoulli = false;
        }
      }

      const counts = { listening: 0, nursery: 0, latrine: 0, granary: 0 };
      const moundCounts = { raw: 0, crater: 0, dome: 0 };
      let openCells = 0;
      let springCount = 0;

      for (let c = this.unlockedMinCol; c <= this.unlockedMaxCol; c++) {
        const mt = this.mounds[c].type;
        if (mt === PT.MOUND.RAW) moundCounts.raw++;
        else if (mt === PT.MOUND.CRATER) moundCounts.crater++;
        else if (mt === PT.MOUND.DOME) moundCounts.dome++;

        for (let r = 0; r < this.rows; r++) {
          const cell = this.grid[r][c];
          if (cell !== PT.CELL.SOLID) {
            openCells++;
            if (this.cellMod?.[r]?.[c] === PT.CELL_MOD.SPRING) springCount++;
          }
          if (cell === PT.CELL.LISTENING) counts.listening++;
          else if (cell === PT.CELL.NURSERY) counts.nursery++;
          else if (cell === PT.CELL.LATRINE) counts.latrine++;
          else if (cell === PT.CELL.GRANARY) counts.granary++;
        }
      }

      this.chamberCounts = counts;
      this.moundCounts = moundCounts;
      this.springCount = springCount;

      // Connected components over excavated cells to solve Bernoulli pairs
      const visited = Array.from({ length: this.rows }, () => new Array(this.totalCols).fill(false));
      let anyBernoulli = false;
      const pairs = [];
      let totalAirScore = 0;
      let weightedCells = 0;

      for (let c = this.unlockedMinCol; c <= this.unlockedMaxCol; c++) {
        for (let r = 0; r < this.rows; r++) {
          if (this.grid[r][c] === PT.CELL.SOLID || visited[r][c]) continue;

          // BFS component
          const compCells = [];
          const entrances = [];
          const queue = [[r, c]];
          visited[r][c] = true;

          while (queue.length > 0) {
            const [cr, cc] = queue.shift();
            compCells.push([cr, cc]);
            if (cr === 0 && this.mounds[cc].type !== PT.MOUND.NONE) {
              entrances.push({ col: cc, type: this.mounds[cc].type });
            }
            const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            for (const [dr, dc] of dirs) {
              const nr = cr + dr;
              const nc = cc + dc;
              if (this.inBounds(nr, nc) && this.isUnlocked(nc) && !visited[nr][nc] && this.grid[nr][nc] !== PT.CELL.SOLID) {
                visited[nr][nc] = true;
                queue.push([nr, nc]);
              }
            }
          }

          const craters = entrances.filter((e) => e.type === PT.MOUND.CRATER);
          const domes = entrances.filter((e) => e.type === PT.MOUND.DOME);
          const raws = entrances.filter((e) => e.type === PT.MOUND.RAW);

          let compAir = 24;
          if (craters.length > 0 && domes.length > 0) {
            // TRUE BERNOULLI VENTILATION!
            anyBernoulli = true;
            const effWind = Math.max(0.35, windSpeed);
            compAir = Math.min(100, 78 + effWind * 20);
            const crater = craters[0];
            const dome = domes[0];
            const pathCells = this._traceCellPath(0, dome.col, 0, crater.col);
            pairs.push({
              domeCol: dome.col,
              craterCol: crater.col,
              pathCells,
              strength: Math.min(1, 0.55 + effWind * 0.38)
            });

            // Populate airflow field along path & component
            for (let i = 0; i < pathCells.length; i++) {
              const [pr, pc] = pathCells[i];
              const next = pathCells[Math.min(pathCells.length - 1, i + 1)];
              const prev = pathCells[Math.max(0, i - 1)];
              const vx = Math.sign(next[1] - prev[1]);
              const vy = Math.sign(next[0] - prev[0]);
              this.airflowCell[pr][pc] = {
                vx,
                vy,
                strength: 0.75 + effWind * 0.25,
                bernoulli: true
              };
            }
            // Gently ventilate side chambers too
            for (const [cr, cc] of compCells) {
              if (!this.airflowCell[cr][cc].bernoulli) {
                this.airflowCell[cr][cc].strength = 0.45;
                this.airflowCell[cr][cc].bernoulli = true;
              }
            }
          } else if (craters.length > 0 && raws.length > 0) {
            // Partial stack effect (Crater + Raw hole gives modest lift)
            compAir = Math.min(76, 56 + windSpeed * 12);
            for (const [cr, cc] of compCells) {
              this.airflowCell[cr][cc].strength = 0.25;
            }
          } else if (entrances.length >= 2) {
            // Equal-height openings give weak cross-draft
            compAir = 48 + Math.min(12, windSpeed * 6);
          } else if (entrances.length === 1) {
            // Single-entrance dead-end: stale air worsens with depth & population
            const penalty = Math.min(20, popCount * 1.6 + compCells.length * 0.3);
            compAir = Math.max(22, 48 - penalty);
          }

          totalAirScore += compAir * compCells.length;
          weightedCells += compCells.length;
        }
      }

      this.bernoulliActive = anyBernoulli;
      this.bernoulliPairs = pairs;
      this.airflowPct = weightedCells > 0 ? Math.round(totalAirScore / weightedCells) : 45;

      // Sightline calculations & near-entrance Tall Grass Risk for every open entrance
      this.sightlineZones = [];
      let nearCols = 0;
      let overgrownCols = 0;
      const openEntrances = [];

      for (let c = this.unlockedMinCol; c <= this.unlockedMaxCol; c++) {
        if (!this.isEntrance(c)) continue;
        openEntrances.push(c);
        const moundBonus = this.mounds[c].type === PT.MOUND.CRATER ? 2 : (this.mounds[c].type === PT.MOUND.DOME ? 1 : 0);
        let left = c;
        for (let step = 1; step <= 18 + moundBonus; step++) {
          const nc = c - step;
          if (nc < 0) break;
          left = nc;
          if (this.grass[nc].height > 0.48 && step >= 3) break;
        }
        let right = c;
        for (let step = 1; step <= 18 + moundBonus; step++) {
          const nc = c + step;
          if (nc >= this.totalCols) break;
          right = nc;
          if (this.grass[nc].height > 0.48 && step >= 3) break;
        }
        this.sightlineZones.push({
          col: c,
          leftCol: left,
          rightCol: right,
          moundType: this.mounds[c].type
        });

        for (let dc = -7; dc <= 7; dc++) {
          const nc = c + dc;
          if (nc >= this.unlockedMinCol && nc <= this.unlockedMaxCol && !this.isEntrance(nc)) {
            nearCols++;
            if (this.grass[nc].height > 0.48) overgrownCols++;
          }
        }
      }

      this.tallGrassRisk = nearCols > 0 ? Math.round((overgrownCols / nearCols) * 100) : 0;
      this.sightlineClear = openEntrances.length > 0 && this.tallGrassRisk <= 25;

      // Burrowing Owl Ally settles beside 2nd mound once sightlines & airflow are healthy!
      if (openEntrances.length >= 2 && this.tallGrassRisk <= 38 && this.airflowPct >= 65) {
        if (this.owlCol === null || !this.isEntrance(this.owlCol)) {
          this.owlCol = openEntrances[1];
        }
      } else {
        this.owlCol = null;
      }
    }

    _traceCellPath(sr, sc, gr, gc) {
      const key = (r, c) => `${r},${c}`;
      const queue = [[sr, sc]];
      const parent = new Map();
      parent.set(key(sr, sc), null);

      while (queue.length > 0) {
        const [r, c] = queue.shift();
        if (r === gr && c === gc) {
          const out = [];
          let cur = key(gr, gc);
          while (cur) {
            const [pr, pc] = cur.split(',').map(Number);
            out.push([pr, pc]);
            cur = parent.get(cur);
          }
          return out.reverse();
        }
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nr = r + dr;
          const nc = c + dc;
          const nk = key(nr, nc);
          if (this.inBounds(nr, nc) && this.isUnlocked(nc) && this.grid[nr][nc] !== PT.CELL.SOLID && !parent.has(nk)) {
            parent.set(nk, key(r, c));
            queue.push([nr, nc]);
          }
        }
      }
      return [[sr, sc]];
    }

    // Unified pathfinder across underground cells AND surface row -1
    findPath(sr, sc, gr, gc, allowSurface = true) {
      if (sr === gr && sc === gc) return [];
      const key = (r, c) => `${r},${c}`;
      const queue = [[sr, sc]];
      const parent = new Map();
      parent.set(key(sr, sc), null);

      const isWalkable = (r, c) => {
        if (c < this.unlockedMinCol || c > this.unlockedMaxCol) return false;
        if (r === -1) return allowSurface;
        return this.inBounds(r, c) && this.grid[r][c] !== PT.CELL.SOLID;
      };

      let limit = 0;
      while (queue.length > 0 && limit++ < 4500) {
        const [r, c] = queue.shift();
        if (r === gr && c === gc) {
          const path = [];
          let cur = key(gr, gc);
          while (cur) {
            const [pr, pc] = cur.split(',').map(Number);
            path.push({ row: pr, col: pc });
            cur = parent.get(cur);
          }
          path.reverse();
          path.shift(); // drop start
          return path;
        }

        const neighbors = [];
        if (r === -1) {
          neighbors.push([-1, c - 1], [-1, c + 1]);
          if (this.isEntrance(c)) neighbors.push([0, c]);
        } else {
          neighbors.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
          if (r === 0 && allowSurface && this.isEntrance(c)) {
            neighbors.push([-1, c]);
          }
        }

        for (const [nr, nc] of neighbors) {
          const nk = key(nr, nc);
          if (!parent.has(nk) && isWalkable(nr, nc)) {
            parent.set(nk, key(r, c));
            queue.push([nr, nc]);
          }
        }
      }
      return null;
    }

    findNearestSafeCell(sr, sc, preferDeep = false) {
      let best = null;
      let bestScore = Infinity;
      for (let r = preferDeep ? 2 : 1; r < this.rows; r++) {
        for (let c = this.unlockedMinCol; c <= this.unlockedMaxCol; c++) {
          if (this.grid[r][c] === PT.CELL.SOLID) continue;
          const dist = Math.abs(r - sr) * 1.4 + Math.abs(c - sc);
          const bonus = this.grid[r][c] === PT.CELL.LISTENING ? -2.2 : (this.grid[r][c] === PT.CELL.NURSERY ? -1.5 : 0);
          if (dist + bonus < bestScore) {
            bestScore = dist + bonus;
            best = { row: r, col: c };
          }
        }
      }
      return best || { row: 2, col: PT.STARTER_COL || 90 };
    }

    findNearestListeningOrEntrance(col) {
      let best = null;
      let bestDist = Infinity;
      for (let c = this.unlockedMinCol; c <= this.unlockedMaxCol; c++) {
        if (!this.isEntrance(c)) continue;
        const d = Math.abs(c - col);
        if (d < bestDist) {
          bestDist = d;
          best = { row: 0, col: c };
        }
      }
      return best;
    }

    getEntrances() {
      const list = [];
      for (let c = this.unlockedMinCol; c <= this.unlockedMaxCol; c++) {
        if (this.isEntrance(c)) list.push(c);
      }
      return list;
    }

    getChambersOfType(cellType) {
      const list = [];
      for (let r = 0; r < this.rows; r++) {
        for (let c = this.unlockedMinCol; c <= this.unlockedMaxCol; c++) {
          if (this.grid[r][c] === cellType) list.push({ row: r, col: c });
        }
      }
      return list;
    }

    // Updates grass growth and storm flooding
    stepEnvironment(dt, weather, windSpeed) {
      const isStorm = weather.id === 'STORM';

      // Grass regrowth (slower when dry, lush after/during rain)
      const growthRate = (isStorm ? 0.0085 : 0.0032) * dt;
      for (let c = 0; c < this.totalCols; c++) {
        const g = this.grass[c];
        if (!this.isEntrance(c) && g.height < 1.05) {
          g.height = Math.min(1.05, g.height + growthRate);
        }
        if (g.seedAmount < 1.0) {
          g.seedAmount = Math.min(1.0, g.seedAmount + dt * 0.015);
        }
      }

      // Storm flood seepage into unshielded RAW holes
      if (isStorm) {
        for (let c = this.unlockedMinCol; c <= this.unlockedMaxCol; c++) {
          if (!this.isEntrance(c)) continue;
          const m = this.mounds[c].type;
          if (m === PT.MOUND.RAW) {
            // Raw unprotected holes let rainwater pour down the shaft!
            for (let r = 0; r <= 3; r++) {
              if (this.grid[r][c] !== PT.CELL.SOLID) {
                this.water[r][c] = Math.min(0.9, this.water[r][c] + dt * 0.09);
              }
            }
          } else if (m === PT.MOUND.DOME) {
            // Low Dome gets tiny dampness at lip during severe storms
            this.water[0][c] = Math.min(0.22, this.water[0][c] + dt * 0.02);
          }
          // Crater Mound is 100% flood-proof!
        }
      }

      // Natural evaporation & drainage (faster with Bernoulli airflow & tapped Aquifer springs!)
      const drainRate = ((this.bernoulliActive ? 0.075 : 0.03) + Math.min(0.05, this.springCount * 0.015)) * dt;
      for (let r = 0; r < this.rows; r++) {
        for (let c = this.unlockedMinCol; c <= this.unlockedMaxCol; c++) {
          if (this.water[r][c] > 0) {
            this.water[r][c] = Math.max(0, this.water[r][c] - drainRate);
          }
        }
      }

      // Golden Seed Blooms countdown & periodic spawning on sunny/trimmed grass
      for (let i = this.blooms.length - 1; i >= 0; i--) {
        this.blooms[i].ttl -= dt;
        if (this.blooms[i].ttl <= 0) this.blooms.splice(i, 1);
      }
      if (!isStorm && this.blooms.length < 3 && Math.random() < dt * 0.055) {
        const c = this.unlockedMinCol + 2 + Math.floor(Math.random() * (this.unlockedMaxCol - this.unlockedMinCol - 4));
        if (!this.isEntrance(c) && !this.blooms.some((b) => Math.abs(b.col - c) <= 3)) {
          this.blooms.push({
            id: this.nextBloomId++,
            col: c,
            food: 7 + Math.floor(Math.random() * 5),
            ttl: 45
          });
        }
      }
    }

    hasActiveFlooding() {
      for (let r = 0; r < this.rows; r++) {
        for (let c = this.unlockedMinCol; c <= this.unlockedMaxCol; c++) {
          if (this.water[r][c] > 0.25) return true;
        }
      }
      return false;
    }

    serialize() {
      return {
        worldStyle: this.worldStyle,
        worldSeed: this.worldSeed,
        unlockedMinCol: this.unlockedMinCol,
        unlockedMaxCol: this.unlockedMaxCol,
        grid: this.grid,
        cellMod: this.cellMod,
        water: this.water,
        mounds: this.mounds,
        grass: this.grass.map((g) => ({
          h: Number(g.height.toFixed(3)),
          tm: g.trimMarked,
          fl: g.flower,
          sa: Number(g.seedAmount.toFixed(2))
        })),
        blooms: this.blooms,
        tasks: this.tasks,
        nextTaskId: this.nextTaskId,
        neighbors: this.neighbors
      };
    }

    deserialize(data) {
      if (!data || !Array.isArray(data.grid) || data.grid.length !== this.rows || !Array.isArray(data.grid[0]) || data.grid[0].length !== this.totalCols) {
        return false;
      }
      this.worldStyle = PT.WORLD_STYLES[data.worldStyle] ? data.worldStyle : this.worldStyle;
      this.worldSeed = data.worldSeed ?? this.worldSeed;
      this.unlockedMinCol = data.unlockedMinCol ?? 72;
      this.unlockedMaxCol = data.unlockedMaxCol ?? 107;
      this.grid = data.grid;
      if (Array.isArray(data.cellMod) && data.cellMod.length === this.rows) {
        this.cellMod = data.cellMod;
      }
      this.water = data.water || this.water;
      this.mounds = data.mounds || this.mounds;
      if (Array.isArray(data.grass)) {
        this.grass = data.grass.map((g) => ({
          height: g.h ?? 0.6,
          trimMarked: !!g.tm,
          flower: !!g.fl,
          seedAmount: g.sa ?? 0.8
        }));
      }
      this.blooms = Array.isArray(data.blooms) ? data.blooms : this.blooms;
      this.tasks = Array.isArray(data.tasks) ? data.tasks.filter((t) =>
        t && typeof t.col === 'number' && typeof t.row === 'number' &&
        (t.kind === 'mound' ? this.mounds[t.col]?.type !== t.moundType : this.inBounds(t.row, t.col) && this.grid[t.row][t.col] !== t.cellType)
      ) : [];
      this.nextTaskId = data.nextTaskId || 1;
      this.neighbors = Array.isArray(data.neighbors) ? data.neighbors : this.neighbors;
      this.pruneOrphanedTasks(null);
      return true;
    }
  }

  PT.World = World;
})(window);
