FROM node:18

WORKDIR /app

# Instalar dependências do sistema necessárias para Prisma
# A imagem Debian já inclui OpenSSL, mas garantimos que está instalado
RUN apt-get update && apt-get install -y \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Copiar arquivos de dependências
COPY package*.json ./
COPY prisma ./prisma/

# Instalar dependências
# Usar npm install (npm ci requer package-lock.json que pode não estar no repo)
RUN npm install

# Gerar Prisma Client
RUN npx prisma generate

# Copiar código fonte
COPY . .

# Compilar TypeScript
RUN npm run build

# Expor porta
EXPOSE 3000

# Comando para iniciar
CMD ["npm", "start"]

