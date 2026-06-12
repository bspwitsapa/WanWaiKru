// ===================================
//  script.js — ครูในดวงใจ สายไหนกันนะ
//  อ่านครูจาก Firebase Firestore
//  บันทึกโหวตไป Google Sheets ผ่าน Apps Script
// ===================================

import { db } from "./firebase-config.js";
import {
  collection, getDocs, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ============================================================
//  📋 ตั้งค่า Google Apps Script URL
//  วิธีตั้งค่า:
//  1. เปิด Google Sheets ใหม่
//  2. ไปที่ Extensions > Apps Script
//  3. วางโค้ด Code.gs แล้ว Deploy > New Deployment
//     (Type: Web App, Execute as: Me, Access: Anyone)
//  4. คัดลอก URL มาวางที่นี่
// ============================================================
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwjzPynl6iv3VnGAThlbiKle3iURgsJ5Gv6STlKZCxgPfybLJf7iyQ_qw3RI8oLlYs/exec";
//                        ↑ แก้ตรงนี้ด้วย URL จริงของคุณ

// ============================================================
//  STATE
// ============================================================
let allTeachers     = [];
let selectedGroup   = "";
let selectedTeacher = null;
let selectedOpt     = null;   // { opt: "1", label: "สายคอนเทนต์" }

// ============================================================
//  DEVICE ID (แยกจากระบบโหวตครูในดวงใจ)
// ============================================================
function getDeviceId() {
  const KEY = "style_device_id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}
const DEVICE_ID = getDeviceId();

// ============================================================
//  VOTE GUARD — 1 อุปกรณ์ / 1 ครู รวมทั้งหมด (global lock)
//  แยก localStorage key จากระบบโหวตครูในดวงใจโดยสิ้นเชิง
//  โหวตครูคนใดคนหนึ่งแล้ว → ปิดทุกครูที่เหลือทันที
// ============================================================
function hasVotedStyleAny() {
  return !!localStorage.getItem("stylevote_done");
}
function getVotedTeacherId() {
  return localStorage.getItem("stylevote_teacher_id") || null;
}
function markVotedGlobal(teacherId) {
  localStorage.setItem("stylevote_done",       "1");
  localStorage.setItem("stylevote_teacher_id", teacherId);
}

// ============================================================
//  STEP NAVIGATION
// ============================================================
const STEPS = ["subjects", "teachers", "voting", "thankyou"];

function goTo(stepName) {
  STEPS.forEach(s => {
    document.getElementById(`step-${s}`)?.classList.remove("active");
  });
  document.getElementById(`step-${stepName}`)?.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
  updateNav(stepName);
}

function updateNav(stepName) {
  const idx = STEPS.indexOf(stepName) + 1;          // 1-based
  for (let i = 1; i <= 4; i++) {
    const dot  = document.getElementById(`nav-${i}`);
    const line = document.getElementById(`line-${i}`);
    if (!dot) continue;
    dot.classList.remove("active", "done");
    if (i < idx)       dot.classList.add("done");
    else if (i === idx) dot.classList.add("active");
    if (line) line.classList.toggle("done", i < idx);
  }
}

// ============================================================
//  INIT — โหลดครูจาก Firestore
// ============================================================
async function init() {
  try {
    const snap = await getDocs(
      query(collection(db, "teachers"), orderBy("name"))
    );
    allTeachers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("Load error:", err);
    showToast("❌ โหลดข้อมูลครูไม่สำเร็จ กรุณารีเฟรช");
  }
}

// ============================================================
//  STEP 1 — เลือกกลุ่มสาระ
// ============================================================
document.querySelectorAll(".group-card").forEach(btn => {
  btn.addEventListener("click", () => {
    selectedGroup = btn.dataset.group;
    const short = selectedGroup
      .replace("กลุ่มสาระการเรียนรู้วิชา", "")
      .replace("กลุ่มสาระการเรียนรู้", "");
    document.getElementById("group-title").textContent = `เลือกคุณครู — ${short}`;
    renderTeachers(selectedGroup);
    goTo("teachers");
  });
});

document.getElementById("back-to-subjects")?.addEventListener("click", () => goTo("subjects"));

// ============================================================
//  STEP 2 — แสดงรายชื่อครู
// ============================================================
function renderTeachers(group) {
  const container   = document.getElementById("teachers-container");
  const emptyEl     = document.getElementById("teachers-empty");
  container.innerHTML = "";

  const list = allTeachers.filter(t => t.subjectGroup === group);
  if (list.length === 0) {
    emptyEl.classList.remove("hidden");
    return;
  }
  emptyEl.classList.add("hidden");

  const globalVoted    = hasVotedStyleAny();
  const votedTeacherId = getVotedTeacherId();

  list.forEach(teacher => {
    const isMyVote  = globalVoted && teacher.id === votedTeacherId;
    const isLocked  = globalVoted && teacher.id !== votedTeacherId;
    const card      = document.createElement("div");

    card.className = "vt-teacher-card"
      + (isMyVote ? " my-vote-card" : "")
      + (isLocked ? " already-voted" : "");

    const photoEl = teacher.photoURL
      ? `<div class="vt-teacher-photo"><img src="${esc(teacher.photoURL)}" alt="${esc(teacher.name)}"></div>`
      : `<div class="vt-teacher-photo">👩‍🏫</div>`;

    let badge = "";
    if (isMyVote) {
      badge = `<span class="vt-voted-badge" style="background:#dcfce7;color:#15803d;">✅ คุณโหวตครูท่านนี้แล้ว</span>`;
    } else if (isLocked) {
      badge = `<span class="vt-voted-badge" style="background:#f5f5f5;color:#aaa;">🔒 ปิดรับโหวต</span>`;
    } else {
      badge = `<span class="vt-voted-badge" style="background:var(--pink-50);color:var(--pink-500);">แตะเพื่อโหวตสาย</span>`;
    }

    card.innerHTML = `
      ${photoEl}
      <div class="vt-teacher-info">
        <div class="vt-teacher-name">${esc(teacher.name || "")}</div>
        <div class="vt-teacher-subject">✏️ ${esc(teacher.subject || "")}</div>
        ${badge}
      </div>
    `;

    // เฉพาะที่ยังไม่ได้ล็อค (ยังไม่เคยโหวตเลย)
    if (!globalVoted) {
      card.addEventListener("click", () => {
        selectedTeacher = teacher;
        openVotingStep(teacher);
      });
    }

    container.appendChild(card);
  });
}

document.getElementById("back-to-teachers")?.addEventListener("click", () => {
  selectedOpt = null;
  goTo("teachers");
});

// ============================================================
//  STEP 3 — โหวตสาย
// ============================================================
function openVotingStep(teacher) {
  // ใส่รูปและข้อมูล
  const photoEl = document.getElementById("sel-photo");
  if (teacher.photoURL) {
    photoEl.innerHTML = `<img src="${esc(teacher.photoURL)}" alt="${esc(teacher.name)}">`;
  } else {
    photoEl.textContent = "👩‍🏫";
  }
  document.getElementById("sel-name").textContent    = teacher.name    || "";
  document.getElementById("sel-subject").textContent = `✏️ ${teacher.subject || ""}`;
  document.getElementById("sel-group").textContent   = teacher.subjectGroup || "";

  // reset
  selectedOpt = null;
  document.querySelectorAll(".vt-style-btn").forEach(b => b.classList.remove("selected"));
  document.getElementById("submit-vote").disabled = true;

  // ตรวจโหวตแล้ว (global lock)
  const voted  = hasVotedStyleAny();
  const notice = document.getElementById("already-notice");
  const grid   = document.getElementById("style-grid");
  notice.style.display      = voted ? "block"  : "none";
  grid.style.pointerEvents  = voted ? "none"   : "auto";
  grid.style.opacity        = voted ? "0.5"    : "1";
  document.getElementById("submit-vote").disabled = voted;

  goTo("voting");
}

// เลือกสาย
document.querySelectorAll(".vt-style-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".vt-style-btn").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedOpt = { opt: btn.dataset.opt, label: btn.dataset.label };
    document.getElementById("submit-vote").disabled = false;
  });
});

