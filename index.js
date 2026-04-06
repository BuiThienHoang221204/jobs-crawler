// server.js
const express = require("express");
const { chromium } = require("playwright");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/jobs", async (req, res) => {
  const keyword = req.query.keyword || "frontend";

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
  });

  const page = await context.newPage();
  
  try {
    await page.goto(
      `https://itviec.com/viec-lam-it/${keyword}-developer`,
      {
        waitUntil: "domcontentloaded",
        timeout: 60000
      }
    );

    await page.waitForTimeout(3000);
    await page.waitForSelector(".job-card", { timeout: 30000 });

    const jobs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll(".job-card")).map(job => {
        const titleEl = job.querySelector("h3");
        const companyEl = job.querySelector(".logo-employer-card + span a");

        const rawLink = titleEl?.getAttribute("data-url");

        return {
          title: titleEl?.innerText?.trim(),

          // ✅ link job chuẩn
          link: rawLink
            ? rawLink.startsWith("http")
              ? rawLink
              : "https://itviec.com" + rawLink
            : null,

          company: companyEl?.innerText?.trim(),

          // ✅ link company
          company_link: companyEl
            ? "https://itviec.com" + companyEl.getAttribute("href")
            : null,

          tags: Array.from(job.querySelectorAll(".itag")).map(t =>
            t.innerText.trim()
          ),

          // ✅ "Đăng 4 giờ trước"
          time: job
            .querySelector(".small-text.text-dark-grey")
            ?.innerText?.trim()
        };
      });
    });

    await browser.close();

    res.json({
      success: true,
      data: jobs // ❌ không filter gì cả
    });

  } catch (err) {
    await browser.close();
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log("http://localhost:" + PORT);
});