export default {
  nav: {
    home: 'Home',
    docs: 'Developer',
    tutorial: 'Tutorial',
    api: 'API',
    marketplace: 'Marketplace',
    about: 'About',
    qa: 'Q & A',
    developers: 'Developers',
    login: 'Log in',
    dashboard: 'Dashboard',
    pricing: 'Pricing',
    market: 'Market',
    doc: 'Developer',
    developer: 'Developer',
    download: 'Updates',
    blog: 'Blog',
  },
  ui: {
    languageToggle: {
      zhLabel: '中文',
      enLabel: 'English',
      switchToZh: 'Switch language to Chinese',
      switchToEn: 'Switch language to English',
    },
  },
  auth: {
    callbackProcessing: 'Processing your sign-in callback…',
    linuxdoWaitlistNotice:
      'LinuxDo level 2 and 3 members can join the waitlist immediately without waiting. Sign in with the same email you use on LinuxDo so we can verify your status quickly.',
    backToHome: 'Back to homepage',
    // App callback translations
    notSignedIn: 'You are not signed in.',
    tokenFailed: 'Failed to get authentication token.',
    redirectingToApp: 'Redirecting to Tuff…',
    redirectSuccess: 'Authentication successful! Opening Tuff…',
    manualOpen: 'If the app does not open automatically, please open Tuff manually.',
    authFailed: 'Authentication failed',
    tryAgain: 'Try Again',
  },
  pricing: {
    title: 'Choose the plan that matches your momentum.',
    subtitle: 'Upgrade directly inside Clerk. Once subscribed, you can unlock premium automations and surfaces instantly.',
    missingTable: 'Pricing table is not configured yet. Set NUXT_PUBLIC_CLERK_PRICING_TABLE_ID to display your plans.',
    loading: 'Loading pricing…',
  },
  updates: {
    badge: 'Release cadence',
    title: 'Updates & downloads',
    subtitle: 'Pick the channel that matches your risk tolerance and explore the latest builds.',
    channelSelector: {
      label: 'Release channels',
    },
    channels: {
      release: {
        badge: 'Stable',
        label: 'Release channel',
        description: 'Signed, fully verified builds recommended for production workspaces.',
        meta: 'Updated monthly',
      },
      beta: {
        badge: 'Beta',
        label: 'Beta channel',
        description: 'Pre-release builds with new features. Stable enough for daily use but may have minor issues.',
        meta: 'Updated bi-weekly',
      },
      snapshot: {
        badge: 'Preview',
        label: 'Snapshot channel',
        description: 'Early access builds shipping weekly. Expect experimental features and rapid iteration.',
        meta: 'Refreshed weekly',
      },
    },
    latest: {
      heading: 'Latest build',
      releaseDate: 'Released {date}',
      releaseDateFallback: 'Pending release',
      highlightsHeading: 'Highlights',
      notesCta: 'View release notes',
    },
    channelSummary: {
      title: 'Channel expectations',
      description: 'You are viewing the {channel} track. Everything here matches the guardrails listed above.',
      refreshHint: 'We publish channel updates after smoke, regression, and sync checks pass across supported platforms.',
      feedback: 'Notice something odd? Let us know through the dashboard feedback panel.',
    },
    empty: 'We have not shipped builds for this channel yet. Check back soon.',
    table: {
      title: 'Release history',
      description: 'Every build published to the {channel} track.',
      toggleLabel: 'View history',
      hideLabel: 'Hide history',
      latestBadge: 'Latest',
      viewNotes: 'Notes',
      columns: {
        version: 'Version',
        date: 'Released',
        summary: 'Key changes',
        actions: 'Links',
      },
    },
    downloads: {
      previewPortal: 'Preview portal',
      previewPortalDescription: 'Includes experimental builds, validation notes, and rollback steps.',
      releasePortal: 'Release portal',
      releasePortalDescription: 'Official installers and signature fingerprints for production teams.',
    },
    entries: {
      v2_0_0_preview: {
        summary: 'Prepares the workspace redesign and FlowScript runtime ahead of the 2.0 rollout.',
        highlights: [
          'Ships a unified workspace canvas with adaptive glassmorphism surfaces.',
          'Adds a FlowScript realtime debugger with timeline playback support.',
          'Introduces a handbook sidebar that syncs with command palette context.',
        ],
      },
      v2_0_0_dev5: {
        summary: 'Extends preview builds with tighter automation feedback loops.',
        highlights: [
          'Improves FlowScript hot reload speed for large orchestrations.',
          'Expands extension sandbox logging with streaming traces.',
          'Refines multi-device session handoff reliability during live demos.',
        ],
      },
      v1_2_0: {
        summary: 'Brings the curated plugin market and modernizes navigation.',
        highlights: [
          'Launches a signed plugin marketplace with verified badges.',
          'Refactors PluginManager, PluginList, and FileTree for stability gains.',
          'Fixes upgrade prompts, navigation layout, and TTabs regressions.',
        ],
      },
      v1_1_0: {
        summary: 'Lays the groundwork for the marketplace and upgrade flows.',
        highlights: [
          'Introduces plugin store foundations, including install and upgrade modules.',
          'Adds upgrade reminders, richer input components, and export progress UI.',
          'Resolves layout inconsistencies, double prompts, and mention errors.',
        ],
      },
      v1_0_0: {
        summary: 'First public release that unifies automation, plugins, and analytics.',
        highlights: [
          'Delivers plugin marketplace integration with a signed publishing pipeline.',
          'Adds account onboarding, statistics dashboard, and layout refinements.',
          'Stabilizes plugin parsing, upgrade notifications, and preview tooling.',
        ],
      },
    },
  },
  plugins: {
    categories: {
      productivity: 'Productivity',
      utilities: 'Utilities',
      development: 'Development',
      writing: 'Writing',
      creativity: 'Creativity',
      ai: 'AI & Models',
      automation: 'Automation',
      communication: 'Communication',
      analytics: 'Analytics',
      design: 'Design',
      education: 'Education',
      finance: 'Finance',
    },
  },
  market: {
    hero: {
      badge: 'Official marketplace',
      title: 'Discover verified plugins',
      subtitle: 'Browse curated categories and install trusted plugins for your workspace.',
    },
    search: {
      label: 'Search',
      placeholder: 'Search official plugins',
    },
    filters: {
      heading: 'Browse by category',
      all: 'All categories',
    },
    actions: {
      viewDetails: 'View details',
    },
    detail: {
      loading: 'Loading plugin details…',
      error: 'Unable to load plugin details.',
      readme: 'Plugin README',
      noReadme: 'This plugin has not provided a README yet.',
      versions: 'Approved versions',
      noVersions: 'No approved versions are available yet.',
      download: 'Download package',
      sizeUnknown: 'Size unknown',
      author: 'Published by {name}',
      reviews: {
        title: 'Community reviews',
        tag: 'Community',
        helper: 'Share your experience to help others decide.',
        count: '{count} reviews',
        loading: 'Loading reviews…',
        empty: 'No reviews yet. Be the first to share.',
        writeTitle: 'Write a review',
        ratingLabel: 'Rating',
        titlePlaceholder: 'Short headline (optional)',
        contentPlaceholder: 'What did you like or dislike?',
        submitHint: 'Reviews are published after approval.',
        submit: 'Submit review',
        submitSuccess: 'Review submitted.',
        submitFailed: 'Failed to submit review.',
        ratingRequired: 'Please provide a rating.',
        contentRequired: 'Please write your review.',
        anonymous: 'Anonymous',
        status: {
          pending: 'Pending',
          rejected: 'Rejected',
        },
        error: 'Unable to load reviews.',
      },
    },
    results: {
      count: '{count} official plugins',
      filtered: '{count} of {total} official plugins',
      empty: 'No official plugins match your filters.',
      none: 'No official plugins are available yet.',
    },
    badges: {
      official: 'Official',
      community: 'Community',
    },
  },
  dashboard: {
    header: {
      badge: 'Tuff Nexus',
      defaultName: 'friend',
      greeting: 'Welcome back, {name}',
      intro:
        'This space gathers your environments, releases, and plugin status. Automated insights and reminders will appear here soon.',
      docsCta: 'View docs',
      marketplaceCta: 'Explore plugins',
    },
    sections: {
      overview: {
        title: 'Quick overview',
        items: {
          betaAccess: 'Beta access is active; more modules will unlock soon.',
          releaseNotify: 'Subscribe to release notifications to hear about updates first.',
          insights: 'Data insights and team collaboration will arrive for the general release.',
        },
      },
      nextSteps: {
        title: 'Next steps',
        items: {
          connectWorkspace: 'Connect your first workspace to unlock automatic sync.',
          scheduleOnboarding: 'Schedule an onboarding session with your teammates.',
          inviteTeammates: 'Invite teammates; collaborative mode is arriving shortly.',
        },
      },
      shortcuts: {
        title: 'Shortcuts',
        links: {
          gettingStarted: 'Getting started',
          marketplace: 'Plugins marketplace',
          developers: 'Developer hub',
        },
      },
      menu: {
        title: 'Workspace menu',
        overview: 'Overview',
        nextSteps: 'Next steps',
        shortcuts: 'Shortcuts',
        plugins: 'Plugins',
        team: 'Teams',
        updates: 'Updates',
        images: 'Resources',
        betaHeading: 'Preview cadence',
        betaDescription:
          'Plugins and teams features evolve weekly. Use the navigation to jump into the surfaces that are live today.',
      },
      plugins: {
        title: 'Plugins',
        subtitle: 'Manage official builds and community submissions from one surface.',
        cta: 'Explore market',
        loading: 'Loading plugins…',
        empty: 'No plugins yet. Publish your first plugin to see it here.',
        officialBadge: 'Official',
        stats: {
          installs: '{count} installs',
          category: 'Category',
          created: 'Created',
          size: 'Size',
        },
        updatedOn: 'Updated {date}',
        badges: {
          featured: 'Featured',
          stable: 'Stable',
          beta: 'Beta',
          community: 'Community',
        },
        manageTitle: 'Plugin management',
        manageSubtitle: 'Publish new plugins or revise entries before they ship to everyone.',
        addButton: 'Create plugin',
        closeButton: 'Close',
        closeVersionButton: 'Cancel version',
        createSubmit: 'Create plugin',
        updateSubmit: 'Save changes',
        confirmDelete: 'Remove {name}? This action cannot be undone.',
        form: {
          identifier: 'Plugin identifier',
          identifierHelp: 'Use lowercase domain-style segments (e.g. alpha.beta.plugin).',
          name: 'Plugin name',
          summary: 'Summary',
          category: 'Category',
          installCount: 'Install count (read only)',
          homepage: 'GitHub / project homepage (optional)',
          badges: 'Badges (comma separated)',
          isOfficial: 'Mark as official build',
          icon: 'Plugin icon',
          iconHelp: 'PNG, JPG, WebP, or GIF up to 5 MB.',
          iconRemove: 'Remove icon',
          packageUpload: 'Plugin package (.tpex)',
          packageHelp: 'Upload a .tpex archive to prefill manifest details. This file is only stored after you submit.',
          readme: 'README',
          readmeHelp: 'Supports Markdown. Displayed on the marketplace plugin detail page.',
          uploadPackage: 'Upload Package',
          manualInput: 'Manual Input',
          autoPublishHint: 'Version {version} will be automatically published after plugin creation.',
        },
        versionForm: {
          version: 'Version',
          channel: 'Release Channel',
          changelog: 'Changelog',
          package: 'Plugin Package (.tpex tar, ≤30 MB)',
          submit: 'Submit for Review',
        },
        channels: {
          RELEASE: {
            name: 'Release',
            description: 'Visible to all users. For stable versions, pushed to all users who have the plugin installed.',
            visibility: '✓ Visible to all users',
          },
          BETA: {
            name: 'Beta',
            description: 'Visible to team members only. For internal testing, only team members can see and install.',
            visibility: '✓ Visible to team members only',
          },
          SNAPSHOT: {
            name: 'Snapshot',
            description: 'Visible to advanced users only. For experimental features, only available to advanced users who opted into the snapshot channel.',
            visibility: '✓ Visible to users who opted into snapshot channel',
          },
        },
        warnings: {
          immutable: {
            title: '⚠️ Version Cannot Be Revoked',
            message: 'Once published, the version cannot be deleted or modified. Please ensure all information is correct before submitting.',
            understand: 'I Understand',
            cancel: 'Cancel Publishing',
          },
        },
        license: {
          title: 'Tuff Plugin License Agreement',
          agreement: `# Tuff Plugin License Agreement

## 1. Acceptance of Terms
By submitting a plugin, you agree to comply with all terms of this License Agreement.

## 2. Intellectual Property
- You retain ownership of your plugin source code
- You grant Tuff the right to distribute and display your plugin
- You confirm that your plugin does not infringe any third-party rights

## 3. Content Standards
Plugins must meet the following standards:
- No malicious code, viruses, or backdoors
- No collection of user privacy data (unless explicitly stated)
- No violation of any laws or regulations
- Accurate feature descriptions

## 4. Review Rights
Tuff reserves the right to review, reject, or remove any plugin.

## 5. Disclaimer
Plugins are provided "as is". Tuff makes no warranties regarding plugin quality.

## 6. Agreement Changes
Tuff may update this agreement at any time. Continued submission indicates acceptance of changes.`,
          confirm: 'I agree to the Tuff Plugin License Agreement',
          submit: 'Agree and Submit for Review',
          cancel: 'Cancel',
        },
        statuses: {
          draft: 'Draft',
          pending: 'Pending review',
          approved: 'Approved',
          rejected: 'Rejected',
        },
        versionStatuses: {
          pending: 'Pending review',
          approved: 'Approved',
          rejected: 'Rejected',
        },
        actions: {
          submitReview: 'Submit for review',
          withdrawReview: 'Withdraw review',
          approve: 'Approve',
          reject: 'Reject',
        },
        publishVersion: 'New version',
        editMetadata: 'Edit metadata',
        delete: 'Delete plugin',
        deleteVersion: 'Delete version',
        confirmDeleteVersion: 'Delete version {version}?',
        homepage: 'Homepage',
        installs: 'installs',
        versionHistory: 'Version history',
        versionDescription: 'Published builds and their signatures.',
        signature: 'Signature',
        downloadPackage: 'Download package',
        readmePreview: 'README preview',
        readmePreviewServer: 'Parsed on the server after the package upload completes.',
        previewLoading: 'Reading package metadata…',
        noManifest: 'No manifest found in this package.',
        manifestPreview: 'Manifest preview',
        manifestRaw: 'Raw manifest JSON',
        packageAwaiting: 'Select a .tpex package to preview manifest and README details here.',
        noReadme: 'No README detected inside this package.',
        previewFields: {
          id: 'Identifier',
          name: 'Name',
          version: 'Version',
          description: 'Description',
          homepage: 'Homepage',
        },
        noVersions: 'No versions published yet.',
        errors: {
          invalidCategory: 'Please choose a category from the list.',
          missingPlugin: 'Select a plugin before publishing a version.',
          missingVersion: 'Provide a version tag before publishing.',
          missingPackage: 'Upload a .tpex package before publishing.',
          missingIdentifier: 'Provide a unique plugin identifier.',
          invalidIdentifierFormat: 'Use at least two dot-separated segments (e.g. alpha.beta.plugin).',
          restrictedIdentifier: 'Identifier or name uses reserved terms. Mark it as official to continue.',
          missingName: 'Plugin name is required.',
          missingReadme: 'Provide a README for your plugin.',
          missingChangelog: 'Provide a changelog for this version.',
          unknown: 'Something went wrong while saving the plugin.',
        },
        versionReviewedAt: 'Reviewed {date}',
        pendingReviews: 'Pending Reviews',
        pendingReviewsCount: '{count} items pending',
        reviewPlugin: 'Plugin review',
        reviewVersion: 'Version review',
        viewDetails: 'Review',
        rejectReason: 'Rejection reason',
        rejectReasonPlaceholder: 'Explain why this submission was rejected (optional)...',
        myPlugins: 'My Plugins',
      },
      images: {
        title: 'Resource library',
        subtitle: 'Manage shared assets used by dashboard plugins and updates.',
        uploadTitle: 'Upload resource',
        uploadSubtitle: 'PNG, JPEG, WebP, GIF, SVG, or other approved attachments up to 5 MB.',
        selectFile: 'Select file',
        uploading: 'Uploading...',
        loading: 'Loading resources...',
        empty: 'No resources uploaded yet',
        copied: 'Copied!',
        copyUrl: 'Copy URL',
        adminOnly: 'Only administrators can manage shared resources.',
        confirmDelete: 'Delete {key}? This action cannot be undone.',
        errors: {
          unknown: 'Something went wrong while managing resources.',
          copyFailed: 'Copy failed',
        },
      },
      team: {
        title: 'Team preview',
        subtitle: 'Private teams unlock shared automations, audit history, and scoped secrets.',
        waitlistCta: 'Join teams waitlist',
        pending: 'Loading team preview…',
        seatUsage: '{used} of {total} seats in use',
        organizationLabel: 'Clerk Organization',
        activeStatus: 'Active',
        planLabel: 'Plan',
        emptyMembers: 'No teammates yet — invitations will appear here once the preview opens.',
        statusLabel: 'Preview status',
        previewStatus: 'Private preview',
        upcomingLabel: 'Next milestone',
        notesLabel: 'What to expect',
        notesPlaceholder: 'Roadmap updates and invite controls will surface here during the preview.',
        memberStatus: {
          active: 'Active',
          automation: 'Automation pilot',
          invited: 'Invited',
        },
      },
      updates: {
        title: 'Official updates',
        subtitle: 'Latest releases, marketplace signals, and roadmap pulses.',
        cta: 'Open changelog',
        loading: 'Fetching updates…',
        empty: 'No official updates yet. Check again soon.',
        readMore: 'Read update',
        manageTitle: 'Update management',
        manageSubtitle: 'Publish changelog notes and announcements for everyone in your workspace.',
        addButton: 'New update',
        closeButton: 'Close',
        createSubmit: 'Publish update',
        updateSubmit: 'Save changes',
        confirmDelete: 'Delete “{title}”? This cannot be undone.',
        form: {
          title: 'Headline',
          date: 'Published on',
          summary: 'Summary',
          tags: 'Tags (comma separated)',
          link: 'External link',
        },
        errors: {
          unknown: 'Something went wrong while saving the update.',
        },
      },
    },
  },
  landing: {
    hero: {
      badge: 'Beta Preview',
      description:
        'A strong adaptation more platform all-tool program that elevates your desktop into a responsive, intelligent control center.',
      heading: 'Profoundly Powerful. Deceptively Simple.',
      bullets: {
        cinematic: 'Cinematic command surfaces with synchronized transitions on desktop, web, and mobile.',
        policy: 'Policy-aware rollout controls with signed extensions and regional manifests.',
        realtime: 'Realtime collaboration that mirrors the intent of your FlowScript and docs playbooks.',
      },
      primaryCta: 'Join waitlist',
      secondaryCta: 'Developer docs',
      offlineNotice: 'You are offline. Search and live previews will resume when the network is back.',
      stats: {
        commands: {
          value: '2M+',
          label: 'Commands automated',
        },
        response: {
          value: '48 ms',
          label: 'Average response',
        },
        layouts: {
          value: '120+',
          label: 'Workspace layouts',
        },
      },
      highlightLabel: 'Platform Highlights',
      highlights: {
        integrations: {
          title: 'Native integrations',
          description: 'Aligns with system automation, launchers, and voice control out of the box.',
        },
        workspace: {
          title: 'Workspace DNA',
          description: 'Curate dashboards, scripts, and messaging in a single adaptive surface.',
        },
        focus: {
          title: 'Realtime focus',
          description: 'Ambient cues keep the most important signals one glance away.',
        },
      },
    },
    os: {
      aiSpotlight: {
        eyebrow: 'AI Spotlight',
        headline: 'One search. Everything, connected.',
        subheadline: 'It doesn\'t just find. It understands.',
        summaryHighlight: 'Tuff interprets intent',
        summary: 'Tuff interprets intent, then fuses every relevant surface into one calm, living result set.',
        queryLabel: 'Natural language query',
        queryText: '“Show me the design draft Sarah shared last week.”',
        results: {
          figma: {
            title: 'Figma · Core layout revamp',
            meta: 'Shared by Sarah M. · Updated 2 days ago',
          },
          files: {
            title: 'Local Files · brand-refresh.sketch',
            meta: 'Desktop › Campaigns',
          },
          gmail: {
            title: 'Gmail · “Latest header iterations”',
            meta: 'From Sarah · Mon 9:14 AM',
          },
          slack: {
            title: '#brand-refresh · “Attaching the final export now.”',
            meta: 'Slack · Thread with design-pod',
          },
        },
      highlights: {
        context: {
          title: 'Understands context',
          copy: 'Intent parsing links people, tools, and time so you never sift through tabs again.',
        },
        silo: {
          title: 'Breaks every silo',
          copy: 'Designs, files, conversations, and tasks flow back in one continuous pane.',
        },
        breathe: {
          title: 'Breathes with you',
          copy: 'Animations stay measured and calm, keeping attention on what matters most.',
        },
      },
      corebox: {
        tagAll: 'All',
        hints: {
          open: 'Open',
          actions: 'Actions',
          quickSelect: 'Quick Select',
        },
        commands: {
          launch: {
            label: 'Quick launch',
            description: 'Open apps, files, and URLs.',
          },
          search: {
            label: 'Smart search',
            description: 'Search across local + cloud.',
          },
          clipboard: {
            label: 'Clipboard vault',
            description: 'History, snippets, and paste.',
          },
          flows: {
            label: 'Flow actions',
            description: 'Chain multi-step automations.',
          },
          ai: {
            label: 'AI assist',
            description: 'Summaries, rewrite, extract.',
          },
        },
        slides: {
          search: {
            label: 'Search',
            focus: 'Apps / Local',
            query: 'QQMiniApp',
            alt: 'CoreBox search results for apps',
          },
          file: {
            label: 'Files',
            focus: 'Files / Recent',
            query: 'Roadmap',
            alt: 'CoreBox search results for files',
          },
          tool: {
            label: 'Tools',
            focus: 'AI / Built-in',
            query: 'Translate',
            alt: 'CoreBox tools results',
          },
        },
      },
    },
      plugins: {
        eyebrow: 'Plugins Center',
        headline: 'Extend Tuff to your tools.',
        subheadline: 'Connect Tuff to your tools and extend their capabilities.',
        extensions: {
          notion: {
            name: 'Notion',
            description: 'Capture docs, meeting notes, and project hubs in one keystroke.',
          },
          figma: {
            name: 'Figma',
            description: 'Preview frames, sync components, and ship design tokens instantly.',
          },
          github: {
            name: 'GitHub',
            description: 'Review pull requests, diff changes, and trigger workflows from the command bar.',
          },
          vscode: {
            name: 'VS Code',
            description: 'Jump between workspaces, run scripts, and surface diagnostics without breaking flow.',
          },
          calendar: {
            name: 'Google Calendar',
            description: 'See upcoming rituals, block focus time, and RSVP instantly.',
          },
          spotify: {
            name: 'Spotify',
            description: 'Score your focus sessions with adaptive soundtracks.',
          },
        },
      },
      aiOverview: {
        eyebrow: 'AI Specialization',
        headline: 'Specialized intelligence crafted for your operating rhythm.',
        subheadline: 'Agents, retrieval, and automation compose together inside Tuff.',
        hero: {
          title: 'AI that lives inside your command surfaces.',
          copy: 'Summon context-aware copilots that read your screen, plan the next move, and execute when you say go.',
          primaryCta: 'Explore AI blueprints',
          secondaryCta: 'Review agent APIs',
          bullets: {
            understand: 'Understands what is on your screen and how it connects to teammates, docs, and data.',
            instant: 'Responds in under 40 ms with recommended next steps you can trigger immediately.',
            privacy: 'Runs primarily on-device with zero-knowledge sync when you invite collaborators.',
          },
        },
        highlights: {
          orchestrate: {
            title: 'Orchestrated sequences',
            copy: 'Hand off between agents, scripts, and human review without losing state or intent.',
          },
          copilot: {
            title: 'Copilots for every surface',
            copy: 'Bring writing, debugging, and design copilots into the same command palette.',
          },
          memory: {
            title: 'Long-term memory',
            copy: 'Retrieval index mirrors your systems for fast summaries, comparisons, and follow-up actions.',
          },
        },
        demo: {
          chat: {
            label: 'AI Chat',
            placeholder: 'Ask me anything...',
            thinking: 'Thinking...',
            send: 'Send',
            commandsTitle: 'Commands',
            footer: 'Powered by Tuff Intelligence · Reference only',
            commands: {
              ask: {
                label: 'Ask ChatGPT',
                description: 'Get a direct answer with examples',
              },
              summarize: {
                label: 'Summarize',
                description: 'Lead with the key takeaways',
              },
              explain: {
                label: 'Explain Differences',
                description: 'Break down Composition vs Options',
              },
            },
            prompts: {
              composition: {
                question: 'What is the difference between Composition API and Options API in Vue 3?',
                intro: 'Vue 3 supports both Composition and Options APIs, with the key differences in organization and reuse.',
                bullets: {
                  first: 'Composition API is better for complex logic and cross-component reuse.',
                  second: 'Options API shines with clear structure and classic workflows.',
                },
                note: 'As the project grows, Composition API tends to scale better.',
              },
              whenUse: {
                question: 'When should I use the Composition API?',
                intro: 'Use Composition API when you need to split complex logic and improve reuse.',
                bullets: {
                  first: 'Share logic across components by extracting composables.',
                  second: 'Large projects benefit from more cohesive logic grouping.',
                },
                note: 'Smaller pages can stay on Options API; migration can be incremental.',
              },
              reuse: {
                question: 'How do I organize reusable logic in Vue 3?',
                intro: 'Composables are the recommended way to package state and behavior.',
                bullets: {
                  first: 'Move state and side effects into standalone composables.',
                  second: 'Keep naming consistent so intent is obvious.',
                },
                note: 'The Composition API makes reuse feel natural and easier to test.',
              },
              reactivity: {
                question: 'What are the core concepts of Vue 3 reactivity?',
                intro: 'Vue 3 reactivity is powered by Proxy with ref / reactive / computed.',
                bullets: {
                  first: 'Use ref for primitive or single-value state.',
                  second: 'Use reactive for objects or richer state.',
                },
                note: 'Understanding dependency tracking helps avoid performance traps.',
              },
            },
          },
          assist: {
            label: 'AI Assist',
            originalText: 'Original Text',
            result: 'Result',
            docTitle: 'Top 10 Ski Destinations in Europe',
            searchPlaceholder: 'Search AI Commands',
            resultsTitle: 'Results',
            processing: 'Processing...',
            correctedText: 'Corrected Text',
            commands: {
              changeToneConfident: 'Change Tone to Confident',
              changeToneCasual: 'Change Tone to Casual',
              fixSpelling: 'Fix Spelling and Grammar',
              translate: 'Translate Text',
              summarize: 'Summarize Key Points',
              explainCode: 'Explain Code Step by Step',
              findBugs: 'Find Bugs in Code',
            },
            actions: {
              ask: 'Ask AI',
              fixSpelling: 'Fix Spelling',
              translate: 'Translate',
            },
          },
          preview: {
            label: 'Quick Preview',
            placeholder: 'Enter expression...',
            copyResult: 'Copy Result',
            types: {
              expression: 'Quick Expression',
              currency: 'Currency Conversion',
              time: 'Time Conversion',
              unit: 'Unit Conversion',
              color: 'Color Parser',
              constant: 'Constant Query',
              text: 'Text Statistics',
              hash: 'Hash Calculator',
              encode: 'Encoding Converter',
            },
          },
        },
        cards: {
          chat: {
            title: 'Ask AI Anything',
            copy: 'Ask anything, anytime, anywhere. AI answers instantly.',
          },
          assist: {
            title: 'Smart Text Actions',
            copy: 'Intelligently process selected text: fix spelling, translate, or ask questions.',
          },
          preview: {
            title: 'Instant Preview',
            copy: 'Smart recognition instantly previews calculations and conversions.',
          },
        },
        cta: 'More about AI →',
      },
      builtForYou: {
        eyebrow: 'Built for You',
        headline: 'Crafted for teams who design, ship, and scale ideas.',
        subheadline: 'Each role gets a tailored surface, while the platform keeps everyone coordinated.',
        personas: {
          makers: {
            title: 'Designers & Makers',
            copy: 'Swap between explorations, inspect assets, and publish tokens without leaving the canvas.',
            quote: '“Tuff collapses handoff friction - the command bar already knows my rituals.”',
            name: 'Jasmine Ortega',
            role: 'Principal Product Designer, Highline',
          },
          developers: {
            title: 'Engineers',
            copy: 'Inspect logs, rerun pipelines, and patch feature flags from the same command surface.',
            quote: '“Pull requests, tests, and deploy scripts now live in one place. Shipping is calmer.”',
            name: 'Nikhil Sharma',
            role: 'Staff Engineer, Drift Labs',
          },
          operators: {
            title: 'Ops & Leads',
            copy: 'Spin up dashboards, sync standups, and keep rituals on rails with automation scenes.',
            quote: '“Every ritual is codified. Tuff makes the team feel present even when remote.”',
            name: 'Morgan Lee',
            role: 'Head of Operations, Northwind',
          },
        },
        stats: {
          latency: {
            label: 'Average automation speed',
            value: '27 ms',
          },
          adoption: {
            label: 'Teams activated in 30 days',
            value: '92%',
          },
          satisfaction: {
            label: 'Weekly active satisfaction',
            value: '4.8/5',
          },
        },
      },
      starSnippets: {
        eyebrow: 'Star Snippets',
        headline: 'Save once. Drop everywhere.',
        subheadline: 'Curated snippets keep your team\'s best responses and scripts ready to fire.',
        categories: {
          meetings: {
            title: 'Meeting follow-ups',
            copy: 'Generate recap, next steps, and scheduling macros in one keystroke.',
            action: 'Preview template',
          },
          support: {
            title: 'Support replies',
            copy: 'AI drafts contextual answers with live product data before you even open the ticket.',
            action: 'Insert snippet',
          },
          builders: {
            title: 'Builder shortcuts',
            copy: 'Deploy flows, tail logs, and push hotfix branches without leaving chat.',
            action: 'Launch command',
          },
        },
        footnote: 'Pin snippets for your team and they will auto-update as playbooks evolve.',
      },
      aggregation: {
        eyebrow: 'Unified Briefing',
        headline: 'All your signals, rendered as one calm overview.',
        subheadline: 'Docs, conversations, alerts, and automations stay synchronized across every workspace.',
        panels: {
          overview: {
            title: 'Live overview',
            copy: 'Morning digest gathers the latest commits, notes, and blockers without noise.',
          },
          timelines: {
            title: 'Rhythm timelines',
            copy: 'Auto-sequence milestones and dependencies per project, surfacing risks early.',
          },
          alerts: {
            title: 'Signal-aware alerts',
            copy: 'Layered notifications only tap you when human judgement is required.',
          },
        },
        footnote: 'Aggregation runs continuously so you keep context whether you jump in at 9 AM or midnight.',
      },
      community: {
        eyebrow: 'Community',
        headline: 'Built with builders everywhere.',
        subheadline: 'Join the channels where new extensions, rituals, and release previews drop first.',
        channels: {
          slack: {
            title: 'Slack',
            meta: '32k members',
            description: 'Deep dives, release previews, and office hours with the core team.',
            cta: 'Join Slack',
            href: '#',
          },
          github: {
            title: 'GitHub',
            meta: '3k contributors',
            description: 'Browse manifests, raise pull requests, and keep the platform honest.',
            cta: 'Visit GitHub',
            href: '#',
          },
          events: {
            title: 'Live sessions',
            meta: 'Weekly',
            description: 'AMAs, hands-on workshops, and community showcases hosted by the core team.',
            cta: 'See schedule',
            href: '#',
          },
        },
        spotlights: {
          learning: {
            title: 'Learning hub',
            copy: 'Workshops, masterclasses, and recorded walkthroughs to level up your team.',
          },
          newsletter: {
            title: 'Dispatch newsletter',
            copy: 'Monthly digests covering what shipped, what is coming, and how teams use Tuff.',
          },
        },
      },
      pricing: {
        eyebrow: 'Pricing',
        headline: 'All access. Completely free for the Pioneer wave.',
        subheadline: 'We are keeping everything unlocked while we refine the experience with you.',
        plan: {
          name: 'Pioneer',
          price: '$0',
          period: 'per member',
          features: {
            unlimited: 'Unlimited seats, commands, and extensions',
            support: 'Direct access to the product team for feedback loops',
            roadmap: 'Guaranteed migration path when paid tiers arrive',
          },
          footnote: 'Founding teams keep the Pioneer rate when pricing tiers launch.',
        },
      },
      faq: {
        eyebrow: 'FAQ',
        headline: 'Questions, answered.',
        items: {
          access: {
            question: 'How do I get access to the beta?',
            answer: 'Join the Pioneer waitlist. We approve batches weekly and set up onboarding calls for teams.',
          },
          privacy: {
            question: 'How does Tuff handle my data?',
            answer: 'Most processing runs locally. Cloud sync is encrypted with keys you control and optional by workspace.',
          },
          build: {
            question: 'Do I need to code to build automations?',
            answer: 'Not at all. FlowScript offers visual builders, while developers can drop down to code when needed.',
          },
          migration: {
            question: 'Can we migrate our existing shortcuts?',
            answer: 'Yes. Import from Raycast, Alfred, and custom scripts. Tuff converts them into typed commands.',
          },
          pricing: {
            question: 'Will pricing stay free forever?',
            answer: 'We will introduce paid tiers later, but Pioneer teams keep everything free through general availability.',
          },
        },
      },
      extensibility: {
        eyebrow: 'Capabilities Center',
        headline: 'Free everything, powerful tools.',
        subheadline: 'TuffFamilyKit offers a suite of tools to extend Tuff\'s capabilities to every tool you use.',
      },
      openFoundation: {
        eyebrow: 'Open by Design',
        headline: 'Built in the open. Crafted for builders.',
        subheadline: 'Transparent core, modular tooling, and a community that shapes the roadmap with you.',
        pillars: {
          core: {
            title: 'Transparent Core',
            copy: 'Audit the runtime, trace every decision, and fork the platform with confidence.',
          },
          sdk: {
            title: 'Modular SDK',
            copy: 'Typed APIs, sandboxes, and signing pipelines so shipping your next extension feels effortless.',
          },
          community: {
            title: 'Vibrant Community',
            copy: 'Pair with pioneers, review manifests together, and keep the platform evolving out in the open.',
          },
        },
        footnote: 'Everything we build is documented, versioned, and ready for your pull request.',
        cta: 'Opening Tuffex Design',
        ctaHref: '/docs/dev/components/foundations',
      },
      proactive: {
        eyebrow: 'Proactive Intelligence',
        headline: 'It knows what you need. Before you do.',
        subheadline: 'Introducing Tuff Intelligence. On-device, private, and deeply aware of your context.',
        shieldLabel: 'On-Device AI · Your privacy is paramount',
        scenarios: {
          developer: {
            tab: 'Developer · VS Code',
            title: 'Select any import and Tuff suggests the docs you need.',
            copy: 'Inline recommendations open the correct reference, example snippets, and recent changelog entries.',
            action: 'Open FlowScript API reference',
          },
          designer: {
            tab: 'Designer · Figma',
            title: 'Contextual actions appear the moment you select a layer.',
            copy: 'Export presets, CSS tokens, and accessibility checks line up without breaking your stride.',
            action: 'Export layer as PNG · Copy CSS',
          },
          zero: {
            tab: 'Zero Input',
            title: 'Summon Tuff and your next moves are already queued.',
            copy: 'Recent files, meetings, and automation scenes appear based on the rhythm of your day.',
            action: 'Resume “Launch Prep” workspace · Join Daily Sync',
          },
        },
      },
      craftsmanship: {
        eyebrow: 'Craftsmanship & Utility',
        headline: 'Every detail, elevated.',
        subheadline: 'Because a seamless experience is built on a foundation of flawless fundamentals.',
        clips: {
          system: {
            tag: 'System control',
            title: '“Dark mode” switches everything instantly.',
            copy: 'Animations stay buttery-smooth at 120 fps, even when orchestrating OS-level changes.',
          },
          clipboard: {
            tag: 'Clipboard vault',
            title: 'History, reimagined as a cinematic reel.',
            copy: 'Images, palettes, and text previews hover with gentle parallax so you find the right item at a glance.',
          },
          performance: {
            tag: 'Latency lab',
            title: 'Invoke Tuff. Zero lag. Zero wasted motion.',
            copy: 'Keystroke to render averages 18 ms across devices, tuned in the same rig we use for docs transitions.',
          },
        },
      },
      pioneer: {
        eyebrow: 'Pioneer Program',
        headline: 'The future of work is coming. Be the first to build it.',
        subheadline: 'Join the Tuff Pioneer Program. Get early access, shape the development, and define the next generation of productivity.',
        formTitle: 'Email',
        cta: 'Request Pioneer Access',
        ctaPrimary: 'Sign in to enable Pioneer Testing',
        benefitsTitle: 'Your Pioneer perks',
        benefits: {
          early: {
            title: 'Early Access',
            copy: 'Preview every frontier build before the public release.',
          },
          shape: {
            title: 'Shape the Product',
            copy: 'Work directly with the team; your feedback steers the roadmap.',
          },
          community: {
            title: 'Exclusive Community',
            copy: 'Access private sessions, office hours, and recognition across the platform.',
          },
        },
        guidance: 'After signing in, open Updates → Pioneer Testing and subscribe to Beta to receive push notifications.',
      },
    },
    features: {
      badge: 'Why Choose Tuff',
      title: 'More than imagination.',
      description:
        'Depend on smart orchestration, responsive visuals, and tooling that scales with your ambitions.',
      items: {
        innovativeDesign: {
          title: 'Innovative Design',
          description:
            'A modern interface with cinematic motion that highlights the content you need while reducing visual noise.',
        },
        lightningFast: {
          title: 'Lightning Fast',
          description:
            'Launch instantly, orchestrate tasks, and pivot between workspaces without dropping a single frame.',
        },
        secureReliable: {
          title: 'Secure & Reliable',
          description:
            'End-to-end encrypted channels keep your ideas safe while redundancy protects every sync.',
        },
        crossPlatform: {
          title: 'Cross-Platform',
          description:
            'Stay in the flow across desktop environments with pixel-perfect parity and native gestures.',
        },
        extensible: {
          title: 'Extensible',
          description:
            'Craft behaviours with a flexible plugin API and lifecycle tooling built for teams.',
        },
        customizable: {
          title: 'Customizable',
          description:
            'Dial in colour, layout, and automation so every workspace mirrors your personal rhythm.',
        },
      },
    },
    extensions: {
      badge: 'Extensible Platform',
      title: 'Scale from lightweight to full workspace plugins.',
      description:
        'Polyglot tooling to grow from helpers to deep integrations. Every capability is designed for composability, performance, and effortless deployment across Tuff environments.',
      cta: 'Explore Marketplace',
      items: {
        lightweight: {
          title: 'Lightweight Plugins',
          description:
            'Ship focused utilities in minutes. Toggle and evolve them without shipping a full release.',
        },
        heavyweight: {
          title: 'Advanced Plugins',
          description:
            'Transform navigation, panels, or data views with workspace-aware plugins and deep hooks.',
        },
        integration: {
          title: 'Seamless Integration',
          description:
            'Dial in the command palette, launcher, and automation stack without sacrificing performance.',
        },
        developer: {
          title: 'Developer Friendly',
          description:
            'Structured SDK, blazing-fast reloads, and precise diagnostics make iteration effortless.',
        },
      },
    },
    testing: {
      badge: 'Pioneer Testing',
      title: 'Join the early access community shaping Tuff.',
      description:
        'Validate new integrations, stress-test automation, and keep every release stable with the Pioneer Testing Program.',
      items: {
        alpha: {
          tag: 'Alpha Flight',
          title: 'Early access builds',
          description:
            'Preview new capabilities, leave feedback in real time, and influence the next stable release.',
        },
        touch: {
          tag: 'Touch Lab',
          title: 'Scenario automation',
          description:
            'Record complex flows, attach assertions, and replay across builds with zero setup.',
        },
        shield: {
          tag: 'Shield',
          title: 'Stability guarantees',
          description:
            'Every milestone goes through multi-platform verification, performance benchmarking, and regression sweeps.',
        },
      },
    },
    finalCta: {
      title: 'Ready to explore the Tuff ecosystem?',
      description:
        'Build immersive desktop experiences with a platform that amplifies creators, operators, and teams who ship fast.',
      primary: 'Browse Documentation',
      secondary: 'Talk with the team',
    },
    footer: {
      tagline: 'Your brain, smarter and infinitely extensible.',
      primaryCta: 'Download Beta',
      secondaryCta: 'View Docs',
      rights: 'All rights reserved.',
      privacy: 'Privacy',
      terms: 'Terms',
      sections: {
        product: 'Product',
        resources: 'Resources',
      },
      socials: {
        github: 'GitHub',
      },
    },
  },
  docs: {
    loading: 'Fetching document…',
    notFoundTitle: 'Document not found',
    notFoundDescription: 'We could not find content for this route yet. Head back to the docs overview.',
    backHome: 'Back to docs home',
    redirecting: 'Redirecting to the docs landing…',
    outlineLabel: 'Outline',
    sidebarLabel: 'Navigation',
    defaultTitle: 'Documentation',
    noOutline: 'Headings will appear here once added to this document.',
    lastUpdatedLabel: 'Last edited on',
    editOnGitHub: 'Edit this page on GitHub',
    previousChapter: 'Previous chapter',
    nextChapter: 'Next chapter',
  },
  docsNav: {
    start: 'Get started',
  },
  docsSidebar: {
    error: 'Navigation failed to load. Please try again.',
    extensions: 'Ext',
    components: 'UI',
    categories: {
      basic: 'Basic',
      form: 'Form',
      feedback: 'Feedback',
      layout: 'Layout',
      data: 'Data',
      misc: 'Misc',
    },
  },
  license: {
    title: 'Tuff Terms of Service',
    description: 'Tuff Terms of Service and User Agreement',
    lastUpdated: 'Last updated',
    section1: {
      title: '1. Acceptance of Terms',
      content: 'By accessing and using Tuff services, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our services.',
    },
    section2: {
      title: '2. Service Description',
      content: 'Tuff is a multi-platform tool program designed to transform your desktop into a responsive, intelligent control center. We provide automation, plugin systems, and collaboration features.',
    },
    section3: {
      title: '3. User Responsibilities',
      content: 'You are responsible for ensuring your use complies with all applicable laws and regulations. You may not use the service for illegal purposes or transmit harmful content.',
    },
    section4: {
      title: '4. Privacy Protection',
      content: 'We value your privacy. Most processing runs locally, cloud sync is encrypted with keys you control.',
    },
    section5: {
      title: '5. Intellectual Property',
      content: 'Tuff and all related intellectual property rights are owned by us. You may not copy, modify, or distribute our software without explicit authorization.',
    },
    section6: {
      title: '6. Service Availability',
      content: 'We strive to maintain high service availability but do not guarantee uninterrupted service. We reserve the right to modify or terminate the service at any time.',
    },
    section7: {
      title: '7. Disclaimer',
      content: 'The service is provided "as is" without any express or implied warranties. You assume all risks associated with using the service.',
    },
    section8: {
      title: '8. Limitation of Liability',
      content: 'To the maximum extent permitted by law, we shall not be liable for any damages arising from the use or inability to use the service.',
    },
    section9: {
      title: '9. Terms Modification',
      content: 'We reserve the right to modify these terms at any time. Significant changes will be communicated to users through appropriate channels.',
    },
    section10: {
      title: '10. Governing Law',
      content: 'These terms are governed by the laws of the People\'s Republic of China. Any disputes shall be resolved through friendly consultation.',
    },
    contact: {
      title: 'Contact Us',
      content: 'If you have any questions about these terms, please contact us through our official channels.',
    },
  },
  protocol: {
    title: 'Tuff Software License',
    description: 'Tuff Software License and Terms of Use',
    lastUpdated: 'Last updated',
    section1: {
      title: '1. License Grant',
      content: 'Under this license, we grant you a limited, non-exclusive, non-transferable right to use the Tuff software.',
    },
    section2: {
      title: '2. Use Restrictions',
      content: 'You may not reverse engineer, decompile, or disassemble the software. You may not use the software for commercial purposes without explicit authorization.',
    },
    section3: {
      title: '3. Open Source Components',
      content: 'Tuff may include open source software components. These components are subject to their respective open source licenses.',
    },
    section4: {
      title: '4. Updates and Support',
      content: 'We may provide software updates. Updates may include new features, bug fixes, or security improvements.',
    },
    section5: {
      title: '5. Data Collection',
      content: 'We may collect anonymous usage data to improve the software. We do not collect personally sensitive information.',
    },
    section6: {
      title: '6. Third-Party Integrations',
      content: 'The software may integrate with third-party services. Use of these services is subject to their respective terms of service.',
    },
    section7: {
      title: '7. Termination',
      content: 'If you violate this license, we have the right to immediately terminate your usage rights.',
    },
    section8: {
      title: '8. Warranty Disclaimer',
      content: 'The software is provided "as is" without any express or implied warranties.',
    },
    section9: {
      title: '9. Limitation of Liability',
      content: 'To the maximum extent permitted by law, we shall not be liable for any damages arising from the use of the software.',
    },
    section10: {
      title: '10. License Termination',
      content: 'This license automatically terminates when you stop using the software or violate the terms.',
    },
    contact: {
      title: 'Technical Support',
      content: 'For technical support or to report issues, please contact us through our official channels.',
    },
  },
}
