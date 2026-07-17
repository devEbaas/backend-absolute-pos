# absolute-pos-backend

Cloud backend (NestJS + PostgreSQL) for [absolute-electron-pos](https://github.com/).
Provides remote sync for the local Electron POS installs, plus the API that will back
a future stats dashboard and mobile app.

See `DEPLOY.md` for bootstrapping the first business/device against a Postgres you
provide — no deployment mechanism decided yet.

## Local development

```bash
npm install
# apunta DATABASE_URL en .env a un Postgres propio (local o remoto)
npx prisma migrate dev
npm run start:dev                 # http://localhost:3000/health, /docs (Swagger)
```

## Stack

- NestJS 11 + `@nestjs/swagger` (OpenAPI at `/docs`)
- Prisma 7 (`prisma-client-js` generator) + PostgreSQL
- WebSocket (`@nestjs/platform-ws`) en `/ws` para notificar cambios entre cajas del
  mismo negocio en tiempo real
