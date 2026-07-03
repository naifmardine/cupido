// Popula o banco no modelo de ROLÊ: config, locais, bebidas, cantadas,
// rolês (data+local) com seus leads e consumo. Uso: node seed.js
const { pool, query } = require('./db');

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const CARACS = ['Morena','Morena','Loira','Loira','Ruiva','Castanha','Outras'];
const ROLES_POR_MES = [2, 2, 2, 3, 3, 3, 2]; // Jan..Jul 2026

function dstr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

async function criarRole(data, localId, titulo) {
  const { rows } = await query(
    `INSERT INTO roles (data, local_id, titulo) VALUES ($1,$2,$3) RETURNING id`,
    [dstr(data), localId, titulo || null]);
  return rows[0].id;
}
async function addLead(roleId, codigo, carac, cantadaId, status, momento) {
  await query(
    `INSERT INTO leads (role_id, codigo, caracteristica, cantada_id, status, momento)
     VALUES ($1,$2,$3,$4,$5,$6)`, [roleId, codigo, carac, cantadaId, status, momento]);
}
async function addDoses(roleId, bebidaId, base, n, h0) {
  for (let i = 0; i < n; i++) {
    const m = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h0 + i, randInt(0, 59));
    await query(`INSERT INTO consumo (role_id, bebida_id, momento) VALUES ($1,$2,$3)`, [roleId, bebidaId, m]);
  }
}

async function main() {
  await query(`INSERT INTO configuracoes (id, peso_kg, sexo, r, meta_mes) VALUES (1,75,'homem',0.68,20)`);

  console.log('Semeando locais…');
  const nomesLocais = ['Balada Lux','Bar do Zé','App de encontro','Praia','Faculdade'];
  const localId = {};
  for (const nome of nomesLocais) {
    const { rows } = await query(`INSERT INTO locais (nome) VALUES ($1) RETURNING id`, [nome]);
    localId[nome] = rows[0].id;
  }

  console.log('Semeando bebidas…');
  const bebidas = [
    ['Cerveja',350,5,1], ['Chopp',300,5,2], ['Long neck',355,5,3], ['Shot / Dose',40,40,4],
    ['Caipirinha',150,20,5], ['Taça de vinho',150,12,6], ['Drink',200,10,7],
  ];
  const bebidaId = {};
  for (const [nome, ml, abv, ordem] of bebidas) {
    const { rows } = await query(`INSERT INTO bebidas (nome, ml, abv, ordem) VALUES ($1,$2,$3,$4) RETURNING id`,
      [nome, ml, abv, ordem]);
    bebidaId[nome] = rows[0].id;
  }

  console.log('Semeando cantadas…');
  const cantadas = [
    ['Me empresta o Instagram?',18,14], ['Você acredita em amor à 1ª vista?',13,8],
    ['Tô perdido, pode me ajudar?',11,6], ['Você dança?',12,5], ['Seu pai é astronauta?',9,3],
  ];
  const cantadaIds = [];
  for (const [texto, tent, suc] of cantadas) {
    const { rows } = await query(`INSERT INTO cantadas (texto, tentativas, sucessos) VALUES ($1,$2,$3) RETURNING id`,
      [texto, tent, suc]);
    cantadaIds.push(rows[0].id);
  }

  const nomesBebidas = Object.keys(bebidaId);
  let seq = 20;
  const novoCodigo = () => { seq += randInt(1, 3); return '#' + String(seq).padStart(4, '0'); };

  console.log('Semeando rolês (com leads e bebidas)…');
  // rolê de hoje (pro card "AO VIVO")
  const hoje = new Date();
  const rHoje = await criarRole(hoje, localId['Balada Lux'], 'Rolê de hoje');
  await addLead(rHoje, '#0142', 'Morena', cantadaIds[0], 'convertida',
    new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 40));
  await addLead(rHoje, '#0140', 'Loira', cantadaIds[3], 'em_conversa',
    new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 22, 10));
  await addDoses(rHoje, bebidaId['Cerveja'], hoje, 4, 20);
  await addDoses(rHoje, bebidaId['Shot / Dose'], hoje, 2, 22);

  // rolês históricos de 2026 (nunca em data futura)
  const mesAtual = hoje.getFullYear() === 2026 ? hoje.getMonth() : 6;
  const diaAtual = hoje.getDate();
  for (let mes = 0; mes <= mesAtual; mes++) {
    const quantos = mes < ROLES_POR_MES.length ? ROLES_POR_MES[mes] : 2;
    for (let k = 0; k < quantos; k++) {
      const local = rand(nomesLocais);
      const maxDia = mes === mesAtual ? Math.max(1, diaAtual - 1) : 27;
      const dia = randInt(1, maxDia);
      const base = new Date(2026, mes, dia);
      const roleId = await criarRole(base, localId[local]);
      const nLeads = randInt(1, 4);
      for (let j = 0; j < nLeads; j++) {
        const convertida = Math.random() < 0.34;
        const status = convertida ? 'convertida' : (Math.random() < 0.5 ? 'em_conversa' : 'fora');
        const hora = convertida ? rand([20,21,22,23,0,1]) : randInt(18, 23);
        const momento = new Date(2026, mes, dia, hora, randInt(0, 59));
        await addLead(roleId, novoCodigo(), rand(CARACS), rand(cantadaIds), status, momento);
      }
      // bebidas do rolê
      const nTipos = randInt(1, 2);
      for (let t = 0; t < nTipos; t++) {
        await addDoses(roleId, bebidaId[rand(nomesBebidas)], base, randInt(2, 5), randInt(19, 21));
      }
    }
  }

  const { rows } = await query(`SELECT
    (SELECT count(*) FROM roles)::int AS roles, (SELECT count(*) FROM leads)::int AS leads,
    (SELECT count(*) FROM locais)::int AS locais, (SELECT count(*) FROM bebidas)::int AS bebidas,
    (SELECT count(*) FROM consumo)::int AS consumo`);
  const s = rows[0];
  console.log(`Pronto: ${s.roles} rolês, ${s.leads} leads, ${s.locais} locais, ${s.bebidas} bebidas, ${s.consumo} doses.`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
