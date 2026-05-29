# Biblioteca Microservicios

Carpeta de backends y servicios de infraestructura de Biblioteca U.

Este directorio esta listo para publicarse como repositorio backend independiente.

## Servicios

| Servicio | Ruta | Puerto | Descripcion |
| --- | --- | ---: | --- |
| Identity | `mini-identity-api-dotnet-main/mini-identity-api-dotnet-main` | 5132 | Autenticacion, JWT, roles y permisos |
| Catalog | `catalog-service` | 3002 | Libros, recomendador IA y eventos por Azure Service Bus |
| Chatbot | `chatbot-service` | 3003 | Chatbot IA con Gemini, Groq, OpenRouter y Redis Streams |
| Azure PostgreSQL | Managed service | 5432 | Persistencia relacional administrada |
| Azure Service Bus | Managed service | 443 | Eventos del catalogo |
| Azure Managed Redis | Managed service | 10000 | Stream de eventos del chatbot |

## Ejecucion recomendada

Desde la raiz del proyecto:

```powershell
docker compose --env-file .env up -d --build
```

Tambien existe un compose secundario en esta carpeta:

```powershell
cd biblioteca-microservicios
docker compose up -d --build
```

El compose secundario lee `../.env` para pasar las claves IA a los contenedores.

## Kubernetes y AKS

Documentacion del repo backend:

- Despliegue, CI/CD y datos administrados Azure: [DEPLOYMENT.md](DEPLOYMENT.md)

Manifiestos:

```text
k8s/base
k8s/overlays/aks
k8s/overlays/aks-no-domain
k8s/infrastructure/in-cluster
```

Validar render:

```powershell
kubectl kustomize k8s/overlays/aks-no-domain
kubectl kustomize k8s/infrastructure/in-cluster
```

Pipeline:

```text
.github/workflows/backend-aks-ci-cd.yml
```

El pipeline despliega `identity-service`, `catalog-service` y `chatbot-service` con manifiestos renderizados por release, usando imagenes `ACR_LOGIN_SERVER/biblioteca/<servicio>:<sha>` y evitando rollouts intermedios.

AKS cloud es app-only: no despliega Postgres ni Redis dentro del cluster. Esos manifests quedan en `k8s/infrastructure/in-cluster` solo para laboratorio o rollback.

Despliegue AKS verificado:

```text
http://52.158.169.2
ACR: acrbiblioalex25.azurecr.io
Imagenes: biblioteca/identity-service, biblioteca/catalog-service, biblioteca/chatbot-service
```

## Variables importantes

```env
AUTH_SERVICE_URL=http://identity-service:5132
CATALOG_SERVICE_URL=http://catalog-service:3002
DB_HOST=pg-biblioteca-edu-alex25.postgres.database.azure.com
DB_SSL=true
AZURE_SERVICE_BUS_QUEUE=library-logging-queue
REDIS_URL=rediss://:<redis-key>@redis-biblioteca-edu-alex25.centralus.redis.azure.net:10000
HF_API_TOKEN=...
GEMINI_API_KEY=...
GROQ_API_KEY=...
OPENROUTER_API_KEY=...
AZURE_SERVICE_BUS_CONNECTION_STRING=...
CHATBOT_PROVIDER=gemini
```

## Chatbot Service

Endpoints:

- `GET /api/chatbot/health`
- `POST /api/chatbot/messages`

Payload:

```json
{
  "message": "Recomiendame un libro disponible sobre arquitectura",
  "conversationId": "opcional",
  "history": [
    { "role": "user", "content": "Hola" },
    { "role": "assistant", "content": "Hola, en que te ayudo?" }
  ]
}
```

Respuesta:

```json
{
  "success": true,
  "data": {
    "conversationId": "uuid",
    "reply": "respuesta del asistente",
    "provider": "gemini",
    "model": "gemini-2.5-flash",
    "fallbackUsed": false,
    "redisStream": true
  }
}
```

Requiere header:

```http
Authorization: Bearer <JWT>
```

## Redis Streams

El stream usado por defecto es `chatbot_events`.

Comandos utiles:

```powershell
docker compose exec -T redis redis-cli XLEN chatbot_events
docker compose exec -T redis redis-cli XINFO STREAM chatbot_events
docker compose logs --tail=120 chatbot-service
```

Eventos:

- `chat.message.received`.
- `chat.message.completed`.
- `chat.message.failed`.

## Catalog Service

Endpoints principales:

- `GET /api/catalog/health`
- `GET /api/catalog/books`
- `POST /api/catalog/books`
- `POST /api/catalog/books/ai/recommendations`

Eventos Azure Service Bus:

- `book.created`.
- `book.recommended`.

Logs:

```powershell
docker compose logs -f catalog-service
```

## Pruebas rapidas

Health:

```powershell
Invoke-RestMethod http://localhost:3002/api/catalog/health
Invoke-RestMethod http://localhost:3003/api/chatbot/health
```

Estado:

```powershell
docker compose ps
```

Auditoria de dependencias del chatbot:

```powershell
cd biblioteca-microservicios/chatbot-service
npm audit --audit-level=high
```
