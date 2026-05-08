import { ImapFlow } from 'imapflow';
import dotenv from 'dotenv';

dotenv.config();

const FOLDERS_TO_CREATE = [
  'INBOX.Fast-P1-Urgente',
  'INBOX.Fast-P2-Alta',
  'INBOX.Fast-P3-Normal',
  'INBOX.Fast-P4-Baixa',
  'INBOX.Fast-P5-Irrelevante',
  'INBOX.Fast-Pendente-Classificacao',
  'INBOX.Fast-Correcoes'
];

async function setupFolders() {
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
    console.log('✅ Conectado\n');

    // Lista pastas existentes
    console.log('📂 Pastas existentes:');
    const mailboxes = await imap.list();
    const existingFolders = mailboxes.map((m) => m.path);
    existingFolders.forEach((folder) => console.log(`   - ${folder}`));

    console.log('\n📝 Criando pastas necessárias...\n');

    for (const folderPath of FOLDERS_TO_CREATE) {
      if (existingFolders.includes(folderPath)) {
        console.log(`   ⏭️  ${folderPath} (já existe)`);
      } else {
        try {
          await imap.mailboxCreate(folderPath);
          console.log(`   ✅ ${folderPath} (criada)`);
        } catch (error) {
          console.log(`   ❌ ${folderPath} (erro: ${error.message})`);
        }
      }
    }

    console.log('\n✅ Setup completo!');
  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  } finally {
    await imap.close();
  }
}

setupFolders();
