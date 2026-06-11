// ===================================
//  firebase-config.js
// ===================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore }   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage }     from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey:            "AIzaSyAWWMgVV3_e1Pb1ql0aqILOHIRlFfoYj1o",
  authDomain:        "wan-wai-kru.firebaseapp.com",
  projectId:         "wan-wai-kru",
  storageBucket:     "wan-wai-kru.appspot.com",
  messagingSenderId: "1051443987649",
  appId:             "1:1051443987649:web:1234567890abcdef",
  measurementId:     "G-Z45WPCVEEB"
};

const app = initializeApp(firebaseConfig);
export const db      = getFirestore(app);
export const storage = getStorage(app);