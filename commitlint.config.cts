export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "change", // Fallback option
        "update", // Update
        "feat", // New feature
        "fix", // Fix bug
        "docs", // Documentation only changes
        "style", // Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)
        "ref", // A code change that neither fixes a bug nor adds a feature
        "test", // Adding missing tests or correcting existing tests
        "chore", // Changes to the build process or auxiliary tools and libraries such as documentation generation
        "revert", // Revert to a commit
        "merge", // Merge branch ? of ? into ?
        "sync", // Merge branch ? into ?
        "build", // Build system or external dependencies
        "ci", // Continuous integration
        "perf", // A code change that improves performance
        "wf", // Workflow
        "types", // Types
        "release", // Release
        "config", // Config
        "sec", // Security
        "upg", // Upgrade
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
    "subject-case": [
      2,
      "always",
      [
        "sentence-case", // Sentence case
        "start-case", // Start Case
        "pascal-case", // PascalCase
        "lower-case", // lowercase
        "upper-case", // UPPERCASE
      ]
    ],
    "subject-empty": [2, "never"],
  },
};
