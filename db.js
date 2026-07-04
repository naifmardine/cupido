// Pool de conexão com o PostgreSQL + helper de query parametrizada.
// Usa DATABASE_URL (Neon/nuvem, com SSL) se existir; senão cai nas vars PG* locais.
// O fuso America/Sao_Paulo é setado na própria conexão (sem query extra) pra
// date_trunc/EXTRACT baterem com o horário local (BRT).
require('dotenv').config();
const { Pool } = require('pg');

const TZ = '-c timezone=America/Sao_Paulo';

// max baixo: em serverless cada instância mantém seu pool; evita estourar conexões do Neon
const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true }, options: TZ, max: 3 }
    : {
        host: process.env.PGHOST || 'localhost',
        port: Number(process.env.PGPORT) || 5432,
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || '',
        database: process.env.PGDATABASE || 'cupido',
        options: TZ,
        max: 3,
      }
);

// query('SELECT ... $1', [valor]) — sempre parametrizado (anti SQL injection)
const query = (text, params) => pool.query(text, params);

module.exports = { pool, query };
