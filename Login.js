const users = [
    { role: "ADMIN", nama: "SUTRISNO", id: "16663" },
    { role: "ADMIN", nama: "MOH SOFYAN", id: "59549" },
    { role: "ADMIN", nama: "JONI HARIYONO", id: "17019" },
    { role: "ADMIN", nama: "ARIMARK TV", id: "47994" },
    { role: "ADMIN", nama: "SUKIRNO", id: "17221" },
    { role: "ADMIN", nama: "AAT SOLIHAT", id: "17341" },
    { role: "ADMIN", nama: "GUNAWAN", id: "17192" },
    { role: "ADMIN", nama: "SYAIFUL BAHRI", id: "19679" },
    { role: "ADMIN", nama: "AGUS SANTOSO", id: "36235" },
    { role: "ADMIN", nama: "AKHMAD SOBIR", id: "37031" },
    { role: "ADMIN", nama: "VIRGINIA REGITA SARI", id: "PKL 25" }
];

const idInput = document.getElementById("idInput");
const idText = document.getElementById("idText");
const statusText = document.getElementById("status");
const scanBtn = document.getElementById("scanBtn");
const nextBtn = document.getElementById("nextBtn");
const cameraModal = document.getElementById("cameraModal");
const closeCamera = document.getElementById("closeCamera");
const captureBtn = document.getElementById("captureBtn");
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");

let stream;

/* 🔹 Buka kamera selfie */
scanBtn.addEventListener("click", async () => {
    cameraModal.style.display = "block";

    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" }
        });

        video.srcObject = stream;

    } catch (err) {
        alert("Kamera tidak bisa dibuka!");
    }
});

/* 🔹 Capture & OCR */
captureBtn.addEventListener("click", () => {

    const ctx = canvas.getContext("2d");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    Tesseract.recognize(canvas, "eng")
    .then(({ data: { text } }) => {

        let cleanedText = text.replace(/\n/g, " ").toUpperCase();

        let foundUser = users.find(user =>
            cleanedText.includes(user.id) ||
            cleanedText.includes(user.nama)
        );

        if (foundUser) {
            idInput.value = foundUser.id;
            idText.innerText = foundUser.id;
            statusText.innerText = "ID Terdeteksi ✔";
            statusText.style.color = "green";
        } else {
            statusText.innerText = "ID Tidak Dikenali ❌";
            statusText.style.color = "red";
        }

        stopCamera();
        cameraModal.style.display = "none";

    });
});

/* 🔹 Tutup kamera */
closeCamera.addEventListener("click", () => {
    stopCamera();
    cameraModal.style.display = "none";
});

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
}

/* 🔹 NEXT LOGIN */
nextBtn.addEventListener("click", () => {

    let inputID = idInput.value.trim();
    let userFound = users.find(u => u.id === inputID);

    if (userFound) {

        statusText.innerText = "Login Berhasil ✔";
        statusText.style.color = "green";

        localStorage.setItem("activeUser", JSON.stringify(userFound));

        setTimeout(() => {
            // Setelah ID & Nama valid
            localStorage.setItem("verifiedName", user.name);
            localStorage.setItem("verifiedId", user.id);
            // langsung ke dashboard
            window.location.href = "Index.html";
        }, 1000);

    } else {

        statusText.innerText = "ID Tidak Terdaftar ❌";
        statusText.style.color = "red";
    }
});