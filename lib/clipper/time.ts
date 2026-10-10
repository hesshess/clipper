// Clipper operates in Seoul. Korea has no daylight saving time, so KST is always UTC+9.
export const CLIPPER_TIME_ZONE = "Asia/Seoul";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// KST wall-clock fields for an instant, independent of the runtime's time zone.
export function kstParts(date: Date) {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth(),
    day: kst.getUTCDate(),
    weekday: kst.getUTCDay(),
    hours: kst.getUTCHours(),
    minutes: kst.getUTCMinutes(),
  };
}

// "YYYY-MM-DD" of the KST calendar day containing the instant.
export function kstDateKey(date: Date) {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

// "HH:MM" in KST, the format groomer schedules are stored in.
export function kstTimeOfDay(date: Date) {
  const { hours, minutes } = kstParts(date);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function fromKst(dateKey: string, timeOfDay: string) {
  return new Date(`${dateKey}T${timeOfDay}:00+09:00`);
}

export function addKstDays(dateKey: string, days: number) {
  return kstDateKey(new Date(fromKst(dateKey, "00:00").getTime() + days * DAY_MS));
}

// Built by hand rather than with Intl, which renders the space before AM/PM
// differently across engines and would cause hydration mismatches.
export function formatKstTime(date: Date) {
  const { hours, minutes } = kstParts(date);
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}
