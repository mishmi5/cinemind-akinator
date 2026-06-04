const fs = require('fs');

const lines = fs.readFileSync('C:/Users/EDOZA/.gemini/antigravity-ide/brain/08b19473-c75a-4f22-98d3-71b8a169bfce/.system_generated/logs/transcript.jsonl', 'utf-8').split('\\n');

let lastUserMsg = "";
for (let i = 0; i < lines.length; i++) {
  if (!lines[i]) continue;
  try {
    const step = JSON.parse(lines[i]);
    if (step.source === 'USER_EXPLICIT' || step.source === 'USER') {
      lastUserMsg = step.content || "";
    }
    if (step.source === 'MODEL' && step.tool_calls) {
      const tc = JSON.stringify(step.tool_calls);
      if (tc.includes('ask_permission') || tc.includes('node') || tc.includes('run_command')) {
        // If the model said it was "טופל" or the user said it
        const content = step.content || "";
        if (content.includes('טופל') || content.includes('פתרון') || lastUserMsg.includes('טופל')) {
          console.log(`\n--- FOUND STEP ${step.step_index} ---`);
          console.log("Model Content:", content.substring(0, 300));
          console.log("Tool Calls:", tc);
        }
      }
    }
  } catch (e) {}
}
