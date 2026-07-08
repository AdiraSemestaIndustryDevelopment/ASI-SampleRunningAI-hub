// ============================================================
// FOLLOWUP-ENGINE.JS — deteksi hal yang seharusnya sudah diterima
// tapi belum, lalu catat siapa PIC yang perlu di-follow up.
// PIC follow-up default: Vanny & Wiji (sesuai struktur tim Bapak).
// ============================================================

import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const FOLLOWUP_PIC = ["Vanny", "Wiji"]; // sesuaikan kalau pembagian tugas berubah

/**
 * Aturan follow-up. Setiap aturan mengecek 1 kondisi "seharusnya sudah ada
 * tapi belum ada", dan tentukan siapa yang harus ditagih.
 */
const RULES = [
  {
    id: "missing_techpack",
    label: "Techpack belum diterima dari Sample Room",
    check: (item) => {
      const receivedDate = item.tgl_md_terima_techpack;
      const smiMeetingDate = item.smi_meeting;
      // Kalau sudah waktunya SMI meeting tapi techpack belum diterima
      return smiMeetingDate && !receivedDate;
    },
    assignedTo: "Vanny"
  },
  {
    id: "missing_buyer_comment",
    label: "Trial sudah selesai, menunggu comment buyer",
    check: (item) => {
      const trialDone = item.trial && String(item.trial).trim() !== "";
      const buyerCommented = item.tgl_comment_buyer && String(item.tgl_comment_buyer).trim() !== "";
      return trialDone && !buyerCommented;
    },
    assignedTo: "Wiji"
  },
  {
    id: "material_shortage_unresolved",
    label: "Material kurang, belum ada update penyelesaian",
    check: (item) => {
      const hasNote = item.note_kurang_material && String(item.note_kurang_material).trim() !== "";
      const resolved = item.tgl_persiapan_material_selesai && String(item.tgl_persiapan_material_selesai).trim() !== "";
      return hasNote && !resolved;
    },
    assignedTo: "Vanny"
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
    },
    assignedTo: "Wiji"
  }
];

/**
 * Jalankan semua rule terhadap 1 item WIP, kembalikan daftar follow-up yang perlu dibuat.
 */
function detectFollowUps(item) {
  const results = [];
  RULES.forEach(rule => {
    if (rule.check(item)) {
      results.push({
        ruleId: rule.id,
        label: rule.label,
        assignedTo: rule.assignedTo,
        smiId: item.no_smi || item._sourceRow,
        style: item.style || "-"
      });
    }
  });
  return results;
}

/**
 * Jalankan ke semua item, dan simpan hasilnya ke Firestore collection "followups"
 * supaya dashboard bisa menampilkan daftar "yang perlu ditagih hari ini" secara real-time.
 * docId dibuat dari smiId + ruleId supaya idempotent (tidak dobel kalau dijalankan berkali-kali).
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

export { detectFollowUps, runFollowUpScan, RULES, FOLLOWUP_PIC };
