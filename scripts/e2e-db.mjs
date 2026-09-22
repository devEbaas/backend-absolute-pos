// Prepara la base de las pruebas e2e: `node scripts/e2e-db.mjs migrate | reset`.
//
// Lee `.env.e2e` (NO `.env`) y se niega a correr si la base no termina en `_e2e`: `prisma.config.ts` carga `.env` por
// omisión (la base de desarrollo), así que aquí se fija DATABASE_URL en el entorno del proceso hijo, que `dotenv` no
// pisa. Así una migración de pruebas nunca puede tocar `pos-db` ni ninguna otra base.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { config } from 'dotenv';

const file = new URL('../.env.e2e', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
if (!existsSync(file)) {
  console.error('Falta .env.e2e (ver .env.e2e.example).');
  process.exit(1);
}
const { parsed } = config({ path: file, override: true });
const url = parsed?.DATABASE_URL ?? '';
const dbName = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
if (!dbName.endsWith('_e2e')) {
  console.error(`Rechazado: la base "${dbName}" no termina en "_e2e". Estas pruebas nunca corren contra otra base.`);
  process.exit(1);
}

const action = process.argv[2];
const args =
  action === 'migrate'
    ? ['prisma', 'migrate', 'deploy']
    : action === 'reset'
      ? ['prisma', 'migrate', 'reset', '--force', '--skip-generate']
      : null;
if (!args) {
  console.error('Uso: node scripts/e2e-db.mjs migrate | reset');
  process.exit(1);
}

console.log(`Base de pruebas: ${dbName}`);
const result = spawnSync('npx', ['--no-install', ...args], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, DATABASE_URL: url },
});
process.exit(result.status ?? 1);
