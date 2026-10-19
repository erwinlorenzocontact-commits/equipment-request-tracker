# Priority Filter Specification

## Goal

Give managers a faster way to focus on equipment requests needing attention by organizing requests using existing priority information and the business rules below.

This document specifies future behavior only. It does not authorize feature implementation.

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

4. When categories overlap, the highest-ranked applicable category wins, except that duplicate matching overrides Low placement as defined in rule 21. High explicitly overrides every other category.
5. Unavailable equipment ranks below High and above Failed submissions. Failed submissions rank below Unavailable equipment and above Medium.
6. Keep priority choice, failure/validation information, duplicate history, and closure information available without overwriting the original request details.

### Ordering within sections

6. Sort requests with valid needed-by dates by earliest date first.
7. For requests with missing or invalid needed-by dates, use creation time, oldest first.
8. The relative placement of undated requests among dated requests, and tie-breaking for equal dates or timestamps, remain to be decided.

### Invalid requests and failed submissions

9. A request is invalid when required information is missing or a field is filled out incorrectly.
10. Incompleteness specifically counts as a failed submission, whether the user attempted to submit or left it unsubmitted. Failed therefore outranks Invalid for incomplete requests, subject to the High override.
11. Save started, unfinished request attempts so managers can eventually see them.
12. An unfinished attempt becomes manager-visible after the user leaves the form and it remains unsubmitted for three days.
13. An attempted incomplete submission also follows a three-day visibility delay.
14. Retain the attempt and its available information across reloads. Do not turn an incomplete submission into an ordinary successfully submitted request.
15. This definition of failed submission concerns incomplete attempts. Behavior for technical storage failures has not been specified.

### Equipment availability

16. Determine equipment availability from existing requests, rather than a separate equipment list or a manager manually assigning unavailability.
17. Unavailable equipment ranks below High and above Failed submissions.
18. Equipment is unavailable when another existing request matches the equipment and needed-by date. A request does not conflict with itself. A different equipment name or needed-by date does not establish unavailability under this rule. Which request statuses participate remains to be decided; do not infer inventory quantities.

### Duplicate identification and discard

19. Identify duplicates using the equipment and needed-by date of an existing request.
20. Ignore capitalization and extra spaces when comparing equipment names. Other fields, including requester and department, do not determine duplicate identity.
21. Display the Duplicate section below Low. Duplicate matching overrides Low placement but does not override Medium or High. A matching Low-priority request enters Duplicate only if no higher-ranked category applies and it has no recovery exemption. Matching Medium- and High-priority requests remain subject to their existing priority and higher-ranked applicable categories.
22. Start the two-week timer when the request is identified as a duplicate, not when it was created.
23. After two weeks, move an eligible duplicate to a separate Discarded section.
24. Discarding retains the record. Discarded requests remain viewable and recoverable.

### Recovery and completion

25. Recovering a discarded duplicate requires an explicit Low, Medium, or High priority choice.
26. A recovered request can never enter the Duplicate category again, including after reload or later duplicate checks. Preserve this recovery exemption.
27. The selected priority participates in the category precedence rules; other applicable categories can still affect placement.
28. A request is complete only after an explicit close action. Selecting a priority, identifying a duplicate, discarding, or recovering a request does not complete it.

## Constraints

- Work without login, a database, external services, frameworks, or new production dependencies.
- Preserve all existing locally stored requests and their information. Preserve the existing storage key and compatibility with records lacking newly introduced fields.
- Use browser-local persistence. Manager visibility is limited to the same browser profile and site storage; cross-device or cross-user sharing is not provided.
- Persist the information needed to enforce visibility delays, duplicate aging, recovery exemptions, and closure.
- Evaluate elapsed deadlines when the application is next opened or refreshed if it was closed when a deadline passed. No background service is available.
- Keep controls visibly labeled and keyboard accessible, and render user-provided text safely.
- This is a specification-only change. Do not change application code or tests.

The following decisions must be resolved before the affected behavior can be implemented and fully accepted:

