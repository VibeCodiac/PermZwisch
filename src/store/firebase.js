import { initializeApp, getApps } from 'firebase-admin/app';

/** Firebase Admin SDK – nutzt auf Firebase und in Cloud Shell automatisch die vorhandenen Zugangsdaten. */
export function firebaseApp() {
  return getApps()[0] || initializeApp();
}
