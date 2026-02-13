import Graph from "graphology";
import { singleSourceLength } from "graphology-shortest-path/unweighted";
import React from "react";
import { isRelevantPage, nodeArrToSelectablePage, pageToNode } from "../services/graph-manip";
import { getPagesAndBlocksWithRefs } from "../services/queries";
import {
  FastPage,
  IncomingNode,
  PPAGE_KEY,
  REF_KEY,
  TIME_KEY,
  TITLE_KEY,
  UID_KEY,
} from "../types";

function useGraphology(pagesAndBlocksFn = getPagesAndBlocksWithRefs) {
  const graph = React.useMemo(() => new Graph(), []);
  const [pageNodes, setPageNodes] = React.useState<Map<string, FastPage>>(new Map());

  const selectablePages = React.useMemo(() => {
    return Array.from(pageNodes.entries()).map(nodeArrToSelectablePage);
  }, [pageNodes]);

  const { pages: memoizedRoamPages, blocksWithRefs } = React.useMemo(
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
      if (typeof page[UID_KEY] === "string" && isRelevantPage(page[TITLE_KEY], page[UID_KEY], exclusions)) {
        graph.addNode(page[UID_KEY], pageToNode(page));
      }
    },
    [graph]
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

      // All non-excluded pages in the graph are selectable — BFS runs lazily on select
      setPageNodes(() => {
        const newPageNodes = new Map<string, FastPage>();
        graph.forEachNode((node) => {
          const pageData = memoizedRoamPages.get(node);
          if (pageData) {
            const { [TITLE_KEY]: title, [UID_KEY]: uid, [TIME_KEY]: time } = pageData;
            newPageNodes.set(node, { title, uid, time });
          }
        });
        return newPageNodes;
      });
    },
    [graph, memoizedRoamPages, blocksWithRefs, addNodeToGraph, addEdgeToGraph]
  );

  // Lazy BFS: compute shortest paths only for the selected page
  const getShortestPaths = React.useCallback(
    (nodeId: string) => {
      return singleSourceLength(graph, nodeId);
    },
    [graph]
  );

  return [graph, initializeGraph, memoizedRoamPages, selectablePages, getShortestPaths] as const;
}

export default useGraphology;
