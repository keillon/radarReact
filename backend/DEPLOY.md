# Guia de Deploy - Backend Radar

## Pré-requisitos

- Node.js 18+ instalado
- Conta no MongoDB Atlas (já configurada)
- Conta em um serviço de deploy (Railway, Render, Heroku, etc.)

## Configuração Local

1. **Instalar dependências:**

```bash
cd backend
npm install
```

2. **Configurar variáveis de ambiente:**
   Crie um arquivo `.env` na pasta `backend/`:

```env
DATABASE_URL="mongodb+srv://radar:5584627913@radar.hh3dsji.mongodb.net/radar?retryWrites=true&w=majority"
PORT=3000
```

3. **Gerar Prisma Client:**

```bash
npm run prisma:generate
```

4. **Testar localmente:**

```bash
npm run dev
```

## Deploy em Produção

### Opção 1: Railway (Recomendado)

1. Acesse [Railway](https://railway.app)
2. Crie uma nova conta ou faça login
3. Clique em "New Project" > "Deploy from GitHub repo"
4. Conecte seu repositório GitHub
5. **IMPORTANTE:** Após conectar o repositório:
   - Clique no serviço criado
   - Vá em **Settings** > **Root Directory**
   - Digite: `backend`
   - Clique em **Save**
6. Adicione variáveis de ambiente (Settings > Variables):
   - `DATABASE_URL`: `mongodb+srv://radar:5584627913@radar.hh3dsji.mongodb.net/radar?retryWrites=true&w=majority`
   - `PORT`: `3000` (Railway define automaticamente, mas é bom ter)
   - `NODE_ENV`: `production`
7. Railway detectará automaticamente o `package.json` e executará:
   - Build: `npm run build` (que já inclui `prisma generate`)
   - Start: `npm start`

### Opção 2: Render

1. Acesse [Render](https://render.com)
2. Crie uma nova conta ou faça login
3. Clique em "New +" > "Web Service"
4. Conecte seu repositório GitHub
5. Configure:
   - **Name**: `radar-backend`
   - **Root Directory**: `backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run prisma:generate && npm run build`
   - **Start Command**: `npm start`
6. Adicione variáveis de ambiente:
   - `DATABASE_URL`: `mongodb+srv://radar:5584627913@radar.hh3dsji.mongodb.net/radar?retryWrites=true&w=majority`
7. Clique em "Create Web Service"

### Opção 3: Heroku

1. Instale o [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli)
2. Faça login: `heroku login`
3. Crie o app: `heroku create radar-backend`
4. Configure variáveis:

```bash
heroku config:set DATABASE_URL="mongodb+srv://radar:5584627913@radar.hh3dsji.mongodb.net/radar?retryWrites=true&w=majority"
```

5. Adicione buildpack:

```bash
heroku buildpacks:add heroku/nodejs
```

6. Faça deploy:

```bash
git subtree push --prefix backend heroku main
```

## Verificar se está funcionando

Após o deploy, teste os endpoints:

- `GET https://seu-backend.railway.app/radars` (ou URL do seu deploy)
- Deve retornar: `{"radars": []}` (vazio se não houver radares)

## Configurar CORS (se necessário)

Se precisar permitir acesso de domínios específicos, edite `backend/src/index.ts`:

```typescript
await fastify.register(cors, {
  origin: ["https://seu-dominio.com"], // ou true para permitir todos
});
```

## Troubleshooting

### Erro: "Cannot find module '@prisma/client'"

Execute no servidor de deploy:

```bash
npm run prisma:generate
```

### Erro de conexão com MongoDB

- Verifique se o IP do servidor está na whitelist do MongoDB Atlas
- No MongoDB Atlas, vá em Network Access e adicione `0.0.0.0/0` (permitir todos) OU o IP específico do servidor

### Porta não definida

Alguns serviços (como Railway) definem automaticamente a variável `PORT`. Se não funcionar, verifique as variáveis de ambiente no painel do serviço.
