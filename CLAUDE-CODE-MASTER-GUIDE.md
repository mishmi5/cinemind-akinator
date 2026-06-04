# 🧠 CLAUDE CODE — מדריך מאסטר מלא (מרץ 2026)
# המדריך המלא לניהול אוטונומי של Claude Code — Sub-Agents, Agent Teams, Hooks, Skills, חיסכון טוקנים

> **מטרה:** הקובץ הזה מיועד לשליחה ישירה ל-Claude Code כדי שיעדכן את עצמו עם כל הפיצ'רים, הפקודות, ואסטרטגיות האופטימיזציה העדכניות ביותר.

---

## 📌 חלק 1: מצבי הרשאות — הפסקת ה-YES הבלתי נגמר

### 5 מצבי הרשאות זמינים

| מצב | תיאור | פקודה |
|------|--------|-------|
| **Default** | מבקש אישור לכל פעולה | ברירת מחדל |
| **Accept Edits** | מאשר עריכת קבצים אוטומטית, מבקש אישור ל-shell | `Shift+Tab` |
| **Plan Mode** | Claude יוצר תוכנית מפורטת שאתה מאשר, ואז מבצע | `Shift+Tab` (לחיצה שנייה) |
| **Bypass Permissions (YOLO)** | עוקף את כל ההרשאות — הכל אוטומטי | `--dangerously-skip-permissions` |
| **Auto Mode** (חדש! מרץ 2026) | Claude מחליט בעצמו מה צריך אישור ומה לא | `--enable-auto-mode` |

### הפקודות להפעלת מצב אוטונומי מלא

```bash
# === מצב YOLO — הכל רץ בלי שאלות ===
claude --dangerously-skip-permissions "תיאור המשימה שלך"

# === עם permission mode ===
claude --permission-mode bypassPermissions "Fix all lint errors"

# === AUTO MODE — חדש! Claude מחליט בעצמו (Research Preview) ===
claude --enable-auto-mode

# === PLAN MODE — Claude מתכנן, אתה מאשר פעם אחת, הוא מבצע ===
claude --permission-mode plan "Migrate database from MySQL to PostgreSQL"
```

### ⚠️ הגדרת AllowedTools — הדרך הבטוחה

במקום YOLO מלא, הגדר whitelist של כלים מותרים ב-`settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Read(*)",
      "Write(*)",
      "Edit(*)",
      "Grep(*)",
      "Glob(*)",
      "Bash(npm run *)",
      "Bash(node *)",
      "Bash(git *)",
      "Bash(ls *)",
      "Bash(cat *)",
      "Bash(mkdir *)",
      "Bash(cp *)",
      "Bash(mv *)",
      "Bash(curl *)",
      "Bash(pm2 *)",
      "Bash(npx *)"
    ],
    "deny": [
      "Bash(rm -rf /)",
      "Bash(rm -rf ~)",
      "Bash(sudo *)"
    ]
  }
}
```

### הגנה נוספת עם DisallowedTools

```bash
# חסימת rm גם במצב bypass
claude --dangerously-skip-permissions --disallowedTools "Bash(rm:*)"
```

### הפעלת headless mode לסקריפטים ו-CI/CD

```bash
# מצב headless — פחות טוקנים, בלי אינטראקציה
claude -p "your task here" --dangerously-skip-permissions --output-format stream-json
```

---

## 📌 חלק 2: Sub-Agents (תתי-סוכנים)

### מה זה?
תתי-סוכנים הם Claude instances מתמחים שכל אחד רץ בחלון context נפרד (200K טוקנים). הסוכן האב שולח משימה, התת-סוכן עובד עצמאית, ומחזיר **רק את התוצאה הסופית** — וזה חוסך המון context.

### 3 סוכנים מובנים

| סוכן | תפקיד | מודל ברירת מחדל |
|-------|--------|-----------------|
| **Explore** | חיפוש וניתוח codebase (קריאה בלבד) | Haiku |
| **Plan** | איסוף context לפני הצגת תוכנית | Sonnet |
| **General-purpose** | משימות מורכבות עם חקירה + פעולה | Sonnet |

### יצירת תת-סוכן מותאם

```bash
# דרך הממשק האינטראקטיבי
/agents
```

או צור קובץ ידנית ב-`.claude/agents/`:

```markdown
---
name: scraper-agent
description: Use when scraping product data from websites or APIs. Handles data extraction, cleaning, and CSV output.
tools: Bash, Read, Write, Grep, Glob
model: sonnet
---

# Scraper Agent

You are a specialized web scraping and data extraction agent.

## Core Responsibilities
- Extract product data from websites and APIs
- Clean and normalize data
- Output to CSV/JSON formats
- Handle rate limiting and retries

## Rules
- Always validate URLs before scraping
- Respect robots.txt
- Add delays between requests (minimum 1 second)
- Log all errors to scrape-errors.log
- Never expose API keys in output

## Output Format
Always return results as JSON with structure:
{
  "success": boolean,
  "items_scraped": number,
  "output_file": "path/to/file",
  "errors": []
}
```

