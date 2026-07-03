@echo off
setlocal
cd /d "%~dp0"

if not exist ".env" (
  echo Falta o arquivo .env com a DATABASE_URL do Neon.
  echo Copie .env.example para .env e preencha a DATABASE_URL,
  echo ou peca pro Claude configurar o Neon automaticamente.
  pause & exit /b 1
)

echo ==================================================
echo    Configuracao do Cupido
echo ==================================================
echo.
echo [1/3] Instalando dependencias (npm install)...
call npm install
if errorlevel 1 goto :erro

echo [2/3] Aplicando o schema no banco...
call node migrate.js
if errorlevel 1 goto :erro

echo [3/3] Populando dados de exemplo...
call node seed.js
if errorlevel 1 goto :erro

echo.
echo ==================================================
echo    Tudo pronto! Rode  "Iniciar Cupido.bat"
echo    Login: use o AUTH_EMAIL / AUTH_SENHA do seu .env
echo ==================================================
pause
exit /b 0

:erro
echo.
echo *** Erro. Confira a DATABASE_URL no arquivo .env. ***
pause
exit /b 1
