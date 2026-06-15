# DotArc Agent — V4 Architecture (Revised)

**Status:** Design Revised | **Implementation:** After V3 Mainnet Launch
**Last Updated:** June 13, 2026
**Revised by:** Architecture review session — full stress-test and critique incorporated

---

## 1. Executive Summary

V4 replaces DotArc's prose-driven JSON generation with **native function calling** (OpenRouter tool_use). The LLM emits a structured plan of **Tasks and Steps**. The engine runs Tasks in parallel and Steps within each Task serially. No validator, no JSON repair, no prompt bloat.

**Key decisions locked:**

- **Tasks + Steps execution model** — Tasks run in parallel; Steps within a Task run serially and pass results forward
- **Individual tools** — no monolithic wrapper; each skill is a directly callable tool
- **Preconditions in code, per Task** — not in prompt; checked before each Task fires
- **Spend reservations** — funds are locked per Task before execution to prevent race conditions
- **Idempotency keys on all spend tools** — carried forward from V3; every Circle call is deduplicated
- **Memory owns identity + policies** — system prompt is lean but has minimum safety rails (~80 tokens)
- **Conversational fallback = no tool calls** — `chat_response` removed from tool catalog entirely
- **Router safe default = read-only tools** — unknown intent never gets spend tools
- **Vector DB router and Layer C memory are separate systems** — documented distinctly
- **Token budget based on measured schemas** — not estimates; run `measure-tokens` script before publishing cost claims

---

## 2. What Was Wrong With the Original V4 Spec

The original V4 doc had real architectural improvements over V3 — function calling over JSON prose is clearly right, preconditions in code over prompt prose is clearly right. But it had 14 issues ranging from race conditions to overclaimed features. This section records what was diagnosed and why.

| # | Problem | Severity | Root Cause |
|---|---|---|---|
| 1 | Serial-only execution blocked the entire plan on each RPC call | Fatal | Flat `tool_calls[]` array abandoned the Tasks+Steps model |
| 2 | Balance check and spend were not atomic — TOCTOU race condition | Fatal | No spend reservation between precondition check and execution |
| 3 | `chat_response` as a callable tool could mix with spend tools in one plan | Fatal | Conversation treated as an action instead of the absence of action |
| 4 | Layer B memory had no invalidation strategy after policy mutations | Fatal | No event trigger on policy create/cancel/modify |
| 5 | OpenRouter schema enforcement is not bulletproof — no defensive guard | Critical | Deleted all validation assuming API guarantees are absolute |
| 6 | Token budget math was 3–5x off — ignored history, tool results, real schema sizes | Critical | Estimated schema size instead of measuring it |
| 7 | Stored policy steps would silently break after tool schema changes | Critical | No schema versioning on `agent_policies` rows |
| 8 | Router fallback injected `ALL_TOOLS` on unrecognized intent | Critical | Safe default was undefined |
| 9 | No idempotency keys documented — double-spend on retry possible | Critical | Existed in V3 but undocumented and at risk of being dropped |
| 10 | 30-token system prompt had zero safety rails for a financial agent | Design | Token minimalism taken too far |
| 11 | Layer C (memwal) and Vector DB router conflated into one concept | Design | Two separate systems described as one |
| 12 | Swap → Send chaining always wrong without actual result passthrough | Design | `$prev` mechanism mentioned but not enforced |
| 13 | "Vector DB is built and tested" — it is not built | Integrity | Pitched as existing; listed as Build Priority #7 of 7 |
| 14 | "What Stays Unchanged" was misleading — call surfaces do change | Integrity | Interface changes not documented honestly |

---

## 3. Core Principles (Revised)

1. **The model plans; code enforces.** The LLM proposes Tasks and Steps. The backend validates, reserves funds, and executes.
2. **Tasks are parallel; Steps are serial.** A Task with one Step is a simple independent action. A Task with multiple Steps is a dependent chain. Tasks never share Steps.
3. **Memory is persistent; prompts are ephemeral.** Identity, policies, and habits live in Layer B. Recalled facts live in Layer C. These are different systems.
4. **Schema is law — but code guards the edge cases.** Function calling is reliable, not infallible. A thin adapter guard catches malformed tool calls without the bloat of V3's full validator.
5. **Safe default is read-only.** The router never gives the LLM spend tools unless it is confident of spend intent. Unrecognized queries default to conversational mode with read access only.
6. **Every spend is reserved before it is executed.** Funds are locked in a reservation row before any Task fires. Parallel Tasks cannot race each other.
7. **Every Circle call carries an idempotency key.** Network retries never cause double spends.
8. **Conversation is the absence of tool calls.** When the LLM returns no tools, the adapter treats the text response as a conversational reply. `chat_response` does not exist as a tool.
9. **Measure, don't estimate.** Token budgets and cost claims are derived from the `measure-tokens` script against real schemas, not back-of-napkin math.
10. **Scale is designed in, not built yet.** The Vector DB tool router is architected and roadmapped. It is not built. The rule-based router handles current scale (14 tools) and will until schemas exceed ~800 tokens.

