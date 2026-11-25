// Pages through a query in 1000-row chunks so results aren't cut off by the
// API's per-request row cap. `build` must return a fresh, ordered query each call.
export async function fetchAllRows<T>(
  build: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }> },
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}
