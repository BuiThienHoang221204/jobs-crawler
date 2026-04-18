// server.js
const express = require("express");
const { chromium } = require("playwright");

const app = express();
const PORT = process.env.PORT || 3000;

// Lightweight helper to extract seniority levels from text
function parseLevels(text) {
  text = (text || "").toLowerCase();
  const found = new Set();

  if (text.includes("principal")) found.add("Principal");
  if (text.includes("lead")) found.add("Lead");
  if (text.includes("senior")) found.add("Senior");
  if (text.includes("mid") || text.includes("middle") || text.includes("experienced")) found.add("Mid");
  if (text.includes("junior") || text.includes("jr") || text.includes("entry")) found.add("Junior");
  if (text.includes("intern")) found.add("Intern");
  if (text.includes("fresher")) found.add("Fresher");

  return Array.from(found);
}

function isWithinDays(timeStr, maxDays = 2) {
  if (!timeStr) return false;
  const s = timeStr.toString().toLowerCase().trim();

  if (s.includes('hôm nay') || s.includes('hom nay') || s.includes('today')) return true;
  if (s.includes('hôm qua') || s.includes('hom qua') || s.includes('yesterday')) return maxDays >= 1;

  if (/\b(\d+)\s*giờ\b/.test(s) || /\b(\d+)\s*phút\b/.test(s) || /\b(\d+)\s*hour\b/.test(s) || /\b(\d+)\s*minute\b/.test(s)) {
    return true;
  }

  const m = s.match(/(\d+)\s*ngày/);
  if (m) {
    const days = parseInt(m[1], 10);
    if (!isNaN(days)) return days <= maxDays;
  }
  const me = s.match(/(\d+)\s*day/);
  if (me) {
    const days = parseInt(me[1], 10);
    if (!isNaN(days)) return days <= maxDays;
  }

  return false;
}

let sharedBrowser = null;

