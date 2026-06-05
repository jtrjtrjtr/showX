export type Dialect = 'qlab' | 'eos' | 'generic';

/**
 * Detect CSV dialect from column names of the first record.
 * Priority: QLab > Eos > generic.
 * QLab is preferred when 'pre-wait' is present to avoid false-positives on
 * generic sheets that happen to have a 'Number' column.
 */
export function detectDialect(records: Record<string, string>[]): Dialect {
  if (records.length === 0) return 'generic';
  const cols = new Set(Object.keys(records[0]).map((k) => k.toLowerCase()));
  if (cols.has('pre-wait') && (cols.has('number') || cols.has('q#'))) return 'qlab';
  if (cols.has('cue') && (cols.has('label') || cols.has('linkcue') || cols.has('followtime'))) {
    return 'eos';
  }
  return 'generic';
}
