# Chatbot Service

Microservicio de IA conversacional para Biblioteca U.

## Tabla de Contenidos

- [Responsabilidad](#responsabilidad)
- [Endpoints](#endpoints)
- [Variables de Entorno](#variables-de-entorno)
- [Proveedores IA](#proveedores-ia)
- [Redis Streams](#redis-streams)
- [Desarrollo Local](#desarrollo-local)
- [Verificación](#verificación)

---

## Responsabilidad

`chatbot-service` responde preguntas del usuario autenticado desde el widget del frontend. Características:

- ✅ Autenticación JWT validada contra Identity Service
- ✅ Contexto dinámico del catálogo de libros
- ✅ Múltiples proveedores de IA con fallback automático
- ✅ Event logging en Redis Streams
- ✅ Soporte CORS configurable

**Proveedores de IA:**
- 🔵 Google Gemini (principal)
- ⚡ Groq Cloud (fallback 1)
- 🤖 OpenRouter (fallback 2)
- 📝 Respuesta local (fallback final)

---

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

Configura estas variables en `.env` o en el container:

```env
# Servidor
PORT=3003

# Servicios internos
AUTH_SERVICE_URL=http://identity-service:5132
CATALOG_SERVICE_URL=http://catalog-service:3002

# CORS
CORS_ORIGINS=http://localhost:4173,http://localhost:5173

# Proveedor principal
CHATBOT_PROVIDER=gemini

# Google Gemini
GEMINI_API_KEY=AIza_xxxxx
GEMINI_MODEL=gemini-2.5-flash

# Groq (fallback)
GROQ_API_KEY=gsk_xxxxx
GROQ_MODEL=llama-3.1-8b-instant

# OpenRouter (fallback)
OPENROUTER_API_KEY=sk-xxxxx
OPENROUTER_MODEL=mistralai/mistral-7b-instruct:free

# Redis Streams en AKS cloud usa Azure Managed Redis con TLS.
REDIS_URL=rediss://:<redis-key>@redis-biblioteca-edu-alex25.centralus.redis.azure.net:10000
CHATBOT_STREAM_NAME=chatbot_events
CHATBOT_STREAM_GROUP=chatbot_logger
```

---

## Proveedores IA

El servicio intenta proveedores en este orden:

1. **`CHATBOT_PROVIDER`** si está configurado y tiene clave
2. **Resto de proveedores** que tengan clave disponible
3. **Respuesta local** si todos fallan

### Comportamiento de fallback

```
Gemini disponible?
  ├─ SÍ → Usar Gemini
  └─ NO → Siguiente

Groq disponible?
  ├─ SÍ → Usar Groq
  └─ NO → Siguiente

OpenRouter disponible?
  ├─ SÍ → Usar OpenRouter
  └─ NO → Respuesta local
```

---

## Redis Streams

**Stream:** `chatbot_events`

En AKS, `REDIS_URL` viene de `Secret/biblioteca-secrets` y apunta a Azure Managed Redis. En desarrollo local puedes usar `redis://localhost:6379`.

**Eventos publicados:**
- `chat.message.received` - Se recibió un mensaje
- `chat.message.completed` - Se completó la respuesta
- `chat.message.failed` - Error en el procesamiento

**Comandos útiles:**

```powershell
# Ver cantidad de eventos
docker compose exec -T redis redis-cli XLEN chatbot_events

# Ver información del stream
docker compose exec -T redis redis-cli XINFO STREAM chatbot_events

# Ver últimos 5 eventos
docker compose exec -T redis redis-cli XREVRANGE chatbot_events + COUNT 5

# Monitorear eventos en tiempo real
docker compose exec -T redis redis-cli XREAD BLOCK 1000 STREAMS chatbot_events 0
```

---

## Desarrollo Local

```powershell
# Instalar dependencias
npm install

# Configurar variables
$env:PORT="3003"
$env:AUTH_SERVICE_URL="http://localhost:5132"
$env:CATALOG_SERVICE_URL="http://localhost:3002"
$env:REDIS_URL="redis://localhost:6379"
$env:GEMINI_API_KEY="tu_clave_aqui"

# Iniciar en desarrollo
npm run dev
```

La app estará en `http://localhost:3003`.

---

## Verificación

**Validar sintaxis:**
```powershell
node --check index.js
node --check src/app.js
node --check src/services/chatbot.service.js
```

**Auditar dependencias:**
```powershell
npm audit --audit-level=high
```

**Health check:**
```powershell
curl http://localhost:3003/api/chatbot/health
```

**Ver logs:**
```powershell
docker compose logs -f chatbot-service
```

---

## Despliegue

### Docker Compose (recomendado para desarrollo)

```powershell
# Desde la raíz del proyecto
docker compose up -d --build chatbot-service
```

### Kubernetes (AKS - producción)

```bash
# Render de manifiestos
kubectl kustomize biblioteca-microservicios/k8s/overlays/aks-no-domain | grep -A 50 chatbot

# Despliegue app-only, con Redis administrado fuera de AKS
kubectl apply -f /tmp/backend-rendered.yaml

# Verificar
kubectl get pods -n biblioteca -l app=chatbot-service
kubectl logs -n biblioteca -l app=chatbot-service --tail=50
```

---

## Troubleshooting

| Problema | Solución |
|----------|----------|
| **Redis connection refused** | Verificar `REDIS_URL`, llave de Azure Managed Redis y puerto TLS 10000 |
| **Auth service not responding** | Verificar que Identity Service está sano: `curl http://localhost:5132/api/auth/health` |
| **No se guardan eventos** | Revisar logs: `kubectl logs deployment/chatbot-service -n biblioteca --tail=120` |
| **Respuestas lentas** | Aumentar timeout en variables, o verificar conexión a IA |
| **401 Unauthorized** | Token JWT inválido o expirado, validar contra Identity Service |

---

## Documentación adicional

- [README principal](../../../README.md)
- [Biblioteca-Microservicios](../README.md)
- [Guía AKS](../DEPLOYMENT_AKS.md)
- [Arquitectura](../../../PROJECT_OVERVIEW.md)
