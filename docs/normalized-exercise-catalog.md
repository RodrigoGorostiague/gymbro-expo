# Normalized Exercise Catalog

The curated exercise catalog is stored in PostgreSQL. The Excel workbooks are the only write source:

- `catalogo_ejercicios_gym.xlsx`
- `taxonomia_grupos_musculares.xlsx`

The mobile client has read-only access through authenticated RPCs. It cannot create, edit, or delete catalog exercises, muscle groups, hierarchy edges, roles, or relevance values.

## Tables

- `exercises` uses the workbook `EX-xxxx` ID as its primary key and retains all catalog attributes.
- `muscle_groups` uses the workbook `GM-xxx` ID as its primary key.
- `muscle_group_relations` retains `RG-xxxx`, supports multiple parents, and rejects self-references and cycles.
- `exercise_muscle_groups` retains `EM-xxxxx`, role, numeric relevance, original label, and source origin.

`muscle_groups.path` is the source workbook's display path. It is not used to resolve ancestry because the hierarchy is a DAG and a group can have more than one parent.

## Filters

`list_catalog_exercises_by_muscle_group(selected_group_id, participation_mode)` recursively includes the selected group and every descendant across workbook relations. It returns one row per exercise, ordered by greatest matched relevance and then canonical name.

- `primary_only`: source role `Principal`.
- `primary_and_secondary`: `Principal` and `Secundario`.
- `all_roles`: every stored role.

The current source contains only `Principal` and `Secundario`; it contains no stabilizer or co-principal rows.

## Local Development Reset

This command is destructive only to the local Docker database. It refuses to run unless all guards are supplied.

```bash
npx supabase db reset
ALLOW_DESTRUCTIVE_CATALOG_RESET=true \
CATALOG_RESET_ENV=development \
CATALOG_RESET_DOCKER_CONTAINER=supabase_db_gymbro \
npm run catalog:reset -- \
  /home/rodaja/Descargas/catalogo_ejercicios_gym.xlsx \
  /home/rodaja/Descargas/taxonomia_grupos_musculares.xlsx
```

The importer validates worksheets and headers by name, checks IDs, references, names, duplicate associations, relevance range, roles, missing primary muscles, and hierarchy cycles before beginning its transaction. It then wipes association rows, hierarchy rows, exercises, and groups in FK-safe order, imports the complete dataset, verifies the database report, and commits. Any failure rolls the entire database transaction back.

The app retains only immutable normalized catalog cache locally. Mutable training data is imported once into authenticated server-owned storage; see [Training State Persistence](training-state-persistence.md).

## Verification

```bash
npx supabase test db
npx tsc --noEmit
npm test
```

The importer logs source hashes, environment, deleted rows, imported rows, and the integrity report as JSON.

## Linked Remote Reset

Only run this after explicitly confirming that the linked project is non-production. It uses the authenticated Supabase CLI management channel and does not read local credentials.

```bash
ALLOW_DESTRUCTIVE_CATALOG_RESET=true \
CATALOG_RESET_ENV=development \
CATALOG_RESET_REMOTE_LINKED=true \
npm run catalog:reset -- \
  /home/rodaja/Descargas/catalogo_ejercicios_gym.xlsx \
  /home/rodaja/Descargas/taxonomia_grupos_musculares.xlsx
```
