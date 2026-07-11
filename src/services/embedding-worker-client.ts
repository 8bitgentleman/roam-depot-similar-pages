import { EmbeddingWorker } from "../types";
import { initializeSelfHostedWorker } from "../workers/blobUrl";

const embeddingWorker: EmbeddingWorker = { current: undefined, init: false };

// Resolves when the worker finishes a chunk (true) or fails (false), and always
// terminates the worker. The caller awaits this per chunk, so chunks run one at
// a time — a full-corpus first run must NOT spawn every chunk's worker at once
// (each loads its own copy of the embedding model).
export const initializeEmbeddingWorker = (
  pageIds: string[],
  onDone: (workersDone: number) => void,
  onError: (message: string) => void
): Promise<boolean> => {
  return new Promise((resolve) => {
    const worker = initializeSelfHostedWorker();
    embeddingWorker.current = worker;

    const finish = (ok: boolean) => {
      worker.terminate();
      if (embeddingWorker.current === worker) embeddingWorker.current = undefined;
      resolve(ok);
    };

    worker.onmessage = (e) => {
      const { method, ...data } = e.data;

      if (method === "complete" && data["workersDone"]) {
        onDone(data["workersDone"]);
        finish(true);
      } else if (method === "error") {
        onError(data["message"]);
        finish(false);
      }
    };
    worker.onerror = (e) => {
      onError(e.message);
      finish(false);
    };

    worker.postMessage({ method: "init", pageIds });
  });
};
