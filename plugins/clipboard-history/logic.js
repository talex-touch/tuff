/**
 * Clipboard History Search Provider
 * A simple in-memory implementation for demonstration purposes.
 */
class ClipboardHistoryProvider {
  id = 'clipboard-history';
  type = 'history';
  name = 'Clipboard History';

  history = [];

  constructor() {
    console.log('[ClipboardHistoryProvider] Initialized.');
    this.onActivate(); // Pre-populate with sample data for demo
  }

  onActivate() {
    // In a real implementation, this would be triggered by a global shortcut
    // or when the search box is opened. Here, we just add dummy data.
    console.log('[ClipboardHistoryProvider] Activated. Populating with sample data.');
    this.history = [
      { id: 'cb-3', text: 'Tuff: A new intelligent launcher system.', timestamp: Date.now() },
      { id: 'cb-2', text: 'PluginManager implementation details.', timestamp: Date.now() - 10000 },
      { id: 'cb-1', text: 'https://www.electronjs.org/', timestamp: Date.now() - 20000 },
    ];
  }

  async onSearch(query) {
    const keyword = query.text.toLowerCase();
    if (!keyword) {
      // If no keyword, return the most recent items
      return this.history.slice(0, 10).map(this.toTuffItem);
    }

    const filteredHistory = this.history.filter(entry =>
      entry.text.toLowerCase().includes(keyword)
    );

    return filteredHistory.map(this.toTuffItem);
  }

  toTuffItem(entry) {
    return {
      id: `clipboard-${entry.id}`,
      source: {
        type: 'history',
        id: 'clipboard-history',
        name: 'Clipboard History',
        permission: 'safe',
      },
      kind: 'action',
      render: {
        mode: 'default',
        basic: {
          title: entry.text,
          subtitle: `Copied at ${new Date(entry.timestamp).toLocaleString()}`,
          icon: { type: 'icon', value: 'clipboard' }
        },
        layout: {
          display: 'list',
        }
      },
      actions: [
        {
          id: 'copy',
          type: 'copy',
          label: 'Copy to Clipboard',
          primary: true,
          payload: entry.text,
        },
        {
          id: 'delete',
          type: 'delete',
          label: 'Delete from History',
        }
      ],
      scoring: {
        recency: entry.timestamp / Date.now(), // Simple recency score
        final: entry.timestamp / Date.now(),
      }
    };
  }
}

// The plugin must export a class that implements ISearchProvider
export default ClipboardHistoryProvider;