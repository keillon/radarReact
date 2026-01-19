# Script PowerShell SIMPLES - APENAS substituicoes basicas
# NAO remove codigo, apenas corrige o que existe

$filePath = "node_modules\@pawan-pk\react-native-mapbox-navigation\android\src\main\java\com\mapboxnavigation\MapboxNavigationView.kt"

Write-Host "============================================"
Write-Host "FORCANDO CODIGO CORRETO NO ARQUIVO..."
Write-Host "============================================"

# Ler o arquivo completo
$content = Get-Content $filePath -Raw

# 1. Garantir import de Gson
if ($content -notmatch "import com\.mapbox\.geojson\.Gson") {
    Write-Host "[1/4] Adicionando import de Gson..."
    $content = $content -replace "(import com\.mapbox\.geojson\.FeatureCollection)", "`$1`r`nimport com.mapbox.geojson.Gson"
} else {
    Write-Host "[1/4] Import de Gson ja existe"
}

# 2. Remover imports incorretos
Write-Host "[2/4] Removendo imports incorretos..."
$content = $content -replace "import com\.mapbox\.maps\.extension\.style\.layers\.generated\.CircleLayer`r?`n", ""
$content = $content -replace "import com\.mapbox\.maps\.extension\.style\.layers\.properties\.generated\.CirclePitchScale`r?`n", ""
$content = $content -replace "import com\.mapbox\.maps\.extension\.style\.sources\.generated\.GeoJsonSource`r?`n", ""

# 3. Corrigir FeatureCollection.fromFeatures
Write-Host "[3/4] Corrigindo FeatureCollection.fromFeatures..."
$content = $content -replace "FeatureCollection\.fromFeatures\(features\)", "FeatureCollection.fromFeatures(features.toList())"

# 4. Corrigir style.getSource para styleSourceExists
Write-Host "[4/4] Corrigindo style.getSource para styleSourceExists..."
$content = $content -replace 'style\.getSource\("radars-source"\) != null', 'style.styleSourceExists("radars-source")'
$content = $content -replace 'style\.getLayer\("radars-layer"\) != null', 'style.styleLayerExists("radars-layer")'

# Salvar o arquivo
Set-Content -Path $filePath -Value $content -NoNewline

Write-Host "============================================"
Write-Host "[SUCESSO] Codigo corrigido forcadamente!"
Write-Host "============================================"
