import { randomUUID } from 'crypto';
import {
  createHarness,
  Harness,
  login,
  resetDb,
  seedBusiness,
  seedOpenSession,
  seedProduct,
  seedSale,
  seedUser,
  Seed,
  Session,
} from './helpers/harness';

// DEC-002 en modo conectado: tickets del turno con partidas y ganancia, y ganancia del corte congelada al cerrar.
// D1: costo, ganancia y margen solo hacia admin/root_admin; para un cajero ni vienen las claves.
describe('Ganancia en modo conectado (DEC-002)', () => {
  let h: Harness;
  let seed: Seed;
  let admin: Session;
  let adminId: string;
  let sessionId: string;
  let refresco: { id: string };
  let galletas: { id: string };

  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(() => h.close());
  beforeEach(async () => {
    await resetDb(h.prisma);
    seed = await seedBusiness(h.prisma);
    const user = await seedUser(h.prisma, seed.business.id, {
      username: 'dueno',
      role: 'admin',
      name: 'Dueño',
    });
    adminId = user.id;
    admin = await login(h, seed, user);
    sessionId = (
      await seedOpenSession(h.prisma, seed.business.id, adminId, seed.device.id)
    ).id;
    refresco = await seedProduct(h.prisma, seed.business.id, {
      name: 'Refresco',
      purchaseCost: 12,
      salePrice: 20,
    });
    galletas = await seedProduct(h.prisma, seed.business.id, {
      name: 'Galletas',
      purchaseCost: 30,
      salePrice: 50,
    });
  });

  const get = (path: string, auth = admin.bearer) =>
    h.http().get(path).set('Authorization', auth);

  /** Venta con partidas; `total` ya trae restado el descuento, como la caja. */
  async function sell(
    lines: {
      productId: string;
      quantity: number;
      unitPrice: number;
      unitCost: number | null;
    }[],
    discount = 0,
    cancelled = false,
  ) {
    const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    const sale = await seedSale(h.prisma, {
      businessId: seed.business.id,
      userId: adminId,
      deviceId: seed.device.id,
      sessionId,
      total: subtotal - discount,
      cancelled,
    });
    await h.prisma.sale.update({
      where: { id: sale.id },
      data: { discountAmount: discount },
    });
    for (const l of lines) {
      await h.prisma.saleItem.create({
        data: {
          id: randomUUID(),
          saleId: sale.id,
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          subtotal: l.quantity * l.unitPrice,
          unitCost: l.unitCost,
        },
      });
    }
    return sale;
  }

  describe('GET /cash-sessions/:id/sales', () => {
    it('admin: costo y ganancia por ticket, con el descuento ya restado', async () => {
      const sale = await sell(
        [
          { productId: galletas.id, quantity: 2, unitPrice: 50, unitCost: 30 },
          { productId: refresco.id, quantity: 1, unitPrice: 20, unitCost: 12 },
        ],
        15,
      );
      const res = await get(`/cash-sessions/${sessionId}/sales`).expect(200);
      const t = res.body.items[0];
      expect(t).toMatchObject({
        id: sale.id,
        total: 105,
        discountAmount: 15,
        cost: 72,
        profit: 33,
      });
      // Sin orden garantizado: SaleItem no guarda el orden de venta (ids uuid).
      expect(t.items).toHaveLength(2);
      expect(t.items).toEqual(
        expect.arrayContaining([
          {
            productName: 'Galletas',
            quantity: 2,
            unitPrice: 50,
            subtotal: 100,
            tipoVenta: 'UNIDAD',
            unitCost: 30,
            estimated: false,
          },
          {
            productName: 'Refresco',
            quantity: 1,
            unitPrice: 20,
            subtotal: 20,
            tipoVenta: 'UNIDAD',
            unitCost: 12,
            estimated: false,
          },
        ]),
      );
    });

    it('una partida sin costo guardado usa el costo actual y se marca estimada', async () => {
      await sell([
        { productId: refresco.id, quantity: 1, unitPrice: 20, unitCost: null },
      ]);
      const res = await get(`/cash-sessions/${sessionId}/sales`).expect(200);
      expect(res.body.items[0].items[0]).toMatchObject({
        unitCost: 12,
        estimated: true,
      });
      expect(res.body.items[0].profit).toBe(8);
    });

    it('editar el costo del producto después de vender no cambia la ganancia del ticket', async () => {
      await sell([
        { productId: refresco.id, quantity: 1, unitPrice: 20, unitCost: 12 },
      ]);
      await h.prisma.product.update({
        where: { id: refresco.id },
        data: { purchaseCost: 19 },
      });
      const res = await get(`/cash-sessions/${sessionId}/sales`).expect(200);
      expect(res.body.items[0].profit).toBe(8);
    });

    it('pagina con page y pageSize, más reciente primero', async () => {
      for (let i = 0; i < 3; i++)
        await sell([
          { productId: refresco.id, quantity: 1, unitPrice: 20, unitCost: 12 },
        ]);
      const res = await get(
        `/cash-sessions/${sessionId}/sales?page=2&pageSize=2`,
      ).expect(200);
      expect(res.body).toMatchObject({ page: 2, pageSize: 2, total: 3 });
      expect(res.body.items).toHaveLength(1);
    });
  });

  describe('POST /cash-sessions/:id/close-with-cut y GET /cash-cuts', () => {
    const close = (auth = admin.bearer) =>
      h
        .http()
        .post(`/cash-sessions/${sessionId}/close-with-cut`)
        .set('Authorization', auth)
        .send({ id: randomUUID() });

    it('el cierre congela la ganancia y la devuelve al admin como stored', async () => {
      await sell(
        [{ productId: galletas.id, quantity: 2, unitPrice: 50, unitCost: 30 }],
        10,
      ); // 90 − 60
      await sell([
        { productId: refresco.id, quantity: 1, unitPrice: 20, unitCost: 12 },
      ]); //       20 − 12
      const res = await close().expect(201);
      expect(res.body.cut.profit).toEqual({
        totalCost: 72,
        totalProfit: 38,
        margin: 34.5,
        source: 'stored',
      });
      expect(res.body.cut).not.toHaveProperty('totalCost');
      expect(res.body.cut).not.toHaveProperty('totalProfit');

      const row = await h.prisma.cashCut.findUniqueOrThrow({
        where: { id: res.body.cut.id },
      });
      expect([Number(row.totalCost), Number(row.totalProfit)]).toEqual([
        72, 38,
      ]);
    });

    it('la ganancia guardada no cambia si después se cancela una venta del turno', async () => {
      await sell([
        { productId: refresco.id, quantity: 1, unitPrice: 20, unitCost: 12 },
      ]);
      const aCancelar = await sell([
        { productId: galletas.id, quantity: 1, unitPrice: 50, unitCost: 30 },
      ]);
      await close().expect(201);
      await h.prisma.sale.update({
        where: { id: aCancelar.id },
        data: { cancelled: true },
      });

      const cuts = await get('/cash-cuts').expect(200);
      expect(cuts.body.items[0].profit).toMatchObject({
        totalProfit: 28,
        source: 'stored',
      });
    });

    it('un corte sin ganancia guardada se calcula y se marca calculated', async () => {
      await sell([
        { productId: refresco.id, quantity: 1, unitPrice: 20, unitCost: 12 },
      ]);
      const res = await close().expect(201);
      await h.prisma.cashCut.update({
        where: { id: res.body.cut.id },
        data: { totalCost: null, totalProfit: null },
      });

      const cuts = await get('/cash-cuts').expect(200);
      expect(cuts.body.items[0].profit).toMatchObject({
        totalCost: 12,
        totalProfit: 8,
        source: 'calculated',
      });
    });
  });

  describe('D1: un cajero no recibe costo ni ganancia', () => {
    let cajero: Session;
    let cajeroSessionId: string;

    beforeEach(async () => {
      const user = await seedUser(h.prisma, seed.business.id, {
        username: 'cajero',
        name: 'Cajero',
      });
      cajero = await login(h, seed, user);
      cajeroSessionId = (
        await seedOpenSession(
          h.prisma,
          seed.business.id,
          user.id,
          seed.device.id,
        )
      ).id;
      const sale = await seedSale(h.prisma, {
        businessId: seed.business.id,
        userId: user.id,
        deviceId: seed.device.id,
        sessionId: cajeroSessionId,
        total: 20,
      });
      await h.prisma.saleItem.create({
        data: {
          id: randomUUID(),
          saleId: sale.id,
          productId: refresco.id,
          quantity: 1,
          unitPrice: 20,
          subtotal: 20,
          unitCost: 12,
        },
      });
    });

    it('tickets sin unitCost, estimated, cost ni profit', async () => {
      const res = await get(
        `/cash-sessions/${cajeroSessionId}/sales`,
        cajero.bearer,
      ).expect(200);
      const t = res.body.items[0];
      expect(t).not.toHaveProperty('cost');
      expect(t).not.toHaveProperty('profit');
      expect(t.items[0]).not.toHaveProperty('unitCost');
      expect(t.items[0]).not.toHaveProperty('estimated');
    });

    it('corte sin profit, aunque se haya guardado', async () => {
      const res = await h
        .http()
        .post(`/cash-sessions/${cajeroSessionId}/close-with-cut`)
        .set('Authorization', cajero.bearer)
        .send({ id: randomUUID() })
        .expect(201);
      expect(res.body.cut).not.toHaveProperty('profit');
      const row = await h.prisma.cashCut.findUniqueOrThrow({
        where: { id: res.body.cut.id },
      });
      expect(Number(row.totalProfit)).toBe(8); // sí se guarda; solo no se manda

      const cuts = await get('/cash-cuts', cajero.bearer).expect(200);
      expect(cuts.body.items[0]).not.toHaveProperty('profit');
    });
  });
});
