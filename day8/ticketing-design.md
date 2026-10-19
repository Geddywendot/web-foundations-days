# TicketHub System Design

## 1. Requirements

### Functional requirements

- Visitors can browse and search events and view event details, venue sections, prices, and seat availability.
- A signed-in user can temporarily hold one or more available seats, complete payment before the hold expires, and view their purchased tickets.
- A hold expires automatically if checkout is not completed; its seats become available again.
- The system sends a clear result when seats are unavailable or a payment fails. It must not issue more tickets than there are seats.
- Support 2 million registered users, 50,000 daily visitors, and 5,000 tickets sold on a normal day. A popular sale has 200,000 people trying to buy 20,000 seats in its first 10 minutes.

### Non-functional requirements

- **Correctness:** A seat can have at most one active holder or one completed sale. Payment and ticket issuance must be idempotent so retries do not create duplicate charges or tickets.
- **Speed:** Event and seat-map reads should feel responsive under normal use. During a sale, give each buyer a prompt queue or availability result; do not make the database serve an uncontrolled burst.
- **Fairness:** Publish the queue and sale policy, apply it consistently, and prevent clients from bypassing the queue to call seat-hold operations directly. Limit automated abuse without allowing retries to jump ahead.
- **Availability and durability:** Keep browsing available during a sale and persist completed orders and payment outcomes. If the write path is overloaded, queue or reject requests clearly rather than showing misleading availability.
- **Security:** Require authentication for holds, payments, and ticket access; validate all inputs; use a trusted payment provider and do not store card numbers.

## 2. Traffic estimates

Assumptions: daily averages are spread across 24 hours; each page view is one page/API read for this estimate. These averages do not include normal rush-hour peaks or retries.

### Normal day

- Page views: 50,000 visitors × 10 pages = **500,000 page views/day**.
- Average page-view rate: 500,000 ÷ 86,400 = **about 5.8 page views/second**.
- Ticket sales: 5,000 ÷ 86,400 = **about 0.058 tickets/second**, or one ticket every 17 seconds on average.

### Popular concert sale

- Buyer attempts: 200,000 ÷ 600 seconds = **about 333 people/second on average** for 10 minutes.
- If each person loads the event page, views the seat map, and submits one hold request, that is roughly **1,000 API requests/second** across those three actions, before retries, polling, payment, and any sharper-than-average bursts.
- At one seat per buyer, only 20,000 of the 200,000 attempts can succeed: **at most 10%**. The 20,000 seats represent an average of **33 successful seat sales/second** if sold evenly over the full 10 minutes; demand will not necessarily arrive evenly.
- The 333 event-page loads/second alone are about **58 times** the normal all-site average page-view rate. The 333 hold attempts/second are about **5,760 times** the normal average ticket-sale rate. These compare different measures and are useful as rough scale indicators, not direct capacity guarantees.

The waiting room should absorb and pace this burst so only admitted buyers reach the seat-hold write path at the rate the database can safely handle. The figures are averages; capacity testing must also cover opening-second spikes and retries.

## 3. API

All endpoints are under `/api`. Authenticated endpoints require a user session. Use an idempotency key for hold and payment submissions; return clear `4xx` errors for invalid, expired, or unavailable requests and `429 Too Many Requests` when throttled.

| Method and path | Purpose | Typical response |
|---|---|---|
| `GET /events?query=&date=&cursor=` | Browse/search published events, with pagination. | `200 OK` with event summaries and next cursor. |
| `GET /events/{eventId}` | Read event details, venue, sale status, and pricing information. | `200 OK`, or `404 Not Found`. |
| `GET /events/{eventId}/seats` | Read a seat map and current availability. Availability is advisory; a seat is not reserved until a hold succeeds. | `200 OK` with sections and seat statuses. |
| `POST /events/{eventId}/holds` | Hold selected seats for the authenticated user. Request includes `seatIds` and an idempotency key. | `201 Created` with `holdId`, held seats, and `expiresAt`; `409 Conflict` if any requested seat is no longer available. |
| `POST /orders/{orderId}/payment` | Pay for an active held order. Request includes a payment method token from the payment provider and an idempotency key. | `200 OK` with payment/order status; a declined payment does not mark seats sold. |
| `GET /me/tickets` | List the user's confirmed tickets and event/seat details. | `200 OK` with ticket records. |

## 4. Data model

Use a relational database as the authoritative source for seat ownership and order state. IDs below are primary keys; foreign keys enforce the stated relationships.

- **`users`**: `id`, `email UNIQUE`, `password_hash`, `created_at`. One user can own many orders.
- **`events`**: `id`, `name`, `venue`, `starts_at`, `sale_opens_at`, `status`. One event has many seats and orders.
- **`seats`**: `id`, `event_id FK -> events.id`, `section`, `seat_label`, `price`, `status` (`available`, `held`, `sold`), nullable `current_order_id FK -> orders.id`, nullable `hold_expires_at`. Add `UNIQUE (event_id, seat_label)` so a physical seat is represented only once for an event.
- **`orders`**: `id`, `user_id FK -> users.id`, `event_id FK -> events.id`, `status` (`holding`, `pending_payment`, `paid`, `expired`, `cancelled`), `created_at`, `expires_at`, `idempotency_key`. Add `UNIQUE (user_id, idempotency_key)` so a retried request cannot create a second order.
- **`order_items`**: `id`, `order_id FK -> orders.id`, `seat_id FK -> seats.id`, `price_at_purchase`. Add `UNIQUE (order_id, seat_id)` to prevent duplicate lines in one order. This records order contents; `seats.current_order_id` is the authoritative current assignment.
- **`payments`**: `id`, `order_id FK -> orders.id`, `provider_reference UNIQUE`, `status`, `amount`, `created_at`. One order can have payment attempts, identified idempotently with the provider; never store raw card details.

