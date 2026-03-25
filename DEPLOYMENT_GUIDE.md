# 🚀 Jarvis Mobile Deployment Guide

This guide will walk you through deploying Jarvis to mobile (Android & iOS) and configuring all necessary credentials.

## 📋 Table of Contents
1. [Backend Deployment](#backend-deployment)
2. [Mobile App Deployment Options](#mobile-app-deployment-options)
3. [Environment Variables Setup](#environment-variables-setup)
4. [Google Cloud Console Configuration](#google-cloud-console-configuration)
5. [Step-by-Step Deployment](#step-by-step-deployment)

---

## 1. Backend Deployment

### Option A: Heroku (Recommended for beginners)
**Pros:** Easy setup, free tier available, automatic HTTPS
**Cons:** Sleeps after 30min inactivity on free tier

### Option B: Railway
**Pros:** No sleep, easy deployment, good free tier
**Cons:** Limited free tier hours

### Option C: Render
**Pros:** Free tier, easy setup
**Cons:** Sleeps after inactivity

### Option D: AWS/DigitalOcean/VPS
**Pros:** Full control, no sleeping
**Cons:** More complex setup, costs money

### Recommended: Railway or Render
Both are easy and provide persistent URLs.

---

## 2. Mobile App Deployment Options

### Option 1: Capacitor (Recommended) ⭐
**Best for:** Converting web app to native mobile app
**Steps:**
1. Install Capacitor: `npm install @capacitor/core @capacitor/cli`
2. Initialize: `npx cap init`
3. Add platforms: `npx cap add android` and `npx cap add ios`
4. Build: `npx cap sync`
5. Open in native IDEs: `npx cap open android` or `npx cap open ios`

### Option 2: Progressive Web App (PWA)
**Best for:** Quick deployment, works on all devices
**Steps:**
1. Add `manifest.json` and service worker
2. Users install from browser
3. Works like native app

### Option 3: React Native / Flutter
**Best for:** Full native experience
**Cons:** Requires rewriting the app

---

## 3. Environment Variables Setup

### Backend Environment Variables (.env)

Create a `.env` file on your deployed backend with these variables:

```env
# Server Configuration
PORT=3001
FRONTEND_URL=https://your-mobile-app-url.com
# OR for Capacitor: FRONTEND_URL=com.yourapp.jarvis://

# MongoDB
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/jarvis?retryWrites=true&w=majority
# Get this from MongoDB Atlas (cloud.mongodb.com)

# OpenAI
OPENAI_API_KEY=sk-your-openai-api-key
# Get from: https://platform.openai.com/api-keys

# Twilio (for OTP SMS)
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890
# Get from: https://console.twilio.com/

# Tavily (for real-time search)
TAVILY_API_KEY=tvly-dev-your-tavily-key
# You already have this: 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

# Google Calendar OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=https://your-backend-url.com/auth/google/callback
# For mobile: GOOGLE_REDIRECT_URI=com.yourapp.jarvis://oauth/callback
```

---

## 4. Google Cloud Console Configuration

### Step 1: Update OAuth Consent Screen
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to **APIs & Services** → **OAuth consent screen**
4. Update:
   - **App name:** "Jarvis" (instead of "n8n")
   - **User support email:** Your email
   - **Developer contact:** Your email
5. **Save**

### Step 2: Add Authorized Redirect URIs
1. Go to **APIs & Services** → **Credentials**
2. Click on your **OAuth 2.0 Client ID**
3. Under **Authorized redirect URIs**, add:
   ```
   https://your-backend-url.com/auth/google/callback
   ```
4. **For Mobile (Capacitor):**
   ```
   com.yourapp.jarvis://oauth/callback
   ```
   (Replace `com.yourapp.jarvis` with your actual app bundle ID)
5. **Save**

### Step 3: Update OAuth Client Settings
- **Application type:** Web application (for backend)
- **Authorized JavaScript origins:** Add your backend URL
  ```
  https://your-backend-url.com
  ```

---

## 5. Step-by-Step Deployment

### Phase 1: Deploy Backend

#### Using Railway (Recommended):

1. **Sign up:** Go to [railway.app](https://railway.app)
2. **Create new project:** Click "New Project"
3. **Deploy from GitHub:**
   - Connect your GitHub repo
   - Select your `jarvis` repository
   - Railway will auto-detect Node.js
4. **Add Environment Variables:**
   - Click on your service
   - Go to **Variables** tab
   - Add all variables from section 3 above
5. **Get your URL:**
   - Railway provides: `https://your-app-name.railway.app`
   - Copy this URL

#### Using Heroku:

1. **Install Heroku CLI:** `npm install -g heroku`
2. **Login:** `heroku login`
3. **Create app:** `heroku create your-app-name`
4. **Set environment variables:**
   ```bash
   heroku config:set MONGO_URI=your-mongo-uri
   heroku config:set OPENAI_API_KEY=your-key
   # ... add all other variables
   ```
5. **Deploy:** `git push heroku main`
6. **Get URL:** `https://your-app-name.herokuapp.com`

---

### Phase 2: Deploy Mobile App

#### Option A: Using Capacitor (Native Apps)

1. **Install Capacitor:**
   ```bash
   npm install @capacitor/core @capacitor/cli
   npm install @capacitor/android @capacitor/ios
   ```

2. **Initialize Capacitor:**
   ```bash
   npx cap init "Jarvis" "com.yourcompany.jarvis"
   ```
   (Replace `com.yourcompany.jarvis` with your desired bundle ID)

3. **Update `capacitor.config.json`:**
   ```json
   {
     "appId": "com.yourcompany.jarvis",
     "appName": "Jarvis",
     "webDir": "public",
     "server": {
       "url": "https://your-backend-url.com",
       "cleartext": false
     }
   }
   ```

4. **Add Android:**
   ```bash
   npx cap add android
   npx cap sync
   ```

5. **Add iOS:**
   ```bash
   npx cap add ios
   npx cap sync
   ```

6. **Build and Open:**
   ```bash
   # Android
   npx cap open android
   # Then build APK in Android Studio
   
   # iOS
   npx cap open ios
   # Then build in Xcode
   ```

#### Option B: PWA (Progressive Web App)

1. **Create `public/manifest.json`:**
   ```json
   {
     "name": "Jarvis AI Assistant",
     "short_name": "Jarvis",
     "start_url": "/",
     "display": "standalone",
     "background_color": "#05080d",
     "theme_color": "#00ffea",
     "icons": [
       {
         "src": "/icon-192.png",
         "sizes": "192x192",
         "type": "image/png"
       },
       {
         "src": "/icon-512.png",
         "sizes": "512x512",
         "type": "image/png"
       }
     ]
   }
   ```

2. **Add to `index.html` `<head>`:**
   ```html
   <link rel="manifest" href="/manifest.json">
   <meta name="theme-color" content="#00ffea">
   ```

3. **Deploy frontend:**
   - Deploy `public` folder to Netlify, Vercel, or your backend
   - Users can install from browser menu

---

### Phase 3: Update Google OAuth for Mobile

1. **Go to Google Cloud Console** → **Credentials**
2. **Edit your OAuth 2.0 Client ID**
3. **Add Authorized redirect URIs:**
   - For Capacitor: `com.yourcompany.jarvis://oauth/callback`
   - For PWA: `https://your-frontend-url.com/auth/google/callback`
4. **Update `GOOGLE_REDIRECT_URI` in backend `.env`:**
   ```env
   GOOGLE_REDIRECT_URI=com.yourcompany.jarvis://oauth/callback
   ```

---

### Phase 4: Update Backend Code for Mobile OAuth

The backend already handles dynamic redirects, but verify:

1. **Check `index.js` line ~586:**
   ```javascript
   const frontendUrl = process.env.FRONTEND_URL || 
     (req.headers.referer ? new URL(req.headers.referer).origin : `http://localhost:${PORT}`);
   ```

2. **Set `FRONTEND_URL` in backend environment:**
   - For Capacitor: `FRONTEND_URL=com.yourcompany.jarvis://`
   - For PWA: `FRONTEND_URL=https://your-frontend-url.com`

---

## 6. Testing Checklist

- [ ] Backend is accessible at public URL
- [ ] All environment variables are set
- [ ] MongoDB connection works
- [ ] OTP SMS sending works (test with your phone)
- [ ] Google OAuth redirect works
- [ ] Calendar events can be fetched
- [ ] Mobile app can connect to backend
- [ ] Voice recognition works on mobile
- [ ] Chat functionality works

---

## 7. Common Issues & Solutions

### Issue: OAuth redirect not working
**Solution:** 
- Check redirect URI matches exactly in Google Console
- For Capacitor, use custom URL scheme: `com.yourapp://callback`
- Update `GOOGLE_REDIRECT_URI` in backend

### Issue: CORS errors
**Solution:**
- Backend already has `cors()` enabled
- If issues persist, add specific origins in `index.js`:
  ```javascript
  app.use(cors({
    origin: ['https://your-frontend-url.com', 'com.yourapp://']
  }));
  ```

### Issue: API calls failing on mobile
**Solution:**
- Check `API_BASE_URL` is correctly detected
- For Capacitor, ensure `server.url` in config matches backend
- Check network permissions in mobile app

### Issue: Voice recognition not working
**Solution:**
- Request microphone permissions in app
- For Capacitor, add to `AndroidManifest.xml` and `Info.plist`

---

## 8. Quick Reference

### Backend URLs to Update:
- Railway: `https://your-app.railway.app`
- Heroku: `https://your-app.herokuapp.com`
- Render: `https://your-app.onrender.com`

### Mobile App URLs:
- Capacitor: `com.yourcompany.jarvis://`
- PWA: `https://your-frontend-url.com`

### Google OAuth Redirect URIs:
- Backend callback: `https://your-backend.com/auth/google/callback`
- Mobile callback: `com.yourcompany.jarvis://oauth/callback`

---

## Need Help?

If you encounter issues:
1. Check backend logs (Railway/Heroku dashboard)
2. Check browser console on mobile
3. Verify all environment variables are set
4. Test API endpoints with Postman/curl

Good luck with your deployment! 🚀










