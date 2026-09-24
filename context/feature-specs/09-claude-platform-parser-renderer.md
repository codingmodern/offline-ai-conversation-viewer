# Spec: Unit 09 — Claude Platform Parser & Renderer

> **وابستگی:** Unit 02 (Platform Detection — service مستقل)، Unit 03 (Parsing pipeline مشترک)، Unit 06 (Multi-Theme Rendering)
> **وضعیت:** پیش‌نویس — در انتظار تایید نهایی

---

## 1. Goal

افزودن پشتیبانی کامل از import، parse، و رندر اختصاصی مکالمات صادرشده از پلتفرم Claude (فایل `conversations.json`)، مطابق ساختار واقعی کشف‌شده از فیکسچر export. این واحد شامل شناسایی خودکار فرمت Claude، تبدیل داده خام به مدل داخلی برنامه، و نمایش اصیل (authentic) پیام‌ها با المان‌های خاص Claude (thinking، tool use/result، پیوست‌ها) است.

---

## 2. یافته‌های ساختاری (مرجع Parsing)

> این بخش مستند می‌کند نه اسپک رفتار — مبنای پیاده‌سازی پارسر است.

### ساختار سطح مکالمه

| فیلد | نوع | توضیح |
|------|-----|-------|
| `uuid` | string | شناسه یکتای مکالمه |
| `name` | string | عنوان مکالمه |
| `summary` | string | خلاصه‌ی خودکار تولیدشده توسط Claude (فیلد اختصاصی این پلتفرم) |
| `created_at` / `updated_at` | ISO datetime | — |
| `account.uuid` | string | شناسه حساب — بدون کاربرد نمایشی |
| `chat_messages[]` | array | آرایه پیام‌ها (به ترتیب، طبق `parent_message_uuid`) |

### ساختار پیام

| فیلد | نوع | توضیح |
|------|-----|-------|
| `uuid` | string | شناسه پیام |
| `text` | string | متن fallback/خام — **استفاده نمی‌شود**، منبع اصلی رندر آرایه `content` است |
| `content[]` | array | آرایه fragment — بخش ۳ را ببینید |
| `sender` | `"human"` \| `"assistant"` | — |
| `attachments[]` | array | فایل‌های متنی پیوست‌شده با محتوای کامل inline (`extracted_content`) |
| `files[]` | array | فقط `{file_uuid, file_name}` — **بدون محتوا** |
| `parent_message_uuid` | string | برای تعیین مسیر خطی مکالمه؛ ریشه = `"00000000-0000-4000-8000-000000000000"` |

### انواع Fragment (`content[].type`)

| Type | فیلدهای کلیدی |
|------|---------------|
| `text` | `text`, `citations` |
| `thinking` | `thinking`, `summaries[]`, `cut_off`, `truncated`, `hidden`, `thinking_hidden` |
| `tool_use` | `id`, `name`, `input`, `display_content`, `integration_name` |
| `tool_result` | `tool_use_id` (پیوند به `tool_use.id`)، `name`, `content[]`, `is_error`, `display_content` |

---

## 3. User Flow

1. کاربر در Guided Import Flow (Unit 08) پلتفرم **Claude** را انتخاب می‌کند (پس از این Unit، دیگر «به‌زودی» نیست).
2. فایل `conversations.json` را آپلود می‌کند.
3. Platform Detection Service (Unit 02) امضای فایل Claude را تشخیص می‌دهد (وجود همزمان `chat_messages`, `account`, `summary` در سطح مکالمه، متمایز از امضای DeepSeek).
4. Parser مکالمات را به مدل داخلی مشترک برنامه تبدیل می‌کند.
5. کاربر مکالمه را در Library باز می‌کند و با تم اختصاصی Claude مشاهده می‌کند.

---

## 4. Functional Requirements

