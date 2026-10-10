import type { Game, Store } from "./types";
export type LibraryFilter = {
  query: string;
  store: Store | "all";
  view: "all" | "installed" | "favorites";
  sort: "title" | "recent" | "playtime";
};
export function filterGames(games: Game[], filter: LibraryFilter): Game[] {
  const terms = filter.query
    .toLocaleLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return games
    .filter(
      (g) =>
        (filter.store === "all" || g.store === filter.store) &&
        (filter.view !== "installed" || g.installed) &&
        (filter.view !== "favorites" || g.favorite) &&
        terms.every((t) => g.title.toLocaleLowerCase().includes(t)),
    )
    .sort((a, b) =>
      filter.sort === "recent"
        ? b.lastPlayed - a.lastPlayed || a.title.localeCompare(b.title)
        : filter.sort === "playtime"
          ? b.playtime - a.playtime || a.title.localeCompare(b.title)
          : a.title.localeCompare(b.title),
    );
}
export function groupCopies(games: Game[]): number {
  return new Set(
    games.map((g) =>
      g.title
        .toLocaleLowerCase()
        .replace(/[™®]/g, "")
        .trim(),
    ),
  ).size;
}
export function timeLabel(minutes: number): string {
  return minutes < 60
    ? `${minutes} min`
    : `${Math.round(minutes / 6) / 10} hrs`;
}
