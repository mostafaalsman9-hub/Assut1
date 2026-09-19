import { auth, db, call, ref, get, signInWithEmailAndPassword, signOut } from './firebase.js';

const $ = id => document.getElementById(id);
const msg = (text, type='') => { const el=$('authMsg'); if(el){el.textContent=text; el.className=type;} };
const route = { OWNER:'owner.html', ADMIN:'admin.html', 'SUB-ADMIN':'subadmin.html', STUDENT:'student.html' };

$('loginTab')?.addEventListener('click',()=>setTab(false));
$('registerTab')?.addEventListener('click',()=>setTab(true));
if(location.hash==='#register') setTab(true);
function setTab(register){$('registerForm').classList.toggle('hidden',!register);$('loginForm').classList.toggle('hidden',register);$('registerTab').classList.toggle('active',register);$('loginTab').classList.toggle('active',!register);msg('');}

$('loginForm')?.addEventListener('submit',async e=>{
  e.preventDefault(); msg('جاري تسجيل الدخول...');
  try{
    const cred=await signInWithEmailAndPassword(auth,$('loginEmail').value.trim(),$('loginPassword').value);
    const snap=await get(ref(db,`users/${cred.user.uid}`));
    const p=snap.exists()?snap.val():null;
    if(!p || p.status!=='ACTIVE') throw new Error('الحساب غير نشط أو في انتظار موافقة Owner.');
    try { await call('refreshClaims')(); } catch {}
    location.href=route[p.role] || 'auth.html';
  }catch(err){await signOut(auth).catch(()=>{});msg(err?.message||'تعذر تسجيل الدخول.','error');}
});

$('registerForm')?.addEventListener('submit',async e=>{
  e.preventDefault();
  const password=$('regPassword').value, confirm=$('regConfirm')?.value;
  if(password!==confirm) return msg('كلمتا المرور غير متطابقتين.','error');
  msg('جاري إرسال طلب التسجيل...');
  try{
    await call('registerStudent')({name:$('regName').value.trim(),phone:$('regPhone').value.trim(),email:$('regEmail').value.trim(),password});
    msg('تم إرسال طلب التسجيل إلى Owner. بعد الموافقة يمكنك تسجيل الدخول.','ok');
    e.target.reset();
  }catch(err){msg(err?.message||'تعذر إرسال الطلب.','error');}
});
