'use client';

import { useUIStore, type PanelType } from '@exotrade/core';

const NAV_ITEMS: { id: PanelType; label: string; icon: string }[] = [
    { id: 'chart', label: 'Chart', icon: '📈' },
    { id: 'order', label: 'Trade', icon: '💹' },
    { id: 'risk', label: 'Positions', icon: '📊' },
];

export function MobileNav() {
    const activePanel = useUIStore((s) => s.activePanel);
    const setActivePanel = useUIStore((s) => s.setActivePanel);

    return (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 safe-area-pb">
            <div className="flex items-center justify-around h-16">
                {NAV_ITEMS.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setActivePanel(item.id)}
                        className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${activePanel === item.id
                                ? 'text-green-500'
                                : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                    >
                        <span className="text-xl mb-1">{item.icon}</span>
                        <span className="text-xs font-medium">{item.label}</span>
                    </button>
                ))}
            </div>
        </nav>
    );
}