| # | نیازمندی |
|---|----------|
| FR1 | Platform Detection Service امضای export Claude را تشخیص دهد و آن را از DeepSeek/سایر پلتفرم‌ها متمایز کند |
| FR2 | پارسر تمام پیام‌های `chat_messages` را طبق مسیر خطی `parent_message_uuid` (نه branching) به ترتیب صحیح تبدیل کند |
| FR3 | Fragment های `text` عیناً به‌صورت Markdown رندر شوند (با pipeline موجود `marked`+`dompurify`) |
| FR4 | Fragment های `thinking` طبق قانون زیر رندر شوند: اگر `thinking_hidden === true` → کلاً نمایش داده نشود؛ در غیر این صورت → به‌صورت collapsed با دکمه «نمایش تفکر» نمایش داده شود |
| FR5 | Fragment های `tool_use` و `tool_result` با **یک قالب عمومی یکسان** (نام ابزار + ورودی/خروجی collapsible) رندر شوند، صرف‌نظر از نوع ابزار |
| FR6 | `tool_result` با `tool_use_id` متناظر به `tool_use.id` پیوند بصری داده شود (مثلاً نمایش هر دو در یک بلوک واحد) |
| FR7 | `tool_result` با `is_error: true` با استایل خطا (`--state-error`) مشخص شود |
| FR8 | پیوست‌های `attachments[]` (با `extracted_content`) به‌صورت بلوک فایل با پیش‌نمایش محتوای متنی نمایش داده شوند |
| FR9 | مدخل‌های `files[]` (بدون محتوا) به‌صورت placeholder غیرفعال با پیام «این فایل در export موجود نیست» نمایش داده شوند |
| FR10 | فیلد `summary` سطح مکالمه در پنل متادیتای collapsible (طبق UI موجود Unit 07) به‌عنوان بخش «خلاصه گفتگو» اضافه شود |
| FR11 | تم رندر Claude باید بصری اصیل (رنگ برند `--brand-claude`، تایپوگرافی و چیدمان مشابه UI واقعی Claude) داشته باشد، مطابق الگوی تم‌سازی DeepSeek در Unit 06 |

---

## 5. Non-Functional Requirements

- پردازش پارسر باید کاملاً آفلاین و client-side انجام شود (بدون فراخوانی شبکه).
- پارسر باید فایل‌های export تا حداقل ۲۰ مگابایت را بدون فریز شدن UI پردازش کند (در صورت نیاز، پردازش در Web Worker — مطابق الگوی موجود Unit 01).
- بلوک‌های `tool_use.input` که ممکن است JSON بزرگ باشند (مثلاً `file_text` کامل یک فایل) باید به‌صورت virtualized/lazy یا truncated-with-expand نمایش داده شوند تا کارایی رندر افت نکند.
- کدهای رنگی باید فقط از توکن‌های تعریف‌شده در `ui-context.md` استفاده کنند؛ رنگ برند Claude (`--brand-claude`) باید به همان بخش توکن‌های Unit 08 اضافه شود (در صورت عدم وجود).

---

## 6. UI Behavior

- **بلوک Thinking:** آیکون + برچسب «تفکر Claude» + دکمه toggle؛ حالت پیش‌فرض بسته؛ استفاده از `--text-muted` برای متن.
- **بلوک Tool Use/Result:** یک کارت واحد با:
  - هدر: آیکون ابزار عمومی (یکسان برای همه) + نام ابزار (`tool_use.name`) + وضعیت (در حال اجرا / موفق / خطا)
  - بدنه (collapsible): ورودی (`input`) به‌صورت JSON فرمت‌شده، خروجی (`tool_result.content`) به‌صورت متن/JSON
  - رنگ حاشیه: خنثی به‌طور پیش‌فرض، `--state-error` در صورت `is_error: true`
- **پیوست متنی (`attachments`):** کارت فایل با آیکون سند، نام فایل (در صورت خالی بودن → «فایل بدون نام»)، حجم فایل، و دکمه «نمایش محتوا» برای باز کردن `extracted_content` کامل.
- **فایل بدون محتوا (`files`):** کارت غیرفعال (opacity کمتر) با آیکون قفل/عدم دسترسی و متن «این فایل در export گنجانده نشده».
- **پنل متادیتا:** بخش جدید «خلاصه» بالای بخش‌های موجود (تعداد پیام، تاریخ)، فقط برای مکالمات Claude نمایش داده می‌شود (چون DeepSeek فیلد `summary` ندارد).

---

## 7. Validation

- اگر `chat_messages` خالی باشد → مکالمه با پیام «این گفتگو پیامی ندارد» نمایش داده شود، نه خطا.
- اگر `content[]` یک پیام خالی باشد ولی `text` مقدار داشته باشد → از `text` به‌عنوان fallback استفاده شود (مطابق طراحی fragment discriminator موجود).
- اگر `tool_use_id` در `tool_result` به هیچ `tool_use.id` ای در همان پیام یا پیام قبلی متصل نشد → `tool_result` به‌صورت مستقل (بدون پیوند بصری) نمایش داده شود، بدون کرش.
- اگر نوع `content[].type` ناشناس بود (خارج از ۴ نوع کشف‌شده) → طبق سیستم fragment discriminator موجود، به‌صورت generic fallback (نمایش JSON خام) نمایش داده شود.

