import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Game, Snapshot } from "./types";
export const desktop = isTauri();
const seed: [string, string, string][] = [
  ["1245620", "ELDEN RING", "steam"],
  ["1145360", "Hades", "steam"],
  ["1091500", "Cyberpunk 2077", "gog"],
  ["275850", "No Man’s Sky", "steam"],
  ["413150", "Stardew Valley", "steam"],
  ["105600", "Terraria", "steam"],
  ["1174180", "Red Dead Redemption 2", "epic"],
  ["570940", "DARK SOULS: REMASTERED", "steam"],
];
function preview(): Snapshot {
  const favorites = JSON.parse(
    localStorage.getItem("gameshelf.preview.favorites") || "[]",
  ) as string[];
  return {
    games: seed.map(([id, title, store], i) => ({
      id: `${store}:${id}`,
      store: store as Game["store"],
      storeId: id,
      title,
      cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900_2x.jpg`,
      installed: i % 3 !== 2,
      installPath: "",
      executable: "",
      launchId: id,
      favorite: favorites.includes(`${store}:${id}`),
      lastPlayed: 0,
      playtime: 0,
      source: "preview",
    })),
    accounts: [],
    warnings: [],
  };
}
export async function call<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (desktop) return invoke<T>(command, args);
  if (command === "get_library" || command === "scan_installed")
    return preview() as T;
  if (command === "set_favorite") {
    const favorites = new Set<string>(
      JSON.parse(localStorage.getItem("gameshelf.preview.favorites") || "[]"),
    );
    if (args?.value) favorites.add(args.id as string);
    else favorites.delete(args?.id as string);
    localStorage.setItem(
      "gameshelf.preview.favorites",
      JSON.stringify([...favorites]),
    );
    return undefined as T;
  }
  throw new Error(
    "This is the browser preview. Open the GameShelf desktop app to connect accounts and launch games.",
  );
}
