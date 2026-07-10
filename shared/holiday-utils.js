// ============================================================
// HOLIDAY-UTILS.JS — kalender hari libur + perhitungan hari kerja.
// Aturan: Senin-Jumat = 1 hari kerja, Sabtu = 0.5 hari kerja,
// Minggu & tanggal merah (dari sheet "Date") = 0 hari kerja.
// ============================================================

import { db } from "./firebase-config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let holidayMap = null; // Map "yyyy-MM-dd" -> nama hari libur, di-cache setelah load pertama

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Muat daftar hari libur dari Firestore (sekali saja, di-cache).
 * Panggil ini sekali di awal (misal saat dashboard load) sebelum
 * memakai fungsi-fungsi lain di file ini.
 */
async function loadHolidays() {
  if (holidayMap) return holidayMap;
  holidayMap = new Map();
  try {
    const snapshot = await getDocs(collection(db, "holidays"));
    snapshot.docs.forEach(d => {
      const data = d.data();
      holidayMap.set(d.id, data.hari || "Libur");
    });
  } catch (err) {
    console.error("Gagal load kalender libur:", err.message);
  }
  return holidayMap;
}

function isHoliday(date) {
  if (!holidayMap) return false;
  return holidayMap.has(formatDateKey(date));
}

/**
 * Nama hari libur untuk 1 tanggal tertentu (misal dari kolom due_date),
 * atau null kalau bukan hari libur.
 */
function getHolidayName(dateValue) {
  if (!holidayMap || !dateValue) return null;
  const date = new Date(dateValue);
  if (isNaN(date.getTime())) return null;
  return holidayMap.get(formatDateKey(date)) || null;
}

/**
 * Daftar hari libur dalam N hari ke depan dari hari ini, urut tanggal.
 */
function getUpcomingHolidays(daysAhead = 14) {
  if (!holidayMap) return [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today);
  limit.setDate(limit.getDate() + daysAhead);

  const result = [];
  holidayMap.forEach((name, dateKey) => {
    const date = new Date(dateKey + "T00:00:00");
    if (date >= today && date <= limit) {
      result.push({ date, name });
    }
  });
  return result.sort((a, b) => a.date - b.date);
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
 * Hitung berapa hari libur ada di antara hari ini dan tanggal target --
 * dipakai untuk kasih konteks di alasan urgency.
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

export { loadHolidays, isHoliday, getHolidayName, getUpcomingHolidays, workingDaysUntil, countHolidaysUntil };
