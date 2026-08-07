import { sign } from 'crypto';

// Réplica del esquema de verificación en
// absolute-pos-app/src/main/services/license.service.js (verifySignedLicense):
// firma Ed25519 del hardwareId, codificada en hex con el prefijo "POS2-".
// La llave privada es la contraparte de LICENSE_PUBLIC_KEY_PEM embebida en
// el cliente — solo con ella se pueden generar licencias válidas; el .exe
// solo lleva la pública, así que desempacarlo no alcanza para forjar una
// licencia nueva (a diferencia del esquema HMAC anterior). Ver
// absolute-pos-app/documentation/LICENSE_HARDENING_PLAN.md.
//
// Compartida entre offline-licenses (flujo "Solicitar Licencia") y licenses
// (flujo "Generar licencia manual" del dashboard) — ambos firman con la
// misma llave, solo cambia cómo llega el hardwareId.
const LICENSE_KEY_V2_PREFIX = 'POS2-';

function loadPrivateKeyPem(): string {
  const base64 = process.env.OFFLINE_LICENSE_PRIVATE_KEY;
  if (!base64) {
    throw new Error('OFFLINE_LICENSE_PRIVATE_KEY no está configurado');
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

export function generateOfflineLicenseKey(hardwareId: string): string {
  const privateKeyPem = loadPrivateKeyPem();
  const signature = sign(null, Buffer.from(hardwareId, 'utf8'), privateKeyPem);
  return `${LICENSE_KEY_V2_PREFIX}${signature.toString('hex').toUpperCase()}`;
}
