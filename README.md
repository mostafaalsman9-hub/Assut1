# علوم الرياضة أسيوط

منصة Web Application + PWA مبنية على Firebase، بأربعة أدوار: OWNER / ADMIN / SUB-ADMIN / STUDENT.

## Firebase المستخدم
المشروع: `drali-f6b14`

ملف الواجهة يستخدم Firebase Web SDK modular API. إعداد Firebase Web الظاهر في `js/firebase.js` هو إعداد عميل وليس سرًا؛ لا تضع Service Account أو Telegram Bot Token داخل GitHub. Firebase توصي بالـ modular API للتطبيقات الحديثة، كما أن إعداد Auth وRealtime Database يتم عبر `initializeApp` ثم خدمات Firebase المناسبة. 

## قبل الرفع
1. في Firebase Authentication فعّل Email/Password.
2. تأكد أن الحسابات والبيانات موجودة في مشروع `drali-f6b14`.
3. انشر Rules وFunctions وHosting من جذر المشروع.
4. ضع Telegram secrets باستخدام Firebase CLI، وليس في الملفات.

## تثبيت Firebase CLI
```bash
npm install -g firebase-tools
firebase login
```

## نشر المشروع
```bash
firebase use drali-f6b14
firebase deploy --only database,storage,functions,hosting
```

Firebase Hosting ينشر الملفات الثابتة عبر SSL، ويمكن نشر Hosting وحده باستخدام `firebase deploy --only hosting`، بينما يمكن نشر functions/rules معه أو بشكل منفصل. 

## GitHub
أنشئ Repository جديدًا ثم:
```bash
git init
git add .
git commit -m "Initial production release"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### GitHub Actions
يمكن ربط المستودع بـ Firebase Hosting من Firebase Console، أو استخدام GitHub Actions. لا ترفع Service Account JSON أو أي secret إلى المستودع. استخدم GitHub Actions Secret باسم `FIREBASE_SERVICE_ACCOUNT` إذا اخترت workflow يعتمد على Service Account.

## Telegram
قبل تشغيل الوظيفة:
```bash
firebase functions:secrets:set TELEGRAM_BOT_TOKEN
firebase functions:secrets:set TELEGRAM_CHAT_ID
```
ثم:
```bash
firebase deploy --only functions
```

## ملاحظات أمنية
- كلمات المرور لا تُخزن في Realtime Database؛ Firebase Authentication يتولى تخزينها.
- صلاحيات الكتابة الإدارية الحساسة تمر عبر Cloud Functions/Admin SDK.
- Storage يستخدم custom claim `role=OWNER` للرفع والحذف. عند أول تسجيل دخول، الواجهة تستدعي `refreshClaims` لتحديث الـ claim للحساب الموجود.
- Realtime Database Rules لا تعمل كـ filter؛ لذلك الواجهة تستخدم مسارات/استعلامات تتوافق مع قواعد الوصول.
- Firebase توصي باختبار Rules بشكل أعمق باستخدام Local Emulator Suite قبل فتح التطبيق للعامة.
