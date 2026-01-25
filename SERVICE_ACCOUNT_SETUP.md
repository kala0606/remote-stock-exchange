# Firebase Service Account Setup Guide

## Quick Setup Steps

You've downloaded the service account JSON file. Here's how to use it:

### Step 1: Locate Your JSON File

Find where you saved the downloaded JSON file. It should have a name like:
- `remotestockexchange-firebase-adminsdk-xxxxx-xxxxx.json`
- Or whatever name you gave it when downloading

### Step 2: Choose Your Setup Method

#### **Method A: File Path (Recommended - Easiest)**

1. Move the JSON file to your project directory (or keep it where it is, just remember the path)
   
2. Set the environment variable pointing to the file:
   
   **On Mac/Linux:**
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="/full/path/to/your/file.json"
   ```
   
   **Example:**
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="/Users/18391l/Desktop/remote-stock-exchange/serviceAccountKey.json"
   ```
   
   **On Windows (Command Prompt):**
   ```cmd
   set GOOGLE_APPLICATION_CREDENTIALS=C:\full\path\to\your\file.json
   ```
   
   **On Windows (PowerShell):**
   ```powershell
   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\full\path\to\your\file.json"
   ```

3. **Make it permanent** (so you don't have to set it every time):
   
   **Mac/Linux:** Add to `~/.bashrc` or `~/.zshrc`:
   ```bash
   echo 'export GOOGLE_APPLICATION_CREDENTIALS="/full/path/to/your/file.json"' >> ~/.zshrc
   source ~/.zshrc
   ```
   
   **Windows:** Add as a System Environment Variable through System Properties

#### **Method B: JSON Content as Environment Variable**

1. Open the JSON file in a text editor
2. Copy the entire contents
3. Set it as an environment variable:
   
   **Mac/Linux:**
   ```bash
   export FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"remotestockexchange",...}'
   ```
   
   ⚠️ **Important**: 
   - Use single quotes around the JSON
   - The JSON must be on one line
   - Escape any single quotes inside the JSON with `\'`

### Step 3: Verify It Works

1. Start your server:
   ```bash
   npm start
   ```

2. Look for this message in the console:
   ```
   [Firebase] Firebase Admin initialized successfully.
   ```

3. If you see a warning instead:
   ```
   [Firebase] Could not initialize Firebase Admin...
   ```
   
   Check:
   - The file path is correct
   - The file exists at that location
   - You have read permissions for the file
   - The JSON file is valid (not corrupted)

### Step 4: Test Data Saving

1. Play a game
2. End the game (as admin)
3. Check your Firebase Console > Firestore Database
4. You should see new documents in the `games` and `player_stats` collections

## Troubleshooting

### "Could not initialize Firebase Admin"

**Check 1: File Path**
- Make sure the path is absolute (starts with `/` on Mac/Linux or `C:\` on Windows)
- No typos in the path
- File actually exists at that location

**Check 2: File Permissions**
```bash
# On Mac/Linux, check if file is readable:
ls -l /path/to/your/file.json

# If needed, make it readable:
chmod 644 /path/to/your/file.json
```

**Check 3: JSON File Validity**
```bash
# Test if JSON is valid:
cat /path/to/your/file.json | python -m json.tool
# Should output the JSON without errors
```

**Check 4: Environment Variable**
```bash
# Check if variable is set:
echo $GOOGLE_APPLICATION_CREDENTIALS

# Or for FIREBASE_SERVICE_ACCOUNT:
echo $FIREBASE_SERVICE_ACCOUNT
```

### For Production Deployment

**Fly.io:**
```bash
# Option 1: Upload file and set path
fly secrets set GOOGLE_APPLICATION_CREDENTIALS="/app/serviceAccountKey.json"
# Then copy file to your Fly app

# Option 2: Set JSON content directly
fly secrets set FIREBASE_SERVICE_ACCOUNT="$(cat serviceAccountKey.json)"
```

**Heroku:**
```bash
# Set as config var
heroku config:set GOOGLE_APPLICATION_CREDENTIALS="$(cat serviceAccountKey.json)"
```

**Docker:**
Add to your Dockerfile or docker-compose.yml:
```yaml
environment:
  - GOOGLE_APPLICATION_CREDENTIALS=/app/serviceAccountKey.json
volumes:
  - ./serviceAccountKey.json:/app/serviceAccountKey.json
```

## Security Notes

⚠️ **IMPORTANT:**
- **NEVER** commit the service account JSON file to Git
- Add it to `.gitignore`:
  ```
  serviceAccountKey.json
  *-firebase-adminsdk-*.json
  ```
- Keep the file secure - it has full access to your Firebase project
- If the file is ever exposed, regenerate it immediately in Firebase Console

## Need Help?

If you're still stuck:
1. Check the server console for specific error messages
2. Verify the JSON file opens correctly in a text editor
3. Make sure you're using the correct environment variable name
4. Try Method A (file path) if Method B isn't working
