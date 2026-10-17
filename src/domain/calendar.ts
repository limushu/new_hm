export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function monthDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1, 12);
  const offset = (first.getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const weeks = Math.ceil((offset + count) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => new Date(year, month, 1 - offset + i, 12));
}

export function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

export function shiftDate(value: string, days: number): string {
  const date = parseDate(value);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

export function weekDates(value: string): string[] {
  const date = parseDate(value);
  const offset = (date.getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, index) => shiftDate(value, index - offset));
}
