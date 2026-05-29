<#
.SYNOPSIS
    Instala cert-manager y configura Let's Encrypt ClusterIssuer para SSL/TLS
.DESCRIPTION
    - Instala/actualiza cert-manager via Helm
    - Aplica ClusterIssuer (staging + production) para Let's Encrypt
    - Verifica que los pods de cert-manager esten funcionando
.PARAMETER domain
    Dominio principal (default: bibliotechu.duckdns.org)
.PARAMETER email
    Email para Let's Encrypt (default: admin@eldominio)
.PARAMETER skipCertManager
    Salta la instalacion de cert-manager si ya esta instalado
.EXAMPLE
    .\azure\setup-ssl.ps1
    .\azure\setup-ssl.ps1 -domain "bibliotechu.duckdns.org" -email "admin@bibliotechu.duckdns.org"
#>

param(
    [string]$domain = "bibliotechu.duckdns.org",
    [string]$email = "admin@$domain",
    [switch]$skipCertManager
)

$ErrorActionPreference = "Stop"

function Write-Header { param([string]$m) Write-Host "`n======== $m ========" -ForegroundColor Cyan }
function Write-Success { param([string]$m) Write-Host "[OK] $m" -ForegroundColor Green }
function Write-Info { param([string]$m) Write-Host "[i] $m" -ForegroundColor Blue }
function Write-Warn { param([string]$m) Write-Host "[!] $m" -ForegroundColor Yellow }

# 1. Validar herramientas
Write-Header "Validando herramientas"

$tools = @("kubectl", "helm", "az")
foreach ($tool in $tools) {
    if (Get-Command $tool -ErrorAction SilentlyContinue) {
        Write-Success "Encontrado: $tool"
    } else {
        Write-Warn "No se encontro '$tool'. Algunos pasos podrian fallar."
    }
}

# 2. Instalar/actualizar cert-manager
if (-not $skipCertManager) {
    Write-Header "Instalando/actualizando cert-manager"

    helm repo add jetstack https://charts.jetstack.io 2>$null
    helm repo update

    $installArgs = @(
        "upgrade", "--install", "cert-manager", "jetstack/cert-manager",
        "--namespace", "cert-manager",
        "--create-namespace",
        "--version", "v1.16.0",
        "--set", "installCRDs=true",
        "--wait"
    )

    & helm @installArgs

    if ($LASTEXITCODE -eq 0) {
        Write-Success "cert-manager instalado/actualizado"
    } else {
        Write-Warn "Fallo la instalacion de cert-manager. Continuando..."
    }

    Write-Info "Esperando pods de cert-manager..."
    kubectl wait --for=condition=Ready pods --all -n cert-manager --timeout=120s 2>$null
    Write-Success "cert-manager pods listos"
} else {
    Write-Info "Saltando instalacion de cert-manager (skipCertManager)"
}

# 3. Aplicar ClusterIssuer
Write-Header "Aplicando ClusterIssuer de Let's Encrypt"

$issuerPath = Join-Path $PSScriptRoot "..\k8s\cluster-issuer.yaml"
$resolvedPath = Resolve-Path $issuerPath -ErrorAction SilentlyContinue

if (-not $resolvedPath) {
    Write-Warn "No se encontro k8s/cluster-issuer.yaml. Creando temporal..."

    $issuerYaml = @"
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-staging
spec:
  acme:
    email: $email
    server: https://acme-staging-v02.api.letsencrypt.org/directory
    privateKeySecretRef:
      name: letsencrypt-staging-account-key
    solvers:
      - http01:
          ingress:
            class: nginx
---
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    email: $email
    server: https://acme-v02.api.letsencrypt.org/directory
    privateKeySecretRef:
      name: letsencrypt-prod-account-key
    solvers:
      - http01:
          ingress:
            class: nginx
"@
    $tempFile = [System.IO.Path]::GetTempFileName() + ".yaml"
    Set-Content -Path $tempFile -Value $issuerYaml
    kubectl apply -f $tempFile
    Remove-Item $tempFile -Force
} else {
    kubectl apply -f $resolvedPath
}

if ($LASTEXITCODE -eq 0) {
    Write-Success "ClusterIssuer aplicado correctamente"
} else {
    Write-Warn "Fallo al aplicar ClusterIssuer"
}

# 4. Verificar estado
Write-Header "Verificando estado"

kubectl get clusterissuer -o wide
kubectl get pods -n cert-manager

Write-Header "SSL/TLS setup completado"
Write-Success "cert-manager instalado en namespace 'cert-manager'"
Write-Success "ClusterIssuers: letsencrypt-staging, letsencrypt-prod"
Write-Info "NOTA: Aplica los overlays 'aks/' (con dominio) para activar TLS en los ingress"
Write-Info ""
Write-Info "  kubectl apply -k biblioteca-microservicios/k8s/overlays/aks"
Write-Info "  kubectl apply -k Biblioteca-Frontend/k8s/overlays/aks"
