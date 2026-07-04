// Cupido — servidor Express (API REST + auth). Modelo: rolê -> leads + consumo.
require('dotenv').config();
// fuso do processo em BRT (host serverless roda em UTC) — casa com a data "de hoje"/AO VIVO
process.env.TZ = process.env.TZ || 'America/Sao_Paulo';
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const { query } = require('./db');

const app = express();
const PORT = Number(process.env.PORT) || 3100;
const PROD = process.env.NODE_ENV === 'production';
app.set('trust proxy', 1); // atrás do proxy https do host (cookie secure funciona)

// Credencial do gate (via env — sem default no código pra não vazar em repo público)
const AUTH_EMAIL = process.env.AUTH_EMAIL;
const AUTH_SENHA = process.env.AUTH_SENHA;
if (!AUTH_EMAIL || !AUTH_SENHA) console.warn('AVISO: AUTH_EMAIL/AUTH_SENHA não definidos — login vai negar tudo. Defina no .env.');

// Sessão STATELESS (cookie assinado com HMAC) — funciona em serverless (Vercel) e
// sobrevive a restart/instâncias. SESSION_SECRET deve ser fixo em produção.
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) {
  if (PROD) throw new Error('SESSION_SECRET é obrigatório em produção (sem ele a sessão quebra entre instâncias).');
  console.warn('AVISO: SESSION_SECRET não definido — sessões não sobrevivem a restart. Defina em produção.');
}
const SESSAO_MAX_MS = 30 * 24 * 3600 * 1000; // 30 dias
function assinarSessao(email) {
  const p = Buffer.from(JSON.stringify({ u: email, iat: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(p).digest('base64url');
  return `${p}.${sig}`;
}
function lerSessao(token) {
  if (!token || !token.includes('.')) return null;
  const [p, sig] = token.split('.');
  const esperado = crypto.createHmac('sha256', SESSION_SECRET).update(p).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(esperado);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(p, 'base64url').toString());
    return (Date.now() - d.iat) < SESSAO_MAX_MS ? d : null;
  } catch (e) { return null; }
}

const STATUS_VALIDOS = new Set(['convertida', 'em_conversa', 'fora']);
const manter = (v) => (v === undefined || v === null || v === '') ? null : v;
const posInt = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const hojeStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const DENS_ETANOL = 0.789;
const BETA = 0.15; // g/L eliminados por hora

// ---- uploads (em memória; a foto vai pro banco, não pro disco efêmero) ----
const MIMES_OK = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, MIMES_OK.has(file.mimetype)),
});

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ---- auth ----
function requireAuth(req, res, next) {
  if (lerSessao(req.cookies && req.cookies.cupido_sess)) return next();
  return res.status(401).json({ error: 'nao_autenticado' });
}
app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (AUTH_EMAIL && AUTH_SENHA && email === AUTH_EMAIL && password === AUTH_SENHA) {
    res.cookie('cupido_sess', assinarSessao(email), {
      httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: SESSAO_MAX_MS });
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: 'credencial_invalida' });
});
app.post('/api/logout', (_req, res) => { res.clearCookie('cupido_sess'); res.json({ ok: true }); });
app.get('/api/me', requireAuth, (_req, res) => res.json({ email: AUTH_EMAIL }));
app.get('/health', (_req, res) => res.type('text').send('ok'));

// serve a foto guardada no banco (privada, atrás do login)
app.get('/api/foto/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT mime, bytes FROM fotos WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).end();
    res.set('Content-Type', rows[0].mime || 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=31536000');
    res.send(rows[0].bytes);
  } catch (e) { next(e); }
});

// grava a foto enviada (multipart) no banco e devolve o caminho /api/foto/:id
async function salvarFoto(file) {
  if (!file) return null;
  const { rows } = await query(
    `INSERT INTO fotos (mime, bytes) VALUES ($1, $2) RETURNING id`, [file.mimetype, file.buffer]);
  return `/api/foto/${rows[0].id}`;
}
// apaga as fotos referenciadas (evita órfãs no banco ao excluir lead/rolê ou trocar foto)
const fotoIdDe = (fp) => { const m = String(fp || '').match(/^\/api\/foto\/(\d+)$/); return m ? Number(m[1]) : null; };
async function apagarFotosDe(fotoPaths) {
  const ids = (fotoPaths || []).map(fotoIdDe).filter(Boolean);
  if (ids.length) await query(`DELETE FROM fotos WHERE id = ANY($1)`, [ids]);
}

