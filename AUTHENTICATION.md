# Authentication client provenance

The Epic and GOG connectors contain **shared launcher OAuth client identifiers and client passwords**. They are not a user's account password, API key, access token, refresh token, or one-time authorization code.

Before initial publication, all four constants in `src-tauri/src/stores.rs` were compared with their already-public upstream implementations. Each matched exactly:

| GameShelf constant | Public upstream source |
| --- | --- |
| `EPIC_CLIENT` | [Legendary `EPCAPI._user_basic`](https://github.com/legendary-gl/legendary/blob/42f6bdeadde3a9526dc8eb713763476999ac217b/legendary/api/egs.py) |
| `EPIC_CLIENT_SECRET` | [Legendary `EPCAPI._pw_basic`](https://github.com/legendary-gl/legendary/blob/42f6bdeadde3a9526dc8eb713763476999ac217b/legendary/api/egs.py) |
| `GOG_CLIENT` | [gogdl `CLIENT_ID`](https://github.com/Heroic-Games-Launcher/heroic-gogdl/blob/ac1580aeb004dda75557c97be9cc3105d50eeecb/gogdl/auth.py) |
| `GOG_CLIENT_SECRET` | [gogdl `CLIENT_SECRET`](https://github.com/Heroic-Games-Launcher/heroic-gogdl/blob/ac1580aeb004dda75557c97be9cc3105d50eeecb/gogdl/auth.py) |

These immutable references identify the public source checked on 10 October 2026. Publishing these constants does not newly disclose account credentials. Their presence in community clients is evidence of public availability, not a claim of official provider partnership or approval.

Users still authenticate through the provider's official website. Their one-time login code is exchanged for an individual account session. Individual account tokens and the personal Steam Web API key are stored in Windows Credential Manager and must never be committed, logged, returned to the UI, or included in release artifacts.

No user credentials, launcher credential files, personal databases, or native qualification data are part of this repository. If a future integration introduces application credentials that are not already public, keep them out of source control and revise the authentication design before publication.
