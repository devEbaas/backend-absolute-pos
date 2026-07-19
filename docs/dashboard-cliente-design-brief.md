# Brief de diseño — Dashboard Admin de Cliente (Business Admin)

## 1. Contexto

Este backend (`backend-absolute-pos`, NestJS + Prisma/Postgres) es multi-tenant: cada `Business` es un negocio/cliente con sus propios `Device` (cajas POS), `User` (cajeros/admin, roles `admin`/`cashier`), `Product`, `Sale`, `CashSession`/`CashCut`/`CashOutflow` e `InventoryMovement`.

Hoy solo existe un dashboard de **platform admin** (operador de la plataforma, cross-tenant, repo `pos-root-dashboard`). Este brief es para un **dashboard nuevo, distinto**: el que usa el **dueño/admin de un negocio individual** (`User.role === "admin"`) para ver resúmenes, gráficas, gestionar usuarios y revisar cortes de caja de **su propio negocio** (`businessId` fijo, tomado del JWT).

**Delimitación de alcance importante**: este dashboard es exclusivamente para el **dueño del negocio/cliente**, no para el operador de la plataforma. Por eso quedan explícitamente **fuera**: alta/baja de dispositivos, generación de códigos de emparejamiento y revocación de cajas — son operaciones de administración a nivel plataforma (equivalentes a dar de alta infraestructura), no algo que el dueño de una tienda deba o pueda hacer desde aquí. Ver detalle en §7.

Prioridad del dueño, en orden: **reportes/ventas, cortes de caja, usuarios activos** — información operativa del día a día, con la mayor frescura posible ("tiempo real" o cercano a él), para administrar la tienda.

## 2. Usuario objetivo

- Dueño/gerente de un comercio (retail/restaurante pequeño-mediano) que usa una o varias cajas (Devices) con cajeros.
- No es técnico. Necesita ver "¿cómo va mi negocio hoy/esta semana?", "¿cuadraron las cajas?", "¿quién vendió qué?", sin fricción.
- Accede desde escritorio principalmente (podría ser tablet); sesiones frecuentes y cortas (revisar al abrir/cerrar el negocio).

## 3. Viabilidad técnica confirmada (verificado en código, no solo en el schema)

Se revisaron los guards y controllers reales (`auth.controller.ts`, `device-auth.guard.ts`, `admin-role.guard.ts`, `devices.controller.ts`, `users.controller.ts`, `products.controller.ts`, `cash.service.ts`). Conclusión: **el modelo de datos alcanza para todo el dashboard**, pero la capa de API/autenticación actual **no permite construirlo tal cual está** — hay un bloqueador crítico antes de llegar a cualquier pantalla, más varios endpoints mal gateados y otros inexistentes.

### 🔴 Bloqueador crítico: no hay forma de iniciar sesión desde un navegador

`POST /auth/login` está protegido por `DeviceAuthGuard` (`auth.controller.ts:15`), que exige un **device API key** en el header para resolver a qué `businessId` pertenece el usuario, **antes** de revisar username/password (`device-auth.guard.ts:28-46`). Un dashboard web standalone no tiene ni tendrá ese device API key — no es una caja POS emparejada.

**Hoy no existe ningún camino para que el admin de un negocio inicie sesión desde un dashboard web.** Esto debe resolverse primero: un endpoint nuevo tipo `POST /business-admin/login` (por slug de negocio + username/password, sin depender de un device) que emita el mismo shape de JWT (`{businessId, role, ...}`) que ya usa el resto del sistema.

### 🟡 Patrón repetido: lo que sí existe está gateado para el rol equivocado

Existe `AdminRoleGuard` (`admin-role.guard.ts:13`, valida `req.auth.role === 'admin'`) pero **no está enganchado a ningún controller todavía**. Varios servicios que el dashboard necesita ya están programados, pero expuestos solo a *platform admin* (`AdminAccessGuard` = master key o JWT de operador), no a *business admin*:

