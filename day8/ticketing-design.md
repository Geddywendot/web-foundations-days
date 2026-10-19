# TicketHub - Design Document

## 1. Requirements

**Functional**
- Browse and search published events.
- See which seats are available for an event.
- Hold seats for 10 minutes while completing checkout.
- Pay and receive tickets; view purchased tickets under user account.

**Non-functional**
- **Correctness:** A seat must NEVER be sold twice (data integrity is paramount).
- **Scalability:** Survive big sales of ~3,300 requests/second for 10 minutes.
- **Speed:** Event pages and seat maps load in under 1 second under normal traffic.
- **Fairness:** People who arrive first get the first chance to buy; prevent queue jumping and bot abuse.

---

## 2. Estimates

- **Normal day:** 50,000 visitors × 10 pages = 500,000 page views/day ≈ 5.8 requests/second. 5,000 tickets sold/day is roughly one sale every 17 seconds (~0.06 tickets/second).
- **Big sale:** 200,000 people in 10 minutes (600 seconds), each making roughly 10 requests (refreshing, viewing seats, holding, paying) = 2,000,000 requests ÷ 600 s ≈ **3,300 requests/second**—nearly 600–700 times normal traffic arriving simultaneously.
- **Inventory reality:** Only 20,000 seats exist, so at most 20,000 orders can succeed. The remaining 180,000 buyers will not get a ticket and must receive prompt, clear feedback rather than hanging connections.

---

## 3. API

All endpoints use JSON and return standard HTTP status codes:

- `GET /events?search=&city=` — list and search events (`200 OK`)
- `GET /events/{id}` — event details and pricing (`200 OK`)
- `GET /events/{id}/seats` — seat map with current availability status (`200 OK`)
- `POST /holds` — hold selected seats for checkout
  - Request body: `{ "eventId": 7, "seatIds": [101, 102], "idempotencyKey": "uuid" }`
  - Response: `201 Created` with `holdId` and expiry time
  - Conflict: `409 Conflict` if any requested seat is no longer available
- `POST /orders` — complete purchase for a held order
  - Request body: `{ "holdId": 55, "paymentToken": "tok_...", "idempotencyKey": "uuid" }`
  - Response: `201 Created` with confirmed tickets
  - Error: `400 Bad Request` or `409 Conflict` if the hold has expired
- `GET /me/tickets` — list confirmed tickets for the authenticated user (`200 OK`)

*HTTP 409 Conflict indicates the request clashes with current state (e.g., another buyer claimed the seat first).*

---

## 4. Data model

- **`users`**: `id` (PK), `name`, `email` (UNIQUE), `password_hash`, `created_at`
- **`events`**: `id` (PK), `name`, `venue`, `starts_at`, `sale_opens_at`
- **`seats`**: `id` (PK), `event_id` (FK → `events.id`), `section`, `row`, `number`, `price`, `status` (`'available'`, `'held'`, `'sold'`), `hold_id`, `hold_expires_at`, `UNIQUE (event_id, section, row, number)`
- **`orders`**: `id` (PK), `user_id` (FK → `users.id`), `event_id` (FK → `events.id`), `total`, `status` (`'holding'`, `'paid'`, `'expired'`), `created_at`, `idempotency_key`
- **`order_seats`**: `order_id` (FK → `orders.id`), `seat_id` (FK → `seats.id` UNIQUE)

**Relationships:**
- An event has many seats (`events 1:N seats`).
- A user has many orders (`users 1:N orders`).
- An order contains many seats, and each seat can belong to at most one order—strictly enforced by the `UNIQUE` constraint on `order_seats.seat_id`.

---

## 5. Preventing double-booking

Holding a seat uses a single atomic conditional update inside a database transaction:

```sql
BEGIN TRANSACTION;

UPDATE seats
SET status = 'held',
    hold_id = 55,
    hold_expires_at = NOW() + INTERVAL '10 minutes'
WHERE id IN (101, 102)
  AND event_id = 7
  AND (status = 'available'
       OR (status = 'held' AND hold_expires_at < NOW()));

-- If fewer than 2 rows were updated, another buyer claimed a seat first:
ROLLBACK;  -- Return 409 Conflict to the client

-- Otherwise, all requested seats were successfully claimed:
COMMIT;    -- Return 201 Created with hold details
```

**Why this guarantees correctness:**
1. **Atomic check-and-update:** The database evaluates the condition and applies the update in one atomic step. If two buyers attempt to hold the same seat simultaneously, only the first update succeeds; the second finds the seat already `'held'` and updates 0 rows, triggering an immediate `ROLLBACK`.
2. **Automatic expiration recovery:** The condition `(status = 'held' AND hold_expires_at < NOW())` allows expired holds to be claimed immediately without background cleanup delay.
3. **Double protection:** The `UNIQUE` constraint on `order_seats.seat_id` provides a hard database safety net preventing a seat from ever being attached to two completed orders.

---

## 6. Architecture

```text
Browser / Mobile Clients ──> CDN (event pages, images, static assets)
       │
       ▼
 Load balancer ──> Waiting room (virtual queue)
                          │ lets ~2,000 buyers in at a time
                          ▼
            App servers (auto-scaled for the sale)
              │                 │                  │
              ▼                 ▼                  ▼
       Cache (Redis):      Primary DB          Payment provider
       event pages,       (seats, orders -     (Stripe - external)
       seat map           all holds and
       (short TTL)        purchases here)
                                │
                                ▼
                       Read replicas (browsing, search)
                                │
                                Queue ──> Workers (ticket emails, PDFs)
```

**Component Breakdown:**
- **CDN:** Serves static frontend assets, event pages, and images from the edge, absorbing the bulk of browse traffic during the rush.
- **Waiting room:** During high-demand ticket drops, visitors enter a virtual FIFO queue and are admitted at a steady rate (~2,000 at a time) that the database can safely handle.
- **Load balancer + auto-scaled app servers:** Distributes requests across stateless application instances that scale out before known sales and scale in afterward.
- **Cache (Redis):** Caches event details and seat maps for a few seconds to absorb millions of view requests; actual seat-hold checks always execute against the primary database.
- **Primary database:** The single authoritative source for seat status, holds, and orders, guaranteeing transactional consistency.
- **Read replicas:** Handle browsing and search traffic so the primary database can focus exclusively on write transactions (holds and orders).
- **Queue + workers:** Processes post-payment tasks asynchronously (ticket generation, confirmation emails), keeping checkout fast and responsive.

---

## 7. Trade-offs

1. **Correctness over availability for purchases:** All hold and order writes go directly to the primary database. While this limits write throughput compared to distributed eventual-consistency databases, selling a seat twice is unacceptable.
2. **Freshness vs. speed for seat maps:** Caching the seat map for 2–5 seconds reduces read pressure by orders of magnitude. A seat may appear free when it was just held, but the buyer simply receives a `409 Conflict` and chooses another seat. The transactional hold check guarantees the final outcome is always correct.
3. **Fairness vs. simplicity:** The virtual waiting room introduces architectural complexity and forces buyers to wait in line. However, without it, bots and aggressive refreshers would claim all tickets while crashing origin servers for everyone else.
