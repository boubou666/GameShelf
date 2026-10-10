import { test } from "node:test";
import assert from "node:assert/strict";
import { filterGames, groupCopies } from "../src/library";
import type { Game } from "../src/types";
const base: Game = {
  id: "steam:1",
  store: "steam",
  storeId: "1",
  title: "Hades",
  cover: "",
  installed: true,
  installPath: "",
  executable: "",
  launchId: "1",
  favorite: false,
  lastPlayed: 0,
  playtime: 100,
  source: "local",
};
const library: Game[] = [
  base,
  {
    ...base,
    id: "gog:2",
    store: "gog",
    title: "Hades",
    installed: false,
    favorite: true,
    lastPlayed: 123,
  },
  {
    ...base,
    id: "steam:3",
    title: "No Man’s Sky",
    favorite: true,
    playtime: 500,
  },
];
test("search, platform, and installation filters intersect", () => {
  assert.deepEqual(
    filterGames(library, {
      query: "hades",
      store: "gog",
      view: "installed",
      sort: "title",
    }),
    [],
  );
  assert.equal(
    filterGames(library, {
      query: "NO sky",
      store: "all",
      view: "favorites",
      sort: "title",
    })[0].id,
    "steam:3",
  );
});
test("separate store copies survive filtering", () => {
  assert.equal(
    filterGames(library, {
      query: "Hades",
      store: "all",
      view: "all",
      sort: "title",
    }).length,
    2,
  );
  assert.equal(groupCopies(library), 2);
});
test("recent launch order does not mutate the library", () => {
  assert.equal(
    filterGames(library, {
      query: "",
      store: "all",
      view: "all",
      sort: "recent",
    })[0].id,
    "gog:2",
  );
  assert.equal(library[0].id, "steam:1");
});
