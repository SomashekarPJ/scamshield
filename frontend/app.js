/* =====================================================================
   ScamShield AI — Frontend Application Logic
   ===================================================================== */

const API_BASE = ""; // Relative to the hosted domain

// Example texts for the sample cards
const example1 = "Dear Customer, your SBI YONO account has been suspended due to incomplete KYC verification. Your account will be permanently blocked within 24 hours. Click here immediately to avoid blocking: http://sbi-kyc-update.site/verify?id=8827162 Enter your account number, password and OTP to continue.";
const example3 = "Congratulations! You have been selected as the WINNER of Jio Lucky Draw 2026. Prize amount: ₹50,000. To claim your prize, reply with your full name, bank account number and send ₹199 processing fee to UPI: claimprize@ybl within 24 hours or prize will be forfeited.";
const example4 = "Hi! Your order #OD987654321 has been shipped and is on its way. Expected delivery by this Friday before 9 PM. You can track your package in the Flipkart app under My Orders. Thank you for shopping with us!";

/* =====================================================================
   STATE
   ===================================================================== */
let currentTab = "text";
let selectedImageBase64 = null;
let lastResult = null;

// Voice/Call State
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let voiceDemoInterval = null;

/* =====================================================================
   HEALTH CHECK
   ===================================================================== */
async function checkHealth() {
  const dot  = document.getElementById("badgeDot");
  const text = document.getElementById("badgeText");
  try {
    const res  = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    dot.className  = "badge-dot online";
    
    if (data.groq_configured && data.gemini_configured) {
        text.textContent = "Dual AI Active";
    } else if (data.groq_configured) {
        text.textContent = "Groq AI Active";
    } else if (data.gemini_configured) {
        text.textContent = "Gemini AI Active";
    } else {
        text.textContent = "No API Keys";
        dot.className = "badge-dot offline";
    }
  } catch {
    dot.className  = "badge-dot offline";
    text.textContent = "Backend Offline";
  }
}

/* =====================================================================
   TAB SWITCHING
   ===================================================================== */
function switchTab(tab) {
  currentTab = tab;

  // Update tab buttons
  document.querySelectorAll(".tab").forEach(t => {
    t.classList.remove("active");
    t.setAttribute("aria-selected", "false");
  });
  const activeTab = document.getElementById(`tab-${tab}`);
  activeTab.classList.add("active");
  activeTab.setAttribute("aria-selected", "true");

  // Show/hide panels
  document.querySelectorAll(".panel").forEach(p => p.classList.add("hidden"));
  document.getElementById(`panel-${tab}`).classList.remove("hidden");

  // Clear results if switching to a new type
  hideAll();
}

/* =====================================================================
   FETCH RECENT SCANS
   ===================================================================== */
async function fetchRecentScans() {
  try {
    const res = await fetch(`${API_BASE}/api/recent_scans`);
    if (res.ok) {
      const data = await res.json();
      const grid = document.getElementById("recentScansGrid");
      if (data && data.length > 0) {
        grid.innerHTML = "";
        data.slice(0, 4).forEach(log => {
          const card = document.createElement("div");
          card.className = "example-card";
          card.style.cursor = "default";
          const levelClass = log.risk_level === 'CRITICAL' ? 'ex-tag-critical' : 'ex-tag-high';
          const typeLabel = log.input_type.toUpperCase();
          card.innerHTML = `
            <div class="ex-tag ${levelClass}">${log.risk_level} (${log.risk_score}/100)</div>
            <p class="ex-text" style="font-weight:600; color: var(--text-primary); margin: 6px 0;">${log.verdict}</p>
            <span class="ex-type" style="color: var(--text-muted); font-size: 0.65rem;">${new Date(log.timestamp + "Z").toLocaleTimeString()} • ${typeLabel} SCAN</span>
          `;
          grid.appendChild(card);
        });
      }
    }
  } catch (err) {
    console.error("Could not fetch recent scans:", err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const textarea = document.getElementById("textInput");
  const counter  = document.getElementById("charCount");
  if (textarea) {
    textarea.addEventListener("input", () => {
      counter.textContent = `${textarea.value.length} / 5000`;
    });
  }
  checkHealth();
  fetchRecentScans();
  // Poll health every 30s
  setInterval(checkHealth, 30000);
  setInterval(fetchRecentScans, 15000);
});


/* =====================================================================
   IMAGE HANDLING
   ===================================================================== */
function onFileSelect(event) {
  const file = event.target.files[0];
  if (file) loadImageFile(file);
}

function onDragOver(event) {
  event.preventDefault();
  document.getElementById("dropZone").classList.add("drag-over");
}

function onDragLeave() {
  document.getElementById("dropZone").classList.remove("drag-over");
}

function onDrop(event) {
  event.preventDefault();
  document.getElementById("dropZone").classList.remove("drag-over");
  const file = event.dataTransfer.files[0];
  if (file && file.type.startsWith("image/")) {
    loadImageFile(file);
  }
}

function loadImageFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    // Strip data URL prefix to get pure base64
    selectedImageBase64 = dataUrl.split(",")[1];

    // Show preview
    const preview  = document.getElementById("dropPreview");
    const img      = document.getElementById("previewImg");
    const name     = document.getElementById("previewName");
    img.src        = dataUrl;
    name.textContent = file.name;
    preview.classList.remove("hidden");

    // Enable button
    document.getElementById("analyzeImageBtn").disabled = false;
  };
  reader.readAsDataURL(file);
}

