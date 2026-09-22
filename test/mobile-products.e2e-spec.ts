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
  Session,
  stockOf,
} from './helpers/harness';

// Las claves exactas de la respuesta (specs/22 §3.2 y §6.1): el producto con su existencia derivada.
const PRODUCT_KEYS = [
  'active',
  'barcode',
  'createdAt',
  'description',
  'effectiveStock',
  'id',
  'imagePath',
  'location',
  'name',
  'parentName',
  'parentProductId',
  'parentStock',
  'purchaseCost',
  'salePrice',
  'stock',
  'tipoVenta',
  'unitsPerPack',
  'updatedAt',
];

// specs/22 §6.1 (B5) — `POST /products` y `PATCH /products/:id`. Vectores K21–K23.
describe('Productos (specs/22 §6.1)', () => {
  let h: Harness;
  let seed: Seed;
  let ana: Session;
  let anaId: string;
  let dashboard: string;

  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(() => h.close());
  beforeEach(async () => {
    await resetDb(h.prisma);
    seed = await seedBusiness(h.prisma);
    const user = await seedUser(h.prisma, seed.business.id);
    anaId = user.id;
    ana = await login(h, seed, user);

    // El dueño del dashboard: token de negocio SIN `deviceId` (es el otro cliente de `POST /products`).
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
  });

  const post = (body: object, auth = ana.bearer) =>
    h.http().post('/products').set('Authorization', auth).send(body);
  const patch = (id: string, body: object, auth = ana.bearer) =>
    h.http().patch(`/products/${id}`).set('Authorization', auth).send(body);
  // Los ids los genera SIEMPRE la app: el ayudante pone uno nuevo si la prueba no lo fija.
  const create = (extra: object = {}, auth = ana.bearer) =>
    post(
      {
        id: randomUUID(),
        name: 'Cerveza',
        salePrice: 20,
        purchaseCost: 12,
        ...extra,
      },
      auth,
    );
  const movements = (productId: string) =>
    h.prisma.inventoryMovement.findMany({
      where: { productId },
      orderBy: { createdAt: 'asc' },
    });
  const message = (res: { body: any }) => JSON.stringify(res.body.message);

  describe('POST /products — crear', () => {
    it('K21: crea el producto con initialStock y un IN INITIAL_STOCK en la misma transacción', async () => {
      const id = randomUUID();
      const res = await create({ id, initialStock: 12 }).expect(201);

      expect(Object.keys(res.body).sort()).toEqual(PRODUCT_KEYS);
      expect(res.body).toMatchObject({
        id,
        name: 'Cerveza',
        salePrice: 20,
        purchaseCost: 12,
        tipoVenta: 'UNIDAD',
        active: true,
        parentProductId: null,
        unitsPerPack: 1,
        stock: 12,
        effectiveStock: 12,
      });
      const movs = await movements(id);
      expect(movs).toHaveLength(1);
      expect(movs[0]).toMatchObject({
        type: 'IN',
        reference: 'INITIAL_STOCK',
        userId: anaId,
        businessId: seed.business.id,
      });
      expect(Number(movs[0].quantity)).toBe(12);

      // Producto y movimiento quedan en sync_log para que el escritorio los baje.
      const log = await h.prisma.syncLogEntry.findMany({
        where: { rowId: { in: [id, movs[0].id] } },
      });
      expect(log.map((l) => l.tableName).sort()).toEqual([
        'inventoryMovements',
        'products',
      ]);
    });

    it('sin initialStock (o en 0) no crea movimiento', async () => {
      const a = (await create().expect(201)).body;
      const b = (await create({ initialStock: 0 }).expect(201)).body;
      expect(a.stock).toBe(0);
      expect(await movements(a.id)).toHaveLength(0);
      expect(await movements(b.id)).toHaveLength(0);
    });

    it('initialStock con decimales (granel) se conserva', async () => {
      const res = await create({
        tipoVenta: 'PESO',
        initialStock: 2.5,
      }).expect(201);
      expect(res.body.stock).toBe(2.5);
    });

    it('initialStock se ignora en tipos sin inventario (PRECIO_LIBRE, SERVICIO)', async () => {
      const libre = (
        await create({
          tipoVenta: 'PRECIO_LIBRE',
          salePrice: 0,
          purchaseCost: 0,
          initialStock: 5,
        }).expect(201)
      ).body;
      const servicio = (
        await create({ tipoVenta: 'SERVICIO', initialStock: 5 }).expect(201)
      ).body;
      expect(await movements(libre.id)).toHaveLength(0);
      expect(await movements(servicio.id)).toHaveLength(0);
      expect(libre.effectiveStock).toBe(0);
    });

    it('una presentación no tiene stock propio: initialStock se ignora y su existencia sale del padre', async () => {
      const padre = (await create({ initialStock: 30 }).expect(201)).body;
      const six = (
        await create({
          name: 'Six',
          parentProductId: padre.id,
          unitsPerPack: 6,
          salePrice: 110,
          purchaseCost: 70,
          initialStock: 99,
        }).expect(201)
      ).body;
      expect(await movements(six.id)).toHaveLength(0);
      expect(six).toMatchObject({
        stock: 0,
        parentProductId: padre.id,
        parentName: 'Cerveza',
        parentStock: 30,
        effectiveStock: 5,
      });
    });

    it('initialStock negativo → 400 y no se crea nada', async () => {
      await create({ initialStock: -1 }).expect(400);
      expect(await h.prisma.product.count()).toBe(0);
    });

    it('un campo desconocido → 400 (forbidNonWhitelisted); stock no es de POST', async () => {
      await create({ stock: 5 }).expect(400);
      await create({ departmentId: 3 }).expect(400);
      expect(await h.prisma.product.count()).toBe(0);
    });

    describe('idempotencia (id)', () => {
      it('el id es OBLIGATORIO desde un dispositivo: sin él, o con uno que no es UUID → 400 y no se guarda nada', async () => {
        await post({ name: 'X', salePrice: 2, purchaseCost: 1 }).expect(400);
        await create({ id: 'no-es-uuid' }).expect(400);
        expect(await h.prisma.product.count()).toBe(0);
      });

      it('repetir la petición con el mismo id devuelve el mismo producto y NO duplica el stock inicial', async () => {
        const id = randomUUID();
        const first = await create({ id, initialStock: 12 }).expect(201);
        const again = await create({ id, initialStock: 12 }).expect(201);
        expect(again.body).toEqual(first.body);
        expect(await h.prisma.product.count()).toBe(1);
        expect(await movements(id)).toHaveLength(1);
        expect(await stockOf(h.prisma, id)).toBe(12);
      });

      it('varias peticiones SIMULTÁNEAS con el mismo id: un solo producto y un solo movimiento', async () => {
        const id = randomUUID();
        const results = await Promise.all(
          Array.from({ length: 8 }, () => create({ id, initialStock: 7 })),
        );
        expect(results.map((r) => r.status)).toEqual(Array(8).fill(201));
        expect(await h.prisma.product.count()).toBe(1);
        expect(await movements(id)).toHaveLength(1);
      });

      it('un id que ya usa OTRO negocio → 409 ID_IN_USE y no toca el producto ajeno', async () => {
        const otro = await h.prisma.business.create({
          data: { name: 'Otra', slug: 'otra' },
        });
        const ajeno = await seedProduct(h.prisma, otro.id, {
          name: 'Ajeno',
          stock: 3,
        });
        const res = await create({ id: ajeno.id, name: 'Mío' }).expect(409);
        expect(res.body).toMatchObject({ code: 'ID_IN_USE' });
        const row = await h.prisma.product.findUniqueOrThrow({
          where: { id: ajeno.id },
        });
        expect(row).toMatchObject({ name: 'Ajeno', businessId: otro.id });
      });
    });

    describe('código de barras (K23)', () => {
      it('K23: repetido en el negocio → 409 BARCODE_TAKEN con el texto exacto y no se guarda nada', async () => {
        await create({ barcode: '750100' }).expect(201);
        const res = await create({
          barcode: '750100',
          initialStock: 4,
        }).expect(409);
        expect(res.body).toMatchObject({
          statusCode: 409,
          code: 'BARCODE_TAKEN',
          message: 'El código de barras ya existe',
        });
        expect(await h.prisma.product.count()).toBe(1);
        expect(await h.prisma.inventoryMovement.count()).toBe(0);
      });

      it('el mismo código en OTRO negocio es válido', async () => {
        const otro = await h.prisma.business.create({
          data: { name: 'Otra', slug: 'otra' },
        });
        await seedProduct(h.prisma, otro.id, {
          name: 'Ajeno',
          barcode: '750100',
        });
        await create({ barcode: '750100' }).expect(201);
      });

      it('sin código, con "" o solo espacios se guarda null (varios productos sin código son válidos)', async () => {
        const a = (await create({ barcode: '' }).expect(201)).body;
        const b = (await create({ barcode: '   ' }).expect(201)).body;
        const c = (await create({ barcode: null }).expect(201)).body;
        expect([a.barcode, b.barcode, c.barcode]).toEqual([null, null, null]);
      });

      it('varias altas SIMULTÁNEAS con el mismo código: una gana y el resto → 409 BARCODE_TAKEN (nunca un 500)', async () => {
        const results = await Promise.all(
          Array.from({ length: 8 }, () => create({ barcode: '777' })),
        );
        expect(results.map((r) => r.status).sort()).toEqual([
          201,
          ...Array(7).fill(409),
        ]);
        for (const r of results.filter((r) => r.status === 409)) {
          expect(r.body.code).toBe('BARCODE_TAKEN');
        }
        expect(await h.prisma.product.count()).toBe(1);
      });
    });

    describe('validaciones', () => {
      it('name con trim vacío → 400 "El nombre es requerido"; el nombre se guarda sin espacios', async () => {
        const res = await create({ name: '   ' }).expect(400);
        expect(message(res)).toContain('El nombre es requerido');
        const ok = await create({ name: '  Agua  ' }).expect(201);
        expect(ok.body.name).toBe('Agua');
      });

      it('precio y costo del contrato móvil (tipos con precio de catálogo)', async () => {
        expect(message(await create({ salePrice: 0 }).expect(400))).toContain(
          'El precio de venta debe ser mayor a 0',
        );
        expect(
          message(await create({ purchaseCost: 0 }).expect(400)),
        ).toContain('El costo de compra debe ser mayor a 0');
        expect(
          message(
            await create({ salePrice: 10, purchaseCost: 12 }).expect(400),
          ),
        ).toContain('El precio de venta no puede ser menor al costo de compra');
        // Igual precio y costo sí es válido (no hay ganancia, pero no es menor).
        await create({ salePrice: 12, purchaseCost: 12 }).expect(201);
        expect(await h.prisma.product.count()).toBe(1);
      });

      it('PRECIO_LIBRE queda exento (precio y costo 0)', async () => {
        await create({
          tipoVenta: 'PRECIO_LIBRE',
          salePrice: 0,
          purchaseCost: 0,
        }).expect(201);
      });

      it('SERVICIO NO queda exento: exige precio y costo > 0', async () => {
        await create({
          tipoVenta: 'SERVICIO',
          salePrice: 50,
          purchaseCost: 0,
        }).expect(400);
      });

      it('precio negativo o no numérico → 400', async () => {
        await create({ salePrice: -1 }).expect(400);
        await create({ salePrice: '10' }).expect(400);
      });
    });

    describe('presentaciones (parentProductId)', () => {
      it('un padre que no existe → 400 "El producto padre no existe o está inactivo" (antes se guardaba null en silencio)', async () => {
        const res = await create({ parentProductId: randomUUID() }).expect(400);
        expect(message(res)).toContain(
          'El producto padre no existe o está inactivo',
        );
        expect(await h.prisma.product.count()).toBe(0);
      });

      it('un padre inactivo → 400 con el mismo mensaje', async () => {
        const padre = await seedProduct(h.prisma, seed.business.id, {
          name: 'Padre',
          active: false,
        });
        const res = await create({ parentProductId: padre.id }).expect(400);
        expect(message(res)).toContain(
          'El producto padre no existe o está inactivo',
        );
      });

      it('un padre de OTRO negocio → 400 con el mismo mensaje', async () => {
        const otro = await h.prisma.business.create({
          data: { name: 'Otra', slug: 'otra' },
        });
        const ajeno = await seedProduct(h.prisma, otro.id, { name: 'Ajeno' });
        const res = await create({ parentProductId: ajeno.id }).expect(400);
        expect(message(res)).toContain(
          'El producto padre no existe o está inactivo',
        );
      });

      it('presentación de una presentación → 400', async () => {
        const padre = (await create().expect(201)).body;
        const six = (
          await create({
            name: 'Six',
            parentProductId: padre.id,
            unitsPerPack: 6,
          }).expect(201)
        ).body;
        const res = await create({ parentProductId: six.id }).expect(400);
        expect(message(res)).toContain(
          'No se pueden crear presentaciones de una presentación',
        );
      });

      it('un padre de tipo SERVICIO → 400', async () => {
        const servicio = (await create({ tipoVenta: 'SERVICIO' }).expect(201))
          .body;
        const res = await create({ parentProductId: servicio.id }).expect(400);
        expect(message(res)).toContain(
          'Un producto de tipo Servicio no puede tener presentaciones vinculadas',
        );
      });

      it('unitsPerPack debe ser positivo', async () => {
        const padre = (await create().expect(201)).body;
        await create({ parentProductId: padre.id, unitsPerPack: 0 }).expect(
          400,
        );
      });
    });

    it('la respuesta y la fila guardan precios a 2 decimales', async () => {
      const res = await create({
        salePrice: 10.005,
        purchaseCost: 4.999,
      }).expect(201);
      expect(res.body.salePrice).toBe(10.01);
      expect(res.body.purchaseCost).toBe(5);
    });
  });

  describe('POST /products — el dashboard del dueño no se rompe', () => {
    it('sin id y con costo 0 (lo que manda hoy el NewProductModal): se crea con un id generado por el servidor', async () => {
      const res = await post(
        { name: 'Desde el dashboard', salePrice: 20, purchaseCost: 0 },
        dashboard,
      ).expect(201);
      expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(res.body).toMatchObject({
        name: 'Desde el dashboard',
        salePrice: 20,
        purchaseCost: 0,
        stock: 0,
      });
      const row = await h.prisma.product.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(row.businessId).toBe(seed.business.id);
    });

    it('también acepta el id del cliente y respeta el candado de código de barras', async () => {
      const id = randomUUID();
      await post(
        { id, name: 'A', salePrice: 5, purchaseCost: 1, barcode: '999' },
        dashboard,
      ).expect(201);
      const res = await post(
        { name: 'B', salePrice: 5, purchaseCost: 1, barcode: '999' },
        dashboard,
      ).expect(409);
      expect(res.body.code).toBe('BARCODE_TAKEN');
    });
  });

  describe('PATCH /products/:id — editar y ajustar el stock', () => {
    let id: string;
    beforeEach(async () => {
      id = (
        await create({
          barcode: '111',
          description: 'Fría',
          location: 'Pasillo 2',
          initialStock: 12,
        }).expect(201)
      ).body.id;
    });

    it('K22: stock por valor ABSOLUTO — sube: un IN de la diferencia con STOCK_ADJUSTMENT', async () => {
      const res = await patch(id, { stock: 20 }).expect(200);
      expect(Object.keys(res.body).sort()).toEqual(PRODUCT_KEYS);
      expect(res.body.stock).toBe(20);
      const adj = (await movements(id)).filter(
        (m) => m.reference === 'STOCK_ADJUSTMENT',
      );
      expect(adj).toHaveLength(1);
      expect(adj[0]).toMatchObject({ type: 'IN', userId: anaId });
      expect(Number(adj[0].quantity)).toBe(8);
      const log = await h.prisma.syncLogEntry.findMany({
        where: { rowId: adj[0].id },
      });
      expect(log.map((l) => l.tableName)).toEqual(['inventoryMovements']);
    });

    it('baja: un OUT de la diferencia', async () => {
      const res = await patch(id, { stock: 5 }).expect(200);
      expect(res.body.stock).toBe(5);
      const adj = (await movements(id)).filter(
        (m) => m.reference === 'STOCK_ADJUSTMENT',
      );
      expect(adj).toHaveLength(1);
      expect(adj[0]).toMatchObject({ type: 'OUT' });
      expect(Number(adj[0].quantity)).toBe(7);
    });

    it('el mismo valor (o repetir el PATCH) no crea movimientos: es idempotente', async () => {
      await patch(id, { stock: 12 }).expect(200);
      await patch(id, { stock: 20 }).expect(200);
      await patch(id, { stock: 20 }).expect(200);
      const adj = (await movements(id)).filter(
        (m) => m.reference === 'STOCK_ADJUSTMENT',
      );
      expect(adj).toHaveLength(1);
      expect(await stockOf(h.prisma, id)).toBe(20);
    });

    it('stock 0 lleva la existencia a cero', async () => {
      expect((await patch(id, { stock: 0 }).expect(200)).body.stock).toBe(0);
      expect(await stockOf(h.prisma, id)).toBe(0);
    });

    it('stock negativo → 400 y no cambia nada', async () => {
      await patch(id, { stock: -1 }).expect(400);
      expect(await stockOf(h.prisma, id)).toBe(12);
    });

    it('varios ajustes SIMULTÁNEOS al mismo valor terminan en ese valor (no se suman: hay candado)', async () => {
      const results = await Promise.all(
        Array.from({ length: 8 }, () => patch(id, { stock: 20 })),
      );
      expect(results.map((r) => r.status)).toEqual(Array(8).fill(200));
      expect(await stockOf(h.prisma, id)).toBe(20);
      // Solo el primero encontró una diferencia (12 → 20); los demás ya vieron 20 y no escribieron nada.
      const adj = (await movements(id)).filter(
        (m) => m.reference === 'STOCK_ADJUSTMENT',
      );
      expect(adj).toHaveLength(1);
    });

    // Cada PATCH lee la fila, fusiona su cambio y la escribe completa: sin el bloqueo de la fila, dos PATCH de campos
    // distintos se pisarían entre sí (el segundo escribiría el valor viejo del campo que cambió el primero).
    it('PATCH SIMULTÁNEOS de campos distintos no se pisan (se conservan todos los cambios)', async () => {
      const cambios = [
        { name: 'Nombre nuevo' },
        { description: 'Descripción nueva' },
        { location: 'Ubicación nueva' },
        { imagePath: 'imagen.png' },
        { salePrice: 25 },
        { purchaseCost: 13 },
      ];
      const results = await Promise.all(
        [...cambios, ...cambios].map((body) => patch(id, body)),
      );
      expect(results.map((r) => r.status)).toEqual(Array(12).fill(200));
      const row = await h.prisma.product.findUniqueOrThrow({ where: { id } });
      expect(row).toMatchObject({
        name: 'Nombre nuevo',
        description: 'Descripción nueva',
        location: 'Ubicación nueva',
        imagePath: 'imagen.png',
      });
      expect([Number(row.salePrice), Number(row.purchaseCost)]).toEqual([
        25, 13,
      ]);
    });

    it('en una presentación stock se ignora (el inventario vive en el padre)', async () => {
      const six = (
        await create({
          name: 'Six',
          parentProductId: id,
          unitsPerPack: 6,
          salePrice: 110,
          purchaseCost: 70,
        }).expect(201)
      ).body;
      await patch(six.id, { stock: 50 }).expect(200);
      expect(await movements(six.id)).toHaveLength(0);
      expect(await stockOf(h.prisma, id)).toBe(12);
    });

    it('al pasar a PRECIO_LIBRE/SERVICIO no se crea movimiento', async () => {
      await patch(id, {
        tipoVenta: 'PRECIO_LIBRE',
        salePrice: 0,
        purchaseCost: 0,
        stock: 99,
      }).expect(200);
      expect(
        (await movements(id)).filter((m) => m.reference === 'STOCK_ADJUSTMENT'),
      ).toHaveLength(0);
    });

    it('un cambio parcial conserva el resto de los campos', async () => {
      const res = await patch(id, { name: '  Cerveza Oscura ' }).expect(200);
      expect(res.body).toMatchObject({
        name: 'Cerveza Oscura',
        barcode: '111',
        description: 'Fría',
        location: 'Pasillo 2',
        salePrice: 20,
        purchaseCost: 12,
        stock: 12,
      });
    });

    it('null borra un campo opcional (barcode, descripción, ubicación)', async () => {
      const res = await patch(id, {
        barcode: null,
        description: null,
        location: null,
      }).expect(200);
      expect(res.body).toMatchObject({
        barcode: null,
        description: null,
        location: null,
      });
    });

    it('cambiar precio y costo (y bajar el precio por debajo del costo → 400)', async () => {
      const ok = await patch(id, { salePrice: 30, purchaseCost: 15 }).expect(
        200,
      );
      expect(ok.body).toMatchObject({ salePrice: 30, purchaseCost: 15 });
      const res = await patch(id, { salePrice: 10 }).expect(400);
      expect(message(res)).toContain(
        'El precio de venta no puede ser menor al costo de compra',
      );
      // El PATCH rechazado no cambió nada.
      expect(
        Number(
          (await h.prisma.product.findUniqueOrThrow({ where: { id } }))
            .salePrice,
        ),
      ).toBe(30);
    });

    it('cambiar el código a uno de otro producto → 409 BARCODE_TAKEN; conservar el propio es válido', async () => {
      await create({ barcode: '222' }).expect(201);
      const res = await patch(id, { barcode: '222' }).expect(409);
      expect(res.body.code).toBe('BARCODE_TAKEN');
      await patch(id, { barcode: '111', name: 'Mismo código' }).expect(200);
    });

    it('un producto que no existe, o de otro negocio → 404; un id que no es UUID → 400', async () => {
      await patch(randomUUID(), { name: 'x' }).expect(404);
      const otro = await h.prisma.business.create({
        data: { name: 'Otra', slug: 'otra' },
      });
      const ajeno = await seedProduct(h.prisma, otro.id, { name: 'Ajeno' });
      await patch(ajeno.id, { name: 'Robado' }).expect(404);
      expect(
        (await h.prisma.product.findUniqueOrThrow({ where: { id: ajeno.id } }))
          .name,
      ).toBe('Ajeno');
      await patch('no-es-uuid', { name: 'x' }).expect(400);
    });

    it('id (y initialStock) en el cuerpo → 400: la identidad no se cambia', async () => {
      await patch(id, { id: randomUUID() }).expect(400);
      await patch(id, { initialStock: 3 }).expect(400);
    });

    it('name vacío → 400', async () => {
      const res = await patch(id, { name: '  ' }).expect(400);
      expect(message(res)).toContain('El nombre es requerido');
    });

    describe('baja lógica y presentaciones', () => {
      let sixId: string;
      beforeEach(async () => {
        sixId = (
          await create({
            name: 'Six',
            parentProductId: id,
            unitsPerPack: 6,
            salePrice: 110,
            purchaseCost: 70,
          }).expect(201)
        ).body.id;
      });

      it('dar de baja un padre con presentaciones activas → 400; con la presentación ya dada de baja → 200', async () => {
        const res = await patch(id, { active: false }).expect(400);
        expect(message(res)).toContain(
          'Este producto tiene presentaciones vinculadas activas. Elimínalas primero.',
        );
        await patch(sixId, { active: false }).expect(200);
        const ok = await patch(id, { active: false }).expect(200);
        expect(ok.body.active).toBe(false);
      });

      it('convertir en presentación a un producto que ya tiene presentaciones activas → 400', async () => {
        const otro = (await create({ name: 'Otro' }).expect(201)).body;
        const res = await patch(id, { parentProductId: otro.id }).expect(400);
        expect(message(res)).toContain(
          'Este producto tiene presentaciones vinculadas. Elimínalas primero.',
        );
      });

      it('el padre debe existir y estar activo; un producto no puede ser su propio padre', async () => {
        const solo = (await create({ name: 'Solo' }).expect(201)).body;
        expect(
          message(
            await patch(solo.id, { parentProductId: randomUUID() }).expect(400),
          ),
        ).toContain('El producto padre no existe o está inactivo');
        await patch(solo.id, { parentProductId: solo.id }).expect(400);
        await patch(solo.id, { parentProductId: id }).expect(200);
      });

      it('parentProductId null la convierte otra vez en producto raíz', async () => {
        const res = await patch(sixId, { parentProductId: null }).expect(200);
        expect(res.body).toMatchObject({
          parentProductId: null,
          parentName: null,
        });
      });
    });

    it('el dashboard del dueño (sin deviceId) tampoco necesita cumplir las reglas de precio móviles', async () => {
      await patch(id, { purchaseCost: 0 }, dashboard).expect(200);
    });
  });
});
