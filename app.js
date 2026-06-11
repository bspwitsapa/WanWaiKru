// ===================================
//  app.js — หน้าโหวตครูในดวงใจ
//  ระบบโหวต: 1 อุปกรณ์ = 1 ครู เท่านั้น
// ===================================

import { db } from "./firebase-config.js";
import {
  collection, onSnapshot, doc,
  updateDoc, increment, getDoc, setDoc,
  query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ---- DOM refs ----
const teachersGrid    = document.getElementById("teachersGrid");
const searchInput     = document.getElementById("searchInput");
const subjectFilters  = document.getElementById("subjectFilters");
const countTag        = document.getElementById("countTag");
const totalTeachersEl = document.getElementById("totalTeachers");
const totalVotesEl    = document.getElementById("totalVotes");
const emptyState      = document.getElementById("emptyState");

// Modal
const voteModal           = document.getElementById("voteModal");
const modalTeacherImg     = document.getElementById("modalTeacherImg");
const modalTeacherName    = document.getElementById("modalTeacherName");
const modalTeacherSubject = document.getElementById("modalTeacherSubject");
const cancelVoteBtn       = document.getElementById("cancelVote");
const confirmVoteBtn      = document.getElementById("confirmVote");

// Toast
const toast    = document.getElementById("toast");
const toastMsg = document.getElementById("toastMsg");

// ---- State ----
let allTeachers      = [];
let filteredTeachers = [];
let currentFilter    = "all";
let pendingVoteId    = null;
let maxVotes         = 1;
let deviceId         = null;
let myVoteData       = null; // { votedTeacherId, votedAt } หรือ null

// ====================================================
//  DEVICE FINGERPRINT
//  สร้าง ID ที่เป็นเอกลักษณ์ต่ออุปกรณ์ + browser
//  เก็บใน localStorage ตรวจสอบกับ Firestore
// ====================================================
function getOrCreateDeviceId() {
  const KEY = "wai_kru_device_id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    const rand   = Math.random().toString(36).slice(2);
    const ts     = Date.now().toString(36);
    const uaHash = simpleHash(navigator.userAgent + navigator.language + screen.width);
    id = `${uaHash}-${ts}-${rand}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

// ====================================================
//  VOTE STATE
//  โหลดจาก Firestore votes/{deviceId}
//  fallback: localStorage
// ====================================================
async function loadMyVote() {
  try {
    const snap = await getDoc(doc(db, "votes", deviceId));
    myVoteData = snap.exists() ? snap.data() : null;
  } catch (err) {
    console.warn("Cannot load vote from Firestore, using localStorage:", err);
    const local = localStorage.getItem("wai_kru_voted");
    myVoteData  = local ? { votedTeacherId: local } : null;
  }
}

function hasVotedFor(teacherId) {
  return myVoteData?.votedTeacherId === teacherId;
}

function hasVotedAny() {
  return !!myVoteData?.votedTeacherId;
}

// ====================================================
//  INIT — โหลด deviceId และ vote state ก่อน render
// ====================================================
(async () => {
  deviceId = getOrCreateDeviceId();
  await loadMyVote();

  const q = query(collection(db, "teachers"), orderBy("votes", "desc"));
  onSnapshot(q, (snapshot) => {
    allTeachers = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    maxVotes    = Math.max(1, ...allTeachers.map(t => t.votes || 0));

    const totalVotes = allTeachers.reduce((s, t) => s + (t.votes || 0), 0);
    totalTeachersEl.textContent = allTeachers.length;
    totalVotesEl.textContent    = totalVotes.toLocaleString();

    buildFilters(allTeachers);
    applyFilterAndSearch();
  });
})();

// ---- Build subject filter buttons ----
function buildFilters(teachers) {
  const existing = new Set(
    [...subjectFilters.querySelectorAll(".filter-btn[data-filter]")]
      .map(b => b.dataset.filter)
      .filter(v => v !== "all")
  );
  const subjects = [...new Set(teachers.map(t => t.subject).filter(Boolean))];
  subjects.forEach(subject => {
    if (!existing.has(subject)) {
      const btn = document.createElement("button");
      btn.className      = "filter-btn";
      btn.dataset.filter = subject;
      btn.textContent    = subject;
      btn.addEventListener("click", () => setFilter(subject));
      subjectFilters.appendChild(btn);
    }
  });
}

// ---- Filter + Search ----
function applyFilterAndSearch() {
  const searchVal = searchInput.value.trim().toLowerCase();

  filteredTeachers = allTeachers.filter(t => {
    const matchFilter = currentFilter === "all" || t.subject === currentFilter;
    const matchSearch = !searchVal ||
      (t.name    || "").toLowerCase().includes(searchVal) ||
      (t.subject || "").toLowerCase().includes(searchVal) ||
      (t.bio     || "").toLowerCase().includes(searchVal);
    return matchFilter && matchSearch;
  });

  countTag.textContent = `${filteredTeachers.length} คน`;
  renderTeachers(filteredTeachers);
}

function setFilter(filter) {
  currentFilter = filter;
  subjectFilters.querySelectorAll(".filter-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.filter === filter);
  });
  applyFilterAndSearch();
}

searchInput.addEventListener("input", applyFilterAndSearch);
subjectFilters.querySelector(".filter-btn").addEventListener("click", () => setFilter("all"));

// ---- Render Teacher Cards ----
function renderTeachers(teachers) {
  teachersGrid.innerHTML = "";
  emptyState.classList.toggle("hidden", teachers.length > 0);
  teachers.forEach((teacher, index) => {
    teachersGrid.appendChild(createCard(teacher, index + 1));
  });
}

function createCard(teacher, rank) {
  const card     = document.createElement("div");
  card.className = "teacher-card";

  const votes     = teacher.votes || 0;
  const pct       = Math.round((votes / maxVotes) * 100);
  const rankEmoji = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;

  const iVotedThis = hasVotedFor(teacher.id);
  const iVotedAny  = hasVotedAny();
  const isDisabled = iVotedThis || iVotedAny;

  let btnText  = "💗 โหวตเลย!";
  let btnClass = "btn-vote";
  if (iVotedThis) {
    btnText  = "✅ คุณโหวตครูนี้แล้ว";
    btnClass = "btn-vote voted voted-mine";
  } else if (iVotedAny) {
    btnText  = "🔒 โหวตแล้ว (1 ครั้ง/อุปกรณ์)";
    btnClass = "btn-vote voted";
  }

  const photoHTML = teacher.photoURL
    ? `<img class="card-photo" src="${teacher.photoURL}" alt="${escHtml(teacher.name)}" loading="lazy">`
    : `<div class="card-photo-placeholder">👩‍🏫</div>`;

  card.innerHTML = `
    <div class="card-photo-wrap">
      ${photoHTML}
      <div class="card-rank-badge">${rankEmoji}</div>
      <div class="card-vote-badge">💗 ${votes.toLocaleString()}</div>
    </div>
    <div class="card-body">
      <h3 class="card-name">${escHtml(teacher.name || "")}</h3>
      <span class="card-subject">📚 ${escHtml(teacher.subject || "")}</span>
      <p class="card-bio">${escHtml(teacher.bio || "")}</p>
    </div>
    <div class="vote-bar-wrap">
      <div class="vote-bar">
        <div class="vote-bar-fill" style="width:${pct}%"></div>
      </div>
    </div>
    <div class="card-footer">
      <button class="${btnClass}" data-id="${teacher.id}" ${isDisabled ? "disabled" : ""}>
        ${btnText}
      </button>
    </div>
  `;

  if (!isDisabled) {
    card.querySelector(".btn-vote").addEventListener("click", (e) => {
      e.stopPropagation();
      openVoteModal(teacher);
    });
  }

  return card;
}

// ---- Vote Modal ----
function openVoteModal(teacher) {
  pendingVoteId = teacher.id;
  modalTeacherImg.innerHTML = teacher.photoURL
    ? `<img src="${teacher.photoURL}" alt="${escHtml(teacher.name)}">`
    : `👩‍🏫`;
  modalTeacherName.textContent    = teacher.name    || "";
  modalTeacherSubject.textContent = teacher.subject || "";
  voteModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeVoteModal() {
  voteModal.classList.add("hidden");
  document.body.style.overflow = "";
  pendingVoteId = null;
}

cancelVoteBtn.addEventListener("click", closeVoteModal);
voteModal.addEventListener("click", (e) => {
  if (e.target === voteModal) closeVoteModal();
});

// ---- Confirm Vote ----
confirmVoteBtn.addEventListener("click", async () => {
  if (!pendingVoteId) return;

  // ตรวจซ้ำก่อน confirm ป้องกัน race condition
  if (hasVotedAny()) {
    closeVoteModal();
    showToast("⚠️ คุณได้โหวตไปแล้ว 1 ครั้งต่ออุปกรณ์");
    return;
  }

  const id = pendingVoteId;
  closeVoteModal();
  confirmVoteBtn.disabled = true;

  try {
    // 1. บันทึก vote record ลง Firestore votes/{deviceId}
    await setDoc(doc(db, "votes", deviceId), {
      votedTeacherId: id,
      votedAt:        new Date().toISOString(),
      deviceId:       deviceId
    });

    // 2. เพิ่มคะแนนครู
    await updateDoc(doc(db, "teachers", id), {
      votes: increment(1)
    });

    // 3. อัปเดต local state + localStorage fallback
    myVoteData = { votedTeacherId: id };
    localStorage.setItem("wai_kru_voted", id);

    showToast("💗 โหวตสำเร็จแล้ว! ขอบคุณที่แสดงความรักต่อคุณครู");
    applyFilterAndSearch();

  } catch (err) {
    console.error("Vote error:", err);
    showToast("❌ เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
  } finally {
    confirmVoteBtn.disabled = false;
  }
});

// ---- Toast ----
let toastTimer;
function showToast(msg) {
  toastMsg.textContent = msg;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 3200);
}

// ---- Util ----
function escHtml(str) {
  const d = document.createElement("div");
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}