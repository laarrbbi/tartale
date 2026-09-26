# Roadmap

The data model already leaves room for these; none is built yet.

## Next

- **Company accounts.** `companies` already pays for birthdays; the same row
  can sign in, see its orders and invoices, and reorder.
- **Bulk campaigns.** One message, many recipients (a list of prospects after
  a conference): an order per recipient, one payment.
- **Volume pricing.** Per-company prices or a discount per quantity, applied
  in `order-service` before Stripe — never computed in the browser.
- **CSV / HRIS import** for birthday lists (the paste box already reads
  Excel's tab-separated cells).
- **More cities.** A city is a bakery plus its zones. Today the order form
  shows one menu per city, so a second bakery in the same city is refused in
  the panel; allowing it means asking for the postcode before the cake.
- **An API** for CRMs and outbound tools to send a cake from a deal stage.

## Smaller things to consider

- A button to remove someone from the news list (today: Supabase table
  editor), and the email sending itself, with an unsubscribe link.
- Uploading cake photos from the panel (today they ship with the site in
  `public/cakes/`).
- Delivery proof (a photo from the bakery) on the tracking page.
- Serving sizes per cake size, once each bakery gives them (Pastelerías →
  "Qué es cada tamaño").
