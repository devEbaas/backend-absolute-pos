import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { generateApiKey, hashApiKey } from '../../src/common/crypto.util';
import { hashPassword } from '../../src/common/password.util';
import { PrismaService } from '../../src/prisma/prisma.service';

// Ayudantes de las pruebas e2e del contrato móvil (specs/22). Cada prueba arranca la app **real** (mismos pipes que
// `main.ts`) sobre la base `*_e2e` y siembra lo que necesita con Prisma; lo que se prueba entra siempre por HTTP.

export interface Harness {
  app: INestApplication;
  prisma: PrismaService;
  /** `request(app)` de supertest. */
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

export async function createHarness(): Promise<Harness> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  // El servidor escucha UNA vez y se queda así. Si no escucha, `supertest` lo abre en la primera petición y lo CIERRA cuando
  // esa termina: con peticiones simultáneas (las pruebas de concurrencia) las demás, aún en vuelo, reciben `ECONNRESET`.
  await app.listen(0);
  const prisma = app.get(PrismaService);
  return {
    app,
    prisma,
    http: () => request(app.getHttpServer()),
    close: () => app.close(),
  };
}

/** Vacía todas las tablas (menos el historial de migraciones) para que cada prueba parta de cero. */
export async function resetDb(prisma: PrismaService): Promise<void> {
  const rows = await prisma.$queryRaw<
    { tablename: string }[]
  >`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const tables = rows.map((r) => `"${r.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`,
  );
}

export interface Seed {
  business: { id: string; name: string; slug: string };
  device: { id: string; label: string };
  /** La clave del dispositivo (Bearer de `POST /auth/login`). */
  deviceKey: string;
}

export async function seedBusiness(
  prisma: PrismaService,
  opts: { slug?: string; label?: string; platform?: string } = {},
): Promise<Seed> {
  const slug = opts.slug ?? 'tienda-norte';
  const business = await prisma.business.create({
    data: { name: 'Tienda Norte', slug },
  });
  const seed = await seedDevice(prisma, business.id, opts.label ?? 'CAJA-2');
  return {
    business: { id: business.id, name: business.name, slug: business.slug },
    ...seed,
  };
}

/** Otro dispositivo (otra caja) del mismo negocio. */
export async function seedDevice(
  prisma: PrismaService,
  businessId: string,
  label: string,
  platform = 'mobile',
): Promise<Pick<Seed, 'device' | 'deviceKey'>> {
  const deviceKey = generateApiKey();
  const device = await prisma.device.create({
    data: { businessId, label, platform, apiKeyHash: hashApiKey(deviceKey) },
  });
  return { device: { id: device.id, label: device.label }, deviceKey };
}

export async function seedUser(
  prisma: PrismaService,
  businessId: string,
  opts: {
    username?: string;
    password?: string;
    role?: string;
    name?: string;
    active?: boolean;
    withPassword?: boolean;
  } = {},
) {
  const username = opts.username ?? 'ana';
  const password = opts.password ?? 'secreto';
  const now = new Date();
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      businessId,
      name: opts.name ?? 'Ana Cajera',
      username,
      passwordHash:
        opts.withPassword === false ? null : await hashPassword(password),
      role: opts.role ?? 'cashier',
      active: opts.active ?? true,
      createdAt: now,
    },
  });
  return { id: user.id, username, password, name: user.name, role: user.role };
}

export interface Session {
  /** JWT de `POST /auth/login`. */
  token: string;
  user: { id: string; name: string; username: string; role: string };
  bearer: string;
}

/** Inicia sesión por HTTP (como la app) y devuelve el JWT. */
export async function login(
  h: Harness,
  seed: Seed,
  user: { username: string; password: string },
): Promise<Session> {
  const res = await h
    .http()
    .post('/auth/login')
    .set('Authorization', `Bearer ${seed.deviceKey}`)
    .send({ username: user.username, password: user.password })
    .expect(201);
  const body = res.body as Session;
  return { ...body, bearer: `Bearer ${body.token}` };
}

