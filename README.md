# Facturify API

API multiempresa de facturación electrónica para Perú, construida con NestJS, TypeScript, Prisma y PostgreSQL. Permite a sistemas POS, ERP, e-commerce y SaaS crear comprobantes UBL 2.1, firmarlos, enviarlos a SUNAT, procesar CDR y recibir eventos mediante webhooks.

## Estado

- Superficie versionada bajo `/api/v1`.
- Docker Compose validado con PostgreSQL 17 y migraciones Prisma.
- 53 suites y 913 pruebas unitarias/contractuales aprobadas.
- 6 pruebas E2E contra la imagen Docker aprobadas.
- Imagen de ejecución sin dependencias de desarrollo ni vulnerabilidades conocidas al construirla.

> Cada despliegue debe configurar secretos, certificado digital y credenciales SOL, y homologar el flujo con SUNAT. Que el API funcione localmente no equivale a una homologación tributaria.

## Autenticación y aislamiento

| Superficie | Cabecera | Uso |
|---|---|---|
| Administración | `Authorization: Bearer <JWT>` | Administradores, empresas, certificados, credenciales SOL, API Keys y auditoría |
| Integración | `Authorization: Bearer fact_live_...` | Comprobantes, SUNAT, artefactos y webhooks de una empresa |

Los JWT administrativos contienen únicamente claims de seguridad y duran como máximo ocho horas. Las API Keys se guardan mediante hash SHA-256 y su valor completo se muestra solo al crearlas o rotarlas. En rutas de integración, `companyId` procede exclusivamente de la API Key: nunca del cuerpo, URL o query string.

Controles principales: hashes de contraseña `scrypt$v1`, rate limiting de autenticación, cifrado AES-256-GCM de secretos, validación PKCS#12, importes con `Prisma.Decimal`, idempotencia persistente, Outbox transaccional, webhooks HMAC-SHA256, defensa SSRF/DNS y errores sin stack traces públicos.

## Requisitos

- Recomendado: Docker Engine y Docker Compose.
- Desarrollo local: Node.js 20+, PostgreSQL 15+ y OpenSSL.
- Las imágenes incluidas usan Node.js 24 Alpine y PostgreSQL 17 Alpine.

## Configuración

```bash
cp .env.docker.example .env       # Docker
# o
cp .env.example .env              # desarrollo local
npm ci
npx prisma generate
```

No almacenes `.env`, certificados, credenciales SOL ni API Keys en Git.

| Variable | Descripción |
|---|---|
| `NODE_ENV` | `development`, `test` o `production` |
| `PORT` | Puerto HTTP; predeterminado `3000` |
| `DATABASE_URL` | Conexión PostgreSQL |
| `JWT_SECRET` | Secreto distinto de al menos 32 bytes |
| `BOOTSTRAP_ADMIN_TOKEN` | Token distinto de al menos 32 bytes |
| `SECRETS_ENCRYPTION_KEY` | Base64 estricto que decodifique exactamente 32 bytes |
| `SWAGGER_ENABLED` | Habilita `/docs`; `false` por defecto en Docker |
| `DOCUMENT_STORAGE_PATH` | Directorio de XML, ZIP y CDR |
| `CERTIFICATES_STORAGE_PATH` | Directorio de certificados cifrados |
| `CERTIFICATE_MAX_SIZE_BYTES` | Límite del PKCS#12 |
| `STORAGE_MAX_XML_BYTES` | Límite de XML |
| `STORAGE_MAX_ZIP_BYTES` | Límite de ZIP |
| `STORAGE_MAX_CDR_BYTES` | Límite de CDR |
| `SUNAT_TIMEOUT_MS` | Timeout de transporte SUNAT |
| `OUTBOX_POLL_INTERVAL_MS` | Intervalo del procesador Outbox |
| `OUTBOX_BATCH_SIZE` | Eventos por ciclo |

```bash
openssl rand -base64 48   # JWT_SECRET
openssl rand -base64 48   # BOOTSTRAP_ADMIN_TOKEN, diferente
openssl rand -base64 32   # SECRETS_ENCRYPTION_KEY
openssl rand -base64 36   # POSTGRES_PASSWORD
```

## Docker

```bash
docker compose up --build -d
docker compose ps
docker compose logs -f api
```

Compose inicia PostgreSQL sin publicar su puerto, espera el health check, ejecuta `prisma migrate deploy` y después inicia la API. `docker compose down` conserva los volúmenes; `down -v` elimina base y artefactos locales de forma irreversible.

## Desarrollo local

```bash
npm ci
npx prisma generate
npx prisma migrate dev
npm run start:dev
```

