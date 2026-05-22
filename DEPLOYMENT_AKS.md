# Backend AKS deployment guide

Este repositorio despliega solo microservicios de aplicacion en AKS:

- `identity-service` (.NET)
- `catalog-service` (Node.js)
- `chatbot-service` (Node.js)

La infraestructura persistente vive fuera del cluster:

- PostgreSQL: Azure Database for PostgreSQL Flexible Server.
- Eventos de catalogo: Azure Service Bus Queue.
- Redis Streams del chatbot: Azure Managed Redis.

AKS no debe ejecutar contenedores de `postgres`, `rabbitmq` ni `redis` en el despliegue cloud.

## Recursos Azure actuales

```text
Resource group: rg-biblioteca-aks-edu
AKS: aks-biblioteca-edu
ACR: acrbiblioalex25.azurecr.io
Public URL: http://52.158.169.2

PostgreSQL: pg-biblioteca-edu-alex25.postgres.database.azure.com
Database: catalog_db
DB user: biblioadmin
DB SSL: true

Service Bus namespace: sb-biblioteca-edu-alex25
Service Bus queue: library-logging-queue

Managed Redis host: redis-biblioteca-edu-alex25.centralus.redis.azure.net
Managed Redis port: 10000
```

Las credenciales no se versionan. Quedan en Kubernetes como `Secret/biblioteca-secrets` y deben configurarse tambien como GitHub Actions secrets.

## Estructura Kubernetes

```text
k8s/
  base/
    namespace.yaml
    configmap.yaml
    identity-service.yaml
    catalog-service.yaml
    chatbot-service.yaml
    ingress.yaml
  overlays/
    aks/
    aks-no-domain/
  infrastructure/
    in-cluster/
      postgres.yaml
      rabbitmq.yaml
      redis.yaml
      init.sql
```

`k8s/base` y los overlays AKS son app-only. `k8s/infrastructure/in-cluster` queda como referencia para laboratorio local o rollback, pero no se aplica en Azure.

Validar render:

```powershell
kubectl kustomize k8s/overlays/aks-no-domain
kubectl kustomize k8s/infrastructure/in-cluster
```

## Secretos requeridos

```text
POSTGRES_PASSWORD
HF_API_TOKEN
GEMINI_API_KEY
GROQ_API_KEY
OPENROUTER_API_KEY
REDIS_URL
AZURE_SERVICE_BUS_CONNECTION_STRING
```

`REDIS_URL` usa TLS contra Azure Managed Redis:

```text
rediss://:<REDIS_KEY>@redis-biblioteca-edu-alex25.centralus.redis.azure.net:10000
```

Crear o actualizar el Secret sin imprimir valores:

```powershell
kubectl create namespace biblioteca --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic biblioteca-secrets `
  --namespace biblioteca `
  --from-literal=POSTGRES_PASSWORD="<postgres-password>" `
  --from-literal=HF_API_TOKEN="<hf-token>" `
  --from-literal=GEMINI_API_KEY="<gemini-key>" `
  --from-literal=GROQ_API_KEY="<groq-key>" `
  --from-literal=OPENROUTER_API_KEY="<openrouter-key>" `
  --from-literal=REDIS_URL="<managed-redis-rediss-url>" `
  --from-literal=AZURE_SERVICE_BUS_CONNECTION_STRING="<service-bus-connection-string>" `
  --dry-run=client -o yaml | kubectl apply -f -
```

## Build y push manual

```powershell
$ACR="acrbiblioalex25.azurecr.io"
$TAG="manual"

az acr login --name acrbiblioalex25

docker build -t "$ACR/biblioteca/identity-service:$TAG" ./mini-identity-api-dotnet-main/mini-identity-api-dotnet-main
docker build -t "$ACR/biblioteca/catalog-service:$TAG" ./catalog-service
docker build -t "$ACR/biblioteca/chatbot-service:$TAG" ./chatbot-service

