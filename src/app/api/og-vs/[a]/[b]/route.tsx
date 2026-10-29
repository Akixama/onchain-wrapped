// Share image for a head-to-head page: both names, the score, and the top rows.
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getJob } from "@/lib/store";
import { compareRows, compareScore } from "@/components/compare";

/** Money rows: green for a gain, red for a loss (same as the compare page). */
const toneColor = (t?: "gain" | "loss") => (t === "gain" ? "#6EE7B7" : t === "loss" ? "#F87171" : "#F6F2FF");
import { whoLabel } from "@/components/format";

const fontDir = join(process.cwd(), "assets", "fonts");
const [display, body, bodySemi] = await Promise.all([
  readFile(join(fontDir, "space-grotesk-latin-700-normal.woff")),
  readFile(join(fontDir, "inter-latin-400-normal.woff")),
  readFile(join(fontDir, "inter-latin-600-normal.woff")),
]);
const W = 1200, H = 630;

export async function GET(_req: Request, ctx: RouteContext<"/api/og-vs/[a]/[b]">) {
  const { a, b } = await ctx.params;
  const [ja, jb] = await Promise.all([getJob(a), getJob(b)]);
  const sa = ja?.stats, sb = jb?.stats;
  const rows = sa && sb ? compareRows(sa, sb).slice(0, 5) : [];
  const score = compareScore(sa && sb ? compareRows(sa, sb) : []);
  const nameA = sa ? whoLabel(sa) : "?", nameB = sb ? whoLabel(sb) : "?";
  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: "#0B0820", color: "#F6F2FF", fontFamily: "Inter", padding: "52px 64px", position: "relative" }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 700, height: 630, display: "flex", backgroundImage: "radial-gradient(circle at 10% 20%, rgba(124,58,237,0.5) 0%, rgba(124,58,237,0) 60%)" }} />
        <div style={{ position: "absolute", left: 600, top: 0, width: 600, height: 630, display: "flex", backgroundImage: "radial-gradient(circle at 90% 80%, rgba(20,241,149,0.35) 0%, rgba(20,241,149,0) 60%)" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, letterSpacing: 4, opacity: 0.75 }}>
          <div style={{ display: "flex" }}>HEAD TO HEAD</div>
          <div style={{ display: "flex", fontFamily: "SpaceGrotesk", letterSpacing: 0, fontSize: 28 }}>onchain<span style={{ opacity: 0.6 }}>wrapped</span></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 30 }}>
          <div style={{ display: "flex", fontFamily: "SpaceGrotesk", fontSize: 48, width: 420, color: score.a > score.b ? "#6EE7B7" : "#F6F2FF" }}>{nameA}</div>
          <div style={{ display: "flex", fontFamily: "SpaceGrotesk", fontSize: 96 }}>{`${score.a}–${score.b}`}</div>
          <div style={{ display: "flex", justifyContent: "flex-end", fontFamily: "SpaceGrotesk", fontSize: 48, width: 420, color: score.b > score.a ? "#6EE7B7" : "#F6F2FF" }}>{nameB}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 26, gap: 10 }}>
          {rows.map((r) => (
            <div key={r.label} style={{ display: "flex", alignItems: "center", fontSize: 28, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 10 }}>
              <div style={{ display: "flex", width: 430, justifyContent: "flex-end", fontWeight: 600, color: toneColor(r.toneA), opacity: r.winner === "a" ? 1 : 0.6 }}>{r.a}{r.winner === "a" && <span style={{ color: "#FCD34D" }}>&nbsp;◂</span>}</div>
              <div style={{ display: "flex", width: 212, justifyContent: "center", fontSize: 18, letterSpacing: 2, opacity: 0.6 }}>{r.label.toUpperCase()}</div>
              <div style={{ display: "flex", width: 430, fontWeight: 600, color: toneColor(r.toneB), opacity: r.winner === "b" ? 1 : 0.6 }}>{r.winner === "b" && <span style={{ color: "#FCD34D" }}>▸&nbsp;</span>}{r.b}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    {
      width: W, height: H,
      fonts: [
        { name: "SpaceGrotesk", data: display, weight: 700, style: "normal" },
        { name: "Inter", data: body, weight: 400, style: "normal" },
        { name: "Inter", data: bodySemi, weight: 600, style: "normal" },
      ],
      headers: { "cache-control": "public, max-age=600" },
    },
  );
}
