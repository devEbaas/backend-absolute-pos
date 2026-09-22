import { randomUUID } from 'crypto';
import {
  addMovement,
  createHarness,
  Harness,
  login,
  resetDb,
  seedBusiness,
  seedCut,
  seedDevice,
  seedOpenSession,
  seedOutflow,
  seedProduct,
  seedSale,
  seedUser,
  Seed,
  Session,
} from './helpers/harness';

// specs/22 §3 — las lecturas para el cajero (B4): catálogo con stock, promociones, caja, cortes y movimientos.
describe('Lecturas para el cajero (specs/22 §3)', () => {
  let h: Harness;
  let seed: Seed;
  let ana: Session;
  let anaId: string;

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
  });

  const get = (path: string, auth = ana.bearer) =>
    h.http().get(path).set('Authorization', auth);

  describe('autenticación (K20)', () => {
    it.each([
      '/products/with-stock',
      '/promotions/active',
      '/cash-sessions/current',
      '/cash-cuts',
      '/inventory-movements',
    ])('%s: sin token → 401 "Token requerido"', async (path) => {
      const res = await h.http().get(path).expect(401);
      expect(res.body.message).toBe('Token requerido');
    });

    it('con un token vencido o falso → 401 "Token inválido o expirado"', async () => {
      const res = await get(
        '/products/with-stock',
        'Bearer no-es-un-jwt',
      ).expect(401);
      expect(res.body.message).toBe('Token inválido o expirado');
    });

    it('la clave del dispositivo NO vale en las rutas móviles (solo el JWT)', async () => {
      const res = await get(
        '/products/with-stock',
        `Bearer ${seed.deviceKey}`,
      ).expect(401);
      expect(res.body.message).toBe('Token inválido o expirado');
    });

    it('las rutas heredadas de la app React Native (descartada) ya no existen', async () => {
      const id = '5d0a4f0e-7c0a-4c2b-9a58-1d6a0a7d4d11';
      const removed: [string, string][] = [
        ['get', '/products'], // el catálogo con clave de dispositivo: lo sustituye /products/with-stock
        ['patch', `/cash-sessions/${id}/close`], // cerrar sin corte: lo sustituye close-with-cut
        ['post', '/cash-cuts'], // corte sin cerrar: lo sustituye close-with-cut
        ['post', '/inventory-movements'], // un movimiento por llamada: lo sustituye /inventory-entries
      ];
      for (const [method, path] of removed) {
        for (const auth of [ana.bearer, `Bearer ${seed.deviceKey}`]) {
          const res = await h
            .http()
            [method as 'get'](path)
            .set('Authorization', auth)
            .send({});
          expect([404, 405]).toContain(res.status);
        }
      }
    });
  });

  describe('GET /products/with-stock (§3.2)', () => {
    it('trae el stock derivado de los movimientos y el efectivo de las presentaciones', async () => {
      const b = seed.business.id;
      const cerveza = await seedProduct(h.prisma, b, {
        name: 'Cerveza',
        stock: 50,
        salePrice: 20,
        purchaseCost: 12,
      });
      await addMovement(h.prisma, b, cerveza.id, 'OUT', 2, 'sale'); // 48
      const six = await seedProduct(h.prisma, b, {
        name: 'Six Cerveza',
        parentProductId: cerveza.id,
        unitsPerPack: 6,
        salePrice: 90,
        purchaseCost: 60,
      });
      const agua = await seedProduct(h.prisma, b, {
        name: 'Agua',
        stock: 10,
        barcode: '750111',
      });

      const res = await get('/products/with-stock').expect(200);
      const byName = Object.fromEntries(
        (res.body as any[]).map((p) => [p.name, p]),
      );

      expect(byName['Cerveza']).toMatchObject({
        id: cerveza.id,
        stock: 48,
        effectiveStock: 48,
        parentName: null,
        parentStock: null,
        salePrice: 20,
        purchaseCost: 12,
        unitsPerPack: 1,
        active: true,
      });
      expect(byName['Six Cerveza']).toMatchObject({
        id: six.id,
        stock: 0,
        parentProductId: cerveza.id,
        parentName: 'Cerveza',
        parentStock: 48,
        unitsPerPack: 6,
        effectiveStock: 8, // trunc(48 / 6)
      });
      expect(byName['Agua']).toMatchObject({
        id: agua.id,
        stock: 10,
        effectiveStock: 10,
        barcode: '750111',
      });
      expect(typeof byName['Cerveza'].createdAt).toBe('string');
    });

    it('la existencia efectiva de una presentación se trunca (no redondea)', async () => {
      const b = seed.business.id;
      const padre = await seedProduct(h.prisma, b, {
        name: 'Refresco',
        stock: 17,
      });
      await seedProduct(h.prisma, b, {
        name: 'Pack 6',
        parentProductId: padre.id,
        unitsPerPack: 6,
      });
      const res = await get('/products/with-stock').expect(200);
      expect(
        (res.body as any[]).find((p) => p.name === 'Pack 6').effectiveStock,
      ).toBe(2); // 17 / 6 = 2.83
    });

    it('PRECIO_LIBRE y SERVICIO nunca muestran existencia, aunque conserven movimientos de otro tipo', async () => {
      const b = seed.business.id;
      await seedProduct(h.prisma, b, {
        name: 'Varios',
        tipoVenta: 'PRECIO_LIBRE',
        stock: 7,
      });
      await seedProduct(h.prisma, b, { name: 'Corte', tipoVenta: 'SERVICIO' });
      const res = await get('/products/with-stock').expect(200);
      const byName = Object.fromEntries(
        (res.body as any[]).map((p) => [p.name, p]),
      );
      expect(byName['Varios'].effectiveStock).toBe(0);
      expect(byName['Varios'].stock).toBe(7); // el stock crudo sigue siendo Σ IN − Σ OUT
      expect(byName['Corte'].effectiveStock).toBe(0);
    });

    it('incluye los inactivos, ordena por creación descendente y no ve productos de otro negocio', async () => {
      const b = seed.business.id;
      const viejo = await seedProduct(h.prisma, b, {
        name: 'Viejo',
        active: false,
      });
      await new Promise((r) => setTimeout(r, 15));
      const nuevo = await seedProduct(h.prisma, b, { name: 'Nuevo' });
      const otro = await h.prisma.business.create({
        data: { name: 'Otra', slug: 'otra' },
      });
      await seedProduct(h.prisma, otro.id, { name: 'Ajeno', stock: 99 });

      const res = await get('/products/with-stock').expect(200);
      expect((res.body as any[]).map((p) => p.id)).toEqual([
        nuevo.id,
        viejo.id,
      ]);
      expect((res.body as any[])[1].active).toBe(false);
    });

    it('un producto sin movimientos vale 0', async () => {
      await seedProduct(h.prisma, seed.business.id, { name: 'Sin stock' });
      const res = await get('/products/with-stock').expect(200);
      expect(res.body[0]).toMatchObject({ stock: 0, effectiveStock: 0 });
    });
  });

  describe('GET /promotions/active (§3.3)', () => {
    it('solo las activas del negocio, con sus productos y los números como número', async () => {
      const b = seed.business.id;
      const p1 = await seedProduct(h.prisma, b, { name: 'A' });
      const p2 = await seedProduct(h.prisma, b, { name: 'B' });
      const now = new Date();
      const activa = await h.prisma.promotion.create({
        data: {
          id: randomUUID(),
          businessId: b,
          name: '3x2',
          type: 'MULTIPACK',
          requiredQuantity: 3,
          discountType: 'FIXED_AMOUNT',
          discountValue: 10,
          freeQuantity: 0,
          active: true,
          createdAt: now,
        },
      });
      await h.prisma.promotionProduct.createMany({
        data: [
          { promotionId: activa.id, productId: p1.id },
          { promotionId: activa.id, productId: p2.id },
        ],
      });
      await h.prisma.promotion.create({
        data: {
          id: randomUUID(),
          businessId: b,
          name: 'Apagada',
          active: false,
          createdAt: now,
        },
      });
      const otro = await h.prisma.business.create({
        data: { name: 'Otra', slug: 'otra' },
      });
      await h.prisma.promotion.create({
        data: {
          id: randomUUID(),
          businessId: otro.id,
          name: 'Ajena',
          active: true,
          createdAt: now,
        },
      });

      const res = await get('/promotions/active').expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        id: activa.id,
        name: '3x2',
        type: 'MULTIPACK',
        requiredQuantity: 3,
        discountType: 'FIXED_AMOUNT',
        discountValue: 10,
        freeQuantity: 0,
      });
      expect([...res.body[0].productIds].sort()).toEqual([p1.id, p2.id].sort());
    });
  });

  describe('caja: sesión actual y resumen (§3.4)', () => {
    it('K18: sin sesión abierta → { session: null }; con una propia → esa sesión', async () => {
      const vacio = await get('/cash-sessions/current').expect(200);
      expect(vacio.body).toEqual({ session: null });

      const s = await seedOpenSession(
        h.prisma,
        seed.business.id,
        anaId,
        seed.device.id,
        500,
      );
      const res = await get('/cash-sessions/current').expect(200);
      expect(res.body.session).toEqual({
        id: s.id,
        userId: anaId,
        userName: 'Ana Cajera',
        openingAmount: 500,
        status: 'open',
        registerId: 'CAJA-2',
        openedAt: s.openedAt.toISOString(),
        closedAt: null,
      });
    });

    it('K19: solo la sesión PROPIA — no la de otro usuario, otro dispositivo, una cerrada ni la del escritorio', async () => {
      const b = seed.business.id;
      const bob = await seedUser(h.prisma, b, { username: 'bob', name: 'Bob' });
      const otra = await seedDevice(h.prisma, b, 'CAJA-3');
      await seedOpenSession(h.prisma, b, bob.id, seed.device.id); // otro usuario, mismo dispositivo
      await seedOpenSession(h.prisma, b, anaId, otra.device.id); // mismo usuario, otro dispositivo
      await seedOpenSession(h.prisma, b, anaId, null); // fila del escritorio (sin dispositivo)
      const cerrada = await seedOpenSession(h.prisma, b, anaId, seed.device.id);
      await h.prisma.cashSession.update({
        where: { id: cerrada.id },
        data: { status: 'closed', closedAt: new Date() },
      });

      expect((await get('/cash-sessions/current').expect(200)).body).toEqual({
        session: null,
      });
    });

    it('con varias abiertas devuelve la más reciente', async () => {
      const b = seed.business.id;
      const vieja = await seedOpenSession(h.prisma, b, anaId, seed.device.id);
      await h.prisma.cashSession.update({
        where: { id: vieja.id },
        data: { openedAt: new Date(Date.now() - 3600_000) },
      });
      const nueva = await seedOpenSession(
        h.prisma,
        b,
        anaId,
        seed.device.id,
        200,
      );
      expect(
        (await get('/cash-sessions/current').expect(200)).body.session.id,
      ).toBe(nueva.id);
    });

    it('K15: el resumen de un turno completo (sin crédito)', async () => {
      const b = seed.business.id;
      const s = await seedOpenSession(h.prisma, b, anaId, seed.device.id, 500);
      const sale = (total: number, paymentMethod: string, cancelled = false) =>
        seedSale(h.prisma, {
          businessId: b,
          userId: anaId,
          deviceId: seed.device.id,
          sessionId: s.id,
          total,
          paymentMethod,
          cancelled,
        });
      await sale(400, 'efectivo');
      await sale(400, 'cash'); // C10: el inglés cae en el mismo bucket
      await sale(400, 'Efectivo'); // y con mayúscula
      await sale(300, 'tarjeta');
      await sale(150, 'transferencia');
      await sale(80, 'efectivo', true); // cancelada: fuera de totalSales
      await seedOutflow(h.prisma, s.id, anaId, 100);

      const res = await get(`/cash-sessions/${s.id}/summary`).expect(200);
      expect(res.body).toEqual({
        openingAmount: 500,
        totalCashSales: 1200,
        totalCardSales: 300,
        totalTransferSales: 150,
        totalOtherSales: 0,
        totalSales: 1650,
        transactionCount: 5,
        cancelledCount: 1,
        totalCancelledAmount: 80,
        totalOutflows: 100,
        outflowCount: 1,
        expectedCash: 1600, // 500 + 1200 − 100
      });
    });

    it('C11: un método desconocido cae en "otras formas de pago" y cuenta en totalSales', async () => {
      const b = seed.business.id;
      const s = await seedOpenSession(h.prisma, b, anaId, seed.device.id, 0);
      await seedSale(h.prisma, {
        businessId: b,
        userId: anaId,
        deviceId: seed.device.id,
        sessionId: s.id,
        total: 60,
        paymentMethod: 'vale',
      });
      const res = await get(`/cash-sessions/${s.id}/summary`).expect(200);
      expect(res.body).toMatchObject({
        totalOtherSales: 60,
        totalSales: 60,
        totalCashSales: 0,
        expectedCash: 0,
      });
    });

    it('una sesión sin ventas ni salidas: todo en cero salvo el fondo', async () => {
      const s = await seedOpenSession(
        h.prisma,
        seed.business.id,
        anaId,
        seed.device.id,
        250,
      );
      const res = await get(`/cash-sessions/${s.id}/summary`).expect(200);
      expect(res.body).toMatchObject({
        openingAmount: 250,
        totalSales: 0,
        transactionCount: 0,
        expectedCash: 250,
      });
    });

    it('K19: el resumen de una sesión ajena, de otro dispositivo o inexistente → 404 "Sesión no encontrada"', async () => {
      const b = seed.business.id;
      const bob = await seedUser(h.prisma, b, { username: 'bob' });
      const otra = await seedDevice(h.prisma, b, 'CAJA-3');
      const ajenas = [
        await seedOpenSession(h.prisma, b, bob.id, seed.device.id),
        await seedOpenSession(h.prisma, b, anaId, otra.device.id),
        await seedOpenSession(h.prisma, b, anaId, null),
      ];
      for (const s of ajenas) {
        const res = await get(`/cash-sessions/${s.id}/summary`).expect(404);
        expect(res.body.message).toBe('Sesión no encontrada');
        await get(`/cash-sessions/${s.id}/outflows`).expect(404);
        await get(`/cash-sessions/${s.id}/sales`).expect(404);
      }
      await get(`/cash-sessions/${randomUUID()}/summary`).expect(404);
    });

    it('una sesión de OTRO negocio tampoco se ve', async () => {
      const otro = await h.prisma.business.create({
        data: { name: 'Otra', slug: 'otra' },
      });
      const u = await seedUser(h.prisma, otro.id, { username: 'zoe' });
      const s = await seedOpenSession(h.prisma, otro.id, u.id, seed.device.id);
      await get(`/cash-sessions/${s.id}/summary`).expect(404);
    });

    it('un id que no es UUID → 400 (no un error de base de datos)', async () => {
      await get('/cash-sessions/no-es-uuid/summary').expect(400);
    });

    it('una sesión ya cerrada propia sigue teniendo resumen', async () => {
      const b = seed.business.id;
      const s = await seedOpenSession(h.prisma, b, anaId, seed.device.id, 100);
      await h.prisma.cashSession.update({
        where: { id: s.id },
        data: { status: 'closed', closedAt: new Date() },
      });
      await get(`/cash-sessions/${s.id}/summary`).expect(200);
    });
  });

  describe('caja: salidas y ventas de la sesión (§3.4)', () => {
    it('lista las salidas con su autor, la más reciente primero', async () => {
      const b = seed.business.id;
      const s = await seedOpenSession(h.prisma, b, anaId, seed.device.id);
      const t0 = Date.now();
      const primera = await seedOutflow(
        h.prisma,
        s.id,
        anaId,
        100,
        'Pago a proveedor',
        new Date(t0 - 2000),
      );
      const segunda = await seedOutflow(
        h.prisma,
        s.id,
        anaId,
        35.5,
        'Hielo',
        new Date(t0),
      );
      const res = await get(`/cash-sessions/${s.id}/outflows`).expect(200);
      expect(res.body).toEqual([
        {
          id: segunda.id,
          sessionId: s.id,
          userId: anaId,
          userName: 'Ana Cajera',
          amount: 35.5,
          reason: 'Hielo',
          createdAt: segunda.createdAt.toISOString(),
        },
        {
          id: primera.id,
          sessionId: s.id,
          userId: anaId,
          userName: 'Ana Cajera',
          amount: 100,
          reason: 'Pago a proveedor',
          createdAt: primera.createdAt.toISOString(),
        },
      ]);
    });

    it('lista las ventas de la sesión con su número de líneas', async () => {
      const b = seed.business.id;
      const s = await seedOpenSession(h.prisma, b, anaId, seed.device.id);
      const venta = await seedSale(h.prisma, {
        businessId: b,
        userId: anaId,
        deviceId: seed.device.id,
        sessionId: s.id,
        total: 90,
      });
      const prod = await seedProduct(h.prisma, b, { name: 'Agua' });
      await h.prisma.saleItem.create({
        data: {
          id: randomUUID(),
          saleId: venta.id,
          productId: prod.id,
          quantity: 2,
          unitPrice: 45,
          subtotal: 90,
        },
      });
      await seedSale(h.prisma, {
        businessId: b,
        userId: anaId,
        sessionId: null,
        total: 5,
      }); // de otra sesión: no sale
      const res = await get(`/cash-sessions/${s.id}/sales`).expect(200);
      expect(res.body).toEqual([
        {
          id: venta.id,
          total: 90,
          paymentMethod: 'efectivo',
          cancelled: false,
          createdAt: venta.createdAt.toISOString(),
          itemsCount: 1,
        },
      ]);
    });
  });

  describe('GET /cash-cuts (§3.4)', () => {
    it('K19: solo los cortes PROPIOS (mi usuario y una sesión de mi dispositivo)', async () => {
      const b = seed.business.id;
      const bob = await seedUser(h.prisma, b, { username: 'bob' });
      const otra = await seedDevice(h.prisma, b, 'CAJA-3');
      const mia = await seedOpenSession(h.prisma, b, anaId, seed.device.id);
      const deBob = await seedOpenSession(h.prisma, b, bob.id, seed.device.id);
      const enOtraCaja = await seedOpenSession(
        h.prisma,
        b,
        anaId,
        otra.device.id,
      );
      const delEscritorio = await seedOpenSession(h.prisma, b, anaId, null);

      const propio = await seedCut(h.prisma, mia.id, anaId);
      // Un corte es "propio" si lo hizo mi usuario Y su sesión es de este dispositivo. Estos no lo son:
      await seedCut(h.prisma, deBob.id, bob.id); // de otro usuario
      await seedCut(h.prisma, enOtraCaja.id, anaId); // de otro dispositivo
      await seedCut(h.prisma, delEscritorio.id, anaId); // escrito por el escritorio (sesión sin dispositivo)
      // Y este sí: lo hizo mi usuario sobre una sesión de este dispositivo (aunque la abriera otro usuario).
      const sobreSesionDeBob = await seedCut(h.prisma, deBob.id, anaId);

      const res = await get('/cash-cuts').expect(200);
      expect((res.body.items as any[]).map((c) => c.id).sort()).toEqual(
        [propio.id, sobreSesionDeBob.id].sort(),
      );
      expect(res.body.total).toBe(2);
      expect(res.body).toMatchObject({ page: 1, pageSize: 15 });
    });

    it('trae el corte completo con números, registerId y las fechas de la sesión', async () => {
      const b = seed.business.id;
      const s = await seedOpenSession(h.prisma, b, anaId, seed.device.id, 500);
      await h.prisma.cashSession.update({
        where: { id: s.id },
        data: { status: 'closed', closedAt: new Date() },
      });
      const cut = await h.prisma.cashCut.create({
        data: {
          id: randomUUID(),
          sessionId: s.id,
          userId: anaId,
          cutType: 'total',
          openingAmount: 500,
          totalCashSales: 1200,
          totalCardSales: 300,
          totalTransferSales: 150,
          totalOtherSales: 0,
          totalSales: 1650,
          totalCancelledAmount: 80,
          cancelledCount: 1,
          totalOutflows: 100,
          outflowCount: 1,
          expectedCash: 1600,
          actualCash: 1590,
          cashDifference: -10,
          transactionCount: 5,
          notes: 'Todo bien',
          createdAt: new Date(),
        },
      });
      const closed = await h.prisma.cashSession.findUniqueOrThrow({
        where: { id: s.id },
      });
      const res = await get('/cash-cuts').expect(200);
      expect(res.body.items[0]).toEqual({
        id: cut.id,
        sessionId: s.id,
        userId: anaId,
        userName: 'Ana Cajera',
        registerId: 'CAJA-2',
        cutType: 'total',
        openingAmount: 500,
        totalCashSales: 1200,
        totalCardSales: 300,
        totalTransferSales: 150,
        totalOtherSales: 0,
        totalSales: 1650,
        totalCancelledAmount: 80,
        cancelledCount: 1,
        totalOutflows: 100,
        outflowCount: 1,
        expectedCash: 1600,
        actualCash: 1590,
        cashDifference: -10,
        transactionCount: 5,
        notes: 'Todo bien',
        createdAt: cut.createdAt.toISOString(),
        sessionOpenedAt: s.openedAt.toISOString(),
        sessionClosedAt: closed.closedAt!.toISOString(),
      });
    });

    it('un corte sin efectivo contado trae actualCash y cashDifference en null (C8)', async () => {
      const s = await seedOpenSession(
        h.prisma,
        seed.business.id,
        anaId,
        seed.device.id,
      );
      await seedCut(h.prisma, s.id, anaId);
      const res = await get('/cash-cuts').expect(200);
      expect(res.body.items[0]).toMatchObject({
        actualCash: null,
        cashDifference: null,
      });
    });

    it('pagina: la más reciente primero, con total y tamaño de página', async () => {
      const b = seed.business.id;
      const s = await seedOpenSession(h.prisma, b, anaId, seed.device.id);
      const t0 = Date.now();
      const cortes: { id: string }[] = [];
      for (let i = 0; i < 5; i++)
        cortes.push(
          await seedCut(h.prisma, s.id, anaId, new Date(t0 + i * 1000)),
        );

      const p1 = await get('/cash-cuts?page=1&pageSize=2').expect(200);
      expect(p1.body).toMatchObject({ page: 1, pageSize: 2, total: 5 });
      expect(p1.body.items.map((c: any) => c.id)).toEqual([
        cortes[4].id,
        cortes[3].id,
      ]);
      const p3 = await get('/cash-cuts?page=3&pageSize=2').expect(200);
      expect(p3.body.items.map((c: any) => c.id)).toEqual([cortes[0].id]);
      const p9 = await get('/cash-cuts?page=9&pageSize=2').expect(200);
      expect(p9.body.items).toEqual([]);
    });

    it('valida la paginación: pageSize > 100, página 0 o un parámetro desconocido → 400', async () => {
      await get('/cash-cuts?pageSize=101').expect(400);
      await get('/cash-cuts?page=0').expect(400);
      await get('/cash-cuts?page=abc').expect(400);
      await get('/cash-cuts?userId=x').expect(400);
    });
  });

  describe('GET /inventory-movements (§3.5)', () => {
    it('trae los movimientos del negocio con el nombre del producto de INVENTARIO (el padre) y del usuario', async () => {
      const b = seed.business.id;
      const cerveza = await seedProduct(h.prisma, b, {
        name: 'Cerveza',
        barcode: '750222',
        stock: 48,
      });
      const entryId = randomUUID();
      const mov = await h.prisma.inventoryMovement.create({
        data: {
          id: randomUUID(),
          businessId: b,
          productId: cerveza.id,
          type: 'IN',
          quantity: 24,
          reference: 'PRODUCT_ENTRY',
          referenceId: entryId,
          linkedProductName: 'Six',
          userId: anaId,
          createdAt: new Date(Date.now() + 1000),
        },
      });
      const res = await get(
        '/inventory-movements?reference=PRODUCT_ENTRY',
      ).expect(200);
      expect(res.body).toEqual([
        {
          id: mov.id,
          productId: cerveza.id,
          productName: 'Cerveza',
          productBarcode: '750222',
          userId: anaId,
          userName: 'Ana Cajera',
          type: 'IN',
          reference: 'PRODUCT_ENTRY',
          referenceId: entryId,
          quantity: 24,
          linkedProductName: 'Six',
          createdAt: mov.createdAt.toISOString(),
        },
      ]);
    });

    it('filtra por tipo, referencia y producto, y no ve movimientos de otro negocio', async () => {
      const b = seed.business.id;
      const a = await seedProduct(h.prisma, b, { name: 'A', stock: 10 });
      const c = await seedProduct(h.prisma, b, { name: 'C', stock: 5 });
      await addMovement(h.prisma, b, a.id, 'OUT', 2, 'sale');
      const otro = await h.prisma.business.create({
        data: { name: 'Otra', slug: 'otra' },
      });
      const ajeno = await seedProduct(h.prisma, otro.id, {
        name: 'Ajeno',
        stock: 99,
      });
      await addMovement(h.prisma, otro.id, ajeno.id, 'IN', 1, 'PRODUCT_ENTRY');

      const todos = await get('/inventory-movements').expect(200);
      expect(todos.body).toHaveLength(3);
      expect(
        (await get('/inventory-movements?type=OUT').expect(200)).body,
      ).toHaveLength(1);
      expect(
        (await get('/inventory-movements?reference=INITIAL_STOCK').expect(200))
          .body,
      ).toHaveLength(2);
      expect(
        (await get(`/inventory-movements?productId=${c.id}`).expect(200)).body,
      ).toHaveLength(1);
    });

    it('el límite por omisión es 100 y se puede bajar; el más reciente primero', async () => {
      const b = seed.business.id;
      const p = await seedProduct(h.prisma, b, { name: 'A' });
      const t0 = Date.now();
      await h.prisma.inventoryMovement.createMany({
        data: Array.from({ length: 105 }, (_, i) => ({
          id: randomUUID(),
          businessId: b,
          productId: p.id,
          type: 'IN',
          quantity: i + 1,
          reference: 'PRODUCT_ENTRY',
          createdAt: new Date(t0 + i * 1000),
        })),
      });
      const porOmision = await get('/inventory-movements').expect(200);
      expect(porOmision.body).toHaveLength(100);
      expect(porOmision.body[0].quantity).toBe(105);
      expect(
        (await get('/inventory-movements?limit=3').expect(200)).body,
      ).toHaveLength(3);
    });

    it('valida los filtros: tipo desconocido, límite fuera de rango o producto que no es UUID → 400', async () => {
      await get('/inventory-movements?type=XX').expect(400);
      await get('/inventory-movements?limit=5000').expect(400);
      await get('/inventory-movements?limit=0').expect(400);
      await get('/inventory-movements?productId=no-uuid').expect(400);
    });
  });
});
