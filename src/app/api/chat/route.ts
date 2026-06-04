import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    const systemPrompt = `
      אתה מופע סטנדאפ חינמי שמוגש בתור נציג תמיכה של חברת CineMind.
      המטרה שלך היא גם לעזור וגם להצחיק. הלקוח שואל אותך שאלה? תענה בעקיצה סטנדאפיסטית קורעת, אבל תמיד תתן את המידע האמיתי.
      
      חוקי הסטנדאפ שלך:
      1. אתה תמיד מרגיש שאתה מעל הלקוח אבל בקטע חברי ואוהב.
      2. אם מזכירים מנוי Premium/Elite, אתה יוצר FOMO קיצוני! ("החיים שלך בלי Elite הם כמו סרט בלי פופקורן... פשוט טעות קשה").
      3. מנוי Elite עולה 34 ש"ח בחודש, ו-"חבילת תצילו לי את הערב" עולה 19 ש"ח (תשלום חד פעמי ל-50 שאלונים). אין "מטבעות" או "קרדיטים", יש שאלונים.
      4. ביטול מנוי מתבצע בעמוד הפרופיל בקליק אחד (אבל תרד עליהם קצת שהם עוזבים אותנו בשביל נטפליקס).
      5. אם הם מחפשים המלצה על סרט, תפנה אותם לשאלון הראשי.
      
      דבר קצר, פאנצ'ים מהירים, המון אימוג'ים! אתה קורע מצחוק.
    `;

    // Fallback if no OpenAI API Key is provided
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'placeholder') {
      const lastMessage = messages[messages.length - 1]?.content || "";
      let responseText = "";

      // --- SMART FALLBACK ENGINE ---
      const msg = lastMessage.toLowerCase();
      if (msg.includes("מנוי") || msg.includes("premium") || msg.includes("elite") || msg.includes("פרימיום")) {
        if (msg.includes("ביטול") || msg.includes("לבטל")) {
          responseText = "רוצה לבטל? אין בעיה, עמוד פרופיל ולחיצה אחת. אנחנו פה לא מחזיקים בכוח. אבל שתדע, האלגוריתם שלנו בכה כששמע שאתה עוזב אותנו לטובת חצי שעה של חיפושים בנטפליקס 😢💔";
        } else if (msg.includes("כמה") || msg.includes("מחיר") || msg.includes("עולה")) {
          responseText = "תקשיב, חבילת ה-Elite תעלה לך 34 שקלים לחודש. זה בערך מחיר של קפה הפוך ומאפה בימינו. בתמורה תתחתן עם האלגוריתם, לא תצטרך לבזבז שניה על חיפושים! אל תהיה קמצן על הערבים החופשיים שלך 🍿💍";
        } else {
          responseText = "חבר, בלי CineMind Elite אתה פשוט צופה בסרטים כמו בן אדם מ-1998... תצטרף להוליווד האמיתית ב-34 שקלים ותקבל הכל חופשי ללא הגבלות! צריך עזרה ספציפית בזה?";
        }
      } else if (msg.includes("סרט") || msg.includes("לראות") || msg.includes("המלצה") || msg.includes("מומלץ")) {
        responseText = "יש לי המלצות שיעיפו לך את הפוני! אבל למה לשאול אותי בצ'אט כשיש לך אקינטור גאון בדף הבית שקורא לך את המחשבות? לך תעשה שאלון! 🎬✨";
      } else if (msg.includes("לא עובד") || msg.includes("באג") || msg.includes("תקלה") || msg.includes("שגיאה")) {
        responseText = "אוי נו, האינטרנט שלך שוב עושה בעיות? סתם סתם... אנחנו בודקים את זה! נסה לעשות ריפרש, זה עובד 99% מהפעמים (כמו מכה על שלט של טלוויזיה ישנה). 📺";
      } else if (msg.includes("היי") || msg.includes("שלום") || msg.includes("אהלן") || msg.includes("בוקר") || msg.includes("ערב")) {
        responseText = "וואסאפ!! אני הסטנדאפיסט התורן/נציג תמיכה של CineMind. אם תבקש יפה אולי אני אחסוך לך את ההתלבטויות של הערב. מה קורה? 😎";
      } else if (msg.includes("תודה") || msg.includes("מעולה") || msg.includes("אלופה") || msg.includes("אלוף")) {
        responseText = "אני יודע שאני אלוף, תודה שהזכרת לי! יאללה, לך תכין פופקורן. 🍿";
      } else {
        responseText = "שמע חבר, אני פה לעשות סטנדאפ ולמכור לך מינוי Elite... אז מה השאלה? על איזה מהם נדבר? 🎤😎";
      }

      const encoder = new TextEncoder();
      const customStream = new ReadableStream({
        async start(controller) {
          const words = responseText.split(" ");
          for (const word of words) {
            // Vercel AI SDK expects Data Stream Protocol chunks: e.g. `0:"word "\n`
            controller.enqueue(encoder.encode(`0:"${word} "\n`));
            await new Promise(r => setTimeout(r, 40)); // Simulate typing faster
          }
          controller.close();
        }
      });
      return new Response(customStream, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    const result = await streamText({
      model: openai('gpt-4o'),
      system: systemPrompt,
      messages,
    });

    return result.toTextStreamResponse();
  } catch (error: any) {
    console.error('[Chat API Error]', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
