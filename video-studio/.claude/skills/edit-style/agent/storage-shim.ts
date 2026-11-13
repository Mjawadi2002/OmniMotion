// The preview runs in a fully sandboxed frame (no same-origin), where touching localStorage throws.
// Remotion's player remembers the volume there, so give it an in-memory stand-in. Imported before anything else.
const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
};
for (const name of ['localStorage', 'sessionStorage']) {
  try {
    void (window as any)[name].length;
  } catch {
    Object.defineProperty(window, name, {value: memory(), configurable: true});
  }
}
export {};
