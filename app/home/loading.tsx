/** Paper while the projects load: the header, the greeting, the writing sheet and a few cards, outlined in faint dashed pencil. */
export default function HomeLoading() {
  return (
    <div className="min-h-screen" aria-busy="true" aria-label="Loading">
      <div className="border-b border-hairline">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-5 sm:px-6">
          <div className="skeleton h-6 w-20 rounded-md" />
          <div className="skeleton ml-auto h-7 w-7 rounded-full" />
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-5 pb-24 pt-10 sm:px-6 sm:pt-14">
        <div className="skeleton h-10 w-64 rounded-md" />
        <div className="skeleton mt-6 h-64 rounded-md" />
        <div className="skeleton mt-16 h-8 w-44 rounded-md sm:mt-20" />
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-64 rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}
