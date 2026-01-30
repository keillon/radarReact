@echo off
REM Deploy do backend no servidor: pull + npm install + pm2 restart
REM Ajuste USUARIO e REPO_DIR conforme seu servidor (edite a linha ssh abaixo).

set SERVER=usuario@72.60.247.18
set REPO_DIR=RadarREact
set PM2_NAME=backend

echo Conectando no servidor e atualizando backend...
ssh %SERVER% "cd %REPO_DIR% && git pull origin main && cd backend && npm install --production && pm2 restart %PM2_NAME%"
echo Deploy concluido.
pause
