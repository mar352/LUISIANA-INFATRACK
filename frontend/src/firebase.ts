import { initializeApp } from "firebase/app";
import { getFirestore, collection } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDvFfBmwRh8q_WDhb50QmCagGTAwwq6FgU",
  authDomain: "infa-track.firebaseapp.com",
  projectId: "infa-track",
  storageBucket: "infa-track.firebasestorage.app",
  messagingSenderId: "926643345254",
  appId: "1:926643345254:web:80f24a4fbbdfc53cfd1aa7",
  measurementId: "G-7HFR8KDX9E",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const projectsCollection = collection(db, "projects");
export const proposalsCollection = collection(db, "proposals");
export const planningEventsCollection = collection(db, "planningEvents");
export const planningMeetingsCollection = collection(db, "planningMeetings");
export const documentsCollection = collection(db, "documents");
export const auditLogsCollection = collection(db, "auditLogs");
export const sessionsCollection = collection(db, "sessions");
