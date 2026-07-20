-- CreateTable
CREATE TABLE "licenses" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMP(3),
    "activated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "licenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "licenses_device_id_key" ON "licenses"("device_id");

-- CreateIndex
CREATE INDEX "licenses_status_idx" ON "licenses"("status");

-- AddForeignKey
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