### תת-סוכן עם hooks מובנים

```markdown
---
name: safe-deployer
description: Handles deployment tasks with safety checks
tools: Bash, Read
model: sonnet
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/validate-deploy-command.sh"
  PostToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/log-deploy-action.sh"
---

# Safe Deployer Agent

You deploy applications with mandatory safety checks.

## Pre-Deploy Checklist
1. Verify all tests pass
2. Check environment variables
3. Validate config files
4. Create backup

## Post-Deploy Checklist
1. Health check
2. Log verification
3. Rollback plan ready
```

### תת-סוכן למוזיקה / KIE.ai (מותאם לך)

```markdown
---
name: music-pipeline
description: Use for Hebrew rap music generation pipeline with KIE.ai API
tools: Bash, Read, Write
model: sonnet
---

# Music Pipeline Agent

You manage the end-to-end music generation pipeline.

## Workflow
1. Generate lyrics (Hebrew rap)
2. Call KIE.ai API for music generation
3. Process audio output
4. Generate music video
5. Prepare for TikTok/social upload

## Parameters to Track
- Audio Weight
- Style Weight  
- BPM
- Key
- Remix source file

## Output
- Final audio file (MP3/WAV)
- Video file (MP4)
- Metadata JSON for social posting
```

### תת-סוכן ל-WhatsApp Marketing

```markdown
---
name: whatsapp-marketer
description: Use for generating WhatsApp marketing messages for affiliate products
tools: Read, Write, Grep
model: haiku
---

# WhatsApp Marketing Agent

You generate targeted WhatsApp marketing messages for affiliate products.

## Audience Targets
- Gulf Arabic (UAE, Saudi, Kuwait)
- Latin American Spanish (Mexico, Colombia)
- Hebrew (Israel)

## Message Rules
- Maximum 300 characters per message
- Include product emoji
- Include shortened affiliate link placeholder
- Cultural adaptation per audience
- A/B test variants (minimum 3 per product)

## Output Format
Return JSON array:
[
  {
    "audience": "gulf_arabic",
    "variant": "A",
    "message": "...",
    "emoji_count": 3
  }
]
```

### תת-סוכן ל-AliExpress Affiliate

```markdown
---
name: aliexpress-affiliate
description: Use for AliExpress product processing, affiliate link management, and catalog operations
tools: Bash, Read, Write, Grep, Glob
model: sonnet
---

# AliExpress Affiliate Agent

You manage the AliExpress affiliate product catalog and marketing pipeline.

## Core Tasks
- Process product data from CSV/JSON feeds
- Match product codes with affiliate links
- Generate product descriptions in multiple languages
- Create Airtable-compatible records
- Manage Telegram distribution messages

## Data Sources
- Product CSVs from FlyLinking
- Yupoo image galleries
- AliExpress API responses

## Languages
- Gulf Arabic (اللغة العربية)
- Mexican Spanish (Español MX)
- Hebrew (עברית)

## Output Rules
- Always include product image URL
- Include original price and discount percentage
- Generate unique tracking IDs
- Format for WhatsApp (short) and Telegram (detailed) separately
```

### הפעלת תת-סוכן

```bash
# בשפה טבעית
"Use the scraper-agent to extract products from this URL"

# דרך תפריט
/agents

# Claude גם מפעיל אוטומטית לפי ה-description
```

### הגבלות
- תת-סוכנים **לא יכולים** להפעיל תתי-סוכנים נוספים (אין nesting)
- צריכת טוקנים: **x4-7** מסשן רגיל
- לתקשורת בין סוכנים — השתמש ב-Agent Teams

---

## 📌 חלק 3: Agent Teams (קבוצות סוכנים) — ניסיוני

### הפעלה

```bash
# הוסף למשתני סביבה או settings.json
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
```

### מה ההבדל מ-Sub-Agents?

| | Sub-Agents | Agent Teams |
|---|-----------|-------------|
| תקשורת | מדווח רק לאב | מדברים **אחד עם השני** |
| Context | חלון נפרד | חלון נפרד + משימות משותפות |
| מבנה | Worker → Boss | צוות שיתופי עם Team Lead |
| טוקנים | x4-7 | **x15** |
| סטטוס | יציב | **ניסיוני** |

### דוגמה מעשית

```text
Create an agent team to build the AliExpress marketing pipeline.
Spawn three teammates:
1. "scraper" - handles product data extraction from FlyLinking CSVs
2. "copywriter" - generates marketing messages in Arabic, Spanish, Hebrew
3. "distributor" - formats and sends to WhatsApp groups and Telegram channels
Have them coordinate through the shared task list.
```

