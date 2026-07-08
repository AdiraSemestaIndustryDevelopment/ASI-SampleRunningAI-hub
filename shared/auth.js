// ============================================================
// AUTH.JS — Login Google + cek whitelist role di Firestore
// Dipakai oleh hub dan semua app di dalamnya.
//
// Struktur Firestore yang dipakai:
// collection "users" -> document ID = email user (misal: "juan@gmail.com")
//   { name: "Juan", role: "admin", allowedApps: ["sample-wip-agent"] }
//
// role yang dikenali: "admin" (PIC utama, bisa edit + lihat semua)
//                     "viewer" (staff/operator lain, hanya lihat)
// ============================================================

import { auth, db, googleProvider } from "./firebase-config.js";
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Login pakai Google Account.
 * Setelah login, otomatis dicek apakah email ada di whitelist "users".
 * Kalau TIDAK ada di whitelist -> otomatis logout + reject.
 */
async function loginWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  const email = result.user.email;

  const userDoc = await getDoc(doc(db, "users", email));

  if (!userDoc.exists()) {
    await signOut(auth);
    throw new Error(
      `Email ${email} belum terdaftar di sistem. Hubungi Admin (Juan/Arlita) untuk didaftarkan.`
    );
  }

  return { email, ...userDoc.data() };
}

function logout() {
  return signOut(auth);
}

/**
 * Dipanggil di setiap halaman (hub & tiap app) untuk menjaga sesi.
 * callback(userProfile | null) dipanggil setiap kali status login berubah.
 */
function watchAuthState(callback) {
  onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) {
      callback(null);
      return;
    }
    const userDoc = await getDoc(doc(db, "users", firebaseUser.email));
    if (!userDoc.exists()) {
      // Ada di Firebase Auth tapi tidak di whitelist Firestore -> tolak
      await signOut(auth);
      callback(null);
      return;
    }
    callback({ email: firebaseUser.email, ...userDoc.data() });
  });
}

export { loginWithGoogle, logout, watchAuthState };
