// ============================================================
// PREDICTION-ENGINE.JS — v3: bahasa santai, ada dampak, deadline,
// PIC, dan solusi untuk tiap masalah yang terdeteksi.
// Tetap rule-based & transparan (bukan black-box), tapi outputnya
// dibuat kaya konteks biar langsung actionable dibaca manusia.
// ============================================================

const TEAMS = {
  kopo: { label: "Kopo", pic: "Wiji", cuttingOperators: 4, sewingOperators: 18 },
  katapang: { label: "Katapang", pic: "Vanny", cuttingOperators: 1, sewingOperators: 8 }
};

const CUTTING_RATE_PER_OPERATOR_PER_DAY = { cutter: 40, dies: 75 };
const CUTTING_RATE_AVERAGE = (CUTTING_RATE_PER_OPERATOR_PER_DAY.cutter + CUTTING_RATE_PER_OPERATOR_PER_DAY.dies) / 2;
const SEWING_RATE_PER_OPERATOR_PER_DAY = 100 / 18;
// Senin-Jumat full day (5 hari) + Sabtu setengah hari (0.5 hari) = 5.5 hari kerja/minggu
const WORKING_DAYS_PER_WEEK = 5.5;

function dailyCuttingCapacity(teamKey) { return TEAMS[teamKey].cuttingOperators * CUTTING_RATE_AVERAGE; }
function dailySewingCapacity(teamKey) { return TEAMS[teamKey].sewingOperators * SEWING_RATE_PER_OPERATOR_PER_DAY; }
function weeklyCuttingCapacity(teamKey) { return dailyCuttingCapacity(teamKey) * WORKING_DAYS_PER_WEEK; }
function weeklySewingCapacity(teamKey) { return dailySewingCapacity(teamKey) * WORKING_DAYS_PER_WEEK; }

function matchTeamKey(teamRawValue) {
  const normalized = String(teamRawValue || "").trim().toLowerCase();
  if (normalized.includes("kopo")) return "kopo";
  if (normalized.includes("katapang")) return "katapang";
  return null;
}

// ============================================================
// Kamus keyword -> siapa yang relevan & saran solusi.
// Dipetakan dari struktur tim Bapak (Chamim-Technical Sewing,
// Ase/Reza-Pattern, Munadi-QC, Yogie-Digital Print, Adhi-3D Design,
// Lina-Glove Keeping/Material, Arlita/Vanny/Wiji-Follow Up).
// Ini best-guess berdasarkan kata kunci; silakan dikoreksi kalau
// PIC yang lebih tepat berbeda.
// ============================================================
const CAUSE_KNOWLEDGE = [
  {
    keywords: ["artwork", "logo", "sublime"],
    pic: "Yogie (Digital Print)",
    solution: "Cek antrian digital print, pastikan file artwork final sudah di-approve sebelum dikerjakan biar tidak revisi bolak-balik."
  },
  {
    keywords: ["material", "kulit", "lycra", "adr", "bof"],
    pic: "Lina (Material/Gudang)",
    solution: "Cek stok & ETA kedatangan material ke gudang, kalau memang telat dari supplier, segera cari alternatif material pengganti yang mirip spec."
  },
  {
    keywords: ["patrun", "pattern"],
    pic: "Ase / Reza (Pattern)",
    solution: "Prioritaskan pembuatan pattern untuk style ini duluan, cek juga apakah nunggu approval ukuran dari buyer."
  },
  {
    keywords: ["3d", "design"],
    pic: "Adhi (3D Design)",
    solution: "Cek antrian 3D design, kalau butuh referensi tambahan dari buyer, segera minta supaya tidak nebak-nebak desain."
  }
];

function findCauseKnowledge(causeText) {
  const lower = String(causeText || "").toLowerCase();
  return CAUSE_KNOWLEDGE.find(k => k.keywords.some(kw => lower.includes(kw))) || null;
}

