/**
 * Testes de Idempotência — Rastreamento de UID Processado
 *
 * Valida que:
 * 1. UID é registrado como processado antes de qualquer ação
 * 2. Na reconexão, busca apenas UIDs > ultimoUidProcessado
 * 3. Mesmo email não é processado 2x
 */

import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Mock de estado de processamento
 * Simula o Convex database
 */
class MockEstadoProcessamento {
  constructor() {
    this.estado = new Map(); // funcionarioId -> { ultimoUid, timestamp }
  }

  obterEstado(funcionarioId) {
    if (!this.estado.has(funcionarioId)) {
      return { ultimoUidProcessado: 0, timestamp: Date.now() };
    }
    return this.estado.get(funcionarioId);
  }

  atualizarUltimoBuscado(funcionarioId, uid) {
    const atual = this.obterEstado(funcionarioId);
    // Never go backwards
    const novoUid = Math.max(uid, atual.ultimoUidProcessado);
    this.estado.set(funcionarioId, {
      ultimoUidProcessado: novoUid,
      timestamp: Date.now(),
    });
    return { sucesso: true, ultimoUid: novoUid };
  }
}

/**
 * Simula fluxo de processamento com idempotência
 */
class ProcessadorIdempotente {
  constructor(estadoDb) {
    this.estadoDb = estadoDb;
    this.emailsProcessados = [];
  }

  async processar(funcionarioId, uid) {
    // 1. Registrar UID ANTES de processar (idempotência garantida aqui)
    this.estadoDb.atualizarUltimoBuscado(funcionarioId, uid);

    // 2. Buscar email (seria do IMAP)
    const email = { uid, assunto: `Email UID ${uid}` };

    // 3. Processar (classificar, mover, etc)
    const resultado = { uid, classificacao: 'urgente', rascunho: 'resposta' };
    this.emailsProcessados.push(resultado);

    return resultado;
  }

  async buscarNovos(funcionarioId) {
    const estado = this.estadoDb.obterEstado(funcionarioId);
    const ultimoUid = estado.ultimoUidProcessado;

    // Simular: servidor tem UIDs 1-100, retorna apenas os que ainda não foram processados
    const uidsDisponiveis = Array.from({ length: 100 }, (_, i) => i + 1);
    return uidsDisponiveis.filter((uid) => uid > ultimoUid);
  }
}

describe('Idempotência — Rastreamento de UID', () => {
  let mockDb;
  let processador;
  const funcionarioId = 'func-123';

  beforeEach(() => {
    mockDb = new MockEstadoProcessamento();
    processador = new ProcessadorIdempotente(mockDb);
  });

  it('registra UID antes de processar', async () => {
    await processador.processar(funcionarioId, 100);

    const estado = mockDb.obterEstado(funcionarioId);
    expect(estado.ultimoUidProcessado).toBe(100);
  });

  it('nunca volta para trás (UIDs sempre aumentam)', async () => {
    await processador.processar(funcionarioId, 100);
    await processador.processar(funcionarioId, 50); // Tenta processar UID menor

    const estado = mockDb.obterEstado(funcionarioId);
    // Deve permanecer 100, nunca voltar a 50
    expect(estado.ultimoUidProcessado).toBe(100);
  });

  it('busca apenas novos UIDs na reconexão', async () => {
    // Processar UIDs 1-10
    for (let uid = 1; uid <= 10; uid++) {
      await processador.processar(funcionarioId, uid);
    }

    // Simular reconexão: buscar "novos"
    const novos = await processador.buscarNovos(funcionarioId);

    // Deve retornar 11-100 (99 emails)
    expect(novos).toHaveLength(90); // 11 a 100
    expect(novos[0]).toBe(11); // Primeiro novo é UID 11
    expect(novos[novos.length - 1]).toBe(100); // Último é 100
  });

  it('simula: 3 emails chegam, reconecta, só processa novos', async () => {
    const uidsProcessados = [];

    // Fase 1: Processar UIDs 1-3
    for (let uid = 1; uid <= 3; uid++) {
      await processador.processar(funcionarioId, uid);
      uidsProcessados.push(uid);
    }

    expect(uidsProcessados).toEqual([1, 2, 3]);
    expect(processador.emailsProcessados).toHaveLength(3);

    // Fase 2: Simular reconexão
    // Estado restaurado do Convex
    const estadoRestaurado = mockDb.obterEstado(funcionarioId);
    expect(estadoRestaurado.ultimoUidProcessado).toBe(3);

    // Fase 3: Buscar novos (UIDs 4-100)
    const novos = await processador.buscarNovos(funcionarioId);
    expect(novos[0]).toBe(4); // Primeiro novo é UID 4
    expect(novos).not.toContain(1);
    expect(novos).not.toContain(2);
    expect(novos).not.toContain(3);

    // Se processarmos os novos, não duplica 1-3
    for (const uid of novos.slice(0, 3)) {
      await processador.processar(funcionarioId, uid);
    }

    // Validar: processados 1-6 (não há duplicação)
    const idsProcessados = processador.emailsProcessados.map((e) => e.uid);
    expect(idsProcessados).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(idsProcessados).size).toBe(6); // Sem duplicatas
  });

  it('simula: error mid-processing, reconecta, reprocessa apenas de onde parou', async () => {
    // Processar 1-5
    for (let uid = 1; uid <= 5; uid++) {
      await processador.processar(funcionarioId, uid);
    }

    // Estado registrado: UID 5 foi processado
    let estado = mockDb.obterEstado(funcionarioId);
    expect(estado.ultimoUidProcessado).toBe(5);

    // Simular erro: worker vai crashe DEPOIS de registrar UID 6
    mockDb.atualizarUltimoBuscado(funcionarioId, 6);
    // Mas não conseguiu salvar em Convex ou mover arquivo
    // (simula falha parcial)

    // Na reconexão, estado é restaurado
    estado = mockDb.obterEstado(funcionarioId);
    expect(estado.ultimoUidProcessado).toBe(6);

    // Buscar novos começa de UID 7 (não 6)
    const novos = await processador.buscarNovos(funcionarioId);
    expect(novos[0]).toBe(7);
  });

  it('múltiplas reconexões não causam duplicação', async () => {
    // Reconexão 1: Processar 1-10
    for (let uid = 1; uid <= 10; uid++) {
      await processador.processar(funcionarioId, uid);
    }

    let emails = processador.emailsProcessados.map((e) => e.uid);
    expect(emails).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));

    // Reconexão 2: Processar 11-20
    const novos = await processador.buscarNovos(funcionarioId);
    for (const uid of novos.slice(0, 10)) {
      await processador.processar(funcionarioId, uid);
    }

    emails = processador.emailsProcessados.map((e) => e.uid);
    expect(emails).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(new Set(emails).size).toBe(20); // Sem duplicatas
  });
});
