"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, CalendarDays, Check, ChevronLeft, ChevronRight, Search, Sparkles, Upload } from "lucide-react";
import { sortPhrase, sortRows, type Action, type Block, type Blueprint, type Entity } from "@/lib/blueprint/schema";
import { formatValue } from "@/lib/format";
import { cn } from "@/lib/utils";
import { enumTone, useApp } from "./app-context";
import { ChatBlockView } from "./chat-block";
import { deriveKpi, screenEntityId } from "./kpi";

const primaryBtn = "inline-flex h-8 items-center gap-1.5 rounded-[var(--app-radius)] px-3 text-[13px] font-medium text-white shadow-sm transition-opacity hover:opacity-90";
const secondaryBtn = "inline-flex h-8 items-center gap-1.5 rounded-[var(--app-radius)] border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 shadow-sm hover:bg-slate-50";

export function Card({ title, children, className, right }: { title?: string; children: React.ReactNode; className?: string; right?: React.ReactNode }) {
  return (
    <section className={cn("rounded-[calc(var(--app-radius)+4px)] border border-slate-200 bg-white shadow-[0_1px_2px_rgb(15_23_42/0.04)]", className)}>
      {(title || right) && (
        // Wraps instead of overflowing, so filters and search never push a narrow card (phone, side column) wider than its frame.
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-100 px-4 py-3">
          {title && <h3 className="min-w-0 text-[14px] font-semibold text-slate-900">{title}</h3>}
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">{right}</div>
        </header>
      )}
      {children}
    </section>
  );
}

function useRunAction() {
  const app = useApp();
  return (a: Action | undefined, rowIndex?: number, entityId?: string) => {
    if (!a) return;
    if (entityId !== undefined && rowIndex !== undefined) app.selectRow(entityId, rowIndex);
    if (a.kind === "navigate") app.navigate(a.screenId);
    else if (a.kind === "toast") app.toast(a.message);
    else if (a.kind === "agent") app.askAgent(a.agentId, a.prompt);
    else if (a.kind === "openDetail") {
      const detail = detailScreen(app.bp, a.entityId);
      if (detail) app.navigate(detail.id);
    }
  };
}

const detailScreen = (bp: Blueprint, entityId: string) => bp.screens.find((s) => [...s.regions.main, ...s.regions.side].some((b) => b.type === "detail" && b.entityId === entityId));

/** Whether clicking would do anything: rows only look clickable when it would (an "open" with no detail screen does nothing). */
const canRun = (bp: Blueprint, a: Action | undefined) => Boolean(a) && (a!.kind !== "openDetail" || Boolean(detailScreen(bp, a!.entityId)));

function Value({ entity, field, value }: { entity: Entity | undefined; field: string; value: unknown }) {
  const f = entity?.fields.find((x) => x.name === field);
  if (f?.type === "enum" && typeof value === "string")
    return <span className={cn("inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full px-2 text-[11.5px] font-medium ring-1 ring-inset", enumTone(value, f.options))}>{value}</span>;
  if (f?.type === "number" && typeof value === "number" && value >= 0 && value <= 1 && /score|risk|confidence|probab/i.test(field)) {
    const tone = value >= 0.6 ? "bg-rose-500" : value >= 0.3 ? "bg-amber-500" : "bg-emerald-500";
    return (
      <span className="inline-flex items-center gap-2">
        <span className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-100"><span className={cn("block h-full rounded-full", tone)} style={{ width: `${Math.max(4, value * 100)}%` }} /></span>
        <span className="tabular-nums text-slate-600">{value.toFixed(2)}</span>
      </span>
    );
  }
  const s = formatValue(value, f?.type);
  return <span className={cn(f?.type === "money" || f?.type === "number" ? "tabular-nums" : "", f?.type === "text" && "line-clamp-1")}>{s}</span>;
}

