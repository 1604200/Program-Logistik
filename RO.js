/**
 * RO flow:
 * - Customer fills form -> SUBMIT (creates pending request)
 * - Admin view: read-only, only ACCEPT allowed
 * - ACCEPT: applies stock change (primary key = NO PART) and writes log (CATATAN) for Stock page
 *
 * Storage keys:
 * - inventory_stock  : array of stock rows {rak,nama,part,jumlah,ket}
 * - inventory_logs   : array of logs {ts,type,nama,part,qty,ref,byUser,email,keterangan}
 * - ro_queue_v1      : array of requests {id,ts,status,user,order,keterangan,email}
 * - activeUser       : (optional) from Login.js {role,nama,id}
 */

const STOCK_KEY = "inventory_stock";
const LOG_KEY = "inventory_logs";
const RO_QUEUE_KEY = "ro_queue_v1";

const userInput = document.getElementById("userInput");
const orderInput = document.getElementById("orderInput");
const ketInput = document.getElementById("ketInput");
const emailInput = document.getElementById("emailInput");

const acceptBtn = document.getElementById("acceptBtn");
const statusEl = document.getElementById("status");
const modeInfo = document.getElementById("modeInfo");

const form = document.getElementById("roForm");

const activeUser = safeJson(localStorage.getItem("activeUser"));
const isAdmin = (activeUser?.role || "").toUpperCase() === "ADMIN";

// init UI mode
initMode();

// load either pending (for admin) or blank (for customer)
if (isAdmin) loadNextPendingToForm();
else loadDraftFromLocal();

// button behavior differs by role
acceptBtn.addEventListener("click", () => {
  if (isAdmin) adminAccept();
  else customerSubmit();
});

/* ---------------- Mode setup ---------------- */
function initMode(){
  if (isAdmin){
    modeInfo.textContent = "Mode: ADMIN (Read-only). Klik ACCEPT untuk memproses request pending.";
    setReadOnly(true);
    acceptBtn.textContent = "ACCEPT";
  } else {
    modeInfo.textContent = "Mode: CUSTOMER. Isi form lalu klik ACCEPT untuk mengirim request (pending).";
    setReadOnly(false);
    acceptBtn.textContent = "ACCEPT";
  }
}

function setReadOnly(flag){
  const fields = [userInput, orderInput, ketInput, emailInput];
  fields.forEach(el => {
    el.readOnly = !!flag;
    el.classList.toggle("readonly", !!flag);
  });
}

/* ---------------- Customer: submit request (pending) ---------------- */
function customerSubmit(){
  const payload = {
    id: makeId(),
    ts: new Date().toISOString(),
    status: "PENDING",
    user: userInput.value.trim(),
    order: orderInput.value.trim(),
    keterangan: ketInput.value.trim(),
    email: emailInput.value.trim()
  };

  if (!payload.user || !payload.order){
    toast("User dan Order/Request wajib diisi.", "bad");
    return;
  }

  const q = loadQueue();
  q.push(payload);
  saveQueue(q);

  // optional draft clear
  localStorage.removeItem("ro_draft_v1");

  toast("Request terkirim (PENDING). Admin akan ACCEPT.", "ok");

  // clear form
  userInput.value = "";
  orderInput.value = "";
  ketInput.value = "";
  emailInput.value = "";
}

/* ---------------- Admin: accept pending request ---------------- */
function adminAccept(){
  const q = loadQueue();
  const idx = q.findIndex(x => x.status === "PENDING");
  if (idx === -1){
    toast("Tidak ada request PENDING.", "bad");
    return;
  }

  const req = q[idx];

  // parse: determine type + nopart + qty
  const parsed = parseOrder(req.order);

  if (!parsed.noPart){
    toast("NO PART tidak terdeteksi dari Order/Request.", "bad");
    return;
  }

  const stock = loadStock();
  const sIdx = findStockByNoPart(stock, parsed.noPart);

  if (sIdx === -1){
    toast("NO PART tidak ada di Stock. Tambahkan dulu di Stock.", "bad");
    return;
  }

  const before = Number(stock[sIdx].jumlah || 0);
  const qty = Math.max(1, Number(parsed.qty || 1));

  // OUT = checkout -> decrease, IN = incoming -> increase
  const type = parsed.type; // "OUT" or "IN"
  const after = type === "OUT" ? (before - qty) : (before + qty);

  stock[sIdx].jumlah = after;

  // Save stock
  localStorage.setItem(STOCK_KEY, JSON.stringify(stock));

  // Write log for Stock CATATAN (like mbanking)
  addLog({
    type,
    nama: stock[sIdx].nama,
    part: stock[sIdx].part,
    qty,
    ref: req.id,
    byUser: req.user,
    email: req.email,
    keterangan: req.keterangan
  });

  // Mark accepted
  q[idx].status = "ACCEPTED";
  q[idx].acceptedAt = new Date().toISOString();
  q[idx].acceptedBy = activeUser?.nama || "ADMIN";
  saveQueue(q);

  toast(`ACCEPT OK. Stock ${type === "OUT" ? "berkurang" : "bertambah"} (${qty}).`, "ok");

  // load next pending
  loadNextPendingToForm();
}

