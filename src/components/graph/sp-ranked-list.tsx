import React, { useState, useCallback } from "react";
import { Alert, Tag, Intent } from "@blueprintjs/core";
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

type SpRankedListProps = {
  activePageIds: string[];
  apexPageId: string;
};

const SpRankedList = ({ activePageIds, apexPageId }: SpRankedListProps) => {
  const { graphData, apexData, markPageLinked } = useVisx(apexPageId, activePageIds);
  const [alertProps, setAlertProps] = useState<AlertAttributes>({ ...DEFAULT_ALERT_ATTRIBUTES });
  const [selectedPoint, setSelectedPoint] = useState<EnhancedPoint | null>(null);

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
    return <>no data to display</>;
  }

  return (
    <div className={styles.container}>
      <table className={`bp3-html-table bp3-html-table-striped bp3-interactive ${styles.table}`}>
        <thead>
          <tr>
            <th>#</th>
            <th>Page</th>
            <th>Similarity</th>
            <th>Distance</th>
          </tr>
        </thead>
        <tbody>
          {graphData.map((point, i) => {
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
                <td>
                  <div className={styles.barWrap}>
                    <div className={styles.bar} style={{ width: `${similarityPct}%` }} />
                    <span className={styles.barLabel}>{similarityPct}%</span>
                  </div>
                </td>
                <td>
                  <Tag minimal round>
                    {point.rawDistance}
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
