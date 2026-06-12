# CLAUDE.md — Vision & Virtue

## סקירת הפרויקט

**Vision & Virtue** היא חברת ייעוץ פיננסי-אסטרטגי ישראלית שמפתחת אתר אינטרנט וסוויטת כלים דיגיטליים תחת המותג `visionvirtuepartnership.com`.

המטרה המרכזית: **"Visibility for sustainable growth through practical financial & strategic solutions"** — להעניק לחברות שקיפות פיננסית מלאה ולעזור להן לצמוח בצורה בת-קיימא.

---

## מבנה הרפוזיטורי

```
Vision-Virtue/
├── index.html              # דף הבית הראשי
├── styles.css              # עיצוב גלובלי
├── script.js               # לוגיקה גלובלית
├── auth.js                 # אימות משתמשים
├── visibility-demo-v2.mp4  # סרטון דמו V2 (~95 שניות, 1920×1080, 8.7 MB) ← ACTIVE
├── visibility-demo.mp4     # סרטון דמו V1 (60 שניות) — גרסה ישנה
│
├── visibility.html/css/js  # מודול ה-Visibility (פורטל לקוחות)
├── agents.html/css/js      # סוכני ה-AI הפיננסיים
├── marketing.html/css/js   # פלטפורמת שיווק + LinkedIn
├── capitaflow.html/css/js     # פורטל CapitaFlow ומודלים פיננסיים
│
├── privacy.html            # מדיניות פרטיות (עודכן מאי 2026 — כולל Visibility Portal)
├── terms.html              # תנאי שימוש (עודכן מאי 2026 — כולל Visibility Portal)
│
├── marketing-backend/      # Backend ב-TypeScript/Node.js
│   ├── src/
│   │   ├── app.ts                      # ← rate limit /api/customer/auth נוסף
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── db/
│   │   │   └── capitaflow.repository.ts   # ← generateKey() עם crypto.randomBytes
│   │   ├── middleware/
│   │   ├── routes/
│   │   └── utils/
│   └── dist/                           # compiled JS (מסונכרן עם src)
│
├── remotion-videos/        # סרטוני פרסום (Remotion / React)
│   ├── src/
│   │   ├── VisibilityDemo.tsx          # קומפוזיציה V1 (60 שניות)
│   │   ├── VisibilityDemoV2.tsx        # קומפוזיציה V2 (~95 שניות) ← ACTIVE
│   │   ├── theme.ts                    # צבעים וקבועי עיצוב
│   │   ├── scenes/
│   │   │   ├── Scene0Intro.tsx
│   │   │   ├── Scene1FinancialStructure.tsx
│   │   │   ├── Scene2OrgStructure.tsx
│   │   │   ├── Scene3Budget.tsx / Scene3BudgetV2.tsx
│   │   │   ├── Scene3bBudgetDashboard.tsx
│   │   │   ├── Scene4CFStructure.tsx
│   │   │   ├── Scene5CFDashboard.tsx
│   │   │   ├── SceneCFO.tsx
│   │   │   ├── SceneOutro.tsx
│   │   │   └── SceneOutroV2.tsx
│   │   └── Root.tsx
│   ├── public/
│   │   └── audio/
│   │       ├── bg-music.mp3
│   │       ├── narration-00-intro.mp3
│   │       ├── narration-01-financial.mp3
│   │       ├── narration-02-org.mp3
│   │       ├── narration-03-budget-v2.mp3
│   │       ├── narration-03b-budget-dashboard.mp3
│   │       ├── narration-04-cf.mp3
│   │       ├── narration-05-dashboard.mp3
│   │       ├── narration-06-cfo.mp3
│   │       └── narration-07-outro-v2.mp3
│   ├── out/
│   │   ├── visibility-demo.mp4         # V1 פלט (5.1 MB)
│   │   └── visibility-demo-v2.mp4      # V2 פלט (8.7 MB) ← ACTIVE, רונדר 29-מאי-2026
│   └── generate-narration-elevenlabs.js
│
├── build_vc_ppt.py         # יצירת מצגות PowerPoint אוטומטית
├── vision-virtue-spec.txt  # מפרט מודול Budget
├── CF-spec                 # מפרט מודול Cash Flow
├── Financial Model v7.xlsx # תבנית מודל פיננסי
├── VisionVirtue_PPT_Template.pptx
│
├── dev.sh                  # הפעלת שרת frontend מקומי (port 8000)
├── backend-dev.sh          # הפעלת backend מקומי
├── deploy.sh               # פריסה לייצור (gh-pages)
├── render.yaml             # הגדרות Render.com
└── WORKFLOW.md             # תהליך הפיתוח
```

---

## ה-Stack הטכנולוגי

| שכבה | טכנולוגיה |
|------|-----------|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Backend | TypeScript / Node.js |
| Python | `build_vc_ppt.py` — יצירת PPT |
| Video | **Remotion 4.x** (React) — `remotion-videos/` |
| TTS / Narration | **ElevenLabs API** — Rachel voice (`21m00Tcm4TlvDq8ikWAM`), model `eleven_multilingual_v2` |
| Hosting | GitHub Pages (branch `gh-pages`) + Render.com |
| Version Control | Git — dev branch: `claude/vision-virtue-website-qY7BQ` |

---

## הצעות הערך המרכזיות (4 עמודות)

### 1. 🔍 Visibility — פורטל לקוחות
כלי SaaS לניהול תקציב ושקיפות פיננסית:
- **GL Upload**: העלאת חשבונות ספר חשבונות מה-ERP (xlsx/csv, עד 500 שורות)
- **מיפוי ל-P&L**: מיפוי GL לסעיפי רווח-הפסד ולקטגוריות תקציב
- **5 ממדים ארגוניים**: חברות, מחלקות, אגפים, מוצרים, פעילויות
- **מודול שכר**: הקצאת עובדים לממדים, אגרגציה אוטומטית לתקציב
- **Cash Flow**: תחזית תזרים מזומנים (חייבים, ספקים, מלאי, מימון, Capex)
- **Pivot + Excel Export**: טבלת P&L פיבוט, KPI Dashboard, ייצוא Excel
- גבול של 5 תקציבים פעילים פר לקוח; גישה באמצעות מפתח ייחודי
- **Demo Video**: סרטון דמו **V2 (~95 שניות)** (`visibility-demo-v2.mp4`) מופעל ישירות מכרטיס ה-Visibility בדף הבית דרך מודל וידאו (כפתור ▶ עם אנימציית pulse)
- **🟢 LAUNCHED**: מוצר ראשון שהושק — לקוחות מקבלים מפתח VV-XXXXXX ומתחברים דרך דף הבית

### 2. ⚡ Efficiency
אסטרטגיות לצמצום עלויות ב-COGS ו-OPEX.

### 3. 📈 Growth
אסטרטגיות להגדלת ההכנסות.

### 4. 🤝 CapitaFlow — Fundraising Fast & Simple
- מודל פיננסי מלא לסטארטאפים דרך שאלון ממוקד
- תשאול: סקטור, סבב גיוס, לקוחות, מוצרים, עלויות, כוח אדם
- הצוות של Vision & Virtue מאכלס את המודל ומעביר ללקוח
- Coming soon: מצגת Business Model

---

## מודול ה-AI Agents (Financial Department)

חמישה סוכני AI עם תפקידים פיננסיים מוגדרים:

| Agent | תפקיד | אחריות |
|-------|--------|---------|
| **Marcus Vale** | CFO | פיקוח פיננסי בכיר, אישור סופי |
| **Priya Nair** | Assistant Controller | איסוף נתונים, ולידציה ראשונית |
| **Nadia Stern** | Director of Finance | ניתוח, sizing שוק, בניית מודל |
| **Elliott Shaw** | Corporate Controller | בדיקת דיוק חשבונאי |
| **Ethan Caldwell** | VC/PE Expert | גיוס הון, M&A, הערכות שווי |

**תזרים עבודה**: איסוף נתונים → ניתוח → בניית מודל → סבבי סקירה → אישור סופי

---

## פלטפורמת שיווק ו-LinkedIn

כלי AI ליצירת תוכן LinkedIn ממוקד כלכלה:

- **Input**: נושא כלכלי + הקשר
- **Agents**: Dr. Ethan Ross (כלכלן), Sofia Chen (מנהלת שיווק), Daniel Berg (VP Marketing), Raphael (שותף/אישור סופי)
- **Output**: פוסטים מקצועיים ל-LinkedIn עם תהליך אישור מובנה
- **Backend**: Node.js/TypeScript ב-`marketing-backend/`

---

## תהליך הפיתוח (מ-WORKFLOW.md)

```bash
# 1. פיתוח מקומי (frontend בלבד)
./dev.sh            # מפעיל http://localhost:8000

# 2. פיתוח עם backend
./backend-dev.sh    # מפעיל שירותי backend

# 3. פריסה לייצור
./deploy.sh         # מעלה ל-gh-pages branch
```

**חוקים קריטיים**:
- ❌ לעולם לא לערוך ישירות ב-branch `gh-pages`
- ✅ תמיד לבדוק מקומית לפני deploy
- ✅ לשחזר URLs של ה-backend ב-`marketing.js` לפני deploy (URL מקומי vs. ייצור)

**Branch עבודה**: `claude/vision-virtue-website-qY7BQ`
**Branch ייצור**: `gh-pages`

### Deploy ללא Git (GitHub REST API)

אם `git` אינו מותקן במחשב, ניתן לפרוס ישירות דרך GitHub REST API עם Personal Access Token (scope: `repo`):

```powershell
# 1. Get gh-pages HEAD
$ref = Invoke-RestMethod -Uri "https://api.github.com/repos/Vision-Virtue/Vision-Virtue/git/refs/heads/gh-pages" -Headers $headers
$headSha = $ref.object.sha
$treeSha = (Invoke-RestMethod -Uri ".../git/commits/$headSha" -Headers $headers).tree.sha

# 2. Create blob per file (base64)
$body = @{ content = [Convert]::ToBase64String([IO.File]::ReadAllBytes($path)); encoding = "base64" } | ConvertTo-Json
$blobSha = (Invoke-RestMethod -Uri ".../git/blobs" -Method Post -Body $body -Headers $headers).sha

# 3. Create new tree → new commit → update ref
```

- Token creation: https://github.com/settings/tokens/new → scope `repo` → 7 days
- ⚠️ **לעולם לא לשמור את ה-token בקובץ או ב-git** — להשתמש בו רק בזמן ריצה

---

## מפרטים טכניים מרכזיים

