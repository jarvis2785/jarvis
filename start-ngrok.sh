#!/bin/bash

# Kill any existing ngrok processes
pkill ngrok 2>/dev/null

# Wait a moment
sleep 1

# Start ngrok
echo "🚀 Starting ngrok tunnel..."
echo ""
ngrok http 3001








