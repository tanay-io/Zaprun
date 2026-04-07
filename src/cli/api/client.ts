import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";
import { CliProfile } from "../types";

export class ApiError extends Error {
  public statusCode?: number;
  public data?: unknown;

  constructor(message: string, statusCode?: number, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.data = data;
  }
}

export class ApiClient {
  private readonly profile: CliProfile;
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(profile: CliProfile, timeoutMs = 15000, retries = 1) {
    this.profile = profile;
    this.timeoutMs = timeoutMs;
    this.retries = retries;
  }

  public async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>({ method: "GET", url: path, params });
  }

  public async post<T>(path: string, data?: unknown): Promise<T> {
    return this.request<T>({ method: "POST", url: path, data });
  }

  public async put<T>(path: string, data?: unknown): Promise<T> {
    return this.request<T>({ method: "PUT", url: path, data });
  }

  public async delete<T>(path: string): Promise<T> {
    return this.request<T>({ method: "DELETE", url: path });
  }

  public async requestRaw<T = unknown>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return axios.request<T>({
      ...config,
      baseURL: this.profile.apiUrl,
      timeout: this.timeoutMs,
      headers: {
        "x-user-id": this.profile.userId,
        ...(config.headers ?? {}),
      },
    });
  }

  private async request<T>(config: AxiosRequestConfig): Promise<T> {
    let attempt = 0;

    while (attempt <= this.retries) {
      try {
        const response = await this.requestRaw<T>(config);
        return response.data;
      } catch (error) {
        const typedError = error as AxiosError;
        const statusCode = typedError.response?.status;
        const data = typedError.response?.data;
        const message =
          (typeof data === "object" && data !== null && "message" in data
            ? String((data as Record<string, unknown>).message)
            : typedError.message) || "API request failed";

        const retriable = !statusCode || statusCode >= 500;
        if (!retriable || attempt === this.retries) {
          throw new ApiError(message, statusCode, data);
        }

        attempt += 1;
      }
    }

    throw new ApiError("API request failed");
  }
}
