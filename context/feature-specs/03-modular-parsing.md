# Feature Spec: Modular Parsing System

> **Unit:** 03 — Modular Parsing System
> **Depends on:** Unit 01 (Import & Validation), Unit 02 (Platform Auto-Detection) — دریافت داده‌ی خام JSON به‌همراه شناسه‌ی پلتفرم تشخیص‌داده‌شده
> **Maps to Feature:** #3 در فهرست Featureهای تأییدشده

---

## Goal

تبدیل داده‌ی خام JSON هر پلتفرم (پس از تشخیص در Unit 02) به یک مدل داده‌ی یکسان و مستقل از پلتفرم (`UnifiedConversation`)، از طریق معماری Parser ماژولار که در آن هر پلتفرم یک ماژول کاملاً مستقل دارد — به‌گونه‌ای که افزودن پلتفرم جدید یا تطبیق با تغییر فرمت رسمی یک پلتفرم، هیچ تأثیری بر Parserهای دیگر نداشته باشد.

> **مرز دقیق دو مسئولیت این واحد:**
> - **`parse()`** (در `parsers/{provider}/`): فقط داده‌ی خام JSON را به یک ساختار میانی و **مخصوص همان پلتفرم** (Provider Raw Data) تبدیل می‌کند. خروجی آن **هرگز** مستقیماً `UnifiedConversation` نیست.
> - **`normalize()`** (در `normalization/`): فقط و منحصراً مسئول نگاشت Provider Raw Data به `UnifiedConversation` است. این تابع هرگز مستقیماً JSON خام ورودی کاربر را نمی‌خواند؛ فقط خروجی `parse()` را دریافت می‌کند.
>
> این دو لایه کاملاً متوالی و مجزا هستند و نباید در یک تابع واحد ادغام شوند.

---

## User Flow

1. داده‌ی خام JSON + شناسه‌ی پلتفرم (خروجی Unit 02) وارد لایه‌ی Parsing می‌شود.
2. سیستم بر اساس شناسه‌ی پلتفرم، ماژول Parser متناظر را از **همان Registry مرکزی معرفی‌شده در Unit 02** بازیابی می‌کند — یک Registry واحد که هم برای `detect()` (در Unit 02) و هم برای `parse()` (در این واحد) استفاده می‌شود؛ هیچ Registry دومی وجود ندارد.
3. تابع `parse()` همان ماژول روی داده‌ی خام اجرا می‌شود و آن را به Provider Raw Data (ساختار خام مخصوص همان پلتفرم) تبدیل می‌کند.
4. خروجی `parse()` از طریق لایه‌ی `normalization/` به مدل مشترک `UnifiedConversation` نگاشت می‌شود.
5. اگر `parse()` یا `normalize()` با خطا مواجه شود (مثلاً فیلد موردانتظار وجود نداشت)، خطای دسته‌بندی‌شده (`ParseError`) بازگردانده و فایل با پیام کاربرپسند رد می‌شود؛ این خطا مانع پردازش سایر فایل‌های همان دسته‌ی Import نمی‌شود.
6. در صورت موفقیت، شیء `UnifiedConversation` نهایی آماده و برای ذخیره‌سازی به Unit 04 (Local Chat Library) منتقل می‌شود — افزودن واقعی به کتابخانه خارج از Scope این واحد است.

---

## Functional Requirements

