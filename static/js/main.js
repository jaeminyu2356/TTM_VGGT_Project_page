/* TTM project page — figures & interactions. Plain JS, no build step. */
(() => {
  'use strict';

  const SVGNS = 'http://www.w3.org/2000/svg';
  const $ = (s) => document.querySelector(s);
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function el(tag, attrs = {}, parent) {
    const n = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'text') n.textContent = v; else n.setAttribute(k, v);
    }
    if (parent) parent.appendChild(n);
    return n;
  }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ease = (x) => { x = clamp(x, 0, 1); return x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };
  const phase = (t, a, b) => ease((t - a) / (b - a));
  // deterministic hash in [0,1)
  const hash = (...xs) => {
    let h = 2166136261;
    for (const x of xs) { h ^= (x * 2654435761) >>> 0; h = Math.imul(h, 16777619) >>> 0; }
    return (h >>> 0) / 4294967296;
  };
  const fmt = (x) => {
    const a = Math.abs(x);
    if (a >= 1e12) return (x / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return (x / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return (x / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return (x / 1e3).toFixed(1) + 'K';
    return String(Math.round(x));
  };
  const fmtBytes = (b) => b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : (b / 1e6).toFixed(0) + ' MB';

  // shared tooltip
  const tip = document.createElement('div');
  tip.className = 'tooltip'; tip.hidden = true; tip.style.position = 'fixed';
  document.body.appendChild(tip);
  function showTip(html, ev) {
    tip.innerHTML = html; tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let x = ev.clientX + 14, y = ev.clientY - r.height - 10;
    if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - 14;
    if (y < 8) y = ev.clientY + 16;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  const hideTip = () => { tip.hidden = true; };

  /* ---------------- KaTeX ---------------- */
  function renderMath() {
    if (!window.katex) return;
    document.querySelectorAll('.m').forEach((n) => katex.render(n.textContent, n, { throwOnError: false }));
    document.querySelectorAll('.eq').forEach((n) => katex.render(n.dataset.tex, n, { displayMode: true, throwOnError: false }));
  }

  /* ---------------- Hero animation ---------------- */
  function hero() {
    const svg = $('#hero-anim'); if (!svg) return;
    const F = 4, G = 6, CELL = 20, GAP = 3, FW = G * CELL + (G - 1) * GAP, X0 = 24, FGAP = 26, Y0 = 130;
    const fx = (f) => X0 + f * (FW + FGAP);
    const cx = (f, c) => fx(f) + c * (CELL + GAP) + CELL / 2;
    const cy = (r) => Y0 + r * (CELL + GAP) + CELL / 2;

    // world scene: each frame sees world columns shifted by one (camera pans)
    const world = (wx, wy) => {
      if ((wx === 5 && (wy === 2 || wy === 3)) || (wx === 6 && wy === 3)) return 'var(--s2)';
      if (wy < 2) return 'var(--tok-a)';
      if (wy >= 4) return 'var(--tok-c)';
      return 'var(--tok-b)';
    };

    const step = el('text', { x: 480, y: 34, 'text-anchor': 'middle', class: 't-strong', 'font-size': 16 }, svg);
    const sub = el('text', { x: 480, y: 56, 'text-anchor': 'middle', 'font-size': 13 }, svg);

    const tokens = []; // {f,r,c,idx,node,dropped,match}
    const gFrames = el('g', {}, svg);
    for (let f = 0; f < F; f++) {
      el('text', { x: fx(f) + FW / 2, y: Y0 - 14, 'text-anchor': 'middle', 'font-size': 12, class: 'mono', text: `frame ${f}` }, gFrames);
      for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) {
        const wx = c + f, wy = r;
        const node = el('rect', {
          x: fx(f) + c * (CELL + GAP), y: Y0 + r * (CELL + GAP), width: CELL, height: CELL, rx: 4,
          fill: world(wx, wy), 'fill-opacity': 0.75 + 0.25 * hash(wx, wy), stroke: 'var(--text-2)', 'stroke-width': 0, 'stroke-dasharray': '3 2',
        }, gFrames);
        tokens.push({ f, r, c, idx: f * G * G + r * G + c, node, dropped: false, match: null });
      }
    }
    // every frame drops N_DROP even-index sources; reference is t+1 (last frame: t-1)
    const N_DROP = 8;
    for (let f = 0; f < F; f++) {
      const ref = f < F - 1 ? f + 1 : f - 1, dc = f < F - 1 ? -1 : 1;
      const cands = tokens.filter((t) => t.f === f && ((t.r * G + t.c) % 2 === 0) && t.c + dc >= 0 && t.c + dc < G)
        .sort((a, b) => hash(a.idx, 7) - hash(b.idx, 7)).slice(0, N_DROP);
      cands.forEach((t) => { t.dropped = true; t.match = tokens[ref * G * G + t.r * G + (t.c + dc)]; });
    }
    const gLines = el('g', { fill: 'none', stroke: 'var(--accent)', 'stroke-width': 1.5, 'stroke-linecap': 'round' }, svg);
    const dropped = tokens.filter((t) => t.dropped);
    dropped.forEach((t, i) => {
      const x1 = cx(t.f, t.c), y1 = cy(t.r), x2 = cx(t.match.f, t.match.c), y2 = cy(t.match.r);
      const mx = (x1 + x2) / 2, my = Math.min(y1, y2) - 22 - 10 * hash(i);
      const p = el('path', { d: `M${x1},${y1} Q${mx},${my} ${x2},${y2}` }, gLines);
      t.line = p; t.len = p.getTotalLength();
      p.setAttribute('stroke-dasharray', t.len); p.setAttribute('stroke-dashoffset', t.len);
    });

    // attention matrix: rows = queries (all N), cols = keys
    const N = F * G * G, MX = 700, MY = 96, MS = 228;
    el('text', { x: MX + MS / 2, y: Y0 - 50, 'text-anchor': 'middle', 'font-size': 12, class: 'mono', text: 'global attention 행렬' }, svg);
    const rowLabel = el('text', { x: MX - 10, y: MY + MS / 2, 'text-anchor': 'middle', 'font-size': 12, transform: `rotate(-90 ${MX - 10} ${MY + MS / 2})`, text: `Q: 전체 ${N}개 토큰` }, svg);
    const colLabel = el('text', { x: MX + MS / 2, y: MY + MS + 22, 'text-anchor': 'middle', 'font-size': 12, text: '' }, svg);
    const gCols = el('g', {}, svg);
    const colW = MS / N;
    const cols = tokens.map((t) => el('rect', {
      y: MY, height: MS, fill: t.f % 2 ? 'var(--tok-a)' : 'var(--accent)', 'fill-opacity': t.f % 2 ? 0.9 : 0.55,
    }, gCols));
    void rowLabel;
    const sizeText = el('text', { x: MX + MS / 2, y: MY + MS + 44, 'text-anchor': 'middle', 'font-size': 13, class: 't-strong mono' }, svg);

    const STEPS = [
      ['1 · 영상은 S개 프레임 × P개 토큰', '인접한 프레임은 약간의 시차만 있을 뿐 거의 같은 장면을 봅니다.'],
      ['2 · frame t의 토큰을 frame t+1의 짝과 매칭 (마지막 프레임은 t−1)', 'VGGT의 frozen key 공간에서 cosine 유사도로 찾으므로 학습이 필요 없습니다.'],
      ['3 · 중복된 토큰을 key/value에서만 제거', '점선 토큰은 K/V에서 빠지지만 query로는 남아 있어서, 모든 위치가 출력을 그대로 받습니다.'],
      ['4 · attention 행렬 축소: N×N → N×N_red', '행(query)은 전체 길이 그대로라 unmerge할 것이 없습니다.'],
    ];
    const T = 10;
    function draw(t) {
      const pIn = phase(t, 0, 0.8), pLine = (i) => phase(t, 1.0 + i * 0.06, 2.0 + i * 0.06), pDrop = phase(t, 3.6, 4.6);
      const pCol = phase(t, 5.0, 6.4), pOut = 1 - phase(t, 9.3, 10);
      const k = t < 1.0 ? 0 : t < 3.6 ? 1 : t < 5.0 ? 2 : 3;
      step.textContent = STEPS[k][0]; sub.textContent = STEPS[k][1];
      svg.style.opacity = Math.min(pIn, pOut).toFixed(3);
      dropped.forEach((d, i) => {
        d.line.setAttribute('stroke-dashoffset', d.len * (1 - pLine(i)));
        d.line.setAttribute('stroke-opacity', 0.85 * (1 - phase(t, 4.6, 5.4)));
        d.node.setAttribute('fill-opacity', (0.75 + 0.25 * hash(d.c + d.f, d.r)) * (1 - 0.85 * pDrop));
        d.node.setAttribute('stroke-width', 1.2 * pDrop);
      });
      // columns: dropped ones collapse
      let x = MX;
      tokens.forEach((tk, i) => {
        const w = tk.dropped ? colW * (1 - pCol) : colW;
        const c = cols[i];
        c.setAttribute('x', x); c.setAttribute('width', Math.max(0, w - (w > 1.2 ? 0.3 : 0)));
        if (tk.dropped) c.setAttribute('fill', pDrop > 0.5 ? 'var(--bad)' : (tk.f % 2 ? 'var(--tok-a)' : 'var(--accent)'));
        x += w;
      });
      const curK = Math.round(N - dropped.length * pCol);
      colLabel.textContent = `K, V: ${curK}개 토큰`;
      sizeText.textContent = `${N} × ${curK} = ${(N * curK).toLocaleString()}개 score`;
    }

    let start = performance.now(), paused = false, pausedAt = 0, raf;
    const btn = $('#hero-toggle');
    function loop(now) {
      draw(((now - start) / 1000) % T);
      raf = requestAnimationFrame(loop);
    }
    if (reduceMotion) { draw(7.5); btn.textContent = '재생'; paused = true; pausedAt = 7.5; }
    else raf = requestAnimationFrame(loop);
    btn.addEventListener('click', () => {
      if (paused) { start = performance.now() - pausedAt * 1000; raf = requestAnimationFrame(loop); btn.textContent = '일시정지'; }
      else { cancelAnimationFrame(raf); pausedAt = ((performance.now() - start) / 1000) % T; btn.textContent = '재생'; }
      paused = !paused;
    });
  }

  /* ---------------- Attention cost explorer ---------------- */
  function explorer() {
    const svg = $('#matrix-viz'); if (!svg) return;
    const sIn = $('#s-in'), rIn = $('#r-in'), out = $('#matrix-readout');
    const P_PATCH = 1369, P = P_PATCH + 5, SMAX = 200, SIDE = 270, OX = 40, OY = 14;
    const ref = el('rect', { x: OX, y: OY, width: SIDE, height: SIDE, fill: 'none', stroke: 'var(--grid)', 'stroke-dasharray': '4 4' }, svg);
    void ref;
    const vRect = el('rect', { x: OX, y: OY, rx: 3, fill: 'var(--s2)', 'fill-opacity': 0.18, stroke: 'var(--s2)', 'stroke-width': 1.5 }, svg);
    const tRect = el('rect', { x: OX, y: OY, rx: 3, fill: 'var(--s1)', 'fill-opacity': 0.55 }, svg);
    const lblQ = el('text', { 'font-size': 12, 'text-anchor': 'middle' }, svg);
    const lblK = el('text', { 'font-size': 12 }, svg);
    const legend = el('g', { 'font-size': 12 }, svg);
    el('rect', { x: 340, y: 40, width: 12, height: 12, rx: 3, fill: 'var(--s2)', 'fill-opacity': .35, stroke: 'var(--s2)' }, legend);
    el('text', { x: 358, y: 50, text: 'Vanilla  N × N' }, legend);
    el('rect', { x: 340, y: 64, width: 12, height: 12, rx: 3, fill: 'var(--s1)', 'fill-opacity': .7 }, legend);
    el('text', { x: 358, y: 74, text: 'TTM  N × N_red' }, legend);
    el('text', { x: 340, y: 110, class: 't-muted', 'font-size': 11, text: '점선 박스 = S = 200' }, legend);

    function update() {
      const S = +sIn.value, r = +rIn.value;
      $('#s-out').textContent = S; $('#r-out').textContent = r.toFixed(2);
      const n = Math.min(Math.floor(r * P_PATCH), Math.floor(P_PATCH / 2));
      const N = S * P, Nred = S * (P - n);
      const side = SIDE * S / SMAX;
      vRect.setAttribute('width', side); vRect.setAttribute('height', side);
      tRect.setAttribute('width', side * Nred / N); tRect.setAttribute('height', side);
      lblQ.setAttribute('x', OX - 14); lblQ.setAttribute('y', OY + side / 2);
      lblQ.setAttribute('transform', `rotate(-90 ${OX - 14} ${OY + side / 2})`); lblQ.textContent = `N = ${N.toLocaleString()}`;
      lblK.setAttribute('x', OX); lblK.setAttribute('y', OY + side + 16); lblK.textContent = `N_red = ${Nred.toLocaleString()}`;
      const vE = N * N, tE = N * Nred;
      out.innerHTML = `
        <div class="row"><div>Vanilla score 수 (head·레이어당)</div><div class="big">${fmt(vE)}</div><div>BF16 기준 ${fmtBytes(vE * 2)}</div></div>
        <div class="row"><div>TTM (merge 레이어)</div><div class="big" style="color:var(--s1)">${fmt(tE)}</div><div>BF16 기준 ${fmtBytes(tE * 2)} · ${(vE / tE).toFixed(2)}배 적음</div></div>
        <div class="row"><div>S를 2배로 늘리면 vanilla 비용은</div><div><b>×4</b> (제곱 증가)</div></div>`;
    }
    sIn.addEventListener('input', update); rIn.addEventListener('input', update);
    update();
  }

  /* ---------------- Pipeline overview ---------------- */
  const TAPS = [4, 11, 17, 23];
  function pipeline() {
    const svg = $('#pipeline'); if (!svg) return;
    const defs = el('defs', {}, svg);
    const mk = el('marker', { id: 'arr', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
    el('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'var(--text-3)' }, mk);
    const arrow = (x1, y1, x2, y2, extra = {}) => el('path', { d: `M${x1},${y1} L${x2},${y2}`, stroke: 'var(--text-3)', 'stroke-width': 1.5, fill: 'none', 'marker-end': 'url(#arr)', ...extra }, svg);
    const box = (x, y, w, h, label, sub, strong) => {
      el('rect', { x, y, width: w, height: h, rx: 8, fill: strong ? 'var(--accent-soft)' : 'var(--surface-2)', stroke: strong ? 'var(--accent)' : 'var(--border)' }, svg);
      el('text', { x: x + w / 2, y: y + h / 2 + (sub ? -3 : 4), 'text-anchor': 'middle', 'font-size': 12, class: 't-strong', text: label }, svg);
      if (sub) el('text', { x: x + w / 2, y: y + h / 2 + 13, 'text-anchor': 'middle', 'font-size': 10.5, text: sub }, svg);
    };
    // frames
    for (let i = 0; i < 4; i++) el('rect', { x: 16 + i * 6, y: 150 + i * 6, width: 54, height: 40, rx: 4, fill: 'var(--tok-a)', stroke: 'var(--surface)', 'stroke-width': 1.5 }, svg);
    el('text', { x: 52, y: 222, 'text-anchor': 'middle', 'font-size': 11, text: 'S개 영상 프레임' }, svg);
    arrow(92, 176, 106, 176);
    box(108, 152, 66, 48, 'Patch', 'embed');
    arrow(176, 176, 188, 176);
    // blocks
    const BX = 190, BW = 22, BG = 3, BY = 150, BH = 52;
    for (let l = 0; l < 24; l++) {
      const x = BX + l * (BW + BG), tap = TAPS.includes(l), early = l < 5;
      el('rect', {
        x, y: BY, width: BW, height: BH, rx: 4,
        fill: tap ? 'var(--surface)' : early ? 'var(--surface-2)' : 'var(--accent)',
        'fill-opacity': tap || early ? 1 : 0.8,
        stroke: tap ? 'var(--accent)' : 'var(--border)', 'stroke-width': tap ? 2 : 1,
      }, svg);
      el('text', { x: x + BW / 2, y: BY + BH + 14, 'text-anchor': 'middle', 'font-size': 9.5, class: tap ? 't-strong mono' : 'mono t-muted', text: l }, svg);
    }
    el('text', { x: BX + 12 * (BW + BG), y: BY - 12, 'text-anchor': 'middle', 'font-size': 12, class: 't-strong', text: '24개 alternating block (frame attn + global attn)' }, svg);
    // heads
    const HX = BX + 24 * (BW + BG) + 18;
    arrow(HX - 16, 176, HX, 176);
    ['Depth head', 'Point head', 'Camera head'].forEach((h, i) => box(HX, 128 + i * 34, 120, 28, h));
    // tap curves to heads
    TAPS.forEach((l) => {
      const x = BX + l * (BW + BG) + BW / 2;
      el('path', { d: `M${x},${BY + BH + 20} Q${x},${BY + BH + 44} ${HX - 30},${BY + BH + 44}`, stroke: 'var(--accent)', 'stroke-width': 1, fill: 'none', 'stroke-opacity': 0.6 }, svg);
    });
    el('text', { x: BX + 300, y: BY + BH + 60, 'text-anchor': 'middle', 'font-size': 11, text: 'M1: head가 읽는 tap {4, 11, 17, 23}만 저장' }, svg);
    // pass 0
    box(190, 22, 180, 48, 'Pass 0 · 224 px', 'TTM (M1+M2), 시간 약 10%', false);
    arrow(372, 46, 400, 46);
    box(402, 22, 120, 48, 'Poses → F', 'F = K⁻ᵀ[t]ₓR K⁻¹');
    arrow(524, 46, 552, 46);
    box(554, 22, 160, 48, 'Epipolar band mask', '모든 merge 레이어가 공유', true);
    arrow(634, 72, 634, BY - 22, { 'stroke-dasharray': '4 3' });
    el('text', { x: 642, y: 112, 'font-size': 11, text: 'M5 (선택)' }, svg);
    // legend
    const ly = 286;
    const lg = [['var(--accent)', 0.8, 'var(--border)', 'KV-asymmetric global attn (M2)'], ['var(--surface)', 1, 'var(--accent)', 'DPT tap: full attn, 저장됨 (M1)'], ['var(--surface-2)', 1, 'var(--border)', '초기 레이어: full attn']];
    let lx = 190;
    lg.forEach(([f, o, s, t]) => {
      el('rect', { x: lx, y: ly - 10, width: 12, height: 12, rx: 3, fill: f, 'fill-opacity': o, stroke: s, 'stroke-width': 1.5 }, svg);
      const tx = el('text', { x: lx + 18, y: ly, 'font-size': 11.5, text: t }, svg);
      lx += 30 + tx.getComputedTextLength();
    });
  }

  /* ---------------- Merge-unmerge vs asymmetric ---------------- */
  function asym() {
    const svg = $('#asym'); if (!svg) return;
    const C = 9; // cell size
    const frameFill = (f) => ['var(--tok-a)', 'var(--tok-b)', 'var(--tok-c)', 'var(--s5)'][f];
    const defs = el('defs', {}, svg);
    const mk = el('marker', { id: 'arr2', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' }, defs);
    el('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'var(--text-3)' }, mk);
    const pat = el('pattern', { id: 'hatch', width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    el('rect', { width: 2, height: 5, fill: 'var(--bad)' }, pat);
    const arrow = (x1, y, x2, label) => {
      el('path', { d: `M${x1},${y} L${x2},${y}`, stroke: 'var(--text-3)', 'stroke-width': 1.5, 'marker-end': 'url(#arr2)' }, svg);
      if (label) el('text', { x: (x1 + x2) / 2, y: y - 8, 'text-anchor': 'middle', 'font-size': 11, text: label }, svg);
    };
    // strip of tokens: 4 frames x 4 tokens; dropped = index 1 and 3 of frames (not last)
    const FULL = [], RED = [];
    for (let f = 0; f < 4; f++) for (let i = 0; i < 4; i++) { FULL.push({ f, i }); if (i % 2 === 0) RED.push({ f, i }); else if (f === 3 && i === 1) RED.push({ f, i }); }
    // every frame drops the same number of tokens
    const isDropped = (t) => t.i === 1;
    RED.length = 0; FULL.forEach((t) => { if (!isDropped(t)) RED.push(t); });
    const strip = (x, y, arr, opts = {}) => {
      arr.forEach((t, k) => {
        el('rect', { x: x, y: y + k * C, width: C * 2, height: C - 1.5, rx: 2, fill: frameFill(t.f) }, svg);
        if (opts.bad && isDropped(t)) el('rect', { x: x, y: y + k * C, width: C * 2, height: C - 1.5, rx: 2, fill: 'url(#hatch)' }, svg);
      });
      if (opts.label) el('text', { x: x + C, y: y - 8, 'text-anchor': 'middle', 'font-size': 11, class: 'mono', text: opts.label }, svg);
      return y + arr.length * C;
    };
    const matrix = (x, y, rows, cols, label, fill) => {
      el('rect', { x, y, width: cols * C, height: rows * C, rx: 3, fill, 'fill-opacity': .5, stroke: 'var(--border)' }, svg);
      for (let r = 1; r < rows; r++) el('path', { d: `M${x},${y + r * C} h${cols * C}`, stroke: 'var(--surface)', 'stroke-width': .6 }, svg);
      for (let c = 1; c < cols; c++) el('path', { d: `M${x + c * C},${y} v${rows * C}`, stroke: 'var(--surface)', 'stroke-width': .6 }, svg);
      el('text', { x: x + cols * C / 2, y: y - 8, 'text-anchor': 'middle', 'font-size': 11, class: 'mono', text: label }, svg);
    };
    // Row 1
    const y1 = 46;
    el('text', { x: 16, y: 24, class: 't-strong', 'font-size': 14, text: '대칭 방식: merge → attention → unmerge' }, svg);
    strip(40, y1, FULL, { label: 'X (SP)' });
    arrow(70, y1 + 70, 140, 'merge');
    strip(150, y1 + 18, RED, { label: "X' " });
    arrow(180, y1 + 70, 230, 'attn');
    matrix(240, y1 + 18, RED.length, RED.length, "S(P−n) × S(P−n)", 'var(--s2)');
    arrow(240 + RED.length * C + 10, y1 + 70, 240 + RED.length * C + 60);
    const ux = 240 + RED.length * C + 70;
    strip(ux, y1 + 18, RED, { label: 'Y′' });
    arrow(ux + 30, y1 + 70, ux + 110, 'unmerge');
    strip(ux + 120, y1, FULL, { label: 'Y (SP)', bad: true });
    el('text', { x: ux + 160, y: y1 + 50, 'font-size': 12, class: 't-strong', text: 'scatter 단계' }, svg);
    el('text', { x: ux + 160, y: y1 + 68, 'font-size': 11.5, text: '빗금 친 행은 frame t와 t+1이' }, svg);
    el('text', { x: ux + 160, y: y1 + 84, 'font-size': 11.5, text: '섞인 복사본을 받음 → depth 흐려짐' }, svg);
    // Row 2
    const y2 = 228;
    el('text', { x: 16, y: 206, class: 't-strong', 'font-size': 14, text: 'TTM: KV-asymmetric (unmerge 없음)' }, svg);
    strip(40, y2, FULL, { label: 'X (SP)' });
    el('path', { d: `M64,${y2 + 20} C 110,${y2 + 20} 110,${y2 + 20} 140,${y2 + 20}`, stroke: 'var(--text-3)', 'stroke-width': 1.5, fill: 'none', 'marker-end': 'url(#arr2)' }, svg);
    el('text', { x: 100, y: y2 + 12, 'text-anchor': 'middle', 'font-size': 11, text: 'Q = XW_Q' }, svg);
    arrow(70, y2 + 100, 140, 'merge → K,V');
    strip(150, y2 + 18, RED, { label: 'K, V' });
    arrow(180, y2 + 70, 230);
    matrix(240, y2, FULL.length, RED.length, 'SP × S(P−n)', 'var(--s1)');
    el('text', { x: 240 + RED.length * C / 2, y: y2 + FULL.length * C + 18, 'text-anchor': 'middle', 'font-size': 11, text: '행 = 모든 query' }, svg);
    arrow(240 + RED.length * C + 10, y2 + 70, 240 + RED.length * C + 60);
    strip(ux, y2, FULL, { label: 'O (SP)' });
    el('text', { x: ux + 40, y: y2 + 50, 'font-size': 12, class: 't-strong', text: '처음부터 원래 길이' }, svg);
    el('text', { x: ux + 40, y: y2 + 68, 'font-size': 11.5, text: '원래 토큰마다 출력 하나,' }, svg);
    el('text', { x: ux + 40, y: y2 + 84, 'font-size': 11.5, text: 'scatter도 오염도 없음' }, svg);
    // frame legend
    const lx = 760;
    ['frame 0', 'frame 1', 'frame 2', 'frame 3'].forEach((t, i) => {
      el('rect', { x: lx, y: 214 + i * 18, width: 12, height: 10, rx: 2, fill: frameFill(i) }, svg);
      el('text', { x: lx + 18, y: 223 + i * 18, 'font-size': 11, text: t }, svg);
    });
  }

  /* ---------------- M1 layers ---------------- */
  function layers() {
    const svg = $('#layers'); if (!svg) return;
    const W = 34, G = 4, X0 = 24, Y = 34;
    for (let l = 0; l < 24; l++) {
      const x = X0 + l * (W + G), tap = TAPS.includes(l);
      el('rect', { x, y: Y, width: W, height: 44, rx: 5, fill: tap ? 'var(--accent)' : 'var(--surface-2)', stroke: tap ? 'none' : 'var(--border)' }, svg);
      el('text', { x: x + W / 2, y: Y + 27, 'text-anchor': 'middle', 'font-size': tap ? 12 : 10, class: 'mono', style: tap ? 'fill:#fff;font-weight:600' : '', text: tap ? 'Z' + l : 'None' }, svg);
      el('text', { x: x + W / 2, y: Y + 62, 'text-anchor': 'middle', 'font-size': 10, class: 'mono t-muted', text: l }, svg);
    }
    el('text', { x: X0, y: 20, 'font-size': 13, class: 't-strong', text: '저장되는 중간 특징 {Zℓ}' }, svg);
    el('text', { x: X0, y: 130, 'font-size': 13, text: '24개 중 4개만 저장  ·  나머지 20개는 None  ·  S = 20에서 약 870 MB 절약 (S에 비례)  ·  출력 동일' }, svg);
  }

  /* ---------------- M5 epipolar demo ---------------- */
  function epipolar() {
    const cv = $('#epi-canvas'); if (!cv) return;
    const ctx = cv.getContext('2d');
    const COLS = 15, ROWS = 10, PS = 28, PW = COLS * PS, PH = ROWS * PS, GAPX = 40, TOP = 26;
    const LW = PW * 2 + GAPX, LH = PH + TOP + 4;
    const SHIFT = [2, 1]; // world patch at p in frame t appears at p - SHIFT in frame t+1
    const sigIn = $('#sig-in'), note = $('#epi-note');
    // texture class in world patch coords
    const cls = (wx, wy) => {
      if (wy < 2) return 'sky';
      if (wy >= 10) return 'ground';
      if (wx % 3 === 1 && wy % 2 === 1) return 'window';
      return 'wall';
    };
    const CLS_KO = { window: '창문', wall: '벽', sky: '하늘', ground: '땅' };
    let hover = null;
    // find a default patch where appearance-only is wrong
    function evaluate(px, py, sigma) {
      const wx = px, wy = py, c = cls(wx, wy);
      const tx = px - SHIFT[0], ty = py - SHIFT[1];
      let bestA = null, bestG = null;
      const gates = [];
      const ux = SHIFT[0] / Math.hypot(...SHIFT), uy = SHIFT[1] / Math.hypot(...SHIFT);
      const cxp = (px + .5) * PS, cyp = (py + .5) * PS;
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const qwx = x + SHIFT[0], qwy = y + SHIFT[1];
        let s;
        if (qwx === wx && qwy === wy) s = 0.90;
        else if (cls(qwx, qwy) === c) s = 0.84 + 0.13 * hash(px, py, x, y);
        else s = 0.15 + 0.3 * hash(px, py, x, y);
        const dx = (x + .5) * PS - cxp, dy = (y + .5) * PS - cyp;
        const d = Math.abs(dx * uy - dy * ux);
        const inBand = d <= sigma; // hard candidate restriction (core); sigma = band width tau
        gates.push(inBand ? 1 : 0);
        if (!bestA || s > bestA.s) bestA = { x, y, s };
        if (inBand && (!bestG || s > bestG.s)) bestG = { x, y, s };
      }
      const inView = tx >= 0 && ty >= 0 && tx < COLS && ty < ROWS;
      return { bestA, bestG, gates, truth: inView ? { x: tx, y: ty } : null };
    }
    for (let y = 3; y < ROWS && !hover; y++) for (let x = 5; x < COLS && !hover; x++) {
      if (cls(x, y) !== 'window') continue;
      const e = evaluate(x, y, 0.05 * PW);
      if (e.truth && (e.bestA.x !== e.truth.x || e.bestA.y !== e.truth.y) && e.bestG.x === e.truth.x && e.bestG.y === e.truth.y) hover = { x, y };
    }
    hover = hover || { x: 7, y: 5 };

    function patchColor(c, wx, wy) {
      const v = hash(wx, wy) * 0.08;
      if (c === 'sky') return `hsl(205 70% ${82 - wy * 4 - v * 50}%)`;
      if (c === 'ground') return `hsl(95 25% ${48 - v * 40}%)`;
      if (c === 'window') return `hsl(215 45% ${30 + v * 40}%)`;
      return `hsl(28 30% ${70 - v * 60}%)`;
    }
    function drawFrame(ox, offx, offy, title) {
      ctx.fillStyle = css('--text-2'); ctx.font = '600 13px Inter, sans-serif';
      ctx.fillText(title, ox, 16);
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const wx = x + offx, wy = y + offy;
        ctx.fillStyle = patchColor(cls(wx, wy), wx, wy);
        ctx.fillRect(ox + x * PS, TOP + y * PS, PS, PS);
      }
      ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1;
      for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(ox + x * PS + .5, TOP); ctx.lineTo(ox + x * PS + .5, TOP + PH); ctx.stroke(); }
      for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(ox, TOP + y * PS + .5); ctx.lineTo(ox + PW, TOP + y * PS + .5); ctx.stroke(); }
    }
    function ring(ox, p, color, r) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(ox + (p.x + .5) * PS, TOP + (p.y + .5) * PS, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
    }
    function render() {
      const dpr = window.devicePixelRatio || 1, w = cv.clientWidth;
      cv.width = Math.round(w * dpr); cv.height = Math.round(w * LH / LW * dpr);
      cv.style.height = (w * LH / LW) + 'px';
      const k = cv.width / LW;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.clearRect(0, 0, LW, LH);
      const sigma = +sigIn.value * PW;
      $('#sig-out').textContent = (+sigIn.value).toFixed(2) + ' W';
      const R = PW + GAPX;
      drawFrame(0, 0, 0, 'frame t  (패치에 마우스를 올려 보세요)');
      drawFrame(R, SHIFT[0], SHIFT[1], 'frame t+1');
      const e = evaluate(hover.x, hover.y, sigma);
      // band overlay
      e.gates.forEach((g, i) => {
        const x = i % COLS, y = Math.floor(i / COLS);
        ctx.fillStyle = `rgba(245,213,71,${(g * 0.45).toFixed(3)})`;
        ctx.fillRect(R + x * PS, TOP + y * PS, PS, PS);
      });
      // epipolar line
      ctx.save(); ctx.beginPath(); ctx.rect(R, TOP, PW, PH); ctx.clip();
      const cxp = (hover.x + .5) * PS, cyp = (hover.y + .5) * PS, L = 2000, u = Math.hypot(...SHIFT);
      ctx.strokeStyle = '#f5d547'; ctx.lineWidth = 2; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(R + cxp - L * SHIFT[0] / u, TOP + cyp - L * SHIFT[1] / u); ctx.lineTo(R + cxp + L * SHIFT[0] / u, TOP + cyp + L * SHIFT[1] / u); ctx.stroke();
      ctx.restore();
      // selected patch
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      ctx.strokeRect(hover.x * PS + 1.5, TOP + hover.y * PS + 1.5, PS - 3, PS - 3);
      const same = e.bestA.x === e.bestG.x && e.bestA.y === e.bestG.y;
      ring(R, e.bestA, css('--bad'), same ? 17 : 13);
      ring(R, e.bestG, css('--s1'), 12);
      const ok = (p) => e.truth && p.x === e.truth.x && p.y === e.truth.y;
      if (!e.truth) note.textContent = '이 패치의 짝은 frame t+1에서 화면 밖으로 나갔습니다. band 안에는 비슷한 후보가 없어 유사도가 낮고, top-n merge에서 선택되지 않습니다.';
      else if (ok(e.bestA) && ok(e.bestG)) note.textContent = '여기서는 둘 다 진짜 짝을 찾습니다. 모호하지 않은 매칭에서는 band 제한이 방해하지 않습니다.';
      else if (ok(e.bestG)) note.textContent = `겉모양만 보면 직선에서 벗어난, 비슷하게 생긴 ${CLS_KO[cls(hover.x, hover.y)]} 패치를 고릅니다(빨강). 노란 band 안에서만 찾으면 진짜 짝이 나옵니다(파랑).`;
      else note.textContent = 'band가 너무 넓으면 제약이 사라져, M5는 겉모양 매칭(M1+M2)과 같아집니다.';
    }
    function pick(ev) {
      const r = cv.getBoundingClientRect(), k = LW / r.width;
      const x = Math.floor(((ev.clientX - r.left) * k) / PS), y = Math.floor(((ev.clientY - r.top) * k - TOP) / PS);
      if (x >= 0 && x < COLS && y >= 0 && y < ROWS && (x !== hover.x || y !== hover.y)) { hover = { x, y }; render(); }
    }
    cv.addEventListener('pointermove', pick);
    cv.addEventListener('pointerdown', pick);
    sigIn.addEventListener('input', render);
    window.addEventListener('resize', render);
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
    render();
  }

  /* ---------------- Shared synthetic scene (illustration only) ---------------- */
  const SCENE_W = 280, SCENE_H = 210;
  // depth in [0,1] (0 = near): floor, sphere, box, thin pole + bar
  function sceneDepth(x, y) {
    let d = 0.35 + 0.6 * (1 - y / SCENE_H);
    const dx = x - 85, dy = y - 112, r2 = dx * dx + dy * dy;
    if (r2 < 44 * 44) d = Math.min(d, 0.25 + 0.25 * Math.sqrt(r2) / 44);
    if (x > 170 && x < 245 && y > 58 && y < 150) d = Math.min(d, 0.45 + 0.002 * (x - 170));
    if (x > 140 && x < 145 && y > 30 && y < 175) d = Math.min(d, 0.3);
    if (y > 40 && y < 44 && x > 120 && x < 165) d = Math.min(d, 0.3);
    return d;
  }
  // sequential blue ramp: near = dark, far = light
  const RAMP = ['#0d366b', '#184f95', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4', '#cde2fb'].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  function depthRGB(d) {
    const t = clamp(d, 0, 1) * (RAMP.length - 1), i = Math.min(RAMP.length - 2, Math.floor(t)), f = t - i;
    return RAMP[i].map((c, k) => c + (RAMP[i + 1][k] - c) * f);
  }
  const rgbStr = (c) => `rgb(${c.map(Math.round).join(',')})`;
  const mixRGB = (a, b, f) => a.map((v, k) => v + (b[k] - v) * f);

  /* ---------------- Merge-unmerge vs KV-asymmetric (step animation) ---------------- */
  function mergeUnmergeAnim() {
    const svg = $('#mu-anim'); if (!svg) return;
    const GX = 8, GY = 6, CS = 22, CG = 2, STEP = CS + CG, GW = GX * STEP - CG;
    const COLX = [40, 384, 728], ROWY = [112, 352];
    // token colour = mean depth of its 35x35 region
    const PW = SCENE_W / GX, PH = SCENE_H / GY;
    const cells = [];
    for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) {
      let m = 0, k = 0;
      for (let y = gy * PH; y < (gy + 1) * PH; y += 3) for (let x = gx * PW; x < (gx + 1) * PW; x += 3) { m += sceneDepth(x, y); k++; }
      cells.push({ gx, gy, d: m / k });
    }
    const idx = (gx, gy) => gy * GX + gx;
    // merge pairs: even column (src) -> right neighbour (dst); keep the 12 most similar pairs
    const pairs = [];
    for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx += 2) {
      const a = cells[idx(gx, gy)], b = cells[idx(gx + 1, gy)];
      pairs.push({ src: idx(gx, gy), dst: idx(gx + 1, gy), sim: -Math.abs(a.d - b.d) + 1e-4 * hash(gx, gy) });
    }
    pairs.sort((a, b) => b.sim - a.sim);
    const MERGED = pairs.slice(0, 12);
    const srcOf = new Map(MERGED.map((p) => [p.src, p])), dstOf = new Map(MERGED.map((p) => [p.dst, p]));
    const avg = (p) => depthRGB((cells[p.src].d + cells[p.dst].d) / 2);
    const own = (i) => depthRGB(cells[i].d);
    const pos = (col, row, i) => [COLX[col] + (i % GX) * STEP, ROWY[row] + Math.floor(i / GX) * STEP];

    // labels
    const step = el('text', { x: 480, y: 26, 'text-anchor': 'middle', class: 't-strong', 'font-size': 15 }, svg);
    const sub = el('text', { x: 480, y: 46, 'text-anchor': 'middle', 'font-size': 12.5 }, svg);
    [0, 1].forEach((row) => [['입력 토큰 (frame t)', 0], ['출력 토큰', 2]].forEach(([t, c]) =>
      el('text', { x: COLX[c] + GW / 2, y: ROWY[row] - 12, 'text-anchor': 'middle', 'font-size': 12, text: t }, svg)));
    el('text', { x: 16, y: ROWY[0] - 34, class: 't-strong', 'font-size': 13.5, text: '기존 방식 (LiteVGGT 등): merge → attention → unmerge' }, svg);
    el('text', { x: 16, y: ROWY[1] - 34, class: 't-strong', 'font-size': 13.5, text: 'TTM: KV-asymmetric (query 유지, unmerge 없음)' }, svg);
    [0, 1].forEach((row) => {
      el('text', { x: COLX[1] + GW / 2, y: ROWY[row] - 12, 'text-anchor': 'middle', 'font-size': 12, text: row === 0 ? 'attention 입력 (merge된 토큰)' : 'attention에 들어가는 K/V' }, svg);
      [0, 1].forEach((c) => el('path', { d: `M${COLX[c] + GW + 14},${ROWY[row] + 70} H${COLX[c + 1] - 14}`, stroke: 'var(--border)', 'stroke-width': 1.5, 'marker-end': 'url(#mu-arr)' }, svg));
    });
    const defs = el('defs', {}, svg);
    const mk = el('marker', { id: 'mu-arr', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' }, defs);
    el('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'var(--border)' }, mk);
    const qNote = el('text', { x: COLX[1] + GW / 2, y: ROWY[1] + GY * STEP + 22, 'text-anchor': 'middle', 'font-size': 11.5, class: 't-muted', text: 'query는 전체 48개 그대로 출력으로 직행' }, svg);
    const verdictA = el('text', { x: COLX[2] + GW / 2, y: ROWY[0] + GY * STEP + 22, 'text-anchor': 'middle', 'font-size': 12, class: 't-strong' }, svg);
    const verdictB = el('text', { x: COLX[2] + GW / 2, y: ROWY[1] + GY * STEP + 22, 'text-anchor': 'middle', 'font-size': 12, class: 't-strong' }, svg);

    const layer = el('g', {}, svg);
    const toks = []; // {node, kf: [[t, x, y, rgb, opacity, stroke]]}
    const add = (kf, extra = {}) => {
      const node = el('rect', { width: CS, height: CS, rx: 4, 'stroke-width': 2, ...extra }, layer);
      toks.push({ node, kf });
    };
    const N = GX * GY;
    for (let i = 0; i < N; i++) {
      const c = own(i);
      // static inputs (both rows)
      [0, 1].forEach((row) => { const [x, y] = pos(0, row, i); add([[0, x, y, c, 1]]); });
      // --- Row A: merge -> attention -> unmerge
      const [ax, ay] = pos(0, 0, i);
      if (srcOf.has(i)) {
        const p = srcOf.get(i), [mx, my] = pos(1, 0, p.dst);
        add([[0, ax, ay, c, 0], [1, ax, ay, c, 1], [3, mx, my, c, 1], [3.3, mx, my, c, 0]]);
        // unmerge: copy flies back out of the dst slot to the src slot
        const [ox, oy] = pos(2, 0, i);
        add([[0, mx, my, avg(p), 0], [4.6, mx, my, avg(p), 0], [4.7, mx, my, avg(p), 1], [7, ox, oy, avg(p), 1]], { class: 'mu-copy' });
      } else {
        const [mx, my] = pos(1, 0, i), p = dstOf.get(i);
        add([[0, ax, ay, c, 0], [1, ax, ay, c, 1], [3, mx, my, c, 1], [3.6, mx, my, p ? avg(p) : c, 1], [11, mx, my, p ? avg(p) : c, 1]]);
        const [ox, oy] = pos(2, 0, i);
        add([[0, mx, my, p ? avg(p) : c, 0], [4.6, mx, my, p ? avg(p) : c, 0], [4.7, mx, my, p ? avg(p) : c, 1], [7, ox, oy, p ? avg(p) : c, 1]], p ? { class: 'mu-copy' } : {});
      }
      // --- Row B: KV shrinks, queries go straight through
      const [bx, by] = pos(0, 1, i), [kx, ky] = pos(1, 1, i), [qx, qy] = pos(2, 1, i);
      if (srcOf.has(i)) add([[0, bx, by, c, 0], [1, bx, by, c, 1], [3, kx, ky, c, 0.06]]);
      else add([[0, bx, by, c, 0], [1, bx, by, c, 1], [3, kx, ky, c, 1], [11, kx, ky, c, 1]]);
      add([[0, bx, by, c, 0], [4.6, bx, by, c, 0], [4.7, bx, by, c, 1], [7, qx, qy, c, 1]], { 'data-arc': 1 });
    }
    const copies = [...layer.querySelectorAll('.mu-copy')];
    const pulse = [0, 1].map((row) => el('rect', { x: COLX[1] - 6, y: ROWY[row] - 6, width: GW + 12, height: GY * STEP + 10, rx: 8, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2 }, svg));

    const nDiff = MERGED.length * 2;
    const STEPS = [
      ['같은 frame t의 토큰 48개에서 시작', '위: 기존 merge→unmerge 방식 / 아래: TTM'],
      ['1 · merge: 비슷한 토큰 쌍을 하나로 합침', '위는 토큰 자체가 합쳐져 평균값이 되고, 아래는 K/V에서만 빠집니다.'],
      ['2 · attention: 줄어든 토큰으로 계산', '두 방식 모두 K/V 길이가 48 → 36으로 줄어 비용이 같이 줄어듭니다.'],
      ['3 · 출력: 위는 unmerge로 복사, 아래는 query마다 바로 출력', '위는 합쳐진 값을 원래 두 자리에 복사해 넣고, 아래는 원래 query 48개가 각자 출력을 받습니다.'],
      ['결과: 기존 방식은 해상도가 떨어지고, TTM은 패치마다 고유한 출력', `빨간 테두리 = unmerge로 복사된 패치 (${nDiff}/48)`],
    ];
    const T = 12.5;
    function interp(kf, t) {
      if (t <= kf[0][0]) return kf[0];
      for (let k = 1; k < kf.length; k++) {
        if (t <= kf[k][0]) {
          const a = kf[k - 1], b = kf[k], f = ease((t - a[0]) / (b[0] - a[0]));
          return [t, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, mixRGB(a[3], b[3], f), a[4] + (b[4] - a[4]) * f, f];
        }
      }
      return kf[kf.length - 1];
    }
    function draw(t) {
      const k = t < 1 ? 0 : t < 3.4 ? 1 : t < 4.6 ? 2 : t < 7.2 ? 3 : 4;
      step.textContent = STEPS[k][0]; sub.textContent = STEPS[k][1];
      const fadeOut = 1 - phase(t, 11.8, T);
      toks.forEach(({ node, kf }) => {
        const v = interp(kf, t);
        let x = v[1], y = v[2], size = CS;
        if (node.dataset.arc && t > 4.7 && t < 7) {
          // queries travel as small dots over the K/V grid, then land at full size
          const b = Math.sin(Math.PI * (t - 4.7) / 2.3);
          y -= b * 60; size = CS * (1 - 0.72 * b); x += (CS - size) / 2; y += (CS - size) / 2;
        }
        node.setAttribute('x', x); node.setAttribute('y', y);
        node.setAttribute('width', size); node.setAttribute('height', size);
        node.setAttribute('fill', rgbStr(v[3])); node.setAttribute('opacity', (v[4] * fadeOut).toFixed(3));
      });
      const red = phase(t, 7.2, 8);
      copies.forEach((c) => c.setAttribute('stroke', red > 0 ? `rgba(227,73,72,${red})` : 'none'));
      const pl = t > 3.4 && t < 4.6 ? 0.35 + 0.65 * Math.abs(Math.sin((t - 3.4) * Math.PI * 2)) : 0;
      pulse.forEach((p) => p.setAttribute('stroke-opacity', pl.toFixed(2)));
      verdictA.textContent = t > 7.2 ? `복사된 패치 ${nDiff}/48 → 해상도 손실` : '';
      verdictB.textContent = t > 7.2 ? '복사된 패치 0/48 → 해상도 유지' : '';
      verdictA.setAttribute('opacity', fadeOut); verdictB.setAttribute('opacity', fadeOut);
      qNote.setAttribute('opacity', t > 4.6 && t < 7.2 ? 1 : 0.4);
    }

    let start = performance.now(), paused = reduceMotion, pausedAt = 9, raf = null;
    const btn = $('#mu-toggle');
    const loop = (now) => { draw(((now - start) / 1000) % T); raf = requestAnimationFrame(loop); };
    const play = () => { start = performance.now() - pausedAt * 1000; raf = requestAnimationFrame(loop); };
    const stop = () => { cancelAnimationFrame(raf); raf = null; pausedAt = ((performance.now() - start) / 1000) % T; };
    btn.addEventListener('click', () => { paused = !paused; btn.textContent = paused ? '재생' : '일시정지'; paused ? stop() : play(); });
    new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting && !paused && !raf) { pausedAt = 0; play(); }
      else if (!e.isIntersecting && raf) stop();
    })).observe(svg);
    if (paused) btn.textContent = '재생';
    const freeze = new URLSearchParams(location.search).get('mu'); // ?mu=<seconds> freezes a frame (for screenshots)
    if (freeze !== null) { paused = true; btn.textContent = '재생'; pausedAt = +freeze; }
    draw(freeze !== null ? +freeze : 9);
  }

  /* ---------------- Resolution demo: merge-unmerge vs KV-asymmetric ---------------- */
  function resolutionDemo() {
    const cv = $('#res-canvas'); if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = SCENE_W, H = SCENE_H, PS = 14, GX = W / PS, GY = H / PS, GAP = 24, TOP = 28, SHIFT = 6;
    const LW = W * 3 + GAP * 2, LH = H + TOP + 30;
    const rIn = $('#rr-in'), rOut = $('#rr-out'), btn = $('#res-play');

    const depth = sceneDepth;
    const Dt = new Float32Array(W * H), Dn = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { Dt[y * W + x] = depth(x, y); Dn[y * W + x] = depth(Math.min(W - 1, x + SHIFT), y); }

    const cmap = depthRGB;
    // per-patch stats; similarity = how alike the t / t+1 patches are (ToMe picks the most similar first)
    const patches = [];
    for (let py = 0; py < GY; py++) for (let px = 0; px < GX; px++) {
      let mt = 0, mn = 0, diff = 0;
      for (let y = py * PS; y < (py + 1) * PS; y++) for (let x = px * PS; x < (px + 1) * PS; x++) {
        const a = Dt[y * W + x], b = Dn[y * W + x]; mt += a; mn += b; diff += Math.abs(a - b);
      }
      const n = PS * PS;
      patches.push({ px, py, even: (py * GX + px) % 2 === 0, mean: (mt + mn) / (2 * n), diff: diff / n + 1e-4 * hash(px, py) });
    }
    const order = patches.filter((p) => p.even).sort((a, b) => a.diff - b.diff);
    const Ppatch = GX * GY;

    const img = (w, h) => new ImageData(w, h);
    const vanilla = img(W, H), merged = img(W, H);
    function fill(target, src) {
      for (let i = 0; i < W * H; i++) { const c = cmap(src[i]); target.data.set([c[0], c[1], c[2], 255], i * 4); }
    }
    fill(vanilla, Dt);
    const off = document.createElement('canvas'); off.width = W; off.height = H;
    const octx = off.getContext('2d');

    let r = 0, dropped = new Set();
    function compute() {
      const n = Math.min(Math.floor(r * Ppatch), Math.floor(Ppatch / 2));
      dropped = new Set(order.slice(0, n));
      merged.data.set(vanilla.data);
      let err = 0;
      dropped.forEach((p) => {
        const c = cmap(p.mean);
        for (let y = p.py * PS; y < (p.py + 1) * PS; y++) for (let x = p.px * PS; x < (p.px + 1) * PS; x++) {
          merged.data.set([c[0], c[1], c[2], 255], (y * W + x) * 4);
          err += Math.abs(p.mean - Dt[y * W + x]);
        }
      });
      return { n, err: err / (W * H) };
    }

    function panel(ox, data, title, sub) {
      octx.putImageData(data, 0, 0);
      ctx.drawImage(off, ox, TOP);
      ctx.fillStyle = css('--text'); ctx.font = '600 13px Inter, "Noto Sans KR", sans-serif';
      ctx.fillText(title, ox, 16);
      ctx.fillStyle = css('--text-2'); ctx.font = '12px Inter, "Noto Sans KR", sans-serif';
      ctx.fillText(sub, ox, TOP + H + 20);
    }
    function render() {
      const dpr = window.devicePixelRatio || 1, w = cv.clientWidth;
      cv.width = Math.round(w * dpr); cv.height = Math.round(w * LH / LW * dpr);
      cv.style.height = (w * LH / LW) + 'px';
      const k = cv.width / LW;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.clearRect(0, 0, LW, LH);
      const { n, err } = compute();
      rOut.textContent = r.toFixed(2);
      panel(0, vanilla, '입력 frame t', `K/V에서 제거된 패치 ${n} / ${Ppatch}`);
      panel(W + GAP, merged, 'Merge → Unmerge 출력', `원본 대비 평균 오차 ${(err * 100).toFixed(2)}`);
      panel(2 * (W + GAP), vanilla, 'KV-Asymmetric 출력 (TTM)', '모든 패치가 자기 query를 유지');
      // hatch dropped patches on the input panel
      ctx.save(); ctx.beginPath(); ctx.rect(0, TOP, W, H); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.2;
      dropped.forEach((p) => {
        const x0 = p.px * PS, y0 = TOP + p.py * PS;
        ctx.strokeRect(x0 + .5, y0 + .5, PS - 1, PS - 1);
        ctx.beginPath(); ctx.moveTo(x0, y0 + PS); ctx.lineTo(x0 + PS, y0); ctx.stroke();
      });
      ctx.restore();
      // patch grid on outputs
      [W + GAP, 2 * (W + GAP)].forEach((ox) => {
        ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 1;
        for (let x = 0; x <= GX; x++) { ctx.beginPath(); ctx.moveTo(ox + x * PS + .5, TOP); ctx.lineTo(ox + x * PS + .5, TOP + H); ctx.stroke(); }
        for (let y = 0; y <= GY; y++) { ctx.beginPath(); ctx.moveTo(ox, TOP + y * PS + .5); ctx.lineTo(ox + W, TOP + y * PS + .5); ctx.stroke(); }
      });
    }

    let playing = !reduceMotion, t0 = performance.now(), raf;
    const PERIOD = 9000;
    function loop(now) {
      const ph = ((now - t0) % PERIOD) / PERIOD;
      r = 0.5 * (0.5 - 0.5 * Math.cos(ph * 2 * Math.PI));
      rIn.value = r; render();
      raf = requestAnimationFrame(loop);
    }
    function setPlaying(v) {
      playing = v; btn.textContent = v ? '일시정지' : '재생';
      if (v) { const ph = Math.acos(clamp(1 - 4 * r, -1, 1)) / (2 * Math.PI); t0 = performance.now() - ph * PERIOD; raf = requestAnimationFrame(loop); }
      else cancelAnimationFrame(raf);
    }
    btn.addEventListener('click', () => setPlaying(!playing));
    rIn.addEventListener('input', () => { if (playing) setPlaying(false); r = +rIn.value; render(); });
    window.addEventListener('resize', render);
    // start only when visible
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting && playing && !raf) { t0 = performance.now(); raf = requestAnimationFrame(loop); }
      else if (!e.isIntersecting && raf) { cancelAnimationFrame(raf); raf = null; }
    }));
    io.observe(cv);
    if (!playing) { btn.textContent = '재생'; r = 0.35; rIn.value = r; }
    render();
  }

  /* ---------------- Results chart ---------------- */
  // Table 1 of the TTM draft (Tanks and Temples, H100, BF16)
  const METHODS = [
    { key: 'ttm', name: 'TTM (Ours)', color: 'var(--s1)' },
    { key: 'van', name: 'Vanilla VGGT', color: 'var(--s2)' },
    { key: 'noepi', name: 'TTM w/o epi.', color: 'var(--s3)' },
    { key: 'lite', name: 'LiteVGGT', color: 'var(--s4)' },
  ];
  const SCENES = ['Barn', 'Caterpillar', 'Ignatius', 'Meetingroom', 'Truck', 'Average'];
  // [f1x5, f1x10, auc30, time, mem]
  const DATA = {
    Barn: { van: [48.1, 72.7, 91.2, 319.5, 83.7], ttm: [50.1, 74.0, 91.2, 41.2, 38.5], noepi: [42.0, 70.8, 89.0, 29.6, 35.8], lite: [28.1, 50.2, 89.2, 10.7, 17.9] },
    Caterpillar: { van: [32.6, 50.0, 93.5, 279.5, 78.5], ttm: [33.0, 50.3, 93.2, 36.5, 36.4], noepi: [28.1, 46.8, 91.6, 26.3, 33.9], lite: [35.9, 53.3, 91.8, 9.9, 16.7] },
    Ignatius: { van: [66.7, 78.1, 98.1, 132.5, 55.5], ttm: [67.2, 78.5, 98.1, 19.2, 27.1], noepi: [51.6, 66.4, 97.0, 13.7, 25.4], lite: [31.3, 52.6, 99.2, 7.1, 12.2] },
    Meetingroom: { van: [58.1, 72.4, 97.3, 262.1, 76.2], ttm: [57.8, 72.1, 97.0, 34.8, 35.5], noepi: [57.6, 74.0, 95.7, 24.7, 33.0], lite: [44.4, 65.0, 92.9, 9.7, 16.4] },
    Truck: { van: [69.1, 84.4, 99.6, 120.9, 53.2], ttm: [69.1, 84.3, 99.6, 17.8, 26.2], noepi: [59.9, 80.2, 99.2, 12.7, 24.5], lite: [39.6, 60.4, 99.2, 7.0, 11.9] },
    Average: { van: [54.9, 71.5, 95.9, 222.9, 69.4], ttm: [55.4, 71.8, 95.8, 29.9, 32.7], noepi: [47.8, 67.6, 94.5, 21.4, 30.5], lite: [35.9, 56.3, 94.4, 8.9, 15.0] },
  };
  const METRICS = [
    { name: 'F1 @×5 ↑', unit: '%' }, { name: 'F1 @×10 ↑', unit: '%' }, { name: 'Pose AUC@30° ↑', unit: '%' },
    { name: '시간 ↓', unit: 's' }, { name: '최대 메모리 ↓', unit: 'GB' },
  ];
  const niceMax = (v) => { const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; };
  const barPath = (x, y, w, h, r = 4) => { r = Math.min(r, h, w / 2); return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`; };

  function legend(container, items) {
    container.innerHTML = items.map((m) => `<span><i class="key" style="background:${m.color}"></i>${m.name}</span>`).join('');
  }

  function results() {
    const svg = $('#res-chart'); if (!svg) return;
    const tabs = $('#metric-tabs');
    legend($('#res-legend'), METHODS);
    let metric = 0;
    METRICS.forEach((m, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.role = 'tab'; b.textContent = m.name; b.setAttribute('aria-selected', i === 0);
      b.addEventListener('click', () => { metric = i; [...tabs.children].forEach((c, j) => c.setAttribute('aria-selected', j === i)); draw(); });
      tabs.appendChild(b);
    });
    const W = 900, H = 320, ML = 44, MR = 8, MT = 16, MB = 36;
    function draw() {
      svg.innerHTML = '';
      const vals = SCENES.flatMap((s) => METHODS.map((m) => DATA[s][m.key][metric]));
      const max = niceMax(Math.max(...vals));
      const y = (v) => MT + (H - MT - MB) * (1 - v / max);
      for (let i = 0; i <= 4; i++) {
        const v = max * i / 4;
        el('path', { d: `M${ML},${y(v)} H${W - MR}`, stroke: 'var(--grid)', 'stroke-width': 1 }, svg);
        el('text', { x: ML - 8, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 11, class: 't-muted', text: +v.toFixed(1) }, svg);
      }
      const gw = (W - ML - MR) / SCENES.length, bw = 22, bg = 2, total = METHODS.length * bw + (METHODS.length - 1) * bg;
      SCENES.forEach((s, si) => {
        const sName = s === 'Average' ? '평균' : s;
        const gx = ML + si * gw + (gw - total) / 2;
        el('text', { x: ML + si * gw + gw / 2, y: H - 12, 'text-anchor': 'middle', 'font-size': 12, class: s === 'Average' ? 't-strong' : '', text: sName }, svg);
        METHODS.forEach((m, mi) => {
          const v = DATA[s][m.key][metric], x = gx + mi * (bw + bg);
          const p = el('path', { d: barPath(x, y(v), bw, y(0) - y(v)), fill: m.color }, svg);
          const hit = el('rect', { x: x - 1, y: MT, width: bw + 2, height: y(0) - MT, fill: 'transparent' }, svg);
          hit.addEventListener('pointermove', (ev) => { p.setAttribute('fill-opacity', .75); showTip(`<b>${m.name}</b> · ${sName}<br>${METRICS[metric].name.replace(/ [↑↓]/, '')}: <b>${v} ${METRICS[metric].unit}</b>`, ev); });
          hit.addEventListener('pointerleave', () => { p.setAttribute('fill-opacity', 1); hideTip(); });
          if (s === 'Average' && m.key === 'ttm') {
            el('text', { x: x + bw / 2, y: y(v) - 5, 'text-anchor': 'middle', 'font-size': 10.5, class: 't-strong', text: v }, svg);
          }
        });
      });
      el('path', { d: `M${ML},${y(0)} H${W - MR}`, stroke: 'var(--text-3)', 'stroke-width': 1 }, svg);
    }
    draw();
    // table view
    const tbl = $('#res-table');
    tbl.innerHTML = '<thead><tr><th>장면</th><th>방법</th><th>F1 ×5</th><th>F1 ×10</th><th>AUC@30°</th><th>시간 (s)</th><th>메모리 (GB)</th></tr></thead><tbody>' +
      SCENES.map((s) => ['van', 'ttm', 'noepi', 'lite'].map((k, i) => {
        const m = METHODS.find((mm) => mm.key === k);
        return `<tr class="${k === 'ttm' ? 'ours' : ''}"><td>${i === 0 ? (s === 'Average' ? '평균' : s) : ''}</td><td>${m.name}</td>${DATA[s][k].map((v) => `<td>${v}</td>`).join('')}</tr>`;
      }).join('')).join('') + '</tbody>';
  }

  /* ---------------- Runtime breakdown ---------------- */
  function runtime() {
    const svg = $('#runtime'); if (!svg) return;
    const SEG = [
      { name: 'Epipolar pre-pass (선택)', v: 7.03, sub: 'Pass 0 pose 추정 2.46 s · epipolar 점수 계산 4.57 s', color: 'var(--s4)' },
      { name: 'Embedding + frame attn', v: 1.25, sub: 'patch embedding 0.38 s · frame attention 0.87 s', color: 'var(--s3)' },
      { name: 'Global attn (full 레이어)', v: 4.62, sub: '초기 레이어 + tap 레이어', color: 'var(--s2)' },
      { name: 'Merge 탐색', v: 0.46, sub: '패치 매칭 0.44 s · positional embedding 재구성 0.02 s', color: 'var(--s5)' },
      { name: 'KV-asymmetric attn', v: 6.53, sub: 'merge가 적용된 global 레이어 20개', color: 'var(--s1)' },
      { name: 'Head', v: 0.61, sub: 'depth 0.34 · point 0.26 · camera 0.01 s', color: 'var(--s6)' },
    ];
    legend($('#rt-legend'), SEG);
    const total = SEG.reduce((a, s) => a + s.v, 0), X0 = 0, W = 900, Y = 30, H = 40, GAP = 2;
    let x = X0;
    SEG.forEach((s, i) => {
      const w = (W - GAP * (SEG.length - 1)) * s.v / total;
      const r = el('rect', { x, y: Y, width: w, height: H, rx: i === 0 || i === SEG.length - 1 ? 4 : 0, fill: s.color }, svg);
      r.addEventListener('pointermove', (ev) => { r.setAttribute('fill-opacity', .8); showTip(`<b>${s.name}</b>: ${s.v.toFixed(2)} s (${(100 * s.v / total).toFixed(1)}%)<br>${s.sub}`, ev); });
      r.addEventListener('pointerleave', () => { r.setAttribute('fill-opacity', 1); hideTip(); });
      if (w > 70) el('text', { x: x + 8, y: Y + H / 2 + 4, 'font-size': 12, style: 'fill:#fff;font-weight:600;pointer-events:none', text: s.v.toFixed(2) + ' s' }, svg);
      x += w + GAP;
    });
    el('text', { x: 0, y: 18, 'font-size': 12, class: 't-strong', text: `전체 ${total.toFixed(2)} s  ·  핵심 방법만 ${(total - 7.03).toFixed(2)} s` }, svg);
    el('text', { x: 0, y: Y + H + 24, 'font-size': 11.5, class: 't-muted', text: '구간에 마우스를 올리면 세부 항목이 보입니다. 같은 장면에서 vanilla VGGT는 132.5 s.' }, svg);
  }

  /* ---------------- Real attention-map viewer ---------------- */
  function attentionViewer() {
    const input = $('#attn-in'); if (!input) return;
    const img = $('#attn-img'), out = $('#attn-out'), kind = $('#attn-kind'), desc = $('#attn-desc');
    // pattern read off the maps in Video-VGGT/attention_map
    const KIND = {
      spread: ['넓게 퍼진 attention', '대부분의 query가 많은 key에 attention을 고르게 나눠 줍니다. 아직 지역적인 저수준 특징을 섞는 단계입니다.'],
      hub: ['세로 줄무늬: 소수의 hub key에 집중', '거의 모든 query가 같은 몇 개의 key(세로 줄)를 봅니다. query마다 보는 대상이 비슷하므로, K/V를 줄여도 영향이 적은 구간입니다.'],
      diag: ['대각선: 프레임 간 대응', '각 프레임 블록 안에 대각선이 나타납니다. query가 다른 프레임에 있는 자기 짝 패치를 콕 집어 보는 것으로, 모델이 프레임 사이의 대응 관계를 직접 찾고 있다는 뜻입니다. query마다 서로 다른 key를 보는 heterogeneous 구간이라, 이 구간의 K/V를 많이 줄이면 대응 정보가 손실될 위험이 큽니다.'],
      mixed: ['hub + 대각선 혼합', 'hub 열과 프레임 간 대각선이 함께 보입니다. 대응 정보가 일부 남아 있는 과도기 레이어입니다.'],
    };
    const LAYER = ['spread', 'spread', 'hub', 'hub', 'hub', 'hub', 'hub', 'hub', 'hub', 'hub',
      'diag', 'diag', 'diag', 'diag', 'diag', 'diag', 'mixed', 'hub', 'hub', 'hub', 'hub', 'mixed', 'hub', 'hub'];
    // preload
    for (let l = 0; l < 24; l++) { const im = new Image(); im.src = `static/img/attention/S${String(l).padStart(2, '0')}.webp`; }
    const tabs = $('#attn-tabs');
    const JUMPS = [['초기 L2', 2], ['중간 L12', 12], ['후기 L19', 19]];
    function show(l) {
      input.value = l;
      const id = 'L' + String(l).padStart(2, '0');
      img.src = `static/img/attention/S${id.slice(1)}.webp`;
      $('#attn-full').href = `static/img/attention/${id}.webp`;
      img.alt = `VGGT global block ${l} attention map`;
      out.textContent = id + (TAPS.includes(l) ? ' · DPT tap' : '');
      const [k, d] = KIND[LAYER[l]];
      kind.textContent = k; desc.textContent = d;
      [...tabs.children].forEach((b) => b.setAttribute('aria-selected', +b.dataset.l === l));
    }
    JUMPS.forEach(([t, l]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = t; b.dataset.l = l;
      b.addEventListener('click', () => show(l));
      tabs.appendChild(b);
    });
    input.addEventListener('input', () => show(+input.value));
    show(12);
  }

  /* ---------------- Layer schedule ---------------- */
  function schedule() {
    const svg = $('#sched'); if (!svg) return;
    const inMid = (l) => l >= 11 && l <= 15;
    const base = (l) => (l < 5 || TAPS.includes(l)) ? 0 : 1;
    const SCHED = [
      { name: 'Uniform', f: (l) => base(l) },
      { name: 'Mid-conservative (probe)', f: (l) => base(l) * (inMid(l) ? 0.3 : 1) },
      { name: 'Mid-aggressive', f: (l) => base(l) * (inMid(l) ? 1 : 0.3) },
    ];
    const tabs = $('#sched-tabs');
    let cur = 1;
    SCHED.forEach((s, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.role = 'tab'; b.textContent = s.name; b.setAttribute('aria-selected', i === cur);
      b.addEventListener('click', () => { cur = i; [...tabs.children].forEach((c, j) => c.setAttribute('aria-selected', j === i)); draw(); });
      tabs.appendChild(b);
    });
    const W = 900, H = 200, ML = 40, MT = 14, MB = 40;
    const bars = [];
    const y = (v) => MT + (H - MT - MB) * (1 - v);
    [0, 0.5, 1].forEach((v) => {
      el('path', { d: `M${ML},${y(v)} H${W}`, stroke: 'var(--grid)' }, svg);
      el('text', { x: ML - 8, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 11, class: 't-muted', text: v }, svg);
    });
    el('text', { x: ML - 30, y: MT + 60, 'font-size': 11, class: 't-muted', transform: `rotate(-90 ${ML - 30} ${MT + 60})`, 'text-anchor': 'middle', text: 'αℓ' }, svg);
    const bw = 24, slot = (W - ML) / 24;
    for (let l = 0; l < 24; l++) {
      const x = ML + l * slot + (slot - bw) / 2;
      bars.push(el('path', { fill: 'var(--s1)' }, svg));
      el('text', { x: x + bw / 2, y: H - MB + 16, 'text-anchor': 'middle', 'font-size': 10, class: TAPS.includes(l) ? 't-strong mono' : 'mono t-muted', text: l }, svg);
      if (TAPS.includes(l) || l < 5) el('text', { x: x + bw / 2, y: y(0) - 6, 'text-anchor': 'middle', 'font-size': 9, class: 't-muted', text: TAPS.includes(l) ? 'tap' : 'full' }, svg);
    }
    el('rect', { x: ML + 11 * slot, y: MT - 4, width: 5 * slot, height: H - MT - MB + 4, fill: 'var(--accent)', 'fill-opacity': .07 }, svg).parentNode.insertBefore(svg.lastChild, svg.firstChild);
    el('text', { x: ML + 13.5 * slot, y: H - 6, 'text-anchor': 'middle', 'font-size': 11, text: 'heterogeneous 중간 구간 (probe)' }, svg);
    el('path', { d: `M${ML},${y(0)} H${W}`, stroke: 'var(--text-3)' }, svg);
    function draw() {
      for (let l = 0; l < 24; l++) {
        const v = SCHED[cur].f(l), x = ML + l * slot + (slot - bw) / 2;
        bars[l].setAttribute('d', v > 0 ? barPath(x, y(v), bw, y(0) - y(v)) : '');
      }
    }
    draw();
  }

  function init() {
    renderMath();
    hero(); explorer(); pipeline(); asym(); mergeUnmergeAnim(); resolutionDemo(); layers(); epipolar(); results(); runtime(); attentionViewer(); schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
