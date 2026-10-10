use crate::model::{Account, Game, Snapshot};
use rusqlite::{params, Connection};
use std::sync::Mutex;

pub struct Database(pub Mutex<Connection>);
impl Database {
    pub fn new(path: &std::path::Path) -> Result<Self, String> {
        let c = Connection::open(path).map_err(|_| "Could not open the library database.")?;
        c.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY,store TEXT NOT NULL,data TEXT NOT NULL,favorite INTEGER NOT NULL DEFAULT 0,last_played INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS accounts(store TEXT PRIMARY KEY,data TEXT NOT NULL);").map_err(|_| "Could not initialize the library database.")?;
        Ok(Self(Mutex::new(c)))
    }
    pub fn snapshot(&self, warnings: Vec<String>) -> Result<Snapshot, String> {
        let c = self.0.lock().map_err(|_| "Library database is busy.")?;
        let mut s = c
            .prepare("SELECT data,favorite,last_played FROM games")
            .map_err(|e| e.to_string())?;
        let games = s
            .query_map([], |r| {
                let data: String = r.get(0)?;
                let mut g: Game = serde_json::from_str(&data).map_err(|e| {
                    rusqlite::Error::FromSqlConversionFailure(
                        0,
                        rusqlite::types::Type::Text,
                        Box::new(e),
                    )
                })?;
                g.favorite = r.get(1)?;
                g.last_played = r.get(2)?;
                Ok(g)
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        let mut s = c
            .prepare("SELECT data FROM accounts")
            .map_err(|e| e.to_string())?;
        let accounts = s
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .map(|r| {
                r.map_err(|e| e.to_string())
                    .and_then(|d| serde_json::from_str::<Account>(&d).map_err(|e| e.to_string()))
            })
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Snapshot {
            games,
            accounts,
            warnings,
        })
    }
    pub fn merge(
        &self,
        games: Vec<Game>,
        cloud_store: Option<&str>,
        scanned_stores: &[&str],
    ) -> Result<(), String> {
        let mut c = self.0.lock().map_err(|_| "Library database is busy.")?;
        let tx = c.transaction().map_err(|e| e.to_string())?;
        // A successful local scan is authoritative for installation state only.
        for store in scanned_stores {
            tx.execute("UPDATE games SET data=json_set(data,'$.installed',json('false'),'$.installPath','','$.executable','') WHERE store=?1",[store]).map_err(|e|e.to_string())?;
        }
        let incoming: std::collections::HashSet<String> =
            games.iter().map(|g| g.id.clone()).collect();
        if let Some(store) = cloud_store {
            let stale: Vec<(String, String)> = {
                let mut statement = tx
                    .prepare("SELECT id,data FROM games WHERE store=?1")
                    .map_err(|e| e.to_string())?;
                let result = statement
                    .query_map([store], |r| Ok((r.get(0)?, r.get(1)?)))
                    .map_err(|e| e.to_string())?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| e.to_string())?;
                result
            };
            for (id, data) in stale {
                if !incoming.contains(&id) {
                    let game: Game = serde_json::from_str(&data).map_err(|e| e.to_string())?;
                    if game.installed {
                        tx.execute(
                            "UPDATE games SET data=json_set(data,'$.source','local') WHERE id=?1",
                            [id],
                        )
                        .map_err(|e| e.to_string())?;
                    } else {
                        tx.execute("DELETE FROM games WHERE id=?1", [id])
                            .map_err(|e| e.to_string())?;
                    }
                }
            }
        }
        for mut g in games {
            if let Ok(old) = tx.query_row("SELECT data FROM games WHERE id=?1", [&g.id], |r| {
                r.get::<_, String>(0)
            }) {
                if let Ok(old) = serde_json::from_str::<Game>(&old) {
                    if cloud_store.is_some() {
                        g.installed = old.installed;
                        g.install_path = old.install_path;
                        g.executable = old.executable;
                        if !old.launch_id.is_empty() {
                            g.launch_id = old.launch_id;
                        }
                    } else {
                        if g.cover.is_empty() {
                            g.cover = old.cover;
                        }
                        g.playtime = old.playtime;
                        g.source = old.source;
                    }
                }
            }
            let data = serde_json::to_string(&g).map_err(|e| e.to_string())?;
            tx.execute("INSERT INTO games(id,store,data) VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET data=excluded.data",params![g.id,g.store,data]).map_err(|e|e.to_string())?;
        }
        for store in scanned_stores {
            tx.execute("DELETE FROM games WHERE store=?1 AND json_extract(data,'$.source')='local' AND json_extract(data,'$.installed')=0",[store]).map_err(|e|e.to_string())?;
        }
        // Preserve the cache on provider failures. Successful imports never erase installed games.
        tx.commit().map_err(|e| e.to_string())
    }
    pub fn account(&self, a: &Account) -> Result<(), String> {
        let c = self.0.lock().map_err(|_| "Database busy.")?;
        c.execute("INSERT INTO accounts(store,data) VALUES(?1,?2) ON CONFLICT(store) DO UPDATE SET data=excluded.data",params![a.store,serde_json::to_string(a).map_err(|e|e.to_string())?]).map_err(|e|e.to_string())?;
        Ok(())
    }
    pub fn favorite(&self, id: &str, value: bool) -> Result<(), String> {
        let c = self.0.lock().map_err(|_| "Database busy.")?;
        c.execute(
            "UPDATE games SET favorite=?2 WHERE id=?1",
            params![id, value],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn played(&self, id: &str) -> Result<(), String> {
        let c = self.0.lock().map_err(|_| "Database busy.")?;
        c.execute(
            "UPDATE games SET last_played=?2 WHERE id=?1",
            params![id, crate::model::now()],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn disconnect(&self, store: &str) -> Result<(), String> {
        let mut c = self.0.lock().map_err(|_| "Database busy.")?;
        let tx = c.transaction().map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM accounts WHERE store=?1", [store])
            .map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM games WHERE store=?1 AND json_extract(data,'$.installed')=0",
            [store],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn db() -> Database {
        Database::new(Path::new(":memory:")).unwrap()
    }
    use std::path::Path;
    #[test]
    fn favorites_and_launches_survive_rescan() {
        let db = db();
        let mut g = Game::new("steam", "10", "Game");
        g.installed = true;
        db.merge(vec![g.clone()], None, &["steam"]).unwrap();
        db.favorite(&g.id, true).unwrap();
        db.played(&g.id).unwrap();
        db.merge(vec![g], None, &["steam"]).unwrap();
        let s = db.snapshot(vec![]).unwrap();
        assert!(s.games[0].favorite);
        assert!(s.games[0].last_played > 0);
    }
    #[test]
    fn cloud_sync_preserves_installation() {
        let db = db();
        let mut local = Game::new("steam", "10", "Game");
        local.installed = true;
        local.install_path = "D:/Game".into();
        db.merge(vec![local], None, &["steam"]).unwrap();
        let mut cloud = Game::new("steam", "10", "Game");
        cloud.source = "account".into();
        cloud.playtime = 40;
        db.merge(vec![cloud], Some("steam"), &[]).unwrap();
        let s = db.snapshot(vec![]).unwrap();
        assert!(s.games[0].installed);
        assert_eq!(s.games[0].install_path, "D:/Game");
        assert_eq!(s.games[0].playtime, 40);
    }
    #[test]
    fn successful_sync_removes_stale_ownership_but_keeps_local_install() {
        let db = db();
        let mut owned = Game::new("gog", "1", "Old game");
        owned.source = "account".into();
        let mut local = Game::new("gog", "2", "Installed game");
        local.installed = true;
        db.merge(vec![owned, local], None, &[]).unwrap();
        db.merge(vec![], Some("gog"), &[]).unwrap();
        let s = db.snapshot(vec![]).unwrap();
        assert_eq!(s.games.len(), 1);
        assert_eq!(s.games[0].id, "gog:2");
    }
    #[test]
    fn uninstall_keeps_owned_games_but_removes_local_only_games() {
        let db = db();
        let mut local = Game::new("steam", "1", "Local");
        local.installed = true;
        let mut owned = Game::new("steam", "2", "Owned");
        owned.source = "account".into();
        owned.installed = true;
        db.merge(vec![local, owned], None, &[]).unwrap();
        db.merge(vec![], None, &["steam"]).unwrap();
        let s = db.snapshot(vec![]).unwrap();
        assert_eq!(s.games.len(), 1);
        assert_eq!(s.games[0].id, "steam:2");
        assert!(!s.games[0].installed);
    }
}
