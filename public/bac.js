// Widmark no cliente — pra preview ao vivo do BAC enquanto adiciona bebidas.
// gramas de álcool = ml × (%abv/100) × 0,789 (densidade do etanol)
(function () {
  const DENS = 0.789, BETA = 0.15;
  window.BAC = {
    gramas(ml, abv, qtd = 1) { return ml * (abv / 100) * DENS * qtd; },
    totalItens(itens) { return (itens || []).reduce((s, i) => s + this.gramas(i.ml, i.abv, i.qtd || 1), 0); },
    // pico = sem descontar eliminação (se parasse de beber agora)
    pico(totalGramas, cfg) {
      const p = Number(cfg && cfg.peso_kg), r = Number(cfg && cfg.r);
      return p > 0 && r > 0 ? Math.max(0, totalGramas / (r * p)) : 0;
    },
    comTempo(totalGramas, cfg, horas) {
      return Math.max(0, this.pico(totalGramas, cfg) - BETA * Math.max(0, horas || 0));
    },
  };
})();
