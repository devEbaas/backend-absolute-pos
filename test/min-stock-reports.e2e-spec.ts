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
} from './helpers/harness';

// Fase C: GET /reports/products clasifica con minStock y lo devuelve como número.
describe('Umbral mínimo en reportes (C)', () => {
  let h: Harness;
  let seed: Seed;
  let ana: Session;

  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(() => h.close());
  beforeEach(async () => {
    await resetDb(h.prisma);
    seed = await seedBusiness(h.prisma);
    ana = await login(
      h,
      seed,
      await seedUser(h.prisma, seed.business.id, { role: 'admin' }),
    );
  });

  const report = (query: string) =>
    h.http().get(`/reports/products?${query}`).set('Authorization', ana.bearer);

  it('clasifica con el mínimo del producto y devuelve minStock como número', async () => {
    const b = seed.business.id;
    const atMin = await seedProduct(h.prisma, b, {
      name: 'Doce con mínimo',
      stock: 12,
    });
    await seedProduct(h.prisma, b, {
      name: 'Doce sin mínimo',
      stock: 12,
    });
    await seedProduct(h.prisma, b, {
      name: 'Ocho sin mínimo',
      stock: 8,
    });
    const aboveOwn = await seedProduct(h.prisma, b, {
      name: 'Ocho con mínimo',
      stock: 8,
    });
    await seedProduct(h.prisma, b, {
      name: 'Agotado',
      stock: 0,
    });
    const zeroMin = await seedProduct(h.prisma, b, {
      name: 'Arriba de cero',
      stock: 3,
    });
    const parent = await seedProduct(h.prisma, b, {
      name: 'Padre',
      stock: 20,
    });
    await seedProduct(h.prisma, b, {
      name: 'Six',
      parentProductId: parent.id,
      unitsPerPack: 6,
    });

    await h.prisma.product.update({
      where: { id: atMin.id },
      data: { minStock: 12 },
    });
    await h.prisma.product.update({
      where: { id: aboveOwn.id },
      data: { minStock: 5 },
    });
    await h.prisma.product.update({
      where: { id: zeroMin.id },
      data: { minStock: 0 },
    });

    const res = await report('includeStock=true&limit=50').expect(200);
    const byName = new Map(
      (res.body.data as { name: string }[]).map((row) => [row.name, row]),
    );
    const row = (name: string) =>
      byName.get(name) as {
        name: string;
        stock?: number;
        minStock: number | null;
      };

    expect(row('Doce con mínimo')).toMatchObject({
      stock: 12,
      minStock: 12,
    });
    expect(typeof row('Doce con mínimo').minStock).toBe('number');
    expect(row('Doce sin mínimo')).toMatchObject({
      stock: 12,
      minStock: null,
    });
    expect(row('Ocho sin mínimo')).toMatchObject({ stock: 8, minStock: null });
    expect(row('Ocho con mínimo')).toMatchObject({ stock: 8, minStock: 5 });
    expect(typeof row('Ocho con mínimo').minStock).toBe('number');
    expect(row('Agotado')).toMatchObject({ stock: 0, minStock: null });
    expect(row('Arriba de cero')).toMatchObject({ stock: 3, minStock: 0 });
    expect(typeof row('Arriba de cero').minStock).toBe('number');
    expect(row('Six').minStock).toBeNull();
    expect(row('Six')).not.toHaveProperty('stock');

    expect(res.body.stockSummary).toEqual({ active: 5, low: 2, out: 1 });

    const names = async (status: string) => {
      const filtered = await report(
        `includeStock=true&stockStatus=${status}&limit=50`,
      ).expect(200);
      return (filtered.body.data as { name: string }[])
        .map((item) => item.name)
        .sort();
    };
    expect(await names('low')).toEqual(['Doce con mínimo', 'Ocho sin mínimo']);
    expect(await names('out')).toEqual(['Agotado']);
    expect(await names('active')).toEqual([
      'Arriba de cero',
      'Doce sin mínimo',
      'Ocho con mínimo',
      'Padre',
      'Six',
    ]);

    const plain = await report('limit=50').expect(200);
    const plainByName = new Map(
      (plain.body.data as { name: string; minStock: unknown }[]).map((item) => [
        item.name,
        item.minStock,
      ]),
    );
    expect(plainByName.get('Doce con mínimo')).toBe(12);
    expect(typeof plainByName.get('Doce con mínimo')).toBe('number');
    expect(plainByName.get('Doce sin mínimo')).toBeNull();
    expect(plain.body).not.toHaveProperty('stockSummary');
  });

  it('PRECIO_LIBRE y SERVICIO no traen stock ni cuentan como bajos o agotados', async () => {
    const b = seed.business.id;
    await seedProduct(h.prisma, b, {
      name: 'Varios',
      tipoVenta: 'PRECIO_LIBRE',
    });
    await seedProduct(h.prisma, b, { name: 'Corte', tipoVenta: 'SERVICIO' });
    // Movimientos de cuando era otro tipo: siguen sin contar.
    await seedProduct(h.prisma, b, {
      name: 'Antes unidad',
      tipoVenta: 'SERVICIO',
      stock: 4,
    });
    await seedProduct(h.prisma, b, { name: 'Agotado', stock: 0 });

    const res = await report('includeStock=true&limit=50').expect(200);
    const byName = new Map(
      (res.body.data as { name: string }[]).map((row) => [row.name, row]),
    );
    for (const name of ['Varios', 'Corte', 'Antes unidad']) {
      expect(byName.get(name)).not.toHaveProperty('stock');
    }
    expect(res.body.stockSummary).toEqual({ active: 3, low: 0, out: 1 });

    const out = await report('includeStock=true&stockStatus=out').expect(200);
    expect((out.body.data as { name: string }[]).map((p) => p.name)).toEqual([
      'Agotado',
    ]);
  });
});
