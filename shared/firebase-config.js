// ============================================================
// FIREBASE CONFIG — GANTI dengan config project Firebase Bapak
// (Firebase Console > Project Settings > General > Your apps > SDK setup)
// File ini di-share oleh SEMUA app (hub + sample-wip-agent + app lain nanti)
// ============================================================

// TODO: ganti seluruh object di bawah ini dengan punya Bapak sendiri
const firebaseConfig = {
  apiKey: "AIzaSyA8gFrWdXGIj-Jdu-DBm3xiv6PxoNYcFZk",
  authDomain: "asi-samplerunningai-hub.firebaseapp.com",
  projectId: "asi-samplerunningai-hub",
  storageBucket: "asi-samplerunningai-hub.firebasestorage.app",
  messagingSenderId: "962893895422",
  appId: "1:962893895422:web:7680842eaaadfca447b7af"
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
