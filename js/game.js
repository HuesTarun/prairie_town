/**
 * PRAIRIE TOWN: Coterie & Burrow
 * Main simulation controller, input/camera handler, 30s guided onboarding,
 * Tactical Alarm mini-game, progression ranks, Almanac unlocks, and localStorage/JSON persistence.
 */
(function (root) {
  'use strict';

  const PT = (root.PT = root.PT || {});

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.audio = new PT.AudioEngine();
      this.world = new PT.World();
      this.particles = new PT.ParticleSystem();
      this.renderer = canvas ? new PT.Renderer(canvas) : null;

      this.settings = {
        muted: false,
        masterVol: 0.8,
        sfxVol: 0.85,
        ambVol: 0.65,
        screenShake: true,
        airflowOverlay: true,
        particleDensity: 'high',
        pauseOnAlarm: false, // Only the 1st alert pauses by default; subsequent alerts use live countdown!
        pacingMode: 'cozy'
      };

      this.worldStyle = 'meadow';
      this.speed = 1; // 0 = paused, 1 = 1x, 2 = 2x
      this.pausedByModal = false;
      this.speedBeforeModal = 1;

      this.timeSec = 0;
      this.day = 1;
      this.dayProgress = 0.12; // morning start
      this.dayLengthSec = 75;

      this.weather = PT.WEATHER.SUNNY;
      this.nextWeather = PT.WEATHER.GOLDEN;
      this.weatherTimer = 38;
      this.windSpeed = 0.72;

      this.resources = { food: 28, dirt: 18 };
      this.hygienePct = 90;
      this.moralePct = 86;
      this.colonyRank = 0;
      this.megaTownPop = 0;

      this.dogs = [];
      this.nextDogId = 1;
      this.predators = [];
      this.predatorCooldown = 22; // ~22s into Day 1 triggers first guided predator!
      this.activeAlarm = null;

      this.activeTool = PT.TOOLS.SELECT;
      this.selectedDogId = null;
      this.hoverCell = null;

      this.unlockedAlmanac = [];
      this.unreadAlmanac = false;
      this.successfulAlarms = 0;
      this.totalAlarmsTriggered = 0;
      this.alarmStreak = 0;

      // Achievements & Skill Points (spend SP to expand concurrent Work Blocks, Brush & Speed!)
      this.unlockedAchievements = [];
      this.skillPoints = 0;
      this.totalSpEarned = 0;
      this.skillLevels = { work_queue: 0, excavate_brush: 0, dig_speed: 0, colony_harmony: 0 };
      this.trimmedCount = 0;
      this.foundDepositCount = 0;

      // Self-Sustaining Final Goal (Autonomous Victory Mode)
      this.autonomousVictory = false;

      // Guided First Day & Opening Guide popup
      this.welcomeShown = false;
      this.tutorialDone = false;
      this.tutorialStep = 0;
      this.tutorialTimer = 0;
      this.playerTrimmedGrass = false;

      this.autoSaveTimer = 0;
      this.ui = null;

      this.keysDown = new Set();
      this.dragState = null;
      this.globalPlayerCount = null;
      this.localPlaySessions = 1;

      this._initStarterColony();
    }

    _initStarterColony() {
      const sc = PT.STARTER_COL || 90;
      this.dogs = [
        new PT.PrairieDog({ id: this.nextDogId++, name: 'Pip', role: PT.ROLES.SENTRY, col: sc, row: -1 }),
        new PT.PrairieDog({ id: this.nextDogId++, name: 'Bramble', role: PT.ROLES.DIGGER, col: sc + 1, row: 2 }),
        new PT.PrairieDog({ id: this.nextDogId++, name: 'Clover', role: PT.ROLES.FORAGER, col: sc - 1, row: 2 }),
        new PT.PrairieDog({ id: this.nextDogId++, name: 'Sprout', role: PT.ROLES.GARDENER, col: sc + 2, row: 2 }),
        new PT.PrairieDog({ id: this.nextDogId++, name: 'Pebble', isPup: true, ageProgress: 0.25, col: sc, row: 2 })
      ];
      this.world.recomputeStats(this.windSpeed, this.dogs.length);
    }

    // ==================== SKILL POINTS & ACHIEVEMENTS HELPERS ====================
    getSkillSpec(id) {
      return PT.SKILLS.find((s) => s.id === id);
    }

    getMaxWorkBlocks() {
      const sp = this.getSkillSpec('work_queue');
      const lv = Math.min(sp.tiers.length - 1, this.skillLevels.work_queue || 0);
      return sp.tiers[lv];
    }

    getBrushSize() {
      const sp = this.getSkillSpec('excavate_brush');
      const lv = Math.min(sp.tiers.length - 1, this.skillLevels.excavate_brush || 0);
      return sp.tiers[lv];
    }

    getWorkSpeedMult() {
      const sp = this.getSkillSpec('dig_speed');
      const lv = Math.min(sp.tiers.length - 1, this.skillLevels.dig_speed || 0);
      return sp.tiers[lv];
    }

    getAutoPathReach() {
      return 6 + (this.skillLevels.dig_speed || 0) * 2;
    }

    getSentryRangeBonus() {
      return (this.skillLevels.colony_harmony || 0) * 2;
    }

    getDrainReductionMult() {
      return Math.max(0.55, 1 - (this.skillLevels.colony_harmony || 0) * 0.12);
    }

    getPlacementOpts() {
      return {
        maxTasks: this.getMaxWorkBlocks(),
        maxAutoDist: this.getAutoPathReach(),
        brushSize: this.getBrushSize()
      };
    }

    spendSkillPoint(skillId) {
      const spec = this.getSkillSpec(skillId);
      if (!spec) return false;
      const curLv = this.skillLevels[skillId] || 0;
      if (curLv >= spec.costs.length) return false;
      const cost = spec.costs[curLv];
      if (this.skillPoints < cost) return false;
      this.skillPoints -= cost;
      this.skillLevels[skillId] = curLv + 1;
      this.audio.playRankUp();
      if (this.ui) {
        this.ui.showToast(`Upgraded ${spec.name} to ${spec.formatTier(spec.tiers[curLv + 1])}!`, 'good');
        this.ui.updateHUD();
      }
      return true;
    }

    unlockAchievement(id) {
      if (this.unlockedAchievements.includes(id)) return false;
      const ach = PT.ACHIEVEMENTS.find((a) => a.id === id);
      if (!ach) return false;
      this.unlockedAchievements.push(id);
      this.skillPoints += ach.sp;
      this.totalSpEarned += ach.sp;
      this.audio.playRankUp();
      if (this.ui) {
        this.ui.showToast(`🏆 ${ach.title} (+${ach.sp} Skill Pts!)`, 'good');
      }
      return true;
    }

    boot() {
      this.loadSettings();
      this.ui = new PT.UIController(this);

      const loaded = this.loadFromLocalStorage();
      if (!loaded) {
        this.saveGame(false);
      }
      this.applySettings();
      this._bindCanvasInput();
      this.ui.updateHUD();
      this._initPlayerCounter();

      // Pop up the Welcome & World Guide at opening on fresh colonies (pauses simulation while reading!)
      if (!this.welcomeShown) {
        this.welcomeShown = true;
        this.ui.openModal('welcome-modal');
      }

      // Start 60 FPS loop (guarded so transient errors never halt animation frames!)
      let lastTs = performance.now();
      const frame = (now) => {
        requestAnimationFrame(frame);
        const rawDt = Math.min(0.05, Math.max(0, (now - lastTs) / 1000));
        lastTs = now;
        try {
          this.tick(rawDt);
        } catch (err) {
          console.error('Prairie Town frame error:', err);
        }
      };
      requestAnimationFrame(frame);
    }

    // ==================== GAME LOOP & SIMULATION ====================
    tick(rawDt) {
      // Keyboard camera pan
      this._handleKeyboardPan(rawDt);

      if (this.renderer) {
        this.renderer.updateCamera(rawDt);
      }

      if (this.pausedByModal && this.ui && !this.ui.isAnyModalOpen()) {
        this.pausedByModal = false;
      }

      const isPaused = this.speed === 0 || this.pausedByModal;
      // Strict 1st-alert-only pause: only the VERY FIRST predator alert freezes time so new players learn; ALL subsequent alerts run live!
      const alarmPaused = !!this.activeAlarm && !!this.activeAlarm.isPausedAlert && !this.autonomousVictory;
      const simScale = (isPaused || alarmPaused) ? 0 : (this.activeAlarm ? 0.16 : this.speed);
      const dt = rawDt * simScale;

      this.audio.updateAmbience(this.windSpeed, this.weather.rain, isPaused, rawDt);

      // Update live alarm countdown (or auto-answer if colony has achieved Autonomous Victory / Steward Lv3!)
      if (!isPaused && !alarmPaused && this.activeAlarm) {
        const masterStewardReady = (this.skillLevels.colony_harmony || 0) >= 3 &&
          this.dogs.some((d) => !d.isPup && d.role === PT.ROLES.SENTRY);
        if (this.autonomousVictory) {
          this.activeAlarm.autoTimer = (this.activeAlarm.autoTimer ?? 0.9) - rawDt;
          if (this.activeAlarm.autoTimer <= 0) {
            const expectedCall = PT.PREDATORS[this.activeAlarm.predator.type].callId;
            this.resolveAlarm(expectedCall);
          }
        } else {
          this.activeAlarm.timeLeft -= rawDt;
          if (masterStewardReady && this.activeAlarm.timeLeft <= 1.2) {
            const expectedCall = PT.PREDATORS[this.activeAlarm.predator.type].callId;
            this.resolveAlarm(expectedCall);
          } else if (this.activeAlarm.timeLeft <= 0) {
            this.resolveAlarm(null); // timed out
          }
        }
      }

      if (dt > 0) {
        this.timeSec += dt;

        // Day/Time progression
        this.dayProgress += dt / this.dayLengthSec;
        if (this.dayProgress >= 1) {
          this.dayProgress -= 1;
          this.day += 1;
          this._onNewDay();
        }

        // Weather & wind fluctuations
        this.windSpeed = Math.max(0.25, this.weather.windBase + Math.sin(this.timeSec * 0.28) * 0.22);
        this.weatherTimer -= dt;
        if (this.weatherTimer <= 0) {
          this._advanceWeather();
        }

        // Environment: grass growth, storm flood seepage, drainage
        this.world.stepEnvironment(dt, this.weather, this.windSpeed);

        // Resources & Hygiene & Pup Births
        this._stepColonyVitality(dt);

        // Guided 30s First Day progression
        if (!this.tutorialDone) {
          this._stepTutorial(dt);
        }

        // Predators spawning & update
        this._stepPredators(dt);

        // Update Prairie Dogs
        const ctx = this._buildEntityContext();
        for (const dog of this.dogs) {
          dog.update(dt, ctx);
        }

        // Recompute Airflow & Sightlines periodically
        if (Math.floor(this.timeSec * 2) !== Math.floor((this.timeSec - dt) * 2)) {
          this.world.recomputeStats(this.windSpeed, this.dogs.length);
        }

        // Particles
        this.particles.update(dt, this.world, this.windSpeed, this.weather);

        // Texas Mega-Town prestige population scale
        if (this.colonyRank >= 3) {
          const growth = (this.dogs.length * 4200 + (this.world.bernoulliActive ? 25000 : 8000)) * dt;
          this.megaTownPop = Math.min(400000000, this.megaTownPop + growth);
        }

        // Rank, Achievements & Autonomous Self-Sustaining Mode
        this._checkRankProgression();
        this._checkAchievementsAndVictory(dt);

        // Auto-save every 15s
        this.autoSaveTimer += rawDt;
        if (this.autoSaveTimer >= 15) {
          this.autoSaveTimer = 0;
          this.saveGame(false);
        }
      }

      // Render frame & refresh HUD independently so a transient render issue never blocks HUD/alarms
      if (this.renderer) {
        try {
          const renderState = {
            world: this.world,
            dogs: this.dogs,
            predators: this.predators,
            particles: this.particles,
            timeSec: this.timeSec,
            dayProgress: this.dayProgress,
            weather: this.weather,
            windSpeed: this.windSpeed,
            settings: this.settings,
            hoverCell: this.hoverCell,
            activeTool: this.activeTool,
            selectedDogId: this.selectedDogId,
            colonyRank: this.colonyRank,
            resources: this.resources,
            placementOpts: this.getPlacementOpts()
          };
          this.renderer.render(renderState);
          if (this.ui && this.ui.els && this.ui.els.minimapCanvas) {
            this.renderer.renderMinimap(this.ui.els.minimapCanvas, renderState);
          }
        } catch (err) {
          this.renderer.ctx.setTransform(this.renderer.dpr, 0, 0, this.renderer.dpr, 0, 0);
          console.error('Prairie Town render error:', err);
        }
      }
      if (this.ui) {
        this.ui.updateHUD();
      }
    }

    _buildEntityContext() {
      return {
        world: this.world,
        resources: this.resources,
        particles: this.particles,
        audio: this.audio,
        predators: this.predators,
        dogs: this.dogs,
        alarmActive: !!this.activeAlarm,
        hygienePct: this.hygienePct,
        airflowPct: this.world.airflowPct,
        weather: this.weather,
        pacing: PT.PACING[this.settings.pacingMode],
        foodCap: this.getFoodCap(),
        workSpeedMult: this.getWorkSpeedMult(),
        onTaskComplete: (kind, cellType, moundType, col, row, bonusRes) => {
          this.resources.food = Math.min(this.getFoodCap(), this.resources.food);
          this.world.recomputeStats(this.windSpeed, this.dogs.length);
          if (kind === 'mound' && moundType === PT.MOUND.CRATER) {
            this.unlockAlmanac('crater_flood');
          }
          if (this.world.bernoulliActive) {
            this.unlockAlmanac('bernoulli');
          }
          if (cellType === PT.CELL.LISTENING) this.unlockAlmanac('listening_chamber');
          if (cellType === PT.CELL.NURSERY && row >= PT.NURSERY_MIN_DEPTH_ROW) this.unlockAlmanac('coyote_limit');
          if (this.world.chamberCounts.granary > 0 && this.world.chamberCounts.latrine > 0) {
            this.unlockAlmanac('hygiene_granary');
          }
          if (bonusRes && bonusRes.bonusMod && bonusRes.bonusMod !== PT.CELL_MOD.NONE) {
            this.foundDepositCount += 1;
          }
          if (bonusRes && bonusRes.bonusMod === PT.CELL_MOD.CLAY) {
            this.moralePct = Math.min(100, this.moralePct + 3);
            if (this.ui) this.ui.showToast(`Rich Clay Vein! (+${bonusRes.bonusDirt} Bonus Dirt)`, 'good');
          } else if (bonusRes && bonusRes.bonusMod === PT.CELL_MOD.ROOT) {
            this.moralePct = Math.min(100, this.moralePct + 4);
            if (this.ui) this.ui.showToast(`Sweet Prairie Tubers! (+${bonusRes.bonusFood} Bonus Food)`, 'good');
          } else if (bonusRes && bonusRes.bonusMod === PT.CELL_MOD.ROCK) {
            if (this.ui) this.ui.showToast(`Chipped Sandstone Boulder! (+${bonusRes.bonusDirt} Stone & Dirt)`, 'good');
          } else if (bonusRes && bonusRes.bonusMod === PT.CELL_MOD.AQUIFER) {
            this.hygienePct = Math.min(100, this.hygienePct + 5);
            this.moralePct = Math.min(100, this.moralePct + 4);
            if (this.ui) this.ui.showToast('Clean Deep Aquifer Spring! (+5% Hygiene, +6 Dirt)', 'good');
          } else if (this.ui) {
            this.ui.showToast('Excavation complete!', 'good');
          }
        },
        onGrassTrimmed: () => {
          this.trimmedCount += 1;
          this.resources.food = Math.min(this.getFoodCap(), this.resources.food);
          this.moralePct = Math.min(100, this.moralePct + 2);
          this.world.recomputeStats(this.windSpeed, this.dogs.length);
          this.unlockAlmanac('sightlines');
        },
        onChamberCleaned: () => {
          this.hygienePct = Math.min(100, this.hygienePct + 2.5);
          this.moralePct = Math.min(100, this.moralePct + 1);
        },
        onFoodDeposited: () => {},
        onPupMature: (dog) => {
          if (this.autonomousVictory) {
            // Balance new adult into whichever role the autonomous colony needs!
            const entrances = this.world.getEntrances().length;
            const curSentries = this.dogs.filter((d) => !d.isPup && d.role === PT.ROLES.SENTRY).length;
            const curForagers = this.dogs.filter((d) => !d.isPup && d.role === PT.ROLES.FORAGER).length;
            const curGardeners = this.dogs.filter((d) => !d.isPup && d.role === PT.ROLES.GARDENER).length;
            if (curSentries < entrances) dog.setRole(PT.ROLES.SENTRY);
            else if (curForagers < 3) dog.setRole(PT.ROLES.FORAGER);
            else if (curGardeners < 3) dog.setRole(PT.ROLES.GARDENER);
            else dog.setRole(PT.ROLES.DIGGER);
          }
          if (this.ui) this.ui.showToast(`${dog.name} grew into an adult Prairie Dog!`, 'good');
        },
        completeNeighborMerge: (nbId) => {
          const nb = this.world.neighbors.find((n) => n.id === nbId);
          if (!nb || nb.merged) return;
          this.world.mergeNeighbor(nb);
          // Add neighbor coterie adults & pups!
          for (let i = 0; i < nb.adults; i++) {
            this.dogs.push(new PT.PrairieDog({
              id: this.nextDogId++,
              name: this._pickDogName(),
              role: i === 0 ? PT.ROLES.FORAGER : PT.ROLES.DIGGER,
              col: nb.moundCol,
              row: 2
            }));
          }
          for (let p = 0; p < nb.pups; p++) {
            this.dogs.push(new PT.PrairieDog({
              id: this.nextDogId++,
              name: this._pickDogName(),
              isPup: true,
              ageProgress: 0.2,
              col: nb.moundCol + (nb.side === 'east' ? -1 : 1),
              row: 3
            }));
          }
          this.unlockAlmanac('tooth_touch');
          this.world.recomputeStats(this.windSpeed, this.dogs.length);
          if (this.ui) {
            this.ui.showToast(`Tooth-Touch Kin Check! ${nb.name} joined your town!`, 'good');
          }
        }
      };
    }

    _pickDogName() {
      const used = new Set(this.dogs.map((d) => d.name));
      for (const n of PT.DOG_NAMES) {
        if (!used.has(n)) return n;
      }
      return `Prairie #${this.nextDogId}`;
    }

    getFoodCap() {
      return 50 + this.world.chamberCounts.granary * 45;
    }

    _stepColonyVitality(dt) {
      const pacing = PT.PACING[this.settings.pacingMode];
      const pop = this.dogs.length;
      const drainMult = this.getDrainReductionMult();

      // Food consumption & starvation pressure
      this.resources.food = Math.max(0, Math.min(this.getFoodCap(), this.resources.food - pop * pacing.foodDrainPerDog * drainMult * dt));

      // Hygiene % balance: Latrines, Gardeners, Mineral Springs & Owl vs Population, Flooding & Ticks from Untrimmed Tall Grass!
      const latrineBonus = this.world.chamberCounts.latrine * 1.55;
      const gardenerCount = this.dogs.filter((d) => d.role === PT.ROLES.GARDENER).length;
      const owlBonus = this.world.owlCol !== null ? 0.6 : 0;
      const springBonus = (this.world.springCount || 0) * 0.38;
      const floodPenalty = this.world.hasActiveFlooding() ? 2.0 : 0;
      const grassTickPenalty = this.world.tallGrassRisk > 45 ? ((this.world.tallGrassRisk - 40) * 0.022) : 0;
      const stalePenalty = this.world.airflowPct < 45 ? 0.4 : 0;
      const hygieneDelta = (latrineBonus + gardenerCount * 0.72 + owlBonus + springBonus - pop * 0.14 * pacing.hygieneDecayMult * drainMult - floodPenalty - grassTickPenalty - stalePenalty) * dt;
      this.hygienePct = Math.max(15, Math.min(100, this.hygienePct + hygieneDelta));

      // Colony Morale dynamics (food, fresh air, hygiene & clear lawns matter!)
      const starvePenalty = this.resources.food <= 0.5 ? 2.5 : 0;
      const goodConditions = (this.world.airflowPct >= 65 ? 0.45 : -0.25) + (this.hygienePct >= 70 ? 0.45 : -0.35) + (this.world.sightlineClear ? 0.25 : 0);
      this.moralePct = Math.max(15, Math.min(100, this.moralePct + (goodConditions - starvePenalty) * dt));

      // Pup Births when Nursery exists & Food/Hygiene/Airflow/Morale are healthy!
      const nurseries = this.world.getChambersOfType(PT.CELL.NURSERY);
      const popCap = 8 + nurseries.length * 4 + this.world.neighbors.filter((n) => n.merged).length * 4;
      if (nurseries.length > 0 && pop < popCap && this.resources.food >= 14 && this.hygienePct >= 55 && this.world.airflowPct >= 50 && this.moralePct >= 50) {
        const birthChance = dt * 0.032 * nurseries.length;
        if (Math.random() < birthChance) {
          const nCell = nurseries[Math.floor(Math.random() * nurseries.length)];
          const pup = new PT.PrairieDog({
            id: this.nextDogId++,
            name: this._pickDogName(),
            isPup: true,
            ageProgress: 0.08,
            col: nCell.col,
            row: nCell.row
          });
          this.dogs.push(pup);
          this.particles.spawnHearts(nCell.col, nCell.row - 0.2, 5);
          this.audio.playToothTouch();
          if (this.ui) this.ui.showToast(`New pup ${pup.name} born in the Nursery!`, 'good');
        }
      }
    }

    _onNewDay() {
      if (this.ui) this.ui.showToast(`Dawn of Day ${this.day}`, '');
    }

    _advanceWeather() {
      const pacing = PT.PACING[this.settings.pacingMode];
      this.weather = this.nextWeather;
      const pool = [PT.WEATHER.SUNNY, PT.WEATHER.GOLDEN, PT.WEATHER.CLOUDY, PT.WEATHER.STORM];
      // Higher storm probability after Cloudy
      if (this.weather.id === 'CLOUDY' && Math.random() < 0.55 * pacing.stormFreqMult) {
        this.nextWeather = PT.WEATHER.STORM;
      } else if (this.weather.id === 'STORM') {
        this.nextWeather = PT.WEATHER.SUNNY;
      } else {
        this.nextWeather = pool[Math.floor(Math.random() * 3)];
      }
      this.weatherTimer = this.weather.id === 'STORM' ? 24 : 34;
      if (this.weather.id === 'STORM' && this.ui) {
        this.ui.showToast('Prairie Storm rolling in! Crater Mounds block flooding.', 'warn');
        if (this.settings.screenShake && this.renderer) this.renderer.triggerShake(4, 0.3);
      }
    }

    // ==================== GUIDED FIRST DAY (READ-FRIENDLY — NEVER AUTO-CLOSES ON TIMER) ====================
    _stepTutorial(dt) {
      this.tutorialTimer += dt;
      if (this.tutorialStep === 0) {
        // Step 1: Advances only when the PLAYER trims grass (or clicks Next ->)
        if (this.playerTrimmedGrass) {
          this.tutorialStep = 1;
        }
      } else if (this.tutorialStep === 1) {
        // Step 2: Advances when Bernoulli airflow is built
        if (this.world.bernoulliActive) {
          this.tutorialStep = 2;
        }
      } else if (this.tutorialStep === 2) {
        // Step 3: Advances when Nursery/Listening built OR predator alarm triggers
        if (this.activeAlarm || this.world.chamberCounts.nursery > 0) {
          this.tutorialStep = 3;
        }
      } else if (this.tutorialStep === 3) {
        if (this.successfulAlarms > 0) {
          this.tutorialDone = true;
          if (this.ui) this.ui.showToast('Day 1 Guide complete — enjoy building your Prairie Town!', 'good');
        }
      }
    }

    nextTutorialStep() {
      if (this.tutorialStep < PT.TUTORIAL_STEPS.length - 1) {
        this.tutorialStep += 1;
      } else {
        this.tutorialDone = true;
      }
      if (this.ui) this.ui.updateHUD();
    }

    skipTutorial() {
      this.tutorialDone = true;
      if (this.ui) this.ui.updateHUD();
    }

    // ==================== PREDATORS & TACTICAL ALARM MINI-GAME ====================
    _stepPredators(dt) {
      const pacing = PT.PACING[this.settings.pacingMode];

      if (!this.activeAlarm && this.predators.length === 0) {
        this.predatorCooldown -= dt;
        if (this.predatorCooldown <= 0) {
          const [minI, maxI] = pacing.predatorInterval;
          this.predatorCooldown = minI + Math.random() * (maxI - minI);

          const types = ['HAWK', 'COYOTE', 'HUMAN'];
          // Gentle first guided predator is Hawk or Coyote
          const type = this.day === 1 && this.successfulAlarms === 0
            ? 'HAWK'
            : types[Math.floor(Math.random() * types.length)];

          const pred = new PT.Predator(type, this.world, null);
          this.predators.push(pred);
        }
      }

      const sentryBonus = this.getSentryRangeBonus();
      for (let i = this.predators.length - 1; i >= 0; i--) {
        const p = this.predators[i];
        p.update(dt, this.world, this.dogs, sentryBonus);

        if (p.alarmTriggered && !p.alarmResolved && !this.activeAlarm) {
          this.totalAlarmsTriggered += 1;
          const isFirstPause = (this.totalAlarmsTriggered === 1) && !this.autonomousVictory;
          const isPausedAlert = isFirstPause;

          let windowSec = pacing.alarmWindowSec;
          if (p.isAmbush) windowSec -= 3.8;
          else if (p.earlySpotted) windowSec += 3.2;
          if (this.world.owlCol !== null) windowSec += 2.2;
          windowSec = Math.max(3.8, Number(windowSec.toFixed(1)));

          this.activeAlarm = {
            predator: p,
            spotterName: p.detectedBySentryName || 'Sentry',
            timeMax: windowSec,
            timeLeft: windowSec,
            isPausedAlert,
            isFirstPause,
            isAmbush: !!p.isAmbush,
            earlySpotted: !!p.earlySpotted,
            isWorkerEncounter: !!p.isWorkerEncounter,
            autoTimer: 0.9
          };
          this.audio.playClick();
        }

        if (p.type === 'COYOTE' && p.state === 'digging_shallow' && Math.random() < dt * 8) {
          this.particles.spawnDirt(p.xCol, 0.1, 2, -p.dir);
        }

        if (p.done) {
          if (this.activeAlarm && this.activeAlarm.predator.id === p.id) {
            this.resolveAlarm(null);
          }
          this.predators.splice(i, 1);
        }
      }
    }

    resolveAlarm(callId) {
      if (!this.activeAlarm) return;
      const { predator, timeMax, timeLeft, isPausedAlert } = this.activeAlarm;
      const expected = PT.PREDATORS[predator.type].callId;
      const success = callId === expected;

      predator.alarmResolved = true;
      predator.alarmSuccess = success;

      const sentries = this.dogs.filter((d) => !d.isPup && d.role === PT.ROLES.SENTRY);
      const caller = sentries[0] || this.dogs[0];

      if (callId) {
        this.audio.playSemanticCall(callId);
        if (caller) {
          this.particles.spawnSoundwave(caller.col, caller.row, callId, success ? 1.3 : 0.75);
        }
      } else {
        this.audio.playFailAlert();
      }

      if (success) {
        this.successfulAlarms += 1;
        this.alarmStreak += 1;
        this.unlockAlmanac('semantic_calls');
        for (const d of this.dogs) {
          if (d.row < 0.8) d.triggerDive(true);
          else if (!d.isPup) d.sprintBoostTimer = 6.5;
        }
        this.audio.playDive();
        this.hygienePct = Math.min(100, this.hygienePct + 2);
        this.moralePct = Math.min(100, this.moralePct + 5);
        const fastBonus = (!isPausedAlert && timeLeft >= timeMax * 0.45) || this.alarmStreak >= 2;
        if (fastBonus) {
          this.resources.food = Math.min(this.getFoodCap(), this.resources.food + 3);
          this.resources.dirt += 3;
        }
        if (this.ui) {
          const streakNote = this.alarmStreak >= 2 ? ` (${this.alarmStreak}x Streak: +3 Food & Dirt!)` : (fastBonus ? ' (Quick Reflex: +3 Food & Dirt!)' : '');
          this.ui.showToast(`Perfect ${PT.PREDATORS[predator.type].callName}! Colony dived cleanly!${streakNote}`, 'good');
        }
      } else {
        this.alarmStreak = 0;
        this.moralePct = Math.max(15, this.moralePct - 12);
        this.audio.playFailAlert();
        if (this.settings.screenShake && this.renderer) {
          this.renderer.triggerShake(7, 0.4);
        }
        for (const d of this.dogs) {
          if (d.row < 0.4) d.triggerDive(false);
        }

        // Predator-specific tangible consequences!
        let lostFood = Math.min(5, Math.floor(this.resources.food));
        let extraMsg = '';
        if (predator.type === 'COYOTE') {
          lostFood = Math.min(8, Math.floor(this.resources.food));
          const collapsed = this.world.applyCoyoteShallowDamage(Math.round(predator.targetCol));
          if (collapsed > 0) {
            for (const d of this.dogs) {
              const s = this.world.sanitizeEntityPosition(d.row, d.col, !d.isPup);
              d.row = s.row;
              d.col = s.col;
            }
            this.world.recomputeStats(this.windSpeed, this.dogs.length);
            extraMsg = ' & collapsed a shallow tunnel!';
          }
        } else if (predator.type === 'HAWK') {
          lostFood = Math.min(6, Math.floor(this.resources.food));
          for (const d of this.dogs) {
            if (d.row < 0) d.shockTimer = 2.5;
          }
        } else {
          const tc = Math.round(predator.targetCol);
          if (this.world.mounds[tc]?.type === PT.MOUND.RAW) {
            this.world.water[0][tc] = Math.min(0.6, this.world.water[0][tc] + 0.35);
            extraMsg = ' & scuffed raw entrance!';
          }
        }
        this.resources.food = Math.max(0, this.resources.food - lostFood);
        if (this.ui) {
          this.ui.showToast(
            `${callId ? 'Wrong call!' : 'Time ran out!'} (-${lostFood} Food${extraMsg})`,
            'warn'
          );
        }
      }

      this.activeAlarm = null;
    }

    emergencyRecall() {
      this.audio.ensureContext();
      this.audio.playHawkChirp();
      for (const d of this.dogs) {
        if (!d.isPup && d.row < 0.8) {
          d.triggerDive(true);
        }
      }
      if (this.ui) this.ui.showToast('📣 Recall Whistle! Surface colony diving to safety!', 'good');
    }

    // ==================== PROGRESSION & ALMANAC ====================
    unlockAlmanac(id) {
      if (this.unlockedAlmanac.includes(id)) return;
      this.unlockedAlmanac.push(id);
      this.unreadAlmanac = true;
      const entry = PT.ALMANAC.find((a) => a.id === id);
      if (entry && this.ui) {
        this.ui.showToast(`Almanac Unlocked: ${entry.title}!`, 'good');
      }
    }

    getRankProgressDetails() {
      const w = this.world;
      const mergedCount = w.neighbors.filter((n) => n.merged).length;

      if (this.colonyRank === 0) {
        return [
          { label: 'Build a flood-proof Crater Mound', done: w.moundCounts.crater >= 1 },
          { label: 'Connect a Dome Mound for Bernoulli Airflow', done: w.bernoulliActive },
          { label: 'Excavate a Granary storage vault', done: w.chamberCounts.granary >= 1 }
        ];
      }
      if (this.colonyRank === 1) {
        return [
          { label: 'Carve a deep Nursery (>1.5m below surface)', done: w.chamberCounts.nursery >= 1 },
          { label: 'Build a Listening Chamber & Latrine', done: w.chamberCounts.listening >= 1 && w.chamberCounts.latrine >= 1 },
          { label: 'Welcome 1 Neighbor via Tooth-Touch Kin Check', done: mergedCount >= 1 }
        ];
      }
      if (this.colonyRank === 2) {
        return [
          { label: 'Merge 3+ Neighbor Coteries', done: mergedCount >= 3 },
          { label: 'Grow Coterie to 14+ Prairie Dogs', done: this.dogs.length >= 14 },
          { label: 'Maintain Bernoulli Airflow & 70%+ Hygiene', done: w.bernoulliActive && this.hygienePct >= 70 }
        ];
      }
      return this.getVictoryChecklist();
    }

    getVictoryChecklist() {
      const w = this.world;
      const mergedCount = w.neighbors.filter((n) => n.merged).length;
      return [
        { label: 'Bernoulli Fresh Air (>=75%) + Flood-Proof Crater Mound', done: w.bernoulliActive && w.airflowPct >= 75 && w.moundCounts.crater >= 1 },
        { label: 'Grand Burrow: 2+ Deep Nurseries, 2+ Granaries, 2+ Latrines & 2+ Listening Chambers', done: w.chamberCounts.nursery >= 2 && w.chamberCounts.granary >= 2 && w.chamberCounts.latrine >= 2 && w.chamberCounts.listening >= 2 },
        { label: 'Clear Prairie Sightlines (Grass Risk <=25%) & Owl Ally Settled', done: w.tallGrassRisk <= 25 && w.owlCol !== null },
        { label: `Unite All 6 Valley Neighbor Coteries (${mergedCount}/6)`, done: mergedCount >= 6 },
        { label: `Self-Sustaining Population (20+ Dogs, 75%+ Hygiene & Morale)`, done: this.dogs.length >= 20 && this.hygienePct >= 75 && this.moralePct >= 75 }
      ];
    }

    _checkAchievementsAndVictory(dt) {
      const w = this.world;
      const mergedCount = w.neighbors.filter((n) => n.merged).length;

      if (this.trimmedCount >= 3) this.unlockAchievement('trim_first');
      if (this.foundDepositCount >= 1) this.unlockAchievement('clay_finder');
      if (w.moundCounts.crater >= 1) this.unlockAchievement('crater_built');
      if (w.bernoulliActive) this.unlockAchievement('bernoulli_air');
      if (w.chamberCounts.nursery >= 1) this.unlockAchievement('deep_nursery');
      if (w.chamberCounts.listening >= 1 && w.chamberCounts.latrine >= 1 && w.chamberCounts.granary >= 1) this.unlockAchievement('vital_rooms');
      if (w.owlCol !== null) this.unlockAchievement('owl_ally');
      if (this.successfulAlarms >= 3) this.unlockAchievement('alarm_ace');
      if (mergedCount >= 1) this.unlockAchievement('kin_merge_1');
      if (mergedCount >= 3) this.unlockAchievement('kin_merge_3');
      if (mergedCount >= 6) this.unlockAchievement('valley_unifier');

      if (!this.autonomousVictory) {
        const checklist = this.getVictoryChecklist();
        if (checklist.every((item) => item.done)) {
          this.autonomousVictory = true;
          this.unlockAchievement('autonomous_town');
          if (this.colonyRank < 3) this._promoteRank(3);
          if (this.ui) {
            this.ui.openVictoryModal();
          }
        }
      } else {
        // Colony runs & sustains itself automatically forever without player help!
        this._stepAutonomousColony(dt);
      }
    }

    _stepAutonomousColony(dt) {
      // Gentle self-balancing maintenance once the player completes the Grand Autonomous Town goal:
      if (Math.random() < dt * 0.5) {
        const entrances = this.world.getEntrances();
        const sentries = this.dogs.filter((d) => !d.isPup && d.role === PT.ROLES.SENTRY);
        const foragers = this.dogs.filter((d) => !d.isPup && d.role === PT.ROLES.FORAGER);
        const idle = this.dogs.find((d) => !d.isPup && d.role === PT.ROLES.IDLE);
        if (idle) {
          if (sentries.length < entrances.length) idle.setRole(PT.ROLES.SENTRY);
          else if (foragers.length < 3 || this.resources.food < 40) idle.setRole(PT.ROLES.FORAGER);
          else if (this.hygienePct < 85 || this.world.tallGrassRisk > 25) idle.setRole(PT.ROLES.GARDENER);
        }
      }
    }

    _checkRankProgression() {
      const w = this.world;
      const mergedCount = w.neighbors.filter((n) => n.merged).length;

      if (this.colonyRank === 0 && w.moundCounts.crater >= 1 && w.bernoulliActive && w.chamberCounts.granary >= 1) {
        this._promoteRank(1);
      } else if (
        this.colonyRank === 1 &&
        w.chamberCounts.nursery >= 1 &&
        w.chamberCounts.listening >= 1 &&
        w.chamberCounts.latrine >= 1 &&
        mergedCount >= 1
      ) {
        this._promoteRank(2);
      } else if (
        this.colonyRank === 2 &&
        mergedCount >= 3 &&
        this.dogs.length >= 14 &&
        w.bernoulliActive &&
        this.hygienePct >= 70
      ) {
        this._promoteRank(3);
        this.megaTownPop = Math.max(1200, this.dogs.length * 100);
        this.unlockAlmanac('texas_megatown');
      }
    }

    _promoteRank(newRank) {
      this.colonyRank = newRank;
      const rk = PT.RANKS[newRank];
      this.audio.playRankUp();
      if (this.ui) {
        this.ui.showToast(`Colony Rank Up: ${rk.badge} ${rk.title}!`, 'good');
      }
    }

    // ==================== PLAYER ACTIONS & INPUT ====================
    setSpeed(spd) {
      this.speed = spd;
      if (this.ui) this.ui.updateHUD();
    }

    setActiveTool(tool) {
      this.activeTool = tool;
      if (this.ui) this.ui.updateHUD();
    }

    adjustRoleCount(role, delta) {
      if (delta > 0) {
        // Prefer reassigning Idle -> then largest non-target role
        let candidate = this.dogs.find((d) => !d.isPup && d.role === PT.ROLES.IDLE);
        if (!candidate) {
          const adults = this.dogs.filter((d) => !d.isPup && d.role !== role);
          if (adults.length > 0) candidate = adults[adults.length - 1];
        }
        if (candidate) {
          candidate.setRole(role);
        }
      } else if (delta < 0) {
        const candidate = this.dogs.find((d) => !d.isPup && d.role === role);
        if (candidate) {
          candidate.setRole(PT.ROLES.IDLE);
        }
      }
      if (this.ui) this.ui.updateHUD();
    }

    adjustZoom(delta) {
      if (!this.renderer) return;
      this.renderer.cam.targetZoom = Math.max(0.45, Math.min(2.1, this.renderer.cam.targetZoom + delta));
    }

    resetCamera() {
      if (!this.renderer) return;
      const centerCol = Math.round((this.world.unlockedMinCol + this.world.unlockedMaxCol) / 2);
      this.renderer.cam.targetX = centerCol * PT.CELL_SIZE;
      this.renderer.cam.targetY = 85;
      this.renderer.cam.targetZoom = 1.0;
    }

    focusCameraOn(col, row) {
      if (!this.renderer) return;
      this.renderer.cam.targetX = (col + 0.5) * PT.CELL_SIZE;
      this.renderer.cam.targetY = Math.max(-40, row * PT.CELL_SIZE);
      this._clampCamera();
    }

    jumpCameraFromMinimap(ratioX) {
      if (!this.renderer) return;
      const clamped = Math.max(0, Math.min(1, ratioX));
      const targetCol = clamped * (this.world.totalCols - 1);
      this.renderer.cam.targetX = (targetCol + 0.5) * PT.CELL_SIZE;
      this._clampCamera();
    }

    async _initPlayerCounter() {
      let alreadyCounted = false;
      try {
        if (typeof localStorage !== 'undefined') {
          this.localPlaySessions = (Number(localStorage.getItem(PT.LOCAL_SESSIONS_STORAGE)) || 0) + 1;
          localStorage.setItem(PT.LOCAL_SESSIONS_STORAGE, String(this.localPlaySessions));
          alreadyCounted = localStorage.getItem(PT.PLAYER_COUNTED_STORAGE) === '1';
        }
      } catch (_) {}

      if (this.ui) this.ui.updatePlayerCounter(this.globalPlayerCount, this.localPlaySessions);
      if (typeof fetch !== 'function') return;

      const base = `https://countapi.mileshilliard.com/api/v1`;
      const key = PT.PLAYER_COUNTER_KEY;
      const fetchJson = async (mode) => {
        const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = ctrl && typeof setTimeout === 'function' ? setTimeout(() => ctrl.abort(), 4500) : null;
        try {
          const res = await fetch(`${base}/${mode}/${key}`, ctrl ? { signal: ctrl.signal } : undefined);
          if (!res.ok) return null;
          return await res.json();
        } finally {
          if (timer && typeof clearTimeout === 'function') clearTimeout(timer);
        }
      };

      try {
        let data = await fetchJson(alreadyCounted ? 'get' : 'hit');
        if (!data && alreadyCounted) {
          data = await fetchJson('hit');
        }
        const val = data ? Number(data.value) : NaN;
        if (Number.isFinite(val) && val > 0) {
          this.globalPlayerCount = val;
          try {
            if (typeof localStorage !== 'undefined') localStorage.setItem(PT.PLAYER_COUNTED_STORAGE, '1');
          } catch (_) {}
          if (this.ui) this.ui.updatePlayerCounter(this.globalPlayerCount, this.localPlaySessions);
        }
      } catch (_) {}
    }

    _handleKeyboardPan(dt) {
      if (!this.renderer) return;
      if (this.ui && this.ui.isAnyModalOpen()) return;
      const panSpeed = (460 / this.renderer.cam.zoom) * dt;
      if (this.keysDown.has('ArrowLeft') || this.keysDown.has('KeyA')) this.renderer.cam.targetX -= panSpeed;
      if (this.keysDown.has('ArrowRight') || this.keysDown.has('KeyD')) this.renderer.cam.targetX += panSpeed;
      if (this.keysDown.has('ArrowUp') || this.keysDown.has('KeyW')) this.renderer.cam.targetY -= panSpeed;
      if (this.keysDown.has('ArrowDown') || this.keysDown.has('KeyS')) this.renderer.cam.targetY += panSpeed;
      this._clampCamera();
    }

    _clampCamera() {
      if (!this.renderer) return;
      const cs = PT.CELL_SIZE;
      this.renderer.cam.targetX = Math.max(-4 * cs, Math.min((this.world.totalCols + 4) * cs, this.renderer.cam.targetX));
      this.renderer.cam.targetY = Math.max(-180, Math.min((this.world.rows + 1) * cs, this.renderer.cam.targetY));
    }

    _bindCanvasInput() {
      const c = this.canvas;
      window.addEventListener('resize', () => this.renderer && this.renderer.resize());

      const paintCellAtEvent = (e, paintedKeys) => {
        const rect = c.getBoundingClientRect();
        const { wx, wy } = this.renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        const col = Math.floor(wx / PT.CELL_SIZE);
        const row = wy < 0 ? -1 : Math.floor(wy / PT.CELL_SIZE);
        const pKey = `${row},${col}`;
        if (paintedKeys.has(pKey) || col < 0 || col >= this.world.totalCols || row < -1 || row >= this.world.rows) return;
        paintedKeys.add(pKey);
        const res = this.world.queueTask(this.activeTool, row, col, this.resources, this.getPlacementOpts());
        if (res.ok) {
          this.audio.playClick();
          if (this.activeTool === PT.TOOLS.TRIM) this.playerTrimmedGrass = true;
        }
      };

      c.addEventListener('pointerdown', (e) => {
        this.audio.ensureContext();
        const isPaintDrag = e.shiftKey && e.button === 0 && (this.activeTool === PT.TOOLS.TUNNEL || this.activeTool === PT.TOOLS.TRIM);
        this.dragState = {
          startX: e.clientX,
          startY: e.clientY,
          camStartX: this.renderer.cam.targetX,
          camStartY: this.renderer.cam.targetY,
          moved: false,
          button: e.button,
          paintMode: isPaintDrag,
          paintedKeys: new Set()
        };
        if (isPaintDrag) paintCellAtEvent(e, this.dragState.paintedKeys);
      });

      window.addEventListener('pointermove', (e) => {
        if (this.dragState) {
          if (this.dragState.paintMode) {
            paintCellAtEvent(e, this.dragState.paintedKeys);
          } else {
            const dx = e.clientX - this.dragState.startX;
            const dy = e.clientY - this.dragState.startY;
            const threshold = (this.activeTool !== PT.TOOLS.SELECT && this.dragState.button === 0) ? 14 : 6;
            if (Math.hypot(dx, dy) > threshold || this.dragState.button !== 0) {
              this.dragState.moved = true;
              c.classList.add('panning');
              this.renderer.cam.targetX = this.dragState.camStartX - dx / this.renderer.cam.zoom;
              this.renderer.cam.targetY = this.dragState.camStartY - dy / this.renderer.cam.zoom;
              this._clampCamera();
            }
          }
        }

        // Hover grid feedback
        const rect = c.getBoundingClientRect();
        const { wx, wy } = this.renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        const col = Math.floor(wx / PT.CELL_SIZE);
        const row = wy < 0 ? -1 : Math.floor(wy / PT.CELL_SIZE);

        if (col >= 0 && col < this.world.totalCols && row >= -1 && row < this.world.rows) {
          this.hoverCell = { row, col };
          if (this.activeTool !== PT.TOOLS.SELECT) {
            const check = this.world.validatePlacement(this.activeTool, row, col, this.getPlacementOpts());
            const paintHint = (this.activeTool === PT.TOOLS.TUNNEL || this.activeTool === PT.TOOLS.TRIM) && check.ok
              ? ' (Hold Shift+Drag to paint multiple!)' : '';
            this.ui.showTooltip(`${check.reason}${paintHint}`, e.clientX, e.clientY);
          } else {
            this.ui.showTooltip(null);
          }
        } else {
          this.hoverCell = null;
          this.ui.showTooltip(null);
        }
      });

      c.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const rect = c.getBoundingClientRect();
        const { wx, wy } = this.renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        const col = Math.floor(wx / PT.CELL_SIZE);
        const row = wy < 0 ? -1 : Math.floor(wy / PT.CELL_SIZE);
        if (this.world.cancelTaskAt(row, col, this.resources)) {
          this.audio.playClick();
          if (this.ui) this.ui.showToast('Queued task cancelled & refunded.', '');
        }
      });

      window.addEventListener('pointerup', (e) => {
        if (!this.dragState) return;
        const wasDrag = this.dragState.moved || this.dragState.paintMode;
        const btn = this.dragState.button;
        this.dragState = null;
        c.classList.remove('panning');
        if (!wasDrag && btn === 0 && e.target === c) {
          this._handleCanvasClick(e);
        }
      });

      const clearHeldInput = () => {
        this.dragState = null;
        this.keysDown.clear();
        c.classList.remove('panning');
      };
      window.addEventListener('pointercancel', clearHeldInput);
      window.addEventListener('blur', clearHeldInput);

      c.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.12 : -0.12;
        this.adjustZoom(delta);
      }, { passive: false });

      window.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
        this.keysDown.add(e.code);

        if (e.code === 'Escape') {
          if (this.ui.isAnyModalOpen()) {
            this.ui.closeModal('welcome-modal');
            this.ui.closeModal('skills-modal');
            this.ui.closeModal('victory-modal');
            this.ui.closeModal('settings-modal');
            this.ui.closeModal('almanac-modal');
            this.ui.closeModal('manual-modal');
            this.ui.closeModal('rank-modal');
          } else {
            this.setActiveTool(PT.TOOLS.SELECT);
          }
          return;
        }

        if (e.code === 'KeyB') {
          this.emergencyRecall();
          return;
        }

        if (e.code === 'KeyU') {
          if (this.ui.els.skillsModal && !this.ui.els.skillsModal.classList.contains('hidden')) {
            this.ui.closeModal('skills-modal');
          } else if (!this.ui.isAnyModalOpen()) {
            this.ui.openSkillsModal();
          }
          return;
        }

        if (e.code === 'KeyH' || e.key === '?') {
          if (this.ui.els.manualModal && !this.ui.els.manualModal.classList.contains('hidden')) {
            this.ui.closeModal('manual-modal');
          } else if (!this.ui.isAnyModalOpen()) {
            this.ui.openModal('manual-modal');
          }
          return;
        }

        if (this.ui.isAnyModalOpen()) return;

        // Alarm hotkeys 1, 2, 3
        if (this.activeAlarm) {
          if (e.key === '1') { this.resolveAlarm('hawk_chirp'); return; }
          if (e.key === '2') { this.resolveAlarm('coyote_bark'); return; }
          if (e.key === '3') { this.resolveAlarm('human_whistle'); return; }
        }

        if (e.code === 'Space') {
          e.preventDefault();
          this.setSpeed(this.speed === 0 ? 1 : 0);
        } else if (e.key === '+' || e.key === '=') {
          this.adjustZoom(0.15);
        } else if (e.key === '-') {
          this.adjustZoom(-0.15);
        } else if (e.code === 'KeyV') this.setActiveTool(PT.TOOLS.SELECT);
        else if (e.code === 'KeyG') this.setActiveTool(PT.TOOLS.TRIM);
        else if (e.code === 'KeyT') this.setActiveTool(PT.TOOLS.TUNNEL);
        else if (e.code === 'KeyC') this.setActiveTool(PT.TOOLS.CRATER);
        else if (e.code === 'KeyD') this.setActiveTool(PT.TOOLS.DOME);
        else if (e.code === 'KeyL') this.setActiveTool(PT.TOOLS.LISTENING);
        else if (e.code === 'KeyN') this.setActiveTool(PT.TOOLS.NURSERY);
        else if (e.code === 'KeyR') this.setActiveTool(PT.TOOLS.LATRINE);
        else if (e.code === 'KeyF') this.setActiveTool(PT.TOOLS.GRANARY);
        else if (e.code === 'KeyK') this.setActiveTool(PT.TOOLS.KIN_CHECK);
      });

      window.addEventListener('keyup', (e) => {
        this.keysDown.delete(e.code);
      });
    }

    _handleCanvasClick(e) {
      const rect = this.canvas.getBoundingClientRect();
      const { wx, wy } = this.renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const col = Math.floor(wx / PT.CELL_SIZE);
      const row = wy < 0 ? -1 : Math.floor(wy / PT.CELL_SIZE);

      if (this.activeTool === PT.TOOLS.SELECT) {
        // 1. Check clicked prairie dog first
        const clickColF = wx / PT.CELL_SIZE - 0.5;
        const clickRowF = wy < 0 ? -0.4 : wy / PT.CELL_SIZE - 0.65;
        let hitDog = null;
        let bestD = 0.9;
        for (const dog of this.dogs) {
          const dy = dog.row < -0.2 ? (wy < 0 ? 0 : 2) : Math.abs(dog.row - clickRowF);
          const dist = Math.hypot(dog.col - clickColF, dy);
          if (dist < bestD) {
            bestD = dist;
            hitDog = dog;
          }
        }
        if (hitDog) {
          this.ui.showDogInspector(hitDog);
          return;
        }
        // 2. Check clicked Golden Seed Bloom on surface for quick player harvest!
        if (row < 0) {
          const bIdx = this.world.blooms.findIndex((b) => Math.abs(b.col - col) <= 1);
          if (bIdx !== -1) {
            const bloom = this.world.blooms.splice(bIdx, 1)[0];
            this.resources.food = Math.min(this.getFoodCap(), this.resources.food + bloom.food);
            this.moralePct = Math.min(100, this.moralePct + 3);
            this.particles.spawnHearts(bloom.col, -0.35, 6);
            this.audio.playToothTouch();
            this.ui.showToast(`Harvested Golden Clover Bloom! (+${bloom.food} Food)`, 'good');
            return;
          }
        }
        // 3. Check clicked underground Flood Puddle to bail/drain water manually!
        if (row >= 0 && this.world.inBounds(row, col) && this.world.water[row][col] > 0.2) {
          this.world.water[row][col] = Math.max(0, this.world.water[row][col] - 0.45);
          this.audio.playClick();
          this.ui.showToast('Bailed out storm puddle!', 'good');
        }
        if (col >= 0 && col < this.world.totalCols && row >= -1 && row < this.world.rows) {
          this.ui.showCellInspector(row, col);
        }
        return;
      }

      if (this.activeTool === PT.TOOLS.KIN_CHECK) {
        const check = this.world.validatePlacement(PT.TOOLS.KIN_CHECK, Math.max(0, row), col);
        if (!check.ok) {
          this.ui.showToast(check.reason, 'warn');
          return;
        }
        this._dispatchKinEnvoy(check.neighbor);
        return;
      }

      const res = this.world.queueTask(this.activeTool, row, col, this.resources, this.getPlacementOpts());
      if (!res.ok) {
        this.ui.showToast(res.reason, 'warn');
      } else {
        this.audio.playClick();
        if (this.activeTool === PT.TOOLS.TRIM) {
          this.playerTrimmedGrass = true;
          this.ui.showToast('Marked tall grass for trimming!', '');
        } else if (this.activeAlarm && this.activeAlarm.isPausedAlert) {
          this.ui.showToast('Queued! Respond to 1st Sentry Alert (1, 2, or 3) to resume.', 'warn');
        } else if (!this.dogs.some((d) => !d.isPup && d.role === PT.ROLES.DIGGER)) {
          this.ui.showToast('Queued! Note: Assign at least 1 Digger (-/+) at bottom-right to excavate.', 'warn');
        }
      }
    }

    _dispatchKinEnvoy(nb) {
      const envoy = this.dogs.find((d) => !d.isPup && d.role !== PT.ROLES.SENTRY) || this.dogs.find((d) => !d.isPup);
      if (!envoy) return;
      const targetCol = nb.side === 'east' ? nb.borderCol - 1 : nb.borderCol + 1;
      // Find open cell at that column
      let targetRow = 2;
      for (let r = 0; r < this.world.rows; r++) {
        if (this.world.isOpenCell(r, targetCol)) {
          targetRow = r;
          break;
        }
      }
      const curR = envoy.row < -0.2 ? -1 : Math.round(envoy.row);
      const path = this.world.findPath(curR, Math.round(envoy.col), targetRow, targetCol, true);
      if (path) {
        envoy.path = path;
        envoy.state = 'moving';
        envoy.targetTaskId = null;
        envoy.pauseCheckTimer = 0;
        envoy.targetNeighborId = nb.id;
        envoy.actionLabel = `Meeting ${nb.name} for Tooth-Touch!`;
        this.audio.playClick();
        this.ui.showToast(`${envoy.name} is trotting to greet ${nb.name}!`, 'good');
      } else if (this.ui) {
        this.ui.showToast('Connect a tunnel path to that border first!', 'warn');
      }
    }

    // ==================== SETTINGS & SAVE / EXPORT / IMPORT ====================
    applySettings() {
      this.audio.updateSettings({
        muted: this.settings.muted,
        masterVol: this.settings.masterVol,
        sfxVol: this.settings.sfxVol,
        ambVol: this.settings.ambVol
      });
      this.particles.setDensity(this.settings.particleDensity);
      this.saveSettings();
      if (this.ui) this.ui.syncSettingsUI();
    }

    saveSettings() {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(PT.SETTINGS_KEY, JSON.stringify(this.settings));
        }
      } catch (_) {}
    }

    loadSettings() {
      try {
        if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem(PT.SETTINGS_KEY);
          if (raw) Object.assign(this.settings, JSON.parse(raw));
        }
      } catch (_) {}
    }

    exportSaveJSON() {
      const payload = {
        version: PT.VERSION,
        savedAt: new Date().toISOString(),
        day: this.day,
        dayProgress: this.dayProgress,
        resources: this.resources,
        hygienePct: this.hygienePct,
        moralePct: this.moralePct,
        colonyRank: this.colonyRank,
        megaTownPop: this.megaTownPop,
        unlockedAlmanac: this.unlockedAlmanac,
        unlockedAchievements: this.unlockedAchievements,
        skillPoints: this.skillPoints,
        totalSpEarned: this.totalSpEarned,
        skillLevels: this.skillLevels,
        trimmedCount: this.trimmedCount,
        foundDepositCount: this.foundDepositCount,
        autonomousVictory: this.autonomousVictory,
        successfulAlarms: this.successfulAlarms,
        totalAlarmsTriggered: this.totalAlarmsTriggered,
        alarmStreak: this.alarmStreak,
        welcomeShown: this.welcomeShown,
        tutorialDone: this.tutorialDone,
        tutorialStep: this.tutorialStep,
        nextDogId: this.nextDogId,
        weatherId: this.weather.id,
        nextWeatherId: this.nextWeather.id,
        settings: this.settings,
        world: this.world.serialize(),
        dogs: this.dogs.map((d) => ({
          id: d.id,
          name: d.name,
          isPup: d.isPup,
          role: d.role,
          ageProgress: d.ageProgress,
          col: Number(d.col.toFixed(2)),
          row: Number(d.row.toFixed(2)),
          facing: d.facing
        }))
      };
      return JSON.stringify(payload);
    }

    importSaveJSON(jsonString) {
      try {
        const data = JSON.parse(jsonString);
        if (!data || !data.world || !Array.isArray(data.dogs)) return false;

        const wOk = this.world.deserialize(data.world);
        if (!wOk) return false;

        this.day = data.day ?? 1;
        this.dayProgress = data.dayProgress ?? 0.15;
        this.resources = data.resources || { food: 28, dirt: 18 };
        this.hygienePct = data.hygienePct ?? 90;
        this.moralePct = data.moralePct ?? 86;
        this.colonyRank = data.colonyRank ?? 0;
        this.megaTownPop = data.megaTownPop ?? 0;
        this.unlockedAlmanac = Array.isArray(data.unlockedAlmanac) ? data.unlockedAlmanac : [];
        this.unlockedAchievements = Array.isArray(data.unlockedAchievements) ? data.unlockedAchievements : [];
        this.skillPoints = data.skillPoints ?? 0;
        this.totalSpEarned = data.totalSpEarned ?? 0;
        this.skillLevels = Object.assign({ work_queue: 0, excavate_brush: 0, dig_speed: 0, colony_harmony: 0 }, data.skillLevels || {});
        this.trimmedCount = data.trimmedCount ?? 0;
        this.foundDepositCount = data.foundDepositCount ?? 0;
        this.autonomousVictory = !!data.autonomousVictory;
        this.successfulAlarms = data.successfulAlarms ?? 0;
        this.totalAlarmsTriggered = data.totalAlarmsTriggered ?? this.successfulAlarms;
        this.alarmStreak = data.alarmStreak ?? 0;
        this.welcomeShown = !!data.welcomeShown;
        this.tutorialDone = !!data.tutorialDone;
        this.tutorialStep = data.tutorialStep ?? 0;
        this.nextDogId = data.nextDogId ?? 10;

        if (data.weatherId && PT.WEATHER[data.weatherId]) this.weather = PT.WEATHER[data.weatherId];
        if (data.nextWeatherId && PT.WEATHER[data.nextWeatherId]) this.nextWeather = PT.WEATHER[data.nextWeatherId];
        if (data.settings) Object.assign(this.settings, data.settings);

        this.dogs = data.dogs.map((d) => {
          const dog = new PT.PrairieDog(d);
          const safe = this.world.sanitizeEntityPosition(dog.row, dog.col, !dog.isPup);
          dog.row = safe.row;
          dog.col = safe.col;
          return dog;
        });
        this.predators = [];
        this.activeAlarm = null;
        this.world.recomputeStats(this.windSpeed, this.dogs.length);
        this.applySettings();
        this.saveGame(false);
        if (this.ui) this.ui.updateHUD();
        return true;
      } catch (_) {
        return false;
      }
    }

    saveGame(showToastFlag = false) {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(PT.STORAGE_KEY, this.exportSaveJSON());
        }
        const stamp = new Date().toLocaleTimeString();
        if (this.ui) {
          this.ui.updateSaveStatus(`Last saved: ${stamp}`);
          if (showToastFlag) this.ui.showToast('Colony saved!', 'good');
        }
        return true;
      } catch (_) {
        return false;
      }
    }

    loadFromLocalStorage() {
      try {
        if (typeof localStorage === 'undefined') return false;
        const raw = localStorage.getItem(PT.STORAGE_KEY);
        if (!raw) return false;
        return this.importSaveJSON(raw);
      } catch (_) {
        return false;
      }
    }

    resetColony(worldStyle = null, newSeed = null) {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(PT.STORAGE_KEY);
        }
      } catch (_) {}

      if (worldStyle && PT.WORLD_STYLES[worldStyle]) {
        this.worldStyle = worldStyle;
      }
      this.world = new PT.World(this.worldStyle, newSeed);
      this.particles = new PT.ParticleSystem();
      this.day = 1;
      this.dayProgress = 0.12;
      this.weather = PT.WEATHER.SUNNY;
      this.nextWeather = PT.WEATHER.GOLDEN;
      this.resources = { food: 28, dirt: 18 };
      this.hygienePct = 90;
      this.moralePct = 86;
      this.colonyRank = 0;
      this.megaTownPop = 0;
      this.dogs = [];
      this.nextDogId = 1;
      this.predators = [];
      this.predatorCooldown = 22;
      this.activeAlarm = null;
      this.unlockedAlmanac = [];
      this.unreadAlmanac = false;
      this.unlockedAchievements = [];
      this.skillPoints = 0;
      this.totalSpEarned = 0;
      this.skillLevels = { work_queue: 0, excavate_brush: 0, dig_speed: 0, colony_harmony: 0 };
      this.trimmedCount = 0;
      this.foundDepositCount = 0;
      this.autonomousVictory = false;
      this.successfulAlarms = 0;
      this.totalAlarmsTriggered = 0;
      this.alarmStreak = 0;
      this.tutorialDone = false;
      this.tutorialStep = 0;
      this.tutorialTimer = 0;
      this.playerTrimmedGrass = false;
      this._initStarterColony();
      this.resetCamera();
      this.saveGame(false);
      if (this.ui) this.ui.updateHUD();
    }
  }

  PT.Game = Game;

  // Bootstrap when DOM is ready in browser
  if (typeof document !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
      const canvas = document.getElementById('game-canvas');
      if (canvas) {
        const game = new PT.Game(canvas);
        root.PT_GAME = game;
        game.boot();
      }
    });
  }
})(window);
