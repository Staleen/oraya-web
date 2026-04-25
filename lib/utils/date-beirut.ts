const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const BEIRUT_TIME_ZONE = "Asia/Beirut";
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BEIRUT_TIME_ZONE,
  weekday: "short",
});

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BEIRUT_TIME_ZONE,
  month: "short",
});

function parseDateOnly(value: string): { year: number; month: number; day: number } | null {
  const match = ISO_DATE_RE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function createStableBeirutDate(value: string): Date | null {
  const parts = parseDateOnly(value);
  if (!parts) return null;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
}

export function getBeirutDay(isoDate: string): number {
  const date = createStableBeirutDate(isoDate);
  if (!date) return -1;
  const weekday = weekdayFormatter.format(date);
  return WEEKDAY_INDEX[weekday] ?? -1;
}

export function formatBeirutMonthDay(isoDate: string): string {
  const parts = parseDateOnly(isoDate);
  if (!parts) return isoDate;
  const date = createStableBeirutDate(isoDate);
  if (!date) return isoDate;
  return `${monthFormatter.format(date)} ${parts.day}`;
}
