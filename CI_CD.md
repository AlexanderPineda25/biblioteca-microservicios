# Backend CI/CD

Pipeline:

```text
.github/workflows/backend-aks-ci-cd.yml
```

## Que hace

1. Valida `catalog-service` con `npm ci`, `node --check` y `npm audit --audit-level=high`.
2. Valida `chatbot-service` con `npm ci`, `node --check` y `npm audit --audit-level=high`.
3. Ejecuta pruebas de `identity-service` con `dotnet test`.
4. Renderiza Kubernetes con `kubectl kustomize`.
5. Construye imagenes Docker independientes:
   - `biblioteca/identity-service`
   - `biblioteca/catalog-service`
   - `biblioteca/chatbot-service`
6. Publica las imagenes en Azure Container Registry.
7. Aplica manifiestos en AKS.
8. Actualiza cada Deployment con `kubectl set image`.
9. Espera rollout por microservicio.

## Variables del repositorio

```text
AKS_RESOURCE_GROUP
AKS_CLUSTER_NAME
ACR_NAME
ACR_LOGIN_SERVER
PUBLIC_BASE_URL
```

Para el despliegue actual:

```text
ACR_NAME=acrbiblioalex25
ACR_LOGIN_SERVER=acrbiblioalex25.azurecr.io
PUBLIC_BASE_URL=http://52.158.169.2
```

## Secrets del repositorio

```text
AZURE_CREDENTIALS
POSTGRES_PASSWORD
HF_API_TOKEN
GEMINI_API_KEY
GROQ_API_KEY
OPENROUTER_API_KEY
AZURE_SERVICE_BUS_CONNECTION_STRING
```

`AZURE_CREDENTIALS` es el JSON generado con:

```powershell
az ad sp create-for-rbac `
  --name "sp-biblioteca-github" `
  --role Contributor `
  --scopes "/subscriptions/<SUBSCRIPTION_ID>/resourceGroups/<RESOURCE_GROUP>" `
  --sdk-auth
```

## Despliegue por repo separado

Este workflow esta dentro de `biblioteca-microservicios/.github/workflows`. Cuando publiques esta carpeta como repo independiente, GitHub Actions lo detectara automaticamente.

El workflow escucha pushes a `main` y `master`, usa `k8s/overlays/aks-no-domain` para demo sin DNS, y espera rollouts de Postgres, RabbitMQ, Identity, Catalog y Chatbot.
