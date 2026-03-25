# 🚀 Quick Start Guide

## Accessing Jarvis

### On Your Mac (Localhost):
**Always use this on your Mac:**
```
http://localhost:3001
```
This works instantly, no ngrok needed!

---

### On Your Phone (via ngrok):
**Only use ngrok when you want to test on your phone.**

## Simple Workflow:

### Terminal 1: Start Jarvis Server
```bash
npm start
```
Keep this running! ✅

### Terminal 2: Start ngrok (ONLY when needed for phone)
```bash
npm run ngrok
```
This will show you the ngrok URL. Copy it and use on your phone.

**OR** use the script directly:
```bash
./start-ngrok.sh
```

---

## Daily Usage:

### Just developing on Mac?
1. Run: `npm start`
2. Open: `http://localhost:3001`
3. **That's it!** No ngrok needed.

### Want to test on phone?
1. Make sure server is running: `npm start` (Terminal 1)
2. In a NEW terminal, run: `npm run ngrok` (Terminal 2)
3. Copy the ngrok URL shown (e.g., `https://abc123.ngrok-free.app`)
4. Use that URL on your phone
5. When done testing, press `Ctrl+C` in Terminal 2 to stop ngrok

---

## Tips:

- **Mac = localhost** (always works, no ngrok)
- **Phone = ngrok** (only when testing mobile)
- ngrok URL changes each time you restart it
- You can keep ngrok running while developing - it doesn't interfere with localhost

---

## Troubleshooting:

**ngrok not working?**
- Make sure server is running first (`npm start`)
- Check if port 3001 is in use: `lsof -i :3001`

**Want a permanent ngrok URL?**
- Sign up for ngrok account (free)
- Get authtoken: `ngrok config add-authtoken YOUR_TOKEN`
- Then use: `ngrok http 3001 --domain=your-domain.ngrok-free.app`








