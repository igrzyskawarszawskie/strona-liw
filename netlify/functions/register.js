// netlify/functions/register.js
// Wymaga: npm install @neondatabase/serverless
// W Netlify Dashboard ustaw zmienną środowiskową: DATABASE_URL

import { neon } from '@neondatabase/serverless';

export default async (req, context) => {
  // tylko POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Nieprawidłowy format danych.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { guardian, school, email, phone, disciplines } = body;

  // walidacja
  if (!guardian || !school || !email) {
    return new Response(JSON.stringify({ error: 'Brakuje wymaganych pól.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    // 1. Utwórz tabele jeśli nie istnieją
    await sql`
      CREATE TABLE IF NOT EXISTS registrations (
        id          SERIAL PRIMARY KEY,
        guardian    TEXT NOT NULL,
        school      TEXT NOT NULL,
        email       TEXT NOT NULL,
        phone       TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS discipline_entries (
        id              SERIAL PRIMARY KEY,
        registration_id INTEGER REFERENCES registrations(id) ON DELETE CASCADE,
        discipline      TEXT NOT NULL,
        discipline_label TEXT NOT NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS athletes (
        id                  SERIAL PRIMARY KEY,
        discipline_entry_id INTEGER REFERENCES discipline_entries(id) ON DELETE CASCADE,
        name                TEXT,
        surname             TEXT,
        date_of_birth       DATE
      )
    `;

    // 2. Zapisz zgłoszenie
    const [reg] = await sql`
      INSERT INTO registrations (guardian, school, email, phone)
      VALUES (${guardian}, ${school}, ${email}, ${phone || null})
      RETURNING id
    `;

    const regId = reg.id;

    // 3. Zapisz dyscypliny i zawodników
    if (Array.isArray(disciplines)) {
      for (const disc of disciplines) {
        const [entry] = await sql`
          INSERT INTO discipline_entries (registration_id, discipline, discipline_label)
          VALUES (${regId}, ${disc.discipline}, ${disc.disciplineLabel})
          RETURNING id
        `;

        const entryId = entry.id;

        if (Array.isArray(disc.athletes)) {
          for (const athlete of disc.athletes) {
            await sql`
              INSERT INTO athletes (discipline_entry_id, name, surname, date_of_birth)
              VALUES (
                ${entryId},
                ${athlete.name || null},
                ${athlete.surname || null},
                ${athlete.dob || null}
              )
            `;
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, registrationId: regId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('DB error:', err);
    return new Response(JSON.stringify({ error: 'Błąd bazy danych. Spróbuj ponownie.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config = { path: '/api/register' };
