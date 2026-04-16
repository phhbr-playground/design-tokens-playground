# Design Tokens

This repository contains the single source of truth for design tokens in our design system.

## For Non-Developers: Managing Tokens

You can create, update, or delete tokens without writing code by opening an issue:

### Create a New Token
1. Go to [Issues → New Issue](../../issues/new/choose)
2. Select **"🎨 Create New Token"**
3. Fill out the form with token details
4. Submit the issue

A pull request will be automatically created for review.

### Update an Existing Token
1. Go to [Issues → New Issue](../../issues/new/choose)  
2. Select **"✏️ Update Existing Token"**
3. Provide the token path and new value
4. Submit the issue

### Delete a Token
1. Go to [Issues → New Issue](../../issues/new/choose)
2. Select **"🗑️ Delete Token"**
3. Confirm the token to remove
4. Submit the issue

## Token Naming Conventions

- Use **kebab-case** for token names: `primary-blue`, `spacing-md`
- Use **dot notation** for grouping: `brand.primary.500`, `feedback.error`
- Be descriptive but concise

## For Developers

### Installation

```bash
npm install @your-org/design-tokens
