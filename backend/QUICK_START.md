# Quick Start - Deploy Rápido

## Backend (MongoDB já configurado)

### 1. Configurar ambiente local:
```bash
cd backend
npm install
```

### 2. Criar arquivo .env:
Crie `backend/.env` com:
```env
DATABASE_URL="mongodb+srv://radar:5584627913@radar.hh3dsji.mongodb.net/radar?retryWrites=true&w=majority"
PORT=3000
```

### 3. Gerar Prisma Client:
```bash
npm run prisma:generate
```

### 4. Testar localmente:
```bash
npm run dev
```

### 5. Deploy rápido (Railway):
1. Acesse [railway.app](https://railway.app)
2. "New Project" > "Deploy from GitHub"
3. Conecte o repositório
4. Selecione pasta `backend/`
5. Adicione variável: `DATABASE_URL` = `mongodb+srv://radar:5584627913@radar.hh3dsji.mongodb.net/radar?retryWrites=true&w=majority`
6. Pronto! Railway faz o resto automaticamente.

## Mobile (Build para teste)

### Build Android APK:
```bash
cd mobile
npm install
npm install -g eas-cli
eas login
eas build --platform android --profile development
```

### Ou testar com Expo Go:
```bash
cd mobile
npm install
# Configure EXPO_PUBLIC_API_URL no .env ou app.config.js
npm start
```

### Configurar URL do backend:
No arquivo `mobile/.env` ou `mobile/app.config.js`:
```env
EXPO_PUBLIC_API_URL=https://seu-backend.railway.app
EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=seu_token_mapbox
```

## Checklist de Deploy

- [ ] Backend: `.env` configurado com MongoDB
- [ ] Backend: `npm run prisma:generate` executado
- [ ] Backend: Deploy feito (Railway/Render/etc)
- [ ] MongoDB Atlas: IP do servidor na whitelist
- [ ] Mobile: URL do backend configurada
- [ ] Mobile: Token do Mapbox configurado
- [ ] Mobile: Build criado ou Expo Go testado

