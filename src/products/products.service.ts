import {
  BadRequestException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Product } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  businessError,
  idInUse,
  isUniqueViolation,
} from '../common/business-error';
import type { MobileAuthPayload } from '../common/guards/jwt-auth.guard';
import { round2, round4 } from '../common/money.util';
import { PrismaService } from '../prisma/prisma.service';
import { SyncResource } from '../sync/sync-resource.interface';
import { upsertMutable } from '../sync/upsert-helpers';
import { ProductSyncItemDto } from '../sync/dto/product-sync-item.dto';
import { manejaStock, StockService } from '../stock/stock.service';
import { CreateProductDto, UpdateProductDto } from './dto/create-product.dto';

/** El cliente de Prisma normal o el de una transacción. */
type Db = Pick<PrismaService, 'product' | 'inventoryMovement'>;
type Tx = Prisma.TransactionClient;

const normalizeTipo = (tipo: string | null | undefined) =>
  (tipo ?? 'UNIDAD').trim().toUpperCase();

/** `""` y solo espacios se guardan como `null`: el índice único `(businessId, barcode)` no debe chocar por vacíos. */
const normalizeBarcode = (barcode: string | null | undefined) =>
  barcode?.trim() || null;

/** `null` y `undefined` (campos que no admiten vacío) significan "no vino": se conserva el valor actual. */
const isGiven = <T>(value: T | null | undefined): value is T =>
  value !== undefined && value !== null;

function barcodeTaken() {
  return businessError(
    HttpStatus.CONFLICT,
    'El código de barras ya existe',
    'BARCODE_TAKEN',
  );
}