### Budget Module (vision-virtue-spec.txt)
- גישה במפתח ייחודי
- אימות: כל הקצאות שכר חייבות לסכום ל-100% פר עובד
- שינוי granularity: חודשי ↔ רבעוני ↔ שנתי (פיצול/איחוד אוטומטי)
- Auto-save רציף; אין Version History
- עד 5 תקציבים פעילים פר לקוח

### Cash Flow Module (CF-spec)
- 6 סעיפים: Opening Balance, Working Capital, Salaries, Adjustments, Financing, Capex
- כל תקציב מאושר יוצר instance CF נפרד
- עיקרון סימן: עלויות = חיובי, הכנסות = שלילי
- 3 תצוגות: CF Structure, CF Forecast, CF Dashboard (6 KPI tiles)
- CF עורך רק לאחר מילוי כל תאים נדרשים

---

## הצוות

- **Raphael Haim, CPA** — Managing Partner

---

## קבצים חשובים לעבוד איתם

| קובץ | שימוש |
|------|-------|
| `index.html` + `styles.css` | דף הבית ועיצוב כללי |
| `visibility.html/js/css` | המוצר המרכזי — Visibility Portal |
| `agents.html/js/css` | מערכת סוכני ה-AI |
| `marketing.html/js/css` | כלי LinkedIn |
| `capitaflow.html/js/css` | פורטל CapitaFlow |
| `marketing-backend/src/` | Backend לשיווק (TypeScript) |
| `marketing-backend/src/app.ts` | Rate limiting, CORS, security headers |
| `marketing-backend/src/db/capitaflow.repository.ts` | Customer key generation + CRUD |
| `vision-virtue-spec.txt` | מפרט Budget Module |
| `CF-spec` | מפרט Cash Flow Module |
| `build_vc_ppt.py` | יצירת PPT אוטומטי |
| `visibility-demo-v2.mp4` | סרטון דמו Visibility V2 (~95 שניות) — **ACTIVE** בדף הבית |
| `remotion-videos/src/VisibilityDemoV2.tsx` | קומפוזיציית הסרטון הראשית V2 |
| `remotion-videos/generate-narration-elevenlabs.js` | יצירת קריינות ElevenLabs |
| `privacy.html` | מדיניות פרטיות — עודכן מאי 2026 לכלול Visibility Portal data |
| `terms.html` | תנאי שימוש — עודכן מאי 2026 לכלול Visibility Portal |

---

---

## סרטון דמו Visibility (Remotion)

### מיקום הפרויקט
`C:\Claude Projects\Vision & Virtue\remotion-videos\`

---

### V2 — הגרסה הפעילה (ACTIVE) ✅

#### מפרט
- **קומפוזיציה**: `VisibilityDemoV2` ב-`src/VisibilityDemoV2.tsx`
- **אורך**: ~95 שניות (2860 frames @ 30fps)
- **רזולוציה**: 1920×1080
- **פלט**: `out/visibility-demo-v2.mp4` (8.7 MB, רונדר 29-מאי-2026)
- **index.html**: `<source src="visibility-demo-v2.mp4">`

#### טיימליין סצנות V2

| סצנה | Start Frame | פריימים | זמן | תוכן |
|------|-------------|---------|-----|-------|
| Scene 0 — Intro | 0 | 280 | 9.3s | Intro title + tagline |
| Scene 1 — Financial Structure | 260 | 260 | 8.7s | GL upload + P&L mapping |
| Scene 2 — Org Structure | 500 | 250 | 8.3s | 5 dimensions |
| Scene 3 — Budget V2 | 730 | 530 | 17.7s | Budget setup + rows + pivot |
| Scene 3b — Budget Dashboard | 1240 | 190 | 6.3s | KPI tiles + margins |
| Scene 4 — CF Structure | 1410 | 360 | 12s | WC + payment terms |
| Scene 5 — CF Dashboard | 1750 | 265 | 8.8s | CF Forecast + Dashboard |
| SceneCFO | 1995 | 440 | 14.7s | AI CFO agent demo |
| SceneOutroV2 | 2415 | 445 | 14.8s | CTA + 8-step recap + URL |

#### אודיו V2
- **קריינות**: 9 קובצי MP3 (`narration-00-intro` עד `narration-07-outro-v2`)
- **מוזיקת רקע**: `bg-music.mp3`, עוצמה 0.18 עם fade in (30f) / fade out (30f)
- **FLAGS**: `AUDIO_ENABLED = true`, `MUSIC_ENABLED = true` ב-`VisibilityDemoV2.tsx`

#### Render — V2
```powershell
# ⚠️ subst workaround דרוש — נתיב עם רווחים. משתמשים ב-cmd /c לשרשור
# בדוק אות פנויה לפני (subst בלבד לרשימה)
subst Y: "C:\Claude Projects\Vision & Virtue\remotion-videos"
& cmd /c "Y: && cd Y:\ && node node_modules\@remotion\cli\remotion-cli.js render src/index.ts VisibilityDemoV2 out/visibility-demo-v2.mp4 --codec=h264"
subst Y: /D
```

---

### V1 — גרסה ישנה (ארכיון)
- **קומפוזיציה**: `VisibilityDemo` ב-`src/VisibilityDemo.tsx`
- **אורך**: 60 שניות (1800 frames)
- **פלט**: `out/visibility-demo.mp4` (5.1 MB)
- **סצנות**: Scene0–Scene5 + SceneOutro (7 סצנות, ללא SceneCFO ו-Scene3b)

---

### יצירת קריינות ElevenLabs
```powershell
# API key דרוש — לא לשמור בקובץ!
$env:ELEVEN_API_KEY = "sk_..."
node generate-narration-elevenlabs.js
```
- Voice: Rachel, ID: `21m00Tcm4TlvDq8ikWAM`
- Model: `eleven_multilingual_v2` (לא Flash/Turbo — איכות טובה יותר)
- Settings: stability=0.42, similarity_boost=0.78, style=0.28, use_speaker_boost=true

---

## Video Modal — כפתור ▶ בדף הבית

### מה נוסף לדף הבית
- **כפתור Play**: `#visibilityPlayBtn` — עיגול 54px עם frosted glass + אנימציית `vplay-pulse` על כרטיס ה-Visibility
- **מודל וידאו**: `#vdemoModal` — overlay שקוף עם `<video controls>` ב-aspect-ratio 16:9
- **Fullscreen**: דרך כפתורי הבקרה הטבעיים של הדפדפן (HTML5 native controls)
- **סגירה**: כפתור ✕, קליק על הרקע, מקש Escape

### CSS classes חשובות
- `.offering-play-btn` — כפתור ה-Play על כרטיס המוצר
- `.vdemo-overlay` / `.vdemo-inner` — overlay ומיכל המודל
- `.is-open` — class שנוסף ב-JS כדי להציג את המודל

---

## הערות לעבודה עם Claude

- **שפה**: הקוד באנגלית, תיעוד/הסברים בעברית או אנגלית לפי הצורך
- **Frontend**: Vanilla JS — אין framework (לא React/Vue/Angular)
- **עיצוב**: CSS מותאם אישית; שמור על עקביות בין הקבצים השונים
- **Backend**: TypeScript עם ארכיטקטורת controller/service/repository
- **Deploy**: תמיד דרך `deploy.sh`, לעולם לא עריכה ישירה ב-gh-pages
- **Auth**: משתמש ב-`auth.js` — יש לבדוק תאימות בעת הוספת עמודים חדשים

---

## Mobile Responsiveness — תיקונים (מאי 2026)

### styles.css
- `max-height: 300px` → `max-height: 520px` על `.mobile-menu.open` (10 קישורים × ~50px)
- הסרת `}` יתומה אחרי בלוק `#vdemoVideo`
- נוספה `@media (max-width: 480px)` עם `grid-template-columns: 1fr` ל-`.whatwedo-grid`
- Hamburger nav פועל ב-≤700px: `.nav-links { display: none }` + `.mobile-menu { display: flex }`

### marketing.css
- לא היו כלל `@media` queries — dashboard עם `overflow: hidden` — לא ניתן לשימוש במובייל
- נוסף בלוק `@media (max-width: 768px)` מקיף:
  - `html, body { overflow: auto }` — ביטול ה-overflow:hidden
  - Sidebar הופך ל-top bar אופקי: `flex-direction: row`, גובה `56px`
  - `.logo-text`, `.agent-roster`, `.roster-label`, `.sidebar-footer` — `display: none`
  - Nav items: `flex-direction: column; font-size: 10px`
- נוסף `@media (max-width: 480px)`: `nav-item span` מוסתר, icons בלבד

### visibility.css
- כבר היו breakpoints מתאימים: 1100px, 900px, 700px, 560px, 540px — לא נדרש שינוי

---

## אבטחה ו-Backend Security Architecture

### Authentication Flow
| נתיב | סוג | שמור ב |
|------|-----|--------|
| לקוח — מפתח VV-XXXXXX | `POST /api/customer/auth` | `sessionStorage('vv_customer_auth', '1')` + `sessionStorage('vv_customer_key', key)` |
| Admin/Raphael — PIN | `POST /api/auth/verify-pin` | `sessionStorage('vv_auth', '1')` + `sessionStorage('vv_admin_pin', pin)` |

### Rate Limiting (app.ts / app.js)
| Endpoint | Limit |
|----------|-------|
| כל הנתיבים | 100 req / 15 min / IP |
| `/api/auth/*` | 20 req / 15 min / IP |
| `/api/customer/auth` | 20 req / 15 min / IP ← נוסף מאי 2026 |
| `/api/chat/*` | 20 req / 60 sec / IP |

