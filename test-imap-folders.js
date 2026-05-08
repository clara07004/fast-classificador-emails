import { ImapFlow } from 'imapflow';

async function testImapFolders() {
  const imap = new ImapFlow({
    host: 'mail.cscempresarial.com.br',
    port: 993,
    secure: true,
    auth: {
      user: process.env.IMAP_USER || 'seu-email@fastdrywall.com.br',
      pass: process.env.IMAP_PASS || 'sua-senha-app'
    }
  });

  try {
    console.log('🔗 Conectando ao servidor IMAP...');
    await imap.connect();

    console.log('📂 Listando pastas...\n');
    const mailboxes = await imap.list();

    const fastFolders = mailboxes.filter(m => m.path.toLowerCase().includes('fast'));
    const requiredFolders = [
      'INBOX.Fast-Urgente',
      'INBOX.Fast-Alta-Prioridade',
      'INBOX.Fast-Normal',
      'INBOX.Fast-Baixa',
      'INBOX.Fast-Irrelevante',
      'INBOX.Fast-Pendente-Classificacao'
    ];

    console.log('Pastas Fast encontradas:');
    fastFolders.forEach(m => {
      const checkmark = requiredFolders.includes(m.path) ? '✅' : '⚠️';
      console.log(`  ${checkmark} ${m.path}`);
    });

    console.log('\n📋 Verificação:');
    const foundFolders = fastFolders.map(m => m.path);
    const missing = requiredFolders.filter(f => !foundFolders.includes(f));

    if (missing.length === 0) {
      console.log('✅ Todas as pastas foram criadas com sucesso!');
    } else {
      console.log('❌ Pastas faltando:');
      missing.forEach(f => console.log(`  - ${f}`));
    }

    console.log('\n📊 Todas as pastas no servidor:');
    mailboxes.forEach(m => console.log(`  ${m.path}`));

  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await imap.close();
  }
}

testImapFolders();
