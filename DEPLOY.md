# Ejecutar, desplegar y dar de alta negocios (sin Docker)

## Despliegue automático (GitHub Actions → Hetzner)

`.github/workflows/deploy.yml` despliega en cada push a `main`: build en CI (`npm ci`,
`prisma generate`, `npm run build`), luego `rsync` del código (sin `node_modules`/`.env`)
a `/opt/absolute-pos-backend/` en el VPS por SSH, escribe el `.env` remoto, y ahí mismo
corre `npm ci` + `prisma generate` + `prisma migrate deploy` + reinicia con `pm2`. Mismo
patrón que ya usan para `mayan-transfer-backend` en el mismo VPS, adaptado a npm (no
pnpm) y sin las variables de ese otro proyecto (Stripe, CORS, etc. no aplican aquí).

**Sin reverse proxy todavía** — el backend queda expuesto directo en `http://<SERVER_HOST>:<PORT>`,
sin dominio ni TLS. Si ese VPS ya sirve `mayan-transfer-backend` en el puerto 3000, usa un
puerto distinto aquí (ej. `3001`) para no chocar.

Configurar en el repo de GitHub → Settings → Environments → **Production** (el workflow
usa `environment: Production`):

| Nombre | Tipo | Valor |
|---|---|---|
| `SERVER_HOST` | Secret | IP o hostname del VPS (el mismo que usa mayan-transfer-backend) |
| `SERVER_USER` | Secret | Usuario SSH de despliegue |
| `SERVER_SSH_KEY` | Secret | Clave privada SSH con acceso a ese usuario — los Secrets no se comparten entre repos, aunque sea el mismo VPS hay que volver a cargarla aquí |
| `DATABASE_URL` | Secret | Cadena de conexión a Postgres — puede ser una base `absolute_pos` nueva en el mismo Postgres que usa mayan-transfer-backend, o uno aparte |
| `MASTER_API_KEY` | Secret | `openssl rand -hex 32` — nueva, no reutilizar la de otro proyecto |
| `JWT_SECRET` | Secret | `openssl rand -hex 32` — nueva |
| `NODE_ENV` | Variable | `production` |
| `PORT` | Variable | Puerto libre en ese VPS (ej. `3001` si 3000 ya está tomado) |

## Ejecutar localmente

## Requisitos

- Node.js y un Postgres accesible (local o remoto) — configura `DATABASE_URL` en `.env`
  (ver `.env.example`).
- Genera `MASTER_API_KEY` y `JWT_SECRET` con `openssl rand -hex 32` cada uno.

```bash
cp .env.example .env
# edita .env con tu DATABASE_URL real, MASTER_API_KEY y JWT_SECRET

npx prisma migrate deploy
npm run start:dev   # o: npm run build && npm run start:prod
curl http://localhost:3000/health
```

## Dar de alta el primer negocio + emparejar una caja

```bash
MASTER_KEY="<valor de MASTER_API_KEY en .env>"
BASE="http://localhost:3000"

# 1. Crear el negocio (name + slug)
curl -s -X POST $BASE/admin/businesses \
  -H "Authorization: Bearer $MASTER_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Mi Negocio","slug":"mi-negocio"}'
# -> { "id": "<businessId>", "slug": "mi-negocio", ... }

# 2. Generar un código de emparejamiento de un solo uso (expira en 30 min)
curl -s -X POST $BASE/admin/businesses/<businessId>/devices/pairing-codes \
  -H "Authorization: Bearer $MASTER_KEY"
# -> { "code": "A1B2C3D4E5", "expiresAt": "..." }

# 3. Desde el wizard de primer arranque del desktop (o por curl para probar):
#    slug + código + nombre de caja -> device api key propio, sin master key.
curl -s -X POST $BASE/devices/pair \
  -H "Content-Type: application/json" \
  -d '{"slug":"mi-negocio","pairingCode":"A1B2C3D4E5","deviceName":"CAJA-1"}'
# -> { "clientId": "<businessId>", "deviceApiKey": "<plaintext, se guarda hasheado>" }
```

El `deviceApiKey` devuelto por `/devices/pair` es exactamente lo que
`absolute-pos-app` guarda en `cloud_device_api_key` tras completar el wizard —
no hace falta pegarlo a mano si se usa ese flujo.

Alternativa sin código de emparejamiento (crear el device directamente con la master
key, útil para debug): `POST /admin/businesses/<businessId>/devices` con `{"label":"..."}`.

## Bootstrapping del primer usuario mobile + login

```bash
curl -s -X POST $BASE/admin/businesses/<businessId>/users \
  -H "Authorization: Bearer $MASTER_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Dueño","username":"admin","password":"<password real>","role":"admin"}'

curl -s -X POST $BASE/auth/login \
  -H "Authorization: Bearer <device apiKey>" -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<password real>"}'
# -> { "token": "<jwt, úsalo como Bearer en /sales, /products, /inventory-movements, /cash-*>", "user": {...} }
```

Una vez logueado como `admin`, se pueden crear más cajeros desde la app misma vía
`POST /users` (JWT, sin master key) en vez de repetir el bootstrap de `/admin/*`.

## Tiempo real entre cajas

`wss://<host>/ws?token=<deviceApiKey>` — al conectar, el dispositivo recibe
`{"type":"sync-changed","table":"..."}` cada vez que otra caja del mismo negocio hace
push de cambios. Puramente informativo: si un dispositivo nunca conecta, el polling de
`/sync/pull` sigue funcionando igual.

## Backups

No automatizado todavía. Mientras tanto, `pg_dump` manual contra el Postgres que estés
usando.
