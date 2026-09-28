/**
 * Shown inside the project while a tab renders, so the shell never goes blank: the outline of a sheet
 * in faint dashed pencil (a title, a line, a few cards). Still, on purpose: nothing sweeps or pulses.
 */
export default function TabLoading() {
  return (
    <div className="h-full min-h-0 overflow-hidden bg-canvas" aria-busy="true" aria-label="Loading">
      <div className="mx-auto w-full max-w-[980px] px-2.5 py-5 sm:px-6 sm:py-9">
        <div className="skeleton rounded-md px-4 py-7 sm:px-10 sm:py-10">
          <div className="skeleton h-3.5 w-40 rounded-sm" />
          <div className="skeleton mt-3 h-10 w-3/5 max-w-md rounded-sm sm:h-14" />
          <div className="skeleton mt-4 h-4 w-4/5 max-w-xl rounded-sm" />
          <div className="skeleton mt-10 h-7 w-48 rounded-sm" />
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`skeleton rounded-md p-3.5 ${i > 0 ? "max-sm:hidden" : ""} ${i > 1 ? "sm:max-lg:hidden" : ""}`}>
                <div className="skeleton h-4 w-1/2 rounded-sm" />
                <div className="skeleton mt-2.5 aspect-[16/10] rounded-sm" />
                <div className="skeleton mt-2.5 h-3.5 w-4/5 rounded-sm" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
