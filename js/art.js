'use strict';
/* 程序化美术：英雄徽记、敌人、地图背景。全部原创，Canvas 绘制。 */
const Art = (() => {
  const cache = new Map();

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function shade(hex, k) { // k>0 提亮，k<0 压暗
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const t = k > 0 ? 255 : 0, f = Math.abs(k);
    r = Math.round(r + (t - r) * f); g = Math.round(g + (t - g) * f); b = Math.round(b + (t - b) * f);
    return `rgb(${r},${g},${b})`;
  }

  function framePath(ctx, cls, r) {
    ctx.beginPath();
    if (cls === '战士') { // 盾
      ctx.moveTo(-r * 0.86, -r * 0.8); ctx.lineTo(r * 0.86, -r * 0.8);
      ctx.lineTo(r * 0.86, r * 0.05);
      ctx.quadraticCurveTo(r * 0.8, r * 0.7, 0, r * 1.02);
      ctx.quadraticCurveTo(-r * 0.8, r * 0.7, -r * 0.86, r * 0.05);
      ctx.closePath();
    } else if (cls === '射手') { // 菱
      ctx.moveTo(0, -r * 1.05); ctx.lineTo(r * 0.95, 0); ctx.lineTo(0, r * 1.05); ctx.lineTo(-r * 0.95, 0); ctx.closePath();
    } else if (cls === '工匠') { // 六边
      for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath();
    } else if (cls === '辅助') { // 八边
      for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; ctx.lineTo(Math.cos(a) * r * 0.98, Math.sin(a) * r * 0.98); }
      ctx.closePath();
    } else { ctx.arc(0, 0, r * 0.96, 0, Math.PI * 2); }
  }

  /* 英雄徽记：职业决定外框形状，攻击类型决定外环颜色，阵营决定角饰 */
  function emblem(def, size, shiny) {
    const key = def.id + ':' + size + ':' + (shiny ? 1 : 0);
    if (cache.has(key)) return cache.get(key);
    const dpr = 2, s = size * dpr;
    const c = document.createElement('canvas'); c.width = c.height = s;
    const ctx = c.getContext('2d');
    ctx.translate(s / 2, s / 2);
    const r = s * 0.36;
    const col = shiny ? def.shiny : def.col;
    const atkCol = ATK[def.atk].color;
    // 外辉
    const glow = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 1.38);
    glow.addColorStop(0, hexA(col, 0.35)); glow.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, r * 1.38, 0, Math.PI * 2); ctx.fill();
    // 阵营角饰
    if (def.faction !== 'neutral') {
      const fc = FACTIONS[def.faction].color;
      ctx.save(); ctx.fillStyle = fc;
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath(); ctx.moveTo(0, -r * 1.3); ctx.lineTo(r * 0.12, -r * 1.06); ctx.lineTo(-r * 0.12, -r * 1.06); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    // 外框
    framePath(ctx, def.cls, r * 1.1);
    ctx.fillStyle = '#0d1211'; ctx.fill();
    ctx.lineWidth = s * 0.035; ctx.strokeStyle = atkCol; ctx.stroke();
    // 内面
    framePath(ctx, def.cls, r * 0.94);
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.1, 0, 0, r * 1.1);
    g.addColorStop(0, shade(col, 0.35)); g.addColorStop(0.55, col); g.addColorStop(1, shade(col, -0.62));
    ctx.fillStyle = g; ctx.fill();
    // 纹样（刻痕）
    ctx.save(); framePath(ctx, def.cls, r * 0.94); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = s * 0.012;
    for (let i = -4; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.32 - r, -r * 1.2); ctx.lineTo(i * r * 0.32 + r, r * 1.2); ctx.stroke(); }
    ctx.restore();
    // 字形
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.font = `900 ${Math.round(r * 1.05)}px 'Noto Serif SC', 'Songti SC', serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(def.name[0], s * 0.012, r * 0.08 + s * 0.016);
    ctx.fillStyle = '#fffaf0';
    ctx.fillText(def.name[0], 0, r * 0.08);
    // 异化闪光
    if (shiny) {
      ctx.fillStyle = '#fff';
      const stars = [[0.85, -0.85, 0.16], [-0.95, -0.4, 0.1], [0.7, 0.85, 0.12]];
      for (const [x, y, k] of stars) star(ctx, x * r, y * r, k * r);
    }
    cache.set(key, c);
    return c;
  }

  function star(ctx, x, y, k) {
    ctx.beginPath();
    ctx.moveTo(x, y - k * 2); ctx.quadraticCurveTo(x, y, x + k * 2, y);
    ctx.quadraticCurveTo(x, y, x, y + k * 2); ctx.quadraticCurveTo(x, y, x - k * 2, y);
    ctx.quadraticCurveTo(x, y, x, y - k * 2); ctx.fill();
  }

  /* 敌人 */
  function enemy(ctx, e, t) {
    const d = ENEMIES[e.type];
    const r = d.r;
    const x = e.x, y = e.y - (d.fly ? 14 + Math.sin(t * 6 + e.seed) * 3 : 0);
    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(e.x, e.y + r * 0.55, r * (d.fly ? 0.7 : 1), r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(x, y);
    const flip = e.dir < 0 ? -1 : 1;
    ctx.scale(flip, 1);
    const hurt = e.hitFlash > 0;
    const base = hurt ? '#ffffff' : (e.frozen ? '#9fdcff' : d.col);
    switch (e.type) {
      case 'imp': {
        const bob = Math.sin(t * 14 + e.seed) * 1.5;
        ctx.fillStyle = base;
        ctx.beginPath(); ctx.moveTo(r, bob * 0.3); ctx.lineTo(-r * 0.6, -r + bob); ctx.lineTo(-r * 0.2, 0); ctx.lineTo(-r * 0.6, r + bob * 0.4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.arc(r * 0.35, -r * 0.15, 1.8, 0, 7); ctx.fill();
        break;
      }
      case 'skel': {
        ctx.fillStyle = shade(d.col, -0.5); ctx.fillRect(-r * 0.9, -r * 0.2, r * 0.6, r * 1.1);
        ctx.fillStyle = base; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
        ctx.fillStyle = '#2a2622'; ctx.fillRect(r * 0.1, -r * 0.35, r * 0.25, r * 0.22); ctx.fillRect(r * 0.5, -r * 0.35, r * 0.25, r * 0.22);
        ctx.strokeStyle = '#7c7462'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r * 0.75, 0.6, 2.4); ctx.stroke();
        break;
      }
      case 'golem': {
        ctx.fillStyle = base;
        ctx.beginPath();
        const pts = [[1, 0], [0.6, -0.9], [-0.4, -1], [-1, -0.3], [-0.9, 0.7], [0.1, 1], [0.8, 0.6]];
        pts.forEach(([a, b], i) => i ? ctx.lineTo(a * r, b * r) : ctx.moveTo(a * r, b * r)); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = shade(d.col, -0.45); ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-r * 0.3, -r * 0.6); ctx.lineTo(r * 0.1, -r * 0.1); ctx.lineTo(-r * 0.1, r * 0.5); ctx.stroke();
        ctx.fillStyle = '#7fe0ff'; ctx.beginPath(); ctx.arc(r * 0.45, -r * 0.25, 2.4, 0, 7); ctx.fill();
        break;
      }
      case 'bat': {
        const f = Math.sin(t * 18 + e.seed);
        ctx.fillStyle = base;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-r * 0.3, -r * (0.6 + f * 0.9)); ctx.lineTo(-r * 1.4, -r * (0.2 + f * 0.6)); ctx.lineTo(-r * 0.5, r * 0.3); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * 0.3, -r * (0.6 + f * 0.9)); ctx.lineTo(r * 1.4, -r * (0.2 + f * 0.6)); ctx.lineTo(r * 0.5, r * 0.3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = shade(d.col, -0.3); ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, 7); ctx.fill();
        ctx.fillStyle = '#ff6b6b'; ctx.fillRect(r * 0.05, -r * 0.18, 2, 2);
        break;
      }
      case 'chief': case 'warlock': case 'boss': {
        const enr = e.enraged;
        if (e.type === 'boss') {
          const pulse = 0.5 + Math.sin(t * 2) * 0.5;
          const g = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 1.6);
          g.addColorStop(0, `rgba(255,70,90,${0.25 + pulse * 0.15})`); g.addColorStop(1, 'rgba(255,70,90,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, 7); ctx.fill();
          ctx.fillStyle = hurt ? '#fff' : '#2c2033';
          ctx.beginPath();
          for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, rr = r * (i % 2 ? 0.86 : 1.06); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#6a4a7a'; ctx.lineWidth = 3; ctx.stroke();
          ctx.fillStyle = '#ff4d5e';
          ctx.beginPath(); ctx.arc(r * 0.35, -r * 0.25, 4, 0, 7); ctx.arc(r * 0.6, r * 0.05, 3, 0, 7); ctx.arc(r * 0.2, r * 0.25, 3.5, 0, 7); ctx.fill();
          ctx.fillStyle = '#d8c9a8';
          ctx.beginPath(); ctx.moveTo(r * 0.7, -r * 0.6); ctx.lineTo(r * 1.3, -r * 0.9); ctx.lineTo(r * 0.85, -r * 0.4); ctx.fill();
          ctx.beginPath(); ctx.moveTo(r * 0.7, r * 0.6); ctx.lineTo(r * 1.3, r * 0.9); ctx.lineTo(r * 0.85, r * 0.4); ctx.fill();
        } else {
          const aura = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 1.5);
          aura.addColorStop(0, hexA(d.col, enr ? 0.5 : 0.28)); aura.addColorStop(1, hexA(d.col, 0));
          ctx.fillStyle = aura; ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, 7); ctx.fill();
          ctx.fillStyle = hurt ? '#fff' : base;
          if (e.type === 'chief') {
            ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
            ctx.fillStyle = '#f2c766';
            ctx.beginPath(); ctx.moveTo(-r * 0.5, -r * 0.75); ctx.lineTo(-r * 0.3, -r * 1.25); ctx.lineTo(-r * 0.05, -r * 0.85); ctx.lineTo(r * 0.2, -r * 1.3); ctx.lineTo(r * 0.4, -r * 0.8); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#1b0f0f'; ctx.fillRect(r * 0.2, -r * 0.25, r * 0.5, r * 0.18);
            ctx.strokeStyle = '#d7d0c0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(r * 0.6, r * 0.5); ctx.lineTo(r * 1.4, -r * 0.4); ctx.stroke();
          } else {
            ctx.beginPath(); ctx.moveTo(r * 0.9, r * 0.9); ctx.lineTo(0, -r * 1.15); ctx.lineTo(-r * 0.9, r * 0.9); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#140b1e'; ctx.beginPath(); ctx.ellipse(r * 0.15, -r * 0.2, r * 0.38, r * 0.3, 0, 0, 7); ctx.fill();
            ctx.fillStyle = '#e9c0ff'; ctx.beginPath(); ctx.arc(r * 0.25, -r * 0.22, 2, 0, 7); ctx.fill();
            const op = 0.6 + Math.sin(t * 5) * 0.4;
            ctx.fillStyle = `rgba(200,140,255,${op})`; ctx.beginPath(); ctx.arc(r * 1.05, r * 0.1, 4, 0, 7); ctx.fill();
          }
        }
        break;
      }
    }
    ctx.restore();
  }

  /* 地图背景（预渲染）*/
  function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

  function distToPath(x, y, path) {
    let best = 1e9;
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, ay] = path[i], [bx, by] = path[i + 1];
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
      let u = ((x - ax) * dx + (y - ay) * dy) / L; u = Math.max(0, Math.min(1, u));
      best = Math.min(best, Math.hypot(x - ax - u * dx, y - ay - u * dy));
    }
    return best;
  }

  function background(stage) {
    const key = 'bg' + stage.id;
    if (cache.has(key)) return cache.get(key);
    const dpr = 2;
    const c = document.createElement('canvas'); c.width = W * dpr; c.height = H * dpr;
    const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
    const R = rng(stage.id * 9301 + 49297);
    // 地面
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, stage.ground[0]); g.addColorStop(1, stage.ground[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 斑驳
    for (let i = 0; i < 900; i++) {
      const x = R() * W, y = R() * H, r = R() * 3 + 0.5;
      ctx.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.12)';
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
    // 远古地砖网格（残缺）
    ctx.strokeStyle = 'rgba(200,230,215,0.045)'; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 48) for (let y = 0; y < H; y += 48) {
      if (R() < 0.45) ctx.strokeRect(x + 2, y + 2, 44, 44);
    }
    // 苔藓团
    for (let i = 0; i < 40; i++) {
      const x = R() * W, y = R() * H, r = 20 + R() * 50;
      const mg = ctx.createRadialGradient(x, y, 0, x, y, r);
      mg.addColorStop(0, 'rgba(90,140,90,0.10)'); mg.addColorStop(1, 'rgba(90,140,90,0)');
      ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
    // 道路
    const p = stage.path;
    const road = (w, style) => {
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = w; ctx.strokeStyle = style;
      ctx.beginPath(); p.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
    };
    road(58, 'rgba(0,0,0,0.35)');
    road(50, '#5a4d3b');
    road(42, '#76664d');
    // 路面石板
    for (let i = 0; i < 700; i++) {
      const x = R() * W, y = R() * H;
      if (distToPath(x, y, p) < 18) {
        ctx.fillStyle = R() < 0.5 ? 'rgba(255,240,210,0.08)' : 'rgba(30,20,10,0.18)';
        ctx.fillRect(x, y, 4 + R() * 7, 3 + R() * 5);
      }
    }
    road(2, 'rgba(255,235,200,0.10)');
    // 断柱与碎石
    for (let i = 0; i < 26; i++) {
      const x = R() * W, y = R() * H;
      if (distToPath(x, y, p) < 50) continue;
      if (stage.pads.some(([px, py]) => Math.hypot(px - x, py - y) < 44)) continue;
      const big = R() < 0.35, r = big ? 12 + R() * 8 : 4 + R() * 5;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x + 3, y + r * 0.6, r * 1.1, r * 0.45, 0, 0, 7); ctx.fill();
      ctx.fillStyle = big ? '#6d726b' : '#565b55';
      ctx.beginPath();
      const n = big ? 8 : 6;
      for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, rr = r * (0.8 + R() * 0.35); ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8); }
      ctx.closePath(); ctx.fill();
      if (big) { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.ellipse(x - r * 0.2, y - r * 0.3, r * 0.5, r * 0.25, 0, 0, 7); ctx.fill(); }
    }
    // 入口裂隙
    const [sx, sy] = p[0], [s2x, s2y] = p[1];
    const ex = Math.max(18, Math.min(W - 18, sx)), ey = Math.max(18, Math.min(H - 18, sy));
    const rg = ctx.createRadialGradient(ex, ey, 0, ex, ey, 70);
    rg.addColorStop(0, 'rgba(255,60,80,0.55)'); rg.addColorStop(1, 'rgba(255,60,80,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(ex, ey, 70, 0, 7); ctx.fill();
    void s2x; void s2y;
    // 终点遗迹核心
    const [tx, ty] = p[p.length - 1];
    const cx = Math.max(24, Math.min(W - 24, tx)), cy = Math.max(24, Math.min(H - 24, ty));
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 80);
    cg.addColorStop(0, 'rgba(80,220,190,0.5)'); cg.addColorStop(1, 'rgba(80,220,190,0)');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, 80, 0, 7); ctx.fill();
    // 暗角
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.7);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    cache.set(key, c);
    return c;
  }

  function pad(ctx, x, y, t, state) { // state: 'empty' | 'hover' | 'used' | 'select'
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(x, y + 6, 26, 10, 0, 0, 7); ctx.fill();
    const g = ctx.createLinearGradient(x, y - 20, x, y + 16);
    g.addColorStop(0, '#7b8178'); g.addColorStop(1, '#40463f');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, 24, 15, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    if (state === 'used') return;
    const glow = state === 'hover' || state === 'select' ? 1 : 0.45 + Math.sin(t * 2.4 + x) * 0.2;
    ctx.strokeStyle = `rgba(90,230,200,${0.5 * glow + 0.15})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y, 17, 10, 0, 0, 7); ctx.stroke();
    ctx.fillStyle = `rgba(90,230,200,${0.35 * glow})`;
    for (let i = 0; i < 4; i++) {
      const a = t * 0.6 + i * Math.PI / 2;
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * 17, y + Math.sin(a) * 10, 1.8, 0, 7); ctx.fill();
    }
  }

  return { emblem, enemy, background, pad, hexA, shade, star, distToPath };
})();
