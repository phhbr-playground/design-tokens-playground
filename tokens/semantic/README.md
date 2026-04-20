# Semantic Tokens

Semantic tokens provide meaningful names for design tokens that describe their **purpose** and **usage context** rather than their visual properties.

## Structure

Semantic tokens are organized by:
- **Theme layer**: Interactive, feedback, background, text, etc.
- **Category**: Color, spacing, sizing, etc.
- **Intent**: Primary, secondary, success, error, warning, info, etc.

## Examples

### Color Tokens

```json
{
  "semantic": {
    "color": {
      "interactive": {
        "primary": "{color.bright-cyan}",  // Primary CTAs and key interactions
        "secondary": "{color.warm-pink}"   // Less prominent interactions
      },
      "feedback": {
        "success": "#10b981",    // Positive feedback
        "error": "#ef4444",      // Error states
        "warning": "#f59e0b",    // Warnings
        "info": "#3b82f6"        // Information
      },
      "background": {
        "default": "#ffffff",    // Main background
        "secondary": "#f3f4f6",  // Alternate sections
        "tertiary": "#e5e7eb"    // Interactive elements
      },
      "text": {
        "primary": "#1f2937",    // Main text
        "secondary": "#6b7280",  // Supporting text
        "disabled": "#d1d5db"    // Disabled text
      }
    }
  }
}
```

## Benefits

1. **Semantic meaning**: Clear intent of where and how to use tokens
2. **Maintainability**: Easier to understand and update token usage
3. **Consistency**: Enforces consistent semantic usage across the system
4. **Flexibility**: Can easily remap tokens without changing component code
5. **Accessibility**: Semantic naming helps with understanding purpose

## Relationships

Semantic tokens typically **reference** base tokens (primitive tokens):
- Base tokens: `color.bright-cyan` = `#03AACE` (raw value)
- Semantic tokens: `semantic.color.interactive.primary` = `{color.bright-cyan}` (reference)

This allows you to:
- Update a color in one place
- See changes propagate across all semantic usages
- Swap implementations without breaking components
