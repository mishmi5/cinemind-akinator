import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables for the script
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// We define the schema of a single question
const questionSchema = z.object({
  question: z.string(),
  correctAbsurd: z.string(),
  trueFacts: z.array(z.string()).length(3)
});

// We expect an array of questions back
const responseSchema = z.object({
  questions: z.array(questionSchema)
});

const DATA_FILE_PATH = path.join(process.cwd(), 'src', 'data', 'arena-questions.json');

async function generateMoreQuestions(amountToGenerate: number = 20) {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'placeholder') {
    console.error("❌ ERROR: Please set a valid OPENAI_API_KEY in .env.local to generate questions.");
    process.exit(1);
  }

  console.log(`🤖 Generating ${amountToGenerate} new absurd trivia questions...`);

  try {
    const { object } = await generateObject({
      model: openai('gpt-4o'),
      schema: responseSchema,
      prompt: `
        צור ${amountToGenerate} שאלות טריוויה מטורללות על סרטים מפורסמים (סרטי פולחן, שוברי קופות, ישראלים והוליווד).
        המבנה לכל שאלה צריך להיות:
        - question: שואל "מה יש בסרט [שם הסרט]?" או "מה קורה בסרט [שם הסרט]?"
        - correctAbsurd: עובדה אחת מצחיקה, מטורללת, והזויה לחלוטין ש*לא* קורית בסרט (המשתמש צריך לבחור בה כדי לנצח).
        - trueFacts: בדיוק 3 עובדות נכונות ואמיתיות על הסרט. בלי ספוילרים קריטיים שהורסים את הסוף.

        כלל ברזל קריטי ביותר לניצחון: 
        כל ה-4 תשובות (ה-correctAbsurd וכל ה-trueFacts) **חייבות להיות באותו אורך מילים פחות או יותר (2 עד 5 מילים גג לכל תשובה)!** 
        אסור שהתשובה המטורללת (correctAbsurd) תהיה ארוכה יותר משאר התשובות, אחרת זה הורס את המשחק ומהווה רמז ברור. הכל חייב להיראות אותו הדבר ויזואלית.

        תהיה כמה שיותר יצירתי, הומוריסטי, ושנון.
      `,
    });

    // Read existing file
    let existingQuestions: any[] = [];
    if (fs.existsSync(DATA_FILE_PATH)) {
      const fileData = fs.readFileSync(DATA_FILE_PATH, 'utf8');
      existingQuestions = JSON.parse(fileData);
    }

    // Merge and save
    const updatedQuestions = [...existingQuestions, ...object.questions];
    fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(updatedQuestions, null, 2), 'utf8');

    console.log(`✅ Successfully added ${object.questions.length} new questions!`);
    console.log(`📊 Total questions in database: ${updatedQuestions.length}`);
    
  } catch (error) {
    console.error("❌ Failed to generate questions:", error);
  }
}

// Run the generator
generateMoreQuestions(100);
