# Sync

The `Polyglot Toolbox` offers powerful synchronization capabilities to keep your data consistent across multiple devices. This guide will explain how to set up and use the sync feature.

## Setting Up Sync

To enable synchronization, you need to configure a sync provider. The application supports several providers, including cloud storage services and custom servers.

### Cloud Storage Providers

1. Google Drive
2. Dropbox
3. OneDrive

To set up sync with a cloud storage provider:
1. Open the Settings menu.
2. Navigate to the "Sync" section.
3. Select your preferred provider from the list.
4. Follow the authentication prompts to connect your account.

### Custom Server

You can also set up sync with a custom server by providing the server URL and authentication credentials.

1. In the "Sync" settings, select "Custom Server".
2. Enter the server URL.
3. Provide your username and password or API key.
4. Click "Connect" to establish the connection.

Example custom server configuration:
```json
{
  "serverUrl": "https://your-sync-server.com",
  "username": "your-username",
  "password": "your-password"
}
```

## Sync Frequency

You can configure how often the application synchronizes your data.

Options include:
- Manual (sync only when you trigger it)
- Every 5 minutes
- Every 15 minutes
- Every 30 minutes
- Every hour
- Every 6 hours
- Every 12 hours
- Daily

To change the sync frequency:
1. Go to the "Sync" settings.
2. Find the "Sync Frequency" option.
3. Select your preferred interval from the dropdown list.

## Conflict Resolution

When the same data is modified on multiple devices, conflicts may occur. The application provides several strategies for resolving these conflicts.

### Strategies

1. **Last Write Wins**: The most recently modified version is kept.
2. **Keep Both**: Both versions are preserved, and you can manually merge them later.
3. **Manual Resolution**: You are prompted to choose which version to keep.

To set your conflict resolution strategy:
1. Open the "Sync" settings.
2. Locate the "Conflict Resolution" section.
3. Select your preferred strategy.

## Sync Status

You can monitor the status of your synchronization in the status bar at the bottom of the application window. It will show:
- Last sync time
- Number of items synced
- Any errors that occurred during sync

### Sync Log

For detailed information about sync activities, you can view the sync log.

1. Open the "Help" menu.
2. Select "Sync Log" to open the log window.
3. The log will show timestamps, actions performed, and any errors encountered.

Example log entry:
```
2023-10-15 14:30:22 - Sync started
2023-10-15 14:30:25 - 15 items downloaded
2023-10-15 14:30:27 - 3 items uploaded
2023-10-15 14:30:28 - Sync completed successfully
```

## Troubleshooting

If you encounter issues with synchronization, try the following steps:

1. Check your internet connection.
2. Verify that your sync provider credentials are correct.
3. Ensure that the sync server is accessible.
4. Check the sync log for error messages.
5. Try manually triggering a sync to see if the issue persists.

If problems continue, you may need to reset your sync configuration:
1. Go to "Sync" settings.
2. Click "Reset Sync Data".
3. Reconfigure your sync provider.