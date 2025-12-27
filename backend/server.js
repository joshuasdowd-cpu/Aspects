import express from "express";
import cors from "cors";
import swe from "swisseph";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

function norm360(x) {
  let v = x % 360;
  if (v < 0) v += 360;
  return v;
}

app.get("/api/planets", (req, res) => {
  try {
    const { date, time = "12:00" } = req.query;
    if (!date) throw new Error("Missing date");

    const [Y, M, D] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    const hour = hh + mm / const jd = julianDay(Y, M, D, hour);
function julianDay(year, month, day, hour) {
  // Fliegel–Van Flandern / standard astronomical JD for Gregorian calendar
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
    (hour / 24)
  );
}

    const flags = swe.SEFLG_MOSEPH;

    const bodies = [
      ["Sun", swe.SE_SUN],
      ["Moon", swe.SE_MOON],
      ["Mercury", swe.SE_MERCURY],
      ["Venus", swe.SE_VENUS],
      ["Mars", swe.SE_MARS],
      ["Jupiter", swe.SE_JUPITER],
      ["Saturn", swe.SE_SATURN],
      ["Uranus", swe.SE_URANUS],
      ["Neptune", swe.SE_NEPTUNE],
      ["Pluto", swe.SE_PLUTO]
    ];

    const planets = {};
    for (const [name, id] of bodies) {
      const r = swe.calc_ut(jd, id, flags);
      if (r.error) throw new Error(r.error);
      planets[name] = norm360(r.data[0]);
    }

    res.json({ ok: true, planets });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Backend running on port", PORT);
});