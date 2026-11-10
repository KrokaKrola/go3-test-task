# D. Analytics notes from marketing

We use GA4 through Google Tag Manager. Please send these events and keep names exactly as written.

| Event | When |
| --- | --- |
| `plan_viewed` | Plan page is shown |
| `plan_selected` | User picks a plan |
| `identity_started` | User is sent to the eID provider |
| `identity_completed` | User returns identified |
| `payment_started` | User is sent to the payment page |
| `purchase` | Subscription is confirmed. Include `transaction_id`, `value` and `currency`. |

We also want to attribute purchases to campaigns, so UTM parameters should survive until `purchase`.
