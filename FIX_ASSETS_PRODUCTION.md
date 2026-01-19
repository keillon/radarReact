# Correção: Assets não carregam no Build de Produção

## Problema
No build de produção, as imagens/radares não carregam, mas funcionam normalmente com `npm start` (desenvolvimento).

## Solução

### 1. Gerar Bundle Manualmente (Recomendado)

Antes de fazer o build de produção, gere o bundle manualmente:

```bash
# Gerar bundle e assets para produção
npm run android:bundle
```

Este comando irá:
- Gerar o bundle JavaScript (`index.android.bundle`)
- Copiar todos os assets (imagens, fontes) para `android/app/src/main/res/`

### 2. Fazer Build de Produção

Depois de gerar o bundle, faça o build normalmente:

```bash
cd android
./gradlew assembleRelease
# ou
./gradlew bundleRelease
```

### 3. Verificar se o Bundle foi Gerado

Após executar `npm run android:bundle`, verifique se os arquivos foram criados:

```bash
# Deve existir este arquivo:
ls -la android/app/src/main/assets/index.android.bundle

# Assets devem estar em:
ls -la android/app/src/main/res/drawable-*/
```

### 4. Se ainda não funcionar

Se os radares ainda não aparecerem, verifique:

1. **Limpar build anterior:**
   ```bash
   cd android
   ./gradlew clean
   ```

2. **Regenerar bundle:**
   ```bash
   npm run android:bundle
   ```

3. **Rebuild do app:**
   ```bash
   cd android
   ./gradlew assembleRelease
   ```

## Nota Importante

Os radares são renderizados usando `CircleLayer` do Mapbox (círculos coloridos), não imagens. Se os círculos não aparecem em produção, o problema pode ser:

1. O bundle JavaScript não está carregando corretamente
2. O código nativo do Mapbox não está renderizando os círculos
3. Os dados dos radares não estão chegando corretamente

Se o problema persistir, verifique os logs do Android:
```bash
adb logcat | grep -E "(ReactNative|Mapbox|Radar)"
```

