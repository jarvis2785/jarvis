const chat = document.getElementById("chat");
const input = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");

// Add message to chat UI
function addMessage(text, sender) {
  const div = document.createElement("div");
  div.className = "message " + sender;
  div.innerText = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

// Send user message
async function sendMessage() {
  const message = input.value.trim();
  if (!message) return;

  addMessage(message, "user");
  input.value = "";

  try {
    const res = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });

    const data = await res.json();

    if (data.reply) addMessage(data.reply, "ai");
    else addMessage("No response from AI.", "ai");
  } catch (err) {
    console.error("Error sending message:", err);
    addMessage("Error connecting to server.", "ai");
  }
}

// Event listeners
sendBtn.addEventListener("click", sendMessage);
input.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});