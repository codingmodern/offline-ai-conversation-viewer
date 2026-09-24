## `00-build-plan.md`

# Build Plan

> این سند ترتیب و وابستگی واحدهای پیاده‌سازی (Feature Specs) پروژه را مشخص می‌کند. هر واحد یک Feature تأییدشده از `project-overview.md` است و باید طبق `ai-workflow-rules.md` (یک واحد در هر زمان، تأیید قبل از ادامه) پیاده‌سازی شود.

---

## ترتیب واحدها

| Unit | Feature | Spec File | وابسته به | وضعیت |
|------|---------|-----------|------------|--------|
| 01 | Import & Validation | `01-import-validation.md` | — (اولین واحد) | ✅ Completed |
| 02 | Platform Auto-Detection | `02-platform-detection.md` | Unit 01 | ⏳ Pending |
| 03 | Modular Parsing System | `03-modular-parsing.md` | Unit 01, 02 | ⏳ Pending |
| 04 | Local Chat Library | `04-local-chat-library.md` | Unit 03 | ⏳ Pending |
| 05 | Conversation Metadata | `05-conversation-metadata.md` | Unit 04 | ⏳ Pending |
| 06 | Authentic Multi-Theme Rendering | `06-multi-theme-rendering.md` | Unit 04 | ⏳ Pending |
| 07 | In-Chat Search | `07-in-chat-search.md` | Unit 04 | ⏳ Pending |

**Status Legend:** ✅ Completed · 🔄 In Progress · ⏳ Pending · ❌ Blocked

---

## منطق ترتیب‌دهی

این ترتیب از Data Flow تعریف‌شده در `architecture.md` پیروی می‌کند:

```
Import & Validation → Platform Auto-Detection → Modular Parsing System
        → Local Chat Library
              → Conversation Metadata
              → Authentic Multi-Theme Rendering
              → In-Chat Search
```

- **Unit 01–03** یک زنجیره‌ی خطی‌اند: هر فایل باید قبل از هر چیز خوانده/Validate شود (01)، سپس پلتفرمش تشخیص داده شود (02)، سپس با Parser مربوطه به مدل یکسان تبدیل شود (03).
- **Unit 04** (Local Chat Library) به نتیجه‌ی Unit 03 نیاز دارد چون فقط داده‌ی Normalize‌شده ذخیره می‌شود.
- **Unit 05، 06، 07** هر سه به‌طور مستقل به Unit 04 وابسته‌اند (نیاز به کتابخانه‌ی دارای داده دارند) اما به یکدیگر وابسته نیستند؛ ترتیب اجرای این سه می‌تواند در صورت نیاز جابه‌جا شود، اما پیش‌فرض به ترتیب جدول بالاست.

---

## نکته‌ی مربوط به زیرساخت (Scaffolding)

طبق قانون «بدون کار حدسی/پیش‌دستانه» (`ai-workflow-rules.md`)، این پروژه واحد جداگانه‌ای صرفاً برای «Project Setup» یا «تعریف کامل مدل داده» ندارد. زیرساخت لازم (مقداردهی اولیه‌ی Vite/React/TypeScript، و تعریف اولیه‌ی Typeهای موردنیاز مثل `ParseError`) **به‌صورت حداقلی و در همان حد ضروری، در ابتدای پیاده‌سازی Unit 01 انجام می‌شود** — نه به‌عنوان یک فاز مجزا و نه فراتر از نیاز همان واحد.

اگر واحدهای بعدی (مثلاً Unit 03 یا 04) به بخش‌هایی از مدل داده یا Schema نیاز داشتند که هنوز تعریف نشده، آن بخش در همان واحد و در حد نیاز اضافه می‌شود، طبق اصل «افزایش‌های کوچک و قابل‌تأیید».

---

## گام بعدی

Unit 01 تکمیل و تأیید شده است. Unit 02 (`02-platform-detection.md`) گام بعدی برای تعریف Spec است.

