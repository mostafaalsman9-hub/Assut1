const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {onRequest}=require('firebase-functions/v2/https');
const admin=require('firebase-admin');
admin.initializeApp();
const db=admin.database();
const auth=admin.auth();
const now=()=>Date.now();
function requireAuth(req){if(!req.auth)throw new HttpsError('unauthenticated','يجب تسجيل الدخول.');return req.auth;}
function role(req){return req.auth?.token?.role||'';}
function requireRole(req,roles){requireAuth(req);if(!roles.includes(role(req)))throw new HttpsError('permission-denied','ليس لديك صلاحية لتنفيذ هذه العملية.');}
function clean(v){return String(v??'').trim();}
function validEmail(v){return /^\S+@\S+\.\S+$/.test(v);}
function validPassword(v){return typeof v==='string'&&v.length>=8;}
function validPhone(v){return /^\+?[0-9 ()-]{7,20}$/.test(String(v||''));}
async function hasSchoolScope(uid,schoolId){const x=(await db.ref(`adminScopes/${uid}/schools/${schoolId}`).get()).val();return x===true;}
async function hasGroupScope(uid,groupId){const x=(await db.ref(`adminScopes/${uid}/groups/${groupId}`).get()).val();return x===true;}
function validCatalog(c){return ['schools','groups','subjects'].includes(c);}
async function writeAudit(uid,r,a,t,id,oldValue,newValue){const key=db.ref('auditLogs').push().key;await db.ref('auditLogs/'+key).set({performedBy:uid,performedByRole:r,action:a,targetType:t,targetId:id,oldValue:oldValue??null,newValue:newValue??null,timestamp:now()});}
async function setClaims(uid,data){await auth.setCustomUserClaims(uid,data);}

exports.registerStudent=onCall(async(req)=>{
  const d=req.data||{}; const name=clean(d.name),phone=clean(d.phone),email=clean(d.email).toLowerCase(),password=d.password;
  if(!name||!validEmail(email)||!validPhone(phone)||!validPassword(password))throw new HttpsError('invalid-argument','بيانات التسجيل غير صحيحة.');
  const u=await auth.createUser({email,password,displayName:name});
  await db.ref('users/'+u.uid).set({name,phone,email,role:'STUDENT',status:'PENDING',createdAt:now(),updatedAt:now()});
  await db.ref('students/'+u.uid).set({name,phone,email,status:'PENDING',createdAt:now(),updatedAt:now()});
  return {ok:true,uid:u.uid,status:'PENDING'};
});

exports.createStudentByAdmin=onCall(async(req)=>{
  requireRole(req,['OWNER','ADMIN']); const d=req.data||{};
  const name=clean(d.name),phone=clean(d.phone),email=clean(d.email).toLowerCase(),password=d.password,schoolId=clean(d.schoolId),groupId=clean(d.groupId);
  if(!name||!validEmail(email)||!validPhone(phone)||!validPassword(password)||!schoolId||!groupId)throw new HttpsError('invalid-argument','بيانات الطالب غير مكتملة.');
  if(role(req)==='ADMIN' && !(await hasSchoolScope(req.auth.uid,schoolId)))throw new HttpsError('permission-denied','المدرسة خارج نطاقك.');
  const group=(await db.ref(`groups/${groupId}`).get()).val(); if(!group||group.schoolId!==schoolId)throw new HttpsError('invalid-argument','المجموعة لا تتبع المدرسة المحددة.');
  const u=await auth.createUser({email,password,displayName:name});
  const status='PENDING';
  const student={name,phone,email,schoolId,groupId,status,createdAt:now(),createdBy:req.auth.uid};
  await db.ref('users/'+u.uid).set({name,phone,email,role:'STUDENT',status,createdAt:now(),updatedAt:now()});
  await db.ref('students/'+u.uid).set(student);
  return {ok:true,uid:u.uid,status};
});

