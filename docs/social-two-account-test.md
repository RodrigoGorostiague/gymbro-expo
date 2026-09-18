# Social two-account validation script

## Purpose

Use this manual script to validate the Supabase social graph with two disposable, safe test accounts. Do not add credentials, tokens, email addresses, or screenshots containing them to the repository.

## Preconditions

- The app is built with the approved Supabase public configuration outside the repository.
- Create two disposable accounts: **Account A** and **Account B**.
- Sign in on two separate devices or emulator instances. Do not use personal accounts.
- Confirm both accounts have a visible profile and can open **Community**.

## Scenario record

Record the date, app build identifier, and pass/fail result in the validation ticket or secure test record. Do not record credentials.

| Step | Actor | Action | Expected result |
|---|---|---|---|
| 1 | A | Search for B and send a request. | A shows an outgoing request; B receives the request in Community without a manual navigation reload. |
| 2 | B | Accept A's request as **Bro**. | Both accounts show the other in My Circle as Bro; the pending request disappears on both accounts. |
| 3 | A | Block B. | The relationship and pending state disappear for the blocked pair; B cannot find, open, request, or receive Realtime updates for A. Unrelated accounts remain unaffected. |
| 4 | A | Unblock B, then send a new request to B. | A and B become eligible for a new request; no legacy Firebase partner UI appears. |
| 5 | B | Accept A's request as **Partner**. | Both accounts show one reciprocal Partner relationship; the request disappears and no duplicate relationship appears. |
| 6 | A and B | Leave Community open while repeating steps 1, 2, 3, and 5. | Each authorized change refreshes Community state through Supabase Realtime invalidation; event payloads are not rendered directly. |

## Failure handling

- Stop the scenario on any unauthorized visibility, direct-write error bypass, stale relationship state, duplicate relationship, or legacy Firebase partner UI/listener behavior.
- Capture non-secret reproduction details in the validation ticket.
- Do not alter production data manually. Database corrections require a forward-only, data-preserving migration.
