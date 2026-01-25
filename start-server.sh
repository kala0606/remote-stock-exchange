#!/bin/bash
# Startup script that sets Firebase credentials and starts the server

# Set Firebase service account path
export GOOGLE_APPLICATION_CREDENTIALS="/Users/18391l/Desktop/remote-stock-exchange/remotestockexchange-firebase-adminsdk-fbsvc-77e2b59911.json"

# Start the server
echo "Starting server with Firebase credentials..."
echo "Firebase credentials: $GOOGLE_APPLICATION_CREDENTIALS"
npm start
