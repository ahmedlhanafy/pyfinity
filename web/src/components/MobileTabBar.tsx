import { House, Sliders, Lightning, GearSix } from '@phosphor-icons/react';

type MobileTab = 'home' | 'mode' | 'energy' | 'settings';

interface MobileTabBarProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
}

const TABS: { key: MobileTab; label: string; icon: typeof House }[] = [
  { key: 'home', label: 'Home', icon: House },
  { key: 'mode', label: 'Mode', icon: Sliders },
  { key: 'energy', label: 'Energy', icon: Lightning },
  { key: 'settings', label: 'Settings', icon: GearSix },
];

export default function MobileTabBar({ activeTab, onTabChange }: MobileTabBarProps) {
  return (
    <nav className="mobile-tab-bar">
      {TABS.map(tab => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            className={`mobile-tab-item${isActive ? ' active' : ''}`}
            onClick={() => onTabChange(tab.key)}
          >
            <Icon size={22} weight={isActive ? 'fill' : 'regular'} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
