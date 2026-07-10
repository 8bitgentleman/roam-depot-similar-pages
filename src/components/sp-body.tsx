import * as React from "react";
import gridStyles from "../styles/grid.module.css";
import styles from "../styles/sp-body.module.css";
import { SelectablePage, SP_STATUS, TITLE_KEY } from "../types";
import { Spinner, Card, ProgressBar, Elevation, ButtonGroup, Button, Switch } from "@blueprintjs/core";
import PageSelect from "./page/page-select";
import { isTitleOrUidDailyPage } from "../services/graph-manip";
import {
  CHUNK_SIZE,
  DISCONNECTED_DISTANCE,
  INITIAL_LOADING_INCREMENT,
  RECENT_FALLBACK_LIMIT,
} from "../constants";
import { initializeEmbeddingWorker } from "../services/embedding-worker-client";
import useIdb from "../hooks/useIdb";
import { EMBEDDING_STORE, SIMILARITY_STORE } from "../services/idb";

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}
import SpGraph from "./graph/sp-graph";
import SpRankedList from "./graph/sp-ranked-list";
import useGraphology from "../hooks/useGraphology";

type ViewMode = "scatter" | "list";

type SpBodyProps = {
  extensionAPI: RoamExtensionAPI;
  initialPageUid?: string;
};

