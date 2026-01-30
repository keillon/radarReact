-- CreateTable
CREATE TABLE "radars" (
    "id" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "confirms" INTEGER NOT NULL DEFAULT 0,
    "denies" INTEGER NOT NULL DEFAULT 0,
    "lastConfirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,
    "rodovia" TEXT,
    "uf" TEXT,
    "municipio" TEXT,
    "km" DOUBLE PRECISION,
    "tipoRadar" TEXT,
    "velocidadeLeve" INTEGER,
    "velocidadePesado" INTEGER,
    "velocidadeOriginalLeve" INTEGER,
    "velocidadeOriginalPesado" INTEGER,
    "sentido" TEXT,
    "situacao" TEXT,
    "concessionaria" TEXT,
    "license" TEXT,
    "attribution" TEXT,

    CONSTRAINT "radars_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "radars_latitude_longitude_idx" ON "radars"("latitude", "longitude");

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateTable
CREATE TABLE "user_radar_actions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "radarId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_radar_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_radar_actions_userId_radarId_action_key" ON "user_radar_actions"("userId", "radarId", "action");

-- CreateIndex
CREATE INDEX "user_radar_actions_radarId_idx" ON "user_radar_actions"("radarId");

-- CreateIndex
CREATE INDEX "user_radar_actions_userId_idx" ON "user_radar_actions"("userId");

-- CreateTable
CREATE TABLE "user_radar_speed_votes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "radarId" TEXT NOT NULL,
    "velocidadeLeve" INTEGER,
    "velocidadePesado" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_radar_speed_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_radar_speed_votes_userId_radarId_key" ON "user_radar_speed_votes"("userId", "radarId");

-- CreateIndex
CREATE INDEX "user_radar_speed_votes_radarId_idx" ON "user_radar_speed_votes"("radarId");

-- CreateIndex
CREATE INDEX "user_radar_speed_votes_userId_idx" ON "user_radar_speed_votes"("userId");
