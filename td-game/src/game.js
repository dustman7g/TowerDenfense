/**
 * Enhanced Tower Defense Game
 * Features improved graphics, animations, and visual effects
 */

(() => {
  // Particle system for visual effects
  const particles = [];
  function createParticle(x, y, color, size, velocity, life, gravity = 0) {
    particles.push({
      x, y, color, size,
      vx: (Math.random() - 0.5) * velocity,
      vy: (Math.random() - 0.5) * velocity,
      life,
      maxLife: life,
      gravity
    });
  }

  // Targeting rules: which towers can hit which enemies
  function canTowerHit(towerType, enemy) {
    if (enemy.type === 'jet') {
      return towerType === 'basic' || towerType === 'sniper' || towerType === 'missile';
    }
    return true; // others are ground and can be hit by all current towers
  }

  function canProjectileHit(p, enemy) {
    return canTowerHit(p.type, enemy);
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.vy += p.gravity * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const alpha = p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + alpha * 0.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // UI Elements
  const livesEl = document.getElementById('lives');
  const goldEl = document.getElementById('gold');
  const waveEl = document.getElementById('wave');
  const startWaveBtn = document.getElementById('startWaveBtn');
  const msgEl = document.getElementById('message');
  const towerBtns = [...document.querySelectorAll('.tower-btn')];

  // World config
  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const TILE = 30; // grid size
  // Path half-width in tiles (0 = 1-tile wide center line, 1 = 3 tiles wide, etc.)
  const PATH_HALF_WIDTH_TILES = 1;
  
  // Starfield for background
  const stars = [];
  function initStars() {
    stars.length = 0;
    const count = 120; // number of stars
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * WIDTH,
        y: Math.random() * HEIGHT,
        r: Math.random() * 1.6 + 0.4,
        speed: 8 + Math.random() * 28, // parallax drift
        phase: Math.random() * Math.PI * 2,
        hue: 200 + Math.random() * 80
      });
    }
  }
  initStars();
  
  // Visual effects
  const effects = {
    shake: { intensity: 0, duration: 0 },
    flash: { alpha: 0, duration: 0 }
  };
  
  function triggerEffect(name, duration = 0.3, intensity = 1) {
    effects[name] = { intensity, duration, time: 0 };
  }
  
  function updateEffects(dt) {
    for (const [name, effect] of Object.entries(effects)) {
      if (effect.time < effect.duration) {
        effect.time += dt;
        const t = effect.time / effect.duration;
        effect.alpha = 1 - t;
      } else {
        effect.alpha = 0;
      }
    }
  }

  // Path: series of waypoints (grid-aligned) enemies follow
  const PATH_POINTS = [
    { x: 0, y: 10 },
    { x: 10, y: 10 },
    { x: 10, y: 4 },
    { x: 20, y: 4 },
    { x: 20, y: 15 },
    { x: 28, y: 15 },
  ];

  // Game state
  const state = {
    time: 0,
    dt: 0,
    last: performance.now(),
    lives: 20,
    gold: 150,
    wave: 0,
    placing: null, // {type: 'basic' | 'sniper' | 'splash'}
    enemies: [],
    towers: [],
    projectiles: [],
    waveSpawning: false,
    upcoming: [], // queued enemies in current wave
  };

  // Tower types with enhanced visual properties
  const TowerTypes = {
    basic: {
      cost: 50,
      range: 110,
      rof: 0.8,
      dmg: 12,
      bulletSpeed: 360,
      color: '#63d3ff',
      bulletColor: '#63d3ff',
      auraColor: 'rgba(99, 211, 255, 0.1)',
      shootEffect: 'beam',
      size: 14
    },
    sniper: {
      cost: 70,
      range: 220,
      rof: 1.5,
      dmg: 25,
      bulletSpeed: 520,
      color: '#ffd36e',
      bulletColor: '#ffd36e',
      auraColor: 'rgba(255, 211, 110, 0.1)',
      shootEffect: 'snipe',
      size: 12
    },
    splash: {
      cost: 90,
      range: 120,
      rof: 1.2,
      dmg: 14,
      splash: 80,
      bulletSpeed: 320,
      color: '#b084ff',
      bulletColor: '#d4b8ff',
      auraColor: 'rgba(176, 132, 255, 0.1)',
      shootEffect: 'orb',
      size: 16
    },
    machinegun: {
      cost: 80,
      range: 100,
      rof: 0.15, // fires very fast
      dmg: 3,
      bulletSpeed: 560,
      color: '#7cffb2',
      bulletColor: '#7cffb2',
      auraColor: 'rgba(124, 255, 178, 0.08)',
      shootEffect: 'tracer',
      size: 12
    },
    missile: {
      cost: 120,
      range: 180,
      rof: 1.8,
      dmg: 30,
      splash: 70,
      bulletSpeed: 220,
      color: '#ff9f43',
      bulletColor: '#ffd18a',
      auraColor: 'rgba(255, 159, 67, 0.10)',
      shootEffect: 'missile',
      size: 14
    },
    wizard: {
      cost: 110,
      range: 160,
      rof: 1.0,
      dmg: 16,               // base damage on first target
      bulletSpeed: 0,
      color: '#9b84ff',
      bulletColor: '#9be7ff',
      auraColor: 'rgba(155, 132, 255, 0.12)',
      shootEffect: 'chain',
      size: 14,
      chain: { bounces: 3, bounceRange: 160, falloff: 0.7 }
    },
  };

  // Enemy presets per wave escalation
  function makeEnemy(hpMul = 1, spdMul = 1) {
    return {
      x: PATH_POINTS[0].x * TILE + TILE * 0.5,
      y: PATH_POINTS[0].y * TILE + TILE * 0.5,
      r: 10,
      speed: 60 * spdMul,
      hp: Math.floor(40 * hpMul),
      maxHp: Math.floor(40 * hpMul),
      pathIndex: 1,
      reachedEnd: false,
      reward: 8,
    };
  }
  // Faster, lighter runner enemy
  function makeFastEnemy(hpMul = 1, spdMul = 1) {
    return {
      x: PATH_POINTS[0].x * TILE + TILE * 0.5,
      y: PATH_POINTS[0].y * TILE + TILE * 0.5,
      r: 8,
      speed: 120 * spdMul,
      hp: Math.floor(25 * hpMul),
      maxHp: Math.floor(25 * hpMul),
      pathIndex: 1,
      reachedEnd: false,
      reward: 6,
      type: 'fast',
    };
  }

  // Air unit: fighter jet (used by startWave)
  function makeJetEnemy(hpMul = 1, spdMul = 1) {
    return {
      x: PATH_POINTS[0].x * TILE + TILE * 0.5,
      y: PATH_POINTS[0].y * TILE + TILE * 0.5,
      r: 9,
      speed: 150 * spdMul,
      hp: Math.floor(35 * hpMul),
      maxHp: Math.floor(35 * hpMul),
      pathIndex: 1,
      reachedEnd: false,
      reward: 10,
      type: 'jet',
    };
  }

  // Special tank enemy (for wave 5)
  function makeTankEnemy() {
    const startX = PATH_POINTS[0].x * TILE + TILE * 0.5;
    const startY = PATH_POINTS[0].y * TILE + TILE * 0.5;
    const hp = 600; // very high HP for a mini-boss feel
    return {
      x: startX,
      y: startY,
      r: 16,                 // bigger body
      speed: 36,             // slower
      hp,
      maxHp: hp,
      pathIndex: 1,
      reachedEnd: false,
      reward: 50,
      type: 'tank',          // mark type for future visuals if desired
    };
  }

  // Utility
  function dist(a, b) {
    const dx = a.x - b.x; const dy = a.y - b.y; return Math.hypot(dx, dy);
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function worldToGrid(x, y) { return { gx: Math.floor(x / TILE), gy: Math.floor(y / TILE) }; }
  function gridToWorld(gx, gy) { return { x: gx * TILE + TILE * 0.5, y: gy * TILE + TILE * 0.5 }; }

  // Build a set of path-occupied grid cells to prevent placement
  const pathCells = new Set();
  function rasterizePath() {
    function key(gx, gy) { return gx + ',' + gy; }
    for (let i = 0; i < PATH_POINTS.length - 1; i++) {
      const a = PATH_POINTS[i];
      const b = PATH_POINTS[i + 1];
      if (a.x === b.x) {
        const x = a.x;
        const y0 = Math.min(a.y, b.y);
        const y1 = Math.max(a.y, b.y);
        for (let y = y0; y <= y1; y++) {
          for (let dx = -PATH_HALF_WIDTH_TILES; dx <= PATH_HALF_WIDTH_TILES; dx++) {
            pathCells.add(key(x + dx, y));
          }
        }
      } else if (a.y === b.y) {
        const y = a.y;
        const x0 = Math.min(a.x, b.x);
        const x1 = Math.max(a.x, b.x);
        for (let x = x0; x <= x1; x++) {
          for (let dy = -PATH_HALF_WIDTH_TILES; dy <= PATH_HALF_WIDTH_TILES; dy++) {
            pathCells.add(key(x, y + dy));
          }
        }
      }
    }
  }
  rasterizePath();

  function isCellBlocked(gx, gy) {
    const k = gx + ',' + gy;
    if (pathCells.has(k)) return true;
    for (const t of state.towers) {
      if (t.gx === gx && t.gy === gy) return true;
    }
    return false;
  }

  // Input handling for placement
  let mouse = { x: 0, y: 0, inside: false };
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
  });
  canvas.addEventListener('mouseenter', () => mouse.inside = true);
  canvas.addEventListener('mouseleave', () => mouse.inside = false);
  canvas.addEventListener('click', () => {
    if (!state.placing) return;
    const { gx, gy } = worldToGrid(mouse.x, mouse.y);
    if (gx < 0 || gy < 0 || gx >= Math.floor(WIDTH / TILE) || gy >= Math.floor(HEIGHT / TILE)) return;
    if (isCellBlocked(gx, gy)) {
      flashMsg('Cannot place on path or occupied cell.');
      return;
    }
    const def = TowerTypes[state.placing];
    if (!def) return;
    if (state.gold < def.cost) { flashMsg('Not enough gold'); return; }

    state.gold -= def.cost;
    const pos = gridToWorld(gx, gy);
    state.towers.push({
      x: pos.x, y: pos.y, gx, gy,
      type: state.placing,
      cooldown: 0,
      color: def.color,
    });
    updateHUD();
  });

  towerBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      state.placing = type;
      flashMsg('Placing: ' + type + ' — click on map to place.');
    });
  });

  startWaveBtn.addEventListener('click', () => startWave());

  function flashMsg(text, type = 'info') {
    msgEl.textContent = text;
    msgEl.className = type; // 'info', 'warning', or 'error'
    msgEl.style.opacity = '1';
    msgEl.style.transform = 'translateY(0)';
    
    clearTimeout(msgEl.timeout);
    msgEl.timeout = setTimeout(() => {
      if (msgEl.textContent === text) {
        msgEl.style.opacity = '0';
        msgEl.style.transform = 'translateY(-10px)';
        setTimeout(() => {
          if (msgEl.textContent === text) {
            msgEl.textContent = '';
            msgEl.className = '';
          }
        }, 300);
      }
    }, 2000);
  }

  function updateHUD() {
    livesEl.textContent = state.lives;
    goldEl.textContent = state.gold;
    waveEl.textContent = state.wave;
  }

  // Wave logic
  function startWave() {
    if (state.waveSpawning) return;
    state.wave += 1;
    const hpMul = 1 + state.wave * 0.25;
    const spdMul = 1 + state.wave * 0.05;

    // Linear progression: +1 enemy per wave (Wave 1 = 8, Wave 2 = 9, ...)
    const count = 8 + (state.wave - 1);
    state.upcoming = Array.from({ length: count }, () => makeEnemy(hpMul, spdMul));
    // Add fast runners starting from wave 3
    if (state.wave >= 3) {
      const fastCount = Math.max(1, Math.floor(count * 0.2));
      for (let i = 0; i < fastCount; i++) {
        const idx = Math.floor(((i + 1) / (fastCount + 1)) * state.upcoming.length);
        state.upcoming.splice(idx, 0, makeFastEnemy(hpMul, spdMul * 1.05));
      }
    }

    // Add fighter jets starting from wave 10
    if (state.wave >= 10) {
      const jetCount = Math.max(1, Math.floor(count * 0.15));
      for (let j = 0; j < jetCount; j++) {
        const idx = Math.floor(((j + 1) / (jetCount + 1)) * state.upcoming.length);
        state.upcoming.splice(idx, 0, makeJetEnemy(hpMul, spdMul * 1.1));
      }
    }

    // Tanks: start at wave 5, then +1 tank every 5 waves (5,10,15,...)
    if (state.wave >= 5) {
      const tankCount = 1 + Math.floor((state.wave - 5) / 5);
      for (let tnk = 0; tnk < tankCount; tnk++) {
        const idx = Math.floor(((tnk + 1) / (tankCount + 1)) * state.upcoming.length);
        state.upcoming.splice(idx, 0, makeTankEnemy());
      }
    }

    state.waveSpawning = true;
    state.spawnTimer = 0;
    updateHUD();
}

  function spawnEnemyTick(dt) {
    if (!state.waveSpawning) return;
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0 && state.upcoming.length > 0) {
      state.enemies.push(state.upcoming.shift());
      state.spawnTimer = 0.8; // spawn rate
    }
    if (state.upcoming.length === 0 && state.enemies.length === 0) {
      state.waveSpawning = false;
      state.gold += 25 + state.wave * 5;
      updateHUD();
      flashMsg('Wave cleared! +Gold');
    }
  }

  // Game loop
  function loop(now) {
    state.dt = Math.min(0.033, (now - state.last) / 1000);
    state.last = now;
    state.time += state.dt;

    update(state.dt);
    draw();

    if (state.lives > 0) requestAnimationFrame(loop);
  }

  // Helper functions for colors
  function lightenColor(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return '#' + (
      0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
      (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
      (B < 255 ? B < 1 ? 0 : B : 255)
    ).toString(16).slice(1);
  }

  function darkenColor(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) - amt;
    const G = (num >> 8 & 0x00FF) - amt;
    const B = (num & 0x0000FF) - amt;
    return '#' + (
      0x1000000 + (R > 0 ? R : 0) * 0x10000 +
      (G > 0 ? G : 0) * 0x100 +
      (B > 0 ? B : 0)
    ).toString(16).slice(1);
  }
  
  function hexToRgba(hex, alpha = 1) {
    const h = hex.replace('#', '');
    const bigint = parseInt(h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }
  
  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    return ctx;
  }

  function update(dt) {
    updateEffects(dt);
    updateParticles(dt);
    spawnEnemyTick(dt);

    // Enemies
    for (const e of state.enemies) {
      const target = PATH_POINTS[e.pathIndex];
      if (!target) {
        // reached end
        e.reachedEnd = true;
        continue;
      }
      
      // Smooth movement with easing
      const tx = target.x * TILE + TILE * 0.5;
      const ty = target.y * TILE + TILE * 0.5;
      const dx = tx - e.x;
      const dy = ty - e.y;
      const d = Math.hypot(dx, dy);
      
      if (d < 1) {
        e.pathIndex++;
      } else {
        // Smooth acceleration/deceleration
        const targetSpeed = e.speed * (e.slowed ? 0.5 : 1);
        const currentSpeed = Math.hypot(e.vx || 0, e.vy || 0);
        const accel = 5.0; // Acceleration factor
        
        // Ease towards target speed
        const newSpeed = currentSpeed + (targetSpeed - currentSpeed) * (1 - Math.exp(-accel * dt));
        
        // Update velocity
        e.vx = (dx / (d || 1)) * newSpeed;
        e.vy = (dy / (d || 1)) * newSpeed;
        
        // Apply movement
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        
        // Update rotation for facing direction if needed
        if (Math.abs(e.vx) > 0.1 || Math.abs(e.vy) > 0.1) {
          e.rotation = Math.atan2(e.vy, e.vx);
        }
      }
      
      // Update trail for effects
      if (!e.trail) e.trail = [];
      e.trail.unshift({x: e.x, y: e.y});
      if (e.trail.length > 5) e.trail.pop();
    }

    // End reached processing
    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const e = state.enemies[i];
      if (e.reachedEnd || e.pathIndex >= PATH_POINTS.length) {
        state.enemies.splice(i, 1);
        state.lives -= 1;
        updateHUD();
        if (state.lives <= 0) {
          flashMsg('Game Over');
        }
      }
    }

    // Towers firing
    for (const t of state.towers) {
      const def = TowerTypes[t.type];
      t.cooldown -= dt;
      if (t.cooldown <= 0) {
        // pick nearest enemy in range
        let target = null; let best = Infinity;
        for (const e of state.enemies) {
          const d = dist(t, e);
          if (d <= def.range && d < best) { best = d; target = e; }
        }
        if (target) {
          t.cooldown = def.rof;
          const angle = Math.atan2(target.y - t.y, target.x - t.x);
          // Record last aim and muzzle time for visuals (spin + flash)
          t.lastAngle = angle;
          t.muzzleTime = state.time;
          
          // Eject a shell casing particle for machinegun
          if (t.type === 'machinegun') {
            const shellAngle = angle + Math.PI + (Math.random() * 0.6 - 0.3);
            const speed = 120 + Math.random() * 80;
            createParticle(
              t.x + Math.cos(angle) * 12,
              t.y + Math.sin(angle) * 12,
              '#d6c271',
              2,
              speed,
              0.5,
              600 // gravity to drop down quickly
            );
          }
          // Wizard chain lightning: instant chain damage + visual
          if (t.type === 'wizard') {
            const chainCfg = TowerTypes.wizard.chain;
            const points = [{ x: t.x, y: t.y }];
            const hitSet = new Set();
            let current = target;
            let bounces = chainCfg.bounces;
            let mult = 1.0;
            while (current && bounces >= 0) {
              points.push({ x: current.x, y: current.y });
              const key = current.x + ':' + current.y;
              hitSet.add(key);
              const dmg = def.dmg * mult;
              current.hp -= dmg;
              current.damageTime = state.time;
              // find next nearest within bounce range
              let next = null; let bestD = Infinity;
              for (const e2 of state.enemies) {
                if (e2 === current) continue;
                const k2 = e2.x + ':' + e2.y;
                const d2 = dist(current, e2);
                if (d2 <= chainCfg.bounceRange && d2 < bestD && !hitSet.has(k2)) {
                  bestD = d2; next = e2;
                }
              }
              current = next; bounces--; mult *= chainCfg.falloff;
            }
            // store effect projectile to render the chain briefly
            state.projectiles.push({
              x: t.x, y: t.y,
              vx: 0, vy: 0,
              dmg: 0,
              color: def.bulletColor,
              splash: 0,
              life: 0.12,
              maxLife: 0.12,
              type: t.type,
              effect: 'chain',
              path: points
            });
            // skip normal projectile creation
            continue;
          }

          // If this is a beam-style tower, apply damage instantly (visual stays briefly)
          if (def.shootEffect === 'beam') {
            target.hp -= def.dmg;
            target.damageTime = state.time;
          }
          // Missile launcher visuals: recoil + smoke burst
          if (t.type === 'missile') {
            t.recoil = 1.0; // trigger recoil animation
            for (let s = 0; s < 6; s++) {
              createParticle(
                t.x + Math.cos(angle) * (TowerTypes.missile.size * 1.2),
                t.y + Math.sin(angle) * (TowerTypes.missile.size * 1.2),
                'rgba(200,200,200,0.6)',
                2 + Math.random() * 2,
                40 + Math.random() * 40,
                0.4 + Math.random() * 0.3,
                0
              );
            }
          }
          
          state.projectiles.push({
            x: t.x, y: t.y,
            vx: Math.cos(angle) * def.bulletSpeed,
            vy: Math.sin(angle) * def.bulletSpeed,
            dmg: def.dmg,
            color: def.bulletColor || def.color,
            splash: def.splash || 0,
            life: def.shootEffect === 'beam' ? 0.12 : (def.shootEffect === 'missile' ? 3.0 : 1.2),
            maxLife: def.shootEffect === 'beam' ? 0.12 : (def.shootEffect === 'missile' ? 3.0 : 1.2),
            type: t.type,
            effect: def.shootEffect,
            // Beam/projectile endpoint snapshot for beam rendering
            tx: target.x,
            ty: target.y,
            turnRate: def.shootEffect === 'missile' ? 4.0 : 0, // rad/sec
          });
        }
      }
    }

    // Decay tower recoil
    for (const t of state.towers) {
      if (t.recoil && t.recoil > 0) t.recoil = Math.max(0, t.recoil - dt * 3);
    }

    // Projectiles
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      const p = state.projectiles[i];
      
      // Homing behavior for missiles
      if (p.effect === 'missile') {
        // Acquire nearest target
        let target = null; let best = Infinity;
        for (const e of state.enemies) {
          const d = dist(p, e);
          if (d < best) { best = d; target = e; }
        }
        // Steer towards target
        if (target) {
          const desired = Math.atan2(target.y - p.y, target.x - p.x);
          const current = Math.atan2(p.vy, p.vx);
          let delta = desired - current;
          while (delta > Math.PI) delta -= Math.PI * 2;
          while (delta < -Math.PI) delta += Math.PI * 2;
          const maxTurn = (p.turnRate || 4.0) * dt;
          const turn = Math.max(-maxTurn, Math.min(maxTurn, delta));
          const newAngle = current + turn;
          const speed = Math.hypot(p.vx, p.vy) || 1;
          const targetSpeed = Math.max(speed, 180); // don't slow down too much
          const accel = 80; // gently accelerate
          const newSpeed = Math.min(targetSpeed + accel * dt, 320);
          p.vx = Math.cos(newAngle) * newSpeed;
          p.vy = Math.sin(newAngle) * newSpeed;

          // Smoke trail
          if (Math.random() < 0.6) {
            createParticle(p.x, p.y, 'rgba(255,255,255,0.4)', 2.2, 20, 0.35, 0);
          }
        }
      }

      // Update position
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      
      // Update trail for certain projectiles
      if (p.effect === 'orb' || p.effect === 'snipe') {
        if (!p.trail) p.trail = [];
        p.trail.unshift({x: p.x, y: p.y});
        if (p.trail.length > 10) p.trail.pop();
      }

      // Check collision with enemies
      let hit = null;
      for (const e of state.enemies) {
        if (dist(p, e) <= e.r) { 
          hit = e; 
          break; 
        }
      }
      
      if (hit) {
        // Visual feedback for hit
        hit.damageTime = state.time;
        triggerEffect('shake', 0.1, 0.5);
        
        // Damage application
        if (p.splash > 0) {
          // Splash damage
          for (const e of state.enemies) {
            const d = dist(p, e);
            if (d <= p.splash) {
              const splashDmg = p.dmg * (1 - (d / p.splash) * 0.8); // Reduce damage with distance
              e.hp -= splashDmg;
              e.damageTime = state.time;
              
              // Splash effect
              if (d > 0) {
                createParticle(
                  e.x, e.y,
                  p.color,
                  3 + Math.random() * 4,
                  50,
                  0.5 + Math.random() * 0.5,
                  100
                );
              }
            }
          }
          
          // Splash visual effect
          ctx.save();
          ctx.fillStyle = p.color + '40';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.splash, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          
        } else {
          // Direct hit
          hit.hp -= p.dmg;
          
          // Hit effect
          for (let i = 0; i < 5; i++) {
            createParticle(
              hit.x, hit.y,
              p.color,
              2 + Math.random() * 3,
              100 + Math.random() * 100,
              0.5 + Math.random() * 0.5,
              200
            );
          }
        }
        
        // Mark projectile for removal
        p.life = -1;
        
        // Create impact effect
        if (p.effect === 'beam') {
          p.impact = true;
          p.life = 0.1; // Keep beam visible for a short time
        }
      }

      if (p.life <= 0 || p.x < -10 || p.y < -10 || p.x > WIDTH + 10 || p.y > HEIGHT + 10) {
        state.projectiles.splice(i, 1);
      }
    }

    // Enemy deaths
    for (let i = state.enemies.length - 1; i >= 0; i--) {
      if (state.enemies[i].hp <= 0) {
        state.gold += state.enemies[i].reward;
        state.enemies.splice(i, 1);
        updateHUD();
      }
    }
  }

  function drawGrid() {
    ctx.save();
    
    // Major grid lines (every 4 tiles)
    ctx.strokeStyle = 'rgba(108, 122, 255, 0.1)';
    ctx.lineWidth = 1;
    
    for (let x = 0; x <= WIDTH; x += TILE * 4) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, HEIGHT);
      ctx.stroke();
    }
    
    for (let y = 0; y <= HEIGHT; y += TILE * 4) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(WIDTH, y + 0.5);
      ctx.stroke();
    }
    
    // Minor grid lines
    ctx.strokeStyle = 'rgba(108, 122, 255, 0.05)';
    
    for (let x = 0; x <= WIDTH; x += TILE) {
      if (x % (TILE * 4) === 0) continue; // Skip major lines
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, HEIGHT);
      ctx.stroke();
    }
    
    for (let y = 0; y <= HEIGHT; y += TILE) {
      if (y % (TILE * 4) === 0) continue; // Skip major lines
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(WIDTH, y + 0.5);
      ctx.stroke();
    }
    
    // Grid highlight at mouse position
    if (mouse.inside) {
      const { gx, gy } = worldToGrid(mouse.x, mouse.y);
      const wx = gx * TILE;
      const wy = gy * TILE;
      
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 2;
      ctx.strokeRect(wx + 1, wy + 1, TILE - 2, TILE - 2);
      
      // Highlight row and column
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.beginPath();
      ctx.moveTo(wx + TILE/2, 0);
      ctx.lineTo(wx + TILE/2, HEIGHT);
      ctx.moveTo(0, wy + TILE/2);
      ctx.lineTo(WIDTH, wy + TILE/2);
      ctx.stroke();
    }
    
    ctx.restore();
  }

  function drawPath() {
    ctx.save();
    const baseWidth = TILE * (1 + PATH_HALF_WIDTH_TILES * 2);
    
    // Draw path shadow
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = baseWidth + 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.beginPath();
    for (let i = 0; i < PATH_POINTS.length; i++) {
      const p = PATH_POINTS[i];
      const x = p.x * TILE + TILE * 0.5;
      const y = p.y * TILE + TILE * 0.5 + 2; // Slight vertical offset for shadow
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    
    // Draw path base
    const pathGradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    pathGradient.addColorStop(0, '#334e9b');
    pathGradient.addColorStop(1, '#3f61c9');
    
    ctx.strokeStyle = pathGradient;
    ctx.lineWidth = baseWidth;
    
    ctx.beginPath();
    for (let i = 0; i < PATH_POINTS.length; i++) {
      const p = PATH_POINTS[i];
      const x = p.x * TILE + TILE * 0.5;
      const y = p.y * TILE + TILE * 0.5;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    
    // Inner highlight
    const highlightGradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    highlightGradient.addColorStop(0, '#4a6be8');
    highlightGradient.addColorStop(1, '#5a8bff');
    
    ctx.strokeStyle = highlightGradient;
    ctx.lineWidth = Math.max(4, baseWidth - 8);
    ctx.stroke();
    
    // Add subtle noise/texture to path
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.1;
    
    const patternCanvas = document.createElement('canvas');
    const patternCtx = patternCanvas.getContext('2d');
    patternCanvas.width = patternCanvas.height = 32;
    
    // Create a subtle noise pattern
    const imageData = patternCtx.createImageData(32, 32);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      const v = Math.random() * 55 + 200; // Light gray noise
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
    
    patternCtx.putImageData(imageData, 0, 0);
    const pattern = ctx.createPattern(patternCanvas, 'repeat');
    
    // Apply the pattern to the path
    ctx.strokeStyle = pattern;
    ctx.lineWidth = Math.max(2, baseWidth - 12);
    ctx.stroke();
    
    // Draw path border
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Add some subtle glow
    ctx.shadowColor = 'rgba(90, 139, 255, 0.3)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = 'transparent';
    ctx.lineWidth = Math.max(2, baseWidth - 4);
    ctx.stroke();
    
    ctx.restore();
    
    // Draw start/end markers
    if (PATH_POINTS.length > 0) {
      // Start marker
      const start = PATH_POINTS[0];
      const startX = start.x * TILE + TILE * 0.5;
      const startY = start.y * TILE + TILE * 0.5;
      
      // End marker
      const end = PATH_POINTS[PATH_POINTS.length - 1];
      const endX = end.x * TILE + TILE * 0.5;
      const endY = end.y * TILE + TILE * 0.5;
      
      // Draw start/end circles
      ctx.fillStyle = 'rgba(76, 201, 240, 0.2)';
      ctx.beginPath();
      ctx.arc(startX, startY, TILE * 0.8, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = 'rgba(240, 76, 76, 0.2)';
      ctx.beginPath();
      ctx.arc(endX, endY, TILE * 0.8, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw direction indicators
      if (PATH_POINTS.length > 1) {
        for (let i = 0; i < PATH_POINTS.length - 1; i++) {
          const p1 = PATH_POINTS[i];
          const p2 = PATH_POINTS[i + 1];
          const x1 = p1.x * TILE + TILE * 0.5;
          const y1 = p1.y * TILE + TILE * 0.5;
          const x2 = p2.x * TILE + TILE * 0.5;
          const y2 = p2.y * TILE + TILE * 0.5;
          
          // Only draw arrows every few segments
          if (i % 2 === 0) {
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.sqrt(dx * dx + dy * dy);
            const unitX = dx / len;
            const unitY = dy / len;
            
            // Position the arrow in the middle of the segment
            const arrowX = x1 + dx * 0.5;
            const arrowY = y1 + dy * 0.5;
            
            // Draw arrow
            ctx.save();
            ctx.translate(arrowX, arrowY);
            ctx.rotate(Math.atan2(dy, dx));
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.beginPath();
            ctx.moveTo(TILE * 0.3, 0);
            ctx.lineTo(-TILE * 0.2, -TILE * 0.2);
            ctx.lineTo(-TILE * 0.2, TILE * 0.2);
            ctx.closePath();
            ctx.fill();
            
            ctx.restore();
          }
        }
      }
    }
    
    ctx.restore();
  }

  function drawBackground() {
    // Deep space gradient
    const bgGradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    bgGradient.addColorStop(0, '#060914');
    bgGradient.addColorStop(1, '#101634');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Layered nebulas
    const nebula = (cx, cy, inner, outer, colorA, colorB, alpha=0.35) => {
      const g = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
      g.addColorStop(0, colorA);
      g.addColorStop(1, colorB);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, outer, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    nebula(WIDTH*0.25, HEIGHT*0.3, 10, 220, 'rgba(88,126,255,0.9)', 'rgba(88,126,255,0)');
    nebula(WIDTH*0.75, HEIGHT*0.7, 10, 260, 'rgba(255,120,190,0.9)', 'rgba(255,120,190,0)');

    // Twinkling parallax starfield
    ctx.save();
    for (const s of stars) {
      const drift = (state.time * s.speed) % WIDTH;
      let x = s.x - drift; if (x < 0) x += WIDTH;
      const twinkle = 0.6 + 0.4 * Math.sin(state.time * 2.2 + s.phase);
      ctx.fillStyle = `hsla(${s.hue}, 80%, 75%, ${0.35 + twinkle * 0.65})`;
      ctx.beginPath();
      ctx.arc(x, s.y, s.r * (0.7 + twinkle*0.3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Subtle blueprint grid
    ctx.save();
    ctx.strokeStyle = 'rgba(108, 122, 255, 0.06)';
    ctx.lineWidth = 1;
    const gridSize = 60;
    for (let x = 0; x < WIDTH; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y < HEIGHT; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(WIDTH, y + 0.5);
      ctx.stroke();
    }
    ctx.restore();

    // Vignette
    const vignette = ctx.createRadialGradient(
      WIDTH/2, HEIGHT/2, 0,
      WIDTH/2, HEIGHT/2, Math.max(WIDTH, HEIGHT)/1.2
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  function draw() {
    // Apply screen shake
    const shakeX = effects.shake.alpha > 0 ? 
      (Math.random() - 0.5) * 10 * effects.shake.intensity * effects.shake.alpha : 0;
    const shakeY = effects.shake.alpha > 0 ? 
      (Math.random() - 0.5) * 10 * effects.shake.intensity * effects.shake.alpha : 0;
    
    ctx.save();
    ctx.translate(shakeX, shakeY);
    
    drawBackground();
    drawPath();
    drawGrid();
    
    // Draw range indicators under towers
    for (const t of state.towers) {
      const def = TowerTypes[t.type];
      ctx.save();
      ctx.fillStyle = def.auraColor;
      ctx.beginPath();
      ctx.arc(t.x, t.y, def.range, 0, Math.PI * 2);
      ctx.fill();
      
      // Pulsing glow effect
      const pulse = 1 + Math.sin(state.time * 3) * 0.05;
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 2 * pulse;
      ctx.globalAlpha = 0.2 + Math.sin(state.time * 2) * 0.1;
      ctx.beginPath();
      ctx.arc(t.x, t.y, def.range * 0.9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Towers
    for (const t of state.towers) {
      const def = TowerTypes[t.type];
      const pulse = 1 + Math.sin(state.time * 4) * 0.1;
      
      // Tower base
      ctx.save();
      ctx.translate(t.x, t.y);
      
      // Shadow
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(0, 8, def.size * 0.8, def.size * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      
      // Tower body
      const gradient = ctx.createRadialGradient(0, -def.size/4, 0, 0, 0, def.size);
      gradient.addColorStop(0, lightenColor(def.color, 40));
      gradient.addColorStop(1, def.color);
      
      ctx.fillStyle = gradient;
      ctx.strokeStyle = lightenColor(def.color, 20);
      ctx.lineWidth = 2;
      
      // Draw tower shape based on type
      if (t.type === 'basic') {
        // Cannon tower
        ctx.beginPath();
        ctx.arc(0, 0, def.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Cannon barrel
        ctx.save();
        ctx.rotate(Math.sin(state.time * 2) * 0.2);
        ctx.fillStyle = '#4a5a8c';
        ctx.fillRect(def.size * 0.6, -3, def.size * 0.8, 6);
        ctx.restore();
        
      } else if (t.type === 'sniper') {
        // Sniper tower
        ctx.beginPath();
        ctx.arc(0, 0, def.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Scope
        ctx.save();
        ctx.rotate(Math.sin(state.time) * 0.1);
        ctx.fillStyle = '#2a2a4a';
        ctx.beginPath();
        ctx.arc(0, 0, def.size * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Crosshair
        ctx.strokeStyle = '#ffd36e';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-def.size * 0.3, 0);
        ctx.lineTo(def.size * 0.3, 0);
        ctx.moveTo(0, -def.size * 0.3);
        ctx.lineTo(0, def.size * 0.3);
        ctx.stroke();
        ctx.restore();
        
      } else if (t.type === 'splash') {
        // Splash tower
        ctx.beginPath();
        ctx.arc(0, 0, def.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Swirling energy
        ctx.save();
        ctx.rotate(state.time * 2);
        for (let i = 0; i < 3; i++) {
          const angle = (i / 3) * Math.PI * 2;
          const x = Math.cos(angle) * (def.size * 0.7);
          const y = Math.sin(angle) * (def.size * 0.7);
          
          const gradient = ctx.createRadialGradient(x, y, 0, x, y, def.size * 0.5);
          gradient.addColorStop(0, 'rgba(255,255,255,0.8)');
          gradient.addColorStop(1, 'rgba(176, 132, 255, 0)');
          
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(x, y, def.size * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      } else if (t.type === 'machinegun') {
        // Machine gun tower base
        ctx.beginPath();
        ctx.arc(0, 0, def.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Spinning barrel assembly
        const aim = (t.lastAngle ?? 0);
        const spinSpeed = 18; // rad/s
        const firingBoost = (state.time - (t.muzzleTime || 0) < def.rof + 0.05) ? 1.5 : 1.0;
        const spin = state.time * spinSpeed * firingBoost;
        ctx.save();
        ctx.rotate(aim + spin * 0.1);
        ctx.fillStyle = '#2c354f';
        ctx.strokeStyle = lightenColor(def.color, 30);
        ctx.lineWidth = 1.5;
        // Draw 4 barrels
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          ctx.save();
          ctx.rotate(a);
          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(def.size * 0.2, -2, def.size * 1.0, 4, 2)
                        : (ctx.rect(def.size * 0.2, -2, def.size * 1.0, 4));
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
        // Central hub
        ctx.fillStyle = lightenColor(def.color, 20);
        ctx.beginPath();
        ctx.arc(0, 0, def.size * 0.4, 0, Math.PI * 2);
        ctx.fill();
        
        // Muzzle flash when just fired
        const flashAge = state.time - (t.muzzleTime || -999);
        if (flashAge >= 0 && flashAge < 0.08) {
          const flashAlpha = 1 - (flashAge / 0.08);
          ctx.save();
          ctx.rotate(aim);
          const grad = ctx.createRadialGradient(def.size * 1.6, 0, 0, def.size * 1.6, 0, def.size * 0.9);
          grad.addColorStop(0, 'rgba(255,255,200,' + (0.8 * flashAlpha) + ')');
          grad.addColorStop(1, 'rgba(255,255,200,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(def.size * 1.6, 0, def.size * 0.9, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
      } else if (t.type === 'missile') {
        // Missile launcher tower: chassis + dual tubes + radar dish + recoil
        const aim = (t.lastAngle ?? 0);
        const recoil = (t.recoil || 0);

        // Shadow
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(0, 8, def.size * 0.9, def.size * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Chassis body
        const bodyGrad = ctx.createLinearGradient(-def.size, -def.size, def.size, def.size);
        bodyGrad.addColorStop(0, lightenColor(def.color, 25));
        bodyGrad.addColorStop(1, def.color);
        ctx.fillStyle = bodyGrad;
        ctx.strokeStyle = lightenColor(def.color, 15);
        ctx.lineWidth = 2;
        roundRect(ctx, -def.size*0.9, -def.size*0.6, def.size*1.8, def.size*1.2, 6);
        ctx.fill();
        ctx.stroke();

        // Radar dish on top (rotating)
        ctx.save();
        ctx.translate(-def.size*0.6, -def.size*0.7);
        ctx.rotate(state.time * 2.2);
        ctx.fillStyle = '#c9d6ff';
        ctx.beginPath();
        ctx.arc(0, 0, def.size*0.35, 0, Math.PI*2);
        ctx.fill();
        ctx.strokeStyle = '#91a6ff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(def.size*0.45, 0);
        ctx.stroke();
        ctx.restore();

        // Launch tubes assembly with recoil offset in aim direction
        ctx.save();
        ctx.rotate(aim);
        const offset = recoil * 6; // pixels back on fire
        ctx.translate(-offset, 0);
        ctx.fillStyle = '#adb7c7';
        ctx.strokeStyle = '#6f7b8f';
        ctx.lineWidth = 1.5;
        // Left tube
        roundRect(ctx, -2, -def.size*0.45, def.size*1.6, def.size*0.28, 4); ctx.fill(); ctx.stroke();
        // Right tube
        roundRect(ctx, -2,  def.size*0.17, def.size*1.6, def.size*0.28, 4); ctx.fill(); ctx.stroke();
        // Tube rims
        ctx.fillStyle = '#dfe6f5';
        ctx.beginPath(); ctx.arc(def.size*1.6, -def.size*0.31, def.size*0.14, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(def.size*1.6,  def.size*0.31, def.size*0.14, 0, Math.PI*2); ctx.fill();
        ctx.restore();

        // Small status LED
        ctx.fillStyle = recoil > 0 ? '#ffb86b' : '#86ff86';
        ctx.beginPath();
        ctx.arc(def.size*0.6, -def.size*0.2, 2, 0, Math.PI*2);
        ctx.fill();
      }
      
      // Highlight when selected
      if (state.placing === t.type) {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(0, 0, def.size * 1.2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      
      ctx.restore();
    }

    // Enemies
    for (const e of state.enemies) {
      const hpPct = e.hp / e.maxHp;
      const isDamaged = e.hp < e.maxHp * 0.5;
      
      ctx.save();
      ctx.translate(e.x, e.y);
      const rot = e.rotation || 0;
      
      // Shadow
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      const shY = e.type === 'jet' ? e.r * 0.9 : e.r * 0.6;
      const shRX = e.type === 'jet' ? e.r * 1.2 : e.r * 0.9;
      const shRY = e.type === 'jet' ? e.r * 0.4 : e.r * 0.35;
      ctx.ellipse(0, shY, shRX, shRY, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Colors per type
      let baseColor = isDamaged ? '#ff4a4a' : '#ff6e6e';
      if (e.type === 'fast') baseColor = isDamaged ? '#5ad4ff' : '#6ee7ff';
      if (e.type === 'tank') baseColor = isDamaged ? '#ff9b4a' : '#ffb36e';

      if (e.type === 'tank') {
        // Tank: tracks + body + turret
        ctx.save();
        ctx.rotate(rot);
        // Tracks
        ctx.fillStyle = '#2a2a2a';
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1;
        roundRect(ctx, -e.r, -e.r*0.9, e.r*2, e.r*0.5, 3); ctx.fill(); ctx.stroke();
        roundRect(ctx, -e.r,  e.r*0.4,  e.r*2, e.r*0.5, 3); ctx.fill(); ctx.stroke();
        // Body
        const bodyGrad = ctx.createLinearGradient(-e.r, 0, e.r, 0);
        bodyGrad.addColorStop(0, lightenColor(baseColor, 25));
        bodyGrad.addColorStop(1, darkenColor(baseColor, 10));
        ctx.fillStyle = bodyGrad;
        ctx.strokeStyle = darkenColor(baseColor, 35);
        roundRect(ctx, -e.r*0.9, -e.r*0.7, e.r*1.8, e.r*1.4, 6);
        ctx.fill(); ctx.stroke();
        // Turret
        ctx.fillStyle = lightenColor(baseColor, 30);
        ctx.beginPath(); ctx.arc(0, 0, e.r*0.6, 0, Math.PI*2); ctx.fill();
        // Barrel
        ctx.fillStyle = '#444';
        roundRect(ctx, e.r*0.2, -e.r*0.15, e.r*1.2, e.r*0.3, 2); ctx.fill();
        ctx.restore();
      } else if (e.type === 'fast') {
        // Fast: sleek capsule with motion streaks
        ctx.save();
        ctx.rotate(rot);
        const g = ctx.createLinearGradient(-e.r*1.6, 0, e.r*1.6, 0);
        g.addColorStop(0, 'rgba(255,255,255,0.2)');
        g.addColorStop(1, baseColor);
        ctx.fillStyle = g;
        ctx.strokeStyle = darkenColor(baseColor, 40);
        ctx.lineWidth = 1.5;
        roundRect(ctx, -e.r*1.2, -e.r*0.6, e.r*2.4, e.r*1.2, e.r*0.6);
        ctx.fill(); ctx.stroke();
        // Streaks
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = baseColor;
        ctx.beginPath(); ctx.moveTo(-e.r*1.6, -1); ctx.lineTo(-e.r*0.2, -1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-e.r*1.6, 1);  ctx.lineTo(-e.r*0.2, 1);  ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.restore();
      } else if (e.type === 'jet') {
        // Fighter jet: delta wing + cockpit + contrail
        ctx.save();
        ctx.rotate(rot);
        // Body
        const bodyGrad = ctx.createLinearGradient(-e.r, 0, e.r, 0);
        bodyGrad.addColorStop(0, '#bcd1ff');
        bodyGrad.addColorStop(1, '#7fa6ff');
        ctx.fillStyle = bodyGrad;
        ctx.strokeStyle = '#4f69a6';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(e.r * 1.4, 0);
        ctx.lineTo(-e.r * 1.3, -e.r * 0.9);
        ctx.lineTo(-e.r * 0.7, 0);
        ctx.lineTo(-e.r * 1.3, e.r * 0.9);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // Cockpit
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath(); ctx.arc(e.r * 0.4, 0, e.r * 0.35, 0, Math.PI * 2); ctx.fill();
        // Tail fins
        ctx.fillStyle = '#9bb8ff';
        roundRect(ctx, -e.r * 1.2, -e.r * 0.15, e.r * 0.5, e.r * 0.3, 2); ctx.fill();
        ctx.restore();
        
        // Contrail particles
        if (Math.random() < 0.4) {
          createParticle(e.x - Math.cos(rot) * e.r * 1.4, e.y - Math.sin(rot) * e.r * 1.4, 'rgba(255,255,255,0.35)', 2, 18, 0.35, 0);
        }
      } else {
        // Default enemy: layered shell + pulsing core + specular + fins + halo
        ctx.save();
        ctx.rotate(rot * 0.1); // slight wobble
        const size = e.r * 1.6;
        const cornerRadius = e.r * 0.35;

        // Outer shell
        const shell = ctx.createLinearGradient(-size/2, -size/2, size/2, size/2);
        shell.addColorStop(0, lightenColor(baseColor, 18));
        shell.addColorStop(1, darkenColor(baseColor, 22));
        ctx.fillStyle = shell;
        ctx.strokeStyle = darkenColor(baseColor, 40);
        ctx.lineWidth = 2;
        roundRect(ctx, -size/2, -size/2, size, size, cornerRadius);
        ctx.fill(); ctx.stroke();

        // Specular highlight arc
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(-size*0.15, -size*0.15, size*0.55, -Math.PI*0.15, Math.PI*0.35);
        ctx.stroke();
        ctx.restore();

        // Side fins
        ctx.fillStyle = lightenColor(baseColor, 28);
        roundRect(ctx, -size*0.65, -e.r*0.35, e.r*0.45, e.r*0.7, 3); ctx.fill();
        roundRect(ctx,  size*0.20, -e.r*0.35, e.r*0.45, e.r*0.7, 3); ctx.fill();

        // Pulsing inner core
        const pulse = 0.85 + 0.15 * (1 + Math.sin(state.time * 3 + e.x * 0.01 + e.y * 0.01)) * 0.5;
        const coreR = e.r * 0.55 * pulse;
        const core = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
        core.addColorStop(0, 'rgba(255,255,255,0.85)');
        core.addColorStop(1, hexToRgba(lightenColor(baseColor, 10), 0));
        ctx.fillStyle = core;
        ctx.beginPath(); ctx.arc(0, 0, coreR, 0, Math.PI * 2); ctx.fill();

        // Rotating halo ring
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.strokeStyle = lightenColor(baseColor, 35);
        ctx.lineWidth = 2;
        ctx.rotate(state.time * 0.8);
        ctx.beginPath(); ctx.arc(0, 0, e.r * 0.95, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();

        ctx.restore();
      }

      // HP bar background
      const barWidth = e.r * 2.2;
      const barHeight = 4;
      const barY = -e.r - 12;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      roundRect(ctx, -barWidth/2, barY, barWidth, barHeight, 2);
      ctx.fill();
      // HP fill
      const hpWidth = Math.max(2, barWidth * hpPct);
      const hpColor = hpPct > 0.6 ? '#5bff88' : hpPct > 0.3 ? '#ffd700' : '#ff6e6e';
      ctx.fillStyle = hpColor;
      roundRect(ctx, -barWidth/2, barY, hpWidth, barHeight, 2);
      ctx.fill();
      // Border
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      roundRect(ctx, -barWidth/2, barY, barWidth, barHeight, 2);
      ctx.stroke();

      // Damage flash overlay
      if (e.damageTime && state.time - e.damageTime < 0.1) {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        const s = e.r * 1.6;
        roundRect(ctx, -s/2, -s/2, s, s, e.r * 0.35);
        ctx.fill();
      }
      
      ctx.restore();
    }

    // Projectiles
    for (const p of state.projectiles) {
      const def = TowerTypes[p.type] || {};
      const age = 1 - (p.life / p.maxLife);
      
      if (p.effect === 'beam') {
        // Laser beam effect
        const dx = (p.tx ?? p.x) - p.x;
        const dy = (p.ty ?? p.y) - p.y;
        const length = Math.hypot(dx, dy);
        if (!isFinite(length) || length <= 0) {
          continue; // skip invalid beam
        }
        const angle = Math.atan2(dy, dx);
        
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(angle);
        
        // Glow
        const gradient = ctx.createLinearGradient(0, 0, length, 0);
        gradient.addColorStop(0, p.color);
        gradient.addColorStop(1, 'rgba(255,255,255,0.8)');
        
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 3 + Math.sin(state.time * 20) * 1.5;
        ctx.globalAlpha = 0.7;
        
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(length, 0);
        ctx.stroke();
        
        // Core beam
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.9;
        
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(length, 0);
        ctx.stroke();
        
        // Impact effect
        if (p.impact) {
          const size = 10 + Math.sin(state.time * 30) * 2;
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath();
          ctx.arc(length, 0, size, 0, Math.PI * 2);
          ctx.fill();
        }
        
        ctx.restore();
        
      } else if (p.effect === 'missile') {
        // Missile body with flame
        const angle = Math.atan2(p.vy, p.vx);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(angle);
        // Glow
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 10);
        glow.addColorStop(0, p.color);
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        // Body
        ctx.fillStyle = '#cccccc';
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(-6, -3, 12, 6, 3) : ctx.rect(-6, -3, 12, 6);
        ctx.fill();
        ctx.stroke();
        // Nose tip
        ctx.fillStyle = '#ffd18a';
        ctx.beginPath();
        ctx.arc(6, 0, 2, 0, Math.PI * 2);
        ctx.fill();
        // Flame
        const f = 1 + Math.sin(state.time * 40) * 0.2;
        const grad = ctx.createLinearGradient(-12, 0, -2, 0);
        grad.addColorStop(0, 'rgba(255,180,80,0)');
        grad.addColorStop(1, 'rgba(255,140,50,0.9)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(-12 * f, 0);
        ctx.lineTo(-2, -2);
        ctx.lineTo(-2, 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (p.effect === 'chain') {
        // Chain lightning between path points
        if (p.path && p.path.length > 1) {
          const alpha = Math.max(0, p.life / p.maxLife);
          for (let s = 0; s < 2; s++) { // draw twice for glow
            ctx.save();
            ctx.globalAlpha = (s === 0 ? 0.8 : 0.3) * alpha;
            ctx.strokeStyle = s === 0 ? p.color : 'white';
            ctx.lineWidth = s === 0 ? 2.5 : 1.2;
            ctx.beginPath();
            for (let i = 0; i < p.path.length - 1; i++) {
              const a = p.path[i];
              const b = p.path[i + 1];
              // jittered polyline
              const segs = 5;
              ctx.moveTo(a.x, a.y);
              for (let j = 1; j <= segs; j++) {
                const t = j / segs;
                const x = a.x + (b.x - a.x) * t + (Math.random() - 0.5) * 6;
                const y = a.y + (b.y - a.y) * t + (Math.random() - 0.5) * 6;
                ctx.lineTo(x, y);
              }
            }
            ctx.stroke();
            ctx.restore();
          }
        }
      } else if (p.effect === 'orb') {
        // Energy orb effect
        ctx.save();
        ctx.translate(p.x, p.y);
        
        // Glow
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 8);
        gradient.addColorStop(0, p.color);
        gradient.addColorStop(1, 'transparent');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        
        // Core
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Trail
        if (p.trail && p.trail.length > 1) {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.3;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          for (let i = 0; i < p.trail.length; i++) {
            ctx.lineTo(p.trail[i].x - p.x, p.trail[i].y - p.y);
          }
          ctx.stroke();
        }
        
        ctx.restore();
        
      } else if (p.effect === 'tracer') {
        // Fast tracer bullet (streak line)
        const angle = Math.atan2(p.vy, p.vx);
        const len = 14;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(angle);
        const grad = ctx.createLinearGradient(-len, 0, 0, 0);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(1, p.color);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(-len, 0);
        ctx.lineTo(0, 0);
        ctx.stroke();
        // small core dot
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        // Default projectile
        ctx.save();
        ctx.translate(p.x, p.y);
        
        // Glow
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 6);
        gradient.addColorStop(0, p.color);
        gradient.addColorStop(1, 'transparent');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fill();
        
        // Core
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(0, 0, 2, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
      }
    }

    // Placement preview
    if (state.placing && mouse.inside) {
      const { gx, gy } = worldToGrid(mouse.x, mouse.y);
      const wx = gx * TILE; const wy = gy * TILE;
      const blocked = isCellBlocked(gx, gy);
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = blocked ? 'rgba(255,80,80,0.35)' : 'rgba(120,255,150,0.25)';
      ctx.strokeStyle = blocked ? 'rgba(255,80,80,0.8)' : 'rgba(120,255,150,0.8)';
      ctx.lineWidth = 2;
      ctx.fillRect(wx + 1, wy + 1, TILE - 2, TILE - 2);
      ctx.strokeRect(wx + 1, wy + 1, TILE - 2, TILE - 2);
      ctx.restore();
    }

    // Draw particles on top of everything
    drawParticles();

    // Draw any UI elements that should be on top
    if (state.lives <= 0) {
      drawGameOver();
    }

    // Draw FPS counter (debug)
    if (false) { // Set to true to show FPS
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(10, 10, 100, 30);
      ctx.fillStyle = 'white';
      ctx.font = '14px monospace';
      ctx.textBaseline = 'top';
      ctx.fillText(`FPS: ${Math.round(1/state.dt)}`, 20, 20);
      ctx.restore();
    }

    // Restore from initial screen-shake translate
    ctx.restore();
  }

  function drawGameOver() {
    ctx.save();
    ctx.fillStyle = 'rgba(10,12,24,0.72)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#ffd36e';
    ctx.font = 'bold 48px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over', WIDTH/2, HEIGHT/2 - 10);
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillStyle = '#dfe7ff';
    ctx.fillText('Refresh to try again', WIDTH/2, HEIGHT/2 + 26);
    ctx.restore();
  }

  updateHUD();
  requestAnimationFrame(loop);
})();
