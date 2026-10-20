import { createApp } from './app.js';
import { config } from './config.js';

createApp().listen(config.port, () => {
  console.log(`Blog läuft auf ${config.baseUrl} (Port ${config.port}, ${config.env})`);
});
