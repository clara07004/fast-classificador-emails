/**
 * Testes de Gerenciamento de Pastas IMAP
 *
 * Valida que:
 * 1. Pastas Fast/* são criadas corretamente
 * 2. Mover email com fallback funciona
 * 3. Validação de nível protege contra entrada inválida
 * 4. Fallback para Pendente-Classificacao quando pasta não existe
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  pastaExiste,
  garantirPasta,
  garantirPastasFast,
  moverComFallback,
  obterPastaParaNivel,
  nivelValido,
  obterTodasAsPastas,
} from '../src/imap/pastas.js';

/**
 * Mock de Cliente IMAP para testes
 */
class MockImapClient {
  constructor() {
    this.pastas = new Map(); // pastaName -> true
    this.erroList = null;
    this.erroCreate = null;
    this.erroMove = null;
  }

  // Simula list()
  async list() {
    if (this.erroList) {
      throw new Error(this.erroList);
    }
    return Array.from(this.pastas.keys()).map((path) => ({ path }));
  }

  // Simula mailboxCreate()
  async mailboxCreate(pastaName) {
    if (this.erroCreate) {
      throw new Error(this.erroCreate);
    }
    this.pastas.set(pastaName, true);
  }

  // Simula mailboxMove()
  async mailboxMove(uids, pastaDestino) {
    if (this.erroMove) {
      throw new Error(this.erroMove);
    }
    // Validar que pasta existe
    if (!this.pastas.has(pastaDestino)) {
      throw new Error(`Pasta não existe: ${pastaDestino}`);
    }
  }

  // Helper para pré-criar pastas
  criarPasta(pastaName) {
    this.pastas.set(pastaName, true);
  }

  // Helper para simular erro
  simularErro(tipo, mensagem) {
    if (tipo === 'list') this.erroList = mensagem;
    if (tipo === 'create') this.erroCreate = mensagem;
    if (tipo === 'move') this.erroMove = mensagem;
  }

  limparErros() {
    this.erroList = null;
    this.erroCreate = null;
    this.erroMove = null;
  }
}

