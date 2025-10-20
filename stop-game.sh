#!/bin/bash
# Script to stop the stock exchange game server

echo "🛑 Stopping Remote Stock Exchange Game..."
echo "Machine ID: 784964dc346428"

# Stop the machine
fly machine stop 784964dc346428

echo "✅ Game server has been stopped."
echo "💰 You are no longer being billed for compute time!"
echo ""
echo "🚀 To start playing again, run: ./start-game.sh"
