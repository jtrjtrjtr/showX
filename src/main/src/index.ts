import { app } from 'electron';
import { Shell } from './Shell.js';

const shell = new Shell();

app.whenReady().then(async () => {
  try {
    await shell.boot();
  } catch (err) {
    console.error('Shell boot failed', err);
    app.exit(1);
  }
});

app.on('window-all-closed', async () => {
  await shell.shutdown();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async (e) => {
  if (!shell.isShutDown()) {
    e.preventDefault();
    await shell.shutdown();
    app.quit();
  }
});

process.on('SIGTERM', () => app.quit());
process.on('SIGINT', () => app.quit());
