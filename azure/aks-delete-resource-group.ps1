param(
    [string]$ResourceGroup = "rg-biblioteca-aks-edu",
    [switch]$ConfirmDelete
)

$ErrorActionPreference = "Stop"

if (-not $ConfirmDelete) {
    Write-Host "This deletes the entire resource group '$ResourceGroup' and all AKS/ACR/network/storage resources inside it."
    Write-Host "Run again with -ConfirmDelete when you are sure:"
    Write-Host ".\azure\aks-delete-resource-group.ps1 -ResourceGroup '$ResourceGroup' -ConfirmDelete"
    exit 1
}

Write-Host "Deleting resource group '$ResourceGroup'..."
az group delete `
    --name $ResourceGroup `
    --yes `
    --no-wait

Write-Host "Deletion requested. Check progress with:"
Write-Host "az group show --name '$ResourceGroup' --output table"