export function KpisBlock({ block }: { block: Extract<Block, { type: "kpis" }> }) {
  const app = useApp();
  // Numbers that can be read from the rows on this screen are counted from them, so tiles and tables agree.
  const entityId = screenEntityId(app.bp, app.screenId);
  const items = useMemo(() => block.items.map((k) => ({ ...k, ...deriveKpi(k, app.bp, entityId) })), [block.items, app.bp, entityId]);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [.app-phone_&]:grid-cols-2">
      {items.map((k, i) => (
        <div key={i} className="rounded-[calc(var(--app-radius)+4px)] border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgb(15_23_42/0.04)]">
          <p className="text-[12.5px] text-slate-500">{k.label}</p>
          <p className="mt-1.5 text-[22px] font-semibold tracking-tight text-slate-900 tabular-nums" title={k.derived ? "Counted from the records in this app" : undefined}>{k.value}</p>
          {k.delta && <p className={cn("mt-0.5 text-[12px]", k.tone === "good" ? "text-emerald-600" : k.tone === "bad" ? "text-rose-600" : "text-slate-500")}>{k.delta}</p>}
          {!k.delta && k.tone === "bad" && !k.zero && <p className="mt-0.5 text-[12px] text-rose-600">Needs attention</p>}
        </div>
      ))}
    </div>
  );
}

/**
 * Horizontal scroller with fading edges while there is more to see, so a clipped column never looks like the end.
 * `min-w-0 max-w-full` keeps it inside any frame (phone, tablet, a narrow side column): the table scrolls, it never
 * pushes its parent wider or gets cut off. It is focusable, so keyboard users can scroll it with the arrow keys.
 */
function ScrollX({ children, label, onOverflow, scrollRef }: { children: React.ReactNode; label: string; onOverflow?: (more: boolean) => void; scrollRef?: React.RefObject<HTMLDivElement | null> }) {
  const own = useRef<HTMLDivElement>(null);
  const ref = scrollRef ?? own;
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const left = el.scrollLeft > 2;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
      setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [ref]);
  useEffect(() => onOverflow?.(edges.right), [edges.right, onOverflow]);
  return (
    <div className="relative min-w-0 max-w-full">
      <div ref={ref} role="region" aria-label={label} tabIndex={edges.left || edges.right ? 0 : -1} className="w-full max-w-full overflow-x-auto overscroll-x-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-300">
        {children}
      </div>
      <div aria-hidden className={cn("pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white to-transparent transition-opacity duration-200", edges.left ? "opacity-100" : "opacity-0")} />
      <div aria-hidden className={cn("pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-white via-white/70 to-transparent transition-opacity duration-200", edges.right ? "opacity-100" : "opacity-0")} />
    </div>
  );
}