### Hooks ל-Agent Teams

```json
{
  "hooks": {
    "TeammateIdle": [
      {
        "command": "echo 'Teammate going idle - check if all tasks complete'",
        "timeout": 5000
      }
    ],
    "TaskCompleted": [
      {
        "command": "./scripts/validate-task-output.sh",
        "timeout": 10000
      }
    ]
  }
}
```

### Agent Team עם Debate Pattern (לדיבוג)

```text
Spawn 5 agent teammates to investigate why the OKX grid bot 
stopped trading overnight.
Have them talk to each other to try to disprove each other's theories,
like a scientific debate.
Update the findings doc with whatever consensus emerges.
```

---

## 📌 חלק 4: חיסכון בטוקנים — אסטרטגיות מוכחות

### העיקרון המרכזי
> 99.4% מהטוקנים = INPUT (קריאה). 0.6% = OUTPUT (כתיבה).
> **אופטימיזציה = לקרוא פחות context, לא לכתוב פחות קוד.**

### פקודות חיוניות

```bash
# בדוק צריכת טוקנים
/cost

# נקה context כשעוברים משימה
/clear

# דחוס שיחה עם הוראות ספציפיות
/compact Focus on code changes and API endpoints only

# בדוק מה צורך context
/context

# שנה שם לסשן לפני ניקוי (לחזור אליו אח"כ)
/rename "aliexpress-scraper-v2"

# חזור לסשן קודם
/resume

# סטטיסטיקות שימוש
/stats

# הגדר רמת effort
/effort low      # למשימות פשוטות
/effort medium   # ברירת מחדל
/effort high     # ultrathink
```

### החלפת מודלים חכמה

```bash
# 80% מהמשימות — Sonnet (מהיר וזול)
/model sonnet

# ארכיטקטורה מורכבת בלבד — Opus
/model opus

# משימות פשוטות — Haiku (הכי זול)
/model haiku

# COMBO — Opus לתכנון, Sonnet ליישום
# הפעל opusplan:
# Shift+Tab פעמיים למצב Plan → Opus חושב → Sonnet מיישם
```

### CLAUDE.md אופטימלי (מתחת ל-200 שורות!)

```markdown
# Project: [שם הפרויקט]

## Architecture
Pattern: Node.js + Express + SQLite
Full details: docs/ARCHITECTURE.md

## Key Files
- src/server.js — main entry point
- src/routes/ — API routes
- src/agents/ — agent definitions
- config/ — environment configs

## Commands
- `npm run dev` — development server
- `npm run test` — run tests
- `npm run build` — production build
- `pm2 restart all` — restart services

## Conventions
- Use async/await, no callbacks
- Error handling with try/catch in every route
- Hebrew comments for business logic
- English for technical comments
- Always log to console with timestamps

## Do NOT read
- node_modules/
- .git/
- dist/
- *.lock files
- coverage/
```

### קובץ .claudeignore (חובה!)

```gitignore
# .claudeignore — מונע מ-Claude לקרוא קבצים מיותרים
node_modules/
.git/
dist/
build/
coverage/
*.lock
*.log
*.min.js
*.min.css
*.map
.env
.env.*
package-lock.json
yarn.lock
pnpm-lock.yaml
__pycache__/
*.pyc
.next/
.nuxt/
.cache/
tmp/
temp/
uploads/
*.sqlite
*.db
```

### Environment Variables לחיסכון

```bash
# כיבוי קריאות מודל לא קריטיות (הצעות וטיפים)
export DISABLE_NON_ESSENTIAL_MODEL_CALLS=1

# כיבוי אזהרות עלות
export DISABLE_COST_WARNINGS=1
```

### כיבוי MCP Servers לא פעילים

```bash
# בדוק מי צורך context
/context

# כבה server שלא בשימוש
@server-name disable

# או דרך /mcp
/mcp
```

### טיפים מתקדמים

1. **Prompt ספציפי = חיסכון x10:**
   - ❌ "Fix the bug in the authentication flow"
   - ✅ "Fix JWT validation in src/auth/validate.ts line 42 where expired tokens aren't rejected"

2. **הגבל output של פקודות:**
   - ❌ "Run all tests"
   - ✅ "Run tests for the auth module only"
   - ✅ `npm test -- --grep "auth" | head -50`

3. **סשן אחד למשימה אחת:**
   - באג אחד = סשן אחד
   - פיצ'ר אחד = סשן אחד
   - אל תערבב!

4. **דחוס ב-70%** — אל תחכה ל-auto-compact ב-95%

5. **`@file` במקום לתת ל-Claude לחפש:**
   - ✅ `@src/routes/api.js fix the POST endpoint`

---

## 📌 חלק 5: Hooks — אוטומציות דטרמיניסטיות

