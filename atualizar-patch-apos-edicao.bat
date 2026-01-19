@echo off
echo ============================================
echo Atualizando patch após suas edições...
echo ============================================

REM Limpar build antes de criar patch
if exist "node_modules\@pawan-pk\react-native-mapbox-navigation\android\build" (
    echo Removendo diretório build...
    rmdir /s /q "node_modules\@pawan-pk\react-native-mapbox-navigation\android\build"
)

echo Criando novo patch com suas mudanças...
npx patch-package @pawan-pk/react-native-mapbox-navigation --use-yarn=false

echo.
echo ============================================
echo Patch atualizado com sucesso!
echo Agora suas mudanças estão salvas no patch.
echo ============================================
pause

