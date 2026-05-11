import dotenv from 'dotenv';
dotenv.config();

import { ImapFlow } from 'imapflow';

async function testarPastas() {
  const imap = new ImapFlow({
    host: 'mail.cscempresarial.com.br',
    port: 993,
    secure: true,
    auth: {
      user: process.env.IMAP_USER,
      pass: process.env.IMAP_PASSWORD
    }
  });

  try {
    await imap.connect();
    console.log('✅ Conectado ao IMAP\n');

    const pastas = [
      'INBOX.Fast-Urgente',
      'INBOX.Fast-Alta-Prioridade',
      'INBOX.Fast-Normal',
      'INBOX.Fast-Baixa',
      'INBOX.Fast-Irrelevante'
    ];

    console.log('📊 STATUS DAS PASTAS:\n');
    for (const pasta of pastas) {
      try {
        const mailbox = await imap.mailboxOpen(pasta, { readOnly: true });
        const nivel = pasta.split('.')[1];
        console.log(`  ${nivel}: ${mailbox.exists} emails`);
      } catch (err) {
        console.log(`  ${pasta}: ❌ Não encontrada`);
      }
    }

    console.log('\n✅ Teste de pastas concluído');
    await imap.close();
  } catch (err) {
    console.error('❌ Erro:', err.message);
  }
}

testarPastas();
