const CACHE_NAME = 'sheets-editor-cache-v2'; // تم تحديث الإصدار لإجبار التحديث
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/lucide-static@latest/dist/lucide.min.js',
  'https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js'
];

// 1. التثبيت: يتم تخزين الملفات الأساسية للتطبيق للعمل دون اتصال
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache and caching essential assets');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting(); // تفعيل عامل الخدمة الجديد فورًا
});

// 2. التفعيل: يتم حذف ذاكرة التخزين المؤقت القديمة
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim(); // السيطرة على الصفحات المفتوحة فورًا
});


// 3. الجلب (الاستراتيجية الجديدة): الشبكة أولاً، ثم ذاكرة التخزين المؤقت
self.addEventListener('fetch', event => {
  // تجاهل الطلبات التي ليست من نوع GET
  if (event.request.method !== 'GET') {
    return;
  }
  
  event.respondWith(
    // 1. محاولة جلب أحدث نسخة من الشبكة
    fetch(event.request)
      .then(networkResponse => {
        // إذا نجح الطلب، قم بتخزين النسخة الجديدة في ذاكرة التخزين المؤقت
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        // إرجاع النسخة الجديدة من الشبكة
        return networkResponse;
      })
      .catch(() => {
        // إذا فشل طلب الشبكة (لا يوجد اتصال)، ابحث في ذاكرة التخزين المؤقت
        return caches.match(event.request)
          .then(cachedResponse => {
            // إذا وجد في ذاكرة التخزين، أرجعه
            if (cachedResponse) {
              return cachedResponse;
            }
            // يمكنك هنا إرجاع صفحة خطأ مخصصة للعمل دون اتصال إذا أردت
          });
      })
  );
});


