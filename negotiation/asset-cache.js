// Keep immutable downloads for this page session; each consumer gets its own body.
export function createAssetCache(fetcher = fetch) {
  const downloads = new Map();
  return {
    clear() { downloads.clear(); },
    async fetch(url) {
      let pending = downloads.get(url);
      if (!pending) {
        pending = fetcher(url, { cache: 'no-store' }).then(async (response) => {
          if (!response.ok) throw new Error(`Datei ${url}: HTTP ${response.status}`);
          return { bytes: await response.arrayBuffer(), headers: response.headers };
        });
        downloads.set(url, pending);
      }
      try {
        const { bytes, headers } = await pending;
        return new Response(bytes.slice(0), { headers });
      } catch (error) {
        if (downloads.get(url) === pending) downloads.delete(url);
        throw error;
      }
    },
  };
}

export const sceneAssets = createAssetCache();
