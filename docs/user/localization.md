# Localization

Vela renders in English by default. Set a locale and the chart formats its numbers and
dates for that locale, reads its interface text from the locale packs you register, and can
lay out its chrome right to left. With no localization options set, a chart looks and
behaves exactly as it always has.

Localization works the same on a bare chart (`new Vela(...)`), a
[workspace](./workspace.md) and the deprecated widget: every one of them takes the options
below, exposes `i18n` and `setLocale()`, and emits `locale:changed`.

## Set a locale

Pass a [BCP 47](https://www.rfc-editor.org/info/bcp47) tag as `locale`:

```ts
import { Vela } from '@luxalgo/vela';

const chart = new Vela('#chart', { data: bars, locale: 'de' });
```

Change it at runtime with `setLocale()`, which takes a tag or any of the localization
options. The chart re-renders its axes, chips and readouts in place, without re-running
indicators, and then emits `locale:changed`:

```ts
chart.on('locale:changed', ({ locale, direction }) => {
    document.documentElement.lang = locale; // keep your own chrome in step
});

chart.setLocale('fr');
chart.setLocale({ locale: 'ar', direction: 'auto' });
```

Fields you pass to `setLocale()` replace their current value; fields you leave out keep
theirs. Pass a field as `undefined` to return it to its default.

A workspace applies one localization to every cell and to its shared chrome:

```ts
import { VelaWorkspace } from '@luxalgo/vela/workspace';

const ws = new VelaWorkspace('#app', { layout: '4', locale: 'ja' });
ws.setLocale('ko'); // every cell, the shared panels, and cells a later layout creates
```

### The options

| Option | Default | What it does |
|---|---|---|
| `locale` | `'en'` | The language and region of interface text, numbers and dates. |
| `direction` | `'ltr'` | The direction of the chrome: `'ltr'`, `'rtl'`, or `'auto'` to follow the locale's script. The plot never mirrors. See [Right to left](#right-to-left). |
| `messages` | — | Your own text for any message, on top of the registered packs. See [Override any string](#override-any-string). |
| `numberingSystem` | `'latn'` | The digits of every chart number. See [Numbers and digits](#numbers-and-digits). |
| `hourCycle` | `'h23'` | The clock of chart times: `'h23'` (`14:30`), `'h12'` (`2:30 PM`), or `'locale'`. |
| `weekStart` | the locale's | The first day of the week in date pickers: `0` Sunday, `1` Monday, `6` Saturday. |
| `formatters` | — | Your own formatting for prices, percents, volumes, times and durations. See [Replace a formatter](#replace-a-formatter). |

### What follows the locale

- **Numbers and dates on the chart:** the price axis (price, percent, indexed and volume
  scales), the last-price label and its countdown, the time axis, the crosshair's price and
  time chips, and the values in the legend and the data window.
- **Calendars:** the date picker in an indicator's settings names months and weekdays in the
  locale, starts its weeks on the locale's first day, and orders month and year the way the
  locale writes them.
- **Interface text** that Vela declares as messages, such as the keyboard shortcuts panel
  and the date picker's controls. Most chrome text still reads in English; more of it
  moves into messages over time, and each message reads in English until a pack translates it.
- **The page:** the chart's root element carries `lang` once you set a locale, and `dir` once
  you set a direction. Without them the attributes stay off and your page decides.

## Add your own language

A locale pack is one plain object: a locale tag and its messages, keyed by message id.
Register it before you switch to its locale:

```ts
import { registerLocale } from '@luxalgo/vela/plugin';

const off = registerLocale({
    locale: 'de',
    messages: {
        'widget.shortcuts.title': 'Tastenkürzel',
        'widget.shortcuts.mouse': 'Maus',
        'ui.datePicker.nextMonth': 'Nächster Monat',
    },
});

chart.setLocale('de');
// Later, to remove the pack again:
off();
```

Registration is always a call: importing a pack never registers it. A pack only needs the
messages it translates. A message missing from a pack falls back through the locale's
parents to English: `pt-BR` reads `pt-BR`, then `pt`, then English; `zh-TW` reads `zh-TW`,
then `zh-Hant`, then `zh`. Several packs can share a locale (Vela's, a plugin's, your own);
for the same message, the pack registered last wins.

Start a translation from the English reference pack, which lists every message id with its
English text:

```ts
import en from '@luxalgo/vela/locales/en';

console.log(en.messages); // { 'ui.datePicker.chooseMonth': 'Choose month', … }
```

Locale packs are published as separate entry points (`@luxalgo/vela/locales/<tag>`), so a
page loads only the languages it imports. Load one when the user picks it:

```ts
const { default: pack } = await import('@luxalgo/vela/locales/en');
registerLocale(pack);
```

### Message syntax

Messages use a subset of ICU message syntax:

| Form | Example |
|---|---|
| A value | `Delta {value}` |
| A number | `{count, number}`, `{count, number, integer}`, `{share, number, percent}` |
| Plurals | `{count, plural, one {# bar} other {# bars}}`, with `=0 {…}` exact matches and `offset:1` |
| Ordinals | `{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}` |
| A choice | `{side, select, buy {Bought} sell {Sold} other {Traded}}` |

Plurals follow each language's own categories: Arabic has six (`zero`, `one`, `two`,
`few`, `many`, `other`), Polish and Russian four. An apostrophe is plain text
(`l'indicateur`); to show a literal brace, quote it: `'{'`. A translation that fails to
parse falls back to the English text instead of breaking the chart.

## Override any string

The `messages` option replaces any message for the current locale, on top of the registered
packs. It works in English too, to reword Vela's own text:

```ts
const chart = new Vela('#chart', {
    messages: { 'widget.shortcuts.title': 'Shortcuts' },
});
```

Message ids are typed: a misspelled id is a compile error. A plugin or host that declares its
own messages adds their ids to the catalog so they type-check too:

```ts
declare module '@luxalgo/vela/plugin' {
    interface VelaMessageCatalog {
        'acme.panel.title': string;
    }
}
```

## Right to left

Set `direction: 'rtl'`, or `'auto'` to follow the locale: Arabic, Hebrew, Persian, Urdu and
the other right-to-left scripts resolve to `'rtl'`. The direction lands as `dir` on the
chart's root element and on the workspace root, and the chrome under them follows it.

The plot never mirrors, whatever the direction. Time runs left to right with the newest bar
on the right, the price axis stays on the right, and the chart's arrow keys still move
toward older bars on the left. Prices, percents and times read left to right.

Some chrome still positions itself for left-to-right pages and does not mirror yet. Check
your layout in the right-to-left locales you ship.

## Numbers and digits

Chart numbers use Western digits in every language, Arabic included, so prices read the
same for everyone. Set `numberingSystem` to show other digits:

```ts
import { createTranslator } from '@luxalgo/vela/plugin';

// The same options a chart takes; `chart.i18n.format` gives the same results.
const price = (options) => createTranslator(options).format.price(58732.5, { decimals: 2, grouping: true });

price({ locale: 'ar-SA' });                            // 58,732.50
price({ locale: 'ar-SA', numberingSystem: 'locale' }); // ٥٨٬٧٣٢٫٥٠
price({ locale: 'hi', numberingSystem: 'deva' });      // ५८,७३२.५०
```

`'locale'` uses the locale's own digits, and any numbering system id (`'arab'`, `'deva'`,
`'thai'`, …) picks one. A tag with a `-u-nu-` extension (`'ar-u-nu-arab'`) picks its digits
when you leave `numberingSystem` unset.

Other conventions hold in every locale:

- **Separators follow the locale.** German reads `58.732,50`, Indian English groups in
  lakhs (`1,23,45,678.90`). The price axis leaves out group separators so its labels fit
  the scale.
- **Rounding is the same everywhere.** A price shows the same digits in every language; only
  the separators change.
- **The calendar is Gregorian.** Thai dates count Gregorian years, not Buddhist ones.
- **The clock is 24-hour** unless you set `hourCycle`.
- **Volumes abbreviate the locale's way:** `1.2M` in English, `120万` in Japanese,
  `1,2 Mio.` in German.

## Replace a formatter

Supply any of `price`, `percent`, `compact`, `timeTick`, `timeStamp` and `duration` in
`formatters`. Each receives the value and a context: the `locale`, the display `timeZone`,
the `surface` the value appears on (`'priceAxis'`, `'crosshair'`, `'lastPrice'`,
`'timeAxis'`, `'legend'`, `'dataWindow'`, …), the formatter's own fields, and `fallback()`,
which returns Vela's built-in formatting:

```ts
new Vela('#chart', {
    locale: 'de',
    formatters: {
        price: (value, ctx) => (ctx.surface === 'dataWindow' ? `${ctx.fallback()} €` : ctx.fallback()),
    },
});
```

A formatter that throws, or returns something other than a string, falls back to the
built-in formatting.

## Use the translator

`chart.i18n` (and `ws.i18n`) is the chart's translator. It holds the resolved settings
(`locale`, `direction`, `numberingSystem`, `hourCycle`, `weekStart`), translates messages
with `t()`, and formats values with `format`:

```ts
import { msg } from '@luxalgo/vela/plugin';

const SAVED = msg('acme.layout.saved', '{count, plural, one {# layout saved} other {# layouts saved}}');

chart.i18n.t(SAVED, { count: 3 });                       // "3 layouts saved"
chart.i18n.t('Plain text');                              // plain strings come back unchanged
chart.i18n.format.price(58732.5, { decimals: 2, grouping: true });
chart.i18n.format.timeStamp(Date.now(), { timeZone: 'Asia/Tokyo' });
```

The translator is the same object for the chart's lifetime and reads the new settings after
`setLocale()`, so you can keep it. Contributed actions and panels get the shell's translator
as `ctx.i18n`, and renderer layers as `args.i18n`. For UI you build outside a chart,
`createTranslator(options)` makes a standalone one.

## For contributors

Declare new interface text with `msg('area.component.key', 'English text')` and resolve it
through a translator. Then run:

```sh
npm run i18n:extract
```

It collects every `msg()` call into `src/locales/en.json`, the English catalog translations
start from, and into `src/locales/catalog.d.ts`, the type that checks message ids. The tests
fail when either file is out of date, or when a pack under `src/locales/` names an unknown
message or changes a message's arguments.
