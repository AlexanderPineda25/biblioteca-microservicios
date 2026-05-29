<#
.SYNOPSIS
    Revierte deployments en AKS a la versión anterior (rollback)
.DESCRIPTION
    - Lista el historial de revisiones de los deployments
    - Revierte a la revisión anterior o a una específica
    - Soporta rollback de deployments individuales o todos
.PARAMETER Namespace
    Namespace de Kubernetes (default: biblioteca)
.PARAMETER Deployment
    Nombre del deployment a revertir. Si se omite, revierte todos.
.PARAMETER Revision
    Número de revisión específica a la que revertir (default: anterior)
.PARAMETER List
    Solo lista el historial de revisiones, no hace rollback
.PARAMETER Reason
    Razón del rollback (para logging)
.EXAMPLE
    .\azure\rollback.ps1 -List
    .\azure\rollback.ps1 -Deployment catalog-service
    .\azure\rollback.ps1 -Deployment catalog-service -Revision 3
    .\azure\rollback.ps1 -Reason "Fallo en health check post-deploy"
#>

param(
    [string]$Namespace = "biblioteca",
    [string]$Deployment = "",
    [int]$Revision = 0,
    [switch]$List,
    [string]$Reason = "Rollback manual"
)

$ErrorActionPreference = "Stop"

function Write-Header { param([string]$m) Write-Host "`n======== $m ========" -ForegroundColor Cyan }
function Write-Success { param([string]$m) Write-Host "[OK] $m" -ForegroundColor Green }
function Write-Info { param([string]$m) Write-Host "[i] $m" -ForegroundColor Blue }
function Write-Warn { param([string]$m) Write-Host "[!] $m" -ForegroundColor Yellow }

# ──────────────────────────────────────────────
# 1. Validar herramientas
# ──────────────────────────────────────────────
Write-Header "Validando entorno"

if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) {
    Write-Warn "kubectl no encontrado. Instala kubectl."
    exit 1
}
Write-Success "kubectl disponible"

# ──────────────────────────────────────────────
# 2. Obtener deployments
# ──────────────────────────────────────────────
$allDeployments = @("identity-service", "catalog-service", "chatbot-service", "biblioteca-frontend")
if ($Deployment) {
    $allDeployments = @($Deployment)
}

# ──────────────────────────────────────────────
# 3. Listar o ejecutar rollback
# ──────────────────────────────────────────────
foreach ($dep in $allDeployments) {
    $exists = kubectl get deployment $dep -n $Namespace -o name 2>$null
    if (-not $exists) {
        Write-Warn "Deployment '$dep' no encontrado en namespace '$Namespace'"
        continue
    }

    if ($List) {
        Write-Header "Historial de revisiones: $dep"
        kubectl rollout history deployment/$dep -n $Namespace
    } else {
        Write-Header "Ejecutando rollback: $dep"

        if ($Revision -gt 0) {
            Write-Info "Revirtiendo $dep a revisión $Revision..."
            kubectl rollout undo deployment/$dep -n $Namespace --to-revision=$Revision
        } else {
            Write-Info "Revirtiendo $dep a la revisión anterior..."
            kubectl rollout undo deployment/$dep -n $Namespace
        }

        if ($LASTEXITCODE -eq 0) {
            Write-Success "Rollback iniciado para $dep"

            # Esperar rollout
            Write-Info "Esperando rollout de $dep..."
            kubectl rollout status deployment/$dep -n $Namespace --timeout=300s

            if ($LASTEXITCODE -eq 0) {
                Write-Success "Rollback completado para $dep"
            } else {
                Write-Warn "Rollback de $dep no completado en el tiempo esperado"
            }
        } else {
            Write-Warn "Fallo al iniciar rollback para $dep"
        }
    }
}

if ($List) {
    Write-Header "Uso: .\rollback.ps1 -Deployment catalog-service -Revision 3"
} else {
    Write-Header "Resumen de rollback"
    $deploymentStr = if ($Deployment) { $Deployment } else { "TODOS los deployments" }
    Write-Success "Rollback ejecutado para: $deploymentStr"
    Write-Info "Razón: $Reason"

    # Verificar estado final
    Write-Info "`nEstado actual de los pods:"
    kubectl get pods -n $Namespace
}
