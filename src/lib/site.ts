/**
 * Public base URL, for absolute share links and OG image URLs.
 * NEXT_PUBLIC_SITE_URL wins (custom domain); on Vercel we fall back to the project's production URL.
 */
export const siteUrl = () =>
  (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")
  ).replace(/\/$/, "");
