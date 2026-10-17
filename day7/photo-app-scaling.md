# SnapShare Photo-App Scaling Plan

## 1. Assumptions

- SnapShare has 10 million registered users, and 10% are active on an average day.
- Each daily active user uploads one photo and views 50 feed pages each day.
- An original photo is 2 MB and its thumbnail is 50 KB; both are retained.
- A year has 365 days. For easy capacity estimates, MB and KB are decimal units (1 MB = 1,000,000 bytes, 1 TB = 1,000,000 MB).
- Daily activity is averaged across 24 hours. Feed peak traffic is estimated at 5 times the average; uploads are also shown with the same factor as an illustrative peak.
- Storage estimates count new image files only: they exclude database metadata, indexes, backups, replication, and storage overhead, and assume no deletions or compression.

**Daily active users (DAU):** 10,000,000 registered users × 10% = **1,000,000 DAU**.

## 2. Traffic and storage estimates

- **Uploads:** 1,000,000 photos/day ÷ 86,400 seconds/day = **about 11.6 uploads/second on average**; at 5×, plan for about **57.9 uploads/second** during a peak.
- **Feed views:** 1,000,000 users × 50 pages/day = 50,000,000 pages/day; ÷ 86,400 = **about 579 feed views/second on average** and **about 2,894/second at 5× peak**.
- **Original photo storage per year:** 1,000,000 photos/day × 365 × 2 MB = **730,000,000 MB = 730 TB/year**.
- **Thumbnail storage per year:** 1,000,000 × 365 × 0.05 MB = **18,250,000 MB = 18.25 TB/year**.
- **Total new image storage per year:** 730 TB + 18.25 TB = **748.25 TB/year**, before the excluded overhead and copies.

These are steady-state averages, not guaranteed capacity limits; real capacity should allow for burstier usage and growth.

## 3. Read or write heavy?

SnapShare is **read-heavy**: there are 50 feed-page reads per active user per day for every one photo upload, or roughly 50 feed reads per upload. The design therefore uses caching, a read replica, and a CDN to scale repeated feed and image reads, while the primary database handles authoritative metadata writes.

## 4. Where photo files belong

Photo bytes should not be stored inside the relational database: large binary values make database storage, backups, replication, and queries more expensive and can compete with latency-sensitive metadata operations. Store originals and thumbnails in scalable **object storage**, and keep object keys, ownership, captions, timestamps, and other searchable metadata in the database; the CDN can cache and deliver the image files close to viewers.

## 5. Architecture diagram

```text
                         feed/API requests
 [Client] ────────────────────────> [CDN] ── cache miss/API ──> [Load balancer]
    │                                  ▲                            │
    │ image GET                        │ image files                 ▼
    ├──────────────────────────────────┘                     [App servers]
    │                                                               │
    │ signed direct upload                                           ├──> [Cache]
    ▼                                                               ├──> [Primary database]
 [Object storage] <── thumbnail write ── [Thumbnail worker]          │          │
    │                                      ▲                         │          └── replication ──> [Read replica]
    │                                      │                         │                                     ▲
    └── image origin on CDN cache miss     └──── [Queue] <── job ────┘                                     │
                                                                                                           │
                                                                      feed metadata reads ─────────────────┘
```

The app servers authorize direct uploads by issuing short-lived signed upload URLs; clients send photo bytes to object storage rather than through the app servers. The CDN serves cached images and forwards feed/API requests to the load balancer.

## 6. What each component does

- **CDN:** Caches and serves photo files near users so repeated image requests do not all reach the origin.
- **Load balancer:** Distributes incoming API requests across healthy app servers to avoid overloading a single server.
- **App servers:** Authenticate users, issue signed upload URLs, save photo metadata, and assemble feed responses.
- **Cache:** Holds frequently requested feed data and metadata to reduce database load and response time.
- **Primary database:** Stores authoritative user, follow, and photo metadata and accepts metadata writes.
- **Read replica:** Serves feed and other read queries so read traffic does not overwhelm the primary database.
- **Object storage:** Durably stores original photos and thumbnails as files, independently of the metadata database.
- **Queue:** Buffers thumbnail jobs so upload requests do not need to wait for image processing to finish.
- **Thumbnail worker:** Reads queued jobs, creates a 50 KB thumbnail from each original, stores it in object storage, and updates its metadata or processing status.

## 7. Photo upload flow

1. The client asks an app server to begin an upload; the server authenticates the user and validates the request.
2. The app server creates a photo metadata record in the primary database with a pending processing status, then returns its ID and a short-lived signed upload URL for object storage.
3. The client uploads the 2 MB original directly to object storage using that URL; the app server does not proxy the image bytes.
4. After the upload succeeds, the client notifies the app server (or storage emits an upload event); the app server verifies the upload and enqueues a thumbnail job containing the photo ID and object key.
5. A thumbnail worker consumes the job, reads the original from object storage, creates a 50 KB thumbnail, and writes it back to object storage.
6. The worker updates the photo metadata/status in the database when processing is complete; the photo can then be served through the CDN, while the original remains available if thumbnail processing needs a retry.

## 8. Trade-offs

- **Async thumbnail generation vs. immediate availability:** A queue keeps uploads responsive and absorbs processing spikes, but a newly uploaded photo may briefly appear without a thumbnail; the app needs a pending state and retry handling.
- **Read replica vs. freshness:** A replica increases read capacity, but replication lag can make a just-uploaded photo or metadata change temporarily absent from a feed; the app can read recent writes from the primary where freshness is important.
- **Caching vs. freshness and invalidation:** A cache and CDN reduce database load and image latency, but cached feed entries or images can become stale; use expiration or explicit invalidation when content changes.
- **Direct uploads vs. operational complexity:** Signed direct uploads keep large file traffic off the app servers, but require short-lived authorization, upload validation, and cleanup of abandoned pending records or partial uploads.
