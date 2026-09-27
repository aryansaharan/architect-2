/** Paper while the projects load: the greeting, the composer and a few blank cards, drawn in faint graphite. */
export default function HomeLoading() {
  return (
    <div className="mx-auto max-w-5xl px-5 pb-24 pt-24 sm:px-6" aria-busy="true" aria-label="Loading">
      <div className="shimmer h-11 w-72 rounded-lg sm:h-14 sm:w-96" />
      <div className="panel mt-7 rounded-2xl p-5">
        <div className="shimmer h-3.5 w-2/3 rounded" />
        <div className="shimmer mt-3 h-3.5 w-1/2 rounded" />
        <div className="mt-8 flex justify-end">
          <div className="shimmer h-8 w-28 rounded-lg" />
        </div>
      </div>
      <div className="shimmer mt-14 h-8 w-44 rounded-md" />
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="panel rounded-xl p-3">
            <div className="h-28 rounded-lg border border-hairline bg-canvas" />
            <div className="shimmer mt-4 h-3.5 w-1/2 rounded" style={{ animationDelay: `${i * 80}ms` }} />
            <div className="shimmer mt-2.5 h-3 w-3/4 rounded" style={{ animationDelay: `${i * 80}ms` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
