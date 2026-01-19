# 🔧 Solução para Erros do Reanimated e Mapbox

## ⚠️ Erros Encontrados

1. **Reanimated:**
   - `AnimatedCoordinatesArray could not obtain AnimatedWithChildren base class`
   - `AnimatedShape could not obtain AnimatedWithChildren base class`

2. **Mapbox:**
   - `Error dispatching event: | java.lang.NullPointerException`

## ✅ Soluções

### 1. Limpar Cache e Reconstruir

**IMPORTANTE:** Após adicionar o plugin do Reanimated no Babel, você **DEVE** limpar o cache completamente:

```bash
# 1. Pare o Metro bundler (Ctrl+C)

# 2. Limpe o cache do Metro
npm start -- --reset-cache

# 3. Em outro terminal, limpe o build do Android
cd android
./gradlew clean
cd ..

# 4. Reconstrua o app
npm run android
```

### 2. Verificar Configuração do Babel

O `babel.config.js` deve ter o plugin do Reanimated como **ÚLTIMO** plugin:

```js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    'nativewind/babel',
    'react-native-reanimated/plugin', // DEVE SER O ÚLTIMO
  ],
};
```

### 3. Limpar Cache do App no Dispositivo

1. Vá em **Configurações** → **Apps** → **RadarBot**
2. Toque em **Armazenamento**
3. Toque em **Limpar cache**
4. Feche e reabra o app

### 4. Reinstalar Dependências (Se necessário)

Se os erros persistirem:

```bash
# Remover node_modules e reinstalar
rm -rf node_modules
npm install

# Aplicar patches novamente
npm run postinstall

# Limpar e reconstruir
cd android && ./gradlew clean && cd ..
npm start -- --reset-cache
```

### 5. Verificar Versões

Certifique-se de que as versões são compatíveis:

- `react-native`: `0.74.3`
- `react-native-reanimated`: `~3.10.1` (compatível com RN 0.74.3)
- `@rnmapbox/maps`: `^10.2.10`

## 🔍 Sobre os Erros do Mapbox

Os erros `NullPointerException` do Mapbox podem ser causados por:

1. **Eventos não inicializados corretamente** (já corrigido nos patches)
2. **Cache antigo** - limpe o cache e reconstrua
3. **Problemas de permissão** - verifique se as permissões de localização estão concedidas

## 📝 Ordem Correta de Plugins no Babel

A ordem dos plugins no Babel é **CRÍTICA**:

1. Plugins de transformação (ex: `nativewind/babel`)
2. Plugin do Reanimated **DEVE SER O ÚLTIMO**

```js
plugins: [
  'nativewind/babel',
  'react-native-reanimated/plugin', // ← ÚLTIMO
],
```

## 🚀 Script de Limpeza Completa

Use o script `limpar_e_reconstruir.bat` para limpar tudo:

```bash
limpar_e_reconstruir.bat
```

Depois execute:
```bash
npm start -- --reset-cache
# Em outro terminal:
npm run android
```

## ✅ Verificação

Após seguir os passos acima, os erros devem desaparecer. Se persistirem:

1. Verifique se o Metro bundler foi reiniciado com `--reset-cache`
2. Verifique se o app foi reconstruído completamente
3. Verifique se o cache do dispositivo foi limpo
4. Verifique se o `babel.config.js` está correto

