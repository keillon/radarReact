# Patches (patch-package)

As alterações em pacotes de `node_modules` são salvas aqui e **reaplicadas automaticamente** após cada `npm install` (script `postinstall` no `package.json`).

## Pacotes com patch

- **@pawan-pk/react-native-mapbox-navigation** – correções Kotlin (radares, ícones, rotas alternativas).

## Depois de alterar um pacote em node_modules

1. Se for o **mapbox-navigation**, remova a pasta `android/build` antes (evita erro de “path too long” no Windows):
   ```bash
   npm run patch:save
   ```
2. O arquivo `.patch` em `patches/` será atualizado.
3. Faça **commit** do arquivo `.patch` no Git para não perder as alterações.

Nunca apague a pasta `patches/` nem os arquivos `.patch`; o `postinstall` depende deles.
