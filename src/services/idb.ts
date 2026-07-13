export const IDB_NAME = "sp";
export const IDB_VERSION = 4;

// Output dimensionality of the embedding model the worker loads
// (Xenova/bge-small-en-v1.5 in src/workers/blobUrl.js). Kept here so the main
// thread can detect and discard dimension-mismatched vectors — e.g. leftover
// 512-dim USE vectors from the original extension, which shares the "sp" DB.
// If the worker's model changes, update this to match its output size.
export const EMBEDDING_DIM = 384;
export const DIJKSTRA_STORE = "dijkstraDiffs";
export const STRING_STORE = "fullStrings";
export const EMBEDDING_STORE = "embeddings";
export const SIMILARITY_STORE = "similarities";
export const TITLE_STORE = "titles";
export const HASH_STORE = "contentHashes";

export type STORES_TYPE =
  | typeof DIJKSTRA_STORE
  | typeof EMBEDDING_STORE
  | typeof STRING_STORE
  | typeof SIMILARITY_STORE
  | typeof TITLE_STORE
  | typeof HASH_STORE;

export const STORES: STORES_TYPE[] = [
  DIJKSTRA_STORE,
  STRING_STORE,
  TITLE_STORE,
  EMBEDDING_STORE,
  SIMILARITY_STORE,
  HASH_STORE,
];

export function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}
