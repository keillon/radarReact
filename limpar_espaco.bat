@echo off
echo Limpando arquivos temporarios para liberar espaco...

echo.
echo 1. Limpando build do Android...
cd android
call gradlew clean
cd ..

echo.
echo 2. Limpando cache do Gradle...
if exist "%USERPROFILE%\.gradle\caches" (
    echo Limpando cache do Gradle (pode demorar)...
    rd /s /q "%USERPROFILE%\.gradle\caches" 2>nul
    echo Cache do Gradle limpo!
)

echo.
echo 3. Limpando node_modules/.cache...
if exist "node_modules\.cache" (
    rd /s /q "node_modules\.cache" 2>nul
    echo Cache do node_modules limpo!
)

echo.
echo 4. Limpando arquivos temporarios do Windows...
del /q /f /s "%TEMP%\*" 2>nul
del /q /f /s "%LOCALAPPDATA%\Temp\*" 2>nul

echo.
echo 5. Limpando build folders do projeto...
if exist "android\build" (
    rd /s /q "android\build" 2>nul
)
if exist "android\app\build" (
    rd /s /q "android\app\build" 2>nul
)
if exist "node_modules\react-native-reanimated\android\build" (
    rd /s /q "node_modules\react-native-reanimated\android\build" 2>nul
)

echo.
echo Limpeza concluida! Verifique o espaco em disco.
pause

