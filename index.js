const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.database();
const auth = admin.auth();
const TELEGRAM_BOT_TOKEN = defineSecret('TELEGRAM_BOT_TOKEN');
const TELEGRAM_CHAT_ID = defineSecret('TELEGRAM_CHAT_ID');

const ROLES = new Set(['OWNER', 'ADMIN', 'SUB-ADMIN', 'STUDENT']);
const ACTIVE = 'ACTIVE';

function requireAuth(req) {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
  return req.auth.uid;
}

async function getProfile(uid) {
  const snap = await db.ref(`users/${uid}`).get();
  if (!snap.exists()) throw new HttpsError('permission-denied', 'ملف الصلاحيات غير موجود.');
  return snap.val();
}

async function requireRole(uid, roles) {
  const p = await getProfile(uid);
  if (!roles.includes(p.role) || p.status !== ACTIVE) throw new HttpsError('permission-denied', 'ليس لديك صلاحية لهذه العملية.');
  return p;
}

function cleanString(v, max = 200) {
  const s = String(v ?? '').trim();
  if (!s || s.length > max) throw new HttpsError('invalid-argument', 'بيانات غير صالحة.');
  return s;
}

exports.health = onCall(() => ({ ok: true, service: 'علوم الرياضة أسيوط' }));

exports.refreshClaims = onCall(async (req) => {
  const uid = requireAuth(req);
  const p = await getProfile(uid);
  if (!ROLES.has(p.role)) throw new HttpsError('permission-denied', 'دور غير صالح.');
  await auth.setCustomUserClaims(uid, { role: p.role, status: p.status });
  return { ok: true, role: p.role };
});

