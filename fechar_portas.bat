@echo off
echo Fechando processos que estao usando portas de desenvolvimento...

REM Fecha processos na porta 8081
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8081 ^| findstr LISTENING') do (
    echo Matando processo PID %%a na porta 8081...
    taskkill /F /PID %%a 2>nul
)

REM Fecha processos na porta 8082
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8082 ^| findstr LISTENING') do (
    echo Matando processo PID %%a na porta 8082...
    taskkill /F /PID %%a 2>nul
)

REM Fecha todos os processos node.exe
echo Fechando processos node.exe...
taskkill /F /IM node.exe 2>nul

REM Verifica portas
echo.
echo Verificando portas...
netstat -ano | findstr ":8081 :8082" || echo Portas 8081 e 8082 estao livres!

echo.
echo Processo concluido!
pause


