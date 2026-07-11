import { IDBPDatabase } from "idb";
import React from "react";
import { DIJKSTRA_STORE, TITLE_STORE, SIMILARITY_STORE } from "../services/idb";
import { EnhancedPoint, PointWithTitleAndId } from "../types";

const TOP_CUTOFF = 20;

// `global` = rank the apex against the entire corpus (ranked-list view). Pages
// with no graph path to the apex are still candidates; they just contribute pure
// content similarity (no distance bonus) and are shown with a "—" distance.
// `global = false` = neighborhood only (scatter plot), where every point has a
// real graph distance to plot on the X axis.
function useVisx(
  apexPageId: string,
  activePageIds: string[],
  idb: React.MutableRefObject<IDBPDatabase | undefined>,
  global = false
) {
  const [graphData, setGraphData] = React.useState<EnhancedPoint[]>([]);
  const [apexData, setApexData] = React.useState<PointWithTitleAndId>();

  const markPageLinked = React.useCallback((pageId: string) => {
    setGraphData((prev) => {
      // The page is now a direct neighbor (distance 1, closest X). Update it in
      // place — reordering would drop it past the ranked list's top-N cap.
      const newX = Math.min(...prev.map((point) => point.x));
      return prev.map((point) =>
        point.uid === pageId ? { ...point, linked: true, x: newX, rawDistance: 1 } : point
      );
    });
  }, []);

  React.useEffect(() => {
    const initializeIdb = async () => {
      if (!idb.current) return;

      const [dijkstraValues, titleValues, similarityValues, dijkstraKeys, titleKeys, similarityKeys] =
        await Promise.all([
          idb.current.getAll(DIJKSTRA_STORE),
          idb.current.getAll(TITLE_STORE),
          idb.current.getAll(SIMILARITY_STORE),
          idb.current.getAllKeys(DIJKSTRA_STORE),
          idb.current.getAllKeys(TITLE_STORE),
          idb.current.getAllKeys(SIMILARITY_STORE),
        ]);

      // Index by key so lookups are O(1) — the corpus can be thousands of pages.
      const dijkstra = new Map(dijkstraKeys.map((key, i) => [key, dijkstraValues[i]]));
      const titles = new Map(titleKeys.map((key, i) => [key, titleValues[i]]));
      const similarities = new Map(similarityKeys.map((key, i) => [key, similarityValues[i]]));

      const apexTitle = titles.get(apexPageId);

      type Candidate = { pageId: string; title: string; similarity: number; distance: number };
      const candidates: Candidate[] = [];

      for (const pageId of activePageIds) {
        if (pageId === apexPageId) continue;
        const similarity = similarities.get(pageId) as number | undefined;
        const title = titles.get(pageId) as string | undefined;
        if (similarity === undefined || title === undefined) continue;

        const rawDijkstra = dijkstra.get(pageId) as number | undefined;
        const connected = rawDijkstra !== undefined && Number.isFinite(rawDijkstra);
        // Scatter plot can only place points that have a graph distance.
        if (!global && !connected) continue;

        candidates.push({ pageId, title, similarity, distance: connected ? rawDijkstra : Infinity });
      }

      const finiteDistances = candidates.filter((c) => Number.isFinite(c.distance)).map((c) => c.distance);
      const maxX = finiteDistances.length > 0 ? Math.max(...finiteDistances) : 1;

      const points: EnhancedPoint[] = candidates.map(({ pageId, title, similarity, distance }) => {
        const connected = Number.isFinite(distance);
        const scaledX = connected ? distance / maxX : 0;
        // Similarity dominates; distance is a small discovery boost (far + similar
        // = surprising find). Unconnected pages get no boost — pure similarity.
        const score = similarity + scaledX * 0.1;
        return {
          x: scaledX,
          y: similarity,
          title,
          uid: pageId,
          linked: false,
          rawDistance: distance,
          score,
          isTop: false,
        };
      });

      const topIndex = points.length / TOP_CUTOFF;
      const ranked = points
        .sort((a, b) => b.score - a.score)
        .map((point, i) => ({ ...point, isTop: i < topIndex }));

      setGraphData(ranked);
      setApexData({ x: 0, y: 0, title: apexTitle, uid: apexPageId, linked: false });
    };

    initializeIdb();
  }, [activePageIds, apexPageId, idb, global]);

  return { graphData, apexData, markPageLinked };
}

export { useVisx };
