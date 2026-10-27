# اورآ / Ora

- **اپ گوشی** (همین ریشه‌ی مخزن، روی GitHub Pages): https://parsaaminzade.github.io/ora/
- **سرور و پنل مدیریت** (پوشه‌ی `server/`، روی Cloudflare Workers + D1): https://ora.p128parsa.workers.dev
  - پنل: `/admin` · اپ گوشی روی همان سرور: `/app/` · قوانین: `/privacy`

## راه‌اندازی سرور (یک بار)
1. در کلادفلر: Workers & Pages › ora › Settings › Builds › Connect، مخزن `ParsaAminzade/ora`، شاخه‌ی `main`.
   Root directory: `server` · Deploy command: `npx wrangler deploy`
2. Settings › Variables and Secrets › Add › نوع Secret، نام `ADMIN_PASSWORD`، رمزی با دست‌کم ۱۰ نویسه.
3. از این به بعد هر تغییری در `server/` خودکار روی سرور می‌رود. جدول‌های پایگاه داده خودشان ساخته می‌شوند.

## آزمایش روی کامپیوتر
```
cd server && npm install
echo ADMIN_PASSWORD=یک-رمز-آزمایشی > .dev.vars
npx wrangler dev --local
```
