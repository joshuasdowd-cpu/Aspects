import express from "express";
import cors from "cors";
import swe from "swisseph";

/**
 * Normalize angle to [0, 360)
 */
function norm360(x) {
  let v = x % 360;
  if (v < 0) v += 360;
  return v;
}

/**
 * Smallest angular separation in degrees between two longitudes (0..180)
 */
function angleDiff(a, b) {
  const d = Math.abs(norm360(a) - norm360(b));
  return d > 180 ? 360 - d : d;
}

/**
 * Julian Day for Gregorian calendar (UT)
 * year, month, day are integers; hour is decimal hours in UT
 */
function julianDay(year, month, day, hourUT) {
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
    hourUT / 24
  );
}

/**
 * Parse "YYYY-MM-DD" and "HH:MM" safely
 */
function parseDateTime(dateStr, timeStr) {
  if (!dateStr) throw new Error("Missing date (YYYY-MM-DD).");
  const [ys, ms, ds] = dateStr.split("-");
  const Y = Number(ys);
  const M = Number(ms);
  const D = Number(ds);
  if (!Y || !M || !D) throw new Error("Invalid date format. Use YYYY-MM-DD.");

  let hh = 12;
  let mm = 0;
  let hasTime = false;

  if (timeStr && String(timeStr).trim() !== "") {
    const parts = String(timeStr).split(":");
    hh = Number(parts[0]);
    mm = Number(parts[1] ?? 0);
    if (Number.isNaN(hh) || Number.isNaN(mm)) throw new Error("Invalid time format (HH:MM).");
    hasTime = true;
  }

  return { Y, M, D, hh, mm, hasTime };
}

/**
 * Determine aspects for a set of planets longitudes
 */
function computeAspects(planets, orbDeg = 4) {
  // You can add/remove aspects here
  const ASPECTS = [
    { name: "Conjunction", deg: 0 },
    { name: "Sextile", deg: 60 },
    { name: "Square", deg: 90 },
    { name: "Trine", deg: 120 },
    { name: "Opposition", deg: 180 }
  ];

  const names = Object.keys(planets);
  const out = [];

  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i];
      const b = names[j];
      const d = angleDiff(planets[a], planets[b]);

      let best = null;
      for (const asp of ASPECTS) {
        const orb = Math.abs(d - asp.deg);
        if (orb <= orbDeg) {
          if (!best || orb < best.orb) best = { ...asp, orb, separation: d };
        }
      }

      if (best) {
        const intensity =
          best.orb <= orbDeg * 0.33 ? "tight" :
          best.orb <= orbDeg * 0.66 ? "medium" :
          "wide";

        out.push({
          a,
          aspect: best.name,
          b,
          orb: Number(best.orb.toFixed(2)),
          separation: Number(best.separation.toFixed(2)),
          intensity
        });
      }
    }
  }

  // Sort by tightness (smallest orb first)
  out.sort((x, y) => x.orb - y.orb);
  return out;
}

const app = express();
app.use(cors());
app.use(express.json());

/**
 * Health check
 */
app.get("/", (req, res) => {
  res.json({ ok: true, service: "aspects-backend" });
});

/**
 * POST /api/chart
 * Body example:
 * {
 *   "date": "1989-08-19",
 *   "time": "08:58",
 *   "tzOffsetMinutes": -300,
 *   "orb": 4
 * }
 *
 * tzOffsetMinutes: minutes offset from UTC (EST winter = -300, EDT = -240)
 */
app.post("/api/chart", (req, res) => {
  try {
    const { date, time, tzOffsetMinutes, orb } = req.body ?? {};

    const { Y, M, D, hh, mm, hasTime } = parseDateTime(date, time);

    // If user doesn't supply tz offset, default to -300 (EST) to match your UI.
    const tzMin = typeof tzOffsetMinutes === "number" ? tzOffsetMinutes : -300;

    // Convert local time -> UT hours:
    // local = UT + offsetMinutes/60  => UT = local - offset
    const localHour = hh + mm / 60;
    const hourUT = localHour - tzMin / 60;

    const jd = julianDay(Y, M, D, hourUT);

    // Ephemeris flags (MOSEPH is fast; SWIEPH is fuller)
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
      if (r?.error) throw new Error(r.error);
      // r.data[0] = ecliptic longitude
      planets[name] = norm360(r.data[0]);
    }

    const orbDeg = typeof orb === "number" ? orb : 4;
    const aspects = computeAspects(planets, orbDeg);

    // Confidence note if time missing
    const confidence = hasTime ? "high" : "low";
    const note = hasTime
      ? null
      : "Time was not provided; Moon/angles would be less reliable. Planet longitudes still compute, but the Moon changes fast.";

    res.json({
      ok: true,
      meta: { confidence, note, tzOffsetMinutes: tzMin, orb: orbDeg },
      subject: {
        date,
        time: hasTime ? time : null,
        locationText: "Timezone offset only (no city lookup yet)"
      },
      jd,
      planets,
      aspects
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err?.message || String(err) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on ${PORT}`));