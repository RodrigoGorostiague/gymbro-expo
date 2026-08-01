# Workout Recap Feed Specification

## Purpose

Provide a private, no-media feed of immutable workout recaps to eligible Bro/Partner connections.

## Requirements

### Requirement: Reduced immutable recap creation

The system MUST allow an authenticated member to create a recap containing only routine name, completion time, duration, exercise count, available aggregate metrics, and an optional length-limited caption. It MUST NOT accept media, raw sets, private notes, local identifiers, or later content edits.

#### Scenario: Create an approved recap
- GIVEN an authenticated member supplies the approved summary fields
- WHEN the member publishes the recap
- THEN the feed can expose that immutable reduced recap to eligible viewers

#### Scenario: Reject disallowed recap content
- GIVEN a publish request includes media or private workout detail
- WHEN the member submits it
- THEN the system rejects the request without creating a recap

### Requirement: Relationship-scoped server authorization

The system MUST authorize each read, create, delete, and feed page on the server. A recap MUST be visible only to its author or a current accepted Bro/Partner connection when neither direction is blocked.

#### Scenario: Eligible connection reads a recap
- GIVEN author and viewer are accepted, unblocked Bro/Partner connections
- WHEN the viewer loads the feed
- THEN the viewer receives the author's non-deleted recap

#### Scenario: Non-eligible or unauthenticated access
- GIVEN a viewer is unauthenticated or is not an accepted connection
- WHEN the viewer requests a recap or feed page
- THEN the system denies access and returns no protected recap data

### Requirement: Block and relationship-change exclusion

The system MUST exclude a recap after either member blocks the other or their accepted relationship ends. It MUST deny blocked parties' mutations and Realtime invalidation access.

#### Scenario: Block removes feed eligibility
- GIVEN a viewer previously received an author's recap
- WHEN either member blocks the other or removes the relationship
- THEN the recap is absent on the viewer's next authorized refresh

#### Scenario: Blocked member acts on feed
- GIVEN either direction of a block exists
- WHEN either member requests feed data, mutation, or invalidation access for the pair
- THEN the system denies the operation

### Requirement: Author deletion boundary

The system MUST permit only the author to delete a recap and MUST NOT provide recap editing. Deleted recaps MUST NOT be returned by later feed pages.

#### Scenario: Author deletes a recap
- GIVEN an author has published a recap
- WHEN the author deletes it
- THEN subsequent feed loads omit it

#### Scenario: Non-author changes a recap
- GIVEN an eligible connection views another member's recap
- WHEN the connection attempts deletion or any edit
- THEN the system denies the request

### Requirement: Authorized ordered pagination

The system MUST return eligible, non-deleted recaps in descending completion creation order with a stable opaque keyset cursor. It MUST NOT rely on client-side eligibility filtering.

#### Scenario: Load subsequent page
- GIVEN an eligible feed has more results than one page
- WHEN the viewer requests the next page using its cursor
- THEN results continue after the prior page without duplicates and preserve descending order

#### Scenario: Invalid cursor
- GIVEN a feed request has an invalid or expired cursor
- WHEN the viewer loads that page
- THEN the system returns a safe validation error without protected data

### Requirement: Feed lifecycle and release validation

The client MUST show usable empty, loading, retryable error, and refresh states. Authorized Realtime events MUST only invalidate the feed and trigger a refetch; they MUST NOT supply feed content or create an offline feed cache. Release MUST retain manual two-account validation of relationships, blocks, and authorized Realtime as a dependency.

#### Scenario: Empty or failed feed
- GIVEN an authorized feed has no eligible recaps or its request fails
- WHEN the member opens or refreshes Community
- THEN the client shows an empty state or retryable error without stale protected content

#### Scenario: Realtime invalidation
- GIVEN an eligible member receives an authorized relevant event
- WHEN the event is processed
- THEN the client refetches the server-authorized feed rather than rendering event payload as a recap
