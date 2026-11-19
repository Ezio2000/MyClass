'use strict';
/* 战斗引擎：塔防主循环、克制矩阵结算、支配捕捉、神符、敌方震慑 */
const Battle = (() => {
  let B = null, cv, ctx, raf = 0, lastTs = 0, onEnd = null;
  const $ = s => document.getElementById(s);
  const TAU = Math.PI * 2;
  const dist = (a, b, c, d) => Math.hypot(a - c, b - d);
  const iconCache = new Map();
  function iconURL(def, shiny) {
    const k = def.id + (shiny ? 's' : '');
    if (!iconCache.has(k)) iconCache.set(k, Art.emblem(def, 64, shiny).toDataURL());
    return iconCache.get(k);
  }

  /* ---------- 路径 ---------- */
  function pathInfo(path) {
    const segs = []; let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, ay] = path[i], [bx, by] = path[i + 1], L = Math.hypot(bx - ax, by - ay);
      segs.push({ ax, ay, bx, by, L, s: total }); total += L;
    }
    return { segs, total };
  }
  function posAt(info, d) {
    for (const s of info.segs) {
      if (d <= s.s + s.L) { const u = (d - s.s) / s.L; return { x: s.ax + (s.bx - s.ax) * u, y: s.ay + (s.by - s.ay) * u, dir: Math.sign(s.bx - s.ax) || 1 }; }
    }
    const s = info.segs[info.segs.length - 1]; return { x: s.bx, y: s.by, dir: 1 };
  }

  /* ---------- 波次 ---------- */
  function parseWave(str) { return str.split('|').map(g => { const [type, n] = g.split('*'); return { type, n: +n }; }); }
  function endlessWave(w) {
    const groups = [];
    const pool = ['imp', 'skel']; if (w >= 3) pool.push('bat'); if (w >= 4) pool.push('golem');
    const weight = { imp: 1, skel: 1.6, bat: 1.3, golem: 4 };
    const budget = 9 + w * 2.4, k = w < 4 ? 1 : w < 10 ? 2 : 3;
    for (let i = 0; i < k; i++) { const type = pool[Math.floor(Math.random() * pool.length)]; groups.push({ type, n: Math.max(2, Math.round(budget / k / weight[type])) }); }
    if (w % 5 === 0) groups.push({ type: w % 10 === 5 ? 'chief' : 'warlock', n: 1 + Math.floor(w / 20) });
    if (w >= 20 && w % 10 === 0) groups.push({ type: 'boss', n: 1 });
    return groups;
  }
  function waveGroups(w) { return B.mode === 'endless' ? endlessWave(w) : parseWave(B.st.waves[w - 1]); }
  function hpScale(w) {
    if (B.mode === 'endless') return (1 + 0.13 * (w - 1)) * Math.pow(1.06, Math.floor(w / 5));
    return B.st.hp * (1 + 0.09 * (w - 1));
  }

  /* ---------- 开局 ---------- */
  function start(cfg, cb) {
    onEnd = cb;
    cv = $('cv'); ctx = cv.getContext('2d');
    const stIdx = cfg.mode === 'endless' ? ENDLESS_STAGE : cfg.stage;
    const st = STAGES[stIdx];
    B = {
      mode: cfg.mode, stIdx, st, info: pathInfo(st.path), t: 0, speed: 1, paused: false,
      gold: 260, lives: 20, wave: 0, totalWaves: cfg.mode === 'endless' ? Infinity : st.waves.length,
      queue: [], waveActive: false, between: null, enemies: [], towers: [], doms: [], projs: [], fx: [], parts: [], floats: [],
      rune: null, runeTimer: 14, buffs: { double: 0, haste: 0 }, units: cfg.units, selCard: null, panel: null,
      domOwned: 0, domBought: 0, domOk: 0, domFail: 0, targeting: false, channel: null,
      deployWaves: {}, hover: null, shake: 0, ended: false, eid: 0, tips: {}, dmgBy: { normal: 0, pierce: 0, magic: 0, siege: 0 }
    };
    if (cfg.preset) {
      for (const s of cfg.preset) {
        const unit = B.units.find(u => u.hid === s.hid);
        if (unit) placeTower(unit, s.pad, true).item = s.item || 0;
      }
    }
    bindOnce(); resize();
    renderTray(); updateHUD(); closePanel();
    $('bEnd').hidden = true; $('bConfirm').hidden = true;
    banner(`${cfg.mode === 'endless' ? '无尽 · ' : cfg.mode === 'arena' ? '模拟演武场 · ' : ''}${st.name}`, st.sub, 3.2);
    if (!cfg.preset) setTimeout(() => B && !B.wave && tip('deploy', '点击发光的石台部署英雄，再点「开始第 1 波」'), 1800);
    cancelAnimationFrame(raf); lastTs = performance.now(); raf = requestAnimationFrame(loop);
  }
  function stop() { cancelAnimationFrame(raf); B = null; }

  /* ---------- 英雄塔 ---------- */
  function placeTower(unit, padIdx, free) {
    const def = HERO_BY_ID[unit.hid];
    const [x, y] = B.st.pads[padIdx];
    const tw = { unit, def, lv: 1, pad: padIdx, x, y, item: 0, cd: 0.3, silUntil: 0, pulseCd: 2, aim: 0, invested: free ? 0 : def.cost, born: B.t, speech: null };
    const m = unit.uid && !unit.std ? Meta.mastery(unit).lv : 1;
    tw.mastery = m;
    if (m >= 3) tw.speech = { text: def.line, until: B.t + 2.6 };
    B.towers.push(tw);
    if (!free) { B.gold -= def.cost; Sfx.play('build'); }
    burst(x, y - 10, def.col, 18, 90);
    B.fx.push({ k: 'ring', x, y, r0: 8, r1: 46, life: 0.5, max: 0.5, col: def.col });
    return tw;
  }
  function towerStats(tw) {
    const d = tw.def, L = tw.lv - 1, u = tw.unit;
    const ivb = Meta.ivBonus(u.iv || [8, 8, 8]);
    const ev = u.ev || { atk: 0, sur: 0, fun: 0 };
    let dmg = d.dmg * LV_DMG[L] * (1 + ivb.atk + ev.atk * EV_PER_POINT.atk * EV_IN_BATTLE);
    let rate = d.rate * LV_RATE[L] * (1 + ivb.agi);
    let range = d.range + LV_RANGE[L];
    const pot = 1 + ev.fun * EV_PER_POINT.fun * EV_IN_BATTLE;
    const res = Math.min(0.6, ivb.def + ev.sur * EV_PER_POINT.sur * EV_IN_BATTLE);
    let critC = 0, critM = 2;
    if (d.kind === 'crit') { critC = d.p.chance[L] * pot; critM = d.p.mul[L]; }
    if (tw.item === 1) critC += 0.2;
    if (tw.item === 2) rate *= 1.35;
    if (tw.item === 3) range *= 1.25;
    rate *= 1 + (tw.aura || 0);
    if (B.buffs.haste > B.t) rate *= 1.5;
    if (B.buffs.double > B.t) dmg *= 1.5;
    return { dmg, rate, range, pot, res, critC, critM, L };
  }

  /* ---------- 敌人 ---------- */
  function spawn(type) {
    const d = ENEMIES[type], sc = hpScale(B.wave);
    const p = posAt(B.info, 0);
    const e = { id: ++B.eid, type, d, hp: d.hp * sc, maxHp: d.hp * sc, dist: 0, x: p.x, y: p.y, dir: p.dir,
      slowUntil: 0, slowAmt: 0, stunUntil: 0, hexUntil: 0, hexAmt: 0, burns: [], hitFlash: 0, seed: Math.random() * 10,
      enraged: false, skillCd: type === 'warlock' ? 3 : 7, bounty: Math.round(d.bounty * (1 + 0.02 * (B.wave - 1))), lastTxt: 0, domHinted: false };
    B.enemies.push(e);
    if (d.elite && !B.tips.elite) { B.tips.elite = 1; tip('elite', `精英「${d.name}」出现：血量低于 20% 时可用支配头环捕获`); }
    if (d.boss) { banner('渊喉守墓者', '免疫支配 · 践踏会震慑大范围英雄', 3); Sfx.play('horn'); }
  }

  function damage(e, amt, atk, o = {}) {
    if (e.dead) return;
    let m = matrix(atk, e.d.arm);
    if (e.hexUntil > B.t) m *= 1 + e.hexAmt;
    let dmg = amt * m, crit = false;
    if (o.critC && Math.random() < o.critC) { dmg *= o.critM; crit = true; }
    e.hp -= dmg; e.hitFlash = 0.07;
    B.dmgBy[atk] += dmg;
    if (crit) floatTxt(e.x, e.y - e.d.r - 8, Math.round(dmg) + '!', '#ffd65a', 15);
    else if (B.t - e.lastTxt > 0.9) {
      const base = matrix(atk, e.d.arm);
      if (base >= 1.5) { floatTxt(e.x, e.y - e.d.r - 6, '克制 ×' + base, ATK[atk].color, 11); e.lastTxt = B.t; }
      else if (base <= 0.5) { floatTxt(e.x, e.y - e.d.r - 6, '抵抗 ×' + base, '#8b9590', 10); e.lastTxt = B.t; }
    }
    if (o.exec && !e.d.elite && !e.d.boss && e.hp > 0 && e.hp / e.maxHp < o.exec) {
      floatTxt(e.x, e.y - 20, '斩杀', '#c9a6ff', 13); e.hp = 0;
    }
    if (e.hp <= 0) kill(e);
  }
  function kill(e) {
    if (e.dead) return;
    e.dead = true;
    B.gold += e.bounty;
    floatTxt(e.x, e.y - 10, '+' + e.bounty, '#f2c766', 11);
    burst(e.x, e.y, e.d.col, e.d.boss ? 60 : e.d.elite ? 30 : 10, e.d.boss ? 200 : 110);
    if (e.d.elite || e.d.boss) { Sfx.play('boom'); B.shake = Math.max(B.shake, e.d.boss ? 14 : 5); } else Sfx.play('coin');
    if (B.channel && B.channel.e === e) domFail('目标被己方误杀');
  }
  function silence(x, y, r, dur, col = '#b07cff') {
    let any = false;
    for (const tw of B.towers) {
      if (dist(x, y, tw.x, tw.y) > r) continue;
      const res = towerStats(tw).res;
      const until = B.t + dur * (1 - res);
      if (until > tw.silUntil) tw.silUntil = until;
      floatTxt(tw.x, tw.y - 34, res > 0.01 ? `震慑 -${Math.round(res * 100)}%` : '震慑', '#d4b4ff', 10);
      any = true;
    }
    B.fx.push({ k: 'ring', x, y, r0: 10, r1: r, life: 0.6, max: 0.6, col, w: 3 });
    if (any) Sfx.play('silence');
  }

  /* ---------- 支配头环 ---------- */
  function buyDom() {
    if (!B || B.ended) return;
    if (B.domBought >= DOM.limit) return toast(`支配头环每局限购 ${DOM.limit} 个`);
    if (B.gold < DOM.cost) return toast(`金币不足（需要 ${DOM.cost}）`);
    B.gold -= DOM.cost; B.domOwned++; B.domBought++; Sfx.play('coin');
    toast('已购入支配头环：等精英血量跌破 20% 再使用');
    updateHUD();
  }
  function toggleTargeting() {
    if (!B || B.ended) return;
    if (B.channel) return toast('正在支配中…');
    if (!B.domOwned) return toast('先购买支配头环');
    B.targeting = !B.targeting; closePanel(); B.selCard = null; renderTray(); updateHUD();
    if (B.targeting) banner('选择支配目标', '时间流速放缓 · 点击血量低于 20% 的精英', 1.8);
  }
  function tryDominate(e) {
    if (e.d.boss || e.d.fly || !e.d.elite) { toast(e.d.boss ? '守墓者免疫支配' : '只能支配精英单位'); return; }
    if (e.hp / e.maxHp > DOM.hpLine) { floatTxt(e.x, e.y - 30, '血量需低于 20%', '#d4b4ff', 12); return; }
    B.domOwned--; B.targeting = false;
    B.channel = { e, t: 0 };
    e.held = true;
    Sfx.play('domStart'); updateHUD();
  }
  function domFail(why) {
    const refund = Math.round(DOM.cost * DOM.refund);
    B.gold += refund; B.domFail++;
    const e = B.channel.e;
    floatTxt(e.x, e.y - 34, `支配失败 · 返还 ${refund}`, '#ff8d8d', 14);
    banner('支配失败', why + `，返还 ${refund} 金币`, 1.6);
    B.channel = null; Sfx.play('domFail'); updateHUD();
  }
  function domSuccess() {
    const e = B.channel.e; B.channel = null;
    e.dead = true; e.captured = true; B.domOk++;
    const dd = e.d.dom, sc = Math.sqrt(hpScale(B.wave));
    B.doms.push({ type: e.type, d: e.d, x: e.x, y: e.y, dir: e.dir, atk: dd.atk, dmg: dd.dmg * DOM.stat * sc,
      rate: dd.rate, range: dd.range, kind: dd.kind, cd: 0.5, left: DOM.waves, seed: e.seed });
    burst(e.x, e.y, '#b07cff', 40, 160);
    B.fx.push({ k: 'ring', x: e.x, y: e.y, r0: 10, r1: 90, life: 0.7, max: 0.7, col: '#c9a6ff', w: 4 });
    banner('支配成功', `${e.d.name} 倒戈 · 持续 ${DOM.waves} 波，属性 ×${DOM.stat}`, 2);
    Sfx.play('domOk'); updateHUD();
  }

  /* ---------- 神符 ---------- */
  function spawnRune() {
    const keys = Object.keys(RUNES), k = keys[Math.floor(Math.random() * keys.length)];
    const [x, y] = B.st.runes[Math.floor(Math.random() * B.st.runes.length)];
    B.rune = { k, x, y, until: B.t + 14 };
    floatTxt(x, y - 26, RUNES[k].name + '出现', RUNES[k].color, 12);
  }
  function takeRune() {
    const r = B.rune; B.rune = null; Sfx.play('rune');
    burst(r.x, r.y, RUNES[r.k].color, 24, 140);
    if (r.k === 'double') B.buffs.double = B.t + 10;
    if (r.k === 'haste') B.buffs.haste = B.t + 10;
    if (r.k === 'bounty') { B.gold += 60; floatTxt(r.x, r.y - 20, '+60', '#f2c766', 14); }
    if (r.k === 'freeze') for (const e of B.enemies) { e.stunUntil = Math.max(e.stunUntil, B.t + (e.d.boss ? 1.5 : 3)); e.frozen = B.t + 3; }
    banner(RUNES[r.k].name, RUNES[r.k].desc, 1.4);
  }

  /* ---------- 主循环 ---------- */
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (!B) return;
    let dt = Math.min(0.05, (ts - lastTs) / 1000); lastTs = ts;
    if (!B.paused && !B.ended) {
      let sim = dt * B.speed * (B.targeting ? 0.3 : 1);
      while (sim > 0) { const h = Math.min(sim, 1 / 60); step(h); sim -= h; if (!B || B.ended) break; }
    }
    if (B) { draw(dt); updateHUDLite(); }
  }

  function step(dt) {
    B.t += dt;
    // 刷怪
    while (B.queue.length && B.queue[0].at <= B.t) spawn(B.queue.shift().type);
    // 波间倒计时
    if (B.between !== null) { B.between -= dt; if (B.between <= 0) nextWave(); }
    // 神符
    if (B.wave > 0) {
      if (B.rune && B.t > B.rune.until) B.rune = null;
      B.runeTimer -= dt;
      if (B.runeTimer <= 0 && !B.rune) { spawnRune(); B.runeTimer = 18 + Math.random() * 12; }
    }
    // 光环
    for (const tw of B.towers) tw.aura = 0;
    for (const a of B.towers) {
      if (a.def.kind !== 'aura' || a.silUntil > B.t) continue;
      const s = towerStats(a), v = a.def.p.aura[a.lv - 1] * s.pot;
      for (const tw of B.towers) if (tw !== a && dist(a.x, a.y, tw.x, tw.y) <= s.range) tw.aura = Math.max(tw.aura, v);
    }
    // 敌人
    for (const e of B.enemies) {
      if (e.dead) continue;
      e.hitFlash -= dt;
      if (e.frozen && e.frozen < B.t) e.frozen = 0;
      // 灼烧
      for (const b of e.burns) if (b.until > B.t) damage(e, b.dps * dt, 'magic');
      e.burns = e.burns.filter(b => b.until > B.t);
      if (e.dead) continue;
      // 技能
      if (e.type === 'chief' && !e.enraged && e.hp / e.maxHp < 0.5) {
        e.enraged = true; floatTxt(e.x, e.y - 30, '狂暴！', '#ff6b5a', 13); silence(e.x, e.y, 95, 1.5, '#ff6b5a');
      }
      if (e.type === 'warlock' || e.type === 'boss') {
        e.skillCd -= dt;
        if (e.skillCd <= 0 && !e.held) {
          e.skillCd = e.type === 'boss' ? 7 : 5;
          if (e.type === 'boss') { silence(e.x, e.y, 155, 1.5, '#ff4d5e'); B.shake = 8; }
          else silence(e.x, e.y, 110, 2);
        }
      }
      // 移动
      if (e.held) continue;
      let sp = e.d.spd;
      if (e.stunUntil > B.t) sp = 0;
      else {
        if (e.slowUntil > B.t) sp *= 1 - (e.d.boss ? e.slowAmt * 0.5 : e.slowAmt);
        if (e.enraged) sp *= 1.4;
      }
      e.dist += sp * dt;
      const p = posAt(B.info, e.dist); e.x = p.x; e.y = p.y; e.dir = p.dir;
      if (e.dist >= B.info.total) {
        e.dead = true; e.leaked = true;
        B.lives -= e.d.leak; B.shake = Math.max(B.shake, 6 + e.d.leak);
        floatTxt(e.x - 20, e.y - 20, '-' + e.d.leak + ' 生命', '#ff6b5a', 14);
        Sfx.play('leak');
        if (B.channel && B.channel.e === e) domFail('目标突破了防线');
        if (B.lives <= 0) { B.lives = 0; return finish(false); }
      }
      // 支配提示
      if (B.domOwned && e.d.elite && !e.domHinted && e.hp / e.maxHp <= DOM.hpLine) {
        e.domHinted = true; banner('精英进入支配血线', '点击「支配头环」，再点击目标', 1.6);
      }
    }
    // 支配读条
    if (B.channel) {
      B.channel.t += dt;
      if (B.channel.t >= DOM.channel) domSuccess();
    }
    // 英雄攻击
    for (const tw of B.towers) towerAct(tw, dt);
    for (const dm of B.doms) domAct(dm, dt);
    // 投射物
    for (const p of B.projs) {
      const tg = p.target;
      if (tg && !tg.dead) { p.tx = tg.x; p.ty = tg.y - (tg.d.fly ? 14 : 0); }
      const dx = p.tx - p.x, dy = p.ty - p.y, L = Math.hypot(dx, dy), mv = p.spd * dt;
      p.trail.push([p.x, p.y]); if (p.trail.length > 6) p.trail.shift();
      if (L <= mv + 2) { p.done = true; impact(p); }
      else { p.x += dx / L * mv; p.y += dy / L * mv; p.prog = 1 - L / p.L0; }
    }
    B.projs = B.projs.filter(p => !p.done);
    B.enemies = B.enemies.filter(e => !e.dead);
    // 特效
    for (const f of B.fx) f.life -= dt;
    B.fx = B.fx.filter(f => f.life > 0);
    for (const p of B.parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy = p.vy * 0.92 + 30 * dt; }
    B.parts = B.parts.filter(p => p.life > 0);
    for (const f of B.floats) { f.life -= dt; f.y -= 26 * dt; }
    B.floats = B.floats.filter(f => f.life > 0);
    if (B.shake > 0) B.shake = Math.max(0, B.shake - dt * 30);
    // 波次结束
    if (B.waveActive && !B.queue.length && !B.enemies.length) waveEnd();
  }

  function canHit(tw, e) { return !(e.d.fly && tw.def.air === false); }
  function targets(x, y, range, filter, n = 1) {
    const list = [];
    for (const e of B.enemies) {
      if (e.dead || (filter && !filter(e))) continue;
      if (dist(x, y, e.x, e.y) <= range + e.d.r * 0.5) list.push(e);
    }
    list.sort((a, b) => b.dist - a.dist);
    return list.slice(0, n);
  }

  function towerAct(tw, dt) {
    tw.cd -= dt;
    if (tw.silUntil > B.t) return;
    const s = towerStats(tw), d = tw.def, L = tw.lv - 1;
    // 潮汐：周期潮涌
    if (d.kind === 'pulse') {
      tw.pulseCd -= dt;
      if (tw.pulseCd <= 0) {
        const r = s.range * 0.9, hit = targets(tw.x, tw.y, r, null, 99);
        if (hit.length) {
          tw.pulseCd = d.p.every[L];
          for (const e of hit) { damage(e, s.dmg * 1.4, d.atk); if (!e.d.boss) e.stunUntil = Math.max(e.stunUntil, B.t + d.p.stun[L] * s.pot); }
          B.fx.push({ k: 'ring', x: tw.x, y: tw.y, r0: 12, r1: r, life: 0.55, max: 0.55, col: tw.def.col, w: 5 });
          Sfx.play('boom');
        }
      }
    }
    if (tw.cd > 0) return;
    const n = d.kind === 'multi' ? d.p.n[L] : 1;
    const tg = targets(tw.x, tw.y, s.range, e => canHit(tw, e), n);
    if (!tg.length) return;
    tw.cd = 1 / s.rate;
    tw.aim = Math.atan2(tg[0].y - tw.y, tg[0].x - tw.x);
    tw.recoil = 0.12;
    const o = { critC: s.critC, critM: s.critM };
    if (d.kind === 'chain') { chain(tw, tg[0], s, d.p.jumps[L]); return; }
    if (d.kind === 'beam') { beam(tw, tg[0], s, d.p.len[L]); return; }
    for (const e of tg) {
      const pay = { atk: d.atk, dmg: s.dmg, o, kind: d.kind, L, pot: s.pot, src: tw };
      fire(tw.x, tw.y - 14, e, pay, ATK[d.atk].color, d.col);
    }
    Sfx.play('shoot');
  }

  function fire(x, y, e, pay, col, col2) {
    const spd = { pierce: 560, normal: 480, magic: 380, siege: 300 }[pay.atk];
    const L0 = Math.max(1, dist(x, y, e.x, e.y));
    B.projs.push({ x, y, tx: e.x, ty: e.y, target: e, spd, pay, col, col2, trail: [], L0, prog: 0 });
  }

  function impact(p) {
    const { pay } = p, e = p.target;
    const kind = pay.kind;
    if (kind === 'splash' || kind === 'burn' || kind === 'well' || kind === 'cleave') {
      const rad = kind === 'cleave' ? 42 : HERO_BY_ID[pay.src.def?.id]?.p.radius[pay.L] || 50;
      for (const o of B.enemies) {
        if (o.dead || (o.d.fly && kind !== 'burn' && kind !== 'cleave')) continue;
        const dd = dist(p.tx, p.ty, o.x, o.y);
        if (dd > rad + o.d.r * 0.5) continue;
        const main = o === e;
        damage(o, pay.dmg * (main ? 1 : 0.6), pay.atk, pay.o);
        if (kind === 'burn') o.burns.push({ dps: pay.src.def.p.dps[pay.L] * pay.pot, until: B.t + 3 });
        if (kind === 'well') { const amt = pay.src.def.p.slow[pay.L] * pay.pot; o.slowAmt = Math.max(o.slowUntil > B.t ? o.slowAmt : 0, amt); o.slowUntil = B.t + 2; }
      }
      const col = kind === 'burn' ? '#ff7a3d' : kind === 'well' ? '#9a6cff' : kind === 'cleave' ? '#ff6b5a' : '#e0a060';
      B.fx.push({ k: 'ring', x: p.tx, y: p.ty, r0: 6, r1: rad, life: 0.35, max: 0.35, col, w: 3, fill: true });
      burst(p.tx, p.ty, col, kind === 'burn' ? 14 : 8, 90);
      Sfx.play(kind === 'splash' ? 'boom' : 'hit');
      return;
    }
    if (!e || e.dead) return;
    damage(e, pay.dmg, pay.atk, { ...pay.o, exec: kind === 'execute' ? pay.src.def.p.th[pay.L] * pay.pot : 0 });
    if (kind === 'slow') { const amt = pay.src.def.p.slow[pay.L] * pay.pot; e.slowAmt = Math.max(e.slowUntil > B.t ? e.slowAmt : 0, amt); e.slowUntil = B.t + pay.src.def.p.dur[pay.L]; }
    if (kind === 'hex' || kind === 'curse') { const amt = kind === 'curse' ? 0.15 : pay.src.def.p.amp[pay.L] * pay.pot; e.hexAmt = Math.max(e.hexUntil > B.t ? e.hexAmt : 0, amt); e.hexUntil = B.t + 4; }
    burst(p.tx, p.ty, p.col, 4, 60);
    Sfx.play('hit');
  }

  function chain(tw, first, s, jumps) {
    const hit = new Set([first]); const pts = [[tw.x, tw.y - 16], [first.x, first.y]];
    let cur = first, dmg = s.dmg;
    damage(cur, dmg, 'magic', { critC: s.critC, critM: s.critM });
    for (let i = 1; i < jumps; i++) {
      let best = null, bd = 115;
      for (const e of B.enemies) { if (e.dead || hit.has(e)) continue; const d = dist(cur.x, cur.y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
      if (!best) break;
      hit.add(best); dmg *= 0.78; pts.push([best.x, best.y]); damage(best, dmg, 'magic'); cur = best;
    }
    B.fx.push({ k: 'bolt', pts, life: 0.18, max: 0.18, col: '#a9d4ff' });
    Sfx.play('zap');
  }
  function beam(tw, tg, s, lenK) {
    const a = Math.atan2(tg.y - tw.y, tg.x - tw.x), len = s.range * lenK;
    const x2 = tw.x + Math.cos(a) * len, y2 = tw.y + Math.sin(a) * len;
    for (const e of B.enemies) {
      if (e.dead) continue;
      const px = e.x - tw.x, py = e.y - tw.y, u = px * Math.cos(a) + py * Math.sin(a);
      if (u < 0 || u > len) continue;
      if (Math.abs(-px * Math.sin(a) + py * Math.cos(a)) <= 16 + e.d.r * 0.5) damage(e, s.dmg, 'magic', { critC: s.critC, critM: s.critM });
    }
    B.fx.push({ k: 'beam', x1: tw.x, y1: tw.y - 14, x2, y2, life: 0.22, max: 0.22, col: '#ffe08a', w: 9 });
    Sfx.play('zap');
  }

  function domAct(dm, dt) {
    dm.cd -= dt; if (dm.cd > 0) return;
    const tg = targets(dm.x, dm.y, dm.range, null, 1)[0];
    if (!tg) return;
    dm.cd = 1 / dm.rate;
    const pay = { atk: dm.atk, dmg: dm.dmg, o: {}, kind: dm.kind, L: 0, pot: 1, src: { def: null } };
    fire(dm.x, dm.y - 12, tg, pay, dm.atk === 'magic' ? '#c9a6ff' : '#ff8d6c', '#b07cff');
  }

  /* ---------- 波次控制 ---------- */
  function nextWave() {
    if (!B || B.ended || B.waveActive) return;
    if (B.wave >= B.totalWaves) return;
    if (B.between !== null && B.between > 0 && B.wave > 0) {
      const bonus = Math.ceil(B.between);
      B.gold += bonus; floatTxt(W / 2, 60, `提前召唤 +${bonus} 金币`, '#f2c766', 13);
    }
    B.between = null;
    B.wave++;
    const groups = waveGroups(B.wave);
    let at = B.t + 0.6;
    for (const g of groups) { for (let i = 0; i < g.n; i++) { B.queue.push({ at, type: g.type }); at += SPAWN_GAP[g.type]; } at += 1; }
    B.queue.sort((a, b) => a.at - b.at);
    B.waveActive = true;
    const names = groups.map(g => `${ENEMIES[g.type].name}×${g.n}`).join('　');
    banner(`第 ${B.wave} 波`, names, 2);
    Sfx.play('horn');
    closeTip('deploy');
    updateHUD();
  }
  function waveEnd() {
    B.waveActive = false;
    const bonus = 15 + B.wave * 4;
    B.gold += bonus;
    for (const tw of B.towers) {
      const u = tw.unit;
      if (u.uid && !u.rented && !u.std) B.deployWaves[u.uid] = (B.deployWaves[u.uid] || 0) + 1;
    }
    for (const dm of B.doms) dm.left--;
    const exp = B.doms.filter(d => d.left <= 0);
    for (const d of exp) { burst(d.x, d.y, '#b07cff', 20, 100); floatTxt(d.x, d.y - 20, '支配结束', '#c9a6ff', 12); }
    B.doms = B.doms.filter(d => d.left > 0);
    if (B.wave >= B.totalWaves) return finish(true);
    B.between = 20;
    floatTxt(W / 2, 90, `波次完成 +${bonus} 金币`, '#f2c766', 13);
    updateHUD();
  }

  function finish(win) {
    if (B.ended) return;
    B.ended = true; B.targeting = false;
    if (B.channel) { B.channel = null; }
    const types = new Set(B.towers.map(t => t.def.atk));
    const res = {
      mode: B.mode, stage: B.stIdx, win, wavesCleared: win ? B.wave : Math.max(0, B.wave - 1),
      stars: win ? (B.lives >= 18 ? 3 : B.lives >= 10 ? 2 : 1) : 0, lives: B.lives,
      deployWaves: B.deployWaves, domBought: B.domBought, domOk: B.domOk, domFail: B.domFail,
      monoType: win && B.towers.length >= 2 && types.size === 1,
      dmgBy: B.dmgBy,
      code: Meta.encode(B.stIdx, B.towers.slice(0, 6).map(t => ({ hid: t.def.id, pad: t.pad, item: t.item })))
    };
    Sfx.play(win ? 'win' : 'lose');
    closePanel();
    setTimeout(() => onEnd && onEnd(res), 700);
  }

  /* ---------- 粒子 & 文本 ---------- */
  function burst(x, y, col, n, sp) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = sp * (0.3 + Math.random() * 0.7);
      B.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, life: 0.4 + Math.random() * 0.5, max: 0.9, col, s: 1.5 + Math.random() * 2.5 });
    }
    if (B.parts.length > 900) B.parts.splice(0, B.parts.length - 900);
  }
  function floatTxt(x, y, text, col, size) { B.floats.push({ x, y, text, col, size, life: 1.1 }); if (B.floats.length > 80) B.floats.shift(); }

  /* ---------- 绘制 ---------- */
  // 竖屏手机：整个战斗界面旋转为横屏；矮屏横屏：侧栏布局
  let rotated = false;
  function layout() {
    const el = $('battle'), w = innerWidth, h = innerHeight;
    rotated = h > w && w < 760;
    const side = rotated || (w >= h && h < 560);
    el.classList.toggle('rot', rotated); el.classList.toggle('side', side);
    if (rotated) { el.style.width = h + 'px'; el.style.height = w + 'px'; el.style.setProperty('--bh', w + 'px'); }
    else { el.style.width = ''; el.style.height = ''; el.style.setProperty('--bh', h + 'px'); }
  }
  function resize() {
    layout();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(cv.clientWidth * dpr); cv.height = Math.round(cv.clientHeight * dpr);
  }
  function draw() {
    const sx = cv.width / W, sy = cv.height / H;
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    if (B.shake > 0) ctx.translate((Math.random() - 0.5) * B.shake, (Math.random() - 0.5) * B.shake);
    ctx.drawImage(Art.background(B.st), 0, 0, W, H);
    const now = performance.now() / 1000;
    // 石台
    B.st.pads.forEach(([x, y], i) => {
      const used = B.towers.some(tw => tw.pad === i);
      const st = used ? 'used' : (B.hover && B.hover.pad === i) || (B.panel && B.panel.pad === i) ? 'hover' : B.selCard ? 'select' : 'empty';
      Art.pad(ctx, x, y, now, st);
    });
    // 范围圈
    const showRange = B.panel && B.panel.tower ? B.panel.tower : B.hover && B.hover.tower;
    if (showRange) {
      const s = towerStats(showRange);
      ctx.fillStyle = Art.hexA(showRange.def.col, 0.08); ctx.strokeStyle = Art.hexA(showRange.def.col, 0.55); ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.arc(showRange.x, showRange.y, s.range, 0, TAU); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    }
    if (B.selCard && B.hover && B.hover.pad != null) {
      const def = HERO_BY_ID[B.selCard.hid], [x, y] = B.st.pads[B.hover.pad];
      ctx.strokeStyle = Art.hexA(def.col, 0.5); ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.arc(x, y, def.range, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }
    // 神符
    if (B.rune) {
      const r = B.rune, R = RUNES[r.k], blink = r.until - B.t < 4 ? (Math.sin(now * 14) > 0 ? 1 : 0.35) : 1;
      ctx.globalAlpha = blink;
      const g = ctx.createRadialGradient(r.x, r.y, 2, r.x, r.y, 30);
      g.addColorStop(0, Art.hexA(R.color, 0.9)); g.addColorStop(1, Art.hexA(R.color, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(r.x, r.y, 30, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(r.x, r.y - 4 + Math.sin(now * 3) * 3); ctx.rotate(now * 1.5);
      ctx.fillStyle = R.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(9, 0); ctx.lineTo(0, 11); ctx.lineTo(-9, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore(); ctx.globalAlpha = 1;
    }
    // 实体按 y 排序
    const ents = [];
    for (const tw of B.towers) ents.push({ y: tw.y, f: () => drawTower(tw, now) });
    for (const dm of B.doms) ents.push({ y: dm.y, f: () => drawDom(dm, now) });
    for (const e of B.enemies) ents.push({ y: e.y, f: () => drawEnemy(e, now) });
    ents.sort((a, b) => a.y - b.y).forEach(o => o.f());
    // 投射物
    for (const p of B.projs) drawProj(p);
    // 特效
    for (const f of B.fx) {
      const k = f.life / f.max;
      if (f.k === 'ring') {
        const r = f.r1 - (f.r1 - f.r0) * k;
        ctx.strokeStyle = Art.hexA(f.col, k); ctx.lineWidth = f.w || 2;
        ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.stroke();
        if (f.fill) { ctx.fillStyle = Art.hexA(f.col, k * 0.25); ctx.fill(); }
      } else if (f.k === 'beam') {
        ctx.lineCap = 'round';
        ctx.strokeStyle = Art.hexA(f.col, k * 0.5); ctx.lineWidth = f.w * 2.2 * k;
        ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,240,${k})`; ctx.lineWidth = f.w * 0.5;
        ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      } else if (f.k === 'bolt') {
        ctx.strokeStyle = Art.hexA('#a9d4ff', k); ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let i = 0; i < f.pts.length - 1; i++) {
          const [ax, ay] = f.pts[i], [bx, by] = f.pts[i + 1];
          ctx.moveTo(ax, ay);
          for (let j = 1; j <= 5; j++) { const u = j / 5; ctx.lineTo(ax + (bx - ax) * u + (j < 5 ? (Math.random() - 0.5) * 14 : 0), ay + (by - ay) * u + (j < 5 ? (Math.random() - 0.5) * 14 : 0)); }
        }
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${k})`; ctx.lineWidth = 1; ctx.stroke();
      }
    }
    // 粒子
    for (const p of B.parts) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.col; ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    ctx.globalAlpha = 1;
    // 支配读条
    if (B.channel) {
      const e = B.channel.e, k = Math.min(1, B.channel.t / DOM.channel);
      const cy = e.y - e.d.r - 38 + k * 18;
      ctx.strokeStyle = '#c9a6ff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(e.x, cy, 16, 6, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(201,166,255,0.35)'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.d.r + 14, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
      ctx.strokeStyle = '#e8d8ff'; ctx.lineWidth = 2; ctx.stroke();
      for (let i = 0; i < 3; i++) { const a = now * 4 + i * 2.1; ctx.fillStyle = '#e8d8ff'; ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * (e.d.r + 14), e.y + Math.sin(a) * (e.d.r + 14), 2, 0, TAU); ctx.fill(); }
    }
    // 支配瞄准遮罩
    if (B.targeting) {
      ctx.fillStyle = 'rgba(20,8,40,0.35)'; ctx.fillRect(-20, -20, W + 40, H + 40);
      for (const e of B.enemies) {
        if (!e.d.elite) continue;
        const ok = e.hp / e.maxHp <= DOM.hpLine;
        ctx.strokeStyle = ok ? '#d9b8ff' : 'rgba(217,184,255,0.35)'; ctx.lineWidth = ok ? 3 : 1.5;
        ctx.setLineDash(ok ? [] : [4, 4]);
        ctx.beginPath(); ctx.arc(e.x, e.y, e.d.r + 12 + (ok ? Math.sin(now * 8) * 3 : 0), 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = ok ? '#f0e4ff' : 'rgba(240,228,255,0.6)'; ctx.font = "700 11px 'Noto Sans SC', sans-serif"; ctx.textAlign = 'center';
        ctx.fillText(ok ? '可支配' : Math.round(e.hp / e.maxHp * 100) + '%', e.x, e.y - e.d.r - 18);
      }
    }
    // 浮字
    ctx.textAlign = 'center';
    for (const f of B.floats) {
      ctx.globalAlpha = Math.min(1, f.life * 1.6);
      ctx.font = `800 ${f.size}px 'Noto Sans SC', sans-serif`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.col; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    // 冻结/神符屏幕色调
    if (B.buffs.double > B.t) { ctx.fillStyle = 'rgba(255,60,40,0.05)'; ctx.fillRect(0, 0, W, H); }
    if (B.paused && !B.ended) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#e8efe9'; ctx.font = "900 44px 'Noto Serif SC', serif"; ctx.fillText('暂停', W / 2, H / 2);
    }
  }

  function drawTower(tw, now) {
    const s = 46, img = Art.emblem(tw.def, s, tw.unit.shiny);
    const sil = tw.silUntil > B.t;
    const bob = Math.sin(now * 2 + tw.pad) * 1.5;
    tw.recoil = Math.max(0, (tw.recoil || 0) - 0.016);
    // 等级底环
    ctx.strokeStyle = Art.hexA(tw.def.col, 0.7); ctx.lineWidth = 2;
    for (let i = 0; i < tw.lv; i++) { ctx.beginPath(); ctx.ellipse(tw.x, tw.y + 2, 20 + i * 4, 8 + i * 2, 0, 0, TAU); ctx.stroke(); }
    if (tw.aura) { ctx.strokeStyle = 'rgba(240,215,120,0.4)'; ctx.beginPath(); ctx.ellipse(tw.x, tw.y + 2, 30, 12, 0, now * 2, now * 2 + 2); ctx.stroke(); }
    ctx.save();
    if (sil) ctx.globalAlpha = 0.55;
    const k = 1 + (tw.recoil || 0) * 0.6;
    ctx.drawImage(img, tw.x - s / 2 * k, tw.y - s * 0.95 + bob - (tw.recoil || 0) * 8, s * k, s * k);
    ctx.restore();
    // 朝向指示
    ctx.fillStyle = ATK[tw.def.atk].color;
    ctx.beginPath(); const ax = tw.x + Math.cos(tw.aim) * 24, ay = tw.y - 20 + Math.sin(tw.aim) * 24;
    ctx.arc(ax, ay, 2.2, 0, TAU); ctx.fill();
    if (sil) {
      ctx.strokeStyle = '#c9a6ff'; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) { const a = now * 5 + i * 2.1; ctx.beginPath(); ctx.arc(tw.x + Math.cos(a) * 12, tw.y - 50 + Math.sin(a) * 4, 2.5, 0, TAU); ctx.stroke(); }
    }
    // 装备角标
    if (tw.item) {
      ctx.fillStyle = '#0d1211'; ctx.strokeStyle = '#d8a657'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(tw.x + 18, tw.y - 38 + bob, 8, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f2d59a'; ctx.font = "700 9px 'Noto Sans SC', sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ITEMS[tw.item].short, tw.x + 18, tw.y - 37.5 + bob); ctx.textBaseline = 'alphabetic';
    }
    // 名牌（专精 5 / 冠名 / 租借）
    const u = tw.unit;
    const named = u.name;
    if (tw.mastery >= 5 || named || u.rented) {
      const label = (u.rented ? '租·' : '') + (named || tw.def.name);
      ctx.font = "700 10px 'Noto Sans SC', sans-serif"; ctx.textAlign = 'center';
      const w = ctx.measureText(label).width + 12;
      ctx.fillStyle = 'rgba(10,14,13,0.85)'; ctx.strokeStyle = u.rented ? '#86c3b4' : '#d8a657'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(tw.x - w / 2, tw.y + 12, w, 14, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = u.rented ? '#bfe6dc' : '#f2d59a'; ctx.fillText(label, tw.x, tw.y + 22.5);
    }
    if (tw.speech && tw.speech.until > B.t) {
      ctx.font = "600 11px 'Noto Sans SC', sans-serif"; const w = ctx.measureText(tw.speech.text).width + 16;
      const bx = Math.min(W - w - 4, Math.max(4, tw.x - w / 2)), by = tw.y - 76;
      ctx.fillStyle = 'rgba(245,240,225,0.95)'; ctx.beginPath(); ctx.roundRect(bx, by, w, 20, 6); ctx.fill();
      ctx.beginPath(); ctx.moveTo(tw.x - 4, by + 20); ctx.lineTo(tw.x + 4, by + 20); ctx.lineTo(tw.x, by + 26); ctx.fill();
      ctx.fillStyle = '#1b2220'; ctx.textAlign = 'left'; ctx.fillText(tw.speech.text, bx + 8, by + 14);
    }
  }

  function drawDom(dm, now) {
    const fake = { ...dm, dist: 0, hitFlash: 0, enraged: false, d: dm.d, dir: dm.dir };
    ctx.save();
    const g = ctx.createRadialGradient(dm.x, dm.y, 4, dm.x, dm.y, dm.d.r + 22);
    g.addColorStop(0, 'rgba(176,124,255,0.35)'); g.addColorStop(1, 'rgba(176,124,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(dm.x, dm.y, dm.d.r + 22, 0, TAU); ctx.fill();
    Art.enemy(ctx, fake, now);
    // 头环
    ctx.strokeStyle = '#d9b8ff'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(dm.x, dm.y - dm.d.r - 6 + Math.sin(now * 3) * 2, 11, 4, 0, 0, TAU); ctx.stroke();
    ctx.restore();
    ctx.font = "700 10px 'Noto Sans SC', sans-serif"; ctx.textAlign = 'center';
    const label = `支配 · 剩 ${dm.left} 波`;
    const w = ctx.measureText(label).width + 12;
    ctx.fillStyle = 'rgba(30,14,50,0.85)'; ctx.beginPath(); ctx.roundRect(dm.x - w / 2, dm.y + dm.d.r + 6, w, 14, 3); ctx.fill();
    ctx.fillStyle = '#e8d8ff'; ctx.fillText(label, dm.x, dm.y + dm.d.r + 16.5);
  }

  function drawEnemy(e, now) {
    Art.enemy(ctx, e, now);
    const d = e.d, r = d.r, y0 = e.y - (d.fly ? 14 : 0) - r - 9;
    const w = d.boss ? 64 : d.elite ? 40 : 24;
    // 护甲徽
    ctx.fillStyle = ARM[d.arm].color;
    ctx.beginPath(); ctx.moveTo(e.x - w / 2 - 7, y0 - 2); ctx.lineTo(e.x - w / 2 - 1, y0 - 2); ctx.lineTo(e.x - w / 2 - 1, y0 + 2); ctx.lineTo(e.x - w / 2 - 4, y0 + 5); ctx.lineTo(e.x - w / 2 - 7, y0 + 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(e.x - w / 2, y0 - 2, w, 4);
    const k = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = d.boss ? '#ff4d5e' : d.elite ? (k <= DOM.hpLine ? '#c9a6ff' : '#ff9a4a') : k > 0.5 ? '#7fe08a' : '#f2c766';
    ctx.fillRect(e.x - w / 2, y0 - 2, w * k, 4);
    if (d.elite) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(e.x - w / 2 + w * DOM.hpLine, y0 - 3, 1, 6); }
    if (e.hexUntil > B.t) { ctx.fillStyle = '#9fe07f'; ctx.beginPath(); ctx.arc(e.x + w / 2 + 5, y0, 2.5, 0, TAU); ctx.fill(); }
    if (e.burns.length) { ctx.fillStyle = '#ff7a3d'; ctx.beginPath(); ctx.arc(e.x + w / 2 + 5, y0 + (e.hexUntil > B.t ? 6 : 0), 2.5, 0, TAU); ctx.fill(); }
    if (e.slowUntil > B.t) { ctx.strokeStyle = 'rgba(140,210,255,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(e.x, e.y + r * 0.5, r + 2, r * 0.4, 0, 0, TAU); ctx.stroke(); }
    if (e.stunUntil > B.t) {
      ctx.fillStyle = '#ffe58a';
      for (let i = 0; i < 3; i++) { const a = now * 6 + i * 2.1; Art.star(ctx, e.x + Math.cos(a) * r * 0.8, y0 - 6 + Math.sin(a) * 2, 1.6); }
    }
    if (B.domOwned && d.elite && k <= DOM.hpLine && !B.targeting) {
      ctx.strokeStyle = `rgba(201,166,255,${0.5 + Math.sin(now * 8) * 0.4})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(e.x, e.y, r + 10, 0, TAU); ctx.stroke();
    }
  }

  function drawProj(p) {
    const atk = p.pay.atk;
    let x = p.x, y = p.y;
    if (atk === 'siege') y -= Math.sin(Math.max(0, Math.min(1, p.prog)) * Math.PI) * 40;
    if (atk === 'pierce') {
      const [tx, ty] = p.trail[0] || [p.x, p.y];
      ctx.strokeStyle = p.col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, TAU); ctx.fill();
    } else if (atk === 'magic') {
      for (let i = 0; i < p.trail.length; i++) { const [tx, ty] = p.trail[i]; ctx.fillStyle = Art.hexA(p.col2 && p.col2[0] === '#' ? p.col2 : p.col, i / p.trail.length * 0.4); ctx.beginPath(); ctx.arc(tx, ty, 3, 0, TAU); ctx.fill(); }
      const g = ctx.createRadialGradient(x, y, 0, x, y, 8); g.addColorStop(0, '#fff'); g.addColorStop(0.4, p.col); g.addColorStop(1, Art.hexA(p.col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU); ctx.fill();
    } else if (atk === 'siege') {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 4, 4, 2, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = p.col2 || '#a08060'; ctx.strokeStyle = '#2a2018'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill(); ctx.stroke();
    } else {
      const a = Math.atan2(p.ty - p.y, p.tx - p.x);
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.fillStyle = p.col; ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -4); ctx.lineTo(-2, 0); ctx.lineTo(-5, 4); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  /* ---------- 输入 ---------- */
  let bound = false;
  function toLogical(ev) {
    const r = cv.getBoundingClientRect();
    if (rotated) return { x: (ev.clientY - r.top) / r.height * W, y: (r.right - ev.clientX) / r.width * H };
    return { x: (ev.clientX - r.left) / r.width * W, y: (ev.clientY - r.top) / r.height * H };
  }
  function hitTest(x, y) {
    const res = {};
    let bd = 34;
    B.towers.forEach(tw => { const d = dist(x, y, tw.x, tw.y - 18); if (d < bd) { bd = d; res.tower = tw; } });
    if (!res.tower) {
      bd = 34;
      B.st.pads.forEach(([px, py], i) => { if (B.towers.some(t => t.pad === i)) return; const d = dist(x, y, px, py); if (d < bd) { bd = d; res.pad = i; } });
    }
    return res;
  }
  function bindOnce() {
    if (bound) return; bound = true;
    cv.addEventListener('pointermove', ev => { if (!B) return; const p = toLogical(ev); B.hover = hitTest(p.x, p.y); cv.style.cursor = (B.hover.tower || B.hover.pad != null || B.targeting) ? 'pointer' : 'default'; });
    cv.addEventListener('pointerleave', () => { if (B) B.hover = null; });
    cv.addEventListener('pointerdown', ev => { if (!B || B.ended) return; Sfx.unlock(); onTap(toLogical(ev)); });
    window.addEventListener('resize', () => { if (B) resize(); });
    $('bNext').addEventListener('click', () => nextWave());
    $('bSpeed').addEventListener('click', () => { if (!B) return; B.speed = B.speed === 1 ? 2 : B.speed === 2 ? 3 : 1; updateHUD(); });
    $('bPause').addEventListener('click', () => { if (!B) return; B.paused = !B.paused; updateHUD(); });
    $('bSound').addEventListener('click', () => { const on = Sfx.toggle(); $('bSound').textContent = on ? '音效 开' : '音效 关'; });
    $('bDomBuy').addEventListener('click', buyDom);
    $('bDomUse').addEventListener('click', toggleTargeting);
    $('bExit').addEventListener('click', () => { if (!B) return; B.paused = true; updateHUD(); $('bConfirm').hidden = false; });
    $('bConfirmNo').addEventListener('click', () => { $('bConfirm').hidden = true; if (B) { B.paused = false; updateHUD(); } });
    $('bConfirmYes').addEventListener('click', () => { $('bConfirm').hidden = true; if (B) { B.paused = false; B.lives = 0; finish(false); } });
    $('bPanel').addEventListener('click', onPanelClick);
    $('bTray').addEventListener('click', ev => {
      const el = ev.target.closest('[data-unit]'); if (!el || !B) return;
      const u = B.units[+el.dataset.unit];
      if (B.towers.some(t => t.unit === u)) { const tw = B.towers.find(t => t.unit === u); openTowerPanel(tw); return; }
      B.selCard = B.selCard === u ? null : u; closePanel(); renderTray();
      if (B.selCard) toast('选择一个空石台部署 ' + (u.name || HERO_BY_ID[u.hid].name));
    });
    document.addEventListener('keydown', ev => {
      if (!B || $('battle').hidden) return;
      if (ev.key === ' ') { ev.preventDefault(); B.paused = !B.paused; updateHUD(); }
      if (ev.key === 'Escape') { closePanel(); B.targeting = false; B.selCard = null; renderTray(); updateHUD(); }
    });
  }
  function onTap(p) {
    // 神符优先
    if (B.rune && dist(p.x, p.y, B.rune.x, B.rune.y) < 32) { takeRune(); return; }
    if (B.targeting) {
      let best = null, bd = 1e9;
      for (const e of B.enemies) { if (e.dead) continue; const d = dist(p.x, p.y, e.x, e.y); if (d < e.d.r + 26 && d < bd) { bd = d; best = e; } }
      if (best) tryDominate(best); else { B.targeting = false; updateHUD(); }
      return;
    }
    const h = hitTest(p.x, p.y);
    if (h.tower) { openTowerPanel(h.tower); return; }
    if (h.pad != null) {
      if (B.selCard) { tryDeploy(B.selCard, h.pad); return; }
      openPadPanel(h.pad); return;
    }
    closePanel();
    if (B.selCard) { B.selCard = null; renderTray(); }
  }
  function tryDeploy(u, pad) {
    const def = HERO_BY_ID[u.hid];
    if (B.towers.some(t => t.unit === u)) return toast('该英雄已在场上');
    if (B.gold < def.cost) return toast(`金币不足（需要 ${def.cost}）`);
    placeTower(u, pad, false);
    B.selCard = null; closePanel(); renderTray(); updateHUD();
  }

  /* ---------- 浮动面板 ---------- */
  function placePanel(x, y) {
    const el = $('bPanel'), bfe = $('bf'), bf = { width: bfe.clientWidth, height: bfe.clientHeight };
    el.hidden = false;
    const px = x / W * bf.width, py = y / H * bf.height;
    const pw = el.offsetWidth, ph = el.offsetHeight;
    let left = px - pw / 2, top = py + 28;
    if (top + ph > bf.height - 4) top = py - ph - 44;
    left = Math.max(4, Math.min(bf.width - pw - 4, left)); top = Math.max(4, Math.min(bf.height - ph - 4, top));
    el.style.left = left + 'px'; el.style.top = top + 'px';
  }
  function closePanel() { if (B) B.panel = null; const el = $('bPanel'); el.hidden = true; el.innerHTML = ''; }
  function openPadPanel(pad) {
    B.panel = { pad };
    const avail = B.units.map((u, i) => ({ u, i })).filter(o => !B.towers.some(t => t.unit === o.u));
    const el = $('bPanel');
    if (!avail.length) { el.innerHTML = '<p class="bp-empty">阵容中的英雄都已上场</p>'; placePanel(...B.st.pads[pad]); return; }
    el.innerHTML = `<div class="bp-title">部署英雄</div><div class="bp-list">${avail.map(({ u, i }) => {
      const d = HERO_BY_ID[u.hid], ok = B.gold >= d.cost;
      return `<button class="bp-hero" data-act="deploy" data-i="${i}" ${ok ? '' : 'disabled'}>
        <img src="${iconURL(d, u.shiny)}" alt=""><span class="bp-n">${u.name || d.name}</span>
        <span class="atk-tag" style="--c:${ATK[d.atk].color}">${ATK[d.atk].name}</span><span class="bp-cost">${d.cost}</span></button>`;
    }).join('')}</div>`;
    placePanel(...B.st.pads[pad]);
  }
  function openTowerPanel(tw) {
    B.panel = { tower: tw };
    const s = towerStats(tw), d = tw.def, u = tw.unit;
    const up = tw.lv < 3 ? upgradeCost(d, tw.lv) : 0;
    const sell = Math.round(tw.invested * 0.6);
    const el = $('bPanel');
    el.innerHTML = `
      <div class="bp-head"><img src="${iconURL(d, u.shiny)}" alt="">
        <div><div class="bp-title">${u.name || d.name} <small>Lv${tw.lv}</small></div>
        <div class="bp-sub"><span class="atk-tag" style="--c:${ATK[d.atk].color}">${ATK[d.atk].name}</span> ${d.skill}${u.rented ? ' · 租借' : ''}</div></div></div>
      <div class="bp-stats"><span>伤害 <b>${s.dmg.toFixed(0)}</b></span><span>攻速 <b>${s.rate.toFixed(2)}</b></span><span>射程 <b>${s.range.toFixed(0)}</b></span></div>
      <p class="bp-desc">${d.lv[tw.lv - 1]}${d.air === false ? '' : ''}</p>
      <div class="bp-row">
        ${tw.lv < 3 ? `<button data-act="up" ${B.gold >= up ? '' : 'disabled'}>升至 Lv${tw.lv + 1}<b>${up}</b></button>` : '<button disabled>已满级</button>'}
        <button data-act="sell" class="ghost">撤下<b>+${sell}</b></button>
      </div>
      ${tw.item ? `<div class="bp-item">装备：${ITEMS[tw.item].name} · ${ITEMS[tw.item].desc}</div>` :
        `<div class="bp-title sm">装备（每名英雄 1 件）</div><div class="bp-row items">${ITEMS.slice(1).map(it =>
          `<button data-act="item" data-id="${it.id}" ${B.gold >= it.cost ? '' : 'disabled'} title="${it.desc}">${it.name}<b>${it.cost}</b><small>${it.desc}</small></button>`).join('')}</div>`}`;
    placePanel(tw.x, tw.y);
  }
  function onPanelClick(ev) {
    const b = ev.target.closest('button[data-act]'); if (!b || !B) return;
    const act = b.dataset.act;
    if (act === 'deploy') { tryDeploy(B.units[+b.dataset.i], B.panel.pad); return; }
    const tw = B.panel && B.panel.tower; if (!tw) return;
    if (act === 'up') {
      const c = upgradeCost(tw.def, tw.lv); if (B.gold < c) return;
      B.gold -= c; tw.invested += c; tw.lv++; Sfx.play('up');
      burst(tw.x, tw.y - 20, tw.def.col, 26, 120);
      B.fx.push({ k: 'ring', x: tw.x, y: tw.y, r0: 6, r1: 50, life: 0.5, max: 0.5, col: '#f2c766', w: 3 });
      openTowerPanel(tw);
    } else if (act === 'item') {
      const it = ITEMS[+b.dataset.id]; if (B.gold < it.cost) return;
      B.gold -= it.cost; tw.invested += it.cost; tw.item = it.id; Sfx.play('up'); openTowerPanel(tw);
    } else if (act === 'sell') {
      B.gold += Math.round(tw.invested * 0.6);
      B.towers = B.towers.filter(t => t !== tw);
      burst(tw.x, tw.y, '#999', 14, 80); closePanel(); renderTray();
    }
    updateHUD();
  }

  /* ---------- HUD ---------- */
  function renderTray() {
    if (!B) return;
    $('bTray').innerHTML = B.units.map((u, i) => {
      const d = HERO_BY_ID[u.hid], on = B.towers.some(t => t.unit === u);
      return `<button class="card ${on ? 'on' : ''} ${B.selCard === u ? 'sel' : ''}" data-unit="${i}" style="--c:${d.col}">
        <img src="${iconURL(d, u.shiny)}" alt=""><span class="c-n">${u.name || d.name}</span>
        <span class="c-m"><i style="background:${ATK[d.atk].color}"></i>${ATK[d.atk].name}</span>
        <span class="c-cost">${on ? '在场' : d.cost}</span>${u.rented ? '<span class="c-tag">租</span>' : ''}</button>`;
    }).join('');
  }
  let lastHud = '';
  function updateHUDLite() {
    const k = [B.gold, B.lives, B.wave, B.waveActive, Math.ceil(B.between || 0), B.domOwned, B.domBought, B.buffs.double > B.t, B.buffs.haste > B.t, B.targeting, !!B.channel].join('|');
    if (k !== lastHud) { lastHud = k; updateHUD(); }
  }
  function updateHUD() {
    if (!B) return;
    $('bLives').textContent = B.lives;
    $('bGold').textContent = B.gold;
    $('bWave').textContent = B.totalWaves === Infinity ? `${B.wave}` : `${B.wave}/${B.totalWaves}`;
    $('bSpeed').textContent = B.speed + '×';
    $('bPause').textContent = B.paused ? '继续' : '暂停';
    $('bDomUse').innerHTML = `支配头环 <b>×${B.domOwned}</b>`;
    $('bDomUse').classList.toggle('active', B.targeting);
    $('bDomUse').disabled = !B.domOwned && !B.targeting;
    $('bDomBuy').disabled = B.domBought >= DOM.limit || B.gold < DOM.cost;
    $('bDomBuy').innerHTML = B.domBought >= DOM.limit ? '已达上限' : `购买 <b>${DOM.cost}</b>`;
    $('bDomInfo').textContent = `本局已购 ${B.domBought}/${DOM.limit}`;
    const nb = $('bNext');
    if (B.waveActive) { nb.disabled = true; nb.textContent = `第 ${B.wave} 波进行中`; }
    else if (B.wave >= B.totalWaves) { nb.disabled = true; nb.textContent = '全部波次完成'; }
    else { nb.disabled = false; nb.textContent = B.wave === 0 ? '开始第 1 波' : `召唤第 ${B.wave + 1} 波 · ${Math.ceil(B.between || 0)}s`; }
    const bf = [];
    if (B.buffs.double > B.t) bf.push(`<span class="buff" style="--c:${RUNES.double.color}">狂暴</span>`);
    if (B.buffs.haste > B.t) bf.push(`<span class="buff" style="--c:${RUNES.haste.color}">急速</span>`);
    $('bBuffs').innerHTML = bf.join('');
    // 托盘可负担状态
    document.querySelectorAll('#bTray .card').forEach(el => {
      const u = B.units[+el.dataset.unit]; const d = HERO_BY_ID[u.hid];
      el.classList.toggle('poor', B.gold < d.cost && !B.towers.some(t => t.unit === u));
    });
  }
  let bannerT = 0;
  function banner(title, sub, dur) {
    const el = $('bBanner');
    el.innerHTML = `<b>${title}</b>${sub ? `<span>${sub}</span>` : ''}`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(bannerT); bannerT = setTimeout(() => el.classList.remove('show'), dur * 1000);
  }
  let toastT = 0;
  function toast(msg) {
    const el = $('bToast'); el.textContent = msg; el.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2400);
  }
  function tip(key, msg) { if (B.tips['t' + key]) return; B.tips['t' + key] = 1; const el = $('bTip'); el.textContent = msg; el.hidden = false; el.dataset.key = key; clearTimeout(el._t); el._t = setTimeout(() => { el.hidden = true; }, 7000); }
  function closeTip(key) { const el = $('bTip'); if (el.dataset.key === key) el.hidden = true; }

  // 供测试使用的只读视图
  return { start, stop, nextWave, get state() { return B; }, _test: { placeTower, buyDom, tryDominate, towerStats } };
})();
