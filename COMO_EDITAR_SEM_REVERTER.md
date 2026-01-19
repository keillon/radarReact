# Como Editar o Código sem o Cursor Reverter

## O Problema
O Cursor às vezes reverte mudanças em arquivos do `node_modules`. Isso acontece porque o Cursor tenta "limpar" ou "sincronizar" arquivos modificados.

## Solução: Workflow de Edição

### Passo 1: Faça suas edições
Edite o arquivo:
```
node_modules/@pawan-pk/react-native-mapbox-navigation/android/src/main/java/com/mapboxnavigation/MapboxNavigationView.kt
```

### Passo 2: IMEDIATAMENTE após editar, execute:
```bash
atualizar-patch-apos-edicao.bat
```

Isso salva suas mudanças no patch, então mesmo que o Cursor reverta, você pode restaurar executando:
```bash
aplicar-patch-manualmente.bat
```

## Dica: Use o Cursor com Cuidado

1. **Não aceite sugestões automáticas** do Cursor para arquivos em `node_modules` - elas podem reverter suas mudanças
2. **Sempre atualize o patch** após fazer mudanças manuais
3. **Se o Cursor reverter**, não se preocupe - execute `aplicar-patch-manualmente.bat` para restaurar

## Alternativa: Editar e Build Direto

Se você não quiser lidar com patches:
1. Edite o arquivo diretamente
2. Faça o build imediatamente (sem aplicar patch)
3. O build usará suas mudanças diretas

O patch só é necessário se você quiser que as mudanças sejam preservadas após `npm install`.

