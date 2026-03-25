import "dotenv/config";
import express from "express";
import bodyParser from "body-parser";
import OpenAI from "openai";
import axios from "axios";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { google } from "googleapis";
import { getTextExtractor } from "office-text-extractor";

const PORT = process.env.PORT || 5000;
const app = express();
app.use(bodyParser.json({ limit: "20mb" }));
app.use(cors());

app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  next();
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// ================================
// Supabase client (backend)
// ================================
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

let sb = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log("✅ Supabase client initialized");
  // Check tables exist on startup
  sb.from("profiles").select("user_id").limit(1).then(({ error }) => {
    if (error && (error.code === "PGRST205" || (error.message && (error.message.includes("does not exist") || error.message.includes("schema cache"))))) {
      console.warn("⚠️  Supabase tables not found. Run supabase-setup.sql in your Supabase SQL Editor.");
      console.warn("   Dashboard → SQL Editor → New Query → Paste supabase-setup.sql → Run");
    } else if (error) {
      console.error("Supabase table check error:", error);
    } else {
      console.log("✅ Supabase tables verified");
    }
  });
} else {
  console.warn("⚠️  SUPABASE_URL or SUPABASE_ANON_KEY not set. Database features will be unavailable.");
}

/*
  ================================================================
  SUPABASE TABLE SETUP — run once in Supabase SQL Editor:
  ================================================================

  CREATE TABLE IF NOT EXISTS profiles (
    user_id TEXT PRIMARY KEY,
    first_name TEXT DEFAULT '',
    last_name TEXT DEFAULT '',
    email TEXT DEFAULT '',
    about_me TEXT DEFAULT '',
    profession TEXT DEFAULT '',
    interests JSONB DEFAULT '[]',
    likes JSONB DEFAULT '[]',
    dislikes JSONB DEFAULT '[]',
    communication_style TEXT DEFAULT 'friendly',
    response_length TEXT DEFAULT 'balanced',
    topics JSONB DEFAULT '[]',
    jarvis_name TEXT DEFAULT 'Jarvis',
    jarvis_tone TEXT DEFAULT 'professional',
    jarvis_style TEXT DEFAULT 'helpful',
    jarvis_traits JSONB DEFAULT '[]',
    jarvis_greeting TEXT DEFAULT '',
    study_plan JSONB,
    calendar_connected BOOLEAN DEFAULT FALSE,
    calendar_access_token TEXT,
    calendar_refresh_token TEXT,
    calendar_token_expiry TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS chats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT DEFAULT 'New Chat',
    pinned BOOLEAN DEFAULT FALSE,
    tags JSONB DEFAULT '[]',
    message_count INTEGER DEFAULT 0,
    last_message TEXT DEFAULT '',
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    chat_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT,
    audio_base64 TEXT,
    function_calls JSONB DEFAULT '[]',
    tokens_used INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS memories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    fact TEXT NOT NULL,
    context TEXT DEFAULT '',
    importance INTEGER DEFAULT 3,
    times_referenced INTEGER DEFAULT 0,
    last_referenced TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    due_date TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    subject TEXT DEFAULT '',
    deadline TIMESTAMPTZ,
    priority TEXT DEFAULT 'medium',
    notes TEXT DEFAULT '',
    status TEXT DEFAULT 'not_started',
    steps JSONB DEFAULT '[]',
    calendar_event_id TEXT,
    calendar_reminder_event_ids JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS notes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    subject TEXT DEFAULT '',
    topic TEXT DEFAULT '',
    original_text TEXT DEFAULT '',
    transcript TEXT DEFAULT '',
    short_summary TEXT DEFAULT '',
    detailed_summary TEXT DEFAULT '',
    key_points JSONB DEFAULT '[]',
    qa JSONB DEFAULT '[]',
    flashcards JSONB DEFAULT '[]',
    flashcards_updated_at TIMESTAMPTZ,
    file_name TEXT DEFAULT '',
    file_type TEXT DEFAULT '',
    file_size INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Disable RLS on all tables (backend handles auth):
  ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
  ALTER TABLE chats DISABLE ROW LEVEL SECURITY;
  ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
  ALTER TABLE memories DISABLE ROW LEVEL SECURITY;
  ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;
  ALTER TABLE assignments DISABLE ROW LEVEL SECURITY;
  ALTER TABLE notes DISABLE ROW LEVEL SECURITY;

  ================================================================
*/

// ================================
// Supabase DB helper functions
// ================================

function mapProfile(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    firstName: row.first_name || row.name || "User",
    lastName: row.last_name || "",
    phone: row.phone || row.phone_number || "",
    email: row.email || "",
    calendarConnected: row.calendar_connected || false,
    calendarAccessToken: row.calendar_access_token || null,
    calendarRefreshToken: row.calendar_refresh_token || null,
    calendarTokenExpiry: row.calendar_token_expiry ? new Date(row.calendar_token_expiry) : null,
    profile: {
      aboutMe: row.about_me || row.name || "",
      profession: row.profession || "",
      interests: Array.isArray(row.interests) ? row.interests : [],
      likes: Array.isArray(row.likes) ? row.likes : [],
      dislikes: Array.isArray(row.dislikes) ? row.dislikes : [],
      preferences: {
        communicationStyle: row.communication_style || "friendly",
        responseLength: row.response_length || "balanced",
        topics: Array.isArray(row.topics) ? row.topics : [],
      },
      studyPlan: row.study_plan || null,
    },
    jarvisPersonality: {
      name: row.jarvis_name || "Jarvis",
      tone: row.jarvis_tone || "professional",
      style: row.jarvis_style || "helpful",
      traits: Array.isArray(row.jarvis_traits) ? row.jarvis_traits : [],
      greeting: row.jarvis_greeting || "",
    },
  };
}

async function getProfile(userId) {
  if (!sb || !userId) return null;
  const { data, error } = await sb.from("profiles").select("*").eq("user_id", userId).single();
  if (error || !data) return null;
  return mapProfile(data);
}

