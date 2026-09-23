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

const CACHE_NAME = 'sports-science-shell-v1';
const APP_SHELL = [
  './index_1790170758187.html',
  './styles_1790170758134.css',
  './site-enhancements_1790173985002.css',
  './site-enhancements_1790173985001.js',
  './manifest_1790173985000.webmanifest',
  './IMG_20260923_173158_131_1790173983819.jpg',
  './IMG_20260923_173158_835_1790173983531.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) =>
      cached ||
      fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
    )
  );
});