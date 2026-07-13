import resolveRefs from "roamjs-components/dom/resolveRefs";
import { BODY_SIZE } from "../constants";
import {
  DIJKSTRA_STORE,
  EMBEDDING_STORE,
  HASH_STORE,
  STRING_STORE,
  SIMILARITY_STORE,
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
        upgrade(db: IDBPDatabase, oldVersion: number, _newVersion, tx) {
          STORES.forEach((store: STORES_TYPE) => {
            if (!db.objectStoreNames.contains(store)) {
              db.createObjectStore(store);
            }
          });

          // Users upgrading from the original USE-based extension carry over
          // 512-dim vectors in EMBEDDING_STORE (the "sp" DB name is unchanged).
          // Older builds cleared every store on each open, so nothing wiped
          // them once that clear was removed. Those vectors are dimensionally
          // incompatible with the 384-dim BGE model this fork uses, and both
          // addActivePages and addApexPage skip re-embedding a page that
          // already has a vector — so a stale USE vector silently produces a
          // meaningless dot(384-dim apex, 512-dim candidate) similarity until
          // that page happens to be selected as apex. Wipe the content-derived
          // stores on upgrade so the corpus re-embeds cleanly. Guard is < 4
          // (not < 3): IDB_VERSION was bumped to 3 in the same build that
          // removed the clear-on-open, so a DB already at v3 could still hold
          // stale vectors that a `< 3` guard would never reach.
          if (oldVersion < 4) {
            [EMBEDDING_STORE, STRING_STORE, SIMILARITY_STORE, HASH_STORE].forEach((store) => {
              tx.objectStore(store).clear();
            });
          }
        },
        blocking() {
          // Close this connection if a newer version wants to upgrade
          idb.current?.close();
        },
      });

      idb.current = freshDb;
      setIdbReady(true);
    };

    initializeIdb();

    return () => {
      idb.current?.close();
    };
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

      return addApexPageAsync().catch(console.error);
    },
    [setApexPageId, idb]
  );

  const addActivePages = React.useCallback(
    (pathMap: ShortestPathMap, nodeMap: IncomingNodeMap, skipCodeblocks = false) => {
      const addActivePagesAsync = async () => {
        // The caller (pageSelectCallback) builds pathMap over every page except
        // the selected apex, so no apex-exclusion filter is needed here. Filtering
        // on the `apexPageId` state would be wrong anyway: it still holds the
        // PREVIOUS apex on this tick (setApexPageId hasn't committed yet), which
        // would silently drop the last-viewed page from the new candidate pool.
        const localActivePages = Object.entries(pathMap);

        setActivePageIds(localActivePages.map(([uid]) => uid));

        // Deriving a page's text (getFullString + resolveRefs) is the per-select
        // cost, and the candidate pool is now the whole graph. Pages that already
        // have a cached embedding keep it — a page's vector is refreshed when it
        // is chosen as the apex (see addApexPage) — so we only build strings for
        // pages we still need to embed. First run embeds the whole corpus; after
        // that, selection stays cheap.
        const embeddedIds = new Set<string>(
          (await idb.current.getAllKeys(EMBEDDING_STORE)) as string[]
        );

        const pageData = localActivePages.map(([pageId, dijkstraDiff]) => {
          const needsEmbedding = !embeddedIds.has(pageId);
          const pageString = needsEmbedding
            ? resolveRefs(getFullString(nodeMap.get(pageId), skipCodeblocks).slice(0, BODY_SIZE))
            : undefined;
          return { pageId, dijkstraDiff, needsEmbedding, pageString };
        });

        const tx = idb.current.transaction(
          [DIJKSTRA_STORE, TITLE_STORE, STRING_STORE, HASH_STORE],
          "readwrite"
        );

        const operations: Promise<any>[] = [
          tx.objectStore(DIJKSTRA_STORE).clear(),
          // Only graph-reachable pages get a real distance. Unconnected corpus
          // pages (Infinity) are omitted so they aren't plotted on the scatter.
          ...pageData
            .filter(({ dijkstraDiff }) => Number.isFinite(dijkstraDiff))
            .map(({ pageId, dijkstraDiff }) =>
              tx.objectStore(DIJKSTRA_STORE).put(dijkstraDiff, pageId)
            ),
          ...pageData.map(({ pageId }) =>
            tx.objectStore(TITLE_STORE).put(nodeMap.get(pageId)[TITLE_KEY], pageId)
          ),
          ...pageData
            .filter(({ needsEmbedding }) => needsEmbedding)
            .flatMap(({ pageId, pageString }) => [
              tx.objectStore(STRING_STORE).put(pageString, pageId),
              tx.objectStore(HASH_STORE).put(hashString(pageString), pageId),
            ]),
        ];

        await Promise.all(operations);
        await tx.done;
      };

      return addActivePagesAsync().catch(console.error);
    },
    []
  );

  return [addApexPage, addActivePages, idb, activePageIds, apexPageId, idbReady] as const;
}

export default useIdb;
