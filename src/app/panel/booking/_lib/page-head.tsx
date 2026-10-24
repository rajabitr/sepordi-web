/** The heading every booking page shares, rendered outside the Suspense boundary so it never shifts. */
export function BookingHead({ title, description }: { title: string; description: string }) {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-bold leading-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
    </header>
  );
}
