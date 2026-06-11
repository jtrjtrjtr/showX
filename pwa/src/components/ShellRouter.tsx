import { useState, useEffect, useMemo } from 'react';
import { CuelistCorePanel, FirstLaunchPicker, RecentShowsList } from '../../../src/modules/cuelist-core/src/ui/index.js';
import { createIpcBridge, getShellApi } from '../lib/uiPanelBridge.js';
import { StationsPanel } from './StationsPanel.js';
import { DispatchLogPanel } from './DispatchLogPanel.js';
import type { IpcBridge, ShellState } from '../lib/uiPanelBridge.js';

function Loading() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontFamily: 'system-ui, sans-serif',
        color: '#6b7280',
        fontSize: 14,
      }}
    >
      Loading…
    </div>
  );
}

export function ShellRouter() {
  const [state, setState] = useState<ShellState | null>(null);

  const ipcBridge = useMemo<IpcBridge | null>(() => {
    try {
      return createIpcBridge();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!ipcBridge) return;
    let shellApi: ReturnType<typeof getShellApi>;
    try {
      shellApi = getShellApi();
    } catch {
      return;
    }

    void shellApi.getState().then(setState);
    return shellApi.onShowChanged(() => {
      void shellApi.getState().then(setState);
    });
  }, [ipcBridge]);

  if (!ipcBridge || !state) return <Loading />;

  let mainContent: React.ReactNode;
  if (state.kind === 'no-show') {
    if (state.recentShows.length > 0) {
      mainContent = (
        <RecentShowsList
          ipc={ipcBridge}
          recentShows={state.recentShows}
        />
      );
    } else {
      mainContent = <FirstLaunchPicker ipc={ipcBridge} />;
    }
  } else {
    mainContent = <CuelistCorePanel ipc={ipcBridge} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <div style={{ flex: 1 }}>{mainContent}</div>
      <StationsPanel />
      <DispatchLogPanel />
    </div>
  );
}
