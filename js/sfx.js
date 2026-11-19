'use strict';
/* 合成音效：WebAudio 即时生成，无外部资源 */
const Sfx = (() => {
  let ac = null, on = true, master = null;
  const last = {};
  function ensure() {
    if (ac) return ac;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.22; master.connect(ac.destination);
    } catch (e) { ac = null; }
    return ac;
  }
  function tone(freq, dur, type = 'sine', vol = 0.5, slide = 0, delay = 0) {
    if (!on || !ensure()) return;
    const t0 = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol = 0.3, hp = 800) {
    if (!on || !ensure()) return;
    const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    f.type = 'highpass'; f.frequency.value = hp; g.gain.value = vol;
    s.buffer = buf; s.connect(f); f.connect(g); g.connect(master); s.start();
  }
  function throttle(k, ms) { const n = performance.now(); if (last[k] && n - last[k] < ms) return false; last[k] = n; return true; }
  const lib = {
    shoot: () => throttle('shoot', 70) && tone(880, 0.05, 'triangle', 0.08, -300),
    hit: () => throttle('hit', 60) && noise(0.05, 0.08, 2000),
    zap: () => throttle('zap', 90) && (noise(0.12, 0.12, 3000), tone(1200, 0.1, 'sawtooth', 0.05, -800)),
    boom: () => throttle('boom', 90) && (noise(0.25, 0.22, 200), tone(120, 0.25, 'sine', 0.3, -60)),
    coin: () => throttle('coin', 50) && (tone(1320, 0.06, 'square', 0.05), tone(1760, 0.08, 'square', 0.05, 0, 0.05)),
    build: () => { tone(330, 0.12, 'triangle', 0.3); tone(495, 0.16, 'triangle', 0.25, 0, 0.08); },
    up: () => { tone(523, 0.1, 'triangle', 0.25); tone(659, 0.1, 'triangle', 0.25, 0, 0.08); tone(784, 0.18, 'triangle', 0.25, 0, 0.16); },
    horn: () => { tone(196, 0.5, 'sawtooth', 0.12, 0); tone(294, 0.6, 'sawtooth', 0.08, 0, 0.12); },
    leak: () => tone(160, 0.3, 'square', 0.15, -80),
    rune: () => { tone(988, 0.12, 'sine', 0.25); tone(1318, 0.2, 'sine', 0.2, 0, 0.1); },
    domStart: () => tone(220, 1.0, 'sawtooth', 0.08, 440),
    domOk: () => { [392, 494, 587, 784].forEach((f, i) => tone(f, 0.35, 'triangle', 0.2, 0, i * 0.08)); },
    domFail: () => { tone(330, 0.3, 'sawtooth', 0.15, -200); tone(220, 0.4, 'sawtooth', 0.12, -120, 0.15); },
    silence: () => throttle('sil', 300) && tone(140, 0.4, 'sine', 0.2, 60),
    win: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.5, 'triangle', 0.22, 0, i * 0.12)); },
    lose: () => { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.5, 'sawtooth', 0.1, 0, i * 0.16)); },
    shiny: () => { [1046, 1318, 1568, 2093, 2637].forEach((f, i) => tone(f, 0.4, 'sine', 0.18, 0, i * 0.07)); },
    pull: () => { tone(440, 0.5, 'sine', 0.15, 440); }
  };
  return { play: k => { try { lib[k] && lib[k](); } catch (e) { /* 静默 */ } }, toggle() { on = !on; return on; }, get on() { return on; }, unlock() { ensure(); if (ac && ac.state === 'suspended') ac.resume(); } };
})();
