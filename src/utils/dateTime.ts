export const DISPLAY_TIME_ZONE = 'Asia/Manila';
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const dateFormatter = new Intl.DateTimeFormat('en-PH', {
  timeZone: DISPLAY_TIME_ZONE,
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

const compactDateFormatter = new Intl.DateTimeFormat('en-PH', {
  timeZone: DISPLAY_TIME_ZONE,
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('en-PH', {
  timeZone: DISPLAY_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-PH', {
  timeZone: DISPLAY_TIME_ZONE,
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
});

function parseTimestamp(value: string | Date) {
  const normalizedValue = value instanceof Date
    ? value
    : /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value)
      ? new Date(value.replace(' ', 'T') + '+08:00')
      : new Date(value);
  const date = normalizedValue instanceof Date ? normalizedValue : new Date(normalizedValue);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function dateOnlyToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DISPLAY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now).reduce<Record<string, string>>((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatDate(value: string | null | undefined, compact = false) {
  if (!value) return '—';
  if (DATE_ONLY_PATTERN.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Intl.DateTimeFormat('en-PH', {
      timeZone: 'UTC',
      year: 'numeric',
      month: compact ? 'short' : 'long',
      day: 'numeric',
    }).format(new Date(Date.UTC(year, month - 1, day)));
  }
  const date = parseTimestamp(value);
  return date ? (compact ? compactDateFormatter : dateFormatter).format(date) : '—';
}

export function formatTime(value: string | Date | null | undefined) {
  const date = value ? parseTimestamp(value) : null;
  return date ? timeFormatter.format(date) : '—';
}

export function formatDateTime(value: string | Date | null | undefined) {
  const date = value ? parseTimestamp(value) : null;
  return date ? dateTimeFormatter.format(date) : '—';
}

export function dateOnlySortValue(value: string) {
  if (!DATE_ONLY_PATTERN.test(value)) return Number.NaN;
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

export function addDateOnlyDays(value: string, days: number) {
  if (!DATE_ONLY_PATTERN.test(value)) return value;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()]
    .map((part) => String(part).padStart(2, '0'))
    .join('-');
}

export function timestampSortValue(value: string | null | undefined) {
  if (!value) return Number.NaN;
  const date = parseTimestamp(value);
  return date ? date.getTime() : Number.NaN;
}

export function isDateOnly(value: string | null | undefined): value is string {
  return Boolean(value && DATE_ONLY_PATTERN.test(value));
}
