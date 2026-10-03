# Core API examples

All `/api/*` requests use `X-API-Key` when `API_KEY` is configured. Logged-in requests additionally use `Authorization: Bearer <JWT>`.

- POST `/api/auth/register`
- POST `/api/auth/login`
- GET/PUT `/api/profile/me`
- PUT `/api/profile/location`
- GET `/api/services`
- PUT `/api/services/:key` (ADMIN)
- GET/POST/PUT/DELETE `/api/products`
- POST `/api/orders`
- GET `/api/orders/mine`
- GET `/api/orders/vendor`
- GET `/api/orders/delivery`
- GET `/api/orders/admin`
- PUT `/api/orders/:id/status`
- PUT `/api/orders/:id/assign-delivery`
- PUT `/api/tracking/location` (DELIVERY_BOY)
- GET `/api/tracking/order/:id`
- GET `/api/admin/dashboard`
- GET `/api/delivery/available`
