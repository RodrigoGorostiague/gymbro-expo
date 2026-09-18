# Social Identity Specification

## Purpose

Provide Supabase Auth UID identity and public profiles.

## Requirements

### Requirement: Authenticated UID Identity and Legacy Migration

The system MUST use Supabase Auth UID identity and ownership. A legacy alias MUST migrate local data once, retain a marker, and preserve source data until commit. The server identity MUST derive from the authenticated Supabase UID, never a client-supplied alias or UID.

#### Scenario: First authenticated legacy session

- GIVEN a UID mapped to legacy data
- WHEN migration completes
- THEN UID-owned data and its marker exist

#### Scenario: Retried or unmapped migration

- GIVEN a marker exists or no legacy mapping exists
- WHEN the user signs in
- THEN no data is duplicated, overwritten, or deleted

### Requirement: Profile, Alias, and Category Visibility

The system MUST maintain a unique normalized alias and UID profile in Postgres. Categories MUST default public; owners MAY hide each. Hidden values MUST NOT be present in public projections or readable through RLS.

#### Scenario: Public profile projection

- GIVEN one public and one hidden category
- WHEN an eligible member reads the profile
- THEN only the public category is projected

#### Scenario: Alias conflict or private update

- GIVEN an alias collision or a hidden update
- WHEN the owner saves it
- THEN collision is rejected and hidden data stays unreadable

### Requirement: Public Discovery and Alias Search

The system MUST provide randomized discovery and normalized alias-prefix search through server-owned SQL cursor queries. Each returns a bounded keyset cursor page without duplicates and excludes blocked pairs, self, existing relationships, and pending requests.

#### Scenario: Directory continuation

- GIVEN eligible profiles exceed a page
- WHEN the member continues with its cursor
- THEN the next eligible bounded set is returned

#### Scenario: Search privacy and invalid cursor

- GIVEN a prefix includes private or blocked profiles
- WHEN searched with a valid or malformed cursor
- THEN eligible results return, or the cursor is rejected

### Requirement: Supabase Read Authorization and Realtime

The system MUST apply RLS to profile and discovery read models. Realtime subscriptions MUST expose only rows the subscribing authenticated member is authorized to read and MUST NOT expose hidden categories or blocked-pair state.

#### Scenario: Authorized social update

- GIVEN an authenticated member can read a permitted social projection
- WHEN an eligible projected row changes
- THEN Realtime may deliver that authorized change without hidden fields

#### Scenario: Unauthorized subscription or query

- GIVEN an unauthenticated, blocked, or otherwise ineligible member
- WHEN it queries or subscribes to a protected social read model
- THEN RLS returns no protected data
