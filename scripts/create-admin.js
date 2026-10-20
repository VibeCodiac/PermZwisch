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
const password = process.env.ADMIN_PASSWORD || (await rl.question('Passwort (min. 12 Zeichen): '));
rl.close();

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
