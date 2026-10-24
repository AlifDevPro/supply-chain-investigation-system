/** Turns a rejected data load into a value so pages can render an explicit state instead of crashing. */
export type Loaded<T> = { ok: true; data: T } | { ok: false; error: unknown };

export async function settle<T>(promise: Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await promise };
  } catch (error) {
    return { ok: false, error };
  }
}
