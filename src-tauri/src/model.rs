use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Game {
    pub id: String,
    pub store: String,
    pub store_id: String,
    pub title: String,
    pub cover: String,
    pub installed: bool,
    pub install_path: String,
    pub executable: String,
    pub launch_id: String,
    pub favorite: bool,
    pub last_played: i64,
    pub playtime: i64,
    pub source: String,
}
impl Game {
    pub fn new(store: &str, id: &str, title: &str) -> Self {
        Self {
            id: format!("{store}:{id}"),
            store: store.into(),
            store_id: id.into(),
            title: title.into(),
            cover: String::new(),
            installed: false,
            install_path: String::new(),
            executable: String::new(),
            launch_id: id.into(),
            favorite: false,
            last_played: 0,
            playtime: 0,
            source: "local".into(),
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub store: String,
    pub name: String,
    pub account_id: String,
    pub connected: bool,
    pub last_sync: i64,
}
#[derive(Serialize)]
pub struct Snapshot {
    pub games: Vec<Game>,
    pub accounts: Vec<Account>,
    pub warnings: Vec<String>,
}
pub fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}
pub fn valid_store(store: &str) -> Result<(), String> {
    if ["steam", "gog", "epic"].contains(&store) {
        Ok(())
    } else {
        Err("Unknown store.".into())
    }
}
