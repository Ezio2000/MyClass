'use strict';
/* 局外系统：存档、图鉴、资质/历练/专精、召唤、租借、阵营、阵容码、验证埋点 */
const Meta = (() => {
  const KEY = 'relic-guard-save-v1';
  let S = null;

  const rnd = n => Math.floor(Math.random() * n);
  const uid = () => Date.now().toString(36) + rnd(1e6).toString(36);
  const today = () => new Date().toISOString().slice(0, 10);
  const weekKey = () => { const d = new Date(); const j = new Date(d.getFullYear(), 0, 1); return d.getFullYear() + '-' + Math.ceil(((d - j) / 864e5 + j.getDay() + 1) / 7); };

  function freshSave() {
    const s = {
      v: 1, crystals: 300, heroes: [], lineup: [], seen: {}, seenShiny: {}, newSinceDex: 0,
      stars: {}, cleared: {}, endlessBest: 0, faction: null, rentals: [],
      listed: null, listedDay: null, listIncomeDay: null,
      respec: { week: weekKey(), used: 0 }, toasts: [],
      tele: { games: 0, gamesWithDom: 0, domBought: 0, domOk: 0, domFail: 0, wins: 0, monoWins: 0,
              heroGains: 0, newEvents: 0, gamesWithRent: 0, dexOpensAfterNew: 0, codes: 0, sessions: 0, evAlloc: { atk: 0, sur: 0, fun: 0 }, shinies: 0 }
    };
    for (const hid of [1, 2, 3]) { const h = makeInstance(hid, '初始英雄'); s.heroes.push(h); s.seen[hid] = true; s.lineup.push(h.uid); }
    return s;
  }

  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) S = JSON.parse(raw); } catch (e) { S = null; }
    if (!S || S.v !== 1) S = freshSave();
    S.tele.sessions++;
    if (S.respec.week !== weekKey()) S.respec = { week: weekKey(), used: 0 };
    S.rentals = S.rentals.filter(r => r.until > Date.now());
    S.lineup = S.lineup.filter(id => findUnit(id));
    save();
    return S;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 无痕模式等情况下仅本局有效 */ } }
  function reset() { S = freshSave(); S.tele.sessions = 1; save(); }

  /* ---------- 个体（资质 IV）---------- */
  function makeInstance(hid, src, opt = {}) {
    const shiny = opt.shiny ?? (Math.random() < SHINY_RATE);
    return { uid: uid(), hid, iv: opt.iv || [rnd(16), rnd(16), rnd(16)], shiny, waves: 0,
             ev: { atk: 0, sur: 0, fun: 0 }, name: '', src, at: Date.now(), exclusive: !!opt.exclusive };
  }
  // 单项资质 0–15 → 0–5%，三项总和封顶 6% [PH]
  function ivBonus(iv) {
    const raw = iv.map(v => v / 15 * 0.05);
    const sum = raw[0] + raw[1] + raw[2];
    const k = sum > 0.06 ? 0.06 / sum : 1;
    return { atk: raw[0] * k, def: raw[1] * k, agi: raw[2] * k, total: sum * k };
  }
  function ivGrade(iv) {
    const t = iv[0] + iv[1] + iv[2];
    return t >= 40 ? 'S' : t >= 30 ? 'A' : t >= 20 ? 'B' : 'C';
  }
  function mastery(h) { const lv = Math.min(10, Math.floor(h.waves / MASTERY_XP) + 1); return { lv, xp: h.waves % MASTERY_XP, max: lv >= 10 }; }
  function evEarned(h) { return Math.min(EV_CAP_TOTAL, Math.floor(h.waves / EV_WAVES_PER_POINT)); }
  function evSpent(h) { return h.ev.atk + h.ev.sur + h.ev.fun; }
  function displayName(h) { const d = HERO_BY_ID[h.hid]; return h.name || d.name; }

  /* ---------- 查找：自有个体 / 租借个体 ---------- */
  function findUnit(id) {
    if (!id) return null;
    if (id.startsWith('rent:')) {
      const r = S.rentals.find(x => 'rent:' + x.fid === id && x.until > Date.now());
      if (!r) return null;
      const f = FRIENDS.find(x => x.id === r.fid);
      return { uid: id, hid: f.hero.hid, iv: f.hero.iv, shiny: f.hero.shiny, name: f.hero.named,
               ev: f.hero.ev, waves: (f.hero.mastery - 1) * MASTERY_XP, rented: true, owner: f.name, until: r.until };
    }
    return S.heroes.find(h => h.uid === id) || null;
  }
  function isListedToday(h) { return S.listed === h.uid && S.listedDay === today(); }

  /* ---------- 获得英雄 ---------- */
  function grant(hid, src, opt) {
    const h = makeInstance(hid, src, opt);
    S.heroes.push(h);
    const isNewSpecies = !S.seen[hid];
    S.seen[hid] = true;
    if (h.shiny) { S.seenShiny[hid] = true; S.tele.shinies++; }
    S.tele.heroGains++;
    if (isNewSpecies || h.shiny) { S.newSinceDex++; S.tele.newEvents = (S.tele.newEvents || 0) + 1; }
    return { h, isNewSpecies };
  }

  /* ---------- 召唤 ---------- */
  const POOL = { R: [1, 2, 3], SR: [4, 5, 6], SSR: [7, 8] };
  function rollOne() {
    const r = Math.random();
    const rar = r < 0.05 ? 'SSR' : r < 0.30 ? 'SR' : 'R'; // [PH]
    const list = POOL[rar];
    return list[rnd(list.length)];
  }
  function recruit(n) {
    const cost = n === 10 ? RECRUIT_10 : RECRUIT_COST * n;
    if (S.crystals < cost) return null;
    S.crystals -= cost;
    const out = [];
    for (let i = 0; i < n; i++) out.push(grant(rollOne(), '召唤'));
    save();
    return out;
  }
  function release(id) {
    const i = S.heroes.findIndex(h => h.uid === id);
    if (i < 0) return 0;
    const h = S.heroes[i];
    const val = RARITY[HERO_BY_ID[h.hid].rar].release * (h.shiny ? 5 : 1);
    S.heroes.splice(i, 1);
    S.lineup = S.lineup.filter(x => x !== id);
    if (S.listed === id) S.listed = null;
    S.crystals += val; save();
    return val;
  }

  /* ---------- 阵容 ---------- */
  function toggleLineup(id) {
    const i = S.lineup.indexOf(id);
    if (i >= 0) { S.lineup.splice(i, 1); save(); return true; }
    const u = findUnit(id); if (!u) return false;
    if (S.lineup.length >= 6) return '阵容已满（最多 6 名）';
    if (S.lineup.some(x => { const o = findUnit(x); return o && o.hid === u.hid; })) return '同名英雄每局只能上阵一名';
    if (!u.rented && isListedToday(u)) return '该英雄今日已上架租借，暂不可用';
    S.lineup.push(id); save(); return true;
  }
  function lineupUnits() { return S.lineup.map(findUnit).filter(Boolean).filter(u => u.rented || !isListedToday(u)); }

  /* ---------- 历练 EV ---------- */
  function allocEV(id, line) {
    const h = S.heroes.find(x => x.uid === id); if (!h) return '找不到英雄';
    if (evSpent(h) >= evEarned(h)) return '没有可分配的历练点';
    if (h.ev[line] >= EV_CAP_LINE) return '该成长线已达上限';
    h.ev[line]++; S.tele.evAlloc[line]++; save(); return true;
  }
  function respec(id) {
    const h = S.heroes.find(x => x.uid === id); if (!h) return '找不到英雄';
    if (S.respec.week !== weekKey()) S.respec = { week: weekKey(), used: 0 };
    if (S.respec.used >= RESPEC_PER_WEEK) return '本周洗点次数已用完';
    if (evSpent(h) === 0) return '尚未分配历练点';
    for (const k of ['atk', 'sur', 'fun']) S.tele.evAlloc[k] = Math.max(0, S.tele.evAlloc[k] - h.ev[k]);
    h.ev = { atk: 0, sur: 0, fun: 0 }; S.respec.used++; save(); return true;
  }

  function rename(id, name) {
    const h = S.heroes.find(x => x.uid === id); if (!h) return '找不到英雄';
    if (mastery(h).lv < 10) return '专精 10 级解锁冠名';
    name = (name || '').trim().slice(0, 8);
    h.name = name; save(); return true;
  }

  /* ---------- 阵营（赛季专属）---------- */
  function chooseFaction(f) {
    if (S.faction) return '本赛季已选择阵营';
    S.faction = f;
    const ids = HEROES.filter(h => h.faction === f).map(h => h.id);
    const got = ids.map(hid => grant(hid, SEASON.id + ' 赛季原初版', { exclusive: true }));
    save(); return got;
  }

  /* ---------- 租借 ---------- */
  function rent(fid) {
    const f = FRIENDS.find(x => x.id === fid);
    S.rentals = S.rentals.filter(r => r.until > Date.now());
    if (S.rentals.some(r => r.fid === fid)) return '已在租借中';
    if (S.rentals.length >= RENT_MAX) return `同时最多借入 ${RENT_MAX} 名`;
    if (S.crystals < f.fee) return '晶石不足';
    S.crystals -= f.fee;
    S.rentals.push({ fid, until: Date.now() + RENT_HOURS * 3600e3 });
    if (!S.seen[f.hero.hid]) { /* 租借不点亮图鉴 */ }
    save(); return true;
  }
  function listHero(id) {
    if (S.listed === id && S.listedDay === today()) { S.listed = null; save(); return 'unlisted'; }
    S.listed = id; S.listedDay = today();
    S.lineup = S.lineup.filter(x => x !== id);
    save(); return true;
  }
  // 模拟：上架后，每日首次回到大厅有概率被好友租用
  function rentalIncome() {
    if (!S.listed || S.listedDay !== today() || S.listIncomeDay === today()) return null;
    const h = findUnit(S.listed); if (!h) return null;
    if (Math.random() < 0.55) {
      S.listIncomeDay = today();
      const f = FRIENDS[rnd(FRIENDS.length)];
      const fee = 30 + (h.shiny ? 30 : 0) + (mastery(h).lv >= 10 ? 20 : 0);
      S.crystals += fee; save();
      return { friend: f.name, name: displayName(h), fee };
    }
    return null;
  }

  /* ---------- 阵容分享码 ----------
   * 6 个槽位 ×（英雄 4bit + 石台 4bit + 装备 2bit）= 60bit
   * + 关卡 2bit + 校验 10bit = 72bit → 12 位字符 */
  const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_+=*~'; // 64
  function encode(stageIdx, slots) {
    let bits = '';
    const put = (v, n) => { bits += v.toString(2).padStart(n, '0'); };
    put(stageIdx & 3, 2);
    for (let i = 0; i < 6; i++) { const s = slots[i]; put(s ? s.hid : 0, 4); put(s ? s.pad : 0, 4); put(s ? s.item : 0, 2); }
    let sum = 0; for (let i = 0; i < bits.length; i++) sum = (sum * 31 + (bits[i] === '1' ? 7 : 3)) % 1021;
    put(sum, 10);
    let out = '';
    for (let i = 0; i < 72; i += 6) out += ALPH[parseInt(bits.slice(i, i + 6), 2)];
    return out.slice(0, 4) + '-' + out.slice(4, 8) + '-' + out.slice(8, 12);
  }
  function decode(code) {
    const c = (code || '').replace(/[\s\-]/g, '');
    if (c.length !== 12) return null;
    let bits = '';
    for (const ch of c) { const v = ALPH.indexOf(ch); if (v < 0) return null; bits += v.toString(2).padStart(6, '0'); }
    let sum = 0; const body = bits.slice(0, 62);
    for (let i = 0; i < body.length; i++) sum = (sum * 31 + (body[i] === '1' ? 7 : 3)) % 1021;
    if (parseInt(bits.slice(62), 2) !== sum) return null;
    let p = 0; const get = n => { const v = parseInt(bits.slice(p, p + n), 2); p += n; return v; };
    const stage = get(2); const slots = [];
    for (let i = 0; i < 6; i++) { const hid = get(4), pad = get(4), item = get(2); if (hid && HERO_BY_ID[hid]) slots.push({ hid, pad, item }); }
    if (stage >= STAGES.length || !slots.length) return null;
    if (slots.some(s => s.pad >= STAGES[stage].pads.length)) return null;
    return { stage, slots };
  }

  /* ---------- 结算 ---------- */
  function settle(res) {
    // res: {mode, stage, win, wavesCleared, stars, deployWaves:{uid:n}, domBought, domOk, domFail, monoType}
    const t = S.tele;
    const out = { crystals: 0, unlocks: [], mastery: [], ev: [] };
    if (res.mode !== 'arena') {
      t.games++; if (res.domBought) t.gamesWithDom++;
      t.domBought += res.domBought; t.domOk += res.domOk; t.domFail += res.domFail;
      if (res.win) { t.wins++; if (res.monoType) t.monoWins++; }
      for (const [id, n] of Object.entries(res.deployWaves)) {
        const h = S.heroes.find(x => x.uid === id); if (!h || !n) continue;
        const m0 = mastery(h).lv, e0 = evEarned(h);
        h.waves += n;
        const m1 = mastery(h).lv, e1 = evEarned(h);
        if (m1 > m0) out.mastery.push({ name: displayName(h), lv: m1, reward: (MASTERY_REWARDS.find(r => r[0] === m1) || [])[1] });
        if (e1 > e0) out.ev.push({ name: displayName(h), pts: e1 - e0 });
      }
    }
    if (res.mode === 'campaign') {
      const key = 's' + res.stage;
      if (res.win) {
        out.crystals += 40 + res.stars * 20;
        if (!S.cleared[key]) {
          S.cleared[key] = true; out.crystals += 150;
          const unlockHid = res.stage === 0 ? 4 : res.stage === 1 ? 5 : null;
          if (unlockHid) { const g = grant(unlockHid, '战役首通'); out.unlocks.push(g); }
        }
        S.stars[key] = Math.max(S.stars[key] || 0, res.stars);
      } else out.crystals += res.wavesCleared * 4;
    } else if (res.mode === 'endless') {
      out.crystals += res.wavesCleared * 6;
      if (res.wavesCleared >= 15 && !S.cleared.endless15) {
        S.cleared.endless15 = true; out.unlocks.push(grant(8, '无尽第 15 波'));
      }
      out.newBest = res.wavesCleared > S.endlessBest;
      S.endlessBest = Math.max(S.endlessBest, res.wavesCleared);
    }
    S.crystals += out.crystals;
    save();
    return out;
  }

  function noteDexOpen() { if (S.newSinceDex > 0) { S.tele.dexOpensAfterNew += S.newSinceDex; S.newSinceDex = 0; save(); } }
  function noteCode() { S.tele.codes++; save(); }

  return { load, save, reset, get S() { return S; }, ivBonus, ivGrade, mastery, evEarned, evSpent, displayName,
           findUnit, isListedToday, recruit, release, toggleLineup, lineupUnits, allocEV, respec, rename,
           chooseFaction, rent, listHero, rentalIncome, encode, decode, settle, noteDexOpen, noteCode, grant, today };
})();
