export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'change', // Fallback option
        'update', // Update
        'feat', // New feature
        'fix', // Fix bug
        'docs', // Documentation only changes
        'style', // Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)
        'ref', // A code change that neither fixes a bug nor adds a feature
        'test', // Adding missing tests or correcting existing tests
        'chore', // Changes to the build process or auxiliary tools and libraries such as documentation generation
        'revert', // Revert to a commit
        'merge', // Merge branch ? of ? into ?
        'sync', // Merge branch ? into ?
        'build', // Build system or external dependencies
        'ci', // Continuous integration
        'perf', // A code change that improves performance
        'wf', // Workflow
        'types', // Types
        'release', // Release
        'config', // Config
        'sec', // Security
        'upg', // Upgrade
      ],
    ],
    // 只允许 lowercase：type-enum 是精确字符串匹配，且上面每一项都是小写，
    // 所以 PascalCase / Sentence case / Start Case 的 type 永远过不了 enum。
    // 保留它们只会让配置宣称一套、实际执行另一套。
    'type-case': [2, 'always', ['lower-case']],
    'subject-case': [0],
    'subject-empty': [2, 'never'],
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
}
