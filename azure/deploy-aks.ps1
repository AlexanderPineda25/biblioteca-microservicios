<#
.SYNOPSIS
    Automated deployment script for Biblioteca U to Azure Kubernetes Service (AKS)
.DESCRIPTION
    This script automates the complete deployment process including:
    - Environment validation (kubectl, docker, az CLI)
    - Loading API keys from .env file
    - Building and pushing Docker images to ACR
    - Creating/updating Kubernetes secrets
    - Deploying services via kubectl with Kustomize
    - Configuring ingress IP in ConfigMap
    - Managing rollout and database initialization
.PARAMETER envFile
    Path to .env file containing API keys. Defaults to .env in current directory
.PARAMETER skipBuild
    Skip Docker image build and push (useful for testing manifest updates)
.PARAMETER initDb
    Initialize PostgreSQL database with init.sql
.PARAMETER kubeContext
    Kubernetes context to use (must be AKS cluster)
.EXAMPLE
    .\deploy-aks.ps1 -initDb
    .\deploy-aks.ps1 -skipBuild
#>

param(
    [string]$envFile = ".env",
    [switch]$skipBuild,
    [switch]$initDb,
    [string]$kubeContext
)

# ============================================================================
# CONFIGURATION
# ============================================================================
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# Define service names and paths
$services = @(
    @{ name = "catalog-service"; dir = "Biblioteca-Frontend/../biblioteca-microservicios/catalog-service" },
    @{ name = "chatbot-service"; dir = "Biblioteca-Frontend/../biblioteca-microservicios/chatbot-service" },
    @{ name = "identity-service"; dir = "Biblioteca-Frontend/../biblioteca-microservicios/mini-identity-api-dotnet-main/mini-identity-api-dotnet-main" }
)

$frontend = @{ name = "biblioteca-frontend"; dir = "Biblioteca-Frontend" }

$namespace = "biblioteca"
$registryUrl = "acrbiblioalex25.azurecr.io"
$acrName = "acrbiblioalex25"

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

function Write-Header {
    param([string]$message)
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host $message -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$message)
    Write-Host "[✓] $message" -ForegroundColor Green
}

function Write-Error-Custom {
    param([string]$message)
    Write-Host "[✗] $message" -ForegroundColor Red
}

function Write-Warning-Custom {
    param([string]$message)
    Write-Host "[!] $message" -ForegroundColor Yellow
}

function Write-Info {
    param([string]$message)
    Write-Host "[i] $message" -ForegroundColor Blue
}

function Test-Command {
    param([string]$command)
    $exists = $null -ne (Get-Command $command -ErrorAction SilentlyContinue)
    if (-not $exists) {
        Write-Error-Custom "Required command '$command' not found. Please install it first."
        exit 1
    }
    Write-Success "Found: $command"
}

function Test-AzureLogin {
    try {
        $account = az account show --query "user.name" -o tsv 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Azure CLI authenticated as: $account"
            return $true
        }
        else {
            Write-Warning-Custom "Not authenticated with Azure CLI. Please run 'az login'"
            return $false
        }
    }
    catch {
        Write-Warning-Custom "Could not verify Azure authentication"
        return $false
    }
}

function Load-EnvFile {
    param([string]$path)
    
    if (-not (Test-Path $path)) {
        Write-Warning-Custom "Environment file '$path' not found. Using system environment variables."
        return @{}
    }
    
    Write-Info "Loading environment file: $path"
    $env_vars = @{}
    
    Get-Content $path | Where-Object { $_ -and -not $_.StartsWith("#") } | ForEach-Object {
        $key, $value = $_.Split("=", 2)
        if ($key -and $value) {
            $env_vars[$key.Trim()] = $value.Trim()
        }
    }
    
    Write-Success "Loaded $(($env_vars.Keys).Count) environment variables"
    return $env_vars
}

function Generate-VersionTag {
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $tag = "aks-$timestamp"
    Write-Success "Generated version tag: $tag"
    return $tag
}

