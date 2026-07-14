-- DropIndex
DROP INDEX "users_business_id_username_key";

-- CreateIndex
CREATE INDEX "users_business_id_idx" ON "users"("business_id");
