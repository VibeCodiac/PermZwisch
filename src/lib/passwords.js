import { config } from '../config.js';

export function passwordProblem(pw) {
  if (pw.length < config.minPasswordLength) return `Das Passwort muss mindestens ${config.minPasswordLength} Zeichen lang sein.`;
  if (pw.length > 128) return 'Das Passwort ist zu lang (max. 128 Zeichen).';
  if (!/[a-zA-ZäöüÄÖÜß]/.test(pw) || !/[^a-zA-ZäöüÄÖÜß]/.test(pw)) return 'Bitte Buchstaben und mindestens eine Ziffer oder ein Sonderzeichen verwenden.';
  return null;
}
