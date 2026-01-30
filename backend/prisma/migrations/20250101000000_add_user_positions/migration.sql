-- CreateTable
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

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "user_positions_userId_key" ON "user_positions"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_positions_latitude_longitude_idx" ON "user_positions"("latitude", "longitude");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_positions_updatedAt_idx" ON "user_positions"("updatedAt");