| Dato | Servicio ya existe | Guard actual | ¿Accesible con JWT de business-admin? |
|---|---|---|---|
| Usuarios completos (email/phone/status) | `users.service.ts:98 findAllForBusinessAdmin` | `AdminAccessGuard` | ❌ No |
| Dispositivos, pairing codes, revocar | `devices.controller.ts:14` | `AdminAccessGuard` | ❌ No |
| Catálogo de productos (listado) | `products.controller.ts:27` | `DeviceAuthGuard` | ❌ No (pide device, no JWT) |
| `BusinessSetting` (config del negocio) | **no existe ningún controller/service** (grep vacío) | — | ❌ No existe en absoluto |

Es decir: **Usuarios** y **Dispositivos** ya tienen el servicio hecho — solo falta exponerlo con `JwtAuthGuard + AdminRoleGuard` en vez de `AdminAccessGuard` (esfuerzo bajo). **Configuración** hay que construirla de cero.

### 🟢 Lo que confirma ser directo

`cash.service.ts:108-158` (`computeTotals`) ya resuelve la agregación de un corte de caja (ventas por método de pago, canceladas, retiros, efectivo esperado) con `prisma.aggregate` — patrón reutilizable 1:1 para `GET /reports/overview` y `GET /cash-cuts`. No hay que reinventar el cálculo, solo exponerlo como lectura/histórico en vez de solo "calcular al vuelo un corte nuevo".

### Veredicto por sección

| Sección | Datos | Endpoints hoy | Esfuerzo real |
|---|---|---|---|
| Resumen/KPIs/gráficas | ✅ suficientes | ❌ ninguno | Nuevo módulo `reports`, reutilizando lógica de `cash.service` |
| Ventas | ✅ suficientes | ❌ solo `POST` | Nuevo `GET /sales` con filtros |
| Caja/Cortes | ✅ suficientes | ❌ solo `POST` | Nuevo `GET /cash-cuts`, `/cash-sessions`, `/cash-outflows` |
| Inventario/Stock | ✅ suficientes (stock = `SUM(InventoryMovement)`) | ❌ ninguno | Nueva agregación, no existe en ningún lado aún |
| Usuarios (crear/listar) | ✅ | ⚠️ existe pero mal gateado | Bajo esfuerzo — solo cambiar guard |
| ~~Dispositivos~~ | — | — | **Fuera de alcance** — nivel plataforma, no dueño de negocio (ver §7) |
| ~~Configuración~~ | — | — | **Fuera de alcance por ahora** (ver §7) |
| **Login del dashboard** | — | ❌ bloqueado por diseño | **Debe resolverse primero — prerequisito de todo lo demás** |

### Endpoints a crear/ajustar

Todos protegidos con `JwtAuthGuard` + `AdminRoleGuard` (enganchándolo por fin a algo), filtrando siempre por `req.auth.businessId`:

| Endpoint | Tipo de cambio | Para qué pantalla |
|---|---|---|
| `POST /business-admin/login` (o similar) | **nuevo, crítico** | Login del dashboard — sin device |
| `GET /reports/overview?from&to` | nuevo | Resumen general (KPIs) |
| `GET /sales?from&to&deviceId&userId&page` | nuevo | Listado/detalle de ventas |
| `GET /reports/sales-by-day?from&to` | nuevo | Gráfica de ventas en el tiempo |
| `GET /reports/sales-by-payment-method?from&to` | nuevo | Gráfica método de pago |
| `GET /reports/top-products?from&to&limit` | nuevo | Top productos |
| `GET /cash-cuts?from&to&sessionId` | nuevo (reusa `computeTotals`) | Histórico de cortes |
| `GET /cash-sessions?status&from&to` | nuevo | Sesiones de caja abiertas/cerradas |
| `GET /cash-outflows?sessionId` | nuevo | Detalle de retiros por sesión |
| `GET /inventory-movements?productId&from&to` | nuevo | Kardex / historial de stock |
| `GET /products?includeStock=true` | nuevo (o reguard el actual) | Catálogo con stock derivado |
| `GET /business-admin/users` | **cambiar guard** de `findAllForBusinessAdmin` a `JwtAuthGuard+AdminRoleGuard` | Gestión de usuarios (crear ya cubierto por `POST /users` vía `DeviceOrAdminGuard`) |
| `GET /cash-sessions?status=open` (ya listado arriba) | — | "Usuarios activos ahora" / cajas abiertas — ver nota de tiempo real abajo |

