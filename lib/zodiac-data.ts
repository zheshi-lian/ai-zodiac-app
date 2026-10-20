// 纯数据与纯文本模块：不含任何 Node/服务端依赖（不 import openai），
// 可被 Client Component（app/page.tsx）安全导入，不会把 openai 打进浏览器包。

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

export function buildFortunePrompt(
  config: { name: string; element: string; trait: string },
  type: 'daily' | 'deep'
): string {
  return type === 'daily'
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
}
