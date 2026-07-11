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

export function offsetDateKey(dateKey: string, offsetDays: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + offsetDays);
  return toDateKey(date);
}

export function getWeekStart(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const dayOfWeek = new Date(year, month - 1, day).getDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  return offsetDateKey(dateKey, -daysSinceMonday);
}

export function formatWeekRange(weekStart: string): string {
  return `${formatShortDate(weekStart)}〜${formatShortDate(offsetDateKey(weekStart, 6))}`;
}

export function formatWeekDateHeading(dateKey: string): string {
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