async function upsertProfile(userId, data) {
  if (!sb) throw new Error("Supabase not configured");
  const { error } = await sb.from("profiles").upsert(
    { user_id: userId, ...data, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
  if (error) throw error;
}

// ================================
// Basic routes
// ================================

app.get("/health", (req, res) => res.status(200).json({ status: "ok" }));

app.get("/api/config", (req, res) => {
  res.json({
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
  });
});

// Sync / upsert user on login
app.post("/api/user/sync", async (req, res) => {
  const userId = req.body.user_id || req.body.supabaseId;
  const { email } = req.body;
  if (!userId) return res.status(400).json({ error: "user_id or supabaseId required" });
  if (!sb) return res.status(503).json({ error: "Database not configured" });
  try {
    const { error } = await sb
      .from("profiles")
      .upsert(
        { user_id: userId, email: email || "" },
        { onConflict: "user_id" }
      );
    if (error) {
      console.error("User sync error - Supabase:", JSON.stringify(error));
      return res.status(500).json({ error: "Failed to sync user" });
    }
    const profile = await getProfile(userId);
    res.json({ success: true, firstName: profile?.firstName || (email ? email.split("@")[0] : "User") });
  } catch (err) {
    console.error("User sync error:", err);
    res.status(500).json({ error: "Failed to sync user" });
  }
});

app.get("/api/test", (req, res) => res.status(200).json({ message: "API routes are working" }));

app.get("/network-test", (req, res) => {
  res.json({ status: "connected", clientIp: req.ip, timestamp: new Date().toISOString() });
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/admin/users", async (req, res) => {
  if (!sb) return res.status(503).json({ error: "Database not configured" });
  try {
    const { data, error } = await sb.from("profiles").select("user_id,first_name,last_name,email,created_at").order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ total: data.length, users: data.map(u => ({ id: u.user_id, email: u.email, firstName: u.first_name, lastName: u.last_name, createdAt: u.created_at })) });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// ================================
// OpenAI
// ================================
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// ================================
// Helpers
// ================================
function needsRealtimeSearch(question) {
  if (!question || typeof question !== "string") return false;
  const lowerQuestion = question.toLowerCase();
  const newsKeywords = [
    "news", "latest", "recent", "current", "today", "now", "happening",
    "breaking", "update", "announcement", "headline", "trending",
    "what's happening", "what happened", "who won", "score", "result",
    "election", "politics", "weather", "stock", "market", "price",
    "crypto", "bitcoin", "sports", "match", "game", "live", "this week",
    "this month", "2024", "2025", "yesterday", "tomorrow"
    , "box office", "performance", "released", "release"
  ];
  const questionPatterns = [
    "what is the", "what are the", "tell me about", "what's the latest",
    "what happened", "who is", "who are", "when did", "where is",
    "how is", "show me", "find me", "search for", "look up"
  ];
  const hasNewsKeyword = newsKeywords.some(k => lowerQuestion.includes(k));
  const hasQuestionPattern = questionPatterns.some(p => lowerQuestion.includes(p));
  return hasNewsKeyword || (hasQuestionPattern && lowerQuestion.length > 10);
}

function parseNaturalDate(dateString) {
  if (!dateString) return null;
  if (dateString.match(/^\d{4}-\d{2}-\d{2}/)) return dateString;
  const now = new Date();
  const lower = dateString.toLowerCase();
  if (lower.includes("today")) return now.toISOString().split("T")[0];
  if (lower.includes("tomorrow")) { const t = new Date(now); t.setDate(t.getDate() + 1); return t.toISOString().split("T")[0]; }
  if (lower.includes("yesterday")) { const y = new Date(now); y.setDate(y.getDate() - 1); return y.toISOString().split("T")[0]; }
  try {
    const parsed = new Date(dateString);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  } catch (e) {}
  return null;
}

// ================================
// Google Calendar OAuth
// ================================
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${process.env.PORT || 3001}/auth/google/callback`;
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

async function refreshUserToken(userId, user) {
  try {
    oauth2Client.setCredentials({
      access_token: user.calendarAccessToken,
      refresh_token: user.calendarRefreshToken,
      expiry_date: user.calendarTokenExpiry?.getTime()
    });
    if (user.calendarTokenExpiry && new Date() >= user.calendarTokenExpiry) {
      const { credentials } = await oauth2Client.refreshAccessToken();
      await upsertProfile(userId, {
        calendar_access_token: credentials.access_token,
        calendar_token_expiry: credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : null,
        calendar_refresh_token: credentials.refresh_token || user.calendarRefreshToken,
      });
      oauth2Client.setCredentials(credentials);
    } else {
      oauth2Client.setCredentials({
        access_token: user.calendarAccessToken,
        refresh_token: user.calendarRefreshToken,
        expiry_date: user.calendarTokenExpiry?.getTime()
      });
    }
  } catch (error) {
    if (error.response?.data?.error === "invalid_grant" || error.message?.includes("invalid_grant")) {
      await upsertProfile(userId, {
        calendar_connected: false,
        calendar_access_token: null,
        calendar_refresh_token: null,
        calendar_token_expiry: null,
      });
      throw new Error("Your Google Calendar connection has expired. Please reconnect your calendar.");
    }
    throw error;
  }
}

async function executeCalendarOperation(userId, operation, params) {
  const user = await getProfile(userId);
  if (!user || !user.calendarConnected) {
    throw new Error("Calendar not connected. Please connect your Google Calendar first.");
  }
  await refreshUserToken(userId, user);
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  switch (operation) {
    case "create": {
      const event = { summary: params.title, description: params.description || "" };
      if (params.allDay) {
        const startDateStr = params.startDateTime.includes("T") ? params.startDateTime.split("T")[0] : params.startDateTime;
        const [year, month, day] = startDateStr.split("-").map(Number);
        const formattedStartDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const endDateObj = new Date(year, month - 1, day + 1);
        const formattedEndDate = `${endDateObj.getFullYear()}-${String(endDateObj.getMonth() + 1).padStart(2, "0")}-${String(endDateObj.getDate()).padStart(2, "0")}`;
        event.start = { date: formattedStartDate };
        event.end = { date: formattedEndDate };
      } else {
        event.start = { dateTime: new Date(params.startDateTime).toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" };
        const endTime = params.endDateTime ? new Date(params.endDateTime) : new Date(new Date(params.startDateTime).getTime() + 60 * 60 * 1000);
        event.end = { dateTime: endTime.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" };
      }
      const createResponse = await calendar.events.insert({ calendarId: "primary", resource: event });
      return { success: true, message: `Created event "${params.title}"`, event: { id: createResponse.data.id, title: createResponse.data.summary, start: createResponse.data.start.dateTime || createResponse.data.start.date } };
    }

    case "update": {
      let updateEventId = params.eventId;
      if (!updateEventId && params.title) {
        const searchResponse = await calendar.events.list({ calendarId: "primary", timeMin: new Date().toISOString(), timeMax: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), maxResults: 50, singleEvents: true, orderBy: "startTime" });
        const matchingEvent = (searchResponse.data.items || []).find(e => e.summary && e.summary.toLowerCase().includes(params.title.toLowerCase()));
        if (!matchingEvent) throw new Error(`Could not find an event with title containing "${params.title}"`);
        updateEventId = matchingEvent.id;
      }
      if (!updateEventId) throw new Error("Event ID or title is required to update an event");
      const existingEvent = await calendar.events.get({ calendarId: "primary", eventId: updateEventId });
      const updatedEvent = { ...existingEvent.data, summary: params.newTitle || params.title || existingEvent.data.summary, description: params.description !== undefined ? params.description : existingEvent.data.description };
      if (params.startDateTime) {
        if (params.allDay) {
          const startDateStr = params.startDateTime.includes("T") ? params.startDateTime.split("T")[0] : params.startDateTime;
          const [year, month, day] = startDateStr.split("-").map(Number);
          updatedEvent.start = { date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
          const endDateObj = new Date(year, month - 1, day + 1);
          updatedEvent.end = { date: `${endDateObj.getFullYear()}-${String(endDateObj.getMonth() + 1).padStart(2, "0")}-${String(endDateObj.getDate()).padStart(2, "0")}` };
        } else {
          updatedEvent.start = { dateTime: new Date(params.startDateTime).toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" };
          if (params.endDateTime) updatedEvent.end = { dateTime: new Date(params.endDateTime).toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" };
        }
      }
      const updateResponse = await calendar.events.update({ calendarId: "primary", eventId: updateEventId, resource: updatedEvent });
      return { success: true, message: `Updated event "${updateResponse.data.summary}"`, event: { id: updateResponse.data.id, title: updateResponse.data.summary } };
    }

    case "delete": {
      let deleteEventId = params.eventId;
      if (!deleteEventId && params.title) {
        const searchResponse = await calendar.events.list({ calendarId: "primary", timeMin: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), timeMax: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), maxResults: 100, singleEvents: true, orderBy: "startTime" });
        const searchTitleLower = params.title.toLowerCase().trim();
        let matchingEvent = (searchResponse.data.items || []).find(e => e.summary && e.summary.toLowerCase().trim() === searchTitleLower);
        if (!matchingEvent) matchingEvent = (searchResponse.data.items || []).find(e => e.summary && e.summary.toLowerCase().includes(searchTitleLower));
        if (!matchingEvent) matchingEvent = (searchResponse.data.items || []).find(e => e.summary && searchTitleLower.includes(e.summary.toLowerCase().trim()));
        if (!matchingEvent) throw new Error(`Could not find an event with title containing "${params.title}"`);
        deleteEventId = matchingEvent.id;
      }
      if (!deleteEventId) throw new Error("Event ID or title is required to delete an event");
      const deleteEvent = await calendar.events.get({ calendarId: "primary", eventId: deleteEventId });
      await calendar.events.delete({ calendarId: "primary", eventId: deleteEventId });
      return { success: true, message: `Deleted event "${deleteEvent.data.summary}"` };
    }

    case "list": {
      let timeMin = params.startDate || new Date().toISOString();
      let timeMax = params.endDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      if (params.startDate && /^\d{4}-\d{2}-\d{2}$/.test(params.startDate)) timeMin = params.startDate + "T00:00:00Z";
      if (params.endDate && /^\d{4}-\d{2}-\d{2}$/.test(params.endDate)) {
        const [year, month, day] = params.endDate.split("-").map(Number);
        timeMax = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0)).toISOString();
      }
      const listResponse = await calendar.events.list({ calendarId: "primary", timeMin, timeMax, maxResults: params.limit || 20, singleEvents: true, orderBy: "startTime" });
      const events = (listResponse.data.items || []).map(event => ({ id: event.id, title: event.summary || "No Title", start: event.start.dateTime || event.start.date, end: event.end.dateTime || event.end.date, allDay: !event.start.dateTime }));
      return { success: true, events, count: events.length };
    }

    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

// ================================
// Chat route with AI function calling
// ================================
app.post("/ask", async (req, res) => {
  const userMessage = req.body.question;
  const phoneNumber = req.body.phoneNumber;
  const chatId = req.body.chatId;
  if (!userMessage) return res.status(400).json({ error: "Missing question" });
  if (!openai) return res.status(503).json({ error: "OpenAI not configured. Please set OPENAI_API_KEY." });

  let searchResults = "";
  let currentChatId = chatId || null;
  let conversationHistory = [];

  try {
    // Load conversation history
    if (chatId && phoneNumber && sb) {
      const { data: chat } = await sb.from("chats").select("*").eq("id", chatId).eq("user_id", phoneNumber).single();
      if (chat) {
        const { data: recentMessages } = await sb.from("messages")
          .select("role,content,function_calls")
          .eq("chat_id", chatId)
          .order("created_at", { ascending: false })
          .limit(20);
        if (recentMessages) {
          conversationHistory = recentMessages.reverse().map(msg => {
            const m = { role: msg.role, content: msg.content };
            if (msg.function_calls && msg.function_calls.length > 0) {
              const lastFn = msg.function_calls[msg.function_calls.length - 1];
              if (lastFn) m.function_call = { name: lastFn.name, arguments: JSON.stringify(lastFn.arguments) };
            }
            return m;
          });
        }
      }
    }

    // Update memory reference tracking
    if (phoneNumber && userMessage && sb) {
      try {
        const { data: relevantMemories } = await sb.from("memories")
          .select("id")
          .eq("user_id", phoneNumber)
          .ilike("fact", `%${userMessage.slice(0, 30)}%`)
          .limit(5);
        if (relevantMemories && relevantMemories.length > 0) {
          for (const m of relevantMemories) {
            await sb.from("memories").update({ times_referenced: sb.rpc ? undefined : 1, last_referenced: new Date().toISOString() }).eq("id", m.id);
          }
        }
      } catch (_) {}
    }

    // Real-time search
    const isCalendarQuery = /(create|add|schedule|book|make|set|edit|update|change|modify|delete|remove|cancel|show|list|what|when|where).*(task|event|meeting|appointment|calendar)/i.test(userMessage);
    if (!isCalendarQuery && needsRealtimeSearch(userMessage) && process.env.TAVILY_API_KEY) {
      try {
        const tavilyResponse = await axios.post("https://api.tavily.com/search", { query: userMessage, max_results: 5, search_depth: "basic", include_answer: true, include_raw_content: false }, { headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.TAVILY_API_KEY}` }, timeout: 15000 });
        const results = tavilyResponse.data.results || [];
        const answer = tavilyResponse.data.answer;
        if (answer) searchResults = `Answer: ${answer}\n\n`;
        searchResults += results.map((r, idx) => `Source ${idx + 1}: ${r.title}\n${r.content}`).join("\n\n---\n\n") || "";
      } catch (e) {
        console.warn("⚠️  Tavily search failed:", e.message);
      }
    }

    // Functions for AI
    const functions = phoneNumber ? [
      { name: "create_calendar_event", description: "Create a new calendar event or task.", parameters: { type: "object", properties: { title: { type: "string" }, startDateTime: { type: "string" }, endDateTime: { type: "string" }, description: { type: "string" }, allDay: { type: "boolean" } }, required: ["title", "startDateTime"] } },
      { name: "update_calendar_event", description: "Update an existing calendar event.", parameters: { type: "object", properties: { eventId: { type: "string" }, title: { type: "string" }, newTitle: { type: "string" }, startDateTime: { type: "string" }, endDateTime: { type: "string" }, description: { type: "string" }, allDay: { type: "boolean" } }, required: [] } },
      { name: "delete_calendar_event", description: "Delete a calendar event.", parameters: { type: "object", properties: { eventId: { type: "string" }, title: { type: "string" } }, required: [] } },
      { name: "list_calendar_events", description: "List calendar events.", parameters: { type: "object", properties: { startDate: { type: "string" }, endDate: { type: "string" }, limit: { type: "number" } } } },
      { name: "save_memory", description: "Save an important fact or memory about the user for future conversations.", parameters: { type: "object", properties: { fact: { type: "string" }, importance: { type: "number" }, context: { type: "string" } }, required: ["fact"] } },
      { name: "create_task", description: "Create a new task.", parameters: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, dueDate: { type: "string" } }, required: ["title"] } },
      { name: "update_task_status", description: "Update the status of a task.", parameters: { type: "object", properties: { taskId: { type: "string" }, title: { type: "string" }, status: { type: "string", enum: ["pending", "in-progress", "completed", "cancelled"] } }, required: ["status"] } },
      { name: "list_tasks", description: "List tasks.", parameters: { type: "object", properties: { status: { type: "string", enum: ["pending", "in-progress", "completed", "cancelled"] } } } },
    ] : [];

    // Fetch user profile and memories
    let userProfile = null;
    let jarvisPersonality = null;
    let userName = "User";
    let userMemories = "";
    if (phoneNumber && sb) {
      try {
        const user = await getProfile(phoneNumber);
        if (user) {
          userProfile = user.profile;
          jarvisPersonality = user.jarvisPersonality;
          userName = user.firstName || "User";
        }
        const { data: memories } = await sb.from("memories").select("fact,context,importance").eq("user_id", phoneNumber).order("importance", { ascending: false }).limit(10);
        if (memories && memories.length > 0) {
          userMemories = `\n\nIMPORTANT MEMORIES ABOUT ${userName.toUpperCase()} (from past conversations):\n${memories.map((m, i) => `${i + 1}. ${m.fact}${m.context ? ` (Context: ${m.context})` : ""}`).join("\n")}\n\nUse these memories to provide personalized and contextually relevant responses.`;
        }
      } catch (err) {
        console.error("Error fetching user data:", err);
      }
    }

    const now = new Date();
    const currentDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    const jarvisName = jarvisPersonality?.name || "Jarvis";
    const jarvisTone = jarvisPersonality?.tone || "professional";
    const jarvisStyle = jarvisPersonality?.style || "helpful";
    const jarvisTraits = jarvisPersonality?.traits || [];

    let userContext = "";
    if (userProfile) {
      userContext = `\n\nUSER PROFILE & PREFERENCES:\n- Name: ${userName}${userProfile.profession ? `\n- Profession: ${userProfile.profession}` : ""}${userProfile.aboutMe ? `\n- About: ${userProfile.aboutMe}` : ""}${userProfile.interests?.length > 0 ? `\n- Interests: ${userProfile.interests.join(", ")}` : ""}${userProfile.likes?.length > 0 ? `\n- Likes: ${userProfile.likes.join(", ")}` : ""}${userProfile.dislikes?.length > 0 ? `\n- Dislikes: ${userProfile.dislikes.join(", ")}` : ""}\n- Communication Style: ${userProfile.preferences?.communicationStyle || "friendly"}\n- Response Length: ${userProfile.preferences?.responseLength || "balanced"}\n\nRemember these preferences and adapt your responses accordingly.`;
    }

    let personalityInstructions = "";
    if (jarvisPersonality) {
      personalityInstructions = `\n\nYOUR PERSONALITY SETTINGS:\n- Tone: ${jarvisTone}\n- Style: ${jarvisStyle}${jarvisTraits.length > 0 ? `\n- Traits: ${jarvisTraits.join(", ")}` : ""}${jarvisPersonality.greeting ? `\n- Custom Greeting: ${jarvisPersonality.greeting}` : ""}\n\nAdapt your responses to match these personality settings.`;
    }

    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;

    const systemPrompt = `You are ${jarvisName} — ${userName}'s personalized AI assistant. You are helpful, concise, and always provide accurate information.${userContext}${userMemories}${personalityInstructions}

${phoneNumber ? `The user's phone number is available for calendar operations. When the user wants to create, edit, delete, or view calendar events, use the appropriate function.

