import * as Y from 'yjs';
import type { Payload } from 'showx-shared';
import { getProposals } from './show.js';
import { updateCueFields } from './cue.js';
import type { CueFieldPatch } from './cue.js';
import { getCuelist, getCues } from './cuelist.js';
import { makePayloadMap, validatePayload, getPayloads } from './payload.js';
import { uuidv7 } from './uuid.js';

export type ProposalKind = 'cue' | 'payload';
export type ProposalStatus = 'pending' | 'accepted' | 'rejected';

export interface Proposal {
  id: string;
  cue_id: string;
  cuelist_id: string;
  author_operator_id: string;
  kind: ProposalKind;
  target_field: string;
  proposed_value: string; // JSON-serialized
  status: ProposalStatus;
  created_at: string;
  resolved_by?: string;
  resolved_at?: string;
}

export interface AddProposalInput {
  cue_id: string;
  cuelist_id: string;
  author_operator_id: string;
  kind: ProposalKind;
  target_field: string;
  proposed_value: unknown;
}

export function addProposal(doc: Y.Doc, input: AddProposalInput): string {
  const id = uuidv7();
  const now = new Date().toISOString();
  const m = new Y.Map<unknown>();
  m.set('id', id);
  m.set('cue_id', input.cue_id);
  m.set('cuelist_id', input.cuelist_id);
  m.set('author_operator_id', input.author_operator_id);
  m.set('kind', input.kind);
  m.set('target_field', input.target_field);
  m.set('proposed_value', JSON.stringify(input.proposed_value));
  m.set('status', 'pending');
  m.set('created_at', now);
  m.set('resolved_by', null);
  m.set('resolved_at', null);
  doc.transact(() => getProposals(doc).push([m]));
  return id;
}

export function listProposals(doc: Y.Doc): Proposal[] {
  return getProposals(doc).toArray().map(mapToProposal);
}

export function pendingProposalCount(doc: Y.Doc): number {
  return getProposals(doc).toArray().filter((m) => m.get('status') === 'pending').length;
}

function mapToProposal(m: Y.Map<unknown>): Proposal {
  return {
    id: m.get('id') as string,
    cue_id: m.get('cue_id') as string,
    cuelist_id: m.get('cuelist_id') as string,
    author_operator_id: m.get('author_operator_id') as string,
    kind: m.get('kind') as ProposalKind,
    target_field: m.get('target_field') as string,
    proposed_value: m.get('proposed_value') as string,
    status: m.get('status') as ProposalStatus,
    created_at: m.get('created_at') as string,
    resolved_by: (m.get('resolved_by') as string | null) ?? undefined,
    resolved_at: (m.get('resolved_at') as string | null) ?? undefined,
  };
}

export function resolveProposal(
  doc: Y.Doc,
  proposalId: string,
  resolution: 'accepted' | 'rejected',
  resolvedBy: string,
): void {
  const proposals = getProposals(doc);
  const proposalMap = proposals.toArray().find((m) => m.get('id') === proposalId);
  if (!proposalMap) throw new Error(`proposal ${proposalId} not found`);
  if ((proposalMap.get('status') as string) !== 'pending') {
    throw new Error(`proposal ${proposalId} is already resolved`);
  }

  const now = new Date().toISOString();
  const kind = proposalMap.get('kind') as ProposalKind;
  const cueId = proposalMap.get('cue_id') as string;
  const cuelistId = proposalMap.get('cuelist_id') as string;
  const targetField = proposalMap.get('target_field') as string;
  const rawValue = proposalMap.get('proposed_value') as string;

  doc.transact(() => {
    if (resolution === 'accepted') {
      const parsedValue: unknown = JSON.parse(rawValue);

      if (kind === 'cue') {
        // updateCueFields uses assertEditAllowed(doc,'meta') — meta IS allowed in SHOW mode
        updateCueFields(doc, cuelistId, cueId, { [targetField]: parsedValue } as CueFieldPatch, resolvedBy);
      } else {
        // payload: acceptance IS the authorized path — apply directly, skip mode lock
        const cuelistMap = getCuelist(doc, cuelistId);
        if (!cuelistMap) throw new Error(`cuelist ${cuelistId} not found`);
        const cueMap = getCues(cuelistMap).toArray().find((c) => c.get('id') === cueId);
        if (!cueMap) throw new Error(`cue ${cueId} not found`);
        const payloadInput = parsedValue as Omit<Payload, 'id'>;
        validatePayload(payloadInput); // keep validation, skip lock
        const payloadMap = makePayloadMap(payloadInput);
        getPayloads(cueMap).push([payloadMap]);
      }
    }

    proposalMap.set('status', resolution);
    proposalMap.set('resolved_by', resolvedBy);
    proposalMap.set('resolved_at', now);
  });
}
