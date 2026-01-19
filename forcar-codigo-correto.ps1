# Script PowerShell para FORCAR codigo correto no arquivo

$filePath = "node_modules\@pawan-pk\react-native-mapbox-navigation\android\src\main\java\com\mapboxnavigation\MapboxNavigationView.kt"
$templatePath = "codigo-correto-template.txt"

Write-Host "============================================"
Write-Host "FORCANDO CODIGO CORRETO NO ARQUIVO..."
Write-Host "============================================"

# Ler o arquivo completo
$content = Get-Content $filePath -Raw

# 1. Garantir import de Gson
if ($content -notmatch "import com\.mapbox\.geojson\.Gson") {
    Write-Host "[1/6] Adicionando import de Gson..."
    $content = $content -replace "(import com\.mapbox\.geojson\.FeatureCollection)", "`$1`r`nimport com.mapbox.geojson.Gson"
} else {
    Write-Host "[1/6] Import de Gson ja existe"
}

# 2. Remover imports incorretos
Write-Host "[2/6] Removendo imports incorretos..."
$content = $content -replace "import com\.mapbox\.maps\.extension\.style\.layers\.generated\.CircleLayer`r?`n", ""
$content = $content -replace "import com\.mapbox\.maps\.extension\.style\.layers\.properties\.generated\.CirclePitchScale`r?`n", ""
$content = $content -replace "import com\.mapbox\.maps\.extension\.style\.sources\.generated\.GeoJsonSource`r?`n", ""

# 3. Corrigir FeatureCollection.fromFeatures
Write-Host "[3/6] Corrigindo FeatureCollection.fromFeatures..."
$content = $content -replace "FeatureCollection\.fromFeatures\(features\)", "FeatureCollection.fromFeatures(features.toList())"

# 4. Corrigir style.getSource para styleSourceExists
Write-Host "[4/6] Corrigindo style.getSource para styleSourceExists..."
$content = $content -replace 'style\.getSource\("radars-source"\) != null', 'style.styleSourceExists("radars-source")'
$content = $content -replace 'style\.getLayer\("radars-layer"\) != null', 'style.styleLayerExists("radars-layer")'

# 5. Substituir codigo usando template
Write-Host "[5/6] Substituindo codigo usando template..."
if (Test-Path $templatePath) {
    $templateContent = Get-Content $templatePath -Raw
    # Encontrar desde "// Remover source" ate o final da funcao
    $pattern = '(?s)// Remover source e layer existentes se houver.*?}\s+}\s+'
    $content = $content -replace $pattern, $templateContent
    Write-Host "[OK] Codigo substituido usando template"
} else {
    Write-Host "[ERRO] Template nao encontrado!"
    exit 1
}

# 6. Remover codigo duplicado e malformado
Write-Host "[6/6] Removendo codigo duplicado..."
# Remover codigo duplicado apos o final da funcao updateRadarsOnMap
# Encontrar o padrao: "}\s+}" seguido de codigo duplicado e remover apenas o duplicado
$content = $content -replace '(?s)(}\s+}\s+)\s+(catch \(e: Exception\)|// Adicionar CircleLayer|// Adicionar GeoJSON source).*?}\s+}\s+', '$1'
# Garantir que o arquivo termina corretamente (apenas uma vez "}\s+}")
$lines = $content -split "`r?`n"
$newLines = @()
$foundEnd = $false
for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    if ($line -match '^\s*}\s*$' -and $foundEnd -eq $false) {
        # Verificar se a proxima linha tambem e "}"
        if ($i + 1 -lt $lines.Count -and $lines[$i + 1] -match '^\s*}\s*$') {
            $newLines += $line
            $newLines += $lines[$i + 1]
            $foundEnd = $true
            $i++ # Pular proxima linha
            continue
        }
    }
    if ($foundEnd -eq $true -and $line -match '(catch|// Adicionar|GeoJsonSource|CircleLayer)') {
        # Pular linhas duplicadas apos o final
        continue
    }
    $newLines += $line
}
$content = $newLines -join "`r`n"

# Salvar o arquivo
Set-Content -Path $filePath -Value $content -NoNewline

Write-Host "============================================"
Write-Host "[SUCESSO] Codigo corrigido forcadamente!"
Write-Host "============================================"
