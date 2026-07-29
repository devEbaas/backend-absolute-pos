-- CreateTable
CREATE TABLE "offline_license_requests" (
    "id" UUID NOT NULL,
    "hardware_id" TEXT NOT NULL,
    "contact_name" TEXT,
    "business_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "license_key" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offline_license_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "offline_license_requests_hardware_id_key" ON "offline_license_requests"("hardware_id");

-- CreateIndex
CREATE INDEX "offline_license_requests_status_idx" ON "offline_license_requests"("status");
