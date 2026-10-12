@echo off
rem Lance le serveur BAQALA (API + interface) sur le port defini dans backend\.env.
rem Utilise par la tache planifiee "BAQALA Serveur" au demarrage du PC.
cd /d "%~dp0..\.."
if not exist logs mkdir logs
if not exist "backend\dist\server.js" call npm run build >> logs\baqala.log 2>&1
if not exist "frontend\dist\index.html" call npm run build >> logs\baqala.log 2>&1
cd backend
set NODE_ENV=production
node dist\server.js >> ..\logs\baqala.log 2>&1
