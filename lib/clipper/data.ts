import {
  and,
  desc,
  eq,
  gt,
  inArray,
  lt,
  ne,
} from "drizzle-orm";

import {
  appointments,
  groomerSchedules,
  groomerServiceAreas,
  groomers,
  groomingPackages,
} from "@/db/schema";

import { getDatabase } from "./db";
import { addKstDays, fromKst, kstDateKey, kstParts, kstTimeOfDay } from "./time";
import type {
  AppointmentDetails,
  BookingOption,
  BookingSlot,
} from "./types";

// KST arrival times; both fit every seeded schedule window for the longest package.
const SLOT_TIMES = ["11:00", "13:00"];
const SLOT_DAYS = 4;
const SLOT_SEARCH_DAYS = 14;

export async function getBookingOptions(): Promise<BookingOption> {
  const db = getDatabase();

  const [packageRows, neighborhoodRows, weekdayRows] = await db.batch([
    db.select().from(groomingPackages),
    db
      .selectDistinct({ neighborhood: groomerServiceAreas.neighborhood })
      .from(groomerServiceAreas)
      .orderBy(groomerServiceAreas.neighborhood),
    db
      .selectDistinct({ weekday: groomerSchedules.weekday })
      .from(groomerSchedules)
      .innerJoin(groomers, eq(groomerSchedules.groomerId, groomers.id))
      .where(and(eq(groomers.active, true), eq(groomerSchedules.available, true))),
  ]);

  return {
    packages: packageRows,
    neighborhoods: neighborhoodRows.map((row) => row.neighborhood),
    availableSlots: upcomingSlots(
      new Date(),
      new Set(weekdayRows.map((row) => row.weekday)),
    ),
  };
}

// Offers fixed arrival times on the next days any groomer works. Starts from
// tomorrow (KST) so no slot is ever in the past.
function upcomingSlots(now: Date, workingWeekdays: Set<number>): BookingSlot[] {
  const today = kstDateKey(now);
  const slots: BookingSlot[] = [];
  let days = 0;

  for (let offset = 1; offset <= SLOT_SEARCH_DAYS && days < SLOT_DAYS; offset++) {
    const dateKey = addKstDays(today, offset);
    if (!workingWeekdays.has(kstParts(fromKst(dateKey, "00:00")).weekday)) continue;
    days++;
    for (const time of SLOT_TIMES) {
      slots.push({
        id: `slot-${dateKey}-${time.replace(":", "")}`,
        startsAt: fromKst(dateKey, time).toISOString(),
      });
    }
  }

  return slots;
}

export async function getAppointmentByReference(
  reference: string,
): Promise<AppointmentDetails | null> {
  const db = getDatabase();
  const rows = await db
    .select({
      appointment: appointments,
      groomer: groomers,
      groomingPackage: groomingPackages,
    })
    .from(appointments)
    .leftJoin(groomers, eq(appointments.groomerId, groomers.id))
    .innerJoin(
      groomingPackages,
      eq(appointments.packageId, groomingPackages.id),
    )
    .where(eq(appointments.bookingReference, reference))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    ...row.appointment,
    reference: row.appointment.bookingReference,
    pet: { name: row.appointment.petName, breed: row.appointment.petBreed },
    groomer: row.groomer,
    package: row.groomingPackage,
    startsAt: row.appointment.startsAt.toISOString(),
    endsAt: row.appointment.endsAt.toISOString(),
    createdAt: row.appointment.createdAt.toISOString(),
    updatedAt: row.appointment.updatedAt.toISOString(),
  };
}

export async function getAppointments(): Promise<AppointmentDetails[]> {
  const db = getDatabase();
  const rows = await db
    .select({
      appointment: appointments,
      groomer: groomers,
      groomingPackage: groomingPackages,
    })
    .from(appointments)
    .leftJoin(groomers, eq(appointments.groomerId, groomers.id))
    .innerJoin(groomingPackages, eq(appointments.packageId, groomingPackages.id))
    .orderBy(desc(appointments.startsAt));

  return rows.map((row) => ({
    ...row.appointment,
    reference: row.appointment.bookingReference,
    pet: { name: row.appointment.petName, breed: row.appointment.petBreed },
    groomer: row.groomer,
    package: row.groomingPackage,
    startsAt: row.appointment.startsAt.toISOString(),
    endsAt: row.appointment.endsAt.toISOString(),
    createdAt: row.appointment.createdAt.toISOString(),
    updatedAt: row.appointment.updatedAt.toISOString(),
  }));
}

export async function findAvailableGroomer(
  neighborhood: string,
  startsAt: Date,
  endsAt: Date,
): Promise<string | null> {
  const db = getDatabase();
  // Schedules are stored as KST weekdays and wall-clock times.
  const weekday = kstParts(startsAt).weekday;
  const requestedStart = kstTimeOfDay(startsAt);
  const requestedEnd = kstTimeOfDay(endsAt);

  const scheduledGroomers = await db
    .select({
      groomerId: groomers.id,
      startTime: groomerSchedules.startTime,
      endTime: groomerSchedules.endTime,
    })
    .from(groomers)
    .innerJoin(
      groomerServiceAreas,
      eq(groomerServiceAreas.groomerId, groomers.id),
    )
    .innerJoin(
      groomerSchedules,
      and(
        eq(groomerSchedules.groomerId, groomers.id),
        eq(groomerSchedules.weekday, weekday),
      ),
    )
    .where(
      and(
        eq(groomers.active, true),
        eq(groomerServiceAreas.neighborhood, neighborhood),
        eq(groomerSchedules.available, true),
      ),
    );

  const candidates = scheduledGroomers.filter(
    (groomer) =>
      groomer.startTime <= requestedStart && groomer.endTime >= requestedEnd,
  );
  if (candidates.length === 0) return null;

  const candidateIds = candidates.map((groomer) => groomer.groomerId);
  const conflictingAppointments = await db
    .select({ groomerId: appointments.groomerId })
    .from(appointments)
    .where(
      and(
        inArray(appointments.groomerId, candidateIds),
        lt(appointments.startsAt, endsAt),
        gt(appointments.endsAt, startsAt),
        ne(appointments.status, "cancelled"),
      ),
    );

  const busyGroomerIds = new Set(
    conflictingAppointments
      .map((appointment) => appointment.groomerId)
      .filter((groomerId): groomerId is string => Boolean(groomerId)),
  );

  return (
    candidates.find((groomer) => !busyGroomerIds.has(groomer.groomerId))
      ?.groomerId ?? null
  );
}
