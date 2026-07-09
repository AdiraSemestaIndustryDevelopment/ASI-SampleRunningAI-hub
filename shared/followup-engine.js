// ============================================================
// FOLLOWUP-ENGINE.JS — deteksi hal yang seharusnya sudah diterima
// tapi belum, lalu catat siapa PIC yang perlu di-follow up.
// PIC ditentukan berdasarkan LOKASI/TEAM SMI (bukan jenis masalahnya):
//   Team Kopo     -> PIC: Wiji
//   Team Katapang -> PIC: Vanny
// ============================================================

import { db } from "./firebase-config.js";
import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Peta lokasi -> PIC (sesuai struktur tim Bapak)
const TEAM_PIC_MAP = {
  kopo: "Wiji",
  katapang: "Vanny"
};
const DEFAULT_PIC = "Vanny & Wiji"; // fallback kalau kolom "team" kosong/tidak dikenali

/**
 * Cocokkan value kolom "team" (misal "Kopo", "KOPO ") ke key TEAM_PIC_MAP.
 */
function resolvePicByTeam(item) {
  const normalized = String(item.team || "").trim().toLowerCase();
  if (normalized.includes("kopo")) return TEAM_PIC_MAP.kopo;
  if (normalized.includes("katapang")) return TEAM_PIC_MAP.katapang;
  return DEFAULT_PIC;
}

/**
 * Aturan follow-up. Setiap aturan hanya menentukan KONDISI-nya;
 * siapa PIC-nya selalu ditentukan dari lokasi (resolvePicByTeam),
 * bukan dari rule ini.
 */
const RULES = [
  {
    id: "missing_techpack",
    label: "Techpack belum diterima dari Sample Room",
    check: (item) => {
      const receivedDate = item.tgl_md_terima_techpack;
      const smiMeetingDate = item.smi_meeting;
      return smiMeetingDate && !receivedDate;
    }
  },
  {
    id: "missing_buyer_comment",
    label: "Trial sudah selesai, menunggu comment buyer",
    check: (item) => {
      const trialDone = item.trial && String(item.trial).trim() !== "";
      const buyerCommented = item.tgl_comment_buyer && String(item.tgl_comment_buyer).trim() !== "";
      return trialDone && !buyerCommented;
    }
  },
  {
    id: "material_shortage_unresolved",
    label: "Material kurang, belum ada update penyelesaian",
    check: (item) => {
      const hasNote = item.note_kurang_material && String(item.note_kurang_material).trim() !== "";
      const resolved = item.tgl_persiapan_material_selesai && String(item.tgl_persiapan_material_selesai).trim() !== "";
      return hasNote && !resolved;
    }
  },
  {
    id: "sample_overdue_not_sent",
    label: "Due date lewat tapi sample belum dikirim",
    check: (item) => {
      const due = item.due_date ? new Date(item.due_date) : null;
      const sent = item.tgl_kirim_sample && String(item.tgl_kirim_sample).trim() !== "";
      if (!due || isNaN(due.getTime())) return false;
      const today = new Date();
      return due < today && !sent;
    }
  }
];

/**
 * Jalankan semua rule terhadap 1 item WIP, kembalikan daftar follow-up yang perlu dibuat.
 * PIC selalu diambil dari lokasi (team) item tersebut.
 */
function detectFollowUps(item) {
  const results = [];
  const pic = resolvePicByTeam(item);

  RULES.forEach(rule => {
    if (rule.check(item)) {
      results.push({
        ruleId: rule.id,
        label: rule.label,
        assignedTo: pic,
        team: item.team || "-",
        smiId: item.no_smi || item._sourceRow,
        style: item.style || "-"
      });
    }
  });
  return results;
}

/**
 * Jalankan ke semua item, simpan hasilnya ke Firestore collection "followups".
 */
async function runFollowUpScan(items) {
  const allFollowUps = [];

  for (const item of items) {
    const followUps = detectFollowUps(item);
    for (const f of followUps) {
      const docId = `${f.smiId}_${f.ruleId}`.replace(/\s+/g, "_");
      await setDoc(doc(db, "followups", docId), {
        ...f,
        status: "open",
        detectedAt: serverTimestamp()
      }, { merge: true });
      allFollowUps.push(f);
    }
  }

  return allFollowUps;
}

export { detectFollowUps, runFollowUpScan, RULES, TEAM_PIC_MAP, resolvePicByTeam };
