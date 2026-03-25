---
inclusion: always
---
# Experiment Reliability Rules

## Never Trust Results Without Verification

1. When running LLM-backed evaluations, ALWAYS verify the LLM is actually being called before reporting results. Silent failures (credential errors, network issues, missing dependencies) produce results that look plausible but are fake.

2. AppWorld has "vacuous passes" — tests labeled `no_op_pass` that pass even when the agent does nothing. A baseline of 0% that jumps to 5-10% could be entirely vacuous passes, not real improvement. Always check that failed cases show evidence of real LLM work (more than 1 test passing per case).

3. Before reporting any accuracy numbers, verify:
   - The LLM endpoint is reachable (preflight check)
   - Credentials are valid and not expired
   - The eval output contains actual agent responses, not just error messages
   - At least some cases show multi-test passes (not all single vacuous passes)

## Container/Remote Execution Pitfalls

4. `credential_process` in AWS config (e.g., `ada credentials print`) does NOT work inside Docker containers unless the tool is installed there. boto3 will fail with `FileNotFoundError` and the error gets silently caught by try/except in agent code.

5. EC2 instance profiles provide credentials for the host account, which may NOT have access to the services you need (e.g., Bedrock). Always verify the actual account and permissions.

6. STS session tokens expire. For long-running experiments (10+ hours), credentials may expire mid-run. Build in credential refresh or use IAM roles.

7. AppWorld uses `freezegun` to patch system time, which breaks AWS SigV4 signing. LLM calls MUST run in a subprocess (`llm_call.py`) to avoid this.

## Reporting Standards

8. Never report experiment results without first checking the raw logs for errors. Grep for "Agent error", "FAIL", "expired", "credential" in eval logs.

9. When results seem surprisingly good or bad, investigate before reporting. Check the actual agent trajectories, not just the summary numbers.

10. Always include validation steps in experiment scripts: preflight credential checks, per-model verification, and post-eval result validation.
