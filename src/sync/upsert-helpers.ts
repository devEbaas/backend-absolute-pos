import { PrismaService } from '../prisma/prisma.service';

type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

// Model delegates (tx.product, tx.user, ...) all share this shape for the
// subset of operations these helpers use — typed loosely on purpose since
// each table's actual field shape differs and Prisma's per-model delegate
// types don't unify cleanly across models.
interface ModelDelegate {
  findUnique(args: {
    where: { id: string };
  }): Promise<{ id: string; updatedAt?: Date } | null>;
  create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  update(args: {
    where: { id: string };
    data: Record<string, unknown>;
  }): Promise<{ id: string }>;
}

async function logSync(
  tx: TxClient,
  businessId: string,
  tableName: string,
  rowId: string,
) {
  await tx.syncLogEntry.create({ data: { businessId, tableName, rowId } });
}

/**
 * Para tablas mutables (products, users, sales, cashSessions, promotions):
 * last-write-wins por updatedAt. Si la fila ya existe y lo que llegó no es
 * más reciente, se ignora silenciosamente (no es un error — el push sigue
 * "aceptado").
 */
export async function upsertMutable(
  tx: TxClient,
  model: ModelDelegate,
  businessId: string,
  tableName: string,
  id: string,
  data: Record<string, unknown>,
  updatedAt: Date,
): Promise<void> {
  const existing = await model.findUnique({ where: { id } });

  if (!existing) {
    const created = await model.create({ data: { id, ...data } });
    await logSync(tx, businessId, tableName, created.id);
    return;
  }

  if (updatedAt.getTime() <= existing.updatedAt!.getTime()) return;

  const updated = await model.update({ where: { id }, data });
  await logSync(tx, businessId, tableName, updated.id);
}

/**
 * Para tablas append-only (saleItems, saleCancellations, cashCuts,
 * cashOutflows, inventoryMovements, promotionProducts): el código local
 * nunca las modifica después de creadas, así que basta con insertar una
 * vez por uuid e ignorar reintentos (mismo batch reenviado tras un fallo
 * de red, por ejemplo).
 */
export async function insertOnceImmutable(
  tx: TxClient,
  model: ModelDelegate,
  businessId: string,
  tableName: string,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  const existing = await model.findUnique({ where: { id } });
  if (existing) return;

  const created = await model.create({ data: { id, ...data } });
  await logSync(tx, businessId, tableName, created.id);
}