CRITICAL: GLOBAL MEMORY SYSTEM
- You have access to a global memory system that works across ALL chats and conversations.
- When the user shares ANY information about themselves, their interests, preferences, facts, topics they've discussed, movies they've asked about, questions they've asked, or anything that might be relevant for future conversations, you MUST use the save_memory function to store it.
- ALWAYS save important information proactively - don't wait for the user to ask you to remember it.

IMPORTANT FOR DATE/TIME PARSING:
- Current date: ${currentDate} (${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })})
- Current time: ${currentTime}
- "today" = ${currentDate}, "tomorrow" = ${tomorrowStr}
- Always provide full ISO datetime strings: YYYY-MM-DDTHH:mm:ss` : ""}

When real-time search results are provided, use them to give current, up-to-date information. Cite sources when mentioning specific facts from search results.`;

    const messages = [{ role: "system", content: systemPrompt }];
    if (searchResults) messages.push({ role: "system", content: `Real-time search results for the user's query:\n\n${searchResults}\n\nUse this information to provide an accurate, current answer.` });
    if (conversationHistory.length > 0) messages.push(...conversationHistory);
    messages.push({ role: "user", content: userMessage });

    let aiResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      functions: functions.length > 0 ? functions : undefined,
      function_call: functions.length > 0 ? "auto" : undefined,
      max_tokens: 300,
      temperature: 0.7,
    });

    let finalAnswer = "";
    let functionCallMade = false;
    const message = aiResponse.choices[0].message;

    if (message.function_call && phoneNumber) {
      functionCallMade = true;
      const functionName = message.function_call.name;
      const functionArgs = JSON.parse(message.function_call.arguments);
      console.log(`🔧 Executing function: ${functionName}`, functionArgs);

      let functionResult;
      try {
        if (functionName === "create_calendar_event") {
          functionResult = await executeCalendarOperation(phoneNumber, "create", functionArgs);
        } else if (functionName === "update_calendar_event") {
          functionResult = await executeCalendarOperation(phoneNumber, "update", functionArgs);
        } else if (functionName === "delete_calendar_event") {
          functionResult = await executeCalendarOperation(phoneNumber, "delete", functionArgs);
        } else if (functionName === "list_calendar_events") {
          functionResult = await executeCalendarOperation(phoneNumber, "list", functionArgs);
        } else if (functionName === "save_memory" && sb) {
          await sb.from("memories").insert({ user_id: phoneNumber, fact: functionArgs.fact, context: functionArgs.context || "", importance: functionArgs.importance || 3 });
          functionResult = { success: true, message: "Memory saved successfully" };
        } else if (functionName === "create_task" && sb) {
          const { data: task, error } = await sb.from("tasks").insert({ user_id: phoneNumber, title: functionArgs.title.trim(), description: functionArgs.description || "", status: "pending", due_date: functionArgs.dueDate ? new Date(functionArgs.dueDate).toISOString() : null }).select().single();
          if (error) throw error;
          functionResult = { success: true, message: `Task "${task.title}" created successfully`, task: { id: task.id, title: task.title, status: task.status } };
        } else if (functionName === "update_task_status" && sb) {
          let task = null;
          if (functionArgs.taskId) {
            const { data } = await sb.from("tasks").select("*").eq("id", functionArgs.taskId).eq("user_id", phoneNumber).single();
            task = data;
          } else if (functionArgs.title) {
            const { data } = await sb.from("tasks").select("*").eq("user_id", phoneNumber).ilike("title", `%${functionArgs.title}%`).in("status", ["pending", "in-progress"]).order("created_at", { ascending: false }).limit(1).single();
            task = data;
          }
          if (!task) {
            functionResult = { error: `Task not found${functionArgs.title ? ` with title "${functionArgs.title}"` : ""}` };
          } else {
            const updates = { status: functionArgs.status, updated_at: new Date().toISOString() };
            if (functionArgs.status === "completed") updates.completed_at = new Date().toISOString();
            else updates.completed_at = null;
            const { data: updatedTask } = await sb.from("tasks").update(updates).eq("id", task.id).select().single();
            functionResult = { success: true, message: `Task "${task.title}" marked as ${functionArgs.status}`, task: { id: task.id, title: task.title, status: functionArgs.status } };
          }
        } else if (functionName === "list_tasks" && sb) {
          let query = sb.from("tasks").select("*").eq("user_id", phoneNumber).order("created_at", { ascending: false }).limit(50);
          if (functionArgs.status) query = query.eq("status", functionArgs.status);
          const { data: tasks } = await query;
          functionResult = { success: true, count: tasks?.length || 0, tasks: (tasks || []).map(t => ({ id: t.id, title: t.title, description: t.description, status: t.status, dueDate: t.due_date, completedAt: t.completed_at })) };
        } else {
          functionResult = { error: "Unknown function" };
        }
      } catch (functionError) {
        console.error("Function execution error:", functionError);
        functionResult = { error: functionError.message };
      }

      messages.push({ role: "assistant", content: null, function_call: { name: functionName, arguments: message.function_call.arguments } });
      messages.push({ role: "function", name: functionName, content: JSON.stringify(functionResult) });
      const finalResponse = await openai.chat.completions.create({ model: "gpt-4o", messages, max_tokens: 200, temperature: 0.7 });
      finalAnswer = finalResponse.choices[0].message.content.trim();
    } else {
      finalAnswer = message.content?.trim() || "Sorry, something went wrong.";
    }

    // TTS
    const needsAudio = req.body.voiceMode === true;
    let audioBase64 = null;
    if (needsAudio && openai) {
      try {
        const speechResponse = await openai.audio.speech.create({ model: "tts-1", voice: "alloy", input: finalAnswer });
        const buffer = Buffer.from(await speechResponse.arrayBuffer());
        audioBase64 = buffer.toString("base64");
      } catch (ttsErr) {
        console.error("TTS error:", ttsErr.message);
      }
    }

    // Save chat + messages to Supabase
    if (phoneNumber && sb) {
      try {
        let activeChatId = currentChatId;
        if (!activeChatId) {
          const { data: newChat, error: chatErr } = await sb.from("chats").insert({ user_id: phoneNumber, title: "New Chat", pinned: false, tags: [], message_count: 0, last_message: "", last_message_at: new Date().toISOString() }).select().single();
          if (!chatErr && newChat) activeChatId = newChat.id;
        }
        if (activeChatId) {
          currentChatId = activeChatId;
          // Ensure deterministic ordering for the paired insert (user then assistant)
          // by explicitly setting created_at with a tiny offset.
          const createdAtUser = new Date().toISOString();
          const createdAtAssistant = new Date(Date.now() + 1).toISOString();
          await sb.from("messages").insert([
            { chat_id: activeChatId, user_id: phoneNumber, role: "user", content: userMessage, audio_base64: null, function_calls: [], tokens_used: 0, created_at: createdAtUser },
            { chat_id: activeChatId, user_id: phoneNumber, role: "assistant", content: finalAnswer, audio_base64: audioBase64, function_calls: functionCallMade ? [{ name: message.function_call?.name || "", arguments: message.function_call?.arguments ? JSON.parse(message.function_call.arguments) : {} }] : [], tokens_used: aiResponse.usage?.total_tokens || 0, created_at: createdAtAssistant }
          ]);
          // Get current chat to check message_count
          const { data: currentChat } = await sb.from("chats").select("message_count,title").eq("id", activeChatId).single();
          const newCount = (currentChat?.message_count || 0) + 2;
          const updates = { message_count: newCount, last_message: finalAnswer.substring(0, 100), last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() };
          // Auto-generate title on first message pair
          if (currentChat?.title === "New Chat" && newCount === 2 && openai) {
            try {
              const titleResponse = await openai.chat.completions.create({ model: "gpt-4o", messages: [{ role: "system", content: "Generate a short, descriptive title (2-4 words) for this conversation. Return ONLY the title text, no quotes." }, { role: "user", content: userMessage }], max_tokens: 15, temperature: 0.3 });
              let generatedTitle = titleResponse.choices[0].message.content.trim().replace(/^["']|["']$/g, "");
              generatedTitle = generatedTitle.replace(/\s*(19|20)\d{2}\s*/gi, " ").replace(/\s*(today|tomorrow|yesterday|now|current|latest)\s*/gi, " ").replace(/\s+/g, " ").trim();
              generatedTitle = generatedTitle.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
              if (generatedTitle) updates.title = generatedTitle;
            } catch (_) {}
          }
          await sb.from("chats").update(updates).eq("id", activeChatId);
        }
      } catch (saveErr) {
        console.error("Error saving chat:", saveErr.message);
      }
    }

    res.json({ answer: finalAnswer, audio: audioBase64, functionExecuted: functionCallMade, chatId: currentChatId });
  } catch (err) {
    console.error("Chat error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ================================
// Voice synthesis
// ================================
app.post("/voice", async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "Missing text" });
  if (!openai) return res.status(503).json({ error: "OpenAI not configured" });
  try {
    const speechResponse = await openai.audio.speech.create({ model: "tts-1", voice: "alloy", input: text });
    const buffer = Buffer.from(await speechResponse.arrayBuffer());
    res.set({ "Content-Type": "audio/mpeg", "Content-Length": buffer.length });
    res.send(buffer);
  } catch (err) {
    console.error("Voice synthesis error:", err.message);
    res.status(500).json({ error: "Voice synthesis failed" });
  }
});

