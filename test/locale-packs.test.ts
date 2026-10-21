// @vitest-environment jsdom
// The language packs Vela publishes (`@luxalgo/vela/locales/<tag>`). Each pack names only
// messages English has, every message keeps working in its language, and once a workspace
// reads in that language no English is left on screen apart from names and acronyms.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

(globalThis as { CSS?: unknown }).CSS ??= { escape: (v: string) => v };
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

import { registerLocale, type LocalePack } from '../src/plugin';
import { parseMessage } from '../src/core/i18n/icu';
import { canonicalLocale, localeDirection } from '../src/core/i18n/locale';
import { VelaWorkspace } from '../src/workspace/VelaWorkspace';
import english from '../src/locales/en.json';
import { shownStrings } from './support/shown-text';

type PackGlob = (patterns: string[], options: { import: string; eager: true }) => Record<string, LocalePack>;
const packFiles = (import.meta as unknown as { glob: PackGlob }).glob(['../src/locales/*.ts', '!../src/locales/*.d.ts', '!../src/locales/en.ts'], {
    import: 'default',
    eager: true,
});

const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });

/** Every translated pack with the tag its file is published under and its language's name. */
const packs = Object.entries(packFiles)
    .map(([file, pack]) => {
        const tag = file.slice('../src/locales/'.length, -'.ts'.length);
        return { tag, language: languageNames.of(tag) ?? tag, pack };
    })
    .sort((a, b) => a.tag.localeCompare(b.tag));

/** The packs as `describe.each` rows: the language's name first, for the suite's title. */
const byLanguage = packs.map((p) => [p.language, p] as const);

const ENGLISH = english as Record<string, string>;

/** Names written the same in every language. */
const PRODUCT_NAMES = ['LuxAlgo', 'Vela', 'Quant', 'PineTS', 'Pine Script®'];

type Nodes = ReturnType<typeof parseMessage>;

/** The values a message takes, each with its kind: `count:plural`, `price:number/integer`. */
function argumentShape(message: string): string[] {
    const out = new Set<string>();
    const walk = (nodes: Nodes): void => {
        for (const n of nodes) {
            if (typeof n === 'string' || n.kind === 'pound') continue;
            if (n.kind === 'arg') out.add(`${n.name}:${n.format ?? 'text'}${n.style ? `/${n.style}` : ''}`);
            else {
                out.add(`${n.name}:${n.kind === 'select' ? 'select' : n.ordinal ? 'selectordinal' : 'plural'}`);
                for (const branch of Object.values(n.options)) walk(branch);
            }
        }
    };
    walk(parseMessage(message));
    return [...out].sort();
}

/** Every plural in a message: whether it counts ordinals, and the forms it writes. */
function plurals(message: string): Array<{ ordinal: boolean; forms: string[] }> {
    const out: Array<{ ordinal: boolean; forms: string[] }> = [];
    const walk = (nodes: Nodes): void => {
        for (const n of nodes) {
            if (typeof n === 'string' || n.kind === 'pound' || n.kind === 'arg') continue;
            if (n.kind === 'plural') out.push({ ordinal: n.ordinal, forms: Object.keys(n.options).filter((k) => !k.startsWith('=')) });
            for (const branch of Object.values(n.options)) walk(branch);
        }
    };
    walk(parseMessage(message));
    return out;
}

/** The literal text of a message, without its argument syntax. */
function literalText(message: string): string {
    let out = '';
    const walk = (nodes: Nodes): void => {
        for (const n of nodes) {
            if (typeof n === 'string') out += ` ${n}`;
            else if (n.kind === 'plural' || n.kind === 'select') for (const branch of Object.values(n.options)) walk(branch);
        }
    };
    walk(parseMessage(message));
    return out;
}

