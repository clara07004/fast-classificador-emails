@echo off
REM Script para iniciar o worker no boot do Windows
REM Coloque este arquivo em: C:\Users\HP\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup

cd /d C:\Users\HP\Documents\fast-classificador-emails

REM Aguardar 5s para garantir que PM2 daemon está pronto
timeout /t 5 /nobreak

REM Restaurar processos salvos do PM2
pm2 resurrect

REM Opcional: Log do startup
echo [%date% %time%] Worker iniciado >> logs\startup.log
