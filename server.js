const express = require("express");
const pg = require("pg");
const fs = require("fs");
const html = require("html-template-tag");
const { nextTick } = require("process");

const client = new pg.Client("postgress://localhost/acme_user_things_pg");
const app = express();

app.use(express.urlencoded());

// set up routes
app.get("/", async (req, res, next) => {
  try {
    const response = await client.query(`
    SELECT count(*)
    FROM users;
    `);
    const count = response.rows[0].count;
    res.send(html` <html>
      <head>
        <title>Acme User Things PG</title>
      </head>
      <body>
        We have ${count} <a href="/users">users</a>
      </body>
    </html>`);
  } catch (ex) {
    next(ex);
  }
});

// user route

app.get("/users", async (req, res, next) => {
  try {
    const response = await client.query(`
    SELECT users.name, users.id, count(*)
    FROM user_things
    RIGHT JOIN users
    ON users.id = user_things.user_id
    GROUP BY users.name, users.id
   `);
    const users = response.rows;
    res.send(html` <html>
      <head>
        <title>User Details</title>
      </head>
      <body>
        <a href="/">Back to Home</a>
        <ul>
          ${users.map((user) => {
            return `
            <li> <a href="/users/${user.id}">${user.name} (${user.count})</a></li>`;
          })}
        </ul>
      </body>
    </html>`);
  } catch (ex) {
    next(ex);
  }
});

// route to /users/:id
app.get("/users/:id", async (req, res, next) => {
  try {
    // make this a let since form is modifying table
    let response = await client.query(
      `
      SELECT users.name as user_name, things.name as thing_name, note
      FROM user_things
      JOIN users
      ON users.id = user_things.user_id
      JOIN things
      ON things.id = user_things.thing_id
      WHERE users.id = $1
   `,
      [req.params.id]
    );
    const userThings = response.rows;

    // for form
    response = await client.query(`
      SELECT * 
      FROM things
      `);
    const things = response.rows;

    // when we want to create something, we end up posting
    // form added here

    res.send(html` <html>
      <head>
        <title>User Details</title>
      </head>
      <body>
        <h1>User Details</h1>

        <form method="POST" action="/users/${req.params.id}/userThings">
          <select name="thing_id">
            ${things.map((thing) => {
              return `<option value="${thing.id}">${thing.name}</option>`;
            })}
          </select>
          <input name="note" />
          <button>Create</button>
        </form>

        <a href="/users">Back to Users</a>
        <ul>
          ${userThings.map((userThing) => {
            return `<li>${userThing.user_name} ${userThing.thing_name}
            <p>${userThing.note}</p>
            </li>`;
          })}
        </ul>
      </body>
    </html>`);
  } catch (ex) {
    next(ex);
  }
});

// create /users/:id/userThings route
// post
// RETURNING * shows what it ends up returning
// PRG - POST, then REDIRECT to a GET

app.post("/users/:id/userThings", async (req, res, next) => {
  try {
    const response = await client.query(
      `
    INSERT INTO user_things(user_id, thing_id, note) 
    VALUES ($1, $2, $3)
    RETURNING *`,
      [req.params.id, req.body.thing_id, req.body.note]
    );
    res.redirect(`/users/${req.params.id}`);
  } catch (ex) {
    next(ex);
  }
});

let port = process.env.PORT || 3000;

const setup = async () => {
  try {
    console.log("starting");
    await client.connect();
    console.log("done seeding");
    const SQL = `
    DROP TABLE IF EXISTS user_things;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS things;
    

    CREATE TABLE users(
      id SERIAL PRIMARY KEY,
      name VARCHAR(20)
    );
    CREATE TABLE things(
      id SERIAL PRIMARY KEY,
      name VARCHAR(20)
    );
    CREATE TABLE user_things(
      id SERIAL PRIMARY KEY,
      note VARCHAR(50),
      user_id INTEGER REFERENCES users(id) NOT NULL,
      thing_id INTEGER REFERENCES things(id) NOT NULL
    );

    INSERT INTO users(name) VALUES('moe');
    INSERT INTO users(name) VALUES('lucy');
    INSERT INTO users(name) VALUES('ethyl');
    INSERT INTO users(name) VALUES('larry');
    INSERT INTO things(name) VALUES('foo');
    INSERT INTO things(name) VALUES('bar');
    INSERT INTO things(name) VALUES('bazz');
    INSERT INTO user_things(user_id, thing_id, note) VALUES(1, 1, 'a note for foo');
    INSERT INTO user_things(user_id, thing_id, note) VALUES(1, 1, 'moe has another foo');
    INSERT INTO user_things(user_id, thing_id, note) VALUES(2, 3, 'a note for bazz');

    `;

    await client.query(SQL);
    const response = await client.query(`
    SELECT users.name as user_name, things.name as thing_name, note
    FROM user_things
    JOIN users
    ON users.id = user_things.user_id
    JOIN things
    ON things.id = user_things.thing_id`);
    console.log(response.rows);
    app.listen(port, () => {
      console.log(`listen on port ${port}`);
    });
  } catch (ex) {
    console.log(ex);
  }
};

setup();
