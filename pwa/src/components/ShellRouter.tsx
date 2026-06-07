import { useState, useEffect, useMemo } from 'react';
import { CuelistCorePanel, FirstLaunchPicker, RecentShowsList } from '../../../src/modules/cuelist-core/src/ui/index.js';
import { createIpcBridge, getShellApi } from '../lib/uiPanelBridge.js';
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

  if (state.kind === 'no-show') {
    if (state.recentShows.length > 0) {
      return (
        <RecentShowsList
          ipc={ipcBridge}
          recentShows={state.recentShows}
        />
      );
    }
    return <FirstLaunchPicker ipc={ipcBridge} />;
  }

  return <CuelistCorePanel ipc={ipcBridge} />;
}
