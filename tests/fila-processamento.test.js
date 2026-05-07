/**
 * Testes da Fila de Processamento Serial
 *
 * Valida que:
 * 1. Máximo 1 processamento roda por vez
 * 2. Próximo processamento aguarda o anterior terminar
 * 3. Erros não travam a fila
 * 4. Ordem de execução é mantida
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Simular a classe FilaProcessamento (cópia para testes)
class FilaProcessamento {
  constructor() {
    this.promiseAtual = Promise.resolve();
  }

  enfileirar(fn) {
    this.promiseAtual = this.promiseAtual
      .then(async () => {
        try {
          return await fn();
        } catch (err) {
          throw err;
        }
      })
      .catch(err => {
        // Continua após erro
      });

    return this.promiseAtual;
  }
}

describe('FilaProcessamento', () => {
  let fila;

  beforeEach(() => {
    fila = new FilaProcessamento();
  });

  it('executa uma tarefa simples', async () => {
    let executou = false;

    await fila.enfileirar(async () => {
      executou = true;
    });

    expect(executou).toBe(true);
  });

  it('garante que apenas 1 processamento roda por vez (serial)', async () => {
    const execucoes = [];
    const duracao = 50; // ms

    const tarefa = async (id) => {
      execucoes.push({ id, inicio: Date.now() });
      await new Promise(resolve => setTimeout(resolve, duracao));
      execucoes.push({ id, fim: Date.now() });
    };

    // Enfileirar 3 tarefas rapidamente
    fila.enfileirar(() => tarefa(1));
    fila.enfileirar(() => tarefa(2));
    fila.enfileirar(() => tarefa(3));

    // Esperar todas terminarem
    await new Promise(resolve => setTimeout(resolve, duracao * 4));

    // Validar que foram executadas serialmente (não em paralelo)
    // Se rodassem em paralelo, inicio[2] seria antes de fim[1]
    const fim1 = execucoes.find(e => e.id === 1 && e.fim)?.fim;
    const inicio2 = execucoes.find(e => e.id === 2 && e.inicio)?.inicio;

    expect(inicio2).toBeGreaterThanOrEqual(fim1);
    expect(execucoes.length).toBe(6); // 3 tarefas × 2 eventos (inicio + fim)
  });

  it('mantém a ordem de execução', async () => {
    const ordem = [];

    fila.enfileirar(async () => {
      ordem.push(1);
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    fila.enfileirar(async () => {
      ordem.push(2);
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    fila.enfileirar(async () => {
      ordem.push(3);
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(ordem).toEqual([1, 2, 3]);
  });

  it('não trava a fila quando uma tarefa falha', async () => {
    const execucoes = [];

    fila.enfileirar(async () => {
      execucoes.push('tarefa-1');
    });

    fila.enfileirar(async () => {
      execucoes.push('tarefa-2-antes-erro');
      throw new Error('Erro proposital');
    });

    fila.enfileirar(async () => {
      execucoes.push('tarefa-3-apos-erro');
    });

    // Aguardar processamento
    await new Promise(resolve => setTimeout(resolve, 100));

    // Validar que tarefa-3 executou mesmo após erro em tarefa-2
    expect(execucoes).toContain('tarefa-1');
    expect(execucoes).toContain('tarefa-2-antes-erro');
    expect(execucoes).toContain('tarefa-3-apos-erro');
  });

  it('retorna promise que resolve quando termina', async () => {
    let terminou = false;

    const promise = fila.enfileirar(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      terminou = true;
    });

    expect(terminou).toBe(false);

    await promise;

    expect(terminou).toBe(true);
  });

  it('simula cenário real: múltiplos eventos exists chegando rapidinho', async () => {
    const processamentos = [];

    // Simular 3 eventos 'exists' chegando em sequência rápida
    // (como se 3 emails chegassem em menos de 1 segundo)

    for (let i = 1; i <= 3; i++) {
      fila.enfileirar(async () => {
        const inicio = Date.now();
        processamentos.push({ email: i, inicio });

        // Simular processamento (buscar, classificar, mover, salvar)
        await new Promise(resolve => setTimeout(resolve, 30));

        const fim = Date.now();
        processamentos.push({ email: i, fim, duracao: fim - inicio });
      });
    }

    // Aguardar todas terminarem
    await new Promise(resolve => setTimeout(resolve, 200));

    // Validações
    expect(processamentos.length).toBe(6); // 3 emails × 2 eventos

    // Email 1 deve terminar antes de Email 2 começar
    const fim1 = processamentos.find(p => p.email === 1 && p.fim)?.fim;
    const inicio2 = processamentos.find(p => p.email === 2 && p.inicio)?.inicio;
    expect(inicio2).toBeGreaterThanOrEqual(fim1);

    // Email 2 deve terminar antes de Email 3 começar
    const fim2 = processamentos.find(p => p.email === 2 && p.fim)?.fim;
    const inicio3 = processamentos.find(p => p.email === 3 && p.inicio)?.inicio;
    expect(inicio3).toBeGreaterThanOrEqual(fim2);
  });
});
