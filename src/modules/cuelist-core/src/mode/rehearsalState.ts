import * as Y from 'yjs';
import { getMode, type Mode } from './transitions.js';

export { getMode, type Mode };

export function assertRehearsal(doc: Y.Doc): void {
  if (getMode(doc) !== 'rehearsal') {
    throw new Error('expected REHEARSAL mode');
  }
}

export function assertShow(doc: Y.Doc): void {
  if (getMode(doc) !== 'show') {
    throw new Error('expected SHOW mode');
  }
}
