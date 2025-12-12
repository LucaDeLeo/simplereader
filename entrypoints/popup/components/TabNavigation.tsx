interface TabNavigationProps {
  activeTab: 'player' | 'settings';
  onTabChange: (tab: 'player' | 'settings') => void;
}

export function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  return (
    <div className="sr-tabs" role="tablist">
      <button
        role="tab"
        aria-selected={activeTab === 'player'}
        aria-controls="panel-player"
        className={`sr-tab ${activeTab === 'player' ? 'sr-tab--active' : ''}`}
        onClick={() => onTabChange('player')}
      >
        Player
      </button>
      <button
        role="tab"
        aria-selected={activeTab === 'settings'}
        aria-controls="panel-settings"
        className={`sr-tab ${activeTab === 'settings' ? 'sr-tab--active' : ''}`}
        onClick={() => onTabChange('settings')}
      >
        Settings
      </button>
    </div>
  );
}
