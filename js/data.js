'use strict';
/* 遗迹守卫战 · 静态数据
 * 所有标注 [PH] 的数值对应设计文档中的 [PLACEHOLDER]，待 M1 原型验证后调整。 */

const W = 960, H = 600; // 战场逻辑尺寸

const ATK = {
  normal: { name: '普通', color: '#ece4cf' },
  pierce: { name: '穿刺', color: '#93e36c' },
  magic:  { name: '魔法', color: '#72c2ff' },
  siege:  { name: '攻城', color: '#ffa24c' }
};
const ARM = {
  light:  { name: '轻甲',   color: '#a9d98c' },
  medium: { name: '中甲',   color: '#e0c98a' },
  heavy:  { name: '重甲',   color: '#a3b8cf' },
  hero:   { name: '英雄甲', color: '#d892ff' }
};
const ATK_KEYS = ['normal', 'pierce', 'magic', 'siege'];
const ARM_KEYS = ['light', 'medium', 'heavy', 'hero'];

// 攻击类型 × 护甲类型（初版参考经典 RTS 攻防表）[PH]
const BASE_MATRIX = {
  normal: { light: 1.0, medium: 1.5,  heavy: 1.0, hero: 0.7 },
  pierce: { light: 2.0, medium: 1.0,  heavy: 0.5, hero: 0.7 },
  magic:  { light: 1.0, medium: 0.75, heavy: 2.0, hero: 1.0 },
  siege:  { light: 1.0, medium: 1.0,  heavy: 1.5, hero: 0.5 }
};

// 赛季环境词缀：调整幅度限定 ±25% [PH]
const SEASON = {
  id: 'S2', name: '铁幕之季',
  affix: '重甲单位魔抗 +25%',
  note: '魔法 → 重甲：2.0 调整为 1.5，提前 2 周公告',
  mods: { 'magic|heavy': 0.75 },
  newUnit: '岩躯傀儡数量上调',
  endDate: '2026-12-31'
};
function matrix(a, r) { return +(BASE_MATRIX[a][r] * (SEASON.mods[a + '|' + r] || 1)).toFixed(2); }

const FACTIONS = {
  dawn:    { name: '曦光', color: '#f2c766', desc: '守护遗迹昼侧的圣火教团' },
  abyss:   { name: '暗渊', color: '#b273ff', desc: '从裂隙深处归来的叛逃者' },
  neutral: { name: '中立', color: '#86c3b4', desc: '遗迹各地的流浪守卫' }
};
const CLASSES = ['战士', '射手', '法师', '工匠', '辅助'];
const RARITY = {
  R:   { color: '#8fb6c2', release: 20 },
  SR:  { color: '#c494ff', release: 40 },
  SSR: { color: '#f2c766', release: 80 }
};

/* 英雄定义
 * kind：攻击行为；p：随等级(1-3)变化的技能参数 */
