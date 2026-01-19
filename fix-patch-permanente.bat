@echo off
REM ============================================
REM Script DEFINITIVO para corrigir o patch
REM ============================================
cd /d "%~dp0"

echo ============================================
echo PASSO 1: Limpando arquivos de build...
echo ============================================
if exist "node_modules\@pawan-pk\react-native-mapbox-navigation\android\build" (
    rmdir /s /q "node_modules\@pawan-pk\react-native-mapbox-navigation\android\build"
    echo [OK] Build removido
)

echo ============================================
echo PASSO 2: Verificando codigo atual...
echo ============================================
findstr /C:"styleSourceExists" "node_modules\@pawan-pk\react-native-mapbox-navigation\android\src\main\java\com\mapboxnavigation\MapboxNavigationView.kt" >nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] Codigo usa API v11 (styleSourceExists)
) else (
    echo [ERRO] Codigo NAO usa API v11! Corrigindo...
    echo Execute: npm run apply-patch
    pause
    exit /b 1
)

findstr /C:"Value.fromJson" "node_modules\@pawan-pk\react-native-mapbox-navigation\android\src\main\java\com\mapboxnavigation\MapboxNavigationView.kt" >nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] Codigo usa Value.fromJson
) else (
    echo [ERRO] Codigo NAO usa Value.fromJson! Corrigindo...
    pause
    exit /b 1
)

echo ============================================
echo PASSO 3: Criando patch CORRETO...
echo ============================================
call npx patch-package @pawan-pk/react-native-mapbox-navigation --use-yarn=false
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Falha ao criar patch!
    pause
    exit /b %ERRORLEVEL%
)
echo [OK] Patch criado com sucesso!

echo ============================================
echo PASSO 4: Verificando patch...
echo ============================================
findstr /C:"styleSourceExists" "patches\@pawan-pk+react-native-mapbox-navigation+0.5.2.patch" >nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] Patch contem styleSourceExists
) else (
    echo [AVISO] Patch pode nao conter styleSourceExists
)

findstr /C:"Value.fromJson" "patches\@pawan-pk+react-native-mapbox-navigation+0.5.2.patch" >nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] Patch contem Value.fromJson
) else (
    echo [AVISO] Patch pode nao conter Value.fromJson
)

echo ============================================
echo [SUCESSO] Patch corrigido e pronto!
echo ============================================
echo.
echo Agora execute: build-release.bat
echo.
pause

