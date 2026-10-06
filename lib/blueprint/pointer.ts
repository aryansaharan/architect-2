/**
 * Minimal JSON Pointer (RFC 6901) helpers used to apply change proposals.
 * Paths look like "/screens/0/regions/main/1/columns". "-" appends to arrays.
 */
type Json = unknown;

function decode(seg: string) {
  return seg.replace(/~1/g, "/").replace(/~0/g, "~");
}

export function splitPointer(path: string): string[] {
  if (path === "" || path === "/") return [];
  if (!path.startsWith("/")) throw new Error(`Invalid pointer "${path}"`);
  return path.slice(1).split("/").map(decode);
}

function parentOf(doc: Json, path: string): { parent: Json; key: string } {
  const segs = splitPointer(path);
  if (!segs.length) throw new Error("Cannot modify the document root");
  const key = segs.pop()!;
  let parent: Json = doc;
  for (const seg of segs) {
    if (parent === null || typeof parent !== "object") throw new Error(`Path not found: ${path}`);
    parent = Array.isArray(parent) ? parent[Number(seg)] : (parent as Record<string, Json>)[seg];
  }
  if (parent === null || typeof parent !== "object") throw new Error(`Path not found: ${path}`);
  return { parent, key };
}

export function applyOperation(doc: Json, op: { op: "set" | "add" | "remove"; path: string; value?: Json }) {
  const { parent, key } = parentOf(doc, op.path);
  if (Array.isArray(parent)) {
    const idx = key === "-" ? parent.length : Number(key);
    if (!Number.isInteger(idx) || idx < 0 || idx > parent.length) throw new Error(`Bad index in ${op.path}`);
    if (op.op === "remove") parent.splice(idx, 1);
    else if (op.op === "add") parent.splice(idx, 0, op.value);
    else parent[idx] = op.value;
    return;
  }
  const obj = parent as Record<string, Json>;
  if (op.op === "remove") delete obj[key];
  else obj[key] = op.value;
}