// Boot audio
app.get("/generate-boot", async (req, res) => {
  if (!openai) return res.status(503).json({ error: "OpenAI not configured" });
  try {
    const speechResponse = await openai.audio.speech.create({ model: "tts-1", voice: "onyx", input: "Jarvis online. All systems ready." });
    const buffer = Buffer.from(await speechResponse.arrayBuffer());
    res.set({ "Content-Type": "audio/mpeg", "Content-Length": buffer.length });
    res.send(buffer);
  } catch (err) {
    console.error("Boot audio error:", err);
    res.status(500).json({ error: "Audio generation failed" });
  }
});

// ================================
// Google Calendar routes
// ================================
app.get("/auth/google/calendar", async (req, res) => {
  const { phoneNumber } = req.query;
  if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });
  try {
    const authUrl = oauth2Client.generateAuthUrl({ access_type: "offline", scope: ["https://www.googleapis.com/auth/calendar", "https://www.googleapis.com/auth/calendar.events"], state: phoneNumber, prompt: "consent" });
    res.json({ authUrl });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate OAuth URL" });
  }
});

app.get("/auth/google/callback", async (req, res) => {
  const { code, state } = req.query;
  const phoneNumber = state;
  const frontendUrl = process.env.FRONTEND_URL || (req.headers.referer ? new URL(req.headers.referer).origin : `http://localhost:${PORT}`);
  if (!code || !phoneNumber) return res.redirect(`${frontendUrl}/?error=oauth_failed`);
  try {
    const { tokens } = await oauth2Client.getToken(code);
    await upsertProfile(phoneNumber, {
      calendar_connected: true,
      calendar_access_token: tokens.access_token,
      calendar_refresh_token: tokens.refresh_token,
      calendar_token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    });
    res.redirect(`${frontendUrl}/?calendar=connected`);
  } catch (err) {
    console.error("Calendar OAuth callback error:", err);
    if (err?.code === "PGRST204") {
      console.error("Run supabase-setup.sql in Supabase SQL Editor to add missing profiles columns.");
    }
    res.redirect(`${frontendUrl}/?error=oauth_failed`);
  }
});

app.get("/auth/calendar/status", async (req, res) => {
  const { phoneNumber } = req.query;
  if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });
  try {
    const user = await getProfile(phoneNumber);
    res.json({ calendarConnected: user?.calendarConnected || false });
  } catch (err) {
    res.status(500).json({ error: "Failed to check calendar status" });
  }
});

app.get("/calendar/events", async (req, res) => {
  const { phoneNumber, startDate, endDate } = req.query;
  if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });
  try {
    const user = await getProfile(phoneNumber);
    if (!user || !user.calendarConnected) return res.status(400).json({ error: "Calendar not connected" });
    await refreshUserToken(phoneNumber, user);
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const timeMin = startDate || new Date().toISOString();
    const timeMax = endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const response = await calendar.events.list({ calendarId: "primary", timeMin, timeMax, maxResults: 100, singleEvents: true, orderBy: "startTime" });
    const events = (response.data.items || []).map(event => ({ id: event.id, title: event.summary || "No Title", description: event.description || "", start: event.start.dateTime || event.start.date, end: event.end.dateTime || event.end.date, location: event.location || "", allDay: !event.start.dateTime }));
    res.json({ events });
  } catch (err) {
    console.error("Calendar events error:", err);
    if (err.message?.includes("Google Calendar connection has expired")) return res.status(401).json({ error: err.message, requiresReconnect: true });
    if (err.code === 401) return res.status(401).json({ error: "Calendar access expired. Please reconnect.", requiresReconnect: true });
    res.status(500).json({ error: err.message || "Failed to fetch calendar events" });
  }
});

app.post("/calendar/events/create", async (req, res) => {
  const { phoneNumber, title, description, startDateTime, endDateTime, allDay } = req.body;
  if (!phoneNumber || !title || !startDateTime) return res.status(400).json({ error: "Phone number, title, and start date/time are required" });
  try {
    const user = await getProfile(phoneNumber);
    if (!user || !user.calendarConnected) return res.status(400).json({ error: "Calendar not connected" });
    await refreshUserToken(phoneNumber, user);
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const event = { summary: title, description: description || "" };
    if (allDay) {
      let startDateStr = startDateTime.includes("T") ? startDateTime.split("T")[0] : startDateTime;
      const [year, month, day] = startDateStr.split("-").map(Number);
      if (!year || !month || !day || isNaN(year) || isNaN(month) || isNaN(day)) return res.status(400).json({ error: "Invalid date format for all-day event" });
      const formattedStartDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const endDateObj = new Date(year, month - 1, day + 1);
      const formattedEndDate = `${endDateObj.getFullYear()}-${String(endDateObj.getMonth() + 1).padStart(2, "0")}-${String(endDateObj.getDate()).padStart(2, "0")}`;
      event.start = { date: formattedStartDate };
      event.end = { date: formattedEndDate };
    } else {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const [datePart, timePart] = startDateTime.split("T");
      if (!datePart || !timePart) return res.status(400).json({ error: "Invalid start date/time format. Expected YYYY-MM-DDTHH:mm:ss" });
      const [year, month, day] = datePart.split("-").map(Number);
      const [hours, minutes, seconds = 0] = timePart.split(":").map(Number);
      let startTime = new Date(year, month - 1, day, hours, minutes, seconds || 0);
      if (isNaN(startTime.getTime())) return res.status(400).json({ error: "Invalid start date/time" });
      let endTime;
      if (endDateTime) {
        const [ep, tp] = endDateTime.split("T");
        const [ey, em, ed] = ep.split("-").map(Number);
        const [eh, emin, es = 0] = tp.split(":").map(Number);
        endTime = new Date(ey, em - 1, ed, eh, emin, es || 0);
        if (isNaN(endTime.getTime())) return res.status(400).json({ error: "Invalid end date/time" });
      } else {
        endTime = new Date(startTime);
        endTime.setHours(endTime.getHours() + 1);
      }
      if (endTime <= startTime) { endTime = new Date(startTime); endTime.setHours(endTime.getHours() + 1); }
      event.start = { dateTime: startTime.toISOString(), timeZone };
      event.end = { dateTime: endTime.toISOString(), timeZone };
    }
    const response = await calendar.events.insert({ calendarId: "primary", resource: event });
    res.json({ success: true, event: { id: response.data.id, title: response.data.summary, start: response.data.start.dateTime || response.data.start.date, end: response.data.end.dateTime || response.data.end.date, htmlLink: response.data.htmlLink } });
  } catch (err) {
    console.error("Calendar event creation error:", err);
    if (err.message?.includes("Google Calendar connection has expired")) return res.status(401).json({ error: err.message, requiresReconnect: true });
    if (err.code === 401) return res.status(401).json({ error: "Calendar access expired. Please reconnect.", requiresReconnect: true });
    res.status(500).json({ error: err.message || "Failed to create calendar event" });
  }
});

