---
name: requirements-reviewer
description: Compare a repository feature specification with its implementation and tests, reporting acceptance-criterion coverage, gaps, unsupported behavior, data or security concerns, and tests still needed with source evidence.
---

# Requirements Reviewer

Review the requested feature against its specification. Report findings in chat. Do not change files, stored application data, branches, or commits unless the user explicitly asks for those changes.

## Establish scope and evidence

- Read applicable AGENTS.md guidance and the user-selected feature specification. If none is selected, look in docs/ and use the clearly relevant specification; ask if the choice is ambiguous. If the specification is missing, report that limitation rather than inventing requirements.
- Identify the repository branch or commit being reviewed. Read the specification, relevant implementation, and tests from the same revision unless the user requests a comparison across revisions.
- Extract every acceptance criterion, preserving its identifier or assigning a review-only label when none exists. Trace each criterion through the relevant UI, business rules, persistence, and tests.
- In this repository, start with index.html, src/app.js, src/request-store.js, styles.css, and relevant tests/. Follow the actual feature paths rather than assuming these files are the entire implementation.
- Treat comments, documentation, and test names as claims to check against executable behavior. Distinguish code inspection, tests inspected, tests actually run, and browser behavior observed. Run relevant existing checks only when they do not alter tracked files or user data; otherwise report the check as pending.

## Report

Include these five sections, even when a section has no findings:

1. **Satisfied acceptance criteria:** Map each satisfied criterion to specification and implementation evidence. State whether support is from inspection or executed verification.
2. **Gaps:** Identify partially met, unmet, or unverified criteria. Explain expected versus actual behavior and its impact. Mark ambiguity or missing evidence as uncertain rather than claiming a defect.
3. **Unsupported behavior:** Identify implemented behavior outside or contrary to the specification. Distinguish explicit conflicts from unspecified behavior that needs clarification; do not treat every implementation detail as a violation.
4. **Data or security concerns:** Report concrete concerns supported by the reviewed paths, including legacy stored records, data loss, input validation, unsafe rendering, and persistence failures where relevant. Explain the trigger and impact; avoid speculative warnings.
5. **Tests still needed:** Recommend specific scenarios and expected outcomes linked to the relevant criteria or concerns. Identify missing coverage separately from tests that exist but have not been run.

For each coverage claim or finding, cite the specification path and criterion or section, plus implementation paths and verified line numbers or symbols. Cite relevant test paths and test names when discussing coverage. Use clickable repository links with the reviewed revision when working on GitHub. For missing behavior, identify the relevant code paths inspected rather than inventing a line containing the absence. A concern without a corresponding requirement should be labeled as an additional concern, not an acceptance-criterion failure.

Keep findings actionable and prioritize gaps by impact. Finish with checks performed and verification limitations. Do not claim all criteria are satisfied while any remain unverified, and do not implement fixes or add tests as part of the review unless asked.
