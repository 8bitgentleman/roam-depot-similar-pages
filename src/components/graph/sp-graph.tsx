import React from "react";
import { IDBPDatabase } from "idb";
import ParentSize from "@visx/responsive/lib/components/ParentSize";
import SpDots from "./sp-dots";
import { useVisx } from "../../hooks/useVisx";

type SpGraphProps = {
  activePageIds: string[];
  apexPageId: string;
  extensionAPI: RoamExtensionAPI;
  idb: React.MutableRefObject<IDBPDatabase | undefined>;
};

const SpGraph = ({ activePageIds, apexPageId, extensionAPI, idb }: SpGraphProps) => {
  const { graphData, apexData, markPageLinked } = useVisx(apexPageId, activePageIds, idb);

  return graphData.length > 0 ? (
    <ParentSize>
      {({ width, height }) => (
        <SpDots
          width={width}
          height={height}
          graphData={graphData}
          apexData={apexData}
          markPageLinked={markPageLinked}
          extensionAPI={extensionAPI}
        />
      )}
    </ParentSize>
  ) : (
    <>no data to graph</>
  );
};

export default SpGraph;
