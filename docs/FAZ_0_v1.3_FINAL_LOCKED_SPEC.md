# FAZ 0 v1.3 — RECONCILED FINAL LOCKED SPEC

**Proje:** Kıbrıs Etkinlik & Rezervasyon Platformu  
**Durum:** Migration/kod öncesi kilitli teknik mimari  
**Onay:** Bağımsız teknik denetim — CRITICAL: 0 · HIGH: 0 · MEDIUM: 0 · PRE-CODING LOCK CHECK PASSED  
**İş kaynağı:** `ANA_PROJE_DOKUMANI_v1.1.docx`

---

## 0. Kilit Özet

| Öğe | Değer |
|-----|-------|
| Tablo | **66** |
| Migration | **34** (001–034) |
| Atomic RPC | **17** (hepsi migration 034) |
| Trigger | Migration 033 |
| RLS | Migration 034 |
| Redis | Yok (V1) |
| financial_ledger | Yok (V1) |
| Offline QR (V1) | Yok — yalnızca placeholder tablolar |
| Belediye/festival tabloları | V2 |

---

## 1. C1–C14 Kilitlenmiş Kararlar

| Karar | Kilitlenen uygulama |
|-------|---------------------|
| **C1** | Migration 023: `tickets`, `table_reservations`, `seat_reservations`.`qr_code_id` **nullable, FK yok**. Migration 025: `qr_codes` oluşturulur → **ALTER TABLE** ile FK eklenir. Yeni tablo/ilişki yok. |
| **C2** | Migration 002: `system_settings.updated_by` **nullable, FK yok**. Migration 003: `profiles` sonrası `updated_by → profiles(id)` FK eklenir. Yeni kolon yok. |
| **C3** | `seat_reservations.zone_id` **EKLENMEYECEK**. |
| **C4** | Migration 021: `orders.currency text NULL`. DEFAULT yok. TRY varsayımı yok. NOT NULL yok. Para birimi ileride ödeme/business katmanında kesinleştirilecek. |
| **C5** | Masa kısmi ödeme `payment_line_items`: **obligation + allocation_online + allocation_venue**. Örnek: 25.000 / 10.000 / 15.000. |
| **C6** | Tam online ödeme: **allocation_venue = 0** explicit/invariant. |
| **C7** | `deposits.reservation_type` CHECK: `IN ('table_reservation')` only. V1 kapora yalnızca masa rezervasyonu. |
| **C8** | `mark_venue_collected_atomic`: **payment_line_items değiştirmez**; yalnızca `venue_collected_amount`, `venue_collected_at`, `financial_status`. |
| **C9** | Yeni `notification_type`, `schedule_change_id`, `idempotency_key` kolonu **EKLENMEYECEK**. Idempotency **RPC seviyesinde**, insert öncesi duplicate kontrol. |
| **C10** | Postpone/reschedule: **kullanıcı + event başına tek bildirim**. |
| **C11** | `confirm_payment_atomic`: yalnızca `published` event; `events FOR UPDATE`; lock sırası `postpone_event` ile aynı. |
| **C12** | Spec repoda tutulur (`docs/FAZ_0_v1.3_FINAL_LOCKED_SPEC.md`). |
| **C13** | Git init/remote/commit — ayrı onay. |
| **C14** | Supabase bağlantısı — ayrı onay. |

---

## 2. 66 Tablo — Tam Liste

