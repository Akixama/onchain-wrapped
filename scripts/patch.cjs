// Apply exact-text edits: node scripts/patch.cjs <edits.cjs>  — edits.cjs exports [[file, [[old,new],...]], ...]
const fs = require("fs");
for (const [f, pairs] of require(require("path").resolve(process.argv[2]))) {
  let s = fs.readFileSync(f, "utf8"); const crlf = s.includes("\r\n"); s = s.replace(/\r\n/g, "\n");
  for (const [a, b] of pairs) { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`${f}: expected 1 match, got ${n}: ${a.slice(0, 70)}`); s = s.replace(a, () => b); }
  fs.writeFileSync(f, crlf ? s.replace(/\n/g, "\r\n") : s); console.log("patched", f, pairs.length);
}
