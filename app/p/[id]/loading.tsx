/** Shown inside the studio while a tab renders, so the shell never goes blank. */
export default function TabLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col" aria-busy="true" aria-label="Loading">
      <div className="flex items-center gap-3 border-b border-hairline px-5 py-3">
        <div className="shimmer h-4 w-64 rounded-md" />
        <div className="shimmer ml-auto h-7 w-40 rounded-lg" />
      </div>
      <div className="dot-grid grid flex-1 grid-cols-4 gap-10 p-8">
        {[0, 1, 2, 3].map((c) => (
          <div key={c} className="space-y-3" style={{ paddingTop: [0, 32, 16, 48][c] }}>
            <div className="shimmer h-3 w-24 rounded" />
            {Array.from({ length: c === 0 ? 4 : 3 }).map((_, i) => (
              <div key={i} className="shimmer h-24 rounded-xl border border-hairline" style={{ animationDelay: `${(c * 3 + i) * 60}ms` }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
