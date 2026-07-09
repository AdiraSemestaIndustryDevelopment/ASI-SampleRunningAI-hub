// ============================================================
// PREDICTION-ENGINE.JS — deteksi pola & potensi masalah ke depan
// v2: kapasitas dihitung PER LOKASI (Kopo & Katapang), bukan digabung,
// karena tiap lokasi punya jumlah operator & PIC berbeda.
// Catatan jujur: ini heuristik rule-based, bukan machine learning
// beneran, tapi cukup kuat untuk early-warning berbasis data riil.
// ============================================================

// Struktur tim riil di lapangan (sesuai konfirmasi Bapak Juan)
const TEAMS = {
  kopo: {
    label: "Kopo",
    pic: "Wiji",
    cuttingOperators: 4,
    sewingOperators: 18
  },
  katapang: {
    label: "Katapang",
    pic: "Vanny",
    cuttingOperators: 1,
    sewingOperators: 8
  }
};

// Kapasitas cutting per operator per hari (2 metode berbeda kecepatan)
const CUTTING_RATE_PER_OPERATOR_PER_DAY = {
  cutter: 40,   // metode manual cutter
  dies: 75      // metode dies (lebih cepat)
};
// Estimasi default: rata-rata dari 2 metode (bisa disesuaikan kalau data
// metode per order tersedia nanti, supaya lebih presisi per style)
const CUTTING_RATE_AVERAGE = (CUTTING_RATE_PER_OPERATOR_PER_DAY.cutter + CUTTING_RATE_PER_OPERATOR_PER_DAY.dies) / 2;

// Kapasitas sewing: 1 group (18 orang, Kopo) = 100pcs/hari -> per operator:
const SEWING_RATE_PER_OPERATOR_PER_DAY = 100 / 18; // ≈ 5.56 pcs/operator/hari

// Senin-Jumat full day (5 hari) + Sabtu setengah hari (0.5 hari) = 5.5 hari kerja/minggu
const WORKING_DAYS_PER_WEEK = 5.5;

function dailyCuttingCapacity(teamKey) {
  const team = TEAMS[teamKey];
  return team.cuttingOperators * CUTTING_RATE_AVERAGE;
}

function dailySewingCapacity(teamKey) {
  const team = TEAMS[teamKey];
  return team.sewingOperators * SEWING_RATE_PER_OPERATOR_PER_DAY;
}

function weeklyCuttingCapacity(teamKey) {
  return dailyCuttingCapacity(teamKey) * WORKING_DAYS_PER_WEEK;
}

function weeklySewingCapacity(teamKey) {
  return dailySewingCapacity(teamKey) * WORKING_DAYS_PER_WEEK;
}

/**
 * Cocokkan value kolom "team" di data (misal "Kopo", "KOPO", "kopo ")
 * ke key TEAMS ("kopo" / "katapang").
 */
function matchTeamKey(teamRawValue) {
  const normalized = String(teamRawValue || "").trim().toLowerCase();
  if (normalized.includes("kopo")) return "kopo";
  if (normalized.includes("katapang")) return "katapang";
  return null;
}

/**
 * Prediksi overload kapasitas PER LOKASI, berdasarkan total QTY (PCS)
 * dari SMI aktif yang di-assign ke lokasi itu, dibanding kapasitas
 * mingguan cutting & sewing lokasi tersebut.
 */
function predictCapacityOverload(activeItems) {
  const warnings = [];
  const numeric = (v) => Number(v) || 0;

  Object.keys(TEAMS).forEach(teamKey => {
    const team = TEAMS[teamKey];
    const itemsInTeam = activeItems.filter(i => matchTeamKey(i.team) === teamKey);
    const totalPcs = itemsInTeam.reduce((sum, i) => sum + numeric(i.qty_pcs), 0);

    const cuttingCap = weeklyCuttingCapacity(teamKey);
    const sewingCap = weeklySewingCapacity(teamKey);

    if (totalPcs > cuttingCap) {
      warnings.push({
        type: "cutting_overload",
        team: team.label,
        message: `[${team.label}] Beban cutting (${totalPcs} pcs dari SMI aktif) melebihi kapasitas estimasi minggu ini (${Math.round(cuttingCap)} pcs, ${team.cuttingOperators} operator). PIC: ${team.pic}.`
      });
    }
    if (totalPcs > sewingCap) {
      warnings.push({
        type: "sewing_overload",
        team: team.label,
        message: `[${team.label}] Beban sewing (${totalPcs} pcs dari SMI aktif) melebihi kapasitas estimasi minggu ini (${Math.round(sewingCap)} pcs, ${team.sewingOperators} operator). PIC: ${team.pic}.`
      });
    }
  });

  return warnings;
}

function predictRecurringDelayCauses(items) {
  const counts = {};
  items.forEach(item => {
    const cause = item.kendala_bikin_lama && String(item.kendala_bikin_lama).trim();
    if (!cause) return;
    counts[cause] = (counts[cause] || 0) + 1;
  });

  return Object.entries(counts)
    .filter(([, count]) => count >= 3)
    .map(([cause, count]) => ({
      cause,
      count,
      message: `Kendala "${cause}" terjadi berulang (${count}x). Kemungkinan masalah sistemik, bukan kasus per kasus.`
    }))
    .sort((a, b) => b.count - a.count);
}

function predictQualityTrend(items) {
  const numeric = (v) => Number(v) || 0;
  const totalItems = items.length;
  if (totalItems === 0) return [];

  const avgCuttingReject = items.reduce((s, i) => s + numeric(i.cutting_reject), 0) / totalItems;
  const avgSewingReject = items.reduce((s, i) => s + numeric(i.sewing_reject), 0) / totalItems;

  const warnings = [];
  const outliers = items.filter(i => numeric(i.cutting_reject) > avgCuttingReject * 2 && avgCuttingReject > 0);
  if (outliers.length > 0) {
    warnings.push({
      type: "cutting_quality",
      message: `${outliers.length} style dengan cutting reject jauh di atas rata-rata (${avgCuttingReject.toFixed(1)}). Perlu cek pattern/material.`
    });
  }
  const sewingOutliers = items.filter(i => numeric(i.sewing_reject) > avgSewingReject * 2 && avgSewingReject > 0);
  if (sewingOutliers.length > 0) {
    warnings.push({
      type: "sewing_quality",
      message: `${sewingOutliers.length} style dengan sewing reject jauh di atas rata-rata (${avgSewingReject.toFixed(1)}). Perlu cek technical sewing.`
    });
  }
  return warnings;
}

function runFullPrediction(items) {
  const activeItems = items.filter(i => {
    const status = String(i.active_non_active_smi || "").toLowerCase();
    return status.includes("active") && !status.includes("non");
  });

  return {
    capacity: predictCapacityOverload(activeItems),
    recurringDelays: predictRecurringDelayCauses(items),
    qualityTrend: predictQualityTrend(items)
  };
}

export {
  runFullPrediction,
  predictCapacityOverload,
  predictRecurringDelayCauses,
  predictQualityTrend,
  TEAMS,
  CUTTING_RATE_PER_OPERATOR_PER_DAY,
  SEWING_RATE_PER_OPERATOR_PER_DAY,
  WORKING_DAYS_PER_WEEK
};
