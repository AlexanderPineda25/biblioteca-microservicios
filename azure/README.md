# Azure Deployment

Scripts para desplegar Biblioteca U en **Azure Kubernetes Service**.

## Archivos

| Script | Propósito |
|--------|-----------|
| `create-aks-education.ps1` | Crea Resource Group, ACR Basic y AKS (1 nodo, tier free) para Azure Education |
| `deploy-aks.ps1` | Build → Push ACR → Secrets → Manifiestos → Rollout automatizado |
| `aks-status.ps1` | Verifica estado del cluster y nodepool |
| `aks-stop.ps1` | Detiene AKS para ahorrar créditos de cómputo |
| `aks-start.ps1` | Inicia AKS y refresca kubeconfig |
| `aks-delete-resource-group.ps1` | Elimina todo el Resource Group |

## Crear AKS + ACR

```powershell
az login

.\azure\create-aks-education.ps1 `
  -ResourceGroup "rg-biblioteca-aks-edu" `
  -Location "centralus" `
  -AcrName "acrbibliotecaedu123" `
  -AksName "aks-biblioteca-edu" `
  -NodeVmSize "Standard_D2s_v3" `
  -NodeCount 1 `
  -InstallIngressNginx
```

El script imprime los valores para GitHub Actions:
```
AKS_RESOURCE_GROUP
AKS_CLUSTER_NAME
ACR_NAME
ACR_LOGIN_SERVER
```

## Despliegue manual

```powershell
.\azure\deploy-aks.ps1 -initDb
```

## Gestión de costos

```powershell
# Detener
.\azure\aks-stop.ps1

# Iniciar
.\azure\aks-start.ps1

# Ver estado
.\azure\aks-status.ps1

# Eliminar todo
.\azure\aks-delete-resource-group.ps1
```

## Recursos gestionados en Azure

| Recurso | Propósito |
|---------|-----------|
| Azure Database for PostgreSQL Flexible Server | Base de datos en producción |
| Azure Managed Redis Standard C1 | Cache y streams de eventos |
| Azure Service Bus Standard | Mensajería asíncrona |

## Guías relacionadas

- `KUBERNETES_AKS_GUIDE.md` — Guía completa de Kubernetes/despliegue en AKS
- `GUIA_AKS_EDUCATION_PASO_A_PASO.md` — Paso a paso para AKS con Azure Education
