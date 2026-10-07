import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/** The browser talks to Supabase directly (sign-in, the session), over https and websockets. */
const supabase = (() => {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return `${url.origin} ${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`;
  } catch {
    return "";
  }
})();

// No nonces, so pages stay static and cacheable. React only needs 'unsafe-eval' in development (for its error overlay),
// and Vercel Analytics loads its debug script from its own origin only in development.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval' https://va.vercel-scripts.com" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabase}`.trim(),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

/** Routes that run esbuild (real builds of business apps and code apps, and a code app's rollback, which rebuilds it). */
const ESBUILD_ROUTES = ["/api/build/**", "/api/code-apps/**", "/api/plan", "/p/**"];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // esbuild runs its own native binary, so it is required at run time rather than bundled.
  serverExternalPackages: ["esbuild"],
  // The binary sits in a platform package (@esbuild/linux-x64 on Vercel) that esbuild finds at run time, out of the tracer's sight.
  outputFileTracingIncludes: Object.fromEntries(ESBUILD_ROUTES.map((r) => [r, ["./node_modules/esbuild/**/*", "./node_modules/@esbuild/**/*"]])),
  // Browsers ask for /favicon.ico on their own; the icon is app/icon.svg.
  async redirects() {
    return [{ source: "/favicon.ico", destination: "/icon.svg", permanent: true }];
  },
  // Vercel adds Strict-Transport-Security on its own domains; these cover everything else.
  async headers() {
    return [
      {
        // Everything but /run: a code app's sandbox pages send their own, stricter policy (lib/code-apps/sandbox-html.ts).
        source: "/:path((?!run/).*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
