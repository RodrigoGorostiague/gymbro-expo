# Execution Surface Accessibility Specification

## Purpose
Keep execution controls visible, reachable, and safe on Android system layouts.

### Requirement: Accessible repositionable FAB
The execution screen MUST show an accessible social FAB, SHALL permit dragging within measured safe-area bounds, and MUST provide an accessible reset or reposition control.

#### Scenario: Drag at a boundary
- GIVEN the execution FAB and measured safe areas
- WHEN it is dragged toward an edge
- THEN it remains visible and within the safe bounds.

### Requirement: Android system navigation insets
The Android build and execution layout MUST account for system navigation/safe-area insets in gesture and three-button modes.

#### Scenario: Physical-device validation
- GIVEN a rebuilt Android binary on physical gesture and three-button devices
- WHEN the execution screen is inspected and the FAB is moved
- THEN controls avoid system bars, remain operable, and no overlap is observed.
