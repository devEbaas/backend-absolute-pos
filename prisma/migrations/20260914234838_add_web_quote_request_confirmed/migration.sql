-- AlterTable
ALTER TABLE "web_quote_requests" ADD COLUMN     "confirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "confirmed_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "web_quote_requests_confirmed_idx" ON "web_quote_requests"("confirmed");