/* =====================================================================
   VOICE & CALL DEFENDER
   ===================================================================== */
async function toggleRecording() {
  const btn = document.getElementById("recordBtn");
  const status = document.getElementById("callStatus");

  if (!isRecording) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        await analyzeVoice(audioBlob);
      };

      mediaRecorder.start();
      isRecording = true;
      btn.innerHTML = `<div class="record-dot"></div> Stop & Analyze`;
      btn.classList.add("recording");
      status.textContent = "Listening to live audio...";
    } catch (err) {
      showError("Microphone access denied or not available.");
    }
  } else {
    mediaRecorder.stop();
    isRecording = false;
    btn.innerHTML = `<div class="record-dot"></div> Start Real-Time Scan`;
    btn.classList.remove("recording");
    status.textContent = "Processing audio...";
  }
}

async function analyzeVoice(blob) {
  showLoading("Transcribing and analyzing voice data...");
  const formData = new FormData();
  formData.append("file", blob, "recording.wav");

  try {
    const res = await fetch(`${API_BASE}/api/analyze/voice`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) throw new Error("Voice analysis failed");
    
    const data = await res.json();
    hideAll();
    if (data.success) {
      lastResult = data;
      renderResult(data);
    } else {
      showError(data.error);
    }
  } catch (err) {
    hideAll();
    showError(err.message);
  }
}

function runCallDemo() {
  const transcript = [
    "Hello sir, I am calling from SBI official headquarters.",
    "Our system shows your YONO account will be blocked by tonight.",
    "This is due to a security violation in your KYC documents.",
    "Please do not worry, I can help you fix it right now during this call.",
    "I have sent an OTP to your phone. Can you please read it out so I can verify your account?",
    "If you don't provide the OTP, your balance will be frozen permanently."
  ];

  const box = document.getElementById("transcriptBox");
  box.innerHTML = "";
  const status = document.getElementById("callStatus");
  status.textContent = "Incoming Call: +91 9988X XXXXX";
  
  let i = 0;
  clearInterval(voiceDemoInterval);
  
  voiceDemoInterval = setInterval(() => {
    if (i < transcript.length) {
      addTranscriptLine(transcript[i]);
      i++;
    } else {
      clearInterval(voiceDemoInterval);
      status.textContent = "Call Ended. Analyzing transcript...";
      // Simulate final analysis result for the demo text
      setTimeout(async () => {
        const fullText = transcript.join(" ");
        await runAnalysis({ input_type: "text", content: fullText }, "Analyzing simulated call transcript...");
      }, 1000);
    }
  }, 2500);
}

