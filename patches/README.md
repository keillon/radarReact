# Patches (patch-package)

As alterações em pacotes de `node_modules` são salvas aqui e **reaplicadas automaticamente** após cada `npm install` (script `postinstall` no `package.json`).

## Como NUNCA perder os patches

1. **Faça commit e push dos arquivos em `patches/`** – O Git é o armazenamento permanente.
2. **Nunca rode `npx patch-package <pacote>` manualmente** para "regenerar" um patch – isso recria o patch a partir do estado atual de `node_modules` e pode sobrescrever com versão menor, perdendo o código customizado.
3. **Use `npm run patch:save`** para salvar alterações no mapbox-navigation (já remove `android/build`).
4. **Confirme que `patches/` não está no `.gitignore`** – só `patches/*.tmp` é ignorado.

## Pacotes com patch

- **@pawan-pk/react-native-mapbox-navigation** – correções Kotlin (radares, ícones, rotas alternativas, highlight).
- **@rnmapbox/maps** – ajustes no Spec/Kotlin/Java.

## Depois de alterar um pacote em node_modules

1. Use `npm run patch:save` para mapbox-navigation (remove `android/build` automaticamente).
2. O arquivo `.patch` em `patches/` será atualizado.
3. **Faça commit e push** do arquivo `.patch` no Git para nunca perder.

Nunca apague a pasta `patches/` nem os arquivos `.patch`; o `postinstall` depende deles.
