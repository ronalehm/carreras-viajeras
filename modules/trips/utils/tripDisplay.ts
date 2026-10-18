// Pure formatting for the trip contract, with no server-only code of its own. Outside the module it is
// imported only from Server Components through @/modules/trips, whose index also re-exports server-only code.

// Trip dates are calendar dates (YYYY-MM-DD) without time zone; formatting in UTC keeps the day fixed.
const tripDateFormat = new Intl.DateTimeFormat("es", { dateStyle: "long", timeZone: "UTC" });

// Built by hand: no Intl locale yields exactly "US$ 1,990", and this output does not depend on the runtime ICU data.
const usdAmountFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function toUtcDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function formatTripDate(date: string): string {
  return tripDateFormat.format(toUtcDate(date));
}

export function formatTripDateRange(start: string, end: string): string {
  return tripDateFormat.formatRange(toUtcDate(start), toUtcDate(end));
}

export function formatTripPrice(priceUsd: number | null): string {
  if (priceUsd === null) return "Precio a consultar";
  return `US$ ${usdAmountFormat.format(priceUsd)}`;
}
