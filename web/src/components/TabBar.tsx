import type { ActiveTab } from '../types';

interface TabBarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

const TABS: { key: ActiveTab; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'mode', label: 'Mode' },
  { key: 'energy', label: 'Energy' },
];

export default function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <div className="tab-bar">
      {TABS.map(tab => (
        <div
          key={tab.key}
          className={`tab-item${activeTab === tab.key ? ' active' : ''}`}
          onClick={() => onTabChange(tab.key)}
        >
          {tab.label}
        </div>
      ))}
    </div>
  );
}
