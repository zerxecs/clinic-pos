# Clinic POS frontend

Requires Node.js 20+. Start the backend first from `../backend` (`npm start`), then in a second terminal run:

```powershell
cd D:\pos\clinic-pos\frontend
npm start
```

Open `http://127.0.0.1:4173`. The small Node server serves the frontend and forwards `/api/*` requests to the backend at `127.0.0.1:3000`, keeping browser requests same-origin. Set `API_PORT` if the backend uses another port, or `FRONTEND_PORT` to change the UI port.

The frontend uses the backend's existing API and stores access/refresh tokens in browser local storage. Sign-in is required; the backend enforces roles on every protected route. No sample credentials or business data are included.