const HEROES = [
  { id: 1, name: '澜锋', ep: '剑舞者', faction: 'neutral', cls: '战士', rar: 'R', atk: 'normal',
    cost: 70, dmg: 16, rate: 1.1, range: 112, kind: 'crit', p: { chance: [0.2, 0.25, 0.3], mul: [2, 2.2, 2.5] },
    col: '#e2b45c', shiny: '#7fe3ff', skill: '回澜剑势',
    lv: ['20% 概率造成 2 倍暴击', '25% 概率造成 2.2 倍暴击', '30% 概率造成 2.5 倍暴击'],
    lore: '外环哨所最后一名剑卫。她把潮声练成剑步，出剑之前总会先听一听风。',
    line: '刀锋记得每一阵风。', src: '初始英雄' },
  { id: 2, name: '霜翎', ep: '冰原射手', faction: 'neutral', cls: '射手', rar: 'R', atk: 'pierce',
    cost: 80, dmg: 11, rate: 1.6, range: 150, kind: 'slow', p: { slow: [0.25, 0.3, 0.38], dur: [1.5, 1.7, 2] },
    col: '#82d3ff', shiny: '#ffd27f', skill: '凛冬箭羽',
    lv: ['命中减速 25%，持续 1.5 秒', '命中减速 30%，持续 1.7 秒', '命中减速 38%，持续 2 秒'],
    lore: '雪原部族的猎手，箭羽取自冰鸮。她射出的每一箭都会在空中留下一道霜痕。',
    line: '慢下来，看清你的终点。', src: '初始英雄' },
  { id: 3, name: '磐槌', ep: '岩匠', faction: 'neutral', cls: '工匠', rar: 'R', atk: 'siege',
    cost: 100, dmg: 30, rate: 0.55, range: 140, kind: 'splash', air: false, p: { radius: [55, 62, 72] },
    col: '#c58e5e', shiny: '#9de37c', skill: '崩岩投掷',
    lv: ['范围溅射 55，无法攻击飞行单位', '溅射半径 62', '溅射半径 72'],
    lore: '修补遗迹石墙的老匠人。他说每块石头都有脾气，扔出去之前要先跟它商量好。',
    line: '石头不会说谎。', src: '初始英雄' },
  { id: 4, name: '鸣霄', ep: '雷法师', faction: 'neutral', cls: '法师', rar: 'SR', atk: 'magic',
    cost: 110, dmg: 20, rate: 0.8, range: 135, kind: 'chain', p: { jumps: [3, 4, 5] },
    col: '#7590ff', shiny: '#ff82d4', skill: '连锁雷鸣',
    lv: ['闪电弹射 3 个目标，每跳伤害 ×0.78', '弹射 4 个目标', '弹射 5 个目标'],
    lore: '在遗迹顶端观测雷暴的学徒，某夜被落雷选中。从此她的影子会噼啪作响。',
    line: '听，雷在回答我。', src: '战役「遗迹外环」首通 / 召唤' },
  { id: 5, name: '星烛', ep: '祭司', faction: 'neutral', cls: '辅助', rar: 'SR', atk: 'magic',
    cost: 90, dmg: 9, rate: 1.0, range: 122, kind: 'aura', p: { aura: [0.15, 0.2, 0.28] },
    col: '#ead57f', shiny: '#b2ffec', skill: '星辉祷言',
    lv: ['射程内友方英雄攻速 +15%', '攻速光环 +20%', '攻速光环 +28%'],
    lore: '守夜人中年纪最小的祭司，负责为遗迹的星盘续灯。她相信每颗星都记得一位守卫的名字。',
    line: '灯不灭，人不退。', src: '战役「沉没回廊」首通 / 召唤' },
  { id: 6, name: '隐棘', ep: '影刃猎手', faction: 'neutral', cls: '射手', rar: 'SR', atk: 'pierce',
    cost: 130, dmg: 28, rate: 0.6, range: 215, kind: 'execute', p: { th: [0.1, 0.13, 0.16] },
    col: '#8a78b8', shiny: '#ff8d6c', skill: '断息',
    lv: ['超远射程；普通敌人血量低于 10% 时直接斩杀', '斩杀线 13%', '斩杀线 16%'],
    lore: '没有人见过他的脸。裂隙里的东西流传着一句话：听不见弦响时，就已经晚了。',
    line: '……', src: '召唤' },
  { id: 7, name: '赤鳞', ep: '炎裔', faction: 'neutral', cls: '法师', rar: 'SSR', atk: 'magic',
    cost: 150, dmg: 14, rate: 0.9, range: 132, kind: 'burn', p: { radius: [46, 52, 60], dps: [7, 10, 15] },
    col: '#ff6b3f', shiny: '#6dffcb', skill: '焚野',
    lv: ['范围灼烧，每秒 7 点，持续 3 秒', '灼烧每秒 10 点，半径扩大', '灼烧每秒 15 点，半径扩大'],
    lore: '古龙血脉的最后一支。她睡在遗迹熔炉里长大，至今不习惯没有火的夜晚。',
    line: '烧干净，再重来。', src: '召唤（SSR）' },
  { id: 8, name: '汐守', ep: '潮汐守望', faction: 'neutral', cls: '战士', rar: 'SSR', atk: 'normal',
    cost: 140, dmg: 18, rate: 0.9, range: 122, kind: 'pulse', p: { every: [7, 6, 5], stun: [0.8, 1, 1.25] },
    col: '#3fbccb', shiny: '#ffd05c', skill: '退潮',
    lv: ['每 7 秒释放潮涌，眩晕范围内敌人 0.8 秒', '每 6 秒，眩晕 1 秒', '每 5 秒，眩晕 1.25 秒'],
    lore: '沉没回廊的守门人，潮水退去的时候她站着，潮水涌来的时候她还站着。',
    line: '潮会退，我不会。', src: '无尽模式第 15 波 / 召唤（SSR）' },
  { id: 9, name: '昼铃', ep: '晨曦圣骑', faction: 'dawn', cls: '战士', rar: 'SSR', atk: 'magic',
    cost: 120, dmg: 18, rate: 0.75, range: 128, kind: 'beam', p: { len: [1.4, 1.55, 1.7] },
    col: '#f5d16c', shiny: '#ff9cd6', skill: '破晓光枪',
    lv: ['直线贯穿光枪，命中路径上所有敌人', '光枪长度提升', '光枪长度大幅提升'],
    lore: '曦光教团的执旗骑士。她的枪尖挂着一枚铜铃，每次冲锋前都会轻响一声。',
    line: '天亮了。', src: '曦光阵营专属（赛季）' },
  { id: 10, name: '金翎', ep: '游侠', faction: 'dawn', cls: '射手', rar: 'SR', atk: 'pierce',
    cost: 100, dmg: 10, rate: 1.2, range: 150, kind: 'multi', p: { n: [2, 3, 4] },
    col: '#e9bb4c', shiny: '#9ed3ff', skill: '金羽齐射',
    lv: ['同时射击 2 个目标', '同时射击 3 个目标', '同时射击 4 个目标'],
    lore: '教团的信使，一天能跑完遗迹的三圈外环。她射箭的速度和她说话一样快。',
    line: '还有谁？一起来！', src: '曦光阵营专属（赛季）' },
  { id: 11, name: '渊步', ep: '虚渊行者', faction: 'abyss', cls: '工匠', rar: 'SSR', atk: 'siege',
    cost: 130, dmg: 24, rate: 0.6, range: 138, kind: 'well', air: false, p: { radius: [50, 58, 68], slow: [0.3, 0.36, 0.42] },
    col: '#8d5fff', shiny: '#5effb3', skill: '引力井',
    lv: ['溅射并使敌人减速 30%，无法攻击飞行单位', '减速 36%，范围扩大', '减速 42%，范围扩大'],
    lore: '曾在裂隙另一侧行走过的人。回来之后，她走过的地方总会微微下陷。',
    line: '往下看。', src: '暗渊阵营专属（赛季）' },
  { id: 12, name: '骨祷', ep: '蚀骨巫医', faction: 'abyss', cls: '辅助', rar: 'SR', atk: 'magic',
    cost: 95, dmg: 12, rate: 0.9, range: 132, kind: 'hex', p: { amp: [0.15, 0.2, 0.25] },
    col: '#86c55e', shiny: '#ff6d9c', skill: '蚀骨咒',
    lv: ['命中目标 4 秒内受到伤害 +15%', '易伤 +20%', '易伤 +25%'],
    lore: '他用兽骨占卜，也用兽骨下咒。暗渊的人说，他念错过一次咒语，后来再也没人敢问是哪一次。',
    line: '骨头会告诉我答案。', src: '暗渊阵营专属（赛季）' }
];
const HERO_BY_ID = Object.fromEntries(HEROES.map(h => [h.id, h]));

