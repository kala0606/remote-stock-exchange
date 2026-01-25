# Environment Variable Setup - Quick Reference

## ✅ Environment Variable is Set!

The Firebase service account credentials are configured.

**File Location:**
```
/Users/18391l/Desktop/remote-stock-exchange/remotestockexchange-firebase-adminsdk-fbsvc-77e2b59911.json
```

**Environment Variable:**
```bash
GOOGLE_APPLICATION_CREDENTIALS="/Users/18391l/Desktop/remote-stock-exchange/remotestockexchange-firebase-adminsdk-fbsvc-77e2b59911.json"
```

## How to Use

### Option 1: Use the Startup Script (Recommended)

I've created a startup script that automatically sets the environment variable:

```bash
./start-server.sh
```

This will:
1. Set the Firebase credentials
2. Start your server

### Option 2: Set Manually Each Time

If you prefer to use `npm start` directly, set the variable first:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/Users/18391l/Desktop/remote-stock-exchange/remotestockexchange-firebase-adminsdk-fbsvc-77e2b59911.json"
npm start
```

### Option 3: Make It Permanent (For Your User)

Add to your `~/.zshrc` (or `~/.bashrc` if using bash):

```bash
echo 'export GOOGLE_APPLICATION_CREDENTIALS="/Users/18391l/Desktop/remote-stock-exchange/remotestockexchange-firebase-adminsdk-fbsvc-77e2b59911.json"' >> ~/.zshrc
source ~/.zshrc
```

After this, the variable will be set automatically in all new terminal sessions.

## Verify It's Working

When you start the server, you should see:

```
[Firebase] Firebase Admin initialized successfully.
```

If you see:
```
[Firebase] Could not initialize Firebase Admin...
```

Then check:
1. The file exists at the path
2. The environment variable is set: `echo $GOOGLE_APPLICATION_CREDENTIALS`
3. The file is readable: `ls -l "$GOOGLE_APPLICATION_CREDENTIALS"`

## Security Note

✅ The service account JSON file has been added to `.gitignore` to prevent accidentally committing it to Git.

**Never commit this file to version control!**