// ============================================================
//  ส่งโหวต → Google Sheets
// ============================================================
document.getElementById("submit-vote")?.addEventListener("click", async () => {
  if (!selectedTeacher || !selectedOpt) return;
  if (hasVotedStyleAny()) {
    showToast("⚠️ คุณได้โหวตสายไปแล้ว ไม่สามารถโหวตซ้ำได้");
    return;
  }

  const btn = document.getElementById("submit-vote");
  btn.disabled = true;
  btn.textContent = "กำลังบันทึก...";

  const payload = {
    timestamp:    new Date().toISOString(),
    teacherName:  selectedTeacher.name         || "",
    teacherSubject: selectedTeacher.subject    || "",
    subjectGroup: selectedTeacher.subjectGroup || "",
    styleOption:  selectedOpt.opt,
    styleName:    selectedOpt.label,
    deviceId:     DEVICE_ID,
  };

  try {
    // บันทึก localStorage ก่อน (optimistic) — global lock ทันที
    markVotedGlobal(selectedTeacher.id);

    // ส่งข้อมูลไป Google Apps Script
    await fetch(APPS_SCRIPT_URL, {
      method:  "POST",
      mode:    "no-cors",         // Google Apps Script ต้องใช้ no-cors
      headers: { "Content-Type": "text/plain" },
      body:    JSON.stringify(payload),
    });

    showThankyou();

  } catch (err) {
    console.error("Vote error:", err);
    // ถ้า error ให้คืน localStorage (ยกเว้น network error ที่ข้อมูลอาจถึงแล้ว)
    showToast("⚠️ ส่งโหวตแล้ว แต่ไม่สามารถยืนยันได้ ลองรีเฟรชหน้า");
    showThankyou();   // แสดงขอบคุณอยู่ดี (ข้อมูลน่าจะถึง Sheets แล้ว)
  }
});