export const SpBody = ({ extensionAPI, initialPageUid }: SpBodyProps) => {
  const [addApexPage, addActivePages, idb, activePageIds, apexPageId, idbReady] = useIdb();
  const [status, setStatus] = React.useState<SP_STATUS>("CREATING_GRAPH");
  const [graph, initializeGraph, roamPages, attributeUids, getShortestPaths, getRecentPageIds] =
    useGraphology();
  const [loadingIncrement, setLoadingIncrement] = React.useState<number>(0);
  const [pagesLeft, setPagesLeft] = React.useState<number>(0);
  const [disconnected, setDisconnected] = React.useState<boolean>(false);
  // Off by default: attribute pages and daily notes are hidden from the search
  // list until the user flips these toggles on the modal.
  const [showAttributePages, setShowAttributePages] = React.useState<boolean>(false);
  const [showDailyPages, setShowDailyPages] = React.useState<boolean>(false);
  const selectionGeneration = React.useRef<number>(0);

  const defaultView = (extensionAPI.settings.get("default-view") as ViewMode) || "scatter";
  const [viewMode, setViewMode] = React.useState<ViewMode>(defaultView);

  const buildExclusions = React.useCallback((): string[] => {
    const exclusions: string[] = [];
    if (extensionAPI.settings.get("hide-dot-pages")) exclusions.push(".");
    if (extensionAPI.settings.get("hide-roam-pages")) exclusions.push("roam/");
    const custom = extensionAPI.settings.get("custom-exclusions") as string;
    if (custom) {
      custom.split(",").map((s) => s.trim()).filter(Boolean).forEach((p) => exclusions.push(p));
    }
    return exclusions;
  }, [extensionAPI]);

  const skipCodeblocks = !!extensionAPI.settings.get("skip-codeblocks");

  // Reactive searchable list: filtered live by the modal toggles so flipping a
  // switch updates the dropdown without rebuilding the graph.
  const selectablePages = React.useMemo<SelectablePage[]>(() => {
    const exclusions = buildExclusions();
    const pages: SelectablePage[] = [];

    roamPages.forEach((node, uid) => {
      const title = node[TITLE_KEY];
      if (!title || title === "DONE") return;
      if (exclusions.some((prefix) => title.startsWith(prefix))) return;

      const isAttribute = attributeUids.has(uid);
      const isDaily = isTitleOrUidDailyPage(title, uid);
      if (isAttribute && !showAttributePages) return;
      if (isDaily && !showDailyPages) return;

      pages.push({ title, id: uid, icon: "document" });
    });

    return pages;
  }, [roamPages, attributeUids, buildExclusions, showAttributePages, showDailyPages]);

  React.useEffect(() => {
    if (graph.size === 0) {
      window.setTimeout(() => {
        const initializeGraphAsync = async () => {
          await initializeGraph(buildExclusions());
          setStatus("GRAPH_INITIALIZED");
        };
        initializeGraphAsync();
      }, 10);
    }
  }, [graph, initializeGraph, buildExclusions]);

  const pageSelectCallback = React.useCallback(
    ({ id: selectedPageId }: SelectablePage) => {
      if (idb.current && selectedPageId) {
        selectionGeneration.current += 1;
        setPagesLeft(0);
        setLoadingIncrement(INITIAL_LOADING_INCREMENT);
        setStatus("GETTING_GRAPH_STATS");

        const apexRoamPage = roamPages.get(selectedPageId);
        // Pages kept out of the graph (attribute pages, daily notes surfaced via
        // the toggles) have no topology, so skip the BFS and fall back below.
        const pathMap = graph.hasNode(selectedPageId) ? getShortestPaths(selectedPageId) : {};

        // Isolated page (only itself reachable): no graph distances exist, so
        // fall back to ranking against the most-recently-edited pages by pure
        // content similarity. See docs/DISCONNECTED_PAGE_FALLBACK.md.
        const isDisconnected = Object.keys(pathMap).length <= 1;
        setDisconnected(isDisconnected);

        const effectivePathMap = isDisconnected
          ? Object.fromEntries(
              getRecentPageIds(selectedPageId, RECENT_FALLBACK_LIMIT).map((id) => [
                id,
                DISCONNECTED_DISTANCE,
              ])
            )
          : pathMap;

        // Wait for IDB writes (including embedding invalidations) to commit
        // before reading embedding keys in the READY_TO_EMBED effect.
        Promise.all([
          addApexPage(selectedPageId, apexRoamPage, skipCodeblocks),
          addActivePages(effectivePathMap, roamPages, skipCodeblocks),
        ]).then(() => {
          setStatus("READY_TO_EMBED");
        });
      }
    },
    [graph, roamPages, getShortestPaths, getRecentPageIds, addApexPage, addActivePages, idb, skipCodeblocks]
  );

  // Auto-select page when opened from context menu. Look up the page directly
  // (not via the filtered list) so it works regardless of the toggles.
  React.useEffect(() => {
    if (initialPageUid && idbReady && status === "GRAPH_INITIALIZED") {
      const node = roamPages.get(initialPageUid);
      if (node?.[TITLE_KEY]) {
        pageSelectCallback({ title: node[TITLE_KEY], id: initialPageUid, icon: "document" });
      }
    }
  }, [initialPageUid, idbReady, status, roamPages, pageSelectCallback]);

  const checkIfDoneEmbedding = React.useCallback(
    (pagesDone: number) => {
      setLoadingIncrement((prevInc) => prevInc + pagesDone / (activePageIds.length + 1));
      setPagesLeft((prevPagesLeft) => prevPagesLeft - pagesDone);
    },
    [activePageIds]
  );

  React.useEffect(() => {
    if (idb.current && status === "READY_TO_COMPUTE") {
      const setSimilaritiesAsync = async () => {
        const tx = idb.current.transaction([EMBEDDING_STORE, SIMILARITY_STORE], "readwrite");
        const embeddingsStore = tx.objectStore(EMBEDDING_STORE);
        const similaritiesStore = tx.objectStore(SIMILARITY_STORE);
        const apexEmbedding = await embeddingsStore.get(apexPageId);

        if (apexEmbedding) {
          const operations: Promise<string | void>[] = [similaritiesStore.clear()];

          for await (const { value: embedding, key } of embeddingsStore) {
            if (activePageIds.includes(key)) {
              operations.push(similaritiesStore.put(dot(apexEmbedding, embedding), key));
            }
          }

          await Promise.all(operations);
          await tx.done;

          setStatus("READY_TO_DISPLAY");
        } else {
          console.error(
            `sp-body: apex embedding for page ${apexPageId} was not found; cannot compute similarities.`
          );
        }
      };

      setSimilaritiesAsync();
    }
  }, [idb, activePageIds, apexPageId, status]);

  React.useEffect(() => {
    if (status === "READY_TO_EMBED") {
      const myGeneration = selectionGeneration.current;

      const initializeEmbeddingsAsync = async () => {
        setLoadingIncrement(INITIAL_LOADING_INCREMENT);

        const embeddingsKeys = await idb.current?.getAllKeys(EMBEDDING_STORE);
        const idsToEmbed = [...activePageIds, apexPageId].filter((p) => {
          return !embeddingsKeys.includes(p);
        });

        if (selectionGeneration.current !== myGeneration) return;

        if (idsToEmbed.length > 0) {
          // Order matters: set pagesLeft > 0 BEFORE status EMBEDDING so the completion
          // effect never observes (EMBEDDING && pagesLeft <= 0) and skips ahead. Do not reorder.
          setPagesLeft(idsToEmbed.length);
          setStatus("EMBEDDING");

          const guardedCheckIfDoneEmbedding = (pagesDone: number) => {
            if (selectionGeneration.current !== myGeneration) return;
            checkIfDoneEmbedding(pagesDone);
          };

          const guardedOnEmbeddingError = (message: string) => {
            if (selectionGeneration.current !== myGeneration) return;
            console.error("sp-body: embedding failed:", message);
            setStatus("EMBEDDING_ERROR");
          };

          for (let i = 0; i < idsToEmbed.length; i += CHUNK_SIZE) {
            if (selectionGeneration.current !== myGeneration) return;
            const chunkedPageIds = idsToEmbed.slice(i, i + CHUNK_SIZE);
            await initializeEmbeddingWorker(
              chunkedPageIds,
              guardedCheckIfDoneEmbedding,
              guardedOnEmbeddingError
            );
          }
        } else {
          setPagesLeft(0);
          setStatus("READY_TO_COMPUTE");
        }
      };

      initializeEmbeddingsAsync();
    }
  }, [status, checkIfDoneEmbedding, activePageIds, apexPageId, idb]);

  React.useEffect(() => {
    if (status === "EMBEDDING" && pagesLeft <= 0) {
      setStatus("READY_TO_COMPUTE");
    }
  }, [status, pagesLeft]);

  return status === "CREATING_GRAPH" ? (
    <Spinner></Spinner>
  ) : (
    <div className={gridStyles.container}>
      <div className={gridStyles.side}>
        <Card elevation={1}>
          <h5 className={styles.title}>selected page</h5>
          <PageSelect
            selectablePages={selectablePages}
            onPageSelect={pageSelectCallback}
          ></PageSelect>
          <Switch
            checked={showAttributePages}
            label="Show attribute pages"
            onChange={(e) => setShowAttributePages(e.currentTarget.checked)}
            style={{ marginTop: 10, marginBottom: 0 }}
          />
          <Switch
            checked={showDailyPages}
            label="Show daily notes"
            onChange={(e) => setShowDailyPages(e.currentTarget.checked)}
            style={{ marginBottom: 0 }}
          />
        </Card>
        {status === "READY_TO_DISPLAY" && (
          <>
            {disconnected ? (
              <Card elevation={1} style={{ marginTop: 10 }}>
                <h5 className={styles.title}>view</h5>
                <p className={styles.explainer}>
                  This page has no links to other pages, so there are no graph
                  distances to plot. Results are ranked by content similarity
                  against your most recently edited pages.
                </p>
              </Card>
            ) : (
              <Card elevation={1} style={{ marginTop: 10 }}>
                <h5 className={styles.title}>view</h5>
                <ButtonGroup fill>
                  <Button
                    icon="scatter-plot"
                    active={viewMode === "scatter"}
                    onClick={() => setViewMode("scatter")}
                  >
                    Scatter
                  </Button>
                  <Button
                    icon="list"
                    active={viewMode === "list"}
                    onClick={() => setViewMode("list")}
                  >
                    List
                  </Button>
                </ButtonGroup>
              </Card>
            )}
            <Card elevation={1} style={{ marginTop: 10 }}>
              <h5 className={styles.title}>how it works</h5>
              <p className={styles.explainer}>
                <strong>Similarity</strong> — semantic similarity between page
                content using AI embeddings. Higher = more similar meaning.
              </p>
              <p className={styles.explainer}>
                <strong>Distance</strong> — shortest link path between pages in
                your graph. Lower = more closely connected.
              </p>
              <p className={styles.explainer}>
                <strong>Score</strong> — primarily similarity, with a small
                boost for distant pages (surprising discoveries). Pages marked{" "}
                <strong>top</strong> are in the top 5% by score.
              </p>
              <p className={styles.explainer}>
                Click a row to link pages together.
              </p>
            </Card>
          </>
        )}
      </div>
      <div className={gridStyles.body}>
        <div className={styles.graph}>
          <div className={styles.graphinner}>
            {status === "GRAPH_INITIALIZED" ? (
              "↙️ select a page"
            ) : status === "READY_TO_DISPLAY" ? (
              disconnected ? (
                <SpRankedList
                  activePageIds={activePageIds}
                  apexPageId={apexPageId}
                  idb={idb}
                  disconnected
                />
              ) : viewMode === "scatter" ? (
                <SpGraph activePageIds={activePageIds} apexPageId={apexPageId} extensionAPI={extensionAPI} idb={idb} />
              ) : (
                <SpRankedList activePageIds={activePageIds} apexPageId={apexPageId} idb={idb} />
              )
            ) : status === "EMBEDDING_ERROR" ? (
              <Card elevation={Elevation.ONE}>
                <p>
                  Embedding failed — the AI model or its libraries could not be
                  loaded (check your connection and reload). Select a page to try
                  again.
                </p>
              </Card>
            ) : (
              <>
                <Card elevation={Elevation.ONE}>
                  <ProgressBar value={loadingIncrement}></ProgressBar>
                  <p>
                    {status === "GETTING_GRAPH_STATS"
                      ? "Calculating graph distances..."
                      : (status === "EMBEDDING" || status === "READY_TO_EMBED") && pagesLeft > 0
                      ? `Embedding pages... (${pagesLeft} remaining)`
                      : "Computing similarities..."}
                  </p>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
