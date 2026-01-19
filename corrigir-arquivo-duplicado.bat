@echo off
echo ============================================
echo Corrigindo código duplicado no arquivo...
echo ============================================

REM Arquivo a corrigir
set FILE=node_modules\@pawan-pk\react-native-mapbox-navigation\android\src\main\java\com\mapboxnavigation\MapboxNavigationView.kt


REM Usar PowerShell para remover linhas após a linha 954 (fim correto do arquivo)
powershell -Command "$lines = Get-Content '%FILE%'; if ($lines.Count -gt 954) { $lines[0..953] | Set-Content '%FILE%' -Encoding UTF8; Write-Host 'Linhas extras removidas' } else { Write-Host 'Arquivo já está correto' }"

echo Arquivo corrigido!
echo.
echo Agora execute: criar-patch-limpo.bat para salvar a correção

