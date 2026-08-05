@echo off
echo Iniciando o Servidor Auto SLA...
set NODE_OPTIONS=
start http://localhost:3000
node server.js
pause