exports.approveStudent=onCall(async(req)=>{
  requireRole(req,['OWNER']); const uid=clean(req.data?.uid),schoolId=clean(req.data?.schoolId),groupId=clean(req.data?.groupId); if(!uid||!schoolId||!groupId)throw new HttpsError('invalid-argument','بيانات الاعتماد غير مكتملة.');
  const s=(await db.ref('students/'+uid).get()).val(); const u=(await db.ref('users/'+uid).get()).val(); if(!s||!u)throw new HttpsError('not-found','الطالب غير موجود.');
  const group=(await db.ref(`groups/${groupId}`).get()).val(); if(!group||group.schoolId!==schoolId)throw new HttpsError('invalid-argument','المجموعة لا تتبع المدرسة المحددة.'); await db.ref('students/'+uid).update({status:'ACTIVE',schoolId,groupId,updatedAt:now()}); await db.ref('users/'+uid).update({status:'ACTIVE',updatedAt:now()}); await setClaims(uid,{role:'STUDENT'}); await writeAudit(req.auth.uid,'OWNER','APPROVE','STUDENT',uid,{status:'PENDING'},{status:'ACTIVE'}); return {ok:true};
});
exports.rejectStudent=onCall(async(req)=>{
  requireRole(req,['OWNER']); const uid=clean(req.data?.uid),schoolId=clean(req.data?.schoolId),groupId=clean(req.data?.groupId); if(!uid||!schoolId||!groupId)throw new HttpsError('invalid-argument','بيانات الاعتماد غير مكتملة.');
  await db.ref('students/'+uid).update({status:'REJECTED',updatedAt:now()}); await db.ref('users/'+uid).update({status:'REJECTED',updatedAt:now()}); return {ok:true};
});

exports.requestAdmin=onCall(async(req)=>{
  requireAuth(req); const d=req.data||{}; const name=clean(d.name),email=clean(d.email).toLowerCase(),phone=clean(d.phone),password=d.password;
  if(!name||!validEmail(email)||!validPassword(password))throw new HttpsError('invalid-argument','بيانات الطلب غير صحيحة.');
  const key=db.ref('adminRequests').push().key; await db.ref('adminRequests/'+key).set({name,email,phone,status:'PENDING',requestedBy:req.auth.uid,createdAt:now()});
  return {ok:true,id:key};
});

exports.approveAdminRequest=onCall(async(req)=>{
  requireRole(req,['OWNER']); const id=clean(req.data?.requestId),password=req.data?.password; if(!id||!validPassword(password))throw new HttpsError('invalid-argument','الطلب أو كلمة المرور غير صحيح.');
  const snap=await db.ref('adminRequests/'+id).get(); const r=snap.val(); if(!r||r.status!=='PENDING')throw new HttpsError('failed-precondition','الطلب غير متاح.');
  const u=await auth.createUser({email:r.email,password,displayName:r.name}); await db.ref('users/'+u.uid).set({name:r.name,email:r.email,phone:r.phone||'',role:'ADMIN',status:'ACTIVE',createdAt:now(),updatedAt:now()}); await setClaims(u.uid,{role:'ADMIN'}); await db.ref('adminRequests/'+id).update({status:'APPROVED',approvedBy:req.auth.uid,approvedAt:now(),uid:u.uid}); await writeAudit(req.auth.uid,'OWNER','APPROVE','ADMIN_REQUEST',id,r,{status:'APPROVED',uid:u.uid}); return {ok:true,uid:u.uid};
});

exports.createSubAdmin=onCall(async(req)=>{
  requireRole(req,['OWNER']); const d=req.data||{}; const name=clean(d.name),email=clean(d.email).toLowerCase(),phone=clean(d.phone),password=d.password,schoolId=clean(d.schoolId),groupId=clean(d.groupId);
  if(!name||!validEmail(email)||!validPassword(password)||!schoolId||!groupId)throw new HttpsError('invalid-argument','بيانات Sub-Admin غير مكتملة.');
  const u=await auth.createUser({email,password,displayName:name}); await db.ref('users/'+u.uid).set({name,email,phone,role:'SUB-ADMIN',status:'ACTIVE',schoolId,groupId,createdAt:now(),updatedAt:now()}); await db.ref('subAdmins/'+u.uid).set({schoolId,groupId,status:'ACTIVE',createdAt:now()}); await db.ref('adminScopes/'+u.uid).set({schools:{[schoolId]:true},groups:{[groupId]:true}}); await setClaims(u.uid,{role:'SUB-ADMIN',schoolId,groupId}); await writeAudit(req.auth.uid,'OWNER','CREATE','SUB-ADMIN',u.uid,null,{name,email,schoolId,groupId}); return {ok:true,uid:u.uid};
});

