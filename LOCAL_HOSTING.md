# Running the game locally (Windows / LAN, no Fly.io)

You can run the server on your own machine and have players join over your local network. No Fly.io, no cloud bill. Multiple rooms and many players work the same as online.

## Quick start on Windows

### 1. Install Node.js

- Download and install from [nodejs.org](https://nodejs.org/) (LTS).
- Open **Command Prompt** or **PowerShell** and check:
  ```bash
  node -v
  npm -v
  ```

### 2. Get the project and install dependencies

```bash
cd path\to\remote-stock-exchange
npm install
```

### 3. Start the server

```bash
npm start
```

You should see something like:

- `Server successfully running on 0.0.0.0:3000`
- `Health check available at: http://0.0.0.0:3000/health`

Leave this window open while you play.

### 4. How players connect

- **On the same PC (host):**  
  Open a browser and go to: **http://localhost:3000**

- **Other devices on your Wi‑Fi/LAN (phones, other PCs):**  
  1. Find your Windows PC’s IP address:
     - Open **Command Prompt** and run: `ipconfig`
     - Look for **IPv4 Address** under your active adapter (e.g. `192.168.1.5`).
  2. On the other device, open a browser and go to: **http://YOUR_IP:3000**  
     Example: **http://192.168.1.5:3000**

Everyone must use the **same** URL (either `localhost:3000` or `YOUR_IP:3000`). The game uses that URL to talk to the server.

### 5. Running a session (multiple rooms, many players)

1. **Host (you)** on the server PC:
   - Open http://localhost:3000 (or http://YOUR_IP:3000).
   - Click **Create Room**.
   - You get a **4‑digit room code** (e.g. `1234`). You’re in the room as the first player (admin).

2. **Other players** (same PC or other devices):
   - Open the **same** base URL (http://localhost:3000 or http://YOUR_IP:3000).
   - Enter the **room code** and their **name**.
   - Click **Join Room**.

3. **Start the game:**
   - When everyone has joined, click **Start Game** (admin only).
   - Up to **12 players per room**. You can create **multiple rooms** with different codes; each room is a separate game.

4. **Firewall (if others can’t connect):**
   - Windows may ask to allow Node when you first run `npm start`. Choose **Private networks** (or allow access).
   - If others still can’t connect, allow **port 3000** for Node in Windows Defender Firewall (inbound rule for `node.exe` or the app using port 3000).

## Optional: Firebase (stats / persistence)

- The game runs **without** Firebase. Rooms and game state are in memory; when you stop the server, they’re gone.
- If you want stats or persistence:
  - Put your Firebase service account JSON in the project folder and set:
    - **PowerShell:** `$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\remote-stock-exchange\your-service-account.json"`
    - **Command Prompt:** `set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\remote-stock-exchange\your-service-account.json`
  - Then run `npm start` in that same terminal.

## Summary

| Step              | Action |
|-------------------|--------|
| Start server      | `npm start` on the host PC |
| Host plays        | http://localhost:3000 or http://YOUR_IP:3000 |
| Others join       | Same URL, then room code + name |
| Multiple rooms    | Create Room again for a new code; each room is separate |
| Many players      | Up to 12 per room; no limit on number of rooms |

No internet or Fly.io is required once the app is installed; everything stays on your LAN.