app.put("/calendar/events/update", async (req, res) => {
  const { phoneNumber, eventId, title, description, startDateTime, endDateTime, allDay } = req.body;
  if (!phoneNumber || !eventId || !title || !startDateTime) return res.status(400).json({ error: "Phone number, event ID, title, and start date/time are required" });
  try {
    const user = await getProfile(phoneNumber);
    if (!user || !user.calendarConnected) return res.status(400).json({ error: "Calendar not connected" });
    await refreshUserToken(phoneNumber, user);
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const existingEvent = await calendar.events.get({ calendarId: "primary", eventId });
    const event = { summary: title, description: description || "" };
    if (allDay) {
      const startDate = new Date(startDateTime);
      const endDate = endDateTime ? new Date(endDateTime) : new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
      event.start = { date: startDate.toISOString().split("T")[0] };
      event.end = { date: endDate.toISOString().split("T")[0] };
    } else {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const [datePart, timePart] = startDateTime.split("T");
      const [year, month, day] = datePart.split("-").map(Number);
      const [hours, minutes, seconds = 0] = timePart.split(":").map(Number);
      let startTime = new Date(year, month - 1, day, hours, minutes, seconds || 0);
      let endTime;
      if (endDateTime) {
        const [ep, tp] = endDateTime.split("T");
        const [ey, em, ed] = ep.split("-").map(Number);
        const [eh, emin, es = 0] = tp.split(":").map(Number);
        endTime = new Date(ey, em - 1, ed, eh, emin, es || 0);
      } else {
        endTime = new Date(startTime);
        endTime.setHours(endTime.getHours() + 1);
      }
      if (endTime <= startTime) { endTime = new Date(startTime); endTime.setHours(endTime.getHours() + 1); }
      event.start = { dateTime: startTime.toISOString(), timeZone };
      event.end = { dateTime: endTime.toISOString(), timeZone };
    }
    const response = await calendar.events.update({ calendarId: "primary", eventId, resource: event });
    res.json({ success: true, event: { id: response.data.id, title: response.data.summary, start: response.data.start.dateTime || response.data.start.date, end: response.data.end.dateTime || response.data.end.date, htmlLink: response.data.htmlLink } });
  } catch (err) {
    console.error("Calendar event update error:", err);
    if (err.message?.includes("Google Calendar connection has expired")) return res.status(401).json({ error: err.message, requiresReconnect: true });
    if (err.code === 401) return res.status(401).json({ error: "Calendar access expired. Please reconnect.", requiresReconnect: true });
    if (err.code === 404) return res.status(404).json({ error: "Event not found" });
    res.status(500).json({ error: err.message || "Failed to update calendar event" });
  }
});

app.delete("/calendar/events/delete", async (req, res) => {
  const { phoneNumber, eventId } = req.query;
  if (!phoneNumber || !eventId) return res.status(400).json({ error: "Phone number and event ID are required" });
  try {
    const user = await getProfile(phoneNumber);
    if (!user || !user.calendarConnected) return res.status(400).json({ error: "Calendar not connected" });
    await refreshUserToken(phoneNumber, user);
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    await calendar.events.delete({ calendarId: "primary", eventId });
    res.json({ success: true, message: "Event deleted successfully" });
  } catch (err) {
    console.error("Calendar event delete error:", err);
    if (err.message?.includes("Google Calendar connection has expired")) return res.status(401).json({ error: err.message, requiresReconnect: true });
    if (err.code === 401) return res.status(401).json({ error: "Calendar access expired. Please reconnect.", requiresReconnect: true });
    if (err.code === 404) return res.status(404).json({ error: "Event not found" });
    res.status(500).json({ error: err.message || "Failed to delete calendar event" });
  }
});

// ================================
// Task Management
// ================================
app.post("/api/tasks", async (req, res) => {
  const { phoneNumber, title, description, dueDate, status } = req.body;
  if (!phoneNumber || !title) return res.status(400).json({ error: "Phone number and title are required" });
  if (!sb) return res.status(503).json({ error: "Database not configured" });
  const validStatuses = ["pending", "in-progress", "completed", "cancelled"];
  const taskStatus = status && validStatuses.includes(status) ? status : "pending";
  try {
    const { data: task, error } = await sb.from("tasks").insert({ user_id: phoneNumber, title: title.trim(), description: description || "", status: taskStatus, due_date: dueDate ? new Date(dueDate).toISOString() : null }).select().single();
    if (error) throw error;
    res.json({ success: true, task: { id: task.id, title: task.title, description: task.description, status: task.status, dueDate: task.due_date, createdAt: task.created_at } });
  } catch (err) {
    console.error("Error creating task:", err);
    res.status(500).json({ error: "Failed to create task" });
  }
});

