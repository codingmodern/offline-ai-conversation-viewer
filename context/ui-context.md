# UI Context

---

## 1. Design Philosophy

این پروژه دو لایه‌ی بصری مجزا دارد:

1. **Shell UI (UI مشترک اپلیکیشن):** Library Sidebar، صفحه‌ی Import، جستجو، پنل متادیتا — یک زبان بصری واحد، خنثی و کاربردی دارد که مستقل از هر پلتفرم AI است.
2. **Provider Themes (Theme اختصاصی هر پلتفرم):** ناحیه‌ی نمایش مکالمه، که باید حس‌وحال بصری همان پلتفرم اصلی (ChatGPT/Claude/Gemini/DeepSeek) را بازتولید کند — بدون کپی مستقیم کد یا Asset رسمی (طبق Invariant #6 در `architecture.md`).

Shell UI باید ساده، بی‌طرف و در پس‌زمینه بماند تا وقتی کاربر مکالمه‌ای را باز می‌کند، Theme همان پلتفرم کاملاً «تجربه‌ی غالب» صفحه باشد.

---

## 2. Shell UI Theme (UI مشترک)

> این تنظیمات فقط برای بخش‌های مشترک اپلیکیشن (Sidebar، Import، Search، Metadata Panel) اعمال می‌شود؛ ناحیه‌ی نمایش مکالمه از Token‌های Provider Theme (بخش ۴) استفاده می‌کند.

| Property | Setting |
|----------|---------|
| **Mode** | Dark + Light (قابل Toggle توسط کاربر) |
| **Design Language** | مینیمال، خنثی، تکنیکال — شبیه یک File Manager/Library، نه یک Chat App |
| **Inspiration** | Linear, Notion (برای Shell)؛ هر پلتفرم برای Theme اختصاصی خودش (بخش ۴) |

### رنگ پایه Shell (مستقل از Providerها)

| Role | CSS Variable | Usage |
|------|-------------|-------|
| Page Background | `--shell-bg-base` | پس‌زمینه‌ی کلی Shell |
| Surface | `--shell-bg-surface` | Sidebar، کارت‌ها |
| Surface Elevated | `--shell-bg-elevated` | Modal، Dropdown، Tooltip |
| Hover | `--shell-bg-hover` | Hover روی آیتم‌های Sidebar |
| Primary Text | `--shell-text-primary` | متن اصلی |
| Secondary Text | `--shell-text-secondary` | برچسب‌ها، توضیحات |
| Muted Text | `--shell-text-muted` | Placeholder، غیرفعال |
| Border | `--shell-border-default` | جداکننده‌ها |
| Error / Warning / Success / Info | `--shell-state-error/warning/success/info` | پیام‌های سیستمی (خطای Import، هشدار Quota و ...) |

> مقادیر Hex دقیق در فاز Implementation، هم‌راستا با یک پالت خنثی (خاکستری/آبی تیره) تعیین می‌شود — نه رنگ اختصاصی هیچ Providerای.

### تایپوگرافی Shell

| Role | Font | CSS Variable |
|------|------|-------------|
| UI / Body Text | System UI Stack (بدون وابستگی به فونت اختصاصی هیچ Provider) | `--shell-font-sans` |
| Code / Mono | Monospace استاندارد (برای نمایش جزئیات فنی خطا در صورت نیاز) | `--shell-font-mono` |

---

## 3. Shell Layout Patterns

| Pattern | Description |
|---------|--------------|
| **App Shell** | Full-viewport: Sidebar چپ (کتابخانه‌ی مکالمات) + ناحیه‌ی نمایش مکالمه که Theme اختصاصی همان Provider را می‌گیرد |
| **Sidebar** | عرض ثابت، شامل: نوار جستجو در بالا، لیست مکالمات (با آیکون کوچک Provider هر مکالمه)، دکمه‌ی Import در پایین؛ کنار آن دکمه‌ی مخرب «حذف همه‌ی گفتگوها» — فقط وقتی کتابخانه غیرخالی است، و همیشه پشت یک Confirm Dialog واحد (ADR #14) |
| **Import Zone** | Drag & Drop Area تمام‌صفحه یا Modal، با وضعیت‌های Idle / Dragging / Parsing / Error |
| **Metadata Panel** | Panel کناری یا بخش بالای ناحیه‌ی مکالمه؛ نمایش عنوان، تاریخ، تعداد پیام، نام مدل (طبق Feature «Conversation Metadata» در `project-overview.md`) |
| **Empty State** | وقتی کتابخانه خالی است، راهنمای واضح برای Import اولین فایل |
| **Error Toast/Banner** | برای خطاهای کاربرپسند (طبق «Error Handling Standards» در `code-standards.md`) — بدون جزئیات فنی خام. همان الگوی Banner برای پیام‌های **وضعیت** هم به کار می‌رود: خلاصه‌ی پایان دسته‌ی Import («N گفتگو اضافه شد، M گفتگوی تکراری نادیده گرفته شد.») به‌صورت بنر غیرمسدودکننده با `role="status"` و رنگ `--shell-state-success` (ADR #13) |

---

## 4. Provider Theme Framework

### 4.1 ساختار Token اجباری برای هر Theme

هر پلتفرم باید مجموعه‌ی زیر را در `themes/{provider}/tokens.css` تعریف کند (نگاشت به `architecture.md` → `themes/`):

| دسته | Token‌های موردنیاز |
|------|---------------------|
| **رنگ پس‌زمینه** | `--{provider}-bg-base`, `--{provider}-bg-surface`, `--{provider}-bg-elevated` |
| **رنگ متن** | `--{provider}-text-primary`, `--{provider}-text-secondary`, `--{provider}-text-muted` |
| **رنگ حباب پیام** | `--{provider}-bubble-user-bg`, `--{provider}-bubble-user-text`, `--{provider}-bubble-assistant-bg`, `--{provider}-bubble-assistant-text` |
| **رنگ Accent** | `--{provider}-accent-primary`, `--{provider}-accent-hover` |
| **تایپوگرافی** | `--{provider}-font-sans`, `--{provider}-font-mono` (فقط از فونت‌های عمومی/آزاد؛ بدون فونت اختصاصی غیرمجاز) |
| **Border Radius** | `--{provider}-radius-bubble`, `--{provider}-radius-surface` |
| **Spacing** | `--{provider}-spacing-message-gap`, `--{provider}-spacing-container-padding` |
| **Sidebar/Layout** (در صورت تفاوت بصری با Shell) | `--{provider}-sidebar-width`, `--{provider}-layout-*` |

### 4.2 قوانین پیاده‌سازی Theme

| Rule | Detail |
|------|--------|
| **جداسازی کامل** | هیچ Componentی نباید Token یک Provider را Hardcode کند؛ همیشه از طریق CSS Custom Property همان `themes/{provider}/` |
| **Fallback** | اگر پلتفرمی ناشناخته بود، فایل اصلاً به کتابخانه اضافه نمی‌شود، بنابراین نیازی به Theme پیش‌فرض عمومی نیست |
| **استقلال از Asset رسمی** | فونت، آیکون یا تصویر اختصاصی و کپی‌رایت‌شده‌ی هیچ Provider استفاده نمی‌شود؛ از فونت‌های آزاد با ظاهر مشابه یا آیکون‌های عمومی (Lucide) با رنگ‌آمیزی مطابق Theme استفاده می‌شود |
| **مطابقت با Accessibility** | حتی در Theme اختصاصی، Contrast رنگ باید حداقل استاندارد AA را رعایت کند (بخش ۶) |

### 4.3 ChatGPT Theme

#### Design Language
اصل حاکم بر ChatGPT «سادگی رادیکال» است: تک‌ستونی، فضای خنثی زیاد، بدون تزئین غیرضروری. کنتراست بین پیام کاربر و پاسخ مدل از طریق شکل (حباب در برابر بدون‌حباب) و Alignment القا می‌شود، نه رنگ‌های تند. عناصر تعاملی (دکمه‌های عملیات پیام) پیش‌فرض پنهان‌اند و فقط با Hover ظاهر می‌شوند.

#### Overall Layout
- ساختار سه‌بخشی: **Sidebar ثابت/Collapsible** (چپ) + **ناحیه‌ی گفتگوی تک‌ستونی** (مرکز) + **نوار Input ثابت در پایین**.
- عرض محتوای گفتگو محدود (~`768px`) و در مرکز صفحه.
- هدر بالای صفحه سبک و کم‌ارتفاع: نام/انتخابگر مدل در وسط یا چپ، آیکون حساب کاربری در راست.
- در این پروژه (Viewer آفلاین)، نوار Input پایین به‌صورت غیرفعال/Decorative نمایش داده می‌شود.

#### Sidebar Structure & Behavior
- عرض ثابت حدود `260px`؛ در نسخه‌ی جدیدتر رابط به‌صورت **Floating/Overlay** نیز قابل نمایش است.
- حالت پیش‌فرض: در دسکتاپ باز، در موبایل بسته.
- دکمه‌ی Collapse/Expand همیشه در تمام اندازه‌های صفحه قابل مشاهده است.
- ساختار داخلی از بالا به پایین: New Chat → جستجو → Pinned → لیست مکالمات (گروه‌بندی زمانی: Today / Yesterday / Previous 7 Days) → تنظیمات/حساب.
- در حالت Collapsed، دکمه‌ی فشرده‌ی «New Chat» در هدر ظاهر می‌شود.
- روی موبایل: Click-outside-to-close؛ در دسکتاپ این رفتار اعمال نمی‌شود.

#### Color Palette

| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `--chatgpt-bg-base` | `#FFFFFF` | `#212121` | پس‌زمینه‌ی ناحیه‌ی گفتگو |
| `--chatgpt-bg-surface` | `#F9F9F9` | `#171717` | پس‌زمینه‌ی Sidebar |
| `--chatgpt-bg-elevated` | `#FFFFFF` + Shadow | `#2F2F2F` | Dropdown، Modal، Floating Action Bar |
| `--chatgpt-bubble-user-bg` | `#F4F4F4` | `#2F2F2F` | حباب پیام کاربر |
| `--chatgpt-bubble-user-text` | `#0D0D0D` | `#ECECEC` | متن پیام کاربر |
| `--chatgpt-bubble-assistant-bg` | شفاف (بدون حباب) | شفاف | پاسخ مدل |
| `--chatgpt-bubble-assistant-text` | `#0D0D0D` | `#ECECEC` | متن پاسخ مدل |
| `--chatgpt-accent-primary` | `#10A37F` | `#10A37F` | لینک‌ها، وضعیت فعال |
| `--chatgpt-accent-hover` | `#0D8A6C` | `#0D8A6C` | Hover روی Accent |
| `--chatgpt-text-secondary` | `#6E6E80` | `#B4B4B4` | زمان، برچسب‌ها |
| `--chatgpt-text-primary` | `#0D0D0D` | `#ECECEC` | متن اصلی (§4.1) |
| `--chatgpt-text-muted` | `#6E6E80` | `#B4B4B4` | خط تاریخ/Placeholder — همان مقادیر text-secondary؛ §4.3 یک تنها سطح متنی ثانویه دارد |
| `--chatgpt-border-default` | `#E5E5E5` | `#3A3A3A` | جداکننده‌ها |
| `--chatgpt-code-bg` | `#0D0D0D` | `#0D0D0D` | پس‌زمینه‌ی بلوک کد |
| `--chatgpt-code-text` | `#ECECEC` | `#ECECEC` | متن بلوک کد روی `#0D0D0D` (غیراختیاری نیست: متن assistant در Light Mode `#0D0D0D` است) |
| `--chatgpt-code-inline-bg` | `#F4F4F4` | `#2F2F2F` | پس‌زمینه‌ی chip کد درون‌خطی (`code` در متن Markdown) |

#### Typography

| Token | مقدار |
|-------|-------|
| `--chatgpt-font-sans` | Sans-Serif هندسی و تمیز (معادل آزاد: **Inter** یا فونت سیستم) |
| `--chatgpt-font-mono` | Monospace استاندارد (معادل: **JetBrains Mono** یا `ui-monospace`) |
| اندازه‌ی متن پیام | `1rem`، Line Height `~1.75` |
| اندازه‌ی متن ثانویه | `0.8125rem` برای Timestamp و برچسب |

#### Spacing & Sizing

| Token | مقدار |
|-------|-------|
| `--chatgpt-radius-bubble` | `18px` (یک مقدار ثابت از بازه‌ی `12px`–`18px`) |
| `--chatgpt-radius-surface` | `8px` |
| `--chatgpt-spacing-message-gap` | `1.5rem` (~24px) |
| `--chatgpt-spacing-container-padding` | `1rem` (§4.1؛ §4.3 آن را نداشت — همسبه CLAUDE/Gemini) |
| `--chatgpt-max-content-width` | `48rem` (~768px) |
| ارتفاع هدر | `~56px` |
| عرض Sidebar | `260px` (Expanded) / `0px` (Collapsed) |

#### Chat Bubble Pattern
- **پیام کاربر:** حباب با پس‌زمینه‌ی ملایم و گوشه‌ی گرد، Align به راست یا محدود به عرض کوچک‌تر.
- **پاسخ مدل:** بدون حباب مجزا — متن مستقیم در عرض کامل ستون، **بدون آواتار** (همسبک با §4.4).
- حباب کاربر در حالت تیره روی خاکستری خنثی `#2F2F2F` می‌ماند؛ آبی دیده‌شده در اسکرین‌شات‌های واقعی یک Accent شخصی است، نه پیش‌فرض محصول — هیچ توکن آبی اضافی اضافه نمی‌شود (11b FR‑1، ADR‑M).

#### Thread Date Line
- یک خط تاریخ کم‌رنگ و **مرکزچین**، تنها **یک‌بار**، بالای رشته‌ی گفتگو.
- منبع: `createdAt` مکالمه؛ اگر نبود، نخستین زمان پیام؛ اگر هیچ زمانی نبود، خطی رندر نمی‌شود.
- قالب‌بندی با `Intl.DateTimeFormat('fa-IR', …)` مانند تاریخ‌های موجود پیام؛ هیچگاه رشته‌ی خام ISO.

#### Message Actions (رفتار Hover)
- دکمه‌ی عملیات (Copy) در دستگاه‌های با pointer پیش‌فرض مخفی است و با **Hover روی بدنه‌ی پیام یا Focus با صفحه‌کلید** در نوار زیر پیام ظاهر می‌شود؛ در دستگاه‌های لمسی (بدون hover) همیشه قابل‌دید است.
- **پیام کاربر:** Copy.
- **پاسخ مدل:** Copy.
- در این پروژه (Read-only) تنها **Copy** رندر می‌شود؛ آیکون‌های Decorative (Edit، Regenerate/Retry، Like/Dislike) کاملاً حذف شده‌اند (ADR‑L).

#### Code Blocks
- پس‌زمینه‌ی تیره‌ی ثابت حتی در Light Mode.
- نوار ابزار بالای بلوک: نام زبان (چپ) + دکمه‌ی Copy (راست).
- کلیک روی Copy یک Checkmark موقت نمایش می‌دهد.

#### Icons
- سبک: Stroke-based، بدون Fill — با Lucide React سازگار.
- آواتار مدل: **وجود ندارد**؛ هیچ آیکون جبرانی رندر نمی‌شود و لوگوی رسمی OpenAI به‌کار نمی‌رود.

#### Responsive Behavior

| Breakpoint | رفتار |
|-----------|-------|
| **Desktop (`>1024px`)** | Sidebar باز پیش‌فرض، قابل Collapse |
| **Tablet (`640–1024px`)** | Sidebar معمولاً بسته یا Floating |
| **Mobile (`<640px`)** | Sidebar Overlay تمام‌صفحه با Click-outside-to-close |

#### Light & Dark Mode Summary
- هر دو حالت کاملاً پشتیبانی می‌شوند؛ فقط Token‌های رنگی تغییر می‌کنند، Layout ثابت می‌ماند.

---

### 4.4 Claude Theme

#### Design Language
هویت بصری Claude «ادیتوریال گرم» است — پالت پوست‌کاغذی (Warm Paper) و ترکیب تایپوگرافی Serif+Sans الهام از مجلات با کیفیت. رنگ Accent مونوکروم و کم‌رنگ، به‌عنوان امضای بصری، نه پرکردن دکمه‌ها.

#### Overall Layout
- Sidebar + ستون گفتگوی مرکزی؛ هنگام تولید محتوای ساختاریافته، یک **پنل Artifact** در سمت راست باز می‌شود (چت چپ، پیش‌نمایش راست).
- ستون گفتگو متمرکزتر از ChatGPT؛ فضای خالی بیشتر (ریتم ادیتوریال).
- حالت خالی: هدینگ Serif در وسط صفحه + Composer زیر آن.

#### Sidebar Structure & Behavior
- بخش‌ها: گفتگوی جدید → **Chats** → **Projects** (فضای کاری با Instructions/Files مشترک) → **Artifacts** (مرور تمام Artifactهای منتشرشده) → حساب/تنظیمات.

> **نگاشت به این پروژه:** مفاهیم Projects/Artifacts به‌صورت تعاملی معنا ندارند، اما الگوی Sidebar سه‌بخشی می‌تواند الهام‌بخش دسته‌بندی مکالمات Claude در کتابخانه‌ی این پروژه باشد.

#### Color Palette

| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `--claude-bg-base` | `#ffffff` (= `--shell-bg-base`) | `#16181d` (= `--shell-bg-base`) | پس‌زمینه‌ی اصلی |
| `--claude-bg-surface` | `~#EEEDE5` | `~#26251F` | Sidebar |
| `--claude-bg-elevated` | `#FFFFFF` | `~#33322C` | Modal، پنل Artifact |
| `--claude-bubble-user-bg` | سطح ملایم‌تر از پس‌زمینه | لایه‌ی روشن‌تر از تیره | حباب پیام کاربر |
| `--claude-bubble-user-text` | `~#121212` | `~#ECE9E2` | متن کاربر |
| `--claude-bubble-assistant-bg` | شفاف | شفاف | پاسخ مدل — بدون قاب |
| `--claude-bubble-assistant-text` | `~#121212` | `~#ECE9E2` | متن پاسخ |
| `--claude-accent-primary` | `~#C96442` (Clay/Rust Orange) | `~#C96442` | امضای برند، Focus |
| `--claude-accent-hover` | تیره‌تر | روشن‌تر | Hover |
| `--claude-text-secondary` | `~#6B6A63` | `~#A8A69C` | متن کمکی |
| `--claude-border-default` | `~#E5E0D6` | `~#3D3B34` | جداکننده‌ها |

> رنگ Accent دقیق در منابع عمومی گاهی `#D97757` نیز گزارش شده؛ مقدار فوق Approximation قابل‌تنظیم است.

#### Typography

| Token | مقدار |
|-------|-------|
| `--claude-font-serif` | Serif ادیتوریال برای هدینگ‌ها (معادل: **Fraunces** یا **Source Serif**) |
| `--claude-font-sans` | Sans-Serif برای بدنه‌ی پیام‌ها (معادل: **system-ui** یا فونتی غیر از Inter) |
| `--claude-font-mono` | Monospace برای کد |
| ویژگی برجسته | استفاده‌ی گسترده از Serif حتی جایی که رقبا Sans به‌کار می‌برند |

#### Spacing & Sizing

| Token | مقدار |
|-------|-------|
| `--claude-radius-bubble` | `10px`–`16px` |
| `--claude-radius-surface` | `8px`–`12px` |
| `--claude-spacing-message-gap` | سخاوتمندانه، ریتم ادیتوریال |
| Composer | بدون Shadow، فقط Border ظریف هم‌تن |

#### Chat Bubble Pattern
- **پیام کاربر:** حباب با کنتراست کم نسبت به پس‌زمینه — تاکید روی تایپوگرافی.
- **پاسخ مدل:** بدون حباب و بدون آواتار — «متن روی کاغذ».

#### Message Actions
- **پیام کاربر:** Edit، Copy.
- **پاسخ مدل:** Copy، Like/Dislike، Reload.
- در این پروژه فقط Copy فعال است.

#### Code Blocks & Artifact Pattern
- بلوک کد کوتاه: نوار Copy بالای بلوک.
- محتوای بلندتر/ساختاریافته: کارت خلاصه‌ی Artifact (عنوان + نوع فایل + آیکون)؛ کلیک باز‌کننده‌ی پنل راست.
- در این پروژه، Artifactهای فایل Export به‌صورت کارت مشابه (نمایش کد خام) رندر می‌شوند.

#### Icons
- ساده، Stroke-based، با Lucide React و رنگ‌آمیزی Clay Orange؛ بدون لوگوی رسمی Anthropic.

#### Responsive Behavior

| Breakpoint | رفتار |
|-----------|-------|
| **Desktop** | Sidebar + گفتگو + پنل Artifact اختیاری |
| **Tablet** | پنل Artifact به‌صورت Overlay/Tab |
| **Mobile** | Sidebar Overlay؛ Artifact صفحه‌ی جداگانه با دکمه‌ی بازگشت |

#### Light & Dark Mode Summary
- حتی در Dark Mode، پس‌زمینه خاکستری/قهوه‌ای گرم است (نه سیاه خالص) تا حس کاغذ حفظ شود.

---

### 4.5 Gemini Theme

#### Design Language
طبق بازطراحی «Neural Expressive» (Material 3 Expressive، می ۲۰۲۶): «رنگ و حرکت در خدمت وضوح» — گرادیان‌های رنگی، سایه‌های شیشه‌ای (Blur/Glass) و انیمیشن هدفمند. پاسخ‌ها ترکیبی از متن، برجسته‌سازی، تصویر و Timeline‌اند، نه بلوک متن یکنواخت.

#### Overall Layout
- Sidebar + ستون گفتگو، با هویت «شیشه‌ای/گرادیانی».
- صفحه‌ی خالی: خوشامدگویی بزرگ وسط‌چین (متغیر هر بار) + لوگوی رنگی بالای آن.
- Input Box شناور، شکل Pill، جدا از پایین صفحه.
- دکمه‌های Attachment و Tools در یک دکمه‌ی «+» ادغام شده‌اند.

#### Sidebar Structure & Behavior
- ساختار: New Chat → جستجو → Images/Videos/Library → Notebooks → Recents.
- حساب Google و تنظیمات داخل پایین Sidebar (نه صفحه‌ی جدا).
- دکمه‌ی جمع‌کردن با آیکون دو خط؛ Model Picker زیر Chevron کنار همین دکمه.

#### Color Palette

| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `--gemini-bg-base` | گرادیان آبی-سفید ملایم | خاکستری تیره‌ی گرم `~#1E1F20` | پس‌زمینه‌ی اصلی |
| `--gemini-bg-surface` | `~#F0F4F9` | `~#282A2C` | Sidebar |
| `--gemini-bg-elevated` | `#FFFFFF` + Blur | `~#333537` + Blur | Dropdown، Canvas Panel |
| `--gemini-bubble-user-bg` | `~#E8EEF9` | `~#3B3F45` | حباب کاربر |
| `--gemini-bubble-user-text` | `~#1F1F1F` | `~#E3E3E3` | متن کاربر |
| `--gemini-bubble-assistant-bg` | شفاف/کارت ملایم | شفاف/کارت ملایم | پاسخ مدل |
| `--gemini-accent-primary` | آبی Google `~#4285F4` (+ گرادیان چندرنگ در لوگو) | همان، روشنایی متعادل | لوگو، دکمه‌ی اصلی |
| `--gemini-accent-hover` | `~#3367D6` | روشن‌تر | Hover |
| `--gemini-text-secondary` | `~#5F6368` | `~#9AA0A6` | متن کمکی |
| `--gemini-border-default` | `~#DADCE0` | `~#3C4043` | جداکننده‌ها |

#### Typography

| Token | مقدار |
|-------|-------|
| `--gemini-font-sans` | خانواده‌ی Google Sans (معادل آزاد: **Roboto** یا Sans هندسی مشابه) |
| `--gemini-font-mono` | `Roboto Mono` یا `ui-monospace` |
| ویژگی | وزن‌های متغیر برای سلسله‌مراتب بصری قوی‌تر در پاسخ‌های ساختاریافته |

#### Spacing & Sizing

| Token | مقدار |
|-------|-------|
| `--gemini-radius-bubble` | `16px`–`24px` |
| `--gemini-radius-surface` | `16px` |
| `--gemini-radius-input` | `9999px` (Pill) |
| `--gemini-spacing-message-gap` | متوسط، فضای بیشتر اطراف عناصر بصری |

#### Chat Bubble Pattern
- **پیام کاربر:** حباب آبی بسیار ملایم، گوشه‌ی بسیار گرد.
- **پاسخ مدل:** ترکیب متن + کارت‌های ساختاریافته (Highlight، تصویر، Timeline).
- آواتار: نماد چهار-دایره‌ای رنگی — در این پروژه با نماد انتزاعی جایگزین می‌شود.

#### Message Actions
- Copy، Regenerate، Like/Dislike، Share — عمدتاً همیشه‌نمایان در انتهای پاسخ.
- در این پروژه فقط Copy فعال است.

#### Code Blocks & Canvas Pattern
- بلوک کد کوتاه: نوار Copy بالا.
- محتوای بلند/تعاملی: پنل **Canvas** در راست (مشابه Artifact). در این پروژه به‌صورت کارت + کد خام رندر می‌شود.

#### Icons
- ترکیب Stroke ساده (Lucide React) و اشکال گرد/دایره‌ای برای عناصر برندی؛ بدون لوگوی رسمی Google.

#### Responsive Behavior

| Breakpoint | رفتار |
|-----------|-------|
| **Desktop** | Sidebar + گفتگو + Canvas Panel اختیاری |
| **Tablet** | Sidebar قابل جمع‌شدن؛ Canvas Overlay |
| **Mobile** | Sidebar تمام‌صفحه؛ Input شناور Pill پایین صفحه |

#### Light & Dark Mode Summary
- Dark Mode خاکستری تیره‌ی گرم (نه سیاه مطلق)؛ گرادیان برند در هر دو حالت با روشنایی متفاوت.

---

### 4.6 DeepSeek Theme

> مقادیر زیر بر اساس اسکرین‌شات‌های واقعی DeepSeek (تاریخ ۲۰۲۶-۰۸-۲۶) تأیید و اصلاح شده‌اند (ADR #17 در `progress-tracker.md`) و دیگر Approximate نیستند.

#### Design Language
«مینیمالیسم کارکردی» — ساده، بدون تزئین اضافه، بدون برندینگ پررنگ. تمرکز روی سرعت و شفافیت فرآیند استدلال (Reasoning)، نه جلوه‌ی بصری.

#### Overall Layout
- Sidebar باریک + ستون گفتگوی تک‌ستونی + Input ساده در پایین.
- بدون هدر پیچیده.
- دکمه‌ی **DeepThink** در نوار Input: فعال‌سازی آن خروجی را به «فرآیند تفکر» (Collapsible) و «پاسخ نهایی» تقسیم می‌کند.

#### Sidebar Structure & Behavior
- New Chat → لیست مکالمات اخیر (بدون گروه‌بندی زمانی پیچیده) → تنظیمات/حساب.
- بدون بخش‌های اضافی مثل Projects/Artifacts.
- قابل جمع‌شدن به نوار باریک آیکون‌محور.

#### Color Palette

| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `--deepseek-bg-base` | `#FFFFFF` | `~#1A1A1A` | پس‌زمینه‌ی اصلی |
| `--deepseek-bg-surface` | `~#F7F7F8` | `~#141414` | Sidebar |
| `--deepseek-bg-elevated` | `#FFFFFF` + Shadow | `~#242424` | Dropdown، Modal |
| `--deepseek-bubble-user-bg` | `~#EFF3FF` | `~#2A2A2A` (خاکستری خنثی، بدون ته‌رنگ آبی) | حباب کاربر |
| `--deepseek-bubble-user-text` | `~#1A1A1A` | `~#E8E8E8` | متن کاربر |
| `--deepseek-bubble-assistant-bg` | شفاف | شفاف | پاسخ مدل |
| `--deepseek-accent-primary` | `~#4D6BFE` | همان، روشنایی متعادل | دکمه‌ی اصلی، DeepThink فعال |
| `--deepseek-accent-hover` | تیره‌تر | روشن‌تر | Hover |
| `--deepseek-text-secondary` | `~#6B7280` | `~#9CA3AF` | متن کمکی |
| `--deepseek-border-default` | `~#E5E7EB` | `~#2E2E2E` | جداکننده‌ها |
| `--deepseek-thinking-text` | خاکستری کم‌رنگ | خاکستری روشنِ کم‌رنگ | متن بخش «فرآیند تفکر» — **بدون جعبه‌ی پس‌زمینه‌ی مجزا** (ADR #17) |

#### Typography

| Token | مقدار |
|-------|-------|
| `--deepseek-font-sans` | Sans-Serif ساده (معادل: **Inter** یا فونت سیستم) |
| `--deepseek-font-mono` | Monospace استاندارد |
| ویژگی | بدون سلسله‌مراتب پیچیده؛ خوانایی ساده و یکنواخت |

#### Spacing & Sizing

| Token | مقدار |
|-------|-------|
| `--deepseek-radius-bubble` | `8px`–`12px` |
| `--deepseek-radius-surface` | `8px` |
| `--deepseek-spacing-message-gap` | متوسط |
| عرض Sidebar | `~240px` |

#### Chat Bubble Pattern
- **پیام کاربر:** حباب ساده — در حالت روشن با ته‌رنگ آبی بسیار ملایم (`~#EFF3FF`)، در حالت تیره **خاکستری خنثی** (`~#2A2A2A`) بدون ته‌رنگ آبی (ADR #17).
- **پاسخ مدل:** بدون حباب، تمام‌عرض؛ بخش Thinking (در صورت وجود) **هیچ جعبه‌ی پس‌زمینه‌ی مجزا ندارد — حتی وقتی باز است** — و مستقیم روی پس‌زمینه‌ی پایه رندر می‌شود؛ تنها با رنگ متن کم‌رنگ‌تر (`--deepseek-thinking-text`) و ساختار فهرست شماره‌دار از پاسخ نهایی متمایز می‌شود. هدر جمع‌شونده‌ی «Thought for N seconds» با رنگ Accent است (ADR #17).

#### Message Actions
- **پیام کاربر:** فقط Copy (با همان کامپوننت، چیدمان و رفتار دکمه‌ی Copy پیام مدل — دکمه در سطر Action زیر حباب، هم‌ردیف انتهای حباب و به سمت شروع خط؛ ADR #21، supersede تصمیم قبلی «action-free bubble»).
- **پاسخ مدل:** Copy، Regenerate، Like/Dislike + دکمه‌ی Toggle نمایش بخش Thinking.
- در این پروژه فقط Copy و Toggle Thinking فعال‌اند.

#### Code Blocks
- بلوک کد با پس‌زمینه‌ی تیره‌ی مجزا و دکمه‌ی Copy — بدون ویژگی اختصاصی اضافه.

#### Icons
- Stroke ساده (Lucide React)؛ آواتار مدل نماد انتزاعی، بدون لوگوی رسمی Whale.

#### Responsive Behavior

| Breakpoint | رفتار |
|-----------|-------|
| **Desktop** | Sidebar باریک ثابت + گفتگو |
| **Tablet** | Sidebar قابل جمع‌شدن به نوار آیکون |
| **Mobile** | Sidebar Overlay؛ بخش Thinking پیش‌فرض Collapsed |

#### Light & Dark Mode Summary
- هر دو حالت با ساختار یکسان؛ Dark Mode خاکستری تیره (نه سیاه مطلق).

---

## 5. Border Radius Scale (Shell)

| Context | Value |
|---------|-------|
| Inline / small UI | `4px` |
| Cards / panels | `8px` |
| Modals / overlays | `12px` |
| Full / pills | `9999px` |

> Radius اختصاصی هر Provider Theme جدا تعریف شده (بخش ۴).

---

## 6. Accessibility (اعمال‌شونده روی Shell و همه‌ی Provider Themeها)

| Requirement | Standard |
|-------------|----------|
| Color Contrast | حداقل AA (4.5:1 متن معمولی، 3:1 متن بزرگ) — حتی در هر Theme اختصاصی |
| Focus Indicators | Outline قابل‌مشاهده روی همه‌ی Elementهای تعاملی |
| ARIA Labels | تمام آیکون‌ها و Elementهای غیرمتنی باید Label دسترس‌پذیر داشته باشند |
| Keyboard Navigation | جابه‌جایی کامل بین مکالمات، جستجو و Import فقط با صفحه‌کلید ممکن باشد |
| Reduced Motion | رعایت `prefers-reduced-motion` — غیرفعال‌سازی انیمیشن‌های غیرضروری |

---

## 7. Responsiveness

| Breakpoint | Range | Target |
|-----------|-------|--------|
| **Mobile** | `< 640px` | Sidebar به‌صورت Overlay/Drawer؛ نمایش تک‌ستونی مکالمه |
| **Tablet** | `640px – 1024px` | Sidebar قابل‌جمع‌شدن، ناحیه‌ی مکالمه اصلی |
| **Desktop** | `> 1024px` | Sidebar ثابت + ناحیه‌ی مکالمه + Metadata Panel در صورت باز بودن |
| **Wide** | `> 1440px` | محدودیت حداکثر عرض محتوای مکالمه برای خوانایی بهتر |

---

## 8. Component Library

| Aspect | Standard |
|--------|----------|
| **Library** | بدون کتابخانه‌ی UI سنگین خارجی برای Shell؛ Componentهای سفارشی مطابق `code-standards.md` |
| **Component Location** | `components/` برای Shell، `themes/{provider}/` برای Componentهای اختصاصی نمایش مکالمه |
| **Icon Library** | Lucide React (Stroke-based, Open Source) — رنگ‌آمیزی مطابق Token هر Theme؛ بدون آیکون رسمی کپی‌شده از هیچ Provider |
| **Animation** | CSS Transitions ساده برای Shell؛ رعایت `prefers-reduced-motion` |
