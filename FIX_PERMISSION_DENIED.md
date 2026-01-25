# Fix Permission Denied Error - Step by Step

## The Problem
You're getting "Permission denied" because Firestore security rules are blocking the read operation.

## The Solution (5 minutes)

### Step 1: Open Firebase Console
1. Go to: https://console.firebase.google.com/
2. Select your project: **remotestockexchange**

### Step 2: Navigate to Firestore Rules
1. In the left sidebar, click **Firestore Database**
2. Click on the **Rules** tab (at the top)

### Step 3: Replace the Rules
You'll see something like this (probably in test mode):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

**Replace it with this:**

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

### Step 4: Publish
1. Click the **Publish** button (top right)
2. Confirm the publish

### Step 5: Test
1. Go back to your game
2. Click "My Stats" button
3. It should work now! ✅

## What These Rules Do

- **Games**: Anyone can read (for viewing game history), but only the server can write
- **Player Stats**: Users can only read their own stats (where `firebaseUid` matches their auth UID)
- **Player Summaries**: Users can only read their own summary (where document ID matches their auth UID)

## Still Not Working?

If you still get permission denied after updating rules:

1. **Wait 30 seconds** - Rules can take a moment to propagate
2. **Refresh the page** - Clear browser cache
3. **Check you're logged in** - The rules require authentication
4. **Check browser console** - Look for any other error messages

## Need Help?

If it's still not working, check:
- Are you logged in? (Check the top of the page - should show your email)
- Did you click "Publish" after updating the rules?
- Are you using the correct Firebase project?
