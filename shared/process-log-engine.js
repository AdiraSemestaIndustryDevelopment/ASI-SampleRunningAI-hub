// ============================================================
// PROCESS-LOG-ENGINE.JS — menyambungkan data WIP utama ke log
// kerja tiap spesialis (Artwork, Mutoh, Pattern, 3D, M4), supaya
// follow-up & prediksi berbasis DATA NYATA, bukan tebakan kata kunci.
//
// Cara kerja:
// 1. Muat semua collection log dari Firestore (real-time).
// 2. Untuk 1 item WIP, cari baris log yang match:
//    - Prioritas 1: match by No SMI (_smi_ref) -> PASTI benar.
//    - Fallback (khusus M4, karena sheet-nya tidak punya kolom SMI):
//      match by nama Style (_style_ref_normalized) -> KEMUNGKINAN
//      BESAR benar, tapi bisa salah kalau ada beberapa SMI dengan
//      nama style yang sama persis (repeat order). Ditandai jelas
//      di UI sebagai "match by style" supaya user tahu tingkat
//      kepercayaannya beda.
// ============================================================

import { db } from "./firebase-config.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const PROCESS_DEFS = [
  { key: "artwork", collection: "artwork_log", pic: "Tendi", label: "Artwork", finishField: "finish_artwork", targetField: "target_artwork" },
  { key: "mutoh", collection: "mutoh_log", pic: "Yogie", label: "Mutoh (Digital Print)", finishField: "tgl_finish_ok_auto", targetField: "tgl_target_auto" },
  { key: "pattern_ase", collection: "pattern_ase_log", pic: "Ase", label: "Pattern (Ase)", finishField: "finish_pattern_diserahkan_ke_sample_auto", targetField: "target_auto" },
  { key: "pattern_reza", collection: "pattern_reza_log", pic: "Reza", label: "Pattern (Reza)", finishField: "finish_pattern_diserahkan_ke_sample_auto", targetField: "target_auto" },
  { key: "3d", collection: "log_3d", pic: "Adhi", label: "3D Design", finishField: "finish", targetField: "target_tgl_kirim_3d_h_1" },
  { key: "m4", collection: "m4_log", pic: "Rachmat", label: "M4 (IHP)", finishField: "tanggal_terima", targetField: "target_terima", matchBy: "style" }
];

let cachedLogs = {}; // { artwork_log: [...], mutoh_log: [...], ... }
let listeners = [];

/**
 * Mulai dengerin semua collection log secara real-time.
 * Panggil sekali di awal (misal saat dashboard load).
 */
function startProcessLogListeners(onUpdateCallback) {
  PROCESS_DEFS.forEach(def => {
    const unsub = onSnapshot(collection(db, def.collection), (snapshot) => {
      cachedLogs[def.collection] = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      onUpdateCallback();
    }, (err) => {
      console.error(`Gagal load ${def.collection}:`, err.message);
      cachedLogs[def.collection] = cachedLogs[def.collection] || [];
    });
    listeners.push(unsub);
  });
}

function stopProcessLogListeners() {
  listeners.forEach(unsub => unsub());
  listeners = [];
}

/**
 * Cari semua baris log yang berhubungan dengan 1 item WIP, untuk 1 jenis proses.
 * Return: { rows: [...], matchType: "smi" | "style" | "none" }
 */
function findRelatedLogRows(wipItem, def) {
  const rows = cachedLogs[def.collection] || [];
  const smiRef = String(wipItem.no_smi || "").trim();
  const styleRef = String(wipItem.style || "").trim().toLowerCase();

  if (def.matchBy !== "style" && smiRef) {
    const bySmiMatch = rows.filter(r => String(r._smi_ref || "").trim() === smiRef);
    if (bySmiMatch.length > 0) return { rows: bySmiMatch, matchType: "smi" };
  }

  // Fallback / khusus M4: match by style
  if (styleRef) {
    const byStyleMatch = rows.filter(r => String(r._style_ref_normalized || "").trim() === styleRef);
    if (byStyleMatch.length > 0) return { rows: byStyleMatch, matchType: "style" };
  }

  return { rows: [], matchType: "none" };
}

/**
 * Untuk 1 item WIP, cek status di SEMUA proses (artwork, mutoh, pattern, 3d, m4).
 * Return array temuan: proses yang belum selesai padahal seharusnya (ada baris
 * log tapi finishField kosong), lengkap dengan PIC asli & tingkat kepercayaan match.
 */
function checkProcessStatusForItem(wipItem) {
  const findings = [];

  PROCESS_DEFS.forEach(def => {
    const { rows, matchType } = findRelatedLogRows(wipItem, def);
    if (rows.length === 0) return; // tidak ada log terkait proses ini untuk item ini

    const unfinished = rows.filter(r => {
      const finishVal = r[def.finishField];
      return !finishVal || String(finishVal).trim() === "";
    });

    if (unfinished.length > 0) {
      findings.push({
        process: def.label,
        pic: def.pic,
        matchType, // "smi" (pasti) atau "style" (kemungkinan besar)
        unfinishedCount: unfinished.length,
        totalRows: rows.length,
        sampleTarget: unfinished[0][def.targetField] || null,
        sampleNote: unfinished[0].note || unfinished[0].noted || null
      });
    }
  });

  return findings;
}

export { startProcessLogListeners, stopProcessLogListeners, checkProcessStatusForItem, findRelatedLogRows, PROCESS_DEFS };