docker push "$ACR/biblioteca/identity-service:$TAG"
docker push "$ACR/biblioteca/catalog-service:$TAG"
docker push "$ACR/biblioteca/chatbot-service:$TAG"
```

## Aplicar manifiestos app-only

```powershell
$ACR="acrbiblioalex25.azurecr.io"
$TAG="manual"
$PUBLIC_BASE_URL="http://52.158.169.2"

kubectl kustomize k8s/overlays/aks-no-domain |
  ForEach-Object {
    $_ -replace 'image: .*identity-service:.*', "image: $ACR/biblioteca/identity-service:$TAG" `
       -replace 'image: .*catalog-service:.*', "image: $ACR/biblioteca/catalog-service:$TAG" `
       -replace 'image: .*chatbot-service:.*', "image: $ACR/biblioteca/chatbot-service:$TAG" `
       -replace 'CORS_ORIGINS: .*', "CORS_ORIGINS: $PUBLIC_BASE_URL" `
       -replace 'OPENROUTER_REFERER: .*', "OPENROUTER_REFERER: $PUBLIC_BASE_URL"
  } |
  kubectl apply -f -

kubectl rollout status deployment/identity-service -n biblioteca --timeout=420s
kubectl rollout status deployment/catalog-service -n biblioteca --timeout=420s
kubectl rollout status deployment/chatbot-service -n biblioteca --timeout=300s
```

## Retirar infraestructura in-cluster

Despues de validar Azure Managed DB, Service Bus y Managed Redis:

```powershell
kubectl delete deployment postgres rabbitmq redis -n biblioteca --ignore-not-found=true
kubectl delete service postgres rabbitmq redis -n biblioteca --ignore-not-found=true
kubectl delete configmap postgres-init-sql -n biblioteca --ignore-not-found=true
kubectl delete pvc postgres-data redis-data -n biblioteca --ignore-not-found=true
```

## Verificacion

```powershell
kubectl get pods,deploy,svc -n biblioteca

Invoke-RestMethod "http://52.158.169.2/health"
Invoke-RestMethod "http://52.158.169.2/api/catalog/health"
Invoke-RestMethod "http://52.158.169.2/api/chatbot/health"
```

Verifica que no existan servicios internos de infraestructura:

```powershell
kubectl get svc -n biblioteca
```

Debe mostrar solo:

```text
biblioteca-frontend
identity-service
catalog-service
chatbot-service
```

## Migracion de datos

La migracion se hizo desde el PostgreSQL anterior dentro de AKS hacia Azure PostgreSQL con `pg_dump | psql`.

Patron general:

```powershell
$PG_HOST="pg-biblioteca-edu-alex25.postgres.database.azure.com"
$PG_USER="biblioadmin"
$PG_DB="catalog_db"

kubectl exec -n biblioteca deployment/postgres -- sh -c `
  "PGPASSWORD='postgres123' pg_dump -U postgres -d catalog_db --clean --if-exists --no-owner --no-privileges | PGPASSWORD='<postgres-password>' psql 'host=$PG_HOST port=5432 dbname=$PG_DB user=$PG_USER sslmode=require'"
```

## Cuidar creditos Azure Education

AKS se puede detener:

```powershell
az aks stop -g rg-biblioteca-aks-edu -n aks-biblioteca-edu
az aks start -g rg-biblioteca-aks-edu -n aks-biblioteca-edu
```

PostgreSQL Flexible Server tambien se puede detener:

```powershell
az postgres flexible-server stop -g rg-biblioteca-aks-edu -n pg-biblioteca-edu-alex25
az postgres flexible-server start -g rg-biblioteca-aks-edu -n pg-biblioteca-edu-alex25
```

Azure Managed Redis y Service Bus no tienen modo stop equivalente. Si la demo termino y quieres gastar lo minimo, elimina esos recursos y recrealos con la guia `MANAGED_DATA_AZURE.md`.
