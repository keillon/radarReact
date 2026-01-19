@echo off
echo ============================================
echo COMPILANDO APK
echo ============================================
echo.

REM Aplicar patch primeiro
echo Aplicando patch...
call npx patch-package @pawan-pk/react-native-mapbox-navigation --use-yarn=false
echo.

REM Compilar APK
echo Compilando APK...
cd android
call gradlew.bat assembleDebug
cd ..

echo.
if exist "android\app\build\outputs\apk\debug\app-debug.apk" (
    echo ============================================
    echo APK COMPILADO COM SUCESSO!
    echo ============================================
    echo.
    echo APK localizado em:
    echo %CD%\android\app\build\outputs\apk\debug\app-debug.apk
    echo.
    echo Agora você pode:
    echo 1. Transferir o APK para o dispositivo via USB
    echo 2. Instalar manualmente no dispositivo
    echo 3. Ou usar o Android Studio para instalar
    echo.
) else (
    echo ERRO: APK não foi criado!
    echo Verifique os erros acima.
)

pause

