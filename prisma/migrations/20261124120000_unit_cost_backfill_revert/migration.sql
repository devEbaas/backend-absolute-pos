-- Revierte el relleno de unit_cost que hizo 20261123120000_add_sale_item_unit_cost.
--
-- MEJ-001 (absolute-pos-architecture): las partidas que ya existían en Postgres
-- se quedan en NULL; no se rellenan con el costo actual. DEC-002 marca esas
-- partidas como "estimadas" justamente porque no hay costo de la venta. El
-- relleno escondía esa marca y además aplicaba a presentaciones el costo del
-- padre, que DEC-002 descarta.
--
-- Corte: 2026-11-23 21:33:34 UTC, cuando el deploy aplicó esa migración. Antes
-- de ese momento ninguna partida tenía costo congelado (no existía la columna),
-- así que todo unit_cost de una venta anterior salió del relleno. Lo posterior
-- es real: POST /sales lo congela con createdAt = ahora, y un push de la caja
-- solo inserta filas nuevas (insertOnceImmutable).
UPDATE "sale_items" si
SET "unit_cost" = NULL
FROM "sales" s
WHERE s."id" = si."sale_id"
  AND s."created_at" < TIMESTAMP '2026-11-23 21:33:34'
  AND si."unit_cost" IS NOT NULL;