| # | Tablo | Migration |
|---|-------|-----------|
| 1 | system_settings | 002 |
| 2 | profiles | 003 |
| 3 | customer_profiles | 004 |
| 4 | venue_owner_profiles | 004 |
| 5 | organizer_profiles | 004 |
| 6 | roles | 005 |
| 7 | role_permissions | 005 |
| 8 | super_admin_profiles | 006 |
| 9 | account_applications | 007 |
| 10 | venues | 008 |
| 11 | venue_areas | 008 |
| 12 | venue_tables | 009 |
| 13 | venue_seats | 009 |
| 14 | artists | 010 |
| 15 | events | 011 |
| 16 | event_formats | 012 |
| 17 | event_venue_contacts | 012 |
| 18 | event_locations | 012 |
| 19 | event_schedule_changes | 012 |
| 20 | event_artists | 013 |
| 21 | event_ticket_zones | 014 |
| 22 | event_ticket_types | 014 |
| 23 | event_seat_pricing | 015 |
| 24 | event_tables | 016 |
| 25 | event_resource_blocks | 017 |
| 26 | table_packages | 018 |
| 27 | package_items | 018 |
| 28 | package_item_options | 018 |
| 29 | package_upgrades | 018 |
| 30 | package_upgrade_options | 018 |
| 31 | wedding_details | 019 |
| 32 | bus_routes | 020 |
| 33 | bus_stops | 020 |
| 34 | bus_return_times | 020 |
| 35 | orders | 021 |
| 36 | order_items | 021 |
| 37 | order_item_selections | 021 |
| 38 | resource_locks | 022 |
| 39 | tickets | 023 |
| 40 | table_reservations | 023 |
| 41 | seat_reservations | 023 |
| 42 | payments | 024 |
| 43 | payment_line_items | 024 |
| 44 | deposits | 024 |
| 45 | tax_line_items | 024 |
| 46 | commission_records | 024 |
| 47 | settlement_records | 024 |
| 48 | refund_records | 024 |
| 49 | qr_codes | 025 |
| 50 | qr_scan_logs | 025 |
| 51 | hotel_internal_qr | 026 |
| 52 | reservation_transfers | 027 |
| 53 | staff_invitations | 028 |
| 54 | staff_assignments | 028 |
| 55 | event_staff_permissions | 028 |
| 56 | staff_devices | 028 |
| 57 | notification_rules | 029 |
| 58 | notifications | 029 |
| 59 | notification_deliveries | 029 |
| 60 | social_links | 030 |
| 61 | follows | 030 |
| 62 | offline_scan_queue | 031 |
| 63 | offline_event_snapshots | 031 |
| 64 | audit_logs | 032 |
| 65 | super_admin_actions | 032 |
| 66 | featured_listings | 032 |

### Tablo grupları

| Grup | Tablolar |
|------|----------|
| Sistem | system_settings, audit_logs, super_admin_actions, featured_listings |
| Kimlik | profiles, customer_profiles, venue_owner_profiles, organizer_profiles, super_admin_profiles, account_applications |
| Rol | roles, role_permissions |
| Mekan | venues, venue_areas, venue_tables, venue_seats |
| Sanatçı (V1) | artists, event_artists |
| Etkinlik | events, event_formats, event_venue_contacts, event_locations, event_schedule_changes, event_ticket_zones, event_ticket_types, event_seat_pricing, event_tables, event_resource_blocks, wedding_details |
| Ulaşım | bus_routes, bus_stops, bus_return_times |
| Paket | table_packages, package_items, package_item_options, package_upgrades, package_upgrade_options |
| Sipariş | orders, order_items, order_item_selections |
| Kilit | resource_locks |
| Rezervasyon | tickets, table_reservations, seat_reservations, reservation_transfers |
| Finans | payments, payment_line_items, deposits, tax_line_items, commission_records, settlement_records, refund_records |
| QR | qr_codes, qr_scan_logs, offline_scan_queue, offline_event_snapshots |
| Otel | hotel_internal_qr |
| Personel | staff_invitations, staff_assignments, event_staff_permissions, staff_devices |
| Bildirim | notification_rules, notifications, notification_deliveries |
| Sosyal | social_links, follows |

---

## 3. 34 Migration Planı (001–034)

