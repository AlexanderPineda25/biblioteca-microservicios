# Biblioteca Microservicios

Carpeta de backends y servicios de infraestructura de Biblioteca U.

Este directorio esta listo para publicarse como repositorio backend independiente.

## Servicios

| Servicio | Ruta | Puerto | Descripcion |
| --- | --- | ---: | --- |
| Identity | `mini-identity-api-dotnet-main/mini-identity-api-dotnet-main` | 5132 | Autenticacion, JWT, roles y permisos |
| Catalog | `catalog-service` | 3002 | Libros, recomendador IA y eventos RabbitMQ |
| Chatbot | `chatbot-service` | 3003 | Chatbot IA con Gemini, Groq, OpenRouter y Redis Streams |
| PostgreSQL | Docker image | 5432 | Persistencia relacional |
| RabbitMQ | Docker image | 5672, 15672 | Eventos del catalogo |
| Redis | Docker image | 6379 | Stream de eventos del chatbot |

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

- Guia AKS: [DEPLOYMENT_AKS.md](DEPLOYMENT_AKS.md)
- Pipeline CI/CD: [CI_CD.md](CI_CD.md)
- Tecnologias: [TECHNOLOGIES.md](TECHNOLOGIES.md)

Manifiestos:

```text
k8s/base
k8s/overlays/aks
```

Validar render:

```powershell
kubectl kustomize k8s/overlays/aks
```

Pipeline:

```text
.github/workflows/backend-aks-ci-cd.yml
```

El pipeline despliega `identity-service`, `catalog-service` y `chatbot-service` de manera independiente con `kubectl set image`.

## Variables importantes

```env
AUTH_SERVICE_URL=http://identity-service:5132
CATALOG_SERVICE_URL=http://catalog-service:3002
RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
REDIS_URL=redis://redis:6379
HF_API_TOKEN=...
GEMINI_API_KEY=...
GROQ_API_KEY=...
OPENROUTER_API_KEY=...
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

Eventos RabbitMQ:

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