### למה Hooks?
- **מובטח לרוץ** — בניגוד להוראות ב-CLAUDE.md שהמודל עלול לדלג עליהן
- **אפס עלות context** — לא צורכים מחלון ה-context (אלא אם מחזירים output)
- **עובדים גם במצב YOLO**

### סוגי אירועים

| אירוע | מתי | שימוש |
|--------|------|-------|
| `PreToolUse` | לפני שימוש בכלי | ולידציה, חסימה |
| `PostToolUse` | אחרי שימוש בכלי | linting, formatting |
| `SessionStart` | תחילת סשן | setup, context loading |
| `TeammateIdle` | teammate הולך idle | בדיקת השלמה |
| `TaskCompleted` | משימה הושלמה | בדיקת איכות |
| `Elicitation` | MCP מבקש input | התאמה אישית |
| `ElicitationResult` | תשובה מ-MCP | עיבוד |

### הגדרה ב-settings.json

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "python3 scripts/validate-command.py \"$TOOL_INPUT\"",
            "timeout": 5000
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "npx eslint --fix $FILEPATH 2>/dev/null || true",
            "timeout": 10000
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Session started at $(date)' >> .claude/session.log"
          }
        ]
      }
    ]
  }
}
```

### Hook לאוטו-אישור (Safe YOLO עם בקרה)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "python3 -c \"import json,sys; inp=json.loads(sys.stdin.read()); cmd=inp.get('command',''); blocked=['rm -rf','sudo','DROP','DELETE FROM']; sys.exit(1) if any(b in cmd for b in blocked) else print(json.dumps({'hookSpecificOutput':{'permissionDecision':'allow'}}))\""
          }
        ]
      }
    ]
  }
}
```

### HTTP Hooks (חדש! מרץ 2026)

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "http",
            "url": "https://your-webhook.com/claude-code-events",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

### Hook למניעת commit של credentials

```bash
#!/bin/bash
# .claude/hooks/pre-commit.sh
if git diff --cached --name-only | grep -qE '\.(env|key|pem)$|creds|secret'; then
  echo "BLOCKED: Attempting to commit sensitive files"
  exit 1
fi
```

---

## 📌 חלק 6: Skills (מיומנויות)

### מה זה?
קבצי SKILL.md שמלמדים את Claude workflows חוזרים. ניתנים להפעלה כ-slash commands.

### יצירת Skill

צור קובץ ב-`.claude/skills/`:

```markdown
---
name: deploy-check
description: Pre-deployment checklist and verification
user-invocable: true
---

# Deployment Checklist Skill

## Steps
1. Run full test suite: `npm test`
2. Check for uncommitted changes: `git status`
3. Verify environment variables
4. Build production: `npm run build`
5. Check bundle size
6. Create git tag
7. Deploy
8. Health check
9. Log verification
```

### Skill ל-n8n Workflow (מותאם לך)

```markdown
---
name: n8n-workflow
description: Create and debug n8n workflows for automation
user-invocable: true
---

# n8n Workflow Skill

## Common Integrations
- Green API (WhatsApp)
- Airtable
- Telegram Bot
- Claude API (Anthropic)

## Workflow Patterns
- Webhook → Process → Distribute
- Cron → Scrape → Transform → Store
- Message received → AI Route → Response

## Debugging Steps
1. Check webhook URL is accessible
2. Verify API credentials
3. Test each node individually
4. Check execution logs in n8n UI
5. Validate JSON schemas between nodes

## n8n Server
- URL: http://38.242.210.112:5678
- Managed via PM2
```

---

## 📌 חלק 7: Plugins (תוספים)

### התקנה

```bash
# מ-Marketplace
claude plugin install <plugin-name>

# מקומי
claude plugin add --path ./my-plugin

# מ-GitHub
claude plugin marketplace add VoltAgent/awesome-claude-code-subagents

# הפעלת skill מ-plugin
/pluginName:skillName
```

### Plugins מומלצים

```bash
# 100+ sub-agents מוכנים
claude plugin marketplace add VoltAgent/awesome-claude-code-subagents

# Frontend design (277K+ installs)
# מותקן אוטומטית — הפעל עם:
/frontend-design

# Claude API skill
/claude-api
```

### Plugin Priorities (בהתנגשות שמות)
```
enterprise > user > project > plugin
```

---

## 📌 חלק 8: פיצ'רים חדשים (מרץ 2026)

### חלון Context של 1 מיליון טוקנים
- זמין ב-Max, Team, Enterprise
- אין צורך בהגדרה נוספת
- מאפשר עבודה עם codebases שלמים בלי compaction מוקדם

