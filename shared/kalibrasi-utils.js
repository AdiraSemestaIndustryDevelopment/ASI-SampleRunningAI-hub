// ============================================================
// KALIBRASI-UTILS.JS — reminder alat ukur yang perlu kalibrasi ulang.
// Beda dari process-log-engine: ini TIDAK terikat ke SMI/Style,
// jadi berdiri sendiri sebagai panel reminder umum.
// ============================================================

import { db } from "./firebase-config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let cachedTools = [];
let refreshTimer = null;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 menit -- data kalibrasi jarang berubah

async function loadKalibrasiOnce(onUpdateCallback) {
  try {
    const snapshot = await getDocs(collection(db, "kalibrasi_log"));
    cachedTools = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("Gagal load kalibrasi_log:", err.message);
    cachedTools = [];
  }
  onUpdateCallback();
}

function startKalibrasiListener(onUpdateCallback) {
  loadKalibrasiOnce(onUpdateCallback);
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => loadKalibrasiOnce(onUpdateCallback), REFRESH_INTERVAL_MS);
}

function stopKalibrasiListener() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
}

/**
 * Alat yang tanggal exp kalibrasinya dalam N hari ke depan (default 30),
 * atau SUDAH LEWAT (expired). Diurutkan dari yang paling mendesak.
 */
function getExpiringCalibrations(daysAhead = 30) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today);
  limit.setDate(limit.getDate() + daysAhead);

  return cachedTools
    .map(tool => {
      const expRaw = tool.tgl_exp_kalibrasi;
      if (!expRaw) return null;
      const expDate = typeof expRaw.toDate === "function" ? expRaw.toDate() : new Date(expRaw);
      if (isNaN(expDate.getTime())) return null;
      const remainingDays = Math.round((expDate - today) / (1000 * 60 * 60 * 24));
      return { ...tool, expDate, remainingDays };
    })
    .filter(t => t && t.expDate <= limit)
    .sort((a, b) => a.remainingDays - b.remainingDays);
}

export { startKalibrasiListener, stopKalibrasiListener, getExpiringCalibrations };
