#!/usr/bin/env python3
"""Validate all experiment results and produce a reference sheet."""
import json
import re
import os
import sys

RESULTS_DIR = os.path.dirname(os.path.abspath(__file__)) + "/experiment-results-full"

EXPERIMENTS = [
    ("haiku-4.5-auto", "Haiku 4.5", "auto"),
    ("sonnet-4-auto", "Sonnet 4", "auto"),
    ("sonnet-4.5-auto", "Sonnet 4.5", "auto"),
    ("sonnet-4.6-auto", "Sonnet 4.6", "auto"),
    ("opus-4.6-auto", "Opus 4.6", "auto"),
    ("haiku-4.5-opus", "Haiku 4.5", "Opus 4.6"),
    ("sonnet-4.6-opus", "Sonnet 4.6", "Opus 4.6"),
]

def load_baseline(name):
    path = os.path.join(RESULTS_DIR, f"baseline-{name}.json")
    if not os.path.exists(path):
        return None
    d = json.load(open(path))
    cases = d["cases"]
    return {
        "accuracy": d["summary"]["accuracy"],
        "passed": d["summary"]["passed_cases"],
        "total": d["summary"]["total_cases"],
        "real_work": sum(1 for c in cases if c["passes"] > 1),
        "vacuous_only": sum(1 for c in cases if not c["success"] and c["passes"] == 1),
        "zero_pass": sum(1 for c in cases if c["passes"] == 0),
    }

def parse_iterations(name):
    path = os.path.join(RESULTS_DIR, f"optimization-{name}.log")
    if not os.path.exists(path):
        return []
    content = open(path).read()
    # Remove ANSI codes
    content_clean = re.sub(r'\x1B\[[0-9;]*m', '', content)
    # Find iteration summary lines: "  1    001-xxx     CONTINUE     27.78%       23m 6s"
    pattern = r'^\s+(\d)\s+([\w-]+)\s+(CONTINUE|ROLLBACK)\s+([\d.]+%)\s+(.+)$'
    iters = []
    for m in re.finditer(pattern, content_clean, re.MULTILINE):
        iters.append({
            "num": int(m.group(1)),
            "hyp_id": m.group(2),
            "decision": m.group(3),
            "accuracy": m.group(4),
            "duration": m.group(5).strip(),
        })
    # Cross-check: find passed_cases from raw eval JSON in log
    raw_passed = re.findall(r'"passed_cases":\s*(\d+)', content)
    return iters, [int(x) for x in raw_passed]

def validate_experiment(name, model, orchestrator):
    errors = []
    warnings = []

    # Validate baseline
    bl = load_baseline(name)
    if bl is None:
        errors.append("Missing baseline JSON")
        return errors, warnings, None, None

    if bl["total"] != 90:
        errors.append(f"Baseline has {bl['total']} tasks, expected 90")

    if bl["real_work"] < 10:
        warnings.append(f"Only {bl['real_work']} cases show real LLM work (multi-pass)")

    if bl["real_work"] == 0 and bl["passed"] == 0:
        errors.append("No evidence of real LLM calls in baseline")

    # Validate iterations
    result = parse_iterations(name)
    if result is None:
        errors.append("Missing optimization log")
        return errors, warnings, bl, None

    iters, raw_passed = result

    if len(iters) == 0:
        errors.append("No iteration results found in log")
        return errors, warnings, bl, None

    # Cross-check: iteration accuracy vs raw passed_cases
    for it in iters:
        acc_pct = float(it["accuracy"].rstrip("%"))
        expected_passed = round(acc_pct * 90 / 100)
        if expected_passed in raw_passed:
            it["verified"] = True
        else:
            it["verified"] = False
            warnings.append(f"Iter {it['num']}: {it['accuracy']} ({expected_passed}/90) not found in raw passed_cases {raw_passed}")

    return errors, warnings, bl, iters

def main():
    print("=" * 80)
    print("EXPERIMENT VALIDATION REPORT")
    print("=" * 80)
    print()

    all_valid = True
    results_table = []

    for name, model, orch in EXPERIMENTS:
        print(f"--- {name} (target={model}, orchestrator={orch}) ---")
        errors, warnings, bl, iters = validate_experiment(name, model, orch)

        if errors:
            all_valid = False
            for e in errors:
                print(f"  ERROR: {e}")
        for w in warnings:
            print(f"  WARN:  {w}")

        if bl:
            print(f"  Baseline: {bl['passed']}/{bl['total']} ({bl['accuracy']*100:.1f}%) real_work={bl['real_work']}")

        if iters:
            final_acc = None
            for it in iters:
                v = "✓" if it.get("verified") else "?"
                print(f"  Iter {it['num']}: {it['accuracy']} ({it['decision']}) [{v}] {it['duration']}")
                if it["decision"] == "CONTINUE":
                    final_acc = it["accuracy"]
            print(f"  Final: {final_acc}")
            results_table.append((name, model, orch, bl, iters, final_acc))
        print()

    # Summary table
    print("=" * 80)
    print("SUMMARY TABLE")
    print("=" * 80)
    print()
    print(f"{'Experiment':<22} {'Target':<12} {'Orch':<10} {'Base':>6} {'Iter1':>8} {'Iter2':>8} {'Iter3':>8} {'Final':>8}")
    print("-" * 90)
    for name, model, orch, bl, iters, final in results_table:
        base = f"{bl['accuracy']*100:.1f}%"
        cols = []
        for it in iters:
            d = "C" if it["decision"] == "CONTINUE" else "R"
            cols.append(f"{it['accuracy']}({d})")
        while len(cols) < 3:
            cols.append("—")
        print(f"{name:<22} {model:<12} {orch:<10} {base:>6} {cols[0]:>8} {cols[1]:>8} {cols[2]:>8} {final or '—':>8}")

    print()
    if all_valid:
        print("ALL EXPERIMENTS VALIDATED ✓")
    else:
        print("SOME EXPERIMENTS HAVE ERRORS ✗")

    return 0 if all_valid else 1

if __name__ == "__main__":
    sys.exit(main())