const LV_DMG = [1, 1.6, 2.4], LV_RATE = [1, 1.12, 1.25], LV_RANGE = [0, 12, 24];
function upgradeCost(def, lv) { return Math.round(def.cost * (lv === 1 ? 0.8 : 1.2)); }

const ITEMS = [
  null,
  { id: 1, name: '狂战之斧', short: '斧', cost: 90, desc: '暴击率 +20%（2 倍伤害）' },
  { id: 2, name: '疾风护符', short: '风', cost: 90, desc: '攻击速度 +35%' },
  { id: 3, name: '鹰眼透镜', short: '镜', cost: 70, desc: '射程 +25%' }
];

/* 敌人 */
const ENEMIES = {
  imp:     { name: '疾行魔仆', arm: 'light',  hp: 40,   spd: 62, bounty: 5,   r: 9,  leak: 1, col: '#e0533d' },
  skel:    { name: '骨甲卫兵', arm: 'medium', hp: 92,   spd: 42, bounty: 8,   r: 11, leak: 1, col: '#d9d2bd' },
  golem:   { name: '岩躯傀儡', arm: 'heavy',  hp: 270,  spd: 27, bounty: 16,  r: 15, leak: 2, col: '#8b98a3' },
  bat:     { name: '夜翼蝠',   arm: 'light',  hp: 52,   spd: 60, bounty: 7,   r: 10, leak: 1, col: '#7a4fb8', fly: true },
  chief:   { name: '狂怒督军', arm: 'hero',   hp: 720,  spd: 33, bounty: 45,  r: 17, leak: 3, col: '#c8332e', elite: true,
             dom: { atk: 'normal', dmg: 42, rate: 0.9, range: 130, kind: 'cleave' }, skillTxt: '半血狂暴：移速 +40% 并震慑附近英雄' },
  warlock: { name: '咒缚司祭', arm: 'hero',   hp: 620,  spd: 35, bounty: 45,  r: 16, leak: 3, col: '#9a5ce0', elite: true,
             dom: { atk: 'magic', dmg: 30, rate: 0.85, range: 140, kind: 'curse' }, skillTxt: '每 5 秒震慑范围内英雄 2 秒' },
  boss:    { name: '渊喉守墓者', arm: 'hero', hp: 7200, spd: 17, bounty: 300, r: 30, leak: 10, col: '#3a2a4a', boss: true,
             skillTxt: '每 7 秒践踏，震慑大范围英雄；免疫支配' }
};
const SPAWN_GAP = { imp: 0.55, skel: 0.8, golem: 1.6, bat: 0.7, chief: 1.5, warlock: 1.5, boss: 2 };

