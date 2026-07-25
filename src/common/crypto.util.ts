import { createHash, randomBytes, timingSafeEqual } from 'crypto';

export function generateApiKey(): string {
  return randomBytes(32).toString('hex');
}

// Corto y en mayúsculas para que un root_admin lo pueda transcribir a mano
// al emparejar una caja (ver POST /devices/pair) — no es un secreto de larga
// vida como el device api key, expira en minutos y se consume una sola vez.
export function generatePairingCode(): string {
  return randomBytes(5).toString('hex').toUpperCase();
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

// Password inicial para un usuario creado desde pos-root-dashboard sin que
// el operador la capture a mano (ver BusinessesService.create /
// UsersService.create) — se muestra en texto plano una sola vez en la
// respuesta, igual que el device api key o el pairing code; nunca se
// persiste en claro, solo su hash.
export function generateTempPassword(): string {
  return randomBytes(9).toString('base64url');
}

// Mismo secreto y algoritmo que absolute-electron-pos
// (src/main/services/license.service.js) y absolute-pos-mobile
// (src/license/license.ts) — ambos clientes verifican esta clave
// localmente sin red, así que el algoritmo debe seguir siendo idéntico.
// El default preserva las claves ya emitidas; se puede rotar vía env sin
// tocar código.
const LICENSE_SECRET =
  process.env.LICENSE_SECRET ??
  'ABSOLUTE_POS_SECRET_KEY_2024_CHANGE_IN_PRODUCTION';

export function generateLicenseKey(hardwareId: string): string {
  const hash = createHash('sha256')
    .update(`${hardwareId}|${LICENSE_SECRET}`)
    .digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ]
    .join('-')
    .toUpperCase();
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function extractBearerToken(
  authHeader: string | undefined,
): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}
