// ===================================
//  admin.js — แผงควบคุม Admin
//  ใช้ Cloudinary สำหรับอัปโหลดรูป
// ===================================

import { db } from "../firebase-config.js";
import {
  collection, addDoc, onSnapshot,
  doc, deleteDoc, updateDoc,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


// ---- Cloudinary Config ----
const CLOUDINARY_CLOUD = "dvqgvxygs";
const CLOUDINARY_PRESET = "wai_kru_upload"; // unsigned preset (สร้างใน Cloudinary)

// ---- DOM refs ----
const form               = document.getElementById("addTeacherForm");
const formTitle          = document.getElementById("formTitle");
const photoInput         = document.getElementById("photoInput");
const photoPreview       = document.getElementById("photoPreview");
const teacherNameInput   = document.getElementById("teacherName");
const teacherSubjectInput     = document.getElementById("teacherSubject");
const teacherSubjectGroupInput= document.getElementById("teacherSubjectGroup");
const teacherBioInput         = document.getElementById("teacherBio");
const bioCount           = document.getElementById("bioCount");
const submitBtn          = document.getElementById("submitBtn");
const submitBtnLabel     = document.getElementById("submitBtnLabel");
const cancelEditBtn      = document.getElementById("cancelEditBtn");
const nameError          = document.getElementById("nameError");
const subjectError            = document.getElementById("subjectError");
const subjectGroupError       = document.getElementById("subjectGroupError");
const teacherTableBody   = document.getElementById("teacherTableBody");
const adminSearch        = document.getElementById("adminSearch");

// Stats
const aStatTeachers = document.getElementById("aStatTeachers");
const aStatVotes    = document.getElementById("aStatVotes");
const aStatTop      = document.getElementById("aStatTop");

// Delete Modal
const deleteModal      = document.getElementById("deleteModal");
const cancelDeleteBtn  = document.getElementById("cancelDelete");
const confirmDeleteBtn = document.getElementById("confirmDelete");

// Toast
const toast    = document.getElementById("toast");
const toastMsg = document.getElementById("toastMsg");

// ---- State ----
let allTeachers    = [];
let editingId      = null;
let pendingDeleteId= null;
let selectedPhoto  = null;

// ---- Real-time listener ----
const q = query(collection(db, "teachers"), orderBy("votes", "desc"));
onSnapshot(q, (snap) => {
  allTeachers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  updateStats(allTeachers);
  renderTable(allTeachers);
});

// ---- Stats ----
function updateStats(teachers) {
  const total = teachers.reduce((s, t) => s + (t.votes || 0), 0);
  aStatTeachers.textContent = teachers.length;
  aStatVotes.textContent    = total.toLocaleString();
  aStatTop.textContent      = teachers.length > 0 ? (teachers[0].name || "—") : "—";
}

// ---- Render Table ----
function renderTable(teachers) {
  const searchVal = adminSearch.value.trim().toLowerCase();
  const filtered  = searchVal
    ? teachers.filter(t =>
        (t.name    || "").toLowerCase().includes(searchVal) ||
        (t.subject || "").toLowerCase().includes(searchVal))
    : teachers;

  if (filtered.length === 0) {
    teacherTableBody.innerHTML = `
      <tr class="table-loading">
        <td colspan="5">ไม่พบข้อมูลคุณครู</td>
      </tr>`;
    return;
  }

  teacherTableBody.innerHTML = filtered.map(t => `
    <tr data-id="${t.id}">
      <td>
        ${t.photoURL
          ? `<img class="table-avatar" src="${t.photoURL}" alt="${escHtml(t.name)}">`
          : `<div class="table-avatar-placeholder">👩‍🏫</div>`}
      </td>
      <td><span class="table-name">${escHtml(t.name || "")}</span></td>
      <td><span class="table-subject-tag">${escHtml(t.subject || "")}</span></td>
      <td><span class="table-subject-tag" style="font-size:0.78rem">${escHtml(shortGroup(t.subjectGroup || ""))}</span></td>
      <td><span class="table-vote-count">💗 ${(t.votes || 0).toLocaleString()}</span></td>
      <td>
        <div class="table-actions">
          <button class="btn-table-action btn-edit"   data-action="edit"   data-id="${t.id}">✏️ แก้ไข</button>
          <button class="btn-table-action btn-delete" data-action="delete" data-id="${t.id}">🗑️ ลบ</button>
        </div>
      </td>
    </tr>
  `).join("");

  teacherTableBody.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id      = btn.dataset.id;
      const action  = btn.dataset.action;
      const teacher = allTeachers.find(t => t.id === id);
      if (!teacher) return;
      if (action === "edit")   startEdit(teacher);
      if (action === "delete") openDeleteModal(id);
    });
  });
}

adminSearch.addEventListener("input", () => renderTable(allTeachers));

// ---- Photo Preview ----
photoInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showToast("❌ รูปขนาดใหญ่เกิน 5MB กรุณาเลือกรูปใหม่");
    photoInput.value = "";
    return;
  }
  selectedPhoto = file;
  const url = URL.createObjectURL(file);
  photoPreview.classList.add("has-image");
  photoPreview.innerHTML = `<img src="${url}" alt="preview">`;
});

// ---- Bio char count ----
teacherBioInput.addEventListener("input", () => {
  teacherBioInput.value = teacherBioInput.value.slice(0, 150);
  bioCount.textContent  = `${teacherBioInput.value.length} / 150`;
});

