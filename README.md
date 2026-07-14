# absolute-pos-backend

Cloud backend (NestJS + PostgreSQL) for [absolute-electron-pos](https://github.com/).
Provides remote sync for the local Electron POS installs, plus the API that will back
a future stats dashboard and mobile app.

See `DEPLOY.md` for the Hetzner deployment runbook.

## Local development

```bash
npm install
docker compose up -d postgres     # local Postgres for dev (host port 5433, not 5432)
npx prisma migrate dev
npm run start:dev                 # http://localhost:3000/health, /docs (Swagger)
```

## Stack

- NestJS 11 + `@nestjs/swagger` (OpenAPI at `/docs`)
- Prisma 7 (`prisma-client-js` generator) + PostgreSQL
- Deployed via Docker Compose: `postgres` + `api` + `caddy` (automatic TLS)
