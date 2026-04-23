export interface ParsedIcalEvent {
  uid: string;
  starts_on: string;
  ends_on: string;
  summary: string | null;
}

function unfoldIcal(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n");
}

function parseIcalDate(value: string): string | null {
  const raw = value.trim();
  if (!/^\d{8}$/.test(raw)) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

export function parseIcalEvents(text: string): ParsedIcalEvent[] {
  const lines = unfoldIcal(text);
  const events: ParsedIcalEvent[] = [];
  let current: Partial<ParsedIcalEvent> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current?.uid && current.starts_on && current.ends_on) {
        events.push({
          uid: current.uid,
          starts_on: current.starts_on,
          ends_on: current.ends_on,
          summary: current.summary ?? null,
        });
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const [rawKey, ...rest] = line.split(":");
    if (!rawKey || rest.length === 0) continue;

    const value = rest.join(":");
    const key = rawKey.toUpperCase();

    if (key === "UID") {
      current.uid = value.trim();
      continue;
    }
    if (key === "SUMMARY") {
      current.summary = value.trim() || null;
      continue;
    }
    if (key.startsWith("DTSTART") && key.includes("VALUE=DATE")) {
      const startsOn = parseIcalDate(value);
      if (startsOn) current.starts_on = startsOn;
      continue;
    }
    if (key.startsWith("DTEND") && key.includes("VALUE=DATE")) {
      const endsOn = parseIcalDate(value);
      if (endsOn) current.ends_on = endsOn;
    }
  }

  return events.filter((event) => event.starts_on < event.ends_on);
}

export function formatIcalDate(isoDate: string): string {
  return isoDate.replace(/-/g, "");
}

export function formatIcalTimestamp(date = new Date()): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
}

export function escapeIcalText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}