// ---- Upload รูปไป Cloudinary ----
async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_PRESET);
  formData.append("folder", "wai_kru");

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`,
    { method: "POST", body: formData }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || "Upload failed");
  }

  const data = await res.json();
  return data.secure_url; // URL ของรูปที่อัปโหลด
}

// ---- Form Submit (Add / Edit) ----
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name         = teacherNameInput.value.trim();
  const subject      = teacherSubjectInput.value.trim();
  const subjectGroup = teacherSubjectGroupInput.value;
  const bio          = teacherBioInput.value.trim();

  // Validate
  let valid = true;
  if (!name) {
    nameError.classList.remove("hidden");
    teacherNameInput.classList.add("error");
    valid = false;
  } else {
    nameError.classList.add("hidden");
    teacherNameInput.classList.remove("error");
  }
  if (!subject) {
    subjectError.classList.remove("hidden");
    teacherSubjectInput.classList.add("error");
    valid = false;
  } else {
    subjectError.classList.add("hidden");
    teacherSubjectInput.classList.remove("error");
  }
  if (!subjectGroup) {
    subjectGroupError.classList.remove("hidden");
    teacherSubjectGroupInput.classList.add("error");
    valid = false;
  } else {
    subjectGroupError.classList.add("hidden");
    teacherSubjectGroupInput.classList.remove("error");
  }
  if (!valid) return;

  setSubmitLoading(true);

  try {
    let photoURL = editingId
      ? (allTeachers.find(t => t.id === editingId)?.photoURL || "")
      : "";

    // อัปโหลดรูปไป Cloudinary ถ้ามีรูปใหม่
    if (selectedPhoto) {
      showToast("⏳ กำลังอัปโหลดรูป...");
      photoURL = await uploadToCloudinary(selectedPhoto);
    }

    const data = { name, subject, subjectGroup, bio, photoURL };

    if (editingId) {
      await updateDoc(doc(db, "teachers", editingId), data);
      showToast("✅ แก้ไขข้อมูลสำเร็จแล้ว");
    } else {
      await addDoc(collection(db, "teachers"), {
        ...data,
        votes:     0,
        createdAt: serverTimestamp()
      });
      showToast("💗 เพิ่มคุณครูเรียบร้อยแล้ว!");
    }

    resetForm();

  } catch (err) {
    console.error("Save error:", err);
    showToast("❌ เกิดข้อผิดพลาด: " + err.message);
  } finally {
    setSubmitLoading(false);
  }
});

// ---- Submit Button Loading State ----
function setSubmitLoading(loading) {
  submitBtn.disabled = loading;
  submitBtnLabel.textContent = loading
    ? "กำลังบันทึก..."
    : (editingId ? "บันทึกการแก้ไข" : "เพิ่มคุณครู");
}

// ---- Cancel Edit Button ----
cancelEditBtn.addEventListener("click", resetForm);

// ---- Start Editing ----
function startEdit(teacher) {
  editingId = teacher.id;
  teacherNameInput.value         = teacher.name         || "";
  teacherSubjectInput.value      = teacher.subject      || "";
  teacherSubjectGroupInput.value = teacher.subjectGroup || "";
  teacherBioInput.value          = teacher.bio          || "";
  bioCount.textContent      = `${(teacher.bio || "").length} / 150`;

  if (teacher.photoURL) {
    photoPreview.classList.add("has-image");
    photoPreview.innerHTML = `<img src="${teacher.photoURL}" alt="preview">`;
  }

  submitBtnLabel.textContent = "บันทึกการแก้ไข";
  formTitle.textContent      = "✏️ แก้ไขข้อมูลครู";
  cancelEditBtn.classList.remove("hidden");

  teacherNameInput.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ---- Reset Form ----
function resetForm() {
  form.reset();
  selectedPhoto = null;
  editingId     = null;
  bioCount.textContent = "0 / 150";

  photoPreview.classList.remove("has-image");
  photoPreview.innerHTML = `
    <span class="photo-placeholder">🖼️</span>
    <p class="photo-hint">คลิกเพื่อเลือกรูป</p>
    <p class="photo-hint-sub">PNG, JPG ขนาดไม่เกิน 5MB</p>
  `;

  submitBtnLabel.textContent = "เพิ่มคุณครู";
  formTitle.textContent      = "✏️ เพิ่มคุณครู";
  cancelEditBtn.classList.add("hidden");

  nameError.classList.add("hidden");
  subjectError.classList.add("hidden");
  subjectGroupError.classList.add("hidden");
  teacherNameInput.classList.remove("error");
  teacherSubjectInput.classList.remove("error");
  teacherSubjectGroupInput.classList.remove("error");
}

// ---- Delete Modal ----
function openDeleteModal(id) {
  pendingDeleteId = id;
  deleteModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeDeleteModal() {
  deleteModal.classList.add("hidden");
  document.body.style.overflow = "";
  pendingDeleteId = null;
}

cancelDeleteBtn.addEventListener("click", closeDeleteModal);
deleteModal.addEventListener("click", (e) => {
  if (e.target === deleteModal) closeDeleteModal();
});

confirmDeleteBtn.addEventListener("click", async () => {
  if (!pendingDeleteId) return;
  const id = pendingDeleteId;
  closeDeleteModal();

  try {
    await deleteDoc(doc(db, "teachers", id));
    showToast("🗑️ ลบข้อมูลสำเร็จแล้ว");
  } catch (err) {
    console.error("Delete error:", err);
    showToast("❌ เกิดข้อผิดพลาด: " + err.message);
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

function shortGroup(group) {
  return group
    .replace("กลุ่มสาระการเรียนรู้วิชา", "")
    .replace("กลุ่มสาระการเรียนรู้", "");
}