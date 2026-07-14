# Deploy to Hetzner

Prerequisites on the VPS: Docker + Docker Compose plugin installed, DNS A records for
`backend-pos.bekadev.online` and `pos-web.bekadev.online` pointing at the VPS IP,
ports 80/443 free (nothing else on the box binds them).

```bash
git clone <this-repo-url> absolute-pos-backend
cd absolute-pos-backend
cp .env.example .env
# edit .env: set POSTGRES_PASSWORD and MASTER_API_KEY to real random values
# (openssl rand -hex 32), confirm DOMAIN_API/DOMAIN_WEB match your DNS.

docker compose up -d --build
docker compose logs -f api   # confirm "No pending migrations" / migrations applied, then Nest boot log
curl https://backend-pos.bekadev.online/health
```

Caddy requests/renews Let's Encrypt certificates automatically on first request to each
domain — the first `curl` may take a few seconds while that happens.

## Bootstrapping the first business + device (no dashboard yet)

```bash
MASTER_KEY="<value of MASTER_API_KEY from .env>"

curl -s -X POST https://backend-pos.bekadev.online/admin/businesses \
  -H "Authorization: Bearer $MASTER_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Mi Negocio"}'
# -> { "id": "<businessId>", ... }

curl -s -X POST https://backend-pos.bekadev.online/admin/businesses/<businessId>/devices \
  -H "Authorization: Bearer $MASTER_KEY" -H "Content-Type: application/json" \
  -d '{"label":"CAJA-1"}'
# -> { "id": "...", "apiKey": "<plaintext, shown once>" }
```

Paste the returned `apiKey` into the Electron app's `cloud_device_api_key` setting.
(`/admin/*` endpoints land in A2 — not present in the initial scaffold from A1.)

## Updating

```bash
git pull
docker compose up -d --build api
```

`prisma migrate deploy` runs automatically as part of the `api` container's startup
command — new migrations apply on every restart, no separate step needed.

## Backups

Not automated yet (tracked as a Phase A hardening item). Manual dump in the meantime:

```bash
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > backup-$(date +%F).sql.gz
```
