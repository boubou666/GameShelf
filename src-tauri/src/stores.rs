use crate::{
    db::Database,
    model::{now, valid_store, Account, Game},
};
use reqwest::Client;
use serde_json::Value;
use url::Url;

const EPIC_TOKEN: &str =
    "https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token";
// Public launcher client identifiers, not user credentials. These are used by
// the community clients too; they may change independently of this application.
const EPIC_CLIENT: &str = "34a02cf8f4414e29b15921876da36f9a";
const EPIC_CLIENT_SECRET: &str = "daafbccc737745039dffe53d94fc76cf";
const GOG_CLIENT: &str = "46899977096215655";
const GOG_CLIENT_SECRET: &str = "9d85c43b1482497dbbce61f6e4aa173a433796eeae2ca8c5f6129f2dc4de46d9";
const GOG_REDIRECT: &str = "https://embed.gog.com/on_login_success?origin=client";

fn entry(store: &str) -> Result<keyring::Entry, String> {
    valid_store(store)?;
    keyring::Entry::new("GameShelf", store)
        .map_err(|_| "Windows credential storage is unavailable.".into())
}
pub fn save_secret(store: &str, v: &Value) -> Result<(), String> {
    entry(store)?
        .set_password(&v.to_string())
        .map_err(|_| "Could not securely save the account token. Connection was not saved.".into())
}
pub fn secret(store: &str) -> Result<Value, String> {
    let s = entry(store)?
        .get_password()
        .map_err(|_| "Reconnect this account to continue syncing.".to_string())?;
    serde_json::from_str(&s).map_err(|_| "Reconnect this account to continue syncing.".into())
}
pub fn remove_secret(store: &str) -> Result<(), String> {
    match entry(store)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("Could not remove the account token from Windows Credential Manager.".into()),
    }
}

async fn json(r: reqwest::RequestBuilder, label: &str) -> Result<Value, String> {
    let response = r.send().await.map_err(|_| {
        format!("Could not reach {label}. Check your internet connection and try again.")
    })?;
    let status = response.status();
    if !status.is_success() {
        return Err(match status.as_u16() {
            401 | 403 => {
                format!("{label} rejected this session. Reconnect the account, then try again.")
            }
            429 => format!("{label} is limiting requests. Try again in a few minutes."),
            _ => format!(
                "{label} returned HTTP {}. Your cached library was kept.",
                status.as_u16()
            ),
        });
    }
    response.json().await.map_err(|_| {
        format!("{label} returned an unexpected response. Your cached library was kept.")
    })
}
pub fn code_from_input(store: &str, input: &str) -> Result<String, String> {
    let input = input.trim();
    if input.len() > 8192 {
        return Err("That login response is too long.".into());
    }
    let code = if input.starts_with('{') {
        if store != "epic" {
            return Err("Paste the GOG redirect URL or code.".into());
        }
        serde_json::from_str::<Value>(input)
            .ok()
            .and_then(|v| {
                v.get("authorizationCode")
                    .and_then(Value::as_str)
                    .map(str::to_owned)
            })
            .ok_or("The Epic response did not contain an authorizationCode.")?
    } else if input.starts_with("https://") {
        let u = Url::parse(input).map_err(|_| "That redirect URL is invalid.")?;
        let allowed = match store {
            "gog" => u.host_str() == Some("embed.gog.com") && u.path() == "/on_login_success",
            "epic" => {
                u.host_str() == Some("www.epicgames.com") || u.host_str() == Some("epicgames.com")
            }
            _ => false,
        };
        if !allowed {
            return Err("Paste the redirect from the store's official login page.".into());
        }
        u.query_pairs()
            .find(|(k, _)| k == "code" || k == "authorizationCode")
            .map(|(_, v)| v.into_owned())
            .ok_or("The redirect did not contain a login code.")?
    } else {
        input.trim_matches('"').to_string()
    };
    if code.is_empty()
        || code.len() > 1024
        || !code
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
    {
        return Err("Paste the one-time login code or complete login response.".into());
    }
    Ok(code)
}
pub fn auth_url(store: &str) -> Result<String, String> {
    match store {
        "gog" => {
            let mut u = Url::parse("https://auth.gog.com/auth").unwrap();
            u.query_pairs_mut()
                .append_pair("client_id", GOG_CLIENT)
                .append_pair("redirect_uri", GOG_REDIRECT)
                .append_pair("response_type", "code")
                .append_pair("layout", "client2");
            Ok(u.into())
        }
        "epic" => {
            let redirect=format!("https://www.epicgames.com/id/api/redirect?clientId={EPIC_CLIENT}&responseType=code");
            let mut u = Url::parse("https://www.epicgames.com/id/login").unwrap();
            u.query_pairs_mut().append_pair("redirectUrl", &redirect);
            Ok(u.into())
        }
        _ => Err("Use Steam sign-in or enter your SteamID.".into()),
    }
}

