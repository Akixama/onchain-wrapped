// Print the quiz for saved results (checks every question has one right answer among 4 distinct options).
//   node --env-file=.env.local --import tsx scripts/quiz-preview.mts <job id> [...]
import { buildQuiz } from "../src/components/quiz";
import { getJob } from "../src/lib/store";
for (const id of process.argv.slice(2)) {
  const s = (await getJob(id))?.stats;
  if (!s) { console.log(id, "no result"); continue; }
  const qs = buildQuiz(s, id);
  console.log(`\n== ${id}: ${qs.length} questions`);
  for (const q of qs) {
    const ok = q.options.length === 4 && new Set(q.options).size === 4 && q.answer >= 0;
    console.log(`${ok ? "ok " : "BAD"} ${q.q}\n    ${q.options.map((o, k) => (k === q.answer ? `[${o}]` : o)).join(" | ")}\n    → ${q.reveal}`);
  }
}
process.exit(0);
