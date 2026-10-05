// @vitest-environment jsdom
// Every surface of the chart's chrome announces itself: `vela:open` on its own element once
// it shows, `vela:close` while it still shows (before it hides or leaves the DOM), both
// bubbling to the host — so a host follows menus and panels without watching the DOM.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';

(globalThis as { CSS?: unknown }).CSS ??= { escape: (v: string) => v };
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

import { Menu } from '../src/ui/components/menu/view';
import { Popover } from '../src/ui/components/popover/view';
import { Dialog } from '../src/ui/components/dialog/view';
import { Drawer } from '../src/ui/components/drawer/view';
import { SidePanel } from '../src/widget/side-panel';
import { LayoutPicker } from '../src/widget/layout-picker';
import { SURFACE_OPEN_EVENT, SURFACE_CLOSE_EVENT, type SurfaceEventDetail } from '../src/ui';

beforeAll(() => {
    Element.prototype.animate ??= (() => ({ cancel() {}, finish() {}, addEventListener() {} })) as unknown as Element['animate'];
});

afterEach(() => {
    document.body.replaceChildren();
});

/** Zag machines open and close on their own tick; wait for it. */
const settled = () => new Promise<void>((r) => setTimeout(r, 50));

interface Heard {
    type: string;
    kind: string;
    target: HTMLElement;
    trigger: HTMLElement | null;
    /** Whether the surface was attached and visible when the event fired. */
    showing: boolean;
}

/** Shown = attached, and neither it nor an ancestor is `hidden` / `display: none`. */
function showing(el: HTMLElement): boolean {
    if (!el.isConnected) return false;
    for (let n: HTMLElement | null = el; n; n = n.parentElement) {
        if (n.hidden || n.style.display === 'none') return false;
    }
    return true;
}

/** A themed host the surfaces portal into, recording what bubbles up to it. */
function hostWithEar(): { host: HTMLElement; heard: Heard[] } {
    const host = document.createElement('div');
    host.className = 'vela-ui';
    document.body.append(host);
    const heard: Heard[] = [];
    const ear = (e: Event): void => {
        const { kind, trigger } = (e as CustomEvent<SurfaceEventDetail>).detail;
        const target = e.target as HTMLElement;
        heard.push({ type: e.type, kind, target, trigger, showing: showing(target) });
    };
    host.addEventListener(SURFACE_OPEN_EVENT, ear);
    host.addEventListener(SURFACE_CLOSE_EVENT, ear);
    return { host, heard };
}

function button(host: HTMLElement): HTMLButtonElement {
    const b = document.createElement('button');
    host.append(b);
    return b;
}

