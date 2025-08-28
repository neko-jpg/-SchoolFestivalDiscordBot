-- AlterTable
ALTER TABLE "public"."CongestionReport" ADD COLUMN     "weight" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "public"."CongestionMap" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageMessageId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CongestionMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CongestionLocation" (
    "id" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "xPercent" DOUBLE PRECISION NOT NULL,
    "yPercent" DOUBLE PRECISION NOT NULL,
    "maxCapacity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CongestionLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CongestionMap_guildId_isActive_idx" ON "public"."CongestionMap"("guildId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CongestionMap_guildId_name_key" ON "public"."CongestionMap"("guildId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CongestionLocation_mapId_name_key" ON "public"."CongestionLocation"("mapId", "name");

-- AddForeignKey
ALTER TABLE "public"."CongestionLocation" ADD CONSTRAINT "CongestionLocation_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "public"."CongestionMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