---

## 8. Edge Cases

| سناریو | رفتار مورد انتظار |
|--------|---------------------|
| `thinking.thinking` رشته خالی است ولی `summaries` دارد | نمایش `summaries[0].summary` به‌جای متن خالی، در حالت collapsed |
| `tool_use.input` شامل رشته بسیار طولانی (مثلاً `file_text` چند هزار خطی) | Truncate با «نمایش کامل» بعد از حد مشخص (مثلاً ۲۰۰۰ کاراکتر) |
| پیامی با `parent_message_uuid` اشاره به شاخه‌ی موازی (branching واقعی در فایل) | فقط آخرین/اولین شاخه در مسیر اصلی رندر شود؛ شاخه‌های دیگر نادیده گرفته شوند (مستند در ADR — قابل توسعه در Unit جداگانه بعداً) |
| `files[]` دارای چند ورودی | همه به‌صورت کارت‌های غیرفعال جداگانه نمایش داده شوند |
| مقدار `name` تهی در `account` یا سایر فیلدهای غیرضروری | نادیده گرفته شود؛ تاثیری در رندر ندارد |
| فایل export آپلودی مخلوطی از پلتفرم‌ها (نامعتبر) | طبق منطق موجود Unit 02/01 به‌عنوان فرمت ناشناس رد شود |

---

## 9. Acceptance Criteria

- [ ] فایل export واقعی Claude به‌درستی به‌عنوان پلتفرم Claude شناسایی می‌شود (نه DeepSeek، نه ناشناس).
- [ ] پیام‌های `text` با Markdown صحیح رندر می‌شوند.
- [ ] بلوک‌های `thinking` با `thinking_hidden: true` مخفی می‌مانند؛ با `false` به‌صورت collapsed با دکمه toggle نمایش داده می‌شوند.
- [ ] تمام ۱۵+ نوع `tool_use` موجود در فیکسچر واقعی بدون کرش با قالب عمومی رندر می‌شوند.
- [ ] `tool_result` با `is_error: true` با استایل خطا مشخص است.
- [ ] پیوست‌های متنی (`attachments`) محتوای کامل را نمایش می‌دهند.
- [ ] مدخل‌های `files` بدون محتوا به‌صورت placeholder غیرفعال نمایش داده می‌شوند، بدون کرش برنامه.
- [ ] فیلد `summary` در پنل متادیتا فقط برای مکالمات Claude نمایش داده می‌شود.
- [ ] عملکرد رندر با مکالمات طولانی (چند صد پیام، شامل tool_use حجیم) روان باقی می‌ماند.
- [ ] هیچ تغییری در منطق Unit 01/02/03/04 (پایپ‌لاین مشترک) رخ نمی‌دهد — فقط پارسر و رندرر اختصاصی Claude اضافه می‌شود.

---

## 10. یادداشت معماری (ADR Notes)

- **رندر ابزارها (Tool Use/Result):** به‌صورت عمومی و یکسان برای همه‌ی انواع ابزار پیاده می‌شود (نه اختصاصی per-tool) تا دامنه‌ی Unit کنترل‌شده بماند. رندر اختصاصی برای ابزارهای پرکاربرد (مثلاً `web_search`) می‌تواند در یک Unit بهبود بعدی (مثلاً Unit 1x) اضافه شود.
- **Branching:** ساختار `parent_message_uuid` امکان شاخه‌های موازی (ویرایش/regenerate) را دارد، اما در این Unit فقط مسیر خطی اصلی رندر می‌شود — مشابه رویکرد DeepSeek. پشتیبانی کامل از branching به‌صورت آگاهانه از scope این Unit خارج نگه داشته شده و باید در آینده به‌عنوان feature جداگانه بررسی شود.
- **فایل‌های بدون محتوا (`files[]`):** به دلیل نبود محتوای باینری در export، امکان نمایش تصویر واقعی وجود ندارد؛ این یک محدودیت ذاتی فرمت export Claude است، نه نقص پیاده‌سازی.
