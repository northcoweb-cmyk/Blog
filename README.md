# Tensor Street

**The daily briefing on the AI economy.** A free news site that fills itself with AI, markets, policy, startup and small-business news around the clock, plus a newsroom where you publish your own articles, draft with AI, and make Instagram posts.

- **Live wire:** 31 free news sources (TechCrunch, The Verge, Ars Technica, MIT Tech Review, CNBC, Yahoo Finance, OpenAI, Google DeepMind, NVIDIA and more). Stories are filtered so everything ties back to AI, grouped when several outlets cover the same thing, ranked, and refreshed every few minutes.
- **Breaking news:** stories picked up by several outlets within a few hours get a red banner on every page.
- **The Brief:** a morning, midday or evening edition with the top stories and a "Why it matters" line for each. Written by AI if you add a free key.
- **AI markets tape:** live prices for Nvidia, Microsoft, Alphabet and other AI leaders, plus the Tensor Street AI Index.
- **Eight desks:** AI, Models & Launches, Markets, Policy, Startups, **Main Street AI** (small businesses), Research, Tech.
- **From the Desk:** your own articles, with photos, scheduling and proper link previews on Google, iMessage and social media.
- **Newsroom (`/admin`):** editor, image uploads, "Draft with AI" from any headline, an Instagram post maker, a newsletter preview and a setup checklist.
- **Daily automation:** every morning it archives the edition, drafts your newsletter, and writes AI drafts of the top stories for you to review.
- **$0 to run:** Vercel Hobby, GitHub, free RSS feeds, Gemini's free tier and Buttondown's free tier.

---

## Put it online (about 10 minutes)