**Explícitamente fuera de este alcance**: no se toca `devices.controller.ts` (`admin/businesses/:businessId/devices`) ni se construye `BusinessSetting` CRUD — quedan reservados a platform admin / backlog futuro (ver §7).

Esto es información para el equipo de dev, no necesariamente para el diseñador — pero condiciona qué se muestra como dato real vs. qué se diseña con datos mock por ahora.

### Nota sobre "tiempo real"

Ya existe infraestructura de WebSocket (`src/realtime/sync.gateway.ts`) pero **autentica solo con device API key** (`extractToken` + `hashApiKey`, `sync.gateway.ts:29-40`), pensada para avisarle a cajas hermanas que hagan pull tras un push — no acepta JWT de business-admin tal cual. Para que el dashboard tenga datos "en vivo" hay dos caminos, de menor a mayor esfuerzo:

1. **Polling corto (v1 recomendado)**: refrescar KPIs/estado de cajas cada 15-30s vía los `GET` normales. Cero cambios de infraestructura, resultado percibido como "casi tiempo real".
2. **Extender el gateway**: aceptar también JWT de business-admin en `handleConnection` y emitir eventos nuevos (`sale-created`, `cash-session-opened/closed`) para push real. Mayor esfuerzo, dejar como iteración futura si el polling no es suficiente.

Para el diseño visual, esto no cambia nada — se diseña como si los datos se refrescaran solos (indicar sutilmente "última actualización hace Xs" es buena práctica).

## 4. Arquitectura de información (navegación)

Sidebar principal, 5 secciones (sin Dispositivos ni Configuración — ver §7):

1. **Resumen (Home/Overview)** — la más importante, con datos "en vivo"
2. **Ventas**
3. **Caja / Cortes**
4. **Inventario / Productos**
5. **Usuarios**

Header: nombre del negocio (`Business.name`), selector de rango de fechas global (hoy/7d/30d/custom) cuando aplique, selector de caja/registerId si el negocio tiene más de una (el dueño sigue viendo *estado* de sus cajas — sesión abierta/cerrada — solo no las administra como dispositivos; eso es distinto y se mantiene, ver 5.1).

## 5. Detalle por pantalla

### 5.1 Resumen (Home)
Objetivo: vista de un vistazo al abrir el dashboard.

- **KPIs (stat tiles)**: Ventas totales del período, # transacciones, ticket promedio, ventas canceladas (monto + count), diferencia de efectivo acumulada (si hay cortes con `cashDifference` negativo, alertar).
- **Usuarios activos ahora**: cajeros con sesión de caja abierta en este momento (`CashSession.status === 'open'`) — quién está trabajando, desde qué caja, desde qué hora. Es el dato "en vivo" más directo que el dueño quiere ver al abrir el dashboard.
- **Gráfica principal**: ventas por día (línea o barras) del período seleccionado, con comparación vs. período anterior si es sencillo.
- **Gráfica secundaria**: ventas por método de pago (dona/barras apiladas) — `paymentMethod` de `Sale`.
- **Top productos**: tabla o barras horizontales, top 5-10 por cantidad/ingreso (`SaleItem` agrupado).
- **Estado de cajas**: mini-tarjetas por sesión de caja abierta — "Caja Principal: abierta desde 8:00am, $X en ventas, atendida por [cajero]" — para saber si algo quedó abierto sin cerrar. (Esto es *estado operativo* de una sesión, no gestión del `Device` como hardware/instalación — eso sigue fuera de este dashboard, ver §7.)
- **Alertas**: cortes con diferencia de efectivo, productos con stock bajo (si se define un umbral).

### 5.2 Ventas
- Tabla de ventas con filtros: rango de fecha, cajero (`User`), caja (`Device`/`registerId`), método de pago, estado (canceladas/activas).
- Columnas: fecha/hora, folio, cajero, caja, total, método de pago, estado.
- Detalle de venta (modal o panel lateral): `SaleItem`s (producto, cantidad, precio unitario, subtotal), descuento aplicado, si fue cancelada: motivo, quién canceló, cuándo.
- Exportable (CSV) — nice-to-have, no crítico para v1 de diseño.