app.get("/api/tasks", async (req, res) => {
  const { phoneNumber, status } = req.query;
  if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });
  if (!sb) return res.status(503).json({ error: "Database not configured" });
  try {
    let query = sb.from("tasks").select("*").eq("user_id", phoneNumber).order("created_at", { ascending: false }).limit(100);
    if (status && ["pending", "in-progress", "completed", "cancelled"].includes(status)) query = query.eq("status", status);
    const { data: tasks, error } = await query;
    if (error) throw error;
    res.json({ success: true, tasks: (tasks || []).map(t => ({ id: t.id, title: t.title, description: t.description, status: t.status, dueDate: t.due_date, completedAt: t.completed_at, createdAt: t.created_at, updatedAt: t.updated_at })) });
  } catch (err) {
    console.error("Error fetching tasks:", err);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

app.put("/api/tasks/:taskId/status", async (req, res) => {
  const { taskId } = req.params;
  const { phoneNumber, status } = req.body;
  if (!phoneNumber || !status) return res.status(400).json({ error: "Phone number and status are required" });
  if (!["pending", "in-progress", "completed", "cancelled"].includes(status)) return res.status(400).json({ error: "Invalid status" });
  if (!sb) return res.status(503).json({ error: "Database not configured" });
  try {
    const updates = { status, updated_at: new Date().toISOString() };
    if (status === "completed") updates.completed_at = new Date().toISOString();
    else updates.completed_at = null;
    const { data: task, error } = await sb.from("tasks").update(updates).eq("id", taskId).eq("user_id", phoneNumber).select().single();
    if (error || !task) return res.status(404).json({ error: "Task not found" });
    res.json({ success: true, task: { id: task.id, title: task.title, description: task.description, status: task.status, dueDate: task.due_date, completedAt: task.completed_at, updatedAt: task.updated_at } });
  } catch (err) {
    console.error("Error updating task status:", err);
    res.status(500).json({ error: "Failed to update task status" });
  }
});

app.put("/api/tasks/:taskId", async (req, res) => {
  const { taskId } = req.params;
  const { phoneNumber, title, description, dueDate, status } = req.body;
  if (!phoneNumber) return res.status(400).json({ error: "Phone number is required" });
  if (status !== undefined && !["pending", "in-progress", "completed", "cancelled"].includes(status)) return res.status(400).json({ error: "Invalid status" });
  if (!sb) return res.status(503).json({ error: "Database not configured" });
  try {
    const updates = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description || "";
    if (dueDate !== undefined) updates.due_date = dueDate ? new Date(dueDate).toISOString() : null;
    if (status !== undefined) {
      updates.status = status;
      if (status === "completed") updates.completed_at = new Date().toISOString();
      else updates.completed_at = null;
    }
    const { data: task, error } = await sb.from("tasks").update(updates).eq("id", taskId).eq("user_id", phoneNumber).select().single();
    if (error || !task) return res.status(404).json({ error: "Task not found" });
    res.json({ success: true, task: { id: task.id, title: task.title, description: task.description, status: task.status, dueDate: task.due_date, completedAt: task.completed_at, updatedAt: task.updated_at } });
  } catch (err) {
    console.error("Error updating task:", err);
    res.status(500).json({ error: "Failed to update task" });
  }
});

app.delete("/api/tasks/:taskId", async (req, res) => {
  const { taskId } = req.params;
  const { phoneNumber } = req.query;
  if (!phoneNumber) return res.status(400).json({ error: "Phone number is required" });
  if (!sb) return res.status(503).json({ error: "Database not configured" });
  try {
    const { data, error } = await sb.from("tasks").delete().eq("id", taskId).eq("user_id", phoneNumber).select().single();
    if (error || !data) return res.status(404).json({ error: "Task not found" });
    res.json({ success: true, message: "Task deleted successfully" });
  } catch (err) {
    console.error("Error deleting task:", err);
    res.status(500).json({ error: "Failed to delete task" });
  }
});

// ================================
// User Profile & Personality
// ================================
app.get("/api/profile", async (req, res) => {
  const userId = req.query.phoneNumber || req.query.user_id;
  if (!userId) return res.status(400).json({ error: "phoneNumber or user_id required" });
  if (!sb) return res.status(503).json({ error: "Database not configured" });
  try {
    const user = await getProfile(userId);
    if (!user) {
      return res.json({ profile: {}, jarvisPersonality: {}, firstName: "", lastName: "" });
    }
    res.json({
      profile: user.profile || {},
      jarvisPersonality: user.jarvisPersonality || {},
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone || "",
    });
  } catch (err) {
    console.error("Profile fetch error:", JSON.stringify(err));
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

app.put("/api/profile", async (req, res) => {
  // Two calling patterns exist in this codebase:
  // 1) Profile modal: { phoneNumber: <user_id>, profile: {...} } (no user_id key)
  // 2) Auth onboarding: { user_id: <user_id>, phoneNumber: <phone>, profile: {} }
  // We disambiguate by preferring `user_id` when present.
  const userId = req.body.user_id || req.body.phoneNumber;
  const phoneValue = req.body.user_id ? req.body.phoneNumber : undefined; // treat phoneNumber as "phone" only during onboarding
  const { profile, email, firstName, lastName } = req.body;
  if (!userId) return res.status(400).json({ error: "phoneNumber or user_id required" });
  if (!sb) return res.status(503).json({ error: "Database not configured" });
  try {
    const profileData = {};
    if (email !== undefined) profileData.email = email;
    if (firstName !== undefined) profileData.first_name = firstName;
    if (lastName !== undefined) profileData.last_name = lastName;
    if (phoneValue !== undefined) profileData.phone = phoneValue;
    if (profile) {
      if (profile.aboutMe !== undefined) profileData.name = profile.aboutMe;
      if (profile.profession !== undefined) profileData.profession = profile.profession;
      if (profile.interests !== undefined) profileData.interests = Array.isArray(profile.interests) ? profile.interests : [];
      if (profile.likes !== undefined) profileData.likes = Array.isArray(profile.likes) ? profile.likes : [];
      if (profile.dislikes !== undefined) profileData.dislikes = Array.isArray(profile.dislikes) ? profile.dislikes : [];
      if (profile.preferences) {
        if (profile.preferences.communicationStyle !== undefined) profileData.communication_style = profile.preferences.communicationStyle;
        if (profile.preferences.responseLength !== undefined) profileData.response_length = profile.preferences.responseLength;
      }
    }
    const { error } = await sb
      .from("profiles")
      .upsert(
        { user_id: userId, ...profileData },
        { onConflict: "user_id" }
      );
    if (error) {
      console.error("Profile update error - Supabase:", JSON.stringify(error));
      return res.status(500).json({ error: "Failed to update profile" });
    }
    const updated = await getProfile(userId);
    res.json({ success: true, message: "Profile updated successfully", profile: updated?.profile || {} });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

app.put("/api/profile/personality", async (req, res) => {
  const userId = req.body.phoneNumber || req.body.user_id;
  const { personality } = req.body;
  if (!userId) return res.status(400).json({ error: "phoneNumber or user_id required" });
  if (!sb) return res.status(503).json({ error: "Database not configured" });
  try {
    const updates = {};
    if (personality) {
      if (personality.name !== undefined) updates.jarvis_name = personality.name;
      if (personality.tone !== undefined) updates.jarvis_tone = personality.tone;
      if (personality.style !== undefined) updates.jarvis_style = personality.style;
      if (personality.traits !== undefined) updates.jarvis_traits = Array.isArray(personality.traits) ? personality.traits : [];
      // jarvis_greeting omitted - add to profiles table if needed: ALTER TABLE profiles ADD COLUMN IF NOT EXISTS jarvis_greeting TEXT DEFAULT '';
    }
    const { error } = await sb.from("profiles").upsert(
      { user_id: userId, ...updates },
      { onConflict: "user_id" }
    );
    if (error) {
      console.error("Personality update error - Supabase:", JSON.stringify(error));
      return res.status(500).json({ error: "Failed to update personality" });
    }
    const updated = await getProfile(userId);
    res.json({ success: true, message: "Jarvis personality updated successfully", jarvisPersonality: updated?.jarvisPersonality || {} });
  } catch (err) {
    console.error("Personality update error:", err);
    res.status(500).json({ error: "Failed to update personality" });
  }
});

// ================================
// Study Plan
// ================================
app.post("/api/study-plan", async (req, res) => {
  const { phoneNumber, plan } = req.body;
  if (!phoneNumber || !plan) return res.status(400).json({ error: "Phone number and plan are required" });
  if (!sb) return res.status(503).json({ error: "Database not configured" });
  try {
    await upsertProfile(phoneNumber, { study_plan: plan });
    res.json({ success: true, message: "Study plan saved successfully" });
  } catch (err) {
    console.error("Error saving study plan:", err);
    res.status(500).json({ error: "Failed to save study plan" });
  }
});

app.get("/api/study-plan", async (req, res) => {
  const { phoneNumber } = req.query;
  if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });
  if (!sb) return res.status(503).json({ error: "Database not configured" });
  try {
    const user = await getProfile(phoneNumber);
    res.json({ success: true, plan: user?.profile?.studyPlan || null });
  } catch (err) {
    console.error("Error fetching study plan:", err);
    res.status(500).json({ error: "Failed to fetch study plan" });
  }
});

// ================================
// Assignment Tracker
// ================================
app.get("/api/assignments", async (req, res) => {
  const { phoneNumber } = req.query;
  if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });
  if (!sb) return res.status(503).json({ error: "Database not configured" });
  try {
    // Some older clients can send a phone number while assignments.user_id is UUID.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(phoneNumber))) {
      return res.json({ assignments: [] });
    }
    const { data: list, error } = await sb.from("assignments").select("*").eq("user_id", phoneNumber);
    if (error) throw error;
    const active = (list || []).filter(a => a.status !== "done").sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
    const done = (list || []).filter(a => a.status === "done").sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
    res.json({ assignments: [...active, ...done].map(a => ({ ...a, _id: a.id, steps: a.steps || [], calendarReminderEventIds: a.calendar_reminder_event_ids || [] })) });
  } catch (err) {
    console.error("Assignments list error:", JSON.stringify(err));
    res.status(500).json({ error: "Failed to fetch assignments" });
  }
});

app.post("/api/assignments", async (req, res) => {
  const { phoneNumber, title, subject, deadline, priority, notes } = req.body;
  if (!phoneNumber || !title || !subject || !deadline) return res.status(400).json({ error: "Phone number, title, subject, and deadline are required" });
  if (!sb) return res.status(503).json({ error: "Database not configured" });
  try {
    const { data: assignment, error } = await sb.from("assignments").insert({ user_id: phoneNumber, title: title.trim(), subject: (subject || "").trim(), deadline: new Date(deadline).toISOString(), priority: ["low", "high"].includes(priority) ? priority : "medium", notes: (notes || "").trim(), status: "not_started", steps: [] }).select().single();
    if (error) throw error;
    res.status(201).json({ assignment: { ...assignment, _id: assignment.id } });
  } catch (err) {
    console.error("Create assignment error:", err);
    res.status(500).json({ error: "Failed to create assignment" });
  }
});

app.put("/api/assignments/:id", async (req, res) => {
  const { id } = req.params;
  const { phoneNumber, title, subject, deadline, priority, notes, status, steps, calendarEventId, calendarReminderEventIds } = req.body;
  if (!id || !phoneNumber) return res.status(400).json({ error: "ID and phone number required" });
  if (!sb) return res.status(503).json({ error: "Database not configured" });
  try {
    const updates = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title.trim();
    if (subject !== undefined) updates.subject = subject.trim();
    if (deadline !== undefined) updates.deadline = new Date(deadline).toISOString();
    if (priority !== undefined) updates.priority = ["low", "high"].includes(priority) ? priority : "medium";
    if (notes !== undefined) updates.notes = notes.trim();
    if (status !== undefined && ["not_started", "in_progress", "done"].includes(status)) updates.status = status;
    if (Array.isArray(steps)) updates.steps = steps;
    if (calendarEventId !== undefined) updates.calendar_event_id = calendarEventId || null;
    if (calendarReminderEventIds !== undefined) updates.calendar_reminder_event_ids = Array.isArray(calendarReminderEventIds) ? calendarReminderEventIds.filter(x => typeof x === "string" && x.trim()).map(x => x.trim()) : [];
    const { data: assignment, error } = await sb.from("assignments").update(updates).eq("id", id).eq("user_id", phoneNumber).select().single();
    if (error || !assignment) return res.status(404).json({ error: "Assignment not found" });
    res.json({ assignment: { ...assignment, _id: assignment.id } });
  } catch (err) {
    console.error("Update assignment error:", err);
    res.status(500).json({ error: "Failed to update assignment" });
  }
});

app.delete("/api/assignments/:id", async (req, res) => {
  const { id } = req.params;
  const { phoneNumber } = req.query;
  if (!id || !phoneNumber) return res.status(400).json({ error: "ID and phone number required" });
  if (!sb) return res.status(503).json({ error: "Database not configured" });
  try {
    const { data: assignment } = await sb.from("assignments").select("*").eq("id", id).eq("user_id", phoneNumber).single();
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    // Delete associated Google Calendar events if connected
    const user = await getProfile(phoneNumber);
    if (user && user.calendarConnected) {
      await refreshUserToken(phoneNumber, user);
      const calendar = google.calendar({ version: "v3", auth: oauth2Client });
      const safeDeleteEventId = async (eventId) => {
        if (!eventId) return;
        try { await calendar.events.delete({ calendarId: "primary", eventId }); } catch (e) { if (e && e.code !== 404) throw e; }
      };
      const idsToDelete = [assignment.calendar_event_id, ...(Array.isArray(assignment.calendar_reminder_event_ids) ? assignment.calendar_reminder_event_ids : [])].filter(Boolean);
      for (const eid of idsToDelete) await safeDeleteEventId(eid);
    }

    const { error } = await sb.from("assignments").delete().eq("id", id).eq("user_id", phoneNumber);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Delete assignment error:", err);
    if (err.message?.includes("Google Calendar connection has expired")) return res.status(401).json({ error: err.message, requiresReconnect: true });
    if (err.code === 401) return res.status(401).json({ error: "Calendar access expired. Please reconnect.", requiresReconnect: true });
    res.status(500).json({ error: "Failed to delete assignment" });
  }
});

// Break assignment into steps (AI)
app.post("/api/assignments/break-into-steps", async (req, res) => {
  const { title, subject } = req.body;
  if (!title || !subject) return res.status(400).json({ error: "Title and subject are required" });
  if (!openai) return res.status(503).json({ error: "OpenAI not configured" });
  try {
    const prompt = `Break down this assignment into 3-6 actionable steps.\nAssignment: "${title}"\nSubject: ${subject}\nReturn ONLY a JSON array of objects with keys: "title" (string) and "done" (boolean, default false). No extra text.`;
    const completion = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "system", content: "Return only JSON, no markdown." }, { role: "user", content: prompt }], temperature: 0.3 });
    const raw = completion.choices[0]?.message?.content?.trim() || "[]";
    const cleaned = raw.replace(/```json?\s*|\s*```/g, "").trim();
    let steps = [];
    try { steps = JSON.parse(cleaned); } catch { steps = []; }
    if (!Array.isArray(steps)) steps = [];
    steps = steps.filter(s => s && s.title).map(s => ({ title: String(s.title), done: Boolean(s.done) }));
    res.json({ steps });
  } catch (err) {
    console.error("Break into steps error:", err);
    res.status(500).json({ error: "Failed to generate steps" });
  }
});

