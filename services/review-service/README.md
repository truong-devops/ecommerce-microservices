# review-service-go

Go prototype of review-service with clean architecture (`handler -> service -> repository`) and MongoDB.

## Endpoints

- `GET /health`
- `GET /ready`
- `GET /live`
- `GET /api/v1/reviews`
- `GET /api/v1/reviews/{id}`
- `POST /api/v1/reviews`
- `PATCH /api/v1/reviews/{id}`
- `DELETE /api/v1/reviews/{id}`
- `GET /api/v1/reviews/products/{productId}/summary`
- `PATCH /api/v1/reviews/{id}/moderation`
- `POST /api/v1/reviews/{id}/reply`

Compatibility aliases are also mounted under `/api/reviews/*` and `/api/*` health routes.
