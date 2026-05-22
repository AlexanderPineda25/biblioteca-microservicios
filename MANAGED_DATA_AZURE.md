# Azure managed data guide

Esta guia crea la capa de datos fuera de AKS. El cluster queda reservado para microservicios.

## Arquitectura

```text
Frontend -> Ingress AKS -> identity-service -> Azure PostgreSQL
Frontend -> Ingress AKS -> catalog-service  -> Azure PostgreSQL
catalog-service -> Azure Service Bus Queue
Frontend -> Ingress AKS -> chatbot-service  -> Azure Managed Redis Streams
```

## Recursos

```text
Resource group: rg-biblioteca-aks-edu
Location: centralus
PostgreSQL: pg-biblioteca-edu-alex25
Managed Redis: redis-biblioteca-edu-alex25
Service Bus: sb-biblioteca-edu-alex25
Queue: library-logging-queue
```

## Registrar providers

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

## Crear PostgreSQL Flexible Server

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

## Crear Azure Service Bus

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

## Crear Azure Managed Redis

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

## Variables de GitHub Actions

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

## Secrets de GitHub Actions

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

## Validacion operativa

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

## Eliminar recursos administrados

Usa esto solo cuando la demo haya terminado:

```powershell
az redisenterprise delete -g rg-biblioteca-aks-edu -n redis-biblioteca-edu-alex25 --yes
az servicebus namespace delete -g rg-biblioteca-aks-edu -n sb-biblioteca-edu-alex25
az postgres flexible-server delete -g rg-biblioteca-aks-edu -n pg-biblioteca-edu-alex25 --yes
```
