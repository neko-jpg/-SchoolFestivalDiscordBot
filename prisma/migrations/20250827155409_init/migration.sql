/*
  Warnings:

  - The `status` column on the `LostItem` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `assignees` on the `Shift` table. All the data in the column will be lost.
  - You are about to drop the column `time` on the `Shift` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[guildId,name]` on the table `InventoryItem` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[guildId,keyword]` on the table `Knowledge` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[guildId,name]` on the table `Segment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[guildId,name]` on the table `Template` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `guildId` to the `BuildRun` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `status` on the `BuildRun` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `guildId` to the `CongestionReport` table without a default value. This is not possible if the table is not empty.
  - Added the required column `guildId` to the `InventoryItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `guildId` to the `Knowledge` table without a default value. This is not possible if the table is not empty.
  - Added the required column `guildId` to the `Kudos` table without a default value. This is not possible if the table is not empty.
  - Added the required column `guildId` to the `LostItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `endAt` to the `Shift` table without a default value. This is not possible if the table is not empty.
  - Added the required column `guildId` to the `Shift` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startAt` to the `Shift` table without a default value. This is not possible if the table is not empty.
  - Added the required column `guildId` to the `Template` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."LostItemStatus" AS ENUM ('IN_STORAGE', 'RETURNED');

-- CreateEnum
CREATE TYPE "public"."BuildRunStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'ROLLED_BACK');

-- DropIndex
DROP INDEX "public"."CongestionReport_location_createdAt_idx";

-- DropIndex
DROP INDEX "public"."InventoryItem_name_key";

-- DropIndex
DROP INDEX "public"."Knowledge_keyword_key";

-- DropIndex
DROP INDEX "public"."Segment_name_key";

-- DropIndex
DROP INDEX "public"."Template_name_key";

-- AlterTable
ALTER TABLE "public"."BuildRun" ADD COLUMN     "guildId" TEXT NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "public"."BuildRunStatus" NOT NULL;

-- AlterTable
ALTER TABLE "public"."CongestionReport" ADD COLUMN     "guildId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."InventoryItem" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "guildId" TEXT NOT NULL,
ALTER COLUMN "checkouts" SET DEFAULT '[]'::jsonb;

-- AlterTable
ALTER TABLE "public"."Knowledge" ADD COLUMN     "guildId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."Kudos" ADD COLUMN     "guildId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."LostItem" ADD COLUMN     "guildId" TEXT NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "public"."LostItemStatus" NOT NULL DEFAULT 'IN_STORAGE';

-- AlterTable
ALTER TABLE "public"."Shift" DROP COLUMN "assignees",
DROP COLUMN "time",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "endAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "guildId" TEXT NOT NULL,
ADD COLUMN     "startAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "timezone" TEXT,
ALTER COLUMN "location" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."Template" ADD COLUMN     "guildId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "tag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GuildConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "reminderChannelId" TEXT,
    "festivalStartDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ShiftMember" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT,
    "notes" TEXT,

    CONSTRAINT "ShiftMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuildConfig_guildId_key" ON "public"."GuildConfig"("guildId");

-- CreateIndex
CREATE INDEX "ShiftMember_userId_idx" ON "public"."ShiftMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftMember_shiftId_userId_key" ON "public"."ShiftMember"("shiftId", "userId");

-- CreateIndex
CREATE INDEX "BuildRun_guildId_createdAt_idx" ON "public"."BuildRun"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "CongestionReport_guildId_location_createdAt_idx" ON "public"."CongestionReport"("guildId", "location", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryItem_guildId_idx" ON "public"."InventoryItem"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_guildId_name_key" ON "public"."InventoryItem"("guildId", "name");

-- CreateIndex
CREATE INDEX "Knowledge_guildId_idx" ON "public"."Knowledge"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "Knowledge_guildId_keyword_key" ON "public"."Knowledge"("guildId", "keyword");

-- CreateIndex
CREATE INDEX "Kudos_guildId_createdAt_idx" ON "public"."Kudos"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "LostItem_guildId_status_createdAt_idx" ON "public"."LostItem"("guildId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Segment_guildId_name_key" ON "public"."Segment"("guildId", "name");

-- CreateIndex
CREATE INDEX "Shift_guildId_startAt_idx" ON "public"."Shift"("guildId", "startAt");

-- CreateIndex
CREATE INDEX "Template_guildId_idx" ON "public"."Template"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "Template_guildId_name_key" ON "public"."Template"("guildId", "name");

-- AddForeignKey
ALTER TABLE "public"."ShiftMember" ADD CONSTRAINT "ShiftMember_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "public"."Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ShiftMember" ADD CONSTRAINT "ShiftMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LostItem" ADD CONSTRAINT "LostItem_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CongestionReport" ADD CONSTRAINT "CongestionReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Kudos" ADD CONSTRAINT "Kudos_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Kudos" ADD CONSTRAINT "Kudos_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
