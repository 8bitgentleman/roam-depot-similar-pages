declare module "*.module.css";

interface Window {
  roamAlphaAPI: any;
}

type RoamExtensionAPI = {
  settings: {
    get: (key: string) => any;
    set: (key: string, value: any) => void;
    getAll: () => Record<string, any>;
    panel: {
      create: (config: {
        tabTitle: string;
        settings: Array<{
          id: string;
          name: string;
          description?: string;
          action: Record<string, any>;
        }>;
      }) => void;
    };
  };
  ui: {
    commandPalette: {
      addCommand: (cmd: { label: string; callback: () => void }) => void;
      removeCommand: (cmd: { label: string }) => void;
    };
  };
};
