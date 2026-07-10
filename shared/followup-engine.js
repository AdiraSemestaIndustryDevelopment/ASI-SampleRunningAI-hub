// ============================================================
// FOLLOWUP-ENGINE.JS — deteksi hal yang seharusnya sudah diterima
// tapi belum, lalu catat siapa PIC yang perlu di-follow up.
//
// 2 sumber follow-up:
// 1. Aturan dari sheet WIP utama (RULES) -> PIC ditentukan dari
//    lokasi/team (Kopo -> Wiji, Katapang -> Vanny).
// 2. Status proses nyata dari 6 log kerja spesialis (Artwork, Mutoh,
//    Pattern, 3D, M4) via process-log-engine -> PIC ditentukan dari
//    siapa yang benar-benar pegang proses itu (Tendi, Yogie, Ase,
//    Reza, Adhi, Rachmat), bukan tebakan lagi.
// ============================================================

import { db } from "./firebase-config.js";
import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { checkProcessStatusForItem } from "./process-log-engine.js";

const TEAM_PIC_MAP = { kopo: "Wiji", katapang: "Vanny" };
const DEFAULT_PIC = "Vanny & Wiji";

function resolvePicByTeam(item) {
  const normalized = String(item.team || "").trim().toLowerCase();
  if (normalized.includes("kopo")) return TEAM_PIC_MAP.kopo;
  if (normalized.includes("katapang")) return TEAM_PIC_MAP.katapang;
  return DEFAULT_PIC;
}

const RULES = [
  {
    id: "missing_techpack",
    label: "Techpack belum diterima dari Sample Room",
    check: (item) => {
      const receivedDate = item.tgl_md_terima_techpack;
      const smiMeetingDate = item.smi_meeting;
      return smiMeetingDate && !receivedDate;
    }
  },
  {
    id: "missing_buyer_comment",
    label: "Trial sudah selesai, menunggu comment buyer",
    check: (item) => {
      const trialDone = item.trial && String(item.trial).trim() !== "";
      const buyerCommented = item.tgl_comment_buyer && String(item.tgl_comment_buyer).trim() !== "";
      return trialDone && !buyerCommented;
    }
  },
  {
    id: "material_shortage_unresolved",
    label: "Material kurang, belum ada update penyelesaian",
    check: (item) => {
      const hasNote = item.note_kurang_material && String(item.note_kurang_material).trim() !== "";
      const resolved = item.tgl_persiapan_material_selesai && String(item.tgl_persiapan_material_selesai).trim() !== "";
      return hasNote && !resolved;
    }
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
    }
  }
];

/**
 * Follow-up dari sheet WIP utama saja (rule lama).
 */
function detectFollowUpsFromWip(item) {
  const results = [];
  const pic = resolvePicByTeam(item);

  RULES.forEach(rule => {
    if (rule.check(item)) {
      results.push({
        ruleId: rule.id,
        label: rule.label,
        assignedTo: pic,
        team: item.team || "-",
        smiId: item.no_smi || item._sourceRow,
        style: item.style || "-",
        source: "wip"
      });
    }
  });
  return results;
}

/**
 * Follow-up dari log proses nyata (Artwork/Mutoh/Pattern/3D/M4).
 * Hanya yang SUDAH LEWAT TARGET yang dianggap "perlu follow-up" —
 * yang belum jatuh tempo tidak masuk sini (supaya tidak jadi noise),
 * tapi tetap kelihatan di panel "Status Proses Nyata".
 */
function detectFollowUpsFromProcessLogs(item) {
  const findings = checkProcessStatusForItem(item).filter(f => f.isOverdue);
  return findings.map(f => ({
    ruleId: `process_${f.process.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    label: `${f.process} belum selesai, sudah lewat target (${f.sampleTarget || "-"})${f.matchType === "style" ? " — match by nama Style" : ""}`,
    assignedTo: f.pic,
    team: item.team || "-",
    smiId: item.no_smi || item._sourceRow,
    style: item.style || "-",
    source: "process_log",
    matchType: f.matchType
  }));
}

/**
 * Gabungan follow-up dari kedua sumber, untuk 1 item WIP.
 */
function detectFollowUps(item) {
  return [...detectFollowUpsFromWip(item), ...detectFollowUpsFromProcessLogs(item)];
}

/**
 * Jalankan ke semua item, simpan hasilnya ke Firestore collection "followups".
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

export { detectFollowUps, detectFollowUpsFromWip, detectFollowUpsFromProcessLogs, runFollowUpScan, RULES, TEAM_PIC_MAP, resolvePicByTeam };
