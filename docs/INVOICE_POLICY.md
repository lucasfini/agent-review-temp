# Invoice Policy Implementation Brief

## 1. Problem Summary
The billing system is transitioning to a prepaid credit model. We must ensure that formal **invoice numbers** are generated and logged *only* when a user purchases credits with actual currency (e.g., via Stripe). When a user consumes credits (e.g., uploading and processing audio), the system must log the usage via internal transaction IDs but **MUST NOT** generate or attach an invoice number, as credit consumption is not a taxable/billable event.

## 2. Expected Behavior
- **Purchasing Credits (Money -> Credits):** Stripe charges the user and generates an invoice. The webhook/API route handling the successful payment must capture the Stripe invoice ID and pass it to `addCredit`.
- **Consuming Credits (Credits -> Service):** When a user uploads audio or triggers an AI service, `debitCredit` is called. This operation must **omit** the `invoiceNumber` parameter and only rely on the internal `usageEventId` and Postgres-generated transaction ID.
- **Frontend Display:** The billing history UI must gracefully display a dash (`-`) or blank space for transactions that lack an invoice number (specifically debit transactions).

## 3. Data Model Updates
No database schema changes are required. The `credit_transactions` table already has a nullable `invoice_number` column:
```sql
invoice_number TEXT, -- Stripe invoice ID/number for purchases/refunds
```
The accompanying TypeScript interfaces in `lib/billing/credit.ts` (`CreditTransaction`) already support an optional `invoiceNumber`.

## 4. Backend Logic Changes
### A. Credit Addition (Purchases)
**File to check:** Webhook handlers (e.g., `app/api/stripe/webhook/route.ts` or `app/api/admin/process-stripe-payment/route.ts`).
**Action:** When calling `addCredit(userId, amount, 'purchase', options)`, ensure that the `invoiceNumber` property is populated with `stripeEvent.data.object.invoice` (or the equivalent Stripe Invoice ID).

### B. Credit Consumption (Debits)
**File to check:** Usage tracking and upload processing logic (e.g., `lib/billing/track-usage.ts` or processing API routes).
**Action:** When calling `debitCredit(userId, amount, usageEventId, options)`, guarantee that `invoiceNumber` is explicitly **undefined** or omitted. 
```typescript
await debitCredit(userId, amount, usageEventId, {
  reason: 'Audio processing',
  transactionType: 'debit',
  // invoiceNumber MUST BE OMITTED OR UNDEFINED
});
```

## 5. Frontend Changes
**File to check:** `app/dashboard/settings/unified-settings.tsx`
**Action:** Verify the frontend rendering handles null invoices. The current implementation already correctly checks this:
```tsx
// CSV Export (Line 472)
t.invoiceNumber || ''

// Table Display (Line 944)
{isGrouped ? '-' : (transaction.invoiceNumber || '-')}
```
No changes required here, but the implementer should verify that rendering `null` does not cause React warnings.

## 6. Edge Cases
- **Refunds:** If a credit purchase is refunded via Stripe, the refund transaction over `addCredit` or a dedicated refund function should link to the original Stripe refund `invoiceNumber` or `receipt_number`.
- **Admin Adjustments:** Manual credit additions by admins (`transactionType: 'admin_adjustment'`) should **not** require an invoice number.
- **Bonus Credits:** Promotional credits (`transactionType: 'bonus'`) should **not** have an invoice number.

## 7. Validation Steps
1. **Purchase Test:** Trigger a test Stripe payment. Verify in the `credit_transactions` table that `transaction_type = 'purchase'` and `invoice_number` is populated with a `in_...` string.
2. **Consumption Test:** Upload a test audio file to consume credits. Verify in the `credit_transactions` table that `transaction_type = 'debit'` and `invoice_number` is `NULL`.
3. **UI Verification:** Navigate to the unified settings billing tab. Observe that the purchase row contains a real invoice number, while the consumption row displays `-`. Export the CSV and ensure the column reflects the same.