export function TableBlock({ block }: { block: Extract<Block, { type: "table" }> }) {
  const app = useApp();
  const run = useRunAction();
  const entity = app.entity(block.entityId);
  const clickable = canRun(app.bp, block.rowAction);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  // The table opens in the order the blueprint sets (block.sort); clicking a header re-sorts it for this person only.
  // A click belongs to the order it was made against, so when the blueprint's order changes, that order shows again.
  const basis = JSON.stringify(block.sort ?? null);
  const [picked, setPicked] = useState<{ col: string; dir: "asc" | "desc"; basis: string } | null>(null);
  const sort = picked && picked.basis === basis ? picked : block.sort ? { col: block.sort.column, dir: block.sort.dir } : null;
  const byDefault = Boolean(block.sort) && sort?.col === block.sort?.column && sort?.dir === block.sort?.dir;
  const [page, setPage] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const field = (c: string) => entity?.fields.find((f) => f.name === c);
  // Enum columns rank by the blueprint's order when it has one, otherwise by the options as authored (Low, Medium, High).
  const rankFor = (c: string) => (c === block.sort?.column && block.sort.order?.length ? block.sort.order : field(c)?.type === "enum" ? field(c)?.options : undefined);
  const sortCol = sort?.col;
  const sortDir = sort?.dir ?? "asc";
  const sortOrder = sortCol ? rankFor(sortCol) : undefined;
  // Sample data is at most 12 rows, so this is cheap enough to work out on every render.
  let rows = (entity?.sample ?? []).map((row, i) => ({ row, i }));
  if (q) rows = rows.filter(({ row }) => Object.values(row).some((v) => String(v).toLowerCase().includes(q.toLowerCase())));
  for (const [k, v] of Object.entries(filters)) if (v) rows = rows.filter(({ row }) => String(row[k]) === v);
  if (sortCol) rows = sortRows(rows, ({ row }) => row[sortCol], { dir: sortDir, order: sortOrder });
  const pages = Math.max(1, Math.ceil(rows.length / block.pageSize));
  const view = rows.slice(page * block.pageSize, (page + 1) * block.pageSize);
  const label = (c: string) => field(c)?.label ?? c;
  const [moreRight, setMoreRight] = useState(false);
  const title = block.title ?? entity?.plural ?? "Table";

  return (
    <Card
      className="min-w-0 max-w-full"
      title={title}
      right={
        <>
          {block.filters.map((f) => (
            <select key={f} aria-label={`Filter by ${label(f)}`} value={filters[f] ?? ""} onChange={(e) => { setFilters((s) => ({ ...s, [f]: e.target.value })); setPage(0); }} className="h-8 min-w-0 max-w-[12rem] rounded-[var(--app-radius)] border border-slate-200 bg-white px-2 text-[12.5px] text-slate-700 [.app-phone_&]:hidden">
              <option value="">All {label(f).toLowerCase()}</option>
              {(field(f)?.options ?? [...new Set(entity?.sample.map((r) => String(r[f])))]).map((o) => <option key={o}>{o}</option>)}
            </select>
          ))}
          <label className="flex h-8 min-w-0 items-center gap-1.5 rounded-[var(--app-radius)] border border-slate-200 bg-white px-2 text-slate-400">
            <Search className="size-3.5 shrink-0" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search" aria-label={`Search ${title.toLowerCase()}`} className="w-24 min-w-0 bg-transparent text-[12.5px] text-slate-700 outline-none placeholder:text-slate-400" />
          </label>
        </>
      }
    >
      <ScrollX label={title} onOverflow={setMoreRight} scrollRef={scroller}>
        {/* min-w-max: columns keep their natural width and the scroller takes the overflow, so none is ever squeezed or cut off. */}
        <table className="w-full min-w-max text-left text-[13px]">
          <thead>
            <tr className="border-b border-slate-100 text-[12px] text-slate-500">
              {block.columns.map((c) => (
                <th key={c} aria-sort={sort?.col === c ? (sort.dir === "asc" ? "ascending" : "descending") : undefined} className="whitespace-nowrap px-4 py-2.5 font-medium">
                  <button
                    className={cn("inline-flex items-center gap-1 hover:text-slate-900", sort?.col === c && "text-slate-900")}
                    onClick={() => {
                      setPicked({ col: c, dir: sort?.col === c && sort.dir === "asc" ? "desc" : "asc", basis });
                      setPage(0);
                    }}
                  >
                    {label(c)}
                    {sort?.col === c && (sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map(({ row, i }) => (
              <tr key={i} onClick={clickable ? () => run(block.rowAction, i, block.entityId) : undefined} className={cn("border-b border-slate-50 text-slate-700 last:border-0", clickable && "cursor-pointer hover:bg-slate-50")}>
                {block.columns.map((c, ci) => (
                  <td key={c} className={cn("whitespace-nowrap px-4 py-2.5", ci === 0 && "font-medium text-slate-900")}>
                    <Value entity={entity} field={c} value={row[c]} />
                  </td>
                ))}
              </tr>
            ))}
            {view.length === 0 && (
              <tr><td colSpan={block.columns.length} className="px-4 py-10 text-center text-[13px] text-slate-400">No {entity?.plural.toLowerCase()} match.</td></tr>
            )}
          </tbody>
        </table>
      </ScrollX>
      <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-slate-100 px-4 py-2 text-[12px] text-slate-500">
        <span>{rows.length} {rows.length === 1 ? entity?.name.toLowerCase() : entity?.plural.toLowerCase()}</span>
        {byDefault && sortCol && (
          <span className="inline-flex items-center gap-1 text-slate-400" title={sortOrder?.length ? `Order: ${(sortDir === "desc" ? [...sortOrder].reverse() : sortOrder).join(", ")}` : undefined}>
            {sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
            Sorted by {label(sortCol)}, {sortPhrase({ dir: sortDir, order: sortOrder }, field(sortCol)?.type)}
          </span>
        )}
        {moreRight && (
          <button type="button" onClick={() => scroller.current?.scrollBy({ left: Math.max(120, scroller.current.clientWidth * 0.7), behavior: "smooth" })} className="mr-auto inline-flex items-center gap-1 text-slate-400 hover:text-slate-700">
            More columns <ArrowRight className="size-3" />
          </button>
        )}
        {pages > 1 && (
          <span className="flex items-center gap-1">
            <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded p-1 disabled:opacity-30" aria-label="Previous page"><ChevronLeft className="size-3.5" /></button>
            {page + 1} / {pages}
            <button disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} className="rounded p-1 disabled:opacity-30" aria-label="Next page"><ChevronRight className="size-3.5" /></button>
          </span>
        )}
      </footer>
    </Card>
  );
}

export function ListBlock({ block }: { block: Extract<Block, { type: "list" }> }) {
  const app = useApp();
  const run = useRunAction();
  const entity = app.entity(block.entityId);
  const clickable = canRun(app.bp, block.onSelect);
  return (
    <Card title={block.title ?? entity?.plural}>
      <ul className="divide-y divide-slate-100">
        {(entity?.sample ?? []).slice(0, 8).map((row, i) => {
          const title = String(row[block.titleField] ?? "");
          // A plain row when selecting does nothing, so it isn't focusable or styled like a button.
          const Row = clickable ? "button" : "div";
          return (
            <li key={i}>
              <Row {...(clickable ? { type: "button" as const, onClick: () => run(block.onSelect, i, block.entityId) } : {})} className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left", clickable && "hover:bg-slate-50")}>
                <span className="grid size-8 shrink-0 place-items-center rounded-full text-[12px] font-semibold" style={{ background: "color-mix(in oklab, var(--app-primary) 12%, white)", color: "var(--app-primary)" }}>
                  {title.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-slate-900">{title}</span>
                  {block.subtitleField && <span className="block truncate text-[12px] text-slate-500"><Value entity={entity} field={block.subtitleField} value={row[block.subtitleField]} /></span>}
                </span>
                {block.badgeField && <span className="shrink-0 whitespace-nowrap text-[12.5px] text-slate-600"><Value entity={entity} field={block.badgeField} value={row[block.badgeField]} /></span>}
              </Row>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function DetailBlock({ block }: { block: Extract<Block, { type: "detail" }> }) {
  const app = useApp();
  const run = useRunAction();
  const entity = app.entity(block.entityId);
  const idx = app.selectedRow[block.entityId] ?? 0;
  const row = entity?.sample[idx] ?? entity?.sample[0] ?? {};
  const [first, ...rest] = block.fields;
  const long = rest.filter((f) => entity?.fields.find((x) => x.name === f)?.type === "text");
  const short = rest.filter((f) => !long.includes(f));
  return (
    <Card>
      <div className="flex flex-wrap items-start gap-3 border-b border-slate-100 px-4 py-4">
        <div className="min-w-0">
          <p className="text-[12px] text-slate-500">{block.title ?? entity?.name}</p>
          <p className="text-[18px] font-semibold tracking-tight text-slate-900">{String(row[first] ?? "Untitled")}</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {block.actions.map((a, i) => (
            <button key={i} onClick={() => run(a.action)} className={a.variant === "primary" ? primaryBtn : secondaryBtn} style={a.variant === "primary" ? { background: "var(--app-primary)" } : undefined}>
              {a.action.kind === "agent" && <Sparkles className="size-3.5" />}
              {a.label}
            </button>
          ))}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-4 py-4 md:grid-cols-3 [.app-phone_&]:grid-cols-1">
        {short.map((f) => (
          <div key={f}>
            <dt className="text-[12px] text-slate-500">{entity?.fields.find((x) => x.name === f)?.label ?? f}</dt>
            <dd className="mt-1 text-[13.5px] text-slate-900"><Value entity={entity} field={f} value={row[f]} /></dd>
          </div>
        ))}
      </dl>
      {long.map((f) => (
        <div key={f} className="border-t border-slate-100 px-4 py-3">
          <p className="text-[12px] text-slate-500">{entity?.fields.find((x) => x.name === f)?.label ?? f}</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-slate-700">{String(row[f] ?? "Not set")}</p>
        </div>
      ))}
      {entity && entity.sample.length > 1 && (
        <footer className="flex items-center gap-2 border-t border-slate-100 px-4 py-2 text-[12px] text-slate-500">
          <button onClick={() => app.selectRow(block.entityId, (idx - 1 + entity.sample.length) % entity.sample.length)} className="rounded p-1 hover:bg-slate-100" aria-label="Previous record"><ChevronLeft className="size-3.5" /></button>
          {idx + 1} of {entity.sample.length}
          <button onClick={() => app.selectRow(block.entityId, (idx + 1) % entity.sample.length)} className="rounded p-1 hover:bg-slate-100" aria-label="Next record"><ChevronRight className="size-3.5" /></button>
        </footer>
      )}
    </Card>
  );
}

type FormField = Extract<Block, { type: "form" }>["fields"][number];

const isFilled = (v: string | boolean | undefined) => (typeof v === "boolean" ? v : Boolean(v?.trim()));

function fieldError(f: FormField, v: string | boolean | undefined): string | null {
  if (f.required && !isFilled(v)) return f.kind === "select" ? "Choose one." : f.kind === "file" ? "Add a file." : f.kind === "toggle" ? "Tick this to continue." : "Fill this in.";
  if (f.kind === "number" && typeof v === "string" && v.trim() && !Number.isFinite(Number(v))) return "Enter a number.";
  return null;
}

export function FormBlock({ block }: { block: Extract<Block, { type: "form" }> }) {
  const run = useRunAction();
  const [sent, setSent] = useState(false);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const fid = (name: string) => `f-${block.id}-${name}`;
  const set = (name: string, v: string | boolean) => {
    setValues((s) => ({ ...s, [name]: v }));
    setErrors((s) => {
      if (!(name in s)) return s;
      const next = { ...s };
      delete next[name];
      return next;
    });
    setFormError(null);
  };
  const inputCls = (name: string) => cn("w-full rounded-[var(--app-radius)] border px-3 text-[13.5px] text-slate-900 outline-none", errors[name] ? "border-rose-400 focus:border-rose-500" : "border-slate-200 focus:border-slate-400");
  const a11y = (name: string) => (errors[name] ? { "aria-invalid": true, "aria-describedby": `${fid(name)}-err` } : {});

  return (
    <Card title={block.title}>
      {sent ? (
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <span className="grid size-10 place-items-center rounded-full text-white" style={{ background: "var(--app-primary)" }}><Check className="size-5" /></span>
          <p className="mt-3 text-[15px] font-semibold text-slate-900">Thanks, we&apos;ve got it.</p>
          <button onClick={() => { setSent(false); setValues({}); }} className="mt-4 text-[12.5px] text-slate-500 underline underline-offset-4">Submit another</button>
        </div>
      ) : (
        <form
          noValidate
          className="space-y-4 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const next: Record<string, string> = {};
            for (const f of block.fields) {
              const err = fieldError(f, values[f.name]);
              if (err) next[f.name] = err;
            }
            const invalid = block.fields.find((f) => next[f.name]);
            if (invalid) {
              setErrors(next);
              setFormError(null);
              document.getElementById(fid(invalid.name))?.focus();
              return;
            }
            // A form with no required fields still needs something in it before it counts as sent.
            if (!block.fields.some((f) => isFilled(values[f.name]))) {
              setFormError("Fill in at least one field first.");
              return;
            }
            setSent(true);
            run(block.onSubmit);
          }}
        >
          {block.fields.map((f) => {
            const v = values[f.name];
            return (
              <div key={f.name}>
                <label className="text-[13px] font-medium text-slate-700" htmlFor={fid(f.name)}>
                  {f.label}
                  {f.required && <span className="text-rose-500" aria-hidden> *</span>}
                  {f.required && <span className="sr-only"> (required)</span>}
                </label>
                <div className="mt-1.5">
                  {f.kind === "textarea" ? (
                    <textarea id={fid(f.name)} rows={3} value={typeof v === "string" ? v : ""} onChange={(e) => set(f.name, e.target.value)} className={cn(inputCls(f.name), "py-2")} {...a11y(f.name)} />
                  ) : f.kind === "select" ? (
                    <select id={fid(f.name)} value={typeof v === "string" ? v : ""} onChange={(e) => set(f.name, e.target.value)} className={cn(inputCls(f.name), "h-9 bg-white px-2.5", !v && "text-slate-400")} {...a11y(f.name)}>
                      <option value="" disabled={f.required}>Choose…</option>
                      {(f.options ?? []).map((o) => <option key={o} className="text-slate-900">{o}</option>)}
                    </select>
                  ) : f.kind === "toggle" ? (
                    <input id={fid(f.name)} type="checkbox" checked={v === true} onChange={(e) => set(f.name, e.target.checked)} className="size-4 accent-[var(--app-primary)]" {...a11y(f.name)} />
                  ) : f.kind === "file" ? (
                    <label htmlFor={fid(f.name)} className={cn("flex cursor-pointer items-center gap-2 rounded-[var(--app-radius)] border border-dashed px-3 py-3 text-[12.5px] focus-within:border-slate-400", errors[f.name] ? "border-rose-400 text-rose-600" : "border-slate-300 text-slate-500")}>
                      <Upload className="size-4 shrink-0" />
                      <span className="truncate">{typeof v === "string" && v ? v : "Drop files or click to upload"}</span>
                      <input id={fid(f.name)} type="file" multiple className="sr-only" onChange={(e) => set(f.name, [...(e.target.files ?? [])].map((x) => x.name).join(", "))} {...a11y(f.name)} />
                    </label>
                  ) : (
                    <div className="relative">
                      <input id={fid(f.name)} type={f.kind === "number" ? "number" : f.kind === "date" ? "date" : "text"} value={typeof v === "string" ? v : ""} onChange={(e) => set(f.name, e.target.value)} className={cn(inputCls(f.name), "h-9")} {...a11y(f.name)} />
                      {f.kind === "date" && <CalendarDays className="pointer-events-none absolute right-2.5 top-2.5 size-4 text-slate-300" />}
                    </div>
                  )}
                </div>
                {errors[f.name] && <p id={`${fid(f.name)}-err`} className="mt-1 text-[12px] text-rose-600">{errors[f.name]}</p>}
              </div>
            );
          })}
          {formError && <p role="alert" className="text-[12.5px] text-rose-600">{formError}</p>}
          {Object.keys(errors).length > 0 && <p role="alert" className="text-[12.5px] text-rose-600">Check the {Object.keys(errors).length === 1 ? "field" : `${Object.keys(errors).length} fields`} marked above.</p>}
          <button type="submit" className={cn(primaryBtn, "h-9 px-4")} style={{ background: "var(--app-primary)" }}>{block.submitLabel}</button>
        </form>
      )}
    </Card>
  );
}

export function TimelineBlock({ block }: { block: Extract<Block, { type: "timeline" }> }) {
  return (
    <Card title={block.title}>
      <ol className="px-4 py-3">
        {block.items.map((it, i) => (
          <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
            {i < block.items.length - 1 && <span className="absolute left-[7px] top-4 h-full w-px bg-slate-200" />}
            <span className={cn("relative mt-1 size-[15px] shrink-0 rounded-full border-2", it.state === "done" ? "border-transparent" : it.state === "active" ? "border-[var(--app-primary)] bg-white" : "border-slate-200 bg-white")} style={it.state === "done" ? { background: "var(--app-primary)" } : undefined} />
            <span className="min-w-0">
              <span className={cn("block text-[13px]", it.state === "pending" ? "text-slate-400" : "text-slate-800")}>{it.title}</span>
              <span className="block text-[11.5px] text-slate-400">{it.when}</span>
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function renderMarkdown(md: string) {
  const lines = md.split("\n");
  const out: React.ReactNode[] = [];
  let listItems: string[] = [];
  let ordered = false;
  const flush = () => {
    if (!listItems.length) return;
    const Tag = ordered ? "ol" : "ul";
    out.push(<Tag key={out.length} className={cn("my-1 space-y-1 pl-5 text-[13px] text-slate-700", ordered ? "list-decimal" : "list-disc")}>{listItems.map((l, i) => <li key={i}>{inline(l)}</li>)}</Tag>);
    listItems = [];
  };
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/).map((p, i) => (p.startsWith("**") ? <strong key={i} className="font-semibold text-slate-900">{p.slice(2, -2)}</strong> : p));
  for (const line of lines) {
    const ol = line.match(/^\s*\d+[.)]\s+(.*)/);
    const ul = line.match(/^\s*[-*]\s+(.*)/);
    if (ol || ul) {
      if (listItems.length && ordered !== Boolean(ol)) flush();
      ordered = Boolean(ol);
      listItems.push((ol ?? ul)![1]);
      continue;
    }
    flush();
    if (line.trim()) out.push(<p key={out.length} className="text-[13px] leading-relaxed text-slate-700">{inline(line)}</p>);
  }
  flush();
  return out;
}

export function TextBlock({ block }: { block: Extract<Block, { type: "text" }> }) {
  return (
    <Card title={block.title}>
      <div className="space-y-2 px-4 py-3">{renderMarkdown(block.markdown)}</div>
    </Card>
  );
}

export function ActionsBlock({ block }: { block: Extract<Block, { type: "actions" }> }) {
  const run = useRunAction();
  return (
    <div className="flex flex-wrap gap-2">
      {block.buttons.map((b, i) => (
        <button key={i} onClick={() => run(b.action)} className={b.variant === "primary" ? primaryBtn : secondaryBtn} style={b.variant === "primary" ? { background: "var(--app-primary)" } : undefined}>
          {b.label}
        </button>
      ))}
    </div>
  );
}

export function RenderBlock({ block }: { block: Block }) {
  switch (block.type) {
    case "kpis":
      return <KpisBlock block={block} />;
    case "table":
      return <TableBlock block={block} />;
    case "list":
      return <ListBlock block={block} />;
    case "detail":
      return <DetailBlock block={block} />;
    case "form":
      return <FormBlock block={block} />;
    case "chat":
      return <ChatBlockView block={block} />;
    case "timeline":
      return <TimelineBlock block={block} />;
    case "text":
      return <TextBlock block={block} />;
    case "actions":
      return <ActionsBlock block={block} />;
  }
}
