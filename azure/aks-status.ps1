param(
    [string]$ResourceGroup = "rg-biblioteca-aks-edu",
    [string]$AksName = "aks-biblioteca-edu"
)

$ErrorActionPreference = "Stop"

az aks show `
    --resource-group $ResourceGroup `
    --name $AksName `
    --query "{name:name, powerState:powerState.code, provisioningState:provisioningState, kubernetesVersion:kubernetesVersion, fqdn:fqdn}" `
    --output table

az aks nodepool list `
    --resource-group $ResourceGroup `
    --cluster-name $AksName `
    --query "[].{name:name, vmSize:vmSize, count:count, mode:mode, powerState:powerState.code}" `
    --output table
