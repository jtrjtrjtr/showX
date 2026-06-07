import { BrowserWindow } from 'electron';

export interface MainWindowOpts {
  pwaUrl: string;
  preloadPath: string;
}

export async function createMainWindow(opts: MainWindowOpts): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0a0a0a',
    title: 'ShowX',
    // titleBarStyle: 'hiddenInset' was suppressing drag region — use default title bar
    titleBarStyle: 'default',
    webPreferences: {
      preload: opts.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  await win.loadURL(opts.pwaUrl);
  if (process.env['SHOWX_DEV'] === '1') {
    win.webContents.openDevTools({ mode: 'detach' });
  }
  return win;
}
