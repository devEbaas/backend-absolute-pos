-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "platform" TEXT NOT NULL DEFAULT 'desktop';
ALTER TABLE "devices" ADD COLUMN     "revoked_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "pairing_codes" ADD COLUMN     "platform" TEXT NOT NULL DEFAULT 'desktop';

-- CreateTable
CREATE TABLE "platform_admins" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_admins_username_key" ON "platform_admins"("username");
