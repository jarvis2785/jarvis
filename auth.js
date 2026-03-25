// ============================================================
// JARVIS AUTH.JS — Works with existing HTML structure
// IDs: #phoneSection, #otpSection, #nameSection
//      #phoneNumber, #otpCode, #firstName, #lastName
//      #sendOtpBtn, #verifyOtpBtn, #backToPhoneBtn, #saveNameBtn
// ============================================================

console.log("✅ Jarvis auth.js loaded (backend OTP mode)");

const AUTH_API_BASE = (() => {
  const h = window.location.hostname;
  return (h === 'localhost' || h === '127.0.0.1')
    ? 'http://localhost:3001'
    : window.location.origin;
})();

// ---- Session restore ----
(function restoreSession() {
  try {
    const stored = JSON.parse(localStorage.getItem('jarvisUser') || 'null');
    if (stored && stored.phoneNumber && stored.firstName) {
      window.currentPhoneNumber = stored.phoneNumber;
      window.currentUserData = stored;
      console.log("✅ Session restored for", stored.phoneNumber);

      const trySkip = () => {
        const authScreen = document.getElementById('authScreen');
        if (authScreen && (authScreen.style.display === 'flex' || authScreen.style.display === 'block')) {
          authScreen.style.display = 'none';
          if (typeof checkCalendarSetup === 'function') checkCalendarSetup();
          else if (typeof showHomePage === 'function') showHomePage();
        }
      };
      setTimeout(trySkip, 500);
      setTimeout(trySkip, 1000);
      setTimeout(trySkip, 2000);
      setTimeout(trySkip, 3000);
    }
  } catch (e) {
    console.warn("Session restore failed:", e);
  }
})();

// ---- Show/hide helpers ----
function showSection(name) {
  const phoneSection = document.getElementById('phoneSection');
  const otpSection   = document.getElementById('otpSection');
  const nameSection  = document.getElementById('nameSection');

  if (phoneSection) phoneSection.style.display = name === 'phone' ? 'block' : 'none';
  if (otpSection)   otpSection.style.display   = name === 'otp'   ? 'block' : 'none';
  if (nameSection)  nameSection.style.display  = name === 'name'  ? 'block' : 'none';
}

function setError(msg) {
  const el = document.getElementById('errorMessage');
  const ok = document.getElementById('successMessage');
  if (el) el.textContent = msg || '';
  if (ok) ok.textContent = '';
}

function setSuccess(msg) {
  const el = document.getElementById('successMessage');
  const err = document.getElementById('errorMessage');
  if (el) el.textContent = msg || '';
  if (err) err.textContent = '';
}

// ---- Core auth functions ----
window.sendOTP = async function() {
  const input = document.getElementById('phoneNumber');
  if (!input) return;
  let phone = input.value.trim();
  if (!phone) { setError("Please enter your phone number."); return; }

  if (/^\d{10}$/.test(phone)) phone = '+91' + phone;
  if (!phone.startsWith('+')) phone = '+' + phone;

  const btn = document.getElementById('sendOtpBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
  setError('');

  try {
    const res = await fetch(`${AUTH_API_BASE}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: phone })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send OTP');

    window.currentPhoneNumber = phone;
    setSuccess('OTP sent! Check your phone.');
    showSection('otp');
    setTimeout(() => { const o = document.getElementById('otpCode'); if (o) o.focus(); }, 100);
  } catch (err) {
    setError(err.message || 'Failed to send OTP. Please try again.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Send OTP'; }
  }
};

window.verifyOTP = async function() {
  const otpInput = document.getElementById('otpCode');
  if (!otpInput) return;
  const otp = otpInput.value.trim();
  if (!otp || otp.length < 4) { setError("Please enter the OTP."); return; }

  const phone = window.currentPhoneNumber;
  if (!phone) { setError("Phone number missing. Please go back."); return; }

  const btn = document.getElementById('verifyOtpBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Verifying...'; }
  setError('');

  // ---- DEV BYPASS (localhost only) ----
  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (isLocalhost && otp === '123456') {
    console.log("🔧 Dev bypass: logging in locally");
    if (btn) { btn.disabled = false; btn.textContent = 'Verify OTP'; }
    const existing = JSON.parse(localStorage.getItem('jarvisUser') || 'null');
    if (existing && existing.firstName) {
      window.currentUserData = existing;
      window.currentPhoneNumber = phone;
      finishAuth();
    } else {
      setSuccess('Dev mode: enter your name to continue.');
      showSection('name');
      setTimeout(() => { const fn = document.getElementById('firstName'); if (fn) fn.focus(); }, 100);
    }
    return;
  }
  // ---- END DEV BYPASS ----

  try {
    const res = await fetch(`${AUTH_API_BASE}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: phone, otp })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Invalid OTP');

    if (data.user && data.user.firstName) {
      window.currentUserData = data.user;
      localStorage.setItem('jarvisUser', JSON.stringify(data.user));
      finishAuth();
    } else {
      setSuccess('Phone verified! Please tell us your name.');
      showSection('name');
      setTimeout(() => { const fn = document.getElementById('firstName'); if (fn) fn.focus(); }, 100);
    }
  } catch (err) {
    setError(err.message || 'Invalid OTP. Please try again.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Verify OTP'; }
  }
};

