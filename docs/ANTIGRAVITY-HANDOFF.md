# Handoff para Antigravity — Fase 1

Codex es dueño de `prisma/`, `src/app.module.ts`, `src/main.ts`, `src/core/` y `src/sunat/`.

Antigravity puede empezar ahora y trabajar solamente en estas rutas nuevas:

- `src/auth/`: JWT, roles y guards.
- `src/api-keys/`: crear, rotar, revocar y validar API Keys (sin modificar Prisma).
- `src/webhooks/`: registro, firma HMAC y entrega con reintentos.
- `test/`: pruebas unitarias de esos módulos.

Debe consumir los contratos publicados en Swagger (`/docs`) y entregar cambios en una rama separada. No debe editar el modelo `Company` ni conectarse aún con SUNAT.

## Siguiente tarea — Fase 2

Codex ya publicó `DocumentsService` y el contrato genérico `POST /api/v1/documents`.

Antigravity puede crear, sin editar `src/documents/`, `prisma/`, `src/app.module.ts` ni `src/sunat/`:

- `src/invoices/`: fachada `POST /invoices` que use `DocumentsService` y fije el tipo `INVOICE`.
- `src/receipts/`: fachada `POST /receipts` que use `DocumentsService` y fije el tipo `RECEIPT`.
- `test/invoices.spec.ts` y `test/receipts.spec.ts`: validación y delegación con mocks.

Ambas rutas deben exigir `ApiKeyGuard` y recibir una API Key mediante `Authorization: Bearer fact_live_...`.
Codex importará estos módulos al terminar y se encargará de las notas, XML, firma y SUNAT.

## Siguiente tarea — Persistencia

Codex definió los modelos Prisma `AdminUser`, `ApiKey`, `Webhook` y `WebhookDelivery`.

Cuando Codex confirme la validación del esquema, Antigravity deberá sustituir los `Map` y arreglos en memoria de sus servicios por `PrismaService`, sin modificar `prisma/schema.prisma`:

- `AuthService`: administradores persistentes y bootstrap transaccional de una sola ejecución.
- `ApiKeysService`: persistir únicamente el hash; la llave completa se devuelve una vez.
- `WebhooksService`: cifrar `whsec_...` usando `SecretsEncryptionService` y persistir entregas.

Las respuestas públicas deben seguir ocultando hashes, salts y secretos cifrados.

## Tarea paralela — Almacenamiento de artefactos

Antigravity puede crear únicamente `src/storage/` y `test/storage.spec.ts`:

- Definir `DocumentStorage` con operaciones para guardar y recuperar XML, ZIP y CDR.
- Implementar almacenamiento local configurable mediante `DOCUMENT_STORAGE_PATH`.
- Evitar path traversal y nombres suministrados directamente por clientes.
- Calcular SHA-256, tamaño y MIME type de cada artefacto.
- Usar escritura atómica y devolver metadatos, nunca rutas internas arbitrarias.
- No modificar `prisma/`, `src/app.module.ts`, `src/documents/`, `src/xml/` ni `src/sunat/`.