export interface ProductSeed {
  name: string;
  tipoVenta?: string;
  salePrice?: number;
  purchaseCost?: number;
  barcode?: string | null;
  parentProductId?: string | null;
  unitsPerPack?: number;
  active?: boolean;
  /** Existencia inicial: un movimiento `IN` (el stock en la nube se deriva de los movimientos). */
  stock?: number;
}

export async function seedProduct(
  prisma: PrismaService,
  businessId: string,
  p: ProductSeed,
) {
  const now = new Date();
  const product = await prisma.product.create({
    data: {
      id: randomUUID(),
      businessId,
      name: p.name,
      barcode: p.barcode ?? null,
      tipoVenta: p.tipoVenta ?? 'UNIDAD',
      salePrice: p.salePrice ?? 10,
      purchaseCost: p.purchaseCost ?? 5,
      parentProductId: p.parentProductId ?? null,
      unitsPerPack: p.unitsPerPack ?? 1,
      active: p.active ?? true,
      createdAt: now,
    },
  });
  if ((p.stock ?? 0) > 0) {
    await addMovement(prisma, businessId, product.id, 'IN', p.stock!);
  }
  return product;
}

export async function addMovement(
  prisma: PrismaService,
  businessId: string,
  productId: string,
  type: 'IN' | 'OUT',
  quantity: number,
  reference = 'INITIAL_STOCK',
) {
  return prisma.inventoryMovement.create({
    data: {
      id: randomUUID(),
      businessId,
      productId,
      type,
      quantity,
      reference,
      createdAt: new Date(),
    },
  });
}

/** El stock derivado (`Σ IN − Σ OUT`) que ve la base, sin pasar por la API. */
export async function stockOf(
  prisma: PrismaService,
  productId: string,
): Promise<number> {
  const rows = await prisma.inventoryMovement.groupBy({
    by: ['type'],
    where: { productId },
    _sum: { quantity: true },
  });
  let total = 0;
  for (const r of rows) {
    const q = Number(r._sum.quantity ?? 0);
    total += r.type === 'IN' ? q : -q;
  }
  return total;
}

/** Una sesión de caja abierta, sembrada directamente (a nombre de [userId] en [deviceId]). */
export async function seedOpenSession(
  prisma: PrismaService,
  businessId: string,
  userId: string,
  deviceId: string | null,
  openingAmount = 500,
) {
  return prisma.cashSession.create({
    data: {
      id: randomUUID(),
      businessId,
      userId,
      deviceId,
      openingAmount,
      status: 'open',
      registerId: 'CAJA-2',
      openedAt: new Date(),
    },
  });
}

/** Una venta sembrada directamente (para probar lecturas y cortes sin pasar por `POST /sales`). */
export async function seedSale(
  prisma: PrismaService,
  o: {
    businessId: string;
    userId: string;
    deviceId?: string | null;
    sessionId: string | null;
    total: number;
    paymentMethod?: string;
    cancelled?: boolean;
  },
) {
  return prisma.sale.create({
    data: {
      id: randomUUID(),
      businessId: o.businessId,
      userId: o.userId,
      deviceId: o.deviceId ?? null,
      sessionId: o.sessionId,
      total: o.total,
      paymentMethod: o.paymentMethod ?? 'efectivo',
      cancelled: o.cancelled ?? false,
      createdAt: new Date(),
    },
  });
}

export async function seedOutflow(
  prisma: PrismaService,
  sessionId: string,
  userId: string,
  amount: number,
  reason = 'Pago a proveedor',
  createdAt = new Date(),
) {
  return prisma.cashOutflow.create({
    data: { id: randomUUID(), sessionId, userId, amount, reason, createdAt },
  });
}

/** Un corte sembrado directamente (a nombre de [userId], sobre la sesión [sessionId]). */
export async function seedCut(
  prisma: PrismaService,
  sessionId: string,
  userId: string,
  createdAt = new Date(),
  totalSales = 100,
) {
  return prisma.cashCut.create({
    data: { id: randomUUID(), sessionId, userId, totalSales, createdAt },
  });
}
