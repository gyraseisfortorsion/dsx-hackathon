/**
 * Date helpers for API timestamps. The API sends ISO strings with the campus UTC offset
 * (e.g. "2026-10-26T09:05:00-04:00"), so wall-clock dates and times are read straight from
 * the string. That keeps the schedule in Boston time regardless of the device time zone.
 * Plain dates are "YYYY-MM-DD" strings.
 */

export const CAMPUS_TIME_ZONE = 'America/New_York';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (value: number) => String(value).padStart(2, '0');

const toUtcDate = (date: string) => new Date(`${date}T00:00:00Z`);
const fromUtcDate = (value: Date) => `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;

/** Campus-local calendar date of a timestamp. */
export const dateOf = (iso: string) => iso.slice(0, 10);

/** Minutes since campus-local midnight. */
export const minutesOf = (iso: string) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));

/** Today's date on campus. Falls back to the device date if the Intl time zone data is unavailable. */
export function campusToday(now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: CAMPUS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const get = (type: string) => parts.find((part) => part.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }
}

let campusFormatter: Intl.DateTimeFormat | null | undefined;

function campusParts(ms: number) {
  if (campusFormatter === undefined) {
    try {
      campusFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: CAMPUS_TIME_ZONE,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      campusFormatter = null;
    }
  }
  if (!campusFormatter) return null;
  const parts = Object.fromEntries(campusFormatter.formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}:${parts.second}` };
}

function campusIsoAt(ms: number) {
  const parts = campusParts(ms);
  if (!parts) return null;
  const offset = Math.round((Date.parse(`${parts.date}T${parts.time}Z`) - Math.floor(ms / 1000) * 1000) / 60_000);
  const sign = offset < 0 ? '-' : '+';
  return `${parts.date}T${parts.time}${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}

/**
 * Rewrites any ISO timestamp (`Z` or offset, optional fractional seconds) in campus wall time,
 * e.g. "2026-10-24T17:00:00Z" -> "2026-10-24T13:00:00-04:00", so the helpers above can read it.
 */
export function toCampusIso(iso: string) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return campusIsoAt(ms) ?? iso;
}

/** Start of a campus calendar day as an ISO timestamp with the correct UTC offset. */
export function campusMidnight(date: string) {
  // 05:00Z is 00:00 or 01:00 on campus, so it carries that night's offset even on DST change days.
  const offset = (campusIsoAt(Date.parse(`${date}T05:00:00Z`)) ?? `${date}T00:00:00-05:00`).slice(19);
  return `${date}T00:00:00${offset}`;
}

export function addDays(date: string, days: number) {
  const value = toUtcDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return fromUtcDate(value);
}

export const weekdayIndex = (date: string) => toUtcDate(date).getUTCDay();

/** Monday of the week containing `date`. */
export const startOfWeek = (date: string) => addDays(date, -((weekdayIndex(date) + 6) % 7));

export const daysBetween = (from: string, to: string) => Math.round((toUtcDate(to).getTime() - toUtcDate(from).getTime()) / 86_400_000);

/** "9:05 AM" */
export function formatTime(iso: string) {
  const minutes = minutesOf(iso);
  const hours = Math.floor(minutes / 60);
  return `${hours % 12 || 12}:${pad(minutes % 60)} ${hours < 12 ? 'AM' : 'PM'}`;
}

/** "9:05" — compact form for timelines. */
export function formatShortTime(iso: string) {
  const minutes = minutesOf(iso);
  return `${Math.floor(minutes / 60) % 12 || 12}:${pad(minutes % 60)}`;
}

/** "Monday, October 26" */
export function formatLongDate(date: string) {
  const value = toUtcDate(date);
  return `${WEEKDAYS[value.getUTCDay()]}, ${MONTHS[value.getUTCMonth()]} ${value.getUTCDate()}`;
}

/** "Mon, Oct 26" */
export function formatShortDate(date: string) {
  const value = toUtcDate(date);
  return `${WEEKDAYS[value.getUTCDay()].slice(0, 3)}, ${MONTHS[value.getUTCMonth()].slice(0, 3)} ${value.getUTCDate()}`;
}

/** "MON 26" */
export function formatDayChip(date: string) {
  const value = toUtcDate(date);
  return `${WEEKDAYS[value.getUTCDay()].slice(0, 3).toUpperCase()} ${value.getUTCDate()}`;
}

/** "OCTOBER 2026" */
export function formatMonthYear(date: string) {
  const value = toUtcDate(date);
  return `${MONTHS[value.getUTCMonth()].toUpperCase()} ${value.getUTCFullYear()}`;
}

/** "Oct 26 – Nov 1" */
export function formatWeekRange(weekStart: string) {
  const end = toUtcDate(addDays(weekStart, 6));
  const start = toUtcDate(weekStart);
  const month = (value: Date) => MONTHS[value.getUTCMonth()].slice(0, 3);
  return start.getUTCMonth() === end.getUTCMonth()
    ? `${month(start)} ${start.getUTCDate()}–${end.getUTCDate()}`
    : `${month(start)} ${start.getUTCDate()} – ${month(end)} ${end.getUTCDate()}`;
}

/** "Today", "Tomorrow", or "Mon, Oct 26" relative to `today`. */
export function formatRelativeDay(date: string, today: string) {
  const delta = daysBetween(today, date);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  if (delta === -1) return 'Yesterday';
  return formatShortDate(date);
}

/** "in 18 min", "in 2 hr 5 min", or null when more than a day away or already started. */
export function formatCountdown(iso: string, now = Date.now()) {
  const minutes = Math.round((Date.parse(iso) - now) / 60_000);
  if (minutes < 0 || minutes >= 24 * 60) return null;
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `in ${hours} hr${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
}

/** "Mon, Wed, Fri" from API weekday indexes (0 = Monday). */
export function formatWeekdays(weekdays: number[]) {
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return weekdays.map((day) => names[day] ?? '').join(', ');
}

/** "10:10:00" -> "10:10 AM" */
export function formatClockTime(time: string) {
  return formatTime(`0000-00-00T${time}`);
}

export function greetingFor(now = new Date()) {
  let hour = now.getHours();
  try {
    hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: CAMPUS_TIME_ZONE, hour: 'numeric', hourCycle: 'h23' }).format(now));
  } catch {}
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
