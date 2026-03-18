/**
 * D365 Connection Manager
 *
 * Handles authentication and connection to Dynamics 365 / Dataverse
 */

import axios, { AxiosInstance } from "axios";
import { D365Config } from "../types/index.js";
import { logger } from "../utils/logger.js";

export class D365Connection {
  private config: D365Config;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private httpClient: AxiosInstance;

  constructor(config: D365Config) {
    this.config = config;
    this.httpClient = axios.create({
      baseURL: `${config.url}/api/data/v9.2`,
      headers: {
        "Content-Type": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        Accept: "application/json",
      },
    });

    // Add request interceptor to inject auth token
    this.httpClient.interceptors.request.use(async (config) => {
      const token = await this.getAccessToken();
      config.headers.Authorization = `Bearer ${token}`;
      return config;
    });
  }

  /**
   * Test the connection to D365
   */
  async connect(): Promise<void> {
    logger.info("Testing D365 connection...");
    try {
      await this.getAccessToken();
      // Test with a simple WhoAmI request
      const response = await this.httpClient.get("/WhoAmI");
      logger.info(`Connected as user ID: ${response.data.UserId}`);
    } catch (error: any) {
      logger.error("Connection test failed:", error.message);
      throw new Error(`Failed to connect to D365: ${error.message}`);
    }
  }

  /**
   * Get or refresh access token
   */
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    logger.debug("Acquiring new access token...");

    try {
      const tokenEndpoint = `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/token`;
      
      const params = new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        resource: this.config.url,
        grant_type: "client_credentials",
      });
      logger.info(this.config.clientId, this.config.clientSecret, this.config.url)
      logger.error("tokenEndpoint: ", tokenEndpoint, params)

      const response = await axios.post(tokenEndpoint, params.toString(), {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });
      logger.info(response.data)

      const token: string = response.data.access_token;
      this.accessToken = token;
      // Set expiry to 5 minutes before actual expiry for safety
      const expiresIn = response.data.expires_in - 300;
      this.tokenExpiry = new Date(Date.now() + expiresIn * 1000);

      logger.debug("Access token acquired successfully");
      return token;
    } catch (error: any) {
      logger.error("Failed to acquire access token:", error.message);
      throw new Error(
        `Authentication failed: ${error.response?.data?.error_description || error.message}`,
      );
    }
  }

  /**
   * Execute a GET request
   */
  async get<T = any>(path: string, params?: Record<string, any>): Promise<T> {
    try {
      const response = await this.httpClient.get(path, { params });
      return response.data;
    } catch (error: any) {
      logger.error(`GET ${path} failed:`, error.message);
      throw error;
    }
  }

  /**
   * Execute a POST request
   */
  async post<T = any>(path: string, data: any): Promise<T> {
    try {
      const response = await this.httpClient.post(path, data);
      return response.data;
    } catch (error: any) {
      logger.error(`POST ${path} failed:`, error.message);
      throw error;
    }
  }

  /**
   * Execute a PATCH request
   */
  async patch<T = any>(path: string, data: any): Promise<T> {
    try {
      const response = await this.httpClient.patch(path, data);
      return response.data;
    } catch (error: any) {
      logger.error(`PATCH ${path} failed:`, error.message);
      throw error;
    }
  }

  /**
   * Execute a DELETE request
   */
  async delete(path: string): Promise<void> {
    try {
      await this.httpClient.delete(path);
    } catch (error: any) {
      logger.error(`DELETE ${path} failed:`, error.message);
      throw error;
    }
  }

  /**
   * Get the organization URL
   */
  getUrl(): string {
    return this.config.url;
  }
}
