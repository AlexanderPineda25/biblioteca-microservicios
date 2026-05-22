# Chatbot Service

Microservicio IA conversacional para Biblioteca U.

## Responsabilidad

`chatbot-service` responde preguntas del usuario autenticado desde el widget del frontend. Usa contexto del catalogo y proveedores externos de IA:

- Gemini.
- Groq.
- OpenRouter.

Tambien publica eventos en Redis Streams para registrar el ciclo de cada conversacion.

## Endpoints

```text
GET  /api/chatbot/health
POST /api/chatbot/messages
```

`POST /api/chatbot/messages` requiere:

```http
Authorization: Bearer <JWT>
```

Payload:

```json
{
  "message": "Que libros disponibles tienes sobre microservicios?",
  "conversationId": "opcional",
  "history": []
}
```

## Variables

```env
PORT=3003
AUTH_SERVICE_URL=http://identity-service:5132
CATALOG_SERVICE_URL=http://catalog-service:3002
CORS_ORIGINS=http://localhost:4173,http://localhost:5173

CHATBOT_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
GROQ_API_KEY=...
GROQ_MODEL=llama-3.1-8b-instant
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=mistralai/mistral-7b-instruct:free

REDIS_URL=redis://redis:6379
CHATBOT_STREAM_NAME=chatbot_events
CHATBOT_STREAM_GROUP=chatbot_logger
```

## Proveedores IA

El servicio ordena proveedores asi:

1. `CHATBOT_PROVIDER` si esta configurado y tiene clave.
2. Resto de proveedores con clave disponible.
3. Respuesta local de fallback si todos fallan.

Gemini usa `GEMINI_MODEL` y tambien intenta modelos alternativos compatibles si el modelo principal no esta disponible.

## Redis Streams

Stream: `chatbot_events`.

Eventos:

- `chat.message.received`.
- `chat.message.completed`.
- `chat.message.failed`.

Comandos:

```powershell
docker compose exec -T redis redis-cli XLEN chatbot_events
docker compose exec -T redis redis-cli XINFO STREAM chatbot_events
docker compose logs --tail=120 chatbot-service
```

## Desarrollo local

```powershell
npm install
$env:PORT="3003"
$env:AUTH_SERVICE_URL="http://localhost:5132"
$env:CATALOG_SERVICE_URL="http://localhost:3002"
$env:REDIS_URL="redis://localhost:6379"
npm run dev
```

## Verificacion

```powershell
node --check index.js
node --check src/app.js
node --check src/services/chatbot.service.js
npm audit --audit-level=high
```
