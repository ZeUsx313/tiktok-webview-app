# TikTok Web — تطبيق WebView بواسطة Expo + React Native

تطبيق شاشة واحدة وظيفته: تشغيل موقع **TikTok** بوضع المتصفح داخل WebView، مع **منع التشغيل التلقائي تماماً** — أي فيديو يظهر أمامك يبقى متوقفاً حتى **تضغط عليه أنت**.

## الميزات

- WebView كامل الشاشة لموقع tiktok.com **بوضع الكمبيوتر (Desktop Mode)** — User Agent لمتصفح ويندوز كروم + عرض تخطيط 1280px مع دعم التكبير بالأصابع.
- محرك No-Autoplay مدمج (JavaScript) + إعدادات أصلية `mediaPlaybackRequiresUserAction`:
  - تعطيل أي استدعاء `play()` من أكواد الموقع.
  - إزالة خاصية `autoplay` من كل فيديو حالي أو قادم.
  - إيقاف فوري لأي فيديو يبدأ بدون إذن.
  - **الضغط باللمس على الفيديو هو الطريقة الوحيدة لتشغيله**.
- الروابط الخارجية (غير تيك توك) تفتح في متصفح النظام.
- دعم زر الرجوع في أندرويد + إيماءة السحب للخلف في iOS + السحب للأسفل للتحديث.

## التشغيل مع Expo Go

```bash
npm install
npx expo start
```

ثم امسح رمز QR بكاميرا الهاتف (تطبيق Expo Go). مكتبة `react-native-webview` مدعومة في Expo Go لذا سيعمل التطبيق مباشرة بدون أي build محلي.

## البناء عبر GitHub Actions

عند كل push إلى `main` (أو يدوياً من تبويب Actions → Run workflow) يُبنى تلقائياً:

| Workflow | الناتج (Artifact) | الوصف |
|----------|-------------------|-------|
| `Build iOS (unsigned IPA)` | `TikTokWeb-iOS-unsigned-IPA` | ملف **IPA غير موقع** — وقّعه بنفسك لاحقاً |
| `Build Android (APK)` | `TikTokWeb-Android-APK` | ملف APK موقّع بمفتاح debug وجاهز للتثبيت المباشر |

طريقة التحميل: تبويب **Actions** → اختر آخر تشغيل → قسم **Artifacts** في الأسفل → Download.

## توقيع الـ IPA لاحقاً

الملف الناتج IPA غير موقع ويحتوي مجلد `Payload/*.app` يمكنك توقيعه بأحد الطرق:

1. **Sideloadly** أو **AltStore** على الكمبيوتر مع Apple ID مجاني (7 أيام).
2. **esign / Feather** على الجهاز مباشرة مع شهادة p12 + ملف mobileprovision.
3. حساب **Apple Developer** رسمي عبر `codesign` و`xcodebuild -exportArchive`.

## تعديل صفحة البداية

غيّر الثابت `START_URL` في أول ملف `App.js` (مثال: `https://www.tiktok.com/explore`).

## ملاحظة

- بناء iOS يعمل على `macos-latest`؛ إذا كان المستودع خاصاً (private) فاستهلاك الدقائق يتضاعف ×10 على macOS — اجعله عاماً (public) للحصول على دقائق مجانية غير محدودة.