describe('surface open/close events', () => {
    it('names the event pair', () => {
        expect([SURFACE_OPEN_EVENT, SURFACE_CLOSE_EVENT]).toEqual(['vela:open', 'vela:close']);
    });

    it('menu: opens and closes on its list, with its trigger', async () => {
        const { host, heard } = hostWithEar();
        const trigger = button(host);
        const menu = new Menu({ host, trigger, items: [{ id: 'a', label: 'A' }] });
        menu.open();
        await settled();
        menu.close();
        await settled();
        expect(heard.map((h) => [h.type, h.kind, h.target.className, h.trigger === trigger, h.showing])).toEqual([
            ['vela:open', 'menu', 'vela-menu', true, true],
            ['vela:close', 'menu', 'vela-menu', true, true],
        ]);
        menu.destroy();
    });

    it('menu: a teardown while open still announces the close', async () => {
        const { host, heard } = hostWithEar();
        const menu = new Menu({ host, items: [{ id: 'a', label: 'A' }] });
        menu.openAt(10, 10);
        await settled();
        menu.destroy();
        expect(heard.map((h) => [h.type, h.trigger])).toEqual([
            ['vela:open', null],
            ['vela:close', null],
        ]);
    });

    it('popover: open once placed, close before it leaves the DOM', () => {
        const { host, heard } = hostWithEar();
        const trigger = button(host);
        const pop = new Popover({ trigger, host, content: document.createElement('div') });
        pop.show();
        pop.show(); // already open: re-places, announces nothing
        pop.hide();
        pop.hide();
        expect(heard.map((h) => [h.type, h.kind, h.target === pop.el, h.trigger === trigger, h.showing])).toEqual([
            ['vela:open', 'popover', true, true, true],
            ['vela:close', 'popover', true, true, true],
        ]);
        expect(pop.el.isConnected).toBe(false);
    });

    it('popover: a fading close announces as the fade starts', () => {
        const { host, heard } = hostWithEar();
        const pop = new Popover({ trigger: button(host), host, fadeMs: 120 });
        pop.show();
        pop.hide();
        expect(heard.map((h) => h.type)).toEqual(['vela:open', 'vela:close']);
        expect(pop.el.isConnected).toBe(true); // still fading out
    });

    it('popover: a listener that hides it on open leaves no dismiss handlers behind', () => {
        const { host } = hostWithEar();
        const pop = new Popover({ trigger: button(host), host });
        host.addEventListener(SURFACE_OPEN_EVENT, () => pop.hide(), { once: true });
        pop.show();
        expect(pop.open).toBe(false);
        const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        document.dispatchEvent(esc);
        expect(esc.defaultPrevented).toBe(false); // a stale Escape handler would swallow it
    });

    it('popover and side panel: a listener that closes again on close does not re-enter', () => {
        const { host, heard } = hostWithEar();
        const pop = new Popover({ trigger: button(host), host });
        const panel = new SidePanel(host, 'Objects', 'vela-test');
        host.addEventListener(SURFACE_CLOSE_EVENT, () => {
            pop.hide();
            panel.toggle(false);
        });
        pop.show();
        pop.hide();
        panel.toggle(true);
        panel.toggle(false);
        expect(heard.map((h) => [h.type, h.kind])).toEqual([
            ['vela:open', 'popover'],
            ['vela:close', 'popover'],
            ['vela:open', 'panel'],
            ['vela:close', 'panel'],
        ]);
        expect(panel.open).toBe(false);
    });

    describe.each([
        ['dialog', (host: HTMLElement) => new Dialog({ host })],
        ['drawer', (host: HTMLElement) => new Drawer({ host })],
    ] as const)('%s', (kind, make) => {
        it('opens and closes on its panel, with the control that opened it', async () => {
            const { host, heard } = hostWithEar();
            const opener = button(host);
            opener.focus();
            const view = make(host);
            view.show();
            await settled();
            view.hide();
            await settled();
            expect(heard.map((h) => [h.type, h.kind, h.target.classList.contains(`vela-${kind}`), h.trigger === opener, h.showing])).toEqual([
                ['vela:open', kind, true, true, true],
                ['vela:close', kind, true, true, true],
            ]);
            view.destroy();
            expect(heard).toHaveLength(2);
        });

        it('a teardown while open announces the close once', async () => {
            const { host, heard } = hostWithEar();
            const view = make(host);
            view.show();
            await settled();
            view.destroy();
            await settled();
            expect(heard.map((h) => h.type)).toEqual(['vela:open', 'vela:close']);
            expect(heard[0]!.trigger).toBeNull(); // focus sat on <body>: no opener to name
        });
    });

    it('side panel: opens and closes on its element, and on teardown while open', () => {
        const { host, heard } = hostWithEar();
        const panel = new SidePanel(host, 'Objects', 'vela-test');
        panel.toggle(true);
        panel.toggle(true); // no change, no event
        panel.toggle(false);
        panel.toggle(true);
        panel.destroy();
        expect(heard.map((h) => [h.type, h.kind, h.target === panel.el, h.showing])).toEqual([
            ['vela:open', 'panel', true, true],
            ['vela:close', 'panel', true, true],
            ['vela:open', 'panel', true, true],
            ['vela:close', 'panel', true, true],
        ]);
    });

    it('layout picker: opens and closes on its card, with its trigger', () => {
        const { host, heard } = hostWithEar();
        const trigger = button(host);
        const picker = new LayoutPicker({
            trigger,
            host,
            shape: () => ({ rows: 1, cols: 1 }),
            presets: () => [],
            onSelectGrid: () => {},
            onSelectPreset: () => {},
            syncs: () => [],
            onToggleSync: () => {},
        });
        picker.open();
        picker.close();
        expect(heard.map((h) => [h.type, h.kind, h.target.className, h.trigger === trigger, h.showing])).toEqual([
            ['vela:open', 'popover', 'vela-lp', true, true],
            ['vela:close', 'popover', 'vela-lp', true, true],
        ]);
        picker.destroy();
        expect(heard).toHaveLength(2);
    });
});
