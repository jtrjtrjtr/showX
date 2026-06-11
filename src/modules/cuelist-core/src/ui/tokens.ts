export const tokens = {
  color: {
    // Dark FOH palette — aligned with pwa/src/components/cuelist/tokens.ts (B003-604)
    bg: '#0E0F12',
    panel: '#16181D',
    raised: '#1E2128',
    border: '#2A2E37',
    ink: '#F2F0EB',
    ink_secondary: '#9BA0AA',
    ink_disabled: '#5C6170',
    teal: '#2DD4BF',
    teal_dim: '#14534B',
    red: '#EF4444',
    green: '#34D399',
    yellow: '#F5B83D',
    // legacy aliases mapped to dark equivalents
    cream: '#0E0F12',
    gray_50: '#16181D',
    gray_300: '#2A2E37',
    gray_700: '#9BA0AA',
  },
  space: { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 },
  font: { ui: '"GT America", system-ui, sans-serif', mono: '"GT America Mono", monospace' },
  radius: { s: 4, m: 8, l: 12 },
} as const;
