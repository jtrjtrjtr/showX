import { ActiveShowDoc } from './ActiveShowDoc.js';

export { ActiveShowDoc };

let _singleton: ActiveShowDoc | null = null;

export function setActiveShowDoc(doc: ActiveShowDoc): void {
  _singleton = doc;
}

export function getActiveShowDoc(): ActiveShowDoc | null {
  return _singleton;
}
