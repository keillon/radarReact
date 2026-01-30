#!/bin/bash

# Script para corrigir permissões do usuário radar no PostgreSQL

echo "🔧 Corrigindo permissões do usuário 'radar' no PostgreSQL..."

# 1. Conectar como postgres e dar permissões
sudo -u postgres psql << EOF

-- Garantir que o usuário radar existe
DO \$\$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'radar') THEN
      CREATE USER radar WITH PASSWORD 'radar';
   END IF;
END
\$\$;

-- Garantir que o banco radar existe
SELECT 'CREATE DATABASE radar'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'radar')\gexec

-- Conectar ao banco radar e dar permissões
\c radar

-- Dar todas as permissões ao usuário radar
GRANT ALL PRIVILEGES ON DATABASE radar TO radar;
GRANT ALL PRIVILEGES ON SCHEMA public TO radar;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO radar;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO radar;

-- Dar permissões para tabelas futuras
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO radar;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO radar;

-- Dar permissão para criar tabelas
GRANT CREATE ON SCHEMA public TO radar;

-- Dar permissão para criar databases (necessário para Prisma Migrate shadow database)
ALTER USER radar CREATEDB;

-- Verificar permissões
\du radar
\l radar

EOF

echo ""
echo "✅ Permissões corrigidas!"
echo ""
echo "📋 Teste a conexão novamente do seu computador local."

