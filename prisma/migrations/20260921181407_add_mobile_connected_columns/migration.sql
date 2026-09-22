-- AlterTable
ALTER TABLE "cash_sessions" ADD COLUMN     "device_id" UUID;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "change_amount" DECIMAL(12,2),
ADD COLUMN     "payment_amount" DECIMAL(12,2);

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