function Get-RegistryPassword {
    Write-Info "Retrieving ACR credentials..."
    $password = az acr credential show --name $acrName --query "passwords[0].value" -o tsv
    if ($LASTEXITCODE -ne 0) {
        Write-Error-Custom "Failed to retrieve ACR credentials"
        exit 1
    }
    return $password
}

function Docker-Login {
    param([string]$registry, [string]$username, [string]$password)
    
    Write-Info "Logging into Docker registry: $registry"
    echo $password | docker login -u $username --password-stdin $registry
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error-Custom "Docker login failed"
        exit 1
    }
    Write-Success "Docker login successful"
}

function Build-And-Push-Image {
    param(
        [string]$serviceName,
        [string]$dockerfilePath,
        [string]$imageName,
        [string]$tag,
        [hashtable]$buildArgs = @{}
    )
    
    Write-Info "Building $serviceName..."
    
    # Prepare build args
    $buildArgsList = @()
    foreach ($key in $buildArgs.Keys) {
        $buildArgsList += "--build-arg"
        $buildArgsList += "$key=$($buildArgs[$key])"
    }
    
    $fullImageName = "$registryUrl/$imageName`:$tag"
    
    # Build image
    & docker build -t $fullImageName $buildArgsList -f $dockerfilePath (Split-Path $dockerfilePath)
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error-Custom "Docker build failed for $serviceName"
        exit 1
    }
    Write-Success "Docker build successful: $fullImageName"
    
    # Push image
    Write-Info "Pushing $fullImageName to registry..."
    & docker push $fullImageName
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error-Custom "Docker push failed for $imageName"
        exit 1
    }
    Write-Success "Docker push successful"
    
    return $fullImageName
}

function Get-IngressPublicIP {
    Write-Info "Retrieving ingress public IP..."
    
    # Try to get the IP from existing service
    $ip = kubectl get service -n $namespace -o jsonpath='{.items[*].status.loadBalancer.ingress[0].ip}' 2>$null
    
    if ($ip -and $ip.Length -gt 0) {
        Write-Success "Found existing ingress IP: $ip"
        return $ip
    }
    
    Write-Warning-Custom "No ingress IP found yet. Will configure after deployment."
    return ""
}

function Create-Or-Update-Secrets {
    param([hashtable]$envVars, [string]$tag)
    
    Write-Header "Creating/Updating Kubernetes Secrets"
    
    # Check if namespace exists
    $nsExists = kubectl get namespace $namespace 2>$null
    if (-not $nsExists) {
        Write-Info "Creating namespace: $namespace"
        kubectl create namespace $namespace
        Write-Success "Namespace created"
    }
    
    # Build secret data from environment variables
    $secretData = @{}
    
    # AI API Keys
    if ($envVars["HF_API_TOKEN"]) { $secretData["HF_API_TOKEN"] = $envVars["HF_API_TOKEN"] }
    if ($envVars["GEMINI_API_KEY"]) { $secretData["GEMINI_API_KEY"] = $envVars["GEMINI_API_KEY"] }
    if ($envVars["OPENROUTER_API_KEY"]) { $secretData["OPENROUTER_API_KEY"] = $envVars["OPENROUTER_API_KEY"] }
    if ($envVars["GROQ_API_KEY"]) { $secretData["GROQ_API_KEY"] = $envVars["GROQ_API_KEY"] }
    
    # Database credentials
    if ($envVars["DB_PASSWORD"]) { $secretData["DB_PASSWORD"] = $envVars["DB_PASSWORD"] }
    if ($envVars["DB_USER"]) { $secretData["DB_USER"] = $envVars["DB_USER"] }
    
    # RabbitMQ credentials
    if ($envVars["RABBITMQ_USER"]) { $secretData["RABBITMQ_USER"] = $envVars["RABBITMQ_USER"] }
    if ($envVars["RABBITMQ_PASSWORD"]) { $secretData["RABBITMQ_PASSWORD"] = $envVars["RABBITMQ_PASSWORD"] }
    
    # ACR credentials - get admin credentials
    $acrCreds = az acr credential show --name $acrName --query "{username: username, password: passwords[0].value}" -o json | ConvertFrom-Json
    $secretData["ACR_USERNAME"] = $acrCreds.username
    $secretData["ACR_PASSWORD"] = $acrCreds.password
    
    # Create kubectl secret command
    $secretArgs = @("create", "secret", "generic", "biblioteca-secrets", "--namespace=$namespace", "--dry-run=client", "-o", "yaml")
    
    foreach ($key in $secretData.Keys) {
        $secretArgs += "--from-literal=$key=$($secretData[$key])"
    }
    
    Write-Info "Creating/Updating secret 'biblioteca-secrets'..."
    $secretYaml = & kubectl @secretArgs
    $secretYaml | kubectl apply -f -
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error-Custom "Failed to create/update secret"
        exit 1
    }
    Write-Success "Secrets created/updated successfully"
}