---

## 4. Execution Model — Tasks and Steps

This is the core architectural decision. It was used in a previous version and is being restored because it is the right model.

### 4.1 The Structure

```
Plan
├── Task A  [Step 1]                     ← independent, single action
├── Task B  [Step 1]                     ← independent, single action
└── Task C  [Step 1 → Step 2 → Step 3]  ← compound, dependent chain
```

- **Tasks run in parallel** using `Promise.all`
- **Steps within a Task run serially** — each step receives the actual output of the previous step
- A Task with one Step is simply an independent action
- A Task with multiple Steps is a dependent chain where ordering and result passthrough matter

This model maps exactly to how users think about compound requests:

| User Says | Plan Shape |
|---|---|
| "Send 10 USDC to Sara" | 1 Task, 1 Step |
| "Send 10 to Sara and 5 to John" | 2 Tasks, 1 Step each — run in parallel |
| "Swap USDC to EURC then send it to Sara" | 1 Task, 2 Steps — serial, Step 2 uses Step 1 output |
| "Send 10 to Sara AND swap then send to John" | 2 Tasks in parallel: Task 1 has 1 Step, Task 2 has 2 Steps |
| "Check my balance and list my policies" | 1 Task, 2 Steps — or 2 Tasks, 1 Step each; both valid |

### 4.2 What the LLM Emits

The LLM no longer emits a flat `tool_calls[]` array. It emits a structured plan object:

```typescript
{
  "tasks": [
    {
      "id": "task_1",
      "description": "Send to Sara",
      "steps": [
        { "tool": "send_usdc", "params": { "to": "sara.arc", "amount": 10 } }
      ]
    },
    {
      "id": "task_2",
      "description": "Swap then send to John",
      "steps": [
        { "tool": "swap_usdc", "params": { "tokenIn": "USDC", "tokenOut": "EURC", "amount": 15 } },
        { "tool": "send_token", "params": { "token": "EURC", "to": "john.arc", "amount": "$prev.amountOut" } }
      ]
    }
  ]
}
```

The LLM decides what is a Task boundary. Steps within a Task are dependent by definition. Tasks are independent by definition. The engine respects this grouping — it never reorders Tasks or Steps.

### 4.3 `$prev` Result Passthrough

Steps within a Task use `$prev.<field>` to reference the actual output of the previous step. The engine resolves these references at runtime before executing each step — not at plan time.

```typescript
// Step 1 runs: swap_usdc → returns { amountOut: 9.79, token: "EURC" }
// Step 2 params before resolution: { token: "EURC", to: "john.arc", amount: "$prev.amountOut" }
// Step 2 params after resolution:  { token: "EURC", to: "john.arc", amount: 9.79 }
// Step 2 executes with the real swap output, not a pre-filled estimate
```

This replaces the old `$prev` string hack. The difference: `$prev` is now a first-class engine feature with typed resolution, not a string convention the model had to be taught in the prompt.

### 4.4 Conversational Fallback

If the LLM returns no tasks — either an empty plan or plain text with no tool calls — the adapter treats it as a conversational response and returns the text content directly to the user. No `chat_response` tool exists. The absence of tool calls IS the conversational signal.

```typescript
// adapter.ts
const plan = parsePlan(llmResponse);

if (!plan.tasks || plan.tasks.length === 0) {
  return { type: 'chat', text: llmResponse.choices[0].message.content };
}

return { type: 'plan', tasks: plan.tasks };
```

---

## 5. Execution Engine

### 5.1 Full Flow

