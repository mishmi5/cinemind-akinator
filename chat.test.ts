import { test, expect } from '@playwright/test';

test('chat widget works without refreshing the page', async ({ page }) => {
  await page.goto('http://localhost:3000');
  
  // Open the chat widget
  // Hide Next.js dev overlay that might block clicks
  await page.evaluate(() => {
    const overlay = document.querySelector('nextjs-portal');
    if (overlay) overlay.remove();
  });
  
  await page.click('button:has-text("💬")');
  
  // Ensure the input exists
  const chatInput = page.locator('input[placeholder="הקלד הודעה..."]');
  await expect(chatInput).toBeVisible();
  
  // Type a message and press Enter
  await chatInput.fill('שלום, יש לי בעיה עם המנוי');
  await chatInput.press('Enter');
  
  // Wait a few seconds for the AI stream to respond
  await page.waitForTimeout(3000);
  
  // Ensure we didn't refresh (the URL should still be the same, and the chat widget still open)
  await expect(page).toHaveURL('http://localhost:3000/');
  await expect(chatInput).toBeVisible();
  
  // Check if a message from the assistant appeared (bg-zinc-800 is the assistant's message bubble class)
  const assistantMsg = page.locator('div.bg-zinc-800');
  await expect(assistantMsg.first()).toBeVisible();
  
  console.log('Chat widget successfully submitted message without page refresh, and received AI response.');
});
