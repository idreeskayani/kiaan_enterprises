import { BadRequestException } from '@nestjs/common';

// "YYYY-MM-DD" (from the date pickers) -> a day range in Pakistan time (UTC+5), so "1st to 30th"
// covers both whole days even though the server runs in UTC. Leave a side empty for "no limit".
export type DayRange = { gte?: Date; lte?: Date };

const isDay = (v?: string): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function dayRange(from?: string, to?: string): DayRange | undefined {
  const gte = isDay(from) ? new Date(`${from}T00:00:00.000+05:00`) : undefined;
  const lte = isDay(to) ? new Date(`${to}T23:59:59.999+05:00`) : undefined;
  if (gte && lte && gte > lte) throw new BadRequestException('"From" date must be before the "To" date');
  return gte || lte ? { ...(gte && { gte }), ...(lte && { lte }) } : undefined;
}

// true when a date is inside the range (no range = always)
export const inDayRange = (d: Date | null | undefined, r?: DayRange) =>
  !r || (!!d && (!r.gte || d >= r.gte) && (!r.lte || d <= r.lte));
