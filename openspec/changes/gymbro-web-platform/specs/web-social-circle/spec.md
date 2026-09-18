# Web Social Circle Specification

## Purpose

Define server-authorized circle relationships, social engagement, moderation, and in-app notifications.

## Requirements

### Requirement: Circle Membership and Requests

The system MUST treat only reciprocal accepted relationships as circle membership. Users MAY discover eligible profiles and send, accept, reject, or cancel requests; acceptance MUST be server-authorized and idempotent.

#### Scenario: Accept a request
- GIVEN an unblocked pending request between eligible users
- WHEN the recipient accepts it
- THEN the system MUST create one reciprocal accepted relationship

#### Scenario: Unaccepted requester
- GIVEN a request is pending or rejected
- WHEN either user requests circle-only data
- THEN the server MUST deny that access

### Requirement: Blocking Semantics

Blocking MUST remove relationships and pending requests in both directions, MUST exclude both users from mutual discovery and social projections, and MUST prevent new requests, engagement, sharing, and circle-visible access until unblocked. Unblocking MUST NOT restore prior relationships or requests.

#### Scenario: Block a circle member
- GIVEN two accepted circle members
- WHEN either user blocks the other
- THEN the server MUST remove their relationship and deny mutual social access

#### Scenario: Unblock a user
- GIVEN a block replaced a prior relationship
- WHEN the blocker unblocks the user
- THEN the system MUST leave them unrelated until a new request is accepted

### Requirement: Feed Engagement and Deletion

Authorized viewers MAY react to and comment on visible feed items. The server MUST recheck item visibility and block state for every engagement. Authors MUST be able to delete their own comments or publications; deletion MUST remove them from future projections and MUST NOT authorize deletion of independent accepted plan copies.

#### Scenario: Engage with visible content
- GIVEN an unblocked user can currently view a feed item
- WHEN the user reacts or posts an acceptable comment
- THEN the system MUST persist and project that engagement

#### Scenario: Engage after access loss
- GIVEN visibility changed or either user blocked the other
- WHEN the former viewer submits engagement
- THEN the server MUST deny it without persisting engagement

### Requirement: Moderation Baseline

Users MUST be able to report visible publications or comments. Authors MAY remove their own content, while authorized moderators MAY hide or remove reported content; ordinary users MUST NOT perform moderator actions. Removed content MUST cease appearing in normal projections.

#### Scenario: Report content
- GIVEN a user can view a publication or comment
- WHEN the user submits a valid report
- THEN the system MUST record it without granting moderation authority

#### Scenario: Unauthorized moderation
- GIVEN an ordinary user is not the content author
- WHEN the user attempts to hide or remove the content
- THEN the server MUST deny the action

### Requirement: In-App Notifications Only

The system MUST create in-app notifications for actionable requests, sharing, and engagement events, MUST expose them only to their recipient, and MUST support read state. It MUST NOT send push, browser, or email notifications.

#### Scenario: Receive an actionable event
- GIVEN an allowed social action targets a user
- WHEN the action succeeds
- THEN the system MUST create a recipient-only in-app notification

#### Scenario: Blocked event
- GIVEN the actors are blocked
- WHEN an actor attempts a notifying action
- THEN the server MUST deny the action and MUST NOT create a notification
