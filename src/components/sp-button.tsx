import React, { useCallback, useEffect, useState } from "react";
import { Button, Dialog, Classes, Icon } from "@blueprintjs/core";
import { SpBody } from "./sp-body";
import styles from "../styles/sp-button.module.css";

type SPButtonProps = {
  extensionAPI: RoamExtensionAPI;
};

const SPButton = ({ extensionAPI }: SPButtonProps) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [initialPageUid, setInitialPageUid] = useState<string | undefined>();

  const openModal = useCallback(() => {
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setInitialPageUid(undefined);
  }, []);

  useEffect(() => {
    const handler = (e: CustomEvent<{ uid: string }>) => {
      setInitialPageUid(e.detail.uid);
      setModalOpen(true);
    };
    document.addEventListener("sp-open", handler as EventListener);
    return () => document.removeEventListener("sp-open", handler as EventListener);
  }, []);

  return (
    <>
      <Button
        onClick={openModal}
        style={{ margin: "0 0 0 10px" }}
        className="bp3-button bp3-minimal bp3-small"
      >
        <Icon icon="scatter-plot"></Icon>
      </Button>
      <Dialog
        icon="scatter-plot"
        isOpen={modalOpen}
        onClose={closeModal}
        title="similar pages"
        style={{ width: "95%", maxWidth: "none", paddingBottom: 0, minHeight: "90vh" }}
      >
        <div className={`${Classes.DIALOG_BODY} ${styles.graphbodywrap} `}>
          {modalOpen && (
            <SpBody extensionAPI={extensionAPI} initialPageUid={initialPageUid} />
          )}
        </div>
      </Dialog>
    </>
  );
};

export default SPButton;
