const STORAGE_STOCK = "inventory_stock";
const STORAGE_LOG = "inventory_logs";

const tableBody = document.getElementById("tableBody");
const notesList = document.getElementById("notesList");

const editBtn = document.getElementById("editBtn");
const scanBtn = document.getElementById("scanBtn");
const saveBtn = document.getElementById("saveBtn");
const cancelBtn = document.getElementById("cancelBtn");
const statusEl = document.getElementById("status");

// camera elements
const cameraModal = document.getElementById("cameraModal");
const closeCamera = document.getElementById("closeCamera");
const captureBtn = document.getElementById("captureBtn");
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const cameraStatus = document.getElementById("cameraStatus");

let stream = null;
let editMode = false;

// load stock
let stock = safeJson(localStorage.getItem(STORAGE_STOCK)) || [
  { rak:"2.1.1", nama:"PUSH IN FITTING QSL-1/8-8 FESTO", part:"ME-HYP-07623", jumlah:22, ket:"" },
  { rak:"2.1.2", nama:"PUSH IN T CONECTOR QST-6 FESTO", part:"ME-HYP-10215", jumlah:10, ket:"" },
  { rak:"", nama:"", part:"", jumlah:"", ket:"" },
];

let lastSaved = deepClone(stock);

/* ---------------- RENDER TABLE ---------------- */
function renderTable(){
  tableBody.innerHTML = "";

  stock.forEach((item, i) => {
    const tr = document.createElement("tr");
    tr.dataset.index = String(i);

    tr.appendChild(makeTd(item.rak, "rak", i, true));
    tr.appendChild(makeTd(item.nama, "nama", i, false));
    tr.appendChild(makeTd(item.part, "part", i, true));
    tr.appendChild(makeTd(item.jumlah, "jumlah", i, true));
    tr.appendChild(makeTd(item.ket, "ket", i, false));

    tableBody.appendChild(tr);
  });

  applyMode();
}

function makeTd(value, key, rowIndex, isCenter){
  const td = document.createElement("td");
  td.classList.add("cell");
  if (isCenter) td.classList.add("center");

  td.dataset.row = String(rowIndex);
  td.dataset.key = key;
  td.textContent = value ?? "";

  td.addEventListener("input", () => {
    if (!editMode) return;

    const r = Number(td.dataset.row);
    const k = td.dataset.key;

    let v = td.textContent;
    if (k === "jumlah") v = normalizeNumber(v);

    stock[r][k] = v;
  });

  return td;
}

function applyMode(){
  document.querySelectorAll("td.cell").forEach(td => {
    td.contentEditable = editMode ? "true" : "false";
    td.classList.toggle("edit", editMode);
    td.classList.toggle("view", !editMode);
  });

  editBtn.disabled = editMode;
  scanBtn.disabled = !editMode;
  saveBtn.disabled = !editMode;
  cancelBtn.disabled = !editMode;
}

/* ---------------- BUTTONS ---------------- */
editBtn.addEventListener("click", () => {
  editMode = true;
  applyMode();
  toast("EDIT ON", "ok");
});

saveBtn.addEventListener("click", () => {
  syncFromDom();
  localStorage.setItem(STORAGE_STOCK, JSON.stringify(stock));
  lastSaved = deepClone(stock);

  editMode = false;
  applyMode();
  toast("Saved ✓", "ok");
});

cancelBtn.addEventListener("click", () => {
  stock = deepClone(lastSaved);
  editMode = false;
  renderTable();
  toast("Canceled", "bad");
});

function syncFromDom(){
  const rows = document.querySelectorAll("#tableBody tr");
  rows.forEach((row, i) => {
    const cells = row.querySelectorAll("td");
    stock[i] = {
      rak: cells[0].textContent.trim(),
      nama: cells[1].textContent.trim(),
      part: cells[2].textContent.trim(),
      jumlah: normalizeNumber(cells[3].textContent.trim()),
      ket: cells[4].textContent.trim(),
    };
  });
}

function normalizeNumber(v){
  const t = String(v ?? "").trim();
  if (t === "") return "";
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : t;
}

/* ---------------- LOG (CATATAN) ---------------- */
function addLog(entry){
  const logs = safeJson(localStorage.getItem(STORAGE_LOG)) || [];
  logs.push({ ts: new Date().toISOString(), ...entry });
  localStorage.setItem(STORAGE_LOG, JSON.stringify(logs));
}

