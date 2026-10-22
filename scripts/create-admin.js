// Legt eine*n Administrator*in an oder setzt das Passwort eines bestehenden Kontos neu.
// Aufruf: npm run create-admin -- --email you@example.de --name "Dein Name"
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { parseArgs } from 'node:util';
import bcrypt from 'bcryptjs';
import { db } from '../src/db.js';
import { uniqueSlug } from '../src/lib/slug.js';
import { passwordProblem } from '../src/routes/admin/users.js';

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
const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
if (existing) {
  db.prepare("UPDATE users SET password_hash = ?, role = 'admin', active = 1, failed_logins = 0, locked_until = NULL WHERE id = ?")
    .run(hash, existing.id);
  console.log(`Konto ${email} aktualisiert (Admin, neues Passwort).`);
} else {
  db.prepare("INSERT INTO users (email, name, slug, role, password_hash) VALUES (?, ?, ?, 'admin', ?)")
    .run(email, name, uniqueSlug(db, 'users', name), hash);
  console.log(`Admin-Konto ${email} angelegt.`);
}
