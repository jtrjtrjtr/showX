import { ipcMain, BrowserWindow } from 'electron';
import type { Logger } from 'showx-shared';
import type { ActiveShowDoc } from '../runtime/ActiveShowDoc.js';
import type { IpcMainBridge } from './index.js';
import {
  getRoutingRules,
  addRoutingRule,
  updateRoutingRule,
  removeRoutingRule,
  reorderRoutingRules,
  type RoutingRule,
} from '../../../modules/cuelist-core/dist/document/routing.js';

const ACTOR = { actorId: 'shell' };

function broadcastRoutingChanged(rules: RoutingRule[]): void {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.webContents.send('cuelist-core/routing-changed', rules);
  });
}

export function registerRoutingBridge(
  activeShow: ActiveShowDoc,
  ipc: IpcMainBridge = ipcMain,
  logger: Logger,
): void {
  let unsubscribeObserve: (() => void) | null = null;

  activeShow.onChange((kind) => {
    if (kind === 'opened') {
      const doc = activeShow.getDoc()!;
      const routingMap = doc.getMap('routing');
      const handler = () => broadcastRoutingChanged(getRoutingRules(doc));
      routingMap.observeDeep(handler);
      unsubscribeObserve = () => routingMap.unobserveDeep(handler);
    } else if (kind === 'closed') {
      unsubscribeObserve?.();
      unsubscribeObserve = null;
      broadcastRoutingChanged([]);
    }
  });

  ipc.handle('cuelist-core/get-routing', async () => {
    logger.debug('routing.ipc', { channel: 'get-routing' });
    const doc = activeShow.getDoc();
    if (!doc) return [];
    return getRoutingRules(doc);
  });

  ipc.handle(
    'cuelist-core/routing-add',
    async (_e, rule: Omit<RoutingRule, 'rule_id' | 'sort_key'>) => {
      const doc = activeShow.getDoc();
      if (!doc) throw new Error('No show open');
      let created!: RoutingRule;
      doc.transact(() => {
        created = addRoutingRule(doc, rule, ACTOR);
      });
      broadcastRoutingChanged(getRoutingRules(doc));
      logger.debug('routing.ipc', { channel: 'routing-add', ruleId: created.rule_id });
      return created;
    },
  );

  ipc.handle(
    'cuelist-core/routing-update',
    async (_e, ruleId: string, patch: Partial<Omit<RoutingRule, 'rule_id'>>) => {
      const doc = activeShow.getDoc();
      if (!doc) throw new Error('No show open');
      doc.transact(() => updateRoutingRule(doc, ruleId, patch, ACTOR));
      broadcastRoutingChanged(getRoutingRules(doc));
      logger.debug('routing.ipc', { channel: 'routing-update', ruleId });
      return { ok: true };
    },
  );

  ipc.handle('cuelist-core/routing-remove', async (_e, ruleId: string) => {
    const doc = activeShow.getDoc();
    if (!doc) throw new Error('No show open');
    doc.transact(() => removeRoutingRule(doc, ruleId, ACTOR));
    broadcastRoutingChanged(getRoutingRules(doc));
    logger.debug('routing.ipc', { channel: 'routing-remove', ruleId });
    return { ok: true };
  });

  ipc.handle('cuelist-core/routing-reorder', async (_e, ruleIds: string[]) => {
    const doc = activeShow.getDoc();
    if (!doc) throw new Error('No show open');
    doc.transact(() => reorderRoutingRules(doc, ruleIds, ACTOR));
    broadcastRoutingChanged(getRoutingRules(doc));
    logger.debug('routing.ipc', { channel: 'routing-reorder' });
    return { ok: true };
  });
}
