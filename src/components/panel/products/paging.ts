/*
 * «بارگذاری همه»: follows the list's cursors up to a cap. At 100 a page, 500 products cost five requests of the
 * partner's 120-a-minute budget, which every other panel page shares.
 */

export const PAGE_SIZE = 100;
export const LOAD_ALL_CAP = 500;

export interface Page<T> {
  products: T[];
  next_cursor: string | null;
}

/** Pages from the first until the cursors run out or `cap` products are in; `nextCursor` is where it stopped. */
export async function collectPages<T>(
  fetchPage: (cursor: string | undefined) => Promise<Page<T>>,
  cap = LOAD_ALL_CAP,
): Promise<{ products: T[]; nextCursor: string | null }> {
  const products: T[] = [];
  let cursor: string | undefined;
  for (let pages = 1; ; pages++) {
    const page = await fetchPage(cursor);
    products.push(...page.products);
    if (!page.next_cursor || products.length >= cap || pages >= Math.ceil(cap / PAGE_SIZE)) return { products, nextCursor: page.next_cursor };
    cursor = page.next_cursor;
  }
}
