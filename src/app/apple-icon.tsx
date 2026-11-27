import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Same mark as icon.svg: a W that reads as a price line, ink on Solana green.
export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width: 180, height: 180, display: "flex", background: "#14F195" }}>
      <svg width="180" height="180" viewBox="0 0 32 32">
        <path d="M6.5 10 L11 23 L16 14.5 L21 23 L25.5 10" fill="none" stroke="#07080d" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>,
    size,
  );
}