### 5.3 Caja / Cortes
- Vista de **sesiones de caja**: lista con estado (abierta/cerrada), cajero, caja, monto de apertura, fecha apertura/cierre.
- Al entrar a una sesión: detalle del **corte (`CashCut`)** — ventas en efectivo/tarjeta/otro, total ventas, ventas canceladas, retiros (`CashOutflow` — lista con motivo y monto), efectivo esperado vs. efectivo contado (`actualCash`) y **diferencia** (`cashDifference`) resaltada en verde/rojo según signo.
- Histórico de cortes filtrable por fecha/cajero, para detectar patrones de descuadre.

### 5.4 Inventario / Productos
- Catálogo de productos: nombre, código de barras, precio venta, costo, stock derivado (suma de `InventoryMovement`), estado activo/inactivo, variantes (si `parentProductId`).
- Kardex por producto: historial de movimientos (`IN`/`OUT`, cantidad, referencia — venta/ajuste manual, usuario, fecha).
- Alta/edición de producto (formulario simple).
- Promociones activas (`Promotion` + `PromotionProduct`) — sección secundaria, listado simple.

### 5.5 Usuarios
- Listado de usuarios del negocio: nombre, username, rol (admin/cashier), estado activo/inactivo, email/teléfono, fecha de alta.
- Alta de usuario: nombre, username, password, rol (solo `admin`/`cashier` — no hay más roles), email/teléfono opcionales.
- Activar/desactivar usuario (soft, vía `active`).
- Nota de diseño: **solo dos roles existen** — no diseñar selector de permisos granular, es un simple toggle admin/cashier.

## 6. Consideraciones de diseño

- **Single-tenant view**: a diferencia del dashboard de platform admin (que compara entre negocios), aquí todo es scoped a un negocio — no hay selector de "cliente/tenant", solo el nombre del negocio en el header.
- **Roles dentro del dashboard**: si en el futuro se permite que un `cashier` entre con vista limitada, dejar la IA (arquitectura de información) preparada para ocultar secciones (p.ej. Usuarios) según rol — pero v1 asume que solo `admin` (dueño) accede.
- **Estados vacíos**: negocio recién creado sin ventas/cortes — diseñar empty states amigables (no solo tablas vacías).
- **Diferencias de caja**: es el dato más "emocional" para el dueño (dinero faltante) — dar tratamiento visual claro (color, icono de alerta) en Resumen y en Caja.
- **Multi-caja**: un negocio puede tener varias sesiones/`registerId` — el diseño debe soportar filtrar/comparar por caja, no asumir una sola. Esto es distinto de administrar `Device` como hardware (fuera de alcance).
- **Responsive**: prioridad desktop, pero que no rompa en tablet (uso común en mostrador).
- **Gráficas**: usar la skill `dataviz` al momento de construir las gráficas reales (paleta y specs de marks) para consistencia visual.
- **Sensación de "vivo"**: aunque v1 use polling (ver nota en §3), diseñar como si los datos se refrescaran solos — indicador sutil de "última actualización hace Xs", sin necesidad de botón de refresh manual como interacción principal.

## 7. Fuera de alcance

**Reservado a platform admin (el dueño del sistema, no el dueño de la tienda) — no se construye en este dashboard:**
- Gestión de dispositivos: alta de `Device`, generación de códigos de emparejamiento (`PairingCode`), revocación de cajas. Esto sigue siendo exclusivo de `pos-root-dashboard`.
- Configuración del negocio (`BusinessSetting`) — se retira del alcance por ahora, queda como backlog futuro si se decide dársela al dueño más adelante.
- Alta/gestión de otros negocios (`Business`) — obviamente, es de plataforma.

**Fuera de alcance por límites del modelo de datos:**
- Reportes multi-sucursal (no existe entidad Branch, cada negocio es la unidad).
- CRM / datos de cliente final comprador (no existe entidad Customer).
- Permisos granulares más allá de admin/cashier.
- Exportes avanzados / BI embebido.
