# Remote Stock Exchange - Game Start Guide

## The Ideal Way to Start a Game

### Step-by-Step Process:

1. **Admin Creates Room**
   - Click "Create Room" button
   - Note the 4-digit room code (e.g., "1234")
   - Admin automatically joins as first player

2. **Share Room Code**
   - Share the room code with other players
   - Players can now join anytime within 30 minutes
   - No need to coordinate timing - just share the code!

3. **Players Join Room**
   - Open the game website
   - Enter the room code and player name
   - Click "Join Room"
   - Wait for confirmation

4. **Admin Starts Game**
   - Once all players have joined
   - Click "Start Game" button
   - Game begins with random first player

### Best Practices:

- **Share room codes immediately** - Send the code to all players right away
- **Players can join anytime** - No need to coordinate timing anymore
- **Use clear player names** - Avoid duplicates and special characters
- **Keep room codes handy** - Players may need to rejoin if disconnected
- **Check connection status** - Green dot means connected, red means disconnected

## Troubleshooting "Room Not Found" Errors

### Common Causes:

1. **Server Restart** (Most Common)
   - Fly.io free tier restarts servers during inactivity
   - All room data is lost when server restarts
   - **Solution**: Admin creates a new room

2. **Room Expiration**
   - Rooms automatically expire after 30 minutes of inactivity
   - **Solution**: Admin creates a new room

3. **Incorrect Room Code**
   - Double-check the 4-digit number
   - Codes are numeric only (0-9)
   - **Solution**: Verify room code with admin

4. **Network Issues**
   - Temporary connection problems
   - **Solution**: Refresh page and try again

### Error Messages:

- **"Room not found"** → Server restarted or room expired
- **"Room is full"** → Maximum 12 players reached
- **"Name already taken"** → Choose a different player name
- **"Not connected to server"** → Check internet connection

## Server Status Check

Visit `/api/status` to see:
- Number of active rooms
- Room details (players, creation time, activity)
- Server uptime
- Total active sessions

## Technical Details

### Room Lifecycle:
1. **Created** → Admin creates room, gets 4-digit code
2. **Active** → Players join and play game
3. **Expired** → 30 minutes of inactivity or server restart
4. **Cleaned** → Automatically removed from memory

### Session Management:
- Each player gets a unique session token
- Tokens allow reconnection after network issues
- Tokens expire when room is cleaned up

### Server Configuration:
- **Memory**: 1GB limit on Fly.io
- **Auto-stop**: Enabled (servers stop during inactivity)
- **Keep-alive**: 25-second ping prevents sleeping
- **Cleanup**: Stale rooms removed every 5 minutes

## Quick Fixes

### If Room Not Found:
1. Ask admin to create new room
2. Get new room code
3. Join with new code
4. Start game quickly

### If Players Can't Join:
1. Check room code spelling
2. Verify server is running
3. Try refreshing browser
4. Check internet connection

### If Game Stops Working:
1. Check if server restarted
2. Look for error messages
3. Try rejoining with session token
4. Create new room if needed

## Prevention Tips

1. **Start games immediately** after creating room
2. **Keep sessions active** - don't leave empty rooms
3. **Use stable internet** connections
4. **Coordinate with players** before starting
5. **Have backup plans** - be ready to recreate rooms

## Support

If issues persist:
1. Check server status at `/api/status`
2. Look at browser console for errors
3. Try creating a fresh room
4. Contact admin for assistance
