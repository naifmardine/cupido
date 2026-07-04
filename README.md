# Cupido — Dashboard + CRM do PI

Dashboard e CRUD de "conquistas" com PostgreSQL, organizado por **rolê**.

## Modelo de dados

O centro é o **rolê** (uma saída: **data + local**). Cada rolê tem:
- **leads** (as mulheres abordadas — foto, característica, cantada, status);
- **consumo** (as bebidas ingeridas naquele rolê).

Catálogos gerenciáveis: **locais** (lugares de rolê), **cantadas** (repertório) e **bebidas**
(valores padrão pro cálculo de álcool). O **BAC** (nível de álcool) é calculado por rolê pela
fórmula de **Widmark**, usando peso/sexo de **Configurações**.

## Banco de dados (Neon — nuvem)

O app usa PostgreSQL na nuvem (Neon). A conexão fica em `.env` na variável
`DATABASE_URL` (mesma URL vale em dev e produção). Um `.env` já configurado acompanha
esta máquina; para outro ambiente, copie `.env.example` para `.env` e preencha a
`DATABASE_URL` do seu projeto Neon.

## Como rodar (Windows)

1. **`setup.bat`** — rode **uma vez** (precisa do `.env` com `DATABASE_URL`). Ele instala as
   dependências, aplica o schema no banco (`node migrate.js`) e popula dados de exemplo
   (`node seed.js`).
2. **`Iniciar Cupido.bat`** — abre o app em `http://localhost:3100`.

### Login
A credencial é definida por variáveis de ambiente **`AUTH_EMAIL`** e **`AUTH_SENHA`**
(no `.env` local e no host de produção). Não fica no código nem neste repositório.

## Como usar
- **Hoje** → a tela de uso rápido no rolê: BAC ao vivo, **curva de álcool da noite** (montada pelo
  horário real de cada bebida), timeline de bebidas com **hora editável**, e as abordagens da noite.
  "+ Bebida" registra a dose na hora do toque; toque na hora pra ajustar quando bebeu.
- Botão **+** → registrar uma abordagem. Escolha (ou crie) o **rolê**, tire/escolha a **foto**
  (no celular, "Tirar foto" abre a câmera), defina característica/status, escreva ou escolha a
  **cantada** (opcional), a **objeção** (select com opção de adicionar nova via ＋). Foto JPEG de
  câmera preenche o horário pelo **EXIF**; prints/WhatsApp caem na data do arquivo (editável).
- **Leads / Conversões** → tabela com editar/excluir; **clique no status** pra alterná-lo em 1 toque.
- **Inteligência** → funil, objeções, cortes por cantada/local, insights auto-gerados e uma seção de
  **análise estatística**: correlações (com p-valor), **regressão logística** uni e múltipla (coef,
  odds ratio, pseudo-R²), regressão linear, Cramér's V e **curva de tendência**. Rotulada com aviso de
  amostra pequena e "correlação ≠ causa" — o poder analítico cresce conforme você registra mais.
- **Rolês / Cantadas / Locais / Config** → catálogos e perfil (peso/sexo Widmark, meta, bebidas).
- **Mobile**: botão **☰** no topo abre o menu com 5 categorias (Hoje, Painel, Análise, Histórico,
  Ajustes). Botão **◐** alterna tema claro/escuro.

## Cálculo do álcool (BAC)
Estimativa **lúdica** por Widmark, **integrada no tempo**: cada bebida entra pelo seu horário
(`consumo.momento`) e a eliminação (`0,15 g/L·h`) corre do primeiro gole. `gramas = ml × %abv/100 ×
0,789`; `BAC(t) = max(0, Σ_{bebidas até t} gramas / (r × peso) − 0,15 × horas)`, `r` = 0,68 (homem) /
0,55 (mulher). Isso gera a **curva de álcool da noite** e permite calcular o BAC no momento de cada
abordagem (usado na análise). Não é medição real — não use pra decidir se pode dirigir.

## Análise estatística (`stats.js`)
Módulo **vanilla, zero dependência**: correlação de Pearson/point-biserial (t-test), regressão linear
OLS (equações normais, R²/erros-padrão/p), **regressão logística** por IRLS com ridge (coeficientes,
odds ratio, p de Wald, pseudo-R² de McFadden), intervalo de Wilson e Cramér's V. p-values via beta
incompleta (t) e função erro (normal). `GET /api/analise` monta a matriz por-lead e roda as óticas.
Tem auto-teste: `node stats.js` valida contra valores conhecidos.

## Stack
Node + Express + PostgreSQL (`pg`) no Neon, frontend HTML/CSS/JS puro (charts em SVG).
**Fotos guardadas no banco** (`bytea`, servidas por `/api/foto/:id` atrás do login) — roda
em host sem disco persistente. É uma **PWA** (instalável no celular). Fuso `America/Sao_Paulo`.

## Deploy (Vercel — grátis, pelo CLI)
Está no ar em **https://cupido-gamma.vercel.app**. O app é serverless-ready: sessão em
cookie assinado (HMAC, `SESSION_SECRET`) e `server.js` exporta o handler (`vercel.json`
roteia tudo pro Express). Deploy 100% pelo CLI:

```bash
vercel link --yes --project cupido
# variáveis (Production): DATABASE_URL (Neon), AUTH_EMAIL, AUTH_SENHA, SESSION_SECRET, TZ
vercel env add <NOME> production
vercel --prod
```

No celular: abrir a URL → **Adicionar à tela inicial** instala a PWA (tela cheia, ícone,
shell instantâneo pelo service worker). Cold start do Vercel é ~300ms (sem sleep).

> Também há `render.yaml` + `Dockerfile` no repo como alternativas de host (Render/Koyeb/etc).

## Aviso
O login é um **gate simples** com credencial via env (`AUTH_EMAIL`/`AUTH_SENHA`) para uso do
PI — **não** é autenticação de produção.