// ============================================================
//  STEP 4 — ขอบคุณ (หลังโหวตสำเร็จในเซสชันนี้)
// ============================================================
function showThankyou() {
  document.getElementById("ty-name").textContent    = selectedTeacher?.name    || "";
  document.getElementById("ty-subject").textContent = selectedTeacher?.subject || "";
  document.getElementById("ty-style").textContent   = selectedOpt?.label       || "";
  goTo("thankyou");
}

// แสดงหน้า "โหวตแล้ว" เมื่อเปิดหน้ามาใหม่โดยเคยโหวตไปแล้ว
function showAlreadyVoted() {
  document.getElementById("ty-name").textContent    = "คุณเคยโหวตไปแล้ว";
  document.getElementById("ty-subject").textContent = "ระบบบันทึกเรียบร้อยแล้ว ✅";
  document.getElementById("ty-style").textContent   = "🔒 1 อุปกรณ์ / 1 ครู เท่านั้น";
  goTo("thankyou");
}

// ============================================================
//  TOAST
// ============================================================
let toastTimer;
function showToast(msg) {
  const el = document.getElementById("toast");
  document.getElementById("toast-msg").textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3500);
}

// ============================================================
//  UTIL
// ============================================================
function esc(str) {
  const d = document.createElement("div");
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}

// ---- Start ----
init().then(() => {
  // ถ้าเคยโหวตแล้ว → ข้ามไปหน้าขอบคุณทันที ไม่ให้กลับไปโหวตได้
  if (hasVotedStyleAny()) {
    showAlreadyVoted();
  }
});
