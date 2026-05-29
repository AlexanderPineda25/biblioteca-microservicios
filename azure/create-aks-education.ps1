param(
    [string]$ResourceGroup = "rg-biblioteca-aks-edu",
    [string]$Location = "centralus",
    [string]$AcrName = "acrbibliotecaedu",
    [string]$AksName = "aks-biblioteca-edu",
    [string]$NodeVmSize = "Standard_D2s_v3",
    [int]$NodeCount = 1,
    [switch]$InstallIngressNginx
)

$ErrorActionPreference = "Stop"

function Get-AzCli {
    $azCommand = Get-Command az -ErrorAction SilentlyContinue
    if ($azCommand) {
        return $azCommand.Source
    }

    $defaultAzPath = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"
    if (Test-Path $defaultAzPath) {
        return $defaultAzPath
    }

    throw "Azure CLI was not found. Install it or add az.cmd to PATH."
}

$Az = Get-AzCli

Write-Host "Validating Azure session..."
& $Az account show --output table

Write-Host "Creating resource group..."
& $Az group create `
    --name $ResourceGroup `
    --location $Location `
    --output table

Write-Host "Creating Azure Container Registry..."
& $Az acr create `
    --resource-group $ResourceGroup `
    --name $AcrName `
    --sku Basic `
    --admin-enabled false `
    --output table

Write-Host "Creating AKS cluster..."
& $Az aks create `
    --resource-group $ResourceGroup `
    --name $AksName `
    --location $Location `
    --node-count $NodeCount `
    --node-vm-size $NodeVmSize `
    --tier free `
    --enable-managed-identity `
    --attach-acr $AcrName `
    --generate-ssh-keys `
    --output table

Write-Host "Downloading kubeconfig..."
& $Az aks get-credentials `
    --resource-group $ResourceGroup `
    --name $AksName `
    --overwrite-existing

if ($InstallIngressNginx) {
    $helm = Get-Command helm -ErrorAction SilentlyContinue
    if (-not $helm) {
        throw "Helm was not found. Install Helm or rerun without -InstallIngressNginx and install an ingress controller manually."
    }

    Write-Host "Installing ingress-nginx..."
    helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
    helm repo update
    helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx `
        --namespace ingress-nginx `
        --create-namespace `
        --set controller.service.annotations."service\.beta\.kubernetes\.io/azure-load-balancer-health-probe-request-path"=/healthz
}

$AcrLoginServer = & $Az acr show `
    --resource-group $ResourceGroup `
    --name $AcrName `
    --query loginServer `
    --output tsv

Write-Host ""
Write-Host "AKS environment ready."
Write-Host "Resource group: $ResourceGroup"
Write-Host "AKS cluster:    $AksName"
Write-Host "ACR name:       $AcrName"
Write-Host "ACR login:      $AcrLoginServer"
Write-Host ""
Write-Host "Use these values in GitHub repository variables:"
Write-Host "AKS_RESOURCE_GROUP=$ResourceGroup"
Write-Host "AKS_CLUSTER_NAME=$AksName"
Write-Host "ACR_NAME=$AcrName"
Write-Host "ACR_LOGIN_SERVER=$AcrLoginServer"
