# Deploy do backend a partir deste Git

O backend ficou neste repositório (RadarREact). O servidor já está configurado com ele; a diferença é que **as atualizações agora vêm deste Git**.

---

## Se o admin não consegue adicionar, mover ou deletar radares (404)

Se no painel admin as ações **Adicionar**, **Mover** ou **Deletar** falham com erro tipo **404** ou "Erro ao criar radar: 404", o servidor está rodando **código antigo** (sem as rotas `POST /radars/report`, `PATCH /radars/:id`, `DELETE /radars/:id`).

**O que fazer no servidor:**

1. Atualizar o código e **recompilar**:
   ```bash
   cd ~/RadarREact   # ou a pasta do clone
   git pull origin main
   cd backend
   npm install
   npm run build     # obrigatório: gera o JS com as novas rotas
   pm2 restart radar-backend   # ou o nome do seu processo
   ```
2. Conferir se o processo subiu: `pm2 logs radar-backend` (ou o nome que você usa).
3. Testar a API direto no servidor:
   ```bash
   curl -X POST http://localhost:3000/radars/report \
     -H "Content-Type: application/json" \
     -d '{"latitude":-23.55,"longitude":-46.63}'
   ```
   Se retornar JSON com `radar`, a rota está ativa. Se retornar 404, o build/restart não foi aplicado.

---

## ⚠️ Situação atual: backend ainda não está no Git

Se no servidor `backend/` não tem `package.json` e `git ls-files backend/` no seu PC está vazio, **o código do backend ainda não foi commitado** neste repositório. A pasta `backend/` no repo só tem `.env` (que é ignorado) ou está vazia.

**O que fazer:**

1. **No seu PC (onde você desenvolve):** copie para `RadarREact/backend/` todo o código do backend do projeto antigo: `package.json`, `package-lock.json`, `src/` (ou o que tiver), `tsconfig.json`, etc. **Não** copie o `.env` (ou deixe o que já está e não commite).
2. Confira que existe `backend/package.json`.
3. Commit e push:
   ```bash
   git add backend/
   git status   # conferir que .env NÃO está listado
   git commit -m "Backend: adicionar código ao repositório"
   git push origin main
   ```
4. **No servidor:** siga a seção "Depois de adicionar o backend no Git (servidor)" mais abaixo.

---

## 1. Garantir que o backend está neste repositório

- A pasta **`backend/`** deve estar na raiz do projeto (junto de `admin/`, `screens/`, etc.).
- O arquivo **`backend/.env`** **não** deve ser commitado (já está no `.gitignore`). No servidor, o `.env` continua sendo o que você configurou lá.

Se o backend veio de outro projeto, confira que dentro de `backend/` existem pelo menos:

- `package.json`
- Código do servidor (ex.: `src/`, `index.js`, etc.)

Depois:

```bash
git add backend/
git commit -m "Backend: trazer código para este repositório"
git push origin main
```

---

## 2. No servidor: usar este repositório

No servidor (ex.: `72.60.247.18`) você pode seguir um dos caminhos abaixo.

### Opção A: Servidor ainda está clonando o repositório antigo

1. Entrar no servidor (SSH):

   ```bash
   ssh usuario@72.60.247.18
   ```

2. Ir até a pasta onde o backend está (ex.: `~/radar-backend` ou `~/RadarREact/backend`).

3. Trocar o remote para **este** repositório:

   ```bash
   git remote -v
   git remote set-url origin https://github.com/keillon/radarReact.git
   # ou: git remote set-url origin git@github.com:keillon/radarReact.git
   git fetch origin
   git branch -M main
   git reset --hard origin/main
   ```

4. Se o backend ficar numa subpasta `backend/`:

   ```bash
   cd backend
   npm install
   # Reiniciar o processo (veja seção 3)
   ```

### Opção B: Clonar este repositório do zero no servidor

1. No servidor:

   ```bash
   cd ~
   git clone https://github.com/keillon/radarReact.git
   cd RadarREact/backend
   cp .env.example .env   # se existir; senão criar .env com as variáveis do servidor
   # Editar .env com DATABASE_URL, PORT, etc.
   npm install
   npm run build         # se tiver script build
   # Iniciar com pm2 ou systemd (seção 3)
   ```

Assim o servidor passa a usar **só** este Git.

---

## 3. Reiniciar o backend no servidor

Se você usa **PM2** (ex.: `pm2 start backend` ou `pm2 start npm --name "backend" -- start`):

```bash
cd ~/RadarREact/backend   # ou a pasta onde está o backend
pm2 restart backend       # ou o nome que você deu ao processo
# ou
pm2 restart all
```

Se usa **systemd**, algo como:

```bash
sudo systemctl restart radar-backend
```

