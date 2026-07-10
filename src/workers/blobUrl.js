const workerCode = `
const IDB_NAME = "sp";
const STRING_STORE = "fullStrings";
const EMBEDDING_STORE = "embeddings";
const SIMILARITY_STORE = "similarities";

self.onmessage = async function ({ data }) {
  if (data.method !== "init") return;

  try {
    const pageIds = data.pageIds;

    const { pipeline } = await import(
      "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/dist/transformers.min.js"
    );

    const extractor = await pipeline("feature-extraction", "Xenova/bge-small-en-v1.5", {
      dtype: "q8",
    });

    const { openDB } = await import(
      "https://cdn.jsdelivr.net/npm/idb@7.1.1/+esm"
    );

    const db = await openDB(IDB_NAME, undefined, {
      upgrade(db) {
        [STRING_STORE, EMBEDDING_STORE, SIMILARITY_STORE].forEach((store) => {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store);
          }
        });
      },
    });

    const pageStrings = await Promise.all(pageIds.map((id) => db.get(STRING_STORE, id)));

    const embedPromises = pageStrings.map((text) =>
      extractor(text || "", { pooling: "mean", normalize: true })
    );
    const results = await Promise.all(embedPromises);
    const vec = results.map((r) => Array.from(r.data));

    const tx = db.transaction([EMBEDDING_STORE, SIMILARITY_STORE], "readwrite");
    const embeddingsStore = tx.objectStore(EMBEDDING_STORE);
    await Promise.all(pageIds.map((id, i) => embeddingsStore.put(vec[i], id)));
    await tx.done;

    postMessage({ method: "complete", workersDone: vec.length });
  } catch (err) {
    postMessage({ method: "error", message: String(err && err.message ? err.message : err) });
  }
};
`;

const initializeSelfHostedWorker = () => {
  const newBlob = new Blob([workerCode], {
    type: "application/javascript",
  });

  const blobURL = URL.createObjectURL(newBlob);
  return new Worker(blobURL, { type: "module" });
};

export { initializeSelfHostedWorker };
