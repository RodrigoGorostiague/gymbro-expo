# Web Account Access Specification

## Purpose

Define browser access to the shared GymBro identity and profile without expanding authentication scope.

## Requirements

### Requirement: Email and Password Access

The system MUST let a visitor register and sign in with email and password, MUST establish the same GymBro identity across clients, and MUST reject invalid or unverified credentials without disclosing whether an account exists.

#### Scenario: Register and enter GymBro
- GIVEN an unused valid email and acceptable password
- WHEN the visitor registers and satisfies required verification
- THEN the system MUST authenticate the new account

#### Scenario: Invalid sign-in
- GIVEN invalid credentials
- WHEN the visitor attempts sign-in
- THEN the system MUST deny access with a non-enumerating error

### Requirement: Browser Recovery

The system MUST support password recovery through an approved browser destination, MUST validate recovery state before accepting a new password, and MUST provide a safe restart path after invalid, expired, or reused recovery state.

#### Scenario: Complete recovery
- GIVEN a valid unused recovery action
- WHEN the user submits an acceptable new password
- THEN the system MUST update the credential and permit sign-in

#### Scenario: Invalid recovery state
- GIVEN an expired, malformed, or previously used recovery action
- WHEN the browser opens it
- THEN the system MUST deny reset and offer a new recovery request

### Requirement: Session and Profile Bootstrap

The system MUST restore a valid browser session, MUST bootstrap only the authenticated user's profile, and MUST expose the same authorized profile and planning identity used by mobile. Failed bootstrap MUST NOT create another identity.

#### Scenario: Restore browser session
- GIVEN a returning user with a valid session
- WHEN the application starts
- THEN the system MUST restore the session and load that user's profile

#### Scenario: Unauthorized profile request
- GIVEN an authenticated user requests another user's private profile data
- WHEN the request is evaluated
- THEN the server MUST deny or redact it according to the owner's visibility rules

### Requirement: Account Scope Boundaries

The web account surface MUST NOT provide workout execution, timers, drafts, joint-live execution, store purchases, anonymous access, or push, browser, or email notifications. It MAY link only to supported authenticated web capabilities.

#### Scenario: Unsupported feature route
- GIVEN an authenticated web user
- WHEN the user attempts to open an excluded capability
- THEN the system MUST NOT expose or start that capability
