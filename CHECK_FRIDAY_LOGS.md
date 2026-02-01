# How to Check Friday 2 PM Crash Logs on Fly

## Logs are hard to find

- **`fly logs`** only returns the **recent in-memory buffer** (~100 lines), not historical logs. Friday’s logs are not available via the CLI.
- The **Fly dashboard Log Search** (Grafana) can show historical logs, but it’s easy to miss or not have access.
- So we can’t rely on finding past logs; we have to **harden the app for load** and **log load** so the next time you have a crash we can see what was happening.

## Likely cause: load / “bandwidth” of the machine

If you’re sure you weren’t idle long enough to trigger a restart, the next best explanation is **load**:

- **4 rooms × 5 people** = 20 WebSocket connections + game traffic. Under load the Node process can:
  - **Run out of memory (OOM)** – 1GB VM is tight; the OS kills the process and Fly restarts the machine.
  - **Block the event loop** – heavy work or a bug under load can make the process slow or unresponsive; the platform may kill it or things time out.
- Fly’s **concurrency limits** (soft 500, hard 1000 connections) are well above 20, so connection count alone isn’t the issue – it’s **memory and CPU** on a small machine under burst load.

**What we changed to address load:**

1. **VM memory 1GB → 2GB** in `fly.toml` – more headroom for 4 games + 20 connections.
2. **Health check timeout 10s → 15s** – a bit more margin when the machine is busy.
3. **Load logging** – every 2 minutes when there are active rooms, the server logs `[Load] rooms=X connections=Y heapMB=Z rssMB=W`. If you run `fly logs` during the next game and it crashes, you’ll see the last load line right before the crash (e.g. high heapMB before OOM).

---

## What we tried from here (historical logs)

- The **Fly HTTP Logs API** (with `start_time=...`) can return historical logs (~15 days), but it requires authenticated API access; from this environment we can’t use your Fly login to call it.
- So to see Friday around 2 PM you’d need the **Fly dashboard** (or Grafana Log Search) – see below.

---

## How to get Friday Jan 30 ~2 PM logs

1. **Open your app in the Fly dashboard**  
   https://fly.io/apps/remote-stock-exchange

2. **Open Log Search (searchable logs)**  
   - In the app page, click **“Log Search”** (or **“Metrics”** → **“Logs”** / **“Log Search”** if your UI differs).  
   - That opens **Grafana** with your app’s logs.  
   - Or go directly: https://fly-metrics.net/d/fly-logs/fly-logs (sign in with Fly if prompted).

3. **Set the time range to Friday Jan 30, 2026, around 2 PM**  
   - In Grafana, use the time picker (top right).  
   - Choose a range that includes **Friday Jan 30, 2026**, e.g. **2 PM** in your timezone (e.g. 14:00–15:00 or 12:00–18:00 if you’re unsure).  
   - Retention is about **30 days**, so Jan 30 is still in range.

4. **Search for crash-related messages**  
   In the log search / query box, try:

   - `Idle Shutdown` – app shut down due to idle logic  
   - `SIGTERM` or `SIGINT` – process was told to stop  
   - `Uncaught Exception` or `Unhandled Rejection` – JS crash  
   - `OOM` or `out of memory` – out of memory kill  
   - `process.exit` or `Graceful shutdown`  
   - `Active rooms` – to see how many rooms were active before a restart  
   - `Error` or `error` – general errors  

   If the UI supports free-text search, you can also search for:  
   **"Idle Shutdown"**, **"SIGTERM"**, **"Uncaught"**, **"OOM"**, **"Active rooms"**.

---

## How to interpret what you see

| Log message / pattern | Likely cause |
|------------------------|---------------|
| `[Idle Shutdown] ... Initiating graceful shutdown` | App’s idle timer decided to exit (e.g. no activity for 10 min). **Fix already applied:** server no longer idle-shuts down when there are active rooms. |
| `SIGTERM received` / `SIGINT received` | Platform or process manager sent terminate (e.g. Fly stopping the machine, or you hitting Ctrl+C). |
| `Uncaught Exception` / `Unhandled Rejection` + stack trace | Bug in app code; check the stack trace and fix the code. |
| OOM / out of memory | VM ran out of memory; consider increasing memory in `fly.toml` (e.g. to 2GB). |
| Health check failures before restart | Load or slowness caused health checks to fail; Fly may have restarted the machine. |

---

## After you’ve checked

- If you see **Idle Shutdown** with **Active rooms: 4** (or similar), that matches the bug we fixed (idle shutdown no longer runs when any rooms exist).
- If you see **OOM**, increase `memory` in `fly.toml` and redeploy.
- If you see **Uncaught Exception** or **Unhandled Rejection**, share the stack trace (or the relevant log lines) and we can track down the code path.

If you paste a few lines of the Friday 2 PM logs here (with any secrets redacted), we can interpret them and suggest next steps.

---

## Next time you run 4 rooms

- **Run `fly logs` in a terminal** during the game (or leave it tailing). You’ll see `[Load] rooms=4 connections=20 heapMB=...` every 2 minutes. If the app crashes, the last line before the crash will show whether memory was high (OOM) or connections were spiking.
- With **2GB memory** and **load logging** in place, the next run should either stay up or give you a clear line to grep for in the buffer.
