# Jarvis Realtime

An AI productivity assistant with a Jarvis-style interface. Full-stack Node.js application with:
- Express.js backend serving static frontend files from `public/`
- OpenAI GPT-4o for chat/AI responses and TTS voice
- **Supabase** for all persistent data storage (profiles, chats, messages, tasks, notes, memories, assignments)
- Google Calendar integration via OAuth2
- Supabase email OTP authentication

## Project Structure

```
index.js          - Main Express server (all backend logic, Supabase DB)
public/
  index.html      - Main UI (Jarvis chat interface)
  admin.html      - Admin dashboard
  auth.js         - Frontend OTP auth flow (Supabase)
  script.js       - Frontend chat logic
  style.css       - Styles
  boot.mp3        - Boot audio
package.json      - npm dependencies
```

## Running the App

- **Workflow**: "Start application" runs `node index.js` on port 5000
- **Frontend**: Served from `public/` as static files via Express

## Auth Flow (Supabase Email OTP)

1. Boot/splash screen
2. **Sign Up** screen: enter email → "Send Code" → navigate to OTP screen
3. **Sign In** screen: same email input → "Send Code"
4. **OTP Verification** screen: 6-digit numeric code → "Verify" → Jarvis main UI
5. Logout via "More" menu → "Sign Out"

`auth.js` (in `public/`) handles the full flow using Supabase JS client loaded from CDN.
The backend exposes `/api/config` to provide Supabase credentials to the frontend.
After OTP verification, `auth.js` calls `/api/user/sync` with the Supabase user UUID, which becomes the `user_id` primary key in all Supabase tables.

## Database Architecture (Supabase)

All data stored in Supabase PostgreSQL. Tables:

| Table | Purpose |
|-------|---------|
| `profiles` | User profiles, preferences, Jarvis personality, calendar tokens |
| `chats` | Chat sessions (metadata) |
| `messages` | Chat messages (linked to chats) |
| `memories` | AI-extracted memories about the user |
| `tasks` | Task tracker |
| `assignments` | Assignment tracker with steps |
| `notes` | Smart study notes with AI summaries + flashcards |

**Setup**: Run the SQL block at the top of `index.js` in the Supabase SQL Editor to create all tables with RLS disabled.

## Required Environment Secrets / Variables

| Key | Description |
|-----|-------------|
| `SUPABASE_URL` | Supabase project URL (env var) |
| `SUPABASE_ANON_KEY` | Supabase publishable anon key (secret) |
| `OPENAI_API_KEY` | OpenAI API key for chat + TTS (secret) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID for Calendar (optional) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret for Calendar (optional) |
| `GOOGLE_REDIRECT_URI` | Google OAuth redirect URI for Calendar (optional) |
| `TAVILY_API_KEY` | Tavily search API key for real-time search (optional) |

## Key API Routes

- `POST /ask` — Main AI chat endpoint (OpenAI with function calling)
- `GET /api/config` — Frontend config (Supabase URL + anon key)
- `POST /api/user/sync` — Sync/create user on login
- `GET/PUT /api/profile` — User profile CRUD
- `GET/POST/PUT/DELETE /api/tasks` — Task management
- `GET/POST/PUT/DELETE /api/chats` — Chat history
- `GET/POST /api/notes` — Smart notes with AI summaries
- `GET/POST /api/assignments` — Assignment tracker
- `GET /auth/google/calendar` — Google Calendar OAuth start
- `GET /auth/google/callback` — Google Calendar OAuth callback

## Notes

- App runs without Supabase configured but data features won't persist
- AI/voice features require OPENAI_API_KEY
- Port 5000 is used for both dev and production
