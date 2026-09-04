# Tuff v2.4.14-beta.23 Release Notes

## Summary Notes

- Release manifests now select their rollback predecessor only from published releases in the same channel.
- Failed or unpublished candidates that already have Git tags no longer contaminate rollback metadata for the next release.
- Release gates continue to require rollback ancestry, GitHub Release data, Nexus metadata, and the download matrix to agree.

## What's Changed

- The release workflow derives rollback candidate tags from GitHub's published-release list instead of all git tags.
- The rollback resolver adds `--tags-file` and fails closed when its input cannot be read.
- The beta.22 Linux musl runtime-closure fix remains included; this version regenerates a trustworthy release manifest.
