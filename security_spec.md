# TakaDear Security Specification (Phase 0: Payload-First Security TDD)

## 1. Data Invariants
1. **Identity Integrity**: Every `users/{userId}`, `private/vault`, `transactions/{txId}`, `spins/{spinId}`, and `withdrawals/{withdrawalId}` document must bind its `uid` / `userId` to `request.auth.uid` on creation (unless written by a verified admin).
2. **No Self-Assigned Roles**: On `users/{userId}` creation, `role` must be `'user'`; users cannot promote themselves to `'admin'`.
3. **PII Isolation**: Sensitive PII (`email`, mobile wallet numbers) is encrypted via AES-256-GCM before persistence in `users/{userId}/private/vault` and `withdrawals/{withdrawalId}`, and read access is strictly restricted to `isOwner(userId) || isAdmin()`. Blanket `allow read: if isSignedIn()` is forbidden.
4. **Temporal Integrity**: `createdAt` must equal `request.time` on create and remain immutable on update; `updatedAt` must equal `request.time` on create and update.
5. **Bounded Rewards & Withdrawals**: User self-updates to `balance` and `totalEarned` are strictly bounded per action (`<= +5` per spin/task event, `>= 0` balance, referral bonus `== 2`, spin prize `<= 2`, withdrawal deduction `>= 100`).
6. **Terminal State Locking**: Once a withdrawal (`'সম্পন্ন'` / `'বাতিল'`) or account submission (`'এপ্রুভড'` / `'রিজেক্টেড'`) leaves its initial pending state, updates are locked; only verified admin (`incomezone2729@gmail.com`) can approve/reject pending items.
7. **Exclusive Verified Admin Access**: Regular users can authenticate and submit tasks without email verification and never see or hold admin privileges; Admin Panel actions and `isAdmin()` strictly mandate `request.auth.token.email == 'incomezone2729@gmail.com'` and `request.auth.token.email_verified == true`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Self-Privilege Escalation**: Creating `users/{uid}` with `{ role: 'admin', balance: 50000 }` -> **REJECTED** (`role == 'user'`, `balance <= 4`).
2. **Ghost Field Injection (Shadow Update)**: Updating `users/{uid}` with `{ theme: 'light', isVip: true, updatedAt: serverTimestamp() }` -> **REJECTED** (`affectedKeys().hasOnly(...)`).
3. **Email Spoofing Attack**: Request with `token.email == 'incomezone2729@gmail.com'` and `token.email_verified == false`, or any non-admin email -> **REJECTED** (`isAdmin()` requires `email_verified == true` and exact admin email).
4. **Cross-Tenant PII Read**: Non-admin user reading `/users/{otherUid}/private/vault` -> **REJECTED** (`isOwner || isAdmin`).
5. **Query Scraping (`allow list`)**: Non-admin calling `getDocs(collection(db, 'withdrawals'))` or `getDocs(collection(db, 'accountSubmissions'))` without `where('userId', '==', uid)` -> **REJECTED** (`resource.data.userId == request.auth.uid || isAdmin()`).
6. **Resource Exhaustion / ID Poisoning**: Creating `/withdrawals/${'A'.repeat(500)}` -> **REJECTED** (`isValidId` max 128 chars & regex).
7. **Unbounded String / Payload Poisoning**: Updating `users/{uid}` with `name: 'X'.repeat(500)` -> **REJECTED** (`name.size() <= 80`).
8. **Timestamp Forgery**: Creating a transaction or submission with `createdAt: new Date(0)` instead of `serverTimestamp()` -> **REJECTED** (`createdAt == request.time`).
9. **Terminal State Tampering**: User updating a `'পেন্ডিং'` submission directly to `'এপ্রুভড'` or tampering with `amount` -> **REJECTED** (submission updates restricted to `isAdmin()`).
10. **Negative Withdrawal / Underflow**: Creating a withdrawal with `amount: -500` or `amount: 10` -> **REJECTED** (`amount >= 100`).
11. **Transaction Immutability Violation**: User updating or deleting an existing `/users/{uid}/transactions/{txId}` -> **REJECTED** (transactions are append-only; `update, delete: if false`).
12. **Cross-User Transaction Forgery**: User A writing to `/users/{userB}/transactions/{txId}` with `userId: userB` -> **REJECTED** (`isOwner(userId)` + `incoming().userId == request.auth.uid`).
