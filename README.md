# Local setup

Requires Node.js 20+ and PostgreSQL. Create a local database and user, copy `backend/.env.example` to `backend/.env`, set `DATABASE_URL` and a random `ACCESS_TOKEN_SECRET` of at least 32 bytes, then:

```powershell
cd D:\pos\clinic-pos\backend
npm install
npm run migrate
npm run bootstrap:admin
npm start
```

The API listens on `http://127.0.0.1:3000`; check `/health`. No default admin or clinic catalog is seeded. The one-time bootstrap command prompts for the first Admin credentials and refuses to create another active Admin if one already exists. Do not expose the service publicly until configured.

## Notes

- Only structural ADMIN/CASHIER roles are seeded by the migration.
- Passwords use Argon2id; access tokens expire after 15 minutes and refresh tokens are rotated and stored hashed.
- Checkout locks eligible lots in FEFO order and atomically writes sale, tender, allocation, stock movement, inventory balance, audit, and idempotency records.
- Set `DATABASE_SSL=true` only when the PostgreSQL endpoint requires TLS. Never commit `.env`.