| Migration | Dosya adı (öneri) | Oluşturulan yapılar |
|-----------|-------------------|---------------------|
| **001** | `001_extensions_and_enums.sql` | PostgreSQL extensions; tüm enum/CHECK tipleri |
| **002** | `002_system_settings.sql` | system_settings (`updated_by` NULL, FK yok) |
| **003** | `003_profiles.sql` | profiles + alt profiller + system_settings.updated_by FK |
| **004** | `004_role_profiles.sql` | customer_profiles, venue_owner_profiles, organizer_profiles |
| **005** | `005_roles.sql` | roles, role_permissions |
| **006** | `006_super_admin.sql` | super_admin_profiles |
| **007** | `007_account_applications.sql` | account_applications |
| **008** | `008_venues.sql` | venues, venue_areas |
| **009** | `009_venue_resources.sql` | venue_tables, venue_seats |
| **010** | `010_artists.sql` | artists |
| **011** | `011_events.sql` | events |
| **012** | `012_event_core_relations.sql` | event_formats, event_venue_contacts, event_locations, event_schedule_changes |
| **013** | `013_event_artists.sql` | event_artists |
| **014** | `014_ticket_zones_types.sql` | event_ticket_zones, event_ticket_types |
| **015** | `015_seat_pricing.sql` | event_seat_pricing |
| **016** | `016_event_tables.sql` | event_tables |
| **017** | `017_event_resource_blocks.sql` | event_resource_blocks |
| **018** | `018_table_packages.sql` | table_packages, package_items, package_item_options, package_upgrades, package_upgrade_options |
| **019** | `019_wedding_details.sql` | wedding_details |
| **020** | `020_bus_transport.sql` | bus_routes, bus_stops, bus_return_times |
| **021** | `021_orders.sql` | orders (`currency text NULL`), order_items, order_item_selections |
| **022** | `022_resource_locks.sql` | resource_locks |
| **023** | `023_reservations.sql` | tickets, table_reservations, seat_reservations (qr_code_id NULL, FK yok) |
| **024** | `024_payments_finance.sql` | payments, payment_line_items, deposits, tax_line_items, commission_records, settlement_records, refund_records |
| **025** | `025_qr.sql` | qr_codes, qr_scan_logs + ALTER qr_code_id FK |
| **026** | `026_hotel_internal_qr.sql` | hotel_internal_qr |
| **027** | `027_reservation_transfers.sql` | reservation_transfers |
| **028** | `028_staff.sql` | staff_invitations, staff_assignments, event_staff_permissions, staff_devices |
| **029** | `029_notifications.sql` | notification_rules, notifications, notification_deliveries |
| **030** | `030_social.sql` | social_links, follows |
| **031** | `031_offline_placeholders.sql` | offline_scan_queue, offline_event_snapshots |
| **032** | `032_audit_admin_featured.sql` | audit_logs, super_admin_actions, featured_listings |
| **033** | `033_triggers_validation_immutability.sql` | Cross-event/venue trigger'lar; immutability; auth→profiles; state guards |
| **034** | `034_rls_rpc_indexes.sql` | RLS (tüm tablolar); 17 SECURITY DEFINER RPC; index'ler |

### Migration bağımlılık zinciri (özet)

```
001 enums/extensions
  ↓
002 system_settings (updated_by NULL, FK yok)
  ↓
003 profiles + alt profiller + system_settings.updated_by FK
  ↓
004–007 kimlik/rol başvuruları
  ↓
008 venues → 009 venue_tables/seats
  ↓
010 artists → 011 events → 012 event ilişkileri + event_schedule_changes
  ↓
013–020 etkinlik alt yapıları
  ↓
021 orders → 022 resource_locks → 023 reservations (qr_code_id NULL)
  ↓
024 payments/finance → 025 qr + ALTER FK → 026–032
  ↓
033 triggers → 034 RLS + RPC + indexes
```

### Kritik bağımlılık kuralları

| Kural | Neden |
|-------|--------|
| `events` (011) önce `venues` (008) | `events.venue_id NOT NULL` |
| `resource_locks` (022) önce `orders` (021) | order_id FK |
| `reservations` (023) önce orders + zones/tables/seats | FK zinciri |
| `qr_codes` (025) önce reservations; FK ALTER 025'te | C1 circular FK |
| `system_settings.updated_by` FK 003'te | C2 |
| Trigger'lar (033) tüm tablolardan sonra | Tablo referansları |
| RPC + RLS (034) trigger'lardan sonra | Fonksiyon + policy bağımlılığı |

---

## 4. 17 Atomic RPC (Migration 034)

