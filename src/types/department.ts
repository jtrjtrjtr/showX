// src/types/department.ts
// Canonical department enum per data_model.md §6.1, §A.5

export const CANONICAL_DEPARTMENTS = [
  'LX', 'SX', 'VIDEO', 'AUTO', 'PYRO', 'FS', 'SM', 'OTHER',
] as const;

export type CanonicalDepartmentTag = typeof CANONICAL_DEPARTMENTS[number];

// Custom department strings allowed post-MVP via show.meta.departments.
// (string & {}) preserves intellisense hints for canonical values.
export type DepartmentTag = CanonicalDepartmentTag | (string & {});

export function isCanonicalDepartment(s: string): s is CanonicalDepartmentTag {
  return (CANONICAL_DEPARTMENTS as readonly string[]).includes(s);
}
