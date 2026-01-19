@echo off
REM ============================================
REM Script que FORÇA a correção do código
REM ============================================
cd /d "%~dp0"

echo ============================================
echo CORRIGINDO CODIGO FORCADAMENTE...
echo ============================================

REM Limpar build
if exist "node_modules\@pawan-pk\react-native-mapbox-navigation\android\build" (
    rmdir /s /q "node_modules\@pawan-pk\react-native-mapbox-navigation\android\build"
)

set FILE=node_modules\@pawan-pk\react-native-mapbox-navigation\android\src\main\java\com\mapboxnavigation\MapboxNavigationView.kt

echo [1/4] Removendo imports incorretos...
powershell -Command "(Get-Content '%FILE%') -replace 'import com\.mapbox\.maps\.extension\.style\.layers\.generated\.CircleLayer', '' | Set-Content '%FILE%'"
powershell -Command "(Get-Content '%FILE%') -replace 'import com\.mapbox\.maps\.extension\.style\.layers\.properties\.generated\.CirclePitchScale', '' | Set-Content '%FILE%'"
powershell -Command "(Get-Content '%FILE%') -replace 'import com\.mapbox\.maps\.extension\.style\.sources\.generated\.GeoJsonSource', '' | Set-Content '%FILE%'"

echo [2/4] Corrigindo FeatureCollection.fromFeatures...
powershell -Command "(Get-Content '%FILE%') -replace 'FeatureCollection\.fromFeatures\(features\)', 'FeatureCollection.fromFeatures(features.toList())' | Set-Content '%FILE%'"

echo [3/4] Corrigindo style.getSource para styleSourceExists...
powershell -Command "(Get-Content '%FILE%') -replace 'style\.getSource\([^)]+\) != null', 'style.styleSourceExists(\"radars-source\")' | Set-Content '%FILE%'"
powershell -Command "(Get-Content '%FILE%') -replace 'style\.getLayer\([^)]+\) != null', 'style.styleLayerExists(\"radars-layer\")' | Set-Content '%FILE%'"

echo [4/4] Removendo código duplicado e corrigindo source...
powershell -Command "$content = Get-Content '%FILE%' -Raw; $content = $content -replace '(?s)val geoJsonSource = GeoJsonSource\.Builder.*?return\s+}', '// Adicionar GeoJSON source usando a API do Mapbox Maps SDK v11`r`n    try {`r`n      // Converter FeatureCollection para JSON string`r`n      val geoJsonString = featureCollection.toJson()`r`n      `r`n      // Criar objeto source com type e data para o Mapbox Maps SDK v11`r`n      val sourceJson = \"\"\"`r`n        {`r`n          \"type\": \"geojson\",`r`n          \"data\": $geoJsonString`r`n        }`r`n      \"\"\".trimIndent()`r`n      `r`n      // Adicionar source usando addStyleSource com String (nome) e Value (JSON)`r`n      val sourceValueResult = com.mapbox.bindgen.Value.fromJson(sourceJson)`r`n      when (val value = sourceValueResult.value) {`r`n        null -> {`r`n          Log.e(\"MapboxNavigationView\", \"Erro ao criar Value do JSON: ${sourceValueResult.error}\")`r`n          return`r`n        }`r`n        else -> {`r`n          style.addStyleSource(\"radars-source\", value)`r`n          Log.d(\"MapboxNavigationView\", \"GeoJSON source adicionado com sucesso: ${radars.size} radares\")`r`n        }`r`n      }`r`n    } catch (e: Exception) {`r`n      Log.e(\"MapboxNavigationView\", \"Erro ao adicionar GeoJSON source\", e)`r`n      e.printStackTrace()`r`n      return`r`n    }'; Set-Content '%FILE%' -Value $content"

echo ============================================
echo Criando patch CORRETO...
echo ============================================
call npx patch-package @pawan-pk/react-native-mapbox-navigation --use-yarn=false

echo ============================================
echo Verificando...
echo ============================================
findstr /C:"styleSourceExists" "%FILE%" >nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] Codigo usa styleSourceExists
) else (
    echo [ERRO] Codigo ainda nao esta correto!
    pause
    exit /b 1
)

findstr /C:"Value.fromJson" "%FILE%" >nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] Codigo usa Value.fromJson
) else (
    echo [ERRO] Codigo ainda nao esta correto!
    pause
    exit /b 1
)

echo ============================================
echo [SUCESSO] Codigo corrigido e patch criado!
echo ============================================
pause

