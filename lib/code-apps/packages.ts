/**
 * The packages a code app may import, and where the browser loads them from (esm.sh, versions pinned).
 * Anything else fails the build with a plain message listing these, which the repair loop can act on.
 * React is shared through the import map, so every package uses the same copy.
 */
const REACT = "19.2.0";

export const PACKAGES: Record<string, { url: string; what: string }> = {
  react: { url: `https://esm.sh/react@${REACT}`, what: "React" },
  "react/jsx-runtime": { url: `https://esm.sh/react@${REACT}/jsx-runtime`, what: "React's JSX runtime" },
  "react-dom": { url: `https://esm.sh/react-dom@${REACT}?external=react`, what: "React DOM" },
  "react-dom/client": { url: `https://esm.sh/react-dom@${REACT}/client?external=react`, what: "React DOM client" },
  "lucide-react": { url: "https://esm.sh/lucide-react@0.511.0?external=react", what: "icons" },
  motion: { url: "https://esm.sh/motion@12.23.0?external=react,react-dom", what: "animation" },
  "motion/react": { url: "https://esm.sh/motion@12.23.0/react?external=react,react-dom", what: "animation for React" },
  recharts: { url: "https://esm.sh/recharts@2.15.4?external=react,react-dom", what: "charts" },
  "date-fns": { url: "https://esm.sh/date-fns@4.1.0", what: "dates" },
  "canvas-confetti": { url: "https://esm.sh/canvas-confetti@1.9.3", what: "confetti" },
  zustand: { url: "https://esm.sh/zustand@5.0.6?external=react", what: "state" },
  clsx: { url: "https://esm.sh/clsx@2.1.1", what: "class names" },
  three: { url: "https://esm.sh/three@0.178.0", what: "3D" },
};

export const isAllowedPackage = (spec: string) => Object.prototype.hasOwnProperty.call(PACKAGES, spec);

/** The import map every sandbox page carries. */
export function importMap(): string {
  return JSON.stringify({ imports: Object.fromEntries(Object.entries(PACKAGES).map(([k, v]) => [k, v.url])) });
}

/** For prompts and error messages: "react, lucide-react (icons), ...". */
export const PACKAGE_LIST = Object.entries(PACKAGES)
  .filter(([k]) => !k.includes("/") || k === "motion/react" || k === "react-dom/client")
  .map(([k, v]) => `${k} (${v.what})`)
  .join(", ");

/** Origins the sandbox may load code, styles and fonts from (its own CSP). */
export const SANDBOX_ORIGINS = { scripts: ["https://esm.sh", "https://cdn.jsdelivr.net"], styles: ["https://fonts.googleapis.com"], fonts: ["https://fonts.gstatic.com"] } as const;

/** Tailwind's browser build: utility classes work in generated apps without a CSS build step. */
export const TAILWIND_BROWSER = "https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.1.11";
