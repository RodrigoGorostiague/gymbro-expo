# Plan Publication Specification

## Purpose

Define targeted private sharing and visibility-controlled publication of immutable routine and mesocycle versions.

## Requirements

### Requirement: Specific-Recipient Private Sharing

An owner MAY send an immutable plan-version snapshot only to specifically selected, accepted, unblocked circle recipients when the plan permits sharing. Only a named recipient MUST see and accept or reject that recipient's offer. Acceptance MUST atomically create an independent copy and MUST be idempotent.

#### Scenario: Accept a private offer
- GIVEN an eligible recipient has a pending offer
- WHEN that recipient accepts it
- THEN the system MUST create exactly one independent copy for that recipient

#### Scenario: Ineligible recipient
- GIVEN the target is unrelated, blocked, or not the named recipient
- WHEN access or acceptance is attempted
- THEN the server MUST deny it without creating a copy

### Requirement: Publication Visibility

An owner publishing a routine or mesocycle MUST select private, circle, or community visibility. Private publications MUST be visible only to the author; circle publications only to the author and accepted unblocked circle; community publications to authenticated unblocked viewers. Every read and copy MUST be server-authorized against current visibility and block state.

#### Scenario: View circle publication
- GIVEN the viewer is an accepted unblocked circle member of the author
- WHEN the viewer requests a circle publication
- THEN the system MUST return the authorized publication projection

#### Scenario: Denied community view
- GIVEN either viewer or author has blocked the other
- WHEN the viewer requests the author's community publication
- THEN the server MUST deny or omit it

### Requirement: Versioned Copy and Provenance

A publication MUST identify the immutable source version offered. An authorized copy MUST receive fresh owner-local identities, preserve source author and source version provenance, and remain independent from later source edits. Mesocycle copies MUST remap included routine references and start as draft without a start date.

#### Scenario: Copy a published mesocycle
- GIVEN an authorized viewer requests a copyable published version
- WHEN copying succeeds
- THEN the system MUST create one provenance-linked draft with valid local references

#### Scenario: Source changes later
- GIVEN a viewer copied publication version one
- WHEN the author publishes or edits a later version
- THEN the viewer's copy MUST remain unchanged and traceable to version one

### Requirement: Copy Permission and Revocation

Publication visibility MUST NOT imply copy permission. The author MUST explicitly allow copying for the published version. Revoking visibility or copy permission MUST prevent future reads or copies as applicable but MUST NOT alter copies already accepted or obtained.

#### Scenario: Visible but not copyable
- GIVEN a viewer may see a publication whose copy permission is disabled
- WHEN the viewer requests a copy
- THEN the server MUST deny copying while preserving view access

#### Scenario: Permission revoked after copy
- GIVEN an authorized copy already exists
- WHEN the author revokes or deletes the publication
- THEN future access MUST cease as applicable and the independent copy MUST remain

### Requirement: Publication Deletion and Exclusions

Only the author or an authorized moderator MAY remove a publication. Removal MUST hide it from feeds, reject pending publication-copy actions, and preserve audit-safe provenance on existing independent copies. Anonymous links and live collaborative plans MUST NOT be created.

#### Scenario: Delete a publication
- GIVEN the author owns a publication with no completed-copy dependency
- WHEN the author deletes it
- THEN the system MUST remove it from future discovery and deny new copies

#### Scenario: Unauthorized deletion
- GIVEN a viewer is neither author nor authorized moderator
- WHEN the viewer requests deletion
- THEN the server MUST deny it without changing the publication
