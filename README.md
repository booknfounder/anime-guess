# 🎌 خمن شخصية الأنمي (Guess The Anime Character)

لعبة ويب جماعية فورية: Node.js + Express + Socket.io، وبيانات الشخصيات من AniList GraphQL API.

## الهيكل
```
anime-guess/
├── package.json
├── server.js          # السيرفر + منطق الغرف + AniList + الكاش + الاحتياطي
├── names-ar.js        # قاموس الأسماء العربية (أضف شخصيات جديدة هنا)
├── render.yaml        # (اختياري) إعداد Render تلقائي
├── .gitignore
└── public/
    ├── index.html
    ├── style.css      # Glassmorphism
    └── app.js
```

## التشغيل محلياً
```bash
npm install
npm start
# افتح http://localhost:3000
```
تحتاج Node.js 18 أو أحدث (يعتمد على fetch المدمج).

## الرفع على GitHub
1. أنشئ حساباً على github.com ثم اضغط **New repository**، سمّه `anime-guess` واتركه Public أو Private (بدون README).
2. من مجلد المشروع:
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/USERNAME/anime-guess.git
git push -u origin main
```
(استبدل `USERNAME` باسم حسابك.) ولو ما عندك Git، اضغط **uploading an existing file** في صفحة المستودع وارفع الملفات مع مجلد `public` كما هو.

## النشر على Render
1. ادخل render.com وسجّل بحساب GitHub.
2. اضغط **New +** ثم **Web Service** ثم اختر مستودع `anime-guess` (اسمح لـ Render بالوصول إليه).
3. الإعدادات:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
   - من **Environment** أضف `NODE_VERSION` = `20`
   - (اختياري) **Health Check Path:** `/healthz`
   - لا تحتاج تحديد PORT، فـ Render يمرره تلقائياً.
4. اضغط **Create Web Service** وانتظر انتهاء البناء، ثم افتح الرابط `https://اسم-مشروعك.onrender.com`.
5. أي `git push` جديد على `main` يعيد النشر تلقائياً.

أو استخدم **New + ← Blueprint** وسيقرأ ملف `render.yaml`.

## ملاحظات مهمة
- الخطة المجانية تنام بعد ~15 دقيقة بلا زيارات، وأول فتح يحتاج نحو 30–60 ثانية.
- الغرف تُحفظ في ذاكرة السيرفر، لذا استخدم نسخة واحدة (Instance واحدة) ولا تفعّل التوسّع الأفقي. إعادة التشغيل تمسح الغرف.
- السيرفر يخزّن بيانات AniList مؤقتاً 12 ساعة ويسخّن الكاش عند التشغيل لتجنب حدود الطلبات.
- تعديل الأنميات: عدّل الكائن `ANIME` في `server.js` وأضف معرّف AniList (ID) للأنمي.
