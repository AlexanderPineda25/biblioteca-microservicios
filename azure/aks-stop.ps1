param(
    [string]$ResourceGroup = "rg-biblioteca-aks-edu",
    [string]$AksName = "aks-biblioteca-edu"
)

$ErrorActionPreference = "Stop"

Write-Host "Stopping AKS cluster '$AksName' in resource group '$ResourceGroup'..."
az aks stop `
    --resource-group $ResourceGroup `
    --name $AksName `
    --output table

Write-Host "AKS stop requested. Compute billing for AKS nodes stops after the cluster reaches Stopped."
Write-Host "Run: .\azure\aks-status.ps1 -ResourceGroup '$ResourceGroup' -AksName '$AksName'"
