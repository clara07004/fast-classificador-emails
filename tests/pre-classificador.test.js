/**
 * Testes de Pré-classificador Determinístico
 *
 * Valida que:
 * 1. Emails urgentes são detectados por padrões
 * 2. Blacklist de senders automáticos funciona
 * 3. Whitelist VIP é respeitada
 * 4. Auto-resposta é detectada
 * 5. Tickets de suporte são identificados
 * 6. Casos normais retornam classificado=false (para usar IA)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  tentarClassificarSemIA,
  adicionarSenderVIP,
  removerSenderVIP,
  analisarEmail,
} from '../src/imap/pre-classificador.js';

describe('Pré-classificador Determinístico', () => {
  const funcionario = {
    id: 'func-001',
    email: 'jorge@fast.com.br',
  };

  afterEach(() => {
    // Limpar whitelist após cada teste
    removerSenderVIP('vip@cliente.com');
    removerSenderVIP('gerente@fast.com.br');
  });

  describe('Detectar Urgência em Subject', () => {
    it('detecta URGENTE em subject', async () => {
      const email = {
        from: 'cliente@empresa.com',
        subject: 'URGENTE: Fachada interdita no Projeto A',
        text: 'Cliente relata que fachada caiu',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      expect(resultado.classificado).toBe(true);
      expect(resultado.nivel).toBe(1);
      expect(resultado.motivo).toBe('urgencia_detectada');
    });

    it('detecta EMERGÊNCIA', async () => {
      const email = {
        from: 'cliente@empresa.com',
        subject: 'EMERGÊNCIA - SITE CAIU',
        text: '',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      expect(resultado.classificado).toBe(true);
      expect(resultado.nivel).toBe(1);
    });

    it('detecta CRÍTICO', async () => {
      const email = {
        from: 'cliente@empresa.com',
        subject: 'CRÍTICO: Perda de cliente - Projeto B',
        text: '',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      expect(resultado.classificado).toBe(true);
      expect(resultado.nivel).toBe(1);
    });

    it('detecta ASAP', async () => {
      const email = {
        from: 'cliente@empresa.com',
        subject: 'ASAP: Orçamento necessário',
        text: '',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      expect(resultado.classificado).toBe(true);
      expect(resultado.nivel).toBe(1);
    });

    it('detecta site interditada', async () => {
      const email = {
        from: 'cliente@empresa.com',
        subject: 'Fachada Interdita no Projeto',
        text: '',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      expect(resultado.classificado).toBe(true);
      expect(resultado.nivel).toBe(1);
    });

    it('detecta interrupção de trabalho', async () => {
      const email = {
        from: 'operacional@empresa.com',
        subject: 'Interrupção do trabalho no canteiro',
        text: '',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      expect(resultado.classificado).toBe(true);
      expect(resultado.nivel).toBe(1);
    });
  });

  describe('Detectar Nível 2 (Importante)', () => {
    it('detecta IMPORTANTE', async () => {
      const email = {
        from: 'gerente@fast.com.br',
        subject: 'IMPORTANTE: Mudança de processo',
        text: '',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      expect(resultado.classificado).toBe(true);
      expect(resultado.nivel).toBe(2);
    });

    it('detecta lembrete importante', async () => {
      const email = {
        from: 'sistema@fast.com.br',
        subject: 'Lembrete Importante: Reunião de projeto',
        text: '',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      expect(resultado.classificado).toBe(true);
      expect(resultado.nivel).toBe(2);
    });

    it('detecta pedido de cliente', async () => {
      const email = {
        from: 'cliente@empresa.com',
        subject: 'Pedido de cliente: Orçamento urgente',
        text: '',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      expect(resultado.classificado).toBe(true);
      expect(resultado.nivel).toBe(2);
    });

    it('detecta projeto em atraso', async () => {
      const email = {
        from: 'gerente@fast.com.br',
        subject: 'Projeto em atraso - ação necessária',
        text: '',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      expect(resultado.classificado).toBe(true);
      expect(resultado.nivel).toBe(2);
    });
  });

  describe('Blacklist de Senders Automáticos', () => {
    it('bloqueia emails do LinkedIn', async () => {
      const email = {
        from: 'notification@linkedin.com',
        subject: 'Você tem uma oportunidade',
        text: '',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      expect(resultado.classificado).toBe(true);
      expect(resultado.nivel).toBe(5); // FYI
      expect(resultado.motivo).toBe('sender_blacklist');
    });

    it('bloqueia emails de redes sociais', async () => {
      const email = {
        from: 'noreply@twitter.com',
        subject: 'Novo tweet de alguém que você segue',
        text: '',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      expect(resultado.classificado).toBe(true);
      expect(resultado.nivel).toBe(5);
      expect(resultado.motivo).toBe('sender_blacklist');
    });

    it('bloqueia noreply@', async () => {
      const email = {
        from: 'noreply@banco.com.br',
        subject: 'Seu extrato está pronto',
        text: '',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      expect(resultado.classificado).toBe(true);
      expect(resultado.nivel).toBe(5);
    });

    it('bloqueia automated@', async () => {
      const email = {
        from: 'automated@empresa.com',
        subject: 'Backup diário realizado',
        text: '',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      expect(resultado.classificado).toBe(true);
      expect(resultado.nivel).toBe(5);
    });

    it('bloqueia alert@', async () => {
      const email = {
        from: 'alert@servidor.com.br',
        subject: 'Alerta de CPU alta',
        text: '',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      expect(resultado.classificado).toBe(true);
      expect(resultado.nivel).toBe(5);
    });
  });

  describe('Whitelist VIP', () => {
    it('adiciona sender VIP e classifica como nível 1', async () => {
      adicionarSenderVIP('vip@cliente.com', 1);

      const email = {
        from: 'vip@cliente.com',
        subject: 'Assunto qualquer',
        text: 'Email normal de conteúdo',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      expect(resultado.classificado).toBe(true);
      expect(resultado.nivel).toBe(1);
      expect(resultado.motivo).toBe('sender_whitelist');
    });

    it('respeita nível VIP configurado', async () => {
      adicionarSenderVIP('gerente@fast.com.br', 2);

      const email = {
        from: 'gerente@fast.com.br',
        subject: 'Assunto genérico',
        text: 'Conteúdo genérico',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      expect(resultado.classificado).toBe(true);
      expect(resultado.nivel).toBe(2);
    });

    it('remove sender VIP', async () => {
      adicionarSenderVIP('vip@cliente.com', 1);
      removerSenderVIP('vip@cliente.com');

      const email = {
        from: 'vip@cliente.com',
        subject: 'Email normal sem urgência',
        text: 'Conteúdo normal',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      // Sem VIP, sem urgência → não classifica
      expect(resultado.classificado).toBe(false);
    });
  });

  describe('Auto-resposta Detection', () => {
    it('detecta out of office', async () => {
      const email = {
        from: 'colega@fast.com.br',
        subject: 'Out of office',
        text: 'Estou fora do escritório até dia 15. Qualquer dúvida contate João.',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      expect(resultado.classificado).toBe(true);
      expect(resultado.nivel).toBe(5); // FYI
      expect(resultado.motivo).toBe('auto_resposta');
    });

    it('detecta ausente', async () => {
      const email = {
        from: 'fornecedor@empresa.com',
        subject: 'Re: Orçamento',
        text: 'Obrigado pelo email. Estou ausente no momento.',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      expect(resultado.classificado).toBe(true);
      expect(resultado.nivel).toBe(5);
    });

    it('detecta férias', async () => {
      const email = {
        from: 'colega@fast.com.br',
        subject: 'Estou em férias',
        text: 'Estarei em férias até 20/05. Retorno em 21/05.',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      expect(resultado.classificado).toBe(true);
      expect(resultado.nivel).toBe(5);
    });

    it('detecta vacation', async () => {
      const email = {
        from: 'cliente@empresa.com',
        subject: 'Vacation notice',
        text: 'I am on vacation and will return on May 20.',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      expect(resultado.classificado).toBe(true);
      expect(resultado.nivel).toBe(5);
    });

    it('detecta automático', async () => {
      const email = {
        from: 'sistema@empresa.com',
        subject: 'Respuesta automática',
        text: 'Esta es una respuesta automática.',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      expect(resultado.classificado).toBe(true);
      expect(resultado.nivel).toBe(5);
    });
  });

  describe('Ticket Detection', () => {
    it('detecta ticket com [TICKET-NNN]', async () => {
      const email = {
        from: 'suporte@empresa.com',
        subject: '[TICKET-12345] Problema com integração',
        text: 'Seu ticket foi criado',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      expect(resultado.classificado).toBe(true);
      expect(resultado.nivel).toBe(3); // Normal
      expect(resultado.motivo).toBe('ticket_detectado');
    });

    it('detecta com [REQ-NNN]', async () => {
      const email = {
        from: 'sistema@empresa.com',
        subject: '[REQ-456] Novo usuário criado',
        text: '',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      expect(resultado.classificado).toBe(true);
      expect(resultado.nivel).toBe(3);
    });

    it('detecta com REQ#NNN', async () => {
      const email = {
        from: 'sistema@empresa.com',
        subject: 'REQ#789: Aprovação de documento',
        text: '',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      expect(resultado.classificado).toBe(true);
      expect(resultado.nivel).toBe(3);
    });

    it('detecta com [ISSUE-NNN]', async () => {
      const email = {
        from: 'github@empresa.com',
        subject: '[ISSUE-999] Bug na API de usuários',
        text: '',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      expect(resultado.classificado).toBe(true);
      expect(resultado.nivel).toBe(3);
    });
  });

  describe('Emails normais (sem classificação)', () => {
    it('não classifica email normal sem padrões', async () => {
      const email = {
        from: 'colega@fast.com.br',
        subject: 'Como você está?',
        text: 'Tudo bem? Vamos tomar café?',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      expect(resultado.classificado).toBe(false);
    });

    it('não classifica email técnico genérico', async () => {
      const email = {
        from: 'dev@empresa.com',
        subject: 'Merge request review',
        text: 'Pode revisar o PR #123?',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      expect(resultado.classificado).toBe(false);
    });

    it('retorna false se sem from ou subject', async () => {
      const email = {
        from: null,
        subject: 'Algum assunto',
        text: '',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      expect(resultado.classificado).toBe(false);
    });
  });

  describe('Análise de Email (Debug)', () => {
    it('fornece análise detalhada de padrões', () => {
      const email = {
        from: 'noreply@linkedin.com',
        subject: 'URGENTE: Oportunidade de emprego',
        text: 'LinkedIn: você foi encontrado',
      };

      const analise = analisarEmail(email);

      expect(analise.ehBlacklist).toBe(true);
      expect(analise.ehVIP).toBe(false);
      expect(analise.nivelUrgencia).toBe(1);
      expect(analise.ehAutoresposta).toBe(false);
      expect(analise.ehTicket).toBe(false);
    });

    it('analisa email complexo', () => {
      const email = {
        from: 'cliente@empresa.com',
        subject: '[TICKET-123] URGENTE: Site caiu',
        text: 'Out of office — this is automatic reply. Site caiu.',
      };

      const analise = analisarEmail(email);

      expect(analise.ehBlacklist).toBe(false);
      expect(analise.nivelUrgencia).toBe(1);
      expect(analise.ehAutoresposta).toBe(true);
      expect(analise.ehTicket).toBe(true);
    });
  });

  describe('Cenários Reais', () => {
    it('simula: email de cliente VIP com urgência → nível 1', async () => {
      adicionarSenderVIP('ceo@cliente-vip.com', 1);

      const email = {
        from: 'ceo@cliente-vip.com',
        subject: 'Email normal',
        text: 'Conteúdo normal',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      expect(resultado.classificado).toBe(true);
      expect(resultado.nivel).toBe(1);
      expect(resultado.motivo).toBe('sender_whitelist');
    });

    it('simula: email de LinkedIn com URGENTE → FYI (blacklist antes de urgência)', async () => {
      const email = {
        from: 'notification@linkedin.com',
        subject: 'URGENTE: Oportunidade de emprego',
        text: '',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      // Blacklist vence: nível 5
      expect(resultado.classificado).toBe(true);
      expect(resultado.nivel).toBe(5);
      expect(resultado.motivo).toBe('sender_blacklist');
    });

    it('simula: ticket do suporte com urgência no assunto → nível 1', async () => {
      const email = {
        from: 'suporte@empresa.com',
        subject: '[TICKET-999] URGENTE: Sistema caiu',
        text: '',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      // Urgência é detectada ANTES de ticket
      expect(resultado.classificado).toBe(true);
      expect(resultado.nivel).toBe(1);
      expect(resultado.motivo).toBe('urgencia_detectada');
    });

    it('simula: auto-resposta de colega → FYI', async () => {
      const email = {
        from: 'colega@fast.com.br',
        subject: 'Re: Projeto A',
        text: 'Out of office until May 20. Contact João for urgent matters.',
      };

      const resultado = await tentarClassificarSemIA(email, funcionario);

      expect(resultado.classificado).toBe(true);
      expect(resultado.nivel).toBe(5);
      expect(resultado.motivo).toBe('auto_resposta');
    });
  });
});
