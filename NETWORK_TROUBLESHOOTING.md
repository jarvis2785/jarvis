# Network Troubleshooting Guide

## Quick Fixes to Try:

### 1. **Check Router AP Isolation (Most Common Issue)**
Many routers have "AP Isolation" or "Client Isolation" enabled by default, which prevents devices from talking to each other.

**How to fix:**
- Log into your router admin panel (usually `192.168.0.1` or `192.168.1.1`)
- Look for "AP Isolation", "Client Isolation", or "Wireless Isolation"
- **Disable it**
- Save and restart router

### 2. **Verify Both Devices on Same Network**
On your Mac, run:
```bash
ifconfig en0 | grep "inet "
```

On your phone:
- Go to WiFi settings
- Check the IP address range
- Should be `192.168.0.x` (same as Mac)

### 3. **Try Different Port**
If port 3001 is blocked, try a different port:
- Change `PORT` in `.env` to `8080` or `5000`
- Restart server
- Access: `http://192.168.0.105:8080`

### 4. **Test from Mac First**
Before trying phone, test from Mac:
```bash
curl http://192.168.0.105:3001/health
```
Should return: `{"status":"ok"}`

### 5. **Check macOS Firewall**
Even if "disabled", try:
```bash
# Allow Node.js through firewall
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /usr/local/bin/node
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp /usr/local/bin/node
```

### 6. **Try Phone's Browser Developer Tools**
- On iPhone Safari: Not easily accessible
- On Android Chrome: Enable "Desktop site" and check console

### 7. **Alternative: Use ngrok (Temporary Solution)**
If router issues persist, use ngrok for testing:
```bash
npm install -g ngrok
ngrok http 3001
```
Then use the ngrok URL on your phone.

## Most Likely Solution:
**Disable AP Isolation on your router** - this is the #1 cause of this issue.








