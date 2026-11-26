/**
 * PRAIRIE TOWN: Coterie & Burrow
 * DOM UI controller: HUD updates, Inspector, Alarm Wheel, Settings Modal, Almanac, and Toasts.
 */
(function (root) {
  'use strict';

  const PT = (root.PT = root.PT || {});

  class UIController {
    constructor(game) {
      this.game = game;
      this.els = {
        canvas: document.getElementById('game-canvas'),
        rankIcon: document.getElementById('hud-rank-icon'),
        rankTitle: document.getElementById('hud-rank-title'),
        dayTime: document.getElementById('hud-day-time'),
        food: document.getElementById('hud-food'),
        dirt: document.getElementById('hud-dirt'),
        airflow: document.getElementById('hud-airflow'),
        airflowPill: document.getElementById('pill-airflow'),
        bernoulliTag: document.getElementById('hud-bernoulli-tag'),
        hygiene: document.getElementById('hud-hygiene'),
        grassRisk: document.getElementById('hud-grass-risk'),
        sightlinePill: document.getElementById('pill-sightline'),
        morale: document.getElementById('hud-morale'),
        moralePill: document.getElementById('pill-morale'),
        pop: document.getElementById('hud-pop'),
        weatherIco: document.getElementById('hud-weather-ico'),
        weatherLabel: document.getElementById('hud-weather-label'),
        weatherForecast: document.getElementById('hud-weather-forecast'),
        megatownPill: document.getElementById('megatown-scale-pill'),
        megatownPop: document.getElementById('hud-megatown-pop'),

        almanacBadge: document.getElementById('almanac-badge'),
        tutorialCard: document.getElementById('tutorial-card'),
        tutorialTitle: document.getElementById('tutorial-title'),
        tutorialText: document.getElementById('tutorial-text'),
        tutorialHint: document.getElementById('tutorial-hint'),
        tutorialDots: document.getElementById('tutorial-dots'),

        toastStack: document.getElementById('toast-stack'),
        pauseBanner: document.getElementById('pause-banner'),
        tooltip: document.getElementById('canvas-tooltip'),

        inspector: document.getElementById('inspector-panel'),
        inspectorTitle: document.getElementById('inspector-title'),
        inspectorBody: document.getElementById('inspector-body'),

        alarmOverlay: document.getElementById('alarm-overlay'),
        alarmSpotter: document.getElementById('alarm-spotter'),
        alarmTimerText: document.getElementById('alarm-timer-text'),
        alarmClueIcon: document.getElementById('alarm-clue-icon'),
        alarmClueTitle: document.getElementById('alarm-clue-title'),
        alarmClueDesc: document.getElementById('alarm-clue-desc'),
        alarmProgressFill: document.getElementById('alarm-progress-fill'),

        welcomeModal: document.getElementById('welcome-modal'),
        skillsModal: document.getElementById('skills-modal'),
        skillsModalBody: document.getElementById('skills-modal-body'),
        skillsSpSummary: document.getElementById('skills-sp-summary'),
        victoryModal: document.getElementById('victory-modal'),
        hudSpBadge: document.getElementById('hud-sp-badge'),
        hudQueueCap: document.getElementById('hud-queue-cap'),
        hudPlayersCount: document.getElementById('hud-players-count'),
        playerCountPill: document.getElementById('player-count-pill'),
        minimapCanvas: document.getElementById('minimap-canvas'),
        settingsModal: document.getElementById('settings-modal'),
        almanacModal: document.getElementById('almanac-modal'),
        manualModal: document.getElementById('manual-modal'),
        rankModal: document.getElementById('rank-modal'),
        rankModalBody: document.getElementById('rank-modal-body'),
        almanacGrid: document.getElementById('almanac-grid'),
        almanacProgress: document.getElementById('almanac-progress'),

        cntSentry: document.getElementById('cnt-sentry'),
        cntDigger: document.getElementById('cnt-digger'),
        cntForager: document.getElementById('cnt-forager'),
        cntGardener: document.getElementById('cnt-gardener'),
        cntIdle: document.getElementById('cnt-idle-badge'),
        btnToolKin: document.getElementById('btn-tool-kin'),
        btnToggleAirflow: document.getElementById('btn-toggle-airflow'),

        optMute: document.getElementById('opt-mute'),
        optMasterVol: document.getElementById('opt-master-vol'),
        optSfxVol: document.getElementById('opt-sfx-vol'),
        optAmbVol: document.getElementById('opt-amb-vol'),
        lblMasterVol: document.getElementById('lbl-master-vol'),
        lblSfxVol: document.getElementById('lbl-sfx-vol'),
        lblAmbVol: document.getElementById('lbl-amb-vol'),
        optShake: document.getElementById('opt-shake'),
        optAirflow: document.getElementById('opt-airflow'),
        optParticles: document.getElementById('opt-particles'),
        optPacing: document.getElementById('opt-pacing'),

        saveStatusText: document.getElementById('save-status-text'),
        saveCodeArea: document.getElementById('save-code-area'),
        saveFeedback: document.getElementById('save-feedback'),
        resetConfirmBox: document.getElementById('reset-confirm-box'),
        speedBtns: [...document.querySelectorAll('.speed-btn')],
        toolBtns: [...document.querySelectorAll('.tool-btn')]
      };

      this._bindEvents();
    }

    _bindEvents() {
      const g = this.game;

      // Speed controls
      document.querySelectorAll('.speed-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          g.audio.ensureContext();
          g.audio.playClick();
          g.setSpeed(Number(btn.dataset.speed));
        });
      });

      // Tool buttons
      document.querySelectorAll('.tool-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          g.audio.ensureContext();
          g.audio.playClick();
          g.setActiveTool(btn.dataset.tool);
        });
      });

      // Role +/- adjusters
      document.querySelectorAll('.role-adj').forEach((btn) => {
        btn.addEventListener('click', () => {
          g.audio.ensureContext();
          g.audio.playClick();
          g.adjustRoleCount(btn.dataset.role, Number(btn.dataset.delta));
        });
      });

      // Camera & Overlay quick controls
      this.els.btnToggleAirflow.addEventListener('click', () => {
        g.audio.ensureContext();
        g.audio.playClick();
        g.settings.airflowOverlay = !g.settings.airflowOverlay;
        this.syncSettingsUI();
        g.saveSettings();
      });
      document.getElementById('btn-zoom-in').addEventListener('click', () => g.adjustZoom(0.18));
      document.getElementById('btn-zoom-out').addEventListener('click', () => g.adjustZoom(-0.18));
      document.getElementById('btn-cam-reset').addEventListener('click', () => g.resetCamera());

      if (this.els.minimapCanvas) {
        let mapDragging = false;
        const panToEvent = (e) => {
          const rect = this.els.minimapCanvas.getBoundingClientRect();
          const rx = (e.clientX - rect.left) / Math.max(1, rect.width);
          g.jumpCameraFromMinimap(rx);
        };
        this.els.minimapCanvas.addEventListener('pointerdown', (e) => {
          mapDragging = true;
          panToEvent(e);
        });
        window.addEventListener('pointermove', (e) => {
          if (mapDragging) panToEvent(e);
        });
        window.addEventListener('pointerup', () => {
          mapDragging = false;
        });
      }

      // Header & Welcome controls
      document.getElementById('btn-whistle').addEventListener('click', () => g.emergencyRecall());
      document.getElementById('btn-skills').addEventListener('click', () => this.openSkillsModal());
      document.getElementById('btn-manual').addEventListener('click', () => this.openModal('manual-modal'));
      document.getElementById('btn-victory-continue').addEventListener('click', () => this.closeModal('victory-modal'));
      document.getElementById('btn-victory-new').addEventListener('click', () => {
        this.closeModal('victory-modal');
        this.openModal('welcome-modal');
      });
      document.getElementById('btn-open-welcome').addEventListener('click', () => {
        this.closeModal('manual-modal');
        this.openModal('welcome-modal');
      });
      document.getElementById('btn-settings').addEventListener('click', () => this.openModal('settings-modal'));
      document.getElementById('btn-almanac').addEventListener('click', () => this.openAlmanac());
      document.getElementById('btn-rank-badge').addEventListener('click', () => this.openRankModal());
      document.getElementById('btn-roster').addEventListener('click', () => this.showRosterInspector());
      document.getElementById('btn-close-inspector').addEventListener('click', () => this.closeInspector());

      document.querySelectorAll('.world-style-card').forEach((card) => {
        card.addEventListener('click', () => {
          document.querySelectorAll('.world-style-card').forEach((c) => c.classList.remove('active'));
          card.classList.add('active');
          this._selectedWorldStyle = card.dataset.worldStyle;
          g.audio.ensureContext();
          g.audio.playClick();
        });
      });
      document.getElementById('btn-welcome-reseed').addEventListener('click', () => {
        const style = this._selectedWorldStyle || g.worldStyle || 'meadow';
        g.resetColony(style, Math.floor(Math.random() * 9000 + 1000));
        this.showToast(`Created fresh ${PT.WORLD_STYLES[style].name} valley!`, 'good');
      });
      document.getElementById('btn-welcome-start').addEventListener('click', () => {
        const style = this._selectedWorldStyle || g.worldStyle || 'meadow';
        if (style !== g.worldStyle && g.day === 1 && g.timeSec < 2) {
          g.resetColony(style, null);
        }
        g.welcomeShown = true;
        g.saveGame(false);
        this.closeModal('welcome-modal');
      });
      if (this.els.pauseBanner) {
        this.els.pauseBanner.addEventListener('click', () => {
          g.audio.ensureContext();
          g.setSpeed(1);
        });
      }
      document.getElementById('btn-next-tutorial').addEventListener('click', () => g.nextTutorialStep());
      document.getElementById('btn-skip-tutorial').addEventListener('click', () => g.skipTutorial());

      // Modal close buttons & backdrop click
      document.querySelectorAll('.modal-close').forEach((btn) => {
        btn.addEventListener('click', () => this.closeModal(btn.dataset.close));
      });
      [this.els.welcomeModal, this.els.skillsModal, this.els.victoryModal, this.els.settingsModal, this.els.almanacModal, this.els.manualModal, this.els.rankModal].forEach((modal) => {
        if (!modal) return;
        modal.addEventListener('click', (e) => {
          if (e.target === modal) this.closeModal(modal.id);
        });
      });

      // Alarm Call buttons
      document.querySelectorAll('.alarm-call-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          g.resolveAlarm(btn.dataset.call);
        });
      });

      // Settings inputs
      this.els.optMute.addEventListener('change', () => {
        g.settings.muted = this.els.optMute.checked;
        g.applySettings();
      });
      this.els.optMasterVol.addEventListener('input', () => {
        g.settings.masterVol = Number(this.els.optMasterVol.value) / 100;
        g.applySettings();
      });
      this.els.optSfxVol.addEventListener('input', () => {
        g.settings.sfxVol = Number(this.els.optSfxVol.value) / 100;
        g.applySettings();
      });
      this.els.optAmbVol.addEventListener('input', () => {
        g.settings.ambVol = Number(this.els.optAmbVol.value) / 100;
        g.applySettings();
      });
      this.els.optShake.addEventListener('change', () => {
        g.settings.screenShake = this.els.optShake.checked;
        g.applySettings();
      });
      this.els.optAirflow.addEventListener('change', () => {
        g.settings.airflowOverlay = this.els.optAirflow.checked;
        g.applySettings();
      });
      this.els.optParticles.addEventListener('change', () => {
        g.settings.particleDensity = this.els.optParticles.value;
        g.applySettings();
      });
      this.els.optPacing.addEventListener('change', () => {
        g.settings.pacingMode = this.els.optPacing.value;
        g.applySettings();
        this.showToast(`Pacing switched to ${PT.PACING[g.settings.pacingMode].label}`, 'good');
      });

      // Save / Export / Import / Reset
      document.getElementById('btn-manual-save').addEventListener('click', () => {
        g.saveGame(true);
        this.els.saveFeedback.textContent = 'Colony saved to browser localStorage!';
        this.els.saveFeedback.style.color = '#3b6a24';
      });
      document.getElementById('btn-export-save').addEventListener('click', () => {
        const json = g.exportSaveJSON();
        this.els.saveCodeArea.value = json;
        this.els.saveCodeArea.select();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(json).then(() => {
            this.els.saveFeedback.textContent = 'JSON Save Code copied to clipboard!';
            this.els.saveFeedback.style.color = '#3b6a24';
          }).catch(() => {
            this.els.saveFeedback.textContent = 'JSON generated above — press Ctrl+C to copy.';
            this.els.saveFeedback.style.color = '#3b6a24';
          });
        } else {
          this.els.saveFeedback.textContent = 'JSON generated above — select and copy.';
          this.els.saveFeedback.style.color = '#3b6a24';
        }
      });
      document.getElementById('btn-import-save').addEventListener('click', () => {
        const text = this.els.saveCodeArea.value.trim();
        if (!text) {
          this.els.saveFeedback.textContent = 'Paste a JSON save code into the box first.';
          this.els.saveFeedback.style.color = '#a63322';
          return;
        }
        const ok = g.importSaveJSON(text);
        if (ok) {
          this.els.saveFeedback.textContent = 'Colony imported and restored!';
          this.els.saveFeedback.style.color = '#3b6a24';
          this.showToast('Save imported successfully!', 'good');
        } else {
          this.els.saveFeedback.textContent = 'Invalid save JSON format — check your pasted code.';
          this.els.saveFeedback.style.color = '#a63322';
        }
      });
      document.getElementById('btn-reset-colony').addEventListener('click', () => {
        this.els.resetConfirmBox.classList.remove('hidden');
      });
      document.getElementById('btn-reset-cancel').addEventListener('click', () => {
        this.els.resetConfirmBox.classList.add('hidden');
      });
      document.getElementById('btn-reset-confirm').addEventListener('click', () => {
        this.els.resetConfirmBox.classList.add('hidden');
        g.resetColony();
        this.closeModal('settings-modal');
        this.showToast('Started a fresh Prairie Town!', 'good');
      });
    }

    isAnyModalOpen() {
      return !this.els.welcomeModal.classList.contains('hidden') ||
        !this.els.skillsModal.classList.contains('hidden') ||
        !this.els.victoryModal.classList.contains('hidden') ||
        !this.els.settingsModal.classList.contains('hidden') ||
        !this.els.almanacModal.classList.contains('hidden') ||
        !this.els.manualModal.classList.contains('hidden') ||
        !this.els.rankModal.classList.contains('hidden');
    }

    openVictoryModal() {
      this.openModal('victory-modal');
    }

    openSkillsModal() {
      this.renderSkillsModal();
      this.openModal('skills-modal');
    }

    renderSkillsModal() {
      const g = this.game;
      const victoryList = g.getVictoryChecklist();
      const doneGoals = victoryList.filter((i) => i.done).length;
      if (this.els.skillsSpSummary) {
        this.els.skillsSpSummary.textContent = `Available Skill Points: ${g.skillPoints} SP (Earned ${g.totalSpEarned} SP) · Final Goal: ${doneGoals}/${victoryList.length}`;
      }

      const skillsHtml = PT.SKILLS.map((sk) => {
        const lv = g.skillLevels[sk.id] || 0;
        const maxed = lv >= sk.costs.length;
        const nextCost = maxed ? 0 : sk.costs[lv];
        const canBuy = !maxed && g.skillPoints >= nextCost;
        const curLabel = sk.formatTier(sk.tiers[lv]);
        const nextLabel = maxed ? 'MAXED' : sk.formatTier(sk.tiers[lv + 1]);
        return `
          <div class="skill-card">
            <div class="skill-card-head">
              <span class="skill-ico">${sk.icon}</span>
              <div>
                <strong>${sk.name}</strong>
                <div class="skill-lv">Current: <b>${curLabel}</b> ${maxed ? '' : `→ Next: ${nextLabel}`}</div>
              </div>
              <button class="wood-btn skill-buy-btn" data-skill-id="${sk.id}" ${canBuy ? '' : 'disabled'}>
                ${maxed ? '✓ Maxed' : `Upgrade (${nextCost} SP)`}
              </button>
            </div>
            <p>${sk.desc}</p>
          </div>
        `;
      }).join('');

      const achHtml = PT.ACHIEVEMENTS.map((ach) => {
        const unlocked = g.unlockedAchievements.includes(ach.id);
        return `
          <div class="ach-card ${unlocked ? 'unlocked' : ''}">
            <div class="ach-ico">${unlocked ? ach.icon : '🔒'}</div>
            <div style="flex:1">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <strong>${ach.title}</strong>
                <span class="ach-sp">+${ach.sp} SP</span>
              </div>
              <small>${ach.desc}</small>
            </div>
          </div>
        `;
      }).join('');

      const goalHtml = `
        <div class="victory-goal-box">
          <h4>👑 Final Goal: Autonomous Self-Sustaining Prairie Town (${doneGoals}/${victoryList.length})</h4>
          <p style="font-size:12px;color:#5a412c;margin-bottom:6px">Complete all 5 milestones below and your Prairie Town will run, farm &amp; defend itself automatically without any player help!</p>
          ${victoryList.map((v) => `<div style="font-size:12px;margin:2px 0">${v.done ? '✅' : '⬜'} ${v.label}</div>`).join('')}
        </div>
      `;

      this.els.skillsModalBody.innerHTML = `
        ${goalHtml}
        <h3 class="skills-sec-title">⭐ Colony Skill Upgrades (${g.skillPoints} SP Available)</h3>
        <div class="skills-grid">${skillsHtml}</div>
        <h3 class="skills-sec-title" style="margin-top:16px">🏅 Achievements (${g.unlockedAchievements.length}/${PT.ACHIEVEMENTS.length})</h3>
        <div class="ach-grid">${achHtml}</div>
      `;

      this.els.skillsModalBody.querySelectorAll('[data-skill-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (g.spendSkillPoint(btn.dataset.skillId)) {
            this.renderSkillsModal();
          }
        });
      });
    }

    openModal(id) {
      const g = this.game;
      g.audio.ensureContext();
      g.audio.playClick();
      if (!g.pausedByModal) {
        g.speedBeforeModal = g.speed;
        g.pausedByModal = true;
      }
      if (id === 'settings-modal') {
        this.syncSettingsUI();
        this.els.saveFeedback.textContent = '';
        this.els.resetConfirmBox.classList.add('hidden');
      }
      document.getElementById(id).classList.remove('hidden');
    }

    closeModal(id) {
      const g = this.game;
      g.audio.playClick();
      document.getElementById(id).classList.add('hidden');
      if (!this.isAnyModalOpen()) {
        g.pausedByModal = false;
      }
    }

    openAlmanac() {
      this.game.unreadAlmanac = false;
      this.els.almanacBadge.classList.add('hidden');
      this.renderAlmanac();
      this.openModal('almanac-modal');
    }

    renderAlmanac() {
      const unlocked = this.game.unlockedAlmanac;
      this.els.almanacProgress.textContent = `${unlocked.length} / ${PT.ALMANAC.length} Discoveries Unlocked`;
      this.els.almanacGrid.innerHTML = PT.ALMANAC.map((entry) => {
        const isUnlocked = unlocked.includes(entry.id);
        return `
          <article class="almanac-card ${isUnlocked ? '' : 'locked'}">
            <div class="almanac-card-head">
              <div class="almanac-card-ico">${isUnlocked ? entry.icon : '🔒'}</div>
              <div>
                <div class="almanac-cat">${entry.category}</div>
                <h4>${entry.title}</h4>
              </div>
            </div>
            <p>${isUnlocked ? entry.science : `<em>Discover by: ${entry.unlockHint}</em>`}</p>
            ${isUnlocked ? `<div class="almanac-fact">${entry.fact}</div>` : ''}
          </article>
        `;
      }).join('');
    }

    openRankModal() {
      const g = this.game;
      const curRank = g.colonyRank;
      const status = g.getRankProgressDetails();

      this.els.rankModalBody.innerHTML = PT.RANKS.map((rk, i) => {
        const achieved = i < curRank || (i === 3 && curRank === 3);
        const current = i === curRank;
        return `
          <div class="rank-step ${achieved ? 'achieved' : ''} ${current ? 'current' : ''}">
            <div style="font-size:26px">${rk.badge}</div>
            <div style="flex:1">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <strong>Rank ${i + 1}: ${rk.title}</strong>
                <span style="font-size:11px;font-weight:700;color:${achieved ? '#497a2c' : '#8f5f24'}">
                  ${achieved ? '✓ Achieved' : (current ? 'Current Stage' : 'Locked')}
                </span>
              </div>
              <div style="font-size:12px;color:#6e523a;margin:2px 0 4px">${rk.subtitle}</div>
              <div style="font-size:12px">${rk.goalsText}</div>
            </div>
          </div>
        `;
      }).join('') + `
        <div style="margin-top:12px;padding:10px 12px;border-radius:10px;background:rgba(255,252,244,0.75);border:1px solid #b89563;font-size:12px;">
          <strong>Next Milestone Checklist:</strong><br/>
          ${status.map((item) => `${item.done ? '✅' : '⬜'} ${item.label}`).join('<br/>')}
        </div>
      `;
      this.openModal('rank-modal');
    }

    syncSettingsUI() {
      const s = this.game.settings;
      this.els.optMute.checked = s.muted;
      this.els.optMasterVol.value = Math.round(s.masterVol * 100);
      this.els.optSfxVol.value = Math.round(s.sfxVol * 100);
      this.els.optAmbVol.value = Math.round(s.ambVol * 100);
      this.els.lblMasterVol.textContent = `${Math.round(s.masterVol * 100)}%`;
      this.els.lblSfxVol.textContent = `${Math.round(s.sfxVol * 100)}%`;
      this.els.lblAmbVol.textContent = `${Math.round(s.ambVol * 100)}%`;
      this.els.optShake.checked = s.screenShake;
      this.els.optAirflow.checked = s.airflowOverlay;
      this.els.optParticles.value = s.particleDensity;
      this.els.optPacing.value = s.pacingMode;
      this.els.btnToggleAirflow.classList.toggle('active', s.airflowOverlay);
    }

    updateHUD() {
      const g = this.game;
      const w = g.world;
      const rk = PT.RANKS[g.colonyRank];

      this.els.rankIcon.textContent = rk.badge;
      this.els.rankTitle.textContent = rk.title;

      const phaseLabel = g.dayProgress < 0.35 ? 'Morning'
        : g.dayProgress < 0.65 ? 'Afternoon'
        : g.dayProgress < 0.85 ? 'Golden Hour' : 'Dusk';
      this.els.dayTime.textContent = `Day ${g.day} · ${phaseLabel}`;

      this.els.food.textContent = `${Math.floor(g.resources.food)} / ${g.getFoodCap()}`;
      this.els.dirt.textContent = `${Math.floor(g.resources.dirt)}`;

      this.els.airflow.textContent = `${w.airflowPct}%`;
      this.els.bernoulliTag.classList.toggle('hidden', !w.bernoulliActive);
      this.els.airflowPill.classList.toggle('warn', w.airflowPct < 50);
      this.els.airflowPill.classList.toggle('good', w.bernoulliActive && w.airflowPct >= 75);

      this.els.hygiene.textContent = `${Math.round(g.hygienePct)}%`;

      this.els.grassRisk.textContent = w.tallGrassRisk > 45 ? `Ambush ${w.tallGrassRisk}%` : (w.sightlineClear ? 'Clear 👁️' : `${w.tallGrassRisk}%`);
      this.els.sightlinePill.classList.toggle('warn', w.tallGrassRisk > 45);
      this.els.sightlinePill.classList.toggle('good', w.sightlineClear);

      this.els.morale.textContent = `${Math.round(g.moralePct)}%`;
      this.els.moralePill.classList.toggle('warn', g.moralePct < 50);
      this.els.moralePill.classList.toggle('good', g.moralePct >= 80);

      const adults = g.dogs.filter((d) => !d.isPup).length;
      const pups = g.dogs.filter((d) => d.isPup).length;
      this.els.pop.textContent = `${adults}A / ${pups}P`;

      this.els.weatherIco.textContent = g.weather.icon;
      this.els.weatherLabel.textContent = g.weather.label;
      this.els.weatherForecast.textContent = `Next: ${g.nextWeather.icon} · Wind ${(g.windSpeed * 12).toFixed(0)}mph`;

      if (g.colonyRank >= 3) {
        this.els.megatownPill.classList.remove('hidden');
        this.els.megatownPop.textContent = this._formatMegaPop(g.megaTownPop);
      } else {
        this.els.megatownPill.classList.add('hidden');
      }

      // Role counts
      const counts = { sentry: 0, digger: 0, forager: 0, gardener: 0, idle: 0 };
      for (const d of g.dogs) {
        if (!d.isPup && counts[d.role] !== undefined) counts[d.role]++;
      }
      this.els.cntSentry.textContent = counts.sentry;
      this.els.cntDigger.textContent = counts.digger;
      this.els.cntForager.textContent = counts.forager;
      this.els.cntGardener.textContent = counts.gardener;
      this.els.cntIdle.textContent = `Idle: ${counts.idle}`;

      if (this.els.hudQueueCap) {
        const maxB = g.getMaxWorkBlocks();
        this.els.hudQueueCap.textContent = `Blocks: ${w.tasks.length}/${maxB}`;
        this.els.hudQueueCap.classList.toggle('full', w.tasks.length >= maxB);
      }
      if (this.els.hudSpBadge) {
        this.els.hudSpBadge.textContent = g.skillPoints;
        this.els.hudSpBadge.classList.toggle('hidden', g.skillPoints <= 0);
      }

      // Pulse Kin Check button when a neighbor border is reachable!
      const kinAvail = w.getAvailableNeighbors().length > 0;
      this.els.btnToolKin.classList.toggle('pulse-ready', kinAvail);

      // Speed buttons
      this.els.speedBtns.forEach((btn) => {
        btn.classList.toggle('active', Number(btn.dataset.speed) === g.speed);
      });

      // Tool buttons
      this.els.toolBtns.forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tool === g.activeTool);
      });
      this.els.canvas.classList.toggle('tool-cursor', g.activeTool !== PT.TOOLS.SELECT);

      // Almanac unread badge
      this.els.almanacBadge.classList.toggle('hidden', !g.unreadAlmanac);

      // Pause banner visibility when manually paused
      if (this.els.pauseBanner) {
        this.els.pauseBanner.classList.toggle('hidden', g.speed !== 0 || g.pausedByModal || !!g.activeAlarm);
      }

      // Tutorial panel
      if (g.tutorialDone) {
        this.els.tutorialCard.classList.add('hidden');
      } else {
        this.els.tutorialCard.classList.remove('hidden');
        const step = PT.TUTORIAL_STEPS[g.tutorialStep] || PT.TUTORIAL_STEPS[0];
        this.els.tutorialTitle.textContent = step.title;
        this.els.tutorialText.textContent = step.text;
        this.els.tutorialHint.textContent = step.hint;
        const dots = this.els.tutorialDots.children;
        for (let i = 0; i < dots.length; i++) {
          dots[i].className = 't-dot' + (i < g.tutorialStep ? ' done' : (i === g.tutorialStep ? ' active' : ''));
        }
      }

      // Alarm Mini-Game Overlay
      if (g.activeAlarm) {
        this.els.alarmOverlay.classList.remove('hidden');
        const a = g.activeAlarm;
        const spec = PT.PREDATORS[a.predator.type];
        const tag = a.isAmbush ? ' · 🌿 TALL GRASS AMBUSH!' : (a.earlySpotted ? ' · 👁️ Early Sightline Bonus!' : '');
        this.els.alarmSpotter.textContent = `${a.spotterName} spotted a threat${tag}`;
        this.els.alarmClueIcon.textContent = spec.icon;
        this.els.alarmClueTitle.textContent = `${spec.speedLabel}`;
        this.els.alarmClueDesc.textContent = a.isFirstPause
          ? 'FIRST ALERT PAUSED — Read calmly & pick the matching call. Next alerts will be timed!'
          : spec.clueText;
        if (a.isPausedAlert) {
          this.els.alarmTimerText.textContent = a.isFirstPause ? '⏸ 1st Alert Paused' : '⏸ Paused — Choose';
          this.els.alarmTimerText.classList.remove('urgent');
          this.els.alarmProgressFill.style.width = '100%';
        } else {
          this.els.alarmTimerText.textContent = `${Math.max(0, a.timeLeft).toFixed(1)}s`;
          this.els.alarmTimerText.classList.toggle('urgent', a.timeLeft <= 3.5);
          const pct = Math.max(0, Math.min(100, (a.timeLeft / a.timeMax) * 100));
          this.els.alarmProgressFill.style.width = `${pct}%`;
        }
      } else {
        this.els.alarmOverlay.classList.add('hidden');
      }

      // Refresh selected dog inspector live if open
      if (g.selectedDogId && !this.els.inspector.classList.contains('hidden')) {
        const dog = g.dogs.find((d) => d.id === g.selectedDogId);
        if (dog) this.showDogInspector(dog, true);
      }
    }

    _formatMegaPop(n) {
      if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M / 400M`;
      if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
      return `${Math.round(n)}`;
    }

    showDogInspector(dog, silentRefresh = false) {
      const inspKey = `${dog.id}:${dog.isPup}:${dog.role}`;
      const depthText = dog.row < -0.2 ? 'Surface' : `${((dog.row + 0.5) * 0.5).toFixed(1)}m`;

      if (silentRefresh && this._inspectedDogKey === inspKey) {
        const actEl = document.getElementById('insp-action');
        const depEl = document.getElementById('insp-depth');
        const grwEl = document.getElementById('insp-growth');
        if (actEl) {
          actEl.textContent = dog.actionLabel;
          if (depEl) depEl.textContent = depthText;
          if (grwEl) grwEl.textContent = `${Math.round(dog.ageProgress * 100)}%`;
          return;
        }
      }

      this._inspectedDogKey = inspKey;
      this.game.selectedDogId = dog.id;
      this.els.inspector.classList.remove('hidden');
      this.els.inspectorTitle.textContent = `${dog.name} ${dog.isPup ? '(Pup)' : ''}`;
      const meta = PT.ROLE_META[dog.role];

      let html = `
        <div class="insp-stat"><span>Role</span><strong>${meta.icon} ${meta.label}</strong></div>
        <div class="insp-stat"><span>Activity</span><strong id="insp-action">${dog.actionLabel}</strong></div>
        <div class="insp-stat"><span>Depth</span><strong id="insp-depth">${depthText}</strong></div>
      `;

      if (dog.isPup) {
        html += `
          <div class="insp-stat"><span>Growth</span><strong id="insp-growth">${Math.round(dog.ageProgress * 100)}%</strong></div>
          <p style="margin-top:8px;font-size:12px;color:#5a412c">${meta.desc}</p>
        `;
      } else {
        html += `<div style="margin-top:10px;font-weight:700;font-size:12px">Assign Coterie Role:</div>
        <div class="insp-role-grid">`;
        for (const roleKey of ['sentry', 'digger', 'forager', 'gardener', 'idle']) {
          const rm = PT.ROLE_META[roleKey];
          html += `<button class="insp-role-btn ${dog.role === roleKey ? 'active' : ''}" data-assign-dog="${dog.id}" data-role="${roleKey}">${rm.icon} ${rm.label}</button>`;
        }
        html += `</div><p style="margin-top:8px;font-size:12px;color:#5a412c">${meta.desc}</p>`;
      }

      this.els.inspectorBody.innerHTML = html;
      if (!silentRefresh) this.game.audio.playClick();

      this.els.inspectorBody.querySelectorAll('[data-assign-dog]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const targetDog = this.game.dogs.find((d) => d.id === Number(btn.dataset.assignDog));
          if (targetDog) {
            targetDog.setRole(btn.dataset.role);
            this.game.audio.playClick();
            this._inspectedDogKey = null;
            this.showDogInspector(targetDog, false);
            this.updateHUD();
          }
        });
      });
    }

    showCellInspector(row, col) {
      const w = this.game.world;
      this.game.selectedDogId = null;
      this.els.inspector.classList.remove('hidden');

      if (row < 0) {
        const mound = w.mounds[col].type;
        const g = w.grass[col];
        this.els.inspectorTitle.textContent = mound !== PT.MOUND.NONE ? `${mound.toUpperCase()} Mound` : 'Prairie Turf';
        this.els.inspectorBody.innerHTML = `
          <div class="insp-stat"><span>Grass Height</span><strong>${(g.height * 100).toFixed(0)} cm</strong></div>
          <div class="insp-stat"><span>Sightline Status</span><strong>${g.height > 0.48 ? 'Blocks View (Tall)' : 'Clear View (Trimmed)'}</strong></div>
          <div class="insp-stat"><span>Flood Protection</span><strong>${mound === PT.MOUND.CRATER ? '100% Flood-Proof' : mound === PT.MOUND.DOME ? 'Mild Runoff Shed' : 'None (Raw Hole)'}</strong></div>
        `;
        return;
      }

      const cell = w.grid[row][col];
      const names = ['Solid Earth', 'Tunnel', 'Entrance Shaft', 'Listening Chamber', 'Nursery', 'Latrine', 'Granary'];
      const depthM = ((row + 1) * PT.METERS_PER_CELL).toFixed(1);
      const safe = row >= PT.COYOTE_DIG_LIMIT_ROWS;
      const air = w.airflowCell[row][col];
      const queuedTask = w.tasks.find((t) => (t.kind === 'mound' && t.col === col && row <= 0) || (t.kind === 'dig' && t.row === row && t.col === col));
      const kinNb = w.getReachableNeighborNear(row, col);
      const mod = w.cellMod && w.cellMod[row] ? w.cellMod[row][col] : PT.CELL_MOD.NONE;
      const modLabels = {
        clay: '🏺 Rich Clay Vein (+12 Dirt)',
        root: '🥕 Sweet Root Cache (+14 Food)',
        rock: '🪨 Sandstone Boulder (Slow dig, +8 Dirt)',
        aquifer: '💧 Deep Aquifer Spring (+5% Hygiene, +6 Dirt)',
        spring: '💧 Tapped Mineral Spring (Active +Hygiene & Drainage)',
        none: 'Standard Soil'
      };

      this.els.inspectorTitle.textContent = names[cell] || 'Underground';
      let extraHtml = '';
      if (queuedTask) {
        extraHtml += `<button id="btn-insp-cancel-task" class="danger-btn" style="margin-top:10px;width:100%">Cancel Queued Task &amp; Refund</button>`;
      }
      if (kinNb) {
        extraHtml += `<button id="btn-insp-kin" class="wood-btn" style="margin-top:10px;width:100%">🦷 Send Envoy to Greet ${kinNb.name}</button>`;
      }

      this.els.inspectorBody.innerHTML = `
        <div class="insp-stat"><span>Depth</span><strong>-${depthM} m</strong></div>
        <div class="insp-stat"><span>Deposit</span><strong>${modLabels[mod] || 'Standard Soil'}</strong></div>
        <div class="insp-stat"><span>Coyote Safety</span><strong>${safe ? '🛡️ Safe (>1.5m limit)' : '⚠️ Shallow (<=1.5m)'}</strong></div>
        <div class="insp-stat"><span>Airflow</span><strong>${air.bernoulli ? '💨 Bernoulli Current' : 'Passive'}</strong></div>
        <div class="insp-stat"><span>Water Seepage</span><strong>${Math.round(w.water[row][col] * 100)}%</strong></div>
        ${extraHtml}
      `;

      const cancelBtn = document.getElementById('btn-insp-cancel-task');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          if (w.cancelTaskAt(row, col, this.game.resources)) {
            this.showToast('Task cancelled & resources refunded.', '');
            this.showCellInspector(row, col);
          }
        });
      }
      const kinBtn = document.getElementById('btn-insp-kin');
      if (kinBtn && kinNb) {
        kinBtn.addEventListener('click', () => {
          this.game._dispatchKinEnvoy(kinNb);
          this.closeInspector();
        });
      }
    }

    showRosterInspector() {
      this.game.selectedDogId = null;
      this.els.inspector.classList.remove('hidden');
      this.els.inspectorTitle.textContent = `Coterie Roster (${this.game.dogs.length})`;
      this.els.inspectorBody.innerHTML = this.game.dogs.map((d) => {
        const rm = PT.ROLE_META[d.role];
        return `
          <div class="roster-row" data-jump-dog="${d.id}">
            <div>
              <strong>${d.name}</strong> ${d.isPup ? '<small>(Pup)</small>' : ''}<br/>
              <small style="color:#6e523a">${d.actionLabel}</small>
            </div>
            <span>${rm.icon} ${rm.label}</span>
          </div>
        `;
      }).join('');

      this.els.inspectorBody.querySelectorAll('[data-jump-dog]').forEach((el) => {
        el.addEventListener('click', () => {
          const dog = this.game.dogs.find((d) => d.id === Number(el.dataset.jumpDog));
          if (dog) {
            this.game.focusCameraOn(dog.col, dog.row);
            this.showDogInspector(dog);
          }
        });
      });
    }

    closeInspector() {
      this.game.selectedDogId = null;
      this.els.inspector.classList.add('hidden');
    }

    showTooltip(text, x, y) {
      if (!text) {
        this.els.tooltip.classList.add('hidden');
        return;
      }
      this.els.tooltip.textContent = text;
      this.els.tooltip.style.left = `${Math.min(window.innerWidth - 270, x + 16)}px`;
      this.els.tooltip.style.top = `${Math.max(70, y - 12)}px`;
      this.els.tooltip.classList.remove('hidden');
    }

    showToast(msg, kind = '') {
      const el = document.createElement('div');
      el.className = `toast-item ${kind}`;
      el.textContent = msg;
      this.els.toastStack.appendChild(el);
      setTimeout(() => {
        el.style.opacity = '0';
        el.style.transition = 'opacity 0.25s ease';
        setTimeout(() => el.remove(), 260);
      }, 5000);
    }

    updateSaveStatus(text) {
      if (this.els.saveStatusText) {
        this.els.saveStatusText.textContent = text;
      }
    }

    updatePlayerCounter(globalCount, localSessions = 1) {
      if (!this.els.hudPlayersCount) return;
      const formatCount = (n) => {
        if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
        if (n >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
        return `${Math.round(n)}`;
      };
      if (typeof globalCount === 'number' && Number.isFinite(globalCount) && globalCount > 0) {
        this.els.hudPlayersCount.textContent = formatCount(globalCount);
        if (this.els.playerCountPill) {
          this.els.playerCountPill.title = `Global Players Played: ${globalCount.toLocaleString()} (Your Sessions: ${localSessions})`;
        }
      } else {
        this.els.hudPlayersCount.textContent = localSessions > 1 ? `${localSessions}*` : '—';
        if (this.els.playerCountPill) {
          this.els.playerCountPill.title = `Players Counter (Offline/Blocked fallback · Your Sessions: ${localSessions})`;
        }
      }
    }
  }

  PT.UIController = UIController;
})(window);
