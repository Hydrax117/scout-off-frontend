import type { ValidatorActionEntry } from '@/hooks/useValidatorActionLog';

const CSV_HEADERS = ['timestamp', 'action', 'validator', 'player', 'milestone'];

const ACTION_LABELS: Record<ValidatorActionEntry['action'], string> = {
  approved: 'Milestone Approved',
  revoked: 'Milestone Revoked',
};

/**
 * Escapes a CSV field value against both RFC 4180 special characters and
 * formula injection (issue #1137 / related CSV-injection security issue).
 *
 * Spreadsheet applications (Excel, LibreOffice, Google Sheets) treat a cell
 * that begins with `=`, `+`, `-`, `@`, `\t`, or `\r` as a formula.  Prefixing
 * the value with a single-quote `'` forces the cell to be interpreted as plain
 * text.  The quote is stripped by spreadsheet apps on display but prevents
 * formula execution — the same strategy recommended by OWASP.
 */
function escapeCsvValue(value: string): string {
  // Neutralise formula-injection: prefix with a literal single-quote so
  // spreadsheet apps treat the cell as plain text rather than a formula.
  const FORMULA_CHARS = /^[=+\-@\t\r]/;
  const sanitized = FORMULA_CHARS.test(value) ? `'${value}` : value;

  if (/[",\n\r]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

/** Mirrors lib/auditLogCsv.ts's build<Thing>Csv(data) => string convention. */
export function buildValidatorActionLogCsv(
  entries: ValidatorActionEntry[],
): string {
  const rows = entries.map((entry) =>
    [
      new Date(entry.timestamp * 1000).toISOString(),
      ACTION_LABELS[entry.action],
      entry.validator ?? '',
      entry.playerId ?? '',
      entry.milestoneId ?? '',
    ]
      .map(escapeCsvValue)
      .join(','),
  );

  return [CSV_HEADERS.join(','), ...rows].join('\n') + '\n';
}
