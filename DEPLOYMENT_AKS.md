# Backend AKS deployment guide

Este repositorio backend despliega microservicios reales en AKS:

- `identity-service` (.NET)
- `catalog-service` (Node.js)
- `chatbot-service` (Node.js)
- `postgres`
- `rabbitmq`
- `redis`

## Requisitos

- Azure CLI autenticado.
- AKS creado y conectado con `az aks get-credentials`.
- ACR creado y conectado al cluster.
- `kubectl`.
- Ingress controller, recomendado `ingress-nginx`.

## Estructura Kubernetes

```text
k8s/
  base/
    namespace.yaml
    configmap.yaml
    secret.template.yaml
    postgres.yaml
    rabbitmq.yaml
    redis.yaml
    identity-service.yaml
    catalog-service.yaml
    chatbot-service.yaml
    ingress.yaml
  overlays/
    aks/
      kustomization.yaml
      configmap-patch.yaml
      ingress-patch.yaml
    aks-no-domain/
      kustomization.yaml
      remove-ingress-host.yaml
```

Render local:

```powershell
kubectl kustomize k8s/overlays/aks-no-domain
```

Usa `aks-no-domain` para demo por IP publica. Usa `aks` cuando ya tengas DNS para `api.biblioteca.example.com`.

## Valores usados en el despliegue AKS actual

```powershell
$RESOURCE_GROUP="rg-biblioteca-aks-edu"
$AKS_NAME="aks-biblioteca-edu"
$ACR_NAME="acrbiblioalex25"
$ACR_LOGIN_SERVER="acrbiblioalex25.azurecr.io"
$INGRESS_IP="52.158.169.2"
$TAG="aks-20260522-031612"
```

## Secretos

No subas secretos al repositorio. Crea el secret en Kubernetes:

```powershell
kubectl create namespace biblioteca --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic biblioteca-secrets `
  --namespace biblioteca `
  --from-literal=POSTGRES_PASSWORD="postgres123" `
  --from-literal=HF_API_TOKEN="hf_xxx" `
  --from-literal=GEMINI_API_KEY="gemini_xxx" `
  --from-literal=GROQ_API_KEY="groq_xxx" `
  --from-literal=OPENROUTER_API_KEY="openrouter_xxx" `
  --from-literal=AZURE_SERVICE_BUS_CONNECTION_STRING="" `
  --dry-run=client -o yaml | kubectl apply -f -
```

## Build y push de imagenes

```powershell
$ACR="acrbiblioalex25.azurecr.io"
$TAG="manual"

docker build -t "$ACR/biblioteca/identity-service:$TAG" ./mini-identity-api-dotnet-main/mini-identity-api-dotnet-main
docker build -t "$ACR/biblioteca/catalog-service:$TAG" ./catalog-service
docker build -t "$ACR/biblioteca/chatbot-service:$TAG" ./chatbot-service

az acr login --name acrbiblioalex25
docker push "$ACR/biblioteca/identity-service:$TAG"
docker push "$ACR/biblioteca/catalog-service:$TAG"
docker push "$ACR/biblioteca/chatbot-service:$TAG"
```

## Aplicar manifiestos

```powershell
$INGRESS_IP="52.158.169.2"

kubectl apply -k k8s/overlays/aks-no-domain

$patchFile = New-TemporaryFile
'{"data":{"CORS_ORIGINS":"http://52.158.169.2","OPENROUTER_REFERER":"http://52.158.169.2"}}' |
  Set-Content -Path $patchFile -Encoding ascii
kubectl patch configmap biblioteca-config -n biblioteca --type merge --patch-file $patchFile
Remove-Item -LiteralPath $patchFile -Force

kubectl set image deployment/identity-service `
  identity-service="$ACR/biblioteca/identity-service:$TAG" `
  -n biblioteca

kubectl set image deployment/catalog-service `
  catalog-service="$ACR/biblioteca/catalog-service:$TAG" `
  -n biblioteca

kubectl set image deployment/chatbot-service `
  chatbot-service="$ACR/biblioteca/chatbot-service:$TAG" `
  -n biblioteca
```

## Verificacion

```powershell
kubectl get pods -n biblioteca
kubectl rollout status deployment/postgres -n biblioteca --timeout=420s
kubectl rollout status deployment/rabbitmq -n biblioteca --timeout=420s
kubectl rollout status deployment/identity-service -n biblioteca
kubectl rollout status deployment/catalog-service -n biblioteca
kubectl rollout status deployment/chatbot-service -n biblioteca

kubectl logs deployment/chatbot-service -n biblioteca --tail=80
kubectl exec deployment/redis -n biblioteca -- redis-cli XLEN chatbot_events
```

Health checks publicos:

```powershell
Invoke-RestMethod "http://52.158.169.2/health"
Invoke-RestMethod "http://52.158.169.2/api/catalog/health"
Invoke-RestMethod "http://52.158.169.2/api/chatbot/health"
```

Port-forward temporal si no tienes ingress:

```powershell
kubectl port-forward svc/identity-service 5132:5132 -n biblioteca
kubectl port-forward svc/catalog-service 3002:3002 -n biblioteca
kubectl port-forward svc/chatbot-service 3003:3003 -n biblioteca
```

## Despliegue independiente

Cada microservicio tiene Deployment y Service propios. Para desplegar solo uno:

```powershell
kubectl set image deployment/chatbot-service chatbot-service="$ACR/biblioteca/chatbot-service:$TAG" -n biblioteca
kubectl rollout status deployment/chatbot-service -n biblioteca
```

Esto permite actualizar chatbot sin recrear catalogo, identity o frontend.

## Recuperar rollout atascado en AKS Education

En un AKS de un solo nodo, si ves `Insufficient cpu`, `ImagePullBackOff` de ReplicaSets viejos o rollouts duplicados, libera primero los pods del backend:

```powershell
kubectl -n biblioteca scale deployment/postgres deployment/rabbitmq deployment/identity-service deployment/catalog-service deployment/chatbot-service --replicas=0

foreach ($app in @("postgres","rabbitmq","identity-service","catalog-service","chatbot-service")) {
  kubectl -n biblioteca wait --for=delete pod -l "app=$app" --timeout=180s
}
```

Luego aplica de nuevo el overlay y sube las imagenes correctas. Los manifiestos usan `strategy: Recreate` en backend para evitar duplicar pods durante upgrades en nodos pequenos. PostgreSQL usa `PGDATA=/var/lib/postgresql/data/pgdata` para funcionar con Azure Disk, que crea `lost+found` en la raiz del volumen.
