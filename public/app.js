// Cupido — front (modelo rolê -> leads + bebidas). Auth, roteamento, render, CRUD.
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const state = {
    metrics: null, leads: [], cantadas: [], locais: [], bebidas: [], config: null,
    roles: [], alcoolRoleId: null, alcoolResumo: null, view: 'dashboard', busca: '',
  };

  const COR_CARAC = { Morena:'#5a3b30', Loira:'#e0a92e', Ruiva:'#d05a2e', Castanha:'#8a5a3c', Outras:'#b9aca6' };
  const STATUS_LABEL = { convertida:'Convertida', em_conversa:'Em conversa', fora:'Fora' };
  const CARAC_OPTS = ['Morena','Loira','Ruiva','Castanha','Outras'];
  const STATUS_OPTS = [['convertida','Convertida'],['em_conversa','Em conversa'],['fora','Fora']];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  async function api(path, opts = {}) {
    const res = await fetch(path, { credentials: 'same-origin', ...opts });
    if (res.status === 401) { mostrarLogin(); throw new Error('nao_autenticado'); }
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('json') ? await res.json() : null;
    if (!res.ok) throw new Error((data && data.error) || res.statusText);
    return data;
  }
  const jpost = (url, obj, method = 'POST') =>
    api(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

  // ---------- TEMA / TOAST ----------
  const aplicarTema = (t) => { document.documentElement.setAttribute('data-theme', t); try { localStorage.setItem('cupido-theme', t); } catch (e) {} };
  const temaAtual = () => { try { return localStorage.getItem('cupido-theme') || 'light'; } catch (e) { return 'light'; } };
  let toastT;
  function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2400); }

  // ---------- HELPERS ----------
  const MESES_ABR = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const DIAS_ABR = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const p2 = (n) => String(n).padStart(2, '0');
  const paraInputLocal = (d) => `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
  const horaDeISO = (iso) => { const d = new Date(iso); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
  const fmtBac = (v) => String(Number(v || 0).toFixed(2)).replace('.', ',');
  function formataDataCurta(dstr) { if (!dstr) return '—'; const [y,mo,d] = dstr.split('-'); const dt = new Date(+y, +mo-1, +d); return `${DIAS_ABR[dt.getDay()]} ${d}/${mo}`; }
  const hojeInputDate = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`; };
  const roleLabel = (r) => `${formataDataCurta(r.data)} · ${r.local || 'sem local'}`;

  // reduz a foto (maior lado ≤1024px, JPEG ~0.7) respeitando a orientação do celular —
  // deixa o upload leve e o storage do banco pequeno. Cai no arquivo original se algo falhar.
  async function comprimirFoto(file) {
    try {
      if (!file || !/^image\//.test(file.type)) return file;
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
      const max = 1024;
      let w = bmp.width, h = bmp.height;
      if (Math.max(w, h) > max) { const s = max / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.7));
      return blob ? new File([blob], 'foto.jpg', { type: 'image/jpeg' }) : file;
    } catch (e) { return file; }
  }

  // ---------- LOGIN ----------
  const mostrarLogin = () => { $('#app').classList.add('hidden'); $('#fab').style.display = 'none'; $('#login').style.display = 'flex'; };
  const mostrarApp = () => { $('#login').style.display = 'none'; $('#app').classList.remove('hidden'); $('#fab').style.display = 'flex'; };

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault(); $('#login-err').textContent = '';
    try { await jpost('/api/login', { email: $('#login-email').value.trim(), password: $('#login-pass').value }); await iniciarApp(); }
    catch (err) { $('#login-err').textContent = 'E-mail ou senha incorretos.'; }
  });
  $('#btn-logout').addEventListener('click', async () => { try { await api('/api/logout', { method: 'POST' }); } catch (e) {} mostrarLogin(); });

  // ---------- DADOS ----------
  async function recarregar() {
    const [metrics, leads, cantadas, locais, bebidas, config, roles] = await Promise.all([
      api('/api/metrics'), api('/api/leads'), api('/api/cantadas'),
      api('/api/locais'), api('/api/bebidas'), api('/api/configuracoes'), api('/api/roles'),
    ]);
    Object.assign(state, { metrics, leads, cantadas, locais, bebidas, config, roles });
    if (!state.alcoolRoleId || !roles.find((r) => r.id === state.alcoolRoleId))
      state.alcoolRoleId = (metrics.alcool && metrics.alcool.role_id) || (roles[0] && roles[0].id) || null;
    state.alcoolResumo = state.alcoolRoleId ? await api('/api/consumo?role_id=' + state.alcoolRoleId) : null;
  }
  async function iniciarApp() { mostrarApp(); await recarregar(); montarTopo(); render(); }
  function montarTopo() {
    const now = new Date(), h = now.getHours();
    $('#greeting').textContent = (h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite') + ', Pi';
    $('#today-pill').textContent = `${DIAS_ABR[now.getDay()]}, ${p2(now.getDate())} ${MESES_ABR[now.getMonth()].replace(/^./,c=>c.toUpperCase())} · ${now.getFullYear()}`;
  }

  // ---------- NAV ----------
  document.querySelectorAll('.nav-item[data-view]').forEach((btn) => btn.addEventListener('click', () => {
    state.view = btn.getAttribute('data-view');
    document.querySelectorAll('.nav-item[data-view]').forEach((b) => b.classList.toggle('active', b === btn));
    render();
  }));
  $('#theme-toggle').addEventListener('click', () => aplicarTema(temaAtual() === 'light' ? 'dark' : 'light'));
  $('#search').addEventListener('input', (e) => { state.busca = e.target.value.trim().toLowerCase(); if (state.view === 'leads' || state.view === 'conversoes') render(); });
  $('#fab').addEventListener('click', () => abrirModalLead(null));

  // ---------- RENDER ----------
  function render() {
    const root = $('#view-root');
    const v = state.view;
    if (v === 'dashboard') root.innerHTML = viewDashboard();
    else if (v === 'roles') root.innerHTML = viewRoles();
    else if (v === 'leads') root.innerHTML = viewLeads('Leads — Abordagens', state.leads);
    else if (v === 'conversoes') root.innerHTML = viewLeads('Conversões', state.leads.filter((l) => l.status === 'convertida'));
    else if (v === 'cantadas') root.innerHTML = viewCantadas();
    else if (v === 'locais') root.innerHTML = viewLocais();
    else if (v === 'config') root.innerHTML = viewConfig();
    wire(root);
  }

  // ---------- DASHBOARD ----------
  function viewDashboard() {
    const m = state.metrics;
    const diasMes = new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).getDate();
    const porDia = (m.kpis.abordagensMes / diasMes).toFixed(1).replace('.', ',');
    const kpi = (label, num, foot) => `<div class="kpi"><div class="kpi-label">${label}</div>
      <div class="kpi-row"><div class="kpi-num">${num}</div></div><div class="kpi-foot">${foot}</div></div>`;

    const rr = state.alcoolResumo;
    const bac = rr ? rr.bac : 0;
    const fracBac = Math.max(0, Math.min(1, bac / 0.4));
    const zona = bac < 0.15 ? ['Zona ótima','tag-good','Confiança ideal para abordar']
      : bac < 0.25 ? ['Cuidado','tag-danger','Já foi longe demais'] : ['Perigo','tag-danger','Chame um Uber'];
    const roleOpts = state.roles.map((r) => `<option value="${r.id}" ${state.alcoolRoleId===r.id?'selected':''}>${esc(roleLabel(r))}</option>`).join('');
    const bevTags = rr && rr.itens.length ? rr.itens.map((i) => `<span class="bev-tag">${i.qtd}× ${esc(i.nome)}</span>`).join('') : '';
    const aoVivo = rr && rr.aoVivo;

    const totalConq = m.donut.reduce((s,d)=>s+d.n,0);
    const donutData = m.donut.map((d) => ({ ...d, cor: COR_CARAC[d.caracteristica] || '#b9aca6' }));
    const legend = donutData.map((d) => `<div class="legend-item"><span class="sw" style="background:${d.cor}"></span>
      <span style="font-weight:600">${esc(d.caracteristica)}</span>
      <span class="val">${d.n} · ${Math.round(100*d.n/(totalConq||1))}%</span></div>`).join('');
    const maxLocal = Math.max(1, ...m.locais.map((l) => l.n));
    const locais = m.locais.map((l, i) => `<div><div class="rank-head"><span class="rank-num">${i+1}</span>
      <span style="font-weight:600">${esc(l.local)}</span><span class="rank-val">${l.n}</span></div>
      <div class="bar"><span style="width:${Math.round(100*l.n/maxLocal)}%"></span></div></div>`).join('');
    const melhor = m.melhorHorario && m.melhorHorario[0];
    const melhorTxt = melhor ? `Melhor horário: ${p2(melhor.hora)}h` : '';
    const cantadas = m.cantadas.map((c) => { const cls = c.taxa>=60?'var(--good)':c.taxa>=45?'var(--warn)':'var(--danger)';
      return `<div><div style="display:flex;align-items:baseline;gap:10px;margin-bottom:7px">
        <span class="cantada-txt">"${esc(c.texto)}"</span><span class="cantada-taxa" style="color:${cls}">${c.taxa}%</span></div>
        <div class="bar"><span style="width:${c.taxa}%;background:${cls}"></span></div></div>`; }).join('');

    return `
    <section class="kpi-grid">
      ${kpi('Abordagens no mês', m.kpis.abordagensMes, `${porDia} tentativas por dia`)}
      ${kpi('Conversões', m.kpis.conversoesMes, 'Números conseguidos este mês')}
      ${kpi('Taxa de conversão', m.kpis.taxa + '%', `${m.kpis.conversoesMes} de ${m.kpis.abordagensMes} abordagens`)}
      ${kpi('Cantadas usadas', m.kpis.cantadasUsadas, 'Repertório em uso')}
    </section>

    <section class="gauge-grid">
      <div class="card flexcol">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
          <div><div class="card-title">Nível de Álcool no Rolê</div>
            <div class="card-sub">BAC estimado (Widmark)</div></div>
          ${aoVivo ? '<span class="live"><span class="dot"></span>AO VIVO</span>'
            : '<select class="role-select" id="alcool-role">'+roleOpts+'</select>'}</div>
        ${aoVivo ? `<div style="margin-top:8px"><select class="role-select" id="alcool-role" style="max-width:100%">${roleOpts}</select></div>` : ''}
        <div style="width:100%;max-width:224px;margin:14px auto 0">${Charts.speedo(fracBac)}</div>
        <div class="center" style="margin-top:2px">
          <div class="big-num">${fmtBac(bac)}</div>
          <div style="font-size:11px;color:var(--text-3);margin-top:4px">g/L · ${rr?rr.doses:0} dose(s)${rr&&rr.role.local?' · '+esc(rr.role.local):''}</div></div>
        <div class="role-bev">${bevTags}</div>
        <div style="margin-top:14px;display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap">
          <span class="tag ${zona[1]}">${zona[0]}</span>
          <button class="mini-btn" id="alcool-add" ${state.alcoolRoleId?'':'disabled'}>+ Bebida</button></div>
      </div>

      <div class="card flexcol">
        <div class="card-title">Meta do Mês</div><div class="card-sub">Objetivo de conversões</div>
        <div style="position:relative;width:150px;margin:16px auto 0">${Charts.metaGauge(m.meta.pct)}
          <div class="donut-center"><div class="big-num" style="color:var(--accent)">${Math.round(m.meta.pct*100)}%</div>
            <div style="font-size:11.5px;color:var(--text-2);margin-top:4px">${m.meta.atual} / ${m.meta.alvo}</div></div></div>
        <div style="margin-top:auto;padding-top:16px" class="center card-sub">Faltam
          <b style="color:var(--text)">${Math.max(0, m.meta.alvo - m.meta.atual)} conquistas</b> para bater a meta</div>
      </div>

      <div class="card">
        <div class="card-title">Por Característica</div><div class="card-sub">Distribuição das conquistas</div>
        <div class="donut-wrap"><div class="donut-svg">${Charts.donut(donutData)}
          <div class="donut-center"><div class="big-num" style="font-size:28px">${totalConq}</div>
            <div style="font-size:10.5px;color:var(--text-3)">conquistas</div></div></div>
          <div class="legend">${legend || '<span class="card-sub">Sem conquistas ainda</span>'}</div></div>
      </div>
    </section>

    <section class="two-col">
      <div class="card flexcol">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px">
          <div><div class="card-title">Conquistas por mês</div>
            <div class="card-sub">Mulheres conquistadas ao longo de ${new Date().getFullYear()}</div></div>
          ${melhorTxt ? `<span class="tag tag-good">${melhorTxt}</span>` : ''}</div>
        <div style="margin-top:14px;flex:1">${Charts.lineChart(m.linha.atual, m.linha.anterior, m.linha.meses, true)}</div>
      </div>
      <div class="card"><div class="card-title">Top Locais</div>
        <div class="card-sub">Onde as conquistas acontecem</div>
        <div class="rank">${locais || '<span class="card-sub">Sem dados</span>'}</div></div>
    </section>

    <section class="two-col">
      <div class="card" style="padding-bottom:8px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <div><div class="card-title">Leads — Abordagens recentes</div>
            <div class="card-sub">Mulheres abordadas e status atual</div></div>
          <a class="nav-item" style="width:auto;color:var(--accent);font-weight:600;font-size:12.5px" data-goto="leads">Ver todas</a></div>
        ${tabelaLeads(state.leads.slice(0, 6), false)}
      </div>
      <div class="card"><div class="card-title">Cantadas &amp; Taxa de Sucesso</div>
        <div class="card-sub">Repertório ranqueado por conversão</div>
        <div class="cantada-list">${cantadas || '<span class="card-sub">Sem cantadas</span>'}</div></div>
    </section>`;
  }

  // ---------- TABELA DE LEADS ----------
  function tabelaLeads(leads, comAcoes) {
    const linhas = leads.map((l) => {
      const foto = l.foto_path ? `<img class="foto" src="${esc(l.foto_path)}" alt="">` : `<div class="foto foto-ph">foto</div>`;
      const acoes = comAcoes ? `<td><div class="row-actions">
        <button class="mini-btn" data-edit="${l.id}">Editar</button>
        <button class="mini-btn del" data-del="${l.id}">Excluir</button></div></td>` : '';
      return `<tr>
        <td><div style="display:flex;align-items:center;gap:11px">${foto}<span class="mono" style="font-weight:600">${esc(l.codigo || '')}</span></div></td>
        <td data-label="Local">${esc(l.local || '—')}</td>
        <td class="mono" data-label="Horário">${horaDeISO(l.momento)}</td>
        <td data-label="Cantada">${esc(l.cantada_texto || '—')}</td>
        <td data-label="Status" style="text-align:right"><span class="status ${esc(l.status)}">${STATUS_LABEL[l.status] || esc(l.status)}</span></td>
        ${acoes}</tr>`;
    }).join('');
    return `<table class="leads"><thead><tr>
      <th>Pretendente</th><th>Local</th><th>Horário</th><th>Cantada</th><th style="text-align:right">Status</th>${comAcoes?'<th></th>':''}</tr></thead>
      <tbody>${linhas || `<tr><td colspan="${comAcoes?6:5}" class="card-sub" style="padding:20px 8px">Nenhuma abordagem ainda. Clique no + pra registrar.</td></tr>`}</tbody></table>`;
  }
  const filtrar = (leads) => !state.busca ? leads : leads.filter((l) =>
    [l.codigo, l.local, l.cantada_texto, l.caracteristica].some((v) => String(v||'').toLowerCase().includes(state.busca)));
  function viewLeads(titulo, leads) {
    return `<div class="card"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div><div class="card-title">${titulo}</div><div class="card-sub">${leads.length} registro(s) · clique no + pra adicionar</div></div></div>
      ${tabelaLeads(filtrar(leads), true)}</div>`;
  }

  // ---------- ROLÊS ----------
  function viewRoles() {
    const cards = state.roles.map((r) => `<div class="card" style="padding:16px 18px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <div><div class="card-title" style="font-size:15px">${esc(r.local || 'Sem local')}${r.aoVivo?' <span class="tag tag-good" style="font-size:10px">HOJE</span>':''}</div>
          <div class="card-sub">${formataDataCurta(r.data)}${r.titulo?' · '+esc(r.titulo):''}</div></div>
        <div class="row-actions"><button class="mini-btn" data-editrole="${r.id}">Editar</button>
          <button class="mini-btn del" data-delrole="${r.id}">Excluir</button></div></div>
      <div style="display:flex;gap:18px;margin-top:12px;font-size:12.5px;color:var(--text-2)">
        <span><b class="mono" style="color:var(--text)">${r.leads}</b> leads</span>
        <span><b class="mono" style="color:var(--good)">${r.conversoes}</b> conversões</span>
        <span><b class="mono" style="color:var(--text)">${r.doses}</b> doses</span>
        <span>BAC <b class="mono" style="color:var(--accent)">${fmtBac(r.bac)}</b></span></div></div>`).join('');
    return `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <div><div class="card-title">Rolês</div><div class="card-sub">Cada saída com seus leads e bebidas</div></div>
        <button class="btn btn-primary" id="add-role" style="width:auto;padding:10px 16px">+ Novo rolê</button></div>
      <section style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;margin-top:12px">
        ${cards || '<span class="card-sub">Nenhum rolê ainda.</span>'}</section>`;
  }

  // ---------- LOCAIS ----------
  function viewLocais() {
    const rows = state.locais.map((l) => `<div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-top:1px solid var(--border)">
      <span style="font-weight:600">${esc(l.nome)}</span>
      <span class="card-sub">${l.roles} rolê(s)</span>
      <div class="row-actions" style="margin-left:auto"><button class="mini-btn" data-editlocal="${l.id}" data-nome="${esc(l.nome)}">Renomear</button>
        <button class="mini-btn del" data-dellocal="${l.id}">Excluir</button></div></div>`).join('');
    return `<div class="card"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <div><div class="card-title">Locais</div><div class="card-sub">Lugares possíveis de rolê</div></div>
      <button class="btn btn-ghost" id="add-local" style="width:auto;padding:9px 14px">+ Novo local</button></div>
      ${rows || '<span class="card-sub">Sem locais</span>'}</div>`;
  }

  // ---------- CANTADAS ----------
  function viewCantadas() {
    const rows = state.cantadas.map((c) => { const cls = c.taxa>=60?'var(--good)':c.taxa>=45?'var(--warn)':'var(--danger)';
      return `<div style="margin-bottom:16px"><div style="display:flex;align-items:baseline;gap:10px;margin-bottom:7px">
        <span class="cantada-txt">"${esc(c.texto)}"</span><span class="cantada-taxa" style="color:${cls}">${c.taxa}%</span>
        <button class="mini-btn del" data-delcantada="${c.id}" style="margin-left:8px">Excluir</button></div>
        <div class="bar"><span style="width:${c.taxa}%;background:${cls}"></span></div>
        <div class="card-sub" style="margin-top:4px">${c.sucessos}/${c.tentativas} tentativas</div></div>`; }).join('');
    return `<div class="card"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div><div class="card-title">Cantadas &amp; Repertório</div><div class="card-sub">Ranqueadas por taxa de sucesso</div></div>
      <button class="btn btn-ghost" id="add-cantada" style="width:auto;padding:9px 14px">+ Nova cantada</button></div>
      ${rows || '<span class="card-sub">Sem cantadas</span>'}</div>`;
  }

  // ---------- CONFIGURAÇÕES ----------
  function viewConfig() {
    const c = state.config || { peso_kg: 75, sexo: 'homem', meta_mes: 20 };
    const bebRows = state.bebidas.map((b) => `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--border)">
      <span style="font-weight:600">${esc(b.nome)}</span><span class="card-sub">${b.ml}ml · ${b.abv}%</span>
      <div class="row-actions" style="margin-left:auto"><button class="mini-btn" data-editbebida="${b.id}">Editar</button>
        <button class="mini-btn del" data-delbebida="${b.id}">Excluir</button></div></div>`).join('');
    return `<div class="card" style="margin-bottom:20px">
      <div class="card-title">Perfil &amp; Meta</div><div class="card-sub">Usado no cálculo de álcool (Widmark) e na meta</div>
      <div class="cfg-grid">
        <div class="field"><label>Peso (kg)</label><input id="cfg-peso" type="number" min="30" max="250" value="${c.peso_kg}"></div>
        <div class="field"><label>Sexo</label>
          <div class="seg"><button type="button" data-sexo="homem" class="${c.sexo!=='mulher'?'on':''}">Homem</button>
            <button type="button" data-sexo="mulher" class="${c.sexo==='mulher'?'on':''}">Mulher</button></div></div>
        <div class="field"><label>Meta do mês</label><input id="cfg-meta" type="number" min="1" value="${c.meta_mes}"></div>
      </div>
      <div class="modal-actions" style="margin-top:8px"><button class="btn btn-primary" id="cfg-salvar" style="max-width:200px">Salvar</button></div></div>

      <div class="card"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div><div class="card-title">Catálogo de bebidas</div><div class="card-sub">Valores padrão usados no cálculo</div></div>
        <button class="btn btn-ghost" id="add-bebida" style="width:auto;padding:9px 14px">+ Nova bebida</button></div>
        ${bebRows || '<span class="card-sub">Sem bebidas</span>'}</div>`;
  }

  // ---------- WIRE ----------
  function wire(root) {
    root.querySelectorAll('[data-goto]').forEach((el) => el.addEventListener('click', () => {
      const b = document.querySelector(`.nav-item[data-view="${el.getAttribute('data-goto')}"]`); if (b) b.click();
    }));
    root.querySelectorAll('[data-edit]').forEach((el) => el.addEventListener('click', () =>
      abrirModalLead(state.leads.find((l) => String(l.id) === el.getAttribute('data-edit')))));
    root.querySelectorAll('[data-del]').forEach((el) => el.addEventListener('click', async () => {
      if (!confirm('Excluir esta abordagem?')) return;
      await api('/api/leads/' + el.getAttribute('data-del'), { method: 'DELETE' }); await recarregar(); render(); toast('Abordagem excluída');
    }));
    // álcool card
    const alcSel = root.querySelector('#alcool-role');
    if (alcSel) alcSel.addEventListener('change', async () => {
      state.alcoolRoleId = Number(alcSel.value);
      state.alcoolResumo = await api('/api/consumo?role_id=' + state.alcoolRoleId); render();
    });
    const alcAdd = root.querySelector('#alcool-add');
    if (alcAdd) alcAdd.addEventListener('click', () => { if (state.alcoolRoleId) abrirModalBebidas(state.alcoolRoleId); });
    // rolês
    const addRole = root.querySelector('#add-role'); if (addRole) addRole.addEventListener('click', () => abrirModalRole(null));
    root.querySelectorAll('[data-editrole]').forEach((el) => el.addEventListener('click', () =>
      abrirModalRole(state.roles.find((r) => String(r.id) === el.getAttribute('data-editrole')))));
    root.querySelectorAll('[data-delrole]').forEach((el) => el.addEventListener('click', async () => {
      if (!confirm('Excluir este rolê? Os leads e bebidas dele vão junto.')) return;
      await api('/api/roles/' + el.getAttribute('data-delrole'), { method: 'DELETE' }); await recarregar(); render(); toast('Rolê excluído');
    }));
    // locais
    const addLocal = root.querySelector('#add-local'); if (addLocal) addLocal.addEventListener('click', () => abrirModalLocal(null));
    root.querySelectorAll('[data-editlocal]').forEach((el) => el.addEventListener('click', () =>
      abrirModalLocal({ id: el.getAttribute('data-editlocal'), nome: el.getAttribute('data-nome') })));
    root.querySelectorAll('[data-dellocal]').forEach((el) => el.addEventListener('click', async () => {
      if (!confirm('Excluir este local? Os rolês nele ficam sem local.')) return;
      await api('/api/locais/' + el.getAttribute('data-dellocal'), { method: 'DELETE' }); await recarregar(); render(); toast('Local excluído');
    }));
    // cantadas
    const addC = root.querySelector('#add-cantada'); if (addC) addC.addEventListener('click', abrirModalCantada);
    root.querySelectorAll('[data-delcantada]').forEach((el) => el.addEventListener('click', async () => {
      if (!confirm('Excluir esta cantada?')) return;
      await api('/api/cantadas/' + el.getAttribute('data-delcantada'), { method: 'DELETE' }); await recarregar(); render(); toast('Cantada excluída');
    }));
    // config
    const cfgSalvar = root.querySelector('#cfg-salvar');
    if (cfgSalvar) {
      let sexoSel = (state.config && state.config.sexo) || 'homem';
      root.querySelectorAll('[data-sexo]').forEach((b) => b.addEventListener('click', () => {
        sexoSel = b.getAttribute('data-sexo');
        root.querySelectorAll('[data-sexo]').forEach((x) => x.classList.toggle('on', x === b));
      }));
      cfgSalvar.addEventListener('click', async () => {
        await jpost('/api/configuracoes', { peso_kg: Number($('#cfg-peso').value), sexo: sexoSel, meta_mes: Number($('#cfg-meta').value) }, 'PUT');
        await recarregar(); render(); toast('Configurações salvas');
      });
    }
    const addBebida = root.querySelector('#add-bebida'); if (addBebida) addBebida.addEventListener('click', () => abrirModalBebida(null));
    root.querySelectorAll('[data-editbebida]').forEach((el) => el.addEventListener('click', () =>
      abrirModalBebida(state.bebidas.find((b) => String(b.id) === el.getAttribute('data-editbebida')))));
    root.querySelectorAll('[data-delbebida]').forEach((el) => el.addEventListener('click', async () => {
      if (!confirm('Excluir esta bebida do catálogo?')) return;
      try { await api('/api/bebidas/' + el.getAttribute('data-delbebida'), { method: 'DELETE' }); await recarregar(); render(); toast('Bebida excluída'); }
      catch (e) { toast(e.message === 'bebida_em_uso' ? 'Bebida já usada em rolês — não dá pra excluir.' : 'Erro: ' + e.message); }
    }));
  }

  // ---------- QUICK-ADD DE BEBIDAS (reutilizável) ----------
  function drinkChipsHTML(resumo) {
    const byId = {}; (resumo && resumo.itens || []).forEach((i) => byId[i.bebida_id] = i.qtd);
    const chips = state.bebidas.map((b) => `<div class="drink-chip">
      <div style="min-width:0"><div class="nome">${esc(b.nome)}</div><div class="spec">${b.ml}ml · ${b.abv}%</div></div>
      <div class="ctrl"><button type="button" class="round-btn" data-bev-minus="${b.id}">−</button>
        <span class="qtd" data-bev-qtd="${b.id}">${byId[b.id]||0}</span>
        <button type="button" class="round-btn plus" data-bev-plus="${b.id}">+</button></div></div>`).join('');
    return `<div class="drinks-head"><div><div class="card-title" style="font-size:14px">Bebidas do rolê</div>
        <div class="card-sub" data-drinks-doses>${resumo?resumo.doses:0} dose(s)</div></div>
      <div class="drinks-bac"><div class="v" data-drinks-bac>${fmtBac(resumo?resumo.bac:0)}</div><div class="l">g/L estimado</div></div></div>
      <div class="drink-chips">${chips}</div>`;
  }
  function wireDrinkChips(box, getRoleId, onResumo) {
    const upd = (resumo) => {
      box.querySelectorAll('[data-bev-qtd]').forEach((el) => el.textContent = '0');
      (resumo.itens || []).forEach((i) => { const el = box.querySelector(`[data-bev-qtd="${i.bebida_id}"]`); if (el) el.textContent = i.qtd; });
      const d = box.querySelector('[data-drinks-doses]'); if (d) d.textContent = resumo.doses + ' dose(s)';
      const b = box.querySelector('[data-drinks-bac]'); if (b) b.textContent = fmtBac(resumo.bac);
      if (onResumo) onResumo(resumo);
    };
    const act = (url, bebidaId) => async () => {
      const roleId = await getRoleId(); if (!roleId) return;
      try { upd(await jpost(url, { role_id: roleId, bebida_id: Number(bebidaId) })); } catch (e) { toast('Erro: ' + e.message); }
    };
    box.querySelectorAll('[data-bev-plus]').forEach((el) => el.addEventListener('click', act('/api/consumo', el.getAttribute('data-bev-plus'))));
    box.querySelectorAll('[data-bev-minus]').forEach((el) => el.addEventListener('click', act('/api/consumo/remover', el.getAttribute('data-bev-minus'))));
  }

  // ---------- MODAIS (infra) ----------
  function abrirModal(html, onClose) {
    $('#modal-root').innerHTML = `<div class="modal-backdrop" id="mback">${html}</div>`;
    const fechar = () => { if (onClose) { try { onClose(); } catch (e) {} } $('#modal-root').innerHTML = ''; };
    $('#mback').addEventListener('click', (e) => { if (e.target.id === 'mback') fechar(); });
    const c = $('#m-cancel'); if (c) c.addEventListener('click', fechar);
    return fechar;
  }
  const localSelectHTML = (sel) => `<select id="f-local-sel" class="role-select" style="max-width:100%">
      <option value="">escolha o local…</option>
      ${state.locais.map((l) => `<option value="${l.id}" ${sel===l.id?'selected':''}>${esc(l.nome)}</option>`).join('')}
      <option value="novo">+ Novo local</option></select>
    <input id="f-local-novo" class="hidden" placeholder="nome do novo local" style="margin-top:8px;width:100%">`;
  function wireLocalSelect(scope) {
    const sel = $('#f-local-sel', scope), novo = $('#f-local-novo', scope);
    if (sel) sel.addEventListener('change', () => novo.classList.toggle('hidden', sel.value !== 'novo'));
  }
  function localFromInputs(scope) {
    const sel = $('#f-local-sel', scope).value;
    if (sel === 'novo') { const nv = $('#f-local-novo', scope).value.trim(); return nv ? { local_nome: nv } : {}; }
    return sel ? { local_id: Number(sel) } : {};
  }

  // ---------- MODAL: LEAD ----------
  function abrirModalLead(lead) {
    const ed = !!lead;
    let roleAtual = ed ? lead.role_id : ((state.roles[0] && state.roles[0].aoVivo) ? state.roles[0].id : null);
    let roleAutoCriado = null; // rolê criado sob-demanda neste modal (descartar se cancelar sem salvar)
    let criandoRole = null;    // guarda de reentrância (evita criar 2 rolês em cliques rápidos)
    const roleOpts = state.roles.map((r) => `<option value="${r.id}" ${roleAtual===r.id?'selected':''}>${esc(roleLabel(r))}</option>`).join('');
    const optsCarac = CARAC_OPTS.map((c) => `<option ${lead && lead.caracteristica===c?'selected':''}>${c}</option>`).join('');
    const optsStatus = STATUS_OPTS.map(([v,l]) => `<option value="${v}" ${lead && lead.status===v?'selected':''}>${l}</option>`).join('');
    const dl = state.cantadas.map((c) => `<option value="${esc(c.texto)}">`).join('');
    const momento = lead ? paraInputLocal(new Date(lead.momento)) : paraInputLocal(new Date());

    const fechar = abrirModal(`<form class="modal" id="lead-form">
      <h2>${ed ? 'Editar abordagem' : 'Nova abordagem'}</h2>
      <p class="sub">Registre a mulher abordada e o rolê onde rolou.</p>

      <div class="field"><label>Rolê</label>
        <select id="f-role" class="role-select" style="max-width:100%">
          <option value="novo" ${roleAtual==null?'selected':''}>+ Novo rolê</option>${roleOpts}</select>
        <div id="novo-role" class="${roleAtual==null?'':'hidden'}" style="margin-top:10px">
          <div class="grid-2"><div class="field" style="margin:0"><label>Data</label><input id="f-role-data" type="date" value="${hojeInputDate()}"></div>
            <div class="field" style="margin:0"><label>Local</label>${localSelectHTML(null)}</div></div>
          <div id="novo-role-nota" class="hidden card-sub" style="margin-top:6px">Rolê criado. Pra mudar data/local, cancele e recomece.</div></div></div>

      <div class="field"><label>Foto</label>
        <div class="foto-drop" id="foto-drop"><img class="foto-preview hidden" id="foto-preview">
          <div id="foto-hint">Tire ou escolha uma foto${ed?' (opcional)':''}</div></div>
        <div class="foto-btns" style="margin-top:8px">
          <button type="button" class="btn btn-ghost" id="btn-camera">📷 Tirar foto</button>
          <button type="button" class="btn btn-ghost" id="btn-galeria">🖼 Escolher</button></div>
        <input type="file" id="foto-cam" accept="image/*" capture="environment" class="hidden">
        <input type="file" id="foto-gal" accept="image/*" class="hidden">
        <div class="exif-note" id="exif-note"></div></div>

      <div class="grid-2">
        <div class="field"><label>Característica</label><select id="f-carac">${optsCarac}</select></div>
        <div class="field"><label>Status</label><select id="f-status">${optsStatus}</select></div></div>
      <div class="field"><label>Cantada (opcional)</label>
        <input id="f-cantada" list="dl-cantadas" placeholder="escreva ou escolha…" value="${esc(ed && lead.cantada_texto || '')}">
        <datalist id="dl-cantadas">${dl}</datalist></div>
      <div class="field"><label>Data e hora (horário da foto)</label><input id="f-momento" type="datetime-local" value="${momento}"></div>

      <div class="card" style="box-shadow:none;background:var(--card-2);padding:14px 16px;margin-top:4px"><div id="drinks-box">${drinkChipsHTML(null)}</div></div>

      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="m-cancel">Cancelar</button>
        <button type="submit" class="btn btn-primary">${ed ? 'Salvar' : 'Registrar'}</button></div>
    </form>`, () => {
      // cancelou/fechou sem salvar lead: descarta o rolê criado sob-demanda
      if (roleAutoCriado != null) api('/api/roles/' + roleAutoCriado, { method: 'DELETE' }).catch(() => {});
    });

    const form = $('#lead-form');
    wireLocalSelect(form);
    const roleSel = $('#f-role');
    const drinksBox = $('#drinks-box');
    async function refreshDrinks() {
      const resumo = roleAtual ? await api('/api/consumo?role_id=' + roleAtual) : null;
      drinksBox.innerHTML = drinkChipsHTML(resumo);
      wireDrinkChips(drinksBox, garantirRole, null);
    }
    const setNovoRoleDisabled = (v) => {
      const di = $('#f-role-data'); if (di) di.disabled = v;
      const ls = $('#f-local-sel', form); if (ls) ls.disabled = v;
      const ln = $('#f-local-novo', form); if (ln) ln.disabled = v;
      const nota = $('#novo-role-nota'); if (nota) nota.classList.toggle('hidden', !v);
    };
    async function garantirRole() {
      if (roleAtual) return roleAtual;
      if (criandoRole) return criandoRole; // já tem uma criação em andamento
      const data = $('#f-role-data').value;
      if (!data) { toast('Escolha a data do rolê'); return null; }
      criandoRole = (async () => {
        const resumo = await jpost('/api/roles', Object.assign({ data }, localFromInputs(form)));
        roleAtual = resumo.role.id;
        roleAutoCriado = roleAtual;
        setNovoRoleDisabled(true); // trava data/local: mudar depois de criado não teria efeito
        await refreshDrinks();
        return roleAtual;
      })();
      try { return await criandoRole; } finally { criandoRole = null; }
    }
    roleSel.addEventListener('change', async () => {
      // trocar de seleção descarta um rolê recém-criado e não confirmado
      if (roleAutoCriado != null && String(roleAutoCriado) !== roleSel.value) {
        api('/api/roles/' + roleAutoCriado, { method: 'DELETE' }).catch(() => {});
        roleAutoCriado = null; setNovoRoleDisabled(false);
      }
      if (roleSel.value === 'novo') { roleAtual = null; $('#novo-role').classList.remove('hidden'); }
      else { roleAtual = Number(roleSel.value); $('#novo-role').classList.add('hidden'); }
      await refreshDrinks();
    });
    refreshDrinks();

    // foto (câmera + galeria)
    const prev = $('#foto-preview'), hint = $('#foto-hint');
    const cam = $('#foto-cam'), gal = $('#foto-gal');
    if (ed && lead.foto_path) { prev.src = lead.foto_path; prev.classList.remove('hidden'); hint.classList.add('hidden'); }
    $('#btn-camera').addEventListener('click', () => cam.click());
    $('#btn-galeria').addEventListener('click', () => gal.click());
    $('#foto-drop').addEventListener('click', () => gal.click());
    let fotoFile = null;
    const onFoto = async (file) => {
      if (!file) return;
      prev.src = URL.createObjectURL(file); prev.classList.remove('hidden'); hint.classList.add('hidden');
      const dt = await window.lerHorarioDaFoto(file); // EXIF do arquivo ORIGINAL
      if (dt) { $('#f-momento').value = paraInputLocal(dt); $('#exif-note').textContent = '✓ Horário lido da foto (EXIF): ' + dt.toLocaleString('pt-BR'); }
      else { const lm = file.lastModified ? new Date(file.lastModified) : new Date(); $('#f-momento').value = paraInputLocal(lm); $('#exif-note').textContent = 'Foto sem EXIF — usei a data do arquivo. Ajuste se precisar.'; }
      fotoFile = await comprimirFoto(file); // comprime pro upload (leve no mobile e no banco)
    };
    cam.addEventListener('change', () => onFoto(cam.files[0]));
    gal.addEventListener('change', () => onFoto(gal.files[0]));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const roleId = await garantirRole();
      if (!roleId) return;
      const fd = new FormData();
      if (fotoFile) fd.append('foto', fotoFile);
      fd.append('role_id', roleId);
      fd.append('caracteristica', $('#f-carac').value);
      fd.append('cantada_texto', $('#f-cantada').value.trim());
      fd.append('status', $('#f-status').value);
      fd.append('momento', $('#f-momento').value);
      try {
        if (ed) await api('/api/leads/' + lead.id, { method: 'PUT', body: fd });
        else await api('/api/leads', { method: 'POST', body: fd });
        roleAutoCriado = null; // rolê agora tem lead — não descartar no fechar
        fechar(); await recarregar(); render(); toast(ed ? 'Abordagem atualizada' : 'Abordagem registrada 🎯');
      } catch (err) { toast('Erro ao salvar: ' + err.message); }
    });
  }

  // ---------- MODAL: BEBIDAS DE UM ROLÊ (card álcool) ----------
  async function abrirModalBebidas(roleId) {
    const resumo = await api('/api/consumo?role_id=' + roleId);
    abrirModal(`<div class="modal">
      <h2>Bebidas do rolê</h2><p class="sub">${formataDataCurta(resumo.role.data)}${resumo.role.local?' · '+esc(resumo.role.local):''}</p>
      <div id="drinks-box">${drinkChipsHTML(resumo)}</div>
      <div class="modal-actions"><button type="button" class="btn btn-primary" id="m-cancel">Concluir</button></div></div>`,
      async () => { await recarregar(); render(); }); // atualiza o dashboard ao fechar
    wireDrinkChips($('#drinks-box'), async () => roleId, null);
  }

  // ---------- MODAL: ROLÊ ----------
  function abrirModalRole(role) {
    const ed = !!role;
    const fechar = abrirModal(`<form class="modal" id="role-form">
      <h2>${ed ? 'Editar rolê' : 'Novo rolê'}</h2><p class="sub">Uma saída: data + local.</p>
      <div class="grid-2"><div class="field"><label>Data</label><input id="r-data" type="date" value="${ed?role.data:hojeInputDate()}"></div>
        <div class="field"><label>Título (opcional)</label><input id="r-titulo" value="${esc(ed && role.titulo || '')}" placeholder="Sexta na Lux"></div></div>
      <div class="field"><label>Local</label>${localSelectHTML(ed ? role.local_id : null)}</div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" id="m-cancel">Cancelar</button>
        <button type="submit" class="btn btn-primary">${ed?'Salvar':'Criar'}</button></div></form>`);
    const form = $('#role-form'); wireLocalSelect(form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.assign({ data: $('#r-data').value, titulo: $('#r-titulo').value.trim() }, localFromInputs(form));
      try {
        if (ed) await jpost('/api/roles/' + role.id, body, 'PUT'); else await jpost('/api/roles', body);
        fechar(); await recarregar(); render(); toast(ed ? 'Rolê atualizado' : 'Rolê criado');
      } catch (err) { toast('Erro: ' + err.message); }
    });
  }

  // ---------- MODAL: LOCAL ----------
  function abrirModalLocal(local) {
    const ed = !!local;
    const fechar = abrirModal(`<form class="modal" id="local-form">
      <h2>${ed ? 'Renomear local' : 'Novo local'}</h2>
      <div class="field"><label>Nome</label><input id="l-nome" value="${esc(ed && local.nome || '')}" placeholder="Balada Lux" required></div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" id="m-cancel">Cancelar</button>
        <button type="submit" class="btn btn-primary">${ed?'Salvar':'Criar'}</button></div></form>`);
    $('#local-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        if (ed) await jpost('/api/locais/' + local.id, { nome: $('#l-nome').value.trim() }, 'PUT');
        else await jpost('/api/locais', { nome: $('#l-nome').value.trim() });
        fechar(); await recarregar(); render(); toast('Local salvo');
      } catch (err) { toast('Erro: ' + err.message); }
    });
  }

  // ---------- MODAL: CANTADA ----------
  function abrirModalCantada() {
    const fechar = abrirModal(`<form class="modal" id="cantada-form">
      <h2>Nova cantada</h2><p class="sub">Adicione uma frase ao repertório. A taxa de sucesso é calculada automaticamente pelos leads que usam ela.</p>
      <div class="field"><label>Texto</label><input id="c-texto" placeholder="Me empresta o Instagram?" required></div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" id="m-cancel">Cancelar</button>
        <button type="submit" class="btn btn-primary">Adicionar</button></div></form>`);
    $('#cantada-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await jpost('/api/cantadas', { texto: $('#c-texto').value.trim() });
        fechar(); await recarregar(); render(); toast('Cantada adicionada');
      } catch (err) { toast('Erro: ' + err.message); }
    });
  }

  // ---------- MODAL: BEBIDA (catálogo) ----------
  function abrirModalBebida(b) {
    const ed = !!b;
    const fechar = abrirModal(`<form class="modal" id="bebida-form">
      <h2>${ed ? 'Editar bebida' : 'Nova bebida'}</h2><p class="sub">Valores padrão usados no cálculo de álcool.</p>
      <div class="field"><label>Nome</label><input id="b-nome" value="${esc(ed && b.nome || '')}" placeholder="Cerveja" required></div>
      <div class="grid-2"><div class="field"><label>Volume (ml)</label><input id="b-ml" type="number" min="1" value="${ed?b.ml:350}"></div>
        <div class="field"><label>Teor (% álcool)</label><input id="b-abv" type="number" min="0" step="0.5" value="${ed?b.abv:5}"></div></div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" id="m-cancel">Cancelar</button>
        <button type="submit" class="btn btn-primary">${ed?'Salvar':'Adicionar'}</button></div></form>`);
    $('#bebida-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = { nome: $('#b-nome').value.trim(), ml: Number($('#b-ml').value), abv: Number($('#b-abv').value) };
      try {
        if (ed) await jpost('/api/bebidas/' + b.id, payload, 'PUT'); else await jpost('/api/bebidas', payload);
        fechar(); await recarregar(); render(); toast('Bebida salva');
      } catch (err) { toast('Erro: ' + err.message); }
    });
  }

  // ---------- INSTALAR COMO APP (PWA) ----------
  let promptInstalar = null;
  const ehStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
  function renderInstall() {
    const el = $('#install-cta'); if (!el) return;
    if (ehStandalone()) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    if (promptInstalar) {
      el.innerHTML = '<button type="button" class="btn btn-ghost" id="btn-instalar">⤓ Instalar como app</button>';
      $('#btn-instalar').onclick = async () => {
        promptInstalar.prompt();
        try { await promptInstalar.userChoice; } catch (e) {}
        promptInstalar = null; renderInstall();
      };
      el.classList.remove('hidden');
    } else if (ehIOS()) {
      el.innerHTML = '<div class="install-ios">Pra usar como app: toque em <b>Compartilhar</b> e em <b>“Adicionar à Tela de Início”</b>.</div>';
      el.classList.remove('hidden');
    } else { el.classList.add('hidden'); el.innerHTML = ''; }
  }
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); promptInstalar = e; renderInstall(); });
  window.addEventListener('appinstalled', () => { promptInstalar = null; renderInstall(); });

  // ---------- BOOT ----------
  aplicarTema(temaAtual());
  renderInstall();
  (async function boot() { try { await api('/api/me'); await iniciarApp(); } catch (e) { mostrarLogin(); } })();
})();