exports.refreshClaims=onCall(async(req)=>{const a=requireAuth(req); const p=(await db.ref('users/'+a.uid).get()).val(); if(!p||p.status!=='ACTIVE')throw new HttpsError('permission-denied','الحساب غير نشط.'); const c={role:p.role}; if(p.schoolId)c.schoolId=p.schoolId;if(p.groupId)c.groupId=p.groupId; await setClaims(a.uid,c); return {ok:true,claims:c};});

exports.createAttendanceSession=onCall(async(req)=>{requireRole(req,['OWNER','ADMIN','SUB-ADMIN']); const d=req.data||{};const groupId=clean(d.groupId),subjectId=clean(d.subjectId),date=clean(d.date); if(!groupId||!subjectId||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new HttpsError('invalid-argument','بيانات جلسة الحضور غير صحيحة.'); if(new Date(date+'T00:00:00')>new Date())throw new HttpsError('invalid-argument','لا يمكن إنشاء حضور بتاريخ مستقبلي.'); const group=(await db.ref(`groups/${groupId}`).get()).val(); if(!group)throw new HttpsError('not-found','المجموعة غير موجودة.'); if(role(req)==='SUB-ADMIN'&&!(await hasGroupScope(req.auth.uid,groupId)))throw new HttpsError('permission-denied','المجموعة خارج نطاقك.'); if(role(req)==='ADMIN'&&!(await hasSchoolScope(req.auth.uid,group.schoolId)))throw new HttpsError('permission-denied','المدرسة خارج نطاقك.'); const id=db.ref('attendanceSessions').push().key;const x={groupId,subjectId,date,createdBy:req.auth.uid,createdByRole:role(req),createdAt:now(),status:'OPEN'};await db.ref('attendanceSessions/'+id).set(x);return {ok:true,id};});

exports.recordAttendance=onCall(async(req)=>{requireRole(req,['OWNER','ADMIN','SUB-ADMIN']);const d=req.data||{},sessionId=clean(d.sessionId),studentId=clean(d.studentId),status=clean(d.status);if(!sessionId||!studentId||!['PRESENT','ABSENT','LATE'].includes(status))throw new HttpsError('invalid-argument','بيانات الحضور غير صحيحة.');const ss=(await db.ref('attendanceSessions/'+sessionId).get()).val();const st=(await db.ref('students/'+studentId).get()).val();if(!ss||!st)throw new HttpsError('not-found','الجلسة أو الطالب غير موجود.');if(ss.groupId!==st.groupId)throw new HttpsError('permission-denied','الطالب خارج المجموعة.');if(role(req)==='SUB-ADMIN'&&!(await hasGroupScope(req.auth.uid,ss.groupId)))throw new HttpsError('permission-denied','خارج نطاق المجموعة.'); const group=(await db.ref(`groups/${ss.groupId}`).get()).val(); if(role(req)==='ADMIN'&&(!group||!(await hasSchoolScope(req.auth.uid,group.schoolId))))throw new HttpsError('permission-denied','المدرسة خارج نطاقك.');const old=(await db.ref(`attendance/${sessionId}/${studentId}`).get()).val();if(old&&role(req)!=='OWNER')throw new HttpsError('failed-precondition','لا يمكن تعديل حضور مسجل سابقًا.');const x={sessionId,studentId,groupId:ss.groupId,subjectId:ss.subjectId,status,date:ss.date,recordedBy:req.auth.uid,recordedByRole:role(req),updatedAt:now()};await db.ref(`attendance/${sessionId}/${studentId}`).set(x);if(role(req)==='OWNER')await writeAudit(req.auth.uid,'OWNER','UPDATE','ATTENDANCE',`${sessionId}/${studentId}`,old,x);return {ok:true};});

exports.updateGrade=onCall(async(req)=>{requireRole(req,['OWNER']);const d=req.data||{};const id=clean(d.id)||db.ref('grades').push().key;const nums=['coursework','exam','final','percentage'];for(const k of nums){if(d[k]!==undefined&&(!Number.isFinite(Number(d[k]))||Number(d[k])<0||Number(d[k])>100))throw new HttpsError('invalid-argument',`قيمة ${k} غير صحيحة.`);}const x={studentId:clean(d.studentId),subjectId:clean(d.subjectId),coursework:Number(d.coursework||0),exam:Number(d.exam||0),final:Number(d.final||0),percentage:Number(d.percentage||0),grade:clean(d.grade),result:['PASS','FAIL'].includes(d.result)?d.result:'PASS',status:'APPROVED',updatedBy:req.auth.uid,updatedAt:now()};if(!x.studentId||!x.subjectId)throw new HttpsError('invalid-argument','الطالب والمادة مطلوبان.');const old=(await db.ref('grades/'+id).get()).val();await db.ref('grades/'+id).set(x);await writeAudit(req.auth.uid,'OWNER',old?'UPDATE':'CREATE','GRADE',id,old,x);return {ok:true,id};});

exports.getScopedCatalog=onCall(async(req)=>{requireAuth(req);const r=role(req);const schools=(await db.ref('schools').get()).val()||{},groups=(await db.ref('groups').get()).val()||{},subjects=(await db.ref('subjects').get()).val()||{};if(r==='OWNER')return {schools,groups,subjects};const scopeSchools=(await db.ref(`adminScopes/${req.auth.uid}/schools`).get()).val()||{};const scopeGroups=(await db.ref(`adminScopes/${req.auth.uid}/groups`).get()).val()||{};const out={schools:{},groups:{},subjects:{}};for(const [id,x] of Object.entries(schools))if(scopeSchools[id])out.schools[id]=x;for(const [id,x] of Object.entries(groups))if(scopeSchools[x.schoolId]&&(r==='ADMIN'||scopeGroups[id]))out.groups[id]=x;for(const [id,x] of Object.entries(subjects))if(out.groups[x.groupId]||scopeSchools[x.schoolId])out.subjects[id]=x;return out;});
exports.getAttendanceSessions=onCall(async(req)=>{requireAuth(req);const r=role(req),all=(await db.ref('attendanceSessions').get()).val()||{};const out={};for(const [id,x] of Object.entries(all)){let ok=r==='OWNER';if(r==='SUB-ADMIN')ok=await hasGroupScope(req.auth.uid,x.groupId);if(r==='ADMIN'){const g=(await db.ref(`groups/${x.groupId}`).get()).val();ok=!!g&&await hasSchoolScope(req.auth.uid,g.schoolId);}if(r==='STUDENT'){const st=(await db.ref(`students/${req.auth.uid}`).get()).val();ok=!!st&&st.groupId===x.groupId;}if(ok)out[id]=x;}return out;});
exports.getGradesForUser=onCall(async(req)=>{requireAuth(req);const r=role(req);const all=(await db.ref('grades').get()).val()||{};const out={};if(r==='OWNER')return all;const students=(await db.ref('students').get()).val()||{};for(const [id,g] of Object.entries(all)){const st=students[g.studentId];let ok=r==='STUDENT'&&g.studentId===req.auth.uid;if(r==='ADMIN')ok=!!st&&await hasSchoolScope(req.auth.uid,st.schoolId);if(r==='SUB-ADMIN')ok=!!st&&await hasGroupScope(req.auth.uid,st.groupId);if(ok)out[id]=g;}return out;});
exports.getScopedFiles=onCall(async(req)=>{requireAuth(req);const all=(await db.ref('files').get()).val()||{};return all;});

exports.saveCatalog=onCall(async(req)=>{requireRole(req,['OWNER']);const c=clean(req.data?.collection),data=req.data?.data||{};if(!validCatalog(c))throw new HttpsError('invalid-argument','نوع البيانات غير مسموح.');const allowed={schools:['name'],groups:['name','schoolId'],subjects:['name','code','teacherId','schoolId','groupId']}[c];if(!data.name||!allowed.every(k=>k==='name'||data[k]!==undefined))throw new HttpsError('invalid-argument','البيانات ناقصة.');if(c==='groups'||c==='subjects'){const schoolId=clean(data.schoolId);const school=(await db.ref(`schools/${schoolId}`).get()).val();if(!school)throw new HttpsError('invalid-argument','المدرسة غير موجودة.');}if(c==='subjects'&&data.groupId){const g=(await db.ref(`groups/${clean(data.groupId)}`).get()).val();if(!g||g.schoolId!==clean(data.schoolId))throw new HttpsError('invalid-argument','المجموعة غير متوافقة مع المدرسة.');}const id=db.ref(c).push().key;const x={...Object.fromEntries(allowed.map(k=>[k,clean(data[k])])),status:'ACTIVE',createdAt:now(),createdBy:req.auth.uid};await db.ref(`${c}/${id}`).set(x);await writeAudit(req.auth.uid,'OWNER','CREATE',c,id,null,x);return {ok:true,id};});
exports.deleteCatalog=onCall(async(req)=>{requireRole(req,['OWNER']);const c=clean(req.data?.collection),id=clean(req.data?.id);if(!validCatalog(c)||!id)throw new HttpsError('invalid-argument','بيانات الحذف غير صحيحة.');const old=(await db.ref(`${c}/${id}`).get()).val();if(!old)throw new HttpsError('not-found','العنصر غير موجود.');await db.ref(`${c}/${id}`).remove();await writeAudit(req.auth.uid,'OWNER','DELETE',c,id,old,null);return {ok:true};});
exports.updateSettings=onCall(async(req)=>{requireRole(req,['OWNER']);const d=req.data||{};const allowed=['platformName','logo','contactPhone','contactEmail','address','departmentHead','doctors','academicYear','maintenanceMode'];const x={};for(const k of allowed){if(k in d)x[k]=k==='maintenanceMode'?Boolean(d[k]):clean(d[k]);}if(x.contactEmail&&!validEmail(x.contactEmail))throw new HttpsError('invalid-argument','البريد غير صحيح.');if(x.contactPhone&&!validPhone(x.contactPhone))throw new HttpsError('invalid-argument','الهاتف غير صحيح.');const old=(await db.ref('settings').get()).val()||{};await db.ref('settings').update(x);await writeAudit(req.auth.uid,'OWNER','UPDATE','SETTINGS','global',old,{...old,...x});return {ok:true};});
exports.createFileRecord=onCall(async(req)=>{requireRole(req,['OWNER']);const d=req.data||{};const name=clean(d.name),contentType=clean(d.contentType),path=clean(d.path),size=Number(d.size);const allowed=/^(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|image\/|video\/)/.test(contentType);if(!name||!path.startsWith('uploads/')||!allowed||!Number.isFinite(size)||size<=0||size>50*1024*1024)throw new HttpsError('invalid-argument','بيانات الملف غير مسموحة.');const id=db.ref('files').push().key;const x={name,contentType,size,path,uploadedBy:req.auth.uid,uploadedByRole:'OWNER',status:'ACTIVE',createdAt:now()};await db.ref(`files/${id}`).set(x);await writeAudit(req.auth.uid,'OWNER','UPLOAD','FILE',id,null,x);return {ok:true,id};});

exports.bootstrapOwner=onCall(async(req)=>{requireAuth(req);const snap=await db.ref('users').get();const users=snap.val()||{};const owner=Object.values(users).find(x=>x?.role==='OWNER');if(owner)throw new HttpsError('already-exists','يوجد Owner بالفعل.');await db.ref('users/'+req.auth.uid).set({name:req.auth.token.name||req.auth.token.email||'Owner',email:req.auth.token.email||'',role:'OWNER',status:'ACTIVE',createdAt:now(),updatedAt:now()});await setClaims(req.auth.uid,{role:'OWNER'});return {ok:true};});

exports.attendanceSummary=onCall(async(req)=>{
  requireAuth(req); const r=role(req); let present=0,late=0,absent=0;
  const sessions=(await db.ref('attendanceSessions').get()).val()||{};
  const allowedSchools=r==='ADMIN'?Object.keys((await db.ref(`adminScopes/${req.auth.uid}/schools`).get()).val()||{}):[];
  for(const [sid,ss] of Object.entries(sessions)){
    if(r==='SUB-ADMIN' && !(await hasGroupScope(req.auth.uid,ss.groupId))) continue;
    if(r==='ADMIN'){const g=(await db.ref(`groups/${ss.groupId}`).get()).val();if(!g||!allowedSchools.includes(g.schoolId))continue;}
    const st=(await db.ref(`attendance/${sid}`).get()).val()||{};
    for(const [studentId,x] of Object.entries(st)){if(r==='STUDENT'&&studentId!==req.auth.uid)continue;if(x.status==='PRESENT')present++;else if(x.status==='LATE')late++;else if(x.status==='ABSENT')absent++;}
  }
  return {present,late,absent};
});
