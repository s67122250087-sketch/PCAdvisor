import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBTQDor-uoW5I9OX6n_p__6FwF13KGTdJc",
  authDomain: "pcadvisor-7e1f4.firebaseapp.com",
  projectId: "pcadvisor-7e1f4",
  storageBucket: "pcadvisor-7e1f4.firebasestorage.app",
  messagingSenderId: "951405742679",
  appId: "1:951405742679:web:342e70e0862f5fde95b112",
  measurementId: "G-9RXHTKT65F"
};

const firebaseApp = initializeApp(firebaseConfig);

export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
