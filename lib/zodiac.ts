import { OpenAI } from 'openai';

// baseURL 可指向 justwoker 中转站 / 自建代理（中国网络环境下通过 OPENAI_BASE_URL 注入），
// 未设置时回退到 OpenAI 官方地址。
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

// 本地模拟兜底：当中转站或官方接口不可达时，返回基于星座配置的确定性运势，
// 保证中国网络环境下页面不白屏、Vercel 部署后也能正常渲染。
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

export const ZODIAC_CONFIG = {
  Aries: { name: '白羊座', element: '火', trait: '热情、勇敢、冲动' },
  Taurus: { name: '金牛座', element: '土', trait: '稳定、务实、固执' },
  Gemini: { name: '双子座', element: '风', trait: '灵动、好奇、多变' },
  Cancer: { name: '巨蟹座', element: '水', trait: '温柔、敏感、护短' },
  Leo: { name: '狮子座', element: '火', trait: '自信、慷慨、傲慢' },
  Virgo: { name: '处女座', element: '土', trait: '细致、追求完美、挑剔' },
  Libra: { name: '天秤座', element: '风', trait: '优雅、平衡、犹豫' },
  Scorpio: { name: '天蝎座', element: '水', trait: '深沉、执着、敏锐' },
  Sagittarius: { name: '射手座', element: '火', trait: '乐观、自由、粗心' },
  Capricorn: { name: '摩羯座', element: '土', trait: '克制、野心、刻板' },
  Aquarius: { name: '水瓶座', element: '风', trait: '独立、反叛、疏离' },
  Pisces: { name: '双鱼座', element: '水', trait: '浪漫、直觉、逃避' },
};

export async function getFortune(zodiacSign: string, type: 'daily' | 'deep' = 'daily') {
  const config = ZODIAC_CONFIG[zodiacSign as keyof typeof ZODIAC_CONFIG];
  if (!config) throw new Error('Invalid zodiac sign');

  const prompt = type === 'daily' 
    ? `你是一位精通现代占星学的顶尖大师。请为${config.name}（${config.element}象，特质：${config.trait}）提供今日简短运势。
       要求：
       1. 风格：神秘且带有鼓励性，不要太死板。
       2. 结构：[综合评分 1-100] + [一句话金句] + [今日核心建议]。
       3. 长度：150字以内。`
    : `你是一位深度心理占星师。请为${config.name}进行深层运势解析。
       要求：
       1. 维度：涵盖【事业财富】、【情感关系】、【身心健康】。
       2. 风格：通过分析星盘相位，给出具体的行为指导，而非笼统的预言。
       3. 结构：每个维度分段，每段包含 [现状分析] 和 [破局之策]。
       4. 结尾：给出一个专属的【今日幸运色】和【幸运数字】。
       5. 长度：500-800字。`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'system', content: 'You are a professional astrologer.' }, { role: 'user', content: prompt }],
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('empty completion');
    return content;
  } catch (err) {
    console.error('[zodiac] OpenAI/中转站调用失败，启用本地模拟兜底:', err);
    return mockFortune(config, type);
  }
}