@Injectable()
export class ProductsService implements SyncResource<ProductSyncItemDto> {
  readonly tableName = 'products';

  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
  ) {}

  // specs/22 §3.2: el catálogo de la app móvil — todos los productos (activos e inactivos), con números JSON (Prisma
  // devuelve los Decimal como cadenas) y con el stock derivado de los movimientos. Ruta aparte de `findMany` para no
  // tocar `GET /products`, que usan RN y el escritorio.
  async findManyWithStock(businessId: string) {
    const rows = await this.prisma.product.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
    const stock = await this.stock.stockByProduct(this.prisma, businessId);
    const byId = new Map(rows.map((row) => [row.id, row]));
    return rows.map((row) => this.toMobileProduct(row, stock, byId));
  }

  async findOneWithStock(businessId: string, id: string, db: Db = this.prisma) {
    const row = await this.findOne(businessId, id, db);
    if (!row) return null;
    const ids = [row.id, ...(row.parentProductId ? [row.parentProductId] : [])];
    const parent = row.parentProductId
      ? await this.findOne(businessId, row.parentProductId, db)
      : null;
    const stock = await this.stock.stockByProduct(db, businessId, ids);
    const byId = new Map([
      [row.id, row],
      ...(parent ? [[parent.id, parent] as const] : []),
    ]);
    return this.toMobileProduct(row, stock, byId);
  }

  private toMobileProduct(
    row: Product,
    stock: Map<string, number>,
    byId: Map<string, Product>,
  ) {
    const parent = row.parentProductId ? byId.get(row.parentProductId) : null;
    const unitsPerPack = Number(row.unitsPerPack);
    const parentStock = parent ? (stock.get(parent.id) ?? 0) : null;
    // Una presentación no tiene stock propio (siempre 0): el inventario vive en el padre, y lo que se puede vender es
    // `trunc(stock del padre / unitsPerPack)`. Lo que no maneja inventario (PRECIO_LIBRE, SERVICIO) nunca tiene
    // existencia que mostrar, aunque conserve movimientos de cuando era otro tipo.
    const own = row.parentProductId ? 0 : (stock.get(row.id) ?? 0);
    const effectiveStock = !manejaStock(row.tipoVenta)
      ? 0
      : parentStock !== null
        ? Math.trunc(parentStock / (unitsPerPack || 1))
        : own;
    return {
      id: row.id,
      barcode: row.barcode,
      name: row.name,
      description: row.description,
      salePrice: Number(row.salePrice),
      purchaseCost: Number(row.purchaseCost),
      tipoVenta: row.tipoVenta,
      imagePath: row.imagePath,
      active: row.active,
      parentProductId: row.parentProductId,
      unitsPerPack,
      location: row.location,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      stock: own,
      parentName: parent?.name ?? null,
      parentStock,
      effectiveStock,
    };
  }

  findManyByIds(ids: string[]) {
    return this.prisma.product.findMany({ where: { id: { in: ids } } });
  }

  findOne(
    businessId: string,
    id: string,
    db: Pick<Db, 'product'> = this.prisma,
  ) {
    return db.product.findFirst({ where: { businessId, id } });
  }

  // — Escrituras REST (specs/22 §6.1, B5) —
  //
  // Cada una es UNA transacción que escribe la fila del producto, su movimiento de inventario (si lo hay) y sus
  // `sync_log`, como `SalesService`. `/sync/push` sigue usando `upsertFromSync`, que perdona (padre inexistente → null,
  // último-escribe-gana) porque su cliente es el escritorio.
  //
  // `POST /products` lo llaman dos clientes: la app móvil (token de dispositivo) y el `NewProductModal` del dashboard del
  // dueño (token sin `deviceId`), que no manda `id` y por defecto manda costo 0. Por eso el `id` obligatorio y las
  // reglas de precio y costo solo se exigen a los tokens de dispositivo (`strict`); el resto de las reglas, a todos.

  async create(auth: MobileAuthPayload, dto: CreateProductDto) {
    const strict = Boolean(auth.deviceId);
    if (strict && !dto.id) {
      throw new BadRequestException('El identificador (id) es requerido');
    }
    const id = dto.id ?? randomUUID();
    try {
      return await this.prisma.$transaction(
        (tx) => this.createInTx(tx, auth, id, dto, strict),
        { timeout: 15_000 },
      );
    } catch (e) {
      if (isUniqueViolation(e)) {
        // Carrera perdida: otra petición ganó el `id` (un reintento simultáneo) o el código de barras.
        const replay = await this.replay(this.prisma, auth.businessId, id);
        if (replay) return replay;
        throw barcodeTaken();
      }
      throw e;
    }
  }

  private async createInTx(
    tx: Tx,
    auth: MobileAuthPayload,
    id: string,
    dto: CreateProductDto,
    strict: boolean,
  ) {
    const { businessId, userId } = auth;

    // Idempotencia. Dos peticiones simultáneas con el mismo `id` se serializan con un candado de aplicación: la segunda
    // ya ve el producto de la primera y lo devuelve sin repetir el stock inicial.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`product:${id}`}, 0))`;
    const replay = await this.replay(tx, businessId, id);
    if (replay) return replay;

    const name = dto.name.trim();
    const tipoVenta = dto.tipoVenta ?? 'UNIDAD';
    const salePrice = round2(dto.salePrice);
    const purchaseCost = round2(dto.purchaseCost);
    this.validateBasics(name, tipoVenta, salePrice, purchaseCost, strict);
    const parentProductId = dto.parentProductId ?? null;
    await this.validateParent(tx, businessId, id, parentProductId);
    const barcode = normalizeBarcode(dto.barcode);
    await this.assertBarcodeFree(tx, businessId, barcode, id);

    const now = new Date();
    await tx.product.create({
      data: {
        id,
        businessId,
        barcode,
        name,
        description: dto.description ?? null,
        salePrice,
        purchaseCost,
        tipoVenta,
        imagePath: dto.imagePath ?? null,
        active: dto.active ?? true,
        parentProductId,
        unitsPerPack: round4(dto.unitsPerPack ?? 1),
        location: dto.location ?? null,
        createdAt: now,
      },
    });
    await tx.syncLogEntry.create({
      data: { businessId, tableName: 'products', rowId: id },
    });

    // Una presentación no tiene stock propio y PRECIO_LIBRE/SERVICIO no llevan inventario: `initialStock` se ignora.
    const initialStock = round4(dto.initialStock ?? 0);
    if (initialStock > 0 && !parentProductId && manejaStock(tipoVenta)) {
      await this.writeMovement(tx, {
        businessId,
        productId: id,
        type: 'IN',
        quantity: initialStock,
        reference: 'INITIAL_STOCK',
        userId,
        now,
      });
    }
    return (await this.findOneWithStock(businessId, id, tx))!;
  }

  async update(auth: MobileAuthPayload, id: string, dto: UpdateProductDto) {
    try {
      return await this.prisma.$transaction(
        (tx) => this.updateInTx(tx, auth, id, dto, Boolean(auth.deviceId)),
        { timeout: 15_000 },
      );
    } catch (e) {
      if (isUniqueViolation(e)) throw barcodeTaken();
      throw e;
    }
  }

  private async updateInTx(
    tx: Tx,
    auth: MobileAuthPayload,
    id: string,
    dto: UpdateProductDto,
    strict: boolean,
  ) {
    const { businessId, userId } = auth;

    // La fila queda bloqueada hasta el final: así un ajuste de stock no se mezcla con otro ajuste ni con una venta (que
    // bloquea las filas de sus productos antes de leer el stock).
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${id}::uuid AND business_id = ${businessId}::uuid FOR UPDATE`;
    const existing = await this.findOne(businessId, id, tx);
    if (!existing) throw new NotFoundException('Producto no encontrado');

    // `undefined` conserva el valor; `null` borra los campos que admiten vacío (código, descripción, imagen, ubicación).
    // Los que no admiten vacío tratan `null` como "no vino".
    const name = isGiven(dto.name) ? dto.name.trim() : existing.name;
    const tipoVenta = dto.tipoVenta ?? existing.tipoVenta;
    const salePrice = isGiven(dto.salePrice)
      ? round2(dto.salePrice)
      : Number(existing.salePrice);
    const purchaseCost = isGiven(dto.purchaseCost)
      ? round2(dto.purchaseCost)
      : Number(existing.purchaseCost);
    const active = dto.active ?? existing.active;
    const barcode =
      dto.barcode !== undefined
        ? normalizeBarcode(dto.barcode)
        : existing.barcode;
    const parentProductId =
      dto.parentProductId !== undefined
        ? dto.parentProductId
        : existing.parentProductId;

    // Solo se revalida lo que este PATCH toca: un producto viejo con costo 0 (creado desde el dashboard) debe poder
    // renombrarse desde la app sin que le exijan un costo.
    if (isGiven(dto.name)) {
      this.validateBasics(name, tipoVenta, salePrice, purchaseCost, false);
    }
    if (
      isGiven(dto.salePrice) ||
      isGiven(dto.purchaseCost) ||
      isGiven(dto.tipoVenta)
    ) {
      this.validateBasics(name, tipoVenta, salePrice, purchaseCost, strict);
    }

    const activeChildren = await tx.product.count({
      where: { businessId, parentProductId: id, active: true },
    });
    if (existing.active && !active && activeChildren > 0) {
      throw new BadRequestException(
        'Este producto tiene presentaciones vinculadas activas. Elimínalas primero.',
      );
    }
    if (parentProductId !== existing.parentProductId) {
      if (parentProductId && activeChildren > 0) {
        throw new BadRequestException(
          'Este producto tiene presentaciones vinculadas. Elimínalas primero.',
        );
      }
      await this.validateParent(tx, businessId, id, parentProductId);
    }
    if (barcode !== existing.barcode) {
      await this.assertBarcodeFree(tx, businessId, barcode, id);
    }

    await tx.product.update({
      where: { id },
      data: {
        barcode,
        name,
        description:
          dto.description !== undefined
            ? dto.description
            : existing.description,
        salePrice,
        purchaseCost,
        tipoVenta,
        imagePath:
          dto.imagePath !== undefined ? dto.imagePath : existing.imagePath,
        active,
        parentProductId,
        unitsPerPack: isGiven(dto.unitsPerPack)
          ? round4(dto.unitsPerPack)
          : existing.unitsPerPack,
        location: dto.location !== undefined ? dto.location : existing.location,
      },
    });
    await tx.syncLogEntry.create({
      data: { businessId, tableName: 'products', rowId: id },
    });

    // Stock por valor absoluto (02 §6, paso 4): la diferencia contra lo que hay AHORA, con el tipo RESULTANTE. Una
    // presentación no tiene stock propio, y al pasar a PRECIO_LIBRE/SERVICIO no se crea movimiento.
    if (dto.stock !== undefined && !parentProductId && manejaStock(tipoVenta)) {
      const current = await this.stock.stockOf(tx, businessId, id);
      const delta = round4(dto.stock - current);
      if (delta !== 0) {
        await this.writeMovement(tx, {
          businessId,
          productId: id,
          type: delta > 0 ? 'IN' : 'OUT',
          quantity: Math.abs(delta),
          reference: 'STOCK_ADJUSTMENT',
          userId,
          now: new Date(),
        });
      }
    }
    return (await this.findOneWithStock(businessId, id, tx))!;
  }

  /** Si el `id` ya existe: del mismo negocio → ese producto (un reintento no duplica nada); de otro → 409. */
  private async replay(db: Db, businessId: string, id: string) {
    const existing = await db.product.findUnique({ where: { id } });
    if (!existing) return null;
    if (existing.businessId !== businessId) throw idInUse();
    return this.findOneWithStock(businessId, id, db);
  }

  private validateBasics(
    name: string,
    tipoVenta: string,
    salePrice: number,
    purchaseCost: number,
    strict: boolean,
  ) {
    if (!name) throw new BadRequestException('El nombre es requerido');
    if (!strict || normalizeTipo(tipoVenta) === 'PRECIO_LIBRE') return;
    if (salePrice <= 0) {
      throw new BadRequestException('El precio de venta debe ser mayor a 0');
    }
    if (purchaseCost <= 0) {
      throw new BadRequestException('El costo de compra debe ser mayor a 0');
    }
    if (salePrice < purchaseCost) {
      throw new BadRequestException(
        'El precio de venta no puede ser menor al costo de compra',
      );
    }
  }

  /** El padre de una presentación (02 §3): del negocio, activo, raíz y con inventario. Sin padre no hay nada que validar. */
  private async validateParent(
    tx: Tx,
    businessId: string,
    selfId: string,
    parentId: string | null,
  ) {
    if (!parentId) return;
    if (parentId === selfId) {
      throw new BadRequestException('Un producto no puede ser su propio padre');
    }
    const parent = await tx.product.findFirst({
      where: { id: parentId, businessId, active: true },
    });
    if (!parent) {
      throw new BadRequestException(
        'El producto padre no existe o está inactivo',
      );
    }
    if (parent.parentProductId) {
      throw new BadRequestException(
        'No se pueden crear presentaciones de una presentación',
      );
    }
    if (normalizeTipo(parent.tipoVenta) === 'SERVICIO') {
      throw new BadRequestException(
        'Un producto de tipo Servicio no puede tener presentaciones vinculadas',
      );
    }
  }

  /**
   * `409 BARCODE_TAKEN` si otro producto del negocio ya usa el código. El candado de aplicación serializa las altas
   * simultáneas del mismo código: la segunda espera, ve la fila de la primera y falla limpio (sin llegar a un `P2002`).
   */
  private async assertBarcodeFree(
    tx: Tx,
    businessId: string,
    barcode: string | null,
    selfId: string,
  ) {
    if (!barcode) return;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`product-barcode:${businessId}:${barcode}`}, 0))`;
    const other = await tx.product.findFirst({
      where: { businessId, barcode, id: { not: selfId } },
      select: { id: true },
    });
    if (other) throw barcodeTaken();
  }

  private async writeMovement(
    tx: Tx,
    m: {
      businessId: string;
      productId: string;
      type: 'IN' | 'OUT';
      quantity: number;
      reference: string;
      userId: string;
      now: Date;
    },
  ) {
    const id = randomUUID();
    await tx.inventoryMovement.create({
      data: {
        id,
        businessId: m.businessId,
        productId: m.productId,
        type: m.type,
        quantity: m.quantity,
        reference: m.reference,
        userId: m.userId,
        createdAt: m.now,
      },
    });
    await tx.syncLogEntry.create({
      data: {
        businessId: m.businessId,
        tableName: 'inventoryMovements',
        rowId: id,
      },
    });
  }

  toPullDto(
    row: Awaited<ReturnType<ProductsService['findManyByIds']>>[number],
  ) {
    return {
      uuid: row.id,
      barcode: row.barcode,
      name: row.name,
      description: row.description,
      salePrice: Number(row.salePrice),
      purchaseCost: Number(row.purchaseCost),
      tipoVenta: row.tipoVenta,
      imagePath: row.imagePath,
      active: row.active,
      parentProductUuid: row.parentProductId,
      unitsPerPack: Number(row.unitsPerPack),
      location: row.location,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // Single write path for products, shared by the sync push endpoint and
  // (eventually) any direct product-creation endpoint — see the plan's
  // "single write path per resource" requirement. Idempotent by uuid
  // (dto.uuid becomes the Postgres PK directly), last-write-wins by
  // updatedAt for conflicting concurrent edits from different devices.
  async upsertFromSync(
    businessId: string,
    _deviceId: string,
    dto: ProductSyncItemDto,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // El padre puede no haber llegado todavía a la nube si el batch no
      // respeta el orden padre-antes-que-hijo. Dejarlo en null es seguro —
      // se resuelve solo en un push/pull posterior una vez que el padre
      // exista, en vez de fallar el batch completo.
      const parent = dto.parentProductUuid
        ? await tx.product.findUnique({ where: { id: dto.parentProductUuid } })
        : null;

      const fields = {
        businessId,
        barcode: dto.barcode ?? null,
        name: dto.name,
        description: dto.description ?? null,
        salePrice: dto.salePrice,
        purchaseCost: dto.purchaseCost,
        tipoVenta: dto.tipoVenta,
        imagePath: dto.imagePath ?? null,
        active: dto.active,
        parentProductId: parent?.id ?? null,
        unitsPerPack: dto.unitsPerPack,
        location: dto.location ?? null,
        createdAt: new Date(dto.createdAt),
        updatedAt: new Date(dto.updatedAt),
      };

      await upsertMutable(
        tx,
        tx.product,
        businessId,
        'products',
        dto.uuid,
        fields,
        new Date(dto.updatedAt),
      );
    });
  }
}
