# Component Tokens

Component tokens are collections of design tokens that compose complete component styles. They typically **inherit** or **reference** semantic and base tokens.

## Structure

Component tokens are organized by:
- **Component name**: button, card, input, etc.
- **Variant**: primary, secondary, large, etc.
- **Property**: background, text, padding, etc.

## Examples

### Button Component

```json
{
  "component": {
    "button": {
      "primary": {
        "background": "{semantic.color.interactive.primary}",
        "text": "#ffffff",
        "padding": "{spacing.md}",
        "border-radius": "0.375rem"
      },
      "secondary": {
        "background": "{semantic.color.interactive.secondary}",
        "text": "#ffffff",
        "padding": "{spacing.md}",
        "border-radius": "0.375rem"
      }
    }
  }
}
```

### Card Component

```json
{
  "component": {
    "card": {
      "background": "{semantic.color.background.default}",
      "padding": "{spacing.lg}",
      "border-radius": "0.5rem",
      "shadow": "0 4px 6px rgba(0, 0, 0, 0.1)"
    }
  }
}
```

## Token Hierarchy

The design token hierarchy follows this pattern:

```
base tokens (primitives)
    ↓
semantic tokens (intent-based)
    ↓
component tokens (composed styles)
```

Example:
```
color.bright-cyan = #03AACE (base)
  ↓
semantic.color.interactive.primary = {color.bright-cyan} (semantic)
  ↓
component.button.primary.background = {semantic.color.interactive.primary} (component)
```

## Benefits

1. **Reusability**: Compose tokens from existing semantic/base tokens
2. **Consistency**: Ensure components use consistent styling
3. **Maintainability**: Update component styles in one place
4. **Documentation**: Clear mapping of which tokens each component uses
5. **Scalability**: Easy to add new component variants

## Usage in Code

### CSS (via Style Dictionary)
```css
/* Using component tokens */
.btn-primary {
  background-color: var(--ds-component-button-primary-background);
  color: var(--ds-component-button-primary-text);
  padding: var(--ds-component-button-primary-padding);
  border-radius: var(--ds-component-button-primary-border-radius);
}
```

### JavaScript
```javascript
import { component } from '@your-org/design-tokens';

const buttonStyles = {
  backgroundColor: component.button.primary.background,
  color: component.button.primary.text,
  padding: component.button.primary.padding,
};
```

## Creating New Component Tokens

1. Identify which component you want to tokenize
2. List all properties (colors, spacing, shadows, etc.)
3. Reference existing semantic or base tokens where possible
4. Group variants (primary, secondary, disabled, etc.)
5. Document the component's purpose and usage
