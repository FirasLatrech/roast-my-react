# Slow Roast App

A deliberately buggy React app used to demo `roast-my-react`.

It contains intentional issues the CLI is designed to catch:

- **Bundle bloat** — imports all of `lodash` and `moment`
- **Oversized image** — a 5.5 MB PNG served uncompressed
- **Missing alt text** — thousands of `<img>` tags without `alt`
- **Low contrast** — text colors that fail WCAG
- **Expensive render work** — blocking loop in a component
- **Runaway re-renders** — parent state changes re-render 5000 list items
- **Invalid markup** — `<ul>` containing non-`<li>` children

## Run it

```bash
npm install
npm run dev
```

Then run roast-my-react against it:

```bash
cd ../..
npx roast-my-react --url http://localhost:5173
```
