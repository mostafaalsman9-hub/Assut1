(() => {
  "use strict";

  const DB_URL = "https://drali-f6b14-default-rtdb.firebaseio.com";
  const INSTALL_KEY = "sports-science-install-button";
  let deferredInstallPrompt = null;
  let aboutRequestInFlight = false;

  const text = (node) => (node?.textContent || "").replace(/\s+/g, " ").trim();

  const isStandalone = () =>
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true;

  const currentRole = () => {
    const badge = document.querySelector(".top-actions .badge");
    const value = text(badge);
    return value === "مالك المنصة" ? "owner" : value === "مسؤول" ? "admin" : value === "طالب" ? "student" : "";
  };

  const addInstallButton = () => {
    const card = document.querySelector(".auth-card");
    if (!card || card.querySelector(".install-app-button") || isStandalone()) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "button install-app-button";
    button.innerHTML = "<span aria-hidden=\"true\">⬇</span> تثبيت التطبيق على الجهاز";
    button.addEventListener("click", async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const result = await deferredInstallPrompt.userChoice;
        if (result?.outcome === "accepted") {
          localStorage.setItem(INSTALL_KEY, "1");
          button.remove();
        }
        deferredInstallPrompt = null;
        return;
      }

      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      window.alert(
        ios
          ? "اضغط مشاركة من المتصفح ثم اختر: إضافة إلى الشاشة الرئيسية."
          : "من قائمة المتصفح اختر تثبيت التطبيق أو إضافة الصفحة إلى الشاشة الرئيسية."
      );
    });

    card.appendChild(button);
  };

  const hideAdminGrades = () => {
    const role = currentRole();
    document.querySelectorAll(".nav-item, .mobile-nav button").forEach((button) => {
      if (text(button).includes("الدرجات")) {
        button.style.display = role === "owner" ? "" : "none";
        button.setAttribute("aria-hidden", role === "owner" ? "false" : "true");
      }
    });
  };

  const getStoredAuthToken = () =>
    new Promise((resolve) => {
      if (!window.indexedDB) return resolve("");
      const request = indexedDB.open("firebaseLocalStorageDb");
      request.onerror = () => resolve("");
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("firebaseLocalStorage")) {
          db.close();
          resolve("");
          return;
        }
        const transaction = db.transaction("firebaseLocalStorage", "readonly");
        const getAll = transaction.objectStore("firebaseLocalStorage").getAll();
        getAll.onerror = () => {
          db.close();
          resolve("");
        };
        getAll.onsuccess = () => {
          const records = getAll.result || [];
          const record = records.find((item) => {
            const value = item?.value || item;
            return value?.stsTokenManager?.accessToken;
          });
          const value = record?.value || record;
          db.close();
          resolve(value?.stsTokenManager?.accessToken || "");
        };
      };
    });

  const readAbout = async () => {
    const token = await getStoredAuthToken();
    if (!token) throw new Error("auth-token-not-found");
    const response = await fetch(`${DB_URL}/ownerAbout.json?auth=${encodeURIComponent(token)}`, {
      cache: "no-store"
    });
    if (!response.ok) throw new Error("about-read-failed");
    const data = await response.json();
    return typeof data === "string" ? data : data?.text || "";
  };

  const saveAbout = async (value) => {
    const token = await getStoredAuthToken();
    if (!token) throw new Error("auth-token-not-found");
    const response = await fetch(`${DB_URL}/ownerAbout.json?auth=${encodeURIComponent(token)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: value, updatedAt: Date.now() })
    });
    if (!response.ok) throw new Error("about-write-failed");
  };

  const createAboutCard = () => {
    if (currentRole() !== "owner") {
      document.querySelector(".about-platform-card")?.remove();
      return;
    }

    const host = document.querySelector(".content-inner");
    const hero = host?.querySelector(".hero-panel");
    if (!host || !hero || host.querySelector(".about-platform-card")) return;

    const card = document.createElement("section");
    card.className = "card about-platform-card";
    card.innerHTML = `
      <div class="card-header">
        <h3>عن المنصة</h3>
        <small>يظهر هذا القسم للـOwner فقط</small>
      </div>
      <div class="card-body">
        <label class="about-platform-label" for="about-platform-text">خبرات ومعلومات المنصة</label>
        <textarea id="about-platform-text" class="about-platform-text" rows="5"
          placeholder="اكتب هنا خبرات الـOwner، رسالة المنصة، وأي معلومات تريد حفظها..."></textarea>
        <div class="about-platform-actions">
          <span class="about-platform-status" aria-live="polite"></span>
          <button class="button primary about-platform-save" type="button">حفظ معلومات المنصة</button>
        </div>
      </div>`;

    hero.insertAdjacentElement("afterend", card);
    const field = card.querySelector("#about-platform-text");
    const status = card.querySelector(".about-platform-status");
    const save = card.querySelector(".about-platform-save");

    if (!aboutRequestInFlight) {
      aboutRequestInFlight = true;
      readAbout()
        .then((value) => {
          field.value = value;
        })
        .catch(() => {
          status.textContent = "يمكنك كتابة المعلومات وحفظها من حساب الـOwner.";
        })
        .finally(() => {
          aboutRequestInFlight = false;
        });
    }

    save.addEventListener("click", async () => {
      save.disabled = true;
      status.textContent = "جارٍ الحفظ...";
      try {
        await saveAbout(field.value.trim());
        status.textContent = "تم تحديث معلومات المنصة.";
      } catch {
        status.textContent = "تعذر الحفظ. سجّل الدخول بحساب الـOwner ثم حاول مرة أخرى.";
      } finally {
        save.disabled = false;
      }
    });
  };

  const enhance = () => {
    addInstallButton();
    hideAdminGrades();
    createAboutCard();
  };

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    enhance();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    document.querySelector(".install-app-button")?.remove();
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./firebase-messaging-sw_1790170758201.js").catch(() => undefined);
    });
  }

  const observer = new MutationObserver(() => enhance());
  const start = () => {
    enhance();
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();