- API: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/docs`, solo con `SWAGGER_ENABLED=true`

En producción usa `prisma migrate deploy`, nunca `prisma migrate dev`.

## Inicio rápido

Los ejemplos asumen `BASE_URL=http://localhost:3000/api/v1`.

### Bootstrap y login

El bootstrap funciona una sola vez.

```bash
curl -X POST "$BASE_URL/auth/bootstrap" -H "Content-Type: application/json" -d '{
  "email":"owner@example.com",
  "name":"Administrador Principal",
  "password":"UseUnaClaveUnica!2026",
  "bootstrapToken":"VALOR_DE_BOOTSTRAP_ADMIN_TOKEN"
}'

curl -X POST "$BASE_URL/auth/login" -H "Content-Type: application/json" -d '{
  "email":"owner@example.com",
  "password":"UseUnaClaveUnica!2026"
}'
```

Guarda `accessToken` como `ADMIN_JWT`.

### Empresa y API Key

```bash
curl -X POST "$BASE_URL/companies" \
  -H "Authorization: Bearer $ADMIN_JWT" -H "Content-Type: application/json" -d '{
  "ruc":"20131312955",
  "businessName":"Empresa autorizada",
  "environment":"BETA"
}'

curl -X POST "$BASE_URL/api-keys" \
  -H "Authorization: Bearer $ADMIN_JWT" -H "Content-Type: application/json" -d '{
  "companyId":"UUID_DE_EMPRESA",
  "name":"ERP principal",
  "environment":"live"
}'
```

Guarda `apiKey` inmediatamente: no vuelve a mostrarse.

### Factura

`companyId` y `type` no se envían: la API Key identifica la empresa y la ruta fija `INVOICE`.

```bash
curl -X POST "$BASE_URL/invoices" \
  -H "Authorization: Bearer $FACTURIFY_API_KEY" \
  -H "Idempotency-Key: invoice-F001-00000001" \
  -H "Content-Type: application/json" -d '{
  "series":"F001",
  "number":1,
  "customerDocumentType":"6",
  "customerDocumentNumber":"20131312955",
  "customerName":"Cliente autorizado",
  "currency":"PEN",
  "items":[{"description":"Servicio","quantity":1,"unitPrice":1000.00}]
}'
```

La creación deja el documento en `PENDING`. El envío es independiente:

```bash
curl -X POST "$BASE_URL/documents/UUID_DOCUMENTO/send" \
  -H "Authorization: Bearer $FACTURIFY_API_KEY" \
  -H "Idempotency-Key: send-UUID_DOCUMENTO"
```

El envío requiere credenciales SOL y un certificado activo y válido.

## Superficie HTTP

Todas las rutas llevan el prefijo `/api/v1`.

### Anónimas

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado general |
| GET | `/health/live` | Liveness sin dependencias |
| GET | `/health/ready` | Readiness PostgreSQL; 503 si falla |
| POST | `/auth/bootstrap` | Primer SUPERADMIN |
| POST | `/auth/login` | JWT administrativo |

Health devuelve exclusivamente `{ status, timestamp }`.

### Administración — JWT

| Método | Ruta | Roles |
|---|---|---|
| POST | `/auth/register` | SUPERADMIN |
| GET | `/auth/profile` | ADMIN, SUPERADMIN |
| POST, GET | `/companies` | ADMIN, SUPERADMIN |
| POST | `/certificates` | ADMIN, SUPERADMIN |
| POST, GET | `/certificates/company/:companyId` | ADMIN, SUPERADMIN |
| PATCH | `/certificates/:id/deactivate` | ADMIN, SUPERADMIN |
| PATCH | `/certificates/company/:companyId/:id/deactivate` | ADMIN, SUPERADMIN |
| DELETE | `/certificates/:id` | ADMIN, SUPERADMIN |
| PUT, DELETE | `/companies/:companyId/sunat-credentials` | ADMIN, SUPERADMIN |
| GET | `/companies/:companyId/sunat-credentials/status` | ADMIN, SUPERADMIN |
| POST | `/api-keys` | ADMIN, SUPERADMIN |
| GET | `/api-keys/company/:companyId` | ADMIN, SUPERADMIN |
| POST | `/api-keys/:id/rotate` | ADMIN, SUPERADMIN |
| DELETE | `/api-keys/:id` | ADMIN, SUPERADMIN |
| GET | `/audit-events` | ADMIN, SUPERADMIN |

Los certificados se reciben como JSON con `companyId`, `pfxBase64`, `password`, `validFrom`, `validUntil` y metadatos opcionales; actualmente no se usa multipart. Las respuestas no incluyen el PKCS#12 ni su contraseña.

### Integradores — API Key

