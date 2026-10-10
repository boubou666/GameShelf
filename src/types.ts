export type Store = "steam" | "gog" | "epic";
export type Game = {
  id: string;
  store: Store;
  storeId: string;
  title: string;
  cover: string;
  installed: boolean;
  installPath: string;
  executable: string;
  launchId: string;
  favorite: boolean;
  lastPlayed: number;
  playtime: number;
  source: string;
};
export type Account = {
  store: Store;
  name: string;
  accountId: string;
  connected: boolean;
  lastSync: number;
};
export type Snapshot = {
  games: Game[];
  accounts: Account[];
  warnings: string[];
};
export const storeNames: Record<Store, string> = {
  steam: "Steam",
  gog: "GOG",
  epic: "Epic Games",
};
