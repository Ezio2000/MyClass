'use strict';
/* 局外界面：出征 / 英雄 / 召唤 / 图鉴 / 克制 / 社交 / 验证，以及战斗结算 */
const UI = (() => {
  const $ = id => document.getElementById(id);
  const S = () => Meta.S;
  let view = 'home', anim = 0, lastCfg = null, confirmKey = null;
  const icons = new Map();
  function icon(hid, shiny, size = 64) {
    const k = hid + ':' + (shiny ? 1 : 0) + ':' + size;
    if (!icons.has(k)) icons.set(k, Art.emblem(HERO_BY_ID[hid], size, shiny).toDataURL());
    return icons.get(k);
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pct = (v, d = 1) => (v * 100).toFixed(d) + '%';

  /* ---------- 公共 ---------- */
  let toastT = 0;
  function toast(msg) {
    const el = $('toast'); el.textContent = msg; el.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2600);
  }
  function header() {
    $('crystals').textContent = S().crystals;
    $('seasonChip').textContent = `${SEASON.id} ${SEASON.name} · ${SEASON.affix}`;
    const dots = { dex: S().newSinceDex > 0, social: !S().faction, heroes: S().heroes.some(h => Meta.evEarned(h) > Meta.evSpent(h)) };
    document.querySelectorAll('#nav button').forEach(b => {
      b.setAttribute('aria-current', b.dataset.view === view ? 'page' : 'false');
      b.querySelector('.dot')?.remove();
      if (dots[b.dataset.view]) b.insertAdjacentHTML('beforeend', '<span class="dot"></span>');
    });
  }
  function go(v) {
    view = v; cancelAnimationFrame(anim); confirmKey = null;
    if (v === 'dex') Meta.noteDexOpen();
    $('view').innerHTML = VIEWS[v]();
    header();
    AFTER[v] && AFTER[v]();
    window.scrollTo(0, 0);
  }
  function refresh() { const y = window.scrollY; $('view').innerHTML = VIEWS[view](); header(); AFTER[view] && AFTER[view](); window.scrollTo(0, y); }

  const heroChips = (d, u) => `
    <span class="rar" style="color:${RARITY[d.rar].color}">${d.rar}</span>
    <span class="muted small">${FACTIONS[d.faction].name} · ${d.cls}</span>
    <span class="atk-tag" style="--c:${ATK[d.atk].color}">${ATK[d.atk].name}</span>
    ${u && u.shiny ? '<span class="tag shiny">异化</span>' : ''}
    ${u && u.exclusive ? `<span class="tag excl">${SEASON.id} 赛季原初版</span>` : ''}
    ${u && u.rented ? `<span class="tag rent">租借自 ${esc(u.owner)}</span>` : ''}`;

  /* ---------- 出征 ---------- */
  function lineupHTML(removable) {
    const units = S().lineup.map(Meta.findUnit);
    let h = '';
    for (let i = 0; i < 6; i++) {
      const u = units[i];
      if (u) {
        const d = HERO_BY_ID[u.hid];
        h += `<button class="slot filled" data-act="${removable ? 'unslot' : 'hero'}" data-id="${u.uid}">
          <img src="${icon(u.hid, u.shiny)}" alt=""><span class="s-n">${esc(u.name || d.name)}</span>
          <span class="atk-tag" style="--c:${ATK[d.atk].color}">${ATK[d.atk].name}</span>${removable ? '<span class="s-x">移出</span>' : ''}</button>`;
      } else h += `<div class="slot">空位</div>`;
    }
    return `<div class="lineup">${h}</div>`;
  }
  const VIEWS = {};
  const AFTER = {};
  VIEWS.home = () => {
    const s = S();
    const stageCards = STAGES.map((st, i) => {
      const locked = i > 0 && !s.cleared['s' + (i - 1)];
      const stars = s.stars['s' + i] || 0;
      const first = i === 0 ? '首通点亮 鸣霄' : i === 1 ? '首通点亮 星烛' : '最终战 · 守墓者';
      return `<button class="mode ${locked ? 'locked' : ''}" data-act="play" data-stage="${i}" ${locked ? 'disabled' : ''}>
        <canvas data-thumb="${i}"></canvas>
        <div class="m-in"><span class="m-k">战役 ${String(i + 1).padStart(2, '0')} · ${st.waves.length} 波</span><h3>${st.name}</h3><p>${st.sub}</p>
        <div class="m-foot"><span class="stars">${'★'.repeat(stars)}<span class="off">${'★'.repeat(3 - stars)}</span></span>
        <span class="muted">${locked ? '通关上一关解锁' : s.cleared['s' + i] ? '已通关' : first}</span></div></div></button>`;
    }).join('');
    return `
    <section class="hero-band"><canvas id="hbCanvas"></canvas><div class="hb-in">
      <div class="hb-title">遗迹守卫战</div>
      <p class="hb-sub">裂隙在遗迹深处张开。每一座防御塔都是一位有名字的守卫：收集他们，把他们养成只属于你的样子，用攻防克制排兵布阵，再把阵容分享出去。</p>
      <div class="hb-layers"><span><b>①</b>收集 · 图鉴与支配</span><span><b>②</b>养成 · 资质 历练 专精</span><span><b>③</b>对战 · 克制矩阵</span><span><b>④</b>社交 · 租借 分享 阵营</span></div>
    </div></section>
    <section><div class="sec-h"><span class="eyebrow">Lineup</span><h2>出战阵容</h2><span class="aside">${s.lineup.length}/6 · <button class="btn sm" data-act="nav" data-v="heroes">编辑阵容</button></span></div>
      ${lineupHTML(false)}</section>
    <section><div class="sec-h"><span class="eyebrow">Campaign</span><h2>选择战场</h2><span class="aside">${SEASON.id} 环境：${SEASON.affix}</span></div>
      <div class="modes">${stageCards}
        <button class="mode" data-act="endless"><canvas data-thumb="e"></canvas><div class="m-in"><span class="m-k">无尽 · 沉没回廊</span><h3>无尽深渊</h3>
          <p>波次无限递增，每 5 波出现精英，第 20 波起守墓者降临。</p>
          <div class="m-foot"><span class="num">最佳 ${s.endlessBest} 波</span><span class="muted">${s.cleared.endless15 ? '已点亮 汐守' : '第 15 波点亮 汐守'}</span></div></div></button>
        <button class="mode" data-act="arena"><canvas data-thumb="a"></canvas><div class="m-in"><span class="m-k">分享码 · 标准练度</span><h3>模拟演武场</h3>
          <p>输入他人的阵容码，用系统标准练度复现同一关。看思路，不看数值。</p>
          <div class="m-foot"><span class="muted">不计奖励</span><span class="muted">输入阵容码</span></div></div></button>
        <button class="mode locked" disabled><canvas data-thumb="p"></canvas><div class="m-in"><span class="m-k">异步 PvP · M3</span><h3>巅峰对决</h3>
          <p>对手视角可见你冠名的英雄塔。租借英雄禁用于此模式。</p>
          <div class="m-foot"><span class="muted">封测 5000 人规模开放</span><span></span></div></div></button>
      </div></section>`;
  };
  AFTER.home = () => {
    document.querySelectorAll('canvas[data-thumb]').forEach(c => {
      const k = c.dataset.thumb, st = k === 'e' ? STAGES[ENDLESS_STAGE] : k === 'a' || k === 'p' ? STAGES[0] : STAGES[+k];
      const r = c.getBoundingClientRect(); c.width = r.width * 2; c.height = r.height * 2;
      const x = c.getContext('2d'), bg = Art.background(st);
      const scale = Math.max(c.width / bg.width, c.height / bg.height) * 1.5;
      const ox = k === 'e' ? 0.5 : k === 'a' ? 0.15 : k === 'p' ? 0.85 : 0.4;
      x.drawImage(bg, (c.width - bg.width * scale) * ox, (c.height - bg.height * scale) * 0.5, bg.width * scale, bg.height * scale);
      if (k === 'p') { x.fillStyle = 'rgba(40,10,30,0.55)'; x.fillRect(0, 0, c.width, c.height); }
      if (k === 'a') { x.fillStyle = 'rgba(76,199,173,0.18)'; x.fillRect(0, 0, c.width, c.height); }
      if (k === 'e') { x.fillStyle = 'rgba(20,20,60,0.35)'; x.fillRect(0, 0, c.width, c.height); }
    });
    heroBandAnim();
  };
  function heroBandAnim() {
    const c = $('hbCanvas'); if (!c) return;
    const r = c.getBoundingClientRect(); const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = r.width * dpr; c.height = r.height * dpr;
    const x = c.getContext('2d'), bg = Art.background(STAGES[2]);
    const units = S().lineup.map(Meta.findUnit).filter(Boolean);
    const embers = Array.from({ length: 40 }, () => ({ x: Math.random(), y: Math.random(), v: 0.02 + Math.random() * 0.05, s: 1 + Math.random() * 2 }));
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let t0 = performance.now();
    const frame = now => {
      if (!document.body.contains(c)) return;
      const t = (now - t0) / 1000;
      const sc = Math.max(c.width / bg.width, c.height / bg.height);
      x.drawImage(bg, (c.width - bg.width * sc) / 2, (c.height - bg.height * sc) / 2, bg.width * sc, bg.height * sc);
      // 英雄徽记悬浮于右侧
      const n = units.length, base = c.width * 0.62, gap = Math.min(c.width * 0.07, 90 * dpr);
      units.forEach((u, i) => {
        const img = Art.emblem(HERO_BY_ID[u.hid], 64, u.shiny), s = Math.min(70 * dpr, c.height * 0.3);
        const px = base + (i - (n - 1) / 2) * gap * 0.9 + c.width * 0.1, py = c.height * (i % 2 ? 0.58 : 0.42) + Math.sin(t * 1.4 + i) * 6 * dpr;
        if (px > c.width - s / 2) return;
        x.globalAlpha = 0.95; x.drawImage(img, px - s / 2, py - s / 2, s, s);
      });
      x.globalAlpha = 1;
      for (const e of embers) {
        if (!reduce) { e.y -= e.v * 0.016; if (e.y < -0.05) { e.y = 1.05; e.x = Math.random(); } }
        x.fillStyle = `rgba(242,199,102,${0.25 + (Math.sin(t * 3 + e.x * 20) + 1) * 0.25})`;
        x.fillRect(e.x * c.width, e.y * c.height, e.s * dpr, e.s * dpr);
      }
      if (!reduce) anim = requestAnimationFrame(frame);
    };
    anim = requestAnimationFrame(frame);
  }

  /* ---------- 英雄 ---------- */
  function hcard(u) {
    const d = HERO_BY_ID[u.hid], m = Meta.mastery(u), inL = S().lineup.includes(u.uid);
    const listed = !u.rented && Meta.isListedToday(u);
    const evAvail = !u.rented && Meta.evEarned(u) > Meta.evSpent(u);
    return `<button class="hcard ${inL ? 'in' : ''}" data-act="hero" data-id="${u.uid}">
      <span class="badges"><span class="grade ${Meta.ivGrade(u.iv)}" title="资质评级">${Meta.ivGrade(u.iv)}</span>
        <span>${u.shiny ? '<span class="tag shiny">异化</span>' : ''}${u.rented ? '<span class="tag rent">租</span>' : ''}${listed ? '<span class="tag list">上架</span>' : ''}</span></span>
      <img src="${icon(u.hid, u.shiny, 64)}" alt="">
      <span class="n">${esc(u.name || d.name)}</span>
      <span class="sub">${u.name ? d.name + ' · ' : ''}专精 ${m.lv}${evAvail ? ' · <b style="color:var(--ember)">可分配</b>' : ''}</span>
      <span class="atk-tag" style="--c:${ATK[d.atk].color}">${ATK[d.atk].name}</span></button>`;
  }
  VIEWS.heroes = () => {
    const s = S();
    const mine = [...s.heroes].sort((a, b) => (s.lineup.includes(b.uid) - s.lineup.includes(a.uid)) || ('SSR SR R'.indexOf(HERO_BY_ID[a.hid].rar) - 'SSR SR R'.indexOf(HERO_BY_ID[b.hid].rar)) || a.hid - b.hid);
    const rentals = s.rentals.filter(r => r.until > Date.now()).map(r => Meta.findUnit('rent:' + r.fid)).filter(Boolean);
    return `
    <section><div class="sec-h"><span class="eyebrow">Lineup</span><h2>出战阵容</h2><span class="aside">点击阵容中的英雄移出 · 同名英雄每局限一名</span></div>${lineupHTML(true)}</section>
    ${rentals.length ? `<section><div class="sec-h"><span class="eyebrow">Rented</span><h2>租借中</h2><span class="aside">限战役与无尽模式</span></div><div class="grid-cards">${rentals.map(hcard).join('')}</div></section>` : ''}
    <section><div class="sec-h"><span class="eyebrow">Roster</span><h2>我的英雄</h2><span class="aside">${mine.length} 名个体 · 资质评级 S/A/B/C</span></div>
      <div class="grid-cards">${mine.map(hcard).join('')}</div></section>`;
  };

  function openHero(id) {
    const u = Meta.findUnit(id); if (!u) return;
    const d = HERO_BY_ID[u.hid], ivb = Meta.ivBonus(u.iv), m = Meta.mastery(u), s = S();
    const earned = u.rented ? 0 : Meta.evEarned(u), spent = Meta.evSpent(u), avail = earned - spent;
    const inL = s.lineup.includes(u.uid);
    const listed = !u.rented && Meta.isListedToday(u);
    const ivRow = (lab, v, b, c) => `<div class="bar"><span>${lab}</span><span class="track"><span class="fill" style="width:${v / 15 * 100}%;--c:${c}"></span><span class="ticks"></span></span><span class="v">${v}/15 · +${pct(b, 2)}</span></div>`;
    const evRow = (key, lab, c, eff) => `<div class="evrow"><span>${lab}</span><span class="pips" style="--c:${c}">${Array.from({ length: EV_CAP_LINE }, (_, i) => `<i class="${i < u.ev[key] ? 'on' : ''}"></i>`).join('')}</span>
      <span class="muted num">${eff}</span>${u.rented ? '<span></span>' : `<button data-act="ev" data-line="${key}" data-id="${u.uid}" ${avail > 0 && u.ev[key] < EV_CAP_LINE ? '' : 'disabled'} aria-label="分配到${lab}">+</button>`}</div>`;
    const evIn = EV_IN_BATTLE;
    $('modal').innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(d.name)}">
      <div class="sheet-h" style="--glow:${Art.hexA(u.shiny ? d.shiny : d.col, 0.25)}"><img src="${icon(u.hid, u.shiny, 128)}" alt="">
        <div><h3>${esc(u.name || d.name)}</h3><div class="ep">${u.name ? `${d.name} · ` : ''}${d.ep} · 获得途径：${esc(u.src || (u.rented ? '好友租借' : ''))}</div><div class="chips">${heroChips(d, u)}</div></div>
        <button class="sheet-x" data-act="close" aria-label="关闭">✕</button></div>
      <div class="sheet-b">
        <div class="blk"><h4>资质 <small>个体随机生成 · 单项 0–5% · 三项总和封顶 6% · 评级 ${Meta.ivGrade(u.iv)}</small></h4>
          <div class="bars">${ivRow('攻击', u.iv[0], ivb.atk, '#ff8d6c')}${ivRow('防御', u.iv[1], ivb.def, '#7fb8ff')}${ivRow('灵巧', u.iv[2], ivb.agi, '#7fd88a')}</div>
          <p class="muted small" style="margin:8px 0 0">总加成 +${pct(ivb.total, 2)}：攻击提升伤害，防御降低被震慑时长，灵巧提升攻速。差异小于一件装备，只在顶层对局中显形。</p></div>
        <div class="blk"><h4>历练 <small>${u.rented ? '租借英雄不可分配' : `已获得 ${earned}/${EV_CAP_TOTAL} 点 · 可分配 ${avail} · 每参战 ${EV_WAVES_PER_POINT} 波获得 1 点`}</small></h4>
          <div class="bars">
            ${evRow('atk', '进攻', '#ff8d6c', `伤害 +${pct(u.ev.atk * EV_PER_POINT.atk * evIn, 0)}`)}
            ${evRow('sur', '生存', '#7fb8ff', `震慑 -${pct(u.ev.sur * EV_PER_POINT.sur * evIn, 0)}`)}
            ${evRow('fun', '功能', '#7fd88a', `技能 +${pct(u.ev.fun * EV_PER_POINT.fun * evIn, 0)}`)}
          </div>
          <p class="muted small" style="margin:8px 0 0">单线上限 ${EV_CAP_LINE} 点。局外成长进入对局时一律按 50% 生效（右侧为局内实际值）。</p>
          ${u.rented ? '' : `<div class="actions" style="margin-top:8px"><button class="btn sm" data-act="respec" data-id="${u.uid}" ${spent ? '' : 'disabled'}>免费洗点</button><span class="muted small" style="align-self:center">本周剩余 ${RESPEC_PER_WEEK - s.respec.used} 次</span></div>`}</div>
        <div class="blk"><h4>专精 Lv${m.lv} <small>${m.max ? '已满级' : `再参战 ${MASTERY_XP - m.xp} 波升级`} · 纯情感奖励，零数值</small></h4>
          <div class="mastery-track">${Array.from({ length: 10 }, (_, i) => `<i class="${i < m.lv ? 'on' : ''}"></i>`).join('')}</div>
          <div class="rewards">${MASTERY_REWARDS.map(([lv, n]) => `<span class="${m.lv >= lv ? 'on' : ''}">Lv${lv} ${n}</span>`).join('')}</div>
          ${u.rented ? '' : `<div class="field" style="margin-top:10px"><input id="renameInput" maxlength="8" placeholder="${m.lv >= 10 ? '为这位英雄起名（8 字以内）' : '专精 10 级解锁冠名'}" value="${esc(u.name)}" ${m.lv >= 10 ? '' : 'disabled'}>
            <button class="btn sm teal" data-act="rename" data-id="${u.uid}" ${m.lv >= 10 ? '' : 'disabled'}>冠名</button></div>
            <p class="muted small" style="margin:6px 0 0">冠名会显示在局内名牌与巅峰对决的对手视角中。</p>`}</div>
        <div class="blk"><h4>技能演化 · ${d.skill}</h4><div class="skills">${d.lv.map((t, i) => `<div><b>Lv${i + 1}</b><span>${t}</span></div>`).join('')}</div>
          <p class="muted small" style="margin:6px 0 0">基础：伤害 ${d.dmg} · 攻速 ${d.rate} · 射程 ${d.range} · 部署 ${d.cost} 金${d.air === false ? ' · 无法攻击飞行单位' : ''}</p></div>
        <div class="blk"><h4>背景</h4><p class="lore">${d.lore}</p><p class="muted small" style="margin:6px 0 0">「${d.line}」${m.lv >= 3 ? '— 部署时说出' : '— 专精 3 级解锁'}</p></div>
        <div class="actions" id="heroActions">
          <button class="btn ${inL ? '' : 'primary'}" data-act="lineup" data-id="${u.uid}">${inL ? '移出阵容' : '加入阵容'}</button>
          ${u.rented ? `<span class="muted small" style="align-self:center">到期：${new Date(u.until).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>` :
            `<button class="btn teal" data-act="list" data-id="${u.uid}">${listed ? '取消上架' : '上架租借（今日不可用）'}</button>
             <button class="btn danger" data-act="release" data-id="${u.uid}">放生</button>`}
        </div>
      </div></div>`;
    $('modal').hidden = false; $('modal').dataset.id = id;
  }
  function closeModal() { $('modal').hidden = true; $('modal').innerHTML = ''; }

  /* ---------- 召唤 ---------- */
  VIEWS.summon = () => {
    const row = rar => (rar === 'SSR' ? [7, 8] : rar === 'SR' ? [4, 5, 6] : [1, 2, 3]).map(h => `<img src="${icon(h, false, 32)}" alt="${HERO_BY_ID[h].name}" title="${HERO_BY_ID[h].name}">`).join('');
    return `
    <section class="summon">
      <div class="portal"><canvas id="portalCv"></canvas><div class="p-in">
        <span class="eyebrow" style="font:500 11px var(--font-mono);color:var(--verdigris);letter-spacing:.14em">RELIC SUMMON</span>
        <h3>遗迹召唤</h3><p class="muted" style="margin:0;max-width:40ch">每一次召唤都是一位独立的个体：资质随机生成，异化形态 1/512。点亮方式不止召唤，战役首通与无尽也能点亮指定英雄。</p>
        <div class="actions"><button class="btn primary" data-act="pull" data-n="1">召唤 1 次 · <b>${RECRUIT_COST}</b></button><button class="btn teal" data-act="pull" data-n="10">召唤 10 次 · <b>${RECRUIT_10}</b></button></div>
      </div></div>
      <div class="rates"><div class="sec-h" style="margin:0"><h2 style="font-size:16px">概率公示</h2></div>
        <div class="r-row"><span class="rar" style="color:${RARITY.SSR.color}">SSR 5%</span><span>${row('SSR')}</span></div>
        <div class="r-row"><span class="rar" style="color:${RARITY.SR.color}">SR 25%</span><span>${row('SR')}</span></div>
        <div class="r-row"><span class="rar" style="color:${RARITY.R.color}">R 70%</span><span>${row('R')}</span></div>
        <div class="r-row"><span>异化形态</span><span class="num">1 / 512</span></div>
        <p class="muted small" style="margin:4px 0 0">异化只改变外观与彩蛋，零数值差异。阵营专属英雄不进入本赛季卡池，赛季末（${SEASON.endDate}）解禁。</p>
      </div>
    </section>
    <section><div class="sec-h"><span class="eyebrow">Results</span><h2>召唤结果</h2></div><div class="pulls" id="pulls"><p class="muted">尚未召唤。</p></div></section>`;
  };
  AFTER.summon = () => {
    const c = $('portalCv'); if (!c) return;
    const r = c.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    c.width = r.width * dpr; c.height = r.height * dpr;
    const x = c.getContext('2d'); const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const glyphs = '守望遗迹裂隙星火潮汐雷霜岩影曦渊';
    const frame = now => {
      if (!document.body.contains(c)) return;
      const t = now / 1000, cx = c.width * 0.72, cy = c.height * 0.42, R = Math.min(c.width, c.height) * 0.36;
      x.fillStyle = '#0b100f'; x.fillRect(0, 0, c.width, c.height);
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, R * 1.4);
      g.addColorStop(0, 'rgba(76,199,173,0.45)'); g.addColorStop(0.5, 'rgba(76,199,173,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
      for (let ring = 0; ring < 3; ring++) {
        const rr = R * (0.5 + ring * 0.25), dir = ring % 2 ? -1 : 1;
        x.strokeStyle = `rgba(216,166,87,${0.5 - ring * 0.12})`; x.lineWidth = dpr;
        x.beginPath(); x.arc(cx, cy, rr, 0, Math.PI * 2); x.stroke();
        x.font = `700 ${11 * dpr}px 'Noto Serif SC', serif`; x.fillStyle = `rgba(242,220,160,${0.65 - ring * 0.15})`; x.textAlign = 'center';
        const n = 8 + ring * 4;
        for (let i = 0; i < n; i++) {
          const a = i / n * Math.PI * 2 + t * 0.25 * dir;
          x.save(); x.translate(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); x.rotate(a + Math.PI / 2);
          x.fillText(glyphs[(i + ring * 3) % glyphs.length], 0, 4 * dpr); x.restore();
        }
      }
      if (!reduce) anim = requestAnimationFrame(frame);
    };
    anim = requestAnimationFrame(frame);
  };
  function doPull(n) {
    const res = Meta.recruit(n);
    if (!res) return toast(`晶石不足（需要 ${n === 10 ? RECRUIT_10 : RECRUIT_COST}）`);
    Sfx.unlock(); Sfx.play('pull');
    header();
    const box = $('pulls');
    box.innerHTML = res.map(({ h, isNewSpecies }) => {
      const d = HERO_BY_ID[h.hid];
      return `<div class="pull ${h.shiny ? 'shiny' : ''}"><div class="pc"><div class="face back"></div>
        <div class="face front" style="--g:${Art.hexA(h.shiny ? d.shiny : d.col, 0.45)};--rc:${RARITY[d.rar].color}">
        <img src="${icon(h.hid, h.shiny, 128)}" alt=""><span class="rar" style="color:${RARITY[d.rar].color}">${d.rar}</span>
        <span class="n">${d.name}</span><span class="grade ${Meta.ivGrade(h.iv)}" style="margin:0 auto">${Meta.ivGrade(h.iv)}</span>
        ${isNewSpecies ? '<span class="new">图鉴新点亮</span>' : ''}${h.shiny ? '<span class="tag shiny">异化！</span>' : ''}</div></div></div>`;
    }).join('');
    [...box.children].forEach((el, i) => setTimeout(() => {
      el.classList.add('open');
      const h = res[i].h, d = HERO_BY_ID[h.hid];
      if (h.shiny) Sfx.play('shiny'); else if (d.rar !== 'R') Sfx.play('up'); else Sfx.play('coin');
    }, 250 + i * 220));
    if (res.some(r => r.h.shiny)) setTimeout(() => toast('异化英雄出现了！这是 1/512 的相遇'), 300 + res.length * 220);
  }

  /* ---------- 图鉴 ---------- */
  VIEWS.dex = () => {
    const s = S(), lit = HEROES.filter(h => s.seen[h.id]).length, sh = Object.keys(s.seenShiny).length;
    const rows = ['dawn', 'neutral', 'abyss'].map(f => {
      const cells = CLASSES.map(c => {
        const hs = HEROES.filter(h => h.faction === f && h.cls === c);
        if (!hs.length) return '<div class="dex-cell"><div class="dex-empty"></div></div>';
        return `<div class="dex-cell">${hs.map(h => {
          const on = s.seen[h.id];
          return `<button class="dtile ${on ? '' : 'dark'}" data-act="species" data-hid="${h.id}">
            <span class="sh ${s.seenShiny[h.id] ? 'on' : ''}" title="异化形态">✦</span>
            <img src="${icon(h.id, !!s.seenShiny[h.id] && on, 64)}" alt=""><span class="n">${on ? h.name : '？？？'}</span>
            <span class="s">${on ? h.ep : h.src}</span></button>`;
        }).join('')}</div>`;
      }).join('');
      return `<div class="rh" style="--c:${FACTIONS[f].color};color:${FACTIONS[f].color}">${FACTIONS[f].name}</div>${cells}`;
    }).join('');
    return `
    <section><div class="sec-h"><span class="eyebrow">Codex</span><h2>英雄图鉴</h2><span class="aside">阵营 × 职业编排 · ✦ 为异化形态</span></div>
      <div class="dex-prog"><span class="bigp num">${lit}<span class="muted" style="font-size:20px">/${HEROES.length}</span></span>
        <span class="track"><i style="width:${lit / HEROES.length * 100}%"></i></span><span class="muted">异化 ${sh} 种</span></div></section>
    <section class="dex-table"><div class="dex-grid"><div></div>${CLASSES.map(c => `<div class="ch">${c}</div>`).join('')}${rows}</div></section>`;
  };
  function openSpecies(hid) {
    const d = HERO_BY_ID[hid], s = S(), on = s.seen[hid];
    if (!on) return toast(`尚未点亮 · 获取途径：${d.src}`);
    const owned = s.heroes.filter(h => h.hid === hid);
    const vs = ARM_KEYS.map(a => `<div class="bar"><span>${ARM[a].name}</span><span class="track"><span class="fill" style="width:${matrix(d.atk, a) / 2 * 100}%;--c:${ATK[d.atk].color}"></span></span><span class="v">×${matrix(d.atk, a)}</span></div>`).join('');
    $('modal').innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${d.name}">
      <div class="sheet-h" style="--glow:${Art.hexA(d.col, 0.25)}"><img src="${icon(hid, !!s.seenShiny[hid], 128)}" alt="">
        <div><h3>${d.name}</h3><div class="ep">${d.ep} · ${d.skill}</div><div class="chips">${heroChips(d)}</div></div>
        <button class="sheet-x" data-act="close" aria-label="关闭">✕</button></div>
      <div class="sheet-b">
        <div class="blk"><h4>背景故事</h4><p class="lore">${d.lore}</p></div>
        <div class="blk"><h4>技能演化</h4><div class="skills">${d.lv.map((t, i) => `<div><b>Lv${i + 1}</b><span>${t}</span></div>`).join('')}</div></div>
        <div class="blk"><h4>${ATK[d.atk].name}攻击 · 对各护甲倍率 <small>${SEASON.id} 环境</small></h4><div class="bars">${vs}</div></div>
        <div class="blk"><h4>收藏</h4><p class="muted" style="margin:0">获取途径：${d.src} · 已拥有 ${owned.length} 名个体${s.seenShiny[hid] ? ' · 已点亮异化形态' : ' · 异化形态未点亮'}</p>
          <div class="rewards">${owned.map(h => `<span class="on">${esc(h.name || d.name)} · ${Meta.ivGrade(h.iv)}${h.shiny ? ' · 异化' : ''}</span>`).join('')}</div></div>
        <div class="blk" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><img src="${icon(hid, false, 128)}" alt="普通形态" style="width:72px"><img src="${icon(hid, true, 128)}" alt="异化形态" style="width:72px;${s.seenShiny[hid] ? '' : 'filter:brightness(0) opacity(.3)'}"><span class="muted small">普通形态 / 异化形态（原创配色变体 + 星芒，零数值差异）</span></div>
      </div></div>`;
    $('modal').hidden = false;
  }

  /* ---------- 克制 ---------- */
  function cellColor(v) {
    if (v >= 2) return 'rgba(232,101,63,.85)'; if (v >= 1.5) return 'rgba(232,140,63,.6)';
    if (v > 1) return 'rgba(216,166,87,.4)'; if (v === 1) return 'rgba(120,140,135,.22)';
    if (v >= 0.7) return 'rgba(80,120,170,.35)'; return 'rgba(60,90,160,.6)';
  }
  VIEWS.matrix = () => {
    const rows = ATK_KEYS.map(a => `<tr><th class="rowh"><span class="atk-tag" style="--c:${ATK[a].color}">${ATK[a].name}</span></th>${ARM_KEYS.map(r => {
      const v = matrix(a, r), base = BASE_MATRIX[a][r], mod = v !== base;
      return `<td class="${mod ? 'mod' : ''}" style="background:${cellColor(v)}">${v}${mod ? `<s>原 ${base}</s>` : ''}</td>`;
    }).join('')}</tr>`).join('');
    const beasts = Object.entries(ENEMIES).map(([k, e]) => {
      const best = ATK_KEYS.filter(a => !(e.fly && a === 'siege')).sort((a, b) => matrix(b, e.arm) - matrix(a, e.arm));
      const top = best.filter(a => matrix(a, e.arm) === matrix(best[0], e.arm));
      return `<div class="beast"><canvas data-beast="${k}" width="88" height="88"></canvas><div>
        <div class="bn">${e.name}<span class="arm-tag" style="--c:${ARM[e.arm].color}">${ARM[e.arm].name}</span>${e.fly ? '<span class="tag" style="color:#c9a6ff">飞行</span>' : ''}${e.elite ? '<span class="tag" style="color:#d892ff">精英 · 可支配</span>' : ''}${e.boss ? '<span class="tag" style="color:#ff8d8d">首领 · 免疫支配</span>' : ''}</div>
        <div class="bd">生命 ${e.hp} · 移速 ${e.spd}${e.skillTxt ? ' · ' + e.skillTxt : ''}${e.fly ? ' · 攻城无法命中' : ''}</div>
        <div class="bd">首选：${top.map(a => `<span class="atk-tag" style="--c:${ATK[a].color}">${ATK[a].name} ×${matrix(a, e.arm)}</span>`).join(' ')}</div></div></div>`;
    }).join('');
    return `
    <section class="season"><span class="muted small">${SEASON.id} 环境词缀 · 已于赛季开始前 2 周公告</span><b>${SEASON.name}：${SEASON.affix}</b>
      <span class="muted small">${SEASON.note}。调整幅度限定在 ±25%，旧阵容在普通难度下仍可通关。</span></section>
    <section class="mx-wrap">
      <div><div class="sec-h"><span class="eyebrow">Matrix</span><h2>攻击 × 护甲</h2></div>
        <div class="mx-scroll"><table class="mx"><thead><tr><th></th>${ARM_KEYS.map(r => `<th><span class="arm-tag" style="--c:${ARM[r].color}">${ARM[r].name}</span></th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
        <div class="notes" style="margin-top:12px">
          <p><b>易懂层</b>　魔法克重甲，穿刺克轻甲，普通克中甲，攻城砸重甲。</p>
          <p><b>难精层</b>　精英与首领身披英雄甲，对普通、穿刺、攻城都有减伤。中盘要预留魔法塔，或者用支配头环把精英变成自己人。</p>
          <p><b>赛季引擎</b>　每赛季轮换环境词缀，让最优解持续变化。本赛季魔法打重甲变弱，攻城塔的价值随之上升。</p>
        </div></div>
      <div><div class="sec-h"><span class="eyebrow">Bestiary</span><h2>敌人图谱</h2></div><div class="bestiary">${beasts}</div></div>
    </section>`;
  };
  AFTER.matrix = () => {
    document.querySelectorAll('canvas[data-beast]').forEach(c => {
      const x = c.getContext('2d'), k = c.dataset.beast, d = ENEMIES[k];
      const sc = Math.min(2, 30 / (d.r * 1.6));
      x.setTransform(sc * 2, 0, 0, sc * 2, 0, 0);
      const e = { type: k, x: 22 / sc, y: 24 / sc + (d.fly ? 6 : 0), seed: 1, dir: 1, hitFlash: 0, enraged: false };
      Art.enemy(x, e, 0.3);
    });
  };

  /* ---------- 社交 ---------- */
  const SAMPLE_CODE = () => Meta.encode(0, [{ hid: 4, pad: 5, item: 2 }, { hid: 2, pad: 1, item: 3 }, { hid: 3, pad: 3, item: 0 }, { hid: 7, pad: 6, item: 0 }]);
  VIEWS.social = () => {
    const s = S();
    const facHeroes = f => HEROES.filter(h => h.faction === f);
    const fac = s.faction ? `
      <div class="season" style="border-color:${FACTIONS[s.faction].color}"><span class="muted small">${SEASON.id} 赛季阵营</span>
        <b style="color:${FACTIONS[s.faction].color}">${FACTIONS[s.faction].name} · ${FACTIONS[s.faction].desc}</b>
        <span class="muted small">已获得 ${facHeroes(s.faction).map(h => h.name).join('、')}（赛季原初版，带专属名片框）。赛季末 ${SEASON.endDate} 双方专属英雄进入公共卡池，不锁死获取。</span></div>` : `
      <div class="fac-pick">${['dawn', 'abyss'].map(f => `<button class="fac" data-act="faction" data-f="${f}" style="--c:${FACTIONS[f].color};--g:${Art.hexA(FACTIONS[f].color, 0.18)}">
        <h3>${FACTIONS[f].name}</h3><span class="muted">${FACTIONS[f].desc}</span>
        <div class="fh">${facHeroes(f).map(h => `<div><img src="${icon(h.id, false, 64)}" alt=""><span><b>${h.name}</b><br><span class="muted">${h.ep} · ${ATK[h.atk].name}</span></span></div>`).join('')}</div>
        <span class="small" style="color:${FACTIONS[f].color}">选择 ${FACTIONS[f].name} · 本赛季不可更改</span></button>`).join('')}</div>`;
    const rentMap = Object.fromEntries(s.rentals.filter(r => r.until > Date.now()).map(r => [r.fid, r]));
    const friends = FRIENDS.map(f => {
      const d = HERO_BY_ID[f.hero.hid], r = rentMap[f.id];
      const left = r ? Math.max(0, Math.ceil((r.until - Date.now()) / 3600e3)) : 0;
      return `<div class="friend"><img src="${icon(f.hero.hid, f.hero.shiny, 64)}" alt="">
        <div><div class="who">好友 ${esc(f.name)} · Lv${f.lvl}</div>
          <div class="fn">${esc(f.hero.named || d.name)}${f.hero.named ? `<span class="muted small">${d.name}</span>` : ''}${f.hero.shiny ? '<span class="tag shiny">异化</span>' : ''}</div>
          <div class="fs"><span class="grade ${Meta.ivGrade(f.hero.iv)}" style="display:inline-grid;vertical-align:middle">${Meta.ivGrade(f.hero.iv)}</span> 资质 ${f.hero.iv.join('/')} · 专精 ${f.hero.mastery} · <span class="atk-tag" style="--c:${ATK[d.atk].color}">${ATK[d.atk].name}</span></div></div>
        <div class="fa"><span class="muted small">${r ? `租借中 · 剩余约 ${left} 小时` : `${RENT_HOURS} 小时使用权`}</span>
          ${r ? `<button class="btn sm" data-act="lineup" data-id="rent:${f.id}">${s.lineup.includes('rent:' + f.id) ? '已在阵容' : '加入阵容'}</button>` : `<button class="btn sm teal" data-act="rent" data-f="${f.id}">租借 · <b>${f.fee}</b></button>`}</div></div>`;
    }).join('');
    const listedH = s.listed && s.listedDay === Meta.today() ? Meta.findUnit(s.listed) : null;
    return `
    <section><div class="sec-h"><span class="eyebrow">Faction</span><h2>赛季阵营</h2><span class="aside">早体验 + 身份标识，不锁死获取</span></div>${fac}</section>
    <section><div class="sec-h"><span class="eyebrow">Rent</span><h2>英雄租借</h2><span class="aside">同时最多借入 ${RENT_MAX} 名 · 限战役与无尽 · 巅峰对决禁用 · 到期不影响进行中的对局</span></div>
      <div class="friends">${friends}</div>
      <p class="muted small" style="margin:8px 0 0">好友为 M3 社交环境上线前的模拟数据。</p></section>
    <section><div class="sec-h"><span class="eyebrow">Listing</span><h2>我的上架</h2><span class="aside">上架的英雄当天自己不可用</span></div>
      ${listedH ? `<div class="friend" style="max-width:420px"><img src="${icon(listedH.hid, listedH.shiny, 64)}" alt=""><div><div class="fn">${esc(Meta.displayName(listedH))}</div><div class="fs">今日已上架 · ${s.listIncomeDay === Meta.today() ? '今天已被好友租用' : '等待好友租用'}</div></div>
        <div class="fa"><span></span><button class="btn sm" data-act="list" data-id="${listedH.uid}">取消上架</button></div></div>`
        : `<p class="muted" style="margin:0">在「英雄」详情中选择「上架租借」。被好友租用时获得晶石租金。</p>`}</section>
    <section><div class="sec-h"><span class="eyebrow">Share code</span><h2>阵容码 · 模拟演武场</h2><span class="aside">英雄组合 + 出装 + 塔位，编码为 12 位</span></div>
      <div class="field"><input id="codeInput" class="code" placeholder="例如 ${SAMPLE_CODE()}" autocomplete="off" spellcheck="false">
        <button class="btn primary" data-act="arena-go">进入演武场</button><button class="btn sm" data-act="sample">填入示例</button></div>
      <div id="codeMsg"></div></section>`;
  };
  function previewCode() {
    const inp = $('codeInput'), msg = $('codeMsg'); if (!inp || !msg) return null;
    const v = inp.value.trim(); if (!v) { msg.innerHTML = ''; return null; }
    const r = Meta.decode(v);
    if (!r) { msg.innerHTML = '<p class="err">阵容码无效：请检查 12 位字符是否完整（大小写敏感）。</p>'; return null; }
    msg.innerHTML = `<p class="muted small" style="margin:8px 0 4px">关卡：${STAGES[r.stage].name} · ${r.slots.length} 名英雄 · 系统标准练度</p><div class="code-preview">${r.slots.map(s =>
      `<span><img src="${icon(s.hid, false, 32)}" alt="">${HERO_BY_ID[s.hid].name}${s.item ? ' · ' + ITEMS[s.item].name : ''}</span>`).join('')}</div>`;
    return r;
  }

  /* ---------- 验证 ---------- */
  VIEWS.lab = () => {
    const t = S().tele, s = S();
    const eligible = s.heroes.filter(h => Meta.mastery(h).lv >= 10), named = eligible.filter(h => h.name);
    const evT = t.evAlloc.atk + t.evAlloc.sur + t.evAlloc.fun;
    const M = [
      { n: '图鉴页打开率', v: t.newEvents ? t.dexOpensAfterNew / t.newEvents : null, d: t.newEvents, rule: '≥ 30%', ok: v => v >= 0.3, warn: v => v >= 0.2, why: '点亮新英雄后是否回到图鉴查看。低于阈值说明图鉴只是列表，不是收藏品。' },
      { n: '支配道具购买率', v: t.games ? t.gamesWithDom / t.games : null, d: t.games, rule: '15% – 60%', ok: v => v >= 0.15 && v <= 0.6, warn: v => v >= 0.1 && v <= 0.7, why: '过低说明机制没有吸引力，过高说明机制过强、挤压正常建塔。' },
      { n: '支配成功率', v: (t.domOk + t.domFail) ? t.domOk / (t.domOk + t.domFail) : null, d: t.domOk + t.domFail, rule: '观察项', ok: () => true, warn: () => true, why: '血线博弈的手感：成功率过高说明没有风险，过低说明失败惩罚劝退。' },
      { n: '单一攻击类型通关率', v: t.wins ? t.monoWins / t.wins : null, d: t.wins, rule: '≤ 40%', ok: v => v <= 0.4, warn: v => v <= 0.5, why: '出现「全穿刺通吃」一类阵容即说明克制矩阵失衡。' },
      { n: '历练进攻线占比', v: evT ? t.evAlloc.atk / evT : null, d: evT, rule: '< 100%', ok: v => v < 0.8, warn: v => v < 0.999, why: '所有点数都堆进攻线，说明生存线和功能线的数值设计失败。' },
      { n: '冠名使用率', v: eligible.length ? named.length / eligible.length : null, d: eligible.length, rule: '≥ 10%', ok: v => v >= 0.1, warn: v => v >= 0.05, why: '专精 10 级后是否愿意给英雄起名。低于阈值说明情感连接没有建立。' },
      { n: '租借使用率', v: t.games ? (t.gamesWithRent || 0) / t.games : null, d: t.games, rule: '≥ 5%', ok: v => v >= 0.05, warn: v => v >= 0.02, why: '过低说明好友系统没有价值；若付费玩家觉得「借的比养的强」则需回调。' },
      { n: '分享码生成 / 会话', v: t.sessions ? t.codes / t.sessions : null, d: t.sessions, rule: '≥ 2%', ok: v => v >= 0.02, warn: v => v >= 0.01, why: '偏低说明构筑多样性不足，玩家没有值得分享的阵容。' }
    ];
    const card = m => {
      const insufficient = m.v === null || m.d < 3;
      const st = insufficient ? ['样本不足', '#6b7c76'] : m.ok(m.v) ? ['达标', '#7fd88a'] : m.warn(m.v) ? ['预警', '#f2c766'] : ['失败信号', '#e8653f'];
      return `<div class="metric" style="--s:${st[1]}"><div class="mh"><span>${m.n}</span><span class="pill">${st[0]}</span></div>
        <div class="mv">${m.v === null ? '—' : pct(m.v)}</div><div class="mt">阈值 ${m.rule} · 样本 ${m.d}</div><div class="mt">${m.why}</div></div>`;
    };
    return `
    <section><div class="sec-h"><span class="eyebrow">Playtest</span><h2>机制验证面板</h2><span class="aside">本机埋点 · 阈值均为待验证的占位值</span></div>
      <p class="muted" style="margin:0 0 12px;max-width:70ch">每条机制的失败信号都在这里逐条对照，不接受「感觉还行」式结论。数据只保存在当前浏览器。</p>
      <div class="metrics">${M.map(card).join('')}</div></section>
    <section><div class="sec-h"><span class="eyebrow">Raw</span><h2>原始计数</h2></div>
      <div class="rw" style="justify-content:flex-start">
        <span>对局 ${t.games}</span><span>胜利 ${t.wins}</span><span>支配 成功 ${t.domOk} / 失败 ${t.domFail}</span><span>获得英雄 ${t.heroGains}</span><span>异化 ${t.shinies}</span><span>会话 ${t.sessions}</span><span>阵容码 ${t.codes}</span>
      </div></section>
    <section><div class="sec-h"><span class="eyebrow">Save</span><h2>存档</h2></div>
      ${confirmKey === 'reset' ? `<div class="confirm-inline"><span>清空所有英雄、进度与埋点数据，且无法撤销。</span><button class="btn sm" data-act="reset-no">保留存档</button><button class="btn sm danger" data-act="reset-yes">确认清空</button></div>`
        : '<button class="btn danger" data-act="reset">重置存档</button>'}</section>`;
  };

  /* ---------- 战斗 ---------- */
  function startBattle(cfg) {
    let units;
    if (cfg.mode === 'arena') units = cfg.slots.map(s => ({ hid: s.hid, iv: [8, 8, 8], ev: { atk: 0, sur: 0, fun: 0 }, shiny: false, name: '', std: true, uid: null }));
    else {
      units = Meta.lineupUnits().map(u => ({ ...u }));
      if (!units.length) { toast('先在「英雄」中配置出战阵容'); go('heroes'); return; }
    }
    lastCfg = cfg;
    closeModal();
    $('battle').hidden = false; document.body.style.overflow = 'hidden';
    cancelAnimationFrame(anim);
    Sfx.unlock();
    requestAnimationFrame(() => Battle.start({ mode: cfg.mode, stage: cfg.stage, units, preset: cfg.mode === 'arena' ? cfg.slots : null }, showResult));
  }
  function leaveBattle() {
    Battle.stop();
    $('battle').hidden = true; document.body.style.overflow = '';
    const inc = Meta.rentalIncome();
    go(view);
    if (inc) toast(`好友 ${inc.friend} 租用了你的 ${inc.name}，获得 ${inc.fee} 晶石`);
  }
  function showResult(res) {
    const usedRent = Battle.state && Battle.state.units.some(u => u.rented);
    if (res.mode !== 'arena' && usedRent) S().tele.gamesWithRent = (S().tele.gamesWithRent || 0) + 1;
    const out = Meta.settle(res);
    const st = STAGES[res.mode === 'endless' ? ENDLESS_STAGE : res.stage];
    const title = res.mode === 'endless' ? `止步第 ${res.wavesCleared + 1} 波` : res.win ? '守住了' : '防线失守';
    const totalDmg = Object.values(res.dmgBy).reduce((a, b) => a + b, 0) || 1;
    const glory = Battle.state ? Battle.state.towers.filter(t => t.mastery >= 7) : [];
    const el = $('bEnd');
    el.innerHTML = `<div class="card-end">
      <h2 class="${res.win || res.mode === 'endless' ? 'win' : 'lose'}">${title}</h2>
      ${res.mode === 'campaign' ? `<div class="bigstars">${'★'.repeat(res.stars)}<span class="off">${'★'.repeat(3 - res.stars)}</span></div>` : ''}
      <div class="rw"><span>${st.name}</span><span>清理 ${res.wavesCleared} 波</span><span>剩余生命 ${res.lives}</span><span>支配 ${res.domOk} 成 / ${res.domFail} 败</span>
        ${res.mode === 'arena' ? '<span>演武场不计奖励</span>' : `<span class="hl">晶石 +${out.crystals}</span>`}${out.newBest ? '<span class="hl">无尽新纪录</span>' : ''}</div>
      ${out.unlocks.map(({ h }) => { const d = HERO_BY_ID[h.hid]; return `<div class="unlock"><img src="${icon(h.hid, h.shiny, 128)}" alt=""><div><b>图鉴点亮：${d.name}</b><div class="muted small">${d.ep} · 资质 ${Meta.ivGrade(h.iv)}${h.shiny ? ' · 异化！' : ''} · 已加入英雄列表</div></div></div>`; }).join('')}
      ${glory.length ? `<div class="unlock" style="border-color:#f2c766"><div style="display:flex;gap:4px">${glory.map(t => `<img src="${icon(t.def.id, t.unit.shiny, 64)}" alt="" style="width:40px;height:40px;animation:prism 2s linear infinite;border-radius:50%">`).join('')}</div><div><b>荣耀谢幕</b><div class="muted small">专精 7 级英雄的结算演出</div></div></div>` : ''}
      ${out.mastery.length || out.ev.length ? `<div class="rw">${out.mastery.map(m => `<span class="hl">${esc(m.name)} 专精 Lv${m.lv}${m.reward ? ' · 解锁' + m.reward : ''}</span>`).join('')}${out.ev.map(e => `<span>${esc(e.name)} 历练 +${e.pts}</span>`).join('')}</div>` : ''}
      <div><div class="muted small" style="margin-bottom:6px">伤害构成（按攻击类型）</div><div class="dmgbars">${ATK_KEYS.map(a => `<div class="bar"><span>${ATK[a].name}</span><span class="track"><span class="fill" style="width:${res.dmgBy[a] / totalDmg * 100}%;--c:${ATK[a].color}"></span></span><span class="v">${pct(res.dmgBy[a] / totalDmg, 0)}</span></div>`).join('')}</div></div>
      <div class="share" id="shareBox"><button class="btn sm teal" data-end="code">生成阵容码</button><span class="muted small">把这套英雄组合、出装和塔位分享给朋友</span></div>
      <div class="actions" style="justify-content:center"><button class="btn" data-end="again">再战一次</button><button class="btn primary" data-end="home">返回大厅</button></div>
    </div>`;
    el.hidden = false;
    el.onclick = ev => {
      const b = ev.target.closest('[data-end]'); if (!b) return;
      if (b.dataset.end === 'home') leaveBattle();
      if (b.dataset.end === 'again') { el.hidden = true; startBattle(lastCfg); }
      if (b.dataset.end === 'code') {
        Meta.noteCode();
        $('shareBox').innerHTML = `<code>${res.code}</code><button class="btn sm" data-end="copy">复制</button>`;
      }
      if (b.dataset.end === 'copy') {
        const code = res.code;
        const done = () => toast('已复制阵容码');
        try { navigator.clipboard.writeText(code).then(done, () => { selectCode(); toast('请手动复制选中的阵容码'); }); } catch (e) { selectCode(); }
      }
    };
    header();
  }
  function selectCode() { const c = document.querySelector('#shareBox code'); if (!c) return; const r = document.createRange(); r.selectNodeContents(c); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }

  /* ---------- 事件 ---------- */
  function onClick(ev) {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act, id = b.dataset.id;
    Sfx.unlock();
    switch (a) {
      case 'nav': go(b.dataset.v); break;
      case 'play': startBattle({ mode: 'campaign', stage: +b.dataset.stage }); break;
      case 'endless': startBattle({ mode: 'endless', stage: ENDLESS_STAGE }); break;
      case 'arena': go('social'); setTimeout(() => { const i = $('codeInput'); if (i) { i.scrollIntoView({ block: 'center' }); i.focus(); } }, 50); break;
      case 'hero': openHero(id); break;
      case 'unslot': Meta.toggleLineup(id); refresh(); break;
      case 'close': closeModal(); break;
      case 'lineup': {
        const r = Meta.toggleLineup(id);
        if (r !== true) toast(r); else toast(S().lineup.includes(id) ? '已加入出战阵容' : '已移出阵容');
        if (!$('modal').hidden && $('modal').dataset.id === id) openHero(id);
        refresh(); break;
      }
      case 'ev': { const r = Meta.allocEV(id, b.dataset.line); if (r !== true) toast(r); openHero(id); refresh(); break; }
      case 'respec': { const r = Meta.respec(id); toast(r === true ? '历练点已重置' : r); openHero(id); refresh(); break; }
      case 'rename': { const v = $('renameInput').value; const r = Meta.rename(id, v); toast(r === true ? (v.trim() ? `冠名为「${v.trim().slice(0, 8)}」` : '已恢复原名') : r); openHero(id); refresh(); break; }
      case 'list': { const r = Meta.listHero(id); toast(r === 'unlisted' ? '已取消上架' : '已上架：今天该英雄不可出战'); if (!$('modal').hidden) openHero(id); refresh(); break; }
      case 'release': {
        const box = $('heroActions');
        box.innerHTML = `<div class="confirm-inline"><span>放生后该个体的资质、历练与专精都会消失。</span><button class="btn sm" data-act="hero" data-id="${id}">保留</button><button class="btn sm danger" data-act="release-yes" data-id="${id}">确认放生</button></div>`;
        break;
      }
      case 'release-yes': { const v = Meta.release(id); closeModal(); toast(`已放生，获得 ${v} 晶石`); refresh(); break; }
      case 'pull': doPull(+b.dataset.n); break;
      case 'species': openSpecies(+b.dataset.hid); break;
      case 'faction': {
        const got = Meta.chooseFaction(b.dataset.f);
        if (typeof got === 'string') toast(got);
        else { Sfx.play('domOk'); toast(`加入${FACTIONS[b.dataset.f].name}：获得 ${got.map(g => HERO_BY_ID[g.h.hid].name).join('、')}`); }
        refresh(); break;
      }
      case 'rent': { const r = Meta.rent(b.dataset.f); toast(r === true ? '租借成功：可在阵容中使用 24 小时' : r); refresh(); break; }
      case 'sample': { $('codeInput').value = SAMPLE_CODE(); previewCode(); break; }
      case 'arena-go': {
        const r = previewCode();
        if (!r) { if (!$('codeInput').value.trim()) toast('请输入阵容码'); break; }
        startBattle({ mode: 'arena', stage: r.stage, slots: r.slots }); break;
      }
      case 'reset': confirmKey = 'reset'; refresh(); break;
      case 'reset-no': confirmKey = null; refresh(); break;
      case 'reset-yes': confirmKey = null; Meta.reset(); toast('存档已重置'); go('home'); break;
    }
  }

  function init() {
    Meta.load();
    // 兼容旧存档字段
    S().tele.newEvents = S().tele.newEvents || 0;
    document.addEventListener('click', ev => {
      if (!$('battle').hidden) return;
      const nb = ev.target.closest('#nav button'); if (nb) { go(nb.dataset.view); return; }
      if (ev.target === $('modal')) { closeModal(); return; }
      onClick(ev);
    });
    document.addEventListener('input', ev => { if (ev.target.id === 'codeInput') previewCode(); });
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !$('modal').hidden) closeModal(); });
    const go0 = () => {
      go('home');
      const inc = Meta.rentalIncome();
      if (inc) toast(`好友 ${inc.friend} 租用了你的 ${inc.name}，获得 ${inc.fee} 晶石`);
    };
    // 徽记字形绘制在 Canvas 上，先确保衬线字体的相应字形已加载
    const glyphs = HEROES.map(h => h.name[0]).join('') + '暂停遗';
    const fontLoad = document.fonts ? Promise.all([
      document.fonts.load("900 40px 'Noto Serif SC'", glyphs),
      document.fonts.load("700 12px 'Noto Sans SC'", '支配剩波克制抵抗斩杀震慑')
    ]).catch(() => {}) : Promise.resolve();
    Promise.race([fontLoad, new Promise(r => setTimeout(r, 2500))]).then(go0);
    window.addEventListener('resize', () => { if ($('battle').hidden && (view === 'home' || view === 'summon')) { cancelAnimationFrame(anim); AFTER[view](); } });
  }

  return { init, toast, go };
})();
UI.init();
