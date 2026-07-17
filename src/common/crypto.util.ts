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
