document.addEventListener("DOMContentLoaded", function(){

    const name = localStorage.getItem("verifiedName");
    const id = localStorage.getItem("verifiedId");

    if(!name || !id){
        window.location.replace("Login.html");
        return;
    }

    document.getElementById("userName").innerText = "Nama : " + name;
    document.getElementById("userId").innerText = "No ID : " + id;

    document.getElementById("adminName").innerText = name;
    document.getElementById("adminId").innerText = id;

    if(!localStorage.getItem("aksesMasuk")){
        const now = new Date();
        const time = now.toLocaleString("id-ID");
        localStorage.setItem("aksesMasuk", time);
    }

    document.getElementById("loginTime").innerText =
        localStorage.getItem("aksesMasuk");
});

function toggleAdmin(){
    const panel = document.getElementById("adminPanel");
    const btn = document.querySelector(".admin-toggle");

    panel.classList.toggle("active");
    btn.innerHTML = panel.classList.contains("active") ? "❮" : "❯";
}

function openMenu(menu){

    if(menu === "stock"){
        window.location.href = "Stock.html";
    }
    else if(menu === "regent"){
        alert("REGENT ORDERS belum tersedia.");
    }
    else if(menu === "client"){
        alert("CLIENT belum tersedia.");
    }
}

function logout(){
    localStorage.clear();
    window.location.replace("Login.html");
}