import { randomUUID } from 'crypto';
import {
  createHarness,
  Harness,
  login,
  resetDb,
  seedBusiness,
  seedUser,
  Seed,
  Session,
} from './helpers/harness';

// Fase B1: el DTO de sync y PATCH aceptan `minStock` sin borrar cuando falta la clave,
// y la lectura (`toPullDto`, `with-stock`) lo devuelve como número.
describe('Umbral mínimo por producto (B1)', () => {
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
    ana = await login(h, seed, await seedUser(h.prisma, seed.business.id));
  });

  const post = (body: object) =>
    h.http().post('/products').set('Authorization', ana.bearer).send(body);
  const patch = (id: string, body: object) =>
    h
      .http()
      .patch(`/products/${id}`)
      .set('Authorization', ana.bearer)
      .send(body);
  const create = (extra: object = {}) =>
    post({
      id: randomUUID(),
      name: 'Cerveza',
      salePrice: 20,
      purchaseCost: 12,
      ...extra,
    });
  const storedMin = async (id: string) => {
    const row = await h.prisma.product.findUniqueOrThrow({ where: { id } });
    return row.minStock == null ? null : Number(row.minStock);
  };

  let tick = 0;
  const productPush = (extra: object = {}) => {
    tick += 1;
    const at = new Date(Date.UTC(2026, 9, 11, 12, 0, tick)).toISOString();
    return {
      uuid: randomUUID(),
      name: 'Cerveza',
      salePrice: 20,
      purchaseCost: 12,
      tipoVenta: 'UNIDAD',
      active: true,
      unitsPerPack: 1,
      createdAt: at,
      updatedAt: at,
      ...extra,
    };
  };
  const push = (products: object[]) =>
    h
      .http()
      .post('/sync/push')
      .set('Authorization', `Bearer ${seed.deviceKey}`)
      .send({ products });

  describe('DTO de sync', () => {
    it('un push sin minStock se acepta y no borra el valor guardado', async () => {
      const uuid = randomUUID();
      const first = productPush({ uuid, minStock: 4, name: 'Cerveza' });
      const created = await push([first]).expect(201);
      expect(created.body.accepted.products).toEqual([uuid]);
      expect(await storedMin(uuid)).toBe(4);

      const again = productPush({
        uuid,
        name: 'Cerveza oscura',
        createdAt: first.createdAt,
      });
      expect(again).not.toHaveProperty('minStock');
      const updated = await push([again]).expect(201);
      expect(updated.body.accepted.products).toEqual([uuid]);
      expect(updated.body.rejected.products).toEqual([]);
      expect(await storedMin(uuid)).toBe(4);
      expect(
        (await h.prisma.product.findUniqueOrThrow({ where: { id: uuid } }))
          .name,
      ).toBe('Cerveza oscura');
    });

    it('minStock 4 se guarda y minStock null lo borra', async () => {
      const uuid = randomUUID();
      const first = productPush({ uuid, minStock: 4 });
      await push([first]).expect(201);
      expect(await storedMin(uuid)).toBe(4);

      await push([
        productPush({
          uuid,
          minStock: null,
          createdAt: first.createdAt,
        }),
      ]).expect(201);
      expect(await storedMin(uuid)).toBe(null);
    });

    it('un campo desconocido sigue en 400 (forbidNonWhitelisted) y no escribe', async () => {
      const item = productPush({ departmentId: 3 });
      await push([item]).expect(400);
      expect(await h.prisma.product.count()).toBe(0);
    });

    it('una presentación guarda null aunque el push traiga 4', async () => {
      const parent = productPush({ minStock: 8, name: 'Padre' });
      await push([parent]).expect(201);
      const child = productPush({
        name: 'Six',
        parentProductUuid: parent.uuid,
        unitsPerPack: 6,
        minStock: 4,
      });
      await push([child]).expect(201);
      expect(await storedMin(child.uuid)).toBe(null);
      expect(await storedMin(parent.uuid)).toBe(8);
    });

    it('PRECIO_LIBRE y SERVICIO guardan null aunque el push traiga un número', async () => {
      const libre = productPush({ tipoVenta: 'PRECIO_LIBRE', minStock: 4 });
      const servicio = productPush({ tipoVenta: 'SERVICIO', minStock: 4 });
      await push([libre, servicio]).expect(201);
      expect(await storedMin(libre.uuid)).toBe(null);
      expect(await storedMin(servicio.uuid)).toBe(null);
    });

    it('un minStock negativo rechaza solo esa fila; el resto del batch entra', async () => {
      const bad = productPush({ minStock: -1 });
      const good = productPush({ minStock: 3 });
      const res = await push([bad, good]).expect(201);
      expect(res.body.accepted.products).toEqual([good.uuid]);
      expect(res.body.rejected.products).toEqual([
        { uuid: bad.uuid, reason: 'El mínimo debe ser mayor o igual a 0' },
      ]);
      expect(await storedMin(good.uuid)).toBe(3);
    });

    it('un decimal (peso) viaja y vuelve como número', async () => {
      const item = productPush({ tipoVenta: 'PESO', minStock: 0.5 });
      await push([item]).expect(201);
      expect(await storedMin(item.uuid)).toBe(0.5);
    });

    it('un minStock string responde 400 (IsNumber) y no escribe', async () => {
      await push([productPush({ minStock: '4' })]).expect(400);
      expect(await h.prisma.product.count()).toBe(0);
    });
  });

  describe('PATCH /products/:id', () => {
    it('sin minStock conserva; con null borra; con -1 responde 400', async () => {
      const id = (await create({ minStock: 4 }).expect(201)).body.id;
      expect(await storedMin(id)).toBe(4);

      const kept = await patch(id, { name: 'Otra' }).expect(200);
      expect(kept.body.minStock).toBe(4);
      expect(typeof kept.body.minStock).toBe('number');
      expect(await storedMin(id)).toBe(4);

      const cleared = await patch(id, { minStock: null }).expect(200);
      expect(cleared.body.minStock).toBeNull();
      expect(await storedMin(id)).toBe(null);

      await patch(id, { minStock: 4 }).expect(200);
      await patch(id, { minStock: -1 }).expect(400);
      expect(await storedMin(id)).toBe(4);
    });

    it('en una presentación guarda null aunque llegue 4', async () => {
      const padre = (await create({ minStock: 8 }).expect(201)).body;
      const six = (
        await create({
          name: 'Six',
          parentProductId: padre.id,
          unitsPerPack: 6,
          salePrice: 110,
          purchaseCost: 70,
          minStock: 4,
        }).expect(201)
      ).body;
      expect(six.minStock).toBeNull();
      expect(await storedMin(six.id)).toBe(null);

      const res = await patch(six.id, { minStock: 4 }).expect(200);
      expect(res.body.minStock).toBeNull();
      expect(await storedMin(six.id)).toBe(null);
    });

    it('un PATCH con solo tipoVenta PRECIO_LIBRE (sin minStock) deja el mínimo en null', async () => {
      const id = (await create({ minStock: 4 }).expect(201)).body.id;
      const res = await patch(id, { tipoVenta: 'PRECIO_LIBRE' }).expect(200);
      expect(res.body).toMatchObject({
        tipoVenta: 'PRECIO_LIBRE',
        minStock: null,
      });
      expect(await storedMin(id)).toBe(null);
    });

    it('un PATCH que vuelve presentación a un raíz (sin minStock) deja el mínimo en null', async () => {
      const padre = (await create({ name: 'Padre' }).expect(201)).body;
      const id = (await create({ name: 'Six', minStock: 4 }).expect(201)).body
        .id;
      const res = await patch(id, {
        parentProductId: padre.id,
        unitsPerPack: 6,
      }).expect(200);
      expect(res.body.minStock).toBeNull();
      expect(await storedMin(id)).toBe(null);
    });

    it('con minStock 0 guarda 0, no null', async () => {
      const id = (await create({ minStock: 0 }).expect(201)).body.id;
      expect(await storedMin(id)).toBe(0);
      const res = await patch(id, { name: 'Otra' }).expect(200);
      expect(res.body.minStock).toBe(0);
    });

    it('POST con minStock -1 responde 400 y no crea el producto', async () => {
      await create({ minStock: -1 }).expect(400);
      expect(await h.prisma.product.count()).toBe(0);
    });
  });

  describe('toPullDto / with-stock', () => {
    it('minStock sale como número y una presentación trae parentMinStock del padre', async () => {
      const padre = (await create({ name: 'Padre', minStock: 8 }).expect(201))
        .body;
      expect(padre.minStock).toBe(8);
      expect(typeof padre.minStock).toBe('number');
      expect(padre.parentMinStock).toBeNull();

      const six = (
        await create({
          name: 'Six',
          parentProductId: padre.id,
          unitsPerPack: 6,
          salePrice: 110,
          purchaseCost: 70,
        }).expect(201)
      ).body;

      const catalog = await h
        .http()
        .get('/products/with-stock')
        .set('Authorization', ana.bearer)
        .expect(200);
      const byName = Object.fromEntries(
        (
          catalog.body as {
            name: string;
            minStock: number | null;
            parentMinStock: number | null;
          }[]
        ).map((p) => [p.name, p]),
      );
      expect(byName['Padre'].minStock).toBe(8);
      expect(typeof byName['Padre'].minStock).toBe('number');
      expect(byName['Padre'].parentMinStock).toBeNull();
      expect(byName['Six'].minStock).toBeNull();
      expect(byName['Six'].parentMinStock).toBe(8);
      expect(typeof byName['Six'].parentMinStock).toBe('number');
      expect(six.parentMinStock).toBe(8);

      const pull = await h
        .http()
        .get('/sync/pull')
        .query({ since: '0', tables: 'products' })
        .set('Authorization', `Bearer ${seed.deviceKey}`)
        .expect(200);
      const pulled = Object.fromEntries(
        (pull.body.products as { uuid: string; minStock: unknown }[]).map(
          (p) => [p.uuid, p],
        ),
      );
      expect(pulled[padre.id].minStock).toBe(8);
      expect(typeof pulled[padre.id].minStock).toBe('number');
      expect(pulled[six.id].minStock).toBeNull();
      expect(pulled[padre.id]).not.toHaveProperty('parentMinStock');
    });
  });
});
