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
- Botão **+** → registrar uma abordagem. Escolha (ou crie) o **rolê**, tire/escolha a **foto**
  (no celular, "Tirar foto" abre a câmera), defina característica/status, escreva ou escolha a
  **cantada** (opcional), e some as **bebidas do rolê** com os botões +/− — o **BAC atualiza ao
  vivo**. Foto JPEG de câmera preenche o horário pelo **EXIF**; prints/WhatsApp caem na data do
  arquivo (sempre editável).
- **Rolês** → cada saída com seus leads e bebidas (criar/editar/excluir).
- **Leads / Conversões** → tabela com editar/excluir. **Cantadas** e **Locais** → catálogos.
- **Configurações** → peso, sexo (fator de Widmark) e meta do mês; catálogo de bebidas editável.
  Mudar o peso recalcula o BAC.
- Card **Álcool no Rolê** → seletor de data mostra o BAC de qualquer rolê ("AO VIVO" só hoje);
  "+ Bebida" adiciona doses. As demais métricas (KPIs, gráficos, "melhor horário") saem dos dados.
- Botão **◐** no topo alterna tema claro/escuro.

## Cálculo do álcool (BAC)
Estimativa **lúdica** por Widmark: `gramas = ml × %abv/100 × 0,789`;
`BAC = max(0, Σgramas / (r × peso) − 0,15 × horas)`, `r` = 0,68 (homem) / 0,55 (mulher).
Não é medição real — não use pra decidir se pode dirigir.

## Stack
Node + Express + PostgreSQL (`pg`) no Neon, frontend HTML/CSS/JS puro (charts em SVG).
Fotos em `uploads/`, metadados no banco. Fuso `America/Sao_Paulo` na sessão do banco.

## Aviso
O login é um **gate simples** com credencial fixa para uso do PI — **não** é autenticação
de produção. Não exponha este app na internet.