// ---- helpers de resolução ----
async function resolveLocal(b) {
  if (posInt(b.local_id)) return posInt(b.local_id);
  const nome = (b.local_nome || '').trim();
  if (!nome) return null;
  const { rows } = await query(
    `INSERT INTO locais (nome) VALUES ($1) ON CONFLICT (nome) DO UPDATE SET nome = EXCLUDED.nome RETURNING id`,
    [nome]);
  return rows[0].id;
}
async function resolveCantada(b) {
  if (posInt(b.cantada_id)) return posInt(b.cantada_id);
  const t = (b.cantada_texto || '').trim();
  if (!t) return null;
  const f = await query(`SELECT id FROM cantadas WHERE lower(texto) = lower($1) LIMIT 1`, [t]);
  if (f.rows.length) return f.rows[0].id;
  const ins = await query(`INSERT INTO cantadas (texto) VALUES ($1) RETURNING id`, [t]);
  return ins.rows[0].id;
}
async function resolveRole(b) {
  if (posInt(b.role_id)) return posInt(b.role_id);
  if (!b.data) return null;
  const localId = await resolveLocal(b);
  const { rows } = await query(
    `INSERT INTO roles (data, local_id, titulo) VALUES ($1,$2,$3) RETURNING id`,
    [b.data, localId, b.titulo || null]);
  return rows[0].id;
}

// resumo de um rolê: bebidas, doses, total de gramas e BAC (Widmark)
async function resumoRole(roleId) {
  const rq = await query(
    `SELECT r.id, r.data::text AS data, r.local_id, lo.nome AS local, r.titulo
       FROM roles r LEFT JOIN locais lo ON lo.id = r.local_id WHERE r.id = $1`, [roleId]);
  if (!rq.rows.length) return null;
  const role = rq.rows[0];
  const cfg = (await query(`SELECT peso_kg, r FROM configuracoes WHERE id = 1`)).rows[0] || { peso_kg: 75, r: 0.68 };
  const itensQ = await query(
    `SELECT b.id AS bebida_id, b.nome, b.ml, b.abv, count(*)::int AS qtd,
            min(c.momento) AS primeiro, max(c.momento) AS ultimo
       FROM consumo c JOIN bebidas b ON b.id = c.bebida_id
      WHERE c.role_id = $1 GROUP BY b.id, b.nome, b.ml, b.abv ORDER BY b.ordem`, [roleId]);
  let totalGramas = 0, doses = 0, primeiro = null, ultimo = null;
  const itens = itensQ.rows.map((r) => {
    const gramas = r.ml * (Number(r.abv) / 100) * DENS_ETANOL * r.qtd;
    totalGramas += gramas; doses += r.qtd;
    const p = new Date(r.primeiro), u = new Date(r.ultimo);
    if (!primeiro || p < primeiro) primeiro = p;
    if (!ultimo || u > ultimo) ultimo = u;
    return { bebida_id: r.bebida_id, nome: r.nome, ml: r.ml, abv: Number(r.abv), qtd: r.qtd, gramas: +gramas.toFixed(1) };
  });
  const pesoKg = Number(cfg.peso_kg), rFac = Number(cfg.r);
  const aoVivo = role.data === hojeStr();
  let horas = 0;
  if (primeiro) {
    const ref = aoVivo ? new Date() : (ultimo || primeiro);
    horas = Math.max(0, (ref - primeiro) / 3600000);
  }
  const bruto = pesoKg > 0 ? totalGramas / (rFac * pesoKg) : 0;
  const bac = Math.max(0, bruto - BETA * horas);
  return { role, itens, totalGramas: +totalGramas.toFixed(1), doses, bac: +bac.toFixed(2), aoVivo };
}

