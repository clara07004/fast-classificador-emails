/**
 * Biblioteca de emails de teste — Fast Sistemas Construtivos
 * 5 níveis de prioridade, 4 emails cada
 * Remetente: barbosa.claraia@gmail.com → clara.barbosa@fastdrywall.com.br
 */

export const PRIORIDADES = {
  1: 'URGENTE',
  2: 'ALTA',
  3: 'MEDIA',
  4: 'BAIXA',
  5: 'MINIMA',
};

export const emails = [
  // ─────────────────────────────────────────────
  // PRIORIDADE 1 — URGENTE
  // ─────────────────────────────────────────────
  {
    prioridade: 1,
    assunto: 'URGENTE: Obra parada — falta de drywall, cliente ameaça cancelar contrato',
    corpo: `Clara,

Preciso de uma resposta AGORA. A obra do Condomínio Viva Mais (Campinas) está completamente parada desde ontem às 14h por falta das placas de drywall ST que vocês deveriam ter entregado na semana passada.

O engenheiro responsável me ligou furioso. São 12 funcionários parados, R$ 8.000/dia de multa contratual e o cliente já falou em acionar a construtora e cancelar o contrato com a Fast.

Preciso saber:
1. Onde está o pedido #FP-2847?
2. Quando chega de fato?
3. O que vocês vão fazer para cobrir o prejuízo do atraso?

Aguardo retorno URGENTE.

Att,
Roberto Figueiredo
Figueiredo Construções Ltda
(19) 99234-5678`,
  },
  {
    prioridade: 1,
    assunto: 'RE: Vistoria surpresa ANVISA amanhã cedo — precisamos dos laudos de resistência ao fogo HOJE',
    corpo: `Clara, bom dia.

Acabei de receber confirmação: a ANVISA vai fazer vistoria técnica amanhã às 8h na clínica do Dr. Augusto (nosso cliente em São Paulo). A obra está em fase final de acabamento com o drywall de vocês.

O fiscal pediu especificamente os laudos de resistência ao fogo dos painéis utilizados (EI-60 e EI-90). Preciso desses documentos hoje até as 17h para conseguir organizar tudo antes da vistoria.

Se não tiver o laudo hoje, a clínica pode ser embargada e aí é problema sério para todo mundo.

Me liga assim que ler isso.

Grato,
Marcelo Stein
Stein Reformas Especializadas
(11) 98765-4321`,
  },
  {
    prioridade: 1,
    assunto: 'Acidente em obra — funcionário ferido, linha direta com a Fast necessária',
    corpo: `Boa tarde,

Infelizmente tenho que informar um acidente grave ocorrido hoje às 10h20 na obra do Shopping Parque Norte (Manaus), onde estamos instalando o sistema de steel frame da Fast.

Um dos nossos colaboradores sofreu queda ao trabalhar próximo a uma estrutura que cedeu. Ele foi encaminhado ao hospital e está estável, mas a situação gerou paralisação imediata da obra e o SESMT está no local.

Precisamos de suporte técnico da Fast com urgência para:
- Avaliação da estrutura comprometida
- Documentação técnica para o BO e relatório de acidente
- Contato com o responsável técnico da Fast para acompanhar

Por favor, retorne o mais rápido possível.

Daniele Carvalho
Diretora de Operações — Construtora Norte Amazônica
(92) 99100-2233`,
  },
  {
    prioridade: 1,
    assunto: 'Cliente Grupo Mega ameaça processo — prazo de entrega estourado em 15 dias',
    corpo: `Clara,

Ontem recebi um e-mail formal do Grupo Mega Incorporadora (cliente A+ da nossa franquia) notificando que vão acionar juridicamente a Fast caso a entrega do lote de perfis metálicos não ocorra até sexta-feira (3 dias).

O pedido deveria ter sido entregue há 15 dias. Já tentei contato com o setor de logística 4 vezes sem retorno.

Preciso de:
- Posição definitiva da logística sobre a entrega
- Carta de comprometimento assinada pela diretoria
- Desconto compensatório que eu possa apresentar ao cliente

Esse cliente representa R$ 280.000/ano para a franquia. Não podemos perder.

Carlos Mendonça
Franqueado Fast — Belo Horizonte Norte`,
  },

  // ─────────────────────────────────────────────
  // PRIORIDADE 2 — ALTA
  // ─────────────────────────────────────────────
  {
    prioridade: 2,
    assunto: 'Proposta técnica — prazo expira HOJE às 18h (Licitação Prefeitura de Jundiaí)',
    corpo: `Boa tarde Clara,

Conforme combinamos, preciso que a proposta técnica para a licitação da Prefeitura de Jundiaí (reforma das escolas municipais com drywall) esteja na minha caixa até as 18h de hoje.

A licitação fecha às 19h e preciso revisar antes de enviar. O escopo é:
- 4.200 m² de drywall ST 12,5mm
- 1.800 m² de drywall RU (resistente à umidade) para banheiros
- Instalação completa + laudo técnico

Se não vier até 18h vou precisar pular essa licitação.

Conto com vocês.

Thiago Bueno
Bueno Engenharia e Construção
(11) 97654-3210`,
  },
  {
    prioridade: 2,
    assunto: 'Aprovação de orçamento R$ 220.000 pendente — diretoria esperando retorno da Fast',
    corpo: `Clara,

O orçamento da reforma completa da sede da Mineradora São João (Goiânia) — R$ 220.000 em materiais e instalação — está aprovado internamente, mas a diretoria precisa de confirmação por escrito da Fast sobre:

1. Prazo de entrega garantido: 10 dias úteis após pedido
2. Disponibilidade do material em estoque
3. Suporte técnico durante a obra

Já faz 3 dias que mandei esse e-mail e não recebi retorno. Se não vier confirmação até amanhã, a diretoria vai reconsiderar o fornecedor.

Ana Lúcia Martins
Gerente de Projetos — Mineradora São João
(62) 98877-5566`,
  },
  {
    prioridade: 2,
    assunto: 'Reclamação formal — Franquia Fast Ribeirão Preto — prazo e qualidade',
    corpo: `Prezada Clara,

Estou registrando reclamação formal sobre dois problemas que vêm afetando nossa operação:

1. PRAZO: Pedido #FP-3091 está com 8 dias de atraso sem justificativa. Já temos obra parada aguardando o material.

2. QUALIDADE: No último lote recebido (NF 45.812), identificamos 23 placas com defeito de fabricação (bordas irregulares que impedem encaixe correto). Precisamos de reposição.

Solicito retorno formal até amanhã, caso contrário escalarei para a ABF e para a ouvidoria da Fast.

Rafael Andrade
Franqueado Fast — Ribeirão Preto
(16) 99345-6789`,
  },
  {
    prioridade: 2,
    assunto: 'Reunião com investidor amanhã — preciso de pitch deck e dados de expansão da Fast',
    corpo: `Clara,

Tenho reunião amanhã às 14h com um potencial investidor que quer entrar como sócio na franquia de Curitiba. Ele vai querer dados concretos.

Preciso até hoje à noite:
- Números de crescimento da rede Fast nos últimos 2 anos
- Investimento médio de uma franquia e ROI esperado
- Diferenciais competitivos vs. concorrência

Qualquer material que vocês tenham pronto (deck, one-pager, planilha) já ajuda muito.

Obrigado,
Leandro Paiva
Franqueado Fast — Curitiba Sul`,
  },

  // ─────────────────────────────────────────────
  // PRIORIDADE 3 — MÉDIA
  // ─────────────────────────────────────────────
  {
    prioridade: 3,
    assunto: 'Dúvida técnica: espessura de parede drywall para isolamento acústico em estúdio',
    corpo: `Olá,

Estou projetando um estúdio de gravação em São Paulo e pretendo usar o sistema de drywall da Fast para as paredes internas.

Preciso de orientação técnica sobre qual combinação de placas e perfis é mais adequada para atingir um isolamento acústico de pelo menos 45 dB de perda de transmissão sonora.

Também gostaria de saber se vocês têm algum caso de uso similar e se há especificação técnica disponível para esse tipo de aplicação.

Aguardo orientação quando puder.

Fernando Lessa
Arquiteto — Lessa Studio
CRT 45.992`,
  },
  {
    prioridade: 3,
    assunto: 'Solicitação de visita técnica — projeto residencial 380m² em Alphaville',
    corpo: `Boa tarde,

Estou desenvolvendo um projeto residencial de alto padrão em Alphaville (380m²) e tenho interesse em usar o sistema construtivo da Fast para as paredes internas e forro.

Gostaria de agendar uma visita técnica com um representante que possa nos orientar sobre as melhores soluções para o projeto e nos ajudar a especificar corretamente os materiais.

Podemos fazer isso na próxima semana? Tenho disponibilidade terça, quarta ou quinta pela manhã.

Att,
Beatriz Nogueira
Arquitetura BN
(11) 96543-2100`,
  },
  {
    prioridade: 3,
    assunto: 'Atualização de projeto — fase 2 iniciando em 3 semanas (Torre Empresarial Paulista)',
    corpo: `Clara,

Só para avisar que a Torre Empresarial Paulista (andares 8 ao 15, drywall divisório) vai entrar na fase 2 daqui a 3 semanas.

Vamos precisar de mais ~2.400 m² de placas ST e aproximadamente 1.800m de perfil U 70mm. Podem verificar disponibilidade em estoque para essa data?

Não é urgente, mas quero garantir o material com antecedência para não ter problema.

Obrigado,
Paulo Drummond
Drummond Construtora
(11) 94321-5678`,
  },
  {
    prioridade: 3,
    assunto: 'Pedido de catálogo técnico 2026 e tabela de preços atualizada',
    corpo: `Olá Clara,

Sou arquiteta e tenho especificado produtos da Fast em alguns projetos. Gostaria de receber o catálogo técnico atualizado de 2026 e a tabela de preços vigente para poder incluir nas especificações dos meus projetos.

Se tiverem material em PDF, pode enviar por aqui mesmo.

Obrigada,
Camila Ramos
Arquiteta — CR Projetos
(21) 98800-1122`,
  },

  // ─────────────────────────────────────────────
  // PRIORIDADE 4 — BAIXA
  // ─────────────────────────────────────────────
  {
    prioridade: 4,
    assunto: 'Confirmação de pedido #FP-4112 — Entrega prevista 12/05',
    corpo: `Olá,

Confirmamos o recebimento do seu pedido #FP-4112:

- 800 placas drywall ST 12,5mm (2,40x1,20m)
- 400 perfis U 70mm (3m)
- 400 perfis E 70mm (3m)

Valor total: R$ 34.580,00
Entrega prevista: 12/05/2026 — entre 8h e 12h
Endereço confirmado: Rua das Palmeiras, 320, Galpão 4 — Guarulhos/SP

Qualquer dúvida sobre o pedido, responda este e-mail.

Equipe de Logística — Fast Sistemas Construtivos`,
  },
  {
    prioridade: 4,
    assunto: 'Convite: Webinar de treinamento técnico — Sistemas a seco em ambientes úmidos (19/05)',
    corpo: `Olá,

Convidamos você para o webinar técnico gratuito:

"Sistemas a Seco em Ambientes Úmidos: Especificação Correta e Erros Comuns"
19 de maio de 2026, às 15h — Online

Temas abordados:
- Escolha correta entre drywall RU e RUF
- Detalhes críticos de execução em banheiros e cozinhas
- Apresentação de casos com patologias e como evitá-las

Inscreva-se respondendo este e-mail.

Equipe de Treinamento — Fast Sistemas Construtivos`,
  },
  {
    prioridade: 4,
    assunto: 'Atualização de sistema ERP — manutenção programada sábado 10/05 das 0h às 4h',
    corpo: `Informamos que o sistema ERP estará em manutenção programada no próximo sábado (10/05), das 00h00 às 04h00.

Durante esse período os seguintes serviços estarão indisponíveis:
- Portal do franqueado
- Consulta de pedidos online
- Emissão de NF pelo portal

Pedidos urgentes devem ser feitos até sexta-feira às 18h.

TI — Fast Sistemas Construtivos`,
  },
  {
    prioridade: 4,
    assunto: 'Atualização de dados cadastrais — franquia Fast Campinas Leste',
    corpo: `Boa tarde,

Venho atualizar os dados cadastrais da nossa unidade:

Endereço novo: Av. John Boyd Dunlop, 1500, Galpão 7 — Campinas/SP — CEP 13060-904
Telefone comercial novo: (19) 3344-5566
Responsável técnico: Eng. Juliana Freitas (CREA-SP 2.345.678)

Por favor, atualizem no sistema e confirmem quando estiver feito.

Obrigado,
Sílvio Teixeira
Franqueado Fast — Campinas Leste`,
  },

  // ─────────────────────────────────────────────
  // PRIORIDADE 5 — MÍNIMA
  // ─────────────────────────────────────────────
  {
    prioridade: 5,
    assunto: 'Newsletter Fast — Abril 2026: Novidades, expansão da rede e cases de sucesso',
    corpo: `Fast Sistemas Construtivos — Newsletter Abril 2026

EXPANSÃO DA REDE
Em abril abrimos mais 3 franquias: Belém (PA), Uberlândia (MG) e Joinville (SC). A rede Fast já conta com 87 unidades em todo o Brasil!

CASE DO MÊS
Hospital Regional de Mossoró (RN) — 12.000 m² de drywall instalados em tempo recorde de 4 meses.

NOVIDADE NO CATÁLOGO
Lançamento da linha Drywall Premium FR-60: maior resistência ao fogo, ideal para hospitais e hotéis.

Equipe Fast`,
  },
  {
    prioridade: 5,
    assunto: 'Pesquisa de satisfação — sua opinião é importante para nós',
    corpo: `Olá,

Gostaríamos de conhecer sua experiência com a Fast Sistemas Construtivos nos últimos 3 meses.

A pesquisa leva menos de 3 minutos e nos ajuda a melhorar nossos produtos e serviços.

Algumas perguntas:
- Como avalia a qualidade dos materiais?
- O prazo de entrega foi cumprido?
- Como foi o atendimento do seu representante?
- Recomendaria a Fast para outros profissionais?

Agradecemos sua participação!

Equipe de Qualidade — Fast Sistemas Construtivos`,
  },
  {
    prioridade: 5,
    assunto: 'Comunicado: Expediente reduzido — Feriado de Corpus Christi (19/06)',
    corpo: `Prezados parceiros,

Informamos que no feriado de Corpus Christi (19/06/2026) a Fast funcionará em expediente reduzido:

- Atendimento comercial: 8h às 12h
- Logística e entregas: suspensas
- Suporte de emergência: WhatsApp (11) 99999-0000

Na sexta-feira (20/06) o atendimento retorna ao horário normal.

Equipe Fast Sistemas Construtivos`,
  },
  {
    prioridade: 5,
    assunto: 'Oferta especial parceiro: desconto em ferramenta para instalação de drywall — válido até 30/05',
    corpo: `Olá,

Como parceiro Fast, você tem acesso a uma condição especial negociada com a Makita:

Kit parafusadeira DFS452 + 2 baterias 18V
De R$ 1.890 por R$ 1.390 (desconto de 26%)
Frete grátis para SP, RJ e MG

Para aproveitar, acesse o portal do parceiro ou responda este e-mail.
Válido até 30/05/2026.

Equipe Comercial Parceiros — Fast Sistemas Construtivos`,
  },
];

export function emailsPorPrioridade(prioridade) {
  return emails.filter((e) => e.prioridade === prioridade);
}

export function emailAleatorio(prioridade = null) {
  const pool = prioridade ? emailsPorPrioridade(prioridade) : emails;
  return pool[Math.floor(Math.random() * pool.length)];
}
