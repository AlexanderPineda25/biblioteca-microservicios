<#
.SYNOPSIS
    Limpia recursos temporales: PVCs huérfanos e imágenes sin tag en ACR
.DESCRIPTION
    - Elimina PVCs que no están siendo usados por ningún pod
    - Elimina imágenes sin tag (untagged) del ACR
    - Muestra resumen liberado
.PARAMETER ResourceGroup
    Resource Group de Azure (default: rg-biblioteca-aks-edu)
.PARAMETER AcrName
    Nombre del ACR (default: acrbiblioalex25)
.PARAMETER Namespace
    Namespace de K8s (default: biblioteca)
.PARAMETER DryRun
    Modo simulación: solo muestra lo que se eliminaría
.PARAMETER KeepImages
    Número de imágenes recientes por repositorio a conservar (default: 10)
.EXAMPLE
    .\azure\cleanup.ps1 -DryRun
    .\azure\cleanup.ps1 -KeepImages 5
    .\azure\cleanup.ps1 -DryRun -AcrName acrbiblioalex25
#>

param(
    [string]$ResourceGroup = "rg-biblioteca-aks-edu",
    [string]$AcrName = "acrbiblioalex25",
    [string]$Namespace = "biblioteca",
    [switch]$DryRun,
    [int]$KeepImages = 10
)

$ErrorActionPreference = "Stop"

function Write-Header { param([string]$m) Write-Host "`n======== $m ========" -ForegroundColor Cyan }
function Write-Success { param([string]$m) Write-Host "[OK] $m" -ForegroundColor Green }
function Write-Info { param([string]$m) Write-Host "[i] $m" -ForegroundColor Blue }
function Write-Warn { param([string]$m) Write-Host "[!] $m" -ForegroundColor Yellow }

$totalFreedBytes = 0

# ══════════════════════════════════════════════
# PARTE 1: PVCs huérfanos
# ══════════════════════════════════════════════
Write-Header "1. PVCs huerfanos en Kubernetes"

$allPVCs = kubectl get pvc -n $Namespace -o json 2>$null | ConvertFrom-Json
$allPods = kubectl get pods -n $Namespace -o json 2>$null | ConvertFrom-Json

if (-not $allPVCs -or -not $allPVCs.items) {
    Write-Info "No se encontraron PVCs en namespace '$Namespace'"
} else {
    # Obtener PVCs en uso por pods
    $usedPVCs = @{}
    foreach ($pod in $allPods.items) {
        if ($pod.spec.volumes) {
            foreach ($vol in $pod.spec.volumes) {
                if ($vol.persistentVolumeClaim) {
                    $usedPVCs[$vol.persistentVolumeClaim.claimName] = $true
                }
            }
        }
    }

    $orphanCount = 0
    foreach ($pvc in $allPVCs.items) {
        if (-not $usedPVCs.ContainsKey($pvc.metadata.name)) {
            $storageSize = $pvc.spec.resources.requests.storage
            Write-Warn "PVC huerfano: $($pvc.metadata.name) ($storageSize)"

            if (-not $DryRun) {
                kubectl delete pvc $pvc.metadata.name -n $Namespace
                Write-Success "  Eliminado: $($pvc.metadata.name)"
            }

            $orphanCount++
            # Estimar tamaño
            $sizeStr = $storageSize -replace "[^0-9]", ""
            $sizeUnit = $storageSize -replace "[0-9]", ""
            $sizeBytes = [int]$sizeStr * 1GB  # approximado
            $totalFreedBytes += $sizeBytes
        }
    }

    if ($orphanCount -eq 0) {
        Write-Success "No hay PVCs huerfanos"
    } else {
        Write-Info "Total PVCs huerfanos: $orphanCount"
    }
}

# ══════════════════════════════════════════════
# PARTE 2: Imágenes sin tag en ACR
# ══════════════════════════════════════════════
Write-Header "2. Imagenes sin tag en ACR"

$repos = az acr repository list --name $AcrName --resource-group $ResourceGroup -o tsv 2>$null

if (-not $repos) {
    Write-Warn "No se pudieron listar repositorios en ACR '$AcrName'"
} else {
    foreach ($repo in $repos) {
        Write-Info "Repositorio: $repo"

        # Obtener manifiestos sin tag (untagged)
        $untagged = az acr repository show-manifests --name $AcrName --repository $repo --query "[?tags[0]==null].digest" -o tsv 2>$null

        if ($untagged) {
            $untaggedCount = ($untagged | Measure-Object).Count
            Write-Warn "  $untaggedCount imagen(es) sin tag en $repo"

            foreach ($digest in $untagged) {
                if (-not $DryRun) {
                    Write-Info "    Eliminando: $digest"
                    az acr repository delete --name $AcrName --image "$repo@$digest" --yes 2>$null
                    Write-Success "    Eliminado"
                } else {
                    Write-Warn "    [DRY-RUN] Se eliminaria: $repo@$digest"
                }
                $totalFreedBytes += 500MB  # estimado por imagen
            }
        } else {
            Write-Info "  No hay imagenes sin tag"
        }

        # Opcional: eliminar imágenes antiguas (KeepImages)
        $allTags = az acr repository show-tags --name $AcrName --repository $repo --orderby time_desc -o tsv 2>$null
        if ($allTags -and ($allTags | Measure-Object).Count -gt $KeepImages) {
            $toDelete = $allTags | Select-Object -Skip $KeepImages
            Write-Warn "  $($toDelete.Count) imagen(es) antiguas en $repo (conservando $KeepImages)"

            foreach ($tag in $toDelete) {
                if (-not $DryRun) {
                    Write-Info "    Eliminando tag: $tag"
                    az acr repository delete --name $AcrName --image "$repo`:$tag" --yes 2>$null
                    Write-Success "    Eliminado: $tag"
                } else {
                    Write-Warn "    [DRY-RUN] Se eliminaria: $repo`:$tag"
                }
                $totalFreedBytes += 200MB  # estimado
            }
        }
    }
}

# ══════════════════════════════════════════════
# PARTE 3: Resumen
# ══════════════════════════════════════════════
Write-Header "Resumen de limpieza"

$freedGB = [math]::Round($totalFreedBytes / 1GB, 2)
if ($DryRun) {
    Write-Info "Modo: DRY-RUN (no se eliminó nada)"
    Write-Info "Espacio estimado a liberar: ~${freedGB}GB"
    Write-Info "Ejecuta sin -DryRun para aplicar la limpieza"
} else {
    Write-Success "Limpieza completada"
    Write-Info "Espacio estimado liberado: ~${freedGB}GB"
}

Write-Info "`nRecursos actuales:"
Write-Info "PVCs en uso en namespace '$Namespace':"
kubectl get pvc -n $Namespace -o wide 2>$null

Write-Info "`nTags actuales en ACR:"
foreach ($repo in $repos) {
    $tagCount = az acr repository show-tags --name $AcrName --repository $repo -o tsv 2>$null | Measure-Object | Select-Object -ExpandProperty Count
    Write-Info "  $repo: $tagCount tag(s)"
}
