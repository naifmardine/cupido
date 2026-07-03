// Aplica o schema.sql no banco apontado por DATABASE_URL (ou PG* locais).
// Funciona com Neon/nuvem sem precisar do psql instalado. Uso: node migrate.js
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Schema aplicado com sucesso.');
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
