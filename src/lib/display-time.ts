// Use one explicit timezone in operational reports and workflow history.
// Never depend on the server or browser machine's timezone.
export function formatOperationalDate(value: Date | string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric',
  }).format(new Date(value));
}

export function formatOperationalTimestamp(value: Date | string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value)) + ' UTC';
}

// Legacy raw D1 writes can expose epoch milliseconds as TEXT.
export function parseStoredDate(value: string | number | Date): Date | null {
  const normalized = typeof value === 'string' && /^\d{12,13}$/.test(value.trim())
    ? Number(value) : value;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}
