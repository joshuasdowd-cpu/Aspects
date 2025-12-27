import express from "express";
import cors from "cors";
import swe from "swisseph";

const app = express();

app.use(cors());
app.use(express.json({ limit: "200kb" }));

/* ========= Helpers ========= */
function norm360(x) {
  let v = x % 360;
  if (v < 0) v += 360;
  return v;
}

function minSeparation(a, b) {
  const d = Math.abs(norm360(a) - norm360(b));
  return Math.min(d, 360 - d);
}

// Julian Day for Gregorian calendar (UTC)
function julianDay(year, month, day, hour) {
  let Y = year;
  let M = month;
  if (M <= 2) {
    Y -= 1;
    M += 12;
  }
  const A = Math.floor(Y / 100);
  const B = 2 - A + Math.floor(A / 4);

  return (
    Math.floor(365.25 * (Y + 4716)) +
    Math.floor(30.6001 * (M + 1)) +
    day +
    B -
    1524.5 +
    hour / 24
  );
}

function parseDate(dateStr) {
  // YYYY-MM-DD
  const m = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { Y: Number(m[1]), M: Number(m[2]), D: Number(m[3]) };
}

function parseTime(timeStr) {
  // HH:MM (24h)
  const m = String(timeStr || "").match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
 