### /loop — Cron Job בתוך הסשן
```bash
# בדוק deploy כל 5 דקות
/loop 5m check the deploy status

# בדוק שהבוט OKX חי כל 10 דקות
/loop 10m verify OKX bot is running and show last 3 trades

# כיבוי
export CLAUDE_CODE_DISABLE_CRON=1
```

### Ultrathink — ניתוח עמוק לפי דרישה
```bash
# Opus 4.6 רץ ב-effort "medium" כברירת מחדל
# הוסף "ultrathink" לprompt להפעלת effort "high":
"ultrathink — analyze the full trading logic in the OKX bot and find edge cases"

# או דרך פקודה:
/effort high
```

### Voice Mode
- 20 שפות נתמכות
- STT (Speech-to-Text)

### HTTP Hooks
- POST JSON ל-URL חיצוני
- מושלם ל-webhooks, Telegram notifications, logging

### /effort — שליטה ברמת המאמץ
```bash
/effort low      # מהיר, פחות טוקנים
/effort medium   # ברירת מחדל
/effort high     # ultrathink — ניתוח עמוק
```

### Worktrees
```bash
# עבודה בisolated git worktree
claude --worktree

# sparse checkout לmonorepos גדולים
# settings.json:
{
  "worktree": {
    "sparsePaths": ["src/", "config/", "scripts/"]
  }
}
```

### Remote Control — שם מותאם
```bash
claude remote-control --name "TestaMind Bot"
# או
/remote-control "TestaMind Bot"
```

---

## 📌 חלק 9: תבניות מוכנות להעתקה

### תבנית הפעלה אוטונומית מלאה

```bash
#!/bin/bash
# === TESTAMIND AUTONOMOUS AGENT ===

# הגדרות סביבה
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
export DISABLE_NON_ESSENTIAL_MODEL_CALLS=1

# הפעלה אוטונומית עם הגנות
claude --dangerously-skip-permissions \
  --disallowedTools "Bash(rm -rf *)" \
  --model sonnet \
  "Execute the full AliExpress product pipeline: 
   1. Read new products from data/products.csv
   2. Generate marketing messages in Arabic, Spanish, Hebrew
   3. Format for WhatsApp and Telegram
   4. Save to output/messages/
   5. Log results to output/pipeline.log"
```

### תבנית settings.json מלאה

```json
{
  "model": "sonnet",
  "permissions": {
    "allow": [
      "Read(*)",
      "Write(*)",
      "Edit(*)",
      "Grep(*)",
      "Glob(*)",
      "Bash(node *)",
      "Bash(npm *)",
      "Bash(npx *)",
      "Bash(git *)",
      "Bash(curl *)",
      "Bash(pm2 *)",
      "Bash(ls *)",
      "Bash(cat *)",
      "Bash(mkdir *)",
      "Bash(cp *)",
      "Bash(mv *)",
      "Bash(echo *)",
      "Bash(cd *)",
      "Bash(pwd)",
      "Bash(head *)",
      "Bash(tail *)",
      "Bash(grep *)",
      "Bash(find *)",
      "Bash(wc *)",
      "Bash(python3 *)"
    ],
    "deny": [
      "Bash(rm -rf /)",
      "Bash(rm -rf ~)",
      "Bash(sudo *)",
      "Bash(shutdown *)",
      "Bash(reboot *)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'CMD=$(echo $TOOL_INPUT | python3 -c \"import sys,json; print(json.load(sys.stdin).get(\\\"command\\\",\\\"\\\"))\"); if echo \"$CMD\" | grep -qiE \"rm -rf|DROP TABLE|DELETE FROM|sudo|shutdown\"; then echo \"BLOCKED: $CMD\"; exit 1; fi'"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "npx eslint --fix $FILEPATH 2>/dev/null || true"
          }
        ]
      }
    ]
  }
}
```

### תבנית CLAUDE.md מינימלית

```markdown
# Project Configuration

## Stack
Node.js 20 + Express + SQLite + PM2

## Key Paths
- src/ — source code
- scripts/ — automation scripts  
- data/ — input data files
- output/ — generated output
- config/ — environment configs

## Commands
npm run dev | npm test | npm run build | pm2 restart all

## Conventions
- async/await only
- Hebrew comments for business logic
- Log with timestamps
- Error handling in every route

## Context Rules  
- Do NOT read node_modules, .git, dist, coverage, *.lock
- Use @file references instead of searching
- Clear context between unrelated tasks
```

---

## 📌 חלק 10: סיכום פקודות חיוניות

