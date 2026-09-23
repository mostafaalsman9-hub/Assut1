/* منصة علوم الرياضة: ضوابط المالك وتثبيت التطبيق.
 * هذا الملف يكمّل الواجهة الحالية، بينما تظل Firebase Rules هي الحماية الأساسية.
 */
(function () {
  'use strict';

  var CONFIG = window.PLATFORM_FIREBASE_CONFIG;
  var installPrompt = null;
  var currentUser = null;
  var ownerExperienceRef = null;
  var observerStarted = false;

  function textOf(element) {
    return (element && (element.textContent || '')).replace(/\s+/g, ' ').trim();
  }

  function isStandalone() {
    return window.matchMedia && window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
  }

  function getRole() {
    var badge = document.querySelector('.top-actions .badge');
    var roleText = textOf(badge);
    if (roleText.indexOf('مالك') !== -1 || document.querySelector('.sidebar .nav-item span') &&
        Array.prototype.some.call(document.querySelectorAll('.sidebar .nav-item span'), function (node) {
          return textOf(node) === 'المسؤولون';
        })) return 'owner';
    if (roleText.indexOf('مسؤول') !== -1) return 'admin';
    if (roleText.indexOf('طالب') !== -1) return 'student';
    return null;
  }

  function installStyle() {
    if (document.getElementById('owner-controls-style')) return;
    var style = document.createElement('style');
    style.id = 'owner-controls-style';
    style.textContent =
      '.owner-experience{margin:0 0 22px;background:linear-gradient(135deg,#fffdf5,#fff);border:1px solid #eadbb0;border-radius:18px;box-shadow:0 5px 18px #725b1b12;overflow:hidden}' +
      '.owner-experience-head{display:flex;align-items:center;gap:10px;padding:17px 20px;border-bottom:1px solid #f0e7cd;color:#6e5312}' +
      '.owner-experience-head h3{margin:0;font-size:15px;font-weight:800;flex:1}' +
      '.owner-experience-body{padding:18px 20px}.owner-experience textarea{display:block;width:100%;min-height:112px;resize:vertical;border:1px solid #e4d6aa;border-radius:10px;padding:11px 12px;color:#4f431f;background:#fffef9;font:inherit;font-size:13px;line-height:1.8;box-sizing:border-box;outline:none}.owner-experience textarea:focus{border-color:#c49b38;box-shadow:0 0 0 3px #c49b3820}.owner-experience-actions{display:flex;align-items:center;gap:10px;margin-top:12px}.owner-experience-note{color:#8d7a45;font-size:11px;flex:1}.install-action{font-size:11px!important;padding:7px 10px!important;color:#146d62!important;border-color:#a9d0c8!important;background:#effaf7!important}';
    document.head.appendChild(style);
  }

  function addInstallAction() {
    if (isStandalone() || document.querySelector('.install-action')) return;
    var actions = document.querySelector('.top-actions');
    if (!actions) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'button small install-action';
    button.textContent = 'تثبيت التطبيق';
    button.title = 'تثبيت منصة علوم الرياضة على جهازك';
    button.addEventListener('click', function () {
      if (installPrompt) {
        installPrompt.prompt();
        installPrompt.userChoice.then(function () {
          installPrompt = null;
          button.remove();
        }).catch(function () {});
      } else {
        window.alert('من قائمة المتصفح اختر «إضافة إلى الشاشة الرئيسية» أو «تثبيت التطبيق».');
      }
    });
    actions.insertBefore(button, actions.firstChild);
  }

  function hideAdminControls() {
    if (getRole() !== 'admin') return;
    document.querySelectorAll('.sidebar .nav-item, .mobile-nav button').forEach(function (button) {
      if (textOf(button).indexOf('الدرجات') !== -1) {
        button.setAttribute('aria-hidden', 'true');
        button.style.display = 'none';
      }
    });
    document.querySelectorAll('.button').forEach(function (button) {
      var label = textOf(button);
      if (label === 'إسناد' || label === 'الطلاب' || label === 'حفظ الاختيارات') {
        button.setAttribute('aria-hidden', 'true');
        button.style.display = 'none';
      }
    });
    var heading = document.querySelector('.page-heading h1');
    if (heading && textOf(heading) === 'درجات أعمال السنة') {
      var home = Array.prototype.find.call(document.querySelectorAll('.sidebar .nav-item'), function (button) {
        return textOf(button).indexOf('لوحة المتابعة') !== -1;
      });
      if (home) home.click();
    }
  }

  function createOwnerExperience() {
    if (getRole() !== 'owner' || !currentUser) return;
    var content = document.querySelector('.content-inner');
    if (!content || document.querySelector('.owner-experience')) return;
    var section = document.createElement('section');
    section.className = 'owner-experience';
    section.innerHTML =
      '<div class="owner-experience-head"><span aria-hidden="true">✦</span><h3>عن المنصة — خبرات المالك</h3><span class="badge orange">للمالك فقط</span></div>' +
      '<div class="owner-experience-body"><textarea maxlength="5000" aria-label="خبرات المالك" placeholder="اكتب هنا خبراتك أو ملاحظاتك الخاصة بالمنصة..."></textarea>' +
      '<div class="owner-experience-actions"><span class="owner-experience-note">لا تظهر هذه الملاحظات إلا لحساب المالك.</span><button type="button" class="button primary small">حفظ الخبرات</button></div></div>';
    content.insertBefore(section, content.firstChild);
    var textarea = section.querySelector('textarea');
    var saveButton = section.querySelector('button');
    if (ownerExperienceRef) {
      ownerExperienceRef.once('value').then(function (snapshot) {
        var value = snapshot.val();
        if (value && typeof value.text === 'string') textarea.value = value.text;
      }).catch(function () {});
    }
    saveButton.addEventListener('click', function () {
      if (!ownerExperienceRef || !currentUser) return;
      saveButton.disabled = true;
      ownerExperienceRef.set({
        text: textarea.value.trim(),
        updatedAt: Date.now(),
        updatedBy: currentUser.uid
      }).then(function () {
        saveButton.textContent = 'تم الحفظ';
        window.setTimeout(function () {
          saveButton.textContent = 'حفظ الخبرات';
          saveButton.disabled = false;
        }, 1600);
      }).catch(function () {
        saveButton.disabled = false;
        window.alert('تعذر حفظ الخبرات. تحقق من نشر Firebase Rules.');
      });
    });
  }

  function refreshUi() {
    installStyle();
    addInstallAction();
    hideAdminControls();
    createOwnerExperience();
  }

  function start() {
    if (observerStarted) return;
    observerStarted = true;
    installStyle();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./pwa-sw.js').catch(function () {});
    if (window.firebase && CONFIG) {
      try {
        var app = window.firebase.apps.length ? window.firebase.app() : window.firebase.initializeApp(CONFIG);
        var auth = app.auth();
        ownerExperienceRef = app.database().ref('ownerExperience');
        auth.onAuthStateChanged(function (user) {
          currentUser = user;
          refreshUi();
        });
      } catch (error) {
        console.warn('تعذر تشغيل ضوابط المالك', error);
      }
    }
    var observer = new MutationObserver(function () {
      window.clearTimeout(observer._timer);
      observer._timer = window.setTimeout(refreshUi, 40);
    });
    observer.observe(document.getElementById('root') || document.body, { childList: true, subtree: true });
    window.setTimeout(refreshUi, 500);
  }

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    installPrompt = event;
    refreshUi();
  });
  window.addEventListener('appinstalled', function () {
    installPrompt = null;
    var button = document.querySelector('.install-action');
    if (button) button.remove();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();