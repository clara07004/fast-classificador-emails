# Script PowerShell para criar tarefa agendada no Windows
# Execute como Administrador: powershell -ExecutionPolicy Bypass -File criar-tarefa-agendada.ps1

$projectPath = "C:\Users\HP\Documents\fast-classificador-emails"
$nodePath = "C:\Program Files\nodejs\node.exe"
$taskName = "Fast-Classificador-Emails"

# Verificar se Node.js está instalado
if (-not (Test-Path $nodePath)) {
    Write-Error "Node.js não encontrado em $nodePath"
    exit 1
}

# Criar action para rodar PM2 start
$action = New-ScheduledTaskAction `
    -Execute $nodePath `
    -Argument "$projectPath\src\index.js" `
    -WorkingDirectory $projectPath

# Criar trigger para rodar ao ligar o computador (com 30s de delay)
$trigger = New-ScheduledTaskTrigger `
    -AtStartup `
    -RandomDelay (New-TimeSpan -Seconds 30)

# Criar settings (rodar com privilégios elevados, mesmo se deslogado)
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -MultipleInstances IgnoreNew

# Criar principal (rodar como usuário HP, sem senha)
$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:COMPUTERNAME\HP" `
    -LogonType ServiceAccount `
    -RunLevel Highest

# Registrar tarefa
Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Force `
    -Description "Classificador de Emails Fast — roda 24/7 com PM2"

Write-Host "✅ Tarefa '$taskName' criada com sucesso!"
Write-Host "A aplicação vai rodar automaticamente quando o computador ligar."
