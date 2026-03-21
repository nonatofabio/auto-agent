---
name: prompt-engineering
description: "Rules and frameworks for writing high-quality LLM system prompts. Use this skill when authoring, reviewing, or optimizing a system prompt. Covers the Curse of Instructions formula (Harada et al., 2024), EARS syntax for unambiguous rules, the five structural failure patterns, and the ARQ VERIFY scaffold for multi-instruction compliance."
metadata:
  author: IPD NearForm
  version: "1.0.0"
---

# Prompt Engineering Rules

Reference for writing and reviewing LLM system prompts.
Based on Harada et al. (2024) — [Curse of Instructions](https://openreview.net/forum?id=R6q67CDBCH), EARS syntax, and ARQ pattern.

---

## 1. Minimize the Rule Count (Curse of Instructions)

The probability of the model following **all** rules simultaneously is approximately **P = p^N**, where N is the number of independently verifiable instructions and p is the per-rule adherence rate.

| N rules | p = 0.95 | p = 0.90 |
|---------|----------|----------|
| 5       | 77%      | 59%      |
| 10      | 60%      | 35%      |
| 20      | 36%      | 12%      |
| 30      | 21%      | 4%       |

**Target: ≤ 10 distinct rules in the system prompt.**

- Move procedural/structural rules (e.g., parameter formatting, count constraints) into **tool descriptions**, not the system prompt.
- Merge rules that protect the same invariant into one EARS statement.
- Delete rules already enforced by the tool schema or the agent framework.

---

## 2. Write Rules in EARS Syntax

**Easy Approach to Requirements Syntax** — four forms, all unambiguous and testable.

| Form | Template | Use when |
|------|----------|----------|
| Ubiquitous | The system shall [action]. | Rule always applies |
| Event-driven | When [trigger], the system shall [action]. | Rule fires on a condition |
| State-driven | While [condition], the system shall [action]. | Rule applies during a state |
| Unwanted behavior | If [situation], the system shall [response]. | Error / boundary case |

**Before (free-form):** "NEVER output a URL that contains `{product_name}` as a literal string. Always make sure the product name is properly substituted before including any link."

**After (EARS):** "If a URL contains an unresolved template placeholder, the system shall omit the link and respond without it."

---

## 3. Five Failure Patterns to Detect

When reviewing a prompt, check for structural signals of each pattern:

| Pattern | What happens | Signal in the prompt |
|---------|-------------|----------------------|
| **Focus loss** | Model satisfies some constraints but silently drops others | Post-response self-check blocks; mandatory verification sections |
| **Context misinterpretation** | Query routed to wrong product or tool | Same routing rule restated in 3+ sections with slightly different wording |
| **Hallucination** | Model invents values for parameters it cannot resolve | Same constraint (e.g., "never output unresolved URLs") in both system prompt AND tool descriptions |
| **Business protocol bypass** | Access control, upsell, or boundary responses skipped | Multiple alternative response templates for the same situation (Option A / B / C) |
| **Instruction ignored** | Specific operational rules (count, format, single call) repeatedly violated | Rule exists only because the model kept breaking it — belongs in tool description, not system prompt |

---

## 4. ARQ Reasoning Scaffold (VERIFY Step)

**Attentive Reasoning Query pattern**: include a numbered `VERIFY` checklist as the last step of the workflow. Each item maps 1:1 to one EARS rule, forcing instruction-level chain-of-thought before output.

```
VERIFY before responding:
1. [EARS rule 1 — single sentence]
2. [EARS rule 2 — single sentence]
3. [EARS rule 3 — single sentence]
...
```

This makes multi-instruction compliance explicit and testable. Per Harada et al. (2024), instruction-level CoT improves all-rules compliance by 2–3× on GPT-4o and Claude 3.5 Sonnet.

Keep the VERIFY list ≤ 8 items. If you need more, consolidate rules first.

---

## 5. Other Structural Rules

- **One truth per rule.** If the same invariant is stated in two places, pick the most authoritative location and delete the duplicate.
- **Urgency markers devalue each other.** Use CRITICAL/MANDATORY for at most 2 rules per prompt. Everything else should be plain prose.
- **Static before dynamic.** Put the unchanging role/rules at the top. Inject dynamic context (product lists, user data) at the bottom. This enables prompt caching.
- **Examples cost tokens.** Include examples only for non-obvious rules. One positive + one negative example per rule is enough.
- **Patch-on-patch is a signal.** If you find rule → exception → exception-to-exception chains, consolidate. Organic growth via successive fixes is the most common source of rule-count bloat.