## Routing

Routes are declared by hand in [`src/router/index.ts`](../router/index.ts). Adding a page here does
not register it — add the matching entry there too.

This directory keeps the file-based naming convention (`[name].vue`, `[...all].vue`) from when the
plugin used `unplugin-vue-router`, but nothing generates routes from it any more.

### Path Aliasing

`~/` is aliased to `./src/` folder.

For example, instead of having

```ts
import { isDark } from '../../../../composables'
```

now, you can use

```ts
import { isDark } from '~/composables'
```
