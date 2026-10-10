#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod db;
mod model;
mod scan;
mod steam_auth;
mod stores;
use db::Database;
use model::{valid_store, Snapshot};
use std::path::Path;
use tauri::{Manager, State};

struct AppState {
    db: Database,
    client: reqwest::Client,
    sync_lock: tokio::sync::Mutex<()>,
}
fn local_scan(state: &AppState) -> Result<Snapshot, String> {
    let mut warnings = Vec::new();
    for (store, result) in [
        ("steam", scan::steam()),
        ("gog", scan::gog()),
        ("epic", scan::epic()),
    ] {
        match result {
            Ok(games) => state.db.merge(games, None, &[store])?,
            Err(e) => warnings.push(e),
        }
    }
    state.db.snapshot(warnings)
}
#[tauri::command]
fn get_library(state: State<AppState>) -> Result<Snapshot, String> {
    state.db.snapshot(vec![])
}
#[tauri::command]
async fn scan_installed(state: State<'_, AppState>) -> Result<Snapshot, String> {
    let _guard = state.sync_lock.lock().await;
    local_scan(&state)
}
#[tauri::command]
fn set_favorite(state: State<AppState>, id: String, value: bool) -> Result<(), String> {
    state.db.favorite(&id, value)
}
#[tauri::command]
async fn sync_store(state: State<'_, AppState>, store: String) -> Result<Snapshot, String> {
    let _guard = state.sync_lock.lock().await;
    stores::sync(&state.client, &state.db, &store).await?;
    local_scan(&state)
}
#[tauri::command]
async fn connect_account(
    state: State<'_, AppState>,
    store: String,
    code: String,
    steam_id: Option<String>,
    api_key: Option<String>,
) -> Result<Snapshot, String> {
    let _guard = state.sync_lock.lock().await;
    valid_store(&store)?;
    if store == "steam" {
        let (account, games) = stores::steam_connect(
            &state.client,
            steam_id.as_deref().unwrap_or(""),
            api_key.as_deref().unwrap_or(""),
        )
        .await?;
        state.db.merge(games, Some("steam"), &[])?;
        state.db.account(&account)?;
    } else {
        let account = stores::exchange(&state.client, &store, &code).await?;
        state.db.account(&account)?;
        stores::sync(&state.client, &state.db, &store).await?;
    }
    local_scan(&state)
}
#[tauri::command]
async fn disconnect_account(state: State<'_, AppState>, store: String) -> Result<Snapshot, String> {
    let _guard = state.sync_lock.lock().await;
    valid_store(&store)?;
    stores::remove_secret(&store)?;
    state.db.disconnect(&store)?;
    local_scan(&state)
}
#[tauri::command]
async fn start_login(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    store: String,
) -> Result<(), String> {
    valid_store(&store)?;
    if store == "steam" {
        steam_auth::begin(app, state.client.clone()).await
    } else {
        open::that(stores::auth_url(&store)?)
            .map_err(|_| "Could not open the store sign-in page.".into())
    }
}
#[tauri::command]
fn open_store_page(store: String, id: Option<String>) -> Result<(), String> {
    valid_store(&store)?;
    let url = match store.as_str() {
        "steam" => match id {
            Some(id) if id.chars().all(|c| c.is_ascii_digit()) => {
                format!("https://store.steampowered.com/app/{id}/")
            }
            _ => "https://steamcommunity.com/dev/apikey".into(),
        },
        "gog" => "https://www.gog.com/account".into(),
        _ => "https://store.epicgames.com/".into(),
    };
    open::that(url).map_err(|_| "Could not open the store page.".into())
}
#[tauri::command]
fn launch_game(state: State<AppState>, id: String, install: bool) -> Result<(), String> {
    let g = state
        .db
        .snapshot(vec![])?
        .games
        .into_iter()
        .find(|g| g.id == id)
        .ok_or("This game is no longer in the library.")?;
    if !install && !g.installed {
        return Err("Scan your installations or install this game first.".into());
    }
    let uri = match g.store.as_str() {
        "steam" => {
            if !g.store_id.chars().all(|c| c.is_ascii_digit()) {
                return Err("Invalid Steam game ID.".into());
            }
            format!(
                "steam://{}/{}",
                if install { "install" } else { "rungameid" },
                g.store_id
            )
        }
        "epic" => {
            if g.launch_id.is_empty() {
                return Err("Sync Epic Games before launching this game.".into());
            }
            let id =
                url::form_urlencoded::byte_serialize(g.launch_id.as_bytes()).collect::<String>();
            if install {
                "com.epicgames.launcher://apps".into()
            } else {
                format!("com.epicgames.launcher://apps/{id}?action=launch&silent=true")
            }
        }
        "gog" => {
            if install {
                return open::that("https://www.gog.com/account")
                    .map_err(|_| "Could not open your GOG library.".into());
            }
            let root = std::fs::canonicalize(&g.install_path)
                .map_err(|_| "This installation folder is missing. Scan again.")?;
            let path = Path::new(&g.executable);
            let path = if path.is_absolute() {
                path.to_path_buf()
            } else {
                root.join(path)
            };
            let path = std::fs::canonicalize(path)
                .map_err(|_| "No executable was found. Open this game through GOG Galaxy.")?;
            if !path.starts_with(&root)
                || !path.is_file()
                || path
                    .extension()
                    .map_or(true, |ext| !ext.eq_ignore_ascii_case("exe"))
            {
                return Err(
                    "The game executable is outside its installation folder or is not an EXE."
                        .into(),
                );
            }
            std::process::Command::new(path)
                .current_dir(root)
                .spawn()
                .map_err(|_| "Could not launch the game executable.")?;
            state.db.played(&id)?;
            return Ok(());
        }
        _ => return Err("Unknown game store.".into()),
    };
    open::that(uri).map_err(|_| {
        "The store launcher could not be opened. Check that it is installed.".to_string()
    })?;
    if !install {
        state.db.played(&id)?
    }
    Ok(())
}
fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let path = if let Some(p) = std::env::var_os("GAMESHELF_DATA_DIR") {
                std::path::PathBuf::from(p)
            } else {
                app.path().app_local_data_dir()?
            };
            std::fs::create_dir_all(&path)?;
            let state = AppState {
                db: Database::new(&path.join("library.db")).map_err(std::io::Error::other)?,
                client: reqwest::Client::builder()
                    .timeout(std::time::Duration::from_secs(30))
                    .user_agent("GameShelf/0.1 (desktop library)")
                    .build()?,
                sync_lock: tokio::sync::Mutex::new(()),
            };
            local_scan(&state).map_err(std::io::Error::other)?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_library,
            scan_installed,
            set_favorite,
            sync_store,
            connect_account,
            disconnect_account,
            start_login,
            open_store_page,
            launch_game
        ])
        .run(tauri::generate_context!())
        .expect("GameShelf could not start");
}
