# Facturify API

API multiempresa para que POS, ERP, ecommerce y otros sistemas consuman una interfaz uniforme de facturación electrónica.

## Estado actual

Fase 0–1 en curso: base NestJS, contrato HTTP inicial, Swagger y modelo inicial de empresa. La conexión con SUNAT aún no está implementada.

## Ejecutar localmente

1. Copia `.env.example` como `.env`.
2. Ejecuta `npm install`.
3. Inicia PostgreSQL con `docker compose up -d postgres`.
4. Ejecuta `npm run start:dev`.

La API queda en `http://localhost:3000/api/v1/health` y Swagger en `http://localhost:3000/docs`.

## Ejecutar todo con Docker

1. Copia `.env.docker.example` como `.env` y reemplaza los tres secretos.
2. La clave `SECRETS_ENCRYPTION_KEY` debe ser Base64 de exactamente 32 bytes.
3. Ejecuta `docker compose up --build`.

Docker espera a que PostgreSQL esté saludable, aplica las migraciones pendientes y luego inicia la API en `http://localhost:3000`. Swagger queda disponible en `http://localhost:3000/docs`.

## Contrato inicial

- `GET /api/v1/health`
- `POST /api/v1/companies`
- `GET /api/v1/companies`

El trabajo asignado a Antigravity está definido en `docs/ANTIGRAVITY-HANDOFF.md`.
