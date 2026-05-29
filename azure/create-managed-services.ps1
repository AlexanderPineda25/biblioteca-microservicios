<#
.SYNOPSIS
    Crea servicios gestionados de Azure para producción: PostgreSQL, Redis, Service Bus
.DESCRIPTION
    - Azure Database for PostgreSQL Flexible Server
    - Azure Managed Redis (Enterprise o Standard)
    - Azure Service Bus (Standard)
    - Genera .azure-managed-data.local.json con las credenciales
.PARAMETER ResourceGroup
    Nombre del Resource Group (default: rg-biblioteca-aks-edu)
.PARAMETER Location
    Ubicación de Azure (default: centralus)
.PARAMETER PostgresName
    Nombre del servidor PostgreSQL (default: pg-biblioteca-{suffix})
.PARAMETER PostgresAdmin
    Usuario admin de PostgreSQL (default: biblioadmin)
.PARAMETER PostgresPassword
    Password de PostgreSQL (generado automáticamente si no se provee)
.PARAMETER RedisName
    Nombre del Redis (default: redis-biblioteca-{suffix})
.PARAMETER ServiceBusName
    Nombre del Service Bus (default: sb-biblioteca-{suffix})
.PARAMETER Suffix
    Sufijo para nombres de recursos (default: usuario-aleatorio)
.PARAMETER OutputFile
    Ruta del archivo JSON de salida (default: .azure-managed-data.local.json)
.EXAMPLE
    .\azure\create-managed-services.ps1
    .\azure\create-managed-services.ps1 -ResourceGroup "rg-biblioteca-prod" -Location "eastus"
#>

param(
    [string]$ResourceGroup = "rg-biblioteca-aks-edu",
    [string]$Location = "centralus",
    [string]$PostgresName = "",
    [string]$PostgresAdmin = "biblioadmin",
    [string]$PostgresPassword = "",
    [string]$RedisName = "",
    [string]$ServiceBusName = "",
    [string]$Suffix = "",
    [string]$OutputFile = ".azure-managed-data.local.json"
)

$ErrorActionPreference = "Stop"

function Write-Header { param([string]$m) Write-Host "`n======== $m ========" -ForegroundColor Cyan }
function Write-Success { param([string]$m) Write-Host "[OK] $m" -ForegroundColor Green }
function Write-Info { param([string]$m) Write-Host "[i] $m" -ForegroundColor Blue }
function Write-Warn { param([string]$m) Write-Host "[!] $m" -ForegroundColor Yellow }
function Write-Error-Custom { param([string]$m) Write-Host "[ERR] $m" -ForegroundColor Red }

# ──────────────────────────────────────────────
# 1. Validar herramientas
# ──────────────────────────────────────────────
Write-Header "Validando herramientas"

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    Write-Error-Custom "Azure CLI no encontrada. Instala az cli."
    exit 1
}
Write-Success "Azure CLI encontrada"

# Verificar sesión
$account = az account show --query "user.name" -o tsv 2>$null
if (-not $account) {
    Write-Warn "No hay sesión activa de Azure. Ejecutando 'az login'..."
    az login
}
Write-Success "Sesión Azure: $account"

# ──────────────────────────────────────────────
# 2. Generar nombres
# ──────────────────────────────────────────────
Write-Header "Generando nombres de recursos"

if (-not $Suffix) {
    $userName = $env:USERNAME ?? "dev"
    $random = -join ((48..57) + (97..122) | Get-Random -Count 4 | ForEach-Object { [char]$_ })
    $Suffix = "$userName$random".ToLower()
}

$resourceGroupExists = az group exists --name $ResourceGroup
if ($resourceGroupExists -eq "false") {
    Write-Info "Creando Resource Group: $ResourceGroup en $Location"
    az group create --name $ResourceGroup --location $Location --output table
    Write-Success "Resource Group creado"
} else {
    Write-Info "Resource Group '$ResourceGroup' ya existe"
}

if (-not $PostgresName) { $PostgresName = "pg-biblioteca-$Suffix" }
if (-not $RedisName) { $RedisName = "redis-biblioteca-$Suffix" }
if (-not $ServiceBusName) { $ServiceBusName = "sb-biblioteca-$Suffix" }
if (-not $PostgresPassword) { $PostgresPassword = "Biblio" + -join ((65..90) + (48..57) | Get-Random -Count 8 | ForEach-Object { [char]$_ }) + "!" }

Write-Info "PostgreSQL:     $PostgresName"
Write-Info "Redis:          $RedisName"
Write-Info "Service Bus:    $ServiceBusName"
Write-Info "Resource Group: $ResourceGroup"

# ──────────────────────────────────────────────
# 3. Crear Azure Database for PostgreSQL
# ──────────────────────────────────────────────
Write-Header "Creando Azure Database for PostgreSQL Flexible Server"

$pgExists = az postgres flexible-server show --name $PostgresName --resource-group $ResourceGroup 2>$null
if (-not $pgExists) {
    $serverPublicAccess = "0.0.0.0"
    try {
        $aksOutboundIp = az aks show --resource-group $ResourceGroup --name (az aks list --resource-group $ResourceGroup --query "[0].name" -o tsv 2>$null) --query "outboundIPs[0]" -o tsv 2>$null
        if ($aksOutboundIp) { $serverPublicAccess = $aksOutboundIp }
    } catch { }

    Write-Info "Creando PostgreSQL Flexible Server (esto toma 5-10 min)..."
    az postgres flexible-server create `
        --resource-group $ResourceGroup `
        --location $Location `
        --name $PostgresName `
        --admin-user $PostgresAdmin `
        --admin-password $PostgresPassword `
        --sku-name Standard_B1ms `
        --tier Burstable `
        --public-access $serverPublicAccess `
        --storage-size 32 `
        --version 16 `
        --yes

    if ($LASTEXITCODE -ne 0) {
        Write-Error-Custom "Fallo la creación de PostgreSQL"
        exit 1
    }

    # Crear base de datos
    Write-Info "Creando base de datos 'catalog_db'..."
    az postgres flexible-server db create `
        --resource-group $ResourceGroup `
        --server-name $PostgresName `
        --database-name catalog_db

    Write-Success "PostgreSQL creado: $PostgresName"
} else {
    Write-Info "PostgreSQL '$PostgresName' ya existe"
}

