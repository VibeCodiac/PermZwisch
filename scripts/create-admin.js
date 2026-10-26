// Legt eine*n Administrator*in an oder setzt das Passwort eines bestehenden Kontos neu.
// Lokal:     npm run create-admin -- --email you@example.de --name "Dein Name"
// Firebase:  ./scripts/firebase-admin.sh   (setzt DATA_DRIVER=firestore und das Projekt)
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { parseArgs } from 'node:util';
import bcrypt from 'bcryptjs';
import { snapshot, create, update, uniqueSlugIn } from '../src/data.js';
import { slugify } from '../src/lib/slug.js';
import { passwordProblem } from '../src/lib/passwords.js';

const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' } } });
const rl = readline.createInterface({ input: stdin, output: stdout });

const email = (values.email || (await rl.question('E-Mail: '))).trim().toLowerCase();
const name = (values.name || (await rl.question('Name: '))).trim();
rl.close();

/** Passwort abfragen, ohne es auf dem Bildschirm anzuzeigen. */
function askHidden(prompt) {
  return new Promise((resolve) => {
    stdout.write(prompt);
    if (!stdin.isTTY) {
      // Eingabe kommt aus einer Pipe: einfach eine Zeile lesen
      const r = readline.createInterface({ input: stdin });
      r.once('line', (line) => { r.close(); stdout.write('\n'); resolve(line); });
      return;
    }
    stdin.setRawMode(true);
    stdin.resume();
    let value = '';
    const onData = (buf) => {
      for (const ch of buf.toString('utf8')) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\n');
          return resolve(value);
        }
        if (ch === '\u0003') process.exit(130); // Strg+C
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

let password = process.env.ADMIN_PASSWORD;
if (!password) {
  password = await askHidden('Passwort (min. 12 Zeichen, wird nicht angezeigt): ');
  if ((await askHidden('Passwort wiederholen: ')) !== password) {
    console.error('Die Passwörter stimmen nicht überein.');
    process.exit(1);
  }
}

const problem = passwordProblem(password);
if (!email || !name || problem) {
  console.error(problem || 'E-Mail und Name sind erforderlich.');
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
const s = await snapshot({ fresh: true });
const existing = s.users.find((u) => u.email === email);
if (existing) {
  await update('users', existing.id, {
    password_hash: hash, role: 'admin', active: 1, failed_logins: 0, locked_until: null,
    session_version: (existing.session_version || 0) + 1,
  });
  console.log(`Konto ${email} aktualisiert (Admin, neues Passwort).`);
} else {
  await create('users', {
    email, name, slug: uniqueSlugIn(s.users, slugify(name)), role: 'admin', active: 1, bio: '', avatar_id: null,
    password_hash: hash, failed_logins: 0, locked_until: null, session_version: 0,
  });
  console.log(`Admin-Konto ${email} angelegt.`);
}
process.exit(0);
