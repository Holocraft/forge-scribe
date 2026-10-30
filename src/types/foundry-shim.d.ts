/**
 * The slice of Foundry v14 this module touches.
 * This is not the official type package. It exists so the module typechecks
 * without a Foundry install, and so a newcomer can see which globals we rely on.
 * If a call fails inside a real world, start here and compare with
 * https://foundryvtt.com/api/
 */

export {};

declare global {
  const Hooks: {
    once(hook: string, fn: (...args: any[]) => void): number;
    on(hook: string, fn: (...args: any[]) => void): number;
  };

  const ui: {
    notifications?: {
      info(message: string): void;
      warn(message: string): void;
      error(message: string): void;
    };
  };

  interface FolioDocument {
    id: string;
    name: string;
    uuid: string;
    system?: unknown;
    getFlag(scope: string, key: string): unknown;
    toObject(): Record<string, unknown>;
    toCompendium?(): Record<string, unknown>;
  }

  interface FolioCollection<T> {
    filter(predicate: (doc: T) => boolean): T[];
    get(id: string): T | undefined;
    documentClass?: { deleteDocuments(ids: string[]): Promise<unknown> };
  }

  interface FolioPack {
    collection: string;
    getIndex(): Promise<{ contents?: { _id?: string; id?: string; name?: string }[]; forEach?: (fn: (entry: { _id?: string; id?: string; name?: string }) => void) => void }>;
    getDocument(id: string): Promise<FolioDocument>;
    deleteCompendium(): Promise<void>;
  }

  const game: {
    user?: { isGM: boolean };
    system: { id: string; version: string };
    modules: { get(id: string): { api?: unknown } | undefined };
    settings: {
      register(module: string, key: string, data: object): void;
      registerMenu(module: string, key: string, data: object): void;
      get(module: string, key: string): unknown;
      set(module: string, key: string, value: unknown): Promise<unknown>;
    };
    packs: { get(id: string): FolioPack | undefined };
    actors: FolioCollection<FolioDocument>;
    journal: FolioCollection<FolioDocument>;
    folders: FolioCollection<FolioDocument>;
    i18n: { localize(key: string): string };
  };

  const Folder: { create(data: object): Promise<FolioDocument | null> };
  const JournalEntry: { create(data: object): Promise<FolioDocument | null> };
  const Actor: {
    create(data: object): Promise<FolioDocument | null>;
    deleteDocuments(ids: string[]): Promise<unknown>;
  };

  namespace foundry {
    namespace applications {
      namespace api {
        class ApplicationV2 {
          static DEFAULT_OPTIONS: Record<string, unknown>;
          element: HTMLElement;
          rendered: boolean;
          constructor(options?: object);
          render(force?: boolean): Promise<this>;
          close(options?: object): Promise<this>;
          _renderHTML(...args: unknown[]): Promise<unknown>;
          _replaceHTML(...args: unknown[]): void;
        }
        class DialogV2 {
          static confirm(options: { window?: { title?: string }; content?: string; modal?: boolean }): Promise<boolean | null>;
        }
      }
    }
    namespace documents {
      class Adventure {
        static create(data: object, context?: object): Promise<unknown>;
      }
      namespace collections {
        class CompendiumCollection {
          static createCompendium(metadata: object, options?: object): Promise<FolioPack>;
        }
      }
    }
  }

  const Dialog: {
    confirm(options: { title?: string; content?: string }): Promise<boolean | null>;
  };
}
