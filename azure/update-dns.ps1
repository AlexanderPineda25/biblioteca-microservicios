<#
.SYNOPSIS
    Actualiza el registro A de DuckDNS con la IP publica del ingress de AKS
.DESCRIPTION
    - Obtiene la IP publica del ingress-nginx de AKS
    - Actualiza el registro A en DuckDNS via su API REST
.PARAMETER Domain
    Nombre del subdominio en DuckDNS (default: bibliotechu)
.PARAMETER Token
    Token de DuckDNS. Si no se provee, lee de DUCKDNS_TOKEN env var o duckdns-token.txt
.PARAMETER TokenFile
    Archivo con el token de DuckDNS (default: duckdns-token.txt en la raiz del proyecto)
.EXAMPLE
    .\azure\update-dns.ps1 -Token "mi-token-duckdns"
    .\azure\update-dns.ps1 -Domain "bibliotechu"
#>

param(
    [string]$Domain = "bibliotechu",
    [string]$Token = "",
    [string]$TokenFile = ""
)

$ErrorActionPreference = "Stop"

function Write-Header { param([string]$m) Write-Host "`n======== $m ========" -ForegroundColor Cyan }
function Write-Success { param([string]$m) Write-Host "[OK] $m" -ForegroundColor Green }
function Write-Info { param([string]$m) Write-Host "[i] $m" -ForegroundColor Blue }
function Write-Warn { param([string]$m) Write-Host "[!] $m" -ForegroundColor Yellow }

# 1. Obtener token
if (-not $Token) {
    $Token = $env:DUCKDNS_TOKEN
}

if (-not $Token -and -not $TokenFile) {
    $TokenFile = Join-Path (Get-Location) "duckdns-token.txt"
}

if (-not $Token -and $TokenFile -and (Test-Path $TokenFile)) {
    $Token = (Get-Content $TokenFile -Raw).Trim()
}

if (-not $Token) {
    Write-Warn "No se encontro token de DuckDNS."
    Write-Warn "Puedes:"
    Write-Warn "  1. Pasar -Token `"tu-token`""
    Write-Warn "  2. Crear variable de entorno DUCKDNS_TOKEN"
    Write-Warn "  3. Crear archivo duckdns-token.txt con el token"
    Write-Warn ""
    Write-Warn "Para obtener tu token: https://duckdns.org"
    exit 1
}

Write-Success "Token de DuckDNS encontrado"

# 2. Obtener IP del ingress
Write-Header "Obteniendo IP del ingress de AKS"

$ingressIP = kubectl get svc ingress-nginx-controller -n ingress-nginx -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>$null

if (-not $ingressIP) {
    Write-Warn "No se pudo obtener la IP del ingress desde kubectl."
    $configPath = Join-Path (Get-Location) ".azure-managed-data.local.json"
    if (Test-Path $configPath) {
        $config = Get-Content $configPath -Raw | ConvertFrom-Json
        if ($config.aksOutboundIp) {
            $ingressIP = $config.aksOutboundIp
            Write-Info "Usando IP desde config local: $ingressIP"
        }
    }
}

if (-not $ingressIP) {
    $ingressIP = (Invoke-RestMethod -Uri "https://api.ipify.org" -ErrorAction SilentlyContinue)
    Write-Warn "Usando IP publica local: $ingressIP (puede no ser la del ingress)"
}

Write-Success "IP del ingress: $ingressIP"

# 3. Actualizar DuckDNS
Write-Header "Actualizando DuckDNS"

$url = "https://www.duckdns.org/update?domains=$Domain" + "&token=$Token" + "&ip=$ingressIP"
Write-Info "Actualizando $Domain.duckdns.org -> $ingressIP"

try {
    $response = Invoke-RestMethod -Uri $url -Method Get
    if ($response -eq "OK") {
        Write-Success "$Domain.duckdns.org actualizado correctamente"
    } else {
        Write-Warn "$Domain.duckdns.org respondio: $response"
    }
} catch {
    Write-Warn "Error al actualizar DNS: $_"
}

# 4. Resumen
Write-Header "DNS actualizado"

Write-Success "Frontend:     https://$Domain.duckdns.org"
Write-Success "Backend API:  https://$Domain.duckdns.org/api/..."
Write-Info ""
Write-Info "Espera 1-5 min para que se propague el DNS."
Write-Info "Verifica con: nslookup $Domain.duckdns.org"
