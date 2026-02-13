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
    {
      id: "show-voronoi",
      name: "Show Voronoi Overlay",
      description: "Show voronoi polygons on the scatter plot by default",
      action: {
        type: "switch",
        onChange: () => {},
      },
    },
    {
      id: "hide-dot-pages",
      name: "Hide Dot-Prefixed Pages",
      description: "Exclude pages starting with '.' (e.g. .rm-doc)",
      action: {
        type: "switch",
        onChange: () => {},
      },
    },
    {
      id: "hide-roam-pages",
      name: "Hide roam/ Pages",
      description: "Exclude pages in the roam/ namespace",
      action: {
        type: "switch",
        onChange: () => {},
      },
    },
    {
      id: "custom-exclusions",
      name: "Custom Exclusions",
      description: "Comma-separated prefixes to exclude (e.g. 'Archive,Template')",
      action: {
        type: "input",
        placeholder: "Archive,Template",
        onChange: () => {},
      },
    },
    {
      id: "skip-codeblocks",
      name: "Skip Codeblocks",
      description: "Exclude code blocks from semantic embeddings",
      action: {
        type: "switch",
        onChange: () => {},
      },
    },
  ],
};

export default {
  onload: ({ extensionAPI }: { extensionAPI: RoamExtensionAPI }) => {
    extensionAPI.settings.panel.create(panelConfig);

    // Set defaults for switch settings (Roam doesn't auto-set defaults)
    if (extensionAPI.settings.get("hide-dot-pages") == null) {
      extensionAPI.settings.set("hide-dot-pages", true);
    }
    if (extensionAPI.settings.get("hide-roam-pages") == null) {
      extensionAPI.settings.set("hide-roam-pages", true);
    }
    if (extensionAPI.settings.get("skip-codeblocks") == null) {
      extensionAPI.settings.set("skip-codeblocks", true);
    }

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

    window.roamAlphaAPI.ui.pageContextMenu.addCommand({
      label: "Similar Pages: Find similar",
      callback: (ctx: { "page-uid": string }) => {
        document.dispatchEvent(
          new CustomEvent("sp-open", { detail: { uid: ctx["page-uid"] } })
        );
      },
    });
  },
  onunload: () => {
    const root = document.getElementById(ROOT_ID);
    ReactDOM.unmountComponentAtNode(root);
    root.remove();

    window.roamAlphaAPI.ui.pageContextMenu.removeCommand({
      label: "Similar Pages: Find similar",
    });
  },
};