| # | RPC | Grup |
|---|-----|------|
| 1 | `create_mixed_cart_atomic` | Sepet / rezervasyon |
| 2 | `reserve_ticket_capacity_atomic` | Internal helper (zone counter) |
| 3 | `reserve_seat_atomic` | Internal helper (seat lock) |
| 4 | `reserve_table_atomic` | Internal helper (table lock + snapshot) |
| 5 | `expire_order_atomic` | Sipariş yaşam döngüsü |
| 6 | `confirm_payment_atomic` | Ödeme |
| 7 | `fail_payment_atomic` | Ödeme |
| 8 | `use_qr_atomic` | Kapı (V1 online) |
| 9 | `transfer_reservation_atomic` | Devir |
| 10 | `publish_event` | Etkinlik yönetimi |
| 11 | `postpone_event` | Erteleme |
| 12 | `reschedule_event` | Yeniden planlama |
| 13 | `upsert_event_ticket_type` | Etkinlik CRUD |
| 14 | `upsert_event_seat_pricing` | Etkinlik CRUD |
| 15 | `block_event_resource` | Bloklama |
| 16 | `deactivate_package` | Paket |
| 17 | `mark_venue_collected_atomic` | Mekan tahsilatı |

**Migration 033 (RPC değil):** Cross-event/venue validation trigger fonksiyonları; immutability trigger'lar; auth → profiles; state transition guard trigger'ları; zone mode validation trigger'ları.

**Kural:** Kritik yazma yolları SECURITY DEFINER RPC üzerinden; doğrudan client INSERT/UPDATE/DELETE yasak (qr_codes, orders, payments vb.).

Her RPC: `SET search_path = public` (veya sabit şema).

---

## 5. Üç Kapasite Modeli (Karıştırılamaz)

| Tür | Mekanizma | resource_locks |
|-----|-----------|----------------|
| Genel giriş / ayakta | `event_ticket_zones` atomik `reserved_count` / `sold_count` | **Hayır** |
| Numaralı koltuk | `resource_locks` + `seat_reservations` + partial UNIQUE | **Evet** |
| Masa | `resource_locks` + `table_reservations` + partial UNIQUE | **Evet** |

**Koruma:** `SELECT FOR UPDATE`, partial UNIQUE index, tek transaction RPC. Redis yok.

**Geçici kilit TTL:** 10 dakika (`system_settings.resource_lock_ttl_minutes`).

**Cross-table CHECK yasak:** Zone mode uyumu (`ticket_based` / `seat_based`) trigger + RPC ile doğrulanır.

---

## 6. State Machine'ler

### 6.1 Event (`events.status`)

```
draft → published → postponed ↔ (reschedule) → published
published → cancelled | completed
postponed → cancelled | completed
```

| Durum | Yeni satış | Not |
|-------|------------|-----|
| draft | Hayır | |
| published | Evet | confirm_payment yalnızca bu durumda (C11) |
| postponed | Hayır | starts_at/ends_at değişmez; reschedule ile güncellenir |
| cancelled | Hayır | |
| completed | Hayır | |

CHECK: `status IN ('draft','published','postponed','cancelled','completed')`

**Kaldırıldı:** `events.owner_account_type` — sahiplik `owner_id` + `profiles.account_type` ile.

**Zorunlu:** `events.venue_id NOT NULL`.

### 6.2 Order (`orders.status`)

```
draft → pending_payment → paid | failed | expired | cancelled_by_organizer
```

- `expired → paid` **yasak** (RPC + expire/confirm yarış koruması)
- Sipariş TTL: 10 dakika (`expires_at`)

### 6.3 Ticket (`tickets.status`)

```
pending_payment → active → used | transferred
pending_payment → cancelled_by_organizer
active → cancelled_by_organizer
```

### 6.4 Table / Seat Reservation

```
pending_payment → confirmed → used | transferred
pending_payment → cancelled_by_organizer
confirmed → cancelled_by_organizer
```

### 6.5 QR (`qr_codes.status`)

```
active → used | revoked
```