```
User Message
     |
     v
[INTENT ROUTER]
  Keyword match → select tool subset
  No match → READ_ONLY_TOOLS only (never ALL_TOOLS)
     |
     v
[LAYER B MEMORY INJECTION]
  Identity + active policy summary + user habits
  ~100–150 tokens, always injected
     |
     v
[LAYER C MEMORY RETRIEVAL]
  Embed user message → cosine similarity against memwal store
  Score > 0.82 → inject matched facts (~50–100 tokens)
  No match → inject nothing
     |
     v
[LLM — ONE CALL]
  System prompt: ~80 tokens (lean + minimum safety rails)
  Tool schemas: routed subset only
  Returns: { tasks: [ { steps: [] } ] } or plain text
     |
     v
[ADAPTER]
  Parse plan → validate tool names + required params (thin guard)
  No tasks → return conversational reply
  Has tasks → build execution queue
     |
     v
[SPEND RESERVATION]
  For each Task with spend steps: lock estimated amount in spend_reservations
  All reservations must succeed before any Task fires
  Reservation TTL: 5 minutes (auto-expires if engine crashes)
     |
     v
[PRECONDITIONS — per Task]
  Check balance minus active reservations
  Check spend limits
  Check policy conflicts
  Fail → release reservation, return structured StepFailure to LLM for user message
  Pass → proceed
     |
     v
[EXECUTION ENGINE — Tasks parallel, Steps serial]
  Promise.all(tasks.map(executeTask))
  Each Task: for each step → resolve $prev refs → skillRegistry[tool](params)
  Each spend step: attach idempotency key before Circle call
     |
     v
[RESULT AGGREGATION]
  Collect per-Task results
  Build structured outcome: { taskId, status, result | failure }[]
  Pass to LLM for natural language summary → return to user
```

### 5.2 Execution Engine Code

```typescript
// lib/execution-engine.ts

async function executePlan(plan: Plan, ctx: SkillContext): Promise<PlanResult> {
  // Reserve funds for all spend tasks before any execution starts
  const reservations = await reserveSpend(plan.tasks, ctx);
  if (!reservations.ok) {
    return { status: 'failed', reason: reservations.reason };
  }

  // Run all tasks in parallel
  const results = await Promise.all(
    plan.tasks.map(task => executeTask(task, ctx))
  );

  // Release all reservations (success or failure)
  await releaseReservations(reservations.ids);

  return { status: 'complete', tasks: results };
}

async function executeTask(task: Task, ctx: SkillContext): Promise<TaskResult> {
  // Per-task precondition check
  const pre = await checkPreconditions(task, ctx);
  if (!pre.ok) {
    return { taskId: task.id, status: 'failed', reason: pre.reason, completedSteps: [] };
  }

  let prevResult: any = null;
  const completedSteps: number[] = [];

  for (let i = 0; i < task.steps.length; i++) {
    const step = task.steps[i];

    // Resolve $prev references using actual previous step output
    const resolvedParams = resolvePrev(step.params, prevResult);

    // Attach idempotency key to all spend tools
    const callCtx = {
      ...ctx,
      idempotencyKey: `${ctx.planId}-${task.id}-step-${i}`
    };

    try {
      prevResult = await skillRegistry[step.tool](resolvedParams, callCtx);
      completedSteps.push(i);
    } catch (err) {
      return {
        taskId: task.id,
        status: 'failed',
        failedStep: i,
        tool: step.tool,
        reason: err.message,
        completedSteps
      };
    }
  }

  return { taskId: task.id, status: 'success', result: prevResult, completedSteps };
}
```

### 5.3 Structured Failure Object

When a Task fails at any step, the engine returns a typed `TaskFailure` — not a generic error string. This object is passed back to the LLM so it can give the user a precise, helpful explanation.

```typescript
type TaskFailure = {
  taskId: string;
  status: 'failed';
  failedStep: number;       // which step index failed
  tool: string;             // which tool was being called
  reason: string;           // human-readable: "Insufficient balance: need $10.50, have $8.20"
  completedSteps: number[]; // steps that already ran successfully before the failure
}

// Example: Task had 3 steps. Step 0 and 1 completed. Step 2 failed.
// LLM receives this and tells user:
// "The swap completed successfully and sent to your wallet,
//  but the send to Sara failed — you had $8.20 available, needed $10.50."
```

---

## 6. Spend Reservation System

Prevents race conditions between parallel Tasks, concurrent user requests, and cron job executions.

