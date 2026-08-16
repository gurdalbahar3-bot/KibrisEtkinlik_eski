# RPC Deprecation Plan

**Rule:** Do not delete legacy RPCs until dependency analysis confirms zero usage.

New application code **must** use `_atomic` variants where available.

---

## Legacy → preferred mapping

| Legacy (034) | Preferred | Status |
|--------------|-----------|--------|
| `upsert_event_ticket_type` | Use 045 zone/type atomic paths where applicable | Deprecated for new code |
| `upsert_event_seat_pricing` | `save_event_seat_pricing_batch_atomic` (045) | Deprecated for new code |
| `block_event_resource` | `block_event_resource_atomic` (045) | Deprecated for new code |
| `deactivate_package` | `deactivate_table_package_atomic` (045) | Deprecated for new code |
| `publish_event` | Same (no atomic duplicate yet) | **Active** |
| `postpone_event` | Same | **Active** — review with 054 |
| `reschedule_event` | Same | **Active** — review with 054 |
| `mark_venue_collected_atomic` | Same | **Active** |

---

## Checkout RPCs (034 — all active)

These remain authoritative until superseded:

- `reserve_ticket_capacity_atomic`
- `reserve_seat_atomic`
- `reserve_table_atomic`
- `create_mixed_cart_atomic` — **050 will extend** for package selections
- `expire_order_atomic`
- `confirm_payment_atomic`
- `fail_payment_atomic`
- `use_qr_atomic`
- `transfer_reservation_atomic`

---

## Removal criteria

1. All frontend/API callers migrated to preferred RPC
2. Integration tests cover preferred path
3. 30-day monitoring shows zero legacy calls (when logging available)
4. Corrective migration documents removal in 048+ changelog

---

## Documentation requirement

When adding new RPCs, update:
- [`CURRENT_STATE_ARCHITECTURE.md`](../CURRENT_STATE_ARCHITECTURE.md) RPC inventory
- This file if a legacy RPC is superseded