**Postponed event davranışı:**
- Ödenmiş QR kodları **`active` kalır** — `revoked` yapılmaz, `used` yapılmaz
- `use_qr_atomic` postponed event'te: **`EVENT_POSTPONED`** döner; QR `used` olmaz
- Transfer sonrası eski QR `revoked`, yeni QR `active`

### 6.6 Financial Status (`table_reservations.financial_status`)

```
pending_payment → online_paid → partially_collected_at_venue → venue_balance_settled
```

CHECK: `IN ('pending_payment','online_paid','partially_collected_at_venue','venue_balance_settled')`

---

## 7. Postponement / Rescheduling

### 7.1 `event_schedule_changes` (migration 012)

Erteleme/yeniden planlama audit trail tablosu. 66. tablo.

### 7.2 `postpone_event` RPC

```
BEGIN
  1. SELECT * FROM events WHERE id = ? FOR UPDATE
  2. VALIDATE: status = 'published' (zaten postponed → idempotent no-op)
  3. UPDATE events SET status = 'postponed'
     -- starts_at / ends_at DEĞİŞMEZ
  4. INSERT event_schedule_changes (change_type = 'postpone', ...)
  5. TEMİZLİK — pending kayıtlar:
     - pending_payment orders → expired/cancelled
     - pending_payment tickets → cancelled
     - pending_payment table/seat_reservations → cancelled
     - active resource_locks → released
     - event_ticket_zones reserved_count → düşür (pending ticket release)
  6. KORU — paid/confirmed/active kayıtlar değişmez
  7. BİLDİRİM — affected users, RPC idempotency (C9/C10): user + event başına tek
COMMIT
```

### 7.3 `reschedule_event` RPC

```
BEGIN
  1. SELECT * FROM events WHERE id = ? FOR UPDATE
  2. VALIDATE: status IN ('postponed','published')
  3. UPDATE events SET starts_at = ?, ends_at = ?, status = 'published'
  4. INSERT event_schedule_changes (change_type = 'reschedule', ...)
  5. BİLDİRİM — RPC idempotency (C9/C10)
COMMIT
```

### 7.4 Concurrency (postpone ↔ payment)

| Kural | Uygulama |
|-------|----------|
| `postpone_event`: `events FOR UPDATE` | Kilitli |
| `confirm_payment_atomic`: `events FOR UPDATE`, aynı lock sırası | C11 |
| Postponed/cancelled/completed event'te ödeme red | C11 |
| Pending temizliği postpone'da | Kilitli |
| Paid kayıtlar korunur | Kilitli |

---

## 8. Finansal Model ve Invariantlar

### 8.1 Temel invariant

```
obligation = allocation_online + allocation_venue
(deposit/venue_balance obligation üzerine ek gelir DEĞİLDİR)

gross_total = online_paid + remaining_due
payments.amount = allocation_online (kısmi ödeme adımında)
```

### 8.2 `payment_line_items.line_role`

CHECK: `IN ('obligation','allocation_online','allocation_venue','commission','tax','refund','fee','adjustment')`

| line_type | line_role | Toplama |
|-----------|-----------|---------|
| gross | obligation | Yükümlülük — bir kez sayılır |
| deposit | allocation_online | Gross parçası |
| venue_balance | allocation_venue | Gross parçası |
| gross (tam online) | allocation_online | allocation_venue = 0 (C6) |

**Immutability:** INSERT sonrası UPDATE/DELETE yasak (migration 033 trigger).

**V1 yok:** financial_ledger.

**Kesin iş kuralları:** Kapora iade yok; müşteri iade yok.

### 8.3 Kapora alan eşlemesi (masa)

| Kavram | Tablo / Alan |
|--------|--------------|
| total | orders.total_amount, table_reservations.snapshot_total_amount |
| deposit | snapshot_deposit_amount, deposits.amount |
| remaining | snapshot_remaining_amount, orders.amount_remaining |
| paid online | orders.amount_paid_online, payments.amount |
| venue collected | table_reservations.venue_collected_amount |

### 8.4 `deposits` (C7)

- `reservation_type IN ('table_reservation')` only
- Polymorphic `reservation_id` — FK yok

### 8.5 `mark_venue_collected_atomic` (C8)

