export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "Change", // Fallback option
        "Upd", // Update
        "Feat", // New feature
        "Fix", // Fix bug
        "Docs", // Documentation only changes
        "Style", // Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)
        "Ref", // A code change that neither fixes a bug nor adds a feature
        "Test", // Adding missing tests or correcting existing tests
        "Chore", // Changes to the build process or auxiliary tools and libraries such as documentation generation
        "Revert", // Revert to a commit
        "Merge", // Merge branch ? of ? into ?
        "Sync", // Merge branch ? into ?
        "Build", // Build system or external dependencies
        "CI", // Continuous integration
        "Perf", // A code change that improves performance
        "WF", // Workflow
        "Types", // Types
        "Release", // Release
        "Config", // Config
        "Sec", // Security
        "Upg", // Upgrade
      ],
    ],
    "type-case": [
      2,
      "always",
      [
        "pascal-case", // PascalCase
        "lower-case", // lowercase
        "sentence-case", // Sentence case
        "start-case", // Start Case
      ]
    ],
  },
};
