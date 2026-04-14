import express from "express";
import sqlite3 from "sqlite3";
import cors from "cors";
import path from "path";

const app = express();
app.use(cors());

const dbPath = path.resolve(__dirname, "../../data/db/ejdict.sqlite3");
const db = new sqlite3.Database(dbPath);

app.get("/lookup", (req, res) => {
  const word = req.query.word as string;

  if (!word) {
    return res.json({ meaning: null });
  }

  db.get(
    "SELECT word, mean FROM items WHERE word = ? LIMIT 1",
    [word],
    (err, row: any) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "DB error" });
      }

      if (!row) {
        return res.json({ meaning: null });
      }

      res.json({
        word: row.word,
        meaning: row.mean,
      });
    }
  );
});

app.listen(3001, () => {
  console.log("Server running on http://localhost:3001");
});