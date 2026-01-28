# Firebase on Fly.io – Game Data Not Saving

If game data saves on **localhost** but **not on Fly.io**, the app on Fly doesn’t have Firebase credentials. Set the secret below.

## One-time setup

### 1. Set the Firebase secret on Fly.io

From your project root (where the service account JSON file is), run:

```bash
fly secrets set FIREBASE_SERVICE_ACCOUNT="$(cat remotestockexchange-firebase-adminsdk-fbsvc-77e2b59911.json)"
```

- Use your actual filename if it’s different (e.g. `remotestockexchange-firebase-adminsdk-XXXXX.json`).
- Fly will restart the app after setting the secret.

### 2. Confirm Firebase is active

Open in a browser (use your real app name if different):

**https://remote-stock-exchange.fly.dev/api/status**

Check the JSON response. You want:

```json
"firebase": {
  "initialized": true,
  "credentialsSource": "FIREBASE_SERVICE_ACCOUNT"
}
```

If `initialized` is `false`, the secret isn’t set correctly.

### 3. Optional: set secret via Fly dashboard

1. Open [Fly.io Dashboard](https://fly.io/dashboard) → your app **remote-stock-exchange**.
2. Go to **Secrets**.
3. Click **Add secret**.
4. Name: `FIREBASE_SERVICE_ACCOUNT`
5. Value: paste the **entire contents** of `remotestockexchange-firebase-adminsdk-fbsvc-77e2b59911.json` (one line is fine).

## Verify

1. Play a game on the **Fly.io** URL while **logged in**.
2. End the game (admin clicks “End Game”).
3. Open Firebase Console → Firestore: you should see new documents in `games`, `player_stats`, `player_summaries`.
4. Open the dashboard on the Fly URL: your stats should appear.

## Troubleshooting

| Problem | Fix |
|--------|-----|
| `firebase.initialized: false` on Fly | Set `FIREBASE_SERVICE_ACCOUNT` secret (see above). |
| Invalid JSON when setting secret | Use `$(cat ...)` so the whole file is one string; avoid breaking the JSON. |
| Data still not saving | Check Fly logs: `fly logs` and look for `[saveGameDataToFirestore]` or Firebase errors. |
