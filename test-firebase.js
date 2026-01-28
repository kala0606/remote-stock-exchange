#!/usr/bin/env node
// Quick test script to verify Firebase Admin is working

const path = require('path');

// Set the credentials path
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(__dirname, 'remotestockexchange-firebase-adminsdk-fbsvc-77e2b59911.json');

console.log('Testing Firebase Admin initialization...');
console.log('Credentials path:', process.env.GOOGLE_APPLICATION_CREDENTIALS);

try {
  const admin = require('firebase-admin');
  
  // Initialize
  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });
  
  const db = admin.firestore();
  console.log('✅ Firebase Admin initialized successfully!');
  console.log('✅ Firestore database object created!');
  
  // Try a simple read operation
  console.log('\nTesting Firestore connection...');
  db.collection('test').doc('connection-test').set({
    test: true,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    console.log('✅ Successfully wrote to Firestore!');
    return db.collection('test').doc('connection-test').get();
  }).then((doc) => {
    if (doc.exists) {
      console.log('✅ Successfully read from Firestore!');
      console.log('Data:', doc.data());
      // Clean up
      return db.collection('test').doc('connection-test').delete();
    } else {
      console.log('⚠️  Document does not exist');
    }
  }).then(() => {
    console.log('✅ Test document cleaned up');
    console.log('\n🎉 All Firebase tests passed!');
    process.exit(0);
  }).catch((error) => {
    console.error('❌ Firestore operation failed:', error.message);
    console.error('Error details:', error);
    process.exit(1);
  });
  
} catch (error) {
  console.error('❌ Failed to initialize Firebase Admin:', error.message);
  console.error('Error details:', error);
  process.exit(1);
}
