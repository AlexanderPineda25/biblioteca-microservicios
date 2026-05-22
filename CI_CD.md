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
5. Detecta si existen las variables y secrets de Azure Managed DB, Service Bus y Managed Redis.
6. Si la configuracion esta completa, construye imagenes Docker independientes:
   - `biblioteca/identity-service`
   - `biblioteca/catalog-service`
   - `biblioteca/chatbot-service`
7. Publica las imagenes en Azure Container Registry.
8. Crea o actualiza `Secret/biblioteca-secrets`.
9. Renderiza manifiestos app-only con el tag `${{ github.sha }}`.
10. Aplica en AKS solo `identity-service`, `catalog-service`, `chatbot-service`, Services e Ingress.
11. Espera rollout de los tres microservicios.

## Variables del repositorio

```text
AKS_RESOURCE_GROUP
AKS_CLUSTER_NAME
ACR_NAME
ACR_LOGIN_SERVER
PUBLIC_BASE_URL
POSTGRES_HOST
POSTGRES_PORT
POSTGRES_DB
POSTGRES_USER
DB_SSL
AZURE_SERVICE_BUS_QUEUE
```

Valores actuales:

```text
AKS_RESOURCE_GROUP=rg-biblioteca-aks-edu
AKS_CLUSTER_NAME=aks-biblioteca-edu
ACR_NAME=acrbiblioalex25
ACR_LOGIN_SERVER=acrbiblioalex25.azurecr.io
PUBLIC_BASE_URL=http://52.158.169.2
POSTGRES_HOST=pg-biblioteca-edu-alex25.postgres.database.azure.com
POSTGRES_PORT=5432
POSTGRES_DB=catalog_db
POSTGRES_USER=biblioadmin
DB_SSL=true
AZURE_SERVICE_BUS_QUEUE=library-logging-queue
```

El workflow corre en pushes a `main` y `master`, ademas de `workflow_dispatch`.

Si faltan variables o secrets, CI queda en verde y el job de CD se omite con un resumen de lo que falta. Esto evita que los pushes normales fallen mientras el repositorio todavia no tiene credenciales de Azure configuradas. Cuando agregues todos los valores, el despliegue a AKS se activa automaticamente en el siguiente push o con `workflow_dispatch`.

## Secrets del repositorio

```text
AZURE_CREDENTIALS
POSTGRES_PASSWORD
HF_API_TOKEN
GEMINI_API_KEY
GROQ_API_KEY
OPENROUTER_API_KEY
REDIS_URL
AZURE_SERVICE_BUS_CONNECTION_STRING
```

`REDIS_URL` debe usar `rediss://` y el puerto TLS de Azure Managed Redis.

## Configuracion de GitHub Actions

En GitHub ve a:

```text
Settings > Secrets and variables > Actions
```

Si instalas GitHub CLI:

```powershell
gh variable set AKS_RESOURCE_GROUP --body "rg-biblioteca-aks-edu"
gh variable set AKS_CLUSTER_NAME --body "aks-biblioteca-edu"
gh variable set ACR_NAME --body "acrbiblioalex25"
gh variable set ACR_LOGIN_SERVER --body "acrbiblioalex25.azurecr.io"
gh variable set PUBLIC_BASE_URL --body "http://52.158.169.2"
gh variable set POSTGRES_HOST --body "pg-biblioteca-edu-alex25.postgres.database.azure.com"
gh variable set POSTGRES_PORT --body "5432"
gh variable set POSTGRES_DB --body "catalog_db"
gh variable set POSTGRES_USER --body "biblioadmin"
gh variable set DB_SSL --body "true"
gh variable set AZURE_SERVICE_BUS_QUEUE --body "library-logging-queue"
```

Para generar `AZURE_CREDENTIALS`:

```powershell
$SUBSCRIPTION_ID = az account show --query id -o tsv
az ad sp create-for-rbac `
  --name "sp-biblioteca-github" `
  --role Contributor `
  --scopes "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/rg-biblioteca-aks-edu" `
  --sdk-auth
```

## Por que se renderiza antes de aplicar

El workflow genera `/tmp/backend-rendered.yaml`, reemplaza imagenes y variables publicas, y aplica una sola version final. Esto evita rollouts dobles en el nodo pequeno de AKS Education.

## Recuperacion rapida

Si un secret falta, el workflow omite CD antes de tocar Azure. Si el cluster ya quedo con pods pendientes:

```powershell
kubectl describe pod -n biblioteca -l app=catalog-service
kubectl describe pod -n biblioteca -l app=chatbot-service
kubectl describe pod -n biblioteca -l app=identity-service
```

Errores comunes:

```text
POSTGRES_PASSWORD missing -> corregir Secret/biblioteca-secrets.
REDIS_URL missing -> chatbot queda en CreateContainerConfigError.
AZURE_SERVICE_BUS_CONNECTION_STRING empty -> catalog-service cae a RabbitMQ, que no existe en AKS cloud.
```

Despues de corregir secrets:

```powershell
kubectl rollout restart deployment/identity-service deployment/catalog-service deployment/chatbot-service -n biblioteca
kubectl rollout status deployment/identity-service -n biblioteca --timeout=420s
kubectl rollout status deployment/catalog-service -n biblioteca --timeout=420s
kubectl rollout status deployment/chatbot-service -n biblioteca --timeout=300s
```
