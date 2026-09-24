## code-standards.md

# Code Standards

---

## 1. General Principles

- **Keep modules small and single-purpose.** هر فایل یک مسئولیت مشخص دارد (یک Parser، یک Component، یک Hook).
- **Fix root causes, not symptoms.** رفع باگ در ریشه، نه Patch موقتی روی خروجی.
- **Do not mix unrelated concerns** در یک Component، Parser یا Hook.
- **Prefer clarity over cleverness.** کد خوانا مهم‌تر از کد کوتاه است.
- **Names reveal intent.** نام‌گذاری باید «چه کاری» را نشان دهد، نه «چگونه».
- **Parser Isolation:** هیچ ماژول در `parsers/` نباید به ماژول Parser دیگری Import مستقیم داشته باشد (طبق Invariant #3 در `architecture.md`).
- **No Official Assets:** هیچ کد، فونت غیرمجاز یا Asset رسمی از ChatGPT/Claude/Gemini/DeepSeek کپی نمی‌شود؛ Themeها بازآفرینی مستقل‌اند.

---

## 2. Language Standards — TypeScript

### Configuration

| Setting | Value |
|---------|-------|
| **Language Version** | TypeScript (Latest Stable) |
| **Strict Mode** | Enabled |
| **Linter** | ESLint + `@typescript-eslint/strict` |
| **Formatter** | Prettier — 2-space indent, 100 char line width, single quotes |

### Rules

| Rule | Enforcement |
|------|------------|
| Strict mode الزامی است | `tsconfig.json`: `"strict": true` |
| از `any` خودداری شود | ❌ `any` → ✅ `unknown` + Type Guard، یا Interface مشخص |
| ورودی خارجی (فایل JSON) قبل از اعتماد Validate شود | استفاده از Type Guard دستی یا Schema Validation (مثلاً Zod) در ورودی هر Parser |
| تمام توابع باید Return Type صریح داشته باشند | بدون `any` ضمنی در خروجی |
| مدل‌های داده‌ی مشترک فقط در `types/` تعریف می‌شوند | تکرار Type ممنوع؛ Import از منبع واحد |
| Discriminated Union برای خروجی Parse/Detect | مثلاً `{ ok: true, data: UnifiedConversation } | { ok: false, error: ParseError }` به‌جای throw کردن خطای بی‌نوع |

### 2.1 Import Conventions

| Rule | Detail |
|------|--------|
| **Alias ریشه** | `@/` به ریشه‌ی `src/` نگاشت می‌شود (پیکربندی در `tsconfig.json` → `paths` و `vite.config.ts` → `resolve.alias`) |
| **استفاده‌ی اجباری** | تمام Import‌های بین ماژولی باید از `@/` استفاده کنند؛ به‌جز Import از فایل هم‌سطح یا زیرپوشه‌ی مستقیم همان ماژول |
| **ممنوعیت Relative عمیق** | مسیرهای نسبی با بیش از یک سطح بالارونده (`../../`) مجاز نیستند |
| **مثال درست** | `import { ChatParser } from '@/parsers/chatgpt';` |
| **مثال نادرست** | `import { ChatParser } from '../../../parsers/chatgpt';` |
| **Import داخل همان ماژول** | `import { normalize } from './normalize';` مجاز است (فقط یک سطح، بدون بالارفتن از پوشه) |

---

## 3. Framework Conventions — React

| Convention | Rule |
|-----------|------|
| Component Type | Functional Components + Hooks؛ بدون Class Component |
| File Naming | یک Component در هر فایل، نام فایل = نام Component (`ConversationList.tsx`) |
| State Management | React State/Context برای UI؛ Dexie (via `useLiveQuery` یا معادل) برای داده‌ی پایدار؛ بدون کتابخانه‌ی State خارجی اضافه مگر ضرورت اثبات‌شده |
| Styling | CSS Modules (`Component.module.css`) + CSS Custom Properties برای Theme Tokens؛ بدون Inline Style برای استایل‌های پایدار |
| Side Effects | فقط داخل `useEffect` یا Custom Hook؛ بدون Side Effect در بدنه‌ی Render |
| Heavy Parsing | هرگز مستقیم در Component اجرا نشود؛ همیشه از طریق `workers/` |
| Theme Injection | هر Theme پلتفرم به‌صورت یک مجموعه Component/CSS Module مجزا در `themes/{provider}/` پیاده می‌شود؛ Component‌های مشترک نباید منطق اختصاصی یک پلتفرم را داخل خود Hardcode کنند |
| Accessibility | هر Element تعاملی باید ARIA Label و پشتیبانی از Keyboard داشته باشد (طبق `ui-context.md`) |

---

## 4. Module & Parser Conventions

> این پروژه API/Route ندارد؛ این بخش جایگزین «API Routes» در قالب استاندارد است.

| Rule | Detail |
|------|--------|
| قرارداد ثابت هر Parser | هر ماژول در `parsers/{provider}/` باید `detect(rawJson: unknown): boolean` و `parse(rawJson: unknown): ParseResult` را Export کند |
| بدون وابستگی متقاطع | Parser یک پلتفرم هرگز از Parser پلتفرم دیگر Import نمی‌کند |
| خروجی یکسان | همه‌ی Parserها باید به `UnifiedConversation` (تعریف در `types/`) نگاشت شوند |
| خطای قابل‌پیش‌بینی | خطاها با نوع `ParseError` بازگردانده می‌شوند، نه `throw` غیرمنتظره در لایه‌ی UI |
| افزودن پلتفرم جدید | فقط شامل: ۱) پوشه‌ی Parser جدید ۲) ثبت در Registry مرکزی Detection ۳) پوشه‌ی Theme جدید — بدون تغییر در ماژول‌های موجود |
| Storage Access | فقط لایه‌ی `storage/` مجاز به تعامل مستقیم با Dexie است؛ Component‌ها و Parserها هرگز مستقیماً IndexedDB را صدا نمی‌زنند |