```typescript
// lib/spend-reservations.ts

// Before any Task executes: lock its estimated spend
async function reserveSpend(tasks: Task[], ctx: SkillContext) {
  const spendTasks = tasks.filter(t => hasSpendStep(t));

  for (const task of spendTasks) {
    const estimated = estimateTaskSpend(task);

    // Check available balance minus existing reservations
    const reserved = await getTotalActiveReservations(ctx.walletId);
    const balance = await getAgentBalance(ctx.walletId);
    const available = balance - reserved;

    if (available < estimated) {
      return {
        ok: false,
        reason: `Not enough balance. Need $${estimated}, available $${available} (after other pending actions).`
      };
    }

    await db.query(`
      INSERT INTO spend_reservations (wallet_id, amount_usdc, plan_id, task_id, expires_at)
      VALUES ($1, $2, $3, $4, now() + interval '5 minutes')
    `, [ctx.walletId, estimated, ctx.planId, task.id]);
  }

  return { ok: true, ids: spendTasks.map(t => t.id) };
}

// spend_reservations table
// wallet_id | amount_usdc | plan_id | task_id | expires_at (5min TTL)
// Auto-expires if engine crashes — funds never permanently locked
```

---

## 7. Idempotency Keys

Carried forward from V3. Every Circle API call receives a unique idempotency key derived from the plan, task, and step index. If a network timeout causes a retry, Circle deduplicates and the money moves exactly once.

```typescript
// Built into the execution engine — not optional per skill
const callCtx = {
  ...ctx,
  idempotencyKey: `${ctx.planId}-${task.id}-step-${i}`
};

// Inside any spend skill:
await circleClient.createTransfer({
  idempotencyKey: callCtx.idempotencyKey,  // ← always present
  source: { type: 'wallet', id: ctx.walletId },
  destination: { type: 'blockchain', address: resolvedParams.to, chain: 'ARC' },
  amount: { amount: String(resolvedParams.amount), currency: 'USD' }
});
```

The key is structured as `planId-taskId-stepIndex`. Same plan + same task + same step always generates the same key. Retries are safe by construction.

---

## 8. Preconditions (Code Layer, Per Task)

Preconditions run **per Task**, not once for the whole plan. This is because parallel Tasks have independent fund requirements and independent failure modes.

```typescript
// lib/preconditions.ts

async function checkPreconditions(
  task: Task,
  ctx: SkillContext
): Promise<{ ok: true } | { ok: false; reason: string }> {

  for (const step of task.steps) {
    if (!isSpendingTool(step.tool)) continue;

    // Balance check uses reserved-adjusted available balance
    const reserved = await getTotalActiveReservations(ctx.walletId);
    const balance = await getAgentBalance(ctx.walletId);
    const available = balance - reserved;
    const needed = estimateStepAmount(step);
    const gasBuffer = step.params.amount === 'all' ? 0.1 : 0;

    if (available < needed + gasBuffer) {
      return {
        ok: false,
        reason: `Insufficient balance for ${step.tool}. Need $${needed + gasBuffer}, available $${available}.`
      };
    }

    // Spend limit check
    const limitCheck = await checkSpendLimit(step, ctx);
    if (!limitCheck.ok) return limitCheck;

    // Policy conflict check
    const conflictCheck = await checkPolicyConflict(step, ctx);
    if (!conflictCheck.ok) return conflictCheck;
  }

  return { ok: true };
}
```

Note: For compound Tasks where Step 2 uses `$prev.amountOut` from Step 1 (e.g. swap → send), the precondition for Step 2 runs against the estimated swap output, not the actual. The actual is validated at execution time — if the real output is insufficient, the step returns a clean `TaskFailure`.

---

## 9. Adapter — Thin Defensive Guard

The adapter converts the LLM's plan object into the execution queue and runs a lightweight sanity check. This is not V3's full validator — it is a 20-line guard that catches edge cases without assuming the API always returns perfect output.

```typescript
// app/api/agent/interpret/route.ts

function validateAndParsePlan(llmResponse: LLMResponse): ParseResult {
  const msg = llmResponse.choices[0].message;

  // No tool calls → conversational reply
  if (!msg.tool_calls || msg.tool_calls.length === 0) {
    return { type: 'chat', text: msg.content };
  }

  const plan = JSON.parse(msg.tool_calls[0].function.arguments);

  // Thin guard: validate each step in each task
  for (const task of plan.tasks) {
    for (const step of task.steps) {
      if (!skillRegistry[step.tool]) {
        // Log for monitoring, return user-friendly error
        logger.warn('Unknown tool in plan', { tool: step.tool, planId: plan.id });
        return {
          type: 'error',
          reason: `I wasn't able to understand one of the actions needed. Please try rephrasing.`
        };
      }

      const schema = toolSchemas[step.tool];
      for (const required of schema.required ?? []) {
        if (step.params[required] == null) {
          return {
            type: 'error',
            reason: `Missing information for ${step.tool}: ${required} is required.`
          };
        }
      }
    }
  }

  return { type: 'plan', tasks: plan.tasks };
}
```

All validation failures are logged with the raw LLM output. After two weeks of production traffic, review the logs and adjust how much validation is actually needed based on real failure rates.

---

## 10. Intent Router

The router's job is to gatekeep spend tools — not to classify every message. Unrecognized intent defaults to read-only tools and the LLM handles it conversationally.

```typescript
// lib/intent-router.ts

