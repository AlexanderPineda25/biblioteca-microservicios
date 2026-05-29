param(
    [string]$ResourceGroup = "rg-biblioteca-aks-edu",
    [string]$AksName = "aks-biblioteca-edu"
)

$ErrorActionPreference = "Stop"

Write-Host "Starting AKS cluster '$AksName' in resource group '$ResourceGroup'..."
az aks start `
    --resource-group $ResourceGroup `
    --name $AksName `
    --output table

az aks get-credentials `
    --resource-group $ResourceGroup `
    --name $AksName `
    --overwrite-existing

Write-Host "AKS started and kubeconfig refreshed."