### Key Generation (capitaflow.repository.ts)
- פורמט: `VV-XXXXXX` (6 תווים מ-alphabet של 32: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`)
- ~1 מיליארד קומבינציות אפשריות
- **מאי 2026**: הוחלף `Math.random()` ב-`crypto.randomBytes()` (rejection-sampling, ללא bias)

### Admin Key Management
```powershell
# יצירת מפתח לקוח חדש (דרש X-Admin-Pin header)
POST /api/admin/customer-keys
Body: { "customerName": "שם הלקוח" }
→ Returns: { id, key: "VV-XXXXXX", customerName, createdAt }

# רשימת כל המפתחות
GET /api/admin/customer-keys

# שלח את המפתח ללקוח — הוא מזינו בדף הבית
```

### מפתח בדיקה (seeded)
- `VV-TEST123` / `Test Customer` — נוסף אוטומטית בכל הפעלה ראשונה (INSERT OR IGNORE)

### Data Isolation
- כל טבלאות ה-Visibility כוללות `customer_key_id TEXT NOT NULL` עם `FOREIGN KEY ... ON DELETE CASCADE`
- `resolveCustomerKey()` בכל endpoint מבצע lookup ומחזיר 401 אם לא קיים/מבוטל

---

## Privacy Policy & Terms — עדכון Visibility Launch (מאי 2026)

### privacy.html — שינויים
1. **Section 2 — Data We Collect**: נוסף bullet "Visibility Portal data (server-stored)" המפרט בדיוק מה נשמר:
   GL accounts, org structure, budgets, salaries, revenues/COGS, CF config — נשמר בSQLite על Render.com
2. **Section 2 — Session data**: תוקן מ-"cookie" ל-`sessionStorage` (לא cookie)
3. **Section 3 — How We Use Your Data**: נוסף bullet על Visibility Portal data
4. **Section 5 — Data Retention**: נוסף bullet — נתוני Visibility Portal נמחקים לחלוטין עם ביטול המפתח (cascade)
5. **Last updated**: April 2026 → May 2026

### terms.html — שינויים
1. **Section 2 — Services Description**: נוסף bullet "Visibility Portal" — SaaS לניתוח פיננסי, גישה במפתח, data stored server-side
2. **Section 5 — User Responsibilities**: נוספו שני bullets על סודיות מפתח הלקוח ואחריות הלקוח לכל פעילות תחת מפתחו
3. **Last updated**: April 2026 → May 2026

---

## Visibility Product — Launch Checklist ✅ (מאי 2026)

| בדיקה | סטטוס |
|-------|-------|
| לקוח מזין מפתח → מועבר ל-Visibility Portal | ✅ |
| Session מנוקה ב-401 → redirect לדף הבית | ✅ |
| כל הנתונים מבודדים per customer_key_id | ✅ |
| HTTPS / TLS על Render.com | ✅ |
| Security headers (Helmet: CSP, HSTS, X-Frame-Options) | ✅ |
| Rate limiting על כל auth endpoints | ✅ |
| Crypto-secure key generation | ✅ |
| Privacy policy מכסה Visibility data | ✅ |
| Terms of Service מכסים Visibility Portal | ✅ |
| Admin יכול ליצור מפתחות דרך API | ✅ |
| מפתח בדיקה VV-TEST123 | ✅ |

### Render Deploy — בוצע ✅ (29-מאי-2026)
- Deploy הופעל דרך Deploy Hook: `https://api.render.com/deploy/srv-d7bnfi1r0fns739ca5r0?key=...`
- Deploy ID: `dep-d8ciaemk1jcs738ugcm0`
- אומת דרך `/api/health` — `status: ok`, `version: 1.0.0`, זמן תגובה: 05:38 UTC
- מפתח הבדיקה `VV-TEST123` נבדק ואומת: `{ valid: true, customerKeyId: "seed-test-key-001" }` ✅

### ⚠️ Anthropic API Key — נחשף בשיחה
המפתח `sk-ant-api03-2t6k...` נחשף בשיחה ב-29-מאי-2026.
**יש לבטל אותו ב-[console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) וליצור חדש.**
לאחר יצירת מפתח חדש — לעדכן ב-Render: `Dashboard → vv-marketing-api → Environment → ANTHROPIC_API_KEY`

---

## יצירת מפתח ללקוח חדש

```powershell
$pin  = "YOUR_ADMIN_PIN"   # ה-ACCESS_CODE שהוגדר ב-Render Environment
$name = "שם הלקוח"

$body = "{`"customerName`":`"$name`"}"
$response = Invoke-RestMethod `
  -Uri "https://vv-marketing-api.onrender.com/api/admin/customer-keys" `
  -Method Post `
  -Headers @{ "X-Admin-Pin" = $pin; "Content-Type" = "application/json" } `
  -Body $body

Write-Host "המפתח: $($response.key)"
# → VV-XXXXXX
```

לאחר מכן שלח ללקוח:
- כתובת: **visionvirtuepartnership.com**
- מפתח: **VV-XXXXXX**
- הוראה: לחץ על Visibility → הכנס את המפתח

### רשימת מפתחות קיימים
```powershell
Invoke-RestMethod `
  -Uri "https://vv-marketing-api.onrender.com/api/admin/customer-keys" `
  -Headers @{ "X-Admin-Pin" = $pin }
```

### Deploy Hook (לשימוש עתידי)
```
https://api.render.com/deploy/srv-d7bnfi1r0fns739ca5r0?key=CKpYDDt8cX4
```
קריאת POST פשוטה תפעיל deploy חדש — ראה דוגמה למעלה.

---

## Video Editor GUI — סטטוס פיתוח (31-מאי-2026, עודכן יוני 2026)

### מיקום הפרויקט
`C:\Claude Projects\Vision & Virtue\Vision-Virtue-claude-vision-virtue-website-qY7BQ\video-editor-gui\`

### מבנה הקבצים
```
video-editor-gui/
├── app.py              # Flask backend — port 5555
├── static/
│   ├── index.html      # UI structure  (cache-bust: v=24)
│   ├── editor.js       # כל הלוגיקה (strict mode)  (cache-bust: v=24)
│   └── style.css       # עיצוב + CSS custom properties  (cache-bust: v=24)
├── Intro & Outro/      # ← V&V branding assets
│   ├── vv_brand_frame.png      # default branded intro/outro image (941×1672 portrait)
│   └── vv_visibility_audio.m4a # default intro/outro audio (extracted from visibility-demo-v2.mp4)
├── backgrounds/        # ← uploaded background images for background replacement feature
├── models/             # ← auto-downloaded ML models (selfie_segmenter.tflite)
├── test_preview.py     # standalone script — מייצר PNG מ-_make_branded_image לבדיקה
├── uploads/            # uploaded main videos (multi-clip support)
├── broll/              # downloaded Pexels clips + user uploads (user_*.mp4)
├── exports/            # exported videos + vv_intro.mp4 / vv_outro.mp4
├── compose_error.log   # ← saved full FFmpeg stderr + filter_complex on compose failure
└── thumbs/             # thumbnails
```

### הפעלת השרת
```powershell
$PY  = "C:\Users\RaphaelHaim\AppData\Local\Programs\Python\Python312\python.exe"
$APP = "C:\Claude Projects\Vision & Virtue\Vision-Virtue-claude-vision-virtue-website-qY7BQ\video-editor-gui\app.py"  # ← moved into website repo 1-יוני-2026
Start-Process -FilePath $PY -ArgumentList "`"$APP`""
# → http://127.0.0.1:5555
```
אחרי restart יש לרענן דפדפן ולמחוק vv_intro.mp4 / vv_outro.mp4 ישנים כדי שיופעל מחדש.

### תלויות Python
| חבילה | גרסה | שימוש |
|-------|------|-------|
| Flask | כלשהי | web server |
| Pillow | **12.2.0** ✅ | branded frame generation — **חובה!** בלי זה הfallback הוא עיצוב ישן |
| openai-whisper | כלשהי | transcription עם word timestamps |
| requests | כלשהי | Pexels API |
| **mediapipe** | **0.10.35** ✅ | selfie segmentation לfeature Background Replacement |
| **opencv-python** | **4.13.0** ✅ | video frame I/O + mask blending לBackground Replacement |

- **FFmpeg**: `C:\Users\RaphaelHaim\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin\ffmpeg.exe`
- **Pexels API Key** (pre-configured): `HfJdYTEiWBp5FX6k20dtcgRG540EFPWFVyDlakiH8nROAPK7UIkrmKvU`
- **`_HAS_PIL`** — flag נקבע בזמן import; אם `False` הקוד fallthrough לעיצוב FFmpeg ישן → **חובה להתקין Pillow ולהפעיל מחדש**
- **`_HAS_MP` / `_HAS_CV2`** — flags לmediapipe + opencv; אם `False` — `/api/background/check` מחזיר install command; background replacement לא יעבוד בexport

---

### פיצ'רים מיושמים ✅
| פיצ'ר | פרטים |
|-------|-------|
| Upload + Preview | split-screen: main למעלה, B-roll למטה |
| **Multi-clip Main track** | מספר וידאו על Main bar; `+ Add Clip` בtopbar; כל clip עם resize handles + drag-to-close-gap + ✕ remove |
| **Two-click Cut mode** | כפתור `✂ Cut` נכנס למצב — click 1st point, click 2nd point → המקטע באמצע הופך לclip חופשי (draggable/deletable). Esc cancels |
| **Continuous playback** | playback זורם דרך כל ה-main clips ברצף, מדלג על gaps; intro→clips→outro |
| Whisper transcription | **per-clip — מתמלל כל clip בנפרד ומשרשר timestamps לפי `timeline_start`**. language='he', karaoke word-level |
| Pexels B-roll search | 11 category pills (Finance, Business, Corporate, Companies, Logos, Real Estate, Technology, Economy, People, Marketing, Lifestyle) + text search |
| **B-roll custom upload** | `⬆ Upload my video / image` בסיידבר — video transcoded ל-mp4, image הופך לclip של 5 שניות (1920×1080 letterbox) |
| Multi-track B-roll timeline | drag & drop, resize handles, drag-to-close-gap |
| Text overlays | live preview במודל, 9 אנימציות CapCut-style |
| **V&V Intro/Outro tab** (🎬) | Length sliders (1-15s), fade-in/out sliders (0-3s), custom image/video upload, **custom audio + volume slider**, default audio: Visibility demo |
| Intro/Outro brand image | החליף ל-`vv_brand_frame.png` (הוzeto הסופי של דף הבית) — תחליף ל-Pillow generator |
| Intro/Outro full-screen preview | CSS `.io-expand` מרחיב panelUpper לכל גובה previewScreen |
| **Timeline zoom + scroll** | `+ / − / ⤢ / ◀ / ▶` בfooter; Ctrl+wheel zoom; synced scroll across rows; stable `tlPps` (pixels-per-second) — drag smooth, no jumps |
| **Fullscreen preview** | `⛶` button בplaybar, `F` keyboard shortcut |
| Export | vertical 9:16 / horizontal 16:9 + Prepend Intro / Append Outro + B-roll composite |
| **Fixed 10-min timeline canvas** | `timelineLength=600s` default; ruler תמיד spans הcanvas (לא רק ה-video); tlPps=4 → 30s intervals ב-800px track; scrollable |
| **⏱ Timeframe tab** | בright panel — preset: 2/5/10/30/60 min + Custom; `setTimelineLength(secs)` — never shorter than videoDur |
| **Karaoke cleared during intro/outro** | `subText.innerHTML=''` ב-`switchClipAndPlay` + ב-early-return של `onTimeUpdate` כשplayState≠'main' |
| **🖼 Background Replacement tab** | upload background image → MediaPipe selfie segmentation at export time → person stays, background replaced; edge softness slider; `/api/background/check` מוודא שmediapipe+opencv מותקנים |

---

### ארכיטקטורת Intro/Outro Preview — CSS `.io-expand`

**הבעיה**: הצגת intro/outro על שני פאנלים (upper + lower) — ניסיון לסנכרן brollVideo גרם להצגה כפולה.

**הפתרון**: class `.io-expand` על `#panelUpper` בלבד:
```css
/* style.css */
#panelUpper.io-expand {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  z-index: 9 !important;
}
#panelUpper.io-expand #mainVideo,
#panelUpper.io-expand .panel-bg-video {
  object-fit: cover !important;
}
```

**חשוב**: `#panelUpper.io-expand` (ID + class = specificity עדיפה) מנצח על הblock inline `<style>` שמגדיר `#panelUpper { position: relative !important }`.

**`switchClipAndPlay(type, at)`** — פונקציה מרכזית:
```javascript
function switchClipAndPlay(type, at) {
  at = at || 0;
  playState = type;
  const src = type === 'intro' ? introPath
            : type === 'outro' ? outroPath
            : `/uploads/${videoName}`;
  mainVideo.src = src;
  if (bg) { bg.src = src; bg.load(); }
  mainVideo.load();
  if (type !== 'main') {
    panelUpper.classList.add('io-expand');
    brollVideo.pause();
  } else {
    panelUpper.classList.remove('io-expand');
    // reset broll
  }
  mainVideo.addEventListener('loadedmetadata', function onLM() {
    mainVideo.removeEventListener('loadedmetadata', onLM);
    mainVideo.currentTime = at;
    mainVideo.play().catch(() => {});
  }, { once: true });
}
```

**`onVideoEnded()`** — state machine:
- `playState === 'intro'` → `switchClipAndPlay('main', 0)`
- `playState === 'main'` + outroEnabled → `switchClipAndPlay('outro', 0)`
- otherwise → reset, `panelUpper.classList.remove('io-expand')`

**State constants**:
```javascript
let introEnabled = false;  let outroEnabled = false;
let introPath    = null;   let outroPath    = null;
let playState    = 'main'; // 'intro' | 'main' | 'outro'
const IO_DUR     = 5;      // seconds — must match app.py dur = 5.0
```

---

### Intro/Outro Visual Design — V&V Hero Layout

עיצוב זהה לגיבור האתר (`visionvirtuepartnership.com`):
- **רקע**: גרדיאנט כהה navy אופקי `(10,21,51)` → `(26,47,94)`
- **שמאל**: טקסט left-aligned
  - `'FINANCIAL STRATEGY PARTNERS'` — teal `(64,196,196)`, ~40px
  - שני שורות גדולות bold ≈90px לבן: `'From Vision' / 'To Virtue'` (intro) או `'Thank' / 'You'` (outro)
  - Tagline/URL מעוטף מילים, ≈35px, `(200,215,235)`
- **ימין**: עיגול porthole עם sea/sky gradient, border ring כהה
  - `circ_cx = int(w * 0.785)` — חורג מעט מהשוליים הימניים (כמו באתר)
  - radius ≈ 286px
- **watermark**: 'V' בגופן 290px, opacity=20/255, bottom-right

**ה-frame הוא 1080×1920 portrait** אך כל התוכן ממוקם בבנד הגלוי המרכזי:
```
cy0   = (1920 - 1080) // 2  = 420   ← שורה עליונה
cy0+w = 420 + 1080          = 1500  ← שורה תחתונה
```
כשהווידאו מוצג עם `object-fit: cover` בpreview מרובע, הבנד הזה ממלא את כל המסך.

**3 נתיבי יצירה** ב-`make_intro_outro`:
1. **Path 1 (PIL)** — `_make_branded_image()` → שומר PNG → FFmpeg loop+fade ✅ פעיל
2. **Path 2 (FFmpeg drawtext)** — עיצוב ישן עם "Vision & Virtue" ב-drawtext — fallback אם PIL נכשל
3. **Path 3 (color screen)** — plain colored screen — always works

**לפני כל regeneration** — הקוד מוחק אוטומטית:
```python
for old in [out, thumb, str(THUMBS / f'vv_{kind}_frame.png')]:
    try: Path(old).unlink()
    except: pass
```

**בדיקת PNG**:
```powershell
# מריץ test_preview.py ומייצר PNG לדסקטופ לאימות עיצוב ללא server restart
$PY = "C:\Users\RaphaelHaim\AppData\Local\Programs\Python\Python312\python.exe"
& $PY "C:\Claude Projects\Vision & Virtue\Vision-Virtue-claude-vision-virtue-website-qY7BQ\video-editor-gui\test_preview.py"
# → C:\Users\RaphaelHaim\Desktop\intro_preview_crop.png  (1080×1080 square crop)
# → C:\Users\RaphaelHaim\Desktop\intro_preview_full.png  (1080×1920 full portrait)
```

---

### CSS Custom Properties (style.css v=12)
```css
--preview-w: 560px;
--panel-h:   280px;   /* גובה כל פאנל */
```
- `.panel-upper`: `position: absolute; top: 0; height: var(--panel-h)`
- `.panel-lower`: `position: absolute; top: var(--panel-h); height: var(--panel-h)`
- `.panel-lower video`: `object-fit: contain` — frame שלם, ללא חיתוך
- `#previewScreen`: `position: relative` — עוגן ל-`.io-expand` ול-`sub-overlay` + `tov-layer`

### ✕ כפתורי הסרה
```css
/* Bookend ✕ */
.be-remove { position: absolute; top: 3px; right: 3px; width: 13px; height: 13px;
             font-size: 8px; background: rgba(0,0,0,.5); border-radius: 50%; }
.be-remove:hover { background: rgba(220,50,50,.85); }

/* Topbar ✕ video */
.btn-clear-video { background: none; border: none; color: var(--accent2);
                   font-size: 11px; font-weight: 700; opacity: 0.65; }
```

`renderMainBookends()` — מרנדר chips של INTRO/OUTRO לפני/אחרי main track עם ✕ להסרה.
`clearVideo()` — מאפס videoName, videoDur, playState, broll tracks, thumbnails, timeline.

---

### באגים שתוקנו (מאי 2026)
| באג | תיקון |
|-----|-------|
| `arguments.callee` ב-strict mode קרס transcript editing | הוחלף ב-`openSegmentEdit()` named function |
| Text overlay drag — bounds שגויים | `previewScreen` → `panelUpper.getBoundingClientRect()` |
| `<a>` overlays לא ניתנים לגרירה | הוסר check `el.tagName === 'A'` מ-`wireOverlayDrag` |
| צבעי text overlay לא מתעדכנים | נוסף `#tePreviewInner` live preview box במודל |
| Duplicate `updatePlayhead()` | הוסרה הגרסה הכפולה |
| Panel size לא 50:50 | שניהם `position: absolute` עם pixel placement מדויק |
| B-roll clips נחתכים | `object-fit: contain` + `position: absolute; inset: 0` |
| Intro/Outro לא ניתנים לגרירה לטיימליין | נוסף drag-and-drop ל-`renderIOTrack()` |
| Intro/Outro מוצג פעמיים (שני פאנלים) | הוסר brollVideo sync; `.io-expand` CSS approach |
| Intro/Outro עיצוב ישן (purple FFmpeg text) | Pillow לא הותקן → הותקן Pillow 12.2.0 + server restart |
| `_HAS_PIL = False` גם אחרי pip install | Server process עדיין ישן → פתרון: restart server |
| `img.paste()` חורג מגבולות image | bounds-clipping לוגיקה ב-`_make_branded_image` |
| Edit tool mismatch לאחר עריכות | קריאת קובץ מחדש לפני כל Edit |

---

### ⏳ ממתין לאימות — Intro/Outro Visual
הפיצ'ר מיושם ועובד טכנית, אך **המשתמש טרם אישר** שהעיצוב הסופי מרוצה אותו.
- `test_preview.py` מייצר PNG לאימות עיצוב ללא server restart
- אם יש להמשיך לשפר: לשאול Raphael מה בדיוק לא טוב ולהראות PNG לפני regeneration

---

## Video Editor — ארכיטקטורת Multi-Clip + Timeline (31-מאי-2026)

### State model — Main track
```python
# Backend (app.py)
state['main_clips'] = [
  {
    'id':             'mc_<8hex>',     # unique clip id
    'path':           '/uploads/foo.mp4',
    'abs_path':       'C:\\…\\uploads\\foo.mp4',
    'name':           'foo.mp4',
    'thumb':          '/thumbs/foo.jpg',
    'src_dur':        12.5,             # source media duration in seconds
    'in':             0.0,              # trim-in (seconds inside source)
    'out':            12.5,             # trim-out (seconds inside source)
    'timeline_start': 0.0,              # position on the Main timeline (seconds)
  },
  …  # any number of clips, each at its own timeline_start
]
state['duration'] = max(c['timeline_start'] + (c['out']-c['in']) for c in main_clips)
```

`videoDur` (frontend) and `state['duration']` (backend) = total Main timeline length, recomputed on every change.

### State model — Intro/Outro config
```python
state['intro_cfg'] = {
  'duration': 5.0, 'fade_in': 0.6, 'fade_out': 0.6,
  'custom_media': None,            # absolute path to uploaded image/video
  'use_default_brand': True,        # if True and no custom_media → use vv_brand_frame.png
  'audio_path': None,              # absolute path to uploaded audio
  'use_default_audio': True,        # if True and no audio_path → use vv_visibility_audio.m4a
  'audio_volume': 0.8,
}
# outro_cfg has the same shape
```

### Timeline rendering — pixels-per-second
```js
let tlPps        = 4;      // px/s — at 800px track width → ~3.3 min visible, 30s tick intervals
let tlZoom       = 1.0;
let tlFitMode    = false;  // true → refit to effectiveTimelineDur() on resize
let timelineLength = 600;  // canvas length in seconds (default 10 min); ruler always spans this
```
- `effectiveTimelineDur()` = `max(timelineLength, videoDur)` — canvas is never shorter than the actual content
- Each `.tl-track` (and `.tl-ruler`) uses a `.tl-spacer` of `effectiveTimelineDur() * tlPps` px — drives horizontal scroll
- Clips position absolutely with `left = timeline_start * tlPps + 'px'` (stable during drag — no jumps)
- Ruler ticks span `effectiveTimelineDur()` — always show 0:00…10:00 by default
- Scroll syncs across all rows + ruler via shared `scroll` event listener
- **Intro chip**: `left = 0` (before content). **Outro chip**: `left = videoDur * tlPps` (right after last clip) — NOT after canvas end
- On upload: resets `scrollLeft = 0` only; does NOT change tlPps (keeps current scale)
- ⤢ button: `tlFitMode = true; recomputeFitPps()` → fits full canvas into view
- **Timeframe tab** (⏱): `setTimelineLength(secs)` → updates `timelineLength`, rerenders timeline

### Continuous playback
- `seekTimeline(t, autoPlay)` — handles clip switching + gap skipping + autoplay-after-load
- `onTimeUpdate` — when `mainVideo.currentTime >= activeClip.out - 0.05`, advance to `nextClipAfter(clipEnd)` with `autoPlay=wasPlaying`
- `onVideoEnded` — when source media ends, try next clip first, then outro, then pause

### Backend endpoints — סקירה מלאה
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/upload` | Form: `video=<file>`, `append=0\|1`. append=0 resets state; append=1 adds to main_clips at end of timeline. Returns `{main_clips, duration, clip}` |
| POST | `/api/main-clips` | Replace full main_clips list. Body: `{clips: [...]}` |
| DELETE | `/api/main-clips/<id>` | Remove one main clip |
| POST | `/api/main-clips/cut` | Single-point split. Body: `{timeline_t}` → splits into 2 |
| POST | `/api/main-clips/cut-section` | **Two-point cut-out.** Body: `{t1, t2}` → splits into 3 (left, middle, right); middle clip is the "free" section, returned id in `middle_clip_id` |
| POST | `/api/intro-outro` | Body: `{type, duration?, fade_in?, fade_out?, use_default_brand?, use_default_audio?, audio_volume?}` → generates mp4 |
| POST | `/api/intro-outro/config` | Persist intro/outro config without regenerating |
| POST | `/api/intro-outro/upload` | Form: `type=intro\|outro`, `media=<file>` → custom image/video |
| POST | `/api/intro-outro/upload-audio` | Form: `type=intro\|outro`, `audio=<file>` → custom audio |
| POST | `/api/broll/upload` | Form: `media=<file>` → video transcoded to mp4; image → 5-sec letterboxed clip |
| GET  | `/api/background/check` | Returns `{ok, engine}` if mediapipe+cv2 installed, else `{ok:false, install:'pip install …'}` |
| POST | `/api/background/upload` | Form: `image=<file>` → saves to `backgrounds/`, returns `{bg_path}` |
| POST | `/api/background/config` | Body: `{enabled, bg_path, softness}` → persists to `state['background_cfg']` |

### Two-click Cut mode UX (frontend)
1. Click `✂ Cut` button → enters `cutMode='awaiting-first'`, button pulses yellow, cursor → crosshair, status guides user
2. Click on Main bar → drops yellow `.cut-marker` at that point, mode → `'awaiting-second'`
3. Click second point on **same clip** → POST to `/api/main-clips/cut-section`, middle clip flashes yellow briefly
4. Esc cancels mode at any time

### Multi-clip transcription (`_transcribe_worker`)
- Iterates `main_clips`; for each clip:
  - Extracts audio via `ffmpeg -ss <clip.in> -t <duration>`
  - Whisper transcribes with `word_timestamps=True`
  - Adds `clip.timeline_start` to every segment + word timestamp
- Sorts combined `segments` + `word_timings` by start time
- Sets `state['srt_path']` to combined SRT
- Preserves user-added B-roll clips (only seeds placeholders if `broll_tracks` is empty)

### Audio for Intro/Outro
- Default: `Intro & Outro/vv_visibility_audio.m4a` — extracted from `remotion-videos/out/visibility-demo-v2.mp4`:
  ```powershell
  & ffmpeg -y -i visibility-demo-v2.mp4 -vn -c:a aac -b:a 192k vv_visibility_audio.m4a
  ```
- Audio is muxed into intro/outro via FFmpeg `filter_complex` with `volume + afade in/out` matching the video fades
- Single helper `_render_with_audio()` handles all 4 generator paths (custom video, custom image, default PNG, Pillow fallback)

---

## Video Editor — תיקוני באגים (מאי 2026)
| באג | תיקון |
|-----|-------|
| Cut button "לא ניתן ללחיצה" | החלף ל-two-click mode עם cursor crosshair, button pulse yellow, status feedback |
| Main clip trim "קופץ חזרה" אחרי drag | החלף ל-`tlPps` stable px-per-second; drag לא מחשב מחדש את videoDur |
| B-roll clip ✕ + edge handles נעלמים על last clip | הזזת `✕` לתוך ה-clip body (`top: 2px; right: 2px` במקום `-8px`) |
| Outro icon מסתיר את ה-edge של main clip | הוסר `renderMainBookends()`; הוזז ל-dedicated I/O row על הLabel; outro chip עם `left: innerW - outroW px` במקום `right: 0%` |
| Timeline ruler לא מתעדכן כשמוסיפים clip | על כל upload — `tlFitMode = true; recomputeFitPps()` — auto-fit לכל ה-duration |
| Playback לא ממשיך לclip הבא | `seekTimeline(t, autoPlay)` parameter; ב-`onTimeUpdate` קוראים עם `wasPlaying` flag |
| Transcribe רק על clip ראשון | `_transcribe_worker` כעת iterate על כל `main_clips` ומשרשר timestamps לפי `timeline_start` |
| handles resize צרים מדי | הורחבו מ-7px ל-10px עם hover state חזק יותר |
| Timeline לא תואם לbars — ruler spans רק videoDur | שינוי ל-`timelineLength=600s` fixed canvas; ruler spans `effectiveTimelineDur()` תמיד |
| Karaoke מוצג בזמן intro | `subText.innerHTML=''` ב-`switchClipAndPlay` כשtype≠'main' + ב-early-return של `onTimeUpdate` |
| Outro chip מופיע בסוף הcanvas הריק (דקה 10) | `el.style.left = videoDur * tlPps + 'px'` — עוגן לסוף ה-content בפועל |

---

## Video Editor — נקודות לזכור בעת המשך פיתוח

- **State הוא ב-RAM של תהליך Flask** — restart הורס הכל; אין persistence
- **תהליך Python יציב** — אפשר להוסיף פיצ'רים חדשים בלי לחשוש לאבד transcription/intro/outro שכבר נוצרו (עד restart)
- **Cache-bust v=20** — אחרי עריכת editor.js / style.css / index.html חובה לרענן דפדפן (Ctrl+Shift+R) ולבמפ ל-v=21
- **Timeline coordinate system יחיד** — `timeline_start` הוא תמיד timeline-seconds; `in/out` הם source-media-seconds. Confusion ביניהם = bug
- **timelineLength vs videoDur** — `timelineLength` = canvas (default 600s); `videoDur` = actual content end; `effectiveTimelineDur()=max(both)` — ruler + spacers תמיד משתמשים ב-effective
- **Outro chip position** — `left = videoDur * tlPps` (עוגן לסוף content), לא `innerW - outroW` (שהיה עוגן לסוף canvas)
- **mainVideo.src נחלף דינמית** בעת clip transitions — תמיד לחכות ל-`loadedmetadata` לפני `currentTime = x`
- **Background replacement** — `_apply_background()` ב-app.py: MediaPipe selfie segmentation frame-by-frame → FFmpeg pipe → mux audio back. דורש `mediapipe` + `opencv-python` מותקנים
- **B-roll vs Main clip עם אותה ארכיטקטורה** — חלקים גדולים של ה-render code בנויים סביב patterns דומים אבל לא ממש שיתפו קוד. עתידית — אפשר לאחד ב-`makeTimelineClipEl(kind, clip, ...)` helper

---

### Background Replacement — ארכיטקטורה

```python
state['background_cfg'] = {
  'enabled':  False,
  'bg_path':  None,    # URL path e.g. /backgrounds/office.jpg
  'softness': 0.3,     # 0=sharp edge, 1=very soft (Gaussian blur kernel up to 41px)
}
```

**Export pipeline** (כשenabled=True ו-bg_path מוגדר):
```
_assemble_main_clips() → main_assembled.mp4
        ↓  (if background enabled)
_apply_background(main_assembled, bg_abs_path, bg_out.mp4)
        ↓
_assemble_broll() + _compose() + concat intro/outro
```

**`_apply_background()` flow**:
1. פותח video_in עם cv2
2. מעלה background image, resize לframe size
3. Pipes raw BGR frames ל-FFmpeg subprocess → `_noaudio.mp4`
4. לכל frame: MediaPipe `SelfieSegmentation(model_selection=1)` → mask → GaussianBlur(ksize) → composite
5. Muxes original audio back via FFmpeg `-map 1:a?`

**בדיקה**: `GET /api/background/check` → `{ok: true, engine: "mediapipe + opencv"}` אם מותקן

---

## Video Editor — Session Fixes (1-יוני-2026) ✅

קבוצת תיקונים מקיפה למספר באגים בPipeline ייצוא + UX של multi-clip timeline + background replacement.

### Frontend bugs (editor.js / style.css / index.html)

**Cache-bust**: bumped from `v=20` → `v=24`. כל edit עתידי ב-static/* חייב bump.

| באג | תיקון | קוד |
|-----|-------|-----|
| **Outro chip stuck at stale position** אחרי resize/drag של main clip | `renderIOTrack()` נקרא כעת ב-`mousemove` וב-`mouseup` של שלושה handlers ב-`makeMainClipEl` (left-resize, right-resize, drag) | `editor.js` ~1209-1296 |
| **Outro chip לא הופיע מיד על drop** | Drop handlers (Main track + I/O track) קוראים ל-`renderIOTrack()` מיד, לא רק אחרי `generateIntroOutro()` finishes | `editor.js` ~289-303 + ~1537-1543 |
| **`videoDur` נדרס לערך SOURCE media duration** כשclip חדש loads | `mainVideo.loadedmetadata` handler כעת מבצע `videoDur = mainVideo.duration` רק אם `!mainClips.length` (legacy single-clip fallback). אחרת — `videoDur` מנוהל ע"י `recomputeDurationLocal()` + backend `data.duration` בלבד | `editor.js` ~216-228 |
| **B-Roll rows לא נראים** אחרי "+ Add B-Roll Track" — timeline-area 195px קבוע, רואים רק 2 rows | `style.css`: `height` → `min-height` + `flex-shrink: 0`. `editor.js`: `updateTimelineHeight()` חישוב דינמי `28 + rows*38 + 38`, capped ל-55% של viewport. נקרא ב-`renderTimeline`/`addBrollTrack`/`saveBrollTracks`. אחרי הוספה — auto-scroll ל-bottom | `style.css` ~628-633 + `editor.js` ~1126-1146 |
| **B-Roll drop נופל למיקום שגוי בtimeline** — `.tl-broll-track` יש `overflow:visible` ↔ `scrollLeft` תמיד 0 אבל `mainTrack` כן scrolls | `handleTrackDrop` משתמש עכשיו ב-`mainTrack` כcanonical time reference: `xTime = (clientX - mainTrack.rect.left) + mainTrack.scrollLeft` | `editor.js` ~1683-1700 |
| **לא ברור לאן clip ירד במהלך drag** | `showDropMarker()` — קו צהוב vertical (3px, glow) על ה-B-Roll track שעוקב אחרי cursor; מוצג ב-`dragover`, מוסתר ב-`drop`/`dragleave` | `editor.js` + `style.css` `.broll-drop-marker` |
| **Playback מפסיק בין main clips** | (1) `loadMainClipSrc` משווה paths: אם same path → skip `mainVideo.load()`. (2) `seekTimeline` — אם same source → direct `currentTime` set, no async wait. (3) Hidden `#preloadVideo` (preload="auto") מקבל את source הבא כשנותרו ≤2s ב-clip הנוכחי → HTTP cache + decoder מחומם. (4) rAF-driven `startBoundaryWatcher()` ב-`onVideoPlay`/stop ב-`onVideoPause` → boundary detection בכל ~16ms במקום ~250ms של `timeupdate`. (5) Threshold להחלפת clip: `c.out - 0.04` (היה 0.05) | `editor.js` ~462-540 + ~617-657 + `index.html` ~122 |

### Backend bugs (app.py)

**MediaPipe migration to Tasks API**:
- mediapipe 0.10.35 הסיר `mp.solutions.selfie_segmentation` — קוד ישן נכשל ב-`AttributeError: module 'mediapipe' has no attribute 'solutions'`
- כעת משתמש ב-`mediapipe.tasks.vision.ImageSegmenter` (running_mode VIDEO)
- `_ensure_selfie_model()` מוריד אוטומטית `selfie_segmenter.tflite` מ-Google CDN לתיקיית `models/` ב-first use
- URL: `https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite`

**FFmpeg input-index bug ב-`_assemble_main_clips` + `_assemble_broll`**:
- באג: שני המקומות השתמשו ב-`idx` לכל אחד מ: input index (`[{idx}:v]`) **וגם** filter label (`[mv{idx}]`/`[bv{idx}]`). אבל segments של `color=black:...` (lavfi) **לא מוסיפים `-i` input** — אז `idx` ב-input-side מקבל ערכים שלא קיימים. שגיאת FFmpeg: `Invalid file index 3 in filtergraph description`
- תיקון: 2 counters נפרדים — `input_idx` שעולה רק כשמוסיפים `-i`, ו-`idx` שעולה לכל segment (לabels). הfilter מפנה ל-`[{input_idx}:v]` ו-`[{input_idx}:a]`, הlabels נשארים `[mv{idx}]`/`[bv{idx}]`
- מיקום: `app.py` ~1176-1216 (`_assemble_main_clips`) + ~1264-1284 (`_assemble_broll`)

**Pixel format compatibility (Windows Media Player)**:
- libx264 ללא `-pix_fmt` flag פלט `yuv444p` (High 4:4:4 Predictive profile) → WMP/Quicktime/דפדפנים רבים דוחים: "It uses unsupported encoding settings (0x80004005)"
- תיקון: `-pix_fmt yuv420p` הוסף ל-**כל** הencodes ב-export pipeline:
  - `_apply_background` (line ~1023)
  - `_assemble_main_clips` fallback + main (lines ~1158, ~1215)
  - `_assemble_broll` clip-based + black-fallback (lines ~1270, ~1301)
  - `_compose` (line ~1366)
  - `_concat_videos` (line ~1412)
- אימות: `ffprobe -show_entries stream=pix_fmt` → `yuv420p`

**B-roll path resolution + silent failures**:
- `_assemble_broll` תומך עכשיו גם ב-`/uploads/` paths (לא רק `/broll/`)
- אם `total_dur <= 0.05` → bumped ל-1.0 (מונע lavfi invalid input)
- Skipped paths נרשמים ל-stdout: `[broll] Skipped (path not found): [...]`
- Black-fallback וmain-filter בודקים `returncode != 0 or not Path(out).exists()` → raise במקום silent fail

**Compose error visibility**:
- שגיאות FFmpeg נחתכו ל-600 chars מההתחלה → רק banner של FFmpeg נראה
- כעת — שמירת stderr המלא + filter_complex graph ל-`compose_error.log`, והודעה למשתמש מציגה את **tail** של 2000 chars (איפה השגיאה האמיתית)
- `_export_worker` traceback מוצג מ-tail: `tb.format_exc()[-3000:]` (היה `[:600]`)

### Background segmentation quality — ארכיטקטורה משופרת

הבעיה: background replacement עם soft confidence mask + heavy Gaussian יצר flickering, blurry edges, וartifacts (חפצים מהcomposition אקראית מופיעים/נעלמים).

**Pipeline חדש** (ב-`_apply_background`, אחרי MediaPipe inference):

```python
THRESHOLD     = 0.55          # confidence cutoff — sharp person/bg boundary
OPEN_KERNEL   = 5             # morphological open — removes noise specks
CLOSE_KERNEL  = 9             # morphological close — fills internal holes
EDGE_FEATHER  = max(1, int(softness*6) | 1)  # 1-7px light feather (NOT a heavy blur)
EMA_ALPHA     = 0.65          # temporal smoothing: 0.65*prev + 0.35*new
KEEP_LARGEST  = True          # discard everything except the biggest blob
```

**צעדים פר-frame**:
1. **Threshold** confidence_mask ל-binary (≥0.55 → 255) — edge חד
2. **Morphological open** (kernel 5×5 ellipse) — מסיר specks
3. **Morphological close** (kernel 9×9 ellipse) — sealing internal holes
4. **`connectedComponentsWithStats`** + keep biggest — eliminates floating debris (chair, plant, edges של רהיטים שmodel חושב שהם foreground)
5. **Light edge feather** (1-7px GaussianBlur, צמוד ל-softness slider) — natural edge ללא halo
6. **Temporal EMA**: `smoothed = 0.65*prev_mask + 0.35*new_mask` — מבטל frame-to-frame flicker
7. **Composite**: `out = mask*frame + (1-mask)*bg`

**Tuning hints**:
- אם הperson edges חתוכים (חלקים נחתכים) — הורד `THRESHOLD` ל-0.45
- אם debris עדיין flickers — העלה `OPEN_KERNEL` ל-7
- אם מסך רוצה לראות יותר flicker (פחות smoothing) — הורד `EMA_ALPHA` ל-0.4
- ה-Edge softness slider שולט ב-`EDGE_FEATHER` בלבד (1-7px)

### תלויות עודכנו

| חבילה | גרסה | הערה |
|-------|------|------|
| mediapipe | 0.10.35 | Tasks API only, no `solutions` module |
| opencv-python | 4.13.0 | morphology + connected components |
| **NEW**: `models/selfie_segmenter.tflite` | ~250KB | auto-downloaded on first export |

### Cheat sheet — נקודות קריטיות שצריך לזכור

- **כל libx264 encode** ב-export חייב `-pix_fmt yuv420p`
- **FFmpeg filter_complex** עם mixed sources: `input_idx` (count `-i` inputs) ≠ `idx` (count filter labels)
- **`mainVideo.loadedmetadata`** לא צריך לגעת ב-`videoDur` כשיש multi-clip state
- **`.tl-broll-track`** עם `overflow:visible` → `scrollLeft` תמיד 0 → חייבים reference שונה (`mainTrack`) לחישובי drop coordinates
- **Background segmentation** דורש post-processing מסודר (threshold + morphology + LCC + EMA) — soft mask לבד יוצר flicker
- **Server restart** דרוש אחרי כל edit ב-app.py: `Stop-Process` + `Start-Process` (ראה script ב"הפעלת השרת")
- **Browser hard refresh** (Ctrl+Shift+R) דרוש אחרי כל bump של `v=NN` ב-index.html

---

## Podcast — אינטגרציה לאתר + Render Deploy (1-יוני-2026)

ה-Video Editor הוסף כקלף 'Podcast' תחת **Authorized Personnel** באתר הראשי.
האתר רץ ב-GitHub Pages, ה-Podcast app אמור לרוץ כ-Docker container ב-Render.

### Frontend integration

| קובץ | שינוי |
|------|-------|
| `index.html` | קלף `#podcastCard` עם SVG מיקרופון, אחרי `#marketingAiCard` ב-`.auth-dropdown` |
| `auth.js` | listener על `#podcastCard` → `dataset.target='podcast'` → `openGate()`. אחרי verify-pin: `window.location.href = 'https://vv-podcast.onrender.com/?pin=<PIN>'` |

**Flow**:
1. User לוחץ "Podcast" → אותו PIN gate שמשמש את Finance AI / Marketing AI
2. `vv-marketing-api`'s `/api/auth/verify-pin` מאמת ב-`VV_ACCESS_CODE`
3. ה-frontend מעביר את ה-PIN לבית Podcast דרך query param `?pin=...`
4. Flask `before_request` hook מאמת מול אותו `VV_ACCESS_CODE`, מנפיק signed cookie (HMAC-SHA256 + 7-day TTL), מפנה ל-`/` ללא query string
5. כל requests עוקבים מאומתים מול הcookie

**Why this is safe**: ה-PIN לא נשמר ב-localStorage של ה-Podcast app — רק החתימה מ-SECRET_KEY. אם הPIN משתנה ב-`VV_ACCESS_CODE` env, sessions חדשים ייפסלו בהפניה הבאה. PIN בURL הוא חד-פעמי (one-shot swap → redirect).

### Backend integration (`video-editor-gui/app.py`)

תוספות:
- **`ACCESS_CODE = os.environ.get('VV_ACCESS_CODE')`** — אם לא set (dev מקומי), gate מושבת לחלוטין → אין שינוי בUX מקומי
- **`SECRET_KEY = os.environ.get('SECRET_KEY') or secrets.token_hex(32)`** — קריטי ב-prod: setting אחד ב-Render dashboard עם `generateValue: true`. בלי זה כל restart מפסיל את ה-cookies הקיימים
- **`AUTH_COOKIE = 'vv_podcast_session'`** — חתום HMAC על timestamp, TTL = 7 ימים
- **`/__health`** — endpoint public ללא auth, מחזיר `{ok, service, ffmpeg}` — לbeing healthchecks של Render
- **`_resolve_ffmpeg()`** — detection chain: `FFMPEG_PATH` env → Windows winget path → `shutil.which('ffmpeg')` → fallback ל-`'ffmpeg'` בPATH. תומך גם Windows מקומי וגם Linux container
- **`PORT` env**: ב-Render, gunicorn מקבל את PORT אוטומטית. ב-local dev — `if __name__ == '__main__'` עדיין על port 5555 (`0.0.0.0` כשיש PORT, `127.0.0.1` ללא)

### Deployment files

| קובץ | תיאור |
|------|-------|
| `video-editor-gui/Dockerfile` | python:3.11-slim + ffmpeg + libgl1 + libglib2.0-0; `gunicorn -k gthread -w 1 --threads 8 --timeout 900` (timeout 15 דקות לexport ארוך) |
| `video-editor-gui/.dockerignore` | מחריג uploads/, broll/, exports/, thumbs/, backgrounds/, models/, __pycache__, .env, test scripts |
| `video-editor-gui/requirements.txt` | flask, gunicorn, requests, Pillow, openai-whisper, **opencv-python-headless** (לא הregular — חוסך deps של X11), mediapipe, numpy<2 |
| `render.yaml` | הוסף service `vv-podcast` (runtime: docker, rootDir: video-editor-gui, plan: standard, disk 10GB ב-/data, healthCheckPath: /__health) |

### Manual deploy steps (one-time setup)

1. **✅ Done (1-יוני-2026)**: `video-editor-gui/` הועבר אל תוך website repo:
   `Vision-Virtue-claude-vision-virtue-website-qY7BQ\video-editor-gui\`.
   הפעלה מקומית: `$APP` ב-PowerShell scripts מצביע על הנתיב החדש.

2. **Commit + push** את ה-repo. Render יזהה את ה-render.yaml ויציע ליצור service חדש "vv-podcast".

3. **ב-Render Dashboard**:
   - Connect repo (אם חדש) → אישור על שני services
   - בservice `vv-podcast` → Environment → set `VV_ACCESS_CODE` ל-same value כמו של marketing-api
   - לחץ "Deploy" — build יקח ~10-15 דקות (mediapipe + opencv installs כבדים)

4. **DNS / domain** (אופציונלי) — אם רוצים `podcast.visionvirtuepartnership.com` במקום `vv-podcast.onrender.com`:
   - ב-Render → Settings → Custom Domain
   - בDNS שלך → CNAME `podcast` → `vv-podcast.onrender.com`
   - לעדכן את `PODCAST_URL` ב-`auth.js`

5. **Update `auth.js`** אם ה-URL שונה — כרגע hardcoded ל-`https://vv-podcast.onrender.com`.

### Cost / capacity notes

- **Plan: Standard ($25/month)** — 2GB RAM. נדרש בגלל:
  - Whisper transcription (~1.5GB peak)
  - MediaPipe + OpenCV
  - FFmpeg encoding processes
- **Disk 10GB** — מספיק לסשנים פעילים. אם מצטבר → לקצור manually exports/ ישנים
- **Cold start** — Render Free Plan ישן 15 דק' של inactivity. Standard ממשיך לרוץ
- **Timeout** — gunicorn `--timeout 900` (15 דק') לexport ארוך. Render's request timeout מוגבל ל-30 דק' ב-Standard

### Local dev: zero changes

`python app.py` מקומית — אותה התנהגות בדיוק כמו לפני (port 5555, אין auth, ffmpeg path הישן עובד).
ה-PIN gate מופעל **רק אם** `VV_ACCESS_CODE` set ב-env.

### Known gaps / future hardening

- ⚠️ **Cookie cross-site**: כרגע cookie מוגדר `SameSite=Lax`. עובד כי הPIN swap הוא navigation (GET), לא XHR. אם בעתיד תרצה לעשות XHR cross-origin → להחליף ל-`SameSite=None; Secure`
- ⚠️ **No PIN rate-limiting** ב-Flask app — Marketing API עושה זאת ב-`/api/auth/verify-pin`. ב-Podcast app אין הגנה brute-force. אפשר להוסיף `flask-limiter` אם רלוונטי
- ⚠️ **State בRAM** — restarting הPodcast service מפסיל transcriptions/intro-outros/uploads באמצע. לטרנספורם לprod-grade, להעביר ל-SQLite ב-`/data`

---

## CapitaFlow Investor Deck — End-to-End Generation Pipeline (יוני 2026)

הקוד הזה רץ עבור **כל** לקוח בdoor של CapitaFlow — אין שום branch ייעודי לפי-לקוח. Submission מגיע (כולל / או רק עם uploads → או רק עם שאלון → או שני שניהם), Raphael לוחץ "Generate PPTX" בFinance AI, ה-pipeline ב`pptx-generator.service.ts` רץ.

### Inputs (3 מקורות נתונים)
1. **xlsx הלקוח** (Financial Model המאוכלס) — כל ה-sheets נקראים
2. **uploads** של הלקוח (drag&drop מsection 10 בCapitaFlow portal) — PDF/DOCX/PPTX/XLSX → טקסט שכבר חולץ ע"י `deck-upload.service`
3. **Master template**: `marketing-backend/templates/VisionVirtue_InvestorDeck.pptx`

### Pipeline phases

| Phase | מה קורה |
|-------|---------|
| **Extract** (Claude single-call, `claude-sonnet-4-20250514`) | קורא את כל xlsx (xlsx npm) + טקסט uploads + רשימת `{{PLACEHOLDER}}` ייחודיים מהtemplate. מחזיר JSON map: text values מפורמטות לdeck משקיעים ($12M / 73% / 3.5x / 12,345) + chart-data JSON object לכל `{{CHART_*}}`. Tight token budget (workbook 35K chars, uploads 25K chars). 3 retries × 65s backoff על 429 |
| **Phase 1** | per-slide string replace. Captures chart-host-frame coords (smallest enclosing `<p:sp>` of each chart placeholder) BEFORE the replacement blanks the placeholder text |
| **Phase 1.5** | LLM rewrite (slide-rewriter.service). **DISABLED by default** — extractor handles it. Re-enable with `aiRewrite: true` |
| **Phase 2** | cleanup per `<p:txBody>`: strip remaining `{{X}}`, drop empty runs/paragraphs, **guarantee ≥1 paragraph per txBody** (inject empty `<a:p>` if needed). XMLValidator gate — invalid slides queued for deletion |
| **Phase 3** | sparse-slide deletion (>70% unfilled). **Final closing slide is always kept**. `deleteSlideFromPackage` cascade-deletes: slide xml + slide rels + presentation.xml `<p:sldId>` + presentation rels Relationship + Content_Types Override + notesSlide + notes rels + notes Override |
| **Phase 3.5** | chart injection. Render PNG via `chart-renderer.service` (SVG→@resvg/resvg-js, navy theme, scale-aware fonts, data labels above bars/points). Embed at `ppt/media/chart-<slug>.png`, add Content-Types Default PNG, add slide rels Image, insert `<p:pic>` at the enclosing-frame coords (NOT the small caption-text shape coords) |
| **Phase 4** | renumber `NN / OLD_TOTAL` footers to `NEW_INDEX / NEW_TOTAL` preserving padding |

### Claude vs deterministic code split
- **Claude decides**: every text value (company, problem, business model bullets, financials, traction, team, ask), every chart's data (labels + series of raw numbers), all formatting ($XM / XX% / X.Xx)
- **Code decides**: PPTX XML manipulation, chart rendering (SVG), slide pruning, final-slide protection, footer renumbering, cleanup, XML validity gates

### Number conventions (in Claude's chart-data output)
- `valueFormat: "currency"` → values are **raw dollars** (1200000 for $1.2M, 40000 for $40K). The renderer auto-picks the $XM / $XK suffix
- `valueFormat: "percent"` → raw percent (42 means 42%)
- `valueFormat: "count"` → integer counts (12345 → "12,345")
- `valueFormat: "number"` → generic
- Chart types supported: `column`, `stackedColumn`, `line`

### Defense layers (corruption prevention — learned the hard way)
- `encodeXmlEntities` strips XML-illegal control chars before encoding entities
- `cleanupSlideXml` per-`<p:txBody>` processing — empty txBody is invalid OOXML
- `XMLValidator.validate` per slide post-cleanup — invalid slides dropped, not shipped
- All regex use `[^>]*?` (excludes only `>`) — `[^/>]*` can't match `Override PartName="..." ContentType="application/vnd..."` because of `/` in MIME type
- Slide-deletion cascade includes notesSlide (one-to-one with slides in V&V template) — orphan notesSlide refs cause "PowerPoint can't read"
- Final closing slide protected from deletion regardless of fill ratio

### Cost & throughput
- ~$0.02 per generate (one Sonnet 4 call, ~15K input + ~5K output tokens)
- Anthropic tier limit: 30K input tokens / minute. With one call per generate, ~2 generates/min sustained
- 3-attempt retry × 65s sleep gives ~2 min of headroom for transient rate pressure

### Endpoints
- `POST /api/admin/submissions/:id/generate-pptx?pin=...` (admin) — runs pipeline, returns stats JSON
- `GET /api/admin/submissions/:id/pptx?pin=...` (admin) — downloads
- `GET /api/customer/me/submissions/:id/pptx` (customer) — downloads their own

### Files
- `marketing-backend/src/services/pptx-generator.service.ts` — main pipeline
- `marketing-backend/src/services/chart-renderer.service.ts` — SVG→PNG chart renderer
- `marketing-backend/src/services/slide-rewriter.service.ts` — Phase 4 LLM rewrite (disabled by default)
- `marketing-backend/src/services/deck-upload.service.ts` — customer uploads + text extraction
- `marketing-backend/src/controllers/capitaflow.controller.ts` — admin generate / download endpoints
- `marketing-backend/templates/VisionVirtue_InvestorDeck.pptx` — master template (on Render disk)

---

## Investors Marketplace — End-to-End (יוני 2026)

A second public surface for the CapitaFlow offering: lets VCs / PEs / family offices browse Vision's CapitaFlow customers raising capital, sign a standard NDA, and view the customer's investor deck — all gated by per-investor keys. Shipped in 10 phases over 2026-06-10 → 2026-06-11.

### High-level flow

1. **Admin (Finance AI → Investors Keys)** mints an `IV-XXXXXX` key per fund. The key shows up in a persistent list with a trash icon (cascade-delete).
2. **Investor** lands on `visionvirtuepartnership.com`, clicks the new **Investors Marketplace** nav item (between "Get in Touch" and "Authorized Personnel"), enters their IV key.
3. **Customer side** (CapitaFlow area, after finalization): one click on the Investors Marketplace tile → status flips from *Ready to Publish* → *Published*. All tile fields (sector, description, ask, GM%/ARR/Top-Line YR1→YR5, EBITDA YR5, NRR) are auto-extracted server-side from the customer's Financial Model xlsx. No form, no manual entry. **Unpublish** button reverses it.
4. **Investor view** (`investors-marketplace.html`): grid of customer tiles. Hover → popover shows the KPIs with YR1/YR5 labels next to each value. "Other" sector pill is hidden.
5. **Click a tile** → **NDA modal** (PDF iframe of the master NDA + form fields + typed-or-drawn signature canvas + checkbox). On Sign → backend persists the NDA record AND redirects to `deck-view.html`.
6. **Deck viewer** embeds **Microsoft Office Online Viewer** in an iframe. Microsoft fetches the customer's populated PPTX via a short-lived signed URL (10 min TTL) and renders it as a slideshow — no download / edit UI. Anti-screenshot shield activates on window blur / Print-Screen / Cmd+Shift+3/4/5 / Win+Shift+S.
7. **Admin (Authorized Personnel → Agreements)**: `agreements.html` lists every signed NDA with Download (populated NDA PDF generated by pdf-lib) and Delete actions.

### DB tables added (`marketing-backend/src/db/database.ts`)

| Table | Purpose | Cascade |
|-------|---------|---------|
| `investor_keys` | IV-XXXXXX key + investor name + revoked flag | NDA signatures cascade-delete |
| `marketplace_listings` | One row per published submission. Fields: customer_name, logo_path, description, sector, ask_amount_text, kpis (JSON), deck_pdf_path (legacy), status, published_at, withdrawn_at | Linked to customer_keys + capitaflow_submissions ON DELETE CASCADE |
| `nda_signatures` | Investor name + fund + title + email + sign_date + typed/drawn signature_value + signed_at + IP + user-agent. UNIQUE (investor_key_id, listing_id) | Cascades from investor_keys + marketplace_listings |

### Endpoints

| Path | Auth | Purpose |
|------|------|---------|
| `POST /api/investor/auth` | public (rate-limited 20/15min) | Validate IV key |
| `POST/GET /api/admin/investor-keys` | admin PIN | Mint / list |
| `POST /api/admin/investor-keys/:id/revoke` | admin PIN | Revoke without delete |
| `DELETE /api/admin/investor-keys/:id` | admin PIN | Hard delete + cascade |
| `DELETE /api/admin/customer-keys/:id` | admin PIN | Hard delete customer + every dependent row (submissions, listings, NDAs, GL accounts, budgets) |
| `POST /api/customer/me/marketplace-listings` | X-Customer-Key | Publish — body just `{submissionId}`; all tile data auto-extracted server-side |
| `POST /api/customer/me/marketplace-listings/:id/withdraw` | X-Customer-Key | Unpublish |
| `GET /api/investor/marketplace/listings[/:id]` | X-Investor-Key | Tile grid / single tile detail (includes `ndaSigned`, `deckAvailable`) |
| `POST /api/investor/nda/sign` | X-Investor-Key | Persist NDA |
| `GET /api/investor/nda/status?listingId=...` | X-Investor-Key | Already signed? |
| `GET /api/investor/marketplace/listings/:id/deck-info` | X-Investor-Key | Returns `{viewerUrl, ttlMs, customerName}` — viewerUrl is `view.officeapps.live.com/op/embed.aspx?src=<signed PPTX URL>` |
| `GET /api/marketplace/deck-pptx/:token` | **public**, HMAC-signed token only | Microsoft Office Online fetches the PPTX here. Token is HMAC-SHA256 over `{listingId, investorKeyId, exp}`, signed with `SESSION_SECRET`. 10-min TTL. |
| `GET/DELETE /api/admin/nda-signatures[/:id]` + `/pdf` | admin PIN | List / delete / download populated NDA PDF (pdf-lib appends a signed counterpart page to the master NDA) |
| `GET /api/admin/system-check` | admin PIN | Reports libreoffice availability — diagnostic only, not used by deck-view flow |

### Backend services

| File | Purpose |
|------|---------|
| `src/services/marketplace-extractor.service.ts` | One Claude call against the customer's finalized xlsx + form_data → `{sector, description, askAmountText, kpis}`. Sector/description deterministic from form_data, KPIs + ask from xlsx via Claude. |
| `src/services/deck-token.service.ts` | HMAC-SHA256 signed deck tokens (`signDeckToken` / `verifyDeckToken`). `SESSION_SECRET` env. 10-min TTL. |
| `src/services/nda-pdf-generator.service.ts` | pdf-lib — loads master NDA, appends signature counterpart page with form data + drawn/typed signature image. |
| `src/services/marketplace-deck.service.ts` | Legacy customer-uploaded PDF storage. Endpoints exist but UI was removed in Phase 6 — kept as a safety-net fallback. |
| `src/services/pptx-to-pdf.service.ts` | Built in Phase 6 for server-side PPTX→PDF via libreoffice. **Not used** post-Phase 10 (Office Online Viewer path) — left in repo for reference. |
| `src/services/system-check.service.ts` | Diagnostic that runs `libreoffice --version`. Used during the libreoffice availability investigation. |

### Frontend files

| File | Role |
|------|------|
| `index.html` | Investors Marketplace nav button (`.nav-investor-link`, teal) between "Get in Touch" and "Authorized Personnel"; investor-key gate modal `#ivOverlay`. Agreements card in Authorized Personnel dropdown. |
| `auth.js` | Routes admin PIN to `agreements.html` when target is `'agreements'`. |
| `script.js` | `setupInvestorKeyGate()` posts to `/api/investor/auth`, sets sessionStorage, redirects. Wired to both desktop nav + mobile menu. |
| `agents.html` + `agents.js` | "Investors Keys" generator form + persistent list with copy-key chips and trash icons. Trash on Customer Submissions folder head deletes the customer key + all dependent rows. |
| `capitaflow.html` + `capitaflow.js` | Investors Marketplace tile in CapitaFlow area. **Inline buttons only** (no modal): `Publish to Marketplace` → `Published` + `Unpublish`. Auto-extracted data. The "Attach Deck PDF" UI was removed once Office Online Viewer landed. |
| `investors-marketplace.html` | Tile grid with hover KPI popover. NDA modal (PDF iframe + form + typed/drawn signature canvas + checkbox + sign button + download-NDA link). Design mirrors CapitaFlow area (off-white body + navy hero + Raleway titles + accent blue). |
| `deck-view.html` | Embeds Office Online Viewer iframe. Anti-screenshot shield on window-blur / visibility-change / Print-Screen / Cmd+Shift+3/4/5 / Win+Shift+S. CONFIDENTIAL · `<investor>` watermark. Ctrl+S/P/U/C/A blocked, drag/copy blocked, F12 blocked. |
| `agreements.html` | Card grid of signed NDAs with Download (populated PDF) and Delete per row. Matches CapitaFlow area design. |
| `Vision_Virtue_NDA_VC_PE_Investors.pdf` | Static NDA asset served from root. |

### Key design decisions

- **Investor key prefix `IV-`** vs customer `VV-` so the two audiences never cross over. Same alphabet + 6-char body via `generateKey(prefix)` in `capitaflow.repository.ts`.
- **Auto-extraction over manual form**: the customer doesn't fill anything to publish — `marketplaceExtractor` reads their existing xlsx + form_data and fills the tile in one Claude call.
- **Office Online Viewer over libreoffice**: Render's `aptPackages` doesn't install libreoffice on the Node native runtime. Rather than switch to Docker + plan upgrade, the deck-view pipes the customer's PPTX (via a signed token URL) to Microsoft Office Online Viewer which renders the slideshow client-side in an iframe.
- **Token TTL 10 min**: enough time for Microsoft to fetch + render; short enough to limit a leaked-URL window. NDA does the legal heavy lifting; the TTL is defense-in-depth.
- **Sign-mode toggle (typed | drawn)**: typed displays in cursive font; drawn captures canvas → data-URL PNG → embedded in the populated NDA PDF.

### Phase log (commits)

| Phase | What | Backend commits | gh-pages commits |
|-------|------|-----------------|------------------|
| 1 | Keys + Gate | `a6eef2c` | `87c2c93` |
| 2 | Tiles + customer publish + Pull | `696066a` | `80830a6` |
| 3 | NDA flow + deck viewer (PDF upload path) | `6767ce5` | `87518c1` |
| 4 | Agreements tile + populated NDA PDF | `7693a8e` | `95a3474` |
| 5 | Nav placement + auto-extract + page redesign | `18e7c48` | `38e38f1` |
| 6 | Hide Other / YR labels / investor keys list / trash / libreoffice attempt | `5eb664e` | `11e44fe` |
| 7 | Nav nowrap + deckAvailable check + anti-screenshot | `ff1e36f` | `bddcb6f` |
| 8 | Nav wrap + system-check diagnostic | `7f3cda1` | `6f9c2ea` |
| 9 | (Reverted — Dockerfile drafted but Phase 10 obsoleted it) | — | — |
| 10 | Office Online Viewer for PPTX | `96e2888` | `b3e87a7` |

### Known gaps / future hardening

- ⚠️ The signed PPTX URL is reachable without an auth header for 10 minutes. NDA-signed investors who copy that URL out of DevTools can hand it to a third party within the window. Acceptable for V&V's investor audience; tighten TTL or bind to IP if scope expands.
- ⚠️ Phone-camera-of-screen is not preventable; the anti-screenshot shield only blocks software capture paths.
- `pptx-to-pdf.service.ts` and `system-check.service.ts` are now unused — safe to remove in a future cleanup.
- The customer-uploaded PDF endpoint (`/api/customer/me/marketplace-listings/:id/deck-pdf`) is still exposed; UI for it was removed in Phase 6. Consider full removal.
