@echo off
echo ============================================
echo INSTALANDO APK MANUALMENTE
echo ============================================
echo.

REM Verificar se o APK existe
if not exist "android\app\build\outputs\apk\debug\app-debug.apk" (
    echo APK não encontrado! Compilando primeiro...
    echo.
    cd android
    call gradlew.bat assembleDebug
    cd ..
    echo.
)

REM Verificar se o APK foi criado
if not exist "android\app\build\outputs\apk\debug\app-debug.apk" (
    echo ERRO: APK não foi criado!
    pause
    exit /b 1
)

echo APK encontrado: android\app\build\outputs\apk\debug\app-debug.apk
echo.
echo Instruções:
echo 1. Conecte seu dispositivo Android via USB
echo 2. Ative a depuração USB no dispositivo
echo 3. Transfira o APK para o dispositivo (via USB ou email)
echo 4. Abra o APK no dispositivo e instale
echo.
echo OU use o Android Studio para instalar automaticamente
echo.
echo Caminho do APK:
echo %CD%\android\app\build\outputs\apk\debug\app-debug.apk
echo.
pause

