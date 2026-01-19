@echo off
echo ============================================
echo INSTALANDO APK SEM ADB DIRETO
echo ============================================
echo.

REM Verificar se o APK existe
if not exist "android\app\build\outputs\apk\debug\app-debug.apk" (
    echo APK não encontrado! Compilando primeiro...
    call compilar-apk.bat
    echo.
)

REM Tentar instalar usando Gradle (que usa ADB internamente)
echo Tentando instalar usando Gradle...
cd android
call gradlew.bat installDebug
cd ..

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ============================================
    echo APK INSTALADO COM SUCESSO!
    echo ============================================
    echo.
    echo O app foi instalado no dispositivo.
    echo Inicie o app manualmente no dispositivo.
    echo.
) else (
    echo.
    echo ============================================
    echo INSTALAÇÃO FALHOU
    echo ============================================
    echo.
    echo Opções alternativas:
    echo.
    echo 1. TRANSFERIR MANUALMENTE:
    echo    - Conecte o dispositivo via USB
    echo    - Copie o arquivo: android\app\build\outputs\apk\debug\app-debug.apk
    echo    - Cole no dispositivo
    echo    - Abra o arquivo no dispositivo e instale
    echo.
    echo 2. USAR ANDROID STUDIO:
    echo    - Abra o projeto no Android Studio
    echo    - Clique em Run (ou Shift+F10)
    echo.
    echo 3. USAR ADB VIA ANDROID STUDIO:
    echo    - No Android Studio, vá em Tools ^> SDK Manager
    echo    - Copie o caminho do Android SDK
    echo    - Use: [caminho]\platform-tools\adb.exe install app-debug.apk
    echo.
)

pause

