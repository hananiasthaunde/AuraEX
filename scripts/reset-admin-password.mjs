import crypto from 'node:crypto';
import { loadDotEnv, resetPasswordByEmail } from '../lib/security.mjs';

loadDotEnv();

let email = 'ananias.thaunde@sbdc.com.br';
let password = '';
const positional = [];
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 1) {
  const value = args[index];
  if (!value.startsWith('--')) {
    positional.push(value);
    continue;
  }
  const [key, inline] = value.slice(2).split('=', 2);
  const next = inline ?? args[index + 1];
  if (inline === undefined) index += 1;
  if (key === 'email') email = next;
  else if (key === 'password') password = next;
  else {
    console.error(`Opção desconhecida: --${key}`);
    process.exit(1);
  }
}
if (positional[0]) email = positional[0];
if (positional[1]) password = positional[1];
if (!password) password = `AuraEX#${crypto.randomBytes(10).toString('base64url')}`;

const result = resetPasswordByEmail(email, password);
if (!result.ok) {
  console.error(result.error);
  process.exit(1);
}
console.log(`\nSenha redefinida para: ${result.user.email}`);
console.log(`Nova senha: ${password}`);
console.log('Guarde a senha em local seguro e altere-a no primeiro acesso.\n');
