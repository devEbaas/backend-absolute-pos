import { randomUUID } from 'crypto';
import {
  addMovement,
  createHarness,
  Harness,
  login,
  resetDb,
  seedBusiness,
  seedDevice,
  seedOpenSession,
  seedProduct,
  seedUser,
  Seed,
  Session,
  stockOf,
} from './helpers/harness';

// specs/22 §4.1 — `POST /sales` (B1 + M1): plan de stock en el servidor, idempotencia y errores de negocio.
// Vectores K1–K8 (y T11–T14, T16, T18 de specs/01 §14 por REST).
describe('POST /sales (specs/22 §4.1)', () => {
  let h: Harness;
  let seed: Seed;
  let ana: Session;
  let anaId: string;
  let sessionId: string;
  let cerveza: { id: string };
  let six: { id: string };
  let agua: { id: string };

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
    sessionId = (
      await seedOpenSession(h.prisma, seed.business.id, anaId, seed.device.id)
    ).id;
    const b = seed.business.id;
    cerveza = await seedProduct(h.prisma, b, {
      name: 'Cerveza',
      stock: 48,
      salePrice: 20,
    });
    six = await seedProduct(h.prisma, b, {
      name: 'Six Cerveza',
      parentProductId: cerveza.id,
      unitsPerPack: 6,
      salePrice: 90,
    });
    agua = await seedProduct(h.prisma, b, {
      name: 'Agua',
      stock: 10,
      salePrice: 15,
    });
  });

  const line = (
    productId: string,
    quantity: number,
    unitPrice: number,
    extra: object = {},
  ) => ({
    id: randomUUID(),
    productId,
    quantity,
    unitPrice,
    ...extra,
  });
  const sale = (items: ReturnType<typeof line>[], extra: object = {}) => ({
    id: randomUUID(),
    sessionId,
    paymentMethod: 'efectivo',
    items,
    ...extra,
  });
  const post = (body: object, auth = ana.bearer) =>
    h.http().post('/sales').set('Authorization', auth).send(body);
  const counts = async () => ({
    sales: await h.prisma.sale.count(),
    items: await h.prisma.saleItem.count(),
    movements: await h.prisma.inventoryMovement.count(),
  });

  // Fase 5: `registerId` ya no viene del cliente; la venta lleva el nombre del dispositivo con el que se abrió su caja.
  describe('registerId (nombre del dispositivo)', () => {
    it('la venta guarda y devuelve el registerId de su sesión (el nombre del dispositivo)', async () => {
      const body = sale([line(agua.id, 1, 15)]);
      const res = await post(body).expect(201);
      expect(res.body.registerId).toBe('CAJA-2');
      const row = await h.prisma.sale.findUniqueOrThrow({
        where: { id: body.id },
      });
      expect(row.registerId).toBe('CAJA-2');
    });

    it('el reintento devuelve el mismo registerId', async () => {
      const body = sale([line(agua.id, 1, 15)]);
      await post(body).expect(201);
      expect((await post(body).expect(201)).body.registerId).toBe('CAJA-2');
    });

    it('sigue al de la sesión aunque el dispositivo se renombre después (corte e historial coherentes)', async () => {
      await h.prisma.device.update({
        where: { id: seed.device.id },
        data: { label: 'MOSTRADOR' },
      });
      const res = await post(sale([line(agua.id, 1, 15)])).expect(201);
      expect(res.body.registerId).toBe('CAJA-2');
    });

    it('registerId en el cuerpo → 400 y no se escribe nada', async () => {
      const res = await post(
        sale([line(agua.id, 1, 15)], { registerId: 'PRINCIPAL' }),
      ).expect(400);
      expect(JSON.stringify(res.body)).toContain('registerId');
      // Los 2 movimientos son las existencias iniciales sembradas (cerveza y agua).
      expect(await counts()).toEqual({ sales: 0, items: 0, movements: 2 });
    });
  });

  describe('plan de stock', () => {
    it('K1 / T12: vender 2 "Six" descuenta 12 del PADRE con un solo movimiento OUT', async () => {
      const body = sale([line(six.id, 2, 45)]);
      const res = await post(body).expect(201);

      expect(res.body).toMatchObject({
        id: body.id,
        sessionId,
        paymentMethod: 'efectivo',
        total: 90,
        discountAmount: 0,
        cancelled: false,
      });
      expect(res.body.items).toEqual([
        {
          id: body.items[0].id,
          productId: six.id,
          productName: 'Six Cerveza',
          quantity: 2,
          unitPrice: 45,
          subtotal: 90,
          linkedProductName: 'Six Cerveza',
        },
      ]);

      const outs = await h.prisma.inventoryMovement.findMany({
        where: { reference: 'sale' },
      });
      expect(outs).toHaveLength(1);
      expect(outs[0]).toMatchObject({
        productId: cerveza.id,
        type: 'OUT',
        linkedProductName: 'Six Cerveza',
        referenceId: body.id,
        userId: anaId,
      });
      expect(Number(outs[0].quantity)).toBe(12);
      expect(await stockOf(h.prisma, cerveza.id)).toBe(36);

      const catalog = await h
        .http()
        .get('/products/with-stock')
        .set('Authorization', ana.bearer)
        .expect(200);
      const byName = Object.fromEntries(
        (catalog.body as any[]).map((p) => [p.name, p]),
      );
      expect(byName['Cerveza'].stock).toBe(36);
      expect(byName['Six Cerveza'].effectiveStock).toBe(6);
    });

    it('un producto raíz descuenta su propio stock y no deja "linkedProductName"', async () => {
      const res = await post(sale([line(agua.id, 3, 15)])).expect(201);
      expect(res.body.items[0].linkedProductName).toBeNull();
      expect(await stockOf(h.prisma, agua.id)).toBe(7);
    });

    it('rechaza `subtotal` y `linkedProductName`: los deriva el servidor, el cliente no los manda', async () => {
      for (const extra of [{ subtotal: 45 }, { linkedProductName: 'Six' }]) {
        await post(sale([line(six.id, 1, 45, extra)])).expect(400);
      }
      expect(await h.prisma.sale.count()).toBe(0);
    });

    it('K2 / T13: stock insuficiente → 409 INSUFFICIENT_STOCK con el texto exacto y NADA se guarda', async () => {
      await h.prisma.inventoryMovement.deleteMany({
        where: { productId: cerveza.id },
      });
      await addMovement(h.prisma, seed.business.id, cerveza.id, 'IN', 5);
      const before = await counts();

      const res = await post(sale([line(six.id, 1, 45)])).expect(409);
      expect(res.body).toMatchObject({
        statusCode: 409,
        code: 'INSUFFICIENT_STOCK',
        message:
          'Stock insuficiente para Cerveza. Disponible: 5 piezas, Necesario: 6 piezas',
        productId: cerveza.id,
        available: 5,
      });
      expect(await counts()).toEqual(before);
    });

    it('la unidad del mensaje sale del producto de INVENTARIO: kg para PESO, m para METRO', async () => {
      const peso = await seedProduct(h.prisma, seed.business.id, {
        name: 'Queso',
        tipoVenta: 'PESO',
        stock: 1.5,
      });
      const metro = await seedProduct(h.prisma, seed.business.id, {
        name: 'Cable',
        tipoVenta: 'METRO',
        stock: 2,
      });
      expect(
        (await post(sale([line(peso.id, 2, 100)])).expect(409)).body.message,
      ).toBe(
        'Stock insuficiente para Queso. Disponible: 1.5 kg, Necesario: 2 kg',
      );
      expect(
        (await post(sale([line(metro.id, 3, 10)])).expect(409)).body.message,
      ).toBe('Stock insuficiente para Cable. Disponible: 2 m, Necesario: 3 m');
    });

    it('K3 / T14: dos líneas PESO del mismo producto son 2 líneas y 2 movimientos, y el stock se valida ACUMULADO', async () => {
      const queso = await seedProduct(h.prisma, seed.business.id, {
        name: 'Queso',
        tipoVenta: 'PESO',
        stock: 2,
      });
      const res = await post(
        sale([line(queso.id, 0.5, 100), line(queso.id, 1.2, 100)]),
      ).expect(201);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items.map((i: any) => i.subtotal)).toEqual([50, 120]);
      const outs = await h.prisma.inventoryMovement.findMany({
        where: { productId: queso.id, type: 'OUT' },
      });
      expect(outs.map((m) => Number(m.quantity)).sort()).toEqual([0.5, 1.2]);
      expect(await stockOf(h.prisma, queso.id)).toBeCloseTo(0.3, 6);

      // Con 1.5 de existencia, 0.5 + 1.2 = 1.7 no alcanza: la SEGUNDA línea falla viendo lo que queda (1.0) y nada se guarda.
      await resetDb(h.prisma);
      seed = await seedBusiness(h.prisma);
      const user = await seedUser(h.prisma, seed.business.id);
      ana = await login(h, seed, user);
      sessionId = (
        await seedOpenSession(
          h.prisma,
          seed.business.id,
          user.id,
          seed.device.id,
        )
      ).id;
      const q2 = await seedProduct(h.prisma, seed.business.id, {
        name: 'Queso',
        tipoVenta: 'PESO',
        stock: 1.5,
      });
      const before = await counts();
      const fail = await post(
        sale([line(q2.id, 0.5, 100), line(q2.id, 1.2, 100)]),
      ).expect(409);
      expect(fail.body.message).toBe(
        'Stock insuficiente para Queso. Disponible: 1 kg, Necesario: 1.2 kg',
      );
      expect(await counts()).toEqual(before);
    });

    it('atomicidad: si la SEGUNDA línea falla, la primera tampoco se guarda (ni su movimiento)', async () => {
      const before = await counts();
      await post(sale([line(agua.id, 1, 15), line(six.id, 9, 45)])).expect(409); // 9 Six = 54 > 48
      expect(await counts()).toEqual(before);
      expect(await stockOf(h.prisma, agua.id)).toBe(10);
    });

    it('la existencia justa alcanza (no se exige "de sobra")', async () => {
      await post(sale([line(agua.id, 10, 15)])).expect(201);
      expect(await stockOf(h.prisma, agua.id)).toBe(0);
      await post(sale([line(agua.id, 1, 15)])).expect(409);
    });

    it('K4 / T11 / T18: PRECIO_LIBRE y SERVICIO no descuentan, no generan movimiento y su subtotal lo calcula el servidor', async () => {
      const varios = await seedProduct(h.prisma, seed.business.id, {
        name: 'Varios',
        tipoVenta: 'PRECIO_LIBRE',
      });
      const corte = await seedProduct(h.prisma, seed.business.id, {
        name: 'Corte',
        tipoVenta: 'SERVICIO',
      });
      const before = await h.prisma.inventoryMovement.count();
      const res = await post(
        sale([line(varios.id, 3, 35), line(corte.id, 1, 150)]),
      ).expect(201);
      // PRECIO_LIBRE: el precio ES el subtotal (no × cantidad): 3 × 35 no da 105.
      expect(res.body.items.map((i: any) => i.subtotal)).toEqual([35, 150]);
      expect(res.body.total).toBe(185);
      expect(await h.prisma.inventoryMovement.count()).toBe(before);
    });

    it('la venta y sus filas quedan en sync_log para que el escritorio las baje', async () => {
      const res = await post(sale([line(six.id, 1, 45)])).expect(201);
      const log = await h.prisma.syncLogEntry.findMany({
        where: { businessId: seed.business.id },
      });
      const tables = log.map((l) => l.tableName).sort();
      expect(tables).toEqual(['inventoryMovements', 'saleItems', 'sales']);
      expect(log.find((l) => l.tableName === 'sales')!.rowId).toBe(res.body.id);
    });
  });

  describe('total, descuento y pago', () => {
    it('total = Σ subtotales recalculados − descuento', async () => {
      const res = await post(
        sale([line(agua.id, 2, 15), line(six.id, 1, 45)], {
          discountAmount: 10,
        }),
      ).expect(201);
      expect(res.body).toMatchObject({ total: 65, discountAmount: 10 });
      const row = await h.prisma.sale.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(Number(row.total)).toBe(65);
      expect(Number(row.discountAmount)).toBe(10);
    });

    it('un descuento mayor al subtotal → 400 y nada se guarda', async () => {
      const before = await counts();
      const res = await post(
        sale([line(agua.id, 1, 15)], { discountAmount: 20 }),
      ).expect(400);
      expect(res.body.message).toBe(
        'El descuento no puede ser mayor al subtotal',
      );
      expect(await counts()).toEqual(before);
    });

    it('un descuento igual al subtotal deja el total en 0', async () => {
      const res = await post(
        sale([line(agua.id, 1, 15)], { discountAmount: 15 }),
      ).expect(201);
      expect(res.body.total).toBe(0);
    });

    it('K5 / T16 / M1: conserva lo recibido y el cambio', async () => {
      const res = await post(
        sale([line(agua.id, 1, 87.5)], {
          paymentAmount: 100,
          changeAmount: 12.5,
        }),
      ).expect(201);
      expect(res.body).toMatchObject({
        total: 87.5,
        paymentAmount: 100,
        changeAmount: 12.5,
      });
      const row = await h.prisma.sale.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(Number(row.paymentAmount)).toBe(100);
      expect(Number(row.changeAmount)).toBe(12.5);
      expect(row.deviceId).toBe(seed.device.id);
      expect(row.userId).toBe(anaId);
    });

    it('sin lo recibido ni el cambio, quedan en null', async () => {
      const res = await post(sale([line(agua.id, 1, 15)])).expect(201);
      expect(res.body).toMatchObject({
        paymentAmount: null,
        changeAmount: null,
      });
    });

    it('redondea a 2 decimales', async () => {
      const res = await post(sale([line(agua.id, 3, 3.335)])).expect(201);
      expect(res.body.items[0].subtotal).toBe(10.01);
      expect(res.body.total).toBe(10.01);
    });

    it('acepta solo efectivo, tarjeta y transferencia', async () => {
      for (const paymentMethod of ['efectivo', 'tarjeta', 'transferencia']) {
        await post(sale([line(agua.id, 1, 1)], { paymentMethod })).expect(201);
      }
      // Ni los nombres en inglés, ni crédito (no existe en la nube), ni mayúsculas, ni vacío.
      for (const paymentMethod of [
        'cash',
        'card',
        'transfer',
        'credit',
        'vale',
        'Efectivo',
        '',
      ]) {
        await post(sale([line(agua.id, 1, 1)], { paymentMethod })).expect(400);
      }
    });
  });

  describe('idempotencia', () => {
    it('K6: repetir la petición con el mismo id devuelve la misma venta, sin duplicar ni descontar dos veces', async () => {
      const body = sale([line(six.id, 2, 45)], {
        paymentAmount: 100,
        changeAmount: 10,
      });
      const first = await post(body).expect(201);
      const again = await post(body).expect(201);

      expect(again.body).toEqual(first.body);
      expect(await h.prisma.sale.count()).toBe(1);
      expect(await h.prisma.saleItem.count()).toBe(1);
      expect(
        await h.prisma.inventoryMovement.count({
          where: { reference: 'sale' },
        }),
      ).toBe(1);
      expect(await stockOf(h.prisma, cerveza.id)).toBe(36);
    });

    it('un reintento no vuelve a validar el stock (aunque ya no alcance)', async () => {
      const body = sale([line(agua.id, 10, 15)]);
      await post(body).expect(201);
      await post(body).expect(201); // el stock ahora es 0, pero es la MISMA venta
      expect(await stockOf(h.prisma, agua.id)).toBe(0);
    });

    it('dos peticiones SIMULTÁNEAS con el mismo id: una venta, las dos responden bien', async () => {
      const body = sale([line(agua.id, 2, 15)]);
      const [a, b] = await Promise.all([post(body), post(body)]);
      expect([a.status, b.status]).toEqual([201, 201]);
      expect(a.body.id).toBe(b.body.id);
      expect(await h.prisma.sale.count()).toBe(1);
      expect(await stockOf(h.prisma, agua.id)).toBe(8);
    });

    it('K7: el id de una venta de OTRO usuario → 409 ID_IN_USE', async () => {
      const bob = await seedUser(h.prisma, seed.business.id, {
        username: 'bob',
        name: 'Bob',
      });
      const bobSession = await login(h, seed, bob);
      const bobSessionRow = await seedOpenSession(
        h.prisma,
        seed.business.id,
        bob.id,
        seed.device.id,
      );
      const body = sale([line(agua.id, 1, 15)], {
        sessionId: bobSessionRow.id,
      });
      await post(body, bobSession.bearer).expect(201);

      const res = await post({ ...body, sessionId }).expect(409);
      expect(res.body).toMatchObject({
        code: 'ID_IN_USE',
        message: 'El identificador ya está en uso',
      });
      expect(await h.prisma.sale.count()).toBe(1);
    });

    it('K7: el id de una venta de OTRO negocio → 409 ID_IN_USE', async () => {
      const otro = await h.prisma.business.create({
        data: { name: 'Otra', slug: 'otra' },
      });
      const u = await seedUser(h.prisma, otro.id, { username: 'zoe' });
      const dev = await seedDevice(h.prisma, otro.id, 'CAJA-9');
      const foreign = await h.prisma.sale.create({
        data: {
          id: randomUUID(),
          businessId: otro.id,
          userId: u.id,
          deviceId: dev.device.id,
          total: 5,
          paymentMethod: 'efectivo',
          createdAt: new Date(),
        },
      });
      const res = await post(
        sale([line(agua.id, 1, 15)], { id: foreign.id }),
      ).expect(409);
      expect(res.body.code).toBe('ID_IN_USE');
    });

    it('los ids de la venta, de la sesión y de cada línea son OBLIGATORIOS (la idempotencia no es opcional)', async () => {
      const base = sale([line(agua.id, 1, 15)]);
      await post({ ...base, id: undefined }).expect(400);
      await post({ ...base, sessionId: undefined }).expect(400);
      await post({ ...base, sessionId: null }).expect(400);
      await post({
        ...base,
        items: [{ productId: agua.id, quantity: 1, unitPrice: 15 }],
      }).expect(400);
      expect(await h.prisma.sale.count()).toBe(0);
    });

    it('dos líneas de la misma venta con el mismo id → 400 y nada se guarda', async () => {
      const dup = randomUUID();
      const before = await counts();
      const res = await post(
        sale([
          line(agua.id, 1, 15, { id: dup }),
          line(agua.id, 1, 15, { id: dup }),
        ]),
      ).expect(400);
      expect(res.body.message).toBe(
        'Los identificadores de las líneas deben ser únicos',
      );
      expect(await counts()).toEqual(before);
    });

    it('el id de una línea que ya existe en OTRA venta → 409 ID_IN_USE, sin 500 y sin descontar nada', async () => {
      const first = sale([line(agua.id, 1, 15)]);
      await post(first).expect(201);
      const before = await counts();
      const res = await post(
        sale([line(agua.id, 2, 15, { id: first.items[0].id })]),
      ).expect(409);
      expect(res.body.code).toBe('ID_IN_USE');
      expect(await counts()).toEqual(before);
      expect(await stockOf(h.prisma, agua.id)).toBe(9);
    });
  });

  describe('sesión de caja', () => {
    it('K8: una sesión cerrada → 409 SESSION_CLOSED', async () => {
      await h.prisma.cashSession.update({
        where: { id: sessionId },
        data: { status: 'closed', closedAt: new Date() },
      });
      const before = await counts();
      const res = await post(sale([line(agua.id, 1, 15)])).expect(409);
      expect(res.body).toMatchObject({
        code: 'SESSION_CLOSED',
        message: 'La sesión ya está cerrada',
      });
      expect(await counts()).toEqual(before);
    });

    it('K8: una sesión de otro usuario, de otro dispositivo, del escritorio o inexistente → 404 "Sesión no encontrada"', async () => {
      const b = seed.business.id;
      const bob = await seedUser(h.prisma, b, { username: 'bob' });
      const otra = await seedDevice(h.prisma, b, 'CAJA-3');
      const ajenas = [
        (await seedOpenSession(h.prisma, b, bob.id, seed.device.id)).id,
        (await seedOpenSession(h.prisma, b, anaId, otra.device.id)).id,
        (await seedOpenSession(h.prisma, b, anaId, null)).id,
        randomUUID(),
      ];
      for (const sid of ajenas) {
        const res = await post(
          sale([line(agua.id, 1, 15)], { sessionId: sid }),
        ).expect(404);
        expect(res.body.message).toBe('Sesión no encontrada');
      }
      expect(await h.prisma.sale.count()).toBe(0);
    });

    it('la venta queda ligada a la sesión, y se suma al resumen del turno', async () => {
      await post(sale([line(agua.id, 2, 15)])).expect(201);
      await post(
        sale([line(agua.id, 1, 15)], { paymentMethod: 'tarjeta' }),
      ).expect(201);
      const summary = await h
        .http()
        .get(`/cash-sessions/${sessionId}/summary`)
        .set('Authorization', ana.bearer)
        .expect(200);
      expect(summary.body).toMatchObject({
        totalCashSales: 30,
        totalCardSales: 15,
        totalSales: 45,
        transactionCount: 2,
        expectedCash: 530,
      });
    });
  });

  describe('productos', () => {
    it('un producto inexistente → 404 con el mensaje del desktop y nada se guarda', async () => {
      const ghost = randomUUID();
      const before = await counts();
      const res = await post(
        sale([line(agua.id, 1, 15), line(ghost, 1, 5)]),
      ).expect(404);
      expect(res.body.message).toBe(`Producto con ID ${ghost} no encontrado`);
      expect(await counts()).toEqual(before);
    });

    it('un producto de OTRO negocio no se puede vender', async () => {
      const otro = await h.prisma.business.create({
        data: { name: 'Otra', slug: 'otra' },
      });
      const ajeno = await seedProduct(h.prisma, otro.id, {
        name: 'Ajeno',
        stock: 9,
      });
      const res = await post(sale([line(ajeno.id, 1, 5)])).expect(404);
      expect(res.body.message).toBe(
        `Producto con ID ${ajeno.id} no encontrado`,
      );
      expect(await stockOf(h.prisma, ajeno.id)).toBe(9);
    });
  });

  describe('concurrencia (bloqueo de fila)', () => {
    it('dos cajas vendiendo la ÚLTIMA unidad a la vez: solo una la vende', async () => {
      const ultima = await seedProduct(h.prisma, seed.business.id, {
        name: 'Última',
        stock: 1,
      });
      const results = await Promise.all([
        post(sale([line(ultima.id, 1, 10)])),
        post(sale([line(ultima.id, 1, 10)])),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(results.find((r) => r.status === 409)!.body.code).toBe(
        'INSUFFICIENT_STOCK',
      );
      expect(await stockOf(h.prisma, ultima.id)).toBe(0);
      expect(await h.prisma.sale.count()).toBe(1);
    });

    it('cinco ventas simultáneas con existencia para tres: exactamente tres se completan y el stock nunca es negativo', async () => {
      const p = await seedProduct(h.prisma, seed.business.id, {
        name: 'Escaso',
        stock: 3,
      });
      const results = await Promise.all(
        Array.from({ length: 5 }, () => post(sale([line(p.id, 1, 10)]))),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(3);
      expect(results.filter((r) => r.status === 409)).toHaveLength(2);
      expect(await stockOf(h.prisma, p.id)).toBe(0);
    });

    it('ventas simultáneas de PRESENTACIONES del mismo padre comparten el bloqueo del padre', async () => {
      // 48 en el padre = 8 "Six"; 10 ventas de 1 Six: solo 8 caben.
      const results = await Promise.all(
        Array.from({ length: 10 }, () => post(sale([line(six.id, 1, 45)]))),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(8);
      expect(await stockOf(h.prisma, cerveza.id)).toBe(0);
    });
  });

  describe('validación de la petición', () => {
    it.each([
      ['sin líneas', { items: [] }],
      [
        'cantidad 0',
        { items: [{ productId: randomUUID(), quantity: 0, unitPrice: 1 }] },
      ],
      [
        'cantidad negativa',
        { items: [{ productId: randomUUID(), quantity: -1, unitPrice: 1 }] },
      ],
      [
        'precio negativo',
        { items: [{ productId: randomUUID(), quantity: 1, unitPrice: -1 }] },
      ],
      [
        'productId que no es UUID',
        { items: [{ productId: 'abc', quantity: 1, unitPrice: 1 }] },
      ],
      ['id de venta que no es UUID', { id: 'abc' }],
      ['descuento negativo', { discountAmount: -1 }],
      ['un campo desconocido', { total: 100 }],
      [
        'un campo desconocido en una línea',
        {
          items: [
            { productId: randomUUID(), quantity: 1, unitPrice: 1, extra: 1 },
          ],
        },
      ],
    ])('%s → 400', async (_name, override) => {
      const base = sale([line(agua.id, 1, 15)]);
      await post({ ...base, ...override }).expect(400);
      expect(await h.prisma.sale.count()).toBe(0);
    });

    it('sin token → 401; con la clave del dispositivo → 401', async () => {
      await h
        .http()
        .post('/sales')
        .send(sale([line(agua.id, 1, 15)]))
        .expect(401);
      await post(
        sale([line(agua.id, 1, 15)]),
        `Bearer ${seed.deviceKey}`,
      ).expect(401);
    });
  });
});