| # | Requirement |
|---|-------------|
| FR1 | هر پلتفرم باید یک ماژول مستقل در `parsers/{provider}/` داشته باشد که تابع `parse(rawJson: unknown): ParseResult<ProviderRawData>` را Export می‌کند. خروجی موفق این تابع **داده‌ی خام مخصوص همان پلتفرم** است، نه `UnifiedConversation` |
| FR2 | ماژول Parser هر پلتفرم هرگز نباید به ماژول Parser پلتفرم دیگری Import یا وابستگی مستقیم داشته باشد (طبق Invariant #3) |
| FR3 | لایه‌ی `normalization/` باید تابع `normalize(providerRawData, providerId): UnifiedConversation` را ارائه دهد که به‌طور اختصاصی خروجی هر `parse()` را به مدل مشترک `UnifiedConversation` (تعریف‌شده در `types/`) نگاشت می‌کند؛ این تنها نقطه‌ی مجاز تولید `UnifiedConversation` در کل پروژه است |
| FR4 | `UnifiedConversation` باید حداقل شامل ساختار مشترک لازم برای Featureهای بعدی باشد: فهرست پیام‌ها (نقش، متن، ترتیب)، و ساختار پایه برای متادیتا (بدون الزام مقداردهی همه‌ی فیلدها — تکمیل دقیق متادیتا در Unit 05 است) |
| FR5 | `parse()` و `normalize()` باید در همان Web Worker جریان Import/Detection ادامه یابند، بدون Round-trip اضافه به Main Thread |
| FR6 | خطاهای `parse()`/`normalize()` باید با نوع مشخص (`ParseError` با زیرنوع، مثلاً `MissingFieldError`, `UnexpectedTypeError`) بازگردانده شوند، نه با `throw` بی‌نوع |
| FR7 | افزودن یک Parser جدید (پلتفرم جدید) نباید نیازمند تغییر در کد `parse()` یا `normalize()` پلتفرم‌های موجود باشد |
| FR8 | خروجی نهایی موفق (`UnifiedConversation`) باید فقط به Unit 04 منتقل شود؛ این واحد مستقیماً چیزی در Storage (IndexedDB) نمی‌نویسد |

---

## Non-Functional Requirements

| # | Requirement |
|---|-------------|
| NFR1 | Parse و Normalize یک مکالمه‌ی معمولی باید در حد میلی‌ثانیه انجام شود؛ برای فایل‌های بزرگ (طبق NFR در Unit 01)، کل زنجیره باید در محدوده‌ی زمانی تعریف‌شده در `architecture.md` (زیر ۵ ثانیه برای فایل تا ۵۰ مگابایت) باقی بماند |
| NFR2 | ماژول‌های Parser باید کاملاً مستقل و بدون Side Effect مشترک باشند (طبق `code-standards.md` → Module & Parser Conventions) |
| NFR3 | لایه‌ی Normalization باید یک نقطه‌ی واحد تبدیل باشد؛ منطق نگاشت به `UnifiedConversation` نباید در چند جای پراکنده تکرار شود |

---

## UI Behavior

| وضعیت | نمایش |
|-------|-------|
| **در حال Parse/Normalize** | ادامه‌ی همان نشانگر Progress مراحل قبلی (Import/Detection)؛ از دید کاربر یک جریان واحد است |
| **موفقیت** | بدون پیام مجزا؛ فایل به‌سادگی آماده‌ی ورود به کتابخانه می‌شود (نمایش واقعی در Unit 04) |
| **شکست Parse (فیلد گمشده/ساختار غیرمنتظره)** | پیام خطای کاربرپسند عمومی، مثلاً «این فایل قابل پردازش نبود»؛ جزئیات فنی (کدام فیلد، کدام پلتفرم) فقط از طریق Internal diagnostic logging ثبت می‌شود، نه در UI |
| **Import چندگانه با شکست جزئی** | فایل‌های موفق ادامه می‌یابند؛ فایل ناموفق با پیام مستقل مشخص می‌شود، بدون توقف کل دسته |

---

## Validation

| بررسی | نحوه‌ی اعمال |
|-------|----------------|
| **تطابق ساختار با انتظار Parser** | هر `parse()` قبل از تولید Provider Raw Data، وجود فیلدهای حیاتی (مثلاً فهرست پیام‌ها) را بررسی می‌کند؛ نبود آن‌ها → `ParseError` |
| **صحت خروجی Normalize** | خروجی `normalize()` باید با Type `UnifiedConversation` (در `types/`) مطابقت داشته باشد؛ عدم تطابق در زمان توسعه از طریق TypeScript Strict Mode گرفته می‌شود، نه فقط در Runtime |
| **عدم اعتماد به داده‌ی خارجی** | هیچ فیلدی از JSON ورودی بدون Type Guard مستقیماً به Provider Raw Data یا `UnifiedConversation` نگاشت نمی‌شود (طبق Rule مربوطه در `code-standards.md`) |

---

## Edge Cases

| سناریو | رفتار موردانتظار |
|--------|-------------------|
| فایل تشخیص‌داده‌شده به‌عنوان یک پلتفرم، اما یک فیلد غیرحیاتی (مثلاً یکی از فیلدهای اختیاری متادیتا) را ندارد | `parse()` با موفقیت ادامه می‌یابد؛ فیلد گمشده در `UnifiedConversation` خالی/Undefined باقی می‌ماند (نه خطا) — رفتار دقیق نمایش این حالت در Unit 05 مشخص می‌شود |
| فایل تشخیص‌داده‌شده به‌عنوان یک پلتفرم، اما یک فیلد **حیاتی** (مثلاً کل فهرست پیام‌ها) را ندارد | `ParseError` از نوع `MissingFieldError`؛ فایل رد می‌شود |
| پیام‌هایی با نقش ناشناخته (نه User و نه Assistant — مثلاً System/Tool) | بسته به تعریف `UnifiedConversation`؛ اگر نقش پشتیبانی‌نشده باشد، آن پیام با نوع مشخص در مدل نگاشت می‌شود (نه حذف بی‌صدا)؛ جزئیات دقیق‌تر (نحوه‌ی نمایش) در Unit 06 (Rendering) مشخص می‌شود |
| مکالمه‌ی خالی (پلتفرم درست تشخیص داده شده اما هیچ پیامی ندارد) | Parse/Normalize موفق با `UnifiedConversation` دارای فهرست پیام خالی؛ نمایش این حالت (خالی) در UI بعداً مدیریت می‌شود، نه رد شدن در این مرحله |
| حجم بسیار زیاد پیام در یک مکالمه (مثلاً هزاران پیام) | Parse/Normalize باید بدون Timeout در Web Worker کامل شود؛ در صورت عبور از حد زمانی موردانتظار (NFR1)، این به‌عنوان Edge Case عملکردی در بازبینی بعدی بررسی می‌شود |
| ساختار پلتفرم تغییر کرده و دیگر با Parser فعلی همخوان نیست (حتی اگر `detect()` هنوز تطابق داد) | `ParseError` مناسب بازگردانده می‌شود؛ به‌روزرسانی Parser آن پلتفرم به‌صورت مستقل انجام می‌شود، بدون تأثیر بر پلتفرم‌های دیگر |

---

## Testing

| نوع تست | پوشش موردنیاز |
|---------|-----------------|
| **Fixture-based Tests** | برای هر Provider ثبت‌شده، حداقل یک فایل نمونه‌ی واقعی (Anonymized) در `tests/fixtures/{provider}/` باید با موفقیت از `parse()` تا `normalize()` به `UnifiedConversation` معتبر برسد |
| **Unit Tests — `parse()`** | هر ماژول `parsers/{provider}/parse()` به‌صورت مجزا تست می‌شود؛ خروجی (Provider Raw Data) باید با ساختار موردانتظار همان پلتفرم مطابقت داشته باشد، **بدون** بررسی شکل `UnifiedConversation` در همین سطح |
| **Unit Tests — `normalize()`** | لایه‌ی `normalization/` مستقل از هر `parse()` خاص تست می‌شود؛ ورودی یک Provider Raw Data ساختگی (Mock) و خروجی موردانتظار `UnifiedConversation` |
| **Invalid Input Tests** | هر `parse()` با ورودی‌های ناقص (فیلد حیاتی گمشده) و غیرمنتظره (نوع داده‌ی اشتباه) تست می‌شود تا بازگشت صحیح `ParseError` (نه `throw` بی‌نوع) تأیید شود |
| **Isolation Tests** | تغییر یا حذف فرضی یک ماژول Parser نباید تست‌های Parserهای دیگر را Break کند (طبق Invariant #3) — با اجرای مستقل Test Suite هر پوشه‌ی `parsers/{provider}/` تضمین می‌شود |

> این تست‌ها مطابق `code-standards.md` (Vitest + Fixture Strategy) نوشته می‌شوند و بخشی از Pre-Commit Checklist این واحد (طبق `ai-workflow-rules.md`) هستند.

---

## Acceptance Criteria

- [ ] هر Provider ثبت‌شده (all currently registered providers) با فایل نمونه‌ی واقعی خودش به‌درستی از `parse()` تا `normalize()` به `UnifiedConversation` نگاشت می‌شود
- [ ] خروجی همه‌ی مسیرهای Normalize دقیقاً از یک مدل مشترک (`UnifiedConversation`) پیروی می‌کند
- [ ] خروجی `parse()` هرگز مستقیماً `UnifiedConversation` نیست؛ فقط `normalize()` این نوع را تولید می‌کند
- [ ] فایل با فیلد حیاتی گمشده رد می‌شود با خطای دسته‌بندی‌شده و پیام کاربرپسند
- [ ] هیچ ماژول Parser به ماژول Parser پلتفرم دیگر وابستگی مستقیم ندارد
- [ ] افزودن یک Parser جدید هیچ تغییری در کد `parse()`/`normalize()` پلتفرم‌های موجود ایجاد نمی‌کند
- [ ] کل فرآیند در Web Worker انجام می‌شود، بدون Block شدن UI
- [ ] این واحد مستقیماً چیزی در IndexedDB/Storage نمی‌نویسد — فقط `UnifiedConversation` آماده را تحویل می‌دهد
- [ ] تست‌های Fixture-based، Unit، و Invalid Input برای همه‌ی Providerهای ثبت‌شده پاس می‌شوند