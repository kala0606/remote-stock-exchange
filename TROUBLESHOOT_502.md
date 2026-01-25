# Troubleshooting 502 Bad Gateway on Fly.io

## Quick Diagnosis

A 502 error means the app isn't starting or is crashing. Let's check:

### Step 1: Check Fly.io Logs

```bash
fly logs
```

Look for:
- ❌ Error messages
- ❌ "Server startup error"
- ❌ Missing dependencies
- ✅ "Server successfully running on 0.0.0.0:3000"

### Step 2: Check App Status

```bash
fly status
```

Should show the app as "running". If it shows "stopped" or keeps restarting, there's a crash.

### Step 3: Common Issues & Fixes

#### Issue 1: Missing Dependencies

**Symptoms:** Errors about missing modules in logs

**Fix:**
```bash
# Check package.json includes all dependencies
# Make sure firebase-admin is listed
```

#### Issue 2: Firebase Credentials Not Set

**Symptoms:** App might start but Firebase errors

**Fix:**
```bash
# Set Firebase credentials
fly secrets set FIREBASE_SERVICE_ACCOUNT="$(cat remotestockexchange-firebase-adminsdk-fbsvc-77e2b59911.json)"
```

#### Issue 3: Port Binding Issue

**Symptoms:** "EADDRINUSE" or port errors

**Fix:** The server should bind to `0.0.0.0:3000` (already configured)

#### Issue 4: Health Check Failing

**Symptoms:** App starts but health check fails

**Fix:** The `/health` endpoint should return 200. Check if it's accessible.

### Step 4: Test Locally First

Before deploying, test the Docker build locally:

```bash
# Build the image
docker build -t remote-stock-exchange .

# Run it
docker run -p 3000:3000 \
  -e PORT=3000 \
  -e FIREBASE_SERVICE_ACCOUNT="$(cat remotestockexchange-firebase-adminsdk-fbsvc-77e2b59911.json)" \
  remote-stock-exchange
```

If this works locally, the issue is with Fly.io configuration.

### Step 5: Check Fly.io Configuration

Verify `fly.toml`:
- `internal_port = 3000` ✅
- `PORT = "3000"` in `[env]` ✅

### Step 6: Restart the App

```bash
fly apps restart remote-stock-exchange
```

### Step 7: SSH into the Container (Advanced)

```bash
fly ssh console
```

Then check:
- Is the server process running? `ps aux | grep node`
- Are there any error logs? `cat /var/log/...`
- Can you access the port? `curl http://localhost:3000/health`

## Most Likely Causes

1. **Firebase initialization failing** - But this should only warn, not crash
2. **Missing npm dependencies** - Check if `npm ci` completed successfully
3. **Port binding issue** - Server not listening on the right port
4. **Syntax error in code** - Check logs for JavaScript errors

## Quick Fix Commands

```bash
# View recent logs
fly logs --app remote-stock-exchange

# Restart the app
fly apps restart remote-stock-exchange

# Check status
fly status

# Set Firebase secret (if not set)
fly secrets set FIREBASE_SERVICE_ACCOUNT="$(cat remotestockexchange-firebase-adminsdk-fbsvc-77e2b59911.json)"

# Redeploy
fly deploy
```

## Still Not Working?

Share the output of:
```bash
fly logs --app remote-stock-exchange
```

This will show the exact error causing the 502.
