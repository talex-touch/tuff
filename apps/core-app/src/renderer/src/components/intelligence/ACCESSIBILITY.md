# AISDK Management UI - Accessibility Features

This document outlines the accessibility features implemented in the AISDK Management UI to ensure compliance with WCAG 2.1 Level AA standards.

## Overview

The AISDK Management UI has been designed with accessibility as a core principle, ensuring that all users, including those using assistive technologies, can effectively manage AI SDK providers.

## Implemented Features

### 1. Keyboard Navigation

#### Global Navigation
- **Arrow Up/Down**: Navigate between providers in the list
- **Enter/Space**: Select a provider or activate buttons
- **Tab**: Move focus between interactive elements
- **Escape**: Close modals or cancel actions

#### Provider List
- Full keyboard navigation support for all provider items
- Focus indicators clearly visible on all interactive elements
- Logical tab order throughout the interface

### 2. ARIA Labels and Roles

#### Semantic HTML Structure
- `<main>` role for the main content area
- `<aside>` with `role="navigation"` for the provider list sidebar
- `<section>` with `role="region"` for the detail panel
- `<header>` with `role="banner"` for provider headers
- Proper heading hierarchy (h1, h2, h3)

#### ARIA Attributes
- `aria-label`: Descriptive labels for all interactive elements
- `aria-labelledby`: Associating labels with their controls
- `aria-describedby`: Providing additional context for elements
- `aria-pressed`: Indicating selection state for provider items
- `aria-expanded`: Indicating collapse/expand state for sections
- `aria-controls`: Linking controls to the elements they control
- `aria-live`: Announcing dynamic content changes
- `aria-busy`: Indicating loading states
- `aria-checked`: Switch states for enable/disable toggles

### 3. Screen Reader Support

#### Announcements
- Live regions (`aria-live="polite"`) for:
  - Search results count
  - Provider selection changes
  - Test result updates
  - Configuration changes
- Status messages for empty states and disabled providers

#### Descriptive Labels
- All buttons have descriptive `aria-label` attributes
- Form inputs have associated labels (visible or screen-reader only)
- Icons are marked with `aria-hidden="true"` to prevent redundant announcements
- Status indicators have descriptive labels

#### Screen Reader Only Content
- `.sr-only` class for visually hidden but screen-reader accessible content
- Hidden text for expand/collapse states
- Search results count announcements

### 4. Focus Indicators

#### Visible Focus States
- 3px solid outline in primary color for all focusable elements
- 2px outline offset for better visibility
- Enhanced focus styles for buttons and links with box-shadow
- High contrast focus indicators that work in both light and dark modes

#### Focus Management
- Focus trap for modal dialogs (when implemented)
- Logical focus order throughout the interface
- Focus restoration after actions
- Skip-to-main-content link for keyboard users

### 5. Color Contrast

#### Text Contrast
- All text meets WCAG AA standards (4.5:1 for normal text, 3:1 for large text)
- Status indicators use colors with sufficient contrast
- Error states use high-contrast red with warning icons

#### Interactive Elements
- Buttons and links have sufficient contrast in all states
- Hover and focus states maintain contrast requirements
- Disabled states clearly distinguishable

### 6. Responsive Design

#### Flexible Layouts
- Responsive breakpoints for different screen sizes
- Touch-friendly target sizes (minimum 32x32px)
- Scalable text and UI elements
- Support for zoom up to 200%

### 7. Motion and Animation

#### Reduced Motion Support
- `prefers-reduced-motion` media query support
- Animations disabled or minimized for users who prefer reduced motion
- Essential animations only (no decorative motion)

### 8. Form Accessibility

#### Input Fields
- All inputs have associated labels
- Clear error messages
- Validation feedback
- Autocomplete attributes where appropriate

#### Search Functionality
- Search input with proper `type="search"`
- Clear button with descriptive label
- Results count announced to screen readers
- Search results update live region

## Component-Specific Features

### AISDKPage
- Main landmark with descriptive label
- Keyboard navigation between providers
- Proper semantic structure

### AISDKList
- Search input with label and clear button
- Results count announcement
- Grouped providers (enabled/disabled) with headings

### AISDKItem
- Button role with proper state indicators
- Selection state announced
- Error states with descriptive messages
- Toggle switch with descriptive label

### AISDKHeader
- Provider information in proper heading hierarchy
- Status badges with descriptive labels
- Test button with loading state indication
- Enable/disable switch with proper ARIA attributes

### AISDKInfo
- Scrollable region with keyboard support
- Configuration sections with expand/collapse
- Form fields with proper labels
- Global settings section clearly identified

### AISDKConfigSection
- Collapsible sections with proper ARIA attributes
- Button controls for expand/collapse
- Keyboard support (Enter/Space)
- Visual and screen reader feedback for state

## Testing Recommendations

### Manual Testing
1. **Keyboard Navigation**: Navigate the entire interface using only keyboard
2. **Screen Reader**: Test with NVDA, JAWS, or VoiceOver
3. **Zoom**: Test at 200% zoom level
4. **Color Contrast**: Verify contrast ratios with tools like axe DevTools
5. **Focus Indicators**: Ensure all interactive elements have visible focus

### Automated Testing
- Use axe-core or similar tools for automated accessibility audits
- Run Lighthouse accessibility audits
- Test with browser accessibility extensions

### User Testing
- Conduct testing with users who rely on assistive technologies
- Gather feedback on navigation and usability
- Iterate based on real-world usage

## Compliance

This implementation aims to meet:
- **WCAG 2.1 Level AA** standards
- **Section 508** requirements
- **ARIA 1.2** best practices

## Future Enhancements

1. Add keyboard shortcuts documentation
2. Implement focus trap for modal dialogs
3. Add high contrast mode support
4. Enhance error message accessibility
5. Add more descriptive help text
6. Implement skip navigation links
7. Add keyboard shortcut hints

## Resources

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [WebAIM Resources](https://webaim.org/)
- [MDN Accessibility](https://developer.mozilla.org/en-US/docs/Web/Accessibility)

## Support

For accessibility issues or suggestions, please file an issue with the "accessibility" label.
