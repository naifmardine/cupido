// Charts em SVG puro, portados do design (Dashboard Cupido.dc.html).
// Cada função devolve uma string SVG que é injetada via innerHTML.
(function () {
  const polar = (cx, cy, r, ang) => {
    const a = (ang - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };
  const arc = (cx, cy, r, a0, a1) => {
    const s = polar(cx, cy, r, a0), e = polar(cx, cy, r, a1);
    const large = ((((a1 - a0) % 360) + 360) % 360) > 180 ? 1 : 0;
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
  };

  // Velocímetro de álcool. frac 0..1 (0 = sóbrio, 1 = muito alto).
  function speedo(frac) {
    frac = Math.max(0, Math.min(1, frac));
    const cx = 110, cy = 110, r = 90, sw = 16;
    const seg = (a0, a1, c) =>
      `<path d="${arc(cx, cy, r, a0, a1)}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>`;
    const ang = -90 + frac * 180;
    const nd = polar(cx, cy, r - 26, ang);
    return `<svg viewBox="0 0 220 116" style="width:100%;height:auto;display:block;overflow:visible">
      ${seg(-90, -6, '#2fae72')}
      ${seg(-1, 44, 'var(--warn)')}
      ${seg(49, 90, 'var(--danger)')}
      <line x1="${cx}" y1="${cy}" x2="${nd.x.toFixed(2)}" y2="${nd.y.toFixed(2)}" stroke="var(--text)" stroke-width="4" stroke-linecap="round"/>
      <circle cx="${cx}" cy="${cy}" r="8" fill="var(--card)" stroke="var(--text)" stroke-width="4"/>
    </svg>`;
  }

  // Anel de progresso da meta. pct 0..1.
  function metaGauge(pct) {
    const cx = 80, cy = 80, r = 62, sw = 13;
    const a1 = Math.max(0.02, pct * 360);
    return `<svg viewBox="0 0 160 160" style="width:100%;height:auto;display:block">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--accent-soft)" stroke-width="${sw}"/>
      <path d="${arc(cx, cy, r, 0.01, a1)}" fill="none" stroke="var(--accent)" stroke-width="${sw}" stroke-linecap="round"/>
    </svg>`;
  }

  // Donut de distribuição. data = [{cor, n}], total = soma.
  function donut(data) {
    const cx = 75, cy = 75, r = 56, sw = 22, gap = 5;
    const total = data.reduce((s, d) => s + d.n, 0) || 1;
    let acc = 0;
    const paths = data.map((d) => {
      const frac = d.n / total;
      const a0 = acc + gap / 2, a1 = acc + frac * 360 - gap / 2;
      acc += frac * 360;
      if (a1 <= a0) return '';
      return `<path d="${arc(cx, cy, r, a0, a1)}" fill="none" stroke="${d.cor}" stroke-width="${sw}" stroke-linecap="round"/>`;
    }).join('');
    return `<svg viewBox="0 0 150 150" style="width:100%;height:auto;display:block">${paths}</svg>`;
  }

  // Line chart suavizado: séries "atual" e "anterior" (12 meses cada).
  function lineChart(atual, anterior, meses, showComparison) {
    const W = 680, H = 250, l = 34, rp = 16, tp = 16, bp = 34;
    const pw = W - l - rp, ph = H - tp - bp;
    const maxY = Math.max(5, ...atual, ...anterior, 1) * 1.15;
    const X = (i) => l + i * (pw / 11), Y = (v) => tp + ph * (1 - v / maxY);
    const pts = (a) => a.map((v, i) => ({ x: X(i), y: Y(v) }));
    const smooth = (p) => {
      if (!p.length) return '';
      let d = `M ${p[0].x.toFixed(1)} ${p[0].y.toFixed(1)}`;
      for (let i = 0; i < p.length - 1; i++) {
        const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
        const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
        const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
        d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
      }
      return d;
    };
    const cp = pts(atual), pp = pts(anterior);
    const curLine = smooth(cp);
    const area = curLine + ` L ${X(11).toFixed(1)} ${Y(0).toFixed(1)} L ${X(0).toFixed(1)} ${Y(0).toFixed(1)} Z`;

    const gridVals = [0, 0.25, 0.5, 0.75, 1].map((g) => Math.round(maxY * g));
    const grid = gridVals.map((g) =>
      `<line x1="${l}" y1="${Y(g)}" x2="${W - rp}" y2="${Y(g)}" stroke="var(--border-2)" stroke-width="1"/>
       <text x="${l - 8}" y="${(Y(g) + 3).toFixed(1)}" text-anchor="end" font-size="13" fill="var(--text-3)" font-family="Space Grotesk">${g}</text>`
    ).join('');
    const mlabels = meses.map((m, i) =>
      `<text x="${X(i).toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="14" fill="var(--text-3)">${m}</text>`
    ).join('');
    const dots = cp.map((p) =>
      `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.2" fill="var(--card)" stroke="var(--accent)" stroke-width="2.4"/>`
    ).join('');
    const prevPath = showComparison
      ? `<path d="${smooth(pp)}" fill="none" stroke="var(--text-3)" stroke-width="2" stroke-dasharray="5 5" stroke-linecap="round" opacity="0.75"/>`
      : '';

    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">
      <defs><linearGradient id="lcfill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.26"/>
        <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
      </linearGradient></defs>
      ${grid}
      <path d="${area}" fill="url(#lcfill)" stroke="none"/>
      ${prevPath}
      <path d="${curLine}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}${mlabels}
    </svg>`;
  }

  // Dispersão + curva de tendência (regressão logística). observados=[{x,y0/1}],
  // pontos=[{x,p}] (probabilidade prevista). Eixo Y = probabilidade de conversão.
  function scatterTrend(observados, pontos, xLabel) {
    const xs = (observados || []).map((o) => o.x).concat((pontos || []).map((p) => p.x));
    if (!xs.length) return '';
    const W = 680, H = 275, l = 44, rp = 16, tp = 16, bp = 46, pw = W - l - rp, ph = H - tp - bp;
    const xmin = Math.min(...xs), xmax = Math.max(...xs), span = (xmax - xmin) || 1;
    const X = (x) => l + pw * ((x - xmin) / span);
    const Y = (p) => tp + ph * (1 - Math.max(0, Math.min(1, p)));
    const grid = [0, 0.5, 1].map((g) =>
      `<line x1="${l}" y1="${Y(g)}" x2="${W - rp}" y2="${Y(g)}" stroke="var(--border-2)" stroke-width="1"/>
       <text x="${l - 8}" y="${(Y(g) + 4).toFixed(1)}" text-anchor="end" font-size="13" fill="var(--text-3)" font-family="Space Grotesk">${Math.round(g * 100)}%</text>`).join('');
    const cpath = (pontos || []).map((p, i) => `${i ? 'L' : 'M'} ${X(p.x).toFixed(1)} ${Y(p.p).toFixed(1)}`).join(' ');
    const dots = (observados || []).map((o) =>
      `<circle cx="${X(o.x).toFixed(1)}" cy="${Y(o.y).toFixed(1)}" r="5.5" fill="${o.y ? 'var(--good)' : 'var(--danger)'}" opacity="0.5"/>`).join('');
    const xl = [xmin, (xmin + xmax) / 2, xmax].map((v) =>
      `<text x="${X(v).toFixed(1)}" y="${H - 26}" text-anchor="middle" font-size="13" fill="var(--text-3)">${+v.toFixed(1)}</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">
      ${grid}
      <path d="${cpath}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/>
      ${dots}${xl}
      <text x="${(l + W - rp) / 2}" y="${H - 6}" text-anchor="middle" font-size="12.5" fill="var(--text-2)">${xLabel || ''}</text>
    </svg>`;
  }

  // Curva de álcool (BAC) ao longo do rolê. curva=[{t: ISO, bac}].
  function bacCurve(curva) {
    const c = (curva || []).map((p) => ({ ms: new Date(p.t).getTime(), bac: p.bac }));
    if (c.length < 2) return '';
    const W = 680, H = 200, l = 40, rp = 16, tp = 14, bp = 34, pw = W - l - rp, ph = H - tp - bp;
    const t0 = c[0].ms, t1 = c[c.length - 1].ms, span = (t1 - t0) || 1;
    const maxB = Math.max(0.1, ...c.map((p) => p.bac)) * 1.15;
    const X = (ms) => l + pw * ((ms - t0) / span);
    const Y = (b) => tp + ph * (1 - b / maxB);
    const path = c.map((p, i) => `${i ? 'L' : 'M'} ${X(p.ms).toFixed(1)} ${Y(p.bac).toFixed(1)}`).join(' ');
    const area = path + ` L ${X(t1).toFixed(1)} ${Y(0).toFixed(1)} L ${X(t0).toFixed(1)} ${Y(0).toFixed(1)} Z`;
    const fmt = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    const yg = [0, maxB / 2, maxB].map((g) =>
      `<line x1="${l}" y1="${Y(g)}" x2="${W - rp}" y2="${Y(g)}" stroke="var(--border-2)" stroke-width="1"/>
       <text x="${l - 6}" y="${(Y(g) + 4).toFixed(1)}" text-anchor="end" font-size="12" fill="var(--text-3)" font-family="Space Grotesk">${g.toFixed(1)}</text>`).join('');
    const labels = [t0, (t0 + t1) / 2, t1].map((ms) =>
      `<text x="${X(ms).toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="12" fill="var(--text-3)">${fmt(ms)}</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">
      <defs><linearGradient id="baccfill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.24"/><stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
      ${yg}
      <path d="${area}" fill="url(#baccfill)" stroke="none"/>
      <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      ${labels}
    </svg>`;
  }

  window.Charts = { speedo, metaGauge, donut, lineChart, scatterTrend, bacCurve };
})();