function Apply-Kustomize-Manifests {
    param([string]$baseDir, [string]$overlay = "aks")
    
    $kustomizePath = Join-Path $baseDir "k8s" "overlays" $overlay
    
    if (-not (Test-Path $kustomizePath)) {
        Write-Error-Custom "Kustomization path not found: $kustomizePath"
        exit 1
    }
    
    Write-Info "Applying manifests from: $kustomizePath"
    kubectl apply -k $kustomizePath --namespace=$namespace
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error-Custom "Failed to apply manifests"
        exit 1
    }
    Write-Success "Manifests applied successfully"
}

function Update-ConfigMap-IP {
    param([string]$ingressIP)
    
    if (-not $ingressIP) {
        Write-Warning-Custom "Ingress IP not available. Skipping ConfigMap update."
        return
    }
    
    Write-Header "Updating ConfigMap with Ingress IP"
    
    $patchJson = @"
{
  "data": {
    "INGRESS_IP": "$ingressIP",
    "CORS_ORIGIN": "http://$ingressIP",
    "OPENROUTER_REFERER": "http://$ingressIP"
  }
}
"@
    
    Write-Info "Patching ConfigMap 'biblioteca-config' with IP: $ingressIP"
    $patchJson | kubectl patch configmap biblioteca-config --namespace=$namespace -p $patchJson --type merge
    
    if ($LASTEXITCODE -ne 0) {
        Write-Warning-Custom "Failed to patch ConfigMap (may not exist yet)"
    }
    else {
        Write-Success "ConfigMap updated successfully"
    }
}

function Update-Deployments-Images {
    param([hashtable]$images, [string]$namespace)
    
    Write-Header "Updating Deployment Images"
    
    # Map deployment names to container names (some differ)
    $containerNameMap = @{
        "catalog-service" = "catalog-service"
        "chatbot-service" = "chatbot-service"
        "identity-service" = "identity-service"
        "biblioteca-frontend" = "frontend"
    }
    
    foreach ($deploymentName in $images.Keys) {
        $imageUri = $images[$deploymentName]
        $containerName = $containerNameMap[$deploymentName]
        
        if (-not $containerName) {
            $containerName = $deploymentName
        }
        
        Write-Info "Setting image for deployment '$deploymentName' (container: $containerName)"
        
        # Use correct kubectl set image syntax: deployment/NAME CONTAINER=IMAGE
        kubectl set image "deployment/$deploymentName" "$containerName=$imageUri" -n $namespace
        
        if ($LASTEXITCODE -ne 0) {
            Write-Warning-Custom "Failed to set image for $deploymentName (deployment may not exist yet)"
        }
        else {
            Write-Success "Image updated for $deploymentName"
        }
    }
}

