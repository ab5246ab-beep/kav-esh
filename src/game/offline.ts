const CACHE = "kav-esh-v1";

export function startOffline(onReady: () => void) {
  if (!import.meta.env.PROD) return;
  if (!("serviceWorker" in navigator) || !("caches" in window)) return;

  const warm = async () => {
    const cache = await caches.open(CACHE);
    const urls = new Set<string>(["/"]);
    for (const entry of performance.getEntriesByType("resource")) {
      try {
        const url = new URL(entry.name);
        if (url.origin !== location.origin) continue;
        urls.add(url.pathname + url.search);
      } catch {
        /* ignore bad urls */
      }
    }
    await Promise.all(
      [...urls].map(async (path) => {
        try {
          const res = await fetch(path);
          if (res.ok) await cache.put(path, res);
        } catch {
          /* still offline */
        }
      }),
    );
    if (await cache.match("/")) onReady();
  };

  navigator.serviceWorker.register("/sw.js").then(warm).catch(() => {});
}