Ajuste o nome do serviço conforme o que você configurou.

---

## 4. Fluxo de atualização (a partir de agora)

Sempre que você mudar o backend **neste** repositório:

1. **Na sua máquina (onde você desenvolve):**

   ```bash
   cd C:\Users\Keillon\Desktop\RadarREact
   git add backend/
   git commit -m "Backend: descrição da alteração"
   git push origin main
   ```

2. **No servidor:**

   ```bash
   ssh usuario@72.60.247.18
   cd ~/RadarREact          # ou a pasta onde está o clone
   git pull origin main
   cd backend
   npm install              # só se tiver mudado package.json / dependências
   pm2 restart backend      # ou o comando que você usa para reiniciar
   ```

Assim, as atualizações do backend passam a vir **deste** Git e o servidor continua usando o mesmo `.env` e a mesma configuração que já estão lá.

---

## 5. Script opcional de deploy (na sua máquina)

Se quiser automatizar “puxar no servidor e reiniciar”, você pode usar um script que faz SSH + pull + restart. Exemplo em PowerShell (`.ps1`) ou Bash (`.sh`). Você precisa ajustar:

- `USUARIO` e `72.60.247.18`
- Caminho da pasta no servidor (`~/RadarREact` ou outro)
- Nome do processo PM2 (`backend` ou outro)

Exemplo (Bash, salvar como `scripts/deploy-backend.sh`):

```bash
#!/bin/bash
SERVER="usuario@72.60.247.18"
REPO_DIR="RadarREact"  # pasta do clone no servidor

ssh "$SERVER" "cd $REPO_DIR && git pull origin main && cd backend && npm install && pm2 restart backend"
```

Dar permissão e rodar: `chmod +x scripts/deploy-backend.sh` e `./scripts/deploy-backend.sh`.

---

Resumo: **backend neste Git → push para `main` → no servidor: `git pull`, `npm install` (se precisar), reiniciar o processo.**

---

## Depois de adicionar o backend no Git (servidor)

Quando o `backend/` já tiver `package.json` e o código no repositório:

**Estrutura esperada no servidor:** repositório em `~/apps/radar` (raiz do repo), backend em `~/apps/radar/backend`.

1. **Garantir que o `.env` existe no servidor** (não vem do Git):
   ```bash
   cd ~/apps/radar/backend
   ls -la .env
   ```
   Se não existir, crie com `DATABASE_URL`, `PORT`, etc. (copie do backup ou do projeto antigo).

2. **Atualizar o código e instalar:**
   ```bash
   cd ~/apps/radar
   git pull origin main
   cd backend
   npm install
   npm run build
   ```
   (Use o comando de build do seu backend, se for outro.)

3. **Subir o backend com PM2:**
   ```bash
   cd ~/apps/radar/backend
   pm2 start npm --name "radar-backend" -- run start
   pm2 save
   ```
   (Troque `npm run start` pelo script que você usa no `package.json`, ex.: `node dist/index.js`.)

4. **Da próxima vez (só atualização):**
   ```bash
   cd ~/apps/radar
   git pull origin main
   cd backend
   npm install
   pm2 restart radar-backend
   ```

---

## Servidor não puxa o backend (git pull não traz package.json)

Rode no servidor, **na ordem**:

**1. Conferir de onde está puxando e se está atualizado**
```bash
cd ~/apps/radar
git remote -v
git fetch origin
git log -1 --oneline HEAD
git log -1 --oneline origin/main
```
Se `HEAD` e `origin/main` forem commits diferentes, o servidor está atrás. Avance para o passo 2.

**2. Atualizar de verdade (sobrescrever com o que está no GitHub)**
```bash
cd ~/apps/radar
git fetch origin
git reset --hard origin/main
```
Isso descarta qualquer alteração local e deixa o servidor **igual** ao `main` do GitHub.

**3. Ver se o backend veio**
```bash
ls -la ~/apps/radar/backend/
```
Deve aparecer `package.json` e `src/` (ou o que você commitou). Se não aparecer, o repositório no GitHub ainda não tem esse código (confira no GitHub na pasta `backend/` se existe `package.json`).

**4. Se existir `backend/.git` no servidor (repositório dentro do backend)**  
O Git do `~/apps/radar` não atualiza o conteúdo de `backend/` nesse caso. Remova o `.git` de dentro do backend e repita o reset:
```bash
rm -rf ~/apps/radar/backend/.git
cd ~/apps/radar
git checkout origin/main -- backend/
```
Depois confira de novo com `ls ~/apps/radar/backend/`.

**5. Garantir o `.env` e subir o backend**
```bash
cd ~/apps/radar/backend
# Se não tiver .env, crie (não vem do Git)
ls -la .env
npm install
npm run build
pm2 restart radar-backend
```
