# Solução: Espaço Insuficiente no Disco

## Problema
O disco C: está **100% cheio** (apenas 26MB livres), impedindo o build do Android.

## Soluções Imediatas

### 1. Limpar Builds e Caches (Recomendado)
Execute o script criado:
```bash
limpar_espaco.bat
```

Ou manualmente:
```bash
# Limpar builds do Android
cd android
./gradlew clean
cd ..

# Limpar cache do Gradle (libera MUITO espaço)
# Caminho: C:\Users\Keillon\.gradle\caches
# Delete a pasta "caches" manualmente ou use:
rm -rf ~/.gradle/caches

# Limpar cache do node_modules
rm -rf node_modules/.cache
```

### 2. Limpar Arquivos Temporários do Windows
- Pressione `Win + R`
- Digite `%TEMP%` e pressione Enter
- Delete todos os arquivos (pode levar alguns minutos)
- Repita com `%LOCALAPPDATA%\Temp`

### 3. Limpar Cache do Gradle (Libera MUITO espaço)
O cache do Gradle pode ocupar **vários GB**. Para limpar:

**Via PowerShell:**
```powershell
Remove-Item -Recurse -Force "$env:USERPROFILE\.gradle\caches"
```

**Via Explorador:**
1. Abra: `C:\Users\Keillon\.gradle\caches`
2. Delete a pasta `caches` inteira
3. O Gradle vai recriar quando necessário

### 4. Limpar Builds Antigos
```bash
# No diretório do projeto
rm -rf android/build
rm -rf android/app/build
rm -rf node_modules/*/android/build
```

### 5. Verificar Espaço em Disco
```powershell
# No PowerShell
Get-PSDrive C | Select-Object Used,Free
```

## Espaço Necessário
Para compilar o projeto Android, você precisa de pelo menos:
- **2-3 GB livres** para builds de debug
- **5-10 GB livres** para builds de release

## Após Liberar Espaço

1. **Reaplique os patches:**
```bash
npx patch-package
```

2. **Tente o build novamente:**
```bash
cd android
./gradlew assembleDebug
```

## Prevenção Futura

1. **Configure o Gradle para usar menos espaço:**
   - Edite `android/gradle.properties` e adicione:
   ```
   org.gradle.caching=true
   org.gradle.parallel=true
   ```

2. **Limpe builds regularmente:**
   - Execute `./gradlew clean` após builds bem-sucedidos
   - Delete builds antigos periodicamente

3. **Use um disco externo ou outro drive:**
   - Mova o projeto para outro disco com mais espaço
   - Configure o Gradle para usar outro drive (mais complexo)

