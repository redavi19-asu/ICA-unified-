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
