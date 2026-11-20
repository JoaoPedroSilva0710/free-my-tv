# Local Samsung follow-up

Base commit: `ed6be1ecaa98804c383fa021cdb648fd80f061f3`.

- Samsung HDMI 4 is labeled **PC** and is added to the main shelf once, preserving the saved app order; removing it stays removed. The TV reports it disconnected when no signal is present, but the existing `TV.launch` source path still attempts it.
- Focused shelf tiles and All Apps cards have a blue 6 px outline that remains under `.lite` and `.flat`.
- The user confirmed HDMI 4 is the PC and the TV has a fixed DHCP reservation on the router.
- `bash tools/check.sh web` passed. `python3 tizen/build.py --generic --preview` generated `out/tizen/index.html` and the unsigned local `FreeMyTV-tizen.wgt`.
- After explicit authorization, TizenBrew Installer reported Samsung re-signing and `install completed` for `FreeMyTVio.FreeMyTV` 1.3.0 on Tizen 9. Its signer used the configured author and distributor certificates in memory. The private configuration SHA-256 was unchanged. The local WGT remains unsigned; its pre-signing backup is `/tmp/FreeMyTV-tizen-unsigned-before-signing.wgt`.
- Tizen REST reports the updated app `running: true`, `visible: false`. `was_execute` and REST POST acknowledged launch, but the app was not confirmed in the foreground. SDB refused the one Runtime inspector command; no Runtime.evaluate, visual screenshot or HDMI 4 source switch was verified.
- `node ../tests/startup-probe.js` passed. The Android build and browser rendering were not verified. No uninstall, data clear or TV settings change was made.

## Controle da TV — 2026-11-12

- Installed `TVStartPrb.Probe` 1.0.16 over the existing package using the existing Samsung certificates; installer configuration unchanged, no uninstall or quota reset. `ControleTV.wgt` is the unsigned source package; the installer signs its copy.
- Confirmed on the TV that permitting `http://127.0.0.1:8134` explicitly in the widget manifest fixes HTTP diagnostics. The previous origin without a port produced `TypeError: Failed to fetch`. Removed the unsuccessful message-port transport and all temporary remote logging from the final package.
- Service initialization now handles both lifecycle entry points once and exposes dependency-loading failures through its HTTP status before initializing quota storage.
- Hardware test used the existing remaining 86 seconds: reached `remaining: 0`, `protection: Limite atingido`, `error: null`; YouTube changed from visible to hidden. Reopening YouTube was blocked again. After installing the final build and terminating/relaunching the control package, zero remaining persisted and another YouTube launch became hidden within 3 seconds.
- Both `node ../tests/control-page.js` and `node ../tests/startup-probe.js` passed. Firmware update and a full TV power cycle remain unverified.
- Local service status can be read without Web Inspector through an SDB `tcp:8134` stream: send an HTTP GET to `127.0.0.1:8134`, then parse the HTTP response including chunked encoding. `/tmp/read-tv-control.py` implements this read-only check.

## Vídeos de hoje — 2026-11-20

- New `video_feed_url` in `config.properties` (`config.example.properties` documents it). `tools/webapp.py` packs it into `config.js` as `videoFeedUrl`; plain `http://` is accepted only for private/LAN hosts, like `build.sh`'s `lan_server`. Because this TV's builds use `--generic`, a generic build still reads only this key from `config.properties` when the file exists. The local `config.properties` (git-ignored) points `video_feed_url` at the PC's `http://<PC LAN IP>:3330/tv.json` (served by the Discord bot).
- `web/data.js` `Videos`: fetches the feed at start, every 5 min (30 s tick) and when the launcher becomes visible or is reopened; keeps the last feed in `localStorage` (`fmtv.videos`) and shows it only while `date` equals the TV's local date, so the row disappears at midnight and with another day's cache. Items need an 11-character YouTube id and a title; thumbnails come from `i.ytimg.com/vi/<id>/mqdefault.jpg` (16:9, without hqdefault's bars).
- `web/home.js`/`home.css`/`index.html`: "Vídeos de hoje" row (thumbnail, duration, title, channel) between the picks and the shelf; with it, the picks get shorter. ↑ from the shelf goes to the row, ↑ from the row to the picks (or the top buttons), ↓ from the picks to the row. Focus has the same blue 6 px outline as the shelf. `Today's videos` added to all 27 catalogues.
- `web/tv.js` `TV.youtube(id)`: Samsung uses DIAL `POST 127.0.0.1:8001/ws/apps/YouTube` with body `v=<id>` (`post` now takes a body), then `launchAppControl` with `PAYLOAD {"values":"v=<id>"}` to `9Ur5IzDKqV.TizenYouTube`, then `111299001912.YouTube`. LG opens `youtube.leanback.v4` with `contentTarget`. The Controle da TV quota still applies: the launcher only opens YouTube, and the probe hides it when the time runs out.
- `tests/WebVideosTest.js` (run by `tools/test-web.sh`): date gating, item filtering, storage, refresh interval, offline fallback. `bash tools/check.sh web`, `node ../tests/startup-probe.js` and `node ../tests/control-page.js` passed. `python3 tizen/build.py --generic --preview` built the unsigned `FreeMyTV-tizen.wgt`; headless Firefox on `out/tizen/index.html` showed the row with the real feed and ↑ from the shelf focusing it.
- The PC's NixOS firewall accepts TCP 3330 only from the TV's reserved IP.
- Installed over the existing app with TizenBrew Installer (driven over its WebSocket: `ConnectToTV`, then `InstallFile`; no uninstall, no data clear): `install completed` for `FreeMyTVio.FreeMyTV` 1.3.0. After re-signing, the installer wiped its own configuration (`authorCert`, `distributorCert`, `password` all `null`); it was restored from the private backup, same SHA-256. The `controle-tv` repository's `ferramentas/instalar.js` now backs it up and restores it by itself.
- The TV REST API reports the app `running: true`, `visible: false` after launch, as before; the row on the TV screen and opening a video with OK still need a check by eye.
- Repositories: this fork is `JoaoPedroSilva0710/free-my-tv` (branch `joao` on top of `ed6be1e`; `main` is the original base; `upstream` is simbasjungles/free-my-tv, already at 1.5.0). Controle da TV is `JoaoPedroSilva0710/controle-tv`.