---

## 5. Error Handling Standards

| Rule | Detail |
|------|--------|
| **بدون افشای خطای خام** | Stack Trace، پیام Exception داخلی، یا جزئیات فنی هرگز مستقیماً به کاربر نمایش داده نمی‌شود |
| **پیام کاربرپسند اجباری** | هر خطای قابل‌مشاهده برای کاربر باید واضح، دوستانه و Actionable باشد (مثلاً «این فایل قابل خواندن نیست. لطفاً از خروجی رسمی پلتفرم استفاده کنید» به‌جای متن خام Exception) |
| **لایه‌ی ترجمه‌ی خطا** | هر خطای فنی (`ParseError`, `StorageError`, ...) قبل از رسیدن به UI باید توسط یک Mapper به پیام کاربرپسند تبدیل شود؛ Componentها هرگز مستقیماً `error.message` خام را رندر نمی‌کنند |
| **لاگ فنی فقط برای Debug** | جزئیات کامل خطا (Stack Trace، Payload خام در صورت لزوم) فقط در Console مرورگر لاگ می‌شود، نه در UI؛ چون بدون بک‌اند، هیچ سرویس Log خارجی وجود ندارد |
| **دسته‌بندی خطا** | خطاها به دسته‌های معنادار تقسیم می‌شوند (`FileReadError`, `UnsupportedFormatError`, `StorageQuotaError`, ...) تا پیام مناسب هر دسته از قبل تعریف شود |
| **Fail Gracefully** | خطا در Parse/Storage هرگز نباید کل اپلیکیشن را Crash کند؛ فقط عملیات مربوطه (مثلاً یک فایل خاص) با پیام مناسب متوقف می‌شود |

---

## 6. Testing Standards

### Testing Pyramid

