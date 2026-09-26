export default function HomeLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 pb-24 pt-24" aria-busy="true" aria-label="Loading">
      <div className="shimmer h-3 w-28 rounded" />
      <div className="shimmer mt-3 h-10 w-80 rounded-lg" />
      <div className="shimmer mt-6 h-32 rounded-2xl border border-hairline" />
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="shimmer h-56 rounded-xl border border-hairline" style={{ animationDelay: `${i * 80}ms` }} />)}
      </div>
    </div>
  );
}
