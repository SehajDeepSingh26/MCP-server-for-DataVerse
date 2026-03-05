describe("logger", () => {
  const originalLogLevel = process.env.LOG_LEVEL;

  beforeEach(() => {
    process.env.LOG_LEVEL = "info";
    jest.resetModules();
  });

  afterEach(() => {
    process.env.LOG_LEVEL = originalLogLevel;
  });

  it("redacts sensitive fields in log payload", async () => {
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {
      // no-op
    });

    const { logger } = await import("../../../src/utils/logger.js");
    logger.info("test", {
      clientSecret: "super-secret",
      authorization: "Bearer abc123",
      safeValue: "ok",
    });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const output = String(infoSpy.mock.calls[0][0]);
    expect(output).toContain("[Redacted]");
    expect(output).toContain("safeValue");
    expect(output).not.toContain("super-secret");
    expect(output).not.toContain("abc123");

    infoSpy.mockRestore();
  });
});