// ================================
// Notes
// ================================
function sanitizeTextBlock(text) {
  if (!text) return "";
  return String(text).replace(/\u0000/g, "").trim();
}

const textExtractor = getTextExtractor();

async function extractTextFromFile({ buffer, fileType, fileName }) {
  const lowerType = (fileType || "").toLowerCase();
  const isPdf = lowerType.includes("pdf") || (fileName || "").toLowerCase().endsWith(".pdf");
  const isPpt = lowerType.includes("presentation") || lowerType.includes("ppt") || (fileName || "").toLowerCase().match(/\.pptx?$/);
  const isImage = lowerType.startsWith("image/");
  if (isPdf || isPpt) {
    const text = await textExtractor.extractText({ input: buffer, type: "buffer" });
    return sanitizeTextBlock(text);
  }
  if (isImage) {
    const base64 = buffer.toString("base64");
    const completion = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: [{ type: "text", text: "Extract all readable text from this image. Return only the text, no extra words." }, { type: "image_url", image_url: { url: `data:${fileType};base64,${base64}` } }] }], temperature: 0 });
    return sanitizeTextBlock(completion.choices[0]?.message?.content?.trim() || "");
  }
  return "";
}

async function generateNoteOutputs(text) {
  const prompt = "You are a study assistant. Summarize the lecture notes into JSON with keys: shortSummary (string), detailedSummary (string), keyPoints (array of strings), qa (array of {question, answer}). Return ONLY JSON. Use clear, exam-ready language.";
  const completion = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "system", content: "Return only JSON, no markdown." }, { role: "user", content: prompt + "\n\nNOTES:\n" + text }], temperature: 0.3 });
  const raw = completion.choices[0]?.message?.content?.trim() || "{}";
  const cleaned = raw.replace(/```json?\s*|\s*```/g, "").trim();
  let parsed = {};
  try { parsed = JSON.parse(cleaned); } catch { parsed = {}; }
  return {
    shortSummary: sanitizeTextBlock(parsed.shortSummary),
    detailedSummary: sanitizeTextBlock(parsed.detailedSummary),
    keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.map(sanitizeTextBlock).filter(Boolean) : [],
    qa: Array.isArray(parsed.qa) ? parsed.qa.filter(x => x && x.question && x.answer).map(x => ({ question: sanitizeTextBlock(x.question), answer: sanitizeTextBlock(x.answer) })) : [],
  };
}

async function generateFlashcardsFromNote(note) {
  const source = [note.short_summary, note.detailed_summary, Array.isArray(note.key_points) ? note.key_points.join("\n") : "", (note.original_text || "").slice(0, 4000)].filter(Boolean).join("\n\n");
  const prompt = "Create concise flashcards from the notes below. Return ONLY JSON array of objects with keys: question, answer. Answers must be short and clear. No extra text.";
  const completion = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "system", content: "Return only JSON, no markdown." }, { role: "user", content: prompt + "\n\nNOTES:\n" + source }], temperature: 0.3 });
  const raw = completion.choices[0]?.message?.content?.trim() || "[]";
  const cleaned = raw.replace(/```json?\s*|\s*```/g, "").trim();
  let parsed = [];
  try { parsed = JSON.parse(cleaned); } catch { parsed = []; }
  return Array.isArray(parsed) ? parsed.filter(c => c && c.question && c.answer).map(c => ({ question: sanitizeTextBlock(c.question).slice(0, 240), answer: sanitizeTextBlock(c.answer).slice(0, 360) })).filter(c => c.question && c.answer) : [];
}

app.post("/api/notes/extract", async (req, res) => {
  const { phoneNumber, fileName, fileType, base64 } = req.body;
  if (!phoneNumber || !base64) return res.status(400).json({ error: "Phone number and file are required" });
  try {
    const buffer = Buffer.from(base64, "base64");
    const text = await extractTextFromFile({ buffer, fileType, fileName });
    if (!text) return res.status(422).json({ error: "Could not extract text from file" });
    res.json({ text });
  } catch (err) {
    console.error("Notes extract error:", err);
    res.status(500).json({ error: "Failed to extract text" });
  }
});

app.post("/api/notes", async (req, res) => {
  const { phoneNumber, subject, topic, content, transcript, fileName, fileType, fileSize } = req.body;
  if (!phoneNumber || !subject || !topic || !content) return res.status(400).json({ error: "Phone number, subject, topic, and content are required" });
  if (!sb) return res.status(503).json({ error: "Database not configured" });
  try {
    const originalText = sanitizeTextBlock(content).slice(0, 20000);
    const outputs = await generateNoteOutputs(originalText);
    const { data: note, error } = await sb.from("notes").insert({
      user_id: phoneNumber,
      subject: sanitizeTextBlock(subject),
      topic: sanitizeTextBlock(topic),
      // Some existing DB schemas include a NOT NULL `title` column; map it to `topic`.
      title: sanitizeTextBlock(topic),
      original_text: originalText,
      transcript: sanitizeTextBlock(transcript),
      short_summary: outputs.shortSummary,
      detailed_summary: outputs.detailedSummary,
      key_points: outputs.keyPoints,
      qa: outputs.qa,
      flashcards: [],
      file_name: sanitizeTextBlock(fileName),
      file_type: sanitizeTextBlock(fileType),
      file_size: Number(fileSize) || 0,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ note: { ...note, _id: note.id } });
  } catch (err) {
    console.error("Create note error:", err);
    res.status(500).json({ error: "Failed to create note" });
  }
});

app.get("/api/notes", async (req, res) => {
  const { phoneNumber, q } = req.query;
  if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });
  if (!sb) return res.status(503).json({ error: "Database not configured" });
  try {
    let query = sb.from("notes").select("*").eq("user_id", phoneNumber).order("created_at", { ascending: false });
    if (q && String(q).trim()) {
      const search = String(q).trim();
      query = query.or(`subject.ilike.%${search}%,topic.ilike.%${search}%,original_text.ilike.%${search}%,short_summary.ilike.%${search}%`);
    }
    const { data: notes, error } = await query;
    if (error) throw error;
    res.json({ notes: (notes || []).map(n => ({ ...n, _id: n.id })) });
  } catch (err) {
    console.error("Notes list error:", err);
    res.status(500).json({ error: "Failed to fetch notes" });
  }
});

app.put("/api/notes/:id", async (req, res) => {
  const { id } = req.params;
  const { phoneNumber, subject, topic, content, transcript, fileName, fileType, fileSize } = req.body;
  if (!id || !phoneNumber) return res.status(400).json({ error: "ID and phone number required" });
  if (!sb) return res.status(503).json({ error: "Database not configured" });
  try {
    const { data: existing } = await sb.from("notes").select("*").eq("id", id).eq("user_id", phoneNumber).single();
    if (!existing) return res.status(404).json({ error: "Note not found" });
    const updates = { updated_at: new Date().toISOString() };
    if (subject !== undefined) updates.subject = sanitizeTextBlock(subject);
    if (topic !== undefined) updates.topic = sanitizeTextBlock(topic);
    if (topic !== undefined) updates.title = sanitizeTextBlock(topic);
    if (transcript !== undefined) updates.transcript = sanitizeTextBlock(transcript);
    if (fileName !== undefined) updates.file_name = sanitizeTextBlock(fileName);
    if (fileType !== undefined) updates.file_type = sanitizeTextBlock(fileType);
    if (fileSize !== undefined) updates.file_size = Number(fileSize) || 0;
    if (content !== undefined) {
      const originalText = sanitizeTextBlock(content).slice(0, 20000);
      const contentChanged = originalText !== existing.original_text;
      updates.original_text = originalText;
      const outputs = await generateNoteOutputs(originalText);
      updates.short_summary = outputs.shortSummary;
      updates.detailed_summary = outputs.detailedSummary;
      updates.key_points = outputs.keyPoints;
      updates.qa = outputs.qa;
      if (contentChanged) { updates.flashcards = []; updates.flashcards_updated_at = null; }
    }
    const { data: note, error } = await sb.from("notes").update(updates).eq("id", id).select().single();
    if (error) throw error;
    res.json({ note: { ...note, _id: note.id } });
  } catch (err) {
    console.error("Update note error:", err);
    res.status(500).json({ error: "Failed to update note" });
  }
});

