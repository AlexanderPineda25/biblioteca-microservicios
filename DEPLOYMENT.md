# Backend — Despliegue y CI/CD

Este repositorio despliega solo microservicios de aplicacion en AKS:

- `identity-service` (.NET)
- `catalog-service` (Node.js)
- `chatbot-service` (Node.js)

La infraestructura persistente vive fuera del cluster:

- PostgreSQL: Azure Database for PostgreSQL Flexible Server.
- Eventos de catalogo: Azure Service Bus Queue.
- Redis Streams del chatbot: Azure Managed Redis.

AKS no debe ejecutar contenedores de `postgres` ni `redis` en el despliegue cloud.

---

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

---

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
      redis.yaml
      init.sql
```

`k8s/base` y los overlays AKS son app-only. `k8s/infrastructure/in-cluster` queda como referencia para laboratorio local o rollback, pero no se aplica en Azure.

Validar render:

```powershell
kubectl kustomize k8s/overlays/aks-no-domain
kubectl kustomize k8s/infrastructure/in-cluster
```

---

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

---

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

---

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

---

## Retirar infraestructura in-cluster

Despues de validar Azure Managed DB, Service Bus y Managed Redis:

```powershell
kubectl delete deployment postgres rabbitmq redis -n biblioteca --ignore-not-found=true
kubectl delete service postgres rabbitmq redis -n biblioteca --ignore-not-found=true
kubectl delete configmap postgres-init-sql -n biblioteca --ignore-not-found=true
kubectl delete pvc postgres-data redis-data -n biblioteca --ignore-not-found=true
```

---

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

---

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

---

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

Azure Managed Redis y Service Bus no tienen modo stop equivalente. Si la demo termino y quieres gastar lo minimo, elimina esos recursos y recrealos con la guia de la seccion "Azure managed data" mas abajo.

---

## CI/CD (GitHub Actions)

Pipeline:

```text
.github/workflows/backend-aks-ci-cd.yml
```

### Que hace

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

### Variables del repositorio

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

### Secrets del repositorio

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

### Configuracion de GitHub Actions

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

### Por que se renderiza antes de aplicar

El workflow genera `/tmp/backend-rendered.yaml`, reemplaza imagenes y variables publicas, y aplica una sola version final. Esto evita rollouts dobles en el nodo pequeno de AKS Education.

### Recuperacion rapida

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

---

## Azure managed data

Esta guia crea la capa de datos fuera de AKS. El cluster queda reservado para microservicios.

### Arquitectura

```text
Frontend -> Ingress AKS -> identity-service -> Azure PostgreSQL
Frontend -> Ingress AKS -> catalog-service  -> Azure PostgreSQL
catalog-service -> Azure Service Bus Queue
Frontend -> Ingress AKS -> chatbot-service  -> Azure Managed Redis Streams
```

### Recursos

```text
Resource group: rg-biblioteca-aks-edu
Location: centralus
PostgreSQL: pg-biblioteca-edu-alex25
Managed Redis: redis-biblioteca-edu-alex25
Service Bus: sb-biblioteca-edu-alex25
Queue: library-logging-queue
```

### Registrar providers

```powershell
az provider register -n Microsoft.DBforPostgreSQL
az provider register -n Microsoft.Cache
az provider register -n Microsoft.ServiceBus
```

Verificar:

```powershell
az provider show -n Microsoft.DBforPostgreSQL --query registrationState -o tsv
az provider show -n Microsoft.Cache --query registrationState -o tsv
az provider show -n Microsoft.ServiceBus --query registrationState -o tsv
```

### Crear PostgreSQL Flexible Server

Usa el outbound IP del AKS para limitar firewall:

```powershell
$RG="rg-biblioteca-aks-edu"
$AKS="aks-biblioteca-edu"
$LOCATION="centralus"
$PG_NAME="pg-biblioteca-edu-alex25"
$PG_USER="biblioadmin"
$PG_PASSWORD="<postgres-password>"

$outboundId = az aks show -g $RG -n $AKS --query "networkProfile.loadBalancerProfile.effectiveOutboundIPs[0].id" -o tsv
$AKS_OUTBOUND_IP = az network public-ip show --ids $outboundId --query ipAddress -o tsv

az postgres flexible-server create `
  --resource-group $RG `
  --name $PG_NAME `
  --location $LOCATION `
  --admin-user $PG_USER `
  --admin-password $PG_PASSWORD `
  --version 16 `
  --tier Burstable `
  --sku-name Standard_B1ms `
  --storage-size 32 `
  --public-access "$AKS_OUTBOUND_IP-$AKS_OUTBOUND_IP" `
  --yes

az postgres flexible-server db create -g $RG -s $PG_NAME -d catalog_db
```

### Crear Azure Service Bus

```powershell
$SB_NAMESPACE="sb-biblioteca-edu-alex25"
$SB_QUEUE="library-logging-queue"

az servicebus namespace create `
  -g $RG `
  -n $SB_NAMESPACE `
  -l $LOCATION `
  --sku Basic

az servicebus queue create `
  -g $RG `
  --namespace-name $SB_NAMESPACE `
  -n $SB_QUEUE `
  --max-size 1024
```

Obtener connection string:

```powershell
az servicebus namespace authorization-rule keys list `
  -g $RG `
  --namespace-name $SB_NAMESPACE `
  --name RootManageSharedAccessKey `
  --query primaryConnectionString `
  -o tsv
```

### Crear Azure Managed Redis

Azure Cache for Redis clasico puede rechazar nuevas creaciones. Azure Managed Redis se administra con el comando `az redisenterprise`.

```powershell
az extension add --name redisenterprise --yes

az redisenterprise create `
  --resource-group $RG `
  --cluster-name redis-biblioteca-edu-alex25 `
  --location $LOCATION `
  --sku Balanced_B0 `
  --high-availability Disabled `
  --client-protocol Encrypted `
  --minimum-tls-version 1.2 `
  --public-network-access Enabled `
  --access-keys-auth Enabled
```

Obtener host, puerto y llave:

```powershell
$REDIS_HOST = az redisenterprise show -g $RG -n redis-biblioteca-edu-alex25 --query hostName -o tsv
$REDIS_PORT = az redisenterprise database show -g $RG --cluster-name redis-biblioteca-edu-alex25 --query port -o tsv
$REDIS_KEY = az redisenterprise database list-keys -g $RG --cluster-name redis-biblioteca-edu-alex25 --query primaryKey -o tsv

"rediss://:<redis-key>@$REDIS_HOST`:$REDIS_PORT"
```

Usa esa URL como secret `REDIS_URL`.

### Validacion operativa

```powershell
Invoke-RestMethod "http://52.158.169.2/health"
Invoke-RestMethod "http://52.158.169.2/api/catalog/health"
Invoke-RestMethod "http://52.158.169.2/api/chatbot/health"

kubectl logs deployment/catalog-service -n biblioteca --tail=120
kubectl logs deployment/chatbot-service -n biblioteca --tail=120
```

Los logs esperados son:

```text
[Messaging] Azure Service Bus mode
[Redis Streams] Connected to chatbot_events
Database: catalog_db@pg-biblioteca-edu-alex25.postgres.database.azure.com:5432
```

### Eliminar recursos administrados

Usa esto solo cuando la demo haya terminado:

```powershell
az redisenterprise delete -g rg-biblioteca-aks-edu -n redis-biblioteca-edu-alex25 --yes
az servicebus namespace delete -g rg-biblioteca-aks-edu -n sb-biblioteca-edu-alex25
az postgres flexible-server delete -g rg-biblioteca-aks-edu -n pg-biblioteca-edu-alex25 --yes
```
