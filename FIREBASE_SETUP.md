# Firebase Setup Guide

This guide will help you set up Firebase for authentication and data storage in the Remote Stock Exchange game.

## Prerequisites

1. A Google account
2. Node.js installed on your server

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or select an existing project
3. Follow the setup wizard:
   - Enter project name
   - Enable/disable Google Analytics (optional)
   - Click "Create project"

## Step 2: Enable Authentication

1. In Firebase Console, go to **Authentication** > **Get started**
2. Click on **Sign-in method** tab
3. Enable **Email/Password** provider:
   - Click on "Email/Password"
   - Toggle "Enable" to ON
   - Click "Save"

## Step 3: Create Firestore Database

1. In Firebase Console, go to **Firestore Database** > **Create database**
2. Choose **Start in test mode** (for development) or **Production mode** (for production)
3. Select a location for your database
4. Click "Enable"

## Step 4: Get Firebase Configuration

1. In Firebase Console, go to **Project Settings** (gear icon)
2. Scroll down to **Your apps** section
3. Click the web icon (`</>`) to add a web app
4. Register your app with a nickname (e.g., "Remote Stock Exchange")
5. Copy the Firebase configuration object

## Step 5: Configure Client-Side Firebase

1. Open `public/firebase-config.js`
2. Replace the placeholder values with your Firebase config:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

## Step 6: Configure Server-Side Firebase Admin

You have two options for server-side authentication:

### Option A: Service Account Key (Recommended for Production)

1. In Firebase Console, go to **Project Settings** > **Service accounts**
2. Click **Generate new private key**
3. Download the JSON file (it will have a name like `remotestockexchange-firebase-adminsdk-xxxxx.json`)
4. **Choose ONE of these methods:**

   **Method 1: Using File Path (Easiest)**
   
   Save the JSON file somewhere safe on your server (e.g., in your project root or a secure folder).
   
   Then set the environment variable to point to the file:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="/full/path/to/your/serviceAccountKey.json"
   ```
   
   Example (if file is in project root):
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="/Users/18391l/Desktop/remote-stock-exchange/serviceAccountKey.json"
   ```
   
   **Method 2: Using JSON Content as Environment Variable**
   
   Open the JSON file and copy its entire contents. Then set it as an environment variable:
   ```bash
   export FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"remotestockexchange",...}'
   ```
   
   ⚠️ **Note**: Make sure to use single quotes around the JSON, and escape any single quotes inside the JSON with `\'` if needed. This method can be tricky, so Method 1 is recommended.
   
   **For Production (Fly.io, Heroku, etc.):**
   
   - **Fly.io**: Add to `fly secrets`:
     ```bash
     fly secrets set GOOGLE_APPLICATION_CREDENTIALS="$(cat /path/to/serviceAccountKey.json)"
     ```
   
   - **Heroku**: Add config var with the file path or use a config var for the JSON content
   
   - **Other platforms**: Set the environment variable in your platform's configuration

### Option B: Application Default Credentials (For Local Development)

If running on Google Cloud or with gcloud CLI configured:
```bash
gcloud auth application-default login
```

## Step 7: Set Firestore Security Rules

1. In Firebase Console, go to **Firestore Database** > **Rules**
2. Update rules to allow authenticated users to read their own data:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Games collection - anyone can read, only server can write
    match /games/{gameId} {
      allow read: if true;
      allow write: if false; // Only server can write
    }
    
    // Player stats - users can read their own stats
    match /player_stats/{statId} {
      allow read: if request.auth != null && resource.data.playerUuid == request.auth.uid;
      allow write: if false; // Only server can write
    }
    
    // Player summaries - users can read their own summary
    match /player_summaries/{playerId} {
      allow read: if request.auth != null && playerId == request.auth.uid;
      allow write: if false; // Only server can write
    }
  }
}
```

## Step 8: Install Dependencies

```bash
npm install
```

## Step 9: Test the Setup

1. Start your server:
   ```bash
   npm start
   ```

2. Open the game in your browser
3. Try creating an account (Sign Up)
4. Play a game and end it
5. Check Firebase Console > Firestore Database to see if data is being saved
6. Visit `/dashboard.html` to view your stats

## Troubleshooting

### "Firebase Admin SDK not available"
- Make sure `firebase-admin` is installed: `npm install firebase-admin`
- Check that your service account credentials are properly configured

### "Permission denied" errors
- Check Firestore security rules
- Ensure authentication is working (check browser console)

### Data not saving
- Check server logs for Firebase errors
- Verify service account has proper permissions
- Check that Firestore is enabled in Firebase Console

## Security Notes

- Never commit your Firebase service account key to version control
- Use environment variables for sensitive credentials
- Review and update Firestore security rules for production
- Consider enabling Firebase App Check for additional security

## Support

For more information, see:
- [Firebase Documentation](https://firebase.google.com/docs)
- [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