// ---- CONFIGURAÇÕES ----
app.get('/api/configuracoes', requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await query(`SELECT peso_kg, sexo, r, meta_mes FROM configuracoes WHERE id = 1`);
    const c = rows[0] || {};
    res.json({ peso_kg: Number(c.peso_kg), sexo: c.sexo, r: Number(c.r), meta_mes: Number(c.meta_mes) });
  } catch (e) { next(e); }
});
app.put('/api/configuracoes', requireAuth, async (req, res, next) => {
  try {
    const b = req.body || {};
    const sexo = b.sexo === 'mulher' ? 'mulher' : 'homem';
    const r = sexo === 'mulher' ? 0.55 : 0.68;
    const peso = Number(b.peso_kg) > 0 ? Number(b.peso_kg) : 75;
    const meta = posInt(b.meta_mes) || 20;
    const { rows } = await query(
      `UPDATE configuracoes SET peso_kg=$1, sexo=$2, r=$3, meta_mes=$4 WHERE id=1
       RETURNING peso_kg, sexo, r, meta_mes`, [peso, sexo, r, meta]);
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// ---- LOCAIS (CRUD) ----
app.get('/api/locais', requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT lo.id, lo.nome, count(r.id)::int AS roles
         FROM locais lo LEFT JOIN roles r ON r.local_id = lo.id
        GROUP BY lo.id, lo.nome ORDER BY lo.nome`);
    res.json(rows);
  } catch (e) { next(e); }
});
app.post('/api/locais', requireAuth, async (req, res, next) => {
  try {
    const nome = (req.body && req.body.nome || '').trim();
    if (!nome) return res.status(400).json({ error: 'nome_obrigatorio' });
    const { rows } = await query(
      `INSERT INTO locais (nome) VALUES ($1) ON CONFLICT (nome) DO UPDATE SET nome=EXCLUDED.nome RETURNING *`, [nome]);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});
app.put('/api/locais/:id', requireAuth, async (req, res, next) => {
  try {
    const nome = (req.body && req.body.nome || '').trim();
    if (!nome) return res.status(400).json({ error: 'nome_obrigatorio' });
    const { rows } = await query(`UPDATE locais SET nome=$1 WHERE id=$2 RETURNING *`, [nome, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'nao_encontrado' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});
app.delete('/api/locais/:id', requireAuth, async (req, res, next) => {
  try { await query(`DELETE FROM locais WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
  catch (e) { next(e); }
});

// ---- BEBIDAS (catálogo CRUD) ----
app.get('/api/bebidas', requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await query(`SELECT id, nome, ml, abv, ordem FROM bebidas ORDER BY ordem, id`);
    res.json(rows.map((r) => ({ ...r, abv: Number(r.abv) })));
  } catch (e) { next(e); }
});
app.post('/api/bebidas', requireAuth, async (req, res, next) => {
  try {
    const { nome, ml, abv, ordem = 99 } = req.body || {};
    if (!nome || !(Number(ml) > 0) || !(Number(abv) >= 0)) return res.status(400).json({ error: 'dados_invalidos' });
    const { rows } = await query(
      `INSERT INTO bebidas (nome, ml, abv, ordem) VALUES ($1,$2,$3,$4) RETURNING *`,
      [String(nome).trim(), Number(ml), Number(abv), Number(ordem)]);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});
app.put('/api/bebidas/:id', requireAuth, async (req, res, next) => {
  try {
    const b = req.body || {};
    const { rows } = await query(
      `UPDATE bebidas SET nome=COALESCE($1,nome), ml=COALESCE($2,ml), abv=COALESCE($3,abv), ordem=COALESCE($4,ordem)
        WHERE id=$5 RETURNING *`,
      [manter(b.nome), b.ml != null ? Number(b.ml) : null, b.abv != null ? Number(b.abv) : null,
       b.ordem != null ? Number(b.ordem) : null, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'nao_encontrada' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});
app.delete('/api/bebidas/:id', requireAuth, async (req, res, next) => {
  try {
    // não apaga bebida já usada em rolês (preservaria histórico/BAC)
    const uso = await query(`SELECT 1 FROM consumo WHERE bebida_id=$1 LIMIT 1`, [req.params.id]);
    if (uso.rows.length) return res.status(409).json({ error: 'bebida_em_uso' });
    await query(`DELETE FROM bebidas WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---- CANTADAS (CRUD) ----
// taxa DERIVADA dos leads (fonte única): tentativas = leads com a cantada, sucessos = convertidas
const CANTADA_SELECT = `
  SELECT c.id, c.texto,
         count(l.id)::int AS tentativas,
         count(l.id) FILTER (WHERE l.status='convertida')::int AS sucessos,
         CASE WHEN count(l.id) > 0
              THEN round(100.0 * count(l.id) FILTER (WHERE l.status='convertida') / count(l.id))
              ELSE 0 END AS taxa
    FROM cantadas c LEFT JOIN leads l ON l.cantada_id = c.id
   GROUP BY c.id, c.texto`;

app.get('/api/cantadas', requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await query(`${CANTADA_SELECT} ORDER BY taxa DESC, tentativas DESC`);
    res.json(rows);
  } catch (e) { next(e); }
});
app.post('/api/cantadas', requireAuth, async (req, res, next) => {
  try {
    const { texto, tentativas = 0, sucessos = 0 } = req.body || {};
    if (!texto) return res.status(400).json({ error: 'texto_obrigatorio' });
    const { rows } = await query(
      `INSERT INTO cantadas (texto, tentativas, sucessos) VALUES ($1,$2,$3) RETURNING *`,
      [String(texto).trim(), Number(tentativas) || 0, Number(sucessos) || 0]);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});
app.put('/api/cantadas/:id', requireAuth, async (req, res, next) => {
  try {
    const { texto, tentativas, sucessos } = req.body || {};
    const { rows } = await query(
      `UPDATE cantadas SET texto=COALESCE($1,texto), tentativas=COALESCE($2,tentativas), sucessos=COALESCE($3,sucessos)
        WHERE id=$4 RETURNING *`,
      [manter(texto), tentativas != null ? Number(tentativas) : null, sucessos != null ? Number(sucessos) : null, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'nao_encontrada' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});
app.delete('/api/cantadas/:id', requireAuth, async (req, res, next) => {
  try { await query(`DELETE FROM cantadas WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
  catch (e) { next(e); }
});

// ---- ROLÊS ----
app.get('/api/roles', requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT r.id, r.data::text AS data, r.titulo, r.local_id, lo.nome AS local,
              count(l.id)::int AS leads,
              count(l.id) FILTER (WHERE l.status='convertida')::int AS conversoes
         FROM roles r LEFT JOIN locais lo ON lo.id=r.local_id LEFT JOIN leads l ON l.role_id=r.id
        GROUP BY r.id, r.data, r.titulo, r.local_id, lo.nome
        ORDER BY r.data DESC, r.id DESC`);
    // anexa doses + bac por rolê
    const out = [];
    for (const r of rows) {
      const resumo = await resumoRole(r.id);
      out.push({ ...r, doses: resumo.doses, bac: resumo.bac, aoVivo: resumo.aoVivo });
    }
    res.json(out);
  } catch (e) { next(e); }
});
app.get('/api/roles/:id', requireAuth, async (req, res, next) => {
  try {
    const resumo = await resumoRole(req.params.id);
    if (!resumo) return res.status(404).json({ error: 'nao_encontrado' });
    const leads = await query(`${LEAD_SELECT} WHERE l.role_id=$1 ORDER BY l.momento DESC`, [req.params.id]);
    res.json({ ...resumo, leads: leads.rows });
  } catch (e) { next(e); }
});
app.post('/api/roles', requireAuth, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.data) return res.status(400).json({ error: 'data_obrigatoria' });
    const roleId = await resolveRole(b);
    res.status(201).json(await resumoRole(roleId));
  } catch (e) { next(e); }
});
app.put('/api/roles/:id', requireAuth, async (req, res, next) => {
  try {
    const b = req.body || {};
    const localId = (b.local_id || b.local_nome) ? await resolveLocal(b) : null;
    const { rows } = await query(
      `UPDATE roles SET data=COALESCE($1,data), titulo=COALESCE($2,titulo), local_id=COALESCE($3,local_id)
        WHERE id=$4 RETURNING id`,
      [manter(b.data), manter(b.titulo), localId, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'nao_encontrado' });
    res.json(await resumoRole(req.params.id));
  } catch (e) { next(e); }
});
app.delete('/api/roles/:id', requireAuth, async (req, res, next) => {
  try {
    const f = await query(`SELECT foto_path FROM leads WHERE role_id=$1`, [req.params.id]);
    await query(`DELETE FROM roles WHERE id=$1`, [req.params.id]); // cascateia leads+consumo
    await apagarFotosDe(f.rows.map((r) => r.foto_path));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---- CONSUMO (bebidas do rolê) ----
app.get('/api/consumo', requireAuth, async (req, res, next) => {
  try {
    const roleId = posInt(req.query.role_id);
    if (!roleId) return res.status(400).json({ error: 'role_id_invalido' });
    const resumo = await resumoRole(roleId);
    if (!resumo) return res.status(404).json({ error: 'rolê_nao_encontrado' });
    res.json(resumo);
  } catch (e) { next(e); }
});
app.post('/api/consumo', requireAuth, async (req, res, next) => {
  try {
    const roleId = posInt(req.body && req.body.role_id);
    const bebidaId = posInt(req.body && req.body.bebida_id);
    if (!roleId || !bebidaId) return res.status(400).json({ error: 'dados_invalidos' });
    await query(`INSERT INTO consumo (role_id, bebida_id) VALUES ($1,$2)`, [roleId, bebidaId]);
    res.status(201).json(await resumoRole(roleId));
  } catch (e) { next(e); }
});
app.post('/api/consumo/remover', requireAuth, async (req, res, next) => {
  try {
    const roleId = posInt(req.body && req.body.role_id);
    const bebidaId = posInt(req.body && req.body.bebida_id);
    if (!roleId || !bebidaId) return res.status(400).json({ error: 'dados_invalidos' });
    await query(
      `DELETE FROM consumo WHERE id = (
         SELECT id FROM consumo WHERE role_id=$1 AND bebida_id=$2 ORDER BY momento DESC, id DESC LIMIT 1)`,
      [roleId, bebidaId]);
    res.json(await resumoRole(roleId));
  } catch (e) { next(e); }
});

// ---- LEADS (CRUD) ----
const LEAD_SELECT = `
  SELECT l.id, l.codigo, l.foto_path, l.caracteristica, l.status, l.momento,
         l.cantada_id, c.texto AS cantada_texto,
         l.role_id, r.data::text AS role_data, r.local_id, lo.nome AS local, r.titulo AS role_titulo
    FROM leads l
    JOIN roles r ON r.id = l.role_id
    LEFT JOIN locais lo ON lo.id = r.local_id
    LEFT JOIN cantadas c ON c.id = l.cantada_id`;

app.get('/api/leads', requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await query(`${LEAD_SELECT} ORDER BY l.momento DESC`);
    res.json(rows);
  } catch (e) { next(e); }
});
app.post('/api/leads', requireAuth, upload.single('foto'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const roleId = await resolveRole(b);
    if (!roleId) return res.status(400).json({ error: 'role_obrigatorio' });
    const fotoPath = await salvarFoto(req.file);
    const momento = b.momento ? new Date(b.momento) : new Date();
    const cantadaId = await resolveCantada(b);
    const status = STATUS_VALIDOS.has(b.status) ? b.status : 'em_conversa';

    const ins = await query(
      `INSERT INTO leads (role_id, foto_path, caracteristica, cantada_id, status, momento)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [roleId, fotoPath, b.caracteristica || null, cantadaId, status, momento]);
    const id = ins.rows[0].id;
    await query(`UPDATE leads SET codigo=$1 WHERE id=$2`, ['#' + String(id).padStart(4, '0'), id]);
    // taxa de cantada é derivada dos leads em tempo real (GET /api/cantadas) — sem contador aqui
    const { rows } = await query(`${LEAD_SELECT} WHERE l.id=$1`, [id]);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});
app.put('/api/leads/:id', requireAuth, upload.single('foto'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const fotoPath = await salvarFoto(req.file);
    let fotoAntiga = null;
    if (fotoPath) {
      const o = await query(`SELECT foto_path FROM leads WHERE id=$1`, [req.params.id]);
      fotoAntiga = o.rows[0] && o.rows[0].foto_path;
    }
    const momento = b.momento ? new Date(b.momento) : null;
    const roleId = posInt(b.role_id);
    const cantadaId = (b.cantada_id || b.cantada_texto) ? await resolveCantada(b) : null;
    const { rows } = await query(
      `UPDATE leads SET
         role_id = COALESCE($1, role_id),
         caracteristica = COALESCE($2, caracteristica),
         cantada_id = COALESCE($3, cantada_id),
         status = COALESCE($4, status),
         momento = COALESCE($5, momento),
         foto_path = COALESCE($6, foto_path)
       WHERE id=$7 RETURNING id`,
      [roleId, manter(b.caracteristica), cantadaId,
       STATUS_VALIDOS.has(b.status) ? b.status : null, momento, fotoPath, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'nao_encontrado' });
    if (fotoPath && fotoAntiga && fotoAntiga !== fotoPath) await apagarFotosDe([fotoAntiga]);
    const out = await query(`${LEAD_SELECT} WHERE l.id=$1`, [req.params.id]);
    res.json(out.rows[0]);
  } catch (e) { next(e); }
});
app.delete('/api/leads/:id', requireAuth, async (req, res, next) => {
  try {
    const f = await query(`SELECT foto_path FROM leads WHERE id=$1`, [req.params.id]);
    await query(`DELETE FROM leads WHERE id=$1`, [req.params.id]);
    await apagarFotosDe(f.rows.map((r) => r.foto_path));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---- MÉTRICAS ----
app.get('/api/metrics', requireAuth, async (_req, res, next) => {
  try {
    const cfg = (await query(`SELECT peso_kg, r, meta_mes FROM configuracoes WHERE id=1`)).rows[0]
      || { meta_mes: 20 };
    const metaAlvo = Number(cfg.meta_mes) || 20;

    // KPIs do mês corrente (por data do rolê)
    const mes = await query(`
      SELECT
        count(l.*) FILTER (WHERE date_trunc('month', r.data) = date_trunc('month', CURRENT_DATE))                       AS abordagens_mes,
        count(l.*) FILTER (WHERE l.status='convertida' AND date_trunc('month', r.data)=date_trunc('month', CURRENT_DATE)) AS conversoes_mes,
        count(DISTINCT l.cantada_id) FILTER (WHERE date_trunc('month', r.data)=date_trunc('month', CURRENT_DATE))       AS cantadas_usadas
      FROM leads l JOIN roles r ON r.id=l.role_id`);
    const m = mes.rows[0];
    const abordagensMes = Number(m.abordagens_mes);
    const conversoesMes = Number(m.conversoes_mes);
    const taxa = abordagensMes > 0 ? Math.round((conversoesMes / abordagensMes) * 100) : 0;

    // álcool: rolê mais recente
    const ultimo = await query(`SELECT id FROM roles ORDER BY data DESC, id DESC LIMIT 1`);
    let alcool = { bac: 0, data: null, aoVivo: false, local: null, doses: 0 };
    if (ultimo.rows.length) {
      const rr = await resumoRole(ultimo.rows[0].id);
      alcool = { role_id: rr.role.id, bac: rr.bac, data: rr.role.data, aoVivo: rr.aoVivo, local: rr.role.local, doses: rr.doses };
    }

    const donutQ = await query(`
      SELECT COALESCE(caracteristica,'Outras') AS caracteristica, count(*) AS n
        FROM leads WHERE status='convertida' GROUP BY 1 ORDER BY n DESC`);
    const locaisQ = await query(`
      SELECT COALESCE(lo.nome,'—') AS local, count(*) AS n
        FROM leads l JOIN roles r ON r.id=l.role_id LEFT JOIN locais lo ON lo.id=r.local_id
       WHERE l.status='convertida' GROUP BY 1 ORDER BY n DESC LIMIT 5`);

    const yr = new Date().getFullYear();
    const linhaQ = await query(`
      SELECT EXTRACT(YEAR FROM r.data)::int AS yr, EXTRACT(MONTH FROM r.data)::int AS mo, count(*) AS n
        FROM leads l JOIN roles r ON r.id=l.role_id
       WHERE l.status='convertida' AND EXTRACT(YEAR FROM r.data)::int IN ($1,$2)
       GROUP BY 1,2`, [yr, yr - 1]);
    const atual = Array(12).fill(0), anterior = Array(12).fill(0);
    for (const r of linhaQ.rows) {
      const idx = Number(r.mo) - 1;
      if (Number(r.yr) === yr) atual[idx] = Number(r.n); else anterior[idx] = Number(r.n);
    }

    const cantadasQ = await query(`${CANTADA_SELECT} ORDER BY taxa DESC, tentativas DESC LIMIT 6`);
    const horaQ = await query(`
      SELECT EXTRACT(HOUR FROM momento)::int AS hora, count(*) AS n
        FROM leads WHERE status='convertida' GROUP BY 1 ORDER BY n DESC`);

    res.json({
      kpis: { abordagensMes, conversoesMes, taxa, cantadasUsadas: Number(m.cantadas_usadas) },
      alcool,
      meta: { alvo: metaAlvo, atual: conversoesMes, pct: Math.min(1, conversoesMes / metaAlvo) },
      donut: donutQ.rows.map((r) => ({ caracteristica: r.caracteristica, n: Number(r.n) })),
      locais: locaisQ.rows.map((r) => ({ local: r.local, n: Number(r.n) })),
      linha: { meses: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'], atual, anterior },
      cantadas: cantadasQ.rows.map((r) => ({ texto: r.texto, tentativas: Number(r.tentativas), sucessos: Number(r.sucessos), taxa: Number(r.taxa) })),
      melhorHorario: horaQ.rows.map((r) => ({ hora: Number(r.hora), n: Number(r.n) })),
    });
  } catch (e) { next(e); }
});

// fallback SPA
app.get(/^\/(?!api|uploads).*/, (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'erro_interno' }); });

// Local: sobe o servidor. Serverless (Vercel): exporta o app como handler.
if (require.main === module) {
  app.listen(PORT, () => console.log(`\n  Cupido rodando em  http://localhost:${PORT}\n`));
}
module.exports = app;