pub async fn exchange(client: &Client, store: &str, input: &str) -> Result<Account, String> {
    let code = code_from_input(store, input)?;
    let mut token = match store {
        "epic" => {
            json(
                client
                    .post(EPIC_TOKEN)
                    .basic_auth(EPIC_CLIENT, Some(EPIC_CLIENT_SECRET))
                    .form(&[
                        ("grant_type", "authorization_code"),
                        ("code", code.as_str()),
                        ("token_type", "eg1"),
                    ]),
                "Epic Games",
            )
            .await?
        }
        "gog" => {
            json(
                client.get("https://auth.gog.com/token").query(&[
                    ("client_id", GOG_CLIENT),
                    ("client_secret", GOG_CLIENT_SECRET),
                    ("grant_type", "authorization_code"),
                    ("redirect_uri", GOG_REDIRECT),
                    ("code", code.as_str()),
                ]),
                "GOG",
            )
            .await?
        }
        _ => return Err("Unknown store.".into()),
    };
    if token.get("access_token").and_then(Value::as_str).is_none()
        || token.get("refresh_token").and_then(Value::as_str).is_none()
    {
        return Err("The store did not issue a complete session. Start sign-in again.".into());
    }
    token["saved_at"] = Value::from(now());
    let mut account = Account {
        store: store.into(),
        name: token
            .get("displayName")
            .and_then(Value::as_str)
            .unwrap_or("Connected account")
            .into(),
        account_id: token
            .get("account_id")
            .or_else(|| token.get("user_id"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .into(),
        connected: true,
        last_sync: 0,
    };
    if store == "gog" {
        let id = token["user_id"]
            .as_str()
            .map(str::to_owned)
            .or_else(|| token["user_id"].as_u64().map(|i| i.to_string()))
            .ok_or("GOG did not return a user ID.")?;
        if !id.chars().all(|c| c.is_ascii_digit()) {
            return Err("GOG returned an invalid user ID.".into());
        }
        let profile = json(
            client
                .get(format!("https://users.gog.com/users/{id}"))
                .bearer_auth(token["access_token"].as_str().unwrap()),
            "GOG",
        )
        .await?;
        account.name = profile["username"].as_str().unwrap_or("GOG account").into();
        account.account_id = id;
    }
    save_secret(store, &token)?;
    Ok(account)
}
async fn access_token(client: &Client, store: &str) -> Result<String, String> {
    let mut token = secret(store)?;
    let saved = token["saved_at"].as_i64().unwrap_or(0);
    let ttl = token["expires_in"].as_i64().unwrap_or(3600);
    if now() + 120 >= saved + ttl {
        let refresh = token["refresh_token"]
            .as_str()
            .ok_or("Reconnect this account to refresh its session.")?;
        token = if store == "epic" {
            json(
                client
                    .post(EPIC_TOKEN)
                    .basic_auth(EPIC_CLIENT, Some(EPIC_CLIENT_SECRET))
                    .form(&[
                        ("grant_type", "refresh_token"),
                        ("refresh_token", refresh),
                        ("token_type", "eg1"),
                    ]),
                "Epic Games",
            )
            .await?
        } else {
            json(
                client.get("https://auth.gog.com/token").query(&[
                    ("client_id", GOG_CLIENT),
                    ("client_secret", GOG_CLIENT_SECRET),
                    ("grant_type", "refresh_token"),
                    ("refresh_token", refresh),
                ]),
                "GOG",
            )
            .await?
        };
        if token["access_token"].as_str().is_none() || token["refresh_token"].as_str().is_none() {
            return Err("Reconnect this account to refresh its session.".into());
        }
        token["saved_at"] = Value::from(now());
        save_secret(store, &token)?;
    }
    token["access_token"]
        .as_str()
        .map(str::to_owned)
        .ok_or("Reconnect this account to continue syncing.".into())
}
pub async fn steam_games(client: &Client, id: &str, key: &str) -> Result<Vec<Game>, String> {
    if id.len() != 17 || !id.chars().all(|c| c.is_ascii_digit()) {
        return Err("Enter a 17-digit SteamID64.".into());
    }
    if key.len() != 32 || !key.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("Enter your 32-character Steam Web API key.".into());
    }
    let v = json(
        client
            .get("https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/")
            .query(&[
                ("key", key),
                ("steamid", id),
                ("include_appinfo", "true"),
                ("include_played_free_games", "true"),
            ]),
        "Steam",
    )
    .await?;
    let list = if let Some(g) = v["response"]["games"].as_array() {
        g
    } else if v["response"]["game_count"].as_u64() == Some(0) {
        return Ok(vec![]);
    } else {
        return Err("Steam did not return this library. Check the SteamID, API key, and your Game details privacy setting.".into());
    };
    Ok(list
        .iter()
        .filter_map(|item| {
            let id = item["appid"].as_u64()?.to_string();
            let mut g = Game::new("steam", &id, item["name"].as_str().unwrap_or("Steam game"));
            g.cover = format!(
                "https://cdn.cloudflare.steamstatic.com/steam/apps/{id}/library_600x900_2x.jpg"
            );
            g.playtime = item["playtime_forever"].as_i64().unwrap_or(0);
            g.source = "account".into();
            Some(g)
        })
        .collect())
}
pub async fn steam_connect(
    client: &Client,
    id: &str,
    key: &str,
) -> Result<(Account, Vec<Game>), String> {
    let games = steam_games(client, id, key).await?;
    let mut name = "Steam account".into();
    if let Ok(v) = json(
        client
            .get("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/")
            .query(&[("key", key), ("steamids", id)]),
        "Steam",
    )
    .await
    {
        if let Some(n) = v["response"]["players"][0]["personaname"].as_str() {
            name = n.into()
        }
    }
    save_secret("steam", &serde_json::json!({"apiKey":key}))?;
    Ok((
        Account {
            store: "steam".into(),
            name,
            account_id: id.into(),
            connected: true,
            last_sync: now(),
        },
        games,
    ))
}
fn https_cover(value: Option<&str>) -> String {
    match value {
        Some(v) if v.starts_with("https://") => v.into(),
        Some(v) if v.starts_with("//") => format!("https:{v}"),
        _ => String::new(),
    }
}
pub async fn sync(client: &Client, db: &Database, store: &str) -> Result<usize, String> {
    valid_store(store)?;
    let mut account = db
        .snapshot(vec![])?
        .accounts
        .into_iter()
        .find(|a| a.store == store)
        .ok_or("Connect this account first.")?;
    let mut games = Vec::new();
    match store {
        "steam" => {
            let v = secret(store)?;
            games = steam_games(
                client,
                &account.account_id,
                v["apiKey"]
                    .as_str()
                    .ok_or("Reconnect Steam to save an API key.")?,
            )
            .await?;
        }
        "gog" => {
            let token = access_token(client, store).await?;
            let mut page = String::new();
            let mut seen = std::collections::HashSet::new();
            let mut ids = std::collections::HashSet::new();
            loop {
                let mut request = client
                    .get(format!(
                        "https://galaxy-library.gog.com/users/{}/releases",
                        account.account_id
                    ))
                    .bearer_auth(&token);
                if !page.is_empty() {
                    request = request.query(&[("page_token", page.as_str())]);
                }
                let v = json(request, "GOG").await?;
                let items = v["items"]
                    .as_array()
                    .ok_or("GOG returned an unexpected library format. The cache was kept.")?;
                for item in items {
                    if item["platform_id"].as_str() != Some("gog") {
                        continue;
                    }
                    let id = item["external_id"]
                        .as_str()
                        .map(str::to_owned)
                        .or_else(|| item["external_id"].as_u64().map(|i| i.to_string()))
                        .ok_or("GOG returned a game without an ID.")?;
                    if !id.chars().all(|c| c.is_ascii_digit()) {
                        return Err("GOG returned an invalid game ID.".into());
                    }
                    ids.insert(id);
                }
                let next = v["next_page_token"].as_str().unwrap_or("");
                if next.is_empty() {
                    break;
                }
                if !seen.insert(next.to_string()) || seen.len() > 1000 {
                    return Err("GOG pagination could not complete. The cache was kept.".into());
                }
                page = next.into();
            }
            let mut tasks = tokio::task::JoinSet::new();
            for id in ids {
                let c = client.clone();
                let token = token.clone();
                tasks.spawn(async move {
                    let v = json(
                        c.get(format!("https://api.gog.com/products/{id}"))
                            .bearer_auth(token),
                        "GOG",
                    )
                    .await?;
                    let title = v["title"]
                        .as_str()
                        .ok_or("GOG returned incomplete game metadata. The cache was kept.")?;
                    let mut g = Game::new("gog", &id, title);
                    g.cover = https_cover(
                        v["images"]["boxArt"]
                            .as_str()
                            .or_else(|| v["images"]["logo2x"].as_str())
                            .or_else(|| v["images"]["logo"].as_str()),
                    );
                    g.source = "account".into();
                    Ok::<_, String>(g)
                });
                if tasks.len() >= 4 {
                    if let Some(r) = tasks.join_next().await {
                        games.push(r.map_err(|_| "GOG metadata task failed.")??)
                    }
                }
            }
            while let Some(r) = tasks.join_next().await {
                games.push(r.map_err(|_| "GOG metadata task failed.")??)
            }
        }
        "epic" => {
            let token = access_token(client, store).await?;
            let assets=json(client.get("https://launcher-public-service-prod06.ol.epicgames.com/launcher/api/public/assets/Windows").bearer_auth(&token).query(&[("label","Live")]),"Epic Games").await?;
            let items = assets
                .as_array()
                .ok_or("Epic returned an unexpected library format. The cache was kept.")?;
            // Bound metadata requests to four concurrent calls so a large library stays responsive.
            let mut tasks = tokio::task::JoinSet::new();
            for item in items {
                let Some(app) = item["appName"].as_str() else {
                    continue;
                };
                let Some(ns) = item["namespace"].as_str() else {
                    continue;
                };
                let Some(catalog) = item["catalogItemId"].as_str() else {
                    continue;
                };
                if ["ue", "uefn"].contains(&ns) {
                    continue;
                }
                let (app, ns, catalog) = (app.to_string(), ns.to_string(), catalog.to_string());
                let c = client.clone();
                let t = token.clone();
                tasks.spawn(async move {
                    let v = json(c.get(format!("https://catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/namespace/{ns}/bulk/items")).bearer_auth(t).query(&[("id",catalog.as_str()),("includeDLCDetails","true"),("includeMainGameDetails","true"),("locale","en")]),"Epic Games").await?;
                    let info = &v[&catalog];
                    if info.is_null() { return Err("Epic returned incomplete game metadata. The cache was kept.".into()); }
                    if info["mainGameItem"].is_object() { return Ok(None); }
                    let mut g = Game::new("epic", &app, info["title"].as_str().unwrap_or(&app));
                    g.launch_id = format!("{ns}:{catalog}:{app}");
                    g.source = "account".into();
                    if let Some(images) = info["keyImages"].as_array() {
                        let cover = images.iter().find(|i| ["DieselGameBoxTall", "OfferImageTall", "Thumbnail"].contains(&i["type"].as_str().unwrap_or(""))).or_else(|| images.first());
                        g.cover = https_cover(cover.and_then(|i| i["url"].as_str()));
                    }
                    Ok::<_,String>(Some(g))
                });
                if tasks.len() >= 4 {
                    if let Some(result) = tasks.join_next().await {
                        if let Some(g) = result.map_err(|_| "Epic metadata task failed.")?? {
                            games.push(g)
                        }
                    }
                }
            }
            while let Some(result) = tasks.join_next().await {
                if let Some(g) = result.map_err(|_| "Epic metadata task failed.")?? {
                    games.push(g)
                }
            }
        }
        _ => unreachable!(),
    }
    let count = games.len();
    db.merge(games, Some(store), &[])?;
    account.last_sync = now();
    db.account(&account)?;
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_epic_json_without_echoing_code() {
        assert_eq!(
            code_from_input("epic", r#"{"authorizationCode":"example123"}"#).unwrap(),
            "example123"
        );
    }
    #[test]
    fn rejects_wrong_redirect_origin() {
        assert!(code_from_input("gog", "https://attacker.test/on_login_success?code=abc").is_err());
    }
    #[test]
    fn accepts_gog_redirect() {
        assert_eq!(
            code_from_input(
                "gog",
                "https://embed.gog.com/on_login_success?origin=client&code=1234"
            )
            .unwrap(),
            "1234"
        );
    }
    #[test]
    fn rejects_empty_or_command_input() {
        assert!(code_from_input("epic", "").is_err());
        assert!(code_from_input("epic", "abc;run").is_err());
    }
}
