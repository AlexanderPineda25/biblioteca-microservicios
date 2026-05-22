# Catalog Service

Microservicio de catálogo de libros para Biblioteca U.

## Tabla de Contenidos

- [Responsabilidad](#responsabilidad)
- [Endpoints](#endpoints)
- [Recomendador IA](#recomendador-ia)
- [Autenticación](#autenticación)
- [Mensajeria](#mensajeria)
- [Variables de Entorno](#variables)
- [Desarrollo Local](#desarrollo)
- [Verificación](#verificación)
- [Despliegue](#despliegue)

---

## Responsabilidad

- CRUD de libros.
- Filtros por titulo, autor, categoria y disponibilidad.
- Recomendador IA con Hugging Face.
- Explicacion conversacional opcional con Gemini, Groq u OpenRouter.
- Publicacion de eventos en Azure Service Bus en cloud, con RabbitMQ como fallback local.
- Proveedor de contexto para `chatbot-service`.

## Endpoints

### Health

```http
GET /api/catalog/health
```

### Libros

```http
GET /api/catalog/books?title=&author=&category=&available=true&page=1&limit=10
GET /api/catalog/books/available?page=1&limit=10
GET /api/catalog/books/:id
POST /api/catalog/books
PUT /api/catalog/books/:id
DELETE /api/catalog/books/:id
PATCH /api/catalog/books/:id/availability
```

Todos los endpoints de libros requieren:

```http
Authorization: Bearer <JWT>
```

Crear libro requiere rol `Admin` o `Bibliotecario`:

```json
{
  "title": "Building Microservices",
  "author": "Sam Newman",
  "isbn": "978-1-491-95035-7",
  "editorial": "O'Reilly Media",
  "year": 2015,
  "categories": ["Ingenieria de Software", "Microservicios"],
  "totalCopies": 7,
  "availableCopies": 7,
  "description": "Guia para disenar y construir sistemas basados en microservicios."
}
```

## Recomendador IA

```http
POST /api/catalog/books/ai/recommendations
```

Payload:

```json
{
  "interest": "Quiero aprender microservicios y bases de datos"
}
```

El servicio usa Hugging Face para clasificacion zero-shot. Si Hugging Face falla o no hay token, usa fallback local para mantener la demo funcional.

Si existen claves conversacionales, agrega una explicacion usando el proveedor configurado:

- `CHAT_PROVIDER=gemini`
- `CHAT_PROVIDER=groq`
- `CHAT_PROVIDER=openrouter`

## Autenticacion

El middleware consulta:

```http
POST {AUTH_SERVICE_URL}/api/auth/introspect
```

Si el token no esta activo, responde `401`. Si Identity no responde, devuelve `503`.

## Mensajeria

En AKS se usa Azure Service Bus:

```text
Namespace: sb-biblioteca-edu-alex25
Queue: library-logging-queue
```

En desarrollo local el servicio puede usar RabbitMQ:

```text
Exchange: library_events
Queue: library_logging_queue
```

Eventos:

- `book.created`.
- `book.recommended`.

Ver logs:

```powershell
docker compose logs -f catalog-service
```

## Variables

```env
PORT=3002
DB_HOST=pg-biblioteca-edu-alex25.postgres.database.azure.com
DB_PORT=5432
DB_NAME=catalog_db
DB_USER=biblioadmin
DB_PASSWORD=...
DB_SSL=true
AUTH_SERVICE_URL=http://identity-service:5132
AZURE_SERVICE_BUS_CONNECTION_STRING=Endpoint=sb://...
AZURE_SERVICE_BUS_QUEUE=library-logging-queue
RABBITMQ_URL=
HF_API_TOKEN=...
HF_MODEL=facebook/bart-large-mnli
CHAT_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
GROQ_API_KEY=...
OPENROUTER_API_KEY=...
```

## Desarrollo

```powershell
npm install
npm run dev
```

## Verificacion

```powershell
node --check src/app.js
node --check src/config/env.js
node --check src/config/database.js
node --check src/services/ai.service.js
npm audit --audit-level=high
```

**Nota:** `npm audit` puede reportar vulnerabilidades moderadas transitivas relacionadas con `sequelize`; no se aplicó `--force` porque implica cambios mayores.

**Health check:**
```powershell
curl http://localhost:3002/api/catalog/health
```

**Ver logs:**
```powershell
docker compose logs -f catalog-service
```

---

## Despliegue

### Docker Compose (recomendado para desarrollo)

```powershell
# Desde la raíz del proyecto
docker compose up -d --build catalog-service
```

### Kubernetes (AKS - producción)

```bash
# Render de manifiestos
kubectl kustomize biblioteca-microservicios/k8s/overlays/aks-no-domain | grep -A 50 catalog

# Despliegue app-only, con datos administrados fuera de AKS
kubectl apply -f /tmp/backend-rendered.yaml

# Verificar
kubectl get pods -n biblioteca -l app=catalog-service
kubectl logs -n biblioteca -l app=catalog-service --tail=50
```

---

## Troubleshooting

| Problema | Solución |
|----------|----------|
| **PostgreSQL connection failed** | Verificar `DB_HOST`, `DB_SSL=true`, firewall de Azure PostgreSQL y `POSTGRES_PASSWORD` |
| **Azure Service Bus connection failed** | Verificar `AZURE_SERVICE_BUS_CONNECTION_STRING` y que la queue exista |
| **Hugging Face timeout** | Esperar a que se recupere, o usar fallback local |
| **No se publican eventos** | Revisar logs: `kubectl logs deployment/catalog-service -n biblioteca --tail=120` |
| **Recomendaciones vacías** | Verificar que HF_API_TOKEN está configurado o fallback local funciona |

---

## Documentación adicional

- [README principal](../../../README.md)
- [Biblioteca-Microservicios](../README.md)
- [Guía AKS](../DEPLOYMENT_AKS.md)
- [Arquitectura](../../../PROJECT_OVERVIEW.md)
