# Migrar do Railway para VPS

Este guia ajuda a migrar o app mobile para usar o backend na VPS em vez do Railway.

## Pré-requisitos

- ✅ Backend rodando na VPS
- ✅ PostgreSQL configurado e funcionando
- ✅ IP do servidor: `72.60.247.18`

## Opção 1: Usar IP direto (Mais simples)

### 1. No Servidor VPS - Verificar se backend está rodando

```bash
# Verificar se o backend está rodando
cd ~/apps/radar/backend
pm2 status

# Se não estiver rodando, iniciar:
npm run build
pm2 start dist/index.js --name radar-backend
pm2 save
```

### 2. Configurar Firewall

```bash
# Permitir porta 3000 (backend)
sudo ufw allow 3000/tcp
sudo ufw reload
sudo ufw status
```

### 3. Testar Backend

No seu computador, teste:

```bash
curl http://72.60.247.18:3000/radars
```

### 4. No Mobile - Configurar .env

Crie/edite `mobile/.env`:

```env
EXPO_PUBLIC_API_URL=http://72.60.247.18:3000
EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=seu_token_mapbox_aqui
```

### 5. Rebuild do App

```bash
cd mobile
npm run build
# ou
npx expo start --clear
```

## Opção 2: Usar Nginx com Domínio (Recomendado para produção)

### 1. Instalar Nginx no Servidor

```bash
sudo apt update
sudo apt install nginx -y
sudo systemctl enable nginx
sudo systemctl start nginx
```

### 2. Configurar Nginx

```bash
sudo nano /etc/nginx/sites-available/radar-backend
```

Adicione:

```nginx
server {
    listen 80;
    server_name seu-dominio.com;  # Ou use o IP: 72.60.247.18

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Ativar:

```bash
sudo ln -s /etc/nginx/sites-available/radar-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 3. Configurar SSL (Opcional mas Recomendado)

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d seu-dominio.com
```

### 4. No Mobile - Configurar .env

```env
EXPO_PUBLIC_API_URL=https://seu-dominio.com
# ou sem SSL:
EXPO_PUBLIC_API_URL=http://seu-dominio.com
```

## Opção 3: Usar Nginx sem Domínio (IP direto)

### 1. Configurar Nginx

```bash
sudo nano /etc/nginx/sites-available/radar-backend
```

```nginx
server {
    listen 80;
    server_name 72.60.247.18;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Ativar e reiniciar:

```bash
sudo ln -s /etc/nginx/sites-available/radar-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Permitir porta 80
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

### 2. No Mobile - Configurar .env

```env
EXPO_PUBLIC_API_URL=http://72.60.247.18
```

## Verificar Backend na VPS

### Verificar se está rodando:

```bash
# No servidor
pm2 status
pm2 logs radar-backend

# Verificar porta
sudo netstat -tlnp | grep 3000
# ou
sudo ss -tlnp | grep 3000
```

### Iniciar Backend (se necessário):

```bash
cd ~/apps/radar/backend
git pull origin main
npm install
npm run build
pm2 delete radar-backend  # Se já existir
pm2 start dist/index.js --name radar-backend
pm2 save
pm2 startup  # Configurar para iniciar no boot
```

## Testar Conexão

### Do seu computador:

```bash
# Testar API
curl http://72.60.247.18:3000/radars

# Ou com Nginx (porta 80)
curl http://72.60.247.18/radars
```

### No App Mobile:

1. Edite `mobile/.env` com a URL correta
2. Rebuild o app
3. Verifique os logs no console
4. Deve aparecer: `🔧 API_URL (api.ts): http://72.60.247.18:3000`

## Troubleshooting

### Erro: "Network request failed"

- ✅ Verifique se o backend está rodando: `pm2 status`
- ✅ Verifique firewall: `sudo ufw status`
- ✅ Teste a URL no navegador
- ✅ Verifique logs: `pm2 logs radar-backend`

### Erro: "CORS"

- ✅ Verifique se o backend tem CORS configurado para aceitar requisições do mobile
- ✅ Verifique o arquivo `backend/src/index.ts` e a configuração CORS

### Backend não inicia

```bash
# Ver logs
pm2 logs radar-backend

# Verificar .env
cd ~/apps/radar/backend
cat .env

# Verificar Prisma
npm run prisma:generate
```

## Recomendação

Para desenvolvimento/testes: **Opção 1** (IP direto, porta 3000)
Para produção: **Opção 2** (Nginx com domínio e SSL)