/* ---------------- Load next pending for admin ---------------- */
function loadNextPendingToForm(){
  const q = loadQueue();
  const next = q.find(x => x.status === "PENDING");

  if (!next){
    userInput.value = "";
    orderInput.value = "";
    ketInput.value = "";
    emailInput.value = "";
    acceptBtn.disabled = true;
    toast("Queue kosong (tidak ada PENDING).", "muted");
    return;
  }

  acceptBtn.disabled = false;

  userInput.value = next.user || "";
  orderInput.value = next.order || "";
  ketInput.value = next.keterangan || "";
  emailInput.value = next.email || "";

  toast(`Loaded PENDING: ${next.id}`, "muted");
}

/* ---------------- Customer draft (optional) ---------------- */
function loadDraftFromLocal(){
  const draft = safeJson(localStorage.getItem("ro_draft_v1"));
  if (!draft) return;

  userInput.value = draft.user || "";
  orderInput.value = draft.order || "";
  ketInput.value = draft.keterangan || "";
  emailInput.value = draft.email || "";
}

form.addEventListener("input", () => {
  if (isAdmin) return;
  const draft = {
    user: userInput.value,
    order: orderInput.value,
    keterangan: ketInput.value,
    email: emailInput.value
  };
  localStorage.setItem("ro_draft_v1", JSON.stringify(draft));
});

/* ---------------- Parsing logic ----------------
   Primary key = NO PART.
   - detect NO PART pattern like ME-HYP-07623 (letters/numbers/-)
   - detect qty by:
     x2, X2, qty 2, 2pcs, pcs 2
   - detect type:
     if contains "IN" or "+" => IN
     else OUT
------------------------------------------------- */
function parseOrder(orderStr){
  const raw = String(orderStr || "").trim();
  const up = raw.toUpperCase();

  // type
  const type = (up.includes(" IN ") || up.startsWith("IN ") || up.includes("+")) ? "IN" : "OUT";

  // NO PART: find something like ABC-DEF-12345 (allow digits/letters and hyphen)
  // pick the first "token" containing at least one digit and one letter OR has hyphen
  const tokens = up.split(/[\s,;]+/).filter(Boolean);

  let noPart = "";
  for (const t of tokens){
    const tok = t.replace(/[^A-Z0-9-]/g, "");
    if (!tok) continue;

    const hasHyphen = tok.includes("-");
    const hasDigit = /\d/.test(tok);
    const hasLetter = /[A-Z]/.test(tok);

    // typical no-part has digit and letter and often hyphen
    if ((hasDigit && hasLetter && (hasHyphen || tok.length >= 6))) {
      noPart = tok;
      break;
    }
  }

  // qty
  let qty = 1;

  // x2 / X2
  const m1 = up.match(/(?:\bX\s*|x\s*)(\d{1,6})\b/);
  if (m1) qty = Number(m1[1]);

  // qty 2
  const m2 = up.match(/\bQTY\s*(\d{1,6})\b/);
  if (!m1 && m2) qty = Number(m2[1]);

  // 2pcs / 2 PCS
  const m3 = up.match(/\b(\d{1,6})\s*PCS\b/);
  if (!m1 && !m2 && m3) qty = Number(m3[1]);

  // pcs 2
  const m4 = up.match(/\bPCS\s*(\d{1,6})\b/);
  if (!m1 && !m2 && !m3 && m4) qty = Number(m4[1]);

  // plain trailing number fallback: "... 2"
  const m5 = up.match(/\b(\d{1,6})\b(?!.*\b\d{1,6}\b)/);
  if (!m1 && !m2 && !m3 && !m4 && m5) qty = Number(m5[1]);

  if (!Number.isFinite(qty) || qty <= 0) qty = 1;

  return { type, noPart, qty };
}

/* ---------------- Stock helpers ---------------- */
function loadStock(){
  const s = safeJson(localStorage.getItem(STOCK_KEY));
  return Array.isArray(s) ? s : [];
}

function findStockByNoPart(stock, noPart){
  const key = normalize(noPart);
  return stock.findIndex(r => normalize(r.part) === key);
}

/* ---------------- Logs (CATATAN for Stock) ---------------- */
function addLog(entry){
  const logs = safeJson(localStorage.getItem(LOG_KEY)) || [];
  logs.push({
    ts: new Date().toISOString(),
    ...entry
  });
  localStorage.setItem(LOG_KEY, JSON.stringify(logs));
}

/* ---------------- Queue helpers ---------------- */
function loadQueue(){
  const q = safeJson(localStorage.getItem(RO_QUEUE_KEY));
  return Array.isArray(q) ? q : [];
}

function saveQueue(q){
  localStorage.setItem(RO_QUEUE_KEY, JSON.stringify(q));
}

/* ---------------- Utils ---------------- */
function normalize(s){
  return String(s ?? "").toUpperCase().replace(/\s+/g, " ").trim();
}

function safeJson(raw){
  try{ return JSON.parse(raw); } catch { return null; }
}

function makeId(){
  return "RO-" + Math.random().toString(16).slice(2,8).toUpperCase() + "-" + Date.now().toString().slice(-6);
}

let timer = null;
function toast(msg, kind){
  clearTimeout(timer);
  statusEl.textContent = msg;

  statusEl.style.color =
    kind === "ok" ? "#0aa84f"
    : kind === "bad" ? "#d92b2b"
    : "#6c737f";

  timer = setTimeout(() => statusEl.textContent = "", 2200);
}