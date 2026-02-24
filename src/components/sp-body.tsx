import * as React from "react";
import gridStyles from "../styles/grid.module.css";
import styles from "../styles/sp-body.module.css";
import { SelectablePage, SP_STATUS } from "../types";
import { Spinner, Card, ProgressBar, Elevation, ButtonGroup, Button } from "@blueprintjs/core";
import PageSelect from "./page/page-select";
import { CHUNK_SIZE, INITIAL_LOADING_INCREMENT } from "../constants";
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
  const [graph, initializeGraph, roamPages, selectablePages, getShortestPaths] = useGraphology();
  const [loadingIncrement, setLoadingIncrement] = React.useState<number>(0);
  const [pagesLeft, setPagesLeft] = React.useState<number>(0);

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
        setLoadingIncrement(INITIAL_LOADING_INCREMENT);
        setStatus("GETTING_GRAPH_STATS");

        const apexRoamPage = roamPages.get(selectedPageId);
        const pathMap = getShortestPaths(selectedPageId);

        // Wait for IDB writes (including embedding invalidations) to commit
        // before reading embedding keys in the READY_TO_EMBED effect.
        Promise.all([
          addApexPage(selectedPageId, apexRoamPage, skipCodeblocks),
          addActivePages(pathMap, roamPages, skipCodeblocks),
        ]).then(() => {
          setStatus("READY_TO_EMBED");
        });
      }
    },
    [roamPages, getShortestPaths, addApexPage, addActivePages, idb, skipCodeblocks]
  );

  // Auto-select page when opened from context menu
  React.useEffect(() => {
    if (initialPageUid && idbReady && status === "GRAPH_INITIALIZED" && selectablePages.length > 0) {
      const match = selectablePages.find((p) => p.id === initialPageUid);
      if (match) {
        pageSelectCallback(match);
      }
    }
  }, [initialPageUid, idbReady, status, selectablePages, pageSelectCallback]);

  const checkIfDoneEmbedding = React.useCallback(
    (pagesDone: number) => {
      setLoadingIncrement((prevInc) => prevInc + pagesDone / (activePageIds.length + 1));
      setPagesLeft((prevPagesLeft) => prevPagesLeft - pagesDone);
    },
    [activePageIds]
  );

  React.useEffect(() => {
    if (idb.current && pagesLeft === 0 && status === "READY_TO_EMBED") {
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
        }
      };

      setSimilaritiesAsync();
    }
  }, [pagesLeft, idb, activePageIds, apexPageId, status]);

  React.useEffect(() => {
    if (status === "READY_TO_EMBED") {
      const initializeEmbeddingsAsync = async () => {
        setLoadingIncrement(INITIAL_LOADING_INCREMENT);

        const embeddingsKeys = await idb.current?.getAllKeys(EMBEDDING_STORE);
        const idsToEmbed = [...activePageIds, apexPageId].filter((p) => {
          return !embeddingsKeys.includes(p);
        });

        if (idsToEmbed.length > 0) {
          setPagesLeft(idsToEmbed.length);

          for (let i = 0; i < idsToEmbed.length; i += CHUNK_SIZE) {
            const chunkedPageIds = idsToEmbed.slice(i, i + CHUNK_SIZE);
            await initializeEmbeddingWorker(chunkedPageIds, checkIfDoneEmbedding);
          }
        } else {
          setPagesLeft(0);
        }
      };

      initializeEmbeddingsAsync();
    }
  }, [status, checkIfDoneEmbedding, activePageIds, apexPageId, idb]);

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
        </Card>
        {status === "READY_TO_DISPLAY" && (
          <>
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
              viewMode === "scatter" ? (
                <SpGraph activePageIds={activePageIds} apexPageId={apexPageId} extensionAPI={extensionAPI} />
              ) : (
                <SpRankedList activePageIds={activePageIds} apexPageId={apexPageId} />
              )
            ) : (
              <>
                <Card elevation={Elevation.ONE}>
                  <ProgressBar value={loadingIncrement}></ProgressBar>
                  <p>
                    {status === "GETTING_GRAPH_STATS"
                      ? "Calculating graph distances..."
                      : status === "READY_TO_EMBED" && pagesLeft > 0
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
