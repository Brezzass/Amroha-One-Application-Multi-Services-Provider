# Amroha One API 2.0

Production-oriented backend foundation for the single Amroha One app.

## Included
- Mobile + password authentication for Customer, Vendor and Delivery Boy
- Admin seed from environment variables
- Vendor approval and role isolation
- Vendor product/menu CRUD, pricing and stock
- Customer orders and vendor incoming orders
- Automatic stock reduction on order
- Customer/vendor/admin/delivery order views
- Delivery assignment
- Delivery OTP validation before Delivered
- Customer/vendor/delivery/admin profile address and GPS fields
- Delivery-boy live location updates per order
- Tracking endpoint for Customer/Vendor/Admin/Delivery Boy
- Service activation for Tiffin, Porter, City Services and Grocery
- Firebase Admin integration point
- MongoDB Atlas compatible
- Render compatible

## Required environment variables
See `.env.example`. Never put secrets in the Android APK or in chat.

## Important production rule
Google Maps API keys should remain in the appropriate restricted Google Cloud configuration. Do not place a server secret in the mobile app. The Android app will use the Maps SDK with an Android-restricted key; server-side route/ETA calls, if enabled, use `GOOGLE_MAPS_SERVER_KEY`.
