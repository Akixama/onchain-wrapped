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

/**
 * `drain` for batches that can fail: a batch that throws is retried after the rest, split in half each
 * time (smaller requests get through when a provider is struggling), up to `passes` rounds. `work` may
 * also return items the provider answered without (those count as failed). Returns everything still
 * not done: unstarted batches plus ones that kept failing. Nothing is silently dropped.
 */
export async function drainBatches<T>(
  batches: T[][], workers: number, deadline: number | undefined, work: (b: T[]) => Promise<T[] | void>, passes = 3, minSize = 10,
): Promise<{ left: T[][]; failed: T[] }> {
  let todo = batches;
  let failed: T[][] = [];
  for (let pass = 0; pass < passes && todo.length; pass++) {
    failed = [];
    const left = await drain(todo, workers, deadline, async (b) => {
      try {
        const missing = await work(b);
        if (missing && missing.length) failed.push(missing);
      } catch { failed.push(b); }
    });
    if (left.length) return { left: [...left, ...failed], failed: [] }; // out of time: all of it waits for the next run
    todo = failed.flatMap((b) => (b.length > minSize ? [b.slice(0, Math.ceil(b.length / 2)), b.slice(Math.ceil(b.length / 2))] : [b]));
  }
  return { left: [], failed: todo.flat() };
}
