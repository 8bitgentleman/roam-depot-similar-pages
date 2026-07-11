import Graph from "graphology";
import { singleSourceLength } from "graphology-shortest-path/unweighted";
import React from "react";
import { isRelevantPage, pageToNode } from "../services/graph-manip";
import { getPagesAndBlocksWithRefs } from "../services/queries";
import { IncomingNode, PPAGE_KEY, REF_KEY, TITLE_KEY, UID_KEY } from "../types";

function useGraphology(pagesAndBlocksFn = getPagesAndBlocksWithRefs) {
  const graph = React.useMemo(() => new Graph(), []);

  const { pages: memoizedRoamPages, attributeUids, blocksWithRefs } = React.useMemo(
    () => pagesAndBlocksFn(),
    [pagesAndBlocksFn]
  );

  const addEdgeToGraph = React.useCallback(
    (sourceUid: string, targetUid: string) => {
      if (graph.hasNode(sourceUid) && graph.hasNode(targetUid)) {
        if (!graph.hasEdge(sourceUid, targetUid)) {
          graph.addEdge(sourceUid, targetUid);
        } else {
          graph.updateEdgeAttribute(sourceUid, targetUid, "weight", (w) => w + 1);
        }
      }
    },
    [graph]
  );

  const addNodeToGraph = React.useCallback(
    (page: IncomingNode, exclusions: string[] = []) => {
      const uid = page[UID_KEY];
      // Attribute pages are kept out of the graph topology so they don't distort
      // link distances (they're often hubs like `Status`/`Author`).
      if (
        typeof uid === "string" &&
        !attributeUids.has(uid) &&
        isRelevantPage(page[TITLE_KEY], uid, exclusions)
      ) {
        graph.addNode(uid, pageToNode(page));
      }
    },
    [graph, attributeUids]
  );

  const initializeGraph = React.useCallback(
    async (exclusions: string[] = []) => {
      memoizedRoamPages.forEach((page) => addNodeToGraph(page, exclusions));

      for (let i = 0; i < blocksWithRefs.length; i += 1) {
        const sourceBlock = blocksWithRefs[i][0];
        const sourceBlockPageUid = sourceBlock?.[PPAGE_KEY]?.[UID_KEY];

        if (sourceBlockPageUid) {
          const sourceRefs = sourceBlock?.[REF_KEY] ?? [];

          for (let j = 0; j < sourceRefs.length; j += 1) {
            const targetRef = sourceRefs[j];

            if (targetRef[TITLE_KEY]) {
              addEdgeToGraph(sourceBlockPageUid, targetRef[UID_KEY]);
            } else if (targetRef[PPAGE_KEY]) {
              addEdgeToGraph(sourceBlockPageUid, targetRef[PPAGE_KEY][UID_KEY]);
            }
          }
        }
      }
    },
    [memoizedRoamPages, blocksWithRefs, addNodeToGraph, addEdgeToGraph]
  );

  // Lazy BFS: compute shortest paths only for the selected page
  const getShortestPaths = React.useCallback(
    (nodeId: string) => {
      return singleSourceLength(graph, nodeId);
    },
    [graph]
  );

  return [
    graph,
    initializeGraph,
    memoizedRoamPages,
    attributeUids,
    getShortestPaths,
  ] as const;
}

export default useGraphology;
