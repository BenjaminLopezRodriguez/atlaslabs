const concepts = [
  "Private",
  "Shared",
  "Organization",
  "Long-horizon",
  "Scoped",
  "Self-hosted",
  "Auditable",
  "Persistent",
  "Permissioned",
  "On your terms",
];

export function ConceptMarquee() {
  const row = [...concepts, ...concepts];

  return (
    <section aria-label="Atlas memory concepts" className="atlas-inset">
      <div className="overflow-hidden rounded-[1.25rem] bg-white py-8 sm:rounded-[1.5rem] lg:rounded-[1.75rem]">
        <div className="atlas-marquee">
          <div className="atlas-marquee-track">
            {row.map((item, i) => (
              <span
                key={`a-${item}-${i}`}
                className="text-sm font-medium tracking-tight whitespace-nowrap text-slate-400"
              >
                {item}
                <span className="ml-8 text-slate-300" aria-hidden="true">
                  ·
                </span>
              </span>
            ))}
          </div>
          <div className="atlas-marquee-track" aria-hidden="true">
            {row.map((item, i) => (
              <span
                key={`b-${item}-${i}`}
                className="text-sm font-medium tracking-tight whitespace-nowrap text-slate-400"
              >
                {item}
                <span className="ml-8 text-slate-300">·</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
