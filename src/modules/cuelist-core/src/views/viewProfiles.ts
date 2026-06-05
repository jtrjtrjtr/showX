import type { DepartmentTag } from 'showx-shared';

export interface ViewProfile {
  owned: DepartmentTag[];
  watched: DepartmentTag[];
}

const ALL_CANONICAL: DepartmentTag[] = ['LX', 'SX', 'VIDEO', 'AUTO', 'PYRO', 'FS', 'SM', 'OTHER'];

function allOthers(excluded: DepartmentTag[]): DepartmentTag[] {
  return ALL_CANONICAL.filter((d) => !excluded.includes(d));
}

export const viewProfiles = {
  sm: (): ViewProfile => ({ owned: ['SM'], watched: allOthers(['SM']) }),
  lx: (): ViewProfile => ({ owned: ['LX'], watched: ['SM'] }),
  sx: (): ViewProfile => ({ owned: ['SX'], watched: ['SM'] }),
  video: (): ViewProfile => ({ owned: ['VIDEO'], watched: ['SM'] }),
  auto: (): ViewProfile => ({ owned: ['AUTO'], watched: ['SM'] }),
  pyro: (): ViewProfile => ({ owned: ['PYRO'], watched: ['SM'] }),
  fs: (): ViewProfile => ({ owned: ['FS'], watched: ['SM'] }),
  other: (): ViewProfile => ({ owned: ['OTHER'], watched: ['SM'] }),
  director: (): ViewProfile => ({ owned: [], watched: [...ALL_CANONICAL] }),
  solo: (): ViewProfile => ({ owned: ['LX', 'SX', 'VIDEO'], watched: ['SM'] }),
};

export function profileForRole(
  role: 'stage_manager' | 'operator' | 'director' | 'watcher',
  ownedDepartments?: DepartmentTag[],
): ViewProfile {
  if (role === 'stage_manager') return viewProfiles.sm();
  if (role === 'director') return viewProfiles.director();
  if (role === 'watcher') return viewProfiles.director();
  // operator — derive from ownedDepartments
  if (!ownedDepartments || ownedDepartments.length === 0) {
    return { owned: [], watched: ['SM'] };
  }
  if (ownedDepartments.length === 1) {
    const key = ownedDepartments[0].toLowerCase() as keyof typeof viewProfiles;
    if (key in viewProfiles) {
      return viewProfiles[key]();
    }
  }
  return { owned: [...ownedDepartments], watched: ['SM'] };
}
