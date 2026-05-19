#!/usr/bin/env python3
"""
Healthcheck EXTERNO do classificador de emails Fast.

Roda fora do servidor Jelastic — funciona mesmo quando o servidor cai.
Consulta o estadoProcessamento no Convex diretamente via HTTP.
Se o worker estiver sem atividade por mais de STALE_THRESHOLD_MIN,
envia alerta por email usando as credenciais SMTP do .env.

Dependências: nenhuma (usa apenas stdlib Python 3.6+)

Uso:
    python3 scripts/healthcheck-externo.py

Sugestão de agendamento externo:
    Rodar a cada 30 min via Cowork scheduled task ou cron externo.
"""

import json
import os
import smtplib
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from email.mime.text import MIMEText
from pathlib import Path


# ─── Configurações ─────────────────────────────────────────────────────────────

STALE_THRESHOLD_MIN = 60   # Worker sem atividade por esse tempo = problema
COOLDOWN_MIN        = 60   # Mínimo de minutos entre alertas (evita spam)

# Cooldown persiste no próprio diretório do projeto (sobrevive entre execuções)
SCRIPT_DIR    = Path(__file__).parent
PROJECT_DIR   = SCRIPT_DIR.parent
COOLDOWN_FILE = PROJECT_DIR / "logs" / ".healthcheck-externo-cooldown"


# ─── Leitura do .env ───────────────────────────────────────────────────────────

def ler_env() -> dict:
    """Lê o .env do projeto. Retorna dicionário de variáveis."""
    env_path = PROJECT_DIR / ".env"
    if not env_path.exists():
        raise FileNotFoundError(f".env não encontrado em {env_path}")

    env: dict = {}
    with open(env_path, encoding="utf-8") as f:
        for linha in f:
            linha = linha.strip()
            if not linha or linha.startswith("#"):
                continue
            if "=" in linha:
                chave, _, valor = linha.partition("=")
                # Remove aspas simples/duplas se presentes
                valor = valor.strip().strip('"').strip("'")
                env[chave.strip()] = valor
    return env


# ─── Consulta ao Convex via HTTP ───────────────────────────────────────────────

def verificar_worker(convex_url: str, funcionario_id: str) -> tuple[bool, str, int]:
    """
    Consulta estadoProcessamento no Convex via HTTP API.

    Retorna:
        (ok, detalhe, minutos_desde_ultima_atividade)
        ok=True  → worker está ativo
        ok=False → worker parado ou erro de conexão
    """
    url = f"{convex_url.rstrip('/')}/api/query"
    payload = json.dumps({
        "path": "estado:obterEstado",
        "format": "json",
        "args": {"funcionarioId": funcionario_id},
    }).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            corpo = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return False, f"Convex retornou HTTP {e.code}: {e.reason}", -1
    except urllib.error.URLError as e:
        return False, f"Erro de conexão ao Convex ({convex_url}): {e.reason}", -1
    except Exception as e:
        return False, f"Erro inesperado ao consultar Convex: {e}", -1

    if corpo.get("status") != "success":
        return False, f"Convex retornou status inesperado: {json.dumps(corpo)}", -1

    estado = corpo.get("value", {})
    ultima = estado.get("ultimaAtualizacao", 0)
    status_conexao = estado.get("statusConexao", "desconhecido")

    agora_ms = time.time() * 1000
    diff_min = round((agora_ms - ultima) / 1000 / 60)

    if ultima == 0:
        return (
            False,
            "estadoProcessamento.ultimaAtualizacao = 0 — worker nunca atualizou o estado. "
            "Pode ter sido iniciado mas nunca processou um email, ou a tabela foi zerada.",
            diff_min,
        )

    if diff_min > STALE_THRESHOLD_MIN:
        ultima_iso = datetime.fromtimestamp(
            ultima / 1000, tz=timezone.utc
        ).strftime("%d/%m/%Y %H:%M:%S UTC")
        return (
            False,
            f"Worker sem atividade há {diff_min} min (limite: {STALE_THRESHOLD_MIN} min). "
            f"Última atualização registrada: {ultima_iso}. "
            f"Status IMAP no Convex: {status_conexao}.",
            diff_min,
        )

    return True, f"OK — última atividade há {diff_min} min | status IMAP: {status_conexao}", diff_min


# ─── Cooldown ──────────────────────────────────────────────────────────────────

def em_cooldown() -> bool:
    """Retorna True se um alerta foi enviado recentemente (dentro de COOLDOWN_MIN)."""
    if not COOLDOWN_FILE.exists():
        return False
    try:
        ultimo_ms = int(COOLDOWN_FILE.read_text(encoding="utf-8").strip())
        diff_min = (time.time() * 1000 - ultimo_ms) / 1000 / 60
        return diff_min < COOLDOWN_MIN
    except Exception:
        return False


def registrar_alerta():
    """Grava timestamp do alerta atual para controle de cooldown."""
    COOLDOWN_FILE.parent.mkdir(parents=True, exist_ok=True)
    COOLDOWN_FILE.write_text(str(int(time.time() * 1000)), encoding="utf-8")


# ─── Envio de email ────────────────────────────────────────────────────────────

def enviar_alerta(env: dict, detalhe: str):
    """Envia email de alerta via SMTP usando credenciais do .env."""
    smtp_host   = env.get("SMTP_HOST", "")
    smtp_port   = int(env.get("SMTP_PORT", "587"))
    smtp_user   = env.get("SMTP_USER", "")
    smtp_pass   = env.get("SMTP_PASSWORD", "")
    destinatario = env.get("ALERT_EMAIL") or smtp_user

    if not all([smtp_host, smtp_user, smtp_pass, destinatario]):
        print("  SMTP não configurado completamente — impossível enviar alerta por email.")
        print(f"  (SMTP_HOST={smtp_host!r}, SMTP_USER={smtp_user!r}, destinatario={destinatario!r})")
        return

    agora = datetime.now(tz=timezone.utc).strftime("%d/%m/%Y %H:%M:%S UTC")
    corpo = f"""Healthcheck externo detectou um problema no classificador de emails Fast:

PROBLEMA:
{detalhe}

PRÓXIMAS AÇÕES SUGERIDAS:
1. Verificar se o servidor Jelastic está pausado:
   https://app.paas.saveincloud.net.br/
   (período gratuito encerrado → ambientes pausam automaticamente)

2. Se o servidor estiver de pé, verificar o processo:
   pm2 list
   pm2 logs classificador-email --lines 50 --nostream

3. Verificar saldo da Anthropic API:
   https://console.anthropic.com/ → Plans & Billing
   (saldo zerado → worker continua rodando mas cai pro fallback Nível 3)

4. Verificar conectividade Convex:
   https://dashboard.convex.dev → Health

Horário do check: {agora}
Cooldown ativo: próximo alerta só após {COOLDOWN_MIN} min.

---
Healthcheck externo — classificador-email Fast Sistemas Construtivos
"""

    msg = MIMEText(corpo, "plain", "utf-8")
    msg["Subject"] = "⚠️ ALERTA: Classificador de emails Fast sem atividade"
    msg["From"]    = smtp_user
    msg["To"]      = destinatario

    try:
        if smtp_port == 465:
            with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=15) as s:
                s.login(smtp_user, smtp_pass)
                s.send_message(msg)
        else:
            with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as s:
                s.ehlo()
                s.starttls()
                s.ehlo()
                s.login(smtp_user, smtp_pass)
                s.send_message(msg)
        print(f"  Alerta enviado para: {destinatario}")
    except smtplib.SMTPAuthenticationError:
        print("  ERRO: Falha de autenticação SMTP — verifique SMTP_USER e SMTP_PASSWORD no .env")
    except smtplib.SMTPConnectError as e:
        print(f"  ERRO: Não foi possível conectar ao SMTP ({smtp_host}:{smtp_port}): {e}")
    except Exception as e:
        print(f"  ERRO ao enviar alerta: {e}")


# ─── Main ──────────────────────────────────────────────────────────────────────

def main():
    ts = datetime.now(tz=timezone.utc).strftime("%d/%m/%Y %H:%M:%S UTC")
    print(f"[{ts}] Healthcheck externo — classificador-email Fast")
    print(f"  Projeto: {PROJECT_DIR}")

    # 1. Carregar configuração
    try:
        env = ler_env()
    except FileNotFoundError as e:
        print(f"  ERRO: {e}")
        return

    convex_url     = env.get("CONVEX_URL", "").rstrip("/")
    funcionario_id = env.get("PILOTO_FUNCIONARIO_ID", "")

    if not convex_url:
        print("  ERRO: CONVEX_URL não definida no .env")
        return
    if not funcionario_id:
        print("  ERRO: PILOTO_FUNCIONARIO_ID não definida no .env")
        return

    print(f"  Convex: {convex_url}")
    print(f"  FuncionárioId: {funcionario_id[:8]}…")

    # 2. Verificar worker
    ok, detalhe, diff_min = verificar_worker(convex_url, funcionario_id)

    if ok:
        print(f"  ✓ {detalhe}")
        return

    # 3. Problema detectado
    print(f"  ✗ Problema: {detalhe}")

    if em_cooldown():
        print(f"  Em cooldown — alerta já enviado recentemente. Aguardando {COOLDOWN_MIN} min.")
        return

    # 4. Enviar alerta
    print("  Enviando alerta por email...")
    enviar_alerta(env, detalhe)
    registrar_alerta()


if __name__ == "__main__":
    main()
