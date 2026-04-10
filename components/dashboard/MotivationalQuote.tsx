interface ZenQuote {
  q: string
  a: string
}

const FALLBACK: ZenQuote = {
  q: 'The journey of a thousand miles begins with a single step.',
  a: 'Lao Tzu',
}

async function fetchQuote(): Promise<ZenQuote> {
  try {
    const res = await fetch('https://zenquotes.io/api/random', {
      next: { revalidate: 86400 }, // cache for 24 hours
    })
    if (!res.ok) return FALLBACK
    const data = (await res.json()) as ZenQuote[]
    const quote = data[0]
    if (!quote?.q || !quote?.a) return FALLBACK
    return quote
  } catch {
    return FALLBACK
  }
}

export default async function MotivationalQuote() {
  const quote = await fetchQuote()

  return (
    <div className="bg-[#1976D2] rounded-xl p-4 text-white flex flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-white/70">
        Quote of the Day
      </p>
      <p className="text-sm italic leading-relaxed text-white/95">
        &ldquo;{quote.q}&rdquo;
      </p>
      <p className="text-xs text-white/70">— {quote.a}</p>
    </div>
  )
}
