// src/shared/src/types/department.ts
// Canonical department enum + DepartmentTag type per data_model.md §6.1

export const CANONICAL_DEPARTMENTS = [
  'LX', 'SX', 'VIDEO', 'AUTO', 'PYRO', 'FS', 'SM', 'OTHER',
] as const;

export type CanonicalDepartmentTag = typeof CANONICAL_DEPARTMENTS[number];

// Custom department strings allowed post-MVP via show.meta.departments (§6.1).
// Using (string & {}) keeps intellisense hints for canonical values while
// allowing arbitrary strings at runtime.
export type DepartmentTag = CanonicalDepartmentTag | (string & {});

export function isCanonicalDepartment(s: string): s is CanonicalDepartmentTag {
  return (CANONICAL_DEPARTMENTS as readonly string[]).includes(s);
}