| Método | Ruta | Idempotency-Key |
|---|---|:---:|
| GET | `/api-keys/verify` | No |
| POST | `/invoices` | Sí |
| POST | `/receipts` | Sí |
| POST | `/credit-notes` | Sí |
| POST | `/debit-notes` | Sí |
| GET | `/documents` | No |
| GET | `/documents/:id` | No |
| GET | `/documents/:id/xml` | No |
| GET | `/documents/:id/cdr` | No |
| POST | `/documents/:id/send` | Sí |
| POST | `/documents/daily-summaries` | Sí |
| POST | `/documents/daily-summaries/:id/status` | No |
| POST | `/documents/void-communications` | Sí |
| POST | `/documents/void-communications/:id/status` | No |
| POST, GET | `/webhooks` | No |
| DELETE | `/webhooks/:id` | No |
| GET | `/webhooks/deliveries` | No |
| POST | `/webhooks/test-dispatch` | No; solo desarrollo |
| POST | `/webhooks/verify-signature` | No; solo desarrollo |

No existe `POST /documents`; los comprobantes se crean mediante fachadas tipadas.

## Payloads adicionales

Boleta: mismo formato plano de factura, normalmente serie `B...`; los datos del receptor pueden ser opcionales según las reglas aplicables.

Nota de crédito/débito (la ruta fija el tipo y los datos del cliente se heredan del original):

```json
{
  "referenceDocumentId":"UUID_DOCUMENTO_ORIGINAL",
  "series":"FC01",
  "number":1,
  "reasonCode":"01",
  "reason":"Anulación de la operación",
  "currency":"PEN",
  "items":[{"description":"Reversión","quantity":1,"unitPrice":1000.00}]
}
```

Resumen diario: `{ "referenceDate": "2026-09-09" }`.

Comunicación de baja:

```json
{
  "referenceDate":"2026-09-09",
  "documents":[{"documentId":"UUID_DOCUMENTO","reason":"Error en los datos"}]
}
```

`GET /documents` acepta `status`, `type`, `series`, `createdFrom`, `createdUntil`, `limit` (1–100, predeterminado 20) y `cursor`.

## Idempotencia

`Idempotency-Key` debe tener 16–128 caracteres ASCII: letras, números, `_`, `-` o `.`. No tiene que ser UUID. La misma clave y cuerpo reutiliza el resultado; la misma clave con otro cuerpo devuelve `409 Conflict`. El fingerprint incluye el tenant.

## Estados y eventos

Estados: `DRAFT`, `PENDING`, `PROCESSING`, `SENT`, `ACCEPTED`, `OBSERVED`, `REJECTED`, `VOIDED` y `ERROR`. `REJECTED` y `VOIDED` son terminales; `ACCEPTED` u `OBSERVED` pasan a `VOIDED` solo con una baja confirmada.

Eventos públicos: `document.created`, `document.processing`, `document.accepted`, `document.observed`, `document.rejected`, `document.voided` y `document.error`.

## Webhooks

El secreto `whsec_...` se muestra una sola vez. La firma se envía como:

```http
X-Facturify-Signature: t=1725890000,v1=9f83...
```

Se consideran exitosos los `2xx`. Se reintentan errores de red, timeout y HTTP `408`, `425`, `429`, `500`, `502`, `503`, `504`, con máximo cinco intentos y `Retry-After` limitado a 15 minutos. En producción se exige HTTPS y se bloquean destinos locales, privados, link-local, CGNAT, loopback y metadata de nube.

## Errores

Formato representativo:

```json
{
  "statusCode":401,
  "error":"Unauthorized",
  "message":"Authorization header is missing.",
  "path":"/api/v1/companies",
  "timestamp":"2026-09-09T19:25:21.267Z",
  "requestId":"1168862a-ad68-4543-a2d5-bb9a90171cb4"
}
```

Usa el estado HTTP y los códigos públicos, no el texto de `message`. Conserva `requestId` para soporte.

## Pruebas

```bash
npm test                  # 53 suites / 913 pruebas
npm run test:e2e          # requiere Docker API en localhost:3000
npm run lint
npm run build
npx prisma validate       # requiere DATABASE_URL
```

Para otra URL: `E2E_API_URL=https://api.example.com npm run test:e2e`.

## Antes de producción

- Gestiona secretos fuera del repositorio y termina TLS en un proxy o balanceador.
- Configura backups cifrados de PostgreSQL y volúmenes de artefactos.
- Añade observabilidad y alertas para readiness, Outbox y errores SUNAT.
- Carga certificado vigente y credenciales SOL autorizadas.
- Valida facturas, boletas, notas, resúmenes, bajas y CDR en SUNAT Beta.
- Define rotación de secretos, certificados y API Keys.
- Mantén Swagger deshabilitado públicamente salvo necesidad controlada.

## Licencia

Software propietario desarrollado para Facturify. Todos los derechos reservados.
open source  
