@echo off
cd /d "%~dp0"
if not exist ".env" (
  echo Primeiro rode o setup.bat para configurar o banco.
  pause & exit /b 1
)
echo Iniciando o Cupido... o navegador abre em instantes.
start "Cupido (servidor)" cmd /k node server.js
timeout /t 3 >nul
start "" http://localhost:3100
exit /b 0
