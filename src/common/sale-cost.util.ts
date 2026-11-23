/**
 * Costo unitario que se congela en `sale_items.unit_cost` al vender.
 *
 * Regla de DEC-002 (absolute-pos-architecture/decisiones/DEC-002-ganancia-
 * con-costo-de-la-venta.md), la misma que aplica la caja en `createSale`: el
 * `purchaseCost` del producto VENDIDO. Una presentación tiene su propio costo
 * y ese es el correcto; no se toma el del padre aunque sea 0.
 *
 * Un 0 es un resultado válido (PRECIO_LIBRE, o un producto sin costo
 * capturado): los reportes lo cuentan como costo 0 y lo señalan aparte.
 */
export interface CostSource {
  purchaseCost: number;
}

export function saleUnitCost(product: CostSource): number {
  return product.purchaseCost;
}
