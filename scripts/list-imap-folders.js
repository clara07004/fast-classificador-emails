import { ImapFlow } from 'imapflow';
import dotenv from 'dotenv';

dotenv.config();

async function listFolders() {
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
    console.log('🔗 Conectando...');
    await imap.connect();
    console.log('✅ Conectado\n');

    console.log('📂 Pastas IMAP existentes:\n');
    const mailboxes = await imap.list();

    mailboxes.forEach((m) => {
      const indent = '   ';
      console.log(`${indent}${m.path}`);
    });

    console.log(`\n📊 Total: ${mailboxes.length} pastas`);
  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  } finally {
    await imap.close();
  }
}

listFolders();
