import resolveRefs from "roamjs-components/dom/resolveRefs";
import { BODY_SIZE } from "../constants";
import {
  DIJKSTRA_STORE,
  EMBEDDING_STORE,
  HASH_STORE,
  STRING_STORE,
  IDB_NAME,
  IDB_VERSION,
  TITLE_STORE,
  STORES,
  STORES_TYPE,
  hashString,
} from "../services/idb";
import { getFullString } from "../services/queries";
import { IncomingNode, TITLE_KEY, IncomingNodeMap } from "../types";
import { ShortestPathLengthMapping as ShortestPathMap } from "graphology-shortest-path/unweighted";
import { IDBPDatabase, openDB } from "idb/with-async-ittr";
import * as React from "react";

function useIdb() {
  const [activePageIds, setActivePageIds] = React.useState<string[]>([]);
  const [apexPageId, setApexPageId] = React.useState<string>();
  const [idbReady, setIdbReady] = React.useState(false);
  const idb = React.useRef<IDBPDatabase<any>>();

  React.useEffect(() => {
    const initializeIdb = async () => {
      const freshDb = await openDB(IDB_NAME, IDB_VERSION, {
        upgrade(db: IDBPDatabase) {
          STORES.forEach((store: STORES_TYPE) => {
            if (!db.objectStoreNames.contains(store)) {
              db.createObjectStore(store);
            }
          });
        },
      });

      idb.current = freshDb;
      setIdbReady(true);
    };

    initializeIdb();
  }, []);

  const addApexPage = React.useCallback(
    (uid: string, attrs: IncomingNode, skipCodeblocks = false) => {
      const addApexPageAsync = async () => {
        setApexPageId(uid);

        const pageString = resolveRefs(getFullString(attrs, skipCodeblocks).slice(0, BODY_SIZE));
        const newHash = hashString(pageString);
        const storedHash = await idb.current.get(HASH_STORE, uid);

        const tx = idb.current.transaction(
          [TITLE_STORE, STRING_STORE, HASH_STORE, EMBEDDING_STORE],
          "readwrite"
        );
        const operations: Promise<any>[] = [tx.objectStore(TITLE_STORE).put(attrs[TITLE_KEY], uid)];

        if (storedHash !== newHash) {
          operations.push(tx.objectStore(STRING_STORE).put(pageString, uid));
          operations.push(tx.objectStore(HASH_STORE).put(newHash, uid));
          operations.push(tx.objectStore(EMBEDDING_STORE).delete(uid));
        }

        await Promise.all(operations);
        await tx.done;
      };

      addApexPageAsync();
    },
    [setApexPageId, idb]
  );

  const addActivePages = React.useCallback(
    (pathMap: ShortestPathMap, nodeMap: IncomingNodeMap, skipCodeblocks = false) => {
      const addActivePagesAsync = async () => {
        const localActivePages = Object.entries(pathMap).filter(([uid]) => {
          return uid !== apexPageId;
        });

        setActivePageIds(localActivePages.map(([uid]) => uid));

        // Compute all strings + hashes upfront
        const pageData = localActivePages.map(([pageId, dijkstraDiff]) => {
          const pageString = resolveRefs(getFullString(nodeMap.get(pageId), skipCodeblocks).slice(0, BODY_SIZE));
          return { pageId, dijkstraDiff, pageString, newHash: hashString(pageString) };
        });

        // Bulk-read stored hashes in a readonly transaction
        const hashTx = idb.current.transaction([HASH_STORE], "readonly");
        const storedHashes = await Promise.all(
          pageData.map(({ pageId }) => hashTx.objectStore(HASH_STORE).get(pageId))
        );
        await hashTx.done;

        const changedPageIds = new Set(
          pageData.filter(({ newHash }, i) => storedHashes[i] !== newHash).map(({ pageId }) => pageId)
        );

        const tx = idb.current.transaction(
          [DIJKSTRA_STORE, TITLE_STORE, STRING_STORE, HASH_STORE, EMBEDDING_STORE],
          "readwrite"
        );

        const operations: Promise<any>[] = [
          tx.objectStore(DIJKSTRA_STORE).clear(),
          ...pageData.map(({ pageId, dijkstraDiff }) =>
            tx.objectStore(DIJKSTRA_STORE).put(dijkstraDiff, pageId)
          ),
          ...pageData.map(({ pageId }) =>
            tx.objectStore(TITLE_STORE).put(nodeMap.get(pageId)[TITLE_KEY], pageId)
          ),
          ...pageData
            .filter(({ pageId }) => changedPageIds.has(pageId))
            .flatMap(({ pageId, pageString, newHash }) => [
              tx.objectStore(STRING_STORE).put(pageString, pageId),
              tx.objectStore(HASH_STORE).put(newHash, pageId),
              tx.objectStore(EMBEDDING_STORE).delete(pageId),
            ]),
        ];

        await Promise.all(operations);
        await tx.done;
      };

      addActivePagesAsync();
    },
    [apexPageId]
  );

  return [addApexPage, addActivePages, idb, activePageIds, apexPageId, idbReady] as const;
}

export default useIdb;