| פקודה | תיאור |
|--------|--------|
| `/agents` | צור/נהל תתי-סוכנים |
| `/clear` | נקה context |
| `/compact [instructions]` | דחוס שיחה עם הוראות |
| `/cost` | בדוק צריכת טוקנים |
| `/context` | בדוק מה צורך context |
| `/model [name]` | החלף מודל (sonnet/opus/haiku) |
| `/stats` | סטטיסטיקות שימוש |
| `/resume` | חזור לסשן קודם |
| `/rename [name]` | שנה שם סשן |
| `/loop [interval] [task]` | cron job בסשן |
| `/effort [level]` | רמת מאמץ (low/medium/high) |
| `/mcp` | נהל MCP servers |
| `/permissions` | נהל הרשאות |
| `/chrome` | בדוק/debug בדפדפן |
| `/claude-api` | skill לבניית אפליקציות Claude API |
| `/frontend-design` | skill לעיצוב frontend |
| `Shift+Tab` | מחזור בין מצבי הרשאות |
| `Shift+Tab x2` | Plan Mode |
| `Escape` | עצור ביצוע |
| `ultrathink` (בprompt) | ניתוח עמוק לתור אחד |

---

## 📌 חלק 11: מתכון מלא — סוכן אוטונומי עובד

```bash
#!/bin/bash
# ======================================
# TESTAMIND AUTONOMOUS AGENT LAUNCHER
# ======================================

PROJECT_DIR="/path/to/your/project"
LOG_DIR="$PROJECT_DIR/logs"
DATE=$(date +%Y-%m-%d_%H-%M)

mkdir -p "$LOG_DIR"

# הפעלת סוכן אוטונומי
cd "$PROJECT_DIR" && claude \
  --dangerously-skip-permissions \
  --disallowedTools "Bash(rm -rf *),Bash(sudo *)" \
  --model sonnet \
  -p "
    You are TestaMind Autonomous Agent.
    
    Current date: $(date)
    Project: $PROJECT_DIR
    
    TASK: [תיאור המשימה]
    
    RULES:
    1. Work autonomously without asking questions
    2. Log every action to $LOG_DIR/agent-$DATE.log
    3. If you encounter an error, try 3 times then log and skip
    4. Create a summary when done at $LOG_DIR/summary-$DATE.md
    5. Do NOT modify any .env files
    6. Do NOT push to git without explicit instruction
    
    BEGIN.
  " \
  --output-format stream-json \
  2>&1 | tee "$LOG_DIR/raw-$DATE.log"

echo "Agent finished at $(date)"
```

---

---

## 📌 חלק 12: עדכון אוטומטי — להישאר מעודכן תמיד מ-Anthropic

### עדכון Claude Code עצמו

```bash
# עדכן את Claude Code לגרסה האחרונה
npm update -g @anthropic-ai/claude-code

# בדוק גרסה נוכחית
claude --version

# Claude Code כולל auto-updater מובנה
# הוא מעדכן את עצמו אוטומטית בעת הפעלה
```

### מקורות רשמיים לעדכונים

| מקור | URL | תיאור |
|------|-----|--------|
| **Changelog רשמי** | https://code.claude.com/docs/en/changelog | כל הגרסאות + פיצ'רים |
| **GitHub Releases** | https://github.com/anthropics/claude-code/releases | Release notes מלאים |
| **GitHub CHANGELOG.md** | https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md | קובץ changelog מלא |
| **Claude Platform Updates** | https://platform.claude.com/docs/en/release-notes/overview | עדכוני API + מודלים |
| **Anthropic Blog** | https://www.anthropic.com/news | הכרזות חדשות |
| **Anthropic Docs** | https://docs.claude.com | דוקומנטציה מלאה |

### Hook אוטומטי — בדיקת עדכונים בתחילת כל סשן

צור את הקובץ `.claude/hooks/check-updates.sh`:

```bash
#!/bin/bash
# .claude/hooks/check-updates.sh
# בודק אם יש גרסה חדשה של Claude Code בתחילת כל סשן

CURRENT=$(claude --version 2>/dev/null | head -1)
LATEST=$(npm show @anthropic-ai/claude-code version 2>/dev/null)

if [ -n "$LATEST" ] && [ "$CURRENT" != "$LATEST" ]; then
  echo "⚡ UPDATE AVAILABLE: Claude Code $LATEST (current: $CURRENT)"
  echo "   Run: npm update -g @anthropic-ai/claude-code"
fi
```

הגדר אותו ב-`settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/check-updates.sh",
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
```

### סקריפט עדכון + דוח שינויים אוטומטי

צור `scripts/claude-update-check.sh`:

