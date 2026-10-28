// Math.min(...xs) / push(...xs) throw "Maximum call stack size exceeded" past ~100k items
// (a busy wallet's full year has more). These work at any size.
export function minOf(xs: Iterable<number>, start = Infinity): number {
  let m = start;
  for (const x of xs) if (x < m) m = x;
  return m;
}
export function maxOf(xs: Iterable<number>, start = -Infinity): number {
  let m = start;
  for (const x of xs) if (x > m) m = x;
  return m;
}
export function pushAll<T>(into: T[], items: readonly T[]): T[] {
  for (const x of items) into.push(x);
  return into;
}
