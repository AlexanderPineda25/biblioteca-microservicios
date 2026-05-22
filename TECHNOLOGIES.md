# Backend technologies

## Runtime

- .NET Web API para `identity-service`.
- Node.js + Express para `catalog-service`.
- Node.js + Express para `chatbot-service`.

## Data

- PostgreSQL 16 para usuarios, roles, permisos y libros.
- Redis 7 con Redis Streams para eventos del chatbot.

## Messaging

- RabbitMQ para eventos del catalogo.
- Redis Streams como tecnologia gratuita seleccionada del requisito Azure Service Bus / Kafka / Redis Streams.
- Azure Service Bus queda soportado opcionalmente por `catalog-service` si se configura connection string.

## AI

- Hugging Face para recomendaciones de catalogo.
- Gemini, Groq y OpenRouter para chatbot conversacional.
- Fallback local si las APIs externas fallan.

## Delivery

- Dockerfile por microservicio.
- Kubernetes Deployments y Services por microservicio.
- Kustomize para overlays AKS.
- GitHub Actions para CI/CD.
- Azure Container Registry para imagenes.
- Azure Kubernetes Service para orquestacion.
