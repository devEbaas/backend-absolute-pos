import { Prisma } from '@prisma/client';
import { round2 } from '../common/money.util';

/**
 * Ganancia de DEC-002 (absolute-pos-architecture/decisiones/DEC-002-ganancia-
 * con-costo-de-la-venta.md), la misma regla que el desktop (profit.logic.js,
 * cash-cut.logic.js) y el móvil (lib/domain/profit.dart):
 *
 *   costo de la partida = COALESCE(unit_cost, purchase_cost actual) × quantity
 *   ingresos            = Σ sales.total de ventas no canceladas (ya con descuento)
 *   ganancia            = ingresos − Σ costo
 *   margen              = ganancia / ingresos × 100, 1 decimal, 0 sin ingresos
 *
 * Ingresos y costo se suman POR SEPARADO: el total de una venta nunca se suma
 * una vez por partida.
 */

type Db = Pick<Prisma.TransactionClient, 'sale' | 'saleItem'>;

/** D1: costo, ganancia y margen solo hacia un administrador. */
export function isAdminRole(role: string | undefined | null): boolean {
  return role === 'admin' || role === 'root_admin';
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export interface ProfitTotals {
  revenue: number;
  cogs: number;
  grossProfit: number;
  margin: number;
}

/** Ganancia de las ventas de una sesión, con el mismo filtro que `computeTotals`. */
export async function sessionProfit(
  db: Db,
  businessId: string,
  sessionId: string,
): Promise<ProfitTotals> {
  const where = { businessId, sessionId, cancelled: false };
  const [revenueRow, items] = await Promise.all([
    db.sale.aggregate({ where, _sum: { total: true } }),
    db.saleItem.findMany({
      where: { sale: where },
      select: {
        quantity: true,
        unitCost: true,
        product: { select: { purchaseCost: true } },
      },
    }),
  ]);
  const revenue = Number(revenueRow._sum.total ?? 0);
  const cogs = items.reduce(
    (sum, it) =>
      sum +
      Number(it.unitCost ?? it.product.purchaseCost) * Number(it.quantity),
    0,
  );
  const grossProfit = revenue - cogs;
  return {
    revenue: round2(revenue),
    cogs: round2(cogs),
    grossProfit: round2(grossProfit),
    margin: revenue > 0 ? round1((grossProfit / revenue) * 100) : 0,
  };
}

export interface CutProfit {
  totalCost: number;
  totalProfit: number;
  margin: number;
  source: 'stored' | 'calculated';
}

/**
 * La ganancia congelada al cerrar, o —en un corte que no la guardó (anterior a
 * esta versión, o que bajó del sync sin ella)— calculada ahora y marcada
 * `calculated`. El margen de la guardada es sobre `total_sales` del corte, que
 * también quedó fijo (igual que `cutProfit` del desktop).
 */
export async function cutProfit(
  db: Db,
  businessId: string,
  cut: {
    sessionId: string;
    totalSales: Prisma.Decimal;
    totalCost: Prisma.Decimal | null;
    totalProfit: Prisma.Decimal | null;
  },
): Promise<CutProfit> {
  if (cut.totalCost !== null && cut.totalProfit !== null) {
    const totalSales = Number(cut.totalSales);
    const totalProfit = Number(cut.totalProfit);
    return {
      totalCost: Number(cut.totalCost),
      totalProfit,
      margin: totalSales > 0 ? round1((totalProfit / totalSales) * 100) : 0,
      source: 'stored',
    };
  }
  const p = await sessionProfit(db, businessId, cut.sessionId);
  return {
    totalCost: p.cogs,
    totalProfit: p.grossProfit,
    margin: p.margin,
    source: 'calculated',
  };
}