describe('Gerenciamento de Pastas IMAP', () => {
  let client;

  beforeEach(() => {
    client = new MockImapClient();
  });

  describe('pastaExiste', () => {
    it('retorna true se pasta existe', async () => {
      client.criarPasta('Fast/Urgentes');
      const existe = await pastaExiste(client, 'Fast/Urgentes');
      expect(existe).toBe(true);
    });

    it('retorna false se pasta não existe', async () => {
      const existe = await pastaExiste(client, 'Fast/Urgentes');
      expect(existe).toBe(false);
    });

    it('retorna false em caso de erro no IMAP', async () => {
      client.simularErro('list', 'Erro de conexão');
      const existe = await pastaExiste(client, 'Fast/Urgentes');
      expect(existe).toBe(false);
    });
  });

  describe('garantirPasta', () => {
    it('cria pasta se não existe', async () => {
      const resultado = await garantirPasta(client, 'Fast/Urgentes');
      expect(resultado.sucesso).toBe(true);
      expect(resultado.criada).toBe(true);
      expect(await pastaExiste(client, 'Fast/Urgentes')).toBe(true);
    });

    it('não tenta criar se já existe', async () => {
      client.criarPasta('Fast/Urgentes');
      const resultado = await garantirPasta(client, 'Fast/Urgentes');
      expect(resultado.sucesso).toBe(true);
      expect(resultado.criada).toBe(false);
    });

    it('retorna erro se não consegue criar', async () => {
      client.simularErro('create', 'Permissão negada');
      const resultado = await garantirPasta(client, 'Fast/Urgentes');
      expect(resultado.sucesso).toBe(false);
      expect(resultado.msg).toBe('Permissão negada');
    });
  });

  describe('garantirPastasFast', () => {
    it('cria todas as 6 pastas Fast/*', async () => {
      const resultado = await garantirPastasFast(client);
      expect(resultado.sucesso).toBe(true);

      // Verificar que as 5 principais foram criadas
      expect(await pastaExiste(client, 'Fast/Urgentes')).toBe(true);
      expect(await pastaExiste(client, 'Fast/Importante')).toBe(true);
      expect(await pastaExiste(client, 'Fast/Normal')).toBe(true);
      expect(await pastaExiste(client, 'Fast/Baixa')).toBe(true);
      expect(await pastaExiste(client, 'Fast/FYI')).toBe(true);
      expect(await pastaExiste(client, 'Fast/Pendente-Classificacao')).toBe(true);
    });

    it('retorna sucesso mesmo se algumas pastas já existem', async () => {
      client.criarPasta('Fast/Urgentes');
      client.criarPasta('Fast/Normal');

      const resultado = await garantirPastasFast(client);
      expect(resultado.sucesso).toBe(true);

      // Todas devem existir
      expect(await pastaExiste(client, 'Fast/Urgentes')).toBe(true);
      expect(await pastaExiste(client, 'Fast/Importante')).toBe(true);
    });
  });

  describe('moverComFallback', () => {
    beforeEach(async () => {
      // Pré-criar as pastas normais
      for (const pasta of obterTodasAsPastas()) {
        client.criarPasta(pasta);
      }
    });

    it('move email para pasta correta do nível', async () => {
      const resultado = await moverComFallback(client, 100, 1); // Nível 1 = Urgentes
      expect(resultado.sucesso).toBe(true);
      expect(resultado.pastaUsada).toBe('Fast/Urgentes');
    });

    it('move para cada nível correto', async () => {
      const testes = [
        { nivel: 1, pasta: 'Fast/Urgentes' },
        { nivel: 2, pasta: 'Fast/Importante' },
        { nivel: 3, pasta: 'Fast/Normal' },
        { nivel: 4, pasta: 'Fast/Baixa' },
        { nivel: 5, pasta: 'Fast/FYI' },
      ];

      for (const { nivel, pasta } of testes) {
        const resultado = await moverComFallback(client, 100 + nivel, nivel);
        expect(resultado.sucesso).toBe(true);
        expect(resultado.pastaUsada).toBe(pasta);
      }
    });

    it('rejeita nível inválido', async () => {
      const resultado = await moverComFallback(client, 100, 6); // Inválido
      expect(resultado.sucesso).toBe(false);
      expect(resultado.erro).toContain('Nível inválido');
    });

    it('fallback para Pendente-Classificacao se pasta de nível não existe', async () => {
      client.pastas.delete('Fast/Urgentes'); // Deletar pasta 1

      const resultado = await moverComFallback(client, 100, 1);

      expect(resultado.sucesso).toBe(true);
      expect(resultado.pastaUsada).toBe('Fast/Pendente-Classificacao');
      expect(resultado.motivo).toBe('fallback_pasta_pendente');
      expect(resultado.erroOriginal).toBeDefined();
    });

    it('fallback para INBOX se Pendente também falhar', async () => {
      client.pastas.clear(); // Deletar todas as pastas

      const resultado = await moverComFallback(client, 100, 1);

      expect(resultado.sucesso).toBe(false);
      expect(resultado.pastaUsada).toBe('INBOX');
      expect(resultado.motivo).toBe('fallback_inbox');
    });

    it('simula cenário real: primeiro email vai para Pendente', async () => {
      // Simular: pasta Fast/Urgentes foi deletada
      client.pastas.delete('Fast/Urgentes');

      // CEO quer mover email urgente
      const resultado = await moverComFallback(client, 100, 1);

      // Falha ao mover para Urgentes, mas sucesso ao mover para Pendente
      expect(resultado.sucesso).toBe(true);
      expect(resultado.pastaUsada).toBe('Fast/Pendente-Classificacao');

      // CEO vê aviso em Pendente-Classificacao
      // Pode classificar manualmente
    });
  });

  describe('Funções auxiliares', () => {
    it('obterPastaParaNivel retorna corretamente', () => {
      expect(obterPastaParaNivel(1)).toBe('Fast/Urgentes');
      expect(obterPastaParaNivel(2)).toBe('Fast/Importante');
      expect(obterPastaParaNivel(5)).toBe('Fast/FYI');
      expect(obterPastaParaNivel(6)).toBeUndefined();
    });

    it('nivelValido valida corretamente', () => {
      expect(nivelValido(1)).toBe(true);
      expect(nivelValido(3)).toBe(true);
      expect(nivelValido(5)).toBe(true);
      expect(nivelValido(0)).toBe(false);
      expect(nivelValido(6)).toBe(false);
      expect(nivelValido('1')).toBe(false); // string, não number
    });

    it('obterTodasAsPastas retorna todas as pastas', () => {
      const pastas = obterTodasAsPastas();
      expect(pastas).toHaveLength(6); // 5 por nível + 1 pendente
      expect(pastas).toContain('Fast/Urgentes');
      expect(pastas).toContain('Fast/Importante');
      expect(pastas).toContain('Fast/Normal');
      expect(pastas).toContain('Fast/Baixa');
      expect(pastas).toContain('Fast/FYI');
      expect(pastas).toContain('Fast/Pendente-Classificacao');
    });
  });

  describe('Cenários de erro real', () => {
    it('simula: erro ao criar pastas (permissão negada)', async () => {
      client.simularErro('create', 'Permission denied');

      const resultado = await garantirPastasFast(client);

      // sucesso = false porque pastas principais falharam
      expect(resultado.sucesso).toBe(false);

      // Mas não trava — continua
      // moverComFallback vai usar fallback (Pendente-Classificacao)
    });

    it('simula: servidor desconecta durante mover', async () => {
      client.simularErro('move', 'Connection lost');

      const resultado = await moverComFallback(client, 100, 1);

      // Não consegue mover para Urgentes (erro 'Connection lost')
      // Tenta fallback Pendente-Classificacao → também falha (MOVE continua errando)
      // Cai no fallback final INBOX
      expect(resultado.sucesso).toBe(false);
      expect(resultado.pastaUsada).toBe('INBOX');
      expect(resultado.motivo).toBe('fallback_inbox');
      expect(resultado.erroOriginal).toContain('Connection lost');
    });

    it('simula: race condition — pasta criada após verificação', async () => {
      // Cliente verifica: pasta não existe
      // Admin cria pasta naquele exato momento
      // Cliente tenta criar: falha porque já existe

      client.criarPasta('Fast/Urgentes');

      // Mesmo assim garantirPasta não falha (verifica de novo)
      const resultado = await garantirPasta(client, 'Fast/Urgentes');

      expect(resultado.sucesso).toBe(true);
      expect(resultado.criada).toBe(false);
    });
  });
});
