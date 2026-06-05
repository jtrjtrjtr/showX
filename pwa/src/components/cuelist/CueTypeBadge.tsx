import type { Trigger } from 'showx-shared';

const ICONS: Record<string, string> = {
  manual: '⏵',
  auto_follow: '→',
  auto_continue: '⏩',
  timecode: '⏱',
};

const LABELS: Record<string, string> = {
  manual: 'Manual',
  auto_follow: 'Follow',
  auto_continue: 'Continue',
  timecode: 'Timecode',
};

interface CueTypeBadgeProps {
  trigger: Trigger;
}

export function CueTypeBadge({ trigger }: CueTypeBadgeProps) {
  const icon = ICONS[trigger.kind] ?? '?';
  const label = LABELS[trigger.kind] ?? trigger.kind;
  return (
    <span aria-label={label} title={label} style={{ fontSize: 14 }}>
      {icon}
    </span>
  );
}
