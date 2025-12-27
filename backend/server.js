import express from "express";
import cors from "cors";
import swe from "swisseph";

const app = express();
app.use(cors());
app.use(express.json({ limit: "200kb" }));

/* ===================== Helpers ===================== */
function norm360(x) {
  let v = x % 360;
  if (v < 0) v += 360;
  return v;
}

function minSeparation(a, b) {
  const d = Math.abs(norm360(a) - norm360(b));
  return Math.min(d, 360 - d);
}

// Julian Day (Gregorian) at UT decimal hours
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

function parseDate(dateStr) {
  // YYYY-MM-DD
  const m = String(dateStr ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { Y: Number(m[1]), M: Number(m[2]), D: Number(m[3]) };
}

function normalizeTimeHHMM(timeStr) {
  // Accepts "H:MM", "HH:MM", and ignores any trailing seconds/AMPM junk.
  // Returns "HH:MM" or null.
  const m = String(timeStr ?? "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hh = String(m[1]).padStart(2, "0");
  const mm = m[2];
  const hhn = Number(hh), mmn = Number(mm);
  if (!Number.isFinite(hhn) || !Number.isFinite(mmn)) return null;
  if (hhn < 0 || hhn > 23 || mmn < 0 || mmn > 59) return null;
  return `${hh}:${mm}`;
}

function toNumber(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/* ===================== Aspects ===================== */
const ASPECTS = [
  { name: "Conjunction", deg: 0 },
  { name: "Sextile", deg: 60 },
  { name: "Square", deg: 90 },
  { name: "Trine", deg: 120 },
  { name: "Opposition", deg: 180 }
];

function computeAspects(planets, orbDeg) {
  const names = Object.keys(planets);
  const out = [];

  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i];
      const b = names[j];
      const sep = minSeparation(planets[a], planets[b]);

      let best = null;
      for (const asp of ASPECTS) {
        const off = Math.abs(sep - asp.deg);
        if (off <= orbDeg) {
          if (!best || off < best.orb) best = { aspect: asp.name, deg: asp.deg, orb: off };
        }
      }

      if (best) {
        const intensity =
          best.orb <= orbDeg * 0.33 ? "tight" :
          best.orb <= orbDeg * 0.66 ? "medium" :
          "wide";

        out.push({
          a,
          aspect: best.aspect,
          b,
          separation: Number(sep.toFixed(2)),
          orb: Number(best.orb.toFixed(2)),
          intensity
        });
      }
    }
  }

  out.sort((x, y) => x.orb - y.orb);
  return out;
}

/* ===================== Routes ===================== */
app.get("/", (req, res) => {
  res.json({ ok: true, service: "aspects-backend", routes: ["POST /api/chart"] });
});

app.post("/api/chart", (req, res) => {
  try {
    const dateStr = req.body?.date;
    const timeStr = req.body?.time;
    const tzOffsetMinutes = toNumber(req.body?.tzOffsetMinutes, -300);
    const orb = toNumber(req.body?.orb, 4);

    const d = parseDate(dateStr);
    if (!d) {
      return res.status(400).json({ ok: false, error: "Invalid date. Use YYYY-MM-DD." });
    }

    const hhmm = normalizeTimeHHMM(timeStr ?? "12:00") ?? "12:00";
    const [hh, mm] = hhmm.split(":").map(Number);

    // Convert local time -> UT time:
    // local = UT + offset => UT = local - offset
    const localHour = hh + mm / 60;
    const hourUT = localHour - tzOffsetMinutes / 60;

    const jd = julianDay(d.Y, d.M, d.D, hourUT);

    // Fast ephemeris; switch to SEFLG_SWIEPH if you want fuller (slower)
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
      planets[name] = norm360(r.data[0]);
    }

    const aspects = computeAspects(planets, orb);

    const timeProvided = typeof timeStr === "string" && timeStr.trim() !== "";
    const confidence = timeProvided ? "high" : "low";
    const note = timeProvided
      ? null
      : "No time provided; defaulted to 12:00. Moon/aspects can shift with time.";

    res.json({
      ok: true,
      meta: { tzOffsetMinutes, orb, confidence, note },
      subject: { date: dateStr, time: timeProvided ? hhmm : null, locationText: "Timezone offset only" },
      jd,
      planets,
      aspects
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on ${PORT}`));