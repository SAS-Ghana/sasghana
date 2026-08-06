import type { DataRow } from "./supabase-data";

function monthKey(date: Date) { return date.toISOString().slice(0, 7); }
function shiftMonths(date: Date, count: number) { return new Date(date.getFullYear(), date.getMonth() + count, 1); }

export type Trend = { direction: "up" | "down"; delta: string; caption: string };

/**
 * Compares how many rows fall in the current calendar month vs the previous one, using a date
 * field already present on already-fetched rows (no extra queries). Returns undefined when both
 * months are empty -- a StatCard should omit its trend line rather than show a fabricated "+0".
 */
export function monthDelta(rows: DataRow[], dateField: string, referenceDate = new Date()): Trend | undefined {
  const thisKey = monthKey(referenceDate);
  const lastKey = monthKey(shiftMonths(referenceDate, -1));
  const thisCount = rows.filter((row) => String(row[dateField] ?? "").slice(0, 7) === thisKey).length;
  const lastCount = rows.filter((row) => String(row[dateField] ?? "").slice(0, 7) === lastKey).length;
  if (thisCount === 0 && lastCount === 0) return undefined;
  const diff = thisCount - lastCount;
  return { direction: diff >= 0 ? "up" : "down", delta: `${diff >= 0 ? "+" : ""}${diff}`, caption: "vs last month" };
}

/** Buckets rows into calendar months (oldest to newest) by a date field, for bar/area chart series. */
export function monthlyBuckets(rows: DataRow[], dateField: string, monthsBack: number, referenceDate = new Date()) {
  const months = Array.from({ length: monthsBack }, (_, index) => shiftMonths(referenceDate, index - (monthsBack - 1)));
  const labels = months.map((date) => date.toLocaleDateString("en-GB", { month: "short" }));
  const values = months.map((date) => {
    const key = monthKey(date);
    return rows.filter((row) => String(row[dateField] ?? "").slice(0, 7) === key).length;
  });
  return { labels, values };
}

/** Running total per month (e.g. cumulative headcount from hire dates) rather than a per-month count. */
export function monthlyCumulative(rows: DataRow[], dateField: string, monthsBack: number, referenceDate = new Date()) {
  const { labels, values } = monthlyBuckets(rows, dateField, monthsBack, referenceDate);
  const priorCount = rows.filter((row) => String(row[dateField] ?? "") < monthKey(shiftMonths(referenceDate, -(monthsBack - 1)))).length;
  let running = priorCount;
  return { labels, values: values.map((count) => (running += count)) };
}

/** Top N distinct values of a field by row count, descending -- for donut/legend groupings. */
export function groupCounts(rows: DataRow[], field: string, maxGroups = 6) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = String(row[field] ?? "").trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxGroups);
}
