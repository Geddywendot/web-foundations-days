# Day 8 Reflection

The most difficult concept in the course was designing for correctness when many requests happen at the same time. It is easy to describe a seat as “available” on a page, but harder to guarantee that two buyers cannot both claim it. I worked through this by tracing the hold flow step by step and identifying which operation must be atomic. A database transaction, row lock, and conditional state change made the rule concrete: only one request can move a seat from available to held.

Based on the feedback I received, I would improve the capstone’s explanation of its assumptions and failure cases. In particular, I would distinguish average traffic from a sudden peak, state what the estimates count, and explain what happens when a payment response arrives after a hold expires. Making those limits visible would make the design easier to evaluate and operate, not just easier to read.

Next, I want to learn how to test and operate distributed systems under realistic load. I would explore load testing, database locking behavior, queue monitoring, and payment failure simulations so I can validate the design’s assumptions with measured results rather than estimates alone.
