# TiDB migration prerequisites

The migration runner checks these cluster settings before it creates the
migration ledger or applies any migration to TiDB:

| Setting | Required value | Purpose |
| --- | --- | --- |
| `tidb_enable_check_constraint` | `ON` | Enforces the reservation stay constraints created in migrations 003, 015, and 022. |
| `tidb_enable_foreign_key` | `ON` | Enables TiDB foreign key support. |
| `foreign_key_checks` | `ON` | Enables foreign key checks for writes. |

Check the current TiDB server settings with:

```sql
SELECT @@GLOBAL.tidb_enable_check_constraint AS check_constraints,
       @@GLOBAL.tidb_enable_foreign_key AS foreign_key_feature,
       @@GLOBAL.foreign_key_checks AS foreign_key_checks;
```

Set the settings through the TiDB cluster’s authorized administration path,
then verify the values again before running migrations. The migration runner
fails before schema DDL if any required value is off. TiDB documents CHECK
enforcement as disabled by default; adding a CHECK while it is disabled does
not provide the required business rule enforcement.

Migration 003 initially enforces a one-night reservation. Migration 022
reconciles both historical constraint names and replaces that rule with the
intended minimum stay: `DATEDIFF(check_out_date, check_in_date) >= 1`. Thus
multi-night stays are accepted while same-day and reversed stays are rejected.
