/* Firebase messaging worker uses the corrected filename expected by Firebase. */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyACT86jRZzbIoRu03zmdak5fvWVmiRef14',
  authDomain: 'drali-f6b14.firebaseapp.com',
  databaseURL: 'https://drali-f6b14-default-rtdb.firebaseio.com',
  projectId: 'drali-f6b14',
  storageBucket: 'drali-f6b14.firebasestorage.app',
  messagingSenderId: '726312902342',
  appId: '1:726312902342:web:2bede86bf9ca3baeed81c7',
});

const messaging = firebase.messaging();
messaging.onBackgroundMessage(() => undefined);