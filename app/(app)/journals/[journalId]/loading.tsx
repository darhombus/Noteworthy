// Mirrors the EntryList layout in components/entries/EntryList.tsx:
//   - Outer container is `p-6 max-w-[800px] mx-auto` (NOT max-w-[1200px]).
//   - Hero banner: rounded-2xl with subtle accent gradient, ~155px tall.
//   - Search row (~42px), then date-filter chip row (~28px).
//   - Stacked entry cards (~120px each).
//
// We don't know the journal's accent color during the loading state, so the
// hero uses a neutral surface tone rather than the real coloured gradient.
// That tiny colour shift is acceptable — alignment and height matter more.
export default function JournalLoading() {
  return (
    <div className="p-6 max-w-[800px] mx-auto">
      {/* Hero banner — same shape and size as EntryList's accent-tinted card */}
      <div
        className="rounded-2xl border border-[#E0E0E0] dark:border-[#3A3A3A] bg-white dark:bg-[#1E1E1E] p-7 mb-7 animate-pulse"
        style={{ minHeight: 155 }}
      />

      {/* Search input row */}
      <div className="h-[42px] rounded-xl border border-[#E0E0E0] dark:border-[#3A3A3A] bg-white dark:bg-[#1E1E1E] mb-3 animate-pulse" />

      {/* Filter chip row */}
      <div className="flex items-center gap-1.5 mb-5">
        <div className="h-5 w-10 rounded bg-[#E0E0E0] dark:bg-[#3A3A3A] animate-pulse" />
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-6 w-20 rounded-full bg-[#E0E0E0] dark:bg-[#3A3A3A] animate-pulse"
          />
        ))}
      </div>

      {/* Entry card stack */}
      <div className="space-y-3">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="h-[120px] rounded-xl border border-[#E0E0E0] dark:border-[#3A3A3A] bg-white dark:bg-[#1E1E1E] animate-pulse"
          />
        ))}
      </div>
    </div>
  )
}
