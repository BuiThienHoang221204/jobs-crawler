const express = require("express");

const app = express();

// ✅ KHÔNG hardcode
const PORT = Number(process.env.PORT) || 8080;

// debug port
console.log("🚀 Starting app...");
console.log("ENV PORT:", process.env.PORT);
console.log("USING PORT:", PORT);

// logging
app.use((req, res, next) => {
  console.log(`> ${req.method} ${req.path}`);
  next();
});

// health check
app.get("/", (req, res) => {
  res.send("OK");
});

app.get("/favicon.ico", (req, res) => res.status(204).end());

// parse level
function parseLevels(text) {
  text = (text || "").toLowerCase();
  const found = new Set();

  if (text.includes("principal")) found.add("Principal");
  if (text.includes("lead")) found.add("Lead");
  if (text.includes("senior")) found.add("Senior");
  if (text.includes("mid") || text.includes("middle")) found.add("Mid");
  if (text.includes("junior") || text.includes("jr")) found.add("Junior");
  if (text.includes("intern")) found.add("Intern");
  if (text.includes("fresher")) found.add("Fresher");

  return Array.from(found);
}

// API
app.get("/jobs", async (req, res) => {
  const keyword = req.query.keyword || "frontend";

  // lazy load playwright
  const { chromium } = require("playwright");

  let browser;
  let context;

  try {
    console.log("Launching browser...");

    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage"
      ]
    });

    context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(
      `https://itviec.com/viec-lam-it/${keyword}-developer/ho-chi-minh-hcm`,
      { waitUntil: "domcontentloaded", timeout: 60000 }
    );

    await page.waitForSelector(".job-card", { timeout: 60000 });

    const jobs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll(".job-card")).map(job => {
        const titleEl = job.querySelector("h3");
        const companyEl = job.querySelector(".logo-employer-card + span a");

        const rawLink = titleEl?.getAttribute("data-url");

        return {
          title: titleEl?.innerText?.trim(),
          link: rawLink
            ? rawLink.startsWith("http")
              ? rawLink
              : "https://itviec.com" + rawLink
            : null,
          company: companyEl?.innerText?.trim(),
          company_link: companyEl
            ? "https://itviec.com" + companyEl.getAttribute("href")
            : null,
          tags: Array.from(job.querySelectorAll(".itag")).map(t =>
            t.innerText.trim()
          ),
          time: job
            .querySelector(".small-text.text-dark-grey")
            ?.innerText?.trim()
        };
      });
    });

    const filtered = jobs.filter(job => {
      const text = (job.title || "") + " " + (job.tags || []).join(" ");
      const levels = parseLevels(text);

      if (levels.length === 0) return true;

      const lower = ["Fresher", "Junior", "Mid", "Intern"];
      return levels.some(l => lower.includes(l));
    });

    res.json({
      success: true,
      count: filtered.length,
      data: filtered
    });

  } catch (err) {
    console.error("ERROR:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    if (context) await context.close().catch(() => { });
    if (browser) await browser.close().catch(() => { });
  }
});

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT_EXCEPTION:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED_REJECTION:", reason);
});

// ✅ bind đúng
const server = app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

server.on("error", (err) => {
  console.error("LISTEN_ERROR:", err);
  process.exit(1);
});