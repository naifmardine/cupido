-- Cupido — schema (PostgreSQL). Iteração 2: modelo centrado no ROLÊ.
-- rolê (data + local) -> leads (mulheres) + consumo (bebidas). Rode: node migrate.js

DROP TABLE IF EXISTS consumo CASCADE;
DROP TABLE IF EXISTS leads CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS cantadas CASCADE;
DROP TABLE IF EXISTS bebidas CASCADE;
DROP TABLE IF EXISTS locais CASCADE;
DROP TABLE IF EXISTS fotos CASCADE;
DROP TABLE IF EXISTS configuracoes CASCADE;

-- Fotos das abordagens (guardadas no banco pra rodar em host sem disco persistente)
CREATE TABLE fotos (
  id         SERIAL PRIMARY KEY,
  mime       TEXT NOT NULL,
  bytes      BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Configuração única (peso/sexo pro Widmark + meta do mês)
CREATE TABLE configuracoes (
  id       INTEGER PRIMARY KEY DEFAULT 1,
  peso_kg  NUMERIC(5,1) NOT NULL DEFAULT 75,
  sexo     TEXT NOT NULL DEFAULT 'homem',        -- homem | mulher
  r        NUMERIC(3,2) NOT NULL DEFAULT 0.68,   -- fator de distribuição de Widmark
  meta_mes INTEGER NOT NULL DEFAULT 20,
  CONSTRAINT so_uma_linha CHECK (id = 1)
);

-- Catálogo de locais (lugares possíveis de rolê — CRUD)
CREATE TABLE locais (
  id         SERIAL PRIMARY KEY,
  nome       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Repertório de cantadas (taxa = sucessos/tentativas)
CREATE TABLE cantadas (
  id         SERIAL PRIMARY KEY,
  texto      TEXT NOT NULL,
  tentativas INTEGER NOT NULL DEFAULT 0,
  sucessos   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Catálogo de bebidas (valores padrão editáveis)
CREATE TABLE bebidas (
  id    SERIAL PRIMARY KEY,
  nome  TEXT NOT NULL,
  ml    INTEGER NOT NULL,        -- volume da dose
  abv   NUMERIC(4,1) NOT NULL,   -- teor alcoólico em %
  ordem INTEGER NOT NULL DEFAULT 0
);

-- ROLÊ = uma saída (data + local). Agrupa leads e bebidas.
CREATE TABLE roles (
  id         SERIAL PRIMARY KEY,
  data       DATE NOT NULL,
  local_id   INTEGER REFERENCES locais(id) ON DELETE SET NULL,
  titulo     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Leads = mulheres abordadas num rolê
CREATE TABLE leads (
  id            SERIAL PRIMARY KEY,
  role_id       INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  codigo        TEXT,
  foto_path     TEXT,
  caracteristica TEXT,
  cantada_id    INTEGER REFERENCES cantadas(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'em_conversa',   -- convertida | em_conversa | fora
  objecao       TEXT,                                  -- por que não converteu / obstáculo (inteligência comercial)
  momento       TIMESTAMPTZ NOT NULL,                  -- horário da foto (séries por hora)
  convertida_em TIMESTAMPTZ,                           -- quando virou convertida (lead time = convertida_em - momento)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Consumo = bebidas ingeridas num rolê (uma linha = uma dose)
CREATE TABLE consumo (
  id         SERIAL PRIMARY KEY,
  role_id    INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  bebida_id  INTEGER NOT NULL REFERENCES bebidas(id) ON DELETE RESTRICT, -- não perde histórico de rolês
  momento    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_roles_data     ON roles (data);
CREATE INDEX idx_leads_role     ON leads (role_id);
CREATE INDEX idx_leads_momento  ON leads (momento);
CREATE INDEX idx_leads_status   ON leads (status);
CREATE INDEX idx_consumo_role   ON consumo (role_id);
