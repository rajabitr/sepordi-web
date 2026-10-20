import { PageHeader } from "./section";

export interface LegalSection {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
}

/** Long-form legal text: a contents list, then numbered sections at a readable measure. */
export function LegalPage({ title, description, updated, sections }: { title: string; description: string; updated: string; sections: LegalSection[] }) {
  return (
    <>
      <PageHeader title={title} description={description}>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">آخرین به‌روزرسانی: {updated}</p>
      </PageHeader>
      <div className="px-4 py-16 sm:px-6">
        <div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-4">
          <nav aria-label="فهرست مطالب" className="lg:sticky lg:top-24 lg:self-start">
            <h2 className="text-sm font-semibold leading-6">فهرست مطالب</h2>
            <ol className="mt-2">
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="flex min-h-11 items-center text-sm text-muted-foreground transition-colors hover:text-foreground">
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <article className="flex max-w-3xl flex-col gap-12 lg:col-span-3">
            {sections.map((s) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-24">
                <h2 id={`${s.id}-title`} className="text-lg font-bold leading-tight">{s.title}</h2>
                {s.paragraphs.map((p) => (
                  <p key={p} className="mt-4 text-base leading-7">{p}</p>
                ))}
                {s.bullets && (
                  <ul className="mt-4 flex list-disc flex-col gap-2 ps-6 text-base leading-7 marker:text-brand-ink">
                    {s.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </article>
        </div>
      </div>
    </>
  );
}
