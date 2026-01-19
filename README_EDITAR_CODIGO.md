# ⚠️ IMPORTANTE: Como Editar sem o Cursor Reverter

## O Problema
O Cursor **automaticamente reverte** mudanças em arquivos do `node_modules` quando você aceita sugestões ou quando ele "limpa" o código.

## ✅ Solução Rápida

### Após CADA edição no arquivo:
```
node_modules/@pawan-pk/react-native-mapbox-navigation/android/src/main/java/com/mapboxnavigation/MapboxNavigationView.kt
```

**Execute IMEDIATAMENTE:**
```bash
salvar-mudancas.bat
```

Isso salva suas mudanças no patch. Se o Cursor reverter, execute:
```bash
aplicar-patch-manualmente.bat
```

## 🔄 Workflow Recomendado

1. **Edite o arquivo** no Cursor
2. **Salve o arquivo** (Ctrl+S)
3. **Execute `salvar-mudancas.bat`** IMEDIATAMENTE
4. Se o Cursor reverter, execute `aplicar-patch-manualmente.bat`

## 💡 Dica

Crie um atalho no Cursor ou use o terminal integrado para executar rapidamente:
- Pressione `` Ctrl+` `` para abrir o terminal
- Digite: `salvar-mudancas.bat` e Enter

## 🛠️ Scripts Disponíveis

- `salvar-mudancas.bat` - Salva mudanças no patch (use após editar)
- `aplicar-patch-manualmente.bat` - Restaura mudanças do patch
- `criar-patch-limpo.bat` - Recria o patch do zero

