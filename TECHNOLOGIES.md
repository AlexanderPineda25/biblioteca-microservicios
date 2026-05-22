# Backend technologies

## Runtime

- .NET Web API para `identity-service`.
- Node.js + Express para `catalog-service`.
- Node.js + Express para `chatbot-service`.

## Data

- Azure Database for PostgreSQL Flexible Server 16 para usuarios, roles, permisos y libros.
- Azure Managed Redis con Redis Streams para eventos del chatbot.
- Los manifests legacy de Postgres y Redis quedan solo para laboratorio local en `k8s/infrastructure/in-cluster`.

## Messaging

- Azure Service Bus Queue para eventos del catalogo en AKS.
- RabbitMQ queda como fallback local, fuera del despliegue cloud.
- Redis Streams se mantiene como patron de eventos del chatbot sobre Azure Managed Redis.

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
- Azure Managed services para datos y mensajeria persistente fuera de Kubernetes.
