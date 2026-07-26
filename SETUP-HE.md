<div dir="rtl">

# CineMind — מדריך הפעלה מקומי (עברית)

מדריך מסודר לכל מה שצריך כדי שהאתר והמודל המקומי ירוצו תמיד, מאחורי הקלעים, בלי להגדיר מחדש בכל פעם.

> **בקצרה:** צריך ששני דברים ירוצו — **(1) שרת ה-AI המקומי (Ollama)** ו-**(2) האתר**. אחרי התקנה חד-פעמית של ה-Keep-Alive, ה-AI דואג לעצמו (קם מחדש אם נפל, נשאר חם ומהיר). גם אם ה-AI ייפול — המנוע ימשיך להמליץ (הליבה דטרמיניסטית). לקוחות לעולם לא נתקעים.

---

## 1️⃣ התקנה חד-פעמית (5 דקות, פעם אחת)

**א. לוודא שהמודל קיים:**

```powershell
ollama list
```

צריך להופיע: `gemma2:9b` (מודל המנוע — עברית נקייה ומהירה). אם חסר:

```powershell
ollama pull gemma2:9b
```

**ב. להפעיל את ה-Keep-Alive האוטומטי — מ-PowerShell עם הרשאות מנהל, פעם אחת.**

הקובץ להרצה (לחיצה תפתח אותו):

📄 [`scripts/install-ollama-keepalive.ps1`](scripts/install-ollama-keepalive.ps1)

הנתיב המלא להעתקה:

```
C:\Users\EDOZA\Desktop\testamind\cinemind-studio-fresh\cinemind-akinator\trusting-gauss-510be5\scripts\install-ollama-keepalive.ps1
```

הפקודה להרצה (העתק-הדבק ל-PowerShell **כמנהל**):

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\EDOZA\Desktop\testamind\cinemind-studio-fresh\cinemind-akinator\trusting-gauss-510be5\scripts\install-ollama-keepalive.ps1"
```

> **איך פותחים PowerShell כמנהל:** מקש Windows → להקליד `powershell` → קליק-ימני → "הפעל כמנהל".

מעכשיו, בכל הדלקת מחשב + כל שתי דקות, המערכת בודקת שה-AI חי, מקימה אותו אם נפל, ושומרת אותו חם ומהיר. יומן פעילות: [`scripts/ollama-keepalive.log`](scripts/ollama-keepalive.log).

---

## 2️⃣ הרצה יומית — שהאתר יעלה

ה-AI כבר דואג לעצמו. צריך רק שהאתר ירוץ:

```powershell
npm run build   # פעם אחת אחרי שינויי קוד
npm start        # מריץ את האתר על http://localhost:3000
```

> רוצה שגם האתר יעלה לבד בכל הדלקה? תגיד לי ואוסיף סקריפט-התקנה (אותו עיקרון כמו ה-Keep-Alive).

---

## 3️⃣ איך יודעים שהכל חי

| מה לבדוק | פקודה / כתובת | תקין אם |
|---|---|---|
| ה-AI חי | `(Invoke-WebRequest http://localhost:11434/api/tags -UseBasicParsing).StatusCode` | מחזיר `200` |
| המוח באתר | פתח `http://localhost:3000/api/brain-health` | `"llm":"up"`, `"model":"gemma2:9b"` |

---

## ⚠️ 4️⃣ חשוב לפני העלאה לאוויר

הסוכן השני (אבטחה) הסיר fallback-secret מהקוד — **האתר יקרוס ב-production אם המשתנה `SESSION_SECRET` לא מוגדר.** ודא שהוא מוגדר ב-env לפני כל deploy.

---

## 5️⃣ המודל שנבחר — ולמה

| מודל | עברית | מהירות | תפקיד |
|---|---|---|---|
| **gemma2:9b** | ✅ נקייה וטבעית | ⚡ ~1.2 שניות | **המנוע** (נימוקי-המלצה ללקוחות) |
| qwen3:30b-a3b | — | מהיר | שחקן-המבחן (בדיקות בלבד) |
| qwen2.5 (כל הגרסאות) | ❌ ערבוב סינית/צרפתית | — | נפסל |

**ממצא:** כל מודלי qwen נכשלים בעברית (ערבוב שפות). **gemma2:9b** של Google הוא הבחירה — עברית נקייה, מהיר מאוד, ומשאיר זיכרון פנוי ב-3090. מותאם לחומרה שלך (Flash Attention + KV-cache q8).

---

## 6️⃣ העתיד — מעבר לענן ב-50+ לקוחות

כרגע ה-AI רץ על המחשב שלך (חינם, אבל דורש שהמחשב דלוק). כשנגיע ל-50+ לקוחות — נעביר את המודל ל-שרת וירטואלי בענן בשינוי של שורת-הגדרה אחת (`OLLAMA_BASE_URL` / `OLLAMA_MODEL`), בלי לגעת בקוד ובלי תלות במחשב שלך. תגיד לי ואכין.

</div>