/* 支配头环 [PH] */
const DOM = { cost: 240, limit: 2, hpLine: 0.2, waves: 3, stat: 0.6, refund: 0.5, channel: 1.2 };

/* 神符（心跳型随机）*/
const RUNES = {
  double: { name: '狂暴神符', color: '#ff5b4a', desc: '全体伤害 +50%，10 秒' },
  haste:  { name: '急速神符', color: '#ffd14a', desc: '全体攻速 +50%，10 秒' },
  bounty: { name: '财富神符', color: '#58e08c', desc: '立即获得 60 金币' },
  freeze: { name: '凝滞神符', color: '#7fd8ff', desc: '冻结全部敌人 3 秒' }
};

/* 关卡 */
const STAGES = [
  { id: 1, name: '遗迹外环', sub: '裂隙初开，异魔从西侧的断墙涌入。', hp: 1.1, ground: ['#1d2a22', '#14201a'],
    path: [[-30, 120], [250, 120], [250, 420], [560, 420], [560, 180], [800, 180], [800, 480], [990, 480]],
    pads: [[150, 200], [330, 205], [170, 330], [330, 340], [400, 505], [470, 300], [660, 285], [660, 500], [680, 90], [890, 300], [720, 385], [900, 565], [110, 40]],
    runes: [[400, 420], [680, 180], [250, 270]],
    waves: ['imp*8', 'imp*10|skel*3', 'skel*8', 'bat*7|imp*6', 'skel*6|golem*2', 'imp*12|chief*1',
            'golem*4|bat*6', 'skel*10|warlock*1', 'imp*14|golem*4|bat*6', 'skel*8|chief*1|golem*5|warlock*1'] },
  { id: 2, name: '沉没回廊', sub: '潮水退去的回廊里，石像开始移动。', hp: 1.7, ground: ['#1a2630', '#111a22'],
    path: [[-30, 300], [180, 300], [180, 90], [420, 90], [420, 510], [660, 510], [660, 90], [860, 90], [860, 330], [990, 330]],
    pads: [[90, 200], [90, 400], [280, 190], [300, 360], [290, 560], [540, 230], [540, 410], [760, 200], [760, 420], [945, 205], [945, 450], [300, 30], [540, 30]],
    runes: [[420, 300], [660, 300], [180, 195]],
    waves: ['imp*12', 'skel*8', 'bat*10', 'golem*3|imp*10', 'skel*10|chief*1', 'bat*8|golem*4',
            'imp*16|warlock*1', 'golem*6|skel*8', 'bat*12|chief*1|imp*10', 'golem*7|warlock*1',
            'skel*14|bat*10|chief*1', 'golem*8|chief*1|warlock*1|bat*10'] },
  { id: 3, name: '守墓者王座', sub: '遗迹核心之上，沉睡的守墓者睁开了眼睛。', hp: 1.9, ground: ['#2a1f26', '#1a1318'],
    path: [[480, -30], [480, 120], [140, 120], [140, 480], [820, 480], [820, 120], [640, 120], [640, 320], [480, 320]],
    pads: [[300, 215], [300, 385], [60, 300], [240, 565], [560, 565], [900, 300], [730, 220], [730, 385], [555, 215], [380, 40], [900, 565], [555, 405], [60, 40]],
    runes: [[140, 300], [480, 480], [820, 300]],
    waves: ['imp*14', 'skel*10', 'bat*12|imp*8', 'golem*5', 'skel*12|chief*1', 'bat*12|golem*4',
            'imp*18|warlock*1', 'golem*8', 'skel*14|chief*1|bat*8', 'golem*8|warlock*1',
            'imp*22|bat*14', 'golem*9|chief*1|warlock*1', 'skel*18|golem*6|bat*12', 'chief*2|warlock*2|golem*8',
            'golem*6|skel*10|boss*1'] }
];
const ENDLESS_STAGE = 1; // 无尽模式使用沉没回廊（索引）

