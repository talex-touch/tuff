# One-off: cut the models.dev pricing fixture from the catalog downloaded on 2026-10-03.
# Not committed (lives in /tmp). Keeps raw models.dev shape and the original provider order.
import json
src = json.load(open('/tmp/modelsdev-api.json'))
want = {
  'openai': ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'o4-mini', 'text-embedding-3-small', 'gpt-image-1'],
  'anthropic': ['claude-sonnet-4-5'],
  'google': ['gemini-2.5-pro'],
  'deepseek': ['deepseek-v4-flash'],
  'alibaba-cn': ['qwen-plus', 'qwen-max'],
  'siliconflow-cn': ['deepseek-ai/DeepSeek-V3'],
  'siliconflow': ['deepseek-ai/DeepSeek-V3'],
  'zhipuai-coding-plan': ['glm-5.3-flash'],
  'zhipuai': ['glm-5.3-flash', 'glm-4.5'],
  'moonshotai-cn': ['kimi-k2.6'],
  'openrouter': ['openai/gpt-4o', 'anthropic/claude-sonnet-4.5'],
}
out = {}
for pid, provider in src.items():  # preserve catalog order
    if pid not in want:
        continue
    models = {}
    for mid in want[pid]:
        if mid not in provider['models']:
            raise SystemExit(f'missing {pid}/{mid}')
        models[mid] = provider['models'][mid]
    cut = {k: v for k, v in provider.items() if k != 'models'}
    cut['models'] = models
    out[pid] = cut
missing = set(want) - set(out)
if missing:
    raise SystemExit(f'missing providers {missing}')
path = '/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/core-app/src/main/modules/ai/pricing/__fixtures__/models-dev-subset.json'
with open(path, 'w') as f:
    json.dump(out, f, indent=2, ensure_ascii=False)
    f.write('\n')
print('providers', list(out.keys()))
print('models', sum(len(p['models']) for p in out.values()))
