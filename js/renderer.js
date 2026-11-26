/**
 * PRAIRIE TOWN: Coterie & Burrow
 * 60 FPS HiDPI Storybook-Vector HTML5 Canvas Renderer
 */
(function (root) {
  'use strict';

  const PT = (root.PT = root.PT || {});

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.dpr = 1;
      this.width = 1280;
      this.height = 720;

      // Camera state in world pixel coordinates (y=0 is prairie surface ground line)
      const startX = (PT.STARTER_COL || 90) * PT.CELL_SIZE;
      this.cam = {
        x: startX,
        y: 80,
        zoom: 1.0,
        targetX: startX,
        targetY: 80,
        targetZoom: 1.0,
        shakeTime: 0,
        shakeMag: 0
      };

      this.soilPattern = null;
      this._buildSoilPattern();
      this.resize();
    }

    resize() {
      this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);
    }

    _buildSoilPattern() {
      if (typeof document === 'undefined') return;
      const off = document.createElement('canvas');
      off.width = 160;
      off.height = 160;
      const octx = off.getContext('2d');
      // Subtle earthy grain & caliche flecks
      for (let i = 0; i < 420; i++) {
        const x = (Math.sin(i * 78.23) * 43758.54 % 1 + 1) % 1 * 160;
        const y = (Math.sin(i * 19.91) * 24634.63 % 1 + 1) % 1 * 160;
        const r = 0.6 + (i % 3) * 0.55;
        octx.fillStyle = i % 4 === 0 ? 'rgba(255, 228, 175, 0.08)' : 'rgba(32, 16, 6, 0.09)';
        octx.beginPath();
        octx.arc(x, y, r, 0, Math.PI * 2);
        octx.fill();
      }
      this.soilPattern = this.ctx.createPattern(off, 'repeat');
    }

    triggerShake(mag = 6, duration = 0.35) {
      this.cam.shakeMag = Math.max(this.cam.shakeMag, mag);
      this.cam.shakeTime = Math.max(this.cam.shakeTime, duration);
    }

    screenToWorld(sx, sy) {
      return {
        wx: (sx - this.width * 0.5) / this.cam.zoom + this.cam.x,
        wy: (sy - this.height * 0.44) / this.cam.zoom + this.cam.y
      };
    }

    worldToScreen(wx, wy) {
      return {
        sx: (wx - this.cam.x) * this.cam.zoom + this.width * 0.5,
        sy: (wy - this.cam.y) * this.cam.zoom + this.height * 0.44
      };
    }

    updateCamera(dt) {
      const k = 1 - Math.exp(-10 * dt);
      this.cam.x += (this.cam.targetX - this.cam.x) * k;
      this.cam.y += (this.cam.targetY - this.cam.y) * k;
      this.cam.zoom += (this.cam.targetZoom - this.cam.zoom) * k;
      if (this.cam.shakeTime > 0) {
        this.cam.shakeTime = Math.max(0, this.cam.shakeTime - dt);
        if (this.cam.shakeTime === 0) this.cam.shakeMag = 0;
      }
    }

    render(state) {
      const ctx = this.ctx;
      const { world, dogs, predators, particles, timeSec, dayProgress, weather, windSpeed, settings, hoverCell, activeTool, selectedDogId, colonyRank } = state;

      ctx.save();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      // 1. Sky & Atmosphere (Screen-space backdrop with parallax)
      this._drawSkyAndMesas(ctx, dayProgress, weather, timeSec, colonyRank);

      // Apply camera transform (+ optional screen shake)
      let shakeX = 0;
      let shakeY = 0;
      if (settings.screenShake && this.cam.shakeTime > 0) {
        shakeX = (Math.random() - 0.5) * this.cam.shakeMag * 2;
        shakeY = (Math.random() - 0.5) * this.cam.shakeMag * 2;
      }

      ctx.save();
      ctx.translate(this.width * 0.5 + shakeX, this.height * 0.44 + shakeY);
      ctx.scale(this.cam.zoom, this.cam.zoom);
      ctx.translate(-this.cam.x, -this.cam.y);

      const cs = PT.CELL_SIZE;

      // 2. Underground Soil Strata, Roots, Pebbles & Depth Ruler
      this._drawSoilStrata(ctx, world, cs, timeSec);

      // 3. Sightline Cones (behind surface entities)
      this._drawSightlines(ctx, world, dogs, cs, timeSec);

      // 4. Excavated Tunnels, Chambers, Warm Lighting & Flooding
      this._drawBurrowNetwork(ctx, world, state.resources, cs, timeSec);

      // 5. Task Construction Progress & Neighbor Borders
      this._drawTasksAndBorders(ctx, world, cs, timeSec);

      // 6. Back Grass Layer & Mounds
      this._drawMounds(ctx, world, cs);
      this._drawGrassLayer(ctx, world, cs, windSpeed, timeSec, 'back');

      // 7. Predators behind tall grass (Coyote camouflage!) & Hawk shadows
      this._drawPredators(ctx, predators, world, cs, timeSec, 'ground');

      // 8. Prairie Dogs (both Underground & Surface) + Neighbor Previews
      this._drawNeighborPreviews(ctx, world, cs, timeSec);
      this._drawDogs(ctx, dogs, world, cs, timeSec, selectedDogId);

      // 9. Front Swaying Grass Blades (partially hides sneaking Coyotes!)
      this._drawGrassLayer(ctx, world, cs, windSpeed, timeSec, 'front');

      // 10. Airborne Hawks & Tall Human Upper Silhouettes
      this._drawPredators(ctx, predators, world, cs, timeSec, 'air');

      // 11. Bernoulli Airflow Streamlines & Particles
      if (settings.airflowOverlay) {
        this._drawAirflowOverlay(ctx, world, particles, cs, timeSec, windSpeed);
      }
      this._drawParticles(ctx, particles, cs, timeSec);

      // 12. Tool Placement Ghost
      if (hoverCell && activeTool !== PT.TOOLS.SELECT) {
        this._drawPlacementGhost(ctx, world, activeTool, hoverCell, cs, state.placementOpts);
      }

      ctx.restore();

      // 13. Screen-Space Offscreen Predator Threat Edge Indicators (vital for 90m panoramic valley!)
      this._drawOffscreenPredatorWarnings(ctx, predators, cs, timeSec);

      ctx.restore();
    }

    // ==================== SKY, SUN, CLOUDS & PARALLAX MESAS ====================
    _parseColor(str) {
      if (typeof str === 'string' && str.startsWith('#')) {
        return [
          parseInt(str.slice(1, 3), 16),
          parseInt(str.slice(3, 5), 16),
          parseInt(str.slice(5, 7), 16)
        ];
      }
      const m = typeof str === 'string' && str.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [120, 120, 120];
    }

    _lerpColor(a, b, t) {
      const clamp = Math.max(0, Math.min(1, t));
      const [ar, ag, ab] = this._parseColor(a);
      const [br, bg, bb] = this._parseColor(b);
      const rr = Math.round(ar + (br - ar) * clamp);
      const rg = Math.round(ag + (bg - ag) * clamp);
      const rb = Math.round(ab + (bb - ab) * clamp);
      return `rgb(${rr}, ${rg}, ${rb})`;
    }

    _drawSkyAndMesas(ctx, dayProgress, weather, timeSec, colonyRank) {
      // Day cycle: 0=morning blue, 0.45=golden afternoon, 0.72=amber sunset, 0.92=dusk
      let topCol, midCol, horCol;
      if (dayProgress < 0.45) {
        const t = dayProgress / 0.45;
        topCol = this._lerpColor('#4e8ec2', '#5b94be', t);
        midCol = this._lerpColor('#94c8e6', '#d8c59e', t);
        horCol = this._lerpColor('#e8e4c5', '#f5cb86', t);
      } else if (dayProgress < 0.78) {
        const t = (dayProgress - 0.45) / 0.33;
        topCol = this._lerpColor('#5b94be', '#5e4b73', t);
        midCol = this._lerpColor('#d8c59e', '#d97e54', t);
        horCol = this._lerpColor('#f5cb86', '#f7b259', t);
      } else {
        const t = (dayProgress - 0.78) / 0.22;
        topCol = this._lerpColor('#5e4b73', '#2e3859', t);
        midCol = this._lerpColor('#d97e54', '#705875', t);
        horCol = this._lerpColor('#f7b259', '#cf896b', t);
      }

      // Storm & Heatwave blend
      const stormTint = weather.skyTint || 0;
      if (stormTint > 0) {
        topCol = this._lerpColor(topCol, '#485461', stormTint * 0.78);
        midCol = this._lerpColor(midCol, '#697782', stormTint * 0.78);
        horCol = this._lerpColor(horCol, '#8c969c', stormTint * 0.72);
      }
      const heatTint = weather.heatTint || 0;
      if (heatTint > 0) {
        topCol = this._lerpColor(topCol, '#cf7d36', heatTint * 0.55);
        midCol = this._lerpColor(midCol, '#e8ae54', heatTint * 0.62);
        horCol = this._lerpColor(horCol, '#f5d487', heatTint * 0.58);
      }

      const horizonY = (0 - this.cam.y) * this.cam.zoom + this.height * 0.44;
      const skyBottom = Math.max(0, Math.min(this.height, horizonY + 18));

      const skyGrad = ctx.createLinearGradient(0, 0, 0, Math.max(220, skyBottom));
      skyGrad.addColorStop(0, topCol);
      skyGrad.addColorStop(0.58, midCol);
      skyGrad.addColorStop(1, horCol);
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, this.width, this.height);

      // Sun / warm golden orb
      if (stormTint < 0.7) {
        const sunX = this.width * (0.18 + dayProgress * 0.68);
        const sunArc = Math.sin(dayProgress * Math.PI);
        const sunY = Math.max(55, horizonY - 60 - sunArc * 170);
        const sunGlow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 95);
        sunGlow.addColorStop(0, 'rgba(255, 248, 210, 0.95)');
        sunGlow.addColorStop(0.3, 'rgba(255, 214, 120, 0.55)');
        sunGlow.addColorStop(1, 'rgba(255, 190, 90, 0)');
        ctx.fillStyle = sunGlow;
        ctx.beginPath();
        ctx.arc(sunX, sunY, 95, 0, Math.PI * 2);
        ctx.fill();
      }

      // Soft drifting prairie clouds
      ctx.save();
      const cloudAlpha = stormTint > 0.5 ? 0.55 : 0.42;
      ctx.fillStyle = stormTint > 0.5 ? `rgba(82, 92, 104, ${cloudAlpha})` : `rgba(255, 247, 230, ${cloudAlpha})`;
      for (let i = 0; i < 6; i++) {
        const cx = ((i * 290 + timeSec * (7 + i * 1.4) - this.cam.x * 0.08) % (this.width + 260) + (this.width + 260)) % (this.width + 260) - 130;
        const cy = Math.min(horizonY - 40, 72 + (i % 3) * 44);
        ctx.beginPath();
        ctx.ellipse(cx, cy, 56, 19, 0, 0, Math.PI * 2);
        ctx.ellipse(cx - 32, cy + 5, 34, 14, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + 34, cy + 6, 38, 13, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Parallax Distant Mesas (3 layered horizons!)
      if (horizonY > 10) {
        this._drawMesaLayer(ctx, horizonY, 0.14, '#a28279', 78, 0.72);
        this._drawMesaLayer(ctx, horizonY, 0.28, '#93684e', 48, 0.85);
        this._drawMesaLayer(ctx, horizonY, 0.48, '#7a5837', 22, 0.95);

        // In 1900 Texas Mega-Town Prestige Mode, dot distant prairie horizon with endless mounds!
        if (colonyRank >= 3) {
          ctx.fillStyle = 'rgba(136, 92, 50, 0.65)';
          const px = -this.cam.x * 0.45;
          for (let i = -10; i < 48; i++) {
            const mx = ((i * 58 + px) % (this.width + 120) + (this.width + 120)) % (this.width + 120) - 40;
            const my = horizonY - 8 - ((i * 17) % 9);
            ctx.beginPath();
            ctx.moveTo(mx - 8, my + 4);
            ctx.lineTo(mx - 3, my);
            ctx.lineTo(mx + 3, my);
            ctx.lineTo(mx + 8, my + 4);
            ctx.fill();
          }
        }
      }
    }

    _drawMesaLayer(ctx, horizonY, parallax, color, maxHeight, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      const shift = -this.cam.x * parallax;
      const span = 340;
      const startIdx = Math.floor(-shift / span) - 1;
      const count = Math.ceil(this.width / span) + 3;

      ctx.beginPath();
      ctx.moveTo(0, horizonY + 30);
      for (let i = startIdx; i < startIdx + count; i++) {
        const bx = i * span + shift;
        const seed = Math.abs(Math.sin(i * 12.9898) * 43758.54) % 1;
        const h = maxHeight * (0.45 + seed * 0.55);
        const mesaW = span * (0.34 + seed * 0.18);
        ctx.lineTo(bx, horizonY);
        ctx.lineTo(bx + span * 0.16, horizonY - h);
        ctx.lineTo(bx + span * 0.16 + mesaW, horizonY - h);
        ctx.lineTo(bx + span * 0.32 + mesaW, horizonY - h * 0.25);
        ctx.lineTo(bx + span, horizonY);
      }
      ctx.lineTo(this.width + 200, horizonY + 30);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // ==================== SOIL STRATA & DEPTH RULER ====================
    _drawSoilStrata(ctx, world, cs) {
      const leftX = -8 * cs;
      const totalW = (world.totalCols + 16) * cs;
      const totalH = (world.rows + 3) * cs;

      // Rich layered geological cross-section gradient
      const soilGrad = ctx.createLinearGradient(0, 0, 0, world.rows * cs);
      soilGrad.addColorStop(0.0, '#6a4728');   // surface turf collar
      soilGrad.addColorStop(0.08, '#53351e');  // dark organic topsoil
      soilGrad.addColorStop(0.28, '#6f4124');  // transition
      soilGrad.addColorStop(0.45, '#8c4e2d');  // terracotta clay (1.2m-2.5m)
      soilGrad.addColorStop(0.75, '#764324');  // deep loam
      soilGrad.addColorStop(1.0, '#4f2c17');   // deep bedrock loam
      ctx.fillStyle = soilGrad;
      ctx.fillRect(leftX, 0, totalW, totalH);

      // Subtle procedural grain pattern overlay
      if (this.soilPattern) {
        ctx.fillStyle = this.soilPattern;
        ctx.fillRect(leftX, 0, totalW, totalH);
      }

      // Prairie turf grass ribbon across surface line y=0
      const turfGrad = ctx.createLinearGradient(0, -5, 0, 14);
      turfGrad.addColorStop(0, '#789e3c');
      turfGrad.addColorStop(0.45, '#5b7a2c');
      turfGrad.addColorStop(1, '#53351e');
      ctx.fillStyle = turfGrad;
      ctx.fillRect(leftX, -4, totalW, 18);

      // Embedded organic pebbles & roots in solid soil
      const minVisCol = Math.max(0, Math.floor((this.cam.x - this.width / this.cam.zoom) / cs) - 1);
      const maxVisCol = Math.min(world.totalCols - 1, Math.ceil((this.cam.x + this.width / this.cam.zoom) / cs) + 1);

      for (let c = minVisCol; c <= maxVisCol; c++) {
        for (let r = 0; r < world.rows; r++) {
          if (world.grid[r][c] !== PT.CELL.SOLID) continue;
          const seed = world.soilSeed[r][c];
          const px = c * cs;
          const py = r * cs;

          // Roots in upper 1.2m
          if (r <= 1 && seed > 0.42) {
            ctx.strokeStyle = 'rgba(164, 128, 76, 0.32)';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(px + cs * (0.2 + seed * 0.5), py + 2);
            ctx.quadraticCurveTo(px + cs * 0.45, py + cs * 0.5, px + cs * (0.3 + (seed * 7 % 1) * 0.4), py + cs * 0.85);
            ctx.stroke();
          }

          // Smooth rounded pebbles
          if (seed < 0.34) {
            ctx.fillStyle = seed < 0.17 ? 'rgba(182, 142, 102, 0.25)' : 'rgba(42, 24, 12, 0.28)';
            ctx.beginPath();
            ctx.ellipse(px + cs * (0.25 + seed * 1.4), py + cs * (0.35 + (seed * 5 % 0.45)), 4.5, 3, seed * 3, 0, Math.PI * 2);
            ctx.fill();
          }

          // Special Procedural Terrain Features (Clay Vein, Root Cache, Sandstone Boulder)
          const mod = world.cellMod && world.cellMod[r] ? world.cellMod[r][c] : PT.CELL_MOD.NONE;
          if (mod === PT.CELL_MOD.CLAY) {
            ctx.fillStyle = 'rgba(205, 118, 62, 0.65)';
            ctx.beginPath();
            ctx.roundRect(px + 9, py + 11, cs - 18, cs - 22, 7);
            ctx.fill();
            ctx.fillStyle = 'rgba(255, 198, 130, 0.72)';
            ctx.beginPath();
            ctx.arc(px + cs * 0.38, py + cs * 0.46, 3.2, 0, Math.PI * 2);
            ctx.arc(px + cs * 0.62, py + cs * 0.56, 2.5, 0, Math.PI * 2);
            ctx.fill();
          } else if (mod === PT.CELL_MOD.ROOT) {
            ctx.strokeStyle = '#dfb05e';
            ctx.lineWidth = 2.4;
            ctx.beginPath();
            ctx.moveTo(px + 12, py + 8);
            ctx.quadraticCurveTo(px + cs * 0.48, py + cs * 0.52, px + 14, py + cs - 10);
            ctx.moveTo(px + cs * 0.55, py + 10);
            ctx.quadraticCurveTo(px + cs * 0.52, py + cs * 0.55, px + cs - 12, py + cs - 12);
            ctx.stroke();
            ctx.fillStyle = '#f2c86b';
            ctx.beginPath();
            ctx.ellipse(px + cs * 0.48, py + cs * 0.52, 8, 5, 0.25, 0, Math.PI * 2);
            ctx.fill();
          } else if (mod === PT.CELL_MOD.ROCK) {
            ctx.fillStyle = '#736a63';
            ctx.beginPath();
            ctx.moveTo(px + 8, py + cs - 9);
            ctx.lineTo(px + 12, py + 12);
            ctx.lineTo(px + cs * 0.54, py + 8);
            ctx.lineTo(px + cs - 9, py + 18);
            ctx.lineTo(px + cs - 8, py + cs - 8);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#a39990';
            ctx.lineWidth = 1.4;
            ctx.stroke();
          } else if (mod === PT.CELL_MOD.AQUIFER) {
            ctx.fillStyle = 'rgba(72, 184, 214, 0.52)';
            ctx.beginPath();
            ctx.roundRect(px + 9, py + 12, cs - 18, cs - 22, 8);
            ctx.fill();
            ctx.fillStyle = 'rgba(204, 248, 255, 0.85)';
            ctx.beginPath();
            ctx.arc(px + cs * 0.4, py + cs * 0.48, 2.8, 0, Math.PI * 2);
            ctx.arc(px + cs * 0.62, py + cs * 0.56, 2.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // 1.5m Coyote Dig Limit Stratum Line!
      const coyoteY = PT.COYOTE_DIG_LIMIT_ROWS * cs;
      ctx.save();
      ctx.strokeStyle = 'rgba(232, 134, 72, 0.48)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(world.unlockedMinCol * cs, coyoteY);
      ctx.lineTo((world.unlockedMaxCol + 1) * cs, coyoteY);
      ctx.stroke();

      ctx.fillStyle = 'rgba(247, 178, 114, 0.85)';
      ctx.font = 'bold 10px sans-serif';
      const labelX = Math.max(world.unlockedMinCol * cs + 10, this.cam.x - (this.width * 0.44) / this.cam.zoom);
      ctx.fillText('1.5m Coyote Dig Limit — Safe Nurseries Below ↓', labelX, coyoteY - 5);
      ctx.restore();

      // Depth meter markers on left edge of unlocked territory
      ctx.save();
      ctx.fillStyle = 'rgba(248, 232, 198, 0.65)';
      ctx.font = '600 10px sans-serif';
      for (let m = 1; m <= 5; m++) {
        const y = m * 2 * cs;
        ctx.fillText(`-${m}.0m`, world.unlockedMinCol * cs - 34, y + 3);
      }
      ctx.restore();
    }

    // ==================== SIGHTLINES ====================
    _drawSightlines(ctx, world, dogs, cs, timeSec) {
      const sentries = dogs.filter((d) => !d.isPup && d.role === PT.ROLES.SENTRY && d.row < 0.25);

      // Show gentle "Needs Sentry" alert badge above any open entrance not guarded by a Sentry!
      for (const ec of world.getEntrances()) {
        const guarded = sentries.some((s) => Math.abs(s.col - ec) <= 1.2);
        if (!guarded) {
          ctx.save();
          ctx.fillStyle = 'rgba(235, 130, 56, 0.88)';
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('⚠ No Sentry', (ec + 0.5) * cs, -34);
          ctx.restore();
        }
      }

      if (sentries.length === 0) return;

      for (const s of sentries) {
        const zone = world.sightlineZones.find((z) => Math.abs(z.col - s.col) <= 1.2);
        if (!zone) continue;

        const sx = (s.col + 0.5) * cs;
        const sy = -cs * 0.48;
        const lx = zone.leftCol * cs;
        const rx = (zone.rightCol + 1) * cs;

        ctx.save();
        const grad = ctx.createRadialGradient(sx, sy, 12, sx, sy, Math.max(24, sx - lx, rx - sx));
        grad.addColorStop(0, 'rgba(255, 230, 140, 0.16)');
        grad.addColorStop(1, 'rgba(255, 230, 140, 0.0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(lx, -cs * 1.4);
        ctx.lineTo(lx, 0);
        ctx.lineTo(rx, 0);
        ctx.lineTo(rx, -cs * 1.4);
        ctx.closePath();
        ctx.fill();

        // Subtle sightline arc ticks
        ctx.strokeStyle = `rgba(255, 224, 130, ${0.18 + Math.sin(timeSec * 2) * 0.05})`;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(lx + 4, -cs * 0.45);
        ctx.lineTo(rx - 4, -cs * 0.45);
        ctx.stroke();
        ctx.restore();
      }
    }

    // ==================== EXCAVATED TUNNELS & SPECIALIZED CHAMBERS ====================
    _drawBurrowNetwork(ctx, world, resources, cs, timeSec) {
      // Pass 1: Organic rounded soil rim (carved dark earth outline)
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const drawCellPass = (radiusPad, fillColor) => {
        ctx.fillStyle = fillColor;
        for (let r = 0; r < world.rows; r++) {
          for (let c = 0; c < world.totalCols; c++) {
            const type = world.grid[r][c];
            if (type === PT.CELL.SOLID) continue;

            const cx = (c + 0.5) * cs;
            const cy = (r + 0.5) * cs;
            const isChamber = type >= PT.CELL.LISTENING;
            const rad = (isChamber ? cs * 0.48 : cs * 0.34) + radiusPad;

            ctx.beginPath();
            ctx.arc(cx, cy, rad, 0, Math.PI * 2);
            ctx.fill();

            // Smooth horizontal/vertical tunnel bridges
            if (c + 1 < world.totalCols && world.grid[r][c + 1] !== PT.CELL.SOLID) {
              const h = (isChamber || world.grid[r][c + 1] >= PT.CELL.LISTENING ? cs * 0.72 : cs * 0.62) + radiusPad * 2;
              ctx.fillRect(cx, cy - h * 0.5, cs, h);
            }
            if (r + 1 < world.rows && world.grid[r + 1][c] !== PT.CELL.SOLID) {
              const w = cs * 0.58 + radiusPad * 2;
              ctx.fillRect(cx - w * 0.5, cy, w, cs);
            }
          }
        }
      };

      drawCellPass(4, '#2f1a0c'); // Dark compacted tunnel wall border
      drawCellPass(0, '#4a2b17'); // Warm excavated interior earth

      // Pass 2: Cozy interior glow & specialized chamber furnishings
      for (let r = 0; r < world.rows; r++) {
        for (let c = 0; c < world.totalCols; c++) {
          const type = world.grid[r][c];
          if (type === PT.CELL.SOLID) continue;

          const cx = (c + 0.5) * cs;
          const cy = (r + 0.5) * cs;
          const unowned = !world.isUnlocked(c);

          if (type >= PT.CELL.LISTENING && !unowned) {
            // Cozy ambient interior glow
            const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, cs * 0.75);
            const warmCol = type === PT.CELL.NURSERY ? 'rgba(255, 208, 120, 0.34)'
              : type === PT.CELL.GRANARY ? 'rgba(242, 198, 92, 0.28)'
              : type === PT.CELL.LATRINE ? 'rgba(155, 210, 175, 0.22)'
              : 'rgba(255, 218, 150, 0.25)';
            glow.addColorStop(0, warmCol);
            glow.addColorStop(1, 'rgba(74, 43, 23, 0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(cx, cy, cs * 0.75, 0, Math.PI * 2);
            ctx.fill();
          }

          // Specific chamber props
          if (type === PT.CELL.LISTENING) {
            // Acoustic shelf rim & subtle listening wave arc
            ctx.strokeStyle = 'rgba(255, 224, 160, 0.45)';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(cx, cy - 2, 10, Math.PI * 1.15, Math.PI * 1.85);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx, cy - 2, 15, Math.PI * 1.2, Math.PI * 1.8);
            ctx.stroke();
            ctx.fillStyle = 'rgba(245, 215, 165, 0.75)';
            ctx.font = 'bold 9px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Listen', cx, cy + 15);
          } else if (type === PT.CELL.NURSERY) {
            // Golden dry-grass bedding strands!
            ctx.strokeStyle = '#d9b45a';
            ctx.lineWidth = 2.2;
            for (let i = -3; i <= 3; i++) {
              ctx.beginPath();
              ctx.moveTo(cx + i * 4.5 - 5, cy + 12);
              ctx.quadraticCurveTo(cx + i * 4.2, cy + 7, cx + i * 4.5 + 6, cy + 13);
              ctx.stroke();
            }
            ctx.fillStyle = '#ffe5a8';
            ctx.font = 'bold 9px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Nursery', cx, cy - 11);
          } else if (type === PT.CELL.LATRINE) {
            // Tidy pebble floor & clean swirl
            ctx.fillStyle = '#8b7355';
            ctx.beginPath();
            ctx.ellipse(cx, cy + 10, 12, 5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#bfe6c8';
            ctx.font = 'bold 9px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Latrine', cx, cy - 10);
          } else if (type === PT.CELL.GRANARY) {
            // Stacked golden seed & grass bundles scaling with Food
            const fillRatio = Math.min(1, Math.max(0.2, (resources ? resources.food : 25) / 60));
            const bundles = Math.ceil(fillRatio * 4);
            ctx.fillStyle = '#e0b34a';
            for (let b = 0; b < bundles; b++) {
              const bx = cx - 9 + (b % 2) * 11;
              const by = cy + 9 - Math.floor(b / 2) * 7;
              ctx.beginPath();
              ctx.ellipse(bx, by, 7, 4.2, 0.15, 0, Math.PI * 2);
              ctx.fill();
              ctx.strokeStyle = '#9c7120';
              ctx.lineWidth = 1;
              ctx.stroke();
            }
            ctx.fillStyle = '#ffe4a1';
            ctx.font = 'bold 9px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Granary', cx, cy - 11);
          }

          // Active Mineral Spring shimmer floor when an Aquifer pocket is tapped
          if (world.cellMod && world.cellMod[r] && world.cellMod[r][c] === PT.CELL_MOD.SPRING) {
            ctx.fillStyle = 'rgba(72, 206, 232, 0.42)';
            ctx.beginPath();
            ctx.ellipse(cx, cy + 12, 13, 4.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(205, 250, 255, 0.85)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(cx + Math.sin(timeSec * 3 + c) * 3, cy + 11, 4, 0.2, Math.PI);
            ctx.stroke();
          }

          // Flood water overlay
          const w = world.water[r][c];
          if (w > 0.04) {
            const wh = cs * 0.72 * w;
            const wy = (r + 1) * cs - wh - 4;
            ctx.fillStyle = 'rgba(68, 134, 178, 0.55)';
            ctx.beginPath();
            ctx.roundRect(c * cs + 5, wy, cs - 10, wh, 6);
            ctx.fill();
            // Shimmering ripple line
            ctx.strokeStyle = 'rgba(195, 235, 255, 0.6)';
            ctx.lineWidth = 1.3;
            ctx.beginPath();
            ctx.moveTo(c * cs + 8, wy + 1);
            ctx.lineTo((c + 1) * cs - 8, wy + 1 + Math.sin(timeSec * 4 + c) * 1.5);
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    }

    // ==================== TASKS & NEIGHBOR BORDERS ====================
    _drawTasksAndBorders(ctx, world, cs, timeSec) {
      // Queued dig/mound blueprints
      for (const t of world.tasks) {
        const px = t.col * cs;
        const py = t.kind === 'mound' ? -cs * 0.55 : t.row * cs;
        const prog = Math.min(1, t.workDone / Math.max(0.1, t.workTotal));

        ctx.save();
        ctx.strokeStyle = 'rgba(255, 214, 110, 0.85)';
        ctx.fillStyle = 'rgba(255, 214, 110, 0.16)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.roundRect(px + 4, py + 4, cs - 8, cs - 8, 8);
        ctx.fill();
        ctx.stroke();

        // Progress bar
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(30, 18, 10, 0.75)';
        ctx.fillRect(px + 7, py + cs - 11, cs - 14, 5);
        ctx.fillStyle = '#f2b849';
        ctx.fillRect(px + 7, py + cs - 11, (cs - 14) * prog, 5);
        ctx.restore();
      }

      // Neighbor territory borders
      for (const nb of world.neighbors) {
        if (nb.merged) continue;
        const bx = (nb.borderCol + (nb.side === 'east' ? 0 : 1)) * cs;
        const reachable = world.getAvailableNeighbors().some((n) => n.id === nb.id);

        ctx.save();
        ctx.strokeStyle = reachable ? '#ffd26a' : 'rgba(240, 204, 145, 0.4)';
        ctx.lineWidth = reachable ? 2.5 : 1.5;
        ctx.setLineDash([7, 5]);
        ctx.beginPath();
        ctx.moveTo(bx, -cs * 1.2);
        ctx.lineTo(bx, world.rows * cs);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.fillStyle = reachable ? 'rgba(247, 194, 72, 0.94)' : 'rgba(72, 46, 26, 0.78)';
        ctx.beginPath();
        ctx.roundRect(bx - 52, cs * 1.4, 104, 24, 8);
        ctx.fill();
        ctx.fillStyle = reachable ? '#2f1a09' : '#f2dfc0';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(reachable ? '🦷 Kin Check Ready!' : nb.name, bx, cs * 1.4 + 15);
        ctx.restore();
      }
    }

    // ==================== MOUNDS (RAW, CRATER, DOME) ====================
    _drawMounds(ctx, world, cs) {
      for (let c = 0; c < world.totalCols; c++) {
        const mt = world.mounds[c].type;
        if (mt === PT.MOUND.NONE) continue;

        const cx = (c + 0.5) * cs;
        const unowned = !world.isUnlocked(c);
        ctx.save();
        if (unowned) ctx.globalAlpha = 0.8;

        if (mt === PT.MOUND.RAW) {
          // Low messy lip of excavated dirt
          ctx.fillStyle = '#6f4525';
          ctx.beginPath();
          ctx.moveTo(cx - 18, 2);
          ctx.quadraticCurveTo(cx - 12, -8, cx - 7, -5);
          ctx.lineTo(cx + 7, -5);
          ctx.quadraticCurveTo(cx + 12, -8, cx + 18, 2);
          ctx.closePath();
          ctx.fill();
          // Dark hole entrance
          ctx.fillStyle = '#241207';
          ctx.beginPath();
          ctx.ellipse(cx, -1, 9, 4.5, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (mt === PT.MOUND.CRATER) {
          // Tall packed volcano-like rim mound!
          const grad = ctx.createLinearGradient(cx, -28, cx, 4);
          grad.addColorStop(0, '#b57644');
          grad.addColorStop(0.55, '#8c532b');
          grad.addColorStop(1, '#5d3419');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(cx - 28, 3);
          ctx.bezierCurveTo(cx - 20, -4, cx - 16, -26, cx - 10, -28);
          ctx.lineTo(cx + 10, -28);
          ctx.bezierCurveTo(cx + 16, -26, cx + 20, -4, cx + 28, 3);
          ctx.closePath();
          ctx.fill();

          // Rim highlight & flood-proof levee lip
          ctx.strokeStyle = '#d49a66';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cx - 11, -27);
          ctx.lineTo(cx + 11, -27);
          ctx.stroke();

          // Crater shaft opening at top
          ctx.fillStyle = '#251208';
          ctx.beginPath();
          ctx.ellipse(cx, -26.5, 8.5, 3.6, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (mt === PT.MOUND.DOME) {
          // Low smooth rounded aerodynamic dome mound!
          const grad = ctx.createLinearGradient(cx, -14, cx, 4);
          grad.addColorStop(0, '#c28956');
          grad.addColorStop(1, '#7a4925');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(cx - 26, 3);
          ctx.quadraticCurveTo(cx, -19, cx + 26, 3);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#251208';
          ctx.beginPath();
          ctx.ellipse(cx, -7, 8, 3.4, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }
    }

    // ==================== SWAYING MULTI-BLADE PRAIRIE GRASS ====================
    _drawGrassLayer(ctx, world, cs, windSpeed, timeSec, layer) {
      const minVis = Math.max(0, Math.floor((this.cam.x - this.width / this.cam.zoom) / cs) - 2);
      const maxVis = Math.min(world.totalCols - 1, Math.ceil((this.cam.x + this.width / this.cam.zoom) / cs) + 2);

      ctx.save();
      for (let c = minVis; c <= maxVis; c++) {
        if (world.mounds[c].type !== PT.MOUND.NONE) continue;
        const g = world.grass[c];
        const px = c * cs;
        const hPx = g.height * 46;
        const blades = layer === 'back' ? 3 : 3;
        const sway = Math.sin(timeSec * (1.8 + windSpeed * 1.4) + c * 0.65) * (3 + windSpeed * 9) * g.height;

        for (let b = 0; b < blades; b++) {
          const offset = layer === 'back' ? (b * 13 + 5) : (b * 13 + 11);
          const bx = px + offset;
          const bh = hPx * (0.78 + ((c + b) % 3) * 0.14);

          ctx.strokeStyle = layer === 'back'
            ? (g.height < 0.35 ? '#7ea343' : '#658532')
            : (g.height < 0.35 ? '#96ba52' : '#949d41');
          ctx.lineWidth = g.height < 0.35 ? 2.4 : 2.1;
          ctx.lineCap = 'round';

          ctx.beginPath();
          ctx.moveTo(bx, 1);
          ctx.quadraticCurveTo(bx + sway * 0.35, -bh * 0.55, bx + sway, -bh);
          ctx.stroke();

          // Golden seed head on tall unclipped grass
          if (layer === 'front' && g.height > 0.55 && b === 1) {
            ctx.fillStyle = g.flower ? '#f4d35e' : '#d6b25c';
            ctx.beginPath();
            ctx.ellipse(bx + sway, -bh - 2, 2.2, 4.2, sway * 0.02, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Visual indicator for player-marked trim target
        if (layer === 'front' && g.trimMarked) {
          ctx.strokeStyle = 'rgba(245, 224, 110, 0.8)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(px + cs * 0.5, -hPx - 8, 5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Golden Seed Blooms & Burrowing Owl Ally on front surface pass
      if (layer === 'front') {
        if (world.blooms) {
          for (const bl of world.blooms) {
            const bx = (bl.col + 0.5) * cs;
            const pulse = 0.78 + Math.sin(timeSec * 4.5 + bl.id) * 0.22;
            ctx.fillStyle = bl.isRare
              ? `rgba(218, 128, 255, ${0.32 * pulse})`
              : `rgba(255, 228, 92, ${0.26 * pulse})`;
            ctx.beginPath();
            ctx.arc(bx, -14, (bl.isRare ? 19 : 16) * pulse, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = bl.isRare ? '#f4a2ff' : '#ffe066';
            for (let p = 0; p < 5; p++) {
              const ang = (p / 5) * Math.PI * 2 + timeSec * 0.6;
              ctx.beginPath();
              ctx.arc(bx + Math.cos(ang) * 5, -14 + Math.sin(ang) * 5, bl.isRare ? 3.8 : 3.2, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.fillStyle = bl.isRare ? '#9c36b5' : '#c4751f';
            ctx.beginPath();
            ctx.arc(bx, -14, 2.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        if (world.owlCol !== null) {
          const ox = (world.owlCol + 0.88) * cs;
          const oy = world.mounds[world.owlCol]?.type === PT.MOUND.CRATER ? -26 : -14;
          ctx.save();
          ctx.translate(ox, oy);
          // Body
          ctx.fillStyle = '#8b6845';
          ctx.beginPath();
          ctx.ellipse(0, -8, 7, 10, 0, 0, Math.PI * 2);
          ctx.fill();
          // White belly speckles
          ctx.fillStyle = '#f2e4c9';
          ctx.beginPath();
          ctx.ellipse(0, -5, 4.5, 6, 0, 0, Math.PI * 2);
          ctx.fill();
          // Expressive round eyes + tiny beak
          ctx.fillStyle = '#ffe159';
          ctx.beginPath();
          ctx.arc(-2.5, -14, 2.3, 0, Math.PI * 2);
          ctx.arc(2.5, -14, 2.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#1b110a';
          ctx.beginPath();
          ctx.arc(-2.5, -14, 1.1, 0, Math.PI * 2);
          ctx.arc(2.5, -14, 1.1, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#e59a38';
          ctx.beginPath();
          ctx.moveTo(-1.5, -12);
          ctx.lineTo(1.5, -12);
          ctx.lineTo(0, -9.5);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.restore();
    }

    // ==================== NEIGHBOR PREVIEW DOGS ====================
    _drawNeighborPreviews(ctx, world, cs, timeSec) {
      for (const nb of world.neighbors) {
        if (nb.merged) continue;
        const mx = (nb.moundCol + 0.5) * cs;
        const my = nb.side === 'east' ? -10 : -26;
        this._drawSinglePrairieDog(ctx, {
          col: nb.moundCol,
          row: -1,
          facing: nb.side === 'east' ? -1 : 1,
          role: PT.ROLES.SENTRY,
          state: 'sentry_watch',
          isPup: false,
          hopPhase: timeSec,
          isBlinking: false,
          noseTimer: timeSec * 3,
          tailFlickTimer: 0,
          carryingFood: 0
        }, mx, my, cs, false, timeSec);
      }
    }

    // ==================== MULTI-PART PRAIRIE DOG CHARACTERS ====================
    _drawDogs(ctx, dogs, world, cs, timeSec, selectedDogId) {
      for (const dog of dogs) {
        const wx = (dog.col + 0.5) * cs;
        let wy = dog.row < -0.2 ? 0 : (dog.row + 0.72) * cs;

        // Adjust vertical perch to rest naturally atop Crater/Dome/Raw mounds!
        if (dog.row < -0.2) {
          const cIdx = Math.max(0, Math.min(world.totalCols - 1, Math.round(dog.col)));
          const mt = world.mounds[cIdx] ? world.mounds[cIdx].type : PT.MOUND.NONE;
          if (mt === PT.MOUND.CRATER) wy = -26;
          else if (mt === PT.MOUND.DOME) wy = -11;
          else if (mt === PT.MOUND.RAW) wy = -5;
          else wy = -1;
        }

        this._drawSinglePrairieDog(ctx, dog, wx, wy, cs, dog.id === selectedDogId, timeSec);
      }
    }

    _drawSinglePrairieDog(ctx, dog, wx, wy, cs, isSelected, timeSec) {
      const scale = dog.isPup ? 0.64 : 0.96;
      const isHopping = dog.path && dog.path.length > 0;
      const hopArc = isHopping ? Math.abs(Math.sin(dog.hopPhase)) : 0;
      const stretchY = isHopping ? 1 + hopArc * 0.14 : 1;
      const squashX = isHopping ? 1 - hopArc * 0.08 : 1;
      const bounceY = isHopping ? -hopArc * 7 : 0;

      ctx.save();
      ctx.translate(wx, wy + bounceY);

      if (isSelected) {
        ctx.strokeStyle = '#ffe073';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, -10 * scale, 18 * scale, 22 * scale, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.scale(dog.facing * scale * squashX, scale * stretchY);

      // Soft contact shadow
      ctx.fillStyle = 'rgba(20, 10, 4, 0.28)';
      ctx.beginPath();
      ctx.ellipse(0, 2, 12, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();

      const upright = dog.role === PT.ROLES.SENTRY && (dog.state === 'sentry_watch' || dog.state === 'listening');
      const diving = dog.state === 'diving';
      if (diving) {
        ctx.rotate(0.35);
      }

      // Tail with signature black tip!
      const flick = (dog.tailFlickTimer > 0 || dog.state === 'tooth_touch') ? Math.sin(timeSec * 28) * 0.45 : Math.sin(timeSec * 3) * 0.08;
      ctx.save();
      ctx.translate(-9, upright ? -6 : -4);
      ctx.rotate(-0.4 + flick);
      ctx.fillStyle = '#c89254';
      ctx.beginPath();
      ctx.ellipse(-5, 0, 7, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2b1d13';
      ctx.beginPath();
      ctx.ellipse(-10.5, 0, 3.2, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Pear-shaped furry body
      const bodyGrad = ctx.createRadialGradient(-2, upright ? -16 : -10, 2, 0, upright ? -12 : -8, 16);
      bodyGrad.addColorStop(0, '#e3ae6d');
      bodyGrad.addColorStop(0.65, '#c68949');
      bodyGrad.addColorStop(1, '#98602d');
      ctx.fillStyle = bodyGrad;

      ctx.beginPath();
      if (upright) {
        ctx.moveTo(-10, 0);
        ctx.bezierCurveTo(-12, -12, -8, -26, 0, -27);
        ctx.bezierCurveTo(9, -26, 11, -12, 9, 0);
      } else {
        ctx.moveTo(-12, 0);
        ctx.bezierCurveTo(-14, -10, -7, -19, 3, -18);
        ctx.bezierCurveTo(12, -17, 14, -8, 10, 0);
      }
      ctx.closePath();
      ctx.fill();

      // Lighter warm cream belly
      ctx.fillStyle = '#f5dfb8';
      ctx.beginPath();
      if (upright) {
        ctx.ellipse(3.2, -11, 5.2, 9.5, 0.08, 0, Math.PI * 2);
      } else {
        ctx.ellipse(4, -6, 6.2, 5.5, 0.25, 0, Math.PI * 2);
      }
      ctx.fill();

      // Hind feet
      ctx.fillStyle = dog.role === PT.ROLES.DIGGER ? '#6b4228' : '#b87f47';
      ctx.beginPath();
      ctx.ellipse(-3, 0, 4.5, 2.2, 0, 0, Math.PI * 2);
      ctx.ellipse(6, 0, 4.8, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();

      // Front paws (Sentry raises paws near mouth; Digger shows dusty paw effect!)
      ctx.fillStyle = dog.role === PT.ROLES.DIGGER ? '#5a351c' : '#d8a062';
      if (upright) {
        ctx.beginPath();
        ctx.ellipse(7.5, -20, 3.2, 2.1, -0.45, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const pawDig = dog.state === 'digging' ? Math.sin(timeSec * 22) * 3 : 0;
        ctx.beginPath();
        ctx.ellipse(9 + pawDig, -3, 3.2, 2.1, 0.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Head (larger proportion for adorable Pups!)
      const headX = upright ? 1.5 : 8.5;
      const headY = upright ? -28 : -16;
      const headScale = dog.isPup ? 1.24 : 1.0;

      ctx.save();
      ctx.translate(headX, headY);
      ctx.scale(headScale, headScale);

      // Tiny rounded ear
      ctx.fillStyle = '#a86e37';
      ctx.beginPath();
      ctx.ellipse(-4.5, -7, 3.3, 3.6, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e7be8c';
      ctx.beginPath();
      ctx.ellipse(-4.2, -6.7, 1.8, 2.0, -0.3, 0, Math.PI * 2);
      ctx.fill();

      // Role visual flair so workers are immediately recognizable on canvas!
      if (!dog.isPup) {
        if (dog.role === PT.ROLES.SENTRY) {
          // Crisp golden watch feather crest
          ctx.fillStyle = '#f2b849';
          ctx.beginPath();
          ctx.moveTo(-2, -7);
          ctx.lineTo(-5, -13);
          ctx.lineTo(1, -8);
          ctx.closePath();
          ctx.fill();
        } else if (dog.role === PT.ROLES.GARDENER) {
          // Fresh green clover leaf tucked behind ear
          ctx.fillStyle = '#68a63c';
          ctx.beginPath();
          ctx.ellipse(-6.5, -9, 3.4, 2.1, -0.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (dog.role === PT.ROLES.DIGGER) {
          // Earthy smudge & miner brow band
          ctx.strokeStyle = '#6f4222';
          ctx.lineWidth = 2.1;
          ctx.beginPath();
          ctx.moveTo(-5, -4);
          ctx.lineTo(4, -5);
          ctx.stroke();
        } else if (dog.role === PT.ROLES.FORAGER) {
          // Woven straw seed pouch ribbon at neck
          ctx.strokeStyle = '#d9b448';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-3, 6);
          ctx.lineTo(2, 7.5);
          ctx.stroke();
        }
      }

      // Rounded cheek/head fur
      const headGrad = ctx.createRadialGradient(1, -2, 2, 0, 0, 10);
      headGrad.addColorStop(0, '#ebbc7f');
      headGrad.addColorStop(1, '#ba7e42');
      ctx.fillStyle = headGrad;
      ctx.beginPath();
      ctx.ellipse(0, 0, 8.8, 7.6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Cheek highlight
      ctx.fillStyle = '#f6e1ba';
      ctx.beginPath();
      ctx.ellipse(3.5, 2.2, 4.4, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Dark glossy eye + white catchlight (blinks!)
      if (dog.isBlinking) {
        ctx.strokeStyle = '#2d1c10';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(1.5, -2);
        ctx.lineTo(5.2, -2);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#1b110a';
        ctx.beginPath();
        ctx.arc(3.2, -2.2, dog.isPup ? 2.6 : 2.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(3.8, -2.9, 0.85, 0, Math.PI * 2);
        ctx.fill();
      }

      // Twitching dark nose
      const noseTwitch = Math.sin(dog.noseTimer) * 0.6;
      ctx.fillStyle = '#311d13';
      ctx.beginPath();
      ctx.ellipse(8.2, -0.2 + noseTwitch, 2.0, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Buck teeth during Tooth-Touch greeting!
      if (dog.state === 'tooth_touch') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(7.4, 1.8, 2.1, 2.6);
        ctx.strokeStyle = '#d4c8b4';
        ctx.lineWidth = 0.6;
        ctx.strokeRect(7.4, 1.8, 2.1, 2.6);
      }

      // Forager carrying golden seed & dry grass bundle!
      if (dog.carryingFood > 0) {
        ctx.fillStyle = '#e7be4e';
        ctx.beginPath();
        ctx.ellipse(10.5, 1.5, 5.2, 2.5, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#89a841';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(7, 2);
        ctx.lineTo(14, 0.5);
        ctx.stroke();
      }

      // Listening Chamber awareness arc
      if (dog.state === 'listening') {
        ctx.strokeStyle = '#ffe588';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(-2, -9, 7, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      }

      ctx.restore();
      ctx.restore();
    }

    // ==================== PREDATOR SILHOUETTES ====================
    _drawPredators(ctx, predators, world, cs, timeSec, pass) {
      for (const p of predators) {
        const px = (p.xCol + 0.5) * cs;

        if (p.type === 'HAWK') {
          // Growing ground shadow during dive
          if (pass === 'ground') {
            const shadowScale = Math.max(0.35, 1.4 - Math.abs(p.yMeters) * 0.22);
            ctx.save();
            ctx.fillStyle = `rgba(22, 16, 12, ${0.22 + shadowScale * 0.22})`;
            ctx.beginPath();
            ctx.ellipse(px, -2, 24 * shadowScale, 6 * shadowScale, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          } else if (pass === 'air') {
            const py = p.yMeters * cs;
            const wingFlap = p.state === 'swooping' ? -0.35 : Math.sin(p.stridePhase) * 0.45;
            ctx.save();
            ctx.translate(px, py);
            ctx.scale(p.dir, 1);

            // Sharp-winged Hawk silhouette
            ctx.fillStyle = '#472d1c';
            ctx.beginPath();
            ctx.ellipse(0, 0, 18, 6.5, -0.1, 0, Math.PI * 2);
            ctx.fill();

            // Tail fan
            ctx.fillStyle = '#8c4427';
            ctx.beginPath();
            ctx.moveTo(-14, 0);
            ctx.lineTo(-30, -6);
            ctx.lineTo(-28, 6);
            ctx.closePath();
            ctx.fill();

            // Swept Raptor Wings
            ctx.fillStyle = '#382214';
            ctx.beginPath();
            ctx.moveTo(-4, -2);
            ctx.quadraticCurveTo(6, -24 + wingFlap * 18, -18, -30 + wingFlap * 24);
            ctx.lineTo(-10, -2);
            ctx.closePath();
            ctx.fill();

            // Hooked beak & golden eye
            ctx.fillStyle = '#e6b13c';
            ctx.beginPath();
            ctx.moveTo(16, -2);
            ctx.lineTo(22, 1);
            ctx.lineTo(16, 3);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
          }
        } else if (p.type === 'COYOTE' && pass === 'ground') {
          ctx.save();
          ctx.translate(px, -4);
          ctx.scale(p.dir, 1);
          const alpha = 1 - p.camouflage * 0.48;
          ctx.globalAlpha = alpha;

          const stalkBob = p.state === 'digging_shallow' ? Math.sin(timeSec * 16) * 2 : Math.sin(p.stridePhase) * 1.8;

          // Sleek, low-slung coyote silhouette
          ctx.fillStyle = '#4b3b30';
          ctx.beginPath();
          ctx.moveTo(-28, -9 + stalkBob);
          ctx.quadraticCurveTo(-8, -18 + stalkBob, 14, -14 + stalkBob);
          ctx.lineTo(26, -18 + stalkBob); // snout
          ctx.lineTo(28, -14 + stalkBob);
          ctx.lineTo(18, -10 + stalkBob);
          ctx.quadraticCurveTo(0, -4 + stalkBob, -24, -4 + stalkBob);
          ctx.closePath();
          ctx.fill();

          // Pointy ears
          ctx.beginPath();
          ctx.moveTo(14, -15 + stalkBob);
          ctx.lineTo(11, -25 + stalkBob);
          ctx.lineTo(18, -17 + stalkBob);
          ctx.fill();

          // Bushy low tail
          ctx.beginPath();
          ctx.moveTo(-26, -8 + stalkBob);
          ctx.quadraticCurveTo(-40, -5, -44, 1);
          ctx.quadraticCurveTo(-34, -1, -24, -5);
          ctx.fill();

          // Stalking legs
          ctx.strokeStyle = '#3b2d24';
          ctx.lineWidth = 3.5;
          const legSwing = Math.sin(p.stridePhase) * 6;
          ctx.beginPath();
          ctx.moveTo(10, -8); ctx.lineTo(12 + legSwing, 2);
          ctx.moveTo(6, -8); ctx.lineTo(5 - legSwing, 2);
          ctx.moveTo(-16, -7); ctx.lineTo(-18 - legSwing, 2);
          ctx.moveTo(-20, -7); ctx.lineTo(-20 + legSwing, 2);
          ctx.stroke();

          // Glowing amber predator eye (peeks even through tall grass!)
          ctx.globalAlpha = 0.95;
          ctx.fillStyle = '#ffbe3d';
          ctx.beginPath();
          ctx.arc(20, -15 + stalkBob, 2.0, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
        } else if (p.type === 'HUMAN') {
          if (pass === 'ground') {
            // Long cast shadow + muddy boot steps
            ctx.save();
            ctx.fillStyle = 'rgba(20, 14, 10, 0.28)';
            ctx.beginPath();
            ctx.ellipse(px, 0, 22, 5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          } else if (pass === 'air') {
            ctx.save();
            ctx.translate(px, -2);
            ctx.scale(p.dir, 1);
            const step = Math.sin(p.stridePhase) * 9;

            // Tall boots & striding silhouette legs
            ctx.fillStyle = '#2d2420';
            ctx.beginPath();
            ctx.roundRect(-8 + step, -34, 10, 34, 3);
            ctx.roundRect(-2 - step, -34, 10, 34, 3);
            ctx.fill();

            // Hiking boots
            ctx.fillStyle = '#4a2b18';
            ctx.beginPath();
            ctx.roundRect(-8 + step, -10, 16, 10, 3);
            ctx.roundRect(-2 - step, -10, 16, 10, 3);
            ctx.fill();

            // Coat torso & brimmed ranger hat silhouette fading smoothly upward
            ctx.fillStyle = 'rgba(48, 39, 34, 0.85)';
            ctx.beginPath();
            ctx.roundRect(-12, -78, 24, 48, 6);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(0, -88, 9, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillRect(-15, -91, 30, 3);

            ctx.restore();
          }
        }
      }
    }

    // ==================== BERNOULLI AIRFLOW STREAMLINES ====================
    _drawAirflowOverlay(ctx, world, particles, cs, timeSec, windSpeed) {
      ctx.save();

      // Surface wind streamlines showing faster wind over Crater rims!
      ctx.strokeStyle = 'rgba(170, 232, 248, 0.35)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([10, 12]);
      ctx.lineDashOffset = -timeSec * (45 + windSpeed * 45);
      for (let lane = 0; lane < 2; lane++) {
        const y = -34 - lane * 26;
        ctx.beginPath();
        ctx.moveTo(world.unlockedMinCol * cs, y);
        ctx.lineTo((world.unlockedMaxCol + 1) * cs, y);
        ctx.stroke();
      }

      // Underground Bernoulli tunnel currents from Dome -> Crater
      if (world.bernoulliActive && world.bernoulliPairs.length > 0) {
        ctx.lineCap = 'round';
        for (const pair of world.bernoulliPairs) {
          if (pair.pathCells.length < 2) continue;

          ctx.strokeStyle = 'rgba(122, 224, 245, 0.45)';
          ctx.lineWidth = 2.6;
          ctx.setLineDash([8, 10]);
          ctx.lineDashOffset = -timeSec * (50 + windSpeed * 35);

          ctx.beginPath();
          const domeX = (pair.domeCol + 0.5) * cs;
          ctx.moveTo(domeX - 24, -22);
          ctx.quadraticCurveTo(domeX, -14, domeX, 0);
          for (const [r, c] of pair.pathCells) {
            ctx.lineTo((c + 0.5) * cs, (r + 0.5) * cs);
          }
          const craterX = (pair.craterCol + 0.5) * cs;
          ctx.lineTo(craterX, -32);
          ctx.quadraticCurveTo(craterX + 18, -46, craterX + 46, -48);
          ctx.stroke();

          // Intake / Exhaust labels
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(180, 244, 255, 0.9)';
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('↓ Fresh Air In', domeX, -24);
          ctx.fillText('↑ Warm Stale Out', craterX, -38);
        }

        // Animated airflow wisp beads
        ctx.setLineDash([]);
        for (const w of particles.airflowWisps) {
          const pair = world.bernoulliPairs[w.pairIdx];
          if (!pair || pair.pathCells.length < 2) continue;
          const idx = Math.min(pair.pathCells.length - 1, Math.floor(w.progress * pair.pathCells.length));
          const [r, c] = pair.pathCells[idx];
          const wx = (c + 0.5) * cs;
          const wy = (r + 0.5) * cs;
          ctx.fillStyle = 'rgba(195, 248, 255, 0.85)';
          ctx.beginPath();
          ctx.arc(wx, wy, 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    }

    // ==================== PARTICLES & SOUNDWAVES ====================
    _drawParticles(ctx, particles, cs, timeSec) {
      ctx.save();

      // Floating dandelion seeds
      for (const d of particles.dandelions) {
        const dx = (d.xCol + 0.5) * cs;
        const dy = d.yMeters * cs;
        ctx.strokeStyle = 'rgba(255, 252, 232, 0.72)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(dx, dy);
        ctx.lineTo(dx - 3 * d.size, dy - 4 * d.size);
        ctx.moveTo(dx, dy);
        ctx.lineTo(dx + 3 * d.size, dy - 4 * d.size);
        ctx.moveTo(dx, dy);
        ctx.lineTo(dx, dy + 4 * d.size);
        ctx.stroke();
      }

      // Storm rain streaks
      if (particles.raindrops.length > 0) {
        ctx.strokeStyle = 'rgba(195, 224, 245, 0.45)';
        ctx.lineWidth = 1.2;
        for (const r of particles.raindrops) {
          const rx = (r.xCol + 0.5) * cs;
          const ry = r.yMeters * cs;
          ctx.beginPath();
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx - 4, ry + 14);
          ctx.stroke();
        }
      }

      // Soundwaves radiating from Sentries!
      for (const sw of particles.soundwaves) {
        if (sw.delay > 0) continue;
        const sx = (sw.col + 0.5) * cs;
        const sy = (sw.row < -0.2 ? -18 : (sw.row + 0.35) * cs);
        const alpha = Math.max(0, sw.life / sw.maxLife);
        ctx.strokeStyle = sw.color;
        ctx.globalAlpha = alpha * 0.85;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.arc(sx, sy, sw.radius * cs * 0.45, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Dirt, Grass, Hearts
      for (const p of particles.particles) {
        const px = (p.col + 0.5) * cs;
        const py = p.row < -0.2 ? p.row * cs : (p.row + 0.5) * cs;
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;

        if (p.kind === 'dirt') {
          ctx.beginPath();
          ctx.arc(px, py, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.kind === 'grass') {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(p.rot || 0);
          ctx.fillRect(-p.size, -1, p.size * 2, 2.2);
          ctx.restore();
        } else if (p.kind === 'heart') {
          ctx.font = `${Math.round(p.size + 4)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText('♥', px, py);
        }
      }

      ctx.restore();
    }

    // ==================== PLACEMENT GHOST ====================
    _drawPlacementGhost(ctx, world, tool, hoverCell, cs, opts = {}) {
      const check = world.validatePlacement(tool, hoverCell.row, hoverCell.col, opts);

      ctx.save();
      ctx.strokeStyle = check.ok ? '#7be362' : '#f26b55';
      ctx.fillStyle = check.ok ? 'rgba(123, 227, 98, 0.24)' : 'rgba(242, 107, 85, 0.22)';
      ctx.lineWidth = 2.2;

      const multiCells = (check.ok && check.autoPath && check.autoPath.length > 0)
        ? check.autoPath
        : (check.ok && check.brushCells && check.brushCells.length > 0 ? check.brushCells : null);

      if (multiCells) {
        for (const cell of multiCells) {
          ctx.beginPath();
          ctx.roundRect(cell.col * cs + 3, cell.row * cs + 3, cs - 6, cs - 6, 8);
          ctx.fill();
          ctx.stroke();
        }
      } else {
        const px = hoverCell.col * cs;
        const py = (tool === PT.TOOLS.TRIM || tool === PT.TOOLS.CRATER || tool === PT.TOOLS.DOME)
          ? -cs * 0.65
          : hoverCell.row * cs;
        ctx.beginPath();
        ctx.roundRect(px + 3, py + 3, cs - 6, cs - 6, 8);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    _drawOffscreenPredatorWarnings(ctx, predators, cs, timeSec) {
      if (!predators || predators.length === 0) return;
      for (const p of predators) {
        if (p.done) continue;
        const pos = this.worldToScreen((p.xCol + 0.5) * cs, (p.yMeters || 0) * cs);
        if (pos.sx >= 24 && pos.sx <= this.width - 24) continue;
        const isLeft = pos.sx < 24;
        const x = isLeft ? 18 : this.width - 18;
        const y = Math.max(105, Math.min(this.height - 105, pos.sy));
        const pulse = 0.72 + Math.sin(timeSec * 8) * 0.28;
        const icon = PT.PREDATORS[p.type]?.icon || '⚠️';

        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.fillStyle = p.alarmTriggered && !p.alarmResolved ? 'rgba(204, 48, 32, 0.92)' : 'rgba(186, 104, 24, 0.9)';
        ctx.beginPath();
        ctx.roundRect(isLeft ? x - 6 : x - 48, y - 15, 54, 30, 9);
        ctx.fill();
        ctx.strokeStyle = '#fff1c9';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#fff9eb';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(isLeft ? `◀ ${icon}` : `${icon} ▶`, isLeft ? x + 21 : x - 21, y + 5);
        ctx.restore();
      }
    }

    renderMinimap(minimapCanvas, state) {
      if (!minimapCanvas || !minimapCanvas.getContext) return;
      const mctx = minimapCanvas.getContext('2d');
      const w = minimapCanvas.width || 360;
      const h = minimapCanvas.height || 28;
      const { world, predators } = state;
      const totalCols = world.totalCols || 180;
      const colW = w / totalCols;

      mctx.clearRect(0, 0, w, h);
      // Top prairie sky strip + bottom earth strip
      mctx.fillStyle = '#608fb3';
      mctx.fillRect(0, 0, w, 10);
      mctx.fillStyle = '#4f301b';
      mctx.fillRect(0, 10, w, h - 10);

      // Unlocked colony green turf vs muted unclaimed prairie
      const minX = world.unlockedMinCol * colW;
      const unlockW = (world.unlockedMaxCol - world.unlockedMinCol + 1) * colW;
      mctx.fillStyle = '#3b2415';
      mctx.fillRect(0, 8, minX, h - 8);
      mctx.fillRect(minX + unlockW, 8, w - (minX + unlockW), h - 8);
      mctx.fillStyle = '#739c3e';
      mctx.fillRect(minX, 8, unlockW, 4);

      // Open burrow columns & entrance mounds
      for (let c = 0; c < totalCols; c++) {
        const cx = c * colW;
        let hasTunnel = false;
        for (let r = 0; r < world.rows; r++) {
          if (world.grid[r][c] !== PT.CELL.SOLID) {
            hasTunnel = true;
            break;
          }
        }
        if (hasTunnel) {
          mctx.fillStyle = world.isUnlocked(c) ? '#b67d47' : 'rgba(150, 112, 74, 0.5)';
          mctx.fillRect(cx, 12, Math.max(1.5, colW), 11);
        }
        const mt = world.mounds[c]?.type;
        if (mt && mt !== PT.MOUND.NONE) {
          mctx.fillStyle = mt === PT.MOUND.CRATER ? '#f7b249' : (mt === PT.MOUND.DOME ? '#6ed0eb' : '#d6a46b');
          mctx.fillRect(cx - 0.5, 5, Math.max(2.5, colW + 1), 4);
        }
      }

      // Unmerged neighbor borders ready for Kin Check pulse gold
      const avail = world.getAvailableNeighbors();
      for (const nb of world.neighbors) {
        if (nb.merged) continue;
        const bx = nb.borderCol * colW;
        const ready = avail.some((a) => a.id === nb.id);
        mctx.fillStyle = ready ? '#ffe16b' : 'rgba(240, 200, 140, 0.45)';
        mctx.fillRect(bx, 1, 2, h - 2);
      }

      // Active predators in bright red
      if (predators) {
        mctx.fillStyle = '#ff4d3b';
        for (const p of predators) {
          if (p.done) continue;
          const px = Math.max(1, Math.min(w - 4, p.xCol * colW));
          mctx.fillRect(px, 2, 4, 8);
        }
      }

      // Camera viewport indicator frame
      const viewHalfCols = (this.width * 0.5 / this.cam.zoom) / PT.CELL_SIZE;
      const camCenterCol = this.cam.x / PT.CELL_SIZE;
      const vx1 = Math.max(0, (camCenterCol - viewHalfCols) * colW);
      const vx2 = Math.min(w, (camCenterCol + viewHalfCols) * colW);
      mctx.strokeStyle = 'rgba(255, 250, 232, 0.92)';
      mctx.lineWidth = 1.5;
      mctx.strokeRect(vx1, 1, Math.max(8, vx2 - vx1), h - 2);
    }
  }

  PT.Renderer = Renderer;
})(window);
