# Catalog Service

Microservicio de catalogo de libros para Biblioteca U.

## Responsabilidad

- CRUD de libros.
- Filtros por titulo, autor, categoria y disponibilidad.
- Recomendador IA con Hugging Face.
- Explicacion conversacional opcional con Gemini, Groq u OpenRouter.
- Publicacion de eventos en RabbitMQ.
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

## RabbitMQ

Exchange: `library_events`.

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
DB_HOST=postgres
DB_PORT=5432
DB_NAME=catalog_db
DB_USER=postgres
DB_PASSWORD=postgres123
AUTH_SERVICE_URL=http://identity-service:5132
RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
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
node --check src/services/ai.service.js
npm audit --audit-level=high
```

Nota: `npm audit` puede reportar vulnerabilidades moderadas transitivas relacionadas con `sequelize`; no se aplico `--force` porque implica cambios mayores.
