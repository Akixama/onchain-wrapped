// Ask a saved result every starter question (free answers from the numbers).
//   node --env-file=.env.local --import tsx scripts/ask-test.mts <job id> ["extra question" ...]
import { numbersAnswer, SUGGESTED } from "../src/lib/ask";
import { getJob } from "../src/lib/store";
const [id, ...extra] = process.argv.slice(2);
const s = (await getJob(id))?.stats;
if (!s) throw new Error("no result");
for (const q of [...SUGGESTED, ...extra]) console.log(`Q: ${q}\nA: ${numbersAnswer(s, q)}\n`);
process.exit(0);
