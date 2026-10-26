# TypeFlow Backend

The server for the TypeFlow typing tutor website. It does three things:

1. **Accounts** – people can register and log in.
2. **Online saving** – lessons, results, streak and weak keys are saved on the server, so they follow the user to any device.
3. **Leaderboard** – the best typing test speeds are shown on a page.

The website still works without an account (guest mode). The backend only adds these extras.

Built with Node.js, Express and PostgreSQL.

## What you need

- Node.js 20 or newer
- A PostgreSQL database (a free one on [Neon](https://neon.tech) is fine)

## Run it on your computer

```bash
npm install
cp .env.example .env      # then open .env and fill in the values
npm run db:setup          # makes the tables in the database
npm run dev               # starts the server on http://localhost:4000
```

Check it works: open http://localhost:4000/api/health. You should see `{"ok":true}`.

## The .env file

| Name | What it is |
|---|---|
| `DATABASE_URL` | The connection text from your database host |
| `DATABASE_SSL` | `true` for Neon and most hosts, `false` for a database on your own computer |
| `JWT_SECRET` | A long random text (at least 24 characters). Keep it secret |
| `CORS_ORIGIN` | The address of your website, for example `https://typeflow.netlify.app` (no slash at the end) |
| `PORT` | The port (the host usually sets it for you) |

Make a good secret with: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

**Never put the real `.env` file on GitHub.** It is already in `.gitignore`.

## Put it online

1. **Database (Neon):** make a project, copy the connection string, and put it in `DATABASE_URL`.
2. Run `npm run db:setup` once from your computer, with that `DATABASE_URL` in your `.env`. This makes the tables.
3. **Server (Render, Railway or similar):** make a new web service from this GitHub repo.
   - Build command: `npm install`
   - Start command: `npm start`
   - Add the environment variables from the table above. Set `NODE_ENV=production`.
4. Copy the address of the service (for example `https://typeflow-api.onrender.com`).
5. In Netlify, open the TypeFlow website settings and add the variable `NEXT_PUBLIC_API_URL` with that address (no slash at the end). Then deploy the website again.
6. Put your Netlify address in `CORS_ORIGIN` on the server.

## The API

All addresses start with `/api`. Data is sent and received as JSON. A logged-in user sends the header `Authorization: Bearer <token>`.

| Method | Address | Login needed | What it does |
|---|---|---|---|
| GET | `/health` | No | Tells if the server is running |
| POST | `/auth/register` | No | Make an account. Send `email`, `password` (8+ characters), `displayName` (2 to 20 characters) |
| POST | `/auth/login` | No | Log in. Send `email` and `password`. Returns a `token` |
| GET | `/me` | Yes | Shows the logged-in user |
| DELETE | `/me` | Yes | Deletes the account and all its data |
| GET | `/progress` | Yes | Gets the saved progress |
| PUT | `/progress` | Yes | Saves the progress. Send `{ "data": { ... } }` |
| POST | `/scores` | Yes | Sends a typing test score: `wpm`, `accuracy`, `durationSeconds` |
| GET | `/leaderboard?limit=20` | No | The best score of each user (accuracy 90% or more) |

## The database

Three tables (see `src/db/schema.sql`):

- `users` – id, email, password_hash, display_name, created_at
- `user_data` – user_id, key, value (JSON), updated_at. One row for each saved item.
- `scores` – id, user_id, wpm, accuracy, duration_seconds, created_at

When a user is deleted, their `user_data` and `scores` are deleted too.

## Safety

- Passwords are never saved. Only a bcrypt hash is saved.
- Login uses a signed token that ends after 30 days.
- All database commands use parameters, so text from users cannot change the command (SQL injection).
- Too many login tries are blocked for a few minutes (rate limit).
- Only the websites in `CORS_ORIGIN` can call the server from a browser.
- The body of a request cannot be bigger than 1 MB.
- The leaderboard shows the display name only, never the email.

## Tests

```bash
npm test
```

The tests start their own temporary PostgreSQL database, so nothing on your real database is touched. They check registering, login, saving progress, privacy between users, the leaderboard, deleting accounts and some attacks.
