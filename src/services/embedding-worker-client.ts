import { EmbeddingWorker } from "../types";
import { initializeSelfHostedWorker } from "../workers/blobUrl";

const embeddingWorker: EmbeddingWorker = { current: undefined, init: false };

export const initializeEmbeddingWorker = (
  pageIds: string[],
  onDone: (workersDone: number) => void,
  onError: (message: string) => void
): Worker => {
  embeddingWorker.current = initializeSelfHostedWorker();
  embeddingWorker.current.onmessage = (e) => {
    const { method, ...data } = e.data;

    if (method === "complete" && data["workersDone"]) {
      onDone(data["workersDone"]);
    } else if (method === "error") {
      onError(data["message"]);
    }
  };
  embeddingWorker.current.onerror = (e) => onError(e.message);

  embeddingWorker?.current?.postMessage({ method: "init", pageIds });
  return embeddingWorker.current;
};