/** Runs of Latin letters (accents included), so a Latin word inside other scripts stands alone. */
const LATIN_WORD = /[\p{Script=Latin}\p{M}]+(?:['’][\p{Script=Latin}\p{M}]+)*/gu;

function latinWords(text: string): string[] {
    return text.match(LATIN_WORD) ?? [];
}

const wordsOf = (messages: readonly string[]): Set<string> => new Set(messages.flatMap((m) => latinWords(literalText(m)).map((w) => w.toLowerCase())));

/** Every word English writes, lower-cased. */
const englishWords = wordsOf(Object.values(ENGLISH));

/** Messages that are names (an indicator, a city, a chart type, the forex market): a
 *  language may keep them exactly as English writes them. */
const NAME_ID = /^(indicator\.[A-Za-z0-9]+\.(title|shortTitle)|timezone\.[A-Z][A-Za-z]*\.[A-Za-z.]+|chart\.priceStyle\.[A-Za-z]+|widget\.symbolPicker\.tab\.forex)$/;

/** The words a pack writes in its own language: its translated messages, and the names it
 *  keeps as written. A message the pack leaves exactly as English is no translation. */
function packWords(pack: LocalePack): Set<string> {
    return wordsOf(Object.entries(pack.messages).filter(([id, text]) => text !== ENGLISH[id] || NAME_ID.test(id)).map(([, text]) => text));
}

/**
 * The English words left on screen in a pack's language: a word English writes that the
 * pack's own text never uses. A name the pack keeps (Vela, Heikin Ashi), an acronym (RSI,
 * UTC), a unit letter and a symbol from the data are no English words.
 */
function englishLeft(root: Element, pack: LocalePack): string[] {
    const own = packWords(pack);
    const left = new Set<string>();
    for (const shown of shownStrings(root)) {
        for (const word of latinWords(shown)) {
            if (word.length < 2 || !/^[A-Za-z]+(?:['’][A-Za-z]+)*$/.test(word) || /^[A-Z]+$/.test(word)) continue;
            const lower = word.toLowerCase();
            if (englishWords.has(lower) && !own.has(lower)) left.add(`${word} (in "${shown.trim()}")`);
        }
    }
    return [...left];
}

beforeAll(() => {
    Element.prototype.animate ??= (() => ({ cancel() {}, finish() {}, addEventListener() {} })) as unknown as Element['animate'];
});

const disposers: Array<() => void> = [];
afterEach(() => {
    while (disposers.length) disposers.pop()!();
    document.body.replaceChildren();
});

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Opening a workspace and walking its dialogs is heavy work in jsdom. */
const WORKSPACE_TIMEOUT = 30_000;

/** A workspace switched to `pack`'s language at runtime, the way a host does it. */
function workspaceIn(pack: LocalePack, options: Record<string, unknown> = {}): { host: HTMLElement; ws: VelaWorkspace } {
    disposers.push(registerLocale(pack));
    const host = document.createElement('div');
    document.body.append(host);
    const ws = new VelaWorkspace(host, { layout: '2h', ...options } as never);
    disposers.push(() => ws.destroy());
    ws.setLocale(pack.locale);
    return { host, ws };
}

describe.each(byLanguage)('the %s language pack', (_language, { tag, pack }) => {
    it('is published under its own language tag, and says so when the language reads right to left', () => {
        expect(pack.locale).toBe(tag);
        expect(canonicalLocale(tag)).toBe(tag);
        expect(pack.direction ?? 'ltr').toBe(localeDirection(tag));
    });

    it('names only messages English has, so it carries no stale or misspelled id', () => {
        const unknown = Object.keys(pack.messages).filter((id) => !(id in ENGLISH));
        expect(unknown).toEqual([]);
    });

    it("reads every message with the chart's own message parser, taking the same values as English", () => {
        for (const [id, text] of Object.entries(pack.messages)) {
            expect(() => parseMessage(text), id).not.toThrow();
            expect(argumentShape(text), id).toEqual(argumentShape(ENGLISH[id]!));
        }
    });

    it('writes every count the way its language does, with each plural form the language needs', () => {
        const cardinal = new Intl.PluralRules(tag).resolvedOptions().pluralCategories;
        const ordinal = new Intl.PluralRules(tag, { type: 'ordinal' }).resolvedOptions().pluralCategories;
        for (const [id, text] of Object.entries(pack.messages)) {
            for (const p of plurals(text)) {
                const missing = (p.ordinal ? ordinal : cardinal).filter((form) => !p.forms.includes(form));
                expect(missing, id).toEqual([]);
            }
        }
    });

    it('keeps the product names as written', () => {
        for (const [id, text] of Object.entries(pack.messages)) {
            for (const name of PRODUCT_NAMES) if (ENGLISH[id]!.includes(name)) expect(text, id).toContain(name);
        }
    });

    it('writes numbers with Western digits only', () => {
        const otherDigits = Object.entries(pack.messages).filter(([, text]) => /(?![0-9])\p{Nd}/u.test(text));
        expect(otherDigits).toEqual([]);
    });
});

describe.each(byLanguage)('a workspace in %s', (_language, { pack }) => {
    it('shows no English in its chrome, panels and dialogs, apart from names and acronyms', async () => {
        const { host, ws } = workspaceIn(pack);
        const shows = (id: string): boolean => shownStrings(host).some((s) => s.includes(pack.messages[id]!));
        await settle();
        expect(englishLeft(host, pack)).toEqual([]);

        ws.context().togglePanel('dataWindow', true);
        expect(shows('widget.dataWindow.title')).toBe(true);
        expect(englishLeft(host, pack)).toEqual([]);

        ws.context().togglePanel('objects', true);
        expect(shows('widget.objectTree.mainChart')).toBe(true);
        expect(englishLeft(host, pack)).toEqual([]);

        ws.context().openSymbolSearch();
        await settle();
        expect(shows('widget.symbolPicker.title')).toBe(true);
        expect(englishLeft(host, pack)).toEqual([]);

        host.querySelector<HTMLButtonElement>('.vela-widget-indicators')!.click();
        await settle();
        expect(shows('indicator.rsi.title')).toBe(true);
        expect(englishLeft(host, pack)).toEqual([]);

        ws.cells()[0]!.chart.renderer.openSettings();
        await settle();
        expect(shows('chart.settings.chartSettings')).toBe(true);
        expect(englishLeft(host, pack)).toEqual([]);
    }, WORKSPACE_TIMEOUT);
});

describe.each(byLanguage)('indicator search in %s', (_language, { pack }) => {
    it(
        'someone reading in another language still finds an indicator by its English name',
        async () => {
            const { host } = workspaceIn(pack, { layout: false });
            await settle();
            host.querySelector<HTMLButtonElement>('.vela-widget-indicators')!.click();
            await settle();
            const search = host.querySelector<HTMLInputElement>('.vela-ip-search')!;
            const found = (query: string): string[] => {
                search.value = query;
                search.dispatchEvent(new Event('input'));
                return [...host.querySelectorAll('.vela-ip-name')].map((el) => el.textContent ?? '');
            };
            const translated = pack.messages['indicator.rsi.title']!;
            expect(translated).not.toBe('Relative Strength Index');
            expect(found(translated)).toContain(translated);
            expect(found('Relative Strength')).toContain(translated);
            expect(found('relative strength index')).toContain(translated);
            expect(found('Relative Strength Indexes')).toEqual([]);
            // Once on the chart, it is found the same way among the chart's indicators.
            found(translated);
            host.querySelector<HTMLElement>('.vela-ip-row[data-library]')!.click();
            expect(found('Relative Strength').filter((name) => name === translated)).toHaveLength(2);
        },
        WORKSPACE_TIMEOUT,
    );
});
