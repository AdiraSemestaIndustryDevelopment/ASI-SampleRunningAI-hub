// ============================================================
// SCHEDULE-ENGINE.JS — susun rekomendasi jadwal produksi harian
// per lokasi (Kopo/Katapang), berdasarkan:
// 1. Urutan urgency (dari priority-engine) -- yang paling mendesak duluan
// 2. Kapasitas harian riil tiap lokasi (dari prediction-engine)
//
// Cara kerja: item WIP aktif per lokasi diurutkan urgency tertinggi,
// lalu "dimasukkan" ke antrian HARI INI sampai kapasitas pcs/hari
// penuh -- sisanya otomatis masuk antrian BERIKUTNYA.
// Ini rule-based & transparan: bottleneck dihitung dari kapasitas
// yang LEBIH KECIL antara cutting vs sewing (yang jadi penghambat).
// ============================================================

import { rankByUrgency } from "./priority-engine.js";
import { TEAMS, matchTeamKey, dailyCuttingCapacity, dailySewingCapacity } from "./prediction-engine.js";

/**
 * Susun jadwal untuk 1 lokasi (kopo/katapang).
 */
function scheduleForTeam(teamKey, activeItems) {
  const team = TEAMS[teamKey];
  const teamItems = activeItems.filter(i => matchTeamKey(i.team) === teamKey);
  const ranked = rankByUrgency(teamItems);

  const cuttingCap = dailyCuttingCapacity(teamKey);
  const sewingCap = dailySewingCapacity(teamKey);
  const dailyCap = Math.min(cuttingCap, sewingCap); // bottleneck: kapasitas terkecil yang menentukan

  let cumulative = 0;
  const today = [];
  const next = [];

  ranked.forEach(item => {
    const qty = Number(item.qty_pcs) || 0;
    if (cumulative + qty <= dailyCap || today.length === 0) {
      // "today.length === 0" -> item pertama tetap masuk hari ini walau
      // sendirian sudah melebihi kapasitas (supaya tidak macet total kalau
      // ada 1 order besar), tapi dicatat sebagai peringatan.
      today.push(item);
      cumulative += qty;
    } else {
      next.push(item);
    }
  });

  return {
    teamLabel: team.label,
    pic: team.pic,
    dailyCapacity: Math.round(dailyCap),
    bottleneck: cuttingCap < sewingCap ? "cutting" : "sewing",
    today,
    next,
    todayTotalPcs: cumulative
  };
}

/**
 * Susun jadwal untuk SEMUA lokasi sekaligus.
 */
function generateDailySchedule(items) {
  const activeItems = items.filter(i => {
    const status = String(i.active_non_active_smi || "").toLowerCase();
    return status.includes("active") && !status.includes("non");
  });

  const result = {};
  Object.keys(TEAMS).forEach(teamKey => {
    result[teamKey] = scheduleForTeam(teamKey, activeItems);
  });
  return result;
}

export { generateDailySchedule, scheduleForTeam };
