// ============================================================
// PREDICTION-ENGINE.JS — deteksi pola & potensi masalah ke depan
// Catatan jujur: ini heuristik rule-based (bukan machine learning
// beneran), tapi sudah cukup kuat untuk early-warning karena
// berdasarkan pola historis di data yang sama.
// Bisa di-upgrade ke ML kalau data historis sudah cukup banyak (12+ bulan).
// ============================================================

// Kapasitas operator riil di lapangan (sesuaikan kalau berubah)
const CAPACITY = {
  cutting: 5,
  sewing: 30
};

// Asumsi rata-rata sample yang bisa ditangani 1 operator per minggu.
// TODO: Bapak koreksi angka ini berdasarkan data aktual, ini estimasi awal.
const AVG_THROUGHPUT_PER_OPERATOR_PER_WEEK = {
  cutting: 8,
  sewing: 3
};

function predictCapacityOverload(activeItems) {
  const cuttingCapacityPerWeek = CAPACITY.cutting * AVG_THROUGHPUT_PER_OPERATOR_PER_WEEK.cutting;
  const sewingCapacityPerWeek = CAPACITY.sewing * AVG_THROUGHPUT_PER_OPERATOR_PER_WEEK.sewing;
  const activeCount = activeItems.length;

  const warnings = [];
  if (activeCount > cuttingCapacityPerWeek) {
    warnings.push({
      type: "cutting_overload",
      message: `Beban cutting (${activeCount} sample aktif) melebihi kapasitas estimasi minggu ini (${cuttingCapacityPerWeek}). Risiko keterlambatan di tahap cutting.`
    });
  }
  if (activeCount > sewingCapacityPerWeek) {
    warnings.push({
      type: "sewing_overload",
      message: `Beban sewing (${activeCount} sample aktif) melebihi kapasitas estimasi minggu ini (${sewingCapacityPerWeek}). Risiko keterlambatan di tahap sewing.`
    });
  }
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

export { runFullPrediction, predictCapacityOverload, predictRecurringDelayCauses, predictQualityTrend, CAPACITY };
