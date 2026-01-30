-- Script SQL para criar a tabela user_positions manualmente
-- Execute este script diretamente no banco de dados PostgreSQL

-- Criar tabela user_positions
CREATE TABLE IF NOT EXISTS "user_positions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "bearing" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_positions_pkey" PRIMARY KEY ("id")
);

-- Criar índice único para userId
CREATE UNIQUE INDEX IF NOT EXISTS "user_positions_userId_key" ON "user_positions"("userId");

-- Criar índice composto para latitude e longitude (para buscas por proximidade)
CREATE INDEX IF NOT EXISTS "user_positions_latitude_longitude_idx" ON "user_positions"("latitude", "longitude");

-- Criar índice para updatedAt (para limpeza de posições antigas)
CREATE INDEX IF NOT EXISTS "user_positions_updatedAt_idx" ON "user_positions"("updatedAt");

-- Dar permissões ao usuário radar (se necessário)
GRANT ALL PRIVILEGES ON TABLE "user_positions" TO radar;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO radar;

