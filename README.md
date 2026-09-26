# Libris — Library Book Reservation System

A full-stack library book reservation system. Members search the catalog, reserve
books, and join a waitlist when every copy is out. Librarians issue, return, and
manage books and reservations from a dedicated desk.

**Stack:** HTML, CSS, JavaScript (frontend) · Node.js + Express (backend) · MySQL (database)

## Features

**Members**
- Register / log in (JWT-based auth)
- Search and filter the catalog by title, author, ISBN, or category
- Reserve a book, or join the waitlist if no copy is available
- View reservations: waitlist position, pickup deadline, due date, fines
- Cancel a pending or ready reservation

**Librarians (admin)**
- Dashboard: total books, members, active reservations, overdue count
- Issue a ready reservation, mark a book as returned
- Add, edit, and delete books
- Cancel any member's reservation

**How reservations work**
- A copy available → reservation is `ready`, hold it for 2 days to collect
- No copy available → reservation is `pending` (waitlist), first-come-first-served
- Not collected in 2 days → `expired`, offered to the next person in line
- Issued books are due in 14 days; ₹5/day fine applies after the due date
- A member can hold at most 5 active reservations at a time

## Project structure

```
library-reservation/
├── backend/
│   ├── config/db.js          # MySQL connection pool
│   ├── middleware/auth.js    # JWT auth, admin check, validation handler
│   ├── routes/                # auth, books, reservations
│   ├── seed.js                # creates admin account + sample books
│   ├── server.js
│   └── .env.example
├── database/schema.sql        # tables: users, books, reservations
└── frontend/
    ├── index.html
    ├── css/style.css
    └── js/app.js               # single-page app (hash routing)
```

## Setup

1. **Create the database.** In MySQL, run the contents of `database/schema.sql`.

2. **Configure environment variables.** Copy `backend/.env.example` to `backend/.env`
   and fill in your own values:
   ```
   PORT=5000
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_mysql_password
   DB_NAME=library_db
   JWT_SECRET=a_long_random_string
   ```

3. **Install and seed.**
   ```bash
   cd backend
   npm install
   npm run seed
   ```
   This creates an admin account (`admin@library.com` / `Admin@123`) and 6 sample books.

4. **Run the server.**
   ```bash
   npm run dev
   ```
   Open **http://localhost:5000** in the browser — Express serves the frontend
   directly, so no separate frontend server is needed.

   Important: don't open the frontend through a different tool such as VS Code's
   Live Server (usually on port 5500). It doesn't run the backend, so every API
   request will fail. Always use the `localhost:5000` URL above.

## Making a member an admin

Public registration only ever creates a `member` account, on purpose — otherwise
anyone could grant themselves admin access. To promote an existing account:

```sql
USE library_db;
UPDATE users SET role='admin' WHERE email='their@email.com';
```

They must log out and log back in afterward, since their role is stored in the
login token.

## Notes

- Passwords are hashed with bcrypt; never stored in plain text.
- All inputs are validated on both the client (instant feedback) and the server
  (source of truth) — name, email, password strength, ISBN format, copy counts, etc.
- Reservation and issue/return actions run inside database transactions to prevent
  race conditions (e.g., two members reserving the last copy at once).
- Login attempts are rate-limited (50 per 15 minutes per IP) to slow brute-force attempts.
