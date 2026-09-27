# Local setup

Requires Node.js 20+ and PostgreSQL. Create a local database and user, copy `backend/.env.example` to `backend/.env`, and replace the empty `DATABASE_URL` and `ACCESS_TOKEN_SECRET` values. Set `ACCESS_TOKEN_SECRET` to a unique random value of at least 32 bytes; startup refuses missing, short, or known placeholder values. Never commit `.env` or print secret values. The required operator replacement keys are `DATABASE_URL` and `ACCESS_TOKEN_SECRET`.

```powershell
cd D:\pos\clinic-pos\backend
npm install
npm run migrate
npm run bootstrap:admin
npm start
```

The API listens on `http://127.0.0.1:3000`; check `/health`. No default admin or clinic catalog is seeded. The one-time bootstrap command refuses to create another active Admin if one already exists. It reads `ADMIN_USERNAME`, `ADMIN_DISPLAY_NAME`, and `ADMIN_PASSWORD` from the environment, or prompts for username/display name and a hidden password. For unattended setup, provide all three variables for the command only; never save or log their values. The bootstrap password must be 12 to 200 characters and is stored as an Argon2id hash. Unset the three bootstrap variables after use. Do not expose the service publicly until configured.

## Notes

- Only structural ADMIN/CASHIER roles are seeded by the migration.
- Passwords use Argon2id; access tokens expire after 15 minutes and refresh tokens are rotated and stored hashed.
- Checkout locks eligible lots in FEFO order and atomically writes sale, tender, allocation, stock movement, inventory balance, audit, and idempotency records.
- Set `DATABASE_SSL=true` only when the PostgreSQL endpoint requires TLS. Never commit `.env`.
