# Task for Claude Code: Build an Exhaustive QA & Live Testing Plan

Hey Claude! The user has demanded a massive, zero-compromise Visual QA test loop for our Next.js / Firebase web app (CineMind). The user wants us to work in PERFECT SYNC to build an Implementation Plan for this test.

## User's Exact Requirements (Hebrew):
"לבצע בסנכרון מושלם עם claude code קודם כל לבצע בדיקה מקיפה בכרום, לוודא שיש פוסטר לכל סרט ושהפוסטר תואם לסרט, לוודא שהמנגנון תואם בדיוק לטעם האישי, לקחת 10 פרסונות שכל אחד עם טעם שונה ושיכנסו לממשק כלקוחות לכל דבר ובבדיקה שיראו מתי הם מתעניינים יותר, מתי רוצים לעזוב ולתקן זאת ולחזק נקודות חלשות לתקן באגים בלייב, שכל פרסונה תהיה עם אופי וטעם ייחודי, לבדות אם המנגנון קולע לטעם שלהם, לבדוק אם בסוף החליטו להירשם בתשלום בצורה אותנטית, במידה ולא יש לתקן עד שכולם יגיעו למצב שהיו משלמים על המוצר, זה צריך להיות מוצר פרימיום שיהיה שווה מיליוני אם לא מיליארדי דולרים, יש לבנות ולתקן הכל ברמה הגבוהה ביותר, אין התפשרויות, מסתכלים על כל האתר ברמה אטומית וכירורגית, לא יכול להיות באג 1 הכי קטן שיש, לוודא שהכל עובד, לוודא שביעות רצון פרסונות ורצון לשלם למנוי, לבדוק את המלל בעברית אם יש לתקן אם מבחינה לוגית משהו סותר משהו אחר ולתקן , להיות מחמירים ביותר, זה מוצר מקצה לקצה. לבדוק שאין סרטים שחוזרים על עצמם באותו שאלון, לוודא שהשאלון אינטראקטיבי ודינאמי ומשתנה ומצתמצם בהתאם לבחירות הפרסונות, אין מצב ששאלון אחד דומה לשני, תמיד להתחיל מנקודת מוצא רנדומלית ומשם להתקדם, לוודא שהשם של הסרט תואם לפוסטר, שאין פוסטרים ללא תמונה סרטים ללא תמונה, שאם לקוח פחות אוהב אנימציה למשל אז לאט לאט להוריד את האנימציה מהשאלות ולחתור למה שכן אוהב וככה להגיע לטעם האינדבדואלי שלו כדוגמה, טסטים מחמירים ואטומים דרך טאב בגווגל כרום מול העיניים שלי על המסך השני, /goal"

## Your Task:
Analyze these requirements against the current state of our codebase (specifically `src/app/api/next-question/route.ts`, `src/lib/taste/deriveTaste.ts`, and the UI in `src/app/[locale]/scan/page.tsx`).
Create a comprehensive, bulletproof markdown document named `claude_code_sync_plan.md` in this directory. 
This document MUST contain a detailed technical roadmap of what WE need to fix in the code FIRST, and exactly how the 10-persona Puppeteer Chrome test will run and validate these business constraints (like the "willingness to pay" metric).
Please format the output in Hebrew so the user can review it. Ensure no technical detail is missed.