exports.registerStudent = onCall(async (req) => {
  const name = cleanString(req.data?.name);
  const phone = cleanString(req.data?.phone, 30);
  const email = cleanString(req.data?.email, 320).toLowerCase();
  const password = String(req.data?.password ?? '');
  if (password.length < 8) throw new HttpsError('invalid-argument', 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.');

  let user;
  try {
    user = await auth.createUser({ email, password, displayName: name });
  } catch (e) {
    if (e.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'البريد الإلكتروني مستخدم بالفعل.');
    throw new HttpsError('invalid-argument', e.message || 'تعذر إنشاء الحساب.');
  }

  const now = Date.now();
  const profile = {
    uid: user.uid, name, phone, email, role: 'STUDENT', status: 'PENDING',
    schoolId: '', groupId: '', enrollmentStatus: 'PENDING', createdAt: now
  };
  await db.ref().update({
    [`users/${user.uid}`]: { name, email, phone, role: 'STUDENT', status: 'PENDING', createdAt: now },
    [`students/${user.uid}`]: profile,
    [`adminRequests/${user.uid}`]: null
  });
  return { ok: true, uid: user.uid, status: 'PENDING' };
});

exports.createStudentByAdmin = onCall(async (req) => {
  const uid = requireAuth(req);
  const actor = await requireRole(uid, ['OWNER', 'ADMIN']);
  const name = cleanString(req.data?.name);
  const phone = cleanString(req.data?.phone, 30);
  const email = cleanString(req.data?.email, 320).toLowerCase();
  const password = String(req.data?.password ?? '');
  const schoolId = cleanString(req.data?.schoolId, 100);
  const groupId = cleanString(req.data?.groupId, 100);
  if (password.length < 8) throw new HttpsError('invalid-argument', 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
  const school = await db.ref(`schools/${schoolId}`).get();
  const group = await db.ref(`groups/${groupId}`).get();
  if (!school.exists() || !group.exists() || group.val().schoolId !== schoolId) throw new HttpsError('invalid-argument', 'المدرسة والمجموعة غير متطابقتين.');
  if (actor.role === 'ADMIN') {
    const scope = await db.ref(`adminScopes/${uid}/schools/${schoolId}`).get();
    if (scope.val() !== true) throw new HttpsError('permission-denied', 'لا تملك نطاق هذه المدرسة.');
  }
  let user;
  try { user = await auth.createUser({ email, password, displayName: name }); }
  catch (e) { if (e.code === 'auth/email-already-exists') throw new HttpsError('already-exists','البريد الإلكتروني مستخدم بالفعل.'); throw new HttpsError('invalid-argument', e.message); }
  const now = Date.now();
  await db.ref().update({
    [`users/${user.uid}`]: { name,email,phone,role:'STUDENT',status:'PENDING',schoolId,groupId,createdAt:now },
    [`students/${user.uid}`]: { uid:user.uid,name,email,phone,role:'STUDENT',status:'PENDING',schoolId,groupId,enrollmentStatus:'PENDING',createdAt:now },
    [`schoolStudents/${schoolId}/${user.uid}`]: true,
    [`groupStudents/${groupId}/${user.uid}`]: true
  });
  return { ok:true, uid:user.uid, status:'PENDING' };
});

exports.approveStudent = onCall(async (req) => {
  const uid = requireAuth(req); await requireRole(uid, ['OWNER']);
  const studentId = cleanString(req.data?.studentId, 128);
  const s = await db.ref(`students/${studentId}`).get();
  if (!s.exists()) throw new HttpsError('not-found','الطالب غير موجود.');
  const old = s.val();
  const schoolId = String(req.data?.schoolId ?? old.schoolId ?? '');
  const groupId = String(req.data?.groupId ?? old.groupId ?? '');
  if (!schoolId || !groupId) throw new HttpsError('invalid-argument','اختر المدرسة والمجموعة قبل الاعتماد.');
  const group = await db.ref(`groups/${groupId}`).get();
  if (!group.exists() || group.val().schoolId !== schoolId) throw new HttpsError('invalid-argument','المجموعة لا تتبع المدرسة.');
  const now = Date.now();
  await db.ref().update({
    [`students/${studentId}/status`]: 'ACTIVE', [`students/${studentId}/schoolId`]: schoolId, [`students/${studentId}/groupId`]: groupId, [`students/${studentId}/enrollmentStatus`]: 'ACTIVE',
    [`users/${studentId}/status`]: 'ACTIVE', [`users/${studentId}/schoolId`]: schoolId, [`users/${studentId}/groupId`]: groupId,
    [`schoolStudents/${schoolId}/${studentId}`]: true, [`groupStudents/${groupId}/${studentId}`]: true,
    [`notifications/${db.ref('notifications').push().key}`]: { title:'تم قبول تسجيلك', body:'تم اعتماد حسابك ويمكنك الآن استخدام المنصة.', type:'GENERAL', targetUserId:studentId, read:false, createdAt:now },
    [`auditLogs/${db.ref('auditLogs').push().key}`]: { performedBy:uid, performedByRole:'OWNER', action:'APPROVE_STUDENT', targetType:'STUDENT', targetId:studentId, oldValue:old.status||'PENDING', newValue:'ACTIVE', timestamp:now }
  });
  await auth.setCustomUserClaims(studentId, { role:'STUDENT', status:'ACTIVE' });
  return { ok:true };
});

exports.rejectStudent = onCall(async (req) => {
  const uid = requireAuth(req); await requireRole(uid, ['OWNER']);
  const studentId = cleanString(req.data?.studentId,128);
  const s=await db.ref(`students/${studentId}`).get(); if(!s.exists()) throw new HttpsError('not-found','الطالب غير موجود.');
  const now=Date.now();
  await db.ref().update({[`students/${studentId}/status`]:'DISABLED',[`users/${studentId}/status`]:'DISABLED',[`auditLogs/${db.ref('auditLogs').push().key}`]:{performedBy:uid,performedByRole:'OWNER',action:'REJECT_STUDENT',targetType:'STUDENT',targetId:studentId,timestamp:now}});
  return {ok:true};
});

exports.requestAdmin = onCall(async (req) => {
  const uid=requireAuth(req); const actor=await requireRole(uid,['OWNER','ADMIN']);
  const requestedRole=String(req.data?.requestedRole||'ADMIN');
  if(requestedRole!=='ADMIN') throw new HttpsError('invalid-argument','طلب Admin فقط عبر هذا المسار.');
  const name=cleanString(req.data?.name), email=cleanString(req.data?.email,320).toLowerCase(), phone=cleanString(req.data?.phone,30);
  const id=db.ref('adminRequests').push().key; const now=Date.now();
  await db.ref(`adminRequests/${id}`).set({name,email,phone,requestedRole:'ADMIN',status:'PENDING',requestedBy:uid,requestedByRole:actor.role,createdAt:now});
  return {ok:true,requestId:id};
});

exports.approveAdminRequest = onCall(async (req) => {
  const uid=requireAuth(req); await requireRole(uid,['OWNER']);
  const requestId=cleanString(req.data?.requestId,128), password=String(req.data?.password||'');
  if(password.length<8) throw new HttpsError('invalid-argument','كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
  const snap=await db.ref(`adminRequests/${requestId}`).get(); if(!snap.exists()) throw new HttpsError('not-found','الطلب غير موجود.');
  const r=snap.val(); if(r.status!=='PENDING') throw new HttpsError('failed-precondition','الطلب تمت معالجته بالفعل.');
  let user; try{user=await auth.createUser({email:r.email,password,displayName:r.name});}catch(e){if(e.code==='auth/email-already-exists')throw new HttpsError('already-exists','البريد مستخدم بالفعل.');throw new HttpsError('invalid-argument',e.message);}
  const now=Date.now();
  await db.ref().update({[`users/${user.uid}`]:{name:r.name,email:r.email,phone:r.phone,role:'ADMIN',status:'ACTIVE',createdAt:now},[`adminRequests/${requestId}/status`]:'APPROVED',[`adminRequests/${requestId}/approvedBy`]:uid,[`adminRequests/${requestId}/approvedAt`]:now,[`auditLogs/${db.ref('auditLogs').push().key}`]:{performedBy:uid,performedByRole:'OWNER',action:'APPROVE_ADMIN',targetType:'ADMIN_REQUEST',targetId:requestId,timestamp:now}});
  await auth.setCustomUserClaims(user.uid,{role:'ADMIN',status:'ACTIVE'});
  return {ok:true,uid:user.uid};
});

exports.createSubAdmin = onCall(async (req) => {
  const uid=requireAuth(req); await requireRole(uid,['OWNER']);
  const name=cleanString(req.data?.name),email=cleanString(req.data?.email,320).toLowerCase(),phone=cleanString(req.data?.phone,30),password=String(req.data?.password||''),schoolId=cleanString(req.data?.schoolId,100),groupId=cleanString(req.data?.groupId,100);
  if(password.length<8) throw new HttpsError('invalid-argument','كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
  const g=await db.ref(`groups/${groupId}`).get(); if(!g.exists()||g.val().schoolId!==schoolId) throw new HttpsError('invalid-argument','المجموعة لا تتبع المدرسة.');
  let user;try{user=await auth.createUser({email,password,displayName:name});}catch(e){if(e.code==='auth/email-already-exists')throw new HttpsError('already-exists','البريد مستخدم بالفعل.');throw new HttpsError('invalid-argument',e.message);}
  const now=Date.now();await db.ref().update({[`users/${user.uid}`]:{name,email,phone,role:'SUB-ADMIN',status:'ACTIVE',schoolId,groupId,createdAt:now},[`subAdmins/${user.uid}`]:{uid:user.uid,name,email,phone,role:'SUB-ADMIN',status:'ACTIVE',schoolId,groupId,createdAt:now},[`adminScopes/${user.uid}/groups/${groupId}`]:true,[`auditLogs/${db.ref('auditLogs').push().key}`]:{performedBy:uid,performedByRole:'OWNER',action:'CREATE_SUB_ADMIN',targetType:'SUB_ADMIN',targetId:user.uid,timestamp:now}});await auth.setCustomUserClaims(user.uid,{role:'SUB-ADMIN',status:'ACTIVE'});return{ok:true,uid:user.uid};
});

exports.createAttendanceSession = onCall(async (req)=>{const uid=requireAuth(req);const actor=await requireRole(uid,['OWNER','ADMIN','SUB-ADMIN']);const subjectId=cleanString(req.data?.subjectId,100),groupId=cleanString(req.data?.groupId,100),schoolId=cleanString(req.data?.schoolId,100),date=cleanString(req.data?.date,20),startTime=cleanString(req.data?.startTime,10),endTime=cleanString(req.data?.endTime,10);if(actor.role==='ADMIN'){const scope=await db.ref(`adminScopes/${uid}/schools/${schoolId}`).get();if(scope.val()!==true)throw new HttpsError('permission-denied','لا تملك نطاق المدرسة.');}if(actor.role==='SUB-ADMIN'&&actor.groupId!==groupId)throw new HttpsError('permission-denied','هذه المجموعة ليست ضمن نطاقك.');const g=await db.ref(`groups/${groupId}`).get();if(!g.exists()||g.val().schoolId!==schoolId)throw new HttpsError('invalid-argument','المجموعة والمدرسة غير متطابقتين.');const id=db.ref('attendanceSessions').push().key,now=Date.now();await db.ref(`attendanceSessions/${id}`).set({subjectId,groupId,schoolId,date,startTime,endTime,status:'OPEN',createdBy:uid,createdAt:now});return{ok:true,sessionId:id};});

exports.recordAttendance = onCall(async(req)=>{const uid=requireAuth(req);const actor=await requireRole(uid,['OWNER','ADMIN','SUB-ADMIN']);const sessionId=cleanString(req.data?.sessionId,128),studentId=cleanString(req.data?.studentId,128),status=String(req.data?.status||'');if(!['PRESENT','ABSENT','LATE'].includes(status))throw new HttpsError('invalid-argument','حالة حضور غير صالحة.');const [ss,st]=await Promise.all([db.ref(`attendanceSessions/${sessionId}`).get(),db.ref(`students/${studentId}`).get()]);if(!ss.exists()||!st.exists())throw new HttpsError('not-found','الجلسة أو الطالب غير موجود.');const session=ss.val(),student=st.val();if(session.status!=='OPEN')throw new HttpsError('failed-precondition','جلسة الحضور مغلقة.');if(session.groupId!==student.groupId||session.schoolId!==student.schoolId)throw new HttpsError('permission-denied','الطالب ليس ضمن نطاق الجلسة.');if(actor.role==='ADMIN'){const scope=await db.ref(`adminScopes/${uid}/schools/${student.schoolId}`).get();if(scope.val()!==true)throw new HttpsError('permission-denied','لا تملك نطاق المدرسة.');}if(actor.role==='SUB-ADMIN'&&actor.groupId!==student.groupId)throw new HttpsError('permission-denied','الطالب خارج مجموعتك.');const target=db.ref(`attendance/${sessionId}/${studentId}`);if((await target.get()).exists())throw new HttpsError('already-exists','تم تسجيل الطالب لهذه الجلسة بالفعل.');const now=Date.now();await target.set({studentId,groupId:student.groupId,schoolId:student.schoolId,subjectId:session.subjectId,status,recordedBy:uid,recordedByRole:actor.role,createdAt:now});await db.ref(`auditLogs/${db.ref('auditLogs').push().key}`).set({performedBy:uid,performedByRole:actor.role,action:'RECORD_ATTENDANCE',targetType:'ATTENDANCE',targetId:`${sessionId}/${studentId}`,newValue:status,timestamp:now});return{ok:true};});

exports.sendTelegram = onCall({secrets:[TELEGRAM_BOT_TOKEN,TELEGRAM_CHAT_ID]},async(req)=>{const uid=requireAuth(req);await requireRole(uid,['OWNER']);const text=cleanString(req.data?.text,4000);const r=await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN.value()}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:TELEGRAM_CHAT_ID.value(),text})});if(!r.ok)throw new HttpsError('internal','فشل إرسال Telegram.');return await r.json();});
