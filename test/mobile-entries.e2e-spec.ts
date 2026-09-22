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

// specs/22 §5 — `POST /inventory-entries` (B2): entrada por lote atómica e idempotente. Vectores K9–K11 (y E1–E3 de
// specs/04 §9 por REST).
describe('POST /inventory-entries (specs/22 §5)', () => {
  let h: Harness;
  let seed: Seed;
  let ana: Session;
  let anaId: string;
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
    const b = seed.business.id;
    cerveza = await seedProduct(h.prisma, b, { name: 'Cerveza', stock: 48 });
    six = await seedProduct(h.prisma, b, {
      name: 'Six Cerveza',
      parentProductId: cerveza.id,
      unitsPerPack: 6,
    });
    agua = await seedProduct(h.prisma, b, { name: 'Agua', stock: 10 });
  });

  // El `id` (entryId) lo genera SIEMPRE el cliente y es obligatorio (specs/22 §1): el ayudante pone uno nuevo si la
  // prueba no lo fija. Las pruebas de "sin id" usan `postRaw`.
  const postRaw = (body: object, auth = ana.bearer) =>
    h.http().post('/inventory-entries').set('Authorization', auth).send(body);
  const post = (body: object, auth = ana.bearer) =>
    postRaw({ id: randomUUID(), ...body }, auth);
  const item = (productId: string, quantity: number) => ({
    productId,
    quantity,
  });
  const movementCount = () => h.prisma.inventoryMovement.count();

  it('E1: una entrada de 5 a un producto raíz suma 5, con un movimiento IN PRODUCT_ENTRY', async () => {
    const entryId = randomUUID();
    const res = await post({ id: entryId, items: [item(agua.id, 5)] }).expect(
      201,
    );

    expect(res.body).toMatchObject({
      entryId,
      totalItems: 1,
      totalQuantity: 5,
    });
    expect(res.body.entriesProcessed).toEqual([
      {
        movementId: expect.any(String),
        productId: agua.id,
        productName: 'Agua',
        quantity: 5,
        unitsAdded: 5,
        isLinked: false,
      },
    ]);
    expect(await stockOf(h.prisma, agua.id)).toBe(15);

    const m = await h.prisma.inventoryMovement.findMany({
      where: { reference: 'PRODUCT_ENTRY' },
    });
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({
      productId: agua.id,
      type: 'IN',
      referenceId: entryId,
      linkedProductName: null,
      userId: anaId,
      businessId: seed.business.id,
    });
    expect(res.body.createdAt).toBe(m[0].createdAt.toISOString());
  });

  it('K9 / E2: una entrada de 4 "Six" suma 24 al PADRE con linkedProductName, y responde con la LÍNEA (la presentación)', async () => {
    const entryId = randomUUID();
    const res = await post({ id: entryId, items: [item(six.id, 4)] }).expect(
      201,
    );

    expect(res.body.entriesProcessed).toEqual([
      {
        movementId: expect.any(String),
        productId: six.id,
        productName: 'Six Cerveza',
        quantity: 4,
        unitsAdded: 24,
        isLinked: true,
      },
    ]);
    expect(res.body.totalQuantity).toBe(4); // lo capturado, no las unidades del padre
    expect(await stockOf(h.prisma, cerveza.id)).toBe(72);

    const [m] = await h.prisma.inventoryMovement.findMany({
      where: { reference: 'PRODUCT_ENTRY' },
    });
    expect(m).toMatchObject({
      productId: cerveza.id,
      type: 'IN',
      linkedProductName: 'Six Cerveza',
      referenceId: entryId,
    });
    expect(Number(m.quantity)).toBe(24);

    const catalog = await h
      .http()
      .get('/products/with-stock')
      .set('Authorization', ana.bearer)
      .expect(200);
    expect(
      (catalog.body as any[]).find((p) => p.name === 'Six Cerveza')
        .effectiveStock,
    ).toBe(12);
  });

  it('una entrada con varias líneas suma cada una y devuelve los totales de captura', async () => {
    const res = await post({
      items: [item(agua.id, 2), item(six.id, 1.5), item(cerveza.id, 10)],
    }).expect(201);
    expect(res.body).toMatchObject({ totalItems: 3, totalQuantity: 13.5 });
    expect(res.body.entriesProcessed.map((e: any) => e.unitsAdded)).toEqual([
      2, 9, 10,
    ]);
    expect(await stockOf(h.prisma, agua.id)).toBe(12);
    expect(await stockOf(h.prisma, cerveza.id)).toBe(48 + 9 + 10);
  });

  it('K10 / E3: si una línea es SERVICIO → 400 con el texto exacto y NINGUNA línea se aplica (rollback)', async () => {
    const corte = await seedProduct(h.prisma, seed.business.id, {
      name: 'Corte',
      tipoVenta: 'SERVICIO',
    });
    const before = await movementCount();
    const res = await post({
      items: [item(agua.id, 5), item(six.id, 2), item(corte.id, 1)],
    }).expect(400);
    expect(res.body.message).toBe(
      'Los productos de precio variable no manejan inventario. Producto: Corte',
    );
    expect(await movementCount()).toBe(before);
    expect(await stockOf(h.prisma, agua.id)).toBe(10);
    expect(await stockOf(h.prisma, cerveza.id)).toBe(48);
  });

  it('PRECIO_LIBRE tampoco maneja inventario (E4)', async () => {
    const varios = await seedProduct(h.prisma, seed.business.id, {
      name: 'Varios',
      tipoVenta: 'PRECIO_LIBRE',
    });
    const res = await post({ items: [item(varios.id, 1)] }).expect(400);
    expect(res.body.message).toBe(
      'Los productos de precio variable no manejan inventario. Producto: Varios',
    );
  });

  it('un producto inexistente → 404 con el texto del desktop y nada se guarda', async () => {
    const ghost = randomUUID();
    const before = await movementCount();
    const res = await post({
      items: [item(agua.id, 1), item(ghost, 1)],
    }).expect(404);
    expect(res.body.message).toBe(`Producto con ID ${ghost} no encontrado`);
    expect(await movementCount()).toBe(before);
  });

  it('un producto de OTRO negocio no se puede abastecer', async () => {
    const otro = await h.prisma.business.create({
      data: { name: 'Otra', slug: 'otra' },
    });
    const ajeno = await seedProduct(h.prisma, otro.id, {
      name: 'Ajeno',
      stock: 3,
    });
    await post({ items: [item(ajeno.id, 1)] }).expect(404);
    expect(await stockOf(h.prisma, ajeno.id)).toBe(3);
  });

  it('paridad con el desktop: acepta un producto inactivo y líneas repetidas (dos movimientos)', async () => {
    const inactivo = await seedProduct(h.prisma, seed.business.id, {
      name: 'Inactivo',
      active: false,
    });
    await post({
      items: [item(inactivo.id, 2), item(agua.id, 1), item(agua.id, 2)],
    }).expect(201);
    expect(await stockOf(h.prisma, inactivo.id)).toBe(2);
    expect(
      await h.prisma.inventoryMovement.count({
        where: { productId: agua.id, reference: 'PRODUCT_ENTRY' },
      }),
    ).toBe(2);
    expect(await stockOf(h.prisma, agua.id)).toBe(13);
  });

  it('deja los movimientos en sync_log para que el escritorio los baje (contra el PADRE)', async () => {
    await post({ items: [item(six.id, 1)] }).expect(201);
    const [m] = await h.prisma.inventoryMovement.findMany({
      where: { reference: 'PRODUCT_ENTRY' },
    });
    const log = await h.prisma.syncLogEntry.findMany({
      where: { rowId: m.id },
    });
    expect(log.map((l) => l.tableName)).toEqual(['inventoryMovements']);
    expect(m.productId).toBe(cerveza.id);
  });

  it('el entryId queda como referenceId y el historial de movimientos lo devuelve', async () => {
    const entryId = randomUUID();
    await post({
      id: entryId,
      items: [item(agua.id, 3), item(six.id, 1)],
    }).expect(201);
    const list = await h
      .http()
      .get('/inventory-movements?reference=PRODUCT_ENTRY')
      .set('Authorization', ana.bearer)
      .expect(200);
    expect(list.body).toHaveLength(2);
    expect(list.body.every((m: any) => m.referenceId === entryId)).toBe(true);
  });

  describe('idempotencia (K11)', () => {
    it('repetir la misma entrada devuelve la misma respuesta y el stock se suma UNA vez', async () => {
      const body = { id: randomUUID(), items: [item(agua.id, 5)] };
      const first = await post(body).expect(201);
      const again = await post(body).expect(201);
      expect(again.body).toEqual(first.body);
      expect(await stockOf(h.prisma, agua.id)).toBe(15);
      expect(await movementCount()).toBe(
        2 + 1 /* semillas de Cerveza y Agua */,
      );
    });

    it('un reintento con presentaciones reconstruye la línea original (presentación y cantidad de captura)', async () => {
      const body = {
        id: randomUUID(),
        items: [item(six.id, 4), item(agua.id, 2)],
      };
      const first = await post(body).expect(201);
      const again = await post(body).expect(201);
      const key = (e: any) => e.productId;
      expect(
        [...again.body.entriesProcessed].sort((a: any, b: any) =>
          key(a).localeCompare(key(b)),
        ),
      ).toEqual(
        [...first.body.entriesProcessed].sort((a: any, b: any) =>
          key(a).localeCompare(key(b)),
        ),
      );
      expect(again.body).toMatchObject({
        entryId: body.id,
        totalItems: 2,
        totalQuantity: 6,
        createdAt: first.body.createdAt,
      });
      expect(await stockOf(h.prisma, cerveza.id)).toBe(72);
    });

    it('dos peticiones SIMULTÁNEAS con el mismo id: la entrada se aplica una sola vez', async () => {
      const body = {
        id: randomUUID(),
        items: [item(agua.id, 5), item(six.id, 1)],
      };
      const [a, b] = await Promise.all([post(body), post(body)]);
      expect([a.status, b.status]).toEqual([201, 201]);
      expect(await stockOf(h.prisma, agua.id)).toBe(15);
      expect(await stockOf(h.prisma, cerveza.id)).toBe(54);
    });

    it('el id de una entrada de OTRO usuario → 409 ID_IN_USE', async () => {
      const bob = await seedUser(h.prisma, seed.business.id, {
        username: 'bob',
      });
      const id = randomUUID();
      await post(
        { id, items: [item(agua.id, 1)] },
        (await login(h, seed, bob)).bearer,
      ).expect(201);
      const res = await post({ id, items: [item(agua.id, 1)] }).expect(409);
      expect(res.body).toMatchObject({
        code: 'ID_IN_USE',
        message: 'El identificador ya está en uso',
      });
      expect(await stockOf(h.prisma, agua.id)).toBe(11);
    });

    it('el id es OBLIGATORIO: sin él, o con uno que no es UUID → 400 y no se suma nada', async () => {
      const before = await movementCount();
      await postRaw({ items: [item(agua.id, 1)] }).expect(400);
      await postRaw({ id: null, items: [item(agua.id, 1)] }).expect(400);
      await post({ id: 'abc', items: [item(agua.id, 1)] }).expect(400);
      expect(await movementCount()).toBe(before);
      expect(await stockOf(h.prisma, agua.id)).toBe(10);
    });
  });

  describe('validación de la petición', () => {
    it.each([
      ['sin líneas', { items: [] }],
      ['cantidad 0', { items: [{ productId: randomUUID(), quantity: 0 }] }],
      [
        'cantidad negativa (E9)',
        { items: [{ productId: randomUUID(), quantity: -1 }] },
      ],
      [
        'productId que no es UUID',
        { items: [{ productId: 'abc', quantity: 1 }] },
      ],
      [
        'id que no es UUID',
        { id: 'abc', items: [{ productId: randomUUID(), quantity: 1 }] },
      ],
      [
        'un campo desconocido',
        { items: [{ productId: randomUUID(), quantity: 1 }], extra: 1 },
      ],
      [
        'un campo desconocido en la línea',
        { items: [{ productId: randomUUID(), quantity: 1, price: 5 }] },
      ],
      [
        'más de 500 líneas',
        {
          items: Array.from({ length: 501 }, () => ({
            productId: randomUUID(),
            quantity: 1,
          })),
        },
      ],
    ])('%s → 400', async (_n, body) => {
      const before = await movementCount();
      await post(body).expect(400);
      expect(await movementCount()).toBe(before);
    });

    it('500 líneas caben', async () => {
      const items = Array.from({ length: 500 }, () => item(agua.id, 1));
      await post({ items }).expect(201);
      expect(await stockOf(h.prisma, agua.id)).toBe(510);
    });

    it('sin token → 401; con la clave del dispositivo → 401', async () => {
      await h
        .http()
        .post('/inventory-entries')
        .send({ items: [item(agua.id, 1)] })
        .expect(401);
      await post(
        { items: [item(agua.id, 1)] },
        `Bearer ${seed.deviceKey}`,
      ).expect(401);
    });
  });
});
