/** The cookie store the panel tests' next/headers mock serves. No imports: a vi.mock factory loads it. */
export const jar = new Map<string, string>();

export const cookieStore = () => ({
  get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
  set: (name: string, value: string) => void jar.set(name, value),
  delete: (name: string) => void jar.delete(name),
});
