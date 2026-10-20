// Client-side ad tracking SDK
class AdSDK {
  private baseUrl: string;
  private deviceId: string;
  private adUnitId: string;

  constructor(options: {
    baseUrl: string;
    adUnitId: string;
    deviceId?: string;
  }) {
    this.baseUrl = options.baseUrl;
    this.adUnitId = options.adUnitId;
    this.deviceId = options.deviceId || 'test-device-' + Date.now().toString(36);
  }

  // Generate a unique impression ID
  private generateImpId(): string {
    return 'imp-' + this.adUnitId + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
  }

  // Request an ad from the SSP endpoint
  async requestAd(placement: string, options?: { callbackUrl?: string }): Promise<any> {
    const impId = this.generateImpId();
    const payload = {
      id: 'req-' + Date.now().toString(36),
      imp: [
        {
          id: impId,
          banner: { w: 300, h: 250 },
          ext: {
            placement,
            test: true,
            callback_url: options?.callbackUrl || this.baseUrl + '/api/public/ad-callback',
          },
        },
      ],
      site: {
        domain: window.location.hostname,
        page: window.location.pathname,
        ref: document.referrer || window.location.href,
      },
      user: {
        id: this.deviceId,
      },
      device: {
        ua: navigator.userAgent,
        ip: '',
        dnt: navigator.doNotTrack === '1' ? 1 : 0,
      },
      at: 2, // Second price auction
      tmax: 3000,
    };

    try {
      const res = await fetch(this.baseUrl + '/openrtb2/bid', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Test-Mode': '1',
          'X-Publisher': window.location.hostname,
          'X-AdUnit': this.adUnitId,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Ad request failed: ' + res.status);

      const bidResponse = await res.json();
      console.log('[AdSDK] Bid response:', bidResponse);

      // Simulate impression tracking
      this.trackImpression(impId, bidResponse);
      
      return bidResponse;
    } catch (error) {
      console.error('[AdSDK] Ad request error:', error);
      return null;
    }
  }

  // Track impression (when ad renders on screen)
  trackImpression(impId: string, bidResponse?: any) {
    const payload = {
      imp_id: impId,
      ad_unit_id: this.adUnitId,
      ts: Date.now(),
      device_id: this.deviceId,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      dpr: window.devicePixelRatio,
    };

    // Simulate sending to server
    if (bidResponse?.id) {
      payload.bid_id = bidResponse.id;
    }

    fetch(this.baseUrl + '/api/public/impression', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Publisher': window.location.hostname,
        'X-AdUnit': this.adUnitId,
      },
      body: JSON.stringify(payload),
    }).catch(() => {});

    console.log('[AdSDK] Impression tracked:', impId);
  }

  // Track user interaction (click, completion, etc.)
  trackEvent(event: 'click' | 'conversion' | 'view', impId: string, metadata?: Record<string, any>) {
    const eventMap: Record<string, string> = {
      click: 'click',
      conversion: 'conversion',
      view: 'landing-view',
    };

    const endpoint = eventMap[event];
    if (!endpoint) return;

    fetch(this.baseUrl + `/api/public/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Publisher': window.location.hostname,
        'X-AdUnit': this.adUnitId,
      },
      body: JSON.stringify({
        imp,
        project: 'direct',
        ...metadata,
      }),
    }).catch((e) => console.warn('[AdSDK] Track event failed:', e));

    console.log(`[AdSDK] Event '${event}' tracked for imp ${impId}`);
  }

  // Simulate rewarded video unlock
  async showRewardedAd(callback: () => void): Promise<void> {
    // Simulate showing a rewarded video
    await new Promise((resolve) => setTimeout(resolve, 3000));
    
    // Simulate completion
    callback();
    this.trackEvent('conversion', this.generateImpId());
  }
}

export { AdSDK };