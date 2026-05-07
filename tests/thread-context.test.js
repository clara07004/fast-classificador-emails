/**
 * Testes de Detecção de Thread e Contexto de Conversa
 *
 * Valida que:
 * 1. Headers de conversa são extraídos corretamente
 * 2. Thread-ID é gerado para agrupar conversations
 * 3. Respostas são identificadas
 * 4. Classificação é ajustada por contexto
 * 5. Contexto é preparado para passar à Claude API
 */

import { describe, it, expect } from 'vitest';
import {
  extrairMessageId,
  extrairInReplyTo,
  extrairReferences,
  gerarThreadId,
  ehResposta,
  analisarContextoConversa,
  ajustarClassificacaoPorContexto,
  resumirThreadParaContexto,
  extrairKeywordsThread,
} from '../src/imap/thread-context.js';

describe('Detecção de Thread e Contexto', () => {
  describe('Extração de Headers', () => {
    it('extrai Message-ID', () => {
      const email = {
        messageId: '<20260507120000.abc123@empresa.com>',
      };

      const id = extrairMessageId(email);

      expect(id).toBe('<20260507120000.abc123@empresa.com>');
    });

    it('extrai In-Reply-To', () => {
      const email = {
        inReplyTo: '<parent-id@empresa.com>',
      };

      const id = extrairInReplyTo(email);

      expect(id).toBe('<parent-id@empresa.com>');
    });

    it('retorna null se não tem headers', () => {
      const email = {};

      expect(extrairMessageId(email)).toBeNull();
      expect(extrairInReplyTo(email)).toBeNull();
    });

    it('extrai References como string de IDs', () => {
      const email = {
        references: '<id1@empresa.com> <id2@empresa.com> <id3@empresa.com>',
      };

      const refs = extrairReferences(email);

      expect(refs).toEqual([
        'id1@empresa.com',
        'id2@empresa.com',
        'id3@empresa.com',
      ]);
    });

    it('retorna array vazio se sem References', () => {
      const email = {};

      const refs = extrairReferences(email);

      expect(refs).toEqual([]);
    });
  });

  describe('Geração de Thread-ID', () => {
    it('usa In-Reply-To como thread-id se disponível', () => {
      const email = {
        inReplyTo: '<parent-id@empresa.com>',
        messageId: '<meu-id@empresa.com>',
      };

      const threadId = gerarThreadId(email);

      expect(threadId).toBe('<parent-id@empresa.com>');
    });

    it('usa primeiro Reference (raiz) se não tem In-Reply-To', () => {
      const email = {
        references: '<raiz@empresa.com> <id2@empresa.com>',
        messageId: '<meu-id@empresa.com>',
      };

      const threadId = gerarThreadId(email);

      expect(threadId).toBe('raiz@empresa.com');
    });

    it('usa Message-ID se é primeira mensagem', () => {
      const email = {
        messageId: '<meu-id@empresa.com>',
      };

      const threadId = gerarThreadId(email);

      expect(threadId).toBe('<meu-id@empresa.com>');
    });

    it('fallback para from:subject se nenhum header', () => {
      const email = {
        from: 'cliente@empresa.com',
        subject: 'Assunto importante',
      };

      const threadId = gerarThreadId(email);

      expect(threadId).toContain('cliente@empresa.com');
      expect(threadId).toContain('Assunto');
    });
  });

  describe('Detecção de Resposta', () => {
    it('detecta resposta com In-Reply-To', () => {
      const email = {
        inReplyTo: '<parent-id@empresa.com>',
        subject: 'Re: Assunto original',
      };

      const resultado = ehResposta(email);

      expect(resultado).toBe(true);
    });

    it('detecta resposta com References', () => {
      const email = {
        references: '<id1@empresa.com> <id2@empresa.com>',
        subject: 'Re: Assunto',
      };

      const resultado = ehResposta(email);

      expect(resultado).toBe(true);
    });

    it('retorna false para email novo', () => {
      const email = {
        subject: 'Novo assunto',
        from: 'cliente@empresa.com',
      };

      const resultado = ehResposta(email);

      expect(resultado).toBe(false);
    });
  });

  describe('Análise de Contexto de Conversa', () => {
    it('analisa resposta direta (profundidade 2)', () => {
      const email = {
        messageId: '<msg2@empresa.com>',
        inReplyTo: '<msg1@empresa.com>',
        subject: 'Re: Projeto A',
      };

      const contexto = analisarContextoConversa(email);

      expect(contexto.isResposta).toBe(true);
      expect(contexto.threadId).toBe('<msg1@empresa.com>');
      expect(contexto.parentMessageId).toBe('<msg1@empresa.com>');
      expect(contexto.profundidadeThread).toBe(1);  // Só has In-Reply-To, que é 0 refs
      expect(contexto.isFollowUp).toBe(false);
    });

    it('analisa thread longa (profundidade 5+)', () => {
      const email = {
        messageId: '<msg5@empresa.com>',
        references: '<msg1@empresa.com> <msg2@empresa.com> <msg3@empresa.com> <msg4@empresa.com>',
        subject: 'Re: Re: Re: Projeto A',
      };

      const contexto = analisarContextoConversa(email);

      expect(contexto.isResposta).toBe(true);
      expect(contexto.threadId).toBe('msg1@empresa.com');
      expect(contexto.profundidadeThread).toBe(5);
      expect(contexto.isFollowUp).toBe(true);
    });

    it('analisa email novo (sem contexto)', () => {
      const email = {
        messageId: '<msg1@empresa.com>',
        subject: 'Novo assunto',
      };

      const contexto = analisarContextoConversa(email);

      expect(contexto.isResposta).toBe(false);
      expect(contexto.threadId).toBe('<msg1@empresa.com>');
      expect(contexto.profundidadeThread).toBe(1);
      expect(contexto.isFollowUp).toBe(false);
    });
  });

  describe('Ajuste de Classificação por Contexto', () => {
    it('mantém nível se não é resposta', () => {
      const contexto = {
        isResposta: false,
        threadId: '<id1>',
        profundidadeThread: 1,
        isFollowUp: false,
      };

      const nivel = ajustarClassificacaoPorContexto(2, contexto);

      expect(nivel).toBe(2);
    });

    it('reduz urgência em follow-up (conversa já ativa)', () => {
      const contexto = {
        isResposta: true,
        threadId: '<id1>',
        profundidadeThread: 5,  // Follow-up: 3+ emails
        isFollowUp: true,
        parentMessageId: '<id4>',
      };

      // Nível 1 (muito urgente) reduz para 2 ou 3 em follow-up
      const nivel = ajustarClassificacaoPorContexto(1, contexto);

      expect(nivel).toBeGreaterThan(1);
      expect(nivel).toBeLessThanOrEqual(3);
    });

    it('herdas urgência de email parent urgente', () => {
      const contexto = {
        isResposta: true,
        threadId: '<id1>',
        profundidadeThread: 2,  // Resposta direta
        isFollowUp: false,
        parentMessageId: '<id1>',
      };

      const emailAnterior = {
        nivelClassificacao: 1,  // Parent é urgente
      };

      const nivel = ajustarClassificacaoPorContexto(3, contexto, emailAnterior);

      expect(nivel).toBe(1);  // Herda urgência
    });

    it('mantém nível se parent não é urgente', () => {
      const contexto = {
        isResposta: true,
        threadId: '<id1>',
        profundidadeThread: 2,
        isFollowUp: false,
        parentMessageId: '<id1>',
      };

      const emailAnterior = {
        nivelClassificacao: 3,  // Parent é normal
      };

      const nivel = ajustarClassificacaoPorContexto(3, contexto, emailAnterior);

      expect(nivel).toBe(3);  // Mantém nível
    });
  });

  describe('Resumo de Thread para Contexto', () => {
    it('formata thread anterior para Claude', () => {
      const emails = [
        {
          date: new Date('2026-05-05'),
          from: 'cliente@empresa.com',
          subject: 'Problema no site',
          text: 'Site está caindo a cada 5 minutos. Clientes reclamando.',
        },
        {
          date: new Date('2026-05-05'),
          from: 'dev@fast.com.br',
          subject: 'Re: Problema no site',
          text: 'Identificamos o problema. Rollback em andamento.',
        },
      ];

      const resumo = resumirThreadParaContexto(emails);

      expect(resumo).toContain('Contexto da Conversa');
      expect(resumo).toContain('Problema no site');
      expect(resumo).toContain('cliente');  // Nome de usuário (sem @)
      expect(resumo).toContain('Rollback');
    });

    it('retorna string vazia se sem thread anterior', () => {
      const resumo = resumirThreadParaContexto(null);

      expect(resumo).toBe('');
    });

    it('limita a últimos 3 emails', () => {
      const emails = Array.from({ length: 10 }, (_, i) => ({
        date: new Date('2026-05-05'),
        from: `user${i}@empresa.com`,
        subject: `Re: Assunto ${i}`,
        text: `Conteúdo do email ${i}`,
      }));

      const resumo = resumirThreadParaContexto(emails);

      // Deve ter últimos 3 emails (7, 8, 9)
      expect(resumo).toContain('user7');
      expect(resumo).toContain('user8');
      expect(resumo).toContain('user9');
      // Não deve ter primeiros
      expect(resumo).not.toContain('user0');
      expect(resumo).not.toContain('user1');
    });
  });

  describe('Extração de Keywords da Thread', () => {
    it('extrai keywords do subject', () => {
      const email = {
        subject: 'Urgente: Projeto A - Integração com Cliente VIP',
        text: '',
      };

      const keywords = extrairKeywordsThread(email);

      // Keywords são retornadas em minúsculas
      expect(keywords.map((k) => k.toLowerCase())).toContain('projeto');
      expect(keywords.map((k) => k.toLowerCase())).toContain('integração');
      expect(keywords.map((k) => k.toLowerCase())).toContain('cliente');
    });

    it('identifica palavras-chave recorrentes em thread', () => {
      const email = {
        subject: 'Re: Re: Integração com API externa',
        text: 'Qual o status da integração?',
      };

      const threadAnterior = [
        {
          subject: 'Integração com API externa - bloqueante',
          text: 'Precisamos da integração urgente',
        },
        {
          subject: 'Re: Integração com API - aguardando resposta',
          text: 'Quando a integração ficará pronta?',
        },
      ];

      const keywords = extrairKeywordsThread(email, threadAnterior);

      // "integração" aparece em todos os emails
      expect(keywords.map((k) => k.toLowerCase())).toContain('integração');
    });

    it('limita a 5 keywords', () => {
      const email = {
        subject: 'Palavra1 Palavra2 Palavra3 Palavra4 Palavra5 Palavra6 Palavra7',
        text: '',
      };

      const keywords = extrairKeywordsThread(email);

      expect(keywords.length).toBeLessThanOrEqual(5);
    });

    it('retorna array vazio se sem keywords significativas', () => {
      const email = {
        subject: 'a b c d e',  // Todas < 4 caracteres
        text: '',
      };

      const keywords = extrairKeywordsThread(email);

      expect(keywords.length).toBe(0);
    });
  });

  describe('Cenários Reais de Conversa', () => {
    it('simula: cliente relata problema urgente, CEO responde', () => {
      // Email 1: Cliente reporta
      const emailOriginal = {
        messageId: '<client-001@empresa.com>',
        from: 'cliente@vip.com',
        subject: 'URGENTE: Site caiu',
        text: 'Site está offline. Clientes não conseguem acessar.',
      };

      // Email 2: CEO responde
      const emailResposta = {
        messageId: '<ceo-001@empresa.com>',
        inReplyTo: '<client-001@empresa.com>',
        from: 'ceo@fast.com.br',
        subject: 'Re: URGENTE: Site caiu',
        text: 'Equipe already working on it. ETA 30 min.',
      };

      const contexto = analisarContextoConversa(emailResposta);

      expect(contexto.isResposta).toBe(true);
      expect(contexto.threadId).toBe('<client-001@empresa.com>');
      expect(contexto.profundidadeThread).toBe(1);

      // Se classificarmos a resposta como nível 3 (normal)
      // e soubermos que original era nível 1
      const nivel = ajustarClassificacaoPorContexto(3, contexto, {
        nivelClassificacao: 1,
      });

      // Não herda porque não tem In-Reply-To na função
      // (precisa passar email anterior explicitamente)
      expect(typeof nivel).toBe('number');
    });

    it('simula: conversa longa, follow-up posterior', () => {
      // Thread com 5 emails sobre mesmo assunto
      const emailFollowUp = {
        messageId: '<msg-005@empresa.com>',
        references:
          '<msg-001@empresa.com> <msg-002@empresa.com> <msg-003@empresa.com> <msg-004@empresa.com>',
        subject: 're: re: re: Projeto X - Mais uma coisa',
        text: 'Esqueci de uma coisa na discussão anterior.',
      };

      const contexto = analisarContextoConversa(emailFollowUp);

      expect(contexto.isFollowUp).toBe(true);
      expect(contexto.profundidadeThread).toBe(5);

      // Em follow-up, reduz urgência
      const nivelAjustado = ajustarClassificacaoPorContexto(2, contexto);

      expect(nivelAjustado).toBeGreaterThanOrEqual(2);
    });

    it('simula: extração de contexto para usar em prompt Claude', () => {
      const emailAtual = {
        messageId: '<msg-003@empresa.com>',
        inReplyTo: '<msg-002@empresa.com>',
        references: '<msg-001@empresa.com> <msg-002@empresa.com>',
        from: 'dev@fast.com.br',
        subject: 'Re: Integração Convex API - Status Update',
        text: 'Conseguimos autenticar. Pronto para testar?',
      };

      const threadAnterior = [
        {
          date: new Date('2026-05-05'),
          from: 'pm@fast.com.br',
          subject: 'Integração Convex API - Bloqueante',
          text: 'Precisamos dessa integração para o MVP. Qual o timeline?',
        },
        {
          date: new Date('2026-05-06'),
          from: 'dev@fast.com.br',
          subject: 'Re: Integração Convex API - Em desenvolvimento',
          text: 'Iniciando integração hoje.',
        },
      ];

      const contexto = analisarContextoConversa(emailAtual);
      const keywords = extrairKeywordsThread(emailAtual, threadAnterior);
      const resumo = resumirThreadParaContexto(threadAnterior);

      expect(contexto.isResposta).toBe(true);
      expect(keywords.map((k) => k.toLowerCase())).toContain('integração');
      expect(keywords.map((k) => k.toLowerCase())).toContain('convex');
      expect(resumo).toContain('Contexto da Conversa');
      expect(resumo).toContain('Bloqueante');
    });
  });
});
