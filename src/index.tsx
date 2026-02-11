import React from "react";
import ReactDOM from "react-dom";
import SPButton from "./components/sp-button";
import { ROOT_ID } from "./constants";

const panelConfig = {
  tabTitle: "Similar Pages",
  settings: [
    {
      id: "default-view",
      name: "Default View",
      description: "Choose whether to show the scatter plot or ranked list by default",
      action: {
        type: "select",
        items: ["scatter", "list"],
        onChange: () => {},
      },
    },
  ],
};

export default {
  onload: ({ extensionAPI }: { extensionAPI: RoamExtensionAPI }) => {
    extensionAPI.settings.panel.create(panelConfig);

    const container = document.getElementsByClassName("rm-topbar")[0];
    const root = document.createElement("div");
    root.id = `${ROOT_ID}`;

    const searchBox = container.getElementsByClassName("rm-find-or-create-wrapper")[0];
    searchBox.insertAdjacentElement("afterend", root);

    ReactDOM.render(
      <>
        <SPButton extensionAPI={extensionAPI} />
      </>,
      root
    );
  },
  onunload: () => {
    const root = document.getElementById(ROOT_ID);
    ReactDOM.unmountComponentAtNode(root);
    root.remove();
  },
};
