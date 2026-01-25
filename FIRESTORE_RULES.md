# Firestore Security Rules - Quick Fix

## Current Issue

If you're getting "Unable to load statistics" error, it's likely because Firestore security rules are blocking the read operation.

## Quick Fix

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **remotestockexchange**
3. Go to **Firestore Database** > **Rules**
4. Replace the rules with this:

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
      allow read: if request.auth != null && resource.data.firebaseUid == request.auth.uid;
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

5. Click **Publish**

## Test Rules

After updating, try the "My Stats" button again. If it still doesn't work:

1. Open browser console (F12)
2. Click "My Stats" button
3. Look for error messages
4. Check if you see:
   - `[game-stats] Loading stats for userId: ...`
   - `[game-stats] Querying Firestore for player_summaries/...`
   - Any permission errors

## Alternative: Temporary Test Mode

If you want to test quickly, you can temporarily use test mode (NOT for production):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.time < timestamp.date(2026, 12, 31);
    }
  }
}
```

⚠️ **WARNING**: This allows anyone to read/write. Only use for testing, then switch back to the secure rules above.

## Verify Data Exists

To check if your stats were actually saved:

1. Go to Firebase Console > Firestore Database
2. Look for `player_summaries` collection
3. Check if there's a document with your Firebase UID as the document ID
4. If not, the stats weren't saved (maybe you were in guest mode when you played)

## If Stats Don't Exist

If you played while in guest mode, your stats were saved with a player UUID, not your Firebase UID. To fix:

1. Make sure you're logged in
2. Play a new game
3. End the game
4. Check the server logs for: `[saveGameDataToFirestore] Saving stats for player ...: FirebaseUID=...`
5. Try "My Stats" again
