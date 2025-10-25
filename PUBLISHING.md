# Publishing Guide

This package uses [Changesets](https://github.com/changesets/changesets) for automated version management and publishing to npm.

## For Contributors

### Creating a Changeset

When you make a change that should be included in the changelog, run:

```bash
npm run changeset
```

This will prompt you to:
1. Select the type of change (major, minor, or patch)
2. Write a summary of the change

A markdown file will be created in `.changeset/` that describes your change.

### Change Types

- **major**: Breaking changes (e.g., API changes that require users to update their code)
- **minor**: New features that are backwards compatible
- **patch**: Bug fixes and minor improvements

## For Maintainers

### Publishing a New Version

The publishing process is automated via GitHub Actions when changes are merged to the `main` branch:

1. **Merge PRs with changesets**: When a PR containing changeset files is merged to `main`, the workflow will:
   - Create or update a "Version Packages" PR
   - This PR will update the version in `package.json` and generate/update `CHANGELOG.md`

2. **Merge the Version Packages PR**: When you merge this PR:
   - The package will be built
   - The new version will be published to npm automatically
   - A git tag will be created

### Manual Publishing (if needed)

If you need to publish manually:

```bash
# 1. Update versions based on changesets
npm run version

# 2. Build and publish
npm run release
```

**Note**: You'll need an NPM_TOKEN with publish access to `@dexie-kit/migrate`.

## Setting Up NPM_TOKEN

For automated publishing to work, add your npm token as a secret in GitHub:

1. Go to your repository settings
2. Navigate to Secrets and variables > Actions
3. Add a new secret named `NPM_TOKEN`
4. Paste your npm access token (get it from npmjs.com)

The token needs publish access to the `@dexie-kit` scope.

## Package Scope

This package is published under the `@dexie-kit` scope. The `.changeset/config.json` and `.npmrc` files are configured to publish as a public scoped package.
