-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "slug" TEXT;

-- Backfill: any pre-existing business (e.g. from manual DEPLOY.md bootstrap
-- testing) gets its id as a temporary slug so the column can go NOT NULL —
-- an operator can update it afterwards via a direct SQL UPDATE if needed.
UPDATE "businesses" SET "slug" = "id"::text WHERE "slug" IS NULL;

ALTER TABLE "businesses" ALTER COLUMN "slug" SET NOT NULL;

-- CreateTable
CREATE TABLE "pairing_codes" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pairing_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "businesses_slug_key" ON "businesses"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "pairing_codes_code_key" ON "pairing_codes"("code");

-- CreateIndex
CREATE INDEX "pairing_codes_business_id_idx" ON "pairing_codes"("business_id");

-- AddForeignKey
ALTER TABLE "pairing_codes" ADD CONSTRAINT "pairing_codes_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
