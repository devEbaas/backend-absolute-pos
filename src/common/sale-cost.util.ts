/**
 * Costo unitario que se congela en `sale_items.unit_cost` al vender.
 *
 * Es la misma regla que aplica el desktop (absolute-electron-pos,
 * documentation/spec-reportes-detallados-ganancia.md, R1) y la que usa el
 * backfill de la migración `add_sale_item_unit_cost`. Si cambia aquí, cambia
 * en los tres sitios: una venta tiene que reportar la misma ganancia en la
 * nube y en la caja.
 *
 * - Producto raíz → su `purchaseCost`.
 * - Presentación → su propio `purchaseCost`; si es 0, el del padre × `unitsPerPack`
 *   (lo que realmente sale del inventario).
 *
 * Un 0 es un resultado válido (SERVICIO, PRECIO_LIBRE, o un producto sin costo
 * capturado): los reportes lo cuentan como costo 0 y lo señalan aparte.
 */
export interface CostSource {
  purchaseCost: number;
  unitsPerPack: number;
}

export function saleUnitCost(
  product: CostSource,
  parent: CostSource | null,
): number {
  if (product.purchaseCost > 0 || !parent) return product.purchaseCost;
  return parent.purchaseCost * product.unitsPerPack;
}
