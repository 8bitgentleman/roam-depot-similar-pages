const saveEmbedding = function ({ data }) {
  if (data["method"]) {
    const method = data["method"];
    const pageIds = data["pageIds"];
    const IDB_NAME = "sp";
    const STRING_STORE = "fullStrings";
    const EMBEDDING_STORE = "embeddings";
    const SIMILARITY_STORE = "similarities";

    if (method === "init") {
      importScripts(
        "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1"
      );

      const { pipeline } = self.transformers;

      pipeline("feature-extraction", "Xenova/bge-small-en-v1.5", {
        quantized: true,
      }).then((extractor) => {
        importScripts("https://cdn.jsdelivr.net/npm/idb@6.0.0/build/iife/index-min.min.js");

        idb
          .openDB(IDB_NAME, 2, {
            upgrade(db) {
              [STRING_STORE, EMBEDDING_STORE, SIMILARITY_STORE].forEach((store) => {
                if (!db.objectStoreNames.contains(store)) {
                  db.createObjectStore(store);
                }
              });
            },
          })
          .then((db) => {
            Promise.all(pageIds.map((id) => db.get(STRING_STORE, id))).then((pageStrings) => {
              const embedPromises = pageStrings.map((text) =>
                extractor(text || "", { pooling: "mean", normalize: true })
              );

              Promise.all(embedPromises).then((results) => {
                const vec = results.map((r) => Array.from(r.data));

                const tx = db.transaction([EMBEDDING_STORE, SIMILARITY_STORE], "readwrite");
                const embeddingsStore = tx.objectStore(EMBEDDING_STORE);
                const operations = pageIds.map((id, i) => {
                  embeddingsStore.put(vec[i], id);
                });

                Promise.all(operations).then(() => {
                  tx.done.then(() => {
                    postMessage({ method: "complete", workersDone: vec.length });
                  });
                });
              });
            });
          });
      });
    }
  }
};

const initializeSelfHostedWorker = () => {
  const newBlob = new Blob([`self.onmessage=${saveEmbedding.toString()}`], {
    type: "application/javascript",
  });

  const blobURL = URL.createObjectURL(newBlob);
  return new Worker(blobURL);
};

export { initializeSelfHostedWorker };
