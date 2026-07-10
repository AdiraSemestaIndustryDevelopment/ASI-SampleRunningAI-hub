// ============================================================
// HOLIDAY-UTILS.JS — kalender hari libur + perhitungan hari kerja.
// Aturan: Senin-Jumat = 1 hari kerja, Sabtu = 0.5 hari kerja,
// Minggu & tanggal merah (dari sheet "Date") = 0 hari kerja.
// ============================================================

import { db } from "./firebase-config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let holidaySet = null; // Set of "yyyy-MM-dd" strings, di-cache setelah load pertama

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Muat daftar hari libur dari Firestore (sekali saja, di-cache).
 * Panggil ini sekali di awal (misal saat dashboard load) sebelum
 * memakai workingDaysUntil().
 */
async function loadHolidays() {
  if (holidaySet) return holidaySet;
  try {
    const snapshot = await getDocs(collection(db, "holidays"));
    holidaySet = new Set(snapshot.docs.map(d => d.id));
  } catch (err) {
    console.error("Gagal load kalender libur:", err.message);
    holidaySet = new Set(); // fallback: anggap tidak ada libur, tetap jalan
  }
  return holidaySet;
}

function isHoliday(date) {
  if (!holidaySet) return false;
  return holidaySet.has(formatDateKey(date));
}

/**
 * Hitung jumlah hari KERJA (bukan kalender) antara hari ini dan tanggal target.
 * Positif = target di masa depan, negatif = target sudah lewat.
 * Sabtu dihitung 0.5, Minggu & tanggal merah dihitung 0.
 */
function workingDaysUntil(targetDateValue) {
  if (!targetDateValue) return null;
  const target = new Date(targetDateValue);
  if (isNaN(target.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  if (target.getTime() === today.getTime()) return 0;

  const sign = target > today ? 1 : -1;
  const start = sign === 1 ? new Date(today) : new Date(target);
  const end = sign === 1 ? new Date(target) : new Date(today);

  let total = 0;
  const cursor = new Date(start);
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    const dow = cursor.getDay(); // 0 = Minggu, 6 = Sabtu
    if (isHoliday(cursor) || dow === 0) {
      // 0 hari kerja
    } else if (dow === 6) {
      total += 0.5;
    } else {
      total += 1;
    }
  }
  return sign * total;
}

/**
 * Hitung berapa hari libur (termasuk Minggu) ada di antara hari ini
 * dan tanggal target -- dipakai untuk kasih konteks di alasan urgency.
 */
function countHolidaysUntil(targetDateValue) {
  if (!targetDateValue) return 0;
  const target = new Date(targetDateValue);
  if (isNaN(target.getTime())) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  if (target <= today) return 0;

  let count = 0;
  const cursor = new Date(today);
  while (cursor < target) {
    cursor.setDate(cursor.getDate() + 1);
    if (isHoliday(cursor)) count++;
  }
  return count;
}

export { loadHolidays, isHoliday, workingDaysUntil, countHolidaysUntil };
