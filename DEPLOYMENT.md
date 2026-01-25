# Deployment Guide for Fly.io

## Pre-Deployment Checklist

### 1. ✅ Files Already Ignored (via .gitignore)
- `node_modules/` - Will be installed on Fly.io during build
- Firebase service account keys - Never commit these!
- Environment files (`.env`)
- Log files
- OS files (`.DS_Store`, etc.)

### 2. 🔐 Set Firebase Credentials on Fly.io

The Firebase service account key should **NOT** be committed to Git. Instead, set it as a secret on Fly.io:

```bash
# Option 1: Set the file path (if you upload the file separately)
fly secrets set GOOGLE_APPLICATION_CREDENTIALS="/app/serviceAccountKey.json"

# Option 2: Set the JSON content directly (recommended)
fly secrets set FIREBASE_SERVICE_ACCOUNT="$(cat remotestockexchange-firebase-adminsdk-fbsvc-77e2b59911.json)"
```

**Or use the Fly.io dashboard:**
1. Go to your app on fly.io
2. Settings → Secrets
3. Add secret: `GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT`
4. Paste the JSON content or file path

### 3. 📦 Verify .gitignore

Before pushing to GitHub, verify these files are ignored:

```bash
git status
```

You should **NOT** see:
- ❌ `node_modules/`
- ❌ `remotestockexchange-firebase-adminsdk-*.json`
- ❌ `.env` files
- ❌ `.DS_Store`

### 4. 🚀 Deploy to Fly.io

If you have GitHub integration set up:

1. Push to GitHub:
   ```bash
   git add .
   git commit -m "Add authentication and dashboard features"
   git push origin main
   ```

2. Fly.io will automatically:
   - Detect the push
   - Build the Docker image
   - Install dependencies (`npm install`)
   - Deploy the app

3. Or deploy manually:
   ```bash
   fly deploy
   ```

### 5. ✅ Post-Deployment

After deployment, verify:

1. **Server is running:**
   ```bash
   fly status
   ```

2. **Check logs:**
   ```bash
   fly logs
   ```
   Look for: `[Firebase] Firebase Admin initialized successfully.`

3. **Test the app:**
   - Visit your Fly.io URL
   - Try logging in
   - Play a game
   - Check if stats are saved

## Important Notes

### Firebase Configuration

The `public/firebase-config.js` file contains your Firebase config. This is **safe to commit** as it's client-side configuration (API keys are meant to be public for client apps).

However, the **service account key** (server-side) should **NEVER** be committed.

### Environment Variables

If you need other environment variables, set them on Fly.io:

```bash
fly secrets set VARIABLE_NAME="value"
```

### Troubleshooting

**If deployment fails:**
1. Check `fly logs` for errors
2. Verify Firebase credentials are set: `fly secrets list`
3. Check if `npm install` completes successfully
4. Verify Firestore security rules are set correctly

**If stats aren't saving:**
1. Check server logs for Firebase initialization
2. Verify `GOOGLE_APPLICATION_CREDENTIALS` secret is set
3. Check Firestore security rules allow server writes

## Security Reminders

⚠️ **NEVER commit:**
- Firebase service account JSON files
- `.env` files with secrets
- API keys (except client-side Firebase config)

✅ **Safe to commit:**
- `public/firebase-config.js` (client-side config)
- `package.json` and `package-lock.json`
- Source code
- Documentation files
