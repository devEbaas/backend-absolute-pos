import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import {
  createHarness,
  Harness,
  login,
  resetDb,
  seedBusiness,
  seedProduct,
  seedUser,
  Seed,
} from './helpers/harness';

// Tres tipos de JWT comparten el secreto (auth.module.ts): el de un dispositivo móvil (`businessId` + `deviceId`), el del
// dashboard del dueño (`businessId`, SIN `deviceId`) y el de los administradores de plataforma (`scope`, SIN
// `businessId`). Las rutas del contrato móvil (specs/22) solo aceptan el primero: con `businessId` o `deviceId`
// indefinidos Prisma DESCARTA el filtro (`where: { businessId: undefined }` no filtra), y un token de otro tipo leería
// o escribiría sin el alcance que promete el contrato.
describe('Qué tokens aceptan las rutas móviles (specs/22 §1)', () => {
  let h: Harness;
  let seed: Seed;
  let mobile: string;
  let dashboard: string;
  let platform: string;

  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(() => h.close());
  beforeEach(async () => {
    await resetDb(h.prisma);
    seed = await seedBusiness(h.prisma);
    const cajero = await seedUser(h.prisma, seed.business.id);
    mobile = (await login(h, seed, cajero)).bearer;

    // El dueño entra al dashboard: su token lleva `businessId` y `role`, pero no `deviceId`.
    await seedUser(h.prisma, seed.business.id, {
      username: 'dueno',
      password: 'clave-dueno',
      role: 'admin',
      name: 'Dueño',
    });
    const owner = await h
      .http()
      .post('/business-admin/login')
      .send({
        businessSlug: seed.business.slug,
        username: 'dueno',
        password: 'clave-dueno',
      })
      .expect(201);
    dashboard = `Bearer ${owner.body.token}`;

    // Un administrador de plataforma: `scope` y sin `businessId`.
    platform = `Bearer ${await h.app.get(JwtService).signAsync({ sub: 'plat-1', username: 'root', scope: 'platform-admin' })}`;

    // Un negocio ajeno con datos: es lo que una fuga cruzaría.
    const otro = await h.prisma.business.create({
      data: { name: 'Otra', slug: 'otra' },
    });
    await seedProduct(h.prisma, otro.id, { name: 'Producto ajeno', stock: 50 });
    await seedProduct(h.prisma, seed.business.id, {
      name: 'Producto propio',
      stock: 5,
    });
  });

  const rutas: [string, 'get' | 'post', string, object?][] = [
    ['GET /products/with-stock', 'get', '/products/with-stock'],
    ['GET /promotions/active', 'get', '/promotions/active'],
    ['GET /cash-sessions/current', 'get', '/cash-sessions/current'],
    ['GET /cash-cuts', 'get', '/cash-cuts'],
    ['GET /inventory-movements', 'get', '/inventory-movements'],
    [
      'POST /cash-sessions',
      'post',
      '/cash-sessions',
      { id: randomUUID(), openingAmount: 1 },
    ],
    [
      'POST /sales',
      'post',
      '/sales',
      {
        id: randomUUID(),
        sessionId: randomUUID(),
        paymentMethod: 'efectivo',
        items: [
          {
            id: randomUUID(),
            productId: '5d0a4f0e-7c0a-4c2b-9a58-1d6a0a7d4d11',
            quantity: 1,
            unitPrice: 1,
          },
        ],
      },
    ],
    [
      'POST /inventory-entries',
      'post',
      '/inventory-entries',
      {
        id: randomUUID(),
        items: [
          { productId: '5d0a4f0e-7c0a-4c2b-9a58-1d6a0a7d4d11', quantity: 1 },
        ],
      },
    ],
  ];

  const call = (
    method: 'get' | 'post',
    path: string,
    auth: string,
    body?: object,
  ) => {
    const req = h.http()[method](path).set('Authorization', auth);
    return body ? req.send(body) : req;
  };

  describe.each(rutas)('%s', (_name, method, path, body) => {
    it('un token de ADMINISTRADOR DE PLATAFORMA → 401 (nunca lee ni escribe datos de un negocio)', async () => {
      const res = await call(method, path, platform, body).expect(401);
      expect(res.body.message).toBe('Token inválido o expirado');
    });

    it('un token del DASHBOARD del dueño (sin deviceId) → 403: no es un dispositivo emparejado', async () => {
      const res = await call(method, path, dashboard, body).expect(403);
      expect(res.body.message).toBe(
        'Requiere iniciar sesión desde un dispositivo emparejado',
      );
    });
  });

  it('el catálogo del token de plataforma no filtra productos de otros negocios (lo que pasaba sin el guard estricto)', async () => {
    await call('get', '/products/with-stock', platform).expect(401);
    const own = await call('get', '/products/with-stock', mobile).expect(200);
    expect((own.body as any[]).map((p) => p.name)).toEqual(['Producto propio']);
  });

  it('el token del móvil sigue funcionando en todas ellas', async () => {
    await call('get', '/products/with-stock', mobile).expect(200);
    await call('get', '/promotions/active', mobile).expect(200);
    await call('get', '/cash-sessions/current', mobile).expect(200);
    await call('get', '/cash-cuts', mobile).expect(200);
    await call('get', '/inventory-movements', mobile).expect(200);
  });

  describe('lo que el DASHBOARD del dueño sí sigue haciendo (no se rompe)', () => {
    it('crear un producto (POST /products) con su token', async () => {
      const res = await h
        .http()
        .post('/products')
        .set('Authorization', dashboard)
        .send({ name: 'Desde el dashboard', salePrice: 20, purchaseCost: 10 })
        .expect(201);
      expect(res.body.name).toBe('Desde el dashboard');
    });

    it('leer los reportes del negocio (GET /reports/products)', async () => {
      const res = await h
        .http()
        .get('/reports/products?limit=50')
        .set('Authorization', dashboard)
        .expect(200);
      expect(res.body.data.map((p: any) => p.name).sort()).toEqual([
        'Producto propio',
      ]);
    });
  });

  describe('las rutas que ya usaban JwtAuthGuard también rechazan el token de plataforma', () => {
    it('POST /products → 401', async () => {
      await h
        .http()
        .post('/products')
        .set('Authorization', platform)
        .send({ name: 'x', salePrice: 1, purchaseCost: 1 })
        .expect(401);
      expect(await h.prisma.product.count({ where: { name: 'x' } })).toBe(0);
    });

    it('GET /reports/products → 401 (antes, sin businessId, el filtro se descartaba)', async () => {
      await h
        .http()
        .get('/reports/products')
        .set('Authorization', platform)
        .expect(401);
    });
  });
});