```bash
#!/bin/bash
# ==============================================
# CLAUDE CODE AUTO-UPDATE & CHANGELOG CHECKER
# ==============================================

LOG_DIR="${HOME}/.claude/update-logs"
mkdir -p "$LOG_DIR"
DATE=$(date +%Y-%m-%d)
LOG_FILE="$LOG_DIR/update-$DATE.log"

echo "=== Claude Code Update Check — $DATE ===" | tee "$LOG_FILE"

# 1. בדוק גרסה נוכחית
CURRENT_VERSION=$(claude --version 2>/dev/null | head -1)
echo "Current version: $CURRENT_VERSION" | tee -a "$LOG_FILE"

# 2. בדוק גרסה אחרונה ב-npm
LATEST_VERSION=$(npm show @anthropic-ai/claude-code version 2>/dev/null)
echo "Latest version: $LATEST_VERSION" | tee -a "$LOG_FILE"

# 3. השווה
if [ "$CURRENT_VERSION" = "$LATEST_VERSION" ]; then
  echo "✅ Up to date!" | tee -a "$LOG_FILE"
else
  echo "⚡ UPDATE AVAILABLE!" | tee -a "$LOG_FILE"
  echo "" | tee -a "$LOG_FILE"
  
  # 4. הצג מה חדש
  echo "--- What's New ---" | tee -a "$LOG_FILE"
  npm show @anthropic-ai/claude-code --json 2>/dev/null | \
    python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    desc = data.get('description', 'N/A')
    print(f'Description: {desc}')
except:
    print('Could not parse package info')
" | tee -a "$LOG_FILE"

  echo "" | tee -a "$LOG_FILE"
  
  # 5. שאל אם לעדכן
  read -p "Update now? (y/n): " ANSWER
  if [ "$ANSWER" = "y" ]; then
    echo "Updating..." | tee -a "$LOG_FILE"
    npm update -g @anthropic-ai/claude-code 2>&1 | tee -a "$LOG_FILE"
    echo "✅ Updated to $(claude --version 2>/dev/null | head -1)" | tee -a "$LOG_FILE"
  fi
fi

echo "" | tee -a "$LOG_FILE"
echo "Log saved to: $LOG_FILE"
```

### Skill לבדיקת changelog — הפעלה עם /check-updates

צור `.claude/skills/check-updates.md`:

```markdown
---
name: check-updates
description: Check for Claude Code updates and show changelog
user-invocable: true
---

# Check Claude Code Updates

## Steps
1. Run `claude --version` to get current version
2. Run `npm show @anthropic-ai/claude-code version` to get latest
3. If different, run `npm update -g @anthropic-ai/claude-code`
4. Fetch and summarize the latest changes from the official changelog

## Changelog Sources
- Primary: https://code.claude.com/docs/en/changelog
- GitHub: https://github.com/anthropics/claude-code/releases
- API/Models: https://platform.claude.com/docs/en/release-notes/overview

## After Update
- Verify new version with `claude --version`
- Check for new commands with `claude --help`
- Test that hooks and skills still work
- Update CLAUDE.md if new features are relevant to this project
```

### /loop לניטור עדכונים (רץ כל שעה)

```bash
# בתוך סשן Claude Code — בדוק עדכונים כל שעה
/loop 60m check if there's a new Claude Code version available and tell me what's new
```

### Cron Job — בדיקה יומית אוטומטית (מחוץ ל-Claude Code)

```bash
# הוסף ל-crontab
crontab -e

# בדוק עדכונים כל יום ב-9 בבוקר
0 9 * * * bash /path/to/scripts/claude-update-check.sh >> /var/log/claude-updates.log 2>&1
```

### עדכון אוטומטי מלא ללא התערבות

```bash
# הוסף ל-crontab לעדכון אוטומטי
0 3 * * * npm update -g @anthropic-ai/claude-code >> /var/log/claude-auto-update.log 2>&1
```

### Telegram Alert על עדכונים חדשים

צור `scripts/claude-update-telegram.sh`:

```bash
#!/bin/bash
# שולח הודעת Telegram כשיש עדכון חדש

TELEGRAM_BOT_TOKEN="YOUR_BOT_TOKEN"
TELEGRAM_CHAT_ID="YOUR_CHAT_ID"

CURRENT=$(claude --version 2>/dev/null | head -1)
LATEST=$(npm show @anthropic-ai/claude-code version 2>/dev/null)

if [ -n "$LATEST" ] && [ "$CURRENT" != "$LATEST" ]; then
  MESSAGE="⚡ *Claude Code Update Available!*%0A%0ACurrent: \`$CURRENT\`%0ALatest: \`$LATEST\`%0A%0ARun: \`npm update -g @anthropic-ai/claude-code\`%0A%0A📋 Changelog: https://code.claude.com/docs/en/changelog"
  
  curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
    -d chat_id="$TELEGRAM_CHAT_ID" \
    -d text="$MESSAGE" \
    -d parse_mode="Markdown" \
    > /dev/null
fi
```

הוסף ל-crontab:
```bash
# בדוק עדכונים כל 6 שעות ושלח Telegram
0 */6 * * * bash /path/to/scripts/claude-update-telegram.sh
```

### Skill להתעדכנות עם כל הפיצ'רים החדשים

צור `.claude/skills/whats-new.md`:

