import {
  createHarness,
  Harness,
  resetDb,
  seedBusiness,
  seedUser,
  Seed,
} from './helpers/harness';

// specs/22 §3.1 — `POST /auth/login` ampliado (K24) y lo que ya hacía (para no romper a React Native).
describe('POST /auth/login (specs/22 §3.1)', () => {
  let h: Harness;
  let seed: Seed;

  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(() => h.close());
  beforeEach(async () => {
    await resetDb(h.prisma);
    seed = await seedBusiness(h.prisma);
  });

  const login = (body: object, key = seed.deviceKey) =>
    h
      .http()
      .post('/auth/login')
      .set('Authorization', `Bearer ${key}`)
      .send(body);

  it('K24: devuelve el negocio, el dispositivo y los datos de empresa (sin logo); token y user siguen igual', async () => {
    await seedUser(h.prisma, seed.business.id);
    await h.prisma.businessSetting.createMany({
      data: [
        {
          businessId: seed.business.id,
          key: 'company_name',
          value: 'Abarrotes La Esquina',
        },
        {
          businessId: seed.business.id,
          key: 'company_rfc',
          value: 'AURJ800101ABC',
        },
        {
          businessId: seed.business.id,
          key: 'company_logo',
          value: 'data:image/png;base64,AAAA',
        },
      ],
    });

    const res = await login({ username: 'ana', password: 'secreto' }).expect(
      201,
    );

    // Lo que RN ya leía.
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user).toEqual({
      id: expect.any(String),
      name: 'Ana Cajera',
      username: 'ana',
      role: 'cashier',
    });
    // Lo nuevo.
    expect(res.body.business).toEqual({
      id: seed.business.id,
      name: 'Tienda Norte',
      slug: 'tienda-norte',
    });
    expect(res.body.device).toEqual({ id: seed.device.id, label: 'CAJA-2' });
    expect(res.body.company).toEqual({
      companyName: 'Abarrotes La Esquina',
      rfc: 'AURJ800101ABC',
      phone: null,
      address: null,
      email: null,
      website: null,
    });
    expect(res.body.company).not.toHaveProperty('logo');
  });

  it('sin datos de empresa cargados, company trae todo en null', async () => {
    await seedUser(h.prisma, seed.business.id);
    const res = await login({ username: 'ana', password: 'secreto' }).expect(
      201,
    );
    expect(Object.values(res.body.company)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('el JWT lleva los claims que el contrato promete (sub, businessId, deviceId, role, username) y vence en 12 h', async () => {
    const user = await seedUser(h.prisma, seed.business.id);
    const res = await login({ username: 'ana', password: 'secreto' }).expect(
      201,
    );
    const claims = JSON.parse(
      Buffer.from(
        (res.body.token as string).split('.')[1],
        'base64url',
      ).toString(),
    );
    expect(claims).toMatchObject({
      sub: user.id,
      businessId: seed.business.id,
      deviceId: seed.device.id,
      role: 'cashier',
      username: 'ana',
    });
    expect(claims.exp - claims.iat).toBe(12 * 3600);
  });

  describe('comportamiento existente (no debe cambiar)', () => {
    it('contraseña incorrecta: 401 con el mensaje de siempre', async () => {
      await seedUser(h.prisma, seed.business.id);
      const res = await login({ username: 'ana', password: 'mal' }).expect(401);
      expect(res.body.message).toBe('Usuario o contraseña incorrectos');
    });

    it('usuario inactivo: 403', async () => {
      await seedUser(h.prisma, seed.business.id, { active: false });
      const res = await login({ username: 'ana', password: 'secreto' }).expect(
        403,
      );
      expect(res.body.message).toBe(
        'Usuario inactivo. Contacta al administrador',
      );
    });

    it('usuario solo del escritorio (sin contraseña en la nube): 401, igual que una contraseña equivocada', async () => {
      await seedUser(h.prisma, seed.business.id, { withPassword: false });
      const res = await login({ username: 'ana', password: 'secreto' }).expect(
        401,
      );
      expect(res.body.message).toBe('Usuario o contraseña incorrectos');
    });

    it('dispositivo revocado: 401 "Dispositivo revocado"', async () => {
      await seedUser(h.prisma, seed.business.id);
      await h.prisma.device.update({
        where: { id: seed.device.id },
        data: { revokedAt: new Date() },
      });
      const res = await login({ username: 'ana', password: 'secreto' }).expect(
        401,
      );
      expect(res.body.message).toBe('Dispositivo revocado');
    });

    it('clave de dispositivo inválida o ausente: 401', async () => {
      await login(
        { username: 'ana', password: 'secreto' },
        'clave-falsa',
      ).expect(401);
      await h
        .http()
        .post('/auth/login')
        .send({ username: 'ana', password: 'x' })
        .expect(401);
    });

    it('un usuario de OTRO negocio no entra con la clave de este dispositivo', async () => {
      const other = await h.prisma.business.create({
        data: { name: 'Otra', slug: 'otra' },
      });
      await seedUser(h.prisma, other.id);
      await login({ username: 'ana', password: 'secreto' }).expect(401);
    });

    it('un campo desconocido en el cuerpo tumba la petición (forbidNonWhitelisted)', async () => {
      await seedUser(h.prisma, seed.business.id);
      await login({ username: 'ana', password: 'secreto', extra: 1 }).expect(
        400,
      );
    });
  });
});
