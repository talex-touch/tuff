export default {
    nexus: {
      hero: {
        eyebrow: 'Local-first. Private by design.',
        titlePrefix: '',
        titleSubject: 'Think it.',
        titleLead: 'Think it.',
        titleAccent: 'There it is.',
        title: 'Think it. There it is.',
        copy: 'Tuff is the public entry for its own ecosystem: trusted releases, plugins, and developer docs while the desktop app stays light, fast, and extensible.',
        primaryCta: 'Get the current build',
        getPlatformVersion: 'Get {platform} version',
        secondaryCta: 'View developer docs',
        openSource: 'Free & open source',
        corebox: {
          placeholder: 'Everything in Tuff.',
          types: {
            app: 'Application',
            file: 'File',
            system: 'System',
          },
          hints: {
            open: 'Open',
            execute: 'Execute',
            actions: 'Actions',
            quickRun: 'Quick Run',
          },
          scenes: {
            fileSub: 'png • 2.1 MB • 2026/10/6 14:20 • Downloads',
            webSearch: 'Web search',
            webSearchSub: 'Search what you typed with your default engine',
            translate: 'Translate',
            translateSub: 'Translate the selected text or the clipboard',
            translateMulti: 'Multi-source translate',
            translateMultiSub: 'Translate with several services at once',
          },
        },
        releases: {
          latest: 'Latest',
          history: 'History',
          historyTitle: 'Version history',
          whatsNew: 'What’s new',
          viewAll: 'View all in Updates',
          close: 'Close',
          downloadBuild: 'Download this build',
          chooseBuild: 'Choose a build',
          download: 'Download',
          noBuilds: 'No builds published for this release yet.',
          certifiedTrack: 'Want the certified track?',
          getStable: 'Get stable',
        },
        trust: {
          verifiedTitle: 'Official certified build',
          verifiedDesc: 'This build is officially signed and notarized — safe to download and install.',
          previewTitle: 'Preview channel build',
          previewDesc: 'This is a preview-channel build, not yet on the certified stable track:',
          points: {
            prerelease: 'Pre-release build — features and APIs may change at any time.',
            stability: 'Stability is not fully verified; not recommended for production.',
            channel: 'For long-term stability, choose the stable Release channel.',
          },
        },
      },
      product: {
        eyebrow: 'Real product surface',
        title: 'CoreBox is the first workspace, not another admin panel.',
        previewAlt: 'Tuff CoreBox local file search interface',
        caption: 'One input surface can search files, open apps, invoke plugins, and hand context to Agents.',
      },
      capabilities: {
        eyebrow: 'Capability boundaries',
        title: 'A clear execution path built around the local desktop.',
        items: {
          local: {
            title: 'Local context first',
            copy: 'Clipboard, files, apps, and desktop state are shaped locally first. Tuff coordinates ecosystem, docs, and trusted releases.',
          },
          intelligence: {
            title: 'Models and tools routed together',
            copy: 'Tuff Intelligence brings model routing, desktop context, and tool execution into CoreBox to reduce app switching.',
          },
          plugins: {
            title: 'Auditable plugin extension',
            copy: 'Manifest, permissions, and SDK markers give every extension a clear entry, boundary, and audit trail.',
          },
        },
      },
      workflow: {
        eyebrow: 'Workflow',
        title: 'Keep one line from intent to desktop action.',
        items: {
          capture: {
            title: 'Capture intent',
            copy: 'Summon CoreBox globally and put natural language, filenames, or selected snippets into one entry.',
          },
          route: {
            title: 'Shape context',
            copy: 'Runtime turns input, current desktop state, and available capabilities into an executable request.',
          },
          execute: {
            title: 'Move the action',
            copy: 'Built-in capabilities, MCP, and plugins perform real actions and return results to your current flow.',
          },
        },
      },
      final: {
        eyebrow: 'Pioneer entry',
        title: 'Clarify the desktop workflow first, then let Agents take over repeated actions.',
        cta: 'Download Tuff',
      },
    },
    new: {
      hero: {
        eyebrow: 'Desktop command center',
        title: 'A local-first Agent entry for desktop work.',
        copy: 'Tuff gathers search, context, plugins, and AI execution into one calm desktop entry. Less window switching, more work finished.',
        primaryCta: 'Download Tuff',
        secondaryCta: 'Read docs',
        previewAlt: 'Preview of Tuff CoreBox file search',
        previewCaption: 'CoreBox keeps local files, apps, and actions on the same input surface.',
      },
      proof: {
        eyebrow: 'Core capability',
        title: 'Built around the local desktop, not another cloud dashboard.',
        items: {
          local: {
            title: 'Local context first',
            copy: 'Clipboard, files, apps, and desktop state become Agent-readable input while sensitive data stays inside clear boundaries.',
          },
          command: {
            title: 'One summon, real actions',
            copy: 'From CoreBox search to plugin execution, daily operations stay in a keyboard-first loop.',
          },
          plugin: {
            title: 'Auditable extension power',
            copy: 'Manifest, permissions, and SDK contracts give every capability a clear entry and a clear limit.',
          },
        },
      },
      workflow: {
        eyebrow: 'Workflow',
        title: 'Keep one line from intent to action.',
        items: {
          summon: {
            title: 'Summon',
            copy: 'Open CoreBox with a global shortcut before deciding which tool should answer.',
          },
          understand: {
            title: 'Understand',
            copy: 'Tuff shapes current context, input, and available capabilities into an Agent-ready request.',
          },
          act: {
            title: 'Act',
            copy: 'Built-in tools, MCP, and plugins move the request into real desktop actions.',
          },
        },
      },
      principles: {
        eyebrow: 'Design principles',
        title: 'The next landing page starts with restraint, clarity, and trust.',
        items: {
          quiet: {
            title: 'Less motion, stronger hierarchy',
            copy: 'Keep necessary entrance and hover feedback, remove scroll takeover and decorative GPU loops.',
          },
          typed: {
            title: 'Less promise, stronger proof',
            copy: 'Use product visuals, capability boundaries, and real workflows instead of abstract claims.',
          },
          sync: {
            title: 'Less divergence, stronger consistency',
            copy: 'Stay inside the Tuff routing, i18n, and prerender rules so the experiment can replace production cleanly.',
          },
        },
      },
      final: {
        eyebrow: 'Pioneer entry',
        title: 'Clean up the desktop workflow first, then let Agents take over more repeated actions.',
        cta: 'Get the current build',
      },
    },
    hero: {
      description:
        'Tuff is a local-first desktop Agent command center that brings search, execution, plugins, and intelligence into one summon.',
      heading: 'A local desktop Agent center, one touch away.',
      bullets: {
        cinematic: 'Summon CoreBox with Alt + Space and keep search, execution, and chat in one entry.',
        policy: 'Electron runtime plus plugin SDKs keep extension power controlled, auditable, and typed.',
        realtime: 'Local state comes first; Tuff coordinates docs, ecosystem, and trusted releases.',
      },
      primaryCta: 'Download Tuff',
      secondaryCta: 'Developer docs',
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
      highlights: {
        integrations: {
          title: 'Desktop entry',
          description: 'CoreBox opens from a global shortcut so daily actions stay in keyboard flow.',
        },
        workspace: {
          title: 'Local context',
          description: 'Clipboard, files, apps, and desktop state become structured Agent input.',
        },
        focus: {
          title: 'Plugin coordination',
          description: 'Manifest, Prelude, and Surface connect capabilities to one command surface.',
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
      rail: {
        label: 'Page sections',
      },
      plugins: {
        eyebrow: 'Plugins',
        headline: 'One plugin, one more trick.',
        subheadline: 'Pick a few from the store. They work the moment they are in.',
        prev: 'Previous',
        next: 'Next',
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
          json: {
            name: 'JSON Formatter',
            description: 'Messy JSON, tidied in one go.',
            summon: 'json',
            label: 'Line drawing of three stacked sieves; the one the pointer picks rises',
          },
          browser: {
            name: 'Browser Open',
            description: 'Paste a link, press Enter.',
            summon: 'url',
            label: 'Line drawing of a router whose antennas lean toward the pointer',
          },
          vscodeProjects: {
            name: 'VS Code Projects',
            description: 'Recent projects, one Enter away.',
            summon: 'vscode',
            label: 'Line drawing of a laptop whose lid follows the pointer',
          },
          image: {
            name: 'Image',
            description: 'Resize, compress, convert.',
            summon: 'image',
            label: 'Line drawing of a loupe the pointer drags across a sheet',
          },
          hosts: {
            name: 'Hosts',
            description: 'See the change before it lands.',
            summon: 'hosts',
            label: 'Line drawing of a padlock whose shackle springs open as the pointer nears',
          },
          aiSessions: {
            name: 'AI Sessions',
            description: 'Search local AI sessions, copy a redacted reference.',
            summon: 'ai sessions',
            label: 'Line drawing of a commit graph; the node under the pointer rises',
          },
        },
      },
      aiOverview: {
        eyebrow: 'Agent Core',
        headline: 'Models, context, and tools enter the same desktop workflow.',
        subheadline: 'Tuff Intelligence brings model routing, desktop context, and Agent execution into CoreBox.',
        demo: {
          chat: {
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
            searchPlaceholder: 'Search AI Commands',
            resultsTitle: 'Results',
            processing: 'Processing...',
            commands: {
              changeToneConfident: 'Change Tone to Confident',
              changeToneCasual: 'Change Tone to Casual',
              fixSpelling: 'Fix Spelling and Grammar',
              translate: 'Translate Text',
              summarize: 'Summarize Key Points',
            },
          },
          preview: {
            label: 'Quick Preview',
            copyResult: 'Copy Result',
            poweredBy: 'Powered by TuffIntelligence',
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
          workflow: {
            placeholder: 'Describe a task to automate...',
            badge: 'Workflow',
            footer: 'Powered by Tuff Workflows · Multi-step automation',
            scenarios: {
              translateEmail: {
                trigger: 'Translate the clipboard into English and format as a professional email',
                steps: {
                  read: 'Read clipboard',
                  translate: 'Translate to English',
                  format: 'Format as email',
                  copy: 'Copy to clipboard',
                },
                resultLabel: 'Workflow Complete',
                resultText: 'Translated and formatted email has been copied to your clipboard.',
              },
              summarizeSave: {
                trigger: 'Summarize this article and save key points to my notes',
                steps: {
                  fetch: 'Fetch content',
                  extract: 'Extract key points',
                  summarize: 'Generate summary',
                  save: 'Save to notes',
                },
                resultLabel: 'Saved Successfully',
                resultText: '3 key points extracted and saved to your workspace notes.',
              },
              codeReview: {
                trigger: 'Review my latest git changes and generate a summary report',
                steps: {
                  diff: 'Read git diff',
                  analyze: 'Analyze changes',
                  report: 'Generate report',
                },
                resultLabel: 'Review Complete',
                resultText: '12 files analyzed — 2 suggestions, 1 potential issue flagged.',
              },
            },
          },
        },
        cards: {
          chat: {
            title: 'Model routing',
            copy: 'Set an entry model, then route specialized scenes to the right model automatically.',
          },
          assist: {
            title: 'Desktop context',
            copy: 'Clipboard, files, apps, and selected text become callable Agent context.',
          },
          preview: {
            title: 'Instant Preview',
            copy: 'Smart recognition instantly previews calculations and conversions.',
          },
          workflow: {
            title: 'Agent tool execution',
            copy: 'Built-in tools, MCP, and plugins move requests from intent to real actions.',
          },
        },
      },
      instantPreview: {
        eyebrow: 'Instant Preview',
        headline: 'Instant preview widgets that respond as you type.',
        subheadline: 'Calculations, conversions, and color parsing surface the moment intent is recognized.',
        highlights: {
          speed: {
            title: 'Instant feedback',
            description: 'Preview cards render while you type in CoreBox.',
          },
          coverage: {
            title: 'Multi-format coverage',
            description: 'Math, units, time, currency, and constants in one surface.',
          },
          copy: {
            title: 'One-tap copy',
            description: 'Copy preview output without leaving the command bar.',
          },
          consistency: {
            title: 'Consistent formatting',
            description: 'Normalized values for fast reuse across apps.',
          },
        },
        widgets: {
          expression: {
            input: 'sqrt(16) + 2^4',
            result: '20',
            extra: 'Advanced math, instant answer.',
          },
          unit: {
            input: '12 cm to inch',
            result: '4.72 in',
            extra: 'Length, mass, temperature.',
            details: {
              meter: '0.12 m',
              feet: '0.3937 ft',
            },
          },
          time: {
            input: 'now + 2h',
            result: '2 hours later',
            extra: 'Natural language supported.',
          },
          color: {
            input: '#8B5CF6',
            result: '#8B5CF6',
            extra: 'RGB(139, 92, 246)',
            details: {
              rgb: 'rgb(139, 92, 246)',
              hsl: 'hsl(262, 90%, 66%)',
            },
          },
          currency: {
            input: '19 usd to cny',
            result: '¥137.75',
            extra: 'USD → CNY',
            details: {
              source: '19.0000 USD',
              target: '137.7500 CNY',
            },
          },
          constant: {
            input: 'pi * 2',
            result: '6.28319',
            extra: 'Built-in constants, ready.',
          },
        },
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
        kicker: 'FAQ',
        headline: 'You might be wondering',
        aside: {
          title: 'Still stuck?',
          docs: 'Read the docs',
          github: 'Ask on GitHub',
        },
        items: {
          platforms: {
            question: 'Which systems does it run on?',
            answer: 'macOS (Apple silicon and Intel), Windows (x64), and Linux all have installers. On Linux, the .deb is the one to get.',
          },
          access: {
            question: 'How do I get the beta?',
            answer: 'Download a build marked beta from the Updates page or GitHub Releases; it stays on beta updates from then on. To go back to stable, switch in Settings → About → Update channel.',
          },
          privacy: {
            question: 'Where does my data live?',
            answer: 'On your own computer, with secrets kept in the system keychain. Signing in turns sync on by default, and what syncs, such as settings and AI setup, is encrypted on your machine before upload. Crash reports and usage stats are on by default; both can be turned off in Settings.',
          },
          build: {
            question: 'Can I automate without writing code?',
            answer: 'Up to a point. Everyday automation comes from plugins and AI commands; the visual workflow builder is still in beta and not open by default.',
          },
          migration: {
            question: 'Can I bring my Raycast or Alfred setup?',
            answer: 'There is no importer yet. Apps and files need no moving: they show up once Tuff is installed. Text you reuse can go into the snippet library.',
          },
          pricing: {
            question: 'Does it cost anything?',
            answer: 'It is free right now, and Tuff itself is open source. AI hosted by Tuff uses credits, with a free allowance every month; paid tiers may come after the stable release.',
          },
        },
      },
      extensibility: {
        eyebrow: 'Capabilities Center',
        headline: 'Plugins, Agents, and SDKs extend the desktop together.',
        subheadline: 'From CoreBox search sources to the Intelligence SDK, every capability enters through clear contracts.',
        preview: {
          keyboard: {
            title: 'Keyboard-first',
            copy: 'Daily actions stay keyboard-first to reduce mouse switching.',
          },
          fileSearch: {
            title: 'File search',
            copy: 'Everything on Windows, local indexing and native support on macOS.',
          },
          browser: {
            title: 'CDP control',
            copy: 'Browser control connects automation with lightweight fingerprint simulation.',
          },
          visual: {
            title: 'Visual interaction',
            copy: 'Visual editing kits adapt Agent changes across model families.',
          },
          token: {
            title: 'Token saving',
            copy: 'Built-in rtk-based token saving works out of the box.',
          },
          upcoming: {
            title: 'Coming next',
            copy: 'Skills, Computer Use, MiniApp, ACP, automation, and sandboxing are being merged in.',
          },
        },
        copied: 'Copied',
      },
      showcase: {
        eyebrow: 'Features',
        headlineLead: 'One box. ',
        headlineAccent: 'A lot done.',
        subheadline: 'All of this ships with Tuff. No extra plugins to hunt for.',
        items: {
          launch: {
            title: 'Open apps',
            summon: '⌥ Space',
            copy: 'Press ⌥Space and type two or three letters. Pinyin and abbreviations match too.',
            label: 'Line drawing of a keyboard whose key under the pointer sinks',
          },
          files: {
            title: 'Find files',
            summon: 'report.pdf',
            copy: 'Everything on Windows, Spotlight plus a local index on macOS. Results show up halfway through the name.',
            label: 'Line drawing of a three-drawer cabinet whose picked drawer slides out',
          },
          clipboard: {
            title: 'Clipboard history',
            summon: 'clipboard-history',
            copy: 'Text, images, and files stay, along with the app they were copied from.',
            label: 'Line drawing of a tray of cards; the card under the pointer stands up',
          },
          translate: {
            title: 'Translate',
            summon: 'fy',
            copy: 'Type fy to translate. fy-multi lines up Google, Bing, DeepL, and more side by side.',
            label: 'Line drawing of a dish antenna that turns toward the pointer',
          },
          quickops: {
            title: 'QuickOps',
            summon: 'ops',
            copy: 'Timers, pomodoro, keep-awake, port and IP checks, one command each.',
            label: 'Line drawing of a dot-matrix display that glows where the pointer passes',
          },
          snippets: {
            title: 'Snippets',
            summon: 'snippet',
            copy: 'Save text, code, and prompts as snippets, and search them up when you need them.',
            label: 'Line drawing of a rack of blades; the ones near the pointer slide out',
          },
        },
      },
      designSystem: {
        eyebrow: 'Design system',
        kicker: 'TUFFEX DESIGN',
        headlineLead: 'Design, ',
        headlineAccent: 'by the book.',
        figure: {
          index: 'FIG. 01',
          title: 'Layers',
          label: 'Line drawing of an app window taken apart into four layers: surface, sidebar, card, and popover',
        },
        tokens: {
          type: {
            title: 'Type',
            note: 'Inter · PingFang SC · weight 500',
          },
          color: {
            title: 'Color',
            note: 'Brand and semantic · dark values',
          },
          curve: {
            title: 'Continuous curvature',
            g1: 'G1 arc',
            g2: 'G2 smooth',
            note: 'Tuffex squircles keep curvature continuous: corners ease in from the straight edge and never snap. Move across to compare.',
          },
          motion: {
            title: 'Motion',
            note: '0.2s / 0.3s',
            strong: 'Strong ease-out',
            spring: 'Spring',
          },
        },
        stats: {
          title: 'Scale',
          components: 'Components',
          docs: 'Doc pages',
          themes: 'Themes',
          note: 'Docs in EN and ZH · light / dark / high contrast',
        },
        cta: 'Open Tuffex Design',
        copyCommand: 'Copy install command',
        copied: 'Copied',
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
        eyebrow: 'Desktop Context',
        headline: 'Turn desktop state into context an Agent can understand.',
        subheadline: 'Tuff starts with clipboard, app state, desktop state, and selected text, then expands toward foreground, focus, screen, UI, traces, workspace, and notifications.',
        shieldLabel: 'Local-first · Controlled context',
        scenarios: {
          developer: {
            tab: 'App state',
            title: 'Current app, window, and workspace state enter the request context.',
            copy: 'The Agent no longer reads only a prompt; it understands which app, file, and task you are working on.',
            action: 'Read active app · Summarize window state',
          },
          designer: {
            tab: 'Clipboard & selection',
            title: 'Text, images, files, and HTML clipboard data can be passed in structurally.',
            copy: 'Selected text and clipboard content become explicit inputs, reducing repeated context setup.',
            action: 'Read clipboard · Parse selection',
          },
          zero: {
            tab: 'Desktop & notifications',
            title: 'Desktop state, notifications, and workspace signals will feed the context graph.',
            copy: 'Give the Agent enough context to handle the request and return manual setup time to creative work.',
            action: 'Sync desktop state · Aggregate workspace signals',
          },
        },
      },
      craftsmanship: {
        eyebrow: 'Craftsmanship & Utility',
        headline: 'Every detail, elevated.',
        subheadline: 'Because a seamless experience is built on a foundation of flawless fundamentals.',
      },
      corebox: {
        placeholder: 'Everything in Tuff.',
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
      },
      pioneer: {
        eyebrow: 'Pioneer Program',
        headline: 'The future of work is coming. Be the first to build it.',
        subheadline: 'Join the Tuff Pioneer Program. Get early access, shape the development, and define the next generation of productivity.',
        formTitle: 'Email',
        cta: 'Request Pioneer Access',
        ctaPrimary: 'Sign in to enable Pioneer Testing',
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
      items: {
        innovativeDesign: {
          title: 'Visual interaction',
          description:
            'Use visual kits to edit and preview Agent output across different model interaction styles.',
        },
        lightningFast: {
          title: 'One touch away',
          description:
            'Alt + Space opens instantly, keeping search, execution, and questions in a keyboard-first loop.',
        },
        secureReliable: {
          title: 'Local-first',
          description:
            'SQLite remains the local source of truth while sensitive context and credentials stay within clear safety boundaries.',
        },
        crossPlatform: {
          title: 'File search',
          description:
            'Everything powers Windows search while macOS and Linux use local indexing and platform capabilities.',
        },
        extensible: {
          title: 'Agent toolchain',
          description:
            'Built-in tools, MCP, plugins, and model routing work together to execute real desktop tasks.',
        },
        customizable: {
          title: 'Capability preview',
          description:
            'Skills, Computer Use, MiniApp, ACP, automation, and sandbox capabilities are being merged in.',
        },
      },
    },
    extensions: {
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
    footer: {
      tagline: 'Your brain, smarter and infinitely extensible.',
      rights: 'All rights reserved.',
      privacy: 'Privacy Policy',
      terms: 'Terms of Service',
      license: 'Software License',
      sections: {
        product: 'Product',
        resources: 'Resources',
      },
      socials: {
        github: 'GitHub',
      },
    },
  }
