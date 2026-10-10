use crate::model::Game;
use serde_json::Value;
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

// Valve's quoted key/value format. Braces are retained so parent nodes cannot
// accidentally become values. Escaped backslashes and quotes are decoded.
pub fn vdf_pairs(text: &str) -> Vec<(String, String)> {
    let mut tokens = Vec::new();
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '"' => {
                let mut s = String::new();
                while let Some(ch) = chars.next() {
                    if ch == '"' {
                        break;
                    }
                    if ch == '\\' {
                        if let Some(n) = chars.next() {
                            s.push(n);
                        }
                    } else {
                        s.push(ch);
                    }
                }
                tokens.push(s);
            }
            '{' => tokens.push("{".into()),
            '}' => tokens.push("}".into()),
            '/' if chars.peek() == Some(&'/') => {
                for n in chars.by_ref() {
                    if n == '\n' {
                        break;
                    }
                }
            }
            _ => {}
        }
    }
    let mut pairs = Vec::new();
    let mut i = 0;
    while i + 1 < tokens.len() {
        if tokens[i] != "{" && tokens[i] != "}" && tokens[i + 1] != "{" && tokens[i + 1] != "}" {
            pairs.push((tokens[i].clone(), tokens[i + 1].clone()));
            i += 2;
        } else {
            i += 1;
        }
    }
    pairs
}
#[cfg(windows)]
fn steam_root() -> Option<PathBuf> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Software\\Valve\\Steam")
        .ok()?
        .get_value::<String, _>("SteamPath")
        .ok()
        .map(PathBuf::from)
}
#[cfg(not(windows))]
fn steam_root() -> Option<PathBuf> {
    None
}

pub fn steam_manifest(text: &str, apps: &Path) -> Option<Game> {
    let m: HashMap<_, _> = vdf_pairs(text).into_iter().collect();
    let id = m.get("appid")?;
    if !id.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let flags = m
        .get("StateFlags")
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(0);
    if flags & 4 == 0 {
        return None;
    }
    let dir = apps.join("common").join(m.get("installdir")?);
    let mut g = Game::new("steam", id, m.get("name")?);
    g.installed = dir.is_dir();
    g.install_path = dir.to_string_lossy().into();
    g.cover =
        format!("https://cdn.cloudflare.steamstatic.com/steam/apps/{id}/library_600x900_2x.jpg");
    Some(g)
}
pub fn steam() -> Result<Vec<Game>, String> {
    let Some(root) = steam_root() else {
        return Ok(vec![]);
    };
    let mut paths = vec![root.clone()];
    if let Ok(t) = fs::read_to_string(root.join("steamapps/libraryfolders.vdf")) {
        for (k, v) in vdf_pairs(&t) {
            if k == "path" {
                paths.push(PathBuf::from(v));
            }
        }
    }
    paths.sort();
    paths.dedup();
    let mut games = Vec::new();
    for root in paths {
        let apps = root.join("steamapps");
        if !apps.is_dir() {
            continue;
        }
        let files = fs::read_dir(&apps).map_err(|_| {
            "Steam library could not be read. Previous installation status was kept.".to_string()
        })?;
        for entry in files.flatten() {
            let path = entry.path();
            if path
                .file_name()
                .is_some_and(|s| s.to_string_lossy().starts_with("appmanifest_"))
                && path.extension().is_some_and(|s| s == "acf")
            {
                if let Ok(t) = fs::read_to_string(path) {
                    if let Some(g) = steam_manifest(&t, &apps) {
                        if g.store_id != "228980" {
                            games.push(g)
                        }
                    }
                }
            }
        }
    }
    Ok(games)
}
pub fn epic_manifest(v: &Value) -> Option<Game> {
    if v.get("bIsIncompleteInstall").and_then(Value::as_bool) == Some(true) {
        return None;
    }
    let id = v.get("AppName")?.as_str()?;
    let dir = v.get("InstallLocation")?.as_str()?;
    let mut g = Game::new("epic", id, v.get("DisplayName")?.as_str()?);
    g.launch_id = format!(
        "{}:{}:{}",
        v.get("CatalogNamespace")
            .and_then(Value::as_str)
            .unwrap_or(""),
        v.get("CatalogItemId").and_then(Value::as_str).unwrap_or(""),
        id
    );
    g.install_path = dir.into();
    g.installed = Path::new(dir).is_dir();
    Some(g)
}
pub fn epic() -> Result<Vec<Game>, String> {
    let root = std::env::var_os("PROGRAMDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("C:\\ProgramData"))
        .join("Epic/EpicGamesLauncher/Data/Manifests");
    if !root.is_dir() {
        return Ok(vec![]);
    }
    let mut games = Vec::new();
    for e in fs::read_dir(root)
        .map_err(|_| {
            "Epic manifests could not be read. Previous installation status was kept.".to_string()
        })?
        .flatten()
    {
        if e.path().extension().is_some_and(|s| s == "item") {
            if let Ok(t) = fs::read_to_string(e.path()) {
                if let Ok(v) = serde_json::from_str::<Value>(&t) {
                    if let Some(g) = epic_manifest(&v) {
                        games.push(g)
                    }
                }
            }
        }
    }
    Ok(games)
}
#[cfg(windows)]
pub fn gog() -> Result<Vec<Game>, String> {
    use winreg::{
        enums::{HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_32KEY},
        RegKey,
    };
    let root = match RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey_with_flags("SOFTWARE\\GOG.com\\Games", KEY_READ | KEY_WOW64_32KEY)
    {
        Ok(r) => r,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(_) => {
            return Err("GOG installations could not be read. Previous status was kept.".into())
        }
    };
    let mut games = Vec::new();
    for id in root.enum_keys().flatten() {
        if !id.chars().all(|c| c.is_ascii_digit()) {
            continue;
        }
        if let Ok(k) = root.open_subkey(&id) {
            let path = k.get_value::<String, _>("path").unwrap_or_default();
            if path.is_empty() {
                continue;
            }
            let title = k
                .get_value::<String, _>("gameName")
                .unwrap_or_else(|_| format!("GOG game {id}"));
            let mut g = Game::new("gog", &id, &title);
            g.installed = Path::new(&path).is_dir();
            g.executable = k.get_value::<String, _>("exe").unwrap_or_default();
            g.install_path = path;
            games.push(g)
        }
    }
    Ok(games)
}
#[cfg(not(windows))]
pub fn gog() -> Result<Vec<Game>, String> {
    Ok(vec![])
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn nested_paths_and_escapes() {
        let p = vdf_pairs(
            r#""libraryfolders" { "0" { "path" "D:\\SteamLibrary" "apps" { "10" "100" } } }"#,
        );
        assert!(p.contains(&("path".into(), "D:\\SteamLibrary".into())));
        assert!(!p.iter().any(|(k, _)| k == "libraryfolders"));
    }
    #[test]
    fn incomplete_steam_download_is_excluded() {
        assert!(steam_manifest(
            r#""AppState" { "appid" "10" "name" "Test" "StateFlags" "1026" "installdir" "Test" }"#,
            Path::new(".")
        )
        .is_none());
    }
    #[test]
    fn epic_uses_store_identity_not_title() {
        let v = serde_json::json!({"AppName":"abc","DisplayName":"Game","InstallLocation":"X:/Game","CatalogNamespace":"ns","CatalogItemId":"item"});
        let g = epic_manifest(&v).unwrap();
        assert_eq!(g.id, "epic:abc");
        assert_eq!(g.launch_id, "ns:item:abc");
    }
}
