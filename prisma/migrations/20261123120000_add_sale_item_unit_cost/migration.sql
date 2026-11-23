-- Costo unitario congelado al vender. Ver src/common/sale-cost.util.ts.
ALTER TABLE "sale_items" ADD COLUMN "unit_cost" DECIMAL(12,4);

-- Ganancia del corte, congelada al cerrar.
ALTER TABLE "cash_cuts" ADD COLUMN "total_cost" DECIMAL(14,4);
ALTER TABLE "cash_cuts" ADD COLUMN "total_profit" DECIMAL(14,4);

-- Backfill de las ventas ya sincronizadas con el costo ACTUAL del producto
-- (aproximación aceptada, igual que el backfill del desktop): misma regla que
-- saleUnitCost — el costo propio, o si es 0 y es presentación, padre × unidades.
-- El desktop no re-sube su histórico, así que esto es lo único que llena esas filas.
UPDATE "sale_items" si
SET "unit_cost" = CASE
    WHEN p."purchase_cost" > 0 OR p."parent_product_id" IS NULL THEN p."purchase_cost"
    ELSE COALESCE(parent."purchase_cost", 0) * p."units_per_pack"
  END
FROM "products" p
LEFT JOIN "products" parent ON parent."id" = p."parent_product_id"
WHERE p."id" = si."product_id"
  AND si."unit_cost" IS NULL;
