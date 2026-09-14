-- CreateTable
CREATE TABLE "web_quote_requests" (
    "id" UUID NOT NULL,
    "quote_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "message" TEXT,
    "contacted" BOOLEAN NOT NULL DEFAULT false,
    "contacted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_quote_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "web_quote_requests_contacted_idx" ON "web_quote_requests"("contacted");
