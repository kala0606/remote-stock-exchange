#!/bin/bash
# Script to start the stock exchange game server

echo "🚀 Starting Remote Stock Exchange Game..."
echo "Machine ID: 784964dc346428"

# Start the machine
fly machine start 784964dc346428

echo "✅ Game server is starting up..."
echo "🌐 Your game will be available at: https://remote-stock-exchange.fly.dev"
echo ""
echo "⏰ Remember to stop the server when you're done playing!"
echo "   Run: ./stop-game.sh"