Relationships: `users 1:N orders`, `events 1:N seats`, `events 1:N orders`, `orders 1:N order_items`, `seats 1:N order_items` over their purchase history, and `orders 1:N payments`. A seat's nullable `current_order_id` points to at most one current order; it is cleared when a hold expires or is cancelled and retained for the paid order after sale.

## 5. Preventing double-booking

The seat row in the primary relational database is the source of truth. A seat-map response or cache can be slightly stale, so the hold transaction must re-check availability in the database.

For a multi-seat hold, the application starts a transaction, locks the requested seat rows (in a stable ID order), and confirms every seat is still `available` or has an expired hold. In the same transaction, it marks any previous expired order as expired, creates the new order, changes each seat to `held` with that order ID and an expiry time, and inserts the order items. It commits only if every requested seat succeeds; otherwise it rolls back the whole transaction and returns `409 Conflict`. A database-supported row lock such as `SELECT ... FOR UPDATE`, or an atomic conditional update (`... WHERE status = 'available'`), serializes competing attempts. If two buyers request the same seat, only one transaction can claim the row; the other sees it is no longer available and cannot create a valid hold.

On payment, verify the hold is still active and atomically change the order and its seats from held to paid/sold in a transaction. Expiration uses the same locking and conditional state transition, so it cannot release a seat that has already been sold. Do not keep a database transaction open while calling the external payment provider: use idempotent payment requests and reconcile provider outcomes. If payment succeeds after the hold has expired, void or refund it rather than issuing a ticket for an already reassigned seat.

## 6. Architecture

```text
 [Web / mobile clients]
          │
          ├── static assets and cached public event data ──> [CDN]
          │
          ▼
 [Load balancer / API gateway] <──> [Virtual waiting room]
          │ admitted, rate-limited requests
          ▼
 [Stateless application servers] ─────> [Cache]
          │                                  (event data and advisory
          │                                   seat-map availability)
          ├── authoritative reads/writes ──> [Relational primary]
          │                                      │
          │                                      └──> [Read replicas]
          │
          ├── payment requests ──> [Payment provider]
          │
          └── order/payment events ──> [Durable queue] ──> [Workers]
                                                         (expiry, ticket
                                                          delivery, retries)

 [Metrics, logs, alerts] observe the gateway, application, database,
 queue, and payment outcomes.
```

- **CDN:** Serves static files and cacheable public event details close to users, reducing origin traffic. It does not decide whether a seat is available.
- **Load balancer/API gateway:** Routes requests to healthy application instances, authenticates or verifies tokens, and applies request limits.
- **Virtual waiting room:** Gives users a controlled, fair admission path during a high-demand sale. It paces traffic to the write system and stops unadmitted clients from reaching hold endpoints.
- **Application servers:** Validate requests and implement the API; they are stateless so more instances can be added behind the load balancer.
- **Cache:** Speeds up event browsing and seat-map reads. Cached seat state is advisory only; the primary database decides every hold and sale.
- **Relational primary:** Serializes seat claims and commits order, inventory, and payment state changes with transactions and constraints. Read replicas can serve suitable non-critical reads, but never authorize a seat hold.
- **Durable queue and workers:** Handle hold-expiration tasks, ticket delivery, and retryable post-order work without blocking checkout. Expiration workers still use conditional database updates so delayed jobs cannot release a sold seat.
- **Payment provider:** Processes card details outside TicketHub; idempotency and reconciliation connect its outcomes safely to orders.
- **Metrics, logs, and alerts:** Track queue wait time, request rates, hold conflicts, database latency, payment results, and errors so operators can respond before users receive misleading results.

During the big sale, CDN/cache absorb repeat reads, the waiting room prevents 200,000 clients from stampeding the primary, and horizontal app scaling handles admitted traffic. The relational primary remains the narrow, serialized authority for seat claims; replicas and caches are deliberately kept out of the correctness-critical write path.

## 7. Trade-offs

- **Strict database transactions vs. maximum write throughput:** Serializing each seat claim protects correctness, but the primary database can become the sale bottleneck. Admission control and short transactions bound its load; scaling the database is more involved than scaling stateless app servers.
- **Fair queue vs. immediate access:** A waiting room makes overload manageable and gives buyers a consistent policy, but adds wait time and infrastructure. A queue can also feel unfair if its admission rules are opaque, so publish how it works and make tokens difficult to duplicate or bypass.
- **Cached availability vs. freshness:** Caching seat maps reduces read load, but some displayed seats may already be held by someone else. Mark availability as provisional and confirm only through the transactional hold endpoint.
- **Timed holds vs. checkout flexibility:** Expiring holds prevent abandoned carts from blocking seats, but a buyer can lose a seat while paying. Choose and communicate a reasonable hold window, and handle late payment success with a void/refund rather than overselling.
