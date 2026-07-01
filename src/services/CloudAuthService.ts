/**
 * 云端付费模式的认证和签名服务
 *
 * 职责：
 * - 用户注册/登录/token 刷新
 * - 获取签名 URL（服务端生成，客户端直连腾讯云）
 * - 使用报告和结算
 * - 余额查询和用量统计
 *
 * 数据流：
 *   Plugin → CloudAuthService → Billing Server → 签名 URL
 *   Plugin → 签名 URL → 腾讯云 ASR WebSocket（直连）
 *   Plugin → CloudAuthService → Billing Server → 使用报告
 */

import { CloudAuthSettings } from "../types";

interface SignResult {
  signed_url: string;
  sign_request_id: string;
  voice_id: string;
  precharge_cents: number;
  balance_cents: number;
  valid_minutes: number;
}

interface AuthResult {
  token: string;
  refresh_token: string;
  expires_at: string;
  balance_cents: number;
}

interface UsageRecord {
  id: string;
  duration_seconds: number;
  cost_cents: number;
  engine_model: string;
  created_at: string;
}

interface RechargeOrder {
  url: string;
  url_qrcode?: string;
  order_id: string;
}

export class CloudAuthService {
  private settings: CloudAuthSettings;
  private onSettingsChanged: ((settings: CloudAuthSettings) => void) | null = null;

  constructor(settings: CloudAuthSettings) {
    this.settings = { ...settings };
  }

  updateSettings(settings: CloudAuthSettings): void {
    this.settings = { ...settings };
  }

  setOnSettingsChanged(cb: (settings: CloudAuthSettings) => void): void {
    this.onSettingsChanged = cb;
  }

  get isLoggedIn(): boolean {
    return Boolean(this.settings.token && this.settings.serverUrl);
  }

  get balanceCents(): number {
    return this.settings.balanceCents;
  }

  async register(email: string, password: string): Promise<AuthResult> {
    const resp = await this.post("/api/auth/register", { email, password });
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || "Registration failed");
    }
    const data = await resp.json() as AuthResult;
    this.updateTokens(data);
    return data;
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const resp = await this.post("/api/auth/login", { email, password });
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || "Login failed");
    }
    const data = await resp.json() as AuthResult;
    this.updateTokens(data);
    return data;
  }

  async refreshToken(): Promise<boolean> {
    if (!this.settings.refreshToken) return false;
    try {
      const resp = await this.post("/api/auth/refresh", {
        refresh_token: this.settings.refreshToken,
      });
      if (!resp.ok) return false;
      const data = await resp.json();
      this.settings.token = data.token;
      this.settings.tokenExpiresAt = data.expires_at;
      this.onSettingsChanged?.(this.settings);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取签名 URL + 预扣费
   * @param engineModel 引擎模型（如 16k_zh）
   * @param voiceId 可选，续签时传入已有的 voice_id 保持同一会话
   */
  async getSignedUrl(engineModel: string, voiceId?: string): Promise<SignResult> {
    const resp = await this.authPost("/api/asr/sign", {
      engine_model: engineModel,
      voice_id: voiceId,
    });
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || "Signing failed");
    }
    const data = await resp.json() as SignResult;
    this.settings.balanceCents = data.balance_cents;
    this.onSettingsChanged?.(this.settings);
    return data;
  }

  /**
   * 报告使用时长，触发结算
   */
  async reportUsage(signRequestId: string, durationSeconds: number): Promise<void> {
    try {
      const resp = await this.authPost("/api/billing/report", {
        sign_request_id: signRequestId,
        duration_seconds: Math.round(durationSeconds),
      });
      if (resp.ok) {
        const data = await resp.json();
        this.settings.balanceCents = data.balance_cents;
        this.onSettingsChanged?.(this.settings);
      }
    } catch (e) {
      console.error("[CloudAuth] Failed to report usage:", e);
    }
  }

  async getBalance(): Promise<number> {
    const resp = await this.authGet("/api/billing/balance");
    if (!resp.ok) throw new Error("Failed to get balance");
    const data = await resp.json();
    this.settings.balanceCents = data.balance_cents;
    this.onSettingsChanged?.(this.settings);
    return data.balance_cents;
  }

  async getUsage(): Promise<{ total_seconds: number; total_cost_cents: number; records: UsageRecord[] }> {
    const resp = await this.authGet("/api/billing/usage");
    if (!resp.ok) throw new Error("Failed to get usage");
    return resp.json();
  }

  async createRechargeOrder(amountYuan = "9.90"): Promise<RechargeOrder> {
    const resp = await this.authPost("/api/billing/create-order", {
      amount: amountYuan,
      return_url: this.settings.serverUrl,
    });
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || "Failed to create recharge order");
    }
    return resp.json() as Promise<RechargeOrder>;
  }

  logout(): void {
    this.settings.token = "";
    this.settings.refreshToken = "";
    this.settings.tokenExpiresAt = "";
    this.settings.balanceCents = 0;
    this.onSettingsChanged?.(this.settings);
  }

  // ── 私有方法 ──

  private updateTokens(data: AuthResult): void {
    this.settings.token = data.token;
    this.settings.refreshToken = data.refresh_token;
    this.settings.tokenExpiresAt = data.expires_at;
    this.settings.balanceCents = data.balance_cents;
    this.onSettingsChanged?.(this.settings);
  }

  private async authPost(path: string, body: Record<string, unknown>): Promise<Response> {
    await this.ensureValidToken();
    return this.post(path, body, { Authorization: `Bearer ${this.settings.token}` });
  }

  private async authGet(path: string): Promise<Response> {
    await this.ensureValidToken();
    const url = `${this.settings.serverUrl}${path}`;
    return fetch(url, {
      headers: { Authorization: `Bearer ${this.settings.token}` },
    });
  }

  private async post(
    path: string,
    body: Record<string, unknown>,
    extraHeaders?: Record<string, string>,
  ): Promise<Response> {
    const url = `${this.settings.serverUrl}${path}`;
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...extraHeaders },
      body: JSON.stringify(body),
    });
  }

  private async ensureValidToken(): Promise<void> {
    if (!this.settings.token) throw new Error("Not logged in");
    const expiresAt = new Date(this.settings.tokenExpiresAt).getTime();
    const now = Date.now();
    // token 还有 1 天以上有效期，不刷新
    if (expiresAt - now > 86400000) return;
    // 尝试刷新
    const refreshed = await this.refreshToken();
    if (!refreshed) throw new Error("Session expired, please login again");
  }
}
