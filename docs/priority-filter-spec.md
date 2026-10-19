# Priority Filter Specification

## Goal

Give managers a faster way to focus on equipment requests needing attention by organizing requests using existing priority information and the business rules below.

This document defines the approved behavior for implementation. The user authorized implementation and resolved the remaining timing, ordering, matching, validation, and closure decisions.

## User Need

Managers need separate, ordered sections that identify urgent, failed, unavailable, invalid, low-priority, and duplicate requests. Within each section, managers need to see the earliest needed-by dates first. They must retain access to existing requests, recover discarded duplicates, and explicitly close requests to complete them.

## Functional Rules

### Existing priority and category order

1. Reuse the existing Low, Medium, and High priority values. Preserve the existing Medium default, including the fallback for older requests without priority.
2. Show separate category sections in this attention order:

   | Rank | Category |
   | --- | --- |
   | 1 | High |
   | 2 | Unavailable equipment |
   | 3 | Failed submissions |
   | 4 | Medium |
   | 5 | Invalid |
   | 6 | Low |
   | 7 | Duplicate |

4. When categories overlap, the highest-ranked applicable category wins, except that eligible Low-priority duplicates bypass both Low and Unavailable placement as defined in rule 21. High explicitly overrides every other category.
5. Unavailable equipment ranks below High and above Failed submissions. Failed submissions rank below Unavailable equipment and above Medium.
6. Keep priority choice, failure/validation information, duplicate history, and closure information available without overwriting the original request details.

### Ordering within sections

6. Sort requests with valid needed-by dates by earliest date first.
7. For requests with missing or invalid needed-by dates, use creation time, oldest first.
8. Place requests with valid needed-by dates before requests with missing or invalid dates. Break equal-date ties by creation time, oldest first. Break equal creation timestamps by request ID for deterministic ordering.

### Invalid requests and failed submissions

9. A request is invalid when required information is missing or a field is filled out incorrectly.
10. Incompleteness specifically counts as a failed submission, whether the user attempted to submit or left it unsubmitted. Failed therefore outranks Invalid for incomplete requests, subject to the High override.
11. Save started, unfinished request attempts so managers can eventually see them.
12. An unfinished attempt becomes manager-visible after the user leaves the form and it remains unsubmitted for three days.
13. An attempted incomplete submission also follows a three-day visibility delay. Three days means 72 elapsed hours. Start its timer when Add request is clicked; start an abandoned draft's timer when focus leaves the form, the page becomes hidden, or the page is left. Editing the draft resets the delay; leaving it again starts a new delay. Reloading or repeated leave events without editing do not restart an existing timer. Hidden drafts do not reserve equipment or establish duplicates.
14. Retain the attempt and its available information across reloads. Do not turn an incomplete submission into an ordinary successfully submitted request.
15. Validate the existing required fields and supported priorities, a real YYYY-MM-DD needed-by date, a listed department, and a business reason of at most 240 characters. Preserve the existing trimming behavior on successful submission. Complete but incorrectly filled submissions are retained with validation errors for classification under the ranking rules. Technical save errors retain the current form and records and show an error; they are not treated as successful submissions or newly saved failed attempts.

### Equipment availability

16. Determine equipment availability from existing requests, rather than a separate equipment list or a manager manually assigning unavailability.
17. Unavailable equipment ranks below High and above Failed submissions.
18. Equipment is unavailable when another existing request matches the equipment and needed-by date. A request does not conflict with itself. A different equipment name or needed-by date does not establish unavailability under this rule. Compare equipment using the same case and whitespace normalization as duplicate matching and require valid matching dates. Exclude closed, discarded, and not-yet-visible unfinished requests from the existing requests used for availability. Do not infer inventory quantities.

### Duplicate identification and discard

19. Identify duplicates using the equipment and valid needed-by date of another active, manager-visible request. Exclude closed and discarded requests. The oldest matching request is the original; later matching records are duplicates. Break equal creation timestamps by request ID. Missing or invalid dates do not create duplicate matches.
20. Ignore capitalization and extra spaces when comparing equipment names. Other fields, including requester and department, do not determine duplicate identity.
21. Display the Duplicate section below Low. For a Low-priority duplicate without a recovery exemption, bypass Unavailable placement and use Duplicate instead of Low, unless Failed or Invalid applies. This explicit exception allows its two-week discard lifecycle to operate despite the matching equipment/date availability conflict. Duplicate matching does not override Medium or High. Matching Medium- and High-priority requests remain subject to their existing priority and higher-ranked applicable categories. Recovered requests never use this duplicate exception.
22. Start the two-week timer when the request is identified as a duplicate, not when it was created.
23. After two weeks (14 times 24 elapsed hours), move an eligible duplicate to a separate Discarded section. Persist the identification timestamp; reloads must not restart the timer. A request must currently qualify for Duplicate to be discarded by this rule.
24. Discarding retains the record. Discarded requests remain viewable and recoverable.

### Recovery and completion

25. Recovering a discarded duplicate requires an explicit Low, Medium, or High priority choice.
26. A recovered request can never enter the Duplicate category again, including after reload or later duplicate checks. Preserve this recovery exemption.
27. The selected priority participates in the category precedence rules; other applicable categories can still affect placement.
28. A request is complete only after an explicit close action. Selecting a priority, identifying a duplicate, discarding, or recovering a request does not complete it. Anyone using this login-free local app may close a visible request. Retain closed requests in a separate Closed section after Discarded, preserving their data and closure timestamp. Closure takes precedence over active and discarded placement; reopening closed requests is not included.