$pgHost = az postgres flexible-server show --name $PostgresName --resource-group $ResourceGroup --query "fullyQualifiedDomainName" -o tsv

# ──────────────────────────────────────────────
# 4. Crear Azure Managed Redis
# ──────────────────────────────────────────────
Write-Header "Creando Azure Managed Redis"

$redisExists = az redis show --name $RedisName --resource-group $ResourceGroup 2>$null
if (-not $redisExists) {
    Write-Info "Creando Redis Standard C1 (esto toma 5-15 min)..."
    az redis create `
        --resource-group $ResourceGroup `
        --location $Location `
        --name $RedisName `
        --sku Standard `
        --vm-size c1 `
        --enable-non-ssl-port

    if ($LASTEXITCODE -ne 0) {
        Write-Error-Custom "Fallo la creación de Redis. Puede que Standard C1 no esté disponible. Probando Basic C0..."
        az redis create `
            --resource-group $ResourceGroup `
            --location $Location `
            --name $RedisName `
            --sku Basic `
            --vm-size c0 `
            --enable-non-ssl-port
    }

    Write-Success "Redis creado: $RedisName"
} else {
    Write-Info "Redis '$RedisName' ya existe"
}

$redisHost = az redis show --name $RedisName --resource-group $ResourceGroup --query "hostName" -o tsv
$redisSslPort = az redis show --name $RedisName --resource-group $ResourceGroup --query "sslPort" -o tsv
$redisKeys = az redis list-keys --name $RedisName --resource-group $ResourceGroup --query "primaryKey" -o tsv
$redisUrl = "rediss://:$redisKeys@$redisHost`:$redisSslPort"

# ──────────────────────────────────────────────
# 5. Crear Azure Service Bus
# ──────────────────────────────────────────────
Write-Header "Creando Azure Service Bus"

$sbExists = az servicebus namespace show --name $ServiceBusName --resource-group $ResourceGroup 2>$null
if (-not $sbExists) {
    Write-Info "Creando Service Bus Standard..."
    az servicebus namespace create `
        --resource-group $ResourceGroup `
        --location $Location `
        --name $ServiceBusName `
        --sku Standard

    if ($LASTEXITCODE -ne 0) {
        Write-Error-Custom "Fallo la creación de Service Bus"
        exit 1
    }

    # Crear cola
    Write-Info "Creando cola 'library-logging-queue'..."
    az servicebus queue create `
        --resource-group $ResourceGroup `
        --namespace-name $ServiceBusName `
        --name library-logging-queue

    Write-Success "Service Bus creado: $ServiceBusName"
} else {
    Write-Info "Service Bus '$ServiceBusName' ya existe"
}

$sbConnectionString = az servicebus namespace authorization-rule keys list `
    --resource-group $ResourceGroup `
    --namespace-name $ServiceBusName `
    --name RootManageSharedAccessKey `
    --query primaryConnectionString `
    -o tsv

# ──────────────────────────────────────────────
# 6. Generar archivo de configuración
# ──────────────────────────────────────────────
Write-Header "Generando archivo de configuración"

$config = @{
    resourceGroup              = $ResourceGroup
    location                   = $Location
    postgresName               = $PostgresName
    postgresHost               = $pgHost
    postgresDatabase           = "catalog_db"
    postgresAdmin              = $PostgresAdmin
    postgresPassword           = $PostgresPassword
    redisName                  = $RedisName
    redisHost                  = $redisHost
    redisSslPort               = $redisSslPort
    redisUrl                   = $redisUrl
    serviceBusNamespace        = $ServiceBusName
    serviceBusQueue            = "library-logging-queue"
    serviceBusConnectionString = $sbConnectionString
}

$outputPath = Join-Path (Get-Location) $OutputFile
$configJson = $config | ConvertTo-Json -Depth 4
Set-Content -Path $outputPath -Value $configJson

Write-Success "Archivo generado: $outputPath"
Write-Info "`
$configJson"

# ──────────────────────────────────────────────
# 7. Resumen
# ──────────────────────────────────────────────
Write-Header "Resumen final"

Write-Success "PostgreSQL: $pgHost"
Write-Success "Redis:      $redisHost`:$redisSslPort"
Write-Success "ServiceBus: $ServiceBusName.servicebus.windows.net"

Write-Info ""
Write-Info "Actualiza los secrets de GitHub Actions con estos valores:"
Write-Info "  POSTGRES_HOST=$pgHost"
Write-Info "  POSTGRES_DB=catalog_db"
Write-Info "  POSTGRES_USER=$PostgresAdmin"
Write-Info "  POSTGRES_PASSWORD=$PostgresPassword"
Write-Info "  REDIS_URL=$redisUrl"
Write-Info "  AZURE_SERVICE_BUS_CONNECTION_STRING=$sbConnectionString"
Write-Info ""
Write-Info "Configuracion guardada en: $outputPath"
Write-Info "NO subas este archivo a Git (agregado a .gitignore)"
