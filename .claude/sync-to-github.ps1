# Sincroniza commits com GitHub, com validação e retry automático
param(
    [string]$Message = "chore: auto-sync workspace"
)

$ErrorActionPreference = "Stop"

function Out-Status {
    param([string]$Message, [string]$Color = "Green")
    Write-Host "[SYNC] $Message" -ForegroundColor $Color
}

try {
    # 1. Verificar se há alterações
    $status = git status --porcelain
    $haChanges = $null -ne $status -and $status.Trim().Length -gt 0

    if ($haChanges) {
        Out-Status "Detectadas alterações, criando commit..."
        git add -A
        git commit -m $Message
        Out-Status "✓ Commit criado"
    } else {
        Out-Status "Nenhuma alteração detectada"
    }

    # 2. Verificar divergência com remote
    git fetch origin --quiet 2>$null
    $ahead = git rev-list --count origin/main..HEAD

    if ($ahead -gt 0) {
        Out-Status "Local está $ahead commit(s) à frente, iniciando push..." -Color "Yellow"

        # 3. Push com retry automático (max 3 tentativas)
        $maxRetries = 3
        $attempt = 0
        $pushSuccess = $false

        while ($attempt -lt $maxRetries -and -not $pushSuccess) {
            $attempt++
            try {
                Out-Status "Tentativa $attempt/$maxRetries..." -Color "Yellow"
                git push origin main --quiet
                $pushSuccess = $true
                Out-Status "✓ Push concluído com sucesso!" -Color "Green"
            } catch {
                if ($attempt -lt $maxRetries) {
                    Out-Status "Falha na tentativa $attempt, aguardando 2s antes de retry..." -Color "Yellow"
                    Start-Sleep -Seconds 2
                } else {
                    throw "Push falhou após $maxRetries tentativas: $_"
                }
            }
        }
    } else {
        Out-Status "Repositório sincronizado com origin/main ✓"
    }

} catch {
    Out-Status "ERRO: $_" -Color "Red"
    exit 1
}
