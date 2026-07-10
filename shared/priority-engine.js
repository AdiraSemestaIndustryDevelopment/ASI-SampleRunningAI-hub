// ============================================================
// PRIORITY-ENGINE.JS — rule-based urgency scoring
// Ini "otak keputusan" versi transparan (bukan black-box AI),
// supaya Bapak bisa lihat & percaya KENAPA sebuah SMI diprioritaskan.
// Semua bobot (WEIGHT) bisa diubah sesuai kebijakan lapangan.
// ============================================================

import { workingDaysUntil, countHolidaysUntil } from "./holiday-utils.js";

const WEIGHTS = {
  overdue: 100,          // sudah lewat due date
  dueSoon3days: 60,      // due date < 3 hari lagi
  dueSoon7days: 30,      // due date < 7 hari lagi
  missingMaterial: 40,   // ada catatan kekurangan material
  waitingBuyerComment: 25, // trial sudah tapi belum ada comment buyer
  activeSMI: 10,         // SMI berstatus aktif (vs non-aktif, lebih rendah prioritas)
  fewWorkingDaysLeft: 20 // sisa hari KERJA efektif tinggal sedikit (karena ada libur/weekend)
};

/**
 * Hitung sisa hari sampai due date. Negatif = sudah lewat.
 */
function daysUntil(dateValue) {
  if (!dateValue) return null;
  const due = new Date(dateValue);
  if (isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.round((due - today) / (1000 * 60 * 60 * 24));
}

/**
 * Hitung skor urgency 1 item WIP.
 * Mengembalikan { score, reasons: [alasan-alasan yang menyusun skor ini] }
 * supaya keputusan AI ini bisa di-audit manusia (poin penting: transparansi).
 */
function calculateUrgencyScore(item) {
  let score = 0;
  const reasons = [];

  const remainingDays = daysUntil(item.due_date);

  if (remainingDays !== null) {
    if (remainingDays < 0) {
      score += WEIGHTS.overdue;
      reasons.push(`Sudah lewat due date ${Math.abs(remainingDays)} hari`);
    } else if (remainingDays <= 3) {
      score += WEIGHTS.dueSoon3days;
      reasons.push(`Due date tinggal ${remainingDays} hari`);
    } else if (remainingDays <= 7) {
      score += WEIGHTS.dueSoon7days;
      reasons.push(`Due date dalam ${remainingDays} hari`);
    }

    // Cek hari kerja efektif -- kalau ada libur/weekend di antara sekarang
    // dan due date, sisa waktu KERJA sebenarnya bisa lebih sedikit dari
    // kelihatannya di kalender biasa.
    if (remainingDays > 0) {
      const workDays = workingDaysUntil(item.due_date);
      const holidayCount = countHolidaysUntil(item.due_date);
      if (workDays !== null && workDays <= 2 && remainingDays > 3) {
        score += WEIGHTS.fewWorkingDaysLeft;
        reasons.push(`Kalender bilang ${remainingDays} hari lagi, tapi hari kerja efektif cuma ~${workDays} hari (ada libur/weekend di tengah)`);
      } else if (holidayCount > 0) {
        reasons.push(`Ada ${holidayCount} hari libur sebelum due date, hari kerja efektif ~${workDays} hari`);
      }
    }
  }

  if (item.note_kurang_material && String(item.note_kurang_material).trim() !== "") {
    score += WEIGHTS.missingMaterial;
    reasons.push(`Material kurang: "${item.note_kurang_material}"`);
  }

  const trialDone = item.trial && String(item.trial).trim() !== "";
  const buyerCommented = item.tgl_comment_buyer && String(item.tgl_comment_buyer).trim() !== "";
  if (trialDone && !buyerCommented) {
    score += WEIGHTS.waitingBuyerComment;
    reasons.push("Trial selesai tapi belum ada comment buyer");
  }

  const isActive = String(item.active_non_active_smi || "").toLowerCase().includes("active")
    && !String(item.active_non_active_smi || "").toLowerCase().includes("non");
  if (isActive) {
    score += WEIGHTS.activeSMI;
  }

  return { score, reasons, remainingDays };
}

/**
 * Urutkan seluruh list WIP berdasarkan skor urgency, tertinggi dulu.
 */
function rankByUrgency(items) {
  return items
    .map(item => ({ ...item, _urgency: calculateUrgencyScore(item) }))
    .sort((a, b) => b._urgency.score - a._urgency.score);
}

export { calculateUrgencyScore, rankByUrgency, daysUntil, WEIGHTS };