function addTranscriptLine(text) {
  const box = document.getElementById("transcriptBox");
  const line = document.createElement("div");
  line.className = "line-scammer";
  line.innerHTML = `<span class="line-speaker">Scammer (Possible)</span> ${text}`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

/* =====================================================================
   ANALYZE FUNCTIONS
   ===================================================================== */
async function analyzeText() {
  const content = document.getElementById("textInput").value.trim();
  if (!content) {
    shakeInput("textInput");
    return;
  }
  await runAnalysis({ input_type: "text", content }, "Reading message and scanning for fraud patterns…");
}

async function analyzeUrl() {
  const content = document.getElementById("urlInput").value.trim();
  if (!content) {
    shakeInput("urlInput");
    return;
  }
  await runAnalysis({ input_type: "url", content }, "Inspecting URL structure and domain reputation…");
}

async function analyzeImage() {
  if (!selectedImageBase64) return;
  await runAnalysis(
    { input_type: "image", image_base64: selectedImageBase64 },
    "Reading text from screenshot with Groq Vision…"
  );
}

/* =====================================================================
   CORE API CALL
   ===================================================================== */
async function runAnalysis(payload, subtitle) {
  hideAll();
  showLoading(subtitle);

  try {
    const res = await fetch(`${API_BASE}/api/analyze`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Server error" }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }

    const data = await res.json();
    hideAll();

    if (!data.success) {
      showError(data.error || "Analysis returned an error.");
      return;
    }

    lastResult = data;
    renderResult(data);

  } catch (err) {
    hideAll();
    showError(err.message || "Could not reach the backend. Is it running?");
  }
}

/* =====================================================================
   RENDER RESULT
   ===================================================================== */
function renderResult(data) {
  const card        = document.getElementById("resultCard");
  const riskHeader  = document.getElementById("riskHeader");
  const riskNumber  = document.getElementById("riskNumber");
  const riskArc     = document.getElementById("riskArc");
  const riskBadge   = document.getElementById("riskBadge");
  const riskVerdict = document.getElementById("riskVerdict");
  const riskExpl    = document.getElementById("riskExplanation");
  const flagsList   = document.getElementById("redFlagsList");
  const chipsCont   = document.getElementById("keywordChips");
  const extBox      = document.getElementById("extractedTextBox");
  const extText     = document.getElementById("extractedText");

  const score = Math.max(0, Math.min(100, data.risk_score ?? 0));
  const level = (data.risk_level ?? "SAFE").toUpperCase();

  // Animate score number
  animateNumber(riskNumber, score, 900);

  // Arc progress (circumference = 2π×50 ≈ 314)
  const circ   = 314;
  const offset = circ - (score / 100) * circ;
  riskArc.style.transition = "none";
  riskArc.setAttribute("stroke-dashoffset", circ);
  // Force reflow
  void riskArc.getBoundingClientRect();
  riskArc.style.transition = "stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)";
  riskArc.setAttribute("stroke-dashoffset", offset);

  // Apply level class
  riskArc.className.baseVal = "";
  riskArc.classList.add(level);
  riskHeader.className = `risk-header ${level}`;
  riskBadge.className  = `risk-badge ${level}`;

  // Fill text
  riskBadge.textContent   = level;
  riskVerdict.textContent = data.verdict || "—";
  riskExpl.innerHTML = `${data.explanation || "—"}${data.provider ? `<br><span style="font-size:0.75rem; color:var(--indigo-light); font-weight:600; margin-top:8px; display:inline-block;">Analyzed by ${data.provider} AI</span>` : ""}`;

  // Red flags
  flagsList.innerHTML = "";
  const flags = Array.isArray(data.red_flags) ? data.red_flags : [];
  if (flags.length === 0) {
    flagsList.innerHTML = `<li style="color:var(--text-muted)">No specific red flags detected.</li>`;
  } else {
    flags.forEach(f => {
      const li = document.createElement("li");
      li.textContent = f;
      flagsList.appendChild(li);
    });
  }

  // Keywords
  chipsCont.innerHTML = "";
  const words = Array.isArray(data.flagged_words) ? data.flagged_words : [];
  if (words.length === 0) {
    chipsCont.innerHTML = `<span style="font-size:0.82rem;color:var(--text-muted)">None detected</span>`;
  } else {
    words.forEach(w => {
      const chip = document.createElement("span");
      chip.className   = "keyword-chip";
      chip.textContent = w;
      chipsCont.appendChild(chip);
    });
  }

  // Extracted text (images & voice)
  if (data.extracted_text) {
    extText.textContent = data.extracted_text;
    extBox.classList.remove("hidden");
    const titleEle = extBox.querySelector(".detail-header");
    if (data.input_type === "voice") {
      titleEle.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg> Call Transcript Analysis`;
    } else {
      titleEle.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="2" rx="1" fill="#6366f1" /><rect x="2" y="7" width="9" height="2" rx="1" fill="#6366f1" /><rect x="2" y="11" width="11" height="2" rx="1" fill="#6366f1" /></svg> Text Extracted from Screenshot`;
    }
  } else {
    extBox.classList.add("hidden");
  }

  card.classList.remove("hidden");

  // Scroll into view smoothly
  setTimeout(() => card.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
}

/* =====================================================================
   COPY REPORT
   ===================================================================== */
function copyReport() {
  if (!lastResult) return;
  const d = lastResult;
  const text = [
    `ScamShield AI Report`,
    `====================`,
    `Risk Score : ${d.risk_score}/100`,
    `Risk Level : ${d.risk_level}`,
    `Verdict    : ${d.verdict}`,
    ``,
    `Explanation:`,
    d.explanation,
    ``,
    `Red Flags:`,
    ...(d.red_flags || []).map(f => `  • ${f}`),
    ``,
    `Flagged Keywords: ${(d.flagged_words || []).join(", ") || "None"}`,
    d.extracted_text ? `\nExtracted Content:\n${d.extracted_text}` : "",
    ``,
    `Generated by ScamShield AI — ${new Date().toLocaleString()}`,
  ].join("\n");

  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector(".btn-copy");
    const orig = btn.innerHTML;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l3 3 7-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Copied!`;
    btn.style.color = "var(--safe)";
    setTimeout(() => { btn.innerHTML = orig; btn.style.color = ""; }, 2000);
  });
}

/* =====================================================================
   LOAD EXAMPLES
   ===================================================================== */
function loadExample(type, content) {
  switchTab(type);

  if (type === "text") {
    document.getElementById("textInput").value = content;
    document.getElementById("charCount").textContent = `${content.length} / 5000`;
    setTimeout(() => analyzeText(), 200);
  } else if (type === "url") {
    document.getElementById("urlInput").value = content;
    setTimeout(() => analyzeUrl(), 200);
  }
}

/* =====================================================================
   RESET
   ===================================================================== */
function resetAnalyzer() {
  document.getElementById("textInput").value = "";
  document.getElementById("urlInput").value  = "";
  document.getElementById("charCount").textContent = "0 / 5000";
  selectedImageBase64 = null;
  lastResult = null;

  // Reset image preview
  document.getElementById("dropPreview").classList.add("hidden");
  document.getElementById("imageInput").value = "";
  document.getElementById("analyzeImageBtn").disabled = true;

  // Reset Voice
  document.getElementById("transcriptBox").innerHTML = `<p class="transcript-placeholder">Start recording or run a demo call to see a live transcript...</p>`;
  document.getElementById("callStatus").textContent = "Awaiting incoming data...";
  clearInterval(voiceDemoInterval);

  hideAll();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* =====================================================================
   HELPERS
   ===================================================================== */
function hideAll() {
  document.getElementById("loadingCard").classList.add("hidden");
  document.getElementById("resultCard").classList.add("hidden");
  document.getElementById("errorCard").classList.add("hidden");
}

function showLoading(subtitle) {
  const card = document.getElementById("loadingCard");
  document.getElementById("loadingSubtitle").textContent = subtitle || "Analyzing…";
  card.classList.remove("hidden");
}

function showError(msg) {
  document.getElementById("errorMsg").textContent = msg;
  document.getElementById("errorCard").classList.remove("hidden");
}

function shakeInput(id) {
  const el = document.getElementById(id);
  el.style.transition = "transform 0.08s";
  const frames = ["-6px", "6px", "-4px", "4px", "0px"];
  let i = 0;
  const shake = () => {
    if (i >= frames.length) { el.style.transform = ""; return; }
    el.style.transform = `translateX(${frames[i++]})`;
    setTimeout(shake, 80);
  };
  shake();
  el.focus();
}

function animateNumber(el, target, duration) {
  const start = performance.now();
  const from  = parseInt(el.textContent) || 0;
  const update = (now) => {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
    el.textContent = Math.round(from + (target - from) * eased);
    if (t < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

/* =====================================================================
   KEYBOARD SHORTCUT — Ctrl+Enter to analyze
   ===================================================================== */
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    if (currentTab === "text")  analyzeText();
    if (currentTab === "url")   analyzeUrl();
    if (currentTab === "image") analyzeImage();
  }
});