/* 模拟好友（M3 前的社交层占位）*/
const FRIENDS = [
  { id: 'f1', name: '流云', lvl: 34, hero: { hid: 6, iv: [14, 9, 15], shiny: false, named: '夜枭', mastery: 10, ev: { atk: 10, sur: 2, fun: 3 } }, fee: 60 },
  { id: 'f2', name: '石榴', lvl: 28, hero: { hid: 7, iv: [12, 13, 10], shiny: true, named: '小火苗', mastery: 10, ev: { atk: 6, sur: 3, fun: 6 } }, fee: 80 },
  { id: 'f3', name: '北岸', lvl: 41, hero: { hid: 8, iv: [15, 15, 11], shiny: false, named: '', mastery: 8, ev: { atk: 4, sur: 6, fun: 5 } }, fee: 70 },
  { id: 'f4', name: '阿竹', lvl: 19, hero: { hid: 4, iv: [10, 7, 13], shiny: false, named: '噼啪', mastery: 10, ev: { atk: 8, sur: 0, fun: 7 } }, fee: 50 }
];

/* 养成参数 [PH] */
const EV_CAP_LINE = 10, EV_CAP_TOTAL = 15, EV_WAVES_PER_POINT = 2, RESPEC_PER_WEEK = 3;
const EV_IN_BATTLE = 0.5; // 局外成长进局内一律打折 50%
const EV_PER_POINT = { atk: 0.02, sur: 0.10, fun: 0.04 }; // 局外标称值；局内 ×0.5
const MASTERY_XP = 8; // 每 8 个参战波次升一级
const MASTERY_REWARDS = [
  [3, '专属台词'], [5, '局内名牌框'], [7, '结算动画'], [10, '冠名权']
];
const SHINY_RATE = 1 / 512;
const RECRUIT_COST = 100, RECRUIT_10 = 900;
const RENT_HOURS = 24, RENT_MAX = 2;
