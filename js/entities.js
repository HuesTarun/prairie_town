/**
 * PRAIRIE TOWN: Coterie & Burrow
 * Entities: PrairieDog (role FSM, animations, tooth-touch), Predator (Hawk, Coyote, Human),
 * and ParticleSystem (dirt clods, grass clippings, dandelion seeds, soundwaves, airflow wisps, rain).
 */
(function (root) {
  'use strict';

  const PT = (root.PT = root.PT || {});

  // ==================== PARTICLE SYSTEM ====================
  class ParticleSystem {
    constructor() {
      this.particles = [];
      this.soundwaves = [];
      this.airflowWisps = [];
      this.dandelions = [];
      this.raindrops = [];
      this.maxScale = 1.0;

      // Seed initial floating dandelion fluff across active starter meadow
      const dStart = (PT.STARTER_COL || 90) - 20;
      for (let i = 0; i < 18; i++) {
        this.dandelions.push({
          xCol: dStart + Math.random() * 44,
          yMeters: -0.4 - Math.random() * 4.2,
          phase: Math.random() * Math.PI * 2,
          size: 0.7 + Math.random() * 0.7
        });
      }
    }

    setDensity(mode) {
      this.maxScale = mode === 'low' ? 0.35 : 1.0;
    }

    spawnDirt(col, row, count = 6, vxBias = 0) {
      const n = Math.max(1, Math.round(count * this.maxScale));
      for (let i = 0; i < n; i++) {
        this.particles.push({
          kind: 'dirt',
          col: col + (Math.random() - 0.5) * 0.35,
          row: row + (Math.random() - 0.5) * 0.25,
          vx: vxBias + (Math.random() - 0.5) * 3.2,
          vy: -1.4 - Math.random() * 2.4,
          size: 2.2 + Math.random() * 3.2,
          life: 0.55 + Math.random() * 0.4,
          maxLife: 0.95,
          color: Math.random() < 0.5 ? '#8e5733' : '#b47445'
        });
      }
    }

    spawnGrassClip(col, count = 5) {
      const n = Math.max(1, Math.round(count * this.maxScale));
      for (let i = 0; i < n; i++) {
        this.particles.push({
          kind: 'grass',
          col: col + (Math.random() - 0.5) * 0.4,
          row: -1.15 - Math.random() * 0.2,
          vx: (Math.random() - 0.5) * 2.5,
          vy: -1.6 - Math.random() * 1.8,
          size: 3 + Math.random() * 2.5,
          rot: Math.random() * Math.PI,
          vrot: (Math.random() - 0.5) * 9,
          life: 0.65 + Math.random() * 0.35,
          maxLife: 1.0,
          color: Math.random() < 0.6 ? '#7da642' : '#c4aa4e'
        });
      }
    }

    spawnHearts(col, row, count = 5) {
      const n = Math.max(2, Math.round(count * this.maxScale));
      for (let i = 0; i < n; i++) {
        this.particles.push({
          kind: 'heart',
          col: col + (Math.random() - 0.5) * 0.6,
          row: row - 0.2,
          vx: (Math.random() - 0.5) * 0.8,
          vy: -1.1 - Math.random() * 0.9,
          size: 7 + Math.random() * 4,
          life: 1.2 + Math.random() * 0.4,
          maxLife: 1.6,
          color: i % 2 === 0 ? '#e86f7c' : '#f2b849'
        });
      }
    }

    spawnSoundwave(col, row, callId, radiusMult = 1) {
      const call = PT.ALARM_CALLS.find((c) => c.id === callId) || PT.ALARM_CALLS[0];
      const rings = callId === 'coyote_bark' ? 3 : 2;
      for (let i = 0; i < rings; i++) {
        this.soundwaves.push({
          col,
          row,
          delay: i * 0.14,
          radius: 0.2,
          maxRadius: (5.5 + i * 1.4) * radiusMult,
          life: 1.15,
          maxLife: 1.15,
          color: call.color,
          shape: call.waveShape
        });
      }
    }

    update(dt, world, windSpeed, weather) {
      // Update burst particles
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          this.particles.splice(i, 1);
          continue;
        }
        p.col += p.vx * dt;
        p.row += p.vy * dt;
        if (p.kind === 'dirt' || p.kind === 'grass') {
          p.vy += 6.8 * dt; // gravity
        }
        if (p.rot !== undefined) p.rot += p.vrot * dt;
      }

      // Update soundwaves
      for (let i = this.soundwaves.length - 1; i >= 0; i--) {
        const s = this.soundwaves[i];
        if (s.delay > 0) {
          s.delay -= dt;
          continue;
        }
        s.life -= dt;
        if (s.life <= 0) {
          this.soundwaves.splice(i, 1);
          continue;
        }
        const prog = 1 - s.life / s.maxLife;
        s.radius = 0.25 + prog * s.maxRadius;
      }

      // Floating dandelion seeds across the surface sky
      for (const d of this.dandelions) {
        d.phase += dt * 1.8;
        d.xCol += (0.55 + windSpeed * 1.35) * dt;
        d.yMeters += Math.sin(d.phase) * 0.24 * dt;
        if (d.xCol > world.unlockedMaxCol + 12) {
          d.xCol = world.unlockedMinCol - 8;
          d.yMeters = -0.35 - Math.random() * 4.0;
        }
      }

      // Storm rain streaks
      const rainTarget = weather.rain > 0 ? Math.round(55 * this.maxScale) : 0;
      while (this.raindrops.length < rainTarget) {
        this.raindrops.push({
          xCol: world.unlockedMinCol - 10 + Math.random() * (world.unlockedMaxCol - world.unlockedMinCol + 22),
          yMeters: -7 - Math.random() * 3,
          speed: 11 + Math.random() * 5
        });
      }
      for (let i = this.raindrops.length - 1; i >= 0; i--) {
        const r = this.raindrops[i];
        r.yMeters += r.speed * dt;
        r.xCol += windSpeed * 1.8 * dt;
        if (r.yMeters > 0) {
          if (rainTarget === 0) {
            this.raindrops.splice(i, 1);
          } else {
            r.yMeters = -7 - Math.random() * 2.5;
            r.xCol = world.unlockedMinCol - 10 + Math.random() * (world.unlockedMaxCol - world.unlockedMinCol + 22);
          }
        }
      }

      // Bernoulli Airflow Tracer Wisps
      const wispTarget = world.bernoulliActive ? Math.min(28, world.bernoulliPairs.length * 14) : 0;
      if (this.airflowWisps.length > wispTarget) {
        this.airflowWisps.length = wispTarget;
      }
      while (this.airflowWisps.length < wispTarget && world.bernoulliPairs.length > 0) {
        const pairIdx = Math.floor(Math.random() * world.bernoulliPairs.length);
        this.airflowWisps.push({
          pairIdx,
          progress: Math.random(),
          speed: 0.22 + Math.random() * 0.14
        });
      }
      for (const w of this.airflowWisps) {
        w.progress += w.speed * (0.65 + windSpeed * 0.6) * dt;
        if (w.progress >= 1) {
          w.progress -= 1;
          if (world.bernoulliPairs.length > 0) {
            w.pairIdx = (w.pairIdx + 1) % world.bernoulliPairs.length;
          }
        }
      }
    }
  }

  // ==================== PRAIRIE DOG ENTITY ====================
  class PrairieDog {
    constructor(opts = {}) {
      this.id = opts.id || 1;
      this.name = opts.name || 'Pip';
      this.isPup = !!opts.isPup;
      this.role = this.isPup ? PT.ROLES.PUP : (opts.role || PT.ROLES.IDLE);
      this.ageProgress = this.isPup ? (opts.ageProgress ?? 0.15) : 1;

      this.col = opts.col ?? (PT.STARTER_COL || 90);
      this.row = opts.row ?? 2;
      this.facing = opts.facing ?? 1;

      this.path = [];
      this.state = 'idle'; // idle, moving, sentry_watch, digging, foraging, trimming, cleaning, listening, diving, sheltered, tooth_touch
      this.actionLabel = 'Exploring burrow';

      this.hopPhase = Math.random() * Math.PI * 2;
      this.blinkTimer = 1.5 + Math.random() * 3.5;
      this.isBlinking = false;
      this.tailFlickTimer = 0;
      this.noseTimer = Math.random() * 2;

      this.workTimer = 0;
      this.listenTimer = 0;
      this.diveHoldTimer = 0;
      this.sprintBoostTimer = 0;
      this.toothTouchTimer = 0;
      this.shockTimer = 0;
      this.pauseCheckTimer = 0.2 + Math.random() * 0.6;

      this.carryingFood = 0;
      this.carryingGrass = false;
      this.targetTaskId = null;
      this.targetTrimCol = null;
      this.targetNeighborId = null;
      this.moundCol = null;
      this.lastSurfaceCheckCol = null;
      this.stuckTimer = 0;
      this._prevCol = this.col;
      this._prevRow = this.row;
    }

    setRole(newRole) {
      if (this.isPup) return;
      this.role = newRole;
      this.path = [];
      this.targetTaskId = null;
      this.targetTrimCol = null;
      this.targetNeighborId = null;
      this.moundCol = null;
      this.stuckTimer = 0;
      if (this.state !== 'diving' && this.state !== 'tooth_touch') {
        this.state = 'idle';
        this.pauseCheckTimer = 0;
      }
    }

    triggerDive(boosted = false) {
      if (this.isPup) return;
      if (boosted) this.sprintBoostTimer = 6.5;
      if (this.row >= 0.8) {
        // Already safely inside burrow — keep digging/working without stalling underground!
        return;
      }
      this.path = [];
      this.targetTaskId = null;
      this.targetNeighborId = null;
      if (this.row < 0.4) {
        this.state = 'diving';
        this.actionLabel = boosted ? 'Adrenaline Dive!' : 'Scrambling underground!';
      } else {
        this.state = 'sheltered';
        this.diveHoldTimer = 1.4;
        this.actionLabel = 'Sheltered underground';
      }
    }

    update(dt, ctx) {
      const { world, resources, particles, audio, predators, alarmActive, hygienePct, airflowPct, pacing } = ctx;

      // Facial micro-animations
      this.noseTimer += dt * 4.2;
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        if (!this.isBlinking) {
          this.isBlinking = true;
          this.blinkTimer = 0.12;
        } else {
          this.isBlinking = false;
          this.blinkTimer = 2.2 + Math.random() * 3.6;
        }
      }
      if (this.tailFlickTimer > 0) this.tailFlickTimer -= dt;
      if (this.sprintBoostTimer > 0) this.sprintBoostTimer -= dt;
      if (this.shockTimer > 0) this.shockTimer -= dt;

      // Pup growth toward adulthood (boosted by deep Nursery, slowed if Nursery flooded!)
      if (this.isPup) {
        const nurseryBonus = world.chamberCounts.nursery > 0 ? 1.55 : 0.85;
        const hygieneMult = 0.65 + (hygienePct / 100) * 0.55;
        const floodFactor = world.hasFloodedVitalRoom() ? 0.55 : 1.0;
        this.ageProgress += dt * 0.011 * nurseryBonus * hygieneMult * floodFactor;
        if (this.ageProgress >= 1) {
          this.isPup = false;
          this.role = PT.ROLES.IDLE;
          this.state = 'idle';
          particles.spawnHearts(this.col, this.row, 5);
          audio.playToothTouch();
          ctx.onPupMature(this);
        }
      }

      // Active Tooth-Touch animation state
      if (this.state === 'tooth_touch') {
        this.toothTouchTimer -= dt;
        this.tailFlickTimer = 0.25;
        if (this.toothTouchTimer <= 0) {
          this.state = 'idle';
          this.actionLabel = 'Kin bond warmed!';
          if (this.targetNeighborId) {
            ctx.completeNeighborMerge(this.targetNeighborId);
            this.targetNeighborId = null;
          }
        }
        return;
      }

      // Active Listening Chamber pause
      if (this.state === 'listening') {
        this.listenTimer -= dt;
        if (this.listenTimer <= 0) {
          // Check if predator is lurking dangerously close to surface entrance
          const dangerClose = predators.some((p) => p.type !== 'HAWK' && Math.abs(p.xCol - this.col) < 6);
          if (dangerClose || alarmActive) {
            this.path = [];
            this.state = 'sheltered';
            this.diveHoldTimer = 2.2;
            this.actionLabel = 'Heard footsteps! Staying inside';
            this.tailFlickTimer = 0.5;
          } else {
            // Resume path if exists, otherwise go idle so _chooseNextAction picks up
            this.state = this.path.length > 0 ? 'moving' : 'idle';
            this.actionLabel = 'All clear — emerging';
            this.pauseCheckTimer = 0;
          }
        }
        return;
      }

      // Guard against drifting outside unlocked bounds or getting wedged in SOLID earth
      if (this.path.length === 0 && (this.col < world.unlockedMinCol - 0.3 || this.col > world.unlockedMaxCol + 0.3)) {
        const safePos = world.sanitizeEntityPosition(this.row, this.col, !this.isPup);
        this.col = safePos.col;
        this.row = safePos.row;
      }

      // === HARD ANTI-STUCK WATCHDOG (time-based) ===
      // Only watches movement/diving states so legitimate timed work (digging, listening, sheltered, etc.) is never interrupted.
      if (this.state === 'moving' || this.state === 'diving') {
        const movedSince = Math.abs(this.col - this._prevCol) > 0.04 || Math.abs(this.row - this._prevRow) > 0.04;
        if (movedSince) {
          this.stuckTimer = 0;
          this._prevCol = this.col;
          this._prevRow = this.row;
        } else {
          this.stuckTimer += dt;
          if (this.stuckTimer > 2.5) {
            this.path = [];
            this.targetTaskId = null;
            this.state = 'idle';
            this.pauseCheckTimer = 0;
            this.stuckTimer = 0;
            const rescue = world.sanitizeEntityPosition(this.row, this.col, !this.isPup);
            this.col = rescue.col;
            this.row = rescue.row;
            this._prevCol = this.col;
            this._prevRow = this.row;
          }
        }
      } else {
        this.stuckTimer = 0;
        this._prevCol = this.col;
        this._prevRow = this.row;
      }

      // Active predator danger on surface -> Dive underground!
      const dangerNearby = alarmActive || predators.some((p) => p.state === 'swooping' || (p.type !== 'HAWK' && p.state !== 'leaving' && Math.abs(p.xCol - this.col) < 9));
      if (!this.isPup && dangerNearby && this.row < 0.2 && this.state !== 'diving') {
        // Sentries must stay up long enough to trigger the alarm first; once alarm triggers or resolves, dive!
        const sentryShouldDive = alarmActive || predators.some((p) => p.alarmResolved || p.state === 'swooping');
        if (this.role !== PT.ROLES.SENTRY || sentryShouldDive) {
          this.triggerDive(this.sprintBoostTimer > 0);
        }
      }

      // If walking to a dig/build task that already completed or got cancelled, redirect immediately!
      if (this.state === 'moving' && this.targetTaskId && !world.tasks.some((t) => t.id === this.targetTaskId)) {
        this.path = [];
        this.targetTaskId = null;
        this.state = 'idle';
        this.pauseCheckTimer = 0;
      }

      // Movement along path
      if (this.path.length > 0) {
        const next = this.path[0];
        const dx = next.col - this.col;
        const dy = next.row - this.row;
        const dist = Math.hypot(dx, dy);

        // Trigger Listening Chamber pause when stepping onto surface row -1 through an entrance shaft!
        if (this.row >= -0.05 && next.row === -1 && this.state !== 'diving' && this.lastSurfaceCheckCol !== Math.round(this.col)) {
          this.lastSurfaceCheckCol = Math.round(this.col);
          if (this._hasNearbyListeningChamber(world, Math.round(this.col))) {
            this.state = 'listening';
            this.listenTimer = 0.55;
            this.actionLabel = 'Listening before exiting...';
            return;
          }
        }
        if (this.row >= 1) this.lastSurfaceCheckCol = null;

        let speed = (this.isPup ? 2.1 : 3.2) * (ctx.workSpeedMult || 1.0);
        if (this.state === 'diving') speed *= this.sprintBoostTimer > 0 ? 2.35 : 1.45;
        else if (this.sprintBoostTimer > 0) speed *= 1.5;

        // Water puddle slowdown
        const rIdx = Math.max(0, Math.min(world.rows - 1, Math.round(this.row)));
        const cIdx = Math.max(0, Math.min(world.totalCols - 1, Math.round(this.col)));
        if (this.row >= 0 && world.water[rIdx][cIdx] > 0.2) speed *= 0.58;

        // Airflow & Morale efficiency multiplier underground
        const moraleVal = ctx.moralePct ?? 80;
        if (airflowPct < 45 || hygienePct < 45 || moraleVal < 40 || resources.food <= 0.5) speed *= 0.78;
        else if (world.bernoulliActive && airflowPct >= 75 && moraleVal >= 85) speed *= 1.18;
        else if (world.bernoulliActive && airflowPct >= 75) speed *= 1.12;

        if (Math.abs(dx) > 0.02) this.facing = dx >= 0 ? 1 : -1;
        this.hopPhase += dt * speed * 3.8;

        const step = speed * dt;
        if (dist <= step) {
          this.col = next.col;
          this.row = next.row;
          this.path.shift();
          if (this.path.length === 0 && this.state === 'moving') {
            this.state = 'idle';
            this.pauseCheckTimer = 0;
          }
        } else {
          this.col += (dx / dist) * step;
          this.row += (dy / dist) * step;
        }
        return;
      }

      // Arrived at destination or waiting for next AI decision
      if (this.state === 'moving') {
        this.state = 'idle';
        this.pauseCheckTimer = 0;
      }

      // Check for Tooth-Touch envoy destination immediately upon arriving
      if (this.targetNeighborId) {
        const nb = world.neighbors.find((n) => n.id === this.targetNeighborId);
        if (nb && !nb.merged && Math.abs(this.col - nb.borderCol) <= 2.4) {
          this.state = 'tooth_touch';
          this.toothTouchTimer = 1.6;
          this.actionLabel = `Tooth-Touch with ${nb.name}!`;
          particles.spawnHearts(this.col, this.row - 0.3, 6);
          audio.playToothTouch();
          return;
        }
        this.targetNeighborId = null;
      }

      if (this.state === 'diving') {
        const curC = Math.max(world.unlockedMinCol, Math.min(world.unlockedMaxCol, Math.round(this.col)));
        const curR = (this.row < -0.4 || !world.isOpenCell(Math.max(0, Math.round(this.row)), curC))
          ? -1
          : Math.max(0, Math.round(this.row));
        const safe = world.findNearestSafeCell(Math.max(0, curR), curC, false);
        if (this.row < 1.0) {
          const path = world.findPath(curR, curC, safe.row, safe.col, true);
          if (path && path.length > 0) {
            this.path = path;
            return;
          }
        }
        this.state = 'sheltered';
        this.diveHoldTimer = 1.4;
        this.actionLabel = 'Safe underground!';
        return;
      }

      if (this.state === 'sheltered') {
        this.diveHoldTimer -= dt;
        // Release as soon as dive hold finishes when underground; _chooseNextAction keeps surface roles safely inside while predators pass!
        if (this.diveHoldTimer <= 0 && (this.row >= 0.4 || !dangerNearby)) {
          this.state = 'idle';
          this.pauseCheckTimer = 0;
        }
        return;
      }

      // Active task work states
      if (this.state === 'digging') {
        const task = world.tasks.find((t) => t.id === this.targetTaskId);
        if (!task) {
          this.state = 'idle';
          this.targetTaskId = null;
          this.pauseCheckTimer = 0;
          return;
        }
        const airSpeed = airflowPct < 45 ? 0.65 : (world.bernoulliActive ? 1.25 : 1.0);
        const moraleMult = (hygienePct < 45 || (ctx.moralePct ?? 80) < 40 || resources.food <= 0.5)
          ? 0.75
          : ((ctx.moralePct ?? 80) >= 85 && world.bernoulliActive ? 1.15 : 1.0);
        const roleMult = (this.role === PT.ROLES.DIGGER ? 1.35 : 0.7) * (ctx.workSpeedMult || 1.0) * moraleMult;
        task.workDone += dt * airSpeed * roleMult;
        this.workTimer += dt;
        this.tailFlickTimer = 0.2;
        if (this.workTimer >= 0.22) {
          this.workTimer = 0;
          particles.spawnDirt(task.col, task.kind === 'mound' ? -0.35 : task.row, 4, -this.facing * 1.4);
          audio.playDig();
        }
        if (task.workDone >= task.workTotal) {
          const kind = task.kind;
          const cellType = task.cellType;
          const moundType = task.moundType;
          const bonusRes = world.completeTask(task, resources);
          particles.spawnDirt(task.col, task.kind === 'mound' ? -0.35 : task.row, 10, 0);
          if (bonusRes && bonusRes.bonusMod === PT.CELL_MOD.ROOT) {
            particles.spawnHearts(task.col, task.row, 6);
          }
          audio.playBuildComplete();
          ctx.onTaskComplete(kind, cellType, moundType, task.col, task.row, bonusRes);
          this.state = 'idle';
          this.targetTaskId = null;
          this.pauseCheckTimer = 0;
        }
        return;
      }

      if (this.state === 'trimming') {
        const c = Math.round(this.col);
        const g = world.grass[c];
        if (!g || g.height <= 0.2) {
          if (g) g.trimMarked = false;
          this.state = 'idle';
          this.pauseCheckTimer = 0;
          return;
        }
        this.workTimer += dt;
        g.height = Math.max(0.16, g.height - dt * 0.55 * (ctx.workSpeedMult || 1.0));
        if (this.workTimer >= 0.24) {
          this.workTimer = 0;
          particles.spawnGrassClip(c, 3);
          audio.playTrimGrass();
        }
        if (g.height <= 0.2) {
          g.trimMarked = false;
          this.targetTrimCol = null;
          resources.food = Math.min(ctx.foodCap, resources.food + 1.8);
          ctx.onGrassTrimmed(c);
          this.state = 'idle';
          this.pauseCheckTimer = 0;
        }
        return;
      }

      if (this.state === 'cleaning') {
        this.workTimer += dt;
        this.tailFlickTimer = 0.2;
        if (this.workTimer >= 1.5) {
          if (ctx.onChamberCleaned) ctx.onChamberCleaned();
          particles.spawnHearts(this.col, this.row - 0.2, 3);
          this.state = 'idle';
          this.pauseCheckTimer = 0;
        }
        return;
      }

      if (this.state === 'foraging') {
        this.workTimer += dt;
        const c = Math.max(world.unlockedMinCol, Math.min(world.unlockedMaxCol, Math.round(this.col)));
        if (this.workTimer >= 1.2) {
          const g = world.grass[c];
          const seedFactor = 0.45 + (g ? g.seedAmount : 0.7) * 0.8;
          if (g) g.seedAmount = Math.max(0.15, g.seedAmount - 0.35);
          // Harvest Golden Seed Bloom / Rare Prairie Clover if standing near one!
          let carryAmt = 5.5 * seedFactor;
          let pickedRare = false;
          const bIdx = world.blooms.findIndex((b) => Math.abs(b.col - c) <= 1);
          if (bIdx !== -1) {
            carryAmt += world.blooms[bIdx].food;
            pickedRare = !!world.blooms[bIdx].isRare;
            particles.spawnHearts(c, -0.3, pickedRare ? 7 : 5);
            world.blooms.splice(bIdx, 1);
            this.actionLabel = pickedRare ? 'Returning Rare Clover harvest!' : 'Returning Golden Bloom harvest!';
          } else {
            this.actionLabel = 'Carrying seeds to Granary';
          }
          this.carryingFood = carryAmt;
          this.carryingGrass = pickedRare;
          this.state = 'returning_food';
          const granaries = world.getChambersOfType(PT.CELL.GRANARY);
          const dest = granaries.length > 0 ? granaries[0] : world.findNearestSafeCell(0, c, false);
          let retPath = world.findPath(-1, c, dest.row, dest.col, true);
          if (!retPath) {
            const ent = world.findNearestListeningOrEntrance(c);
            if (ent) retPath = world.findPath(-1, c, ent.row, ent.col, true);
          }
          this.path = retPath || [];
        }
        return;
      }

      if (this.state === 'returning_food') {
        if (this.carryingFood > 0) {
          resources.food = Math.min(ctx.foodCap, resources.food + this.carryingFood);
          const wasRare = this.carryingGrass;
          this.carryingFood = 0;
          this.carryingGrass = false;
          this.tailFlickTimer = 0.5;
          ctx.onFoodDeposited(wasRare);
        }
        this.state = 'idle';
        this.pauseCheckTimer = 0;
        return;
      }

      // Periodic AI decision
      this.pauseCheckTimer -= dt;
      if (this.pauseCheckTimer > 0) return;
      this.pauseCheckTimer = 0.45 + Math.random() * 0.55;

      if (this.state === 'sentry_watch') {
        this.state = 'idle';
      }
      this._chooseNextAction(ctx);
    }

    _hasNearbyListeningChamber(world, col) {
      for (let dr = 0; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = dr;
          const nc = col + dc;
          if (world.inBounds(nr, nc) && world.grid[nr][nc] === PT.CELL.LISTENING) return true;
        }
      }
      return false;
    }

    _chooseNextAction(ctx) {
      const { world, predators, alarmActive } = ctx;
      const safe = world.sanitizeEntityPosition(this.row, this.col, !this.isPup);
      if (this.row >= -0.4 && !world.isOpenCell(Math.max(0, Math.round(this.row)), Math.round(this.col))) {
        this.row = safe.row;
        this.col = safe.col;
      }
      const curR = this.row < -0.4 ? -1 : Math.max(0, Math.round(this.row));
      const curC = Math.max(world.unlockedMinCol, Math.min(world.unlockedMaxCol, Math.round(this.col)));

      // Pups stay cozy inside deep tunnels / nurseries
      if (this.isPup) {
        const nurseries = world.getChambersOfType(PT.CELL.NURSERY);
        let dest = null;
        if (nurseries.length > 0) {
          dest = nurseries[Math.floor(Math.random() * nurseries.length)];
        } else {
          dest = world.findNearestSafeCell(2, curC, true);
        }
        if (dest && (dest.row !== curR || dest.col !== curC)) {
          const p = world.findPath(curR, curC, dest.row, dest.col, false);
          if (p) {
            this.path = p;
            this.state = 'moving';
            this.actionLabel = nurseries.length > 0 ? 'Playing in Nursery' : 'Hopping in burrow';
            return;
          }
        }
        this.state = 'idle';
        this.actionLabel = nurseries.length > 0 ? 'Cozy in Nursery' : 'Napping deep underground';
        return;
      }

      const threatOnSurface = alarmActive || predators.some((p) => p.type !== 'HAWK' && p.state !== 'leaving');

      // Surface dogs during threat must head underground immediately!
      if (threatOnSurface && curR < 0) {
        const safeDest = world.findNearestSafeCell(1, curC, false);
        if (safeDest) {
          const p = world.findPath(curR, curC, safeDest.row, safeDest.col, true);
          if (p) {
            this.path = p;
            this.state = 'moving';
            this.actionLabel = 'Heading underground (threat!)';
            return;
          }
        }
      }

      // SENTRY (each Sentry covers a distinct entrance mound so outer openings stay guarded!)
      if (this.role === PT.ROLES.SENTRY) {
        const entrances = world.getEntrances();
        if (entrances.length > 0) {
          const occupied = new Set(
            ctx.dogs.filter((d) => d.id !== this.id && d.role === PT.ROLES.SENTRY && d.moundCol !== null).map((d) => d.moundCol)
          );
          entrances.sort((a, b) => {
            const score = (c) => {
              const occPen = occupied.has(c) ? 100 : 0;
              const mt = world.mounds[c].type;
              const typeScore = mt === PT.MOUND.CRATER ? 0 : (mt === PT.MOUND.DOME ? 1 : 2);
              return occPen + typeScore;
            };
            return score(a) - score(b);
          });
          const bestCol = entrances[0];
          this.moundCol = bestCol;

          // If a resolved predator is right outside, wait safely in shaft row 1 instead of yo-yo climbing & diving!
          const predatorOverhead = curR >= 0 && (alarmActive || predators.some((p) =>
            p.state === 'swooping' || (p.type !== 'HAWK' && p.state !== 'leaving' && p.alarmResolved && Math.abs(p.xCol - bestCol) < 10)
          ));
          if (predatorOverhead) {
            const waitRow = world.isOpenCell(1, bestCol) ? 1 : 2;
            if (curR === waitRow && curC === bestCol) {
              this.state = 'idle';
              this.actionLabel = 'Listening from shaft (predator passing)';
              return;
            }
            const p = world.findPath(curR, curC, waitRow, bestCol, false);
            if (p) {
              this.path = p;
              this.state = 'moving';
              this.actionLabel = 'Keeping watch from shaft';
              return;
            }
          } else {
            if (curR === -1 && curC === bestCol) {
              this.state = 'sentry_watch';
              this.actionLabel = 'Scanning horizon';
              if (Math.random() < 0.35) this.facing *= -1;
              return;
            }
            const p = world.findPath(curR, curC, -1, bestCol, true);
            if (p) {
              this.path = p;
              this.state = 'moving';
              this.actionLabel = 'Climbing to Sentry mound';
              return;
            }
          }
        }
      }

      // DIGGER ONLY: Excavates queued tunnels, deposits, chambers & Crater/Dome mounds!
      if (this.role === PT.ROLES.DIGGER && world.tasks.length > 0) {
        const claimCounts = new Map();
        for (const d of ctx.dogs) {
          if (d.id !== this.id && d.targetTaskId) {
            claimCounts.set(d.targetTaskId, (claimCounts.get(d.targetTaskId) || 0) + 1);
          }
        }
        const orderedTasks = [...world.tasks].sort((a, b) => (claimCounts.get(a.id) || 0) - (claimCounts.get(b.id) || 0));

        for (const task of orderedTasks) {
          const spots = this._findStandSpotsForTask(world, task, threatOnSurface);
          if (spots.length === 0) continue;

          const here = spots.find((s) => s.row === curR && s.col === curC);
          if (here) {
            this.targetTaskId = task.id;
            this.state = 'digging';
            this.workTimer = 0;
            this.facing = task.col >= curC ? 1 : -1;
            this.actionLabel = task.kind === 'mound' ? 'Packing Mound' : 'Excavating earth';
            return;
          }

          let bestPath = null;
          for (const spot of spots) {
            const p = world.findPath(curR, curC, spot.row, spot.col, true);
            if (p && (!bestPath || p.length < bestPath.length)) {
              bestPath = p;
            }
          }
          if (bestPath) {
            this.targetTaskId = task.id;
            this.path = bestPath;
            this.state = 'moving';
            this.actionLabel = task.kind === 'mound' ? 'Heading to build mound' : 'Heading to dig site';
            return;
          }
        }
      }

      // GARDENER: Spread across untrimmed grass tiles -> clean Latrines & living rooms to lift Hygiene!
      if (this.role === PT.ROLES.GARDENER) {
        this.targetTrimCol = null;
        if (!threatOnSurface) {
          const claimedTrimCols = new Set(
            ctx.dogs.filter((d) => d.id !== this.id && d.targetTrimCol !== null).map((d) => d.targetTrimCol)
          );
          let trimCol = null;
          for (let c = world.unlockedMinCol; c <= world.unlockedMaxCol; c++) {
            if (world.grass[c].trimMarked && world.grass[c].height > 0.22 && !claimedTrimCols.has(c)) {
              trimCol = c;
              break;
            }
          }
          if (trimCol === null) {
            const entrances = world.getEntrances();
            let bestDist = Infinity;
            for (const ec of entrances) {
              for (let dc = -9; dc <= 9; dc++) {
                const nc = ec + dc;
                if (nc >= world.unlockedMinCol && nc <= world.unlockedMaxCol && !world.isEntrance(nc) && !claimedTrimCols.has(nc)) {
                  if (world.grass[nc].height > 0.45 && Math.abs(dc) < bestDist) {
                    bestDist = Math.abs(dc);
                    trimCol = nc;
                  }
                }
              }
            }
          }
          if (trimCol !== null) {
            this.targetTrimCol = trimCol;
            if (curR === -1 && curC === trimCol) {
              this.state = 'trimming';
              this.workTimer = 0;
              this.actionLabel = 'Trimming sightline grass';
              return;
            }
            const p = world.findPath(curR, curC, -1, trimCol, true);
            if (p) {
              this.path = p;
              this.state = 'moving';
              this.actionLabel = 'Trotting to trim grass';
              return;
            }
          }
        }

        // Scrub Latrines or Nursery bedding underground when surface grass is tidy or threats exist!
        const cleanSpots = [...world.getChambersOfType(PT.CELL.LATRINE), ...world.getChambersOfType(PT.CELL.NURSERY)];
        if (cleanSpots.length > 0 && ctx.hygienePct < 98) {
          const spot = cleanSpots[Math.floor(Math.random() * cleanSpots.length)];
          if (curR === spot.row && curC === spot.col) {
            this.state = 'cleaning';
            this.workTimer = 0;
            this.actionLabel = 'Tidying chambers (+Hygiene)';
            return;
          }
          const p = world.findPath(curR, curC, spot.row, spot.col, curR < 0);
          if (p) {
            this.path = p;
            this.state = 'moving';
            this.actionLabel = 'Heading inside to tidy rooms';
            return;
          }
        }
      }

      // FORAGER (prioritize active Golden Blooms, else graze prairie seeds!)
      if (this.role === PT.ROLES.FORAGER && !threatOnSurface && ctx.weather.id !== 'STORM') {
        if (this.carryingFood > 0) {
          this.state = 'returning_food';
          return;
        }
        let targetCol = null;
        if (world.blooms && world.blooms.length > 0) {
          const nearBloom = world.blooms.reduce((a, b) => Math.abs(a.col - curC) < Math.abs(b.col - curC) ? a : b);
          targetCol = nearBloom.col;
        } else {
          const entrances = world.getEntrances();
          if (entrances.length > 0) {
            const baseCol = entrances[Math.floor(Math.random() * entrances.length)];
            const offset = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.floor(Math.random() * 8));
            targetCol = Math.max(world.unlockedMinCol, Math.min(world.unlockedMaxCol, baseCol + offset));
          }
        }
        if (targetCol !== null) {
          if (curR === -1 && Math.abs(curC - targetCol) <= 1) {
            this.state = 'foraging';
            this.workTimer = 0;
            this.actionLabel = 'Gathering seeds & grass';
            return;
          }
          const p = world.findPath(curR, curC, -1, targetCol, true);
          if (p) {
            this.path = p;
            this.state = 'moving';
            this.actionLabel = 'Dashing out to forage';
            return;
          }
        }
      }

      // Fallback friendly stroll inside burrow (allowSurface=true if currently on surface so dog can climb back down!)
      const wanderDest = world.findNearestSafeCell(
        Math.max(1, Math.min(world.rows - 1, Math.floor(1 + Math.random() * 4))),
        Math.max(world.unlockedMinCol, Math.min(world.unlockedMaxCol, curC + Math.floor((Math.random() - 0.5) * 8))),
        false
      );
      if (wanderDest && (wanderDest.row !== curR || wanderDest.col !== curC)) {
        const p = world.findPath(curR, curC, wanderDest.row, wanderDest.col, curR < 0);
        if (p) {
          this.path = p;
          this.state = 'moving';
          this.actionLabel = curR < 0 ? 'Heading inside burrow' : (this.role === PT.ROLES.IDLE ? 'Resting in warm tunnel' : 'Patrolling burrow');
          return;
        }
      }

      this.targetTaskId = null;
      this.state = 'idle';
      this.actionLabel = 'Resting';
    }

    _findStandSpotsForTask(world, task, preferUnderground = false) {
      const spots = [];
      if (task.kind === 'mound') {
        if (preferUnderground) {
          if (world.isOpenCell(0, task.col)) spots.push({ row: 0, col: task.col });
          if (world.isOpenCell(1, task.col)) spots.push({ row: 1, col: task.col });
          if (world.isOpenCell(0, task.col)) spots.push({ row: -1, col: task.col });
        } else {
          if (world.isOpenCell(0, task.col)) spots.push({ row: -1, col: task.col });
          if (world.isOpenCell(1, task.col)) spots.push({ row: 1, col: task.col });
          if (world.isOpenCell(0, task.col)) spots.push({ row: 0, col: task.col });
        }
        return spots;
      }
      if (world.isOpenCell(task.row, task.col)) {
        spots.push({ row: task.row, col: task.col });
      }
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of dirs) {
        const nr = task.row + dr;
        const nc = task.col + dc;
        if (world.inBounds(nr, nc) && world.isUnlocked(nc) && world.isOpenCell(nr, nc)) {
          spots.push({ row: nr, col: nc });
        }
      }
      return spots;
    }
  }

  // ==================== PREDATOR ENTITY ====================
  class Predator {
    constructor(type, world, targetCol, speedMult = 1) {
      this.id = Math.floor(Math.random() * 1e9);
      this.type = type; // 'HAWK' | 'COYOTE' | 'HUMAN'
      this.spec = PT.PREDATORS[type];

      this.dir = Math.random() < 0.5 ? 1 : -1;
      const minC = world.unlockedMinCol;
      const maxC = world.unlockedMaxCol;
      const entrances = world.getEntrances();
      // Coyotes prefer hunting the grassiest / most unguarded entrance; others target approaching side!
      if (targetCol !== undefined && targetCol !== null) {
        this.targetCol = targetCol;
      } else if (type === 'COYOTE' && entrances.length > 1 && Math.random() < 0.72) {
        let bestScore = -1;
        let chosen = entrances[0];
        for (const ec of entrances) {
          let grassSum = 0;
          for (let dc = -3; dc <= 3; dc++) {
            const g = world.grass[ec + dc];
            if (g) grassSum += g.height;
          }
          const rawPen = world.mounds[ec]?.type === PT.MOUND.RAW ? 1.5 : 0;
          if (grassSum + rawPen > bestScore) {
            bestScore = grassSum + rawPen;
            chosen = ec;
          }
        }
        this.targetCol = chosen;
        this.dir = chosen < (minC + maxC) / 2 ? 1 : -1;
      } else if (entrances.length > 0) {
        this.targetCol = this.dir === 1 ? entrances[0] : entrances[entrances.length - 1];
      } else {
        this.targetCol = PT.STARTER_COL || 90;
      }

      if (type === 'HAWK') {
        this.xCol = this.dir === 1 ? minC - 11 : maxC + 11;
        this.yMeters = -4.8; // high in the sky
        this.speed = 6.2 * speedMult;
      } else if (type === 'COYOTE') {
        this.xCol = this.dir === 1 ? minC - 9 : maxC + 9;
        this.yMeters = 0;
        this.speed = 2.95 * speedMult;
      } else {
        // HUMAN
        this.xCol = this.dir === 1 ? minC - 10 : maxC + 10;
        this.yMeters = 0;
        this.speed = 2.3 * speedMult;
      }

      this.state = 'approaching'; // approaching -> swooping/stalking -> passing -> leaving
      this.alarmTriggered = false;
      this.alarmResolved = false;
      this.alarmSuccess = false;
      this.detectedBySentryName = null;
      this.camouflage = 0; // 0 = clearly visible, 1 = hidden in tall grass
      this.isAmbush = false;
      this.earlySpotted = false;
      this.isWorkerEncounter = false;
      this.stridePhase = 0;
      this.digTimer = 0;
      this.age = 0;
      this.done = false;
    }

    update(dt, world, dogs, sentryRangeBonus = 0) {
      this.age += dt;
      if (this.age > 40) {
        this.done = true;
        return;
      }
      this.stridePhase += dt * (this.type === 'HAWK' ? 8 : this.speed * 2.5);

      if (this.type === 'COYOTE') {
        const colIdx = Math.max(0, Math.min(world.totalCols - 1, Math.round(this.xCol)));
        const gh = world.grass[colIdx] ? world.grass[colIdx].height : 0.6;
        this.camouflage = gh > 0.46 ? Math.min(0.88, (gh - 0.35) * 1.35) : 0;
      } else {
        this.camouflage = 0;
      }

      if (this.type === 'HAWK') {
        if (this.state === 'approaching') {
          this.xCol += this.dir * this.speed * dt;
          if (Math.abs(this.xCol - this.targetCol) < 5.5) {
            this.state = 'swooping';
          }
        } else if (this.state === 'swooping') {
          this.xCol += this.dir * (this.speed * 1.25) * dt;
          const dist = Math.abs(this.xCol - this.targetCol);
          this.yMeters = -0.35 - Math.min(4.4, dist * 0.72);
          if ((this.dir === 1 && this.xCol > this.targetCol + 2.5) || (this.dir === -1 && this.xCol < this.targetCol - 2.5)) {
            this.state = 'leaving';
          }
        } else if (this.state === 'leaving') {
          this.xCol += this.dir * (this.speed * 1.3) * dt;
          this.yMeters = Math.max(-6.5, this.yMeters - 2.6 * dt);
          if ((this.dir === 1 && this.xCol > this.targetCol + 18) || (this.dir === -1 && this.xCol < this.targetCol - 18) ||
            this.xCol < world.unlockedMinCol - 18 || this.xCol > world.unlockedMaxCol + 18) {
            this.done = true;
          }
        }
      } else if (this.type === 'COYOTE') {
        if (this.state === 'approaching' || this.state === 'passing') {
          const curSpeed = this.alarmResolved && this.alarmSuccess ? this.speed * 1.35 : this.speed;
          this.xCol += this.dir * curSpeed * dt;
          if (this.state === 'approaching' && Math.abs(this.xCol - this.targetCol) < 1.2) {
            this.state = 'digging_shallow';
            this.digTimer = this.alarmResolved && this.alarmSuccess ? 1.0 : 1.8;
          }
          if (this.xCol < world.unlockedMinCol - 15 || this.xCol > world.unlockedMaxCol + 15) {
            this.done = true;
          }
        } else if (this.state === 'digging_shallow') {
          this.digTimer -= dt;
          if (this.digTimer <= 0) {
            this.state = 'leaving';
          }
        } else if (this.state === 'leaving') {
          this.xCol += this.dir * this.speed * 1.55 * dt;
          if ((this.dir === 1 && this.xCol > this.targetCol + 18) || (this.dir === -1 && this.xCol < this.targetCol - 18) ||
            this.xCol < world.unlockedMinCol - 15 || this.xCol > world.unlockedMaxCol + 15) {
            this.done = true;
          }
        }
      } else {
        // HUMAN steady stride across the prairie, enters 'leaving' once past targetCol!
        const curSpeed = this.state === 'leaving' ? this.speed * 1.45 : this.speed;
        this.xCol += this.dir * curSpeed * dt;
        if (this.state !== 'leaving') {
          const threshold = (this.alarmResolved && this.alarmSuccess) ? 1.0 : 2.5;
          if ((this.dir === 1 && this.xCol > this.targetCol + threshold) || (this.dir === -1 && this.xCol < this.targetCol - threshold)) {
            this.state = 'leaving';
          }
        }
        if ((this.state === 'leaving' && ((this.dir === 1 && this.xCol > this.targetCol + 16) || (this.dir === -1 && this.xCol < this.targetCol - 16))) ||
          this.xCol < world.unlockedMinCol - 14 || this.xCol > world.unlockedMaxCol + 14) {
          this.done = true;
        }
      }

      // Check detection & encounters across Sentries on ALL openings, PLUS surface workers, PLUS unguarded openings!
      if (!this.alarmTriggered && !this.done) {
        const owlBonus = world.owlCol !== null ? 3 : 0;
        const sentries = dogs.filter((d) => !d.isPup && d.role === PT.ROLES.SENTRY && d.row < 0.25);

        // 1. Sentries watching mounds
        for (const watcher of sentries) {
          const zone = world.sightlineZones.find((z) => Math.abs(z.col - watcher.col) <= 1);
          let inSight = false;
          if (this.type === 'HAWK') {
            inSight = Math.abs(this.xCol - watcher.col) <= 13 + owlBonus + sentryRangeBonus;
            if (inSight && world.sightlineClear) this.earlySpotted = true;
          } else if (this.type === 'COYOTE') {
            if (this.camouflage > 0.45) {
              inSight = Math.abs(this.xCol - watcher.col) <= 4.5 + (owlBonus > 0 ? 1.5 : 0);
              if (inSight) this.isAmbush = true;
            } else if (zone) {
              const effLeft = zone.leftCol - 2 - owlBonus - sentryRangeBonus;
              const effRight = zone.rightCol + 2 + owlBonus + sentryRangeBonus;
              inSight = this.xCol >= effLeft && this.xCol <= effRight;
              if (inSight && Math.abs(this.xCol - watcher.col) >= 9) this.earlySpotted = true;
            } else {
              inSight = Math.abs(this.xCol - watcher.col) <= 8 + owlBonus + sentryRangeBonus;
            }
          } else {
            inSight = Math.abs(this.xCol - watcher.col) <= 14 + owlBonus + sentryRangeBonus;
            if (inSight && world.sightlineClear) this.earlySpotted = true;
          }

          if (inSight) {
            this.alarmTriggered = true;
            this.detectedBySentryName = watcher.name;
            break;
          }
        }

        // 2. Non-Sentry surface dogs (Foragers/Gardeners/Diggers) encountering predator directly!
        if (!this.alarmTriggered) {
          const surfaceWorkers = dogs.filter((d) => !d.isPup && d.role !== PT.ROLES.SENTRY && d.row < 0.25);
          for (const worker of surfaceWorkers) {
            const dist = Math.abs(this.xCol - worker.col);
            const detectR = this.type === 'COYOTE' && this.camouflage > 0.45 ? 3.2 : 5.8;
            if (dist <= detectR) {
              this.alarmTriggered = true;
              this.isWorkerEncounter = true;
              this.isAmbush = true;
              this.detectedBySentryName = `${worker.name} (Surface Encounter!)`;
              worker.triggerDive(false);
              worker.shockTimer = 2.5;
              break;
            }
          }
        }

        // 3. Predator reaches an UNGUARDED burrow opening directly!
        if (!this.alarmTriggered) {
          for (const ec of world.getEntrances()) {
            if (Math.abs(this.xCol - ec) <= 2.2) {
              this.alarmTriggered = true;
              this.isAmbush = true;
              this.detectedBySentryName = 'Unguarded Opening Alert';
              break;
            }
          }
        }
      }
    }
  }

  PT.ParticleSystem = ParticleSystem;
  PT.PrairieDog = PrairieDog;
  PT.Predator = Predator;
})(window);
