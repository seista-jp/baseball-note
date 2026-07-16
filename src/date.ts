export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDisplayDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-");
  return `${year}/${month}/${day}`;
}

export function formatShortDate(dateKey: string): string {
  const [, month, day] = dateKey.split("-");
  return `${Number(month)}/${Number(day)}`;
}

export function formatJapaneseDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}

export function offsetDateKey(dateKey: string, offsetDays: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + offsetDays);
  return toDateKey(date);
}

export function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function getMonthStart(dateKey: string): string {
  const [year, month] = dateKey.split("-").map(Number);
  return toDateKey(new Date(year, month - 1, 1));
}

export function offsetMonthKey(monthStart: string, offsetMonths: number): string {
  const [year, month] = monthStart.split("-").map(Number);
  return toDateKey(new Date(year, month - 1 + offsetMonths, 1));
}

export function formatMonthLabel(monthStart: string): string {
  const [year, month] = monthStart.split("-");
  return `${year}年${Number(month)}月`;
}

export function getCalendarMonthDates(monthStart: string): Array<string | null> {
  const [year, month] = monthStart.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const dates: Array<string | null> = Array.from({ length: firstDay }, () => null);

  for (let day = 1; day <= daysInMonth; day += 1) {
    dates.push(toDateKey(new Date(year, month - 1, day)));
  }

  while (dates.length % 7 !== 0) {
    dates.push(null);
  }

  return dates;
}

export function formatDateHeading(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
  const dayName = dayNames[new Date(year, month - 1, day).getDay()];
  return `${month}月${day}日（${dayName}）`;
}

export function formatTime(isoString: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoString));
}
