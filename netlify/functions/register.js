// v3 - esbuild compatible
const { neon } = require('@neondatabase/serverless');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Nieprawidłowy format danych.' })
    };
  }

  const { guardian, school, email, phone, disciplines } = body;

  if (!guardian || !school || !email) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Brakuje wymaganych pól.' })
    };
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    await sql`CREATE TABLE IF NOT EXISTS registrations (
      id SERIAL PRIMARY KEY,
      guardian TEXT NOT NULL,
      school TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;

    await sql`CREATE TABLE IF NOT EXISTS discipline_entries (
      id SERIAL PRIMARY KEY,
      registration_id INTEGER REFERENCES registrations(id) ON DELETE CASCADE,
      discipline TEXT NOT NULL,
      discipline_label TEXT NOT NULL
    )`;

    await sql`CREATE TABLE IF NOT EXISTS athletes (
      id SERIAL PRIMARY KEY,
      discipline_entry_id INTEGER REFERENCES discipline_entries(id) ON DELETE CASCADE,
      name TEXT,
      surname TEXT,
      date_of_birth DATE
    )`;

    const [reg] = await sql`
      INSERT INTO registrations (guardian, school, email, phone)
      VALUES (${guardian}, ${school}, ${email}, ${phone || null})
      RETURNING id
    `;

    if (Array.isArray(disciplines)) {
      for (const disc of disciplines) {
        const [entry] = await sql`
          INSERT INTO discipline_entries (registration_id, discipline, discipline_label)
          VALUES (${reg.id}, ${disc.discipline}, ${disc.disciplineLabel})
          RETURNING id
        `;
        if (Array.isArray(disc.athletes)) {
          for (const athlete of disc.athletes) {
            await sql`
              INSERT INTO athletes (discipline_entry_id, name, surname, date_of_birth)
              VALUES (${entry.id}, ${athlete.name || null}, ${athlete.surname || null}, ${athlete.dob || null})
            `;
          }
        }
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, registrationId: reg.id })
    };

  } catch (err) {
    console.error('DB error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Błąd bazy danych: ' + err.message })
    };
  }
};
