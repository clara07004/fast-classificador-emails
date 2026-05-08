import { ImapFlow } from 'imapflow';
import { Anthropic } from '@anthropic-ai/sdk';
import { simpleParser } from 'mailparser';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

async function classifyEmail() {
  const imap = new ImapFlow({
    host: 'mail.cscempresarial.com.br',
    port: 993,
    secure: true,
    auth: {
      user: process.env.IMAP_USER,
      pass: process.env.IMAP_PASS
    }
  });

  try {
    console.log('🔗 Conectando ao servidor IMAP...');
    await imap.connect();

    console.log('📧 Buscando primeiro email...');

    // Lista mensagens da INBOX
    let mailbox = await imap.mailboxOpen('INBOX');
    console.log(`📬 INBOX tem ${mailbox.exists} emails`);

    if (mailbox.exists === 0) {
      console.log('❌ Nenhum email encontrado');
      await imap.close();
      return;
    }

    // Pega o primeiro email por sequência (não UID)
    console.log(`\n📨 Processando email sequence: 1`);

    // Busca o email completo
    const message = await imap.fetchOne(1, { source: true, uid: false });

    if (!message) {
      console.log('❌ Não conseguiu buscar o email');
      await imap.close();
      return;
    }

    const parsed = await simpleParser(message.source);

    const from = parsed.from?.text || 'Desconhecido';
    const subject = parsed.subject || '(sem assunto)';
    const textContent = parsed.text || parsed.html || '(sem conteúdo)';
    const text = textContent.substring(0, 500);

    console.log(`\n📄 Email:
  De: ${from}
  Assunto: ${subject}
  Preview: ${text.substring(0, 150)}...`);

    console.log('\n🤖 Classificando com Claude API...');

    const prompt = `Classifique este email em UMA das 5 categorias abaixo. Responda APENAS com o nome exato, sem pontuação ou explicação.

Categorias:
- Urgente
- Alta-Prioridade
- Normal
- Baixa
- Irrelevante

De: ${from}
Assunto: ${subject}
Corpo: ${text}`;

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 20,
      messages: [{ role: 'user', content: prompt }]
    });

    let classification = response.content[0].type === 'text' ? response.content[0].text.trim() : '';

    // Remove hífens e normaliza
    classification = classification.replace(/["-]/g, '').trim();

    console.log(`\n✨ Classificação: ${classification}`);

    // Mapeia para nome de pasta
    const folderMap = {
      'Urgente': 'INBOX.Fast-Urgente',
      'AltaPrioridade': 'INBOX.Fast-Alta-Prioridade',
      'Normal': 'INBOX.Fast-Normal',
      'Baixa': 'INBOX.Fast-Baixa',
      'Irrelevante': 'INBOX.Fast-Irrelevante'
    };

    const targetFolder = folderMap[classification] || 'INBOX.Fast-Pendente-Classificacao';

    console.log(`\n📬 Movendo para: ${targetFolder}`);
    await imap.messageMove('1', targetFolder);
    console.log('✅ Email movido com sucesso!');

  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error.stack);
  } finally {
    await imap.close();
  }
}

classifyEmail();
