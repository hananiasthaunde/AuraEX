import { createPat, findUserByEmail, loadDotEnv } from '../lib/security.mjs';

loadDotEnv();

function parseArgs(values) {
  const options = {
    email: 'ananias.thaunde@sbdc.com.br',
    name: 'Token criado pela linha de comando',
    scopes: ['auraex:read', 'auraex:write'],
    days: 365
  };

  const positional = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) {
      positional.push(value);
      continue;
    }
    const [key, inline] = value.slice(2).split('=', 2);
    const next = inline ?? values[index + 1];
    if (inline === undefined) index += 1;
    if (key === 'email') options.email = next;
    else if (key === 'name') options.name = next;
    else if (key === 'days') options.days = Number(next);
    else if (key === 'scopes') {
      const requested = String(next || '').split(',').map(item => item.trim()).filter(Boolean);
      options.scopes = requested.includes('auraex:write')
        ? ['auraex:read', 'auraex:write']
        : ['auraex:read'];
    } else {
      console.error(`Opção desconhecida: --${key}`);
      process.exit(1);
    }
  }

  // Compatibilidade com a sintaxe posicional antiga:
  // email, nome, read|read-write, dias
  if (positional[0]) options.email = positional[0];
  if (positional[1]) options.name = positional[1];
  if (positional[2]) options.scopes = positional[2] === 'read' ? ['auraex:read'] : ['auraex:read', 'auraex:write'];
  if (positional[3]) options.days = Number(positional[3]);

  if (!Number.isFinite(options.days) || options.days < 1 || options.days > 3650) {
    console.error('A validade deve estar entre 1 e 3650 dias.');
    process.exit(1);
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const user = findUserByEmail(options.email);
if (!user) {
  console.error(`Utilizador não encontrado: ${options.email}`);
  process.exit(1);
}

const created = createPat(user.id, {
  name: options.name,
  scopes: options.scopes,
  expiresInDays: options.days
});

console.log('\nTOKEN CRIADO — COPIE AGORA\n');
console.log(created.token);
console.log(`\nNome: ${created.record.name}`);
console.log(`Escopos: ${created.record.scopes.join(', ')}`);
console.log(`Expira: ${created.record.expiresAt}\n`);