app.delete("/api/notes/:id", async (req, res) => {
  const { id } = req.params;
  const { phoneNumber } = req.query;
  if (!id || !phoneNumber) return res.status(400).json({ error: "ID and phone number required" });
  if (!sb) return res.status(503).json({ error: "Database not configured" });
  try {
    const { data, error } = await sb.from("notes").delete().eq("id", id).eq("user_id", phoneNumber).select().single();
    if (error || !data) return res.status(404).json({ error: "Note not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("Delete note error:", err);
    res.status(500).json({ error: "Failed to delete note" });
  }
});

app.post("/api/notes/:id/flashcards", async (req, res) => {
  const { id } = req.params;
  const { phoneNumber } = req.body;
  if (!id || !phoneNumber) return res.status(400).json({ error: "ID and phone number required" });
  if (!sb) return res.status(503).json({ error: "Database not configured" });
  try {
    const { data: note } = await sb.from("notes").select("*").eq("id", id).eq("user_id", phoneNumber).single();
    if (!note) return res.status(404).json({ error: "Note not found" });
    if (note.flashcards && note.flashcards.length > 0) return res.status(409).json({ error: "Flashcards already exist" });
    const cards = await generateFlashcardsFromNote(note);
    if (!cards.length) return res.status(500).json({ error: "Failed to generate flashcards" });
    const { data: updated, error } = await sb.from("notes").update({ flashcards: cards, flashcards_updated_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw error;
    res.json({ flashcards: updated.flashcards || [] });
  } catch (err) {
    console.error("Generate flashcards error:", err);
    res.status(500).json({ error: "Failed to generate flashcards" });
  }
});

app.get("/api/notes/:id/flashcards", async (req, res) => {
  const { id } = req.params;
  const { phoneNumber } = req.query;
  if (!id || !phoneNumber) return res.status(400).json({ error: "ID and phone number required" });
  if (!sb) return res.status(503).json({ error: "Database not configured" });
  try {
    const { data: note } = await sb.from("notes").select("flashcards").eq("id", id).eq("user_id", phoneNumber).single();
    if (!note) return res.status(404).json({ error: "Note not found" });
    res.json({ flashcards: note.flashcards || [] });
  } catch (err) {
    console.error("Get flashcards error:", err);
    res.status(500).json({ error: "Failed to fetch flashcards" });
  }
});

app.delete("/api/notes/:id/flashcards", async (req, res) => {
  const { id } = req.params;
  const { phoneNumber } = req.query;
  if (!id || !phoneNumber) return res.status(400).json({ error: "ID and phone number required" });
  if (!sb) return res.status(503).json({ error: "Database not configured" });
  try {
    const { data, error } = await sb.from("notes").update({ flashcards: [], flashcards_updated_at: null, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", phoneNumber).select().single();
    if (error || !data) return res.status(404).json({ error: "Note not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("Delete flashcards error:", err);
    res.status(500).json({ error: "Failed to delete flashcards" });
  }
});

// ================================
// Chat History
// ================================
app.get("/api/chats", async (req, res) => {
  const { phoneNumber } = req.query;
  if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });
  if (!sb) return res.status(503).json({ error: "Database not configured" });
  try {
    const { data: chats, error } = await sb.from("chats").select("id,title,pinned,tags,message_count,last_message,last_message_at,created_at,updated_at").eq("user_id", phoneNumber).order("pinned", { ascending: false }).order("updated_at", { ascending: false });
    if (error) throw error;
    res.json({ chats: (chats || []).map(c => ({ _id: c.id, ...c })) });
  } catch (err) {
    console.error("Error fetching chats:", err);
    res.status(500).json({ error: "Failed to fetch chats" });
  }
});

app.get("/api/chats/:chatId", async (req, res) => {
  const { chatId } = req.params;
  const { phoneNumber, page = 1, limit = 50 } = req.query;
  if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });
  if (!sb) return res.status(503).json({ error: "Database not configured" });
  try {
    const { data: chat } = await sb.from("chats").select("*").eq("id", chatId).eq("user_id", phoneNumber).single();
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const from = (pageNum - 1) * limitNum;
    // Deterministic ordering: created_at can tie when inserting user+assistant back-to-back,
    // which can otherwise swap the two roles on initial render.
    const { data: messages, count } = await sb.from("messages").select("id,role,content,audio_base64,function_calls,tokens_used,created_at", { count: "exact" }).eq("chat_id", chatId).order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, from + limitNum - 1);
    const sortedMessages = (messages || []).reverse();
    res.json({ chat: { _id: chat.id, title: chat.title, pinned: chat.pinned, tags: chat.tags, messageCount: chat.message_count, createdAt: chat.created_at, updatedAt: chat.updated_at }, messages: sortedMessages.map(m => ({ _id: m.id, role: m.role, content: m.content, audioBase64: m.audio_base64, functionCalls: m.function_calls, tokensUsed: m.tokens_used, createdAt: m.created_at })), pagination: { page: pageNum, limit: limitNum, total: count || 0, totalPages: Math.ceil((count || 0) / limitNum) } });
  } catch (err) {
    console.error("Error fetching chat:", err);
    res.status(500).json({ error: "Failed to fetch chat" });
  }
});

app.post("/api/chats", async (req, res) => {
  const { phoneNumber, title } = req.body;
  if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });
  if (!sb) return res.status(503).json({ error: "Database not configured" });
  try {
    const { data: chat, error } = await sb.from("chats").insert({ user_id: phoneNumber, title: title || "New Chat", pinned: false, tags: [], message_count: 0, last_message: "", last_message_at: new Date().toISOString() }).select().single();
    if (error) throw error;
    res.json({ success: true, chat: { _id: chat.id, title: chat.title, pinned: chat.pinned, tags: chat.tags, messageCount: chat.message_count, createdAt: chat.created_at, updatedAt: chat.updated_at } });
  } catch (err) {
    console.error("Error creating chat:", err);
    res.status(500).json({ error: "Failed to create chat" });
  }
});

app.put("/api/chats/:chatId", async (req, res) => {
  const { chatId } = req.params;
  const { phoneNumber, title, pinned, tags } = req.body;
  if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });
  if (!sb) return res.status(503).json({ error: "Database not configured" });
  try {
    const updates = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title;
    if (pinned !== undefined) updates.pinned = pinned;
    if (tags !== undefined) updates.tags = Array.isArray(tags) ? tags : [];
    const { data: chat, error } = await sb.from("chats").update(updates).eq("id", chatId).eq("user_id", phoneNumber).select().single();
    if (error || !chat) return res.status(404).json({ error: "Chat not found" });
    res.json({ success: true, chat: { _id: chat.id, title: chat.title, pinned: chat.pinned, tags: chat.tags, messageCount: chat.message_count, createdAt: chat.created_at, updatedAt: chat.updated_at } });
  } catch (err) {
    console.error("Error updating chat:", err);
    res.status(500).json({ error: "Failed to update chat" });
  }
});

app.delete("/api/chats/:chatId", async (req, res) => {
  const { chatId } = req.params;
  const { phoneNumber } = req.query;
  if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });
  if (!sb) return res.status(503).json({ error: "Database not configured" });
  try {
    const { data: chat } = await sb.from("chats").select("id").eq("id", chatId).eq("user_id", phoneNumber).single();
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    await sb.from("messages").delete().eq("chat_id", chatId);
    await sb.from("chats").delete().eq("id", chatId);
    res.json({ success: true, message: "Chat deleted successfully" });
  } catch (err) {
    console.error("Error deleting chat:", err);
    res.status(500).json({ error: "Failed to delete chat" });
  }
});

app.post("/api/chats/:chatId/messages", async (req, res) => {
  const { chatId } = req.params;
  const { phoneNumber, role, content, audioBase64, functionCalls, tokensUsed } = req.body;
  if (!phoneNumber || !role || !content) return res.status(400).json({ error: "Phone number, role, and content are required" });
  if (!sb) return res.status(503).json({ error: "Database not configured" });
  try {
    const { data: chat } = await sb.from("chats").select("id,message_count").eq("id", chatId).eq("user_id", phoneNumber).single();
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    const { data: message, error } = await sb.from("messages").insert({ chat_id: chatId, user_id: phoneNumber, role, content, audio_base64: audioBase64 || null, function_calls: functionCalls || [], tokens_used: tokensUsed || 0 }).select().single();
    if (error) throw error;
    await sb.from("chats").update({ message_count: (chat.message_count || 0) + 1, last_message: content.substring(0, 100), last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", chatId);
    res.json({ success: true, message: { _id: message.id, role: message.role, content: message.content, audioBase64: message.audio_base64, functionCalls: message.function_calls, tokensUsed: message.tokens_used, createdAt: message.created_at } });
  } catch (err) {
    console.error("Error adding message:", err);
    res.status(500).json({ error: "Failed to add message" });
  }
});

// ================================
// Error handlers
// ================================
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  if (req.path.startsWith("/api/")) {
    res.status(err.status || 500).json({ error: err.message || "Internal server error", success: false });
  } else {
    res.status(err.status || 500).send(`<h1>Error ${err.status || 500}</h1><p>${err.message || "Internal server error"}</p>`);
  }
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: `Route not found: ${req.method} ${req.path}`, success: false });
  } else {
    res.status(404).sendFile(path.join(__dirname, "public", "index.html"));
  }
});

// Start
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🔥 Jarvis backend running: http://localhost:${PORT}`);
  console.log(`📱 Access from phone: http://192.168.0.105:${PORT}`);
});