/**
 * Prediksi overload kapasitas PER LOKASI — dengan penjelasan dampak,
 * deadline, PIC, dan solusi dalam bahasa santai.
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
      const overBy = Math.round(totalPcs - cuttingCap);
      warnings.push({
        type: "cutting_overload",
        title: `Tim cutting ${team.label} kebanjiran order`,
        problem: `Ada ${totalPcs} pcs yang butuh cutting minggu ini di ${team.label}, tapi kapasitas ${team.cuttingOperators} operator cuma sanggup ±${Math.round(cuttingCap)} pcs.`,
        impact: `Kelebihan sekitar ${overBy} pcs kemungkinan besar tidak akan selesai cutting minggu ini kalau tidak ada penyesuaian.`,
        deadlineImpact: "Style dengan due date paling dekat berisiko mundur duluan kalau antrian cutting tidak diprioritaskan ulang.",
        pic: team.pic,
        solution: "Prioritaskan style dengan due date terdekat duluan (lihat panel Prioritas Tinggi), atau pertimbangkan lembur/bantuan operator dari lokasi lain sementara."
      });
    }
    if (totalPcs > sewingCap) {
      const overBy = Math.round(totalPcs - sewingCap);
      warnings.push({
        type: "sewing_overload",
        title: `Tim sewing ${team.label} kebanjiran order`,
        problem: `Ada ${totalPcs} pcs yang butuh sewing minggu ini di ${team.label}, tapi kapasitas ${team.sewingOperators} operator cuma sanggup ±${Math.round(sewingCap)} pcs.`,
        impact: `Kelebihan sekitar ${overBy} pcs berisiko numpuk ke minggu berikutnya.`,
        deadlineImpact: "Sample yang harusnya dikirim minggu ini bisa mundur, terutama yang butuh banyak proses sewing detail.",
        pic: team.pic,
        solution: "Susun ulang prioritas sewing berdasarkan due date, atau cek apakah beberapa part bisa dibantu group sewing lokasi lain."
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
    .map(([cause, count]) => {
      const knowledge = findCauseKnowledge(cause);
      return {
        type: "recurring_delay",
        title: `Kendala "${cause}" kejadian berulang`,
        problem: `Alasan "${cause}" muncul ${count} kali di data aktif — ini bukan kejadian sekali doang, kemungkinan ada masalah proses yang berulang.`,
        impact: `Kalau dibiarkan, kendala yang sama bakal terus menghambat style-style lain yang mirip kasusnya.`,
        deadlineImpact: "Setiap kejadian biasanya nambah beberapa hari keterlambatan — akumulasinya bisa signifikan kalau tidak dibenahi dari akarnya.",
        pic: knowledge ? knowledge.pic : "Vanny / Wiji (Follow Up, sesuai lokasi)",
        solution: knowledge ? knowledge.solution : "Perlu ditelusuri langsung ke tim terkait kenapa kendala ini terus berulang, supaya bisa dicari solusi permanennya.",
        count
      };
    })
    .sort((a, b) => b.count - a.count);
}

function predictQualityTrend(items) {
  const numeric = (v) => Number(v) || 0;
  const totalItems = items.length;
  if (totalItems === 0) return [];

  const avgCuttingReject = items.reduce((s, i) => s + numeric(i.cutting_reject), 0) / totalItems;
  const avgSewingReject = items.reduce((s, i) => s + numeric(i.sewing_reject), 0) / totalItems;

  const warnings = [];
  const cuttingOutliers = items.filter(i => numeric(i.cutting_reject) > avgCuttingReject * 2 && avgCuttingReject > 0);
  if (cuttingOutliers.length > 0) {
    warnings.push({
      type: "cutting_quality",
      title: "Ada style dengan reject cutting tinggi banget",
      problem: `${cuttingOutliers.length} style reject cutting-nya jauh di atas rata-rata (rata-rata cuma ${avgCuttingReject.toFixed(1)}).`,
      impact: "Reject tinggi berarti buang-buang material & waktu cutting ulang, ujung-ujungnya juga nambah beban ke tim cutting yang sudah sibuk.",
      deadlineImpact: "Style ini berisiko telat karena harus cutting ulang, apalagi kalau materialnya juga terbatas.",
      pic: "Ase / Reza (Pattern) & Munadi (QC)",
      solution: "Cek pattern & marker-nya, kemungkinan ada kesalahan pattern atau material yang tidak sesuai spec cutting.",
      affectedCount: cuttingOutliers.length
    });
  }
  const sewingOutliers = items.filter(i => numeric(i.sewing_reject) > avgSewingReject * 2 && avgSewingReject > 0);
  if (sewingOutliers.length > 0) {
    warnings.push({
      type: "sewing_quality",
      title: "Ada style dengan reject sewing tinggi banget",
      problem: `${sewingOutliers.length} style reject sewing-nya jauh di atas rata-rata (rata-rata cuma ${avgSewingReject.toFixed(1)}).`,
      impact: "Reject sewing biasanya berarti ada masalah di teknik jahit atau spesifikasi yang kurang jelas ke operator.",
      deadlineImpact: "Perlu waktu tambahan buat repair/sewing ulang, yang artinya jadwal pengiriman sample bisa mundur.",
      pic: "Chamim (Technical Sewing) & Munadi (QC)",
      solution: "Cek detail teknik jahit yang sering salah, mungkin perlu training singkat ke operator terkait atau perjelas spec di techpack.",
      affectedCount: sewingOutliers.length
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
  WORKING_DAYS_PER_WEEK,
  dailyCuttingCapacity,
  dailySewingCapacity,
  matchTeamKey
};
