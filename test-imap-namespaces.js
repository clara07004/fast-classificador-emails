import { ImapFlow } from 'imapflow';

async function testNamespaces() {
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
    await imap.connect();

    console.log('🔍 Procurando em todos os namespaces:\n');

    // Tenta listar com wildcards diferentes
    const patterns = [
      ['INBOX.', '*'],
      ['', '*'],
      ['', '%'],
      ['*', '*']
    ];

    for (const [prefix, pattern] of patterns) {
      try {
        console.log(`📂 LIST "${prefix}" "${pattern}"`);
        const list = await imap.list(prefix, pattern);
        list.forEach(m => {
          if (m.path.toLowerCase().includes('fast')) {
            console.log(`  ✅ ${m.path}`);
          }
        });
        if (list.length > 0 && !list.some(m => m.path.toLowerCase().includes('fast'))) {
          console.log(`  (${list.length} pastas, nenhuma Fast)`);
        }
      } catch (e) {
        console.log(`  ❌ Erro: ${e.message}`);
      }
    }

  } finally {
    await imap.close();
  }
}

testNamespaces();
