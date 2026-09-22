import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Cualquier cliente de Prisma (el normal o el de una transacción): solo se usa `inventoryMovement`. */
type Db = Pick<PrismaService, 'inventoryMovement'>;

/** `manejaStock(tipo)` (specs/00 §TipoVenta): `PRECIO_LIBRE` y `SERVICIO` no llevan inventario. */
export function manejaStock(tipoVenta: string | null | undefined): boolean {
  const tipo = (tipoVenta ?? 'UNIDAD').trim().toUpperCase();
  return tipo !== 'PRECIO_LIBRE' && tipo !== 'SERVICIO';
}

/**
 * El stock en la nube no es una columna: se **deriva** como `Σ(IN) − Σ(OUT)` de los movimientos de cada producto
 * (specs/00 §Modelo de stock). Una sola consulta agregada, sin N+1.
 */
@Injectable()
export class StockService {
  /** Stock de los [productIds] (o de todo el negocio si no se dan). Un producto sin movimientos vale 0. */
  async stockByProduct(
    db: Db,
    businessId: string,
    productIds?: string[],
  ): Promise<Map<string, number>> {
    const rows = await db.inventoryMovement.groupBy({
      by: ['productId', 'type'],
      where: {
        businessId,
        ...(productIds ? { productId: { in: productIds } } : {}),
      },
      _sum: { quantity: true },
    });
    const stock = new Map<string, number>(
      (productIds ?? []).map((id) => [id, 0]),
    );
    for (const row of rows) {
      const q = Number(row._sum.quantity ?? 0);
      stock.set(
        row.productId,
        (stock.get(row.productId) ?? 0) + (row.type === 'IN' ? q : -q),
      );
    }
    return stock;
  }

  async stockOf(
    db: Db,
    businessId: string,
    productId: string,
  ): Promise<number> {
    return (
      (await this.stockByProduct(db, businessId, [productId])).get(productId) ??
      0
    );
  }
}
