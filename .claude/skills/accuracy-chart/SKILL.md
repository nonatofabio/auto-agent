---
name: accuracy-chart
description: Generate an HTML accuracy chart for an auto-agent job. Use this skill whenever the user asks to create, generate, or build an accuracy chart, performance chart, or iteration visualization for a job folder. Also trigger when the user mentions charting agent accuracy, visualizing hypothesis iterations, or creating a report for a job run — even if they just say "make a chart for agent-3" or "generate the HTML for this job". The input is a job folder path (e.g., jobs/agent-1/).
---

# Accuracy Chart Generator

Generate a standalone HTML file with a line chart showing accuracy progression across iterations, plus a summary table, for an auto-agent job.

## Data Sources

All data lives inside the job folder. Read these files:

1. **`out.log.txt`** — Contains the iteration summary block near the end of the file. Look for the last occurrence of the pattern:
   ```
   Iteration Summary:
   #    Hypothesis     Decision     Accuracy     Duration
   ────────────────────────────────────────────────────────
   1    001-abc123     CONTINUE     33.3%        4m 25s
   ...
   Total time:      16m 18s
   Final branch:    agent-1-hyp-004-12f9ff
   ```
   Parse each row for: iteration number, hypothesis ID, decision, accuracy percentage, and duration. Also extract total time and final branch.

2. **`hypotheses/000-baseline/REPORT.md`** — Contains the baseline accuracy in a metrics table:
   ```
   | accuracy | 18.3% |
   ```
   Extract the accuracy value. This is the first data point on the chart (x=Baseline).

## How to Build the Chart

### Step 1: Collect data

- Read `out.log.txt` and find the **last** "Iteration Summary" block (the file may contain multiple job runs appended together).
- Read baseline accuracy from the REPORT.md metrics table.
- Build the data series: `[baseline, iter1, iter2, ..., iterN]` with accuracy percentages.

### Step 2: Compute SVG coordinates

The chart is a hand-crafted SVG (no external libraries). Use these parameters:

- **Chart area**: x from 72 to `72 + chartWidth`, y from 40 to 340 (300px tall)
- **chartWidth**: scale based on number of data points — `Math.max(528, (points - 1) * 63)` keeps spacing comfortable
- **SVG width**: chartArea right edge + 40px padding
- **X positions**: evenly spaced from left edge to right edge
- **Y mapping**: `y = 340 - (accuracy / 100) * 300`

For Y-axis grid lines, use 0%, 20%, 40%, 60%, 80%, 100% as labels.

### Step 3: Handle label placement

When consecutive data points have similar accuracy values (within ~8pp), alternate label positions above and below the dots to prevent overlap. Place the percentage label 10px above the dot by default; for alternating ones, place 22px below.

### Step 4: Generate the HTML

Use this exact visual style (matching the established design):

- **Font**: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- **Background**: `#fafafa` body, `#fff` card with `border-radius: 12px` and subtle shadow
- **Line color**: `#4f46e5` (indigo) with `stroke-width: 2.5`
- **Dots**: circles with `r=5`, same indigo fill
- **Area fill**: linear gradient from `#4f46e5` at 15% opacity to near-transparent
- **Grid lines**: `#e5e7eb`
- **Title**: "Accuracy Improvements in the Agent Performances" (capitalize)

Below the chart, add the **Iteration Summary** section:

- A styled HTML table with columns: #, Hypothesis, Decision, Accuracy, Duration
- Decision values displayed as green badge pills (`background: #ecfdf5`, `color: #059669`, rounded full)
- Below the table, a metadata row showing **Total time** (bold) and **Final branch** (monospace, indigo, light gray background pill)

### Step 5: Save the file

Write the HTML to `accuracy-chart.html` inside the job folder.

## Template Reference

Here is the complete HTML structure to follow. Adapt the data points, table rows, and metadata:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Accuracy Improvements</title>
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    display: flex; justify-content: center; align-items: center;
    min-height: 100vh; margin: 0; background: #fafafa;
  }
  .chart-container {
    background: #fff; border-radius: 12px;
    box-shadow: 0 2px 16px rgba(0,0,0,0.08);
    padding: 40px 48px 32px; max-width: 750px; width: 100%;
  }
  h1 { text-align: center; font-size: 20px; font-weight: 600; color: #1a1a2e; margin: 0 0 24px; text-transform: capitalize; }
  .summary { margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 24px; }
  .summary h2 { font-size: 16px; font-weight: 600; color: #1a1a2e; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  thead th { text-align: left; color: #6b7280; font-weight: 500; padding: 8px 12px; border-bottom: 2px solid #e5e7eb; }
  tbody td { padding: 8px 12px; color: #1a1a2e; border-bottom: 1px solid #f3f4f6; }
  tbody tr:last-child td { border-bottom: none; }
  .meta { margin-top: 20px; display: flex; gap: 32px; font-size: 14px; color: #6b7280; }
  .meta strong { color: #1a1a2e; }
  .badge { display: inline-block; background: #ecfdf5; color: #059669; font-size: 12px; font-weight: 500; padding: 2px 8px; border-radius: 9999px; }
  .badge-rollback { display: inline-block; background: #fef2f2; color: #dc2626; font-size: 12px; font-weight: 500; padding: 2px 8px; border-radius: 9999px; }
  .branch { font-family: 'SF Mono', SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace; font-size: 13px; background: #f3f4f6; padding: 2px 8px; border-radius: 4px; color: #4f46e5; }
  svg text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
</style>
</head>
<body>
<div class="chart-container">
  <h1>Accuracy Improvements in the Agent Performances</h1>
  <!-- SVG chart goes here -->
  <!-- Summary table goes here -->
</div>
</body>
</html>
```

## Important Details

- The SVG viewBox width must match the computed chart width plus padding — don't hardcode 640.
- X-axis labels below dots: "Baseline" for the first point, "#1", "#2", etc. for iterations. Use `font-size="11"` when there are 7+ data points, `font-size="12"` for fewer.
- For ROLLBACK decisions, do NOT include them in the chart line — only chart iterations whose decision is CONTINUE. If the last iteration summary includes ROLLBACK rows, skip them from the line/dots (they represent reverted work). However, still show them in the summary table with a red badge (`background: #fef2f2; color: #dc2626`) so the user sees the full history.
- The area fill polygon must close back down to the x-axis baseline (y=340) on both sides.
