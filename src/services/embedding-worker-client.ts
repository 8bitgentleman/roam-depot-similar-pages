import { initializeSelfHostedWorker } from "../workers/blobUrl";

export type EmbeddingSession = {
  embedChunk(
    pageIds: string[],
    onDone: (n: number) => void,
    onError: (m: string) => void
  ): Promise<boolean>;
  terminate(): void;
};

// One worker per run, reused across every chunk so the embedding model is loaded
// once instead of rebuilt per 100-page chunk. Chunks are awaited serially, so at
// most one chunk is in flight at a time (≤1 pending resolver).
export const createEmbeddingSession = (): EmbeddingSession => {
  const worker = initializeSelfHostedWorker();

  let pending:
    | {
        resolve: (ok: boolean) => void;
        onDone: (n: number) => void;
        onError: (m: string) => void;
      }
    | undefined;

  worker.onmessage = (e) => {
    const { method, ...data } = e.data;
    const current = pending;
    if (!current) return;

    if (method === "complete") {
      pending = undefined;
      current.onDone(data["workersDone"] ?? 0);
      current.resolve(true);
    } else if (method === "error") {
      pending = undefined;
      current.onError(data["message"]);
      current.resolve(false);
    }
  };

  worker.onerror = (e) => {
    const current = pending;
    if (!current) return;
    pending = undefined;
    current.onError(e.message);
    current.resolve(false);
  };

  return {
    embedChunk: (pageIds, onDone, onError) =>
      new Promise<boolean>((resolve) => {
        pending = { resolve, onDone, onError };
        worker.postMessage({ method: "embed", pageIds });
      }),
    terminate: () => {
      // Safe to call more than once — Worker.terminate() is idempotent.
      worker.terminate();
    },
  };
};