- **Availability and duplicate overlap:** Both use matching equipment and needed-by date. With the current precedence, a non-High duplicate also qualifies as Unavailable, which outranks Duplicate. Define whether this is intended or whether duplicate matches are an exception to Unavailable placement so the Duplicate and discard lifecycle can operate. Also define which existing request statuses participate in availability checks.
- **Delay measurement:** Define exactly what counts as leaving the form, the starting event for an attempted incomplete submission, whether returning/editing resets the delay, and whether three days/two weeks mean elapsed hours or calendar days.
- **Validation and duplicate boundaries:** Define field-specific incorrect-input rules, how missing/invalid dates affect duplicate matching, and which record remains the original when several records match.
- **Presentation boundaries:** Define placement of undated requests relative to dated requests and tie-breaking. If Failed and Unavailable both apply, Unavailable wins unless High applies.
- **Lifecycle boundaries:** Define who can close requests in the login-free interface, where closed requests appear, and whether closed/discarded records participate in duplicate matching. Closure must preserve the request.

## Acceptance Criteria

The scenarios below are requirements for future verification, not claims that the feature exists or tests have passed. Scenarios affected by an unresolved decision above require that decision before final acceptance.

| ID | Given / When | Expected result |
| --- | --- | --- |
| AC-01 | Existing requests are present before the feature is introduced, and the app is opened and reloaded afterward. | All existing requests and their information remain readable. Existing priorities remain intact; missing legacy priority defaults to Medium. |
| AC-02 | Requests qualifying for the approved categories are visible. | Managers see separate sections ordered High, Unavailable, Failed, Medium, Invalid, Low, Duplicate, with a separate Discarded section. |
| AC-03 | A request qualifies as High and also matches another active category. | It appears in High. |
| AC-04 | A non-High request matches multiple categories. | The highest-ranked applicable category wins, with Duplicate overriding Low only. A matching Low request with no higher-ranked category or recovery exemption appears in Duplicate; a matching Medium request stays in Medium unless a higher-ranked category applies. Unavailable wins over Failed. |
| AC-05 | Requests in one section have different valid needed-by dates. | Earlier needed-by dates appear before later dates. |
| AC-06 | Multiple requests in one section have missing or invalid needed-by dates. | Those requests are ordered by creation time, oldest first. Placement relative to dated requests follows the decision recorded in Constraints. |
| AC-07 | A user starts an incomplete request, leaves the form, and does not submit it. | Its available data is retained across reloads. It is not manager-visible before the three-day deadline and becomes visible at or after that deadline when the app evaluates it. Incompleteness qualifies it as Failed, subject to High precedence. |
| AC-08 | A user attempts to submit an incomplete request. | The attempt is retained and follows the three-day visibility delay. It qualifies as Failed rather than merely Invalid and is not treated as a successful ordinary submission. |
| AC-09 | A request has incorrectly filled information without incompleteness and no higher-ranked category applies. | It appears in Invalid, above Low and below Medium. Field-specific validation must first be defined. |
| AC-10 | Another existing request matches the requested equipment and needed-by date, and no High override applies. | The request qualifies as Unavailable, below High and above Failed. The request must not match itself. Different equipment or a different needed-by date does not establish unavailability. Final placement for duplicate matches depends on the overlap decision in Constraints. |
| AC-11 | Two requests have the same valid needed-by date and equivalent equipment names differing only in capitalization or extra spaces. | They match the duplicate definition; the original and duplicate are identified using the approved original-selection rule. |
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

- Implementing the feature or modifying application code in this change.
- Authentication, manager accounts, role enforcement, server-side storage, or shared access across devices.
- Inventing an equipment inventory, procuring equipment, or integrating an external inventory service.
- Email, notifications, and background processing while the app is closed.
- Permanent deletion of discarded or closed requests.
- Automatic completion based on priority, date, discard, or recovery.
- Treating technical save errors as incomplete attempts without an additional approved requirement.
- Unrelated interface redesigns or changes to existing request fields.