const READ_TOOLS   = ['check_balance', 'list_policies', 'get_wallet_state', 'iknow'];
const SPEND_TOOLS  = ['send_usdc', 'send_token', 'swap_usdc', 'bridge_usdc', 'withdraw', 'pay_x402'];
const CONFIG_TOOLS = ['create_policy', 'cancel_policy', 'set_limit'];

const SPEND_SIGNALS  = /send|pay|transfer|move|swap|bridge|convert|buy|withdraw/;
const CONFIG_SIGNALS = /policy|schedule|every|recurring|remind|limit|cancel|set/;

export function routeTools(message: string): string[] {
  const m = message.toLowerCase();

  if (SPEND_SIGNALS.test(m))  return [...SPEND_TOOLS,  ...READ_TOOLS];
  if (CONFIG_SIGNALS.test(m)) return [...CONFIG_TOOLS, ...READ_TOOLS];

  // Safe default: read-only + conversational
  // LLM will respond with text if no tool is needed
  // LLM will call a read tool if needed (check_balance etc.)
  // LLM will NEVER call a spend tool on an unrecognized query
  return READ_TOOLS;
}
```

`ALL_TOOLS` is never a fallback. If the router is uncertain, the worst outcome is the user gets a helpful conversational reply and no money moves. That is the correct failure mode.

The Vector DB tool router — where tool descriptions are embedded and retrieved by semantic similarity — is the planned upgrade for when the tool catalog exceeds ~30 tools and schema tokens exceed ~800. It is not built. It is designed and roadmapped.

---

## 11. System Prompt

Lean but not reckless. 80 tokens is the right floor for a financial agent.

```typescript
const SYSTEM_PROMPT = `You are the DotArc wallet agent. Help users manage their USDC wallet using tools.

Rules:
- Never spend more than the user explicitly stated
- If the amount or recipient is unclear, respond with text only — ask for clarification, do not call spend tools
- For single amounts above $100, confirm before executing
- If no action is needed, respond with text only — do not force a tool call
- Always explain what you did or why you couldn't do it`;
```

The `$100` confirmation threshold is user-configurable — stored in Layer B and injected as part of the user's behavioral memory. Different users have different risk tolerances.

---

## 12. Memory Architecture

Three distinct systems. Not interchangeable. Not the same.

| Layer | System | Technology | What It Stores | When Injected |
|---|---|---|---|---|
| Layer B | Live state memory | Supabase | Identity, active policy summary, user habits, spend limits, confirmation threshold | Every prompt — always |
| Layer C | Episodic agent memory | Walrus / memwal | Summarized past sessions, facts the user explicitly taught the agent ("remember that Sara is my sister") | On semantic match — cosine similarity > 0.82 against embedded user message |
| Router | Tool selector | Vector DB (future) | Tool descriptions for semantic retrieval | At routing time — selects which tools to give the LLM |

Layer B and Layer C are agent memory. The Vector DB router is not memory — it is a tool selector. They serve completely different purposes and live in completely different code paths.

### 12.1 Layer B — Always Injected

```typescript
// Injected every LLM call, ~100–150 tokens
const layerB = await getUserMemory(userId);

// Contents:
// - "I am the DotArc agent for [name]"
// - Active policies: "Weekly send of $5 to Sara every Saturday. Active."
// - Habits: "User typically sends in the $5–$20 range."
// - Limits: "Spend limit: $200/day. Confirmation required above $100."
```

### 12.2 Layer B Invalidation

Every function that mutates policy state must call `invalidateUserMemory(userId)` immediately after. This rebuilds the policy summary from the `agent_policies` table and writes it back to Layer B.

```typescript
// lib/memory-sync.ts
export async function invalidateUserMemory(userId: string) {
  const policies = await db.query(
    `SELECT * FROM agent_policies WHERE user_id = $1 AND status = 'active'`,
    [userId]
  );
  const summary = buildPolicySummary(policies.rows);

  await db.query(`
    UPDATE user_memory
    SET policy_summary = $1, version = version + 1, updated_at = now()
    WHERE user_id = $2
  `, [summary, userId]);
}