- Yalnızca `table_reservations.venue_collected_amount`, `venue_collected_at`, `financial_status`
- **payment_line_items dokunulmaz**
- `FOR UPDATE` row lock
- `p_amount <= snapshot_remaining_amount - venue_collected_amount`

### 8.6 KARAR BEKLİYOR (schema dışı / iş katmanı)

- Ödeme sağlayıcısı seçimi ve implementasyonu
- Komisyon oranı / matrahı
- Vergi oranı
- Hakediş oranı
- Mekan tahsilatının ayrı finansal kaydı (V1'de payment_line_items'e yazılmaz)

---

## 9. Concurrency Kuralları

| Operasyon | Mekanizma |
|-----------|-----------|
| Bilet kapasitesi | `event_ticket_zones FOR UPDATE` + atomik counter |
| Koltuk/masa kilidi | `resource_locks` partial UNIQUE + `FOR UPDATE` |
| Sipariş expire/confirm | Order + event row lock |
| Postpone/confirm yarış | `events FOR UPDATE` (aynı sıra) |
| Venue tahsilat | `table_reservations FOR UPDATE` |
| Karma sepet | Tek `BEGIN…COMMIT`; hata → tam ROLLBACK |

### `create_mixed_cart_atomic` — 8 adımlı transaction

1. VALIDATE (event published, düğün reddi, kalemler geçerli)
2. CREATE ORDER (tek, pending_payment, expires_at +10dk)
3. VALIDATE ALL ITEMS (okuma, blok/kapasite ön kontrol)
4. TICKET ITEMS (zone counter, resource_locks yok)
5. SEAT ITEMS (resource_locks + seat_reservations)
6. TABLE ITEMS (resource_locks + table_reservations + snapshots)
7. ORDER_ITEMS + SNAPSHOTS + tutar hesaplama
8. LINK (order_id bağlantıları) → COMMIT

---

## 10. Cross-Event / Cross-Venue Validation

**Kural:** PostgreSQL cross-table CHECK **kullanılmaz**.

### Trigger fonksiyonları (migration 033)

| Trigger | Tablo | Doğrulama |
|---------|-------|-----------|
| `trg_ticket_type_same_event` | event_ticket_types | zone.event_id = NEW.event_id |
| `trg_seat_pricing_venue_match` | event_seat_pricing | seat.venue = event.venue |
| `trg_seat_pricing_zone_event` | event_seat_pricing | zone.event_id = NEW.event_id |
| `trg_event_tables_venue_match` | event_tables | table.venue = event.venue |
| `trg_table_package_same_event` | table_packages | event_table.event_id = NEW.event_id |
| `trg_table_reservation_chain` | table_reservations | event/table/venue/package zinciri |
| `trg_seat_reservation_chain` | seat_reservations | seat_pricing.event = NEW.event_id |
| `trg_ticket_chain` | tickets | type/zone event zinciri |
| `trg_resource_block_valid` | event_resource_blocks | Polymorphic venue eşleşmesi |
| `trg_validate_ticket_type_zone_mode` | event_ticket_types | zone sale_mode = ticket_based |
| `trg_validate_seat_pricing_zone_mode` | event_seat_pricing | zone sale_mode = seat_based |

**seat_based zone:** `reserved_count` / `sold_count` = 0 guard trigger.

---

## 11. Notification Kuralları

### `notifications` şeması (değişmez — C9)

```
id, user_id, event_id, reference_type, reference_id,
title, body, scheduled_at, status, created_at
```

**reference_type CHECK:** `IN ('ticket','table_reservation','seat_reservation','order')`

### Idempotency (C9 + C10)

- Yeni kolon **eklenmez**
- Postpone/reschedule: **kullanıcı + event başına tek bildirim**
- Uygulama: `postpone_event` / `reschedule_event` RPC içinde insert öncesi duplicate kontrol
- DB unique index yok — bilinçli karar (C9)

### Hatırlatma seed (migration sonrası)

`notification_rules.offsets_minutes = [1440, 180, 60, 30, 10]`  
`exclude_wedding = true`

---

## 12. SECURITY DEFINER + RLS + auth.uid()

