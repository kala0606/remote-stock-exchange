# Why All Rooms Are Lost Suddenly (Server Restart)

## What’s happening

With **24 people in 4 rooms**, everyone is connected over **WebSockets**. After some time, the app restarts and **all rooms disappear** because game state is only in memory.

## Most likely cause: Fly.io auto-stop

Your config has:

```toml
auto_stop_machines = 'stop'
```

Fly decides a machine is **idle** based on **active HTTP traffic**, not on WebSocket connections. So:

- Players connect once (HTTP + WebSocket).
- During the game they only use the WebSocket; there are no new HTTP requests.
- Every few minutes Fly checks “load” and sees **no active HTTP connections**.
- It treats the machine as idle and **stops it**.
- When it stops, the process exits → all in-memory rooms are lost.
- The next visitor triggers `auto_start_machines` and a **new, empty** machine starts.

So the “restart” is Fly **stopping** the VM because it thinks nobody is using it, even though 24 people are still in the game.

## Other possible causes (less likely with your setup)

1. **Health check failure**  
   If `/health` is slow (e.g. >10s) under load, Fly may mark the app unhealthy and restart it. Your `/health` is very light, so this is only plausible under heavy CPU load.

2. **Out of memory (OOM)**  
   If the Node process uses more than 1GB, the platform can kill it. With 4 games and 24 players it’s usually fine, but if you see OOM in Fly logs, consider increasing memory.

3. **Uncaught exception / unhandled rejection**  
   A bug could crash the process. Check Fly logs for stack traces right before the restart.

4. **Your app’s idle shutdown**  
   Your server has a 10-minute idle shutdown, but it only runs when **both** global and per-room activity are idle. Game actions call `updateGameActivity()`, and Fly’s health checks hit `/health` every 2 minutes, so during normal play this path is unlikely to trigger.

## Recommended fix: turn off auto-stop when you need stability

So that Fly **does not** stop the machine during game sessions, set:

```toml
auto_stop_machines = 'off'
```

Then the machine stays running and rooms are only lost on a real crash or deploy. Trade-off: you pay for the machine even when no one is playing (no “scale to zero” during those hours).

**When to use:**

- **`off`** – Game days / when you need 24 people in 4 rooms without surprise restarts.
- **`stop`** – Casual use; you accept that long idle periods (no HTTP traffic) can cause Fly to stop the app and wipe rooms.

## After changing config

1. Set `auto_stop_machines = 'off'` in `fly.toml` (see above).
2. Deploy: `fly deploy`.
3. After the next “everyone lost” event, check Fly logs (`fly logs` or dashboard) for:
   - Messages about the machine stopping (auto-stop).
   - OOM or health-check failures.
   - Uncaught exceptions.

That will confirm whether auto-stop was the cause and rule out OOM or crashes.
