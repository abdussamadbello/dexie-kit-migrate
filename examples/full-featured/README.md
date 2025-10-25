# Full-Featured Example

This example demonstrates all features of dexie-migrate:

1. ✅ Multiple migrations
2. ✅ Schema snapshot and validation
3. ✅ Migration squashing
4. ✅ Multi-tab coordination
5. ✅ Progress UI
6. ✅ Vite plugin integration

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

## Build

```bash
npm run build
```

## CLI Commands

```bash
# Create new migration
npm run migrate:new "add new feature"

# Create snapshot
npm run migrate:snapshot

# Check for drift
npm run migrate:check

# View schema
npm run migrate:schema
```

## Features Demonstrated

### 1. Migrations

See `migrations/` directory for:
- Initial schema (0001)
- Adding fields (0002)
- Data transformation (0003)

### 2. Multi-Tab Coordination

Open multiple tabs - only one will run migrations at a time.

### 3. Progress UI

Shows real-time migration progress with a clean UI.

### 4. Vite Plugin

Automatically imports all migrations using `virtual:dexie-migrate/migrations`.

### 5. Snapshot Validation

Build-time validation ensures schema hasn't drifted.
