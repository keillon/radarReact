-- AlterTable
ALTER TABLE "radars" ADD COLUMN IF NOT EXISTS "ativo" BOOLEAN NOT NULL DEFAULT true;

-- Atualizar todos os radares existentes para ativo = true
UPDATE "radars" SET "ativo" = true WHERE "ativo" IS NULL;
