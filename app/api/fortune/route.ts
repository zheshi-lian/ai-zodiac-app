import { NextResponse } from 'next/server';
import { getFortune } from '@/lib/zodiac';

export async function POST(request: Request) {
  try {
    const { zodiac, type } = await request.json();

    if (!zodiac) {
      return NextResponse.json({ error: 'Zodiac sign is required' }, { status: 400 });
    }

    // 调用我们的 AI 逻辑
    const fortuneText = await getFortune(zodiac, type as 'daily' | 'deep');

    // 这里可以埋入点击广告的行为，比如在返回深度解析时
    // console.log('User requested deep analysis, trigger ad load');

    return NextResponse.json({ fortune: fortuneText });
  } catch (error) {
    console.error('Error generating fortune:', error);
    return NextResponse.json({ error: 'Failed to generate fortune' }, { status: 500 });
  }
}