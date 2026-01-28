#!/usr/bin/env node
// Script to check what data exists in Firestore

const path = require('path');
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(__dirname, 'remotestockexchange-firebase-adminsdk-fbsvc-77e2b59911.json');

const admin = require('firebase-admin');
admin.initializeApp({
  credential: admin.credential.applicationDefault()
});

const db = admin.firestore();

async function checkData() {
  console.log('🔍 Checking Firestore data...\n');
  
  // Check player_stats
  console.log('📊 Checking player_stats collection...');
  const statsSnapshot = await db.collection('player_stats').limit(10).get();
  console.log(`   Found ${statsSnapshot.size} documents in player_stats`);
  
  if (statsSnapshot.size > 0) {
    console.log('\n   Sample documents:');
    statsSnapshot.forEach((doc, idx) => {
      const data = doc.data();
      console.log(`   ${idx + 1}. Player: ${data.playerName || 'N/A'}`);
      console.log(`      UUID: ${data.playerUuid || 'N/A'}`);
      console.log(`      Firebase UID: ${data.firebaseUid || 'null (guest)'}`);
      console.log(`      Game ID: ${data.gameId || 'N/A'}`);
      console.log(`      Final Worth: ${data.finalTotalWorth || 'N/A'}`);
      console.log('');
    });
  }
  
  // Check player_summaries
  console.log('📈 Checking player_summaries collection...');
  const summariesSnapshot = await db.collection('player_summaries').limit(10).get();
  console.log(`   Found ${summariesSnapshot.size} documents in player_summaries`);
  
  if (summariesSnapshot.size > 0) {
    console.log('\n   Sample documents:');
    summariesSnapshot.forEach((doc, idx) => {
      const data = doc.data();
      console.log(`   ${idx + 1}. Document ID: ${doc.id}`);
      console.log(`      Player: ${data.playerName || 'N/A'}`);
      console.log(`      UUID: ${data.playerUuid || 'N/A'}`);
      console.log(`      Firebase UID: ${data.firebaseUid || 'null (guest)'}`);
      console.log(`      Total Games: ${data.totalGames || 0}`);
      console.log(`      Total Wins: ${data.totalWins || 0}`);
      console.log('');
    });
  }
  
  // Check games
  console.log('🎮 Checking games collection...');
  const gamesSnapshot = await db.collection('games').limit(5).get();
  console.log(`   Found ${gamesSnapshot.size} documents in games`);
  
  if (gamesSnapshot.size > 0) {
    console.log('\n   Sample games:');
    gamesSnapshot.forEach((doc, idx) => {
      const data = doc.data();
      console.log(`   ${idx + 1}. Game ID: ${doc.id}`);
      console.log(`      Room ID: ${data.roomID || 'N/A'}`);
      console.log(`      Players: ${data.players ? data.players.length : 0}`);
      if (data.players && data.players.length > 0) {
        data.players.forEach((p, pIdx) => {
          console.log(`         ${pIdx + 1}. ${p.name} (UUID: ${p.uuid})`);
        });
      }
      console.log('');
    });
  }
  
  // Check for specific user
  const userId = process.argv[2];
  if (userId) {
    console.log(`\n🔎 Checking for user: ${userId}\n`);
    
    // Check player_stats with this firebaseUid
    const userStatsQuery = await db.collection('player_stats')
      .where('firebaseUid', '==', userId)
      .get();
    console.log(`   Found ${userStatsQuery.size} player_stats documents with firebaseUid=${userId}`);
    
    // Check player_summaries
    const userSummaryDoc = await db.collection('player_summaries').doc(userId).get();
    if (userSummaryDoc.exists) {
      const data = userSummaryDoc.data();
      console.log(`\n   ✅ Found player_summaries document for ${userId}:`);
      console.log(`      Total Games: ${data.totalGames || 0}`);
      console.log(`      Total Wins: ${data.totalWins || 0}`);
      console.log(`      Player Name: ${data.playerName || 'N/A'}`);
    } else {
      console.log(`\n   ❌ No player_summaries document found for ${userId}`);
    }
  }
  
  console.log('\n✅ Check complete!');
  process.exit(0);
}

checkData().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
