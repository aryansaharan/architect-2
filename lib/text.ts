/** House style: no em dashes anywhere, including in what the model writes. */
export const STYLE_RULE = "Writing style: never use em dashes (the \u2014 character). Use commas, colons, periods or parentheses instead.";

export function noEmDash(s: string): string {
  if (!s.includes("\u2014")) return s;
  return s.replace(/\s*\u2014\s*/g, ", ").replace(/^, /, "").replace(/, ([.,;:!?])/g, "$1");
}

/** Deep-clean every string in model output before it is shown or saved. */
export function cleanDeep<T>(v: T): T {
  if (typeof v === "string") return noEmDash(v) as T;
  if (Array.isArray(v)) return v.map(cleanDeep) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cleanDeep(x)])) as T;
  return v;
}
