# Exercise Catalog Specification

## Exercise Catalog — Delta

### Requirement: Name-only updates
The system MUST persist a changed exercise name even when all other exercise fields are unchanged.

#### Scenario: Rename and reload
- GIVEN a saved exercise
- WHEN its name alone is changed and the app reloads
- THEN the new name is displayed and persisted.
