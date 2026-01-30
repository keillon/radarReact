-- Script para verificar se a tabela user_positions existe
-- Execute no PostgreSQL: psql -d radar -f check-table.sql

-- Verificar se a tabela existe no schema public
SELECT 
    table_schema,
    table_name,
    table_type
FROM information_schema.tables
WHERE table_name = 'user_positions';

-- Verificar estrutura da tabela
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'user_positions'
ORDER BY ordinal_position;

-- Verificar índices
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'user_positions';

-- Verificar permissões
SELECT 
    grantee,
    privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' 
  AND table_name = 'user_positions';

-- Contar registros (se houver)
SELECT COUNT(*) as total_registros FROM user_positions;

