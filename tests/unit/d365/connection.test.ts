const mockHttpClient = {
  interceptors: {
    request: {
      use: jest.fn(),
    },
  },
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
};

jest.mock("axios", () => {
  const create = jest.fn(() => mockHttpClient);
  const post = jest.fn();

  return {
    __esModule: true,
    default: {
      create,
      post,
    },
    create,
    post,
  };
});

import axios from "axios";
import { D365Connection } from "../../../src/d365/connection.js";

const mockedAxios = axios as unknown as {
  create: jest.Mock;
  post: jest.Mock;
};

describe("D365Connection", () => {
  const config = {
    url: "https://contoso.crm.dynamics.com",
    clientId: "client-id",
    clientSecret: "client-secret",
    tenantId: "tenant-id",
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockedAxios.create.mockReturnValue(mockHttpClient);
    mockedAxios.post.mockResolvedValue({
      data: {
        access_token: "token-123",
        expires_in: 3600,
      },
    });

    mockHttpClient.get.mockReset();
    mockHttpClient.post.mockReset();
    mockHttpClient.patch.mockReset();
    mockHttpClient.delete.mockReset();
    mockHttpClient.interceptors.request.use.mockReset();
  });

  it("creates axios client with expected base URL", () => {
    new D365Connection(config);

    expect(mockedAxios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: "https://contoso.crm.dynamics.com/api/data/v9.2",
      }),
    );
  });

  it("registers request interceptor and injects bearer token", async () => {
    new D365Connection(config);

    expect(mockHttpClient.interceptors.request.use).toHaveBeenCalledTimes(1);

    const interceptor = mockHttpClient.interceptors.request.use.mock.calls[0][0];
    const requestConfig = { headers: {} as Record<string, string> };
    const updatedConfig = await interceptor(requestConfig);

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(updatedConfig.headers.Authorization).toBe("Bearer token-123");
  });

  it("reuses cached token across calls", async () => {
    const connection = new D365Connection(config);

    mockHttpClient.get.mockResolvedValue({ data: { UserId: "user-1" } });

    await connection.connect();
    await connection.connect();

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockHttpClient.get).toHaveBeenCalledWith("/WhoAmI");
  });

  it("throws friendly authentication error when token request fails", async () => {
    mockedAxios.post.mockRejectedValue({
      response: { data: { error_description: "bad secret" } },
      message: "Request failed",
    });

    const connection = new D365Connection(config);

    await expect(connection.connect()).rejects.toThrow("Authentication failed: bad secret");
  });

  it("get returns response data", async () => {
    const connection = new D365Connection(config);
    mockHttpClient.get.mockResolvedValue({ data: { value: [1, 2, 3] } });

    const result = await connection.get("/accounts", { top: 5 });

    expect(result).toEqual({ value: [1, 2, 3] });
    expect(mockHttpClient.get).toHaveBeenCalledWith("/accounts", { params: { top: 5 } });
  });

  it("post returns response data", async () => {
    const connection = new D365Connection(config);
    mockHttpClient.post.mockResolvedValue({ data: { ok: true } });

    const result = await connection.post("/accounts", { name: "Contoso" });

    expect(result).toEqual({ ok: true });
    expect(mockHttpClient.post).toHaveBeenCalledWith("/accounts", { name: "Contoso" });
  });

  it("patch returns response data", async () => {
    const connection = new D365Connection(config);
    mockHttpClient.patch.mockResolvedValue({ data: { updated: true } });

    const result = await connection.patch("/accounts(1)", { name: "Updated" });

    expect(result).toEqual({ updated: true });
    expect(mockHttpClient.patch).toHaveBeenCalledWith("/accounts(1)", { name: "Updated" });
  });

  it("delete delegates to axios client", async () => {
    const connection = new D365Connection(config);
    mockHttpClient.delete.mockResolvedValue({});

    await connection.delete("/accounts(1)");

    expect(mockHttpClient.delete).toHaveBeenCalledWith("/accounts(1)");
  });

  it("returns configured URL", () => {
    const connection = new D365Connection(config);
    expect(connection.getUrl()).toBe("https://contoso.crm.dynamics.com");
  });
});
