console.log("✅ Jarvis auth.js loaded (Supabase email OTP mode)");

let sbClient = null;
let currentEmail = null;
let currentAuthMode = "signup";
let onboardingActive = false;
let authCompleting = false;

// ---- Init Supabase from backend config ----
async function initSupabase() {
  try {
    const res = await fetch("/api/config");
    const cfg = await res.json();
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      console.error("Supabase config missing from server");
      return false;
    }
    sbClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: {
        persistSession: true,
        storage: window.localStorage,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'jarvis-auth-token'
      }
    });
    console.log("✅ Supabase client initialized");
    return true;
  } catch (e) {
    console.error("Failed to init Supabase:", e);
    return false;
  }
}

// ---- Session restore ----
async function restoreSession() {
  if (!sbClient) return false;
  try {
    const { data: { session } } = await sbClient.auth.getSession();
    if (session && session.user) {
      const user = session.user;
      let calendarConnected = false;
      try { calendarConnected = sessionStorage.getItem("jarvisCalendarJustConnected") === "1"; } catch (_) {}
      window.currentPhoneNumber = user.id;
      window.currentUserData = {
        id: user.id,
        email: user.email,
        firstName: user.user_metadata?.firstName || user.email.split("@")[0],
        phoneNumber: user.id,
        calendarConnected,
      };
      // Prefer Supabase profile names for greeting; fallback to email prefix.
      try {
        const profileRes = await fetch(`/api/profile?user_id=${user.id}`);
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          if (profileData?.firstName && profileData.firstName !== "User") {
            window.currentUserData.firstName = profileData.firstName;
          }
          if (profileData?.lastName !== undefined) {
            window.currentUserData.lastName = profileData.lastName;
          }
        }
      } catch (_) {}
      try { localStorage.setItem("jarvisUser", JSON.stringify({ phoneNumber: user.id, email: user.email, firstName: window.currentUserData.firstName })); } catch (_) {}
      console.log("✅ Session restored for", user.email);
      return true;
    }
  } catch (e) {
    console.warn("Session restore failed:", e);
  }
  return false;
}

// ---- UI helpers ----
function showSection(name) {
  const sections = ["signUpSection", "signInSection", "otpSection"];
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === name ? "block" : "none";
  });
  setError("");
  setSuccess("");
}

function setError(msg) {
  const el = document.getElementById("errorMessage");
  const ok = document.getElementById("successMessage");
  if (el) el.textContent = msg || "";
  if (ok && msg) ok.textContent = "";
}

function setSuccess(msg) {
  const el = document.getElementById("successMessage");
  const err = document.getElementById("errorMessage");
  if (el) el.textContent = msg || "";
  if (err && msg) err.textContent = "";
}

function setLoading(btnId, loading, defaultText) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? "Please wait..." : defaultText;
}

// ---- Send OTP (shared for sign up and sign in) ----
async function sendCode(email, mode) {
  if (!sbClient) { setError("Auth service not ready. Please refresh."); return; }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setError("Please enter a valid email address.");
    return;
  }

  const btnId = mode === "signup" ? "signUpBtn" : "signInBtn";
  setLoading(btnId, true, "Send Code");
  setError("");

  try {
    const { error } = await sbClient.auth.signInWithOtp({
      email: email,
      options: { shouldCreateUser: true },
    });

    if (error) throw error;

    currentEmail = email;
    currentAuthMode = mode;
    const subtitle = document.getElementById("otpSubtitle");
    if (subtitle) subtitle.textContent = `We sent a 6-digit code to ${email}`;
    setSuccess("Code sent! Check your inbox.");
    showSection("otpSection");
    setTimeout(() => {
      const o = document.getElementById("otpCode");
      if (o) { o.value = ""; o.focus(); }
    }, 100);
  } catch (err) {
    setError(err.message || "Failed to send code. Please try again.");
  } finally {
    setLoading(btnId, false, "Send Code");
  }
}

// ---- Verify OTP ----
window.verifyOTP = async function() {
  if (!sbClient) { setError("Auth service not ready. Please refresh."); return; }
  const otpInput = document.getElementById("otpCode");
  const otp = otpInput ? otpInput.value.trim() : "";

  if (!otp || !/^\d{6}$/.test(otp)) {
    setError("Please enter the 6-digit numeric code.");
    return;
  }
  if (!currentEmail) { setError("Email missing. Please go back."); return; }

  setLoading("verifyOtpBtn", true, "Verify");
  setError("");

  try {
    const { data, error } = await sbClient.auth.verifyOtp({
      email: currentEmail,
      token: otp,
      type: "email",
    });

    if (error) throw error;

    const user = data.user;
    const firstName = user.user_metadata?.firstName || user.email.split("@")[0];

    // Use Supabase user.id as the universal identifier throughout the app
    window.currentPhoneNumber = user.id;
    window.currentUserData = {
      id: user.id,
      email: user.email,
      firstName,
      phoneNumber: user.id, // keeps backward compat with existing code that reads phoneNumber
    };
    try { localStorage.setItem("jarvisUser", JSON.stringify({ phoneNumber: user.id, email: user.email, firstName })); } catch (_) {}

    // Sync to backend (creates user record if first login)
    try {
      await fetch("/api/user/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supabaseId: user.id, email: user.email, firstName }),
      });
    } catch (_) {}

    setSuccess("Verified!");
    authCompleting = true;
try {
  const profileRes = await fetch(`/api/profile?user_id=${user.id}`);
  const profileData = await profileRes.json();
      const hasFirstName = typeof profileData?.firstName === "string" && profileData.firstName.trim() !== "" && profileData.firstName !== "User";
      const hasPhone = typeof profileData?.phone === "string" && profileData.phone.trim() !== "";
      const hasName = hasFirstName && hasPhone;
      if (!hasName) {
    showOnboarding(user.id, user.email);
  } else {
        // Use Supabase profile name for greeting.
        window.currentUserData.firstName = profileData.firstName;
        window.currentUserData.lastName = profileData.lastName || "";
    finishAuth();
  }
} catch(_) {
  finishAuth();
}
  } catch (err) {
    setError(err.message || "Invalid code. Please try again.");
  } finally {
    setLoading("verifyOtpBtn", false, "Verify");
  }
};

// ---- Logout ----
window.jarvisLogout = async function() {
  if (sbClient) await sbClient.auth.signOut();
  window.currentUserData = null;
  window.currentPhoneNumber = null;
  localStorage.removeItem("jarvisUser");
  location.reload();
};

function showOnboarding(userId, email) {
  onboardingActive = true; 
  const authScreen = document.getElementById("authScreen");
  if (authScreen) authScreen.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100dvh;padding:20px;">
      <div style="background:#1a1a2e;border-radius:16px;padding:32px;width:100%;max-width:400px;">
        <h2 style="color:#fff;font-size:24px;font-weight:700;margin-bottom:8px;text-align:center;">One Last Step</h2>
        <p style="color:#888;font-size:14px;text-align:center;margin-bottom:24px;">Tell Jarvis who you are</p>
        <input id="ob_first" type="text" placeholder="First Name *" style="width:100%;padding:12px;border-radius:8px;border:1px solid #333;background:#111;color:#fff;font-size:16px;margin-bottom:12px;box-sizing:border-box;"/>
        <input id="ob_last" type="text" placeholder="Last Name" style="width:100%;padding:12px;border-radius:8px;border:1px solid #333;background:#111;color:#fff;font-size:16px;margin-bottom:12px;box-sizing:border-box;"/>
        <input id="ob_phone" type="tel" placeholder="Phone Number" style="width:100%;padding:12px;border-radius:8px;border:1px solid #333;background:#111;color:#fff;font-size:16px;margin-bottom:20px;box-sizing:border-box;"/>
        <button id="ob_submit" style="width:100%;padding:14px;border-radius:8px;background:#6c63ff;color:#fff;font-size:16px;font-weight:600;border:none;cursor:pointer;">Continue</button>
        <p id="ob_error" style="color:#ff4444;font-size:13px;text-align:center;margin-top:8px;"></p>
      </div>
    </div>
  `;

  document.getElementById("ob_submit").onclick = async function() {
    const firstName = document.getElementById("ob_first").value.trim();
    const lastName = document.getElementById("ob_last").value.trim();
    const phone = document.getElementById("ob_phone").value.trim();
    const errEl = document.getElementById("ob_error");

    if (!firstName) { errEl.textContent = "First name is required."; return; }

    this.disabled = true;
    this.textContent = "Saving...";

    try {
      await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          firstName: firstName,
          lastName: lastName,
          phoneNumber: phone,
          profile: {}
        })
      });

      window.currentUserData = {
        ...window.currentUserData,
        firstName: firstName,
        lastName: lastName,
      };
      try {
        localStorage.setItem("jarvisUser", JSON.stringify({
          phoneNumber: userId,
          email: email,
          firstName: firstName
        }));
      } catch(_) {}

      finishAuth();
    } catch(e) {
      errEl.textContent = "Failed to save. Please try again.";
      this.disabled = false;
      this.textContent = "Continue";
    }
  };
}
function finishAuth() {
  console.log("✅ Auth complete, going to home");
  if (typeof checkOAuthCallback === "function") checkOAuthCallback();
  const authScreen = document.getElementById("authScreen");
  const intro = document.getElementById("intro");
  if (intro) {
    intro.style.display = "none";
    intro.style.opacity = "0";
    intro.style.pointerEvents = "none";
    intro.style.zIndex = "-1";
  }
  if (authScreen) {
    authScreen.style.opacity = "0";
    authScreen.style.transition = "opacity 0.5s";
    authScreen.style.display = "none";
    authScreen.style.opacity = "1";
  }
  if (typeof checkCalendarSetup === "function") checkCalendarSetup();
  else if (typeof showHomePage === "function") showHomePage();
}

// ---- Bind UI on DOM ready ----
document.addEventListener("DOMContentLoaded", async function() {
  console.log("✅ auth.js DOMContentLoaded — initializing Supabase");

  const ok = await initSupabase();

  if (ok) {
    const hasSession = await restoreSession();
    if (hasSession) {
      const isCalendarReturn = () => typeof window !== 'undefined' && (window.location.search.includes('calendar=connected') || (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('jarvisCalendarJustConnected') === '1'));
      if (isCalendarReturn()) {
        console.log("📅 Calendar return + session - going directly to home");
        finishAuth();
      } else {
        const trySkip = () => {
          if (onboardingActive || authCompleting) return;
          const authScreen = document.getElementById("authScreen");
          if (authScreen && (authScreen.style.display === "flex" || authScreen.style.display === "block")) {
            finishAuth();
          }
        };
        setTimeout(trySkip, 500);
        setTimeout(trySkip, 1000);
        setTimeout(trySkip, 2000);
        setTimeout(trySkip, 3500);
        setTimeout(trySkip, 5000);
      }
    }
  }

  // Sign Up flow
  const signUpBtn = document.getElementById("signUpBtn");
  const signUpEmail = document.getElementById("signUpEmail");
  if (signUpBtn) signUpBtn.onclick = () => sendCode(signUpEmail?.value?.trim(), "signup");
  if (signUpEmail) signUpEmail.addEventListener("keydown", e => { if (e.key === "Enter") sendCode(signUpEmail.value.trim(), "signup"); });

  // Sign In flow
  const signInBtn = document.getElementById("signInBtn");
  const signInEmail = document.getElementById("signInEmail");
  if (signInBtn) signInBtn.onclick = () => sendCode(signInEmail?.value?.trim(), "signin");
  if (signInEmail) signInEmail.addEventListener("keydown", e => { if (e.key === "Enter") sendCode(signInEmail.value.trim(), "signin"); });

  // OTP verify
  const verifyBtn = document.getElementById("verifyOtpBtn");
  const otpInput = document.getElementById("otpCode");
  if (verifyBtn) verifyBtn.onclick = window.verifyOTP;
  if (otpInput) {
    otpInput.addEventListener("keydown", e => { if (e.key === "Enter") window.verifyOTP(); });
    otpInput.addEventListener("input", e => {
      e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
    });
  }

  // Back button
  const backBtn = document.getElementById("backToEmailBtn");
  if (backBtn) backBtn.onclick = () => showSection(currentAuthMode === "signin" ? "signInSection" : "signUpSection");

  // Switch links
  const goToSignIn = document.getElementById("goToSignIn");
  const goToSignUp = document.getElementById("goToSignUp");
  if (goToSignIn) goToSignIn.onclick = e => { e.preventDefault(); showSection("signInSection"); };
  if (goToSignUp) goToSignUp.onclick = e => { e.preventDefault(); showSection("signUpSection"); };

  showSection("signUpSection");
  console.log("✅ Auth UI ready");
});