## Constraints

- Work without login, a database, external services, frameworks, or new production dependencies.
- Preserve all existing locally stored requests and their information. Preserve the existing storage key and compatibility with records lacking newly introduced fields.
- Use browser-local persistence. Manager visibility is limited to the same browser profile and site storage; cross-device or cross-user sharing is not provided.
- Persist the information needed to enforce visibility delays, duplicate aging, recovery exemptions, and closure.
- Evaluate elapsed deadlines when the application is next opened or refreshed if it was closed when a deadline passed. No background service is available.
- Keep controls visibly labeled and keyboard accessible, and render user-provided text safely.
- Keep business/storage behavior in src/request-store.js and browser rendering in src/app.js. Test the business behavior with a controlled clock and verify the browser interactions.

The formerly open decisions are resolved in rules 8, 13, 15, 18, 19, 23, and 28. The Low-priority duplicate exception to Unavailable placement is defined in rule 21.

## Acceptance Criteria

The scenarios below define verification requirements. See docs/priority-filter-testing.md for automated coverage, browser checks, and results.

| ID | Given / When | Expected result |
| --- | --- | --- |
| AC-01 | Existing requests are present before the feature is introduced, and the app is opened and reloaded afterward. | All existing requests and their information remain readable. Existing priorities remain intact; missing legacy priority defaults to Medium. |
| AC-02 | Requests qualifying for the approved categories are visible. | Managers see separate sections ordered High, Unavailable, Failed, Medium, Invalid, Low, Duplicate, with separate Discarded and Closed sections. |
| AC-03 | A request qualifies as High and also matches another active category. | It appears in High. |
| AC-04 | A non-High request matches multiple categories. | Apply the ranking with the explicit Low-priority duplicate exception: an eligible Low duplicate without a recovery exemption bypasses Unavailable and appears in Duplicate unless Failed or Invalid applies. Matching Medium requests receive no duplicate override; High always wins. Outside the Low duplicate exception, Unavailable wins over Failed. |
| AC-05 | Requests in one section have different valid needed-by dates. | Earlier needed-by dates appear before later dates. |
| AC-06 | Multiple requests in one section have missing or invalid needed-by dates. | Those requests are ordered by creation time, oldest first. Dated requests appear first; equal creation timestamps are ordered by request ID. |
| AC-07 | A user starts an incomplete request, leaves the form, and does not submit it. | Its available data is retained across reloads. It is not manager-visible before the three-day deadline and becomes visible at or after that deadline when the app evaluates it. Incompleteness qualifies it as Failed, subject to High precedence. |
| AC-08 | A user attempts to submit an incomplete request. | The attempt is retained and follows the three-day visibility delay. It qualifies as Failed rather than merely Invalid and is not treated as a successful ordinary submission. |
| AC-09 | A request has incorrectly filled information without incompleteness and no higher-ranked category applies. | It appears in Invalid, above Low and below Medium. Validation follows rule 15. |
| AC-10 | Another existing request matches the requested equipment and needed-by date, and no High override applies. | The request qualifies as Unavailable, below High and above Failed. The request must not match itself. Different equipment or a different needed-by date does not establish unavailability. Eligible Low-priority duplicates without a recovery exemption bypass Unavailable and follow rule 21; Medium requests do not receive this exception and High requests remain High. |
| AC-11 | Two requests have the same valid needed-by date and equivalent equipment names differing only in capitalization or extra spaces. | They match the duplicate definition; the oldest matching record is the original, with equal creation times broken by request ID. |
| AC-12 | Equipment names differ or valid needed-by dates differ. | The requests do not match each other under the duplicate rule. |
| AC-13 | An eligible duplicate has been identified and its two-week deadline has not passed. | It remains in Duplicate; the clock is based on identification time. |
| AC-14 | An eligible duplicate reaches the two-week deadline. | On the next deadline evaluation, it moves to Discarded without deletion and remains viewable. |
| AC-15 | A user tries to recover a discarded duplicate without selecting Low, Medium, or High. | Recovery does not complete until a valid explicit priority choice is made. |
| AC-16 | A discarded duplicate is recovered with a valid priority choice. | It returns to the active categories using that priority and applicable precedence. It retains its data and permanent duplicate exemption. |
| AC-17 | A recovered request still matches another request after reload or later duplicate checks. | It never re-enters Duplicate or becomes discarded again through duplicate aging. |
| AC-18 | A request is reprioritized, discarded, or recovered without being closed. | It is not marked completed. |
| AC-19 | An explicit close action is performed. | The request is marked closed and therefore completed; the record is preserved across reloads. |
| AC-20 | The application runs using the existing local setup. | The feature requires no login, database, or external service. |

## Out of Scope

- Authentication, manager accounts, role enforcement, server-side storage, or shared access across devices.
- Inventing an equipment inventory, procuring equipment, or integrating an external inventory service.
- Email, notifications, and background processing while the app is closed.
- Permanent deletion of discarded or closed requests.
- Automatic completion based on priority, date, discard, or recovery.
- Treating technical save errors as incomplete attempts without an additional approved requirement.
- Reopening closed requests.
- Unrelated interface redesigns or changes to existing request fields.

