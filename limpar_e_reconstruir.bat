@echo off
echo === Limpando cache e reconstruindo o app ===
echo.

echo Parando processos do Metro...
taskkill /F /IM node.exe 2>nul

echo Limpando cache do Metro...
if exist "%TEMP%\metro-*" rmdir /s /q "%TEMP%\metro-*" 2>nul
if exist "%TEMP%\haste-*" rmdir /s /q "%TEMP%\haste-*" 2>nul

echo Limpando cache do React Native...
if exist "node_modules\.cache" rmdir /s /q "node_modules\.cache" 2>nul

echo Limpando build do Android...
cd android
call gradlew.bat clean
cd ..

echo Limpando watchman (se instalado)...
watchman watch-del-all 2>nul

echo.
echo === Cache limpo! ===
echo.
echo Agora execute:
echo   1. npm start -- --reset-cache
echo   2. Em outro terminal: npm run android
echo.

pause