app.get("/jobs", async (req, res) => {
  const keyword = req.query.keyword || "frontend";
  const maxDays = req.query.maxDays ? parseInt(req.query.maxDays, 10) || 2 : 2;

  if (!sharedBrowser) {
    return res.status(503).json({ error: 'Browser not ready. Please try again shortly.' });
  }

  const context = await sharedBrowser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
  });

  try {
    const page = await context.newPage();

    await page.goto(
      `https://itviec.com/viec-lam-it/${keyword}-developer/ho-chi-minh-hcm`,
      {
        waitUntil: "domcontentloaded",
        timeout: 30000
      }
    );

    await page.waitForTimeout(2000);
    try {
      await page.waitForSelector(".job-card", { timeout: 10000 });
    } catch (e) {}

    const jobs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll(".job-card")).map(job => {
        const titleEl = job.querySelector("h3");
        const companyEl = job.querySelector(".logo-employer-card + span a");
        const rawLink = titleEl?.getAttribute("data-url");

        return {
          title: titleEl?.innerText?.trim(),
          link: rawLink ? (rawLink.startsWith("http") ? rawLink : "https://itviec.com" + rawLink) : null,
          company: companyEl?.innerText?.trim(),
          company_link: companyEl ? "https://itviec.com" + companyEl.getAttribute("href") : null,
          tags: Array.from(job.querySelectorAll(".itag")).map(t => t.innerText.trim()),
          time: job.querySelector(".small-text.text-dark-grey")?.innerText?.trim()
        };
      });
    });

    // TopCV + Indeed scraping: create pages from same context and close them when done
    let topcvJobs = [];
    try {
      const page2 = await context.newPage();
      const topcvUrl = `https://www.topcv.vn/tim-viec-lam-${keyword}-developer-tai-ho-chi-minh-kl2?type_keyword=1&sba=1&locations=l2`;
      await page2.goto(topcvUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page2.waitForTimeout(1500);
      try { await page2.waitForSelector('.job-item-search-result', { timeout: 8000 }); } catch (e) {}
      topcvJobs = await page2.evaluate(() => {
        return Array.from(document.querySelectorAll('.job-item-search-result')).map(item => {
          const titleEl = item.querySelector('h3.title a span') || item.querySelector('h3.title a');
          const linkEl = item.querySelector('h3.title a');
          const companyEl = item.querySelector('.company-name');
          const companyLinkEl = item.querySelector('a.company');
          const salaryEl = item.querySelector('.title-salary') || item.querySelector('.salary span');
          const locationEl = item.querySelector('.city-text');
          const timeEl = item.querySelector('.label-update') || item.querySelector('.icon label');
          const tags = Array.from(item.querySelectorAll('.tag a.item-tag')).map(t => t.innerText.trim());
          return {
            title: titleEl?.innerText?.trim(),
            link: linkEl?.href || null,
            company: companyEl?.innerText?.trim(),
            company_link: companyLinkEl?.href || null,
            salary: salaryEl?.innerText?.trim(),
            location: locationEl?.innerText?.trim(),
            time: timeEl?.innerText?.trim(),
            tags
          };
        });
      });
      await page2.close();
    } catch (e) {
      console.error('TopCV scrape failed:', e.message);
    }

    let indeedJobs = [];
    try {
      const page3 = await context.newPage();
      const indeedUrl = `https://vn.indeed.com/jobs?q=${encodeURIComponent(keyword)}+developer&l=Th%C3%A0nh+ph%E1%BB%91+H%E1%BB%93+Ch%C3%AD+Minh`;
      await page3.goto(indeedUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page3.waitForTimeout(3000);
      try { await page3.waitForSelector('.job_seen_beacon', { timeout: 12000 }); } catch (e) {}
      indeedJobs = await page3.evaluate(() => {
        const items = document.querySelectorAll('.job_seen_beacon');
        return Array.from(items).map(item => {
          const titleEl = item.querySelector('h2.jobTitle a span[id^="jobTitle-"]');
          const linkEl = item.querySelector('h2.jobTitle a');
          const companyEl = item.querySelector('span[data-testid="company-name"]');
          const locationEl = item.querySelector('div[data-testid="text-location"]');
          return {
            title: titleEl?.innerText?.trim(),
            link: linkEl?.href ? 'https://vn.indeed.com' + linkEl.href : null,
            company: companyEl?.innerText?.trim(),
            company_link: null,
            salary: null,
            location: locationEl?.innerText?.trim(),
            time: null,
            tags: []
          };
        });
      });
      await page3.close();
    } catch (e) {
      console.error('Indeed scrape failed:', e.message);
    }


    const combined = (jobs || []).concat(topcvJobs || []).concat(indeedJobs || []);

    const timeFiltered = combined.filter(job => isWithinDays(job.time, maxDays));
    const filtered = timeFiltered.filter(job => {
      const text = (job.title || "") + " " + (job.tags || []).join(" ");
      const levels = parseLevels(text);
      if (levels.length === 0) return true;
      const lowerLevels = new Set(["Fresher", "Junior", "Mid", "Intern", "Middle"]);
      const seniorLevels = new Set(["Senior", "Lead", "Principal"]);
      const hasLower = levels.some(l => lowerLevels.has(l));
      const hasSenior = levels.some(l => seniorLevels.has(l));
      if (hasLower) return true;
      if (hasSenior && !hasLower) return false;
      return true;
    });

    res.json({ success: true, data: filtered });

  } catch (err) {
    console.error("Error in /jobs:", err.message || err);
    res.status(500).json({ error: err.message || String(err) });
  } finally {
    try {
      await context.close();
    } catch (e) {
      console.error('Failed to close context:', e.message || e);
    }
  }
});

(async () => {
  try {
    console.log('Launching shared browser...');
    sharedBrowser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
    console.log('Shared browser launched');

    const server = app.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
    });

    // Graceful shutdown
    const shutdown = async () => {
      console.log('Shutting down...');
      try {
        if (sharedBrowser) await sharedBrowser.close();
      } catch (e) {
        console.error('Error closing browser on shutdown:', e.message || e);
      }
      server.close(() => process.exit(0));
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (e) {
    console.error('Failed to launch browser:', e.message || e);
    process.exit(1);
  }
})();