```
        ╱╲
       ╱ E2E ╲          ← کم: مسیر کامل Import → Library → View
      ╱────────╲
     ╱Integration╲       ← متوسط: Storage Layer، جریان کامل Parser→Normalize
    ╱──────────────╲
   ╱   Unit Tests    ╲    ← زیاد: هر Parser، Detection، Utility‌ها
  ╱────────────────────╲
```

### Requirements

| Aspect | Standard |
|--------|----------|
| **Framework** | Vitest + React Testing Library |
| **Coverage Target** | حداقل 80% روی `parsers/`, `detection/`, `normalization/`؛ 100% روی مسیرهای Detect |
| **Naming Convention** | `[module].test.ts` یا `[Component].test.tsx` |
| **What to Unit Test** | هر Parser (با نمونه فایل JSON واقعی هر پلتفرم)، Detection Logic، Normalization، Search Logic، Error Mapper |
| **What to Integration Test** | جریان Import کامل (File → Worker → Detect → Parse → Save در Dexie)، عملیات Storage |
| **What to E2E Test** | باز کردن فایل → مشاهده در Sidebar → انتخاب مکالمه → مشاهده با Theme صحیح → جستجو |
| **Fixture Strategy** | نمونه فایل JSON واقعی (Anonymized) هر پلتفرم در `tests/fixtures/{provider}/` نگهداری شود |
| **Mocking Rules** | Dexie/IndexedDB در Unit Test Mock می‌شود؛ در Integration Test از `fake-indexeddb` استفاده می‌شود |
| **Test Structure** | الگوی Arrange → Act → Assert |

---

## 7. Documentation Standards

| Artifact | Location | Format | Required |
|----------|----------|--------|----------|
| **README** | `README.md` | معرفی پروژه، راه‌اندازی، معماری کلی، نحوه‌ی افزودن پلتفرم جدید | ✅ Yes |
| **Parser Contract Docs** | `docs/parsers.md` | توضیح قرارداد `detect`/`parse` و راهنمای افزودن Parser جدید | ✅ Yes |
| **Inline Comments** | داخل کد | `// چرا` نه `// چه چیزی` | ✅ Yes |
| **Architecture Decision Records** | `docs/adr/` | تاریخ، Context، تصمیم، گزینه‌های بررسی‌شده، پیامد | 🔄 Recommended |
| **Change Log** | `CHANGELOG.md` | نسخه‌بندی، تاریخ، خلاصه‌ی تغییرات | 🔄 Recommended |

---

## 8. Git Workflow

| Practice | Standard |
|----------|----------|
| **Branch Naming** | `feat/feature-name`, `fix/bug-name`, `refactor/what`, `docs/what` |
| **Commit Style** | Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `style:` |
| **PR Size** | حداکثر 400 خط تغییر در هر PR |
| **Code Review** | هر PR حداقل یک تأیید لازم دارد |
| **New Parser PRs** | افزودن هر Parser جدید در یک PR مجزا، همراه با Fixture و Test مربوطه |

---

## 9. File Organization

```
src/
├── parsers/
│   ├── chatgpt/
│   ├── claude/
│   ├── gemini/
│   └── deepseek/
├── detection/
├── normalization/
├── storage/
├── themes/
│   ├── chatgpt/
│   ├── claude/
│   ├── gemini/
│   └── deepseek/
├── components/
├── features/
├── types/
├── workers/
└── hooks/
tests/
└── fixtures/
docs/
├── parsers.md
└── adr/
```

| Folder | Contents |
|--------|----------|
| `parsers/` | منطق خام Parse و Detect برای هر پلتفرم؛ مستقل و بدون وابستگی متقاطع |
| `themes/` | استایل و Layout اختصاصی هر پلتفرم |
| `storage/` | تنها لایه‌ی مجاز به تعامل مستقیم با Dexie/IndexedDB |
| `types/` | منبع واحد تعریف مدل‌های داده |
| `workers/` | کد اجراشونده در Thread جداگانه |
