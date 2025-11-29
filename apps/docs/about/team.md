---
layout: page
---

<script setup>
import {
  VPTeamPage,
  VPTeamPageTitle,
  VPTeamMembers
} from 'vitepress/theme'

const members = [
  {
    avatar: 'https://www.github.com/TalexDreamSoul.png',
    name: 'TalexDreamSoul',
    title: 'Creator',
    links: [
      { icon: 'github', link: 'https://github.com/TalexDreamSoul' }
    ]
  }
]
</script>

<VPTeamPage>
  <VPTeamPageTitle>
    <template #title>
      Our Team
    </template>
    <template #lead>
      The development of Tuff is guided by the first-class team, thanks goes to these wonderful people.
    </template>
  </VPTeamPageTitle>
  <VPTeamMembers
    :members="members"
  />
</VPTeamPage>
