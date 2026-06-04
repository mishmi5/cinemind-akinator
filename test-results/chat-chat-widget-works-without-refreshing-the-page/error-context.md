# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: chat.test.ts >> chat widget works without refreshing the page
- Location: chat.test.ts:3:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('div.bg-zinc-800').first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('div.bg-zinc-800').first()

```

```yaml
- main:
  - text: שירה מחיפה קלעה בול לסרט הערב שלה
  - navigation:
    - button:
      - img
    - link "CineMind":
      - /url: /
      - img
      - text: CineMind
    - link "👾 זירת אונליין":
      - /url: /arena
    - link "Premium מנויים":
      - /url: /pricing
    - button "Vibe חצות 🦇"
    - link "כניסה":
      - /url: /login
  - heading "בזמן שחיפשתם מה לראות, הסרט כבר היה יכול להיגמר." [level=1]
  - paragraph: תכלס? רובנו שורפים איזה 20 דקות לפחות רק על לגלול ולחפש סרט כל ערב.
  - paragraph:
    - text: אז תשכחו מזה.
    - strong: CineMind
    - text: זה לא סתם אלגוריתם, זה כמו חבר שקורא אתכם. דרך חידון קליל וכיפי של בערך 20 שאלות מהירות, אנחנו קולטים את ה-DNA הקולנועי שלכם להערב, ושולפים את הסרט המושלם מתוך ים של אפשרויות.
  - link "תפסיקו לנחש – תתחילו לראות 🍿":
    - /url: /quiz
  - img "Movie 1209511"
  - img "Movie 13576"
  - img "Movie 10681"
  - img "Movie 1387382"
  - img "Movie 348"
- text: תמיכה מהירה - CineMind 🍿
- button "✕"
- text: איך אפשר לעזור לך היום? 😊
- textbox "הקלד הודעה...": שלום, יש לי בעיה עם המנוי
- button "💬"
- alert
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test('chat widget works without refreshing the page', async ({ page }) => {
  4  |   await page.goto('http://localhost:3000');
  5  |   
  6  |   // Open the chat widget
  7  |   // Hide Next.js dev overlay that might block clicks
  8  |   await page.evaluate(() => {
  9  |     const overlay = document.querySelector('nextjs-portal');
  10 |     if (overlay) overlay.remove();
  11 |   });
  12 |   
  13 |   await page.click('button:has-text("💬")');
  14 |   
  15 |   // Ensure the input exists
  16 |   const chatInput = page.locator('input[placeholder="הקלד הודעה..."]');
  17 |   await expect(chatInput).toBeVisible();
  18 |   
  19 |   // Type a message and press Enter
  20 |   await chatInput.fill('שלום, יש לי בעיה עם המנוי');
  21 |   await chatInput.press('Enter');
  22 |   
  23 |   // Wait a few seconds for the AI stream to respond
  24 |   await page.waitForTimeout(3000);
  25 |   
  26 |   // Ensure we didn't refresh (the URL should still be the same, and the chat widget still open)
  27 |   await expect(page).toHaveURL('http://localhost:3000/');
  28 |   await expect(chatInput).toBeVisible();
  29 |   
  30 |   // Check if a message from the assistant appeared (bg-zinc-800 is the assistant's message bubble class)
  31 |   const assistantMsg = page.locator('div.bg-zinc-800');
> 32 |   await expect(assistantMsg.first()).toBeVisible();
     |                                      ^ Error: expect(locator).toBeVisible() failed
  33 |   
  34 |   console.log('Chat widget successfully submitted message without page refresh, and received AI response.');
  35 | });
  36 | 
```