# Como salvar alterações do projeto (incluindo node_modules)

## 1. Alterações em `node_modules` (ex.: Mapbox Navigation)

O **node_modules** não é commitado no Git. As mudanças em pacotes como `@pawan-pk/react-native-mapbox-navigation` são salvas através de **patches**.

### Fluxo

1. **Você edita** arquivos em `node_modules/@pawan-pk/react-native-mapbox-navigation/` (ex.: Android/Kotlin, layout).
2. **Atualiza o patch** para gravar essas alterações em um arquivo versionado:
   - **Windows:** execute `criar-patch-limpo.bat` (ele remove a pasta `android/build` e roda o patch-package).
   - **Ou no terminal:**
     ```bash
     rm -rf node_modules/@pawan-pk/react-native-mapbox-navigation/android/build
     npx patch-package @pawan-pk/react-native-mapbox-navigation --use-yarn=false
     ```
3. O arquivo **`patches/@pawan-pk+react-native-mapbox-navigation+0.5.2.patch`** é criado/atualizado.
4. **Commit e push** desse arquivo:
   ```bash
   git add patches/@pawan-pk+react-native-mapbox-navigation+0.5.2.patch
   git commit -m "Atualiza patch Mapbox Navigation (voz pt-BR, compass, trip progress, etc.)"
   git push origin main
   ```

### Quando alguém clona o projeto ou roda `npm install`

- O **postinstall** no `package.json` executa `patch-package`.
- O **patch-package** aplica os arquivos em `patches/` no `node_modules`.
- Assim, as alterações do Mapbox Navigation (e de outros pacotes com patch) são restauradas automaticamente.

### Resumo

| Onde está a alteração | Onde fica “salva” no projeto | O que versionar no Git |
|-----------------------|-----------------------------|-------------------------|
| `node_modules/@pawan-pk/...` | Arquivo em `patches/*.patch` | `patches/*.patch` |
| `node_modules/@rnmapbox/...` | Arquivo em `patches/*.patch` | `patches/*.patch` |

**Importante:** Sempre que mudar algo em um pacote que tem patch, rode o `patch-package` (ou `criar-patch-limpo.bat`) e depois faça commit do arquivo em `patches/`.

---

## 2. Outros arquivos importantes do projeto

Estes **não** ficam em node_modules e são versionados normalmente:

- **Código da aplicação:** `screens/`, `components/`, `App.tsx`, etc.
- **Configuração:** `package.json`, `tsconfig.json`, `babel.config.js`, etc.
- **Android:** `android/app/`, `android/build.gradle` (código do app, não de libs).
- **Scripts e docs:** `*.bat`, `docs/`, etc.

Basta usar **git add**, **commit** e **push** como em qualquer projeto.

---

## 3. Evitar erro “Filename too long” no Windows

Ao criar o patch do Mapbox Navigation, o `patch-package` pode falhar no Windows se a pasta **android/build** existir (caminhos muito longos).

**Solução:** antes de rodar o patch-package, apague a pasta de build:

- Use o **`criar-patch-limpo.bat`** (já faz isso), ou
- No terminal:  
  `rm -rf node_modules/@pawan-pk/react-native-mapbox-navigation/android/build`

Depois rode o `npx patch-package` normalmente.
