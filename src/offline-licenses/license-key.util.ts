import { createHash } from 'crypto';

// Réplica exacta de generateLicenseKey() en
// absolute-pos-app/src/main/services/license.service.js — OFFLINE_LICENSE_SECRET
// debe ser idéntico a LICENSE_SECRET del lado del cliente, si no las claves
// generadas acá nunca pasan la verificación local de la app.
export function generateOfflineLicenseKey(hardwareId: string): string {
  const secret = process.env.OFFLINE_LICENSE_SECRET;
  if (!secret) {
    throw new Error('OFFLINE_LICENSE_SECRET no está configurado');
  }

  const hash = createHash('sha256')
    .update(`${hardwareId}|${secret}`)
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
