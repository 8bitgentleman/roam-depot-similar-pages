import React, { useState, useCallback, useMemo } from "react";
import { IDBPDatabase } from "idb";
import { Alert, Tag, Intent, Icon } from "@blueprintjs/core";
import { useVisx } from "../../hooks/useVisx";
import { linkPagesAsync } from "../../services/graph-manip";
import { tooltipMessageGenerator } from "../../services/tooltip-message-generator";
import {
  DEFAULT_ALERT_ATTRIBUTES,
  NEIGHBOOR_ALERT_ATTRIBUTES,
  LINK_ALERT_ATTRIBUTES,
} from "../../constants";
import { AlertAttributes, EnhancedPoint } from "../../types";
import styles from "../../styles/sp-ranked-list.module.css";

type SortKey = "score" | "y" | "rawDistance" | "title";
type SortDir = "asc" | "desc";

type SpRankedListProps = {
  activePageIds: string[];
  apexPageId: string;
  idb: React.MutableRefObject<IDBPDatabase | undefined>;
  disconnected?: boolean;
};

const SpRankedList = ({ activePageIds, apexPageId, idb, disconnected = false }: SpRankedListProps) => {
  const { graphData, apexData, markPageLinked } = useVisx(apexPageId, activePageIds, idb, disconnected);
  const [alertProps, setAlertProps] = useState<AlertAttributes>({ ...DEFAULT_ALERT_ATTRIBUTES });
  const [selectedPoint, setSelectedPoint] = useState<EnhancedPoint | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "desc" ? "asc" : "desc"));
        return prev;
      }
      setSortDir("desc");
      return key;
    });
  }, []);

  const sortedData = useMemo(() => {
    const sorted = [...graphData].sort((a, b) => {
      if (sortKey === "title") {
        return a.title.localeCompare(b.title);
      }
      return a[sortKey] - b[sortKey];
    });
    return sortDir === "desc" ? sorted.reverse() : sorted;
  }, [graphData, sortKey, sortDir]);

  const handleRowClick = useCallback(
    (point: EnhancedPoint) => {
      const alreadyNeighbors = point.rawDistance === 1;
      const baseAttributes = alreadyNeighbors ? NEIGHBOOR_ALERT_ATTRIBUTES : LINK_ALERT_ATTRIBUTES;
      const message = tooltipMessageGenerator(point.title, apexData.title, alreadyNeighbors);
      setSelectedPoint(point);
      setAlertProps({ ...baseAttributes, message });
    },
    [apexData]
  );

  const handleLinkConfirm = useCallback(async () => {
    if (selectedPoint) {
      await linkPagesAsync(apexData, selectedPoint.title);
      markPageLinked(selectedPoint.uid);
    }
    setAlertProps({ ...DEFAULT_ALERT_ATTRIBUTES });
    setSelectedPoint(null);
  }, [selectedPoint, apexData, markPageLinked]);

  const handleLinkCancel = useCallback(() => {
    setAlertProps({ ...DEFAULT_ALERT_ATTRIBUTES });
    setSelectedPoint(null);
  }, []);

  if (graphData.length === 0) {
    return (
      <>
        No similar pages found. This graph may not have enough pages with
        content to compare against yet.
      </>
    );
  }

  return (
    <div className={styles.container}>
      <table className={`bp3-html-table bp3-html-table-striped bp3-interactive ${styles.table}`}>
        <thead>
          <tr>
            <th>#</th>
            <th onClick={() => handleSort("title")} className={styles.sortable}>
              Page <Icon icon={sortKey === "title" ? (sortDir === "desc" ? "caret-down" : "caret-up") : "double-caret-vertical"} />
            </th>
            <th onClick={() => handleSort("score")} className={styles.sortable}>
              Score <Icon icon={sortKey === "score" ? (sortDir === "desc" ? "caret-down" : "caret-up") : "double-caret-vertical"} />
            </th>
            <th onClick={() => handleSort("y")} className={styles.sortable}>
              Similarity <Icon icon={sortKey === "y" ? (sortDir === "desc" ? "caret-down" : "caret-up") : "double-caret-vertical"} />
            </th>
            <th onClick={() => handleSort("rawDistance")} className={styles.sortable}>
              Distance <Icon icon={sortKey === "rawDistance" ? (sortDir === "desc" ? "caret-down" : "caret-up") : "double-caret-vertical"} />
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedData.map((point, i) => {
            const similarityPct = Math.round(point.y * 100);
            return (
              <tr
                key={point.uid}
                onClick={() => handleRowClick(point)}
                className={point.linked ? styles.linked : ""}
              >
                <td className={styles.rank}>{i + 1}</td>
                <td className={styles.pageTitle}>
                  {point.title}
                  {point.isTop && (
                    <Tag minimal intent={Intent.SUCCESS} className={styles.topTag}>
                      top
                    </Tag>
                  )}
                  {point.linked && (
                    <Tag minimal intent={Intent.PRIMARY} className={styles.topTag}>
                      linked
                    </Tag>
                  )}
                </td>
                <td className={styles.rank}>{Math.round(point.score * 100)}</td>
                <td>
                  <div className={styles.barWrap}>
                    <div className={styles.bar} style={{ width: `${similarityPct}%` }} />
                    <span className={styles.barLabel}>{similarityPct}%</span>
                  </div>
                </td>
                <td>
                  <Tag minimal round>
                    {disconnected || !isFinite(point.rawDistance) ? "—" : point.rawDistance}
                  </Tag>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Alert
        cancelButtonText={alertProps.cancelButtonText}
        confirmButtonText={alertProps.confirmButtonText}
        icon="new-link"
        intent={alertProps.intent}
        isOpen={!!alertProps.message}
        onCancel={handleLinkCancel}
        onConfirm={handleLinkConfirm}
      >
        {alertProps.message}
      </Alert>
    </div>
  );
};

export default SpRankedList;