```markdown
---
name: whats-new
description: Fetch and summarize the latest Claude Code features and updates from Anthropic
user-invocable: true
---

# What's New in Claude Code

When invoked, perform the following research:

## Step 1: Check Current Version
Run `claude --version`

## Step 2: Fetch Latest Changelog
Use curl or web tools to check:
- https://code.claude.com/docs/en/changelog
- https://github.com/anthropics/claude-code/releases

## Step 3: Check for New Models
Review https://platform.claude.com/docs/en/release-notes/overview for:
- New model releases
- API changes
- Pricing changes
- New capabilities

## Step 4: Check for New Features
Look for:
- New slash commands
- New hooks types
- New agent capabilities
- New MCP integrations
- Performance improvements
- Token optimization changes

## Step 5: Generate Report
Create a summary in Hebrew with:
- 🆕 פיצ'רים חדשים
- 🔧 תיקונים חשובים
- ⚡ שיפורי ביצועים
- 💰 שינויי pricing/טוקנים
- 🔮 מה צפוי בהמשך
- 📋 פעולות מומלצות (מה לעדכן בפרויקט)

## Step 6: Update Project
If there are relevant new features:
- Suggest updates to CLAUDE.md
- Suggest new hooks if applicable
- Suggest new skills if applicable
- Suggest model changes if beneficial
```

### HTTP Hook — Webhook על עדכונים (חדש! מרץ 2026)

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'CURRENT=$(claude --version 2>/dev/null | head -1); LATEST=$(npm show @anthropic-ai/claude-code version 2>/dev/null); if [ \"$CURRENT\" != \"$LATEST\" ]; then echo \"{\\\"update_available\\\": true, \\\"current\\\": \\\"$CURRENT\\\", \\\"latest\\\": \\\"$LATEST\\\"}\"; fi'",
            "timeout": 15000
          }
        ]
      },
      {
        "hooks": [
          {
            "type": "http",
            "url": "https://your-n8n-instance.com/webhook/claude-code-session",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

### n8n Workflow — מערכת התראות מלאה

```text
WORKFLOW: Claude Code Update Monitor

Trigger: Cron (כל 6 שעות)
  ↓
HTTP Request: npm registry API
  URL: https://registry.npmjs.org/@anthropic-ai/claude-code/latest
  ↓
Function: Compare with last known version
  (שמור ב-n8n static data)
  ↓
IF: Version changed?
  ├── YES →
  │   ├── Telegram: שלח הודעה עם פרטי העדכון
  │   ├── HTTP Request: Fetch changelog from GitHub API
  │   │   URL: https://api.github.com/repos/anthropics/claude-code/releases/latest
  │   ├── Claude API: סכם את השינויים בעברית
  │   └── Update static data with new version
  └── NO → End
```

### סיכום — מה לעשות עכשיו

```bash
# 1. עדכן לגרסה האחרונה
npm update -g @anthropic-ai/claude-code

# 2. צור את תיקיית הhooks
mkdir -p .claude/hooks .claude/skills

# 3. צור את סקריפט בדיקת העדכונים
# (העתק את check-updates.sh מלמעלה)

# 4. הוסף ל-settings.json את ה-SessionStart hook

# 5. צור את ה-skills:
#    - /check-updates
#    - /whats-new

# 6. הגדר Telegram alerts (אופציונלי)

# 7. הגדר cron job לעדכון אוטומטי
crontab -e
# 0 3 * * * npm update -g @anthropic-ai/claude-code

# 8. הגדר n8n workflow לניטור (אופציונלי)
```

### גרסאות אחרונות ומה חדש (מרץ 2026)

| גרסה | תאריך | שינויים מרכזיים |
|-------|--------|-----------------|
| **2.1.76** | מרץ 17 | Output tokens limit 64K/128K, allowRead sandbox, /copy N |
| **2.1.75** | מרץ 13 | 1M context window (Opus 4.6), /color, session names |
| **2.1.74** | מרץ 12 | /effort command, effort in skill frontmatter, --channels |
| **2.1.73** | מרץ 11 | /plan description, effort simplification (low/medium/high) |
| **2.1.72** | מרץ 10 | Tool search fix, /copy write to file, cron disable |
| **2.1.71** | מרץ 7 | /loop command, voice mode improvements |
| **2.1.70** | מרץ 5 | Opus 4.6 default, ultrathink keyword |
| **2.1.63** | פב 28 | /simplify, /batch bundled commands, HTTP hooks |

---

> **עדכון אחרון:** מרץ 20, 2026 | Claude Code v2.1.76 | Opus 4.6
> 
> **מקורות:** Anthropic Official Docs, Claude Code Release Notes, GitHub Releases, Community Best Practices
> 
> **עדכון הבא:** הקובץ הזה מתעדכן אוטומטית — הפעל `/whats-new` או `/check-updates` לבדוק עדכונים
