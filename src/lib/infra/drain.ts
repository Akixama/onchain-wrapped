// Helpers for work that may need to stop at a deadline and carry on in a later run.

export const timeUp = (deadline?: number) => !!deadline && Date.now() >= deadline;

/**
 * Work through `queue` with `workers` in parallel until it's empty or the deadline passes.
 * Items already started finish; whatever wasn't started is returned for the next run.
 * `work` should handle its own errors (a throw only drops that one item).
 */
export async function drain<T>(queue: T[], workers: number, deadline: number | undefined, work: (x: T) => Promise<void>): Promise<T[]> {
  const q = [...queue];
  await Promise.all(Array.from({ length: Math.max(1, workers) }, async () => {
    while (q.length && !timeUp(deadline)) {
      const x = q.shift()!;
      try { await work(x); } catch { /* dropped */ }
    }
  }));
  return q;
}
