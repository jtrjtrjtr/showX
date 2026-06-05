import * as Y from 'yjs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from '../persistence/atomicWrite.js';
import { uuidv7 } from '../document/uuid.js';
import { getCuelist } from '../document/cuelist.js';

export interface SnapshotResult {
  snapshotId: string;
  filePath: string;
}

export async function writeSnapshot(
  doc: Y.Doc,
  cuelistId: string,
  pkgPath: string,
  byOperatorId: string,
): Promise<SnapshotResult> {
  const snapshotId = uuidv7();
  const isoZ = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `snap_${snapshotId}_${isoZ}.json`;
  const snapshotsDir = path.join(pkgPath, 'snapshots');
  const filePath = path.join(snapshotsDir, fileName);

  const cuelist = getCuelist(doc, cuelistId);
  if (!cuelist) throw new Error(`cuelist ${cuelistId} not found`);

  const snapshot = {
    snapshot_id: snapshotId,
    taken_at: new Date().toISOString(),
    by: byOperatorId,
    cuelist_id: cuelistId,
    cuelist: cuelist.toJSON(),
  };

  await fs.mkdir(snapshotsDir, { recursive: true });
  await atomicWriteFile(filePath, JSON.stringify(snapshot, null, 2) + '\n');

  return { snapshotId, filePath };
}