function renderLogs(){
  const logs = safeJson(localStorage.getItem(STORAGE_LOG)) || [];
  notesList.innerHTML = "";

  [...logs].reverse().forEach(log => {
    const div = document.createElement("div");
    div.classList.add("noteItem");

    if (log.type === "IN") div.classList.add("notePlus");
    if (log.type === "OUT") div.classList.add("noteMinus");

    const sign = log.type === "OUT" ? "(-)" : "(+)";
    div.textContent = `${sign} ${log.nama} - ${log.part} (${log.qty})`;
    notesList.appendChild(div);
  });
}

/* ---------------- CAMERA (SAMA SEPERTI LOGIN) ---------------- */
scanBtn.addEventListener("click", async () => {
  if (!editMode) {
    alert("Klik EDIT dulu sebelum scan");
    return;
  }

  // update stock dari DOM sebelum scan
  syncFromDom();

  cameraModal.style.display = "flex";
  cameraStatus.innerText = "Membuka kamera...";

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }   // back camera
    });

    video.srcObject = stream;

    video.onloadedmetadata = () => {
      video.play(); // FIX black video on many devices
      cameraStatus.innerText = "Arahkan kamera ke label (NO PART) lalu CAPTURE";
    };

  } catch (err) {
    alert("Kamera tidak bisa dibuka!");
    cameraStatus.innerText = "Kamera gagal dibuka";
    stopCamera();
    cameraModal.style.display = "none";
  }
});

/* capture & OCR */
captureBtn.addEventListener("click", async () => {
  if (!video.videoWidth) {
    cameraStatus.innerText = "Video belum siap. Tunggu sebentar...";
    return;
  }

  const ctx = canvas.getContext("2d");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0);

  cameraStatus.innerText = "OCR processing...";

  try {
    const { data: { text } } = await Tesseract.recognize(canvas, "eng");
    const cleaned = (text || "").replace(/\n/g, " ").toUpperCase();

    processScanByPrimaryKey(cleaned);

    stopCamera();
    cameraModal.style.display = "none";

  } catch (e) {
    cameraStatus.innerText = "OCR gagal";
    stopCamera();
    cameraModal.style.display = "none";
  }
});

/* close camera */
closeCamera.addEventListener("click", () => {
  stopCamera();
  cameraModal.style.display = "none";
});

function stopCamera(){
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
}

/* ---------------- SCAN PROCESS (PRIMARY KEY NO PART) ---------------- */
function processScanByPrimaryKey(ocrText){
  // remove highlight first
  document.querySelectorAll("#tableBody tr").forEach(tr => tr.classList.remove("highlight"));

  let totalAdded = 0;
  let bestIndex = -1;
  let bestCount = 0;

  stock.forEach((item, i) => {
    const pk = (item.part || "").toUpperCase().trim();
    if (!pk) return;

    const count = countOccurrences(ocrText, pk);
    if (count > 0) {
      const current = Number(item.jumlah || 0);
      stock[i].jumlah = current + count;

      addLog({
        type: "IN",
        nama: item.nama,
        part: item.part,
        qty: count,
        source: "SCAN"
      });

      totalAdded += count;

      if (count > bestCount) {
        bestCount = count;
        bestIndex = i;
      }
    }
  });

  if (totalAdded === 0) {
    alert("Part tidak ditemukan (NO PART tidak terdeteksi)");
    toast("Not found", "bad");
    return;
  }

  // save stock
  localStorage.setItem(STORAGE_STOCK, JSON.stringify(stock));
  lastSaved = deepClone(stock);

  renderTable();
  renderLogs();

  // highlight best match
  if (bestIndex >= 0) {
    const row = document.querySelector(`#tableBody tr[data-index="${bestIndex}"]`);
    if (row) row.classList.add("highlight");
  }

  toast(`IN +${totalAdded}`, "ok");
}

function countOccurrences(text, needle){
  if (!text || !needle) return 0;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escaped, "g");
  const matches = text.match(re);
  return matches ? matches.length : 0;
}

/* ---------------- Utils ---------------- */
function safeJson(raw){
  try { return JSON.parse(raw); } catch { return null; }
}
function deepClone(x){
  return JSON.parse(JSON.stringify(x));
}
let timer = null;
function toast(msg, kind){
  clearTimeout(timer);
  statusEl.textContent = msg;
  statusEl.className = `status ${kind || "muted"}`.trim();
  timer = setTimeout(() => {
    statusEl.textContent = "";
    statusEl.className = "status";
  }, 1600);
}

/* INIT */
renderTable();
renderLogs();