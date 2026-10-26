// Einstiegspunkt für Firebase: die ganze Website als eine Cloud Function in Frankfurt.
import { onRequest } from 'firebase-functions/https';
import { defineSecret } from 'firebase-functions/params';

const sessionSecret = defineSecret('SESSION_SECRET');

let app;

export const permzwisch = onRequest(
  {
    region: 'europe-west3',
    secrets: [sessionSecret],
    memory: '1GiB', // Bildverarbeitung braucht etwas Luft
    timeoutSeconds: 120,
    concurrency: 40,
    maxInstances: 4, // Kostenbremse
    invoker: 'public',
  },
  async (req, res) => {
    if (!app) {
      const { createApp } = await import('./app.js');
      app = createApp();
    }
    return app(req, res);
  }
);