| Kural | Uygulama |
|-------|--------|
| Tüm tablolarda RLS | Migration 034 |
| Kritik yazma SECURITY DEFINER RPC | Migration 034 |
| Yetki: `auth.uid()` | Transfer'de parametre `from_user` yok |
| JWT claims | sub, account_type, is_super_admin, verification_status, staff_roles[] |
| search_path | Her RPC'de sabit (`public`) |

**Super Admin bootstrap:** Otomatik self-bootstrap yok; ilk Super Admin manuel oluşturulur.

---

## 13. Transfer

- Tek model: `reservation_transfers`
- Eski QR → `revoked`; yeni QR → `active`
- `orders`, `order_items`, `order_item_selections` **değişmez**
- Bilet, masa, koltuk devri desteklenir

---

## 14. QR (V1 Online)

- Ödeme sonrası QR `active`
- `use_qr_atomic` → `used` (tek kullanım); ikinci → `already_used`
- Postponed event → `EVENT_POSTPONED`, QR active kalır
- V1 offline tarama yok; `offline_scan_queue`, `offline_event_snapshots` placeholder

---

## 15. Spec Dışı — Eklenmeyecekler

| Öğe | Durum |
|-----|--------|
| `seat_reservations.zone_id` | Eklenmeyecek (C3) |
| `notifications` yeni kolonlar | Eklenmeyecek (C9) |
| `orders.currency` DEFAULT/NOT NULL/TRY | Yok (C4) |
| `deposits.reservation_type` seat/ticket | Yok (C7) |
| `events.owner_account_type` | Kaldırıldı |
| `venue_tables/seats.status` | Yok (türetilmiş durum) |
| financial_ledger, Redis | V1 yok |
| Belediye/festival tabloları | V2 |
| Otomatik Super Admin bootstrap | Yok |

---

## 16. V1 Kapsam Kararları (İş)

| Konu | V1 |
|------|-----|
| Sanatçı | artists + event_artists + filtre + takip altyapısı |
| Düğün | Ücretsiz; otomatik hatırlatma yok; bilet/masa satışı yok |
| Otel | Ayrı hotel hesabı yok; venue_owner + hotel_internal_qr |
| Organizatör mekan | Kayıtlı mekan zorunlu (`venue_id NOT NULL`) |
| Multi-format satış | ticket + seat + table aynı etkinlikte |
| Kapora | Yalnızca masa (C7) |

---

## 17. KARAR BEKLİYOR (Varsayım Yapılmaz)

| Konu | Not |
|------|-----|
| Ödeme sağlayıcısı | Seçilmedi; implementasyon V1 dışı plan |
| Web/mobil framework | Seçilmedi |
| Para birimi business logic | C4: schema `text NULL`; değer business katmanında |
| Komisyon / vergi / hakediş oranları | Schema hazır; oranlar belirsiz |
| Bildirim provider (SMS/email/whatsapp) | notification_deliveries.provider |
| Staff device pairing detayı | staff_devices alanları hazır |
| Super Admin oluşturma prosedürü | Manuel; otomatik bootstrap yok |

---

## 18. Seed Planı (Migration Sonrası)

| Seed | İçerik | Bağımlılık |
|------|--------|------------|
| seed_system_settings.sql | resource_lock_ttl_minutes = 10 | 002 |
| seed_roles.sql | admin, reservation, event, door_staff, accounting | 005 |
| seed_notification_rules.sql | offsets [1440,180,60,30,10], exclude_wedding=true | 029 |

---

## 19. Versiyon Geçmişi

| Versiyon | Değişiklik |
|----------|------------|
| v1.0 | Finans line_role; 34 migration; cross-event triggers; mark_venue_collected spec |
| v1.1 | event_schedule_changes (66. tablo); postpone/reschedule RPC; postponed event status; QR postponed davranışı |
| v1.3 | C1–C14 reconciled; C4/C7/C9 kapanış; PRE-CODING LOCK CHECK PASSED |

---

**FAZ 0 v1.3 — RECONCILED FINAL LOCKED SPEC — KİLİTLİ**
