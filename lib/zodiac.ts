import { OpenAI } from 'openai';
import { ZODIAC_CONFIG, buildFortunePrompt } from './zodiac-data';

// 中转站（relay）列表：中国网络环境下直连 OpenAI 不稳定，改为通过兼容 OpenAI 协议的中转站。
// 可通过环境变量 ZODIAC_RELAYS 配置多个（逗号分隔），按顺序尝试；默认使用 agtcloud。
const RELAYS: string[] = (process.env.ZODIAC_RELAYS || 'https://api.agtcloud.cn/v1')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// 中转站鉴权密钥；也可用通用的 OPENAI_API_KEY。
const API_KEY = process.env.ZODIAC_API_KEY || process.env.OPENAI_API_KEY || '';

// 中转站模型；默认使用 agtcloud 免费的 minimax 模型，可通过 ZODIAC_MODEL 覆盖。
const MODEL = process.env.ZODIAC_MODEL || 'minimax-m3.1-flash:free';

// 本地模拟兜底：所有中转站都不可达时，返回基于星座配置的确定性运势，保证页面不白屏。
function mockFortune(
  config: { name: string; element: string; trait: string },
  type: 'daily' | 'deep'
): string {
  if (type === 'daily') {
    return `[${config.name}·本地模拟]\n综合评分 78\n金句：星辰不语，却早已写好答案。\n今日核心建议：保持自己的节奏，把重要的事放在精力最好的上午完成。`;
  }
  return (
    `[${config.name}·本地模拟·深度解析]\n\n` +
    `【事业财富】现状：星象平稳，宜守不宜攻。破局之策：聚焦一件能立刻产出结果的小事，积累确定性。\n\n` +
    `【情感关系】现状：沟通宫位活跃，误会易消。破局之策：主动一次轻量表达，胜过十次内心戏。\n\n` +
    `【身心健康】现状：精力曲线前高后低。破局之策：午后留 20 分钟空白，给神经系统缓冲。\n\n` +
    `今日幸运色：霁蓝　幸运数字：7`
  );
}

export async function getFortune(zodiacSign: string, type: 'daily' | 'deep' = 'daily') {
  const config = ZODIAC_CONFIG[zodiacSign as keyof typeof ZODIAC_CONFIG];
  if (!config) throw new Error('Invalid zodiac sign');

  // 未配置密钥时直接走本地模拟，避免无意义的网络请求。
  if (!API_KEY) {
    console.warn('[zodiac] 未配置 ZODIAC_API_KEY / OPENAI_API_KEY，使用本地模拟兜底');
    return mockFortune(config, type);
  }

  const prompt = buildFortunePrompt(config, type);

  let lastErr: unknown;
  for (const baseURL of RELAYS) {
    try {
      const client = new OpenAI({ apiKey: API_KEY, baseURL });
      const response = await client.chat.completions.create({
        model: MODEL,
        messages: [{ role: 'system', content: 'You are a professional astrologer.' }, { role: 'user', content: prompt }],
        temperature: 0.7,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('empty completion');
      return content;
    } catch (err) {
      lastErr = err;
      console.error(`[zodiac] 中转站 ${baseURL} 调用失败:`, err);
    }
  }

  console.error('[zodiac] 所有中转站均不可用，启用本地模拟兜底:', lastErr);
  return mockFortune(config, type);
}
