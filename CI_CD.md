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
5. Valida que existan variables y secrets requeridos antes de tocar Azure.
6. Construye imagenes Docker independientes:
   - `biblioteca/identity-service`
   - `biblioteca/catalog-service`
   - `biblioteca/chatbot-service`
7. Publica las imagenes en Azure Container Registry.
8. Crea o actualiza el Secret `biblioteca-secrets` con todas las llaves requeridas.
9. Renderiza los manifiestos con Kustomize y reemplaza las imagenes por el tag `${{ github.sha }}` antes de aplicar.
10. Ajusta `CORS_ORIGINS` y `OPENROUTER_REFERER` con `PUBLIC_BASE_URL`.
11. Aplica el manifiesto final en AKS sin crear un rollout intermedio con imagenes placeholder.
12. Espera rollout de infraestructura y microservicios.

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

El workflow corre en pushes a `main` y `master`, ademas de `workflow_dispatch`.

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

El workflow usa `k8s/overlays/aks-no-domain` para demo sin DNS, y espera rollouts de Postgres, RabbitMQ, Identity, Catalog y Chatbot.

## Configuracion de GitHub Actions

En GitHub ve a:

```text
Settings > Secrets and variables > Actions
```

Variables requeridas:

```text
AKS_RESOURCE_GROUP=rg-biblioteca-aks-edu
AKS_CLUSTER_NAME=aks-biblioteca-edu
ACR_NAME=acrbiblioalex25
ACR_LOGIN_SERVER=acrbiblioalex25.azurecr.io
PUBLIC_BASE_URL=http://52.158.169.2
```

Secrets requeridos:

```text
AZURE_CREDENTIALS
POSTGRES_PASSWORD
HF_API_TOKEN
GEMINI_API_KEY
GROQ_API_KEY
OPENROUTER_API_KEY
AZURE_SERVICE_BUS_CONNECTION_STRING
```

`AZURE_SERVICE_BUS_CONNECTION_STRING` puede quedar como cadena vacia si se usa RabbitMQ dentro del cluster.

El workflow falla temprano si falta cualquiera de estos valores criticos:

```text
AKS_RESOURCE_GROUP
AKS_CLUSTER_NAME
ACR_NAME
ACR_LOGIN_SERVER
AZURE_CREDENTIALS
POSTGRES_PASSWORD
HF_API_TOKEN
GEMINI_API_KEY
GROQ_API_KEY
OPENROUTER_API_KEY
```

`POSTGRES_PASSWORD` debe existir siempre. Si el Secret del cluster se crea manualmente sin esa llave, `identity-service` y `catalog-service` quedan en `CreateContainerConfigError`.

Si instalas GitHub CLI, tambien puedes configurar variables desde terminal:

```powershell
winget install GitHub.cli
gh auth login

gh variable set AKS_RESOURCE_GROUP --body "rg-biblioteca-aks-edu"
gh variable set AKS_CLUSTER_NAME --body "aks-biblioteca-edu"
gh variable set ACR_NAME --body "acrbiblioalex25"
gh variable set ACR_LOGIN_SERVER --body "acrbiblioalex25.azurecr.io"
gh variable set PUBLIC_BASE_URL --body "http://52.158.169.2"
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

Copia el JSON completo como secret `AZURE_CREDENTIALS`.

## Por que se renderiza antes de aplicar

En AKS con un solo nodo, aplicar primero imagenes placeholder y luego ejecutar `kubectl set image` puede crear dos rollouts consecutivos. Eso puede producir `Insufficient cpu` o `ImagePullBackOff` temporal. Por eso el workflow genera `/tmp/backend-rendered.yaml`, reemplaza imagenes y URLs publicas, y aplica una sola version final.

## Recuperacion rapida

Si el rollout queda detenido por un Secret incompleto:

```powershell
$postgresPasswordB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("postgres123"))
$patch = @{ data = @{ POSTGRES_PASSWORD = $postgresPasswordB64 } } | ConvertTo-Json -Compress

kubectl patch secret biblioteca-secrets -n biblioteca --type merge -p $patch
kubectl rollout restart deployment/identity-service deployment/catalog-service -n biblioteca
kubectl rollout status deployment/identity-service -n biblioteca --timeout=420s
kubectl rollout status deployment/catalog-service -n biblioteca --timeout=420s
```

Si aparece `InvalidImageName`, no edites ReplicaSets viejos. Renderiza el overlay de nuevo con imagenes limpias y aplica el manifiesto final, como se muestra en `DEPLOYMENT_AKS.md`.