### 1. Deploy to Vercel
1. Go to **[vercel.com/new](https://vercel.com/new)** and sign in with GitHub.
2. Import this repository (`northcoweb-cmyk/blog`). If this code is on a branch, merge it into `main` first, or pick the branch during import.
3. Leave every build setting as it is (no framework, no build command) and click **Deploy**.

The site works as soon as the deploy finishes: the news, markets, brief and pages all run without any keys.

### 2. Lock your newsroom
In Vercel go to **Project → Settings → Environment Variables** and add:

| Name | Value |
|---|---|
| `ADMIN_PASSWORD` | a long password only you know |
| `CRON_SECRET` | any long random text (lets only Vercel run the daily job) |

Then open **Deployments → ⋯ → Redeploy**. Sign in at `yoursite.com/admin`.

### 3. Turn on publishing (free)
Your articles and images are saved into this GitHub repo, so you get free storage with full history.
1. Open **[GitHub → Settings → Developer settings → Fine-grained tokens](https://github.com/settings/personal-access-tokens/new)**.
2. **Repository access:** Only select repositories → this repo. **Permissions → Contents:** Read and write.
3. Add it in Vercel as `GITHUB_TOKEN` and redeploy.

### 4. Turn on AI writing (free, recommended)
1. Get a key at **[Google AI Studio](https://aistudio.google.com/apikey)**.
2. Add it in Vercel as `GEMINI_API_KEY` and redeploy.

This turns on the AI-written Brief, "Why it matters" notes on every story, **Draft with AI** in the newsroom, and the morning drafts. All AI writing follows a house style (plain English, no hype words, only facts from the sources) and is labeled for readers.

### 5. Turn on the email newsletter (optional, free up to 100 subscribers)
1. Sign up at **[buttondown.com](https://buttondown.com)** and copy your API key (Settings → API).
2. Add it in Vercel as `BUTTONDOWN_API_KEY` and redeploy.

Signup boxes start collecting emails, and each morning a newsletter draft is waiting in Buttondown. Set `NEWSLETTER_AUTOSEND=true` to send it automatically. Until this is connected, signup boxes point readers to Instagram and RSS instead.

### 6. Connect your domain
Vercel → **Project → Settings → Domains → Add** your domain, then follow the DNS instructions it shows. Add `SITE_URL=https://yourdomain.com` as a variable so links in the RSS feed and newsletter use it.

**Check everything:** the newsroom's **Setup & status** page shows a green check for each piece, plus which news sources are online.

---

## Your daily routine (about 20 minutes)

1. **Morning:** open `/admin`. Review the AI drafts the daily job wrote (Articles → drafts), fact-check them against the source link, then publish or delete.
2. Check the Newsletter tab. If you're not auto-sending, hit send in Buttondown.
3. **Instagram:** Newsroom wire → *Social post* on the day's biggest story → pick a format → **Download PNG** and **Copy caption** → post it.
4. **When something big drops** (a new model, a huge funding round): Newsroom wire → **Draft with AI** → edit → publish. It goes live within about a minute.
5. Once or twice a week, write something original. The **Main Street AI** desk is your edge: real stories of local businesses using AI.

The site keeps updating itself all day whether you log in or not.

---

## Brand

- **Name:** Tensor Street. "Tensor" is the basic building block of AI math; "Street" as in Wall Street. AI meets the market.
- **Brand kit:** open `/brand` on your site for logos, colors, fonts, voice rules, the Instagram profile picture and post templates, all downloadable.
- **Instagram:** upload `public/assets/brand/instagram-profile.png` as your avatar and `ig-launch.png` as your first post. The bio and posting rhythm are on the `/brand` page.
- **To rename:** change `SITE` in `public/assets/js/site.js` and `lib/site.js`.

---

## All settings

| Variable | Required | What it does |
|---|---|---|
| `ADMIN_PASSWORD` | yes | Password for `/admin` |
| `GITHUB_TOKEN` | for publishing | Saves articles and images to this repo |
| `GITHUB_REPO` / `GITHUB_BRANCH` | rarely | Auto-detected on Vercel. Set to `owner/repo` and the branch if needed |
| `GEMINI_API_KEY` | optional | Free AI writing (Google AI Studio). `GEMINI_MODEL` overrides the model |
| `GROQ_API_KEY` | optional | Alternative free AI provider |
| `OPENAI_API_KEY` | optional | OpenAI (paid per use, pennies per article). `OPENAI_MODEL` overrides the model (default `gpt-5-mini`) |
| `ANTHROPIC_API_KEY` | optional | Claude (paid). `ANTHROPIC_MODEL` overrides the model |
| `LLM_PROVIDER` | optional | Force `gemini`, `groq`, `openai` or `anthropic` |
| `BUTTONDOWN_API_KEY` | optional | Newsletter signups and daily email |
| `NEWSLETTER_AUTOSEND` | optional | `true` sends the daily email instead of drafting it |
| `CRON_SECRET` | recommended | Protects the daily job |
| `AUTO_DRAFT_COUNT` | optional | AI drafts per morning (default 2, `0` turns them off) |
| `AUTO_PUBLISH` | optional | `true` publishes AI drafts without review. Not recommended |
| `SITE_URL` | optional | Your domain, for RSS and email links |
| `INSTAGRAM_HANDLE` | optional | Defaults to `tensorstreet` |
| `FINNHUB_API_KEY` | optional | Backup source for stock prices |
| `SITE_TIMEZONE` | optional | Edition times (default `America/New_York`) |

---

## How it works

```
public/            the website (plain HTML, CSS and JavaScript, no build step)
  index.html …     pages; generated from dev/build-pages.js
  assets/js/       site.js (shared UI), home.js, story.js, admin.js (newsroom) …
  assets/brand/    logos, icons, social images
api/               3 Vercel functions: public.js, admin.js, cron.js
lib/               the engine
  sources.js       ← the news feeds. Add or remove sources here
  news.js          fetch → filter to AI → group duplicates → rank → breaking
  classify.js      keyword rules for desks, tags and "is this about AI"
  markets.js       stock tape (Yahoo Finance, Finnhub backup)
  brief.js         The Brief, "Why it matters", AI article drafts
  llm.js           Gemini / Groq / OpenAI / Claude + the house writing style
  content.js       your articles, images and archive (GitHub or local files)
content/           your articles (posts/), images (uploads/), daily archive (editions/)
vercel.json        routes, caching and the 6am ET daily cron job
```

- News is cached at Vercel's edge for about 5 minutes, so the site stays fast and free no matter how many readers you have.
- Headlines link to the original publisher. The site shows headlines, short summaries and its own analysis; it never copies full articles.
- Stories without a photo get generated cover art in the desk's color, so nothing ever looks broken.
- If a source goes down, the others keep working, and the Setup page shows which feeds are offline.

## Run it on your computer

```bash
npm install
npm run dev        # live news at http://localhost:3000 (admin password: tensor)
npm run dev:mock   # offline sample data, for design work
npm test
```

After editing a page layout in `dev/build-pages.js`, run `npm run pages`.