window.saveName = async function() {
  const firstNameEl = document.getElementById('firstName');
  const lastNameEl  = document.getElementById('lastName');
  const firstName = firstNameEl ? firstNameEl.value.trim() : '';
  const lastName  = lastNameEl  ? lastNameEl.value.trim()  : '';

  if (!firstName) { setError("Please enter your first name."); return; }

  const phone = window.currentPhoneNumber;
  if (!phone) { setError("Session expired. Please restart."); return; }

  const btn = document.getElementById('saveNameBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
  setError('');

  try {
    const res = await fetch(`${AUTH_API_BASE}/auth/save-name`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: phone, firstName, lastName })
    });

    let user;
    if (res.ok) {
      const data = await res.json();
      user = data.user || { phoneNumber: phone, firstName, lastName };
    } else {
      // Endpoint doesn't exist yet — save locally and continue
      console.warn("save-name endpoint not found, saving locally");
      user = { phoneNumber: phone, firstName, lastName };
    }

    window.currentUserData = user;
    localStorage.setItem('jarvisUser', JSON.stringify(user));
    finishAuth();
  } catch (err) {
    // Network error — still save locally and continue
    console.warn("save-name failed, saving locally:", err.message);
    const user = { phoneNumber: phone, firstName, lastName };
    window.currentUserData = user;
    localStorage.setItem('jarvisUser', JSON.stringify(user));
    finishAuth();
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Continue'; }
  }
};

window.backToPhone = function() {
  setError(''); setSuccess('');
  showSection('phone');
  const o = document.getElementById('otpCode');
  if (o) o.value = '';
};

window.jarvisLogout = function() {
  localStorage.removeItem('jarvisUser');
  window.currentUserData = null;
  window.currentPhoneNumber = null;
  location.reload();
};

function finishAuth() {
  console.log("✅ Auth complete, going to home");
  const authScreen = document.getElementById('authScreen');
  if (authScreen) {
    authScreen.style.opacity = '0';
    authScreen.style.transition = 'opacity 0.5s';
    setTimeout(() => {
      authScreen.style.display = 'none';
      authScreen.style.opacity = '1';
      if (typeof checkCalendarSetup === 'function') checkCalendarSetup();
      else if (typeof showHomePage === 'function') showHomePage();
    }, 500);
  }
}

// ---- Bind buttons on DOM ready ----
document.addEventListener('DOMContentLoaded', function() {
  console.log("✅ auth.js DOMContentLoaded — binding buttons");

  const sendOtpBtn     = document.getElementById('sendOtpBtn');
  const verifyOtpBtn   = document.getElementById('verifyOtpBtn');
  const backToPhoneBtn = document.getElementById('backToPhoneBtn');
  const saveNameBtn    = document.getElementById('saveNameBtn');
  const phoneInput     = document.getElementById('phoneNumber');
  const otpInput       = document.getElementById('otpCode');

  if (sendOtpBtn)     sendOtpBtn.onclick     = window.sendOTP;
  if (verifyOtpBtn)   verifyOtpBtn.onclick   = window.verifyOTP;
  if (backToPhoneBtn) backToPhoneBtn.onclick  = window.backToPhone;
  if (saveNameBtn)    saveNameBtn.onclick     = window.saveName;

  if (phoneInput) phoneInput.addEventListener('keydown', e => { if (e.key === 'Enter') window.sendOTP(); });
  if (otpInput)   otpInput.addEventListener('keydown',   e => { if (e.key === 'Enter') window.verifyOTP(); });

  showSection('phone');
  console.log("✅ Boot complete!");
});