function Wait-For-Rollout {
    param([string]$namespace, [int]$timeout = 300)
    
    Write-Header "Waiting for Deployments to Roll Out"
    
    $startTime = Get-Date
    
    # Get all deployments
    $deployments = kubectl get deployments -n $namespace -o jsonpath='{.items[*].metadata.name}' 2>$null
    
    if (-not $deployments) {
        Write-Warning-Custom "No deployments found in namespace $namespace"
        return
    }
    
    $deploymentList = $deployments -split " "
    
    foreach ($deployment in $deploymentList) {
        if ([string]::IsNullOrWhiteSpace($deployment)) { continue }
        
        Write-Info "Waiting for $deployment..."
        kubectl rollout status deployment/$deployment -n $namespace --timeout=${timeout}s
        
        if ($LASTEXITCODE -ne 0) {
            Write-Error-Custom "Rollout failed for $deployment"
            exit 1
        }
        Write-Success "Rollout completed for $deployment"
    }
    
    $duration = ((Get-Date) - $startTime).TotalSeconds
    Write-Success "All deployments rolled out successfully in $($duration)s"
}

function Initialize-Database {
    param([string]$namespace, [string]$initSqlPath)
    
    if (-not (Test-Path $initSqlPath)) {
        Write-Error-Custom "init.sql file not found at: $initSqlPath"
        return
    }
    
    Write-Header "Initializing PostgreSQL Database"
    
    # Find PostgreSQL pod
    $postgresqlPod = kubectl get pods -n $namespace -l app=postgresql -o jsonpath='{.items[0].metadata.name}' 2>$null
    
    if (-not $postgresqlPod) {
        Write-Warning-Custom "PostgreSQL pod not found. Skipping database initialization."
        return
    }
    
    Write-Info "Found PostgreSQL pod: $postgresqlPod"
    
    # Check if database is empty
    $tableCount = kubectl exec -n $namespace $postgresqlPod -- psql -U postgres -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>$null
    
    if ($tableCount -and $tableCount.Trim() -gt 1) {
        Write-Warning-Custom "Database already contains tables. Skipping initialization."
        return
    }
    
    Write-Info "Copying init.sql to PostgreSQL pod..."
    kubectl cp $initSqlPath "$namespace/$postgresqlPod`:/tmp/init.sql" --container=postgresql
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error-Custom "Failed to copy init.sql to pod"
        return
    }
    
    Write-Info "Executing init.sql..."
    kubectl exec -n $namespace $postgresqlPod -- psql -U postgres -f /tmp/init.sql
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error-Custom "Failed to execute init.sql"
        return
    }
    
    Write-Success "Database initialized successfully"
}

function Show-Deployment-Status {
    param([string]$namespace)
    
    Write-Header "Deployment Status"
    
    Write-Host ""
    Write-Host "Pods:" -ForegroundColor Cyan
    kubectl get pods -n $namespace -o wide
    
    Write-Host ""
    Write-Host "Services:" -ForegroundColor Cyan
    kubectl get svc -n $namespace -o wide
    
    Write-Host ""
    Write-Host "Ingress:" -ForegroundColor Cyan
    kubectl get ingress -n $namespace -o wide
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

function Main {
    Write-Header "Biblioteca U - Automated AKS Deployment"
    
    # Step 1: Validate environment
    Write-Header "Step 1: Validating Environment"
    Test-Command "kubectl"
    Test-Command "docker"
    Test-Command "az"
    
    if (-not (Test-AzureLogin)) {
        Write-Host "Please authenticate with Azure CLI first:"
        Write-Host "  az login"
        exit 1
    }
    
    # Step 2: Load environment variables
    Write-Header "Step 2: Loading Configuration"
    $envVars = Load-EnvFile $envFile
    
    # Set Kubernetes context if provided
    if ($kubeContext) {
        Write-Info "Switching to context: $kubeContext"
        kubectl config use-context $kubeContext
    }
    
    # Step 3: Generate version tag
    $versionTag = Generate-VersionTag
    
    # Step 4: Build and push images (unless skipped)
    if (-not $skipBuild) {
        Write-Header "Step 3: Building and Pushing Docker Images"
        
        # Get ACR credentials
        Write-Info "Retrieving ACR admin credentials..."
        $acrCreds = az acr credential show --name $acrName --query "{username: username, password: passwords[0].value}" -o json | ConvertFrom-Json
        $acrUser = $acrCreds.username
        $acrPassword = $acrCreds.password
        
        # Docker login
        Docker-Login $registryUrl $acrUser $acrPassword
        
        $images = @{}
        
        # Build backend services
        foreach ($service in $services) {
            $servicePath = Join-Path (Get-Location) $service.dir
            $dockerfilePath = Join-Path $servicePath "Dockerfile"
            
            if (-not (Test-Path $dockerfilePath)) {
                Write-Warning-Custom "Dockerfile not found for $($service.name), skipping..."
                continue
            }
            
            # ✓ Correcto — solo el nombre, sin tag
            $imageName = $service.name
            $fullImage = Build-And-Push-Image $service.name $dockerfilePath $imageName $versionTag
            $images[$service.name] = $fullImage
        }
        
        # Build frontend
        $frontendPath = Join-Path (Get-Location) $frontend.dir
        $frontendDockerfile = Join-Path $frontendPath "Dockerfile"
        
        if (Test-Path $frontendDockerfile) {
            $ingressIP = Get-IngressPublicIP
            $buildArgs = @{
                "VITE_API_URL" = if ($ingressIP) { "http://$ingressIP" } else { "http://localhost:8080" }
            }
            
            $frontendImage = $frontend.name
            $fullFrontendImage = Build-And-Push-Image $frontend.name $frontendDockerfile $frontendImage $versionTag $buildArgs
            $images[$frontend.name] = $fullFrontendImage
        }
    }
    else {
        Write-Header "Step 3: Skipping Docker Build (--skipBuild)"
    }
    
    # Step 4: Create/Update Kubernetes secrets
    Write-Header "Step 4: Creating/Updating Secrets"
    Create-Or-Update-Secrets $envVars $versionTag
    
    # Step 5: Apply manifests
    Write-Header "Step 5: Applying Kubernetes Manifests"
    Apply-Kustomize-Manifests (Join-Path (Get-Location) $frontend.dir)
    Apply-Kustomize-Manifests (Join-Path (Get-Location) "Biblioteca-Frontend/../biblioteca-microservicios")
    
    # Step 6: Update ingress IP in ConfigMap
    Write-Header "Step 6: Configuring Ingress IP"
    $ingressIP = Get-IngressPublicIP
    if ($ingressIP) {
        Update-ConfigMap-IP $ingressIP
    }
    else {
        Write-Info "Waiting for ingress IP to be assigned..."
        Start-Sleep -Seconds 10
        $ingressIP = Get-IngressPublicIP
        if ($ingressIP) {
            Update-ConfigMap-IP $ingressIP
        }
    }
    
    # Step 7: Update deployments with new images (if built)
    if (-not $skipBuild -and $images.Count -gt 0) {
        Update-Deployments-Images $images $namespace
    }
    
    # Step 8: Wait for rollout
    Write-Header "Step 8: Waiting for Rollout"
    Wait-For-Rollout $namespace
    
    # Step 9: Initialize database (if requested)
    if ($initDb) {
        Write-Header "Step 9: Initializing Database"
        $initSqlPath = Join-Path (Get-Location) "Biblioteca-Frontend/../biblioteca-microservicios/init.sql"
        Initialize-Database $namespace $initSqlPath
    }
    
    # Show final status
    Show-Deployment-Status $namespace
    
    Write-Header "Deployment Complete!"
    Write-Success "All services deployed successfully"
    
    if ($ingressIP) {
        Write-Host ""
        Write-Host "Access your application at: http://$ingressIP" -ForegroundColor Green
    }
}

# Run main function
Main
