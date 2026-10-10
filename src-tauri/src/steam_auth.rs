use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};
use url::Url;

pub async fn begin(app: AppHandle, client: reqwest::Client) -> Result<(), String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|_| "Could not open the local Steam sign-in callback.")?;
    let port = listener
        .local_addr()
        .map_err(|_| "Could not open Steam sign-in.")?
        .port();
    let nonce = uuid::Uuid::new_v4();
    let return_to = format!("http://127.0.0.1:{port}/steam/{nonce}");
    let mut login = Url::parse("https://steamcommunity.com/openid/login").unwrap();
    login
        .query_pairs_mut()
        .append_pair("openid.ns", "http://specs.openid.net/auth/2.0")
        .append_pair("openid.mode", "checkid_setup")
        .append_pair("openid.return_to", &return_to)
        .append_pair("openid.realm", &format!("http://127.0.0.1:{port}/"))
        .append_pair(
            "openid.identity",
            "http://specs.openid.net/auth/2.0/identifier_select",
        )
        .append_pair(
            "openid.claimed_id",
            "http://specs.openid.net/auth/2.0/identifier_select",
        );
    open::that(login.as_str()).map_err(|_| "Could not open the browser for Steam sign-in.")?;
    tauri::async_runtime::spawn(async move {
        let result=tokio::time::timeout(Duration::from_secs(300),async{
            loop{let(mut stream,_)=listener.accept().await.map_err(|_|"Steam sign-in callback failed.")?;let mut buffer=vec![0u8;16384];let count=tokio::time::timeout(Duration::from_secs(5),stream.read(&mut buffer)).await.map_err(|_|"Steam callback timed out.")?.map_err(|_|"Steam callback could not be read.")?;
                let request=String::from_utf8_lossy(&buffer[..count]);let target=request.lines().next().and_then(|l|l.split_whitespace().nth(1)).unwrap_or("");let u=Url::parse(&format!("http://127.0.0.1:{port}{target}")).map_err(|_|"Invalid Steam callback.")?;
                if u.path()!=format!("/steam/{nonce}"){let _=stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await;continue}
                let fields:std::collections::HashMap<String,String>=u.query_pairs().map(|(k,v)|(k.into_owned(),v.into_owned())).collect();
                if fields.get("openid.return_to")!=Some(&return_to)||fields.get("openid.op_endpoint").map(String::as_str)!=Some("https://steamcommunity.com/openid/login")||fields.get("openid.mode").map(String::as_str)!=Some("id_res"){return Err("Steam sign-in was cancelled or could not be verified.")}
                let claimed=fields.get("openid.claimed_id").ok_or("Steam did not return an account ID.")?;let id=claimed.strip_prefix("https://steamcommunity.com/openid/id/").ok_or("Invalid Steam account identity.")?;
                if id.len()!=17||!id.chars().all(|c|c.is_ascii_digit())||fields.get("openid.identity")!=Some(claimed){return Err("Invalid Steam account identity.")}
                let mut verify=fields.clone();verify.insert("openid.mode".into(),"check_authentication".into());let response=client.post("https://steamcommunity.com/openid/login").form(&verify).send().await.map_err(|_|"Could not verify sign-in with Steam.")?;if !response.status().is_success(){return Err("Steam could not verify this sign-in.")}
                let body=response.text().await.map_err(|_|"Could not verify Steam response.")?;if !body.lines().any(|line|line.trim()=="is_valid:true"){return Err("Steam sign-in verification failed.")}
                let html="<!doctype html><html><head><title>GameShelf · Connected</title></head><body style='background:#10120f;color:#e6eedb;font:20px system-ui;padding:64px'><h1>Steam identity verified.</h1><p>Return to GameShelf to finish connecting your library. You can close this tab.</p></body></html>";
                let response=format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",html.len(),html);let _=stream.write_all(response.as_bytes()).await;return Ok(id.to_string());
            }
        }).await;
        match result {
            Ok(Ok(id)) => {
                let _ = app.emit("steam-identity", serde_json::json!({"accountId":id}));
            }
            Ok(Err(message)) => {
                let _ = app.emit("steam-auth-error", message);
            }
            Err(_) => {
                let _ = app.emit("steam-auth-error", "Steam sign-in timed out. Try again.");
            }
        }
    });
    Ok(())
}
