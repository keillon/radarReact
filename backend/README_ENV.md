# Configuração do .env

O arquivo `.env` precisa ser configurado com suas credenciais reais do banco de dados.

## Formato para MongoDB (Atual):

```env
DATABASE_URL="mongodb+srv://radar:5584627913@radar.hh3dsji.mongodb.net/radar?retryWrites=true&w=majority"
PORT=3000
```

## Como criar o arquivo .env:

1. Na pasta `backend/`, crie um arquivo `.env`:
```bash
cp .env.example .env
```

2. Ou crie manualmente com o conteúdo:
```env
DATABASE_URL="mongodb+srv://radar:5584627913@radar.hh3dsji.mongodb.net/radar?retryWrites=true&w=majority"
PORT=3000
```

## Testar conexão:

Após configurar, teste:
```bash
npm run prisma:generate
npm run dev
```

Se tudo estiver ok, o servidor iniciará sem erros de conexão.

## MongoDB Atlas - Configuração Importante:

1. **Network Access (Whitelist):**
   - Acesse o MongoDB Atlas
   - Vá em "Network Access"
   - Para desenvolvimento local: Adicione seu IP atual ou `0.0.0.0/0` (permitir todos)
   - Para produção: Adicione o IP do servidor de deploy

2. **Database Access:**
   - Certifique-se de que o usuário `radar` existe
   - Com a senha `5584627913`
   - Com permissões de leitura e escrita

## Formato para MySQL (Legado):

```env
DATABASE_URL="mysql://usuario:senha@localhost:3306/radar"
PORT=3000
```

## Formato para PostgreSQL (Legado):

```env
DATABASE_URL="postgresql://usuario:senha@localhost:5432/radar?schema=public"
PORT=3000
```