// Call this in:
// - createPolicy()      → invalidateUserMemory(userId)
// - cancelPolicy()      → invalidateUserMemory(userId)
// - cron post-execution → invalidateUserMemory(userId)
// - setLimit()          → invalidateUserMemory(userId)
```

If `updated_at` is more than 10 minutes old when an LLM call fires, append a small warning to the injection: `"(Policy summary may be stale — use list_policies to confirm current state.)"` This costs ~15 tokens and prevents the agent from confidently describing cancelled policies.

### 12.3 Layer C — Episodic Memory (memwal)

```typescript
// lib/memory-layer-c.ts
export async function retrieveEpisodicMemory(
  userMessage: string,
  userId: string
): Promise<string | null> {
  const embedding = await embed(userMessage);

  // memwal / Walrus storage with similarity search
  const results = await memwal.query({
    userId,
    embedding,
    threshold: 0.82,
    limit: 3
  });

  if (!results.length) return null;

  // Returns injected text like:
  // "User has mentioned: Sara is their sister (0xabc...). John owes them money."
  return results.map(r => r.content).join('\n');
}
```

Users can explicitly teach the agent: "Remember that Sara is my sister" or "Forget about the transfer limit I set last week." These are stored as summarized facts in memwal. They are recalled when semantically relevant.

---

## 13. Token Budget (Measured, Not Estimated)

Run the `measure-tokens` script against real schemas before publishing any cost claims.

```typescript
// scripts/measure-tokens.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();
const response = await client.messages.countTokens({
  model: 'claude-sonnet-4-6',
  system: SYSTEM_PROMPT + LAYER_B_SAMPLE,
  tools: ROUTED_TOOL_SCHEMAS,  // use a realistic routed subset, not all 14
  messages: SAMPLE_3_TURN_CONVERSATION
});

console.log('Measured input tokens:', response.input_tokens);
// Use this number in your deck and docs — not an estimate
```

Realistic per-call budget (to be confirmed by measurement):

| Component | V3 | V4 Estimate | Notes |
|---|---|---|---|
| System prompt | 400 | 80 | Lean but safe |
| Tool schemas (routed subset) | 800 | 400–600 | Depends on intent; router reduces this |
| Layer B memory | 500 | 100–150 | Structured, not prose |
| Layer C memory | 0 | 0–100 | Only on match |
| Conversation history (3-turn avg) | 200 | 200 | Unchanged |
| Tool results injected (multi-step) | 0 | 100–200 | Real cost V4 didn't account for |
| User message | 50 | 50 | Unchanged |
| **Total** | **~2,870** | **~930–1,380** | **~55–67% reduction — still significant** |

The original "83% reduction" and "~500 tokens" claims were based on an incomplete accounting. The real reduction is still substantial and worth pitching — just use the measured number.

---

## 14. Tool Catalog

`chat_response` is removed. Conversation is the absence of tool calls.

| Tool | Type | Purpose |
|---|---|---|
| `send_usdc` | Spend | Send USDC to address or .arc name |
| `send_token` | Spend | Send EURC / cirBTC |
| `swap_usdc` | Spend | Swap tokens via DEX |
| `bridge_usdc` | Spend | Bridge via CCTP |
| `withdraw` | Spend | Move funds to main wallet |
| `pay_x402` | Spend | Pay x402 API endpoint |
| `estimate_swap` | Read | Get expected output before swap (use in compound plans) |
| `check_balance` | Read | Query current balances |
| `get_wallet_state` | Read | Balances + limits + live prices (on-demand) |
| `list_policies` | Read | Show active policies |
| `iknow` | Read | Prediction market queries |
| `set_limit` | Config | Update spend limits |
| `cancel_policy` | Config | Cancel a recurring or conditional policy |
| `create_policy` | Store | Persist recurring/conditional task to `agent_policies` |

`estimate_swap` is new. The LLM uses it before building a swap → send compound Task to get an expected output amount. This makes the plan more accurate before execution and reduces the delta between `$prev.amountOut` and the pre-filled estimate.

---

## 15. Recurring and Conditional Policies

`create_policy` works the same as V3. The `steps` inside it are stored data, not live tool calls. They are executed later by the cron using the same serial engine — but with schema version tracking.

```typescript
// "every Saturday send 5 USDC to sara"
{
  tasks: [{
    id: "task_1",
    description: "Create weekly send policy",
    steps: [{
      tool: "create_policy",
      params: {
        description: "Weekly Saturday send to Sara",
        trigger: { type: "time", schedule: "weekly", dayOfWeek: 6 },
        executionMode: "repeat",
        steps: [
          { tool: "send_usdc", params: { to: "sara.arc", amount: 5 } }
        ],
        stopConditions: [{ type: "balance_below", thresholdUsdc: 5 }]
      }
    }]
  }]
}
```

### Schema Version Tracking

Every stored policy row includes a `schema_version` integer. When a tool param is renamed or restructured, a migration entry is written before the change ships. The cron job migrates steps to the current schema version before executing.

```typescript
// agent_policies table: add schema_version column (migration)
// ALTER TABLE agent_policies ADD COLUMN schema_version integer DEFAULT 1;

