<p align="center"><img src="assets/logo.svg" alt="Kart Kokpiti logo" width="96"></p>

# Kart Kokpiti ("Card Cockpit")

A credit card dashboard that tracks balances, statements, payments, installments and shared expenses in one place.
It runs **entirely in the browser**: no server, no account, no build step. Your data is stored only in your own browser (`localStorage`) and is never sent anywhere.

**Live app:** https://hasanakkaya0.github.io/kart-kokpiti/

> **Language & market:** The interface is in Turkish and the money rules follow Turkish banking practice (TRY / EUR / USD accounts, central-bank interest-rate tiers, KKDF/BSMV taxes).
> The calculation core is language-neutral and covered by unit tests.

> **License:** All rights reserved — see [LICENSE](LICENSE). The source is public for viewing only; it may not be copied, modified or redistributed.
> Using the hosted app for personal purposes is fine.

## Highlights

- **Rollover-based debt model.** Every card currency is its own account. Payments are entered against the account and applied to the latest closed statement by date.
  Current debt = what remains of the last closed statement, so balances are never double-counted.
- **Two ways to enter a statement:** the bank's statement total (rollover included) or only the new spending (the rollover is added dynamically).
- **Minimum payment rule** based on card limit (configurable); shared-limit card groups use the group limit; the bank's exact figure can be entered.
- **Interest engine:** tiered monthly rates chosen from the statement balance (TL + foreign currency combined, converted at that month's rate), plus taxes (x1.30),
  day-by-day accrual from the statement date when the full balance is not paid by the due date, late-payment surcharge, and a yearly "interest paid" counter.
- **Multi-currency:** TL / EUR / USD accounts with a rate per month (carried forward when empty) and a one-click fetch of the latest reference rate.
- **Period spending, installments and limit:** unbilled spending, installment plans (including deferred ones), converting a statement into installments, prepaying installments,
  pending authorizations ("provizyon"), and a limit bar that accounts for all of them.
- **Refunds, credits and foreign-to-TL conversion** handled explicitly, so totals and minimums stay consistent with the bank.
- **When money is short:** "Distribute my cash" (late minimums first, then due-soon minimums, then the highest-interest debt) and a **debt payoff plan** with end month, total interest and month-by-month table.
- **Shared expenses ledger:** multiple people, trip groups, per-currency balances, flexible splits (half / mine / theirs / custom / percentage), partial settlements, WhatsApp/CSV summaries.
- **Import / export:** JSON backup and restore, Excel export, import from the original spreadsheet.
- **Keyboard-first:** single-key shortcuts for the common actions; works on desktop and phone; light and dark themes.

## Using it

1. Open the live app (or `index.html` locally in Chrome / Edge). Use **Settings → Load sample data** (*Ayarlar → Örnek veri yükle*) to explore with fictional data.
2. Add your cards and set each card's **statement day** and **due day**.
3. Enter the latest statement of each card ("Statement received"), then record payments as you make them.
4. Back up regularly with **Settings → Download backup (JSON)** (*Ayarlar → Yedek indir*) — data lives only in your browser, so clearing site data erases it.

## Project structure

```
index.html          app shell
assets/logo.svg     logo and favicon
css/style.css       design system (light/dark theme, responsive)
js/core.js          calculation core — UI-independent, unit-tested (window.KT)
js/app.js           shell: persistence, navigation, modals, shared helpers (App.I), icons, actions, keyboard, startup
js/ozet.js          Overview screen
js/kartlar.js       Cards, card detail, payment / statement / period / pending / installment dialogs, payoff plan, cash distribution
js/ayarlar.js       Settings, exchange-rate fetching, shared-limit groups
js/shared.js        Shared expenses
js/io.js            import / export (Excel, JSON, legacy data), sample data
tests/core.test.js  node tests/core.test.js  -> 140 tests
eslint.config.mjs   npx --yes eslint js  -> development lint (not needed to run the app)
```

Vanilla JavaScript and CSS; no framework, no bundler, no dependencies at runtime. Files share helpers through a small `App.I` registry and are loaded in a fixed order from `index.html`.

## How the numbers work

**Rollover.** Older statements' leftovers are not summed; they are shown as "carried over" into the next statement.

**Minimum payment.** Default: cards with a limit up to 100,000 TL pay 20%, above that 40% (editable).

**Interest.** The monthly rate comes from the central-bank tier table (default: below 30,000 TL 3.25% · 30,000–180,000 TL 3.75% · above 180,000 TL 4.25%; late +0.30),
multiplied by taxes (KKDF 15% + BSMV 15% = x1.30). Tiers are editable in Settings, and a card can use a manual rate. Projections do not compound interest on interest.

**Day-by-day interest.** If the full statement balance is not paid by the due date, ordinary interest accrues on the remaining amount from the statement date (monthly rate / 30);
payments after the due date reduce the balance from that day; the unpaid part of the minimum gets the late rate. The interest lands on the next statement.

**Limit.** Used limit = current debt + period spending + all remaining installments + pending authorizations; foreign-currency amounts are converted at the current rate.

**Statement installments / prepayment.** Converting a statement removes it from current debt and spreads it as interest-bearing installments (never counted twice).
Prepaying installments creates a credit balance that is deducted from later statements and frees the limit.

## Keyboard

When not typing in a field: `1`–`4` tabs · `O` payment · `E` statement · `T` batch statements · `D` period spending · `B` pending · `H` shared expense · `P` distribute cash · `F` payoff plan · `K` add card · `Y` backup · `?` list.
In dialogs: `Enter` saves, `Esc` closes, `Tab` cycles inside the dialog.

## Development

```
node tests/core.test.js     # unit tests for the calculation core
npx --yes eslint js         # catches undefined names and broken template strings
```

There is no build step: edit the files and reload. When changing assets, bump the `?v=` query on the `<script>` / `<link>` tags in `index.html` to avoid stale browser caches.

## Roadmap

- Cross-device sync with end-to-end encryption
- Installable PWA with offline support and due-date reminders
- Spending categories and monthly budget analysis
