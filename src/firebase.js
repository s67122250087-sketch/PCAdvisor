import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBTQDor-uoW5I9OX6n_p__6FwF13KGTdJc",
  authDomain: "pcadvisor-7e1f4.firebaseapp.com",
  databaseURL: "https://pcadvisor-7e1f4-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "pcadvisor-7e1f4",
  storageBucket: "pcadvisor-7e1f4.firebasestorage.app",
  messagingSenderId: "951405742679",
  appId: "1:951405742679:web:342e70e0862f5fde95b112",
  measurementId: "G-9RXHTKT65F"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const database = getDatabase(app);
export const firestore = getFirestore(app);
