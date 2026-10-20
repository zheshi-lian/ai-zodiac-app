// 12 星座的可索引页面数据：每个星座一个独立 URL，避免只有一个首页可被搜索收录。
// 内容口径：性格描述 + 日期范围 + 守护元素，均为通用占星常识，不含预测性承诺。

export type SignKey =
  | 'Aries' | 'Taurus' | 'Gemini' | 'Cancer' | 'Leo' | 'Virgo'
  | 'Libra' | 'Scorpio' | 'Sagittarius' | 'Capricorn' | 'Aquarius' | 'Pisces';

export type SignInfo = {
  key: SignKey;
  slug: string;
  name: string;
  en: string;
  range: string;
  element: '火象' | '土象' | '风象' | '水象';
  ruler: string;
  traits: string;
  intro: string;
  strengths: string[];
  watchouts: string[];
};

export const SIGNS: SignInfo[] = [
  {
    key: 'Aries', slug: 'aries', name: '白羊座', en: 'Aries', range: '3.21 – 4.19', element: '火象', ruler: '火星',
    traits: '热情、直接、行动力强',
    intro: '白羊座是黄道十二宫的第一宫，习惯用行动而不是等待来解决问题。你对新事物有天然的兴趣，开局往往比别人快，但耐心需要刻意练习。',
    strengths: ['启动快', '敢于表达', '不记仇'],
    watchouts: ['三分钟热度', '说话太直', '容易急躁'],
  },
  {
    key: 'Taurus', slug: 'taurus', name: '金牛座', en: 'Taurus', range: '4.20 – 5.20', element: '土象', ruler: '金星',
    traits: '稳定、务实、重视安全感',
    intro: '金牛座由金星守护，对质感、节奏和确定性有很高的要求。你擅长把一件事做扎实，但变化来临时，需要给自己一点适应时间。',
    strengths: ['执行稳定', '审美在线', '守信'],
    watchouts: ['固执', '不愿止损', '拖延改变'],
  },
  {
    key: 'Gemini', slug: 'gemini', name: '双子座', en: 'Gemini', range: '5.21 – 6.21', element: '风象', ruler: '水星',
    traits: '好奇、机敏、信息量大',
    intro: '双子座由水星守护，思维切换快，擅长把复杂信息讲清楚。你的兴趣很广，真正的挑战是选出值得长期投入的那一两件事。',
    strengths: ['学习快', '表达好', '适应力强'],
    watchouts: ['注意力分散', '浅尝辄止', '想法多于行动'],
  },
  {
    key: 'Cancer', slug: 'cancer', name: '巨蟹座', en: 'Cancer', range: '6.22 – 7.22', element: '水象', ruler: '月亮',
    traits: '细腻、护短、重感情',
    intro: '巨蟹座由月亮守护，对情绪和氛围非常敏感。你擅长照顾人，也需要被照顾；把边界说清楚，反而能让关系更长久。',
    strengths: ['共情力强', '记得细节', '有责任心'],
    watchouts: ['情绪内耗', '过度防御', '翻旧账'],
  },
  {
    key: 'Leo', slug: 'leo', name: '狮子座', en: 'Leo', range: '7.23 – 8.22', element: '火象', ruler: '太阳',
    traits: '自信、慷慨、需要舞台',
    intro: '狮子座由太阳守护，天生适合站在台前。你愿意为认可的人付出，但也要留意：不是每一次合作都需要你来当主角。',
    strengths: ['有感染力', '敢担责', '大方'],
    watchouts: ['爱面子', '听不进批评', '情绪起伏'],
  },
  {
    key: 'Virgo', slug: 'virgo', name: '处女座', en: 'Virgo', range: '8.23 – 9.22', element: '土象', ruler: '水星',
    traits: '细致、务实、追求完善',
    intro: '处女座由水星守护，擅长发现别人忽略的漏洞。高标准是你的优势，但把标准用在所有人和所有事上，容易把自己累坏。',
    strengths: ['逻辑清晰', '执行细致', '靠谱'],
    watchouts: ['过度挑剔', '完美主义', '容易焦虑'],
  },
  {
    key: 'Libra', slug: 'libra', name: '天秤座', en: 'Libra', range: '9.23 – 10.23', element: '风象', ruler: '金星',
    traits: '温和、讲平衡、重视关系',
    intro: '天秤座由金星守护，习惯在多方之间寻找平衡。你擅长沟通和审美，但“都不得罪”有时会变成拖延；先说出自己的立场，关系反而更清楚。',
    strengths: ['会沟通', '有分寸', '审美佳'],
    watchouts: ['选择困难', '回避冲突', '讨好倾向'],
  },
  {
    key: 'Scorpio', slug: 'scorpio', name: '天蝎座', en: 'Scorpio', range: '10.24 – 11.22', element: '水象', ruler: '冥王星 / 火星',
    traits: '深沉、专注、洞察力强',
    intro: '天蝎座习惯看穿表面，对信任的要求很高。你一旦投入就非常专注，但要小心把“保护自己”变成“先假设别人会伤害我”。',
    strengths: ['洞察力', '抗压', '忠诚'],
    watchouts: ['控制欲', '记仇', '不愿示弱'],
  },
  {
    key: 'Sagittarius', slug: 'sagittarius', name: '射手座', en: 'Sagittarius', range: '11.23 – 12.21', element: '火象', ruler: '木星',
    traits: '乐观、爱自由、视野大',
    intro: '射手座由木星守护，喜欢把目光放在更远的地方。你擅长给别人信心，但落地时需要一个具体的下一步，否则容易只剩口号。',
    strengths: ['乐观', '学习力强', '不拘小节'],
    watchouts: ['粗心', '承诺过满', '逃避细节'],
  },
  {
    key: 'Capricorn', slug: 'capricorn', name: '摩羯座', en: 'Capricorn', range: '12.22 – 1.19', element: '土象', ruler: '土星',
    traits: '克制、务实、长期主义',
    intro: '摩羯座由土星守护，习惯用结果说话。你能忍受别人受不了的慢，但别把“扛住”当成唯一选项，适时求助不会削弱你的可靠。',
    strengths: ['自律', '有规划', '抗压'],
    watchouts: ['过度紧绷', '不善表达', '只看结果'],
  },
  {
    key: 'Aquarius', slug: 'aquarius', name: '水瓶座', en: 'Aquarius', range: '1.20 – 2.18', element: '风象', ruler: '天王星 / 土星',
    traits: '独立、理性、想法超前',
    intro: '水瓶座由天王星守护，习惯从系统角度看问题。你不怕与众不同，但真正的创新需要有人愿意跟你一起落地，而不只是“想得不一样”。',
    strengths: ['独立思考', '接受新事物', '公平'],
    watchouts: ['疏离感', '固执己见', '情绪抽离'],
  },
  {
    key: 'Pisces', slug: 'pisces', name: '双鱼座', en: 'Pisces', range: '2.19 – 3.20', element: '水象', ruler: '海王星 / 木星',
    traits: '浪漫、敏感、直觉强',
    intro: '双鱼座由海王星守护，对他人的情绪有很强的感受力。你的想象力是天赋，但需要边界和截止时间，才能把感觉变成作品。',
    strengths: ['有想象力', '共情', '包容'],
    watchouts: ['边界模糊', '逃避现实', '容易心软'],
  },
];

export const SIGN_BY_SLUG: Record<string, SignInfo> = Object.fromEntries(SIGNS.map((s) => [s.slug, s]));
export const SIGN_BY_KEY: Record<string, SignInfo> = Object.fromEntries(SIGNS.map((s) => [s.key, s]));

export function signFromName(name: string): SignInfo | undefined {
  const n = String(name || '').replace(/座$/, '');
  return SIGNS.find((s) => s.name === name || s.name.replace(/座$/, '') === n || s.en.toLowerCase() === n.toLowerCase());
}

export function todayCN(): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  }).format(new Date());
}

export function todayKey(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
}
