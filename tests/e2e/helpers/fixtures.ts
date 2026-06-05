import path from 'node:path';

export const MULTIOP_SHOW_FIXTURE = path.resolve(
  __dirname,
  '../fixtures/multiop-show',
);

export const TEST_PIN = '000000';

export const SHOW_ID = 'e2e00000-0000-7000-8000-000000000001';
export const CUELIST_ID = 'e2e00000-0000-7000-8000-000000000010';

export const CUE_IDS = {
  Q1_LX: 'e2e00000-0000-7000-8000-000000000020',
  Q2_SM: 'e2e00000-0000-7000-8000-000000000021',
  Q3_COMPOUND: 'e2e00000-0000-7000-8000-000000000022',
  Q4_SX: 'e2e00000-0000-7000-8000-000000000023',
  Q5_LX: 'e2e00000-0000-7000-8000-000000000024',
} as const;

export const PAYLOAD_IDS = {
  Q3_LX: 'e2e00000-0000-7000-8000-000000000031',
  Q3_SX: 'e2e00000-0000-7000-8000-000000000032',
} as const;

export const SM_TOTAL_CUES = 5;
export const LX_VISIBLE_CUES = 3; // Q1 (LX), Q3 (compound LX+SX), Q5 (LX) — not Q2 (SM) or Q4 (SX)
