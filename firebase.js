import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, getIdToken } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getDatabase, ref, get, set, update, push, remove, query, orderByChild, equalTo } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';

const firebaseConfig = {
  apiKey: 'AIzaSyACT86jRZzbIoRu03zmdak5fvWVmiRef14',
  authDomain: 'drali-f6b14.firebaseapp.com',
  databaseURL: 'https://drali-f6b14-default-rtdb.firebaseio.com',
  projectId: 'drali-f6b14',
  storageBucket: 'drali-f6b14.firebasestorage.app',
  messagingSenderId: '726312902342',
  appId: '1:726312902342:web:2bede86bf9ca3baeed81c7',
  measurementId: 'G-VGC2C6VXR2'
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
export const call = (name, data = {}) => httpsCallable(functions, name)(data);
export { onAuthStateChanged, signInWithEmailAndPassword, signOut, getIdToken, ref, get, set, update, push, remove, query, orderByChild, equalTo, storageRef, uploadBytes, getDownloadURL };
