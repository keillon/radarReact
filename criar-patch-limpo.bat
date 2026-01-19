@echo off
echo ============================================
echo Limpando build antes de criar patch...
echo ============================================

REM Limpar diretório build do node_modules
if exist "node_modules\@pawan-pk\react-native-mapbox-navigation\android\build" (
    echo Removendo diretório build...
    rmdir /s /q "node_modules\@pawan-pk\react-native-mapbox-navigation\android\build"
    echo Diretório build removido!
)

REM Limpar também outros diretórios temporários que podem causar problemas
if exist "node_modules\@pawan-pk\react-native-mapbox-navigation\android\.gradle" (
    rmdir /s /q "node_modules\@pawan-pk\react-native-mapbox-navigation\android\.gradle"
)

echo.
echo ============================================
echo Criando patch...
echo ============================================

REM Criar patch apenas do arquivo fonte (ignorar build)
npx patch-package @pawan-pk/react-native-mapbox-navigation --use-yarn=false

echo.
echo ============================================
echo Patch criado com sucesso!
echo ============================================
pause

