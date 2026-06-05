export interface CompanionPresetDefinition {
  category: string;
  name: string;
  type: 'button';
  style: {
    text: string;
    size: string;
    color: number;
    bgcolor: number;
  };
  feedbacks: Array<{
    feedbackId: string;
    style?: Record<string, unknown>;
  }>;
  steps: Array<{
    down: Array<{ actionId: string; options?: Record<string, unknown> }>;
    up: [];
  }>;
}

export function compilePresets(): CompanionPresetDefinition[] {
  return [
    {
      category: 'ShowX',
      name: 'GO button',
      type: 'button',
      style: { text: 'GO', size: '44', color: 0xffffff, bgcolor: 0x007700 },
      feedbacks: [
        { feedbackId: 'show_mode', style: { bgcolor: 0xcc0000 } },
        { feedbackId: 'cue_armed', style: { bgcolor: 0x009900 } },
      ],
      steps: [{ down: [{ actionId: 'go' }], up: [] }],
    },
    {
      category: 'ShowX',
      name: 'Standby Next',
      type: 'button',
      style: { text: 'STBY\nNEXT', size: '18', color: 0xffffff, bgcolor: 0x444400 },
      feedbacks: [{ feedbackId: 'cue_armed', style: { bgcolor: 0xffcc00, color: 0x000000 } }],
      steps: [{ down: [{ actionId: 'standby_next' }], up: [] }],
    },
    {
      category: 'ShowX',
      name: 'Cue Label Display',
      type: 'button',
      style: { text: '$(showx:armed_cue_label)', size: '18', color: 0xffffff, bgcolor: 0x222222 },
      feedbacks: [],
      steps: [{ down: [], up: [] }],
    },
    {
      category: 'ShowX',
      name: 'Mode Indicator',
      type: 'button',
      style: { text: '$(showx:mode)', size: '18', color: 0xffffff, bgcolor: 0x333333 },
      feedbacks: [{ feedbackId: 'show_mode', style: { bgcolor: 0xcc0000 } }],
      steps: [{ down: [], up: [] }],
    },
    {
      category: 'ShowX',
      name: 'Stations Counter',
      type: 'button',
      style: { text: 'Stations\n$(showx:stations_online)', size: '18', color: 0xffffff, bgcolor: 0x222244 },
      feedbacks: [],
      steps: [{ down: [], up: [] }],
    },
    {
      category: 'ShowX',
      name: 'Connection Status',
      type: 'button',
      style: { text: 'ShowX', size: '18', color: 0xffffff, bgcolor: 0x444444 },
      feedbacks: [
        { feedbackId: 'connected', style: { bgcolor: 0x008000 } },
        { feedbackId: 'disconnected', style: { bgcolor: 0xcc0000 } },
      ],
      steps: [{ down: [], up: [] }],
    },
  ];
}
