// Corre antes de cada archivo de prueba e2e (`setupFiles` de jest-e2e.json).
//
// Carga `.env.e2e` **pisando** lo que hubiera (y `dotenv` no vuelve a pisarlo después con `.env`, que apunta a la base de
// desarrollo) y se niega a continuar si la base no termina en `_e2e`: estas pruebas vacían tablas, jamás deben correr
// contra otra base.
import { config } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';

const file = join(__dirname, '..', '.env.e2e');
if (!existsSync(file)) {
  throw new Error(
    'Falta .env.e2e: cópialo de .env.e2e.example y apunta DATABASE_URL a una base propia que termine en "_e2e".',
  );
}
config({ path: file, override: true, quiet: true });

const url = process.env.DATABASE_URL ?? '';
const dbName = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
if (!dbName.endsWith('_e2e')) {
  throw new Error(
    `Las pruebas e2e se niegan a correr contra la base "${dbName}": debe terminar en "_e2e".`,
  );
}
