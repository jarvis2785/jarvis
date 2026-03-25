// Import the functions you need from the SDKs you need
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBmyZXZurNVvm8PwMHIu2cZQD4jAuXAEG0",
  authDomain: "sign-in-14650.firebaseapp.com",
  projectId: "sign-in-14650",
  storageBucket: "sign-in-14650.firebasestorage.app",
  messagingSenderId: "898166807306",
  appId: "1:898166807306:web:a7e77d637346461848f8f3",
  measurementId: "G-7F125HRS8V"
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
auth.useDeviceLanguage();

export { auth };