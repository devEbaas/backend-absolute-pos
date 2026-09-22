import { randomUUID } from 'crypto';
import { mobileRegisterId } from '../src/common/register-id.util';
import {
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
} from './helpers/harness';

// Las claves exactas de la respuesta (specs/22 §3.4): nada más, en particular ninguna de las heredadas del DTO de sync.
const SESSION_KEYS = [
  'closedAt',
  'id',
  'openedAt',
  'openingAmount',
  'registerId',
  'status',
  'userId',
  'userName',
];
const OUTFLOW_KEYS = [
  'amount',
  'createdAt',
  'id',
  'reason',
  'sessionId',
  'userId',
  'userName',
];

// specs/22 §4.2 y §4.3 — caja (B3): abrir, salidas y el corte atómico. Vectores K12–K17 (y C1, C4–C9 de specs/03 §7).
describe('Caja (specs/22 §4.2, §4.3)', () => {
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

  const call = (method: 'get' | 'post', path: string, auth = ana.bearer) =>
    h.http()[method](path).set('Authorization', auth);
  // Los ids los genera SIEMPRE el cliente y son obligatorios (specs/22 §1): los ayudantes ponen uno nuevo si la prueba
  // no lo fija. Las pruebas de "sin id" usan `call` a pelo.
  const open = (body: object = { openingAmount: 500 }, auth = ana.bearer) =>
    call('post', '/cash-sessions', auth).send({ id: randomUUID(), ...body });
  const outflow = (body: object, auth = ana.bearer) =>
    call('post', '/cash-outflows', auth).send({ id: randomUUID(), ...body });
  const close = (id: string, body: object = {}, auth = ana.bearer) =>
    call('post', `/cash-sessions/${id}/close-with-cut`, auth).send({
      id: randomUUID(),
      ...body,
    });
  const sell = (
    sessionId: string,
    total: number,
    paymentMethod = 'efectivo',
    auth = ana.bearer,
  ) =>
    call('post', '/sales', auth).send({
      id: randomUUID(),
      sessionId,
      paymentMethod,
      items: [
        {
          id: randomUUID(),
          productId: producto,
          quantity: 1,
          unitPrice: total,
        },
      ],
    });
  let producto: string;
  beforeEach(async () => {
    producto = (
      await seedProduct(h.prisma, seed.business.id, {
        name: 'Genérico',
        stock: 1000,
      })
    ).id;
  });

  describe('POST /cash-sessions — abrir', () => {
    it('crea la sesión en este dispositivo, con el usuario del token y la deja en sync_log', async () => {
      const res = await open({ openingAmount: 500 }).expect(201);
      expect(res.body).toMatchObject({
        userId: anaId,
        userName: 'Ana Cajera',
        openingAmount: 500,
        status: 'open',
        registerId: mobileRegisterId(seed.device),
        closedAt: null,
      });
      const row = await h.prisma.cashSession.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(row.deviceId).toBe(seed.device.id);
      expect(row.businessId).toBe(seed.business.id);
      const log = await h.prisma.syncLogEntry.findMany({
        where: { rowId: res.body.id },
      });
      expect(log.map((l) => l.tableName)).toEqual(['cashSessions']);
    });

    it('la respuesta trae EXACTAMENTE las claves del contrato (sin las heredadas del DTO de sync)', async () => {
      const res = await open().expect(201);
      expect(Object.keys(res.body).sort()).toEqual(SESSION_KEYS);
      for (const legacy of ['uuid', 'userUuid', 'updatedAt']) {
        expect(res.body).not.toHaveProperty(legacy);
      }
    });

    it('el fondo puede ser 0; uno negativo → 400', async () => {
      await open({ openingAmount: 0 }).expect(201);
      await resetDb(h.prisma);
      seed = await seedBusiness(h.prisma);
      const u = await seedUser(h.prisma, seed.business.id);
      ana = await login(h, seed, u);
      await open({ openingAmount: -1 }).expect(400);
    });

    // Fase 5 + opción C: `registerId` lo pone el servidor: el nombre del dispositivo (`Device.label`) MÁS un sufijo corto de
    // su id (`CAJA-2 #A1B2`). El nombre solo puede coincidir con el `device_name` del escritorio, que identifica SU caja
    // abierta por `register_id` y usuario: con el mismo nombre, la caja del móvil bajaría al escritorio y la tomaría como suya.
    it('registerId es el nombre del dispositivo + un sufijo de su id, no "PRINCIPAL" ni el nombre a secas', async () => {
      const res = await open({ openingAmount: 100 }).expect(201);
      expect(res.body.registerId).toBe(mobileRegisterId(seed.device));
      expect(res.body.registerId).toMatch(/^CAJA-2 #[0-9A-F]{4}$/);
      const row = await h.prisma.cashSession.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(row.registerId).toBe(res.body.registerId);
    });

    it('DOS dispositivos con el MISMO nombre (o uno con el nombre por omisión del escritorio) no comparten registerId', async () => {
      const gemelo = await seedDevice(h.prisma, seed.business.id, 'CAJA-2');
      const enGemelo = await login(
        h,
        { ...seed, ...gemelo },
        { username: 'ana', password: 'secreto' },
      );
      const a = (await open({ openingAmount: 1 }).expect(201)).body.registerId;
      const b = (await open({ openingAmount: 1 }, enGemelo.bearer).expect(201))
        .body.registerId;
      expect(a).not.toBe(b);
      // Ninguno coincide con el nombre a secas: el `device_name` del escritorio (p. ej. `CAJA-1`, `CAJA-2`) nunca choca.
      expect([a, b]).not.toContain('CAJA-2');
    });

    it('cada dispositivo guarda SU nombre', async () => {
      const otra = await seedDevice(h.prisma, seed.business.id, 'CAJA-3');
      const enOtra = await login(
        h,
        { ...seed, ...otra },
        { username: 'ana', password: 'secreto' },
      );
      const res = await open({ openingAmount: 20 }, enOtra.bearer).expect(201);
      expect(res.body.registerId).toBe(mobileRegisterId(otra.device));
      expect(res.body.registerId).toMatch(/^CAJA-3 #/);
    });

    it('el nombre se lee del dispositivo al abrir (renombrarlo no exige volver a iniciar sesión); el sufijo no cambia', async () => {
      await h.prisma.device.update({
        where: { id: seed.device.id },
        data: { label: 'MOSTRADOR' },
      });
      expect((await open().expect(201)).body.registerId).toBe(
        mobileRegisterId({ id: seed.device.id, label: 'MOSTRADOR' }),
      );
    });

    it('registerId en el cuerpo → 400 (ya no se acepta del cliente) y no se abre nada', async () => {
      const res = await open({ openingAmount: 100, registerId: 'OTRA' }).expect(
        400,
      );
      expect(JSON.stringify(res.body)).toContain('registerId');
      expect(await h.prisma.cashSession.count()).toBe(0);
    });

    it('K12 / C7: abrir dos veces (mismo usuario y dispositivo) → 409 SESSION_ALREADY_OPEN con el texto exacto', async () => {
      await open().expect(201);
      const res = await open({ openingAmount: 100 }).expect(409);
      expect(res.body).toMatchObject({
        code: 'SESSION_ALREADY_OPEN',
        message:
          'Ya tienes una sesión de caja abierta. Ciérrala antes de abrir una nueva.',
      });
      expect(await h.prisma.cashSession.count()).toBe(1);
    });

    it('otro usuario en el mismo dispositivo, o el mismo usuario en otro dispositivo, SÍ pueden abrir la suya', async () => {
      await open().expect(201);
      const bob = await seedUser(h.prisma, seed.business.id, {
        username: 'bob',
        name: 'Bob',
      });
      await open(
        { openingAmount: 50 },
        (await login(h, seed, bob)).bearer,
      ).expect(201);
      const otra = await seedDevice(h.prisma, seed.business.id, 'CAJA-3');
      const enOtra = await login(
        h,
        { ...seed, ...otra },
        { username: 'ana', password: 'secreto' },
      );
      await open({ openingAmount: 20 }, enOtra.bearer).expect(201);
      expect(await h.prisma.cashSession.count()).toBe(3);
    });

    it('después de cerrar la caja se puede abrir otra', async () => {
      const s = (await open().expect(201)).body;
      await close(s.id).expect(201);
      await open({ openingAmount: 300 }).expect(201);
    });

    it('dos aperturas SIMULTÁNEAS: solo una se abre', async () => {
      const results = await Promise.all([open(), open()]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(
        await h.prisma.cashSession.count({ where: { status: 'open' } }),
      ).toBe(1);
    });

    it('idempotente: repetir con el mismo id devuelve la misma sesión', async () => {
      const id = randomUUID();
      const first = await open({ id, openingAmount: 500 }).expect(201);
      const again = await open({ id, openingAmount: 500 }).expect(201);
      expect(again.body).toEqual(first.body);
      expect(await h.prisma.cashSession.count()).toBe(1);
    });

    it('el id de una sesión de otro usuario → 409 ID_IN_USE', async () => {
      const bob = await seedUser(h.prisma, seed.business.id, {
        username: 'bob',
      });
      const id = randomUUID();
      await open(
        { id, openingAmount: 1 },
        (await login(h, seed, bob)).bearer,
      ).expect(201);
      expect((await open({ id, openingAmount: 1 }).expect(409)).body.code).toBe(
        'ID_IN_USE',
      );
    });

    it('sin id, o con uno que no es UUID → 400 y no se abre nada', async () => {
      await call('post', '/cash-sessions')
        .send({ openingAmount: 500 })
        .expect(400);
      await open({ id: 'abc' }).expect(400);
      await open({ id: null }).expect(400);
      expect(await h.prisma.cashSession.count()).toBe(0);
    });

    it('un campo desconocido → 400; sin token → 401', async () => {
      await open({ openingAmount: 1, extra: true }).expect(400);
      await h
        .http()
        .post('/cash-sessions')
        .send({ openingAmount: 1 })
        .expect(401);
    });
  });

  describe('POST /cash-outflows — salidas de dinero', () => {
    let sessionId: string;
    beforeEach(async () => {
      sessionId = (await open().expect(201)).body.id;
    });

    it('registra la salida con su autor, el motivo recortado, y la deja en el resumen', async () => {
      const res = await outflow({
        sessionId,
        amount: 100,
        reason: '  Pago a proveedor  ',
      }).expect(201);
      expect(res.body).toMatchObject({
        sessionId,
        userId: anaId,
        userName: 'Ana Cajera',
        amount: 100,
        reason: 'Pago a proveedor',
      });
      expect(Object.keys(res.body).sort()).toEqual(OUTFLOW_KEYS);
      for (const legacy of ['uuid', 'sessionUuid', 'userUuid']) {
        expect(res.body).not.toHaveProperty(legacy);
      }
      const summary = await call(
        'get',
        `/cash-sessions/${sessionId}/summary`,
      ).expect(200);
      expect(summary.body).toMatchObject({
        totalOutflows: 100,
        outflowCount: 1,
        expectedCash: 400,
      });
      const log = await h.prisma.syncLogEntry.findMany({
        where: { rowId: res.body.id },
      });
      expect(log.map((l) => l.tableName)).toEqual(['cashOutflows']);
    });

    it('sin id, o con uno que no es UUID → 400 y no se registra nada', async () => {
      await call('post', '/cash-outflows')
        .send({ sessionId, amount: 10, reason: 'x' })
        .expect(400);
      await outflow({ sessionId, amount: 10, reason: 'x', id: 'abc' }).expect(
        400,
      );
      expect(await h.prisma.cashOutflow.count()).toBe(0);
    });

    it.each([
      ['C5: monto 0', { amount: 0, reason: 'x' }],
      ['C5: monto negativo', { amount: -5, reason: 'x' }],
      ['sin monto', { reason: 'x' }],
    ])('%s → 400 "El monto debe ser mayor a cero"', async (_n, body) => {
      const res = await outflow({ sessionId, ...body }).expect(400);
      expect(res.body.message).toBe('El monto debe ser mayor a cero');
    });

    it.each([
      ['C6: motivo con solo espacios', { amount: 10, reason: '   ' }],
      ['motivo vacío', { amount: 10, reason: '' }],
      ['sin motivo', { amount: 10 }],
    ])('%s → 400 "El motivo es obligatorio"', async (_n, body) => {
      const res = await outflow({ sessionId, ...body }).expect(400);
      expect(res.body.message).toBe('El motivo es obligatorio');
    });

    it('C9 / K13: en una sesión cerrada → 409 SESSION_CLOSED, y esa regla va ANTES que la del monto', async () => {
      await close(sessionId).expect(201);
      const res = await outflow({ sessionId, amount: 10, reason: 'x' }).expect(
        409,
      );
      expect(res.body).toMatchObject({
        code: 'SESSION_CLOSED',
        message: 'La sesión ya está cerrada',
      });
      expect(
        (await outflow({ sessionId, amount: 0, reason: 'x' }).expect(409)).body
          .code,
      ).toBe('SESSION_CLOSED');
    });

    it('una sesión inexistente o ajena → 404 "Sesión no encontrada" (antes que validar el monto)', async () => {
      const bob = await seedUser(h.prisma, seed.business.id, {
        username: 'bob',
      });
      const ajena = await seedOpenSession(
        h.prisma,
        seed.business.id,
        bob.id,
        seed.device.id,
      );
      const otraCaja = await seedOpenSession(
        h.prisma,
        seed.business.id,
        anaId,
        null,
      );
      for (const sid of [randomUUID(), ajena.id, otraCaja.id]) {
        const res = await outflow({
          sessionId: sid,
          amount: 0,
          reason: '',
        }).expect(404);
        expect(res.body.message).toBe('Sesión no encontrada');
      }
    });

    it('idempotente por id; el id de otro usuario → 409 ID_IN_USE', async () => {
      const id = randomUUID();
      const first = await outflow({
        id,
        sessionId,
        amount: 25,
        reason: 'Hielo',
      }).expect(201);
      const again = await outflow({
        id,
        sessionId,
        amount: 25,
        reason: 'Hielo',
      }).expect(201);
      expect(again.body).toEqual(first.body);
      expect(await h.prisma.cashOutflow.count()).toBe(1);

      const bob = await seedUser(h.prisma, seed.business.id, {
        username: 'bob',
      });
      const bobSession = await seedOpenSession(
        h.prisma,
        seed.business.id,
        bob.id,
        seed.device.id,
      );
      const res = await outflow(
        { id, sessionId: bobSession.id, amount: 1, reason: 'x' },
        (await login(h, seed, bob)).bearer,
      ).expect(409);
      expect(res.body.code).toBe('ID_IN_USE');
    });

    it('la lista de salidas las muestra, la más reciente primero', async () => {
      await outflow({ sessionId, amount: 10, reason: 'Uno' }).expect(201);
      await new Promise((r) => setTimeout(r, 10));
      await outflow({ sessionId, amount: 20, reason: 'Dos' }).expect(201);
      const list = await call(
        'get',
        `/cash-sessions/${sessionId}/outflows`,
      ).expect(200);
      expect(list.body.map((o: any) => o.reason)).toEqual(['Dos', 'Uno']);
    });
  });

  describe('POST /cash-sessions/:id/close-with-cut — el corte atómico', () => {
    /** El turno de C1 (sin crédito): fondo 500; efectivo 1200 (3×400), tarjeta 300, transferencia 150; una de 80 cancelada; salida 100. */
    async function turnoC1() {
      const sessionId = (await open({ openingAmount: 500 }).expect(201)).body
        .id;
      for (let i = 0; i < 3; i++) await sell(sessionId, 400).expect(201);
      await sell(sessionId, 300, 'tarjeta').expect(201);
      await sell(sessionId, 150, 'transferencia').expect(201);
      const cancelada = (await sell(sessionId, 80).expect(201)).body;
      await h.prisma.sale.update({
        where: { id: cancelada.id },
        data: { cancelled: true, cancelledAt: new Date() },
      });
      await outflow({
        sessionId,
        amount: 100,
        reason: 'Pago a proveedor',
      }).expect(201);
      return sessionId;
    }

    it('K15 + K16 / C1: crea el corte con los totales del SERVIDOR, calcula la diferencia y cierra la sesión', async () => {
      const sessionId = await turnoC1();
      const res = await close(sessionId, {
        actualCash: 1590,
        notes: '  Todo cuadra  ',
      }).expect(201);

      expect(res.body.cut).toMatchObject({
        sessionId,
        userId: anaId,
        userName: 'Ana Cajera',
        registerId: mobileRegisterId(seed.device), // el del dispositivo que abrió la sesión
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
        notes: 'Todo cuadra',
      });
      expect(res.body.session).toMatchObject({
        id: sessionId,
        status: 'closed',
        userId: anaId,
      });
      expect(Object.keys(res.body.session).sort()).toEqual(SESSION_KEYS);
      expect(res.body.session.closedAt).toEqual(res.body.cut.createdAt);

      const row = await h.prisma.cashSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(row.status).toBe('closed');
      expect(row.closedAt).not.toBeNull();
      expect(await h.prisma.cashCut.count({ where: { sessionId } })).toBe(1);

      const log = await h.prisma.syncLogEntry.findMany({
        where: { rowId: { in: [res.body.cut.id, sessionId] } },
      });
      expect(log.map((l) => l.tableName).sort()).toEqual([
        'cashCuts',
        'cashSessions',
        'cashSessions',
      ]); // apertura + cierre
    });

    it('C8 / K16: sin efectivo contado, actualCash y cashDifference quedan null', async () => {
      const sessionId = (await open({ openingAmount: 100 }).expect(201)).body
        .id;
      const res = await close(sessionId).expect(201);
      expect(res.body.cut).toMatchObject({
        actualCash: null,
        cashDifference: null,
        expectedCash: 100,
        notes: null,
      });
      const explicit = await open({ openingAmount: 100 }).expect(201);
      const res2 = await close(explicit.body.id, {
        actualCash: null,
        notes: '   ',
      }).expect(201);
      expect(res2.body.cut).toMatchObject({
        actualCash: null,
        cashDifference: null,
        notes: null,
      });
    });

    it('la diferencia es contado − esperado: sobrante (+) y cuadre exacto (0)', async () => {
      const s1 = (await open({ openingAmount: 100 }).expect(201)).body.id;
      expect(
        (await close(s1, { actualCash: 130 }).expect(201)).body.cut
          .cashDifference,
      ).toBe(30);
      const s2 = (await open({ openingAmount: 100 }).expect(201)).body.id;
      expect(
        (await close(s2, { actualCash: 100 }).expect(201)).body.cut
          .cashDifference,
      ).toBe(0);
    });

    it('el cliente no puede imponer totales: un campo desconocido → 400', async () => {
      const s = (await open().expect(201)).body.id;
      await close(s, { totalSales: 99999 }).expect(400);
      await close(s, { expectedCash: 1 }).expect(400);
      expect(await h.prisma.cashCut.count()).toBe(0);
    });

    it('efectivo contado negativo → 400 y la sesión sigue abierta', async () => {
      const s = (await open().expect(201)).body.id;
      await close(s, { actualCash: -1 }).expect(400);
      expect(
        (await h.prisma.cashSession.findUniqueOrThrow({ where: { id: s } }))
          .status,
      ).toBe('open');
    });

    it('K14 / C4: cerrar la caja de otro usuario → 403 NOT_SESSION_OWNER y no se crea nada', async () => {
      const bob = await seedUser(h.prisma, seed.business.id, {
        username: 'bob',
        name: 'Bob',
      });
      const s = await seedOpenSession(
        h.prisma,
        seed.business.id,
        bob.id,
        seed.device.id,
      );
      const res = await close(s.id).expect(403);
      expect(res.body).toMatchObject({
        code: 'NOT_SESSION_OWNER',
        message: 'Solo el usuario que abrió la caja puede cerrarla',
      });
      expect(await h.prisma.cashCut.count()).toBe(0);
      expect(
        (await h.prisma.cashSession.findUniqueOrThrow({ where: { id: s.id } }))
          .status,
      ).toBe('open');
    });

    it('una sesión de otro dispositivo, del escritorio o inexistente → 404 "Sesión no encontrada"', async () => {
      const otra = await seedDevice(h.prisma, seed.business.id, 'CAJA-3');
      const enOtraCaja = await seedOpenSession(
        h.prisma,
        seed.business.id,
        anaId,
        otra.device.id,
      );
      const delEscritorio = await seedOpenSession(
        h.prisma,
        seed.business.id,
        anaId,
        null,
      );
      for (const id of [enOtraCaja.id, delEscritorio.id, randomUUID()]) {
        expect((await close(id).expect(404)).body.message).toBe(
          'Sesión no encontrada',
        );
      }
      await close('no-es-uuid').expect(400);
    });

    it('K17: repetir el corte sobre la sesión ya cortada devuelve el MISMO corte, sin crear otro', async () => {
      const s = (await open().expect(201)).body.id;
      const first = await close(s, { actualCash: 500 }).expect(201);
      const again = await close(s, { actualCash: 999 }).expect(201); // lo contado de un reintento no cambia el corte ya hecho
      expect(again.body.cut).toEqual(first.body.cut);
      expect(again.body.session.status).toBe('closed');
      expect(await h.prisma.cashCut.count()).toBe(1);
    });

    it('K17: idempotente por el id del corte', async () => {
      const s = (await open().expect(201)).body.id;
      const id = randomUUID();
      const first = await close(s, { id }).expect(201);
      const again = await close(s, { id }).expect(201);
      expect(again.body).toEqual(first.body);
      expect(await h.prisma.cashCut.count()).toBe(1);
    });

    it('el id de un corte de OTRO usuario → 409 ID_IN_USE', async () => {
      const bob = await seedUser(h.prisma, seed.business.id, {
        username: 'bob',
      });
      const bobSession = await seedOpenSession(
        h.prisma,
        seed.business.id,
        bob.id,
        seed.device.id,
      );
      const id = randomUUID();
      await close(
        bobSession.id,
        { id },
        (await login(h, seed, bob)).bearer,
      ).expect(201);
      const s = (await open().expect(201)).body.id;
      expect((await close(s, { id }).expect(409)).body.code).toBe('ID_IN_USE');
    });

    it('una sesión cerrada SIN corte (datos del escritorio o de una falla) → 409 SESSION_CLOSED', async () => {
      const s = (await open().expect(201)).body.id;
      await h.prisma.cashSession.update({
        where: { id: s },
        data: { status: 'closed', closedAt: new Date() },
      });
      const res = await close(s).expect(409);
      expect(res.body).toMatchObject({
        code: 'SESSION_CLOSED',
        message: 'La sesión ya está cerrada',
      });
    });

    it('un usuario que no abrió la caja no recibe el corte de una sesión ya cerrada (403, no lo filtra)', async () => {
      const s = (await open().expect(201)).body.id;
      await close(s).expect(201);
      const bob = await seedUser(h.prisma, seed.business.id, {
        username: 'bob',
      });
      expect(
        (await close(s, {}, (await login(h, seed, bob)).bearer).expect(403))
          .body.code,
      ).toBe('NOT_SESSION_OWNER');
    });

    it('con la sesión cortada ya no hay sesión actual, no se puede vender ni sacar dinero, y el corte sale en el historial', async () => {
      const s = (await open().expect(201)).body.id;
      const cut = (await close(s).expect(201)).body.cut;

      expect(
        (await call('get', '/cash-sessions/current').expect(200)).body,
      ).toEqual({ session: null });
      expect((await sell(s, 10).expect(409)).body.code).toBe('SESSION_CLOSED');
      expect(
        (await outflow({ sessionId: s, amount: 1, reason: 'x' }).expect(409))
          .body.code,
      ).toBe('SESSION_CLOSED');

      const history = await call('get', '/cash-cuts').expect(200);
      expect(history.body.items.map((c: any) => c.id)).toEqual([cut.id]);
      expect(history.body.items[0].sessionClosedAt).not.toBeNull();
    });

    it('el corte incluye una venta con método desconocido en "otras formas de pago" (C11) sin perderla del total', async () => {
      const s = (await open({ openingAmount: 0 }).expect(201)).body.id;
      await sell(s, 60, 'efectivo').expect(201);
      await h.prisma.sale.create({
        data: {
          id: randomUUID(),
          businessId: seed.business.id,
          userId: anaId,
          deviceId: seed.device.id,
          sessionId: s,
          total: 40,
          paymentMethod: 'vale',
          createdAt: new Date(),
        },
      });
      const res = await close(s).expect(201);
      expect(res.body.cut).toMatchObject({
        totalCashSales: 60,
        totalOtherSales: 40,
        totalSales: 100,
        transactionCount: 2,
      });
    });

    it('sin id, o con uno que no es UUID → 400 y la caja sigue abierta', async () => {
      const sessionId = (await open().expect(201)).body.id;
      await call('post', `/cash-sessions/${sessionId}/close-with-cut`)
        .send({ actualCash: 500 })
        .expect(400);
      await close(sessionId, { id: 'abc' }).expect(400);
      expect(await h.prisma.cashCut.count()).toBe(0);
      const row = await h.prisma.cashSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(row.status).toBe('open');
    });

    it('sin token → 401', async () => {
      await h
        .http()
        .post(`/cash-sessions/${randomUUID()}/close-with-cut`)
        .send({})
        .expect(401);
    });
  });

  describe('consistencia entre ventas y el corte (bloqueo de la sesión)', () => {
    it('ventas simultáneas al cierre: toda venta aceptada queda en el corte y ninguna entra a una sesión cerrada', async () => {
      // Se repite varias veces con distintos "empujes" para dar oportunidad a la carrera.
      for (let round = 0; round < 6; round++) {
        await resetDb(h.prisma);
        seed = await seedBusiness(h.prisma);
        const user = await seedUser(h.prisma, seed.business.id);
        ana = await login(h, seed, user);
        producto = (
          await seedProduct(h.prisma, seed.business.id, {
            name: 'Genérico',
            stock: 1000,
          })
        ).id;
        const sessionId = (await open({ openingAmount: 0 }).expect(201)).body
          .id;

        const sales = Array.from({ length: 8 }, () => sell(sessionId, 10));
        const cutPromise = (async () => {
          await new Promise((r) => setTimeout(r, round * 5));
          return close(sessionId);
        })();
        const [cutRes, ...saleRes] = await Promise.all([cutPromise, ...sales]);

        expect(cutRes.status).toBe(201);
        const accepted = saleRes.filter((r) => r.status === 201).length;
        for (const r of saleRes) expect([201, 409]).toContain(r.status);
        // Lo que el corte contó es EXACTAMENTE lo que se aceptó: ninguna venta se coló después de calcular el resumen.
        expect(cutRes.body.cut.transactionCount).toBe(accepted);
        expect(cutRes.body.cut.totalCashSales).toBe(accepted * 10);
        expect(await h.prisma.sale.count({ where: { sessionId } })).toBe(
          accepted,
        );
      }
    });
  });
});
