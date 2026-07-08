// ============================================================
// FIREBASE CONFIG — GANTI dengan config project Firebase Bapak
// (Firebase Console > Project Settings > General > Your apps > SDK setup)
// File ini di-share oleh SEMUA app (hub + sample-wip-agent + app lain nanti)
// ============================================================

// TODO: ganti seluruh object di bawah ini dengan punya Bapak sendiri
const firebaseConfig = {
  apiKey: "GANTI_DENGAN_API_KEY",
  authDomain: "GANTI.firebaseapp.com",
  projectId: "GANTI_PROJECT_ID",
  storageBucket: "GANTI.appspot.com",
  messagingSenderId: "GANTI",
  appId: "GANTI"
};

// Inisialisasi Firebase (pakai Firebase v10 modular SDK dari CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

export { app, auth, db, googleProvider };
