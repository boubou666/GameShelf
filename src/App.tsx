import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  Gamepad2,
  Grid2X2,
  Layers3,
  LibraryBig,
  List,
  LoaderCircle,
  Monitor,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
  Unplug,
  X,
} from "lucide-react";
import { call, desktop } from "./bridge";
import { filterGames, groupCopies, timeLabel } from "./library";
import type { Account, Game, Snapshot, Store } from "./types";
import { storeNames } from "./types";

const stores: Store[] = ["steam", "gog", "epic"];
const empty: Snapshot = { games: [], accounts: [], warnings: [] };
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
function StoreIcon({ store }: { store: Store }) {
  return (
    <span className={`store-icon ${store}`} aria-hidden="true">
      {store === "steam" ? (
        <Gamepad2 size={17} />
      ) : store === "gog" ? (
        <span>gog</span>
      ) : (
        <span>EPIC</span>
      )}
    </span>
  );
}
function Cover({ game, className = "" }: { game: Game; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [game.cover]);
  return (
    <div className={`cover ${className}`}>
      {game.cover && !failed ? (
        <img
          src={game.cover}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className={`cover-fallback ${game.store}`}>
          <Layers3 size={38} />
          <span>{game.title}</span>
        </div>
      )}
    </div>
  );
}
function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const dialog = ref.current;
    dialog?.querySelector<HTMLElement>("button,input")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const items = dialog?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select,a[href],textarea",
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`dialog ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="dialog-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Connection({
  store,
  account,
  onClose,
  onUpdate,
  steamIdentity,
}: {
  store: Store;
  account?: Account;
  onClose: () => void;
  onUpdate: (snapshot: Snapshot) => void;
  steamIdentity: string;
}) {
  const [code, setCode] = useState("");
  const [steamId, setSteamId] = useState(
    steamIdentity || account?.accountId || "",
  );
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (steamIdentity) setSteamId(steamIdentity);
  }, [steamIdentity]);
  async function login() {
    setError("");
    try {
      await call("start_login", { store });
      setOpened(true);
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const s = await call<Snapshot>("connect_account", {
        store,
        code,
        steamId,
        apiKey,
      });
      setCode("");
      setApiKey("");
      onUpdate(s);
      onClose();
    } catch (e) {
      setError(errorText(e));
      try {
        onUpdate(await call<Snapshot>("get_library"));
      } catch {
        /* Keep the current UI if the database is temporarily unavailable. */
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={`Connect ${storeNames[store]}`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="connect-intro">
        <StoreIcon store={store} />
        <p>
          Bring your {storeNames[store]} games onto your shelf.
          <br />
          <span>You sign in on the store’s own website.</span>
        </p>
      </div>
      <button className="button browser-login" onClick={login} disabled={busy}>
        <ExternalLink size={17} />
        {opened ? "Open sign-in again" : `Sign in with ${storeNames[store]}`}
      </button>
      <form onSubmit={submit}>
        {store === "steam" ? (
          <>
            <label>
              SteamID64
              <input
                value={steamId}
                onChange={(e) => setSteamId(e.target.value)}
                placeholder="17-digit Steam account ID"
                autoComplete="off"
                required
                inputMode="numeric"
                pattern="[0-9]{17}"
              />
            </label>
            <p className="field-help">
              Steam sign-in fills this automatically. You can also enter your
              SteamID64.
            </p>
            <label>
              Steam Web API key
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Your personal API key"
                autoComplete="off"
                required
                minLength={32}
                maxLength={32}
              />
            </label>
            <p className="field-help">
              Needed to import your owned library.{" "}
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  call("open_store_page", { store: "steam" }).catch((e) =>
                    setError(errorText(e)),
                  )
                }
              >
                Get a key on Steam <ExternalLink size={12} />
              </button>{" "}
              Steam’s API respects your Game details privacy settings.
            </p>
          </>
        ) : (
          <>
            <label>
              {store === "epic"
                ? "One-time login response"
                : "Login redirect URL or one-time code"}
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={
                  store === "epic"
                    ? "Paste the JSON response containing authorizationCode"
                    : "Paste the final embed.gog.com/on_login_success URL"
                }
                autoComplete="off"
                required
                rows={3}
              />
            </label>
            <p className="field-help">
              {store === "epic"
                ? "After signing in, copy the authorizationCode or complete JSON response from Epic’s page."
                : "After signing in, copy the final URL from the browser address bar. It contains a code used once to connect your account."}{" "}
              If the code expires, sign in again.
            </p>
          </>
        )}
        <div className="privacy-note">
          <ShieldCheck size={17} />
          <span>
            Account tokens stay in Windows Credential Manager. GameShelf never
            asks for your store password.
          </span>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary full" disabled={busy}>
          {busy ? (
            <>
              <LoaderCircle className="spin" size={17} />
              Connecting & importing…
            </>
          ) : (
            <>
              <Plus size={17} />
              Connect library
            </>
          )}
        </button>
      </form>
    </Dialog>
  );
}

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>(empty);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [view, setView] = useState<
    "all" | "installed" | "favorites" | "accounts"
  >("all");
  const [store, setStore] = useState<Store | "all">("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"title" | "recent" | "playtime">("title");
  const [layout, setLayout] = useState<"grid" | "list">(() =>
    localStorage.getItem("gameshelf.layout") === "list" ? "list" : "grid",
  );
  const [connection, setConnection] = useState<Store | null>(null);
  const [selected, setSelected] = useState<Game | null>(null);
  const [disconnect, setDisconnect] = useState<Store | null>(null);
  const [notice, setNotice] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const [steamIdentity, setSteamIdentity] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const notify = (message: string, error = false) =>
    setNotice({ message, error });
  useEffect(() => {
    let mounted = true;
    call<Snapshot>("get_library")
      .then((s) => {
        if (mounted) setSnapshot(s);
      })
      .catch((e) => {
        if (mounted) notify(errorText(e), true);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    let disposed = false;
    const cleanups: (() => void)[] = [];
    if (desktop) {
      listen<{ accountId: string }>("steam-identity", (e) => {
        setSteamIdentity(e.payload.accountId);
        notify(
          "Steam identity verified. Add your API key to import your library.",
        );
      }).then((f) => (disposed ? f() : cleanups.push(f)));
      listen<string>("steam-auth-error", (e) => notify(e.payload, true)).then(
        (f) => (disposed ? f() : cleanups.push(f)),
      );
    }
    return () => {
      disposed = true;
      cleanups.forEach((f) => f());
    };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(
      () => setNotice(null),
      notice.error ? 12000 : 5000,
    );
    return () => clearTimeout(timer);
  }, [notice]);
  const games = useMemo(
    () =>
      filterGames(snapshot.games, {
        query,
        store,
        view: view === "accounts" ? "all" : view,
        sort,
      }),
    [snapshot.games, query, store, view, sort],
  );
  const installed = snapshot.games.filter((g) => g.installed).length;
  const favorites = snapshot.games.filter((g) => g.favorite).length;
  const featured = useMemo(
    () =>
      [...snapshot.games].sort(
        (a, b) =>
          b.lastPlayed - a.lastPlayed ||
          Number(b.installed) - Number(a.installed) ||
          a.title.localeCompare(b.title),
      )[0],
    [snapshot.games],
  );
  const accounts = new Map(snapshot.accounts.map((a) => [a.store, a]));
  function choose(v: typeof view, s: typeof store = "all") {
    setView(v);
    setStore(s);
    setQuery("");
  }
  async function refresh() {
    setBusy(true);
    setBusyLabel("Scanning installations…");
    const errors: string[] = [];
    let current = snapshot;
    try {
      current = await call<Snapshot>("scan_installed");
      setSnapshot(current);
      for (const account of current.accounts) {
        setBusyLabel(`Syncing ${storeNames[account.store]}…`);
        try {
          current = await call<Snapshot>("sync_store", {
            store: account.store,
          });
          setSnapshot(current);
        } catch (e) {
          errors.push(errorText(e));
        }
      }
      notify(
        errors.length ? errors.join(" ") : "Your shelf is up to date.",
        errors.length > 0,
      );
    } catch (e) {
      notify(errorText(e), true);
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }
  async function toggleFavorite(g: Game) {
    const next = !g.favorite;
    try {
      await call("set_favorite", { id: g.id, value: next });
      setSnapshot((s) => ({
        ...s,
        games: s.games.map((x) =>
          x.id === g.id ? { ...x, favorite: next } : x,
        ),
      }));
      setSelected((s) => (s?.id === g.id ? { ...s, favorite: next } : s));
    } catch (e) {
      notify(errorText(e), true);
    }
  }
  async function launch(g: Game) {
    setBusy(true);
    setBusyLabel(g.installed ? "Opening game…" : "Opening store…");
    try {
      await call("launch_game", { id: g.id, install: !g.installed });
      if (g.installed) {
        setSnapshot(await call<Snapshot>("get_library"));
        notify(`Launch request sent for ${g.title}.`);
      } else {
        notify(`Opened ${storeNames[g.store]} to install ${g.title}.`);
      }
    } catch (e) {
      notify(errorText(e), true);
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }
  async function syncOne(s: Store) {
    setBusy(true);
    setBusyLabel(`Syncing ${storeNames[s]}…`);
    try {
      setSnapshot(await call<Snapshot>("sync_store", { store: s }));
      notify(`${storeNames[s]} library synced.`);
    } catch (e) {
      notify(errorText(e), true);
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }
  async function doDisconnect() {
    if (!disconnect) return;
    setBusy(true);
    try {
      setSnapshot(
        await call<Snapshot>("disconnect_account", { store: disconnect }),
      );
      setDisconnect(null);
      notify("Account disconnected. Installed games remain on your shelf.");
    } catch (e) {
      notify(errorText(e), true);
    } finally {
      setBusy(false);
    }
  }
  const title =
    view === "accounts"
      ? "Your connections"
      : view === "installed"
        ? "Ready to play"
        : view === "favorites"
          ? "Your favorites"
          : store === "all"
            ? "Your library"
            : `${storeNames[store]} library`;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => choose("all")}
          aria-label="GameShelf home"
        >
          <span className="brand-mark">
            <LibraryBig size={24} />
          </span>
          <span>
            gameshelf<span className="brand-dot">.</span>
          </span>
        </button>
        <div className="workspace-label">YOUR SPACE</div>
        <nav aria-label="Library navigation">
          <button
            className={`nav-item ${view === "all" && store === "all" ? "active" : ""}`}
            onClick={() => choose("all")}
          >
            <LibraryBig size={18} />
            <span>All games</span>
            <span className="nav-count">{snapshot.games.length}</span>
          </button>
          <button
            className={`nav-item ${view === "installed" ? "active" : ""}`}
            onClick={() => choose("installed")}
          >
            <Monitor size={18} />
            <span>Installed</span>
            <span className="nav-count">{installed}</span>
          </button>
          <button
            className={`nav-item ${view === "favorites" ? "active" : ""}`}
            onClick={() => choose("favorites")}
          >
            <Star size={18} />
            <span>Favorites</span>
            <span className="nav-count">{favorites}</span>
          </button>
        </nav>
        <div className="workspace-label platform-label">
          PLATFORMS{" "}
          <button
            className="icon-button small"
            aria-label="Manage connections"
            onClick={() => choose("accounts")}
          >
            <Plus size={15} />
          </button>
        </div>
        <nav aria-label="Platform navigation">
          {stores.map((s) => (
            <button
              key={s}
              className={`nav-item platform ${store === s && view === "all" ? "active" : ""}`}
              onClick={() => choose("all", s)}
            >
              <StoreIcon store={s} />
              <span>{storeNames[s]}</span>
              <span
                className={`connection-dot ${accounts.has(s) ? "connected" : ""}`}
                title={accounts.has(s) ? "Account linked" : "Local games only"}
              />
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="shelf-note">
            <span className="tiny-mark">
              <Layers3 size={22} />
            </span>
            <p>
              Good games.
              <br />
              One place.
            </p>
            <span>
              Your next adventure
              <br />
              is already on the shelf.
            </span>
          </div>
          <button
            className={`nav-item ${view === "accounts" ? "active" : ""}`}
            onClick={() => choose("accounts")}
          >
            <Unplug size={18} />
            <span>Connections</span>
            <span className="nav-count">{snapshot.accounts.length}/3</span>
          </button>
          <div className="version">
            <span className="status-dot" />
            Local first <span>v0.1.0</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Your space <span>/</span>{" "}
            <strong>{view === "accounts" ? "Connections" : "Library"}</strong>
          </div>
          <div className="topbar-actions">
            {!desktop && (
              <span className="preview-badge">
                Browser preview · sample games
              </span>
            )}
            <span className="local-badge">
              <ShieldCheck size={14} />
              Stored on this PC
            </span>
            <button
              className="button compact"
              onClick={() => choose("accounts")}
            >
              <Plus size={15} />
              Connect a store
            </button>
          </div>
        </header>
        <main>
          {view === "accounts" ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">A PLACE FOR EVERY LIBRARY</div>
                  <h1>
                    {title}
                    <span>.</span>
                  </h1>
                  <p>Connect once. Keep your games together.</p>
                </div>
              </div>
              <div className="account-cards">
                {stores.map((s) => {
                  const a = accounts.get(s);
                  const count = snapshot.games.filter(
                    (g) => g.store === s,
                  ).length;
                  return (
                    <article className={`account-card ${s}`} key={s}>
                      <div className="account-card-top">
                        <StoreIcon store={s} />
                        <span className={`account-status ${a ? "linked" : ""}`}>
                          {a ? (
                            <>
                              <CheckCircle2 size={13} />
                              Linked
                            </>
                          ) : (
                            "Not connected"
                          )}
                        </span>
                      </div>
                      <h2>{storeNames[s]}</h2>
                      <p>{a ? a.name : "Bring your whole library along."}</p>
                      <div className="account-summary">
                        <strong>{count}</strong>
                        <span>games on your shelf</span>
                      </div>
                      {a?.lastSync ? (
                        <span className="sync-time">
                          Last synced{" "}
                          {new Date(a.lastSync * 1000).toLocaleString()}
                        </span>
                      ) : (
                        <span className="sync-time">
                          Installed games can appear without sign-in.
                        </span>
                      )}
                      <button
                        className={`button full ${a ? "" : "primary"}`}
                        disabled={busy}
                        onClick={() => (a ? syncOne(s) : setConnection(s))}
                      >
                        {a ? (
                          <>
                            <RefreshCw size={16} />
                            Sync library
                          </>
                        ) : (
                          <>
                            <Plus size={16} />
                            Connect {storeNames[s]}
                          </>
                        )}
                      </button>
                      {a && (
                        <div className="account-links">
                          <button
                            className="text-button"
                            onClick={() => setConnection(s)}
                          >
                            Reconnect
                          </button>
                          <button
                            className="text-button danger"
                            onClick={() => setDisconnect(s)}
                          >
                            Disconnect
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
              <div className="info-panel">
                <ShieldCheck size={24} />
                <div>
                  <h3>Your accounts stay yours.</h3>
                  <p>
                    Sign in through each store’s official website. Tokens are
                    kept in Windows Credential Manager; your game library is
                    cached on this PC for offline browsing.
                  </p>
                </div>
              </div>
              <div className="integration-note">
                <h3>How launching and installing works</h3>
                <p>
                  Steam and Epic games open through their installed launchers.
                  GOG games launch from their detected executable; installation
                  opens your GOG library. Direct downloads and cloud-save
                  management are planned for a later version.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">ALL YOUR WORLDS, TOGETHER</div>
                  <h1>
                    {title}
                    <span>.</span>
                  </h1>
                  <p>
                    {loading
                      ? "Finding your games…"
                      : snapshot.games.length
                        ? `${groupCopies(snapshot.games)} titles. Three platforms. Your next adventure awaits.`
                        : "A little less launcher-hopping. A lot more playing."}
                  </p>
                </div>
                <button
                  className="button refresh-button"
                  onClick={refresh}
                  disabled={busy || loading}
                >
                  <RefreshCw size={16} className={busy ? "spin" : ""} />
                  {busy ? busyLabel : "Refresh library"}
                </button>
              </div>
              {view === "all" && store === "all" && featured && !query && (
                <section className="featured" aria-label="Featured game">
                  <div className="featured-art">
                    {featured.cover && (
                      <img
                        key={featured.id}
                        src={
                          featured.store === "steam"
                            ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${featured.storeId}/library_hero.jpg`
                            : featured.cover
                        }
                        alt=""
                        onError={(e) => {
                          const image = e.currentTarget;
                          if (
                            featured.store === "steam" &&
                            !image.dataset.fallback
                          ) {
                            image.dataset.fallback = "true";
                            image.src = `https://cdn.cloudflare.steamstatic.com/steam/apps/${featured.storeId}/header.jpg`;
                          } else {
                            image.style.display = "none";
                          }
                        }}
                      />
                    )}
                  </div>
                  <div className="featured-content">
                    <div className="featured-label">
                      <span className="status-dot" />
                      {featured.lastPlayed
                        ? "BACK TO YOUR ADVENTURE"
                        : featured.installed
                          ? "ON YOUR SHELF · READY TO PLAY"
                          : "WAITING FOR YOUR NEXT ADVENTURE"}
                    </div>
                    <h2>{featured.title}</h2>
                    <div className="featured-meta">
                      <StoreIcon store={featured.store} />
                      {storeNames[featured.store]}
                      <span>•</span>
                      {featured.installed
                        ? "Installed on this PC"
                        : "In your library"}
                    </div>
                    <div className="featured-buttons">
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() => launch(featured)}
                      >
                        {featured.installed ? (
                          <Play size={17} fill="currentColor" />
                        ) : (
                          <ArrowDownToLine size={17} />
                        )}{" "}
                        {featured.installed ? "Play now" : "Install via store"}
                      </button>
                      <button
                        className="button ghost"
                        onClick={() => setSelected(featured)}
                      >
                        View game <ArrowRight size={16} />
                      </button>
                    </div>
                  </div>
                  <span className="featured-number">01 / YOUR SHELF</span>
                </section>
              )}
              {snapshot.warnings.map((w, i) => (
                <div className="warning" key={i} role="status">
                  {w}
                </div>
              ))}
              <div className="library-toolbar">
                <div className="library-title">
                  <h2>
                    {view === "favorites"
                      ? "Saved for later"
                      : view === "installed"
                        ? "Installed games"
                        : "The collection"}
                  </h2>
                  <span>{games.length}</span>
                </div>
                <div className="filters">
                  <div className="search-field">
                    <Search size={16} />
                    <input
                      ref={search}
                      aria-label="Search games"
                      placeholder="Find a game…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    {query ? (
                      <button
                        className="icon-button small"
                        aria-label="Clear search"
                        onClick={() => setQuery("")}
                      >
                        <X size={14} />
                      </button>
                    ) : (
                      <kbd>Ctrl K</kbd>
                    )}
                  </div>
                  <div className="sort-field">
                    <select
                      aria-label="Sort games"
                      value={sort}
                      onChange={(e) => setSort(e.target.value as typeof sort)}
                    >
                      <option value="title">Name A–Z</option>
                      <option value="recent">Recently launched</option>
                      <option value="playtime">Steam playtime</option>
                    </select>
                    <ChevronDown size={13} />
                  </div>
                  <div className="layout-switch" aria-label="Library layout">
                    {(["grid", "list"] as const).map((l) => (
                      <button
                        className={`icon-button ${layout === l ? "selected" : ""}`}
                        key={l}
                        aria-label={`${l === "grid" ? "Grid" : "List"} view`}
                        aria-pressed={layout === l}
                        onClick={() => {
                          setLayout(l);
                          localStorage.setItem("gameshelf.layout", l);
                        }}
                      >
                        {l === "grid" ? (
                          <Grid2X2 size={16} />
                        ) : (
                          <List size={18} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {loading ? (
                <div className="empty-state">
                  <LoaderCircle size={30} className="spin" />
                  <h3>Opening your shelf…</h3>
                </div>
              ) : games.length ? (
                <div className={`games ${layout}`}>
                  {games.map((g) => (
                    <article className="game-card" key={g.id}>
                      <button
                        className="game-open"
                        onClick={() => setSelected(g)}
                        aria-label={`View ${g.title}`}
                      >
                        <Cover game={g} />
                        <div className="game-card-details">
                          <h3 title={g.title}>{g.title}</h3>
                          <div className="game-meta">
                            <StoreIcon store={g.store} />
                            <span>{storeNames[g.store]}</span>
                            {g.installed && (
                              <span className="installed-label">
                                <span className="status-dot" />
                                Installed
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                      <button
                        className={`favorite-button ${g.favorite ? "is-favorite" : ""}`}
                        onClick={() => toggleFavorite(g)}
                        aria-label={`${g.favorite ? "Remove" : "Add"} ${g.title} ${g.favorite ? "from" : "to"} favorites`}
                        aria-pressed={g.favorite}
                      >
                        <Star
                          size={16}
                          fill={g.favorite ? "currentColor" : "none"}
                        />
                      </button>
                      {layout === "list" && (
                        <button
                          className="button compact list-play"
                          disabled={busy}
                          onClick={() => launch(g)}
                        >
                          {g.installed ? (
                            <Play size={14} />
                          ) : (
                            <ArrowDownToLine size={14} />
                          )}{" "}
                          {g.installed ? "Play" : "Install via store"}
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-symbol">
                    {view === "favorites" ? (
                      <Star size={32} />
                    ) : query ? (
                      <Search size={32} />
                    ) : (
                      <LibraryBig size={32} />
                    )}
                  </div>
                  <h3>
                    {query
                      ? "No games found"
                      : view === "favorites"
                        ? "Keep your next favorites close"
                        : view === "installed"
                          ? "No installations found"
                          : "Your shelf starts here"}
                  </h3>
                  <p>
                    {query
                      ? "Try another title or clear your search."
                      : view === "favorites"
                        ? "Tap the star on a game to save it here."
                        : view === "installed"
                          ? "Install a game through its store, then refresh your library."
                          : "Connect a store to import your games, or scan this PC for existing installations."}
                  </p>
                  <button
                    className="button primary"
                    onClick={() =>
                      query
                        ? setQuery("")
                        : view === "favorites"
                          ? choose("all")
                          : view === "installed"
                            ? refresh()
                            : choose("accounts")
                    }
                  >
                    {query
                      ? "Clear search"
                      : view === "favorites"
                        ? "Explore library"
                        : view === "installed"
                          ? "Scan this PC"
                          : "Connect your first store"}
                    <ArrowRight size={16} />
                  </button>
                </div>
              )}
              <footer className="library-footer">
                <span>
                  <Layers3 size={13} />A shelf for every adventure.
                </span>
                <span>
                  {installed} installed <span className="footer-dot">·</span>{" "}
                  {snapshot.accounts.length} accounts linked
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      {connection && (
        <Connection
          store={connection}
          account={accounts.get(connection)}
          steamIdentity={steamIdentity}
          onUpdate={setSnapshot}
          onClose={() => setConnection(null)}
        />
      )}
      {selected && (
        <Dialog title="Game details" wide onClose={() => setSelected(null)}>
          <div className="game-detail">
            <Cover game={selected} />
            <div className="detail-info">
              <div className="eyebrow">ON YOUR SHELF</div>
              <h2>{selected.title}</h2>
              <div className="detail-store">
                <StoreIcon store={selected.store} />
                {storeNames[selected.store]}
              </div>
              <div className="detail-status">
                {selected.installed ? (
                  <>
                    <CheckCircle2 size={16} />
                    Installed on this PC
                  </>
                ) : (
                  <>
                    <ArrowDownToLine size={16} />
                    Available in your library
                  </>
                )}
              </div>
              {selected.playtime > 0 && (
                <div className="detail-status">
                  <Clock3 size={16} />
                  {timeLabel(selected.playtime)} on Steam
                </div>
              )}
              {selected.installPath && (
                <div className="install-path">
                  <span>INSTALLATION FOLDER</span>
                  <p>{selected.installPath}</p>
                </div>
              )}
              <button
                className="button primary full"
                onClick={() => launch(selected)}
                disabled={busy}
              >
                {selected.installed ? (
                  <Play size={17} fill="currentColor" />
                ) : (
                  <ArrowDownToLine size={17} />
                )}{" "}
                {selected.installed ? "Play game" : "Install via store"}
              </button>
              <button
                className="button full"
                onClick={() => toggleFavorite(selected)}
              >
                <Star
                  size={16}
                  fill={selected.favorite ? "currentColor" : "none"}
                />
                {selected.favorite
                  ? "Remove from favorites"
                  : "Add to favorites"}
              </button>
              <button
                className="text-button"
                onClick={() =>
                  call("open_store_page", {
                    store: selected.store,
                    id: selected.storeId,
                  }).catch((e) => notify(errorText(e), true))
                }
              >
                Open {storeNames[selected.store]} <ExternalLink size={13} />
              </button>
              <p className="field-help">
                {selected.store === "gog"
                  ? "Launches the detected game executable. Installation opens your GOG account library."
                  : `Launch and installation requests are handled by the ${storeNames[selected.store]} launcher.`}
              </p>
            </div>
          </div>
          {snapshot.games.filter(
            (g) =>
              g.id !== selected.id &&
              g.title.toLowerCase() === selected.title.toLowerCase(),
          ).length > 0 && (
            <div className="other-copies">
              <span>Also in your library</span>
              {snapshot.games
                .filter(
                  (g) =>
                    g.id !== selected.id &&
                    g.title.toLowerCase() === selected.title.toLowerCase(),
                )
                .map((g) => (
                  <button
                    className="button compact"
                    key={g.id}
                    onClick={() => setSelected(g)}
                  >
                    <StoreIcon store={g.store} />
                    {storeNames[g.store]}
                  </button>
                ))}
            </div>
          )}
        </Dialog>
      )}
      {disconnect && (
        <Dialog
          title={`Disconnect ${storeNames[disconnect]}?`}
          onClose={() => {
            if (!busy) setDisconnect(null);
          }}
        >
          <p className="disconnect-copy">
            This removes the saved account token and uninstalled games from your
            shelf. Installed games remain available, and your store account is
            unchanged.
          </p>
          <div className="dialog-actions">
            <button
              className="button"
              disabled={busy}
              onClick={() => setDisconnect(null)}
            >
              Keep connected
            </button>
            <button
              className="button danger-button"
              disabled={busy}
              onClick={doDisconnect}
            >
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Unplug size={16} />
              )}
              Disconnect
            </button>
          </div>
        </Dialog>
      )}
      {notice && (
        <div
          className={`toast ${notice.error ? "error" : ""}`}
          role={notice.error ? "alert" : "status"}
        >
          <span>
            {notice.error ? <Unplug size={18} /> : <Check size={18} />}
          </span>
          <p>{notice.message}</p>
          <button
            className="icon-button small"
            aria-label="Dismiss notification"
            onClick={() => setNotice(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