// lib/schema-migrations.ts
const CURRENT_VERSION = 1;

const migrations: Record<number, (step: PolicyStep) => PolicyStep> = {
  // Example: v1 → v2 if we ever rename "recipient" to "to"
  // 1: (step) => step.tool === 'send_usdc'
  //      ? { ...step, params: { ...step.params, to: step.params.recipient } }
  //      : step
};

export function migrateStep(step: PolicyStep, fromVersion: number): PolicyStep {
  let s = step;
  for (let v = fromVersion; v < CURRENT_VERSION; v++) {
    s = migrations[v]?.(s) ?? s;
  }
  return s;
}
```

**Rule:** Never rename or remove a tool parameter without first writing a migration entry. Treat stored policy steps the same as database rows — schema changes require migrations.

---

## 16. Migration Delta (V3 → V4)

Replaces the "What Stays Unchanged" section from the original spec. Honest accounting of what actually changes at each interface boundary.

| Module | V3 | V4 | Change Level |
|---|---|---|---|
| `skillRegistry` | `{ skill, params }` | `{ tool, params, callCtx }` — gains `idempotencyKey` and `planId` in context | Minor |
| `executePlan` | Serial `Task[]` with `$prev` strings | Parallel `Task[]` with typed `$prev` resolution in engine | Medium |
| `confirm-policy` route | Receives parsed JSON from validator | Receives `plan.tasks[]` from adapter | Major — replace |
| `preconditions.ts` | Runs once on full plan | Runs per Task before that Task executes | Medium |
| `spend_reservations` | Did not exist | New table + reservation lifecycle | New |
| `agent_policies` | No `schema_version` column | + `schema_version integer DEFAULT 1` | DB migration |
| Intent router | `routeSkills()` → 4 keywords, `ALL_TOOLS` fallback | `routeTools()` → expanded signals, `READ_TOOLS` fallback | Rewrite |
| LLM response format | Flat `tool_calls[]` array | `{ tasks: [{ steps: [] }] }` plan object | Major — new schema |
| Adapter | Maps `tool_calls[]` to queue | Parses `tasks[]`, validates, routes to engine | Rewrite |
| Cron job | Loads stored steps, runs serially | Loads steps, migrates schema version, runs serially | Minor |
| Memory Layer B | Injected but no invalidation trigger | Invalidated on every policy mutation | Medium |
| Memory Layer C | Described as "keyword match" | Semantic embedding + cosine similarity threshold | Clarification + implementation |

---

## 17. New and Modified Files in V4

| File | Status | Purpose |
|---|---|---|
| `lib/agent-core-v4.ts` | New | Tool definitions, LLM API call, response parser, plan schema |
| `lib/execution-engine.ts` | Rewrite | Tasks in parallel, Steps serial, `$prev` resolution, result aggregation |
| `lib/preconditions.ts` | New | Per-Task precondition checks — balance (minus reservations), limits, conflicts |
| `lib/spend-reservations.ts` | New | Reservation insert, release, TTL management |
| `lib/memory-sync.ts` | New | `invalidateUserMemory()` — called on all policy mutations |
| `lib/memory-layer-c.ts` | New | memwal semantic retrieval — embed + threshold query |
| `lib/intent-router.ts` | Rewrite | Expanded signals, `READ_TOOLS` safe default, no `ALL_TOOLS` fallback |
| `lib/schema-migrations.ts` | New | Policy step migration chain for schema version upgrades |
| `app/api/agent/interpret/route.ts` | Rewrite | Adapter: parse plan → thin guard → execution queue |
| `scripts/measure-tokens.ts` | New | Token counting script — run before publishing any cost claims |
| `lib/vector-skill-router.ts` | Planned (not built) | Semantic tool retrieval for 30+ tool catalog |

---

## 18. Build Priority

| # | What | Effort | Why Now |
|---|---|---|---|
| 1 | Idempotency keys in all spend skills | 1 hour | P0 — prevents double spend on retry. Was in V3, must not be dropped. |
| 2 | Tasks + Steps execution model + `$prev` resolution | 2 days | Core architecture — everything else depends on this |
| 3 | Spend reservation system | 4 hours | Required for safe parallel Task execution |
| 4 | `chat_response` removal + conversational adapter | 1 hour | Simplifies the tool catalog, eliminates mixed-mode plans |
| 5 | Intent router rewrite — expanded signals + safe default | 2 hours | Stops spend tools appearing on unrecognized queries |
| 6 | System prompt — add minimum safety rails | 30 min | 80 tokens of guardrails for a financial agent is non-negotiable |
| 7 | Layer B invalidation — `invalidateUserMemory()` | 3 hours | Prevents stale policy descriptions after mutations |
| 8 | Per-Task preconditions | 3 hours | Replaces plan-level check with accurate per-Task checks |
| 9 | Thin adapter guard | 2 hours | Catches malformed tool names/params without V3-level bloat |
| 10 | `schema_version` column + migration framework | 1 day | Must exist before any schema changes ship to mainnet |
| 11 | `estimate_swap` tool | 3 hours | Makes compound swap→send plans more accurate |
| 12 | `measure-tokens` script | 1 hour | Required before any cost claims go into a pitch deck |
| 13 | Layer C memwal retrieval (semantic) | 1 day | Correct the keyword-match misconception with real embedding retrieval |
| 14 | Vector DB tool router | 1–2 weeks | Build when tool catalog approaches 30 tools — not now |

---

## 19. What Is Removed in V4

| What | Why | Saved |
|---|---|---|
| `validateInterpretResult` + `validateTrigger` + `validateStep` | Replaced by thin adapter guard | ~150 lines |
| `tryRepairJson` | API-enforced schemas make this unnecessary | ~80 lines |
| `chat_response` tool | Conversation = absence of tool calls | 1 tool definition |
| `ALL_TOOLS` router fallback | Replaced by `READ_TOOLS` safe default | Risk, not code |
| SMART BALANCE INFERENCE prompt section | Replaced by code preconditions | ~80 tokens |
| Worked examples in prompt | Function calling makes these unnecessary | ~300 tokens |
| Trigger vocabulary prose | Enum schemas in tool definitions handle this | ~80 tokens |
| Precondition prose per skill | Moved entirely to `preconditions.ts` | ~60 tokens |
| Flat `tool_calls[]` as the plan format | Replaced by `{ tasks: [{ steps: [] }] }` | Architectural |

---

## 20. Open Questions (Remaining)

**1. Task count limit**

The LLM should be guided toward producing one or two Tasks for most requests. A soft note in the system prompt — "most requests need one or two tasks" — is sufficient. A hard cap of five Tasks is enforced in the adapter as a safety net. This was discussed: the V3 three-Task limit was fine; the issue was not enforcing it at the code layer.

**2. Multi-turn `get_wallet_state`**

If the model calls `get_wallet_state` before planning a spend, that is one additional LLM call. Mitigation: inject `get_wallet_state` only for spend-intent routes. For pure read queries, skip it and let `check_balance` handle it directly. Still open — measure in practice.

**3. Guardrails post-stress-test**

Additional behavioral guardrails (confirmation flows, suspicious pattern detection, unusual recipient alerts) will be added after a structured stress test of the V4 execution model. The stress test suite covers all 14 skills. Guardrails are additive — they do not require architectural changes.

**4. Parallel Task failure UX**

If Task A succeeds and Task B fails in a parallel execution, the user needs a clear explanation of what completed and what didn't. The structured `TaskFailure` object handles this at the data layer. The LLM should be prompted to always summarize both outcomes — "X was completed, Y failed because Z." A test case for this scenario should be in the stress test suite.

---

## 21. What Does Not Change

- `skillRegistry` function signatures (gains `callCtx`, but existing handlers are backward compatible)
- `agent_policies` table structure (gains one column: `schema_version`)
- Trigger types: `now`, `time`, `price`, `balance_above`, `and` — unchanged
- `IKNOW` skill — unchanged
- Circle SDK integration — unchanged (idempotency keys are additive)
- Supabase auth, Vercel deployment, cron-job.org scheduler — unchanged
- `.arc` name resolution in params — unchanged

---

*V3 mainnet first. Then build V4 in priority order above.*
*Architecture revised June 13, 2026. Incorporates full review session